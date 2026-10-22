// A member's account: their name, passkeys, recovery code, sessions, networks, and deleting it, through
// the account page's routes and the passkey ceremony, with the software authenticator in the browser's
// place.
import { env, exports } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import type { AccountNetwork, AccountPasskey, ApiKey, NetworkMember } from '../src/directory'
import { softwareAuthenticator, type Authenticator } from './authenticator'
import { addPasskey, confirmedFetch, openMember, type Member, type Session } from './session'

const origin = 'https://crossfeed.test'

// A write from one of the member's pages, as `send` in the island makes it.
const post = (member: Member, path: string, body: object = {}) =>
  member.fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

// A network the member creates the way /app/new does.
async function created(member: Member, name = 'Night Shift Audio') {
  const res = await post(member, '/app/new', { name })
  if (res.status !== 200) throw new Error(`Creating ${name} returned ${res.status}: ${await res.text()}`)
  return (await res.json<{ id: string }>()).id
}

// The data attributes the server gave the account page's #root, as main.tsx reads them.
async function accountPage(member: Member, path = '/app/account') {
  const res = await member.fetch(path)
  if (res.status !== 200) throw new Error(`${path} returned ${res.status}`)
  const html = await res.text()
  const root = html.match(/<div id="root"([^>]*)>/)![1]
  const attr = (name: string) => {
    const value = root.match(new RegExp(`data-${name}="([^"]*)"`))?.[1]
    return value
      ?.replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
  }
  return {
    html,
    page: attr('page'),
    name: attr('member-name'),
    passkeys: JSON.parse(attr('passkeys') ?? '[]') as AccountPasskey[],
    recovered: attr('recovered') === 'true',
    sessions: Number(attr('sessions')),
    networks: JSON.parse(attr('networks') ?? '[]') as AccountNetwork[]
  }
}

// A browser that signs requests as Chrome on a Mac does, which names the passkeys it adds.
const CHROME_ON_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36'
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1'

// Signs in with `device`'s passkey through both steps, as the sign-in page does.
async function signInWith(device: Authenticator) {
  const write = (path: string, body: object) =>
    exports.default.fetch(`${origin}${path}`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  const { challenge, options } = await (
    await write('/auth/sign-in/options', {})
  ).json<{
    challenge: string
    options: never
  }>()
  return write('/auth/sign-in', { challenge, response: await device.authenticate(options) })
}

// The session cookie a sign-in set, as the browser sends it back.
const cookieOf = (res: Response) => res.headers.get('set-cookie')!.split(';')[0]

// Where `/app/account` takes a browser with `cookie`: the page (200), or sign-in.
const accountFor = async (cookie: string) => {
  const res = await exports.default.fetch(`${origin}/app/account`, { headers: { Cookie: cookie }, redirect: 'manual' })
  return res.status === 200 ? 200 : `${res.status} ${res.headers.get('location')}`
}

// The member's agent connection from one of the app's pages, closed after the test.
const connect = async (member: Member, path: string) => {
  const agent = await member.connect(path)
  open.push(agent)
  return agent
}

const open: Omit<Session, 'cookie'>[] = []
afterEach(() => {
  vi.useRealTimers()
  open.splice(0).forEach((agent) => agent.close())
})

describe('the account page', () => {
  it("is the signed-in member's own, under /app, and sends a signed-out request to sign in", async () => {
    const ada = await openMember()
    expect(await accountPage(ada)).toMatchObject({ page: 'account', name: 'Ada Programmer' })
    const signedOut = await exports.default.fetch(`${origin}/app/account`, { redirect: 'manual' })
    expect([signedOut.status, signedOut.headers.get('location')]).toEqual([302, '/sign-in?next=/app/account'])
    env.ACCOUNTS = 'off'
    expect((await ada.fetch('/app/account')).status).toBe(404)
    env.ACCOUNTS = 'on'
  })

  it('renames the member, everywhere their name shows', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const res = await post(ada, '/app/account/name', { name: '  Ada Lovelace ' })
    expect([res.status, await res.json()]).toEqual([200, { name: 'Ada Lovelace' }])
    expect((await accountPage(ada)).name).toBe('Ada Lovelace')
    // The account menu, and the network's members, say so.
    const settings = await (await ada.fetch(`/app/${network}/settings`)).text()
    expect(settings).toMatch(/<span class="acct-name"[^>]*>Ada Lovelace<\/span>/)
    expect(settings).toContain('&quot;name&quot;:&quot;Ada Lovelace&quot;')

    for (const name of ['', 'x'.repeat(200), 'Ada\u0007']) {
      const refused = await post(ada, '/app/account/name', { name })
      expect(refused.status).toBe(400)
    }
    expect((await accountPage(ada)).name).toBe('Ada Lovelace')
  })
})

