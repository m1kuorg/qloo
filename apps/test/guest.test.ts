// Signing in as a guest (ADR 0006): one click, no passkey, to a guest member of one's own, an owner of
// the guest network, through the accounts routes and the app's pages, as the sign-in page's "Sign in as
// a guest" does.
import { getAgentByName } from 'agents'
import { createExecutionContext, createScheduledController, waitOnExecutionContext } from 'cloudflare:test'
import { env, exports } from 'cloudflare:workers'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Invite } from '../src/client/Account'
import { NewNetworkPage } from '../src/client/NewNetwork'
import worker from '../src/index'
import { LaunchAgent } from '../src/launch-agent'
import { NetworkAgent } from '../src/network-agent'
import { softwareAuthenticator } from './authenticator'
import { fakeClaude, fakeQloo, text, toolUse, turn } from './fake'
import {
  api,
  guestSignIn,
  hooked,
  openGuest,
  openMember,
  readAfterReset,
  untilRefused,
  type Guest,
  type Session
} from './session'

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

// A write from a guest's page, as its islands send them.
const post = (guest: Guest, path: string, body: object = {}) =>
  guest.fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

// The guest network's members, as its settings page gives them to its island.
async function guestMembers(guest: Guest) {
  const html = await (await guest.fetch('/app/guest-network/settings')).text()
  return JSON.parse(html.match(/data-members="([^"]*)"/)![1].replace(/&quot;/g, '"')) as {
    id: string
    name: string
    role: string
  }[]
}

