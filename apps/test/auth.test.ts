// Accounts: signing up, signing in, recovering, and signing out with passkeys, through the Worker's
// routes, with the software authenticator in the browser's place.
import { createExecutionContext, createScheduledController, waitOnExecutionContext } from 'cloudflare:test'
import { env, exports } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index'
import { softwareAuthenticator, type Authenticator } from './authenticator'
import { fakeQloo } from './fake'
import { openMember } from './session'

const origin = 'https://crossfeed.test'
const get = (path: string, init?: RequestInit) => exports.default.fetch(`${origin}${path}`, init)
// A POST as the sign-in page sends it: JSON, from the app's origin.
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  get(path, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  })

// The session cookie a response sets, as the browser sends it back.
const sessionCookie = (res: Response) => res.headers.get('set-cookie')?.match(/^__Host-crossfeed_member=[^;]+/)?.[0]

// Signs in with a passkey through both steps, as the sign-in page does.
async function signIn(authenticator: Authenticator) {
  const started = await post('/auth/sign-in/options', {})
  const { challenge, options } = await started.json<{ challenge: string; options: never }>()
  return post('/auth/sign-in', { challenge, response: await authenticator.authenticate(options) })
}

// Who the app's account menu says is signed in with `cookie`, on /app/new, or where it sends them instead.
const appFor = async (cookie: string) => {
  const page = await get('/app/new', { headers: { Cookie: cookie }, redirect: 'manual' })
  return page.status === 200
    ? (await page.text()).match(/Account: <\/span><span class="acct-name">([^<]*)</)?.[1]
    : `${page.status} ${page.headers.get('location')}`
}

// Both steps' requests of a ceremony: the options, then the answer `respond` makes from them.
const ceremony = async (kind: 'sign-up' | 'sign-in', body: object = {}) => {
  const { challenge, options } = await (
    await post(`/auth/${kind}/options`, body)
  ).json<{ challenge: string; options: never }>()
  return { challenge, options, finish: (response: unknown) => post(`/auth/${kind}`, { challenge, response }) }
}
const STALE = { error: 'This passkey request has expired or was already used. Try again.' }
const UNVERIFIED = { error: "Crossfeed couldn't verify this passkey. Try again." }

const accounts = env.ACCOUNTS
afterEach(() => {
  env.ACCOUNTS = accounts
  vi.useRealTimers()
})

describe('signing up', () => {
  it('signs a new person up with a name and a passkey, shows a recovery code, and signs them in', async () => {
    const authenticator = softwareAuthenticator()
    const started = await post('/auth/sign-up/options', { name: 'Ada Programmer' })
    expect(started.status).toBe(200)
    const { challenge, options } = await started.json<{ challenge: string; options: never }>()

    const done = await post('/auth/sign-up', { challenge, response: await authenticator.register(options) })
    expect(done.status).toBe(200)
    expect((await done.json<{ recoveryCode: string }>()).recoveryCode).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){4}$/)
    const cookie = done.headers.get('set-cookie')!
    expect(cookie).toMatch(
      /^__Host-crossfeed_member=[\w-]{43}; Max-Age=2592000; Path=\/; HttpOnly; Secure; SameSite=Lax$/
    )

    const app = await get('/app/new', { headers: { Cookie: cookie.split(';')[0] } })
    expect(app.status).toBe(200)
    expect(await app.text()).toContain('Ada Programmer')
  })

  it('keeps only hashes of the session token and the recovery code', async () => {
    const { cookie, recoveryCode } = await openMember()
    const token = cookie.split('=')[1]
    // The storage itself is the behaviour here, so this reads every row of every table.
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'"
    ).all<{ name: string }>()
    const rows = await Promise.all(tables.results.map(({ name }) => env.DB.prepare(`SELECT * FROM ${name}`).all()))
    const stored = JSON.stringify(rows.map((r) => r.results))
    expect(stored).toContain('Ada Programmer')
    expect(stored).not.toContain(token)
    expect(stored).not.toContain(recoveryCode)
    expect(stored).not.toContain(recoveryCode.replace(/-/g, ''))
  })
})

describe('signing in', () => {
  it('signs a member in with their discoverable passkey alone, again and again at counter 0', async () => {
    const { authenticator } = await openMember({ name: 'Grace Booker' })
    for (const _ of [1, 2]) {
      const res = await signIn(authenticator)
      expect(res.status).toBe(200)
      expect(await appFor(sessionCookie(res)!)).toBe('Grace Booker')
    }
  })
})