describe('passkeys', () => {
  it('are listed by the browser each was added from and the day, and another device can add one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-19T12:00:00Z'))
    const ada = await openMember()
    vi.setSystemTime(new Date('2026-10-21T09:00:00Z'))
    const phone = softwareAuthenticator()

    // The options name the member and the passkey they have, so a device that holds it adds no other.
    const started = await confirmedFetch(ada, '/auth/passkeys/options', { method: 'POST' })
    const { options } = await started.json<{
      options: { user: { id: string; name: string }; excludeCredentials: { id: string }[] }
    }>()
    expect(options.user.name).toBe('Ada Programmer')
    expect(isoBase64URL.toUTF8String(options.user.id)).toBe(ada.id)
    const [first] = (await accountPage(ada)).passkeys
    expect(options.excludeCredentials.map((c) => c.id)).toEqual([first.id])

    const added = await addPasskey(ada, phone, IPHONE)
    expect(added.status).toBe(200)
    const { passkeys } = await added.json<{ passkeys: AccountPasskey[] }>()
    expect(passkeys.map(({ label, created, lastUsed }) => ({ label, created, lastUsed }))).toEqual([
      { label: 'Passkey', created: Date.parse('2026-10-19T12:00:00Z'), lastUsed: null },
      { label: 'Safari on iOS', created: Date.parse('2026-10-21T09:00:00Z'), lastUsed: null }
    ])
    expect((await accountPage(ada)).passkeys).toEqual(passkeys)
    // The new passkey signs Ada in, and says when.
    expect((await signInWith(phone)).status).toBe(200)
    expect((await accountPage(ada)).passkeys[1].lastUsed).toBe(Date.parse('2026-10-21T09:00:00Z'))
  })

  it("refuse an answer to another member's request, and anyone signed out", async () => {
    const ada = await openMember()
    const grace = await openMember({ name: 'Grace Booker' })

    // Grace's request, answered on Ada's account, adds nothing to either.
    const { challenge, options } = await (
      await grace.fetch('/auth/passkeys/options', { method: 'POST' })
    ).json<{
      challenge: string
      options: never
    }>()
    const crossed = await post(ada, '/auth/passkeys', {
      challenge,
      response: await softwareAuthenticator().register(options)
    })
    expect([crossed.status, await crossed.json()]).toEqual([
      400,
      { error: 'This passkey request has expired or was already used. Try again.' }
    ])
    expect((await accountPage(ada)).passkeys).toHaveLength(1)
    expect((await accountPage(grace)).passkeys).toHaveLength(1)

    const signedOut = await exports.default.fetch(`${origin}/auth/passkeys/options`, {
      method: 'POST',
      headers: { Origin: origin }
    })
    expect([signedOut.status, await signedOut.json()]).toEqual([401, { error: 'Sign in to add a passkey.' }])
  })

  it('can be removed, but never the last, and a removed one signs no one in', async () => {
    const ada = await openMember()
    const phone = softwareAuthenticator()
    await addPasskey(ada, phone, CHROME_ON_MAC)
    const [first, second] = (await accountPage(ada)).passkeys

    const removed = await post(ada, `/app/account/passkeys/${first.id}/remove`)
    expect(removed.status).toBe(200)
    expect((await removed.json<{ passkeys: AccountPasskey[] }>()).passkeys.map((p) => p.id)).toEqual([second.id])
    expect((await signInWith(ada.authenticator)).status).toBe(400)
    expect((await signInWith(phone)).status).toBe(200)

    const last = await post(ada, `/app/account/passkeys/${second.id}/remove`)
    expect([last.status, await last.json()]).toEqual([
      409,
      { error: 'This is your only passkey. Add another before you remove it, so you can still sign in.' }
    ])
    // Another member's passkey, or one that's gone, isn't Ada's to remove.
    const grace = await openMember({ name: 'Grace Booker' })
    const [hers] = (await accountPage(grace)).passkeys
    expect((await post(ada, `/app/account/passkeys/${hers.id}/remove`)).status).toBe(404)
    expect((await post(ada, `/app/account/passkeys/${first.id}/remove`)).status).toBe(404)
    expect((await accountPage(grace)).passkeys).toHaveLength(1)
  })

  it('lets only one of two removals at once take the last but one', async () => {
    const ada = await openMember()
    await addPasskey(ada, softwareAuthenticator(), CHROME_ON_MAC)
    const both = (await accountPage(ada)).passkeys
    const answers = await Promise.all(both.map((p) => post(ada, `/app/account/passkeys/${p.id}/remove`)))
    expect(answers.map((a) => a.status).sort()).toEqual([200, 409])
    expect((await accountPage(ada)).passkeys).toHaveLength(1)
  })
})