describe('signing in as a guest', () => {
  it('makes each guest a guest member of their own, named Guest and six hex digits, an owner of the guest network', async () => {
    const logged = vi.spyOn(console, 'log')
    const ada = await openGuest()
    const grace = await openGuest()
    expect(ada.cookie).toMatch(/^__Host-crossfeed_member=[\w-]{43}$/)
    expect(grace.cookie).not.toBe(ada.cookie)
    expect(ada.next).toBe('/app')

    const hers = await dashboard(ada)
    const his = await dashboard(grace)
    for (const opened of [hers, his])
      expect(opened).toMatchObject({
        path: '/app/guest-network',
        page: 'dashboard',
        network: 'Guest network',
        role: 'owner',
        member: expect.stringMatching(/^guest-[0-9a-f-]{36}$/)
      })
    expect(his.member).not.toBe(hers.member)
    const members = await guestMembers(grace)
    expect(members).toMatchObject([
      { id: hers.member, name: expect.stringMatching(/^Guest [0-9A-F]{6}$/), role: 'owner' },
      { id: his.member, name: expect.stringMatching(/^Guest [0-9A-F]{6}$/), role: 'owner' }
    ])
    expect(members[1].name).not.toBe(members[0].name)
    // Each is signed in as themselves: their account page names them.
    for (const [guest, { name }] of [
      [ada, members[0]],
      [grace, members[1]]
    ] as const)
      expect(await (await guest.fetch('/app/account')).text()).toContain(`data-member-name="${name}"`)
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

  it('signs no browser in again that holds a live session, a member’s or a guest’s: it goes where it was headed', async () => {
    const ada = await openMember({ name: 'Ada Programmer' })
    const guest = await openGuest()
    const [{ name }] = await guestMembers(guest)
    for (const cookie of [ada.cookie, guest.cookie]) {
      const again = await guestSignIn({ cookie, next: '/app/account' })
      expect(again.status).toBe(200)
      expect(again.headers.get('set-cookie')).toBeNull()
      expect(await again.json()).toEqual({ next: '/app/account' })
    }
    // Each is still signed in as themselves, and the guest network has no other guest member.
    expect(await (await ada.fetch('/app/account')).text()).toContain('data-member-name="Ada Programmer"')
    expect(await (await guest.fetch('/app/account')).text()).toContain(`data-member-name="${name}"`)
    expect(await guestMembers(guest)).toHaveLength(1)
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

describe('what a guest changes of their own account, as any member does', () => {
  it('renames themselves, as every other guest sees them', async () => {
    const ada = await openGuest()
    const grace = await openGuest()
    const renamed = await post(ada, '/app/account/name', { name: 'Ada Programmer' })
    expect(renamed.status).toBe(200)
    expect(await renamed.json()).toEqual({ name: 'Ada Programmer' })
    expect((await guestMembers(grace)).map((m) => m.name)).toContain('Ada Programmer')
  })

  it('creates a network of their own, with an ID that starts with guest-, and owns it', async () => {
    const guest = await openGuest()
    const created = await post(guest, '/app/new', { name: 'Night Shift Audio' })
    expect(created.status).toBe(200)
    const { id } = await created.json<{ id: string }>()
    expect(id).toMatch(/^guest-[0-9a-f-]{36}$/)
    expect(await dashboard(guest)).toMatchObject({ path: `/app/${id}`, network: 'Night Shift Audio', role: 'owner' })
    // A member's network has no such start.
    const ada = await openMember()
    const theirs = await (
      await ada.fetch('/app/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Paper Route' })
      })
    ).json<{ id: string }>()
    expect(theirs.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('joins a network by invite, and leaves the guest network, even as its only owner', async () => {
    const ada = await openMember()
    const { id } = await (
      await ada.fetch('/app/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Night Shift Audio' })
      })
    ).json<{ id: string }>()
    const token = new URL(await ada.invite(id)).hash.slice(1)
    const guest = await openGuest()

    const joined = await post(guest, '/auth/join', { token })
    expect(joined.status).toBe(200)
    expect(await joined.json()).toEqual({ id })
    expect((await guest.fetch(`/app/${id}`)).status).toBe(200)

    // The guest network's last owner can leave it: sign-in keeps adding owners (ADR 0006).
    const left = await post(guest, '/app/guest-network/settings/members/leave')
    expect(left.status).toBe(200)
    expect((await guest.fetch('/app/guest-network')).status).toBe(404)
  })

  it('signs out everywhere, for that guest alone', async () => {
    const ada = await openGuest()
    const grace = await openGuest()
    const out = await post(ada, '/app/account/sign-out-everywhere')
    expect(out.status).toBe(200)
    expect((await ada.fetch('/app/guest-network', { redirect: 'manual' })).headers.get('location')).toBe(
      '/sign-in?next=/app/guest-network'
    )
    expect((await grace.fetch('/app/guest-network')).status).toBe(200)
  })

  it('deletes their account with no step-up, as the guest network’s only owner too, and the guest network stays', async () => {
    const ada = await openGuest()
    const deleted = await post(ada, '/app/account/delete')
    expect(deleted.status).toBe(200)
    expect((await ada.fetch('/app/account', { redirect: 'manual' })).status).toBe(302)
    const grace = await openGuest()
    expect(await guestMembers(grace)).toHaveLength(1)
    expect(await dashboard(grace)).toMatchObject({ path: '/app/guest-network', role: 'owner' })
  })
})

describe('keeping a guest account', () => {
  const DAY = 24 * 60 * 60_000
  // A write from the guest's page, from address `ip` if given, as Cloudflare's edge sends it.
  const from = (guest: Guest, path: string, body: object, ip?: string) =>
    guest.fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(ip && { 'CF-Connecting-IP': ip }) },
      body: JSON.stringify(body)
    })
  // Both steps of adding a passkey made by `device`, as the account page does, with no step-up asked.
  async function keep(guest: Guest, device = softwareAuthenticator(), ip?: string) {
    const started = await from(guest, '/auth/passkeys/options', {}, ip)
    if (started.status !== 200) return started
    const { challenge, options } = await started.json<{ challenge: string; options: never }>()
    return from(guest, '/auth/passkeys', { challenge, response: await device.register(options) }, ip)
  }

  it('keeps it with a first passkey and no step-up: a recovery code shown once, and a member’s session and cookie', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const start = Date.now()
    const guest = await openGuest()
    const [{ id, name }] = await guestMembers(guest)
    const device = softwareAuthenticator()

    const kept = await keep(guest, device)
    expect(kept.status).toBe(200)
    const { passkeys, recoveryCode } = await kept.json<{ passkeys: object[]; recoveryCode: string }>()
    expect(passkeys).toHaveLength(1)
    expect(recoveryCode).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){4}$/)
    // The same session, for a member's 30 days now, as its cookie says.
    expect(kept.headers.get('set-cookie')).toBe(
      `${guest.cookie}; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Lax`
    )
    // It's a member's account now: the app tells them nothing of a guest's, and their name and the
    // guest network stay as they were.
    const account = await (await guest.fetch('/app/account')).text()
    expect(account).toContain(`data-member-name="${name}"`)
    expect(account).not.toContain('data-guest')
    expect(hooked(account, 'data-guest-notice')).toEqual([])
    expect(await guestMembers(guest)).toMatchObject([{ id, role: 'owner' }])

    // Past a guest's day, the session lasts, and it's extended as a member's is.
    vi.setSystemTime(start + 2 * DAY)
    const later = await guest.fetch('/app/guest-network')
    expect(later.status).toBe(200)
    expect(later.headers.get('set-cookie')).toMatch(/; Max-Age=2592000;/)
    // From then on its changes ask for a step-up, answered with the new passkey.
    const unproved = await from(guest, '/app/account/recovery-code', {})
    expect(unproved.status).toBe(403)
    expect(await unproved.json()).toMatchObject({ stepUp: 'passkey' })
    // And the recovery code signs them in, once.
    const recovered = await exports.default.fetch(`${origin}/auth/recover`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: recoveryCode })
    })
    expect(recovered.status).toBe(200)
  })

  it('refuses a guest a new recovery code before a passkey, writing no challenge', async () => {
    const guest = await openGuest()
    const refused = await from(guest, '/app/account/recovery-code', {})
    expect(refused.status).toBe(403)
    expect(await refused.json()).toEqual({
      error: 'Add a passkey first, to keep your account: you get a recovery code with your first passkey.'
    })
    expect(await env.DB.prepare('SELECT count(*) AS n FROM challenges').first('n')).toBe(0)
  })

  it('counts as a sign-up against the visitor’s accounts a day, as it starts and as it keeps the account', async () => {
    const cap = env.SIGNUP_VISITOR_DAILY_CAP
    env.SIGNUP_VISITOR_DAILY_CAP = '1'
    try {
      const ip = '203.0.113.7'
      expect((await keep(await openGuest({ ip }), undefined, ip)).status).toBe(200)
      const CAPPED = {
        error: "You've created 1 account today, the most one visitor can create in a UTC day; it resets at 00:00 UTC."
      }
      // The visitor's next account is refused, whether a sign-up or another guest's keeping.
      const signUp = await exports.default.fetch(`${origin}/auth/sign-up/options`, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
        body: JSON.stringify({ name: 'Grace Booker' })
      })
      expect(await signUp.json()).toEqual(CAPPED)
      const again = await keep(await openGuest({ ip }), undefined, ip)
      expect(again.status).toBe(429)
      expect(await again.json()).toEqual(CAPPED)
      // Another address isn't counted with it.
      expect((await keep(await openGuest({ ip: '198.51.100.4' }), undefined, '198.51.100.4')).status).toBe(200)
    } finally {
      env.SIGNUP_VISITOR_DAILY_CAP = cap
    }
  })

  it('is limited per visitor a minute, as a sign-up is, while a member’s new passkey isn’t', async () => {
    const ip = '192.0.2.41'
    const guest = await openGuest({ ip })
    const { res } = await untilRefused(() => from(guest, '/auth/passkeys/options', {}, ip), 20)
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({
      error: 'Too many sign-in requests from your address in the last minute. Wait a minute, then try again.'
    })
    const ada = await openMember({ ip: '192.0.2.42' })
    for (let i = 0; i < 25; i++)
      expect(
        (await ada.fetch('/auth/passkeys/options', { method: 'POST', headers: { 'CF-Connecting-IP': '192.0.2.42' } }))
          .status
      ).toBe(200)
  })
})