describe('a refused ceremony', () => {
  it('refuses a replayed sign-in, and starts no session', async () => {
    const { authenticator } = await openMember()
    const { options, finish } = await ceremony('sign-in')
    const response = await authenticator.authenticate(options)
    expect((await finish(response)).status).toBe(200)

    const replayed = await finish(response)
    expect(replayed.status).toBe(400)
    expect(await replayed.json()).toEqual(STALE)
    expect(sessionCookie(replayed)).toBeUndefined()
  })

  it("refuses a signature over another sign-in's challenge", async () => {
    const { authenticator } = await openMember()
    const first = await ceremony('sign-in')
    const second = await ceremony('sign-in')
    const res = await second.finish(await authenticator.authenticate(first.options))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual(UNVERIFIED)
  })

  it('refuses a sign-in or sign-up answered after five minutes', async () => {
    const { authenticator } = await openMember()
    vi.useFakeTimers({ toFake: ['Date'] })
    const signingIn = await ceremony('sign-in')
    const signingUp = await ceremony('sign-up', { name: 'Late Larry' })
    vi.setSystemTime(Date.now() + 5 * 60_000 + 1)
    for (const res of [
      await signingIn.finish(await authenticator.authenticate(signingIn.options)),
      await signingUp.finish(await softwareAuthenticator().register(signingUp.options))
    ]) {
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual(STALE)
    }
  })

  it('refuses a passkey made or used on another site', async () => {
    const { authenticator } = await openMember()
    const elsewhere = 'https://crossfeed.example'
    const up = await ceremony('sign-up', { name: 'Mallory' })
    expect(await (await up.finish(await softwareAuthenticator().register(up.options, elsewhere))).json()).toEqual(
      UNVERIFIED
    )
    const signing = await ceremony('sign-in')
    expect(await (await signing.finish(await authenticator.authenticate(signing.options, elsewhere))).json()).toEqual(
      UNVERIFIED
    )
  })

  it("refuses a passkey that didn't verify the person, as one without a PIN", async () => {
    const { options, finish } = await ceremony('sign-up', { name: 'Ada Programmer' })
    const res = await finish(await softwareAuthenticator({ userVerified: false }).register(options))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual(UNVERIFIED)
  })

  it('names the relying party from RP_ID, whatever host the request reached', async () => {
    const started = await exports.default.fetch('https://crossfeed-copy.example/auth/sign-up/options', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ada Programmer' })
    })
    const { options } = await started.json<{ options: { rp: { id: string }; authenticatorSelection: object } }>()
    expect(options.rp.id).toBe('crossfeed.test')
    expect(options.authenticatorSelection).toMatchObject({ residentKey: 'required', userVerification: 'required' })
  })

  it('refuses a name that is empty, too long, or has control characters', async () => {
    for (const [name, error] of [
      ['  ', 'Enter your name.'],
      ['x'.repeat(65), 'Use a name of at most 64 characters.'],
      ['Ada\u0000', 'Use a name without control characters.']
    ]) {
      const res = await post('/auth/sign-up/options', { name })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error })
    }
  })
})

describe('recovering', () => {
  const CODE = /^[0-9A-Z]{4}(-[0-9A-Z]{4}){4}$/

  it('signs in once with the recovery code, as typed, and issues a new one in its place', async () => {
    const { recoveryCode } = await openMember({ name: 'Ada Programmer' })
    // Typed in lower case with spaces for dashes, as someone might copy it off paper.
    const used = await post('/auth/recover', { code: recoveryCode.toLowerCase().replace(/-/g, ' ') })
    expect(used.status).toBe(200)
    const { recoveryCode: issued } = await used.json<{ recoveryCode: string }>()
    expect(issued).toMatch(CODE)
    expect(issued).not.toBe(recoveryCode)
    expect(await appFor(sessionCookie(used)!)).toBe('Ada Programmer')

    const again = await post('/auth/recover', { code: recoveryCode })
    expect(again.status).toBe(400)
    expect(await again.json()).toEqual({
      error: "Crossfeed doesn't know this recovery code, or it was used already. Check it and try again."
    })
    expect(sessionCookie(again)).toBeUndefined()
    expect((await post('/auth/recover', { code: issued })).status).toBe(200)
  })
})

