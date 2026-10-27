// Step-up: adding a passkey, getting a new recovery code, and deleting an account need the member to
// have proved it's them in the last five minutes, with a user-verified passkey, or, in a browser
// signed in with their recovery code, that code. Driven through the account page's routes and the
// passkey ceremonies, with the software authenticator in the browser's place.
import { exports } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AccountPasskey } from '../src/directory'
import { softwareAuthenticator, type Authenticator } from './authenticator'
import { addPasskey, openMember, type Member } from './session'

const origin = 'https://crossfeed.test'
const MINUTE = 60_000

afterEach(() => vi.useRealTimers())

// A write from one of the member's pages, as `send` in the island makes it.
const post = (member: Member, path: string, body: object = {}) =>
  member.fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

// A signed-out write from one of the app's pages.
const write = (path: string, body: object, headers: Record<string, string> = {}) =>
  exports.default.fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  })

// The three changes that need a recent proof, as the account page makes them; adding a passkey is the
// ceremony's first step, which the second can't come without.
const changes = {
  'add a passkey': (m: Member) => post(m, '/auth/passkeys/options'),
  'get a new recovery code': (m: Member) => post(m, '/app/account/recovery-code'),
  'delete the account': (m: Member) => post(m, '/app/account/delete')
}

type StepUp = { error: string; stepUp: 'passkey' | 'code'; challenge?: string; options?: never }

// Confirms it's the member with `device`'s passkey, answering the refusal's own ceremony, as the
// account page does the moment it's refused.
async function confirm(member: Member, refusal: Response, device: Authenticator = member.authenticator) {
  const { challenge, options } = await refusal.json<StepUp>()
  return post(member, '/auth/verify', { challenge, response: await device.authenticate(options!) })
}

// A member signed in, in a browser of its own, with their recovery code, and the new code it showed.
async function recovered(member: Member) {
  const res = await write('/auth/recover', { code: member.recoveryCode })
  const cookie = res.headers.get('set-cookie')!.split(';')[0]
  const { recoveryCode } = await res.json<{ recoveryCode: string }>()
  const browser: Member = {
    ...member,
    cookie,
    recoveryCode,
    fetch: (path, init = {}) => {
      const headers = new Headers(init.headers)
      headers.set('Cookie', cookie)
      if (init.method && init.method !== 'GET') headers.set('Origin', origin)
      return exports.default.fetch(`${origin}${path}`, { ...init, headers })
    }
  }
  return browser
}

const passkeyFirst = "Confirm it's you with your passkey first."
const codeFirst = "Confirm it's you with your recovery code first: this browser signed in with it."

