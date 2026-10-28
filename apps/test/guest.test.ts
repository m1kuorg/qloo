// Signing in as a guest (ADR 0008): one click, no passkey, as the one guest member, an owner of the guest
// network, with a session of one's own, through the accounts routes and the app's pages, as the sign-in
// page's "Sign in as a guest" does.
import { getAgentByName } from 'agents'
import {
  createExecutionContext,
  createScheduledController,
  evictAllDurableObjects,
  runInDurableObject,
  waitOnExecutionContext
} from 'cloudflare:test'
import { env, exports } from 'cloudflare:workers'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { State } from '../src/agent'
import type { Evidence } from '../src/evidence'
import { Invite, SignInPage } from '../src/client/Account'
import type { Session as AppSession } from '../src/client/App'
import { Dashboard } from '../src/client/Dashboard'
import { InboxLoad, InboxWorkspace } from '../src/client/Inbox'
import { globalGateway } from '../src/gateway'
import type { NetworkConnection } from '../src/client/NetworkPage'
import { NetworkRoster } from '../src/client/Roster'
import worker from '../src/index'
import { LaunchAgent } from '../src/launch-agent'
import { NetworkAgent, ownGateway } from '../src/network-agent'
import sampleInbox from '../src/sample-inbox.json'
import sampleFile from '../src/sample-network.json'
import { networkLinks } from '../src/shell'
import { fakeClaude, fakeQloo, fakeQlooDown, fakeReader, modelRequests, requests, text, toolUse, turn } from './fake'
import {
  api,
  guestFormSignIn,
  guestSignIn,
  hooked,
  openGuest,
  openMember,
  readAfterReset,
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

// Who the app's account menu says is signed in, on the account page.
const signedInAs = async (who: Pick<Guest, 'fetch'>) =>
  (await (await who.fetch('/app/account')).text()).match(/Signed in as <b\b[^>]*>([^<]*)<\/b>/)?.[1]

// A write from a guest's page, as its islands send them.
const post = (guest: Pick<Guest, 'fetch'>, path: string, body: object = {}) =>
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

// Runs the Worker's scheduled handler as Cloudflare does at the cron in wrangler.jsonc.
async function runCron() {
  const ctx = createExecutionContext()
  await (worker as ExportedHandler<Env>).scheduled!(createScheduledController({ cron: '0 12 * * *' }), env, ctx)
  await waitOnExecutionContext(ctx)
}

// Runs the hourly cron, its retry's wipes a minute old by then.
async function runHourlyCron() {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(Date.now() + 2 * 60_000)
  const ctx = createExecutionContext()
  await (worker as ExportedHandler<Env>).scheduled!(createScheduledController({ cron: '0 0-11,13-23 * * *' }), env, ctx)
  await waitOnExecutionContext(ctx)
}

describe('signing in as a guest', () => {
  it('signs every guest in as the one guest member, Guest, an owner of the guest network, each with a session of their own', async () => {
    const logged = vi.spyOn(console, 'log')
    const ada = await openGuest()
    const grace = await openGuest()
    expect(ada.cookie).toMatch(/^__Host-crossfeed_member=[\w-]{43}$/)
    expect(grace.cookie).not.toBe(ada.cookie)
    expect(ada.next).toBe('/app')

    for (const guest of [ada, grace]) {
      expect(await dashboard(guest)).toEqual({
        path: '/app/guest-network',
        page: 'dashboard',
        network: 'Guest network',
        role: 'owner',
        member: 'guest-member'
      })
      expect(await signedInAs(guest)).toBe('Guest')
    }
    expect(await guestMembers(grace)).toEqual([
      { id: 'guest-member', name: 'Guest', role: 'owner', joined: expect.any(Number) }
    ])
    expect(logged.mock.calls.filter(([line]) => line === JSON.stringify({ event: 'guest_sign_in' }))).toHaveLength(2)
  })

  it('opens the guest network at /app, whichever network any guest opened last', async () => {
    const ada = await openGuest()
    const { id } = await (await post(ada, '/app/new', { name: 'Night Shift Audio' })).json<{ id: string }>()
    expect((await ada.fetch(`/app/${id}`)).status).toBe(200)
    for (const guest of [ada, await openGuest()])
      expect(await dashboard(guest)).toMatchObject({ path: '/app/guest-network', network: 'Guest network' })
  })

  it('makes the guest member’s row again, and the guest network’s, if they’re gone', async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM members WHERE id = 'guest-member'"),
      env.DB.prepare("DELETE FROM networks WHERE id = 'guest-network'")
    ])
    expect(await dashboard(await openGuest())).toEqual({
      path: '/app/guest-network',
      page: 'dashboard',
      network: 'Guest network',
      role: 'owner',
      member: 'guest-member'
    })
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
    const perMinute = env.GUEST_SIGNINS_PER_MINUTE
    env.GUEST_SIGNINS_PER_MINUTE = '2'
    try {
      const ada = await openMember({ name: 'Ada Programmer' })
      const guest = await openGuest()
      for (const cookie of [ada.cookie, guest.cookie]) {
        const again = await guestSignIn({ cookie, next: '/app/account' })
        expect(again.status).toBe(200)
        expect(again.headers.get('set-cookie')).toBeNull()
        expect(await again.json()).toEqual({ next: '/app/account' })
        // A public page's guest button, too.
        const form = await guestFormSignIn({ cookie, next: '/app/account' })
        expect([form.status, form.headers.get('location'), form.headers.get('set-cookie')]).toEqual([
          303,
          '/app/account',
          null
        ])
      }
      // Each is still signed in as before, and none of it counted as a guest sign-in: the minute's second
      // is still there for a new guest, and the third is refused.
      expect(await signedInAs(ada)).toBe('Ada Programmer')
      expect(await signedInAs(guest)).toBe('Guest')
      expect((await guestSignIn()).status).toBe(200)
      expect((await guestSignIn()).status).toBe(429)
    } finally {
      env.GUEST_SIGNINS_PER_MINUTE = perMinute
    }
  })

  it('signs in from a public page’s plain form, with no script, and redirects with 303 to where it leads', async () => {
    const res = await guestFormSignIn()
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/app')
    expect(res.headers.get('cache-control')).toBe('no-store')
    const cookie = res.headers.get('set-cookie')?.split(';')[0]
    expect(cookie).toMatch(/^__Host-crossfeed_member=[\w-]{43}$/)
    // The browser follows it into the guest network, as its owner.
    const browser = (path: string, init?: RequestInit) =>
      exports.default.fetch(`${origin}${path}`, { ...init, headers: { Cookie: cookie! } })
    expect(await dashboard({ fetch: browser } as Guest)).toMatchObject({
      path: '/app/guest-network',
      page: 'dashboard',
      role: 'owner',
      member: expect.stringMatching(/^guest-/)
    })
    const roster = await guestFormSignIn({ next: '/app/guest-network/roster' })
    expect(roster.headers.get('location')).toBe('/app/guest-network/roster')
    expect((await guestFormSignIn({ next: '//crossfeed.example/app' })).headers.get('location')).toBe('/app')
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
    // A plain form's post says it's from one of the app's pages by its Sec-Fetch-Site, never by a bare
    // `null` Origin: not from another site, a sibling subdomain, the address bar, or a browser that
    // doesn't say.
    for (const site of ['cross-site', 'same-site', 'none', '']) {
      const res = await guestFormSignIn({ site })
      expect(res.status, site).toBe(403)
      expect(res.headers.get('set-cookie'), site).toBeNull()
    }
    // A GET, as a link or a prefetch makes, never signs in.
    expect((await exports.default.fetch(`${origin}/auth/guest`)).status).toBe(404)
    const signedIn = await guestSignIn()
    expect(signedIn.headers.get('cache-control')).toBe('no-store')
    env.ACCOUNTS = 'off'
    const off = await guestSignIn()
    expect(off.status).toBe(404)
    expect(off.headers.get('set-cookie')).toBeNull()
  })
})