describe('a session', () => {
  const DAY = 24 * 60 * 60_000

  it('ends at sign-out, so its cookie signs no one in again', async () => {
    const { cookie } = await openMember()
    const out = await post('/auth/sign-out', {}, { Cookie: cookie })
    expect(out.status).toBe(200)
    expect(out.headers.get('set-cookie')).toMatch(/^__Host-crossfeed_member=; Max-Age=0; Path=\/; Secure/)
    expect(await appFor(cookie)).toBe('302 /sign-in?next=/app/new')
  })

  it('lasts 30 days from its last use, then sends the member to sign in', async () => {
    const { cookie } = await openMember({ name: 'Ada Programmer' })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 29 * DAY)
    const used = await get('/app/new', { headers: { Cookie: cookie } })
    expect(used.status).toBe(200)
    // The cookie is extended with the session.
    expect(used.headers.get('set-cookie')).toMatch(/Max-Age=2592000/)
    vi.setSystemTime(Date.now() + 29 * DAY)
    expect(await appFor(cookie)).toBe('Ada Programmer')
    vi.setSystemTime(Date.now() + 30 * DAY + 1)
    expect(await appFor(cookie)).toBe('302 /sign-in?next=/app/new')
  })
})

describe('the way in', () => {
  it('sends a signed-out request for /app, or any page under it, to sign in and back', async () => {
    for (const [path, next] of [
      ['/app', '/app'],
      ['/app/new', '/app/new'],
      ['/app/n-1/roster?view=misses', '/app/n-1/roster%3Fview%3Dmisses']
    ]) {
      const res = await get(path, { redirect: 'manual' })
      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toBe(`/sign-in?next=${next}`)
    }
  })

  it('serves the sign-in page with where to go next, a path on this site or else /app', async () => {
    const nextOf = async (next: string) =>
      (await (await get(`/sign-in?next=${encodeURIComponent(next)}`)).text()).match(/data-next="([^"]*)"/)?.[1]
    expect(await (await get('/sign-in')).text()).toContain('<div id="root" data-page="sign-in" data-next="/app">')
    expect(await nextOf('/app/new')).toBe('/app/new')
    for (const away of [
      'https://crossfeed.example/app',
      '//crossfeed.example/app',
      '/\\crossfeed.example',
      'javascript:alert(1)'
    ])
      expect(await nextOf(away)).toBe('/app')
  })

  it('sends a signed-in member from the sign-in page straight on to next', async () => {
    const { cookie } = await openMember()
    const go = async (next: string) =>
      (
        await get(`/sign-in?next=${encodeURIComponent(next)}`, { headers: { Cookie: cookie }, redirect: 'manual' })
      ).headers.get('location')
    expect(await go('/app/new')).toBe('/app/new')
    expect(await go('//crossfeed.example/app')).toBe('/app')
  })
})

describe('a write from another site', () => {
  const postFrom = (path: string, headers: Record<string, string>) =>
    get(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: '{}' })

  it("is refused with 403 when a member's cookie signs it, or when it says no Origin", async () => {
    const { cookie } = await openMember({ name: 'Ada Programmer' })
    for (const headers of [{ Origin: 'https://crossfeed.example' }, { Origin: 'null' }, {}] as Record<
      string,
      string
    >[]) {
      const res = await postFrom('/auth/sign-out', { Cookie: cookie, ...headers })
      expect(res.status).toBe(403)
    }
    expect(await appFor(cookie)).toBe('Ada Programmer')
  })

  it('is refused for signing up, in, or back in with a recovery code too', async () => {
    const { recoveryCode } = await openMember()
    for (const path of ['/auth/sign-up/options', '/auth/sign-in/options', '/auth/recover'])
      expect((await postFrom(path, { Origin: 'https://crossfeed.example' })).status).toBe(403)
    expect((await post('/auth/recover', { code: recoveryCode })).status).toBe(200)
  })
})

