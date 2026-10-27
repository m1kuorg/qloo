// Signing in as a guest (ADR 0005): one click, no passkey, to the guest network, as the guest member,
// through the accounts routes and the app's pages, as the sign-in page's "Sign in as a guest" does.
import { env, exports } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { guestSignIn, hooked, openGuest, openMember, type Guest } from './session'

const origin = 'https://crossfeed.test'
const accounts = env.ACCOUNTS
afterEach(() => {
  env.ACCOUNTS = accounts
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// The page a guest's /app opens, and who and where its dashboard says they are, as the island reads
// its data attributes.
async function dashboard(guest: Guest) {
  const app = await guest.fetch('/app', { redirect: 'manual' })
  const path = app.headers.get('location')
  const html = path ? await (await guest.fetch(path)).text() : ''
  const attr = (name: string) => html.match(new RegExp(`data-${name}="([^"]*)"`))?.[1]
  return { path, page: attr('page'), member: attr('member-id'), network: attr('network-name'), role: attr('role') }
}

describe('signing in as a guest', () => {
  it('gives each guest a session of their own, as the one guest member in the one guest network', async () => {
    const logged = vi.spyOn(console, 'log')
    const ada = await openGuest()
    const grace = await openGuest()
    expect(ada.cookie).toMatch(/^__Host-crossfeed_member=[\w-]{43}$/)
    expect(grace.cookie).not.toBe(ada.cookie)
    expect(ada.next).toBe('/app')

    const opened = await dashboard(ada)
    expect(opened).toMatchObject({ page: 'dashboard', network: 'Guest network', role: 'member' })
    expect(opened.member).toBeTruthy()
    expect(await dashboard(grace)).toEqual(opened)
    expect(logged.mock.calls.filter(([line]) => line === JSON.stringify({ event: 'guest_sign_in' }))).toHaveLength(2)
  })

  it('answers where to go next: ?next when it is a path on this site, as for a passkey sign-in, or else /app', async () => {
    const next = '/app/guest-network/roster?view=misses'
    expect((await openGuest({ next })).next).toBe(next)
    for (const away of [
      'https://crossfeed.example/app',
      '//crossfeed.example/app',
      '/\\crossfeed.example',
      'javascript:alert(1)',
      '/.//crossfeed.example/app',
      '/%2e//crossfeed.example/app'
    ])
      expect((await openGuest({ next: away })).next, away).toBe('/app')
  })

  it('ends the session the browser held, a member’s, and none of their others', async () => {
    const ada = await openMember({ name: 'Ada Programmer' })
    // Ada signs in on a second browser with her passkey.
    const post = (path: string, body: object) =>
      exports.default.fetch(`${origin}${path}`, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
    const { challenge, options } = await (
      await post('/auth/sign-in/options', {})
    ).json<{
      challenge: string
      options: never
    }>()
    const other = await post('/auth/sign-in', { challenge, response: await ada.authenticator.authenticate(options) })
    const elsewhere = other.headers.get('set-cookie')!.split(';')[0]

    const guest = await openGuest({ cookie: ada.cookie })
    expect(guest.cookie).not.toBe(ada.cookie)
    const signIn = await ada.fetch('/app/new', { redirect: 'manual' })
    expect(signIn.headers.get('location')).toBe('/sign-in?next=/app/new')
    expect((await dashboard(guest)).network).toBe('Guest network')
    const kept = await exports.default.fetch(`${origin}/app/new`, { headers: { Cookie: elsewhere } })
    expect(await kept.text()).toContain('Ada Programmer')
  })

  it('is a POST from one of the app’s pages, while accounts are on', async () => {
    const from = (headers: Record<string, string>) =>
      exports.default.fetch(`${origin}/auth/guest`, { method: 'POST', headers, body: '{}' })
    for (const headers of [{ Origin: 'https://crossfeed.example' }, { Origin: 'null' }, {}] as Record<
      string,
      string
    >[]) {
      const res = await from(headers)
      expect(res.status).toBe(403)
      expect(res.headers.get('set-cookie')).toBeNull()
    }
    expect((await exports.default.fetch(`${origin}/auth/guest`)).status).toBe(404)
    const signedIn = await guestSignIn()
    expect(signedIn.headers.get('cache-control')).toBe('no-store')
    env.ACCOUNTS = 'off'
    const off = await guestSignIn()
    expect(off.status).toBe(404)
    expect(off.headers.get('set-cookie')).toBeNull()
  })
})

describe('what a guest can’t change', () => {
  const REFUSED = {
    error:
      'Everyone who signs in as a guest shares the guest network and its one guest member, so no guest can do this. Sign out and create an account to do it.'
  }
  const post = (guest: Guest, path: string, body: object = {}) =>
    guest.fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const challenges = () => env.DB.prepare('SELECT count(*) AS n FROM challenges').first<number>('n')

  it('refuses the guest member’s passkeys, recovery code, name, sessions, and account, even just signed in, and asks for no step-up', async () => {
    const guest = await openGuest()
    const other = await openGuest()
    for (const [path, body] of [
      ['/auth/passkeys/options', {}],
      ['/auth/passkeys', { challenge: 'none', response: {} }],
      ['/app/account/recovery-code', {}],
      ['/app/account/name', { name: 'Mallory' }],
      ['/app/account/sign-out-everywhere', {}],
      ['/app/account/delete', {}]
    ] as const) {
      const refused = await post(guest, path, body)
      expect(refused.status, path).toBe(403)
      expect(await refused.json(), path).toEqual(REFUSED)
    }
    // No ceremony was started for a step-up the guest member has no passkey or code to answer.
    expect(await challenges()).toBe(0)
    // Both guests are still signed in, as the guest member, by its name.
    for (const g of [guest, other]) {
      const page = await g.fetch('/app/account')
      expect(page.status).toBe(200)
      expect(await page.text()).toContain('data-member-name="Guest"')
    }
  })

  it('refuses creating a network, joining one by invite, and leaving the guest network', async () => {
    const ada = await openMember()
    const created = await ada.fetch('/app/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Night Shift Audio' })
    })
    const { id } = await created.json<{ id: string }>()
    const token = new URL(await ada.invite(id)).hash.slice(1)
    const guest = await openGuest()

    for (const [path, body] of [
      ['/app/new', { name: 'Guest Audio' }],
      ['/auth/join', { token }],
      ['/app/guest-network/settings/members/leave', {}]
    ] as const) {
      const refused = await post(guest, path, body)
      expect(refused.status, path).toBe(403)
      expect(await refused.json(), path).toEqual(REFUSED)
    }
    // The guest network keeps its guest member, and the invite is still there for a person to use.
    expect((await guest.fetch('/app/guest-network')).status).toBe(200)
    expect((await guest.fetch(`/app/${id}`)).status).toBe(404)
    await openMember({ name: 'Grace Booker', invite: `https://crossfeed.test/invite#${token}` })
  })

  it('refuses every owner’s change to the guest network, which has no owner', async () => {
    const guest = await openGuest()
    const settings = '/app/guest-network/settings'
    for (const [path, body, error] of [
      [`${settings}/network`, { name: 'Mine now', cpm: 1 }, 'Only an owner can change the network’s name and CPM.'],
      [`${settings}/members/invites`, {}, 'Only an owner can invite and manage members.'],
      [`${settings}/members/guest-member/role`, { role: 'owner' }, 'Only an owner can invite and manage members.'],
      [`${settings}/members/guest-member/remove`, {}, 'Only an owner can invite and manage members.'],
      [`${settings}/api-keys`, { name: 'Mine' }, 'Only an owner can create and revoke API keys.'],
      [
        `${settings}/qloo-key`,
        { host: 'https://api.qloo.com', key: 'k' },
        'Only an owner can add or remove the network’s Qloo key.'
      ],
      [`${settings}/delete`, { name: 'Guest network' }, 'Only an owner can delete the network.']
    ] as const) {
      const refused = await post(guest, path, body)
      expect(refused.status, path).toBe(403)
      expect(await refused.json(), path).toEqual({ error })
    }
    const network = await guest.connect('/agents/network/guest-network')
    expect(network.state()).toMatchObject({ cpm: 20 })
    const page = await (await guest.fetch(settings)).text()
    expect(page).toContain('data-network-name="Guest network"')
    expect(page).toContain('data-role="member"')
  })
})