describe('the recovery code', () => {
  it('is replaced by a new one on request, shown once, and only the new one signs in', async () => {
    const ada = await openMember()
    const res = await post(ada, '/app/account/recovery-code')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const { recoveryCode } = await res.json<{ recoveryCode: string }>()
    expect(recoveryCode).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){4}$/)
    expect(recoveryCode).not.toBe(ada.recoveryCode)
    expect((await accountPage(ada)).html).not.toContain(recoveryCode)

    const recover = (code: string) =>
      exports.default.fetch(`${origin}/auth/recover`, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      })
    expect((await recover(ada.recoveryCode)).status).toBe(400)
    expect((await recover(recoveryCode)).status).toBe(200)
  })

  it('once used to sign in, opens the account page asking for a new passkey', async () => {
    const ada = await openMember()
    expect(await accountPage(ada, '/app/account?recovered')).toMatchObject({ recovered: true })
    expect(await accountPage(ada)).toMatchObject({ recovered: false })
  })
})

describe('signing out everywhere', () => {
  it("ends every session of the member's and closes their open pages on every network and launch", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const other = await created(ada, 'Day Shift Audio')
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(network) })
    const elsewhere = cookieOf(await signInWith(ada.authenticator))
    expect((await accountPage(ada)).sessions).toBe(2)
    const dashboard = await connect(ada, `/agents/network/${network}`)
    const { id: launch } = await dashboard.call<{ id: string }>('createLaunch', { name: 'Night Shift Cinema' })
    const pages = [
      dashboard,
      await connect(ada, `/agents/launch/${network}/${launch}`),
      await connect(ada, `/agents/network/${other}`)
    ]
    const teammate = await connect(grace, `/agents/network/${network}`)

    const res = await post(ada, '/app/account/sign-out-everywhere')
    expect([res.status, await res.json()]).toEqual([200, {}])
    expect(res.headers.get('set-cookie')).toMatch(/^__Host-crossfeed_member=; Max-Age=0; Path=\/; Secure/)
    for (const page of pages)
      expect(await page.closed()).toEqual({
        code: 4403,
        reason: 'You signed out everywhere. Sign in again to keep working.'
      })
    expect(await accountFor(ada.cookie)).toBe('302 /sign-in?next=/app/account')
    expect(await accountFor(elsewhere)).toBe('302 /sign-in?next=/app/account')
    // A teammate stays signed in and connected.
    expect(await accountFor(grace.cookie)).toBe(200)
    await teammate.call('dismissChecklist')
    // Ada's passkey signs her in again.
    expect(await accountFor(cookieOf(await signInWith(ada.authenticator)))).toBe(200)
  })
})