describe('the sign-up cap', () => {
  // A visitor's address, as Cloudflare's edge sends it.
  const visitor = (ip: string) => ({ 'CF-Connecting-IP': ip })
  const signUpFrom = async (headers: Record<string, string>, name = 'Ada Programmer') => {
    const started = await post('/auth/sign-up/options', { name }, headers)
    if (started.status !== 200) return started
    const { challenge, options } = await started.json<{ challenge: string; options: never }>()
    return post('/auth/sign-up', { challenge, response: await softwareAuthenticator().register(options) }, headers)
  }
  const CAPPED = {
    error: "You've created 5 accounts today, the most one visitor can create in a UTC day; it resets at 00:00 UTC."
  }

  it('refuses a sixth sign-up from one visitor in a UTC day, before any passkey is made', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-19T12:00:00Z'))
    const ada = visitor('203.0.113.7')
    for (const _ of [1, 2, 3, 4, 5]) expect((await signUpFrom(ada)).status).toBe(200)
    const sixth = await post('/auth/sign-up/options', { name: 'Ada Programmer' }, ada)
    expect(sixth.status).toBe(429)
    expect(await sixth.json()).toEqual(CAPPED)

    expect((await signUpFrom(visitor('198.51.100.4'))).status).toBe(200)
    vi.setSystemTime(new Date('2026-10-20T00:01:00Z'))
    expect((await signUpFrom(ada)).status).toBe(200)
  })

  it('counts sign-ups that finish, so two started at the fifth leave one refused', async () => {
    const ada = visitor('203.0.113.7')
    for (const _ of [1, 2, 3, 4]) expect((await signUpFrom(ada)).status).toBe(200)
    const both = await Promise.all([ceremonyFrom(ada), ceremonyFrom(ada)])
    const finished = [await both[0](), await both[1]()]
    expect(finished.map((res) => res.status)).toEqual([200, 429])
    expect(await finished[1].json()).toEqual(CAPPED)
  })

  it('is skipped with no visitor address, as in tests', async () => {
    for (const _ of [1, 2, 3, 4, 5, 6]) expect((await signUpFrom({})).status).toBe(200)
  })

  // Starts a sign-up from `headers`' visitor, and returns what finishes it.
  async function ceremonyFrom(headers: Record<string, string>) {
    const { challenge, options } = await (
      await post('/auth/sign-up/options', { name: 'Ada' }, headers)
    ).json<{
      challenge: string
      options: never
    }>()
    const response = await softwareAuthenticator().register(options)
    return () => post('/auth/sign-up', { challenge, response }, headers)
  }
})

describe('with ACCOUNTS off', () => {
  it('answers 404 for the sign-in page, /app, and every auth route, signed in or not', async () => {
    const { cookie } = await openMember()
    env.ACCOUNTS = 'off'
    for (const headers of [{}, { Cookie: cookie }] as Record<string, string>[]) {
      for (const path of ['/sign-in', '/app', '/app/new'])
        expect((await get(path, { headers, redirect: 'manual' })).status).toBe(404)
      for (const path of [
        '/auth/sign-up/options',
        '/auth/sign-up',
        '/auth/sign-in/options',
        '/auth/sign-in',
        '/auth/recover',
        '/auth/sign-out'
      ])
        expect((await post(path, {}, headers)).status).toBe(404)
    }
  })
})

describe('headers', () => {
  it('keeps every authenticated page and auth answer out of caches', async () => {
    const { cookie } = await openMember()
    expect((await get('/app', { headers: { Cookie: cookie } })).headers.get('cache-control')).toBe('no-store')
    expect((await get('/sign-in')).headers.get('cache-control')).toBe('no-store')
    expect((await post('/auth/sign-in/options', {})).headers.get('cache-control')).toBe('no-store')
    expect((await post('/auth/recover', { code: 'nope' })).headers.get('cache-control')).toBe('no-store')
  })

  it('sends the secure headers, with no referrer, on every page, the demo too', async () => {
    const { cookie } = await openMember()
    for (const [path, headers] of [
      ['/demo', {}],
      ['/sign-in', {}],
      ['/app/new', { Cookie: cookie }]
    ] as const) {
      const page = await get(path, { headers })
      expect(page.status).toBe(200)
      expect(page.headers.get('referrer-policy')).toBe('no-referrer')
      expect(page.headers.get('x-content-type-options')).toBe('nosniff')
      expect(page.headers.get('x-frame-options')).toBe('SAMEORIGIN')
      expect(page.headers.get('strict-transport-security')).toBe('max-age=15552000; includeSubDomains')
    }
  })
})

describe('the daily cron', () => {
  it('purges expired sessions and challenges from the directory', async () => {
    // The cron's health check searches Qloo too.
    fakeQloo({ search: { 'The Rewatchables': [{ entity_id: 'e-0701', name: 'The Rewatchables', popularity: 0.7 }] } })
    await openMember({ name: 'Gone Away' })
    await post('/auth/sign-in/options', {})
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 30 * 24 * 60 * 60_000 + 1)
    const kept = await openMember({ name: 'Still Here' })
    await post('/auth/sign-in/options', {})

    const handler: ExportedHandler<Env> = worker
    const ctx = createExecutionContext()
    await handler.scheduled!(createScheduledController({ cron: '0 12 * * *' }), env, ctx)
    await waitOnExecutionContext(ctx)

    // What's left is the storage itself, so this reads the tables.
    const count = (table: string) => env.DB.prepare(`SELECT count(*) AS n FROM ${table}`).first('n')
    expect(await count('sessions')).toBe(1)
    expect(await count('challenges')).toBe(1)
    expect(await appFor(kept.cookie)).toBe('Still Here')
  })
})