// A page's words, as a reader hears them.
const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

describe('the app, as a guest sees it', () => {
  const NOTICE =
    'You’re signed in as a guest. Everyone who signs in as a guest shares the guest network and its daily limits, so put nothing private in it. Sign out and create an account'

  it('says on every page that the guest network is shared, offers a way to an account, and no network of one’s own', async () => {
    const guest = await openGuest()
    const network = await guest.connect('/agents/network/guest-network')
    const { id } = await network.call<{ id: string }>('createLaunch', { name: 'The Night Watch' })
    for (const path of [
      '/app/guest-network',
      '/app/guest-network/roster',
      '/app/guest-network/settings',
      `/app/guest-network/launches/${id}`,
      '/app/account',
      '/app/new'
    ]) {
      const html = await (await guest.fetch(path)).text()
      expect(hooked(html, 'data-guest-notice').map(words), path).toEqual([NOTICE])
      expect(html, path).not.toContain('New network')
    }
    const ada = await openMember()
    for (const path of ['/app/new', '/app/account']) {
      const html = await (await ada.fetch(path)).text()
      expect(hooked(html, 'data-guest-notice'), path).toEqual([])
      expect(html, path).toContain('New network')
    }
  })
})

describe('the guest network', () => {
  it('has the sample network’s CPM from its agent’s start, and its roster as guests leave it', async () => {
    const guest = await openGuest()
    const network = await guest.connect('/agents/network/guest-network')
    // src/sample-network.json's CPM.
    expect(network.state()).toMatchObject({ cpm: 20, roster: [], sample: null })
  })
})