describe('deleting an account', () => {
  const deleteAccount = (member: Member) => post(member, '/app/account/delete')

  it('removes the member, their passkeys, sessions, and memberships, and closes their open pages', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(network) })
    // Grace, an owner beside Ada, makes a key: it goes with her.
    await post(ada, `/app/${network}/settings/members/${grace.id}/role`, { role: 'owner' })
    const { secret } = await (
      await post(grace, `/app/${network}/settings/api-keys`, { name: 'Nightly sync' })
    ).json<{
      secret: string
    }>()
    const page = await connect(grace, `/agents/network/${network}`)

    const res = await deleteAccount(grace)
    expect([res.status, await res.json()]).toEqual([200, {}])
    expect(res.headers.get('set-cookie')).toMatch(/^__Host-crossfeed_member=; Max-Age=0/)
    expect(await page.closed()).toEqual({ code: 4403, reason: 'Your account was deleted.' })
    expect(await accountFor(grace.cookie)).toBe('302 /sign-in?next=/app/account')
    expect(await (await signInWith(grace.authenticator)).json()).toEqual({
      error: "Crossfeed doesn't know this passkey. Try another, or create an account."
    })
    const recovered = await exports.default.fetch(`${origin}/auth/recover`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: grace.recoveryCode })
    })
    expect(recovered.status).toBe(400)

    // The network keeps its owner, and the key Grace made is revoked.
    const settings = await (await ada.fetch(`/app/${network}/settings`)).text()
    const data = (name: string) =>
      JSON.parse(settings.match(new RegExp(`data-${name}="([^"]*)"`))![1].replace(/&quot;/g, '"'))
    expect((data('members') as NetworkMember[]).map((m) => m.name)).toEqual(['Ada Programmer'])
    expect(data('api-keys') as ApiKey[]).toEqual([])
    expect(
      (
        await exports.default.fetch(`${origin}/api/v1/networks/${network}`, {
          headers: { Authorization: `Bearer ${secret}` }
        })
      ).status
    ).toBe(401)
  })

  it("is refused while the member is any network's only owner, naming each", async () => {
    const ada = await openMember()
    const night = await created(ada)
    const day = await created(ada, 'Day Shift Audio')
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(night) })
    expect((await accountPage(ada)).networks).toEqual([
      { id: day, name: 'Day Shift Audio', role: 'owner', onlyOwner: true },
      { id: night, name: 'Night Shift Audio', role: 'owner', onlyOwner: true }
    ])
    expect((await accountPage(grace)).networks).toEqual([
      { id: night, name: 'Night Shift Audio', role: 'member', onlyOwner: false }
    ])

    const refused = await deleteAccount(ada)
    expect([refused.status, await refused.json()]).toEqual([
      409,
      {
        error:
          "You're the only owner of Day Shift Audio and Night Shift Audio. Make someone else an owner, or delete the network, before you delete your account."
      }
    ])
    await post(ada, `/app/${night}/settings/members/${grace.id}/role`, { role: 'owner' })
    expect(await (await deleteAccount(ada)).json()).toEqual({
      error:
        "You're the only owner of Day Shift Audio. Make someone else an owner, or delete the network, before you delete your account."
    })
    expect(await accountFor(ada.cookie)).toBe(200)
    expect((await accountPage(ada)).networks.map((n) => n.onlyOwner)).toEqual([true, false])
  })
})