describe('a change to how a member signs in, or deleting their account', () => {
  for (const [change, make] of Object.entries(changes))
    it(`asks for a passkey five minutes after the last one, to ${change}, and goes ahead once it's given`, async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      const ada = await openMember()
      vi.setSystemTime(Date.now() + 5 * MINUTE + 1)

      const refused = await make(ada)
      expect(refused.status).toBe(403)
      const asked = await refused.clone().json<StepUp>()
      expect(asked).toEqual({
        error: passkeyFirst,
        stepUp: 'passkey',
        challenge: expect.any(String),
        options: expect.anything()
      })
      // The ceremony names the member's own passkeys and needs the person verified.
      expect(asked.options).toMatchObject({
        userVerification: 'required',
        allowCredentials: [{ id: expect.any(String), type: 'public-key' }]
      })
      expect(await (await confirm(ada, refused)).json()).toEqual({})

      expect((await make(ada)).status).toBe(200)
    })

  it('needs the proof still within five minutes as the new passkey arrives, not only as its ceremony starts', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const ada = await openMember()
    vi.setSystemTime(Date.now() + 4 * MINUTE)
    const started = await changes['add a passkey'](ada)
    const { challenge, options } = await started.json<{ challenge: string; options: never }>()
    const response = await softwareAuthenticator().register(options)
    vi.setSystemTime(Date.now() + 2 * MINUTE)

    const late = await post(ada, '/auth/passkeys', { challenge, response })
    expect(late.status).toBe(403)
    expect(await late.json()).toMatchObject({ error: passkeyFirst, stepUp: 'passkey' })
  })

  it('takes a sign-up or a sign-in with a passkey as the proof, for five minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const ada = await openMember()
    vi.setSystemTime(Date.now() + 4 * MINUTE)
    expect((await changes['get a new recovery code'](ada)).status).toBe(200)
    vi.setSystemTime(Date.now() + 2 * MINUTE)
    expect((await changes['get a new recovery code'](ada)).status).toBe(403)

    const { challenge, options } = await (
      await write('/auth/sign-in/options', {})
    ).json<{
      challenge: string
      options: never
    }>()
    const signedIn = await write('/auth/sign-in', {
      challenge,
      response: await ada.authenticator.authenticate(options)
    })
    const cookie = signedIn.headers.get('set-cookie')!.split(';')[0]
    const again = await exports.default.fetch(`${origin}/app/account/recovery-code`, {
      method: 'POST',
      headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
      body: '{}'
    })
    expect(again.status).toBe(200)
  })

  it("takes no other member's passkey, no answer to another ceremony, and no recovery code, and changes nothing", async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const ada = await openMember()
    const grace = await openMember({ name: 'Grace Booker' })
    vi.setSystemTime(Date.now() + 6 * MINUTE)

    const byGrace = await confirm(ada, await changes['delete the account'](ada), grace.authenticator)
    expect([byGrace.status, await byGrace.json()]).toEqual([
      400,
      { error: 'That passkey isn’t one of yours. Confirm with a passkey of your account.' }
    ])
    const { challenge } = await (await changes['delete the account'](ada)).json<StepUp>()
    const signInOptions = await (await write('/auth/sign-in/options', {})).json<{ options: never }>()
    const other = await post(ada, '/auth/verify', {
      challenge,
      response: await ada.authenticator.authenticate(signInOptions.options)
    })
    expect([other.status, await other.json()]).toEqual([
      400,
      { error: 'Crossfeed couldn’t verify this passkey. Try again.' }
    ])
    const code = await post(ada, '/auth/verify', { code: ada.recoveryCode })
    expect([code.status, await code.json()]).toEqual([
      400,
      { error: 'Confirm it’s you with your passkey: a recovery code confirms only a browser signed in with it.' }
    ])

    expect((await changes['delete the account'](ada)).status).toBe(403)
    const signedOut = await write('/auth/verify', { code: ada.recoveryCode })
    expect([signedOut.status, await signedOut.json()]).toEqual([401, { error: 'Sign in first.' }])
  })
})

describe('a browser signed in with a recovery code', () => {
  it('adds the first passkey for this device, with no passkey to ask for, within five minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const ada = await openMember()
    const browser = await recovered(ada)
    vi.setSystemTime(Date.now() + 4 * MINUTE)

    const added = await addPasskey(browser, softwareAuthenticator())
    expect(added.status).toBe(200)
    expect((await added.json<{ passkeys: AccountPasskey[] }>()).passkeys).toHaveLength(2)
  })

  it('asks for the recovery code after five minutes, never a passkey, and goes ahead once it has it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const ada = await openMember()
    const browser = await recovered(ada)
    vi.setSystemTime(Date.now() + 5 * MINUTE + 1)

    const refused = await changes['add a passkey'](browser)
    expect([refused.status, await refused.json()]).toEqual([403, { error: codeFirst, stepUp: 'code' }])
    // The code it signed in with was used; the one it showed is the member's now.
    const old = await post(browser, '/auth/verify', { code: ada.recoveryCode })
    expect([old.status, await old.json()]).toEqual([
      400,
      { error: 'That isn’t your recovery code. Check it, or the one Crossfeed showed you last, and try again.' }
    ])
    expect((await post(browser, '/auth/verify', { code: browser.recoveryCode.toLowerCase() })).status).toBe(200)

    expect((await addPasskey(browser, softwareAuthenticator())).status).toBe(200)
    // It was a proof, not a sign-in: the code still signs in once.
    expect((await write('/auth/recover', { code: browser.recoveryCode })).status).toBe(200)
  })
})