describe('a guest session', () => {
  const HOUR = 60 * 60_000

  it('lasts a day from sign-in, however much it’s used, as its cookie does', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const start = Date.now()
    const signedIn = await guestSignIn()
    const set = signedIn.headers.get('set-cookie')!
    expect(set).toMatch(/^__Host-crossfeed_member=[\w-]{43}; Max-Age=86400; Path=\/; HttpOnly; Secure; SameSite=Lax$/)
    const open = (time: number) => {
      vi.setSystemTime(time)
      return exports.default.fetch(`${origin}/app/guest-network`, {
        headers: { Cookie: set.split(';')[0] },
        redirect: 'manual'
      })
    }
    for (let hours = 1; hours < 24; hours += 2) {
      const used = await open(start + hours * HOUR)
      expect(used.status, `${hours} hours on`).toBe(200)
      expect(used.headers.get('set-cookie')).toBeNull()
    }
    expect((await open(start + 24 * HOUR - 1)).status).toBe(200)
    const ended = await open(start + 24 * HOUR)
    expect(ended.status).toBe(302)
    expect(ended.headers.get('location')).toBe('/sign-in?next=/app/guest-network')
  })

  it('ends at sign-out for that guest alone: every other guest stays signed in', async () => {
    const ada = await openGuest()
    const grace = await openGuest()
    const out = await ada.fetch('/auth/sign-out', { method: 'POST' })
    expect(out.status).toBe(200)
    expect(out.headers.get('set-cookie')).toMatch(/^__Host-crossfeed_member=; Max-Age=0;/)
    const signedOut = await ada.fetch('/app/guest-network', { redirect: 'manual' })
    expect(signedOut.headers.get('location')).toBe('/sign-in?next=/app/guest-network')
    expect((await grace.fetch('/app/guest-network')).status).toBe(200)
  })
})

describe('the guest sign-in limit', () => {
  const BUSY = { error: 'Guest sign-ins are busy for everyone right now. Try again in a minute.' }

  it('lets 30 guests sign in a minute in all, from any address or none, then refuses the next until a minute on', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const start = Date.now()
    // GUEST_SIGNINS_PER_MINUTE, as wrangler.jsonc sets it: 21 from one address, past the sign-in requests a
    // minute one visitor's address may send, 5 from another, and 4 with none.
    const from = [...Array(21).fill('203.0.113.7'), ...Array(5).fill('198.51.100.4'), ...Array(4).fill(undefined)]
    for (const ip of from) expect((await guestSignIn({ ip })).status).toBe(200)

    for (const ip of ['192.0.2.1', '2001:db8::1', undefined]) {
      const refused = await guestSignIn({ ip })
      expect(refused.status).toBe(429)
      expect(refused.headers.get('retry-after')).toBe('60')
      expect(refused.headers.get('set-cookie')).toBeNull()
      expect(await refused.json()).toEqual(BUSY)
    }
    vi.setSystemTime(start + 60_000 - 1)
    expect((await guestSignIn({ ip: '192.0.2.1' })).status).toBe(429)
    vi.setSystemTime(start + 60_000)
    expect((await guestSignIn({ ip: '192.0.2.1' })).status).toBe(200)
  })

  it('counts a guest session that ended in the minute, by sign-out or by signing in as a guest again', async () => {
    // 15 guests sign in and out again, and 15 more sign in, each from the last one's browser.
    for (let i = 0; i < 15; i++) await (await openGuest()).fetch('/auth/sign-out', { method: 'POST' })
    let cookie: string | undefined
    for (let i = 0; i < 15; i++) cookie = (await openGuest({ cookie })).cookie
    expect(await (await guestSignIn({ cookie })).json()).toEqual(BUSY)
    expect((await guestSignIn()).status).toBe(429)
  })

  it('counts exactly, so two sign-ins at once for the last place leave one refused', async () => {
    for (let i = 0; i < 29; i++) expect((await guestSignIn()).status).toBe(200)
    const both = await Promise.all([guestSignIn({ ip: '203.0.113.7' }), guestSignIn({ ip: '198.51.100.4' })])
    expect(both.map((res) => res.status).sort()).toEqual([200, 429])
  })
})
