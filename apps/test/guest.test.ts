// Signing in as a guest (ADR 0005): one click, no passkey, to the guest network, as the guest member,
// through the accounts routes and the app's pages, as the sign-in page's "Sign in as a guest" does.
import { env, exports } from 'cloudflare:workers'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JoinAs } from '../src/client/Account'
import { NewNetworkPage } from '../src/client/NewNetwork'
import { fakeClaude, fakeQloo, text, toolUse, turn } from './fake'
import { guestSignIn, hooked, openGuest, openMember, type Guest, type Session } from './session'

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

  it('tells a guest on the new network page that a guest can’t create one, with no form', async () => {
    const page = await (await (await openGuest()).fetch('/app/new')).text()
    const root = page.match(/<div id="root"([^>]*)>/)![1]
    expect(root).toContain('data-guest="true"')
    const cap = Number(root.match(/data-cap="(\d+)"/)![1])
    const html = renderToStaticMarkup(createElement(NewNetworkPage, { cap, guest: true }))
    expect(words(html)).toBe(
      'Create a network A network holds your roster, its launches, and your booking inbox, for you and the teammates you invite. You own the networks you create, up to 3. A guest can’t create a network: every guest shares the guest network. Sign out and create an account to create one of your own. Sign out and create an account'
    )
    expect(html).not.toContain('<input')
  })

  it('tells a guest who opens an invite link to sign out and create an account to join, with no Join', async () => {
    const ada = await openMember()
    const invite = await (await ada.fetch('/invite')).text()
    expect(invite).not.toContain('data-guest')
    const page = await (await (await openGuest()).fetch('/invite')).text()
    expect(page).toContain('data-member-name="Guest"')
    expect(page).toContain('data-guest="true"')
    const html = renderToStaticMarkup(
      createElement(JoinAs, { name: 'Guest', network: 'Night Shift Audio', guest: true, join: async () => {} })
    )
    expect(words(html)).toBe(
      'You’re signed in as a guest, and the guest member every guest shares can’t join a network. Sign out and create an account to join Night Shift Audio. Sign out and create an account'
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