describe('what no guest can change: the guest member every guest shares', () => {
  const SHARED = {
    error:
      'Everyone who signs in as a guest shares one guest account, so no guest can change it for the others. Sign out and create an account to do this.'
  }
  const refusal = async (res: Response) => [res.status, await res.json()]

  it('refuses renaming it, signing out everywhere, and deleting it, and every guest stays signed in as Guest', async () => {
    const ada = await openGuest()
    const grace = await openGuest()
    for (const [path, body] of [
      ['/app/account/name', { name: 'Ada Programmer' }],
      ['/app/account/sign-out-everywhere', {}],
      ['/app/account/delete', {}]
    ] as const)
      expect(await refusal(await post(ada, path, body)), path).toEqual([403, SHARED])
    for (const guest of [ada, grace]) expect(await signedInAs(guest)).toBe('Guest')
    expect(await guestMembers(grace)).toMatchObject([{ id: 'guest-member', name: 'Guest', role: 'owner' }])
  })

  it('refuses adding a passkey, at both requests, and a new recovery code, before any challenge is written', async () => {
    const guest = await openGuest()
    for (const [path, body] of [
      ['/auth/passkeys/options', {}],
      ['/auth/passkeys', { challenge: 'none', response: {} }],
      ['/app/account/recovery-code', {}]
    ] as const)
      expect(await refusal(await post(guest, path, body)), path).toEqual([403, SHARED])
    expect(await env.DB.prepare('SELECT count(*) AS n FROM challenges').first('n')).toBe(0)
  })

  it('refuses joining a network by invite, and leaves the link open for whoever it’s for', async () => {
    const ada = await openMember()
    const { id } = await (
      await post(ada as unknown as Guest, '/app/new', { name: 'Night Shift Audio' })
    ).json<{ id: string }>()
    const link = await ada.invite(id)
    const guest = await openGuest()
    expect(await refusal(await post(guest, '/auth/join', { token: new URL(link).hash.slice(1) }))).toEqual([
      403,
      SHARED
    ])
    expect((await guest.fetch(`/app/${id}`)).status).toBe(404)
    expect((await openMember({ name: 'Grace Booker', invite: link })).network).toBe(id)
  })

  it('refuses leaving, removing itself, or changing its own role, in the guest network and in one a guest made', async () => {
    const guest = await openGuest()
    const { id } = await (await post(guest, '/app/new', { name: 'Night Shift Audio' })).json<{ id: string }>()
    for (const network of ['guest-network', id]) {
      const members = `/app/${network}/settings/members`
      for (const [path, body] of [
        [`${members}/leave`, {}],
        [`${members}/guest-member/remove`, {}],
        [`${members}/guest-member/role`, { role: 'member' }]
      ] as const)
        expect(await refusal(await post(guest, path, body)), path).toEqual([403, SHARED])
      expect((await guest.fetch(`/app/${network}/settings`)).status).toBe(200)
    }
    expect(await guestMembers(guest)).toMatchObject([{ id: 'guest-member', role: 'owner' }])
  })

  it('refuses removing itself or changing its own role with the same reason once a co-owner with an account has made it a member', async () => {
    const guest = await openGuest()
    const members = '/app/guest-network/settings/members'
    const dot = await openMember({
      name: 'Dot Pruitt',
      invite: (await (await post(guest, `${members}/invites`)).json<{ link: string }>()).link
    })
    expect((await post(guest, `${members}/${dot.id}/role`, { role: 'owner' })).status).toBe(200)
    expect((await post(dot as unknown as Guest, `${members}/guest-member/role`, { role: 'member' })).status).toBe(200)
    for (const [path, body] of [
      [`${members}/leave`, {}],
      [`${members}/guest-member/remove`, {}],
      [`${members}/guest-member/role`, { role: 'owner' }]
    ] as const)
      expect(await refusal(await post(guest, path, body)), path).toEqual([403, SHARED])
    // Another member's membership is an owner's to change, and a network it isn't in is a 404.
    expect(await refusal(await post(guest, `${members}/${dot.id}/remove`))).toEqual([
      403,
      { error: 'Only an owner can invite and manage members.' }
    ])
    expect(
      (await post(guest, '/app/no-such-network/settings/members/guest-member/role', { role: 'owner' })).status
    ).toBe(404)
  })
})