describe('what a guest can change, as an owner of the guest network', () => {
  const settings = '/app/guest-network/settings'

  it('renames it and sets its CPM, for every guest', async () => {
    const ada = await openGuest()
    const grace = await openGuest()
    const renamed = await post(ada, `${settings}/network`, { name: 'Night Shift Guests', cpm: 25 })
    expect(renamed.status).toBe(200)
    expect(await renamed.json()).toEqual({ name: 'Night Shift Guests', cpm: 25 })
    expect(await dashboard(grace)).toMatchObject({ network: 'Night Shift Guests', role: 'owner' })
    expect((await grace.connect('/agents/network/guest-network')).state()).toMatchObject({ cpm: 25 })
  })

  it('invites a person, who joins as a member, changes another guest’s role, and removes a member', async () => {
    const ada = await openGuest()
    const grace = await openGuest()
    const invited = await post(ada, `${settings}/members/invites`)
    expect(invited.status).toBe(200)
    const dot = await openMember({ name: 'Dot Pruitt', invite: (await invited.json<{ link: string }>()).link })
    expect(dot.network).toBe('guest-network')

    // Guests who sign in in the same millisecond are listed by name, so Grace is found by her ID.
    const theirs = { id: (await dashboard(grace)).member }
    expect((await post(ada, `${settings}/members/${theirs.id}/role`, { role: 'member' })).status).toBe(200)
    expect(await dashboard(grace)).toMatchObject({ role: 'member' })
    expect(await (await post(grace, `${settings}/members/invites`)).json()).toEqual({
      error: 'Only an owner can invite and manage members.'
    })
    expect((await post(ada, `${settings}/members/${dot.id}/remove`)).status).toBe(200)
    expect((await dot.fetch('/app/guest-network')).status).toBe(404)
    expect((await guestMembers(ada)).map((m) => m.role)).toEqual(['owner', 'member'])
  })

  it('makes an API key that acts for the guest network, and revokes it', async () => {
    const guest = await openGuest()
    const made = await post(guest, `${settings}/api-keys`, { name: 'Nightly sync' })
    expect(made.status).toBe(200)
    const { id, secret } = await made.json<{ id: string; secret: string }>()
    const call = api(secret)
    const network = await call('/api/v1/networks/guest-network')
    expect(network.status).toBe(200)
    expect(await network.json()).toMatchObject({ id: 'guest-network', name: 'Guest network' })
    expect((await post(guest, `${settings}/api-keys/${id}/revoke`)).status).toBe(200)
    expect((await call('/api/v1/networks/guest-network')).status).toBe(401)
  })

  it('deletes it for every guest, and the next guest sign-in makes it again and lands there', async () => {
    const ada = await openGuest()
    const deleted = await post(ada, `${settings}/delete`, { name: 'Guest network' })
    expect(deleted.status).toBe(200)
    expect((await ada.fetch('/app/guest-network')).status).toBe(404)

    const grace = await openGuest()
    expect(await dashboard(grace)).toMatchObject({
      path: '/app/guest-network',
      page: 'dashboard',
      network: 'Guest network',
      role: 'owner'
    })
    expect(await guestMembers(grace)).toHaveLength(1)
    expect((await grace.connect('/agents/network/guest-network')).state()).toMatchObject({ roster: [], launches: [] })
  })

  it('takes a guest who isn’t in it back in as an owner, as /app opens, making it again if it’s gone', async () => {
    const ada = await openGuest()
    expect((await post(ada, `${settings}/delete`, { name: 'Guest network' })).status).toBe(200)
    expect(await dashboard(ada)).toMatchObject({ path: '/app/guest-network', network: 'Guest network', role: 'owner' })

    // A guest who left it, or was removed, is in it again too.
    const grace = await openGuest()
    expect((await post(grace, `${settings}/members/leave`)).status).toBe(200)
    expect(await dashboard(grace)).toMatchObject({ path: '/app/guest-network', role: 'owner' })
    // One a guest owner made a member stays one; a member's /app takes no one in.
    const graceId = (await dashboard(grace)).member
    expect((await post(ada, `${settings}/members/${graceId}/role`, { role: 'member' })).status).toBe(200)
    expect(await dashboard(grace)).toMatchObject({ path: '/app/guest-network', role: 'member' })
    const dot = await openMember()
    expect((await dot.fetch('/app', { redirect: 'manual' })).headers.get('location')).toBe('/app/new')
    expect(await guestMembers(ada)).toHaveLength(2)
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
    'You’re signed in as a guest, on a temporary account that lasts a day. Every guest owns the guest network together and shares its daily limits, so put nothing private in it. It’s cleared every day at 12:00 UTC. Sign out and create an account'

  it('says on every page that the account is temporary and the guest network shared, offers a way to an account, and no network of one’s own', async () => {
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

  it('tells a guest on the new network page that a guest can’t create one, with no form', async () => {
    const page = await (await (await openGuest()).fetch('/app/new')).text()
    const root = page.match(/<div id="root"([^>]*)>/)![1]
    expect(root).toContain('data-guest="true"')
    const cap = Number(root.match(/data-cap="(\d+)"/)![1])
    const html = renderToStaticMarkup(createElement(NewNetworkPage, { cap, guest: true }))
    expect(words(html)).toBe(
      'Create a network A network holds your roster, its launches, and your booking inbox, for you and the teammates you invite. You own the networks you create, up to 3. A guest can’t create a network. Sign out and create an account to create one of your own. Sign out and create an account'
    )
    expect(html).not.toContain('<input')
  })

  // The invite page for `link`, as main.tsx renders it from the server's data attributes, once it has
  // posted the link's token to /auth/invite, as the page does, with the answer.
  async function invitePage(visitor: Pick<Guest, 'fetch'>, link: string) {
    const page = await (await visitor.fetch('/invite')).text()
    const root = page.match(/<div id="root"([^>]*)>/)![1]
    const attr = (name: string) => root.match(new RegExp(`data-${name}="([^"]*)"`))?.[1]
    const token = new URL(link).hash.slice(1)
    const answer = await visitor.fetch('/auth/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    })
    return renderToStaticMarkup(
      createElement(Invite, {
        token,
        invite: await answer.json<{ network: string } | { error: string }>(),
        memberName: attr('member-name') ?? null,
        guest: attr('guest') === 'true'
      })
    )
  }

  it('tells a guest who opens an invite link to sign out and create an account to join, with no Join', async () => {
    const ada = await openMember()
    const network = await ada.fetch('/app/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Night Shift Audio' })
    })
    const link = await ada.invite((await network.json<{ id: string }>()).id)
    // A member is offered Join, and signing out to join with another account.
    expect(words(await invitePage(ada, link))).toContain('Join Night Shift Audio Not Ada Programmer? Sign out')
    expect(words(await invitePage(await openGuest(), link))).toBe(
      'Join Night Shift Audio You’re invited to Night Shift Audio on Crossfeed, as a member: you’ll work on its roster, launches, and inbox with its other members. The link works once. You’re signed in as a guest, and a guest can’t join a network. Sign out and create an account to join Night Shift Audio. Sign out and create an account'
    )
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
    // Its browser, holding no live session now, signs in as a new guest member.
    const again = await guestSignIn({ cookie: set.split(';')[0] })
    expect(again.headers.get('set-cookie')).toMatch(/^__Host-crossfeed_member=[\w-]{43}; Max-Age=86400;/)
    expect(again.headers.get('set-cookie')).not.toContain(set.split(';')[0])
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

  it('counts guests who signed out in the minute: their sessions are gone, and their sign-ins still count', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const start = Date.now()
    for (let i = 0; i < 30; i++) {
      const out = await (await openGuest()).fetch('/auth/sign-out', { method: 'POST' })
      expect(out.status).toBe(200)
    }
    expect(await (await guestSignIn()).json()).toEqual(BUSY)
    vi.setSystemTime(start + 60_000)
    expect((await guestSignIn()).status).toBe(200)
  })

  it('lets GUEST_SIGNINS_PER_DAY guests sign in a UTC day in all, from any address or none, then refuses the next until 00:00 UTC', async () => {
    const perDay = env.GUEST_SIGNINS_PER_DAY
    env.GUEST_SIGNINS_PER_DAY = '3'
    try {
      vi.useFakeTimers({ toFake: ['Date'] })
      // Three guests a few minutes apart, so the minute's limit never counts, one of whom signs out.
      vi.setSystemTime(new Date('2026-10-28T23:00:00Z'))
      await openGuest({ ip: '203.0.113.7' })
      vi.setSystemTime(new Date('2026-10-28T23:10:00Z'))
      await (await openGuest({ ip: '198.51.100.4' })).fetch('/auth/sign-out', { method: 'POST' })
      vi.setSystemTime(new Date('2026-10-28T23:20:00Z'))
      await openGuest()

      vi.setSystemTime(new Date('2026-10-28T23:59:59Z'))
      for (const ip of ['192.0.2.1', undefined]) {
        const refused = await guestSignIn({ ip })
        expect(refused.status).toBe(429)
        expect(refused.headers.get('retry-after')).toBe('1')
        expect(refused.headers.get('set-cookie')).toBeNull()
        expect(await refused.json()).toEqual({
          error:
            'Guests have signed in 3 times today, the most Crossfeed takes in a UTC day; it resets at 00:00 UTC. Create an account to sign in now.'
        })
      }
      vi.setSystemTime(new Date('2026-10-29T00:00:00Z'))
      expect((await guestSignIn({ ip: '192.0.2.1' })).status).toBe(200)
    } finally {
      env.GUEST_SIGNINS_PER_DAY = perDay
    }
  })

  it('counts exactly, so two sign-ins at once for the last place leave one refused', async () => {
    for (let i = 0; i < 29; i++) expect((await guestSignIn()).status).toBe(200)
    const both = await Promise.all([guestSignIn({ ip: '203.0.113.7' }), guestSignIn({ ip: '198.51.100.4' })])
    expect(both.map((res) => res.status).sort()).toEqual([200, 429])
  })
})

describe("the guest network's daily budget", () => {
  // Guests' addresses, as Cloudflare's edge sends them.
  const adaIp = '203.0.113.7'
  const graceIp = '2001:db8::1'
  const dotIp = '192.0.2.1'
  const pitch = {
    text: 'From: Pat <pat@example.com>\nSubject: A guest\n\nAda Quill would love to talk about Night Ferry.'
  }
  const search = {
    'Night Shift Cinema': [{ entity_id: 'e-0001', name: 'Night Shift Cinema', popularity: 0.8 }],
    'Night Ferry': [{ entity_id: 'b-0001', name: 'Night Ferry', popularity: 0.81, disambiguation: '2019, Ada Quill' }]
  }
  const saved = {
    GUEST_PITCHES: env.GUEST_PITCHES,
    RUN_VISITOR_DAILY_CAP: env.RUN_VISITOR_DAILY_CAP,
    FREE_START_DAILY_CAP: env.FREE_START_DAILY_CAP,
    QLOO_VISITOR_DAILY_CALL_CAP: env.QLOO_VISITOR_DAILY_CALL_CAP,
    RUN_DAILY_CAP: env.RUN_DAILY_CAP,
    QLOO_DAILY_CALL_CAP: env.QLOO_DAILY_CALL_CAP
  }
  const open: Omit<Session, 'cookie'>[] = []
  afterEach(() => {
    Object.assign(env, saved)
    open.splice(0).forEach((agent) => agent.close())
  })

  // A guest's connection to one of the guest network's agents, from address `ip` if given, as its page
  // opens it: the network's own, or with `launch`, that launch's.
  async function connect(guest: Guest, ip?: string, launch?: string) {
    const path = launch ? `/agents/launch/guest-network/${launch}` : '/agents/network/guest-network'
    const agent = await guest.connect(path, ip ? { 'CF-Connecting-IP': ip } : {})
    open.push(agent)
    return agent
  }
  const ended = (agent: Omit<Session, 'cookie'>, runId: string) =>
    agent.until((s) => s.run?.id === runId && s.run.status !== 'running')

  it('counts every guest’s model runs together, from any address or none, then refuses every guest the next', async () => {
    env.GUEST_PITCHES = 'on'
    env.RUN_VISITOR_DAILY_CAP = '3'
    fakeQloo({ search })
    fakeClaude([
      // Ada's inbox load reads its one pitch.
      turn(text(JSON.stringify({ guest: 'Ada Quill', work: { title: 'Night Ferry', type: 'book', year: 2019 } }))),
      // Grace's pitch run, and the launch run of a guest with no address, end at their first turn.
      turn(text('Nothing to rank.')),
      turn(text('Nothing to rank.'))
    ])
    const ada = await connect(await openGuest({ ip: adaIp }), adaIp)
    await ada.importRoster('Night Shift Cinema')
    await ada.call('loadInbox', pitch)
    await ada.until((s) => s.inbox?.status === 'done')

    const grace = await connect(await openGuest({ ip: graceIp }), graceIp)
    const pitches = { show: 'Night Shift Cinema', pastGuests: [] }
    await ended(grace, (await grace.call<{ runId: string }>('startPitches', pitches)).runId)

    const someone = await openGuest()
    const { id } = await (await connect(someone)).call<{ id: string }>('createLaunch', { name: 'The Night Watch' })
    const launch = await connect(someone, undefined, id)
    const run = await ended(
      launch,
      (await launch.call<{ runId: string }>('startLaunch', { name: 'The Night Watch' })).runId
    )
    expect(run.run?.status).toBe('completed')

    // Every guest is refused the next, those who spent the budget and one who signs in from a new address.
    const used =
      'Guests have started 3 model runs today, the most the guest network can start in a UTC day, shared by everyone who signs in as a guest; they reset at 00:00 UTC'
    const dot = await connect(await openGuest({ ip: dotIp }), dotIp)
    for (const guest of [ada, grace, dot]) {
      await expect(guest.call('loadInbox', pitch)).rejects.toThrow(`${used}.`)
      await expect(guest.call('startPitches', pitches)).rejects.toThrow(`${used}.`)
    }
    const stopped = await ended(
      launch,
      (await launch.call<{ runId: string }>('startLaunch', { name: 'The Night Watch' })).runId
    )
    expect(stopped.run).toMatchObject({
      status: 'stopped',
      error: `${used}, so runs on your own data wait until then. Only the sample launch, on the unchanged sample network, replays its stored run.`
    })
  })

  it('counts every guest’s free starts together, from any address or none, then refuses every guest the next', async () => {
    env.RUN_VISITOR_DAILY_CAP = '1'
    env.FREE_START_DAILY_CAP = '2'
    fakeClaude([turn(text('Nothing to rank.'))])
    const ada = await openGuest({ ip: adaIp })
    const { id } = await (await connect(ada, adaIp)).call<{ id: string }>('createLaunch', { name: 'The Night Watch' })
    const start = async (launch: Omit<Session, 'cookie'>) =>
      (await ended(launch, (await launch.call<{ runId: string }>('startLaunch', { name: 'The Night Watch' })).runId))
        .run
    const adas = await connect(ada, adaIp, id)
    expect(await start(adas)).toMatchObject({ status: 'completed' })

    // Past the day's one model run, Grace's start and a start with no address each stop at once.
    expect(await start(await connect(await openGuest({ ip: graceIp }), graceIp, id))).toMatchObject({
      status: 'stopped'
    })
    expect(await start(await connect(await openGuest(), undefined, id))).toMatchObject({ status: 'stopped' })

    const used =
      'Guests have started 2 runs today that replayed or stopped at once, the most the guest network can start in a UTC day, shared by everyone who signs in as a guest; they reset at 00:00 UTC.'
    const dots = await connect(await openGuest({ ip: dotIp }), dotIp, id)
    for (const launch of [adas, dots])
      await expect(launch.call('startLaunch', { name: 'The Night Watch' })).rejects.toThrow(used)
    expect(dots.state()!.runs.map((r) => r.status)).toEqual(['completed', 'stopped', 'stopped'])
  })

  it('counts every guest’s Qloo calls together, from any address or none, then refuses every guest the next', async () => {
    env.QLOO_VISITOR_DAILY_CALL_CAP = '3'
    fakeQloo({ search })
    fakeClaude([
      turn(toolUse('resolve_entities', { names: ['Night Shift Cinema'], type: 'urn:entity:podcast' })),
      turn(text('Night Shift Cinema is resolved.'))
    ])
    // Ada imports a show, one search; Grace searches for a comp for it, another.
    const ada = await connect(await openGuest({ ip: adaIp }), adaIp)
    await ada.importRoster('Night Shift Cinema')
    const grace = await connect(await openGuest({ ip: graceIp }), graceIp)
    await grace.searchComps('Night Shift Cinema', 'Night Ferry')
    // A launch run of a guest with no address resolves its launch: the third.
    const someone = await openGuest()
    const { id } = await (await connect(someone)).call<{ id: string }>('createLaunch', { name: 'Night Shift Cinema' })
    const launch = await connect(someone, undefined, id)
    const { runId } = await launch.call<{ runId: string }>('startLaunch', { name: 'Night Shift Cinema' })
    expect((await ended(launch, runId)).run?.status).toBe('completed')

    const used =
      'This would take guests past 3 Qloo calls today, the most the guest network can make in a UTC day, shared by everyone who signs in as a guest, cache hits included; they reset at 00:00 UTC.'
    const dot = await connect(await openGuest({ ip: dotIp }), dotIp)
    for (const guest of [ada, grace, dot]) {
      await expect(guest.call('importRoster', 'Night Shift Cinema\nNight Ferry')).rejects.toThrow(used)
      await expect(guest.call('searchComps', 'Night Shift Cinema', 'Night Ferry')).rejects.toThrow(used)
    }
    expect(dot.state()!.roster.map((show) => show.name)).toEqual(['Night Shift Cinema'])
  })

  it('counts guests’ model runs and Qloo calls toward Crossfeed’s caps across every network too', async () => {
    env.GUEST_PITCHES = 'on'
    env.RUN_DAILY_CAP = '1'
    env.QLOO_DAILY_CALL_CAP = '1'
    fakeQloo({ search })
    // The guest's inbox load reads its one pitch, which pitches no public work.
    fakeClaude([turn(text(JSON.stringify({ guest: 'Ada Quill', work: null })))])
    const guest = await connect(await openGuest({ ip: adaIp }), adaIp)
    await guest.importRoster('Night Shift Cinema')
    await guest.call('loadInbox', pitch)
    await guest.until((s) => s.inbox?.status === 'done')

    const ada = await openMember()
    const created = await ada.fetch('/app/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Night Shift Audio' })
    })
    const network = await ada.connect(`/agents/network/${(await created.json<{ id: string }>()).id}`)
    open.push(network)
    await expect(network.call('loadInbox', pitch)).rejects.toThrow(
      "Crossfeed's cap of 1 model run a day across all visitors is reached; it resets at 00:00 UTC."
    )
    expect((await network.importRoster('Night Ferry')).roster).toMatchObject([
      { resolution: 'failed', error: 'The daily cap of 1 Qloo calls is reached; it resets at 00:00 UTC' }
    ])
  })
})