describe('what a guest can change, as an owner', () => {
  const settings = '/app/guest-network/settings'

  it('renames the guest network and sets its CPM, for every guest', async () => {
    const ada = await openGuest()
    const grace = await openGuest()
    const renamed = await post(ada, `${settings}/network`, { name: 'Night Shift Guests', cpm: 25 })
    expect(renamed.status).toBe(200)
    expect(await renamed.json()).toEqual({ name: 'Night Shift Guests', cpm: 25 })
    expect(await dashboard(grace)).toMatchObject({ network: 'Night Shift Guests', role: 'owner' })
    expect((await grace.connect('/agents/network/guest-network')).state()).toMatchObject({ cpm: 25 })
  })

  it('invites a person, who joins as a member, changes their role, and removes them', async () => {
    const ada = await openGuest()
    const invited = await post(ada, `${settings}/members/invites`)
    expect(invited.status).toBe(200)
    const dot = await openMember({ name: 'Dot Pruitt', invite: (await invited.json<{ link: string }>()).link })
    expect(dot.network).toBe('guest-network')
    expect((await post(ada, `${settings}/members/${dot.id}/role`, { role: 'owner' })).status).toBe(200)
    expect((await guestMembers(ada)).map((m) => [m.name, m.role])).toEqual([
      ['Guest', 'owner'],
      ['Dot Pruitt', 'owner']
    ])
    expect((await post(ada, `${settings}/members/${dot.id}/role`, { role: 'member' })).status).toBe(200)
    expect((await post(ada, `${settings}/members/${dot.id}/remove`)).status).toBe(200)
    expect((await dot.fetch('/app/guest-network')).status).toBe(404)
    expect((await guestMembers(ada)).map((m) => m.name)).toEqual(['Guest'])
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

  it('creates networks, with IDs that start with guest-, which every guest owns', async () => {
    const ada = await openGuest()
    const created = await post(ada, '/app/new', { name: 'Night Shift Audio' })
    expect(created.status).toBe(200)
    const { id } = await created.json<{ id: string }>()
    expect(id).toMatch(/^guest-[0-9a-f-]{36}$/)
    for (const guest of [ada, await openGuest()]) {
      const page = await guest.fetch(`/app/${id}`)
      expect(page.status).toBe(200)
      expect(await page.text()).toMatch(/data-network-name="Night Shift Audio" data-role="owner"/)
    }
    // A member's network has no such start.
    const dot = await openMember()
    const theirs = await (
      await dot.fetch('/app/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Paper Route' })
      })
    ).json<{ id: string }>()
    expect(theirs.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('deletes the guest network for every guest, and the next guest sign-in makes it again and lands there', async () => {
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
    expect(await guestMembers(grace)).toMatchObject([{ id: 'guest-member', role: 'owner' }])
    expect((await grace.connect('/agents/network/guest-network')).state()).toMatchObject({ roster: [], launches: [] })
  })

  it('makes the guest member an owner of the guest network again as /app opens, making it again if it’s gone', async () => {
    const ada = await openGuest()
    expect((await post(ada, `${settings}/delete`, { name: 'Guest network' })).status).toBe(200)
    expect(await dashboard(ada)).toMatchObject({ path: '/app/guest-network', network: 'Guest network', role: 'owner' })
    // A member's /app takes no one in.
    const dot = await openMember()
    expect((await dot.fetch('/app', { redirect: 'manual' })).headers.get('location')).toBe('/app/new')
    expect(await guestMembers(ada)).toHaveLength(1)
  })

  it('is an owner of the guest network again, as a guest signs in or opens /app, after a co-owner with an account demotes or removes it', async () => {
    const ada = await openGuest()
    const dot = await openMember({
      name: 'Dot Pruitt',
      invite: (await (await post(ada, `${settings}/members/invites`)).json<{ link: string }>()).link
    })
    expect((await post(ada, `${settings}/members/${dot.id}/role`, { role: 'owner' })).status).toBe(200)
    const demote = () => post(dot as unknown as Guest, `${settings}/members/guest-member/role`, { role: 'member' })
    const role = async (guest: Guest) =>
      (await (await guest.fetch('/app/guest-network')).text()).match(/data-role="([^"]*)"/)?.[1]

    expect((await demote()).status).toBe(200)
    expect(await role(ada)).toBe('member')
    // The next guest's sign-in makes it an owner again, for every guest.
    const grace = await openGuest()
    expect(await role(ada)).toBe('owner')
    expect(await role(grace)).toBe('owner')

    expect((await demote()).status).toBe(200)
    expect(await dashboard(ada)).toMatchObject({ path: '/app/guest-network', role: 'owner' })

    expect((await post(dot as unknown as Guest, `${settings}/members/guest-member/remove`)).status).toBe(200)
    expect((await ada.fetch('/app/guest-network')).status).toBe(404)
    expect(await dashboard(ada)).toMatchObject({ path: '/app/guest-network', role: 'owner' })
  })
})

// A page's words, as a reader hears them.
const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// The guest network's dashboard as a guest, its owner, reads it.
const dashboardWords = (state: State) =>
  words(
    renderToStaticMarkup(
      createElement(Dashboard, {
        state,
        network: {
          id: 'guest-network',
          name: 'Guest network',
          role: 'owner',
          guestBudget: true,
          links: networkLinks(env, 'guest-network')
        },
        memberId: 'guest-member',
        setup: { invited: false, apiKey: false },
        dismiss: async () => {},
        createLaunch: async () => ({ id: 'l-1' })
      })
    )
  )

describe('the app, as a guest sees it', () => {
  // The account menu at the top bar's end, its button and its panel, the one shell menu that says who's
  // signed in.
  const accountMenu = (html: string) => hooked(html, 'data-menu').filter((menu) => menu.includes('data-signed-in'))

  it('says in the account menu that every guest shares one account, its networks and its limits, and offers signing out to create an account', async () => {
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
      const [menu, ...more] = accountMenu(html)
      expect(more, path).toEqual([])
      // No notice under the top bar: the account menu alone says it, and offers it.
      expect(html.replace(menu, ''), path).not.toMatch(/every guest shares|daily limits|create an account/)
      expect(words(menu), path).toBe(
        'G Account: Guest Signed in as Guest It’s the one account every guest shares. Guests’ networks are cleared every day at 12:00 UTC, so put nothing private in them. All guests share one set of daily limits. Your account Sign out and create an account'
      )
      // A button main.tsx wires as it does a member's Sign out, then the sign-in page, to create an account.
      expect(menu, path).toMatch(/<button\b[^>]*\sdata-sign-out[^>]*>Sign out and create an account<\/button>/)
      expect(hooked(menu, 'data-sign-out'), path).toHaveLength(1)
      expect(hooked(menu, 'data-sign-out-status'), path).toHaveLength(1)
      expect(html, path).toContain('New network')
    }
    // A member's account menu says nothing about guests.
    const ada = await openMember()
    for (const path of ['/app/new', '/app/account']) {
      const html = await (await ada.fetch(path)).text()
      const [menu] = accountMenu(html)
      expect(words(menu), path).toBe('AP Account: Ada Programmer Signed in as Ada Programmer Your account Sign out')
      expect(menu, path).toMatch(/<button\b[^>]*\sdata-sign-out[^>]*>Sign out<\/button>/)
      expect(html, path).toContain('New network')
    }
  })

  // The data attributes the server gave a page's #root.
  const root = async (who: Pick<Guest, 'fetch'>, path: string) =>
    (await (await who.fetch(path)).text()).match(/<div id="root"([^>]*)>/)![1]

  it('gives a guest the new network page a member gets', async () => {
    const ada = await openMember()
    expect(await root(await openGuest(), '/app/new')).toBe(await root(ada, '/app/new'))
    expect(await root(ada, '/app/new')).toBe(' data-page="new-network" data-cap="3"')
  })

  // The invite page for `link`, as main.tsx renders it from the server's data attributes, once it has
  // posted the link's token to /auth/invite, as the page does, with the answer.
  async function invitePage(visitor: Pick<Guest, 'fetch'>, link: string) {
    const attributes = await root(visitor, '/invite')
    const token = new URL(link).hash.slice(1)
    const answer = await visitor.fetch('/auth/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    })
    return renderToStaticMarkup(
      createElement(Invite, {
        token,
        invite: await answer.json<{ network: string; clearedDaily: boolean } | { error: string }>(),
        memberName: attributes.match(/data-member-name="([^"]*)"/)?.[1] ?? null,
        guestMember: attributes.includes('data-guest-member="true"')
      })
    )
  }

  it('tells a guest who opens an invite link to sign out and create an account to join, and offers a member Join', async () => {
    const ada = await openMember()
    const network = await ada.fetch('/app/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Night Shift Audio' })
    })
    const link = await ada.invite((await network.json<{ id: string }>()).id)
    expect(words(await invitePage(ada, link))).toContain('Join Night Shift Audio Not Ada Programmer? Sign out')
    const asGuest = await invitePage(await openGuest(), link)
    expect(words(asGuest)).toContain(
      'You’re signed in as Guest, the one account every guest shares, which can’t join a network. Sign out and create an account to join Night Shift Audio. Sign out and create an account'
    )
    expect(asGuest).not.toMatch(/<button\b[^>]*>Join Night Shift Audio<\/button>/)
  })

  const CLEARED =
    'Night Shift Audio belongs to the guest account every guest shares, so it’s cleared, with everything in it, every day at 12:00 UTC.'

  it('tells whoever opens an invite to a network only guests own that it’s cleared every day, until an account owns it too', async () => {
    const guest = await openGuest()
    const { id } = await (await post(guest, '/app/new', { name: 'Night Shift Audio' })).json<{ id: string }>()
    const link = async (network: string) =>
      (await (await post(guest, `/app/${network}/settings/members/invites`)).json<{ link: string }>()).link
    const ada = await openMember()
    // A browser no one is signed in on, whose page's writes send the app's Origin.
    const signedOut = {
      fetch: (path: string, init: RequestInit = {}) =>
        exports.default.fetch(`${origin}${path}`, { ...init, headers: { ...init.headers, Origin: origin } })
    }
    expect(words(await invitePage(ada, await link(id)))).toContain(`Join Night Shift Audio You’re invited to`)
    expect(words(await invitePage(ada, await link(id)))).toContain(CLEARED)
    expect(words(await invitePage(signedOut, await link(id)))).toContain(CLEARED)

    // Once a member with an account owns it too, it stays.
    const dot = await openMember({ name: 'Dot Pruitt', invite: await link(id) })
    expect((await post(guest, `/app/${id}/settings/members/${dot.id}/role`, { role: 'owner' })).status).toBe(200)
    expect(words(await invitePage(ada, await link(id)))).not.toContain('cleared')
  })

  it('tells whoever opens an invite to the guest network that it’s cleared every day, whoever else owns it', async () => {
    const guest = await openGuest()
    const link = async () =>
      (await (await post(guest, '/app/guest-network/settings/members/invites')).json<{ link: string }>()).link
    const ada = await openMember()
    const cleared =
      'Guest network belongs to the guest account every guest shares, so it’s cleared, with everything in it, every day at 12:00 UTC.'
    expect(words(await invitePage(ada, await link()))).toContain(cleared)
    const dot = await openMember({ name: 'Dot Pruitt', invite: await link() })
    expect((await post(guest, `/app/guest-network/settings/members/${dot.id}/role`, { role: 'owner' })).status).toBe(
      200
    )
    expect(words(await invitePage(ada, await link()))).toContain(cleared)
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

describe('the guest network, with the sample network on (ADR 0007)', () => {
  // Made-up IDs for three of the sample's public show names; every other name finds nothing.
  const search = {
    'The Watch': [{ entity_id: 'e-0601', name: 'The Watch', popularity: 0.5 }],
    'The Big Picture': [{ entity_id: 'e-0301', name: 'The Big Picture', popularity: 0.6 }],
    'The Rewatchables': [{ entity_id: 'e-0201', name: 'The Rewatchables', popularity: 0.7 }]
  }
  const names = sampleFile.shows.map((s) => s.name)
  const saved = { SAMPLE_NETWORK: env.SAMPLE_NETWORK, QLOO_VISITOR_DAILY_CALL_CAP: env.QLOO_VISITOR_DAILY_CALL_CAP }
  const open: Omit<Session, 'cookie'>[] = []
  beforeEach(() => {
    env.SAMPLE_NETWORK = 'on'
  })
  afterEach(() => {
    Object.assign(env, saved)
    open.splice(0).forEach((agent) => agent.close())
  })
  const connect = async (guest: Guest, path = '/agents/network/guest-network') => {
    const agent = await guest.connect(path)
    open.push(agent)
    return agent
  }
  const settled = (s: State) => s.roster.length > 0 && s.roster.every((show) => show.resolution !== 'pending')
  // The Qloo calls the guest budget has spent today, as the guest network's settings page says.
  const qlooCalls = async (guest: Guest) =>
    (
      JSON.parse(
        (await (await guest.fetch('/app/guest-network/settings')).text())
          .match(/data-usage="([^"]*)"/)![1]
          .replace(/&quot;/g, '"')
      ) as { qlooCalls: { used: number } }
    ).qlooCalls.used

  it('opens on its first start with the sample roster and its labels, the sample CPM labelled, and The Watch planned', async () => {
    fakeQloo({ search })
    const guest = await openGuest()
    const state = await (await connect(guest)).until(settled)

    expect(state.roster.map((r) => [r.name, r.downloads, r.status, r.description, r.sample])).toEqual(
      sampleFile.shows.map((r) => [
        r.name,
        r.downloadsPerEpisode.value,
        r.status.value,
        r.description.value,
        ['downloads', 'status', 'description']
      ])
    )
    expect(state.roster.find((r) => r.name === 'The Watch')).toMatchObject({
      resolution: 'resolved',
      entity: { id: 'e-0601' }
    })
    expect(state.cpm).toBe(20)
    // The dashboard labels the CPM as the sample's, as the roster page does each show's figures.
    expect(dashboardWords(state)).toContain('CPM $20 per 1,000 downloads sample Change')
    expect(state.sample).toEqual({
      network: 'The Ringer',
      notice: sampleFile.notice,
      launch: { name: 'The Watch' },
      answers: { budget: { slots: 20 }, exclusions: [] },
      cpm: true
    })
    expect(state.launches).toEqual([
      {
        id: expect.any(String),
        name: 'The Watch',
        comps: [],
        status: 'new',
        finalists: 0,
        slots: null,
        slotValue: null,
        startedBy: null,
        lastRun: null
      }
    ])
    // One search a show, counted on the guest budget; planning The Watch calls nothing.
    expect(requests.map((r) => r.url.searchParams.get('query')).sort()).toEqual([...names].sort())
    expect(await qlooCalls(guest)).toBe(19)
  })

  it('opens empty, with the sample CPM labelled and The Watch planned, when the guest budget refuses its lookups, and tries again as it next starts', async () => {
    fakeQloo({ search })
    env.QLOO_VISITOR_DAILY_CALL_CAP = '18'
    const guest = await openGuest()
    const refused = (await connect(guest)).state()!
    // The CPM and the plan call nothing, so the guest budget refuses neither.
    expect(refused).toMatchObject({
      roster: [],
      cpm: 20,
      sample: { network: 'The Ringer', cpm: true },
      launches: [{ name: 'The Watch', status: 'new' }]
    })
    expect(refused.launches).toHaveLength(1)
    expect(requests).toEqual([])
    const page = renderToStaticMarkup(
      createElement(NetworkRoster, { agent: { state: refused, stub: {} } as unknown as NetworkConnection })
    )
    // Nothing to start from but the roster's import: the next start tries the lookups again.
    expect(
      page
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    ).toBe('Roster No shows yet. Import shows')
    expect(dashboardWords(refused)).toContain('CPM $20 per 1,000 downloads sample Change')

    // As after an idle eviction or a deploy: the agent starts again, with its storage.
    env.QLOO_VISITOR_DAILY_CALL_CAP = saved.QLOO_VISITOR_DAILY_CALL_CAP
    await evictAllDurableObjects({ webSockets: 'close' })
    const loaded = await (await connect(guest)).until(settled)
    expect(loaded).toMatchObject({ cpm: 20, sample: { cpm: true }, launches: [{ name: 'The Watch' }] })
    expect(loaded.launches).toEqual(refused.launches)
    expect(loaded.roster).toHaveLength(19)
  })

  it('keeps a CPM a guest set while its lookups were refused, unlabelled, as the sample loads on a later start', async () => {
    fakeQloo({ search })
    env.QLOO_VISITOR_DAILY_CALL_CAP = '18'
    const guest = await openGuest()
    await connect(guest)
    expect((await post(guest, '/app/guest-network/settings/network', { name: 'Guest network', cpm: 25 })).status).toBe(
      200
    )

    env.QLOO_VISITOR_DAILY_CALL_CAP = saved.QLOO_VISITOR_DAILY_CALL_CAP
    await evictAllDurableObjects({ webSockets: 'close' })
    const loaded = await (await connect(guest)).until(settled)
    expect(loaded).toMatchObject({ cpm: 25, sample: { cpm: false }, launches: [{ name: 'The Watch' }] })
    expect(loaded.roster).toHaveLength(19)
  })

  it('looks up the shows that failed and plans The Watch if planning failed, as it next starts, then loads nothing again', async () => {
    fakeQlooDown()
    vi.spyOn(LaunchAgent.prototype, 'plan').mockRejectedValueOnce(new Error('The agent is overloaded.'))
    const guest = await openGuest()
    const failed = await (await connect(guest)).until(settled)
    expect(failed.roster.map((s) => s.resolution)).toEqual(names.map(() => 'failed'))
    expect(failed.launches).toEqual([])

    fakeQloo({ search })
    const restart = async () => {
      await evictAllDurableObjects({ webSockets: 'close' })
      return connect(guest)
    }
    const network = await restart()
    const retried = await network.until((s) => s.roster.every((r) => !['pending', 'failed'].includes(r.resolution)))
    expect(retried.roster.find((r) => r.name === 'The Watch')).toMatchObject({ resolution: 'resolved' })
    expect(retried.roster.map((r) => r.sample)).toEqual(names.map(() => ['downloads', 'status', 'description']))
    expect(retried.launches).toMatchObject([{ name: 'The Watch' }])

    // A guest's change stays, start after start, and nothing is looked up or planned again.
    await network.call('updateShow', 'The Watch', { downloads: 12_345 })
    const sent = requests.length
    await restart()
    const again = (await restart()).state()!
    expect(again.roster.find((r) => r.name === 'The Watch')).toMatchObject({
      downloads: 12_345,
      sample: ['status', 'description']
    })
    expect(again.launches).toHaveLength(1)
    expect(requests).toHaveLength(sent)
  })

  it('starts no sample load as the daily cron clears it, before it has loaded one, and loads it on the next start', async () => {
    fakeQloo({ search })
    const guest = await openGuest()
    // The guest budget's Qloo calls today. An earlier test's can outlast the storage reset after it, so
    // this counts from what it finds.
    const used = async () => (await globalGateway(env).usage('network:guest-network')).qlooCalls.used
    const before = await used()

    await runCron()
    // Reserved for the sample's lookups, the guest budget would have spent them.
    expect(await used()).toBe(before)
    const loaded = await (await connect(guest)).until(settled)
    expect(loaded.launches).toMatchObject([{ name: 'The Watch' }])
    expect(await used()).toBe(before + 19)
  })

  it('loads the sample again as it next starts after the daily cron clears it', async () => {
    fakeQloo({ search })
    const guest = await openGuest()
    const network = await connect(guest)
    await network.until(settled)
    await network.call('updateShow', 'The Watch', { downloads: 12_345 })
    const [cleared] = network.state()!.launches!

    await runCron()
    await network.closed()
    await readAfterReset(async () => (await getAgentByName(env.NetworkAgent, 'guest-network')).state)
    const fresh = await (await connect(guest)).until(settled)
    expect(fresh.roster.find((r) => r.name === 'The Watch')).toMatchObject({
      downloads: 340_000,
      sample: ['downloads', 'status', 'description']
    })
    expect(fresh).toMatchObject({ cpm: 20, sample: { cpm: true }, launches: [{ name: 'The Watch', status: 'new' }] })
    expect(fresh.launches![0].id).not.toBe(cleared.id)
  })

  it('loads the sample again as it next starts after a guest resets the sample data, with what guests changed gone', async () => {
    fakeQloo({ search })
    const guest = await openGuest()
    const network = await connect(guest)
    await network.until(settled)
    await network.call('updateShow', 'The Watch', { downloads: 12_345 })
    expect(
      (await post(guest, '/app/guest-network/settings/network', { name: 'Night Shift Guests', cpm: 25 })).status
    ).toBe(200)
    await network.call('createLaunch', { name: 'The Night Watch' })
    const [, watch] = network.state()!.launches!

    expect((await post(guest, '/app/guest-network/settings/sample-data/reset')).status).toBe(200)
    await network.closed()
    await readAfterReset(async () => (await getAgentByName(env.NetworkAgent, 'guest-network')).state)
    const fresh = await (await connect(guest)).until(settled)
    expect(fresh.roster.find((r) => r.name === 'The Watch')).toMatchObject({
      downloads: 340_000,
      sample: ['downloads', 'status', 'description']
    })
    expect(fresh).toMatchObject({ cpm: 20, sample: { cpm: true }, launches: [{ name: 'The Watch', status: 'new' }] })
    expect(fresh.launches).toHaveLength(1)
    expect(fresh.launches![0].id).not.toBe(watch.id)
    const page = await (await guest.fetch('/app/guest-network/settings')).text()
    expect(page.match(/data-network-name="([^"]*)"/)?.[1]).toBe('Guest network')
  })

  describe('and guest pitches on', () => {
    // Made-up IDs for each work the sample inbox pitches, matched by its title and year.
    const works = sampleInbox.pitches.flatMap((p) => (p.expected.work ? [{ pitch: p.id, ...p.expected.work }] : []))
    const workSearch = Object.fromEntries(
      works.map((w) => [
        w.title,
        [{ entity_id: `w-${w.pitch}`, name: w.title, popularity: 0.5, disambiguation: String(w.year) }]
      ])
    )
    beforeEach(() => {
      env.GUEST_PITCHES = 'on'
    })
    afterEach(() => {
      env.GUEST_PITCHES = 'off'
    })
    const loaded = (s: State) => settled(s) && s.inbox?.status === 'done'
    const usage = () => globalGateway(env).usage('network:guest-network')

    it('opens with the sample inbox: The Big Picture and its past guests, 36 works looked up and 4 set aside, calling no model', async () => {
      fakeQloo({ search: { ...search, ...workSearch } })
      fakeClaude([])
      // The guest budget's use today. An earlier test's can outlast the storage reset after it, so this
      // counts from what it finds.
      const before = await usage()
      const guest = await openGuest()
      const network = await connect(guest)
      const { inbox } = await network.until(loaded)

      expect(inbox).toMatchObject({ sample: true, notice: sampleInbox.notice, show: { name: 'The Big Picture' } })
      expect(inbox!.show!.pastGuests).toHaveLength(3)
      expect(inbox!.show!.pastGuests[0]).toEqual({
        guest: 'Paul Thomas Anderson',
        work: { title: 'One Battle After Another', type: 'film', year: 2025 }
      })
      // Each pitch already read, from its answer key: the 36 with a work matched in Qloo, the 4 without
      // set aside unsearched.
      const { pitches } = inbox!
      expect(pitches).toHaveLength(40)
      expect(pitches.filter((p) => p.status === 'read' && p.match?.resolution === 'resolved')).toHaveLength(36)
      expect(pitches.filter((p) => p.status === 'no_work').map((p) => [p.id, p.work, p.match])).toEqual([
        ['pitch-03', null, null],
        ['pitch-12', null, null],
        ['pitch-21', null, null],
        ['pitch-37', null, null]
      ])
      expect(pitches.find((p) => p.id === 'pitch-01')).toMatchObject({
        from: 'Maren Ostrowski <maren.ostrowski@example.com>',
        subject: "John Green's first novel for adults, Hollywood, Ending",
        status: 'read',
        guest: 'John Green',
        work: { title: 'Hollywood, Ending', type: 'book', year: 2026 },
        match: { entity: { id: 'w-pitch-01' } }
      })
      // Worded as off-topic, it still comes read as the work it pitches.
      expect(pitches.find((p) => p.id === 'pitch-04')).toMatchObject({
        status: 'read',
        guest: 'Nathan Fielder',
        work: { title: 'The Rehearsal', type: 'tv_show', year: 2022 },
        match: { entity: { id: 'w-pitch-04' } }
      })
      expect(modelRequests()).toEqual([])
      const queries = requests.map((r) => r.url.searchParams.get('query'))
      expect(queries.toSorted()).toEqual([...names, ...works.map((w) => w.title)].toSorted())
      // Reserved on the guest budget, a call a show and a work, and no model run counted.
      const after = await usage()
      expect(after.qlooCalls.used - before.qlooCalls.used).toBe(19 + 36)
      expect(after.modelRuns.used).toBe(before.modelRuns.used)
      // Each lookup keeps its evidence, numbered after the roster's, in the inbox's order.
      const evidence = await network.call<Evidence[]>('getEvidence')
      const searched = inbox!.pitches.filter((p) => p.work)
      expect(searched.map((p) => p.match!.evidence)).toEqual(searched.map((_, i) => `C-${20 + i}`))
      for (const p of searched)
        expect(evidence.find((e) => e.call === p.match!.evidence)).toMatchObject({
          endpoint: '/search',
          params: { query: p.work!.title },
          error: null
        })
    })

    it('says the sample’s works are looked up, not its pitches read, while its lookups are out', async () => {
      // A first start looks up the roster, with no room left for the inbox, so the next looks up only the
      // inbox's works, held until the test has seen them out.
      fakeQloo({ search: { ...search, ...workSearch } })
      env.QLOO_VISITOR_DAILY_CALL_CAP = String((await usage()).qlooCalls.used + 19 + 35)
      const guest = await openGuest()
      await (await connect(guest)).until(settled)
      env.QLOO_VISITOR_DAILY_CALL_CAP = saved.QLOO_VISITOR_DAILY_CALL_CAP
      const held = Promise.withResolvers<void>()
      fakeQloo({ search: { ...search, ...workSearch }, held: held.promise })
      await evictAllDurableObjects({ webSockets: 'close' })
      const network = await connect(guest)
      const page = (state: State) =>
        words(
          renderToStaticMarkup(
            createElement(InboxWorkspace, {
              agent: { state, stub: {} } as unknown as AppSession,
              links: { roster: networkLinks(env, 'guest-network').roster }
            })
          )
        )

      const looking = page(await network.until((s) => s.inbox?.status === 'reading'))
      // The header counts the pitches settled so far, and the readout how many works are looked up, so
      // neither says the other's count; the table says they came already read.
      expect(looking).toMatch(
        /^Inbox 40 pitches for The Big Picture · 4 set aside Details Load pitches Looking up · 0 of 36 works looked up /
      )
      expect(looking).toContain('sample Guest and work as the sample gives them for each pitch.')
      expect(looking).toContain('Rank them once every work is looked up.')
      // The sheet's form, which loads another inbox in its place, waits for the lookups.
      expect(
        words(
          renderToStaticMarkup(
            createElement(InboxLoad, { loadInbox: async () => {}, reading: true, sample: true, wipes: false })
          )
        )
      ).toContain('Looking up the sample’s works…')
      expect(looking).toContain('36 still looking up')
      expect(looking).not.toContain('Reading')
      expect(looking).not.toContain('pitch is read')

      held.resolve()
      expect(page(await network.until(loaded))).toMatch(
        /^Inbox 40 pitches for The Big Picture · 36 matched, 4 set aside Details Load pitches Read Rank against /
      )
    })

    it('tries again as it next starts the lookups the guest budget refused, then those Qloo failed, then loads nothing again', async () => {
      fakeQloo({ search: { ...search, ...workSearch } })
      fakeClaude([])
      const restart = async () => {
        await evictAllDurableObjects({ webSockets: 'close' })
        return connect(guest)
      }
      // Room for the roster's lookups, but not the inbox's: it stays empty.
      env.QLOO_VISITOR_DAILY_CALL_CAP = String((await usage()).qlooCalls.used + 19 + 35)
      const guest = await openGuest()
      const refused = await (await connect(guest)).until(settled)
      expect(refused.inbox).toBeNull()

      env.QLOO_VISITOR_DAILY_CALL_CAP = saved.QLOO_VISITOR_DAILY_CALL_CAP
      fakeQlooDown()
      const failed = await (await restart()).until((s) => s.inbox?.status === 'done')
      expect(failed.inbox!.pitches.map((p) => p.match?.resolution ?? p.status)).toEqual(
        sampleInbox.pitches.map((p) => (p.expected.work ? 'failed' : 'no_work'))
      )

      fakeQloo({ search: { ...search, ...workSearch } })
      const sent = requests.length
      const network = await restart()
      const retried = await network.until((s) => s.inbox?.status === 'done')
      expect(retried.inbox!.id).toBe(failed.inbox!.id)
      expect(retried.inbox!.pitches.map((p) => p.match?.entity?.id)).toEqual(
        sampleInbox.pitches.map((p) => (p.expected.work ? `w-${p.id}` : undefined))
      )
      const queries = requests.slice(sent).map((r) => r.url.searchParams.get('query'))
      expect(queries.toSorted()).toEqual(works.map((w) => w.title).toSorted())

      const settledAt = requests.length
      const spent = (await usage()).qlooCalls.used
      expect((await restart()).state()!.inbox).toEqual(retried.inbox)
      expect(requests).toHaveLength(settledAt)
      expect((await usage()).qlooCalls.used).toBe(spent)
      expect(modelRequests()).toEqual([])
    })

    it('says a lookup a deploy interrupted is tried again later, not to load the inbox again, and tries it as it next starts', async () => {
      fakeQloo({ search: { ...search, ...workSearch } })
      const guest = await openGuest()
      await (await connect(guest)).until(loaded)
      // Stand in for an agent a deploy stopped mid-load: its inbox still reading, each work's lookup out.
      // Then restart it, as the deploy does, with no guest budget left to try them again.
      const agent = env.NetworkAgent.get(env.NetworkAgent.idFromName('guest-network'))
      await runInDurableObject(agent, (network: NetworkAgent) => {
        const inbox = network.state.inbox!
        const out = inbox.pitches.map((p) => (p.work ? { ...p, status: 'looking_up' as const, match: null } : p))
        network.setState({ ...network.state, inbox: { ...inbox, status: 'reading', pitches: out } })
      })
      env.QLOO_VISITOR_DAILY_CALL_CAP = String((await usage()).qlooCalls.used)
      await evictAllDurableObjects({ webSockets: 'close' })
      const interrupted = (await connect(guest)).state()!.inbox!
      expect(interrupted.status).toBe('done')
      expect(interrupted.pitches.map((p) => [p.status, p.error])).toEqual(
        sampleInbox.pitches.map((p) =>
          p.expected.work
            ? ['failed', 'The lookup was interrupted. Crossfeed tries it again later.']
            : ['no_work', null]
        )
      )

      env.QLOO_VISITOR_DAILY_CALL_CAP = saved.QLOO_VISITOR_DAILY_CALL_CAP
      await evictAllDurableObjects({ webSockets: 'close' })
      const retried = await (await connect(guest)).until(loaded)
      expect(retried.inbox!.pitches.map((p) => [p.status, p.match?.entity?.id])).toEqual(
        sampleInbox.pitches.map((p) => (p.expected.work ? ['read', `w-${p.id}`] : ['no_work', undefined]))
      )
    })

    it('looks up nothing again once a pitch run has started on it, so the run’s results keep naming its pitches as they were', async () => {
      // Qloo fails the first pitch's work, Hollywood, Ending.
      fakeQloo({ search: { ...search, ...workSearch, 'Hollywood, Ending': 503 } })
      fakeClaude([turn(text('Nothing to rank.'))])
      const guest = await openGuest()
      const network = await connect(guest)
      const failed = await network.until(loaded)
      expect(failed.inbox!.pitches[0]).toMatchObject({ id: 'pitch-01', match: { resolution: 'failed' } })
      const { runId } = await network.call<{ runId: string }>('startPitches', {
        show: 'The Big Picture',
        pastGuests: []
      })
      const ran = await network.until((s) => s.run?.id === runId && s.run.status !== 'running')
      expect(ran.booking).toMatchObject({ run: runId, show: { name: 'The Big Picture' } })

      fakeQloo({ search: { ...search, ...workSearch } })
      const sent = requests.length
      await evictAllDurableObjects({ webSockets: 'close' })
      const after = (await connect(guest)).state()!
      expect(after.inbox).toEqual(ran.inbox)
      expect(after.booking).toEqual(ran.booking)
      expect(requests).toHaveLength(sent)
    })

    // A guest's own pitch, read by the scripted model, and its work's made-up match.
    const own = 'Ada Quill on her novel Night Ferry.'
    const ownSearch = { 'Night Ferry': [{ entity_id: 'w-own', name: 'Night Ferry', popularity: 0.4 }] }
    const readOwn = () =>
      fakeReader(1, () => ({ guest: 'Ada Quill', work: { title: 'Night Ferry', type: 'book', year: null } }))

    it("keeps a guest's own pitches, loaded over it, start after start, until the daily cron clears it and it loads again", async () => {
      fakeQloo({ search: { ...search, ...workSearch, ...ownSearch } })
      readOwn()
      const guest = await openGuest()
      const network = await connect(guest)
      const sample = (await network.until(loaded)).inbox!
      await network.call('loadInbox', { text: own })
      const loadedOwn = (await network.until((s) => s.inbox?.status === 'done')).inbox!
      expect(loadedOwn).toMatchObject({ sample: false, pitches: [{ body: own, match: { entity: { id: 'w-own' } } }] })

      const sent = requests.length
      for (let i = 0; i < 2; i++) await evictAllDurableObjects({ webSockets: 'close' })
      expect((await connect(guest)).state()!.inbox).toEqual(loadedOwn)
      expect(requests).toHaveLength(sent)

      await runCron()
      await readAfterReset(async () => (await getAgentByName(env.NetworkAgent, 'guest-network')).state)
      const fresh = (await (await connect(guest)).until(loaded)).inbox!
      expect(fresh).toMatchObject({ sample: true, show: { name: 'The Big Picture' } })
      expect(fresh.id).not.toBe(sample.id)
      expect(fresh.pitches.map((p) => p.match?.entity?.id)).toEqual(sample.pitches.map((p) => p.match?.entity?.id))
    })

    it("loads the sample inbox again over a guest's own pitches after a guest resets the sample data", async () => {
      fakeQloo({ search: { ...search, ...workSearch, ...ownSearch } })
      readOwn()
      const guest = await openGuest()
      const network = await connect(guest)
      const sample = (await network.until(loaded)).inbox!
      await network.call('loadInbox', { text: own })
      await network.until((s) => s.inbox?.status === 'done' && !s.inbox.sample)

      expect((await post(guest, '/app/guest-network/settings/sample-data/reset')).status).toBe(200)
      await network.closed()
      await readAfterReset(async () => (await getAgentByName(env.NetworkAgent, 'guest-network')).state)
      const fresh = (await (await connect(guest)).until(loaded)).inbox!
      expect(fresh).toMatchObject({ sample: true, show: { name: 'The Big Picture' } })
      expect(fresh.pitches.map((p) => p.match?.entity?.id)).toEqual(sample.pitches.map((p) => p.match?.entity?.id))
    })

    it('starts no sample inbox load as the daily cron clears it, before it has loaded one, and loads it on the next start', async () => {
      fakeQloo({ search: { ...search, ...workSearch } })
      const guest = await openGuest()
      const before = (await usage()).qlooCalls.used

      await runCron()
      // Reserved for the sample's lookups, the guest budget would have spent them.
      expect((await usage()).qlooCalls.used).toBe(before)
      expect((await (await connect(guest)).until(loaded)).inbox).toMatchObject({ sample: true })
      expect((await usage()).qlooCalls.used).toBe(before + 19 + 36)
    })

    it('gives a program the sample’s notice through the API, saying its pitches came already read, and loads over it only to replace it', async () => {
      fakeQloo({ search: { ...search, ...workSearch } })
      const guest = await openGuest()
      await (await connect(guest)).until(loaded)
      const made = await post(guest, '/app/guest-network/settings/api-keys', { name: 'Nightly sync' })
      const call = api((await made.json<{ secret: string }>()).secret)

      const inbox = await (await call('/api/v1/networks/guest-network/inbox')).json<{ sample: { notice: string } }>()
      expect(inbox).toMatchObject({ status: 'done', sample: { notice: sampleInbox.notice } })
      expect(inbox.sample.notice).toMatch(/Each pitch comes already read, .*so no model reads it\.$/)
      expect(inbox.sample.notice).not.toContain('extraction')
      const over = await call('/api/v1/networks/guest-network/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pitches: [{ body: 'Ada Quill on her novel Night Ferry.' }] })
      })
      expect(over.status).toBe(409)
      expect(await over.json()).toEqual({
        error: {
          code: 'conflict',
          message:
            "The inbox already has pitches. Load with replace=true to load over them: they go, with the last pitch run's lists and replies."
        }
      })
    })

    it("never replaces a guest's own pitches, loaded while the guest budget refused its lookups, nor looks them up again", async () => {
      // Qloo fails the guest's own lookup, which isn't the sample's to try again.
      fakeQloo({ search: { ...search, ...workSearch, 'Night Ferry': 503 } })
      readOwn()
      env.QLOO_VISITOR_DAILY_CALL_CAP = String((await usage()).qlooCalls.used + 19 + 35)
      const guest = await openGuest()
      const network = await connect(guest)
      expect((await network.until(settled)).inbox).toBeNull()
      await network.call('loadInbox', { text: own })
      const loadedOwn = (await network.until((s) => s.inbox?.status === 'done')).inbox!
      expect(loadedOwn).toMatchObject({ sample: false, pitches: [{ match: { resolution: 'failed' } }] })

      env.QLOO_VISITOR_DAILY_CALL_CAP = saved.QLOO_VISITOR_DAILY_CALL_CAP
      const sent = requests.length
      const spent = (await usage()).qlooCalls.used
      await evictAllDurableObjects({ webSockets: 'close' })
      expect((await connect(guest)).state()!.inbox).toEqual(loadedOwn)
      expect(requests).toHaveLength(sent)
      expect((await usage()).qlooCalls.used).toBe(spent)
    })
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

  it('sends a refused plain form back to the sign-in page’s guest panel, which says why', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const start = Date.now()
    // The guest panel of the sign-in page a refused form's redirect opens, in words.
    const panel = async (refused: Response) => {
      expect(refused.status).toBe(303)
      expect(refused.headers.get('set-cookie')).toBeNull()
      const page = await (await exports.default.fetch(`${origin}${refused.headers.get('location')}`)).text()
      const attr = (name: string) => page.match(new RegExp(`data-${name}="([^"]*)"`))?.[1]
      const html = renderToStaticMarkup(
        createElement(SignInPage, {
          next: attr('next')!,
          runs: Number(attr('runs')),
          guestRefused: attr('guest-refused')
        })
      )
      const section = html.match(/<section\b[^>]*\bid="guest"[\s\S]*?<\/section>/)?.[0] ?? ''
      return { next: attr('next'), words: section.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') }
    }
    for (let i = 0; i < 30; i++) expect((await guestSignIn()).status).toBe(200)
    const busy = await guestFormSignIn({ next: '/app/guest-network/roster' })
    expect(busy.headers.get('location')).toBe('/sign-in?guest=minute&next=%2Fapp%2Fguest-network%2Froster#guest')
    expect(await panel(busy)).toEqual({ next: '/app/guest-network/roster', words: expect.stringContaining(BUSY.error) })

    // A minute on, past the day's sign-ins instead.
    const perDay = env.GUEST_SIGNINS_PER_DAY
    env.GUEST_SIGNINS_PER_DAY = '30'
    try {
      vi.setSystemTime(start + 60_000)
      expect((await panel(await guestFormSignIn())).words).toContain(
        'Guests have signed in 30 times today, the most Crossfeed takes in a UTC day; it resets at 00:00 UTC. Create an account to sign in now.'
      )
    } finally {
      env.GUEST_SIGNINS_PER_DAY = perDay
    }
    // The sign-in page itself, or with a word it doesn't know, says nothing of it.
    for (const path of ['/sign-in', '/sign-in?guest=other'])
      expect(await (await exports.default.fetch(`${origin}${path}`)).text(), path).not.toContain('data-guest-refused')
  })

  it('counts exactly, so two sign-ins at once for the last place leave one refused', async () => {
    for (let i = 0; i < 29; i++) expect((await guestSignIn()).status).toBe(200)
    const both = await Promise.all([guestSignIn({ ip: '203.0.113.7' }), guestSignIn({ ip: '198.51.100.4' })])
    expect(both.map((res) => res.status).sort()).toEqual([200, 429])
  })
})

describe('the guest budget', () => {
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
      'Guests have started 3 model runs today, the most all guests together can start in a UTC day, in the guest network and the networks guests create; they reset at 00:00 UTC'
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
      'Guests have started 2 runs today that replayed or stopped at once, the most all guests together can start in a UTC day, in the guest network and the networks guests create; they reset at 00:00 UTC.'
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
      'This would take guests past 3 Qloo calls today, the most all guests together can make in a UTC day, in the guest network and the networks guests create, cache hits included; they reset at 00:00 UTC.'
    const dot = await connect(await openGuest({ ip: dotIp }), dotIp)
    for (const guest of [ada, grace, dot]) {
      await expect(guest.call('importRoster', 'Night Shift Cinema\nNight Ferry')).rejects.toThrow(used)
      await expect(guest.call('searchComps', 'Night Shift Cinema', 'Night Ferry')).rejects.toThrow(used)
    }
    expect(dot.state()!.roster.map((show) => show.name)).toEqual(['Night Shift Cinema'])
  })

  // A network guest member `guest` creates, as /app/new does.
  const created = async (guest: Guest, name: string) =>
    (await (await post(guest, '/app/new', { name })).json<{ id: string }>()).id
  // The usage a network's settings page gives its island.
  const usageOf = async (who: Pick<Guest, 'fetch'>, id: string) =>
    JSON.parse(
      (await (await who.fetch(`/app/${id}/settings`)).text()).match(/data-usage="([^"]*)"/)![1].replace(/&quot;/g, '"')
    ) as { modelRuns: { used: number }; qlooCalls: { used: number } }

  it('counts a guest’s own networks with the guest network, then refuses every guest in each, and leaves a member’s network apart', async () => {
    env.RUN_VISITOR_DAILY_CAP = '2'
    fakeClaude([turn(text('Nothing to rank.')), turn(text('Nothing to rank.')), turn(text('Nothing to rank.'))])
    const runIn = async (who: Pick<Guest, 'connect'>, network: string, ip?: string) => {
      const agent = await who.connect(`/agents/network/${network}`, ip ? { 'CF-Connecting-IP': ip } : {})
      open.push(agent)
      const { id } = await agent.call<{ id: string }>('createLaunch', { name: 'The Night Watch' })
      const launch = await who.connect(`/agents/launch/${network}/${id}`, ip ? { 'CF-Connecting-IP': ip } : {})
      open.push(launch)
      return (
        await ended(launch, (await launch.call<{ runId: string }>('startLaunch', { name: 'The Night Watch' })).runId)
      ).run
    }
    // Ada runs one in a network of her own, and Grace one in the guest network, each from an address of
    // their own: the guest budget's two.
    const ada = await openGuest({ ip: adaIp })
    const hers = await created(ada, 'Night Shift Audio')
    expect(await runIn(ada, hers, adaIp)).toMatchObject({ status: 'completed' })
    const grace = await openGuest({ ip: graceIp })
    expect(await runIn(grace, 'guest-network', graceIp)).toMatchObject({ status: 'completed' })

    // Every guest network's usage says so, and each refuses the next run, as does a third guest's own.
    for (const network of [hers, 'guest-network']) expect((await usageOf(ada, network)).modelRuns.used).toBe(2)
    const used =
      'Guests have started 2 model runs today, the most all guests together can start in a UTC day, in the guest network and the networks guests create; they reset at 00:00 UTC, so runs on your own data wait until then.'
    const dot = await openGuest({ ip: dotIp })
    for (const [who, network, ip] of [
      [ada, hers, adaIp],
      [grace, 'guest-network', graceIp],
      [dot, await created(dot, 'Paper Route'), dotIp]
    ] as const)
      expect((await runIn(who, network, ip))?.error).toContain(used)

    // A member's network counts on its own.
    const member = await openMember()
    const theirs = await (
      await member.fetch('/app/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Paper Route' })
      })
    ).json<{ id: string }>()
    expect(await runIn(member, theirs.id)).toMatchObject({ status: 'completed' })
    expect((await usageOf(member, theirs.id)).modelRuns.used).toBe(1)
  })

  it('keeps a Qloo key a guest adds to their network that network’s own, apart from every other guest’s', async () => {
    // Made-up keys, which the fake Qloo takes.
    const [adas, graces] = ['qk-made-up-7f3a', 'qk-made-up-9c1b']
    const host = 'https://hackathon.api.qloo.com'
    fakeQloo({ search, keys: [adas, graces] })
    const ada = await openGuest()
    const grace = await openGuest()
    const hers = await created(ada, 'Night Shift Audio')
    const his = await created(grace, 'Paper Route')
    for (const [who, network, key] of [
      [ada, hers, adas],
      [grace, his, graces]
    ] as const) {
      const added = await post(who, `/app/${network}/settings/qloo-key`, { host, key })
      expect(added.status).toBe(200)
      // The key's test search counts in the network's own usage.
      expect((await added.json<{ usage: { qlooCalls: { used: number } } }>()).usage.qlooCalls.used).toBe(1)
    }
    // Each network's lookups go with its own key, and the guest network's with Crossfeed's.
    for (const [who, network, key] of [
      [ada, hers, adas],
      [grace, his, graces],
      [ada, 'guest-network', env.QLOO_API_KEY]
    ] as const) {
      const opened = await who.connect(`/agents/network/${network}`)
      open.push(opened)
      const before = requests.length
      await opened.importRoster('Night Shift Cinema')
      expect(requests.slice(before).map((r) => r.headers.get('X-Api-Key'))).toEqual([key])
    }
    // Each own key's calls count on that network alone: its test search and its lookup.
    expect((await usageOf(ada, hers)).qlooCalls.used).toBe(2)
    expect((await usageOf(grace, his)).qlooCalls.used).toBe(2)
    expect((await usageOf(ada, 'guest-network')).qlooCalls.used).toBe(1)
  })

  it('counts invited sign-ups through every guest’s links together, even once a link’s network is gone', async () => {
    const cap = env.INVITED_SIGNUP_DAILY_CAP
    env.INVITED_SIGNUP_DAILY_CAP = '2'
    try {
      // An invite link, as an owner makes it in the network's settings.
      const invite = async (who: Pick<Guest, 'fetch'>, network: string) =>
        (await (await post(who as Guest, `/app/${network}/settings/members/invites`)).json<{ link: string }>()).link
      const signUp = (link: string, name: string) =>
        exports.default.fetch(`${origin}/auth/sign-up/options`, {
          method: 'POST',
          headers: { Origin: origin, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, invite: new URL(link).hash.slice(1) })
        })
      // Ada's link to the guest network brings in Dot.
      const ada = await openGuest()
      await openMember({ name: 'Dot Pruitt', invite: await invite(ada, 'guest-network') })
      // Grace's link to a network a guest made brings in the second, then she deletes the network.
      const grace = await openGuest()
      const made = await created(grace, 'Night Shift Audio')
      await openMember({ name: 'Eve Booker', invite: await invite(grace, made) })
      expect((await post(grace, `/app/${made}/settings/delete`, { name: 'Night Shift Audio' })).status).toBe(200)

      const capped = await signUp(await invite(grace, 'guest-network'), 'Fay Editor')
      expect([capped.status, await capped.json()]).toEqual([
        429,
        {
          error:
            'Guests’ invite links have brought in 2 new accounts today, the most all guests’ links together can in a UTC day; it resets at 00:00 UTC. To join now, sign in with an account you have, then open the link again.'
        }
      ])
      // A member's links count on their own.
      const lin = await openMember({ name: 'Lin Editor' })
      const theirs = await (
        await lin.fetch('/app/new', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Paper Route' })
        })
      ).json<{ id: string }>()
      expect((await signUp(await lin.invite(theirs.id), 'Fay Editor')).status).toBe(200)
    } finally {
      env.INVITED_SIGNUP_DAILY_CAP = cap
    }
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
  // What launch `id`'s agent holds, once a wipe has reset it: null when it's empty.
  const launchHeld = (id: string) =>
    readAfterReset(
      async () => (await (await getAgentByName(env.LaunchAgent, `guest-network:${id}`)).state).launch?.name ?? null
    )
  // The usage the guest network's settings page shows, as its island reads it.
  const usage = async (guest: Guest) =>
    (await (await guest.fetch('/app/guest-network/settings')).text()).match(/data-usage="([^"]*)"/)?.[1]

  // What launch `id`'s agent holds of its latest run.
  const latestRun = async (id: string) =>
    (await (await getAgentByName(env.LaunchAgent, `guest-network:${id}`)).state).run

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
    expect(logged).toHaveBeenCalledWith(JSON.stringify({ event: 'guest_network_reset', launches: 1, failed: 0 }))
    // Its launch is off the list, its agent, and a page of it still open, left to the hourly retry.
    expect(await launchHeld(id)).toBe('The Night Watch')
    // The guest is still signed in, and the guest network opens afresh: the sample's CPM, nothing else.
    const fresh = await readAfterReset(async () => (await getAgentByName(env.NetworkAgent, 'guest-network')).state)
    expect(fresh).toMatchObject({ cpm: 20, roster: [], launches: [], checklistDismissed: [] })
    expect((await guest.fetch(`/app/guest-network/launches/${id}`)).status).toBe(404)
    expect((await guest.fetch('/app', { redirect: 'manual' })).headers.get('location')).toBe('/app/guest-network')
    expect((await connect(guest, '/agents/network/guest-network')).state()).toMatchObject({ roster: [], launches: [] })
    expect(await usage(guest)).toBe(spent)
    expect((await (await getAgentByName(env.NetworkAgent, own.id)).state).launches).toHaveLength(1)

    await runHourlyCron()
    expect(await launch.closed()).toEqual(RESET)
    expect(await launchHeld(id)).toBeNull()
    expect(logged).toHaveBeenCalledWith(JSON.stringify({ event: 'wipes_retried', wiped: 1, kept: 0, failed: 0 }))
    expect((await (await getAgentByName(env.NetworkAgent, own.id)).state).launches).toHaveLength(1)
  })

  it('restores its name and wipes a Qloo key a guest added', async () => {
    const key = 'qk-made-up-7f3a'
    fakeQloo({ search: health, keys: [key, env.QLOO_API_KEY] })
    const guest = await openGuest()
    const renamed = await post(guest, '/app/guest-network/settings/network', { name: 'Night Shift Guests', cpm: 25 })
    expect(renamed.status).toBe(200)
    const added = await post(guest, '/app/guest-network/settings/qloo-key', {
      host: 'https://hackathon.api.qloo.com',
      key
    })
    expect(added.status).toBe(200)

    await runCron()
    expect(await readAfterReset(() => ownGateway(env, 'guest-network').ownKey())).toEqual({ set: false })
    expect(
      await readAfterReset(async () => (await getAgentByName(env.NetworkAgent, 'guest-network')).state)
    ).toMatchObject({ cpm: 20 })
    const page = await (await guest.fetch('/app/guest-network/settings')).text()
    expect(page.match(/data-network-name="([^"]*)"/)?.[1]).toBe('Guest network')
    expect(page.match(/data-qloo-key="([^"]*)"/)?.[1].replace(/&quot;/g, '"')).toBe('{"set":false}')
  })

  it('leaves each launch’s wipe to the hourly retry, whose run a failed wipe fails, and wipes it the next hour', async () => {
    fakeQloo({ search: health })
    const guest = await openGuest()
    const { id } = await (
      await connect(guest, '/agents/network/guest-network')
    ).call<{ id: string }>('createLaunch', {
      name: 'The Night Watch'
    })
    const logged = vi.spyOn(console, 'log')
    const failed = vi.spyOn(console, 'error')

    await runCron()
    expect(logged).toHaveBeenCalledWith(JSON.stringify({ event: 'guest_network_reset', launches: 1, failed: 0 }))
    expect((await guest.fetch(`/app/guest-network/launches/${id}`)).status).toBe(404)
    expect(await launchHeld(id)).toBe('The Night Watch')

    vi.spyOn(LaunchAgent.prototype, 'destroy').mockRejectedValueOnce(new Error('The agent is overloaded.'))
    await expect(runHourlyCron()).rejects.toThrow('1 agent wipe failed; the next hourly run tries again.')
    expect(failed.mock.calls.flat().filter((line) => String(line).includes('"event":"wipe_failed"'))).toHaveLength(1)
    expect(await launchHeld(id)).toBe('The Night Watch')

    await runHourlyCron()
    expect(logged).toHaveBeenCalledWith(JSON.stringify({ event: 'wipes_retried', wiped: 1, kept: 0, failed: 0 }))
    expect(await launchHeld(id)).toBeNull()
  })

  it('fails the cron’s run when its agent’s wipe fails, and the hourly retry clears it, its launches too', async () => {
    fakeQloo({ search: health })
    const guest = await openGuest()
    const { id } = await (
      await connect(guest, '/agents/network/guest-network')
    ).call<{ id: string }>('createLaunch', {
      name: 'The Night Watch'
    })
    vi.spyOn(NetworkAgent.prototype, 'destroy').mockRejectedValueOnce(new Error('The agent is overloaded.'))
    const logged = vi.spyOn(console, 'log')

    await expect(runCron()).rejects.toThrow(
      'Clearing the guest network, 1 agent wipe failed; the next hourly run tries again.'
    )
    expect(logged).toHaveBeenCalledWith(JSON.stringify({ event: 'guest_network_reset', launches: 1, failed: 1 }))

    // Its agent still lists the launch, so the first run crosses its wipe off and wipes the agent, noting
    // the launch's again, which the next run makes.
    await runHourlyCron()
    expect(logged).toHaveBeenCalledWith(JSON.stringify({ event: 'wipes_retried', wiped: 1, kept: 1, failed: 0 }))
    expect((await guest.fetch(`/app/guest-network/launches/${id}`)).status).toBe(404)
    await runHourlyCron()
    expect(logged).toHaveBeenCalledWith(JSON.stringify({ event: 'wipes_retried', wiped: 2, kept: 0, failed: 0 }))
    expect(await launchHeld(id)).toBeNull()
  })

  it('stops a launch’s run waiting on a question as a page still open answers it, calling no model, and closes its pages', async () => {
    fakeQloo({ search: health })
    const guest = await openGuest()
    const network = await connect(guest, '/agents/network/guest-network')
    const { id } = await network.call<{ id: string }>('createLaunch', { name: 'The Night Watch' })
    const launch = await connect(guest, `/agents/launch/guest-network/${id}`)
    const another = await connect(guest, `/agents/launch/guest-network/${id}`)
    fakeClaude([
      turn(toolUse('ask_human', { question: 'Which cut is it?', kind: 'choice', options: ['Original', 'Remaster'] })),
      turn(text('Planned.'))
    ])
    await launch.call('startLaunch', { name: 'The Night Watch' })
    const { run } = await launch.until((s) => s.run?.status === 'waiting')
    await runCron()
    const asked = modelRequests().length

    // The answer never reaches Claude: the page closes, saying why, and so does every other.
    void launch.call('answer', run!.question!.id, { choice: 'Original' })
    expect(await launch.closed()).toEqual(RESET)
    expect(await another.closed()).toEqual(RESET)
    expect(await latestRun(id)).toMatchObject({ id: run!.id, status: 'stopped', error: RESET.reason })
    expect(modelRequests()).toHaveLength(asked)
  })

  it('stops a launch’s run under way before its next model turn, and closes its pages', async () => {
    fakeQloo({
      search: { ...health, 'The Night Watch': [{ entity_id: 'e-0801', name: 'The Night Watch', popularity: 0.5 }] }
    })
    const guest = await openGuest()
    const network = await connect(guest, '/agents/network/guest-network')
    const { id } = await network.call<{ id: string }>('createLaunch', { name: 'The Night Watch' })
    const launch = await connect(guest, `/agents/launch/guest-network/${id}`)
    // Claude's first turn is held while the guest network is cleared, then asks for a tool.
    const held = Promise.withResolvers<void>()
    fakeClaude([
      () =>
        held.promise.then(() =>
          turn(toolUse('resolve_entities', { names: ['The Night Watch'], type: 'urn:entity:podcast' }))
        ),
      turn(text('Planned.'))
    ])
    await launch.call('startLaunch', { name: 'The Night Watch' })
    await vi.waitFor(() => expect(modelRequests()).toHaveLength(1))
    await runCron()

    held.resolve()
    expect(await launch.closed()).toEqual(RESET)
    expect(await latestRun(id)).toMatchObject({ status: 'stopped', error: RESET.reason })
    expect(modelRequests()).toHaveLength(1)
  })

  it('tells a page of a launch a guest deleted, whose wipe failed, that it was deleted when the hourly retry wipes it', async () => {
    fakeQloo({ search: health })
    const guest = await openGuest()
    const network = await connect(guest, '/agents/network/guest-network')
    const { id } = await network.call<{ id: string }>('createLaunch', { name: 'The Night Watch' })
    const launch = await connect(guest, `/agents/launch/guest-network/${id}`)
    vi.spyOn(LaunchAgent.prototype, 'destroy').mockRejectedValueOnce(new Error('The agent is overloaded.'))
    expect((await guest.fetch(`/app/guest-network/launches/${id}/delete`, { method: 'POST' })).status).toBe(200)
    expect(await launchHeld(id)).toBe('The Night Watch')

    await runHourlyCron()
    expect(await launch.closed()).toEqual({ code: 4410, reason: 'This launch was deleted.' })
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
    expect((await guest.fetch(`/app/guest-network/launches/${late}`)).status).toBe(404)
    await runHourlyCron()
    expect(await launchHeld(late)).toBeNull()
  })
})