describe("the guest network's daily reset", () => {
  const RESET = { code: 4410, reason: 'The guest network was cleared, as it is every day at 12:00 UTC.' }
  const health = { 'The Rewatchables': [{ entity_id: 'e-0701', name: 'The Rewatchables', popularity: 0.7 }] }
  const open: Omit<Session, 'cookie'>[] = []
  afterEach(() => open.splice(0).forEach((agent) => agent.close()))
  const connect = async (who: { connect: Guest['connect'] }, path: string) => {
    const agent = await who.connect(path)
    open.push(agent)
    return agent
  }
  // Runs the Worker's scheduled handler as Cloudflare does at the cron in wrangler.jsonc.
  async function runCron() {
    const ctx = createExecutionContext()
    await (worker as ExportedHandler<Env>).scheduled!(createScheduledController({ cron: '0 12 * * *' }), env, ctx)
    await waitOnExecutionContext(ctx)
  }
  // What launch `id`'s agent holds, once a wipe has reset it: null when it's empty.
  const launchHeld = (id: string) =>
    readAfterReset(
      async () => (await (await getAgentByName(env.LaunchAgent, `guest-network:${id}`)).state).launch?.name ?? null
    )
  // The usage the guest network's settings page shows, as its island reads it.
  const usage = async (guest: Guest) =>
    (await (await guest.fetch('/app/guest-network/settings')).text()).match(/data-usage="([^"]*)"/)?.[1]

  it('clears it at the daily cron, closing guests’ pages, so the next guest starts afresh with the day’s budget spent as it was', async () => {
    fakeQloo({
      search: {
        'Night Shift Cinema': [{ entity_id: 'e-0001', name: 'Night Shift Cinema', popularity: 0.8 }],
        // The cron's health check searches Qloo too.
        ...health
      }
    })
    const guest = await openGuest()
    const network = await connect(guest, '/agents/network/guest-network')
    await network.importRoster('Night Shift Cinema')
    await network.call('dismissChecklist')
    const { id } = await network.call<{ id: string }>('createLaunch', { name: 'The Night Watch' })
    const launch = await connect(guest, `/agents/launch/guest-network/${id}`)
    // A member's own network, which the reset leaves alone.
    const ada = await openMember()
    const own = await (
      await ada.fetch('/app/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Night Shift Audio' })
      })
    ).json<{ id: string }>()
    const theirs = await connect(ada, `/agents/network/${own.id}`)
    await theirs.call('createLaunch', { name: 'Paper Route' })
    const spent = await usage(guest)
    const logged = vi.spyOn(console, 'log')

    await runCron()

    expect(await network.closed()).toEqual(RESET)
    expect(await launch.closed()).toEqual(RESET)
    expect(logged).toHaveBeenCalledWith(JSON.stringify({ event: 'guest_network_reset', launches: 1, failed: 0 }))
    expect(await launchHeld(id)).toBeNull()
    // The guest is still signed in, and the guest network opens afresh: the sample's CPM, nothing else.
    const fresh = await readAfterReset(async () => (await getAgentByName(env.NetworkAgent, 'guest-network')).state)
    expect(fresh).toMatchObject({ cpm: 20, roster: [], launches: [], checklistDismissed: [] })
    expect((await guest.fetch(`/app/guest-network/launches/${id}`)).status).toBe(404)
    expect((await guest.fetch('/app', { redirect: 'manual' })).headers.get('location')).toBe('/app/guest-network')
    expect((await connect(guest, '/agents/network/guest-network')).state()).toMatchObject({ roster: [], launches: [] })
    expect(await usage(guest)).toBe(spent)
    expect((await (await getAgentByName(env.NetworkAgent, own.id)).state).launches).toHaveLength(1)
  })

  it('fails the cron’s run when a wipe fails, with the launch already gone from the guest network, and wipes it the next day', async () => {
    fakeQloo({ search: health })
    const guest = await openGuest()
    const { id } = await (
      await connect(guest, '/agents/network/guest-network')
    ).call<{ id: string }>('createLaunch', {
      name: 'The Night Watch'
    })
    vi.spyOn(LaunchAgent.prototype, 'destroy').mockRejectedValueOnce(new Error('The agent is overloaded.'))
    const logged = vi.spyOn(console, 'log')
    const failed = vi.spyOn(console, 'error')

    await expect(runCron()).rejects.toThrow(
      'Clearing the guest network, 1 agent wipe failed; the next daily run tries again.'
    )
    expect(logged).toHaveBeenCalledWith(JSON.stringify({ event: 'guest_network_reset', launches: 0, failed: 1 }))
    expect(failed.mock.calls.flat().filter((line) => String(line).includes('"event":"wipe_failed"'))).toHaveLength(1)
    expect((await guest.fetch(`/app/guest-network/launches/${id}`)).status).toBe(404)
    expect(await launchHeld(id)).toBe('The Night Watch')

    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 2 * 60_000)
    await runCron()
    expect(logged).toHaveBeenCalledWith(JSON.stringify({ event: 'wipes_retried', wiped: 1, kept: 0, failed: 0 }))
    expect(await launchHeld(id)).toBeNull()
  })

  it('wipes a launch planned on an open page while the guest network was being cleared', async () => {
    fakeQloo({ search: health })
    const guest = await openGuest()
    const page = await connect(guest, '/agents/network/guest-network')
    // A launch is planned on the guest network's agent, as an open page's call would, after the
    // clearing read its list and before the agent let go.
    let late = ''
    const letGo = NetworkAgent.prototype.letGo
    // Its RPC caller awaits it, so the stand-in may take a moment.
    const planThenLetGo = async function (this: NetworkAgent, reason?: string) {
      late = (await this.createLaunch({ name: 'Paper Route' })).id
      return letGo.call(this, reason)
    }
    vi.spyOn(NetworkAgent.prototype, 'letGo').mockImplementationOnce(planThenLetGo as never)

    await runCron()
    expect(await page.closed()).toEqual(RESET)
    expect(await launchHeld(late)).toBeNull()
    expect((await guest.fetch(`/app/guest-network/launches/${late}`)).status).toBe(404)
  })
})