describe('resetting the sample data, from the guest network’s settings (#283)', () => {
  const RESET = { code: 4410, reason: 'A guest reset the guest network to the sample data.' }
  const open: Omit<Session, 'cookie'>[] = []
  afterEach(() => open.splice(0).forEach((agent) => agent.close()))
  const connect = async (who: { connect: Guest['connect'] }, path = '/agents/network/guest-network') => {
    const agent = await who.connect(path)
    open.push(agent)
    return agent
  }
  const reset = (guest: Pick<Guest, 'fetch'>) => post(guest, '/app/guest-network/settings/sample-data/reset')
  // What the guest network's agent holds, once its wipe has reset it.
  const fresh = () => readAfterReset(async () => (await getAgentByName(env.NetworkAgent, 'guest-network')).state)

  it('clears the guest network as the daily cron does, closing every guest’s pages saying a guest reset it, and leaves its launches to the hourly retry', async () => {
    fakeQloo({
      search: { 'Night Shift Cinema': [{ entity_id: 'e-0001', name: 'Night Shift Cinema', popularity: 0.8 }] }
    })
    const one = await openGuest({ ip: '203.0.113.7' })
    const other = await openGuest({ ip: '198.51.100.4' })
    const mine = await connect(one)
    const theirs = await connect(other)
    await mine.importRoster('Night Shift Cinema')
    expect(
      (await post(one, '/app/guest-network/settings/network', { name: 'Night Shift Guests', cpm: 25 })).status
    ).toBe(200)
    const { id } = await mine.call<{ id: string }>('createLaunch', { name: 'The Night Watch' })
    const launch = await connect(other, `/agents/launch/guest-network/${id}`)
    const logged = vi.spyOn(console, 'log')

    const res = await reset(one)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({})
    expect(await theirs.closed()).toEqual(RESET)
    expect(await mine.closed()).toEqual(RESET)
    expect(logged).toHaveBeenCalledWith(JSON.stringify({ event: 'guest_network_reset', launches: 1, failed: 0 }))
    // Every guest stays signed in, and the guest network opens afresh, with its name back.
    expect(await fresh()).toMatchObject({ cpm: 20, roster: [], launches: [] })
    expect((await connect(other)).state()).toMatchObject({ cpm: 20, roster: [], launches: [] })
    const page = await (await other.fetch('/app/guest-network/settings')).text()
    expect(page.match(/data-network-name="([^"]*)"/)?.[1]).toBe('Guest network')
    expect((await one.fetch(`/app/guest-network/launches/${id}`)).status).toBe(404)

    // The launch's page closes as the hourly retry wipes its agent, saying the same.
    await runHourlyCron()
    expect(await launch.closed()).toEqual(RESET)
  })

  it('resets once a minute for everyone: a second reset in the minute, from any guest or address, is refused with 429 saying when to try again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const start = Date.now()
    const one = await openGuest({ ip: '203.0.113.7' })
    const other = await openGuest({ ip: '198.51.100.4' })
    expect((await reset(one)).status).toBe(200)
    const page = await connect(other)
    await page.call('createLaunch', { name: 'The Night Watch' })

    for (const [who, after, seconds] of [
      [other, 0, '60 seconds'],
      [one, 30_000, '30 seconds'],
      [other, 59_001, '1 second']
    ] as const) {
      vi.setSystemTime(start + after)
      const refused = await reset(who)
      expect(refused.status).toBe(429)
      expect(refused.headers.get('retry-after')).toBe(seconds.split(' ')[0])
      expect(await refused.json()).toEqual({
        error: `The sample data was just reset, and it resets at most once a minute for everyone. Try again in ${seconds}.`
      })
    }
    expect(page.state()!.launches).toMatchObject([{ name: 'The Night Watch' }])

    vi.setSystemTime(start + 60_000)
    expect((await reset(other)).status).toBe(200)
    expect(await page.closed()).toEqual(RESET)
  })

  it('answers 404 for any other network and to anyone outside the guest network, 403 to its members who aren’t owners and to another site, and resets nothing', async () => {
    const guest = await openGuest()
    const page = await connect(guest)
    await page.call('createLaunch', { name: 'The Night Watch' })
    // A member's own network, a network guests created, and the guest network to someone outside it.
    const ada = await openMember()
    const own = await (await post(ada, '/app/new', { name: 'Night Shift Audio' })).json<{ id: string }>()
    const created = await (await post(guest, '/app/new', { name: 'Guest Side Project' })).json<{ id: string }>()
    for (const [who, id] of [
      [ada, own.id],
      [guest, created.id],
      [ada, 'guest-network']
    ] as const)
      expect((await post(who, `/app/${id}/settings/sample-data/reset`)).status, id).toBe(404)
    // A person a guest invited into the guest network, as a member.
    const invited = await post(guest, '/app/guest-network/settings/members/invites')
    const dot = await openMember({ name: 'Dot Pruitt', invite: (await invited.json<{ link: string }>()).link })
    const refused = await reset(dot)
    expect(refused.status).toBe(403)
    expect(await refused.json()).toEqual({ error: 'Only an owner can reset the sample data.' })
    // A guest's cookie on a write from another site.
    const elsewhere = await exports.default.fetch(`${origin}/app/guest-network/settings/sample-data/reset`, {
      method: 'POST',
      headers: { Cookie: guest.cookie, Origin: 'https://crossfeed.example', 'Content-Type': 'application/json' },
      body: '{}'
    })
    expect(elsewhere.status).toBe(403)

    expect(page.state()!.launches).toMatchObject([{ name: 'The Night Watch' }])
    expect((await (await getAgentByName(env.NetworkAgent, 'guest-network')).state).launches).toMatchObject([
      { name: 'The Night Watch' }
    ])
    // None of them spent the minute's reset.
    expect((await reset(guest)).status).toBe(200)
  })

  it('says the reset may take a moment to finish when a wipe fails, and the hourly retry finishes it', async () => {
    const guest = await openGuest()
    const page = await connect(guest)
    await page.call('createLaunch', { name: 'The Night Watch' })
    vi.spyOn(NetworkAgent.prototype, 'destroy').mockRejectedValueOnce(new Error('The agent is overloaded.'))
    const failed = vi.spyOn(console, 'error')

    const res = await reset(guest)
    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({
      message: 'The reset may take a moment to finish: part of it failed, and Crossfeed tries it again within the hour.'
    })
    expect(await page.closed()).toEqual(RESET)
    expect(failed.mock.calls.flat().filter((line) => String(line).includes('"event":"wipe_failed"'))).toHaveLength(1)

    await runHourlyCron()
    expect(await fresh()).toMatchObject({ cpm: 20, launches: [] })
  })

  it('counts exactly, so two resets at once leave one refused', async () => {
    const guests = [await openGuest({ ip: '203.0.113.7' }), await openGuest({ ip: '198.51.100.4' })]
    const both = await Promise.all(guests.map(reset))
    expect(both.map((res) => res.status).sort()).toEqual([200, 429])
  })
})
