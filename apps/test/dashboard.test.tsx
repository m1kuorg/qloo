// What a network's dashboard, Launches page and settings say. Each test drives a network through the
// Worker's routes and its agent into a state, then renders the page from the agent's synced state and
// the props the server gave the page, and reads its words.
import { env } from 'cloudflare:workers'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LaunchSummary, Run, State } from '../src/agent'
import { Dashboard } from '../src/client/Dashboard'
import { Launches } from '../src/client/Launches'
import { LostAccess, NetworkGate, type NetworkConnection } from '../src/client/NetworkPage'
import { NetworkRoster } from '../src/client/Roster'
import { Settings } from '../src/client/Settings'
import { connectionOf } from '../src/client/states'
import type { Booking, PitchReply } from '../src/inbox'
import { fakeClaude, fakeQloo, text, turn, type ModelRequest } from './fake'
import {
  api,
  facts,
  hooked,
  navLinks,
  openGuest,
  openMember,
  regions,
  sampleLabels,
  sections,
  tabsOf,
  type Member,
  type Session
} from './session'

const open: Omit<Session, 'cookie'>[] = []
const saved = {
  GUEST_PITCHES: env.GUEST_PITCHES,
  QLOO_VISITOR_DAILY_CALL_CAP: env.QLOO_VISITOR_DAILY_CALL_CAP,
  SAMPLE_NETWORK: env.SAMPLE_NETWORK
}
afterEach(() => {
  vi.useRealTimers()
  open.splice(0).forEach((agent) => agent.close())
  Object.assign(env, saved)
})

// A network the member creates, its agent opened as its dashboard opens it.
async function network(member: Member, name = 'Night Shift Audio') {
  const res = await member.fetch('/app/new', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  })
  const { id } = await res.json<{ id: string }>()
  return { id, agent: await connect(member, id) }
}
const connect = async (member: Pick<Member, 'connect'>, id: string) => {
  const agent = await member.connect(`/agents/network/${id}`)
  open.push(agent)
  return agent
}

// The data attributes the server gave a page's #root, as main.tsx reads them.
async function island(member: Pick<Member, 'fetch'>, path: string) {
  const html = await (await member.fetch(path)).text()
  const root = html.match(/<div id="root"([^>]*)>/)![1]
  const d = Object.fromEntries(
    [...root.matchAll(/data-([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [
      k.replace(/-(\w)/g, (_, c: string) => c.toUpperCase()),
      v
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
    ])
  )
  return {
    memberId: d.memberId,
    members: d.members ? JSON.parse(d.members) : [],
    invites: d.invites ? JSON.parse(d.invites) : null,
    apiKeys: d.apiKeys ? JSON.parse(d.apiKeys) : null,
    usage: d.usage ? JSON.parse(d.usage) : null,
    qlooKey: d.qlooKey ? JSON.parse(d.qlooKey) : null,
    setup: { invited: d.invited === 'true' },
    ownKey: d.ownKey === 'true',
    keys: d.keys ? JSON.parse(d.keys) : null,
    notice: d.notice,
    network: {
      id: d.networkId,
      name: d.networkName,
      role: d.role as 'owner' | 'member',
      guestBudget: d.guestBudget === 'true',
      links: { roster: d.rosterLink, inbox: d.inboxLink ?? null, settings: d.settingsLink, launches: d.launchesLink }
    }
  }
}

// The page's words, as a reader hears them.
const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

const dashboard = async (member: Pick<Member, 'fetch'>, id: string, state: State | undefined, query = '') =>
  renderToStaticMarkup(
    <Dashboard
      {...await island(member, `/app/${id}${query}`)}
      state={state}
      dismiss={async () => {}}
      createLaunch={async () => ({ id: 'l-1' })}
    />
  )
const launchesPage = async (member: Pick<Member, 'fetch'>, id: string, state: State | undefined) =>
  renderToStaticMarkup(
    <Launches
      network={(await island(member, `/app/${id}/launches`)).network}
      state={state}
      createLaunch={async () => ({ id: 'l-1' })}
    />
  )

// A block's links, Needs you's (`data-needs-you`) or Latest runs' (`data-latest-runs`), each as it
// reads and where it links, in its order.
const linksIn = (html: string, hook: string) =>
  [...(hooked(html, hook)[0] ?? '').matchAll(/<a\b[^>]*\shref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map(
    ([, href, inner]) => [words(inner), href]
  )
const needingYou = (html: string) => linksIn(html, 'data-needs-you')

// A launch as its network's agent lists it, numbered `n`, unreleased when it has no name, its last run
// started by Ada unless `by` says who.
const launch = (
  n: number,
  status: LaunchSummary['status'],
  lastRun: string | null,
  name: string | null,
  by = 'Ada Programmer'
): LaunchSummary => ({
  id: `l-${n}`,
  name,
  comps: name ? [] : ['Blank Check', 'Filmspotting'],
  status,
  finalists: 0,
  slots: null,
  slotValue: null,
  startedBy: lastRun && by,
  lastRun
})

const STEPS = ['Import the roster', 'Set the CPM', 'Plan a launch', 'Invite a teammate', 'Connect your AI']
// The setup checklist's steps, each as a reader hears it, in the order of its numbered list.
const steps = (html: string) =>
  (html.match(/<ol\b[^>]*>(.*?)<\/ol>/)?.[1] ?? '')
    .split(/<li\b/)
    .slice(1)
    .map((li) => words(`<li${li}`))

describe('the dashboard', () => {
  it('says plainly that a new network has nothing needing it, no runs, no key used, no roster, or CPM, and lists all five setup steps first', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-19T14:30:00Z'))
    const ada = await openMember()
    const { id, agent } = await network(ada)
    const html = await dashboard(ada, id, agent.state())
    const read = words(html)
    // The page is the network's home; the top bar's switcher names the network.
    expect(await (await ada.fetch(`/app/${id}`)).text()).toMatch(/data-current-network[^>]*>Night Shift Audio</)
    // The header is the title alone, with no launch to count. Each block is a section: its heading, one
    // sentence, then its lines; Setup comes first while it shows, its sentence its count, with Dismiss on
    // its heading's line; Network comes last, in the page as on a phone.
    expect(sections(html)).toEqual([
      ['Setup', '0 of 5 done'],
      ['Needs you', 'Launches with a question to answer or an order to approve, and runs that failed or stopped.'],
      ['Latest runs', 'The launches run last, with when each run started and who started it.'],
      ['Today’s usage', 'What Night Shift Audio can use each UTC day, whichever member or API key uses it.'],
      [
        'Assistants and API',
        'Scripts and assistants act for Night Shift Audio with its API keys, short of approving anything.'
      ],
      ['Network', 'The roster your launches rank, and the CPM that prices their slots.']
    ])
    expect(read).toMatch(/^Dashboard Setup 0 of 5 done Dismiss /)
    // Nothing needs the member yet, and with no roster, the next useful thing is to import one.
    expect(read).toContain('stopped. Nothing needs you. Import a roster Latest runs')
    // Nothing has run, and no key has been used; each block says so, with its way on.
    expect(read).toContain('who started it. No runs yet. All launches Today’s usage')
    expect(html).toMatch(new RegExp(`<a\\b[^>]*href="/app/${id}/launches"[^>]*>All launches</a>`))
    expect(read).toContain(
      'Today’s usage What Night Shift Audio can use each UTC day, whichever member or API key uses it. Model runs 0 of 10 today Launch runs, inbox loads, and pitch runs Qloo calls 0 of 2,000 today Cached answers included Resets 00:00 UTC, in 9 h 30 min As of 2:30 PM, when the page loaded.'
    )
    expect(read).toContain(
      'short of approving anything. Keys in use 0 No assistant or script has used a key yet. Open API keys Network'
    )
    expect(html).toMatch(new RegExp(`href="/app/${id}/settings#api-keys"[^>]*>Open API keys</a>`))
    expect(html).toMatch(/<span class="text-muted-foreground" data-state="empty">Nothing needs you\.<\/span>/)
    expect(html).toMatch(new RegExp(`<a\\b[^>]*href="/app/${id}/roster"[^>]*>Import a roster</a>`))
    expect(read).not.toContain('New launch')
    expect(read).not.toContain('Launch Status Finalists')
    expect(read).toContain('Roster No shows yet Open')
    expect(read).toContain('CPM Not set Set')
    expect(read).not.toContain('Inbox')
    const listed = steps(html)
    expect(listed).toHaveLength(STEPS.length)
    STEPS.forEach((step, i) => expect(listed[i]).toMatch(new RegExp(`^${step} [A-Z][^.]+\\.`)))
    expect(html).toContain(`href="/app/${id}/roster"`)
    // Every link into settings opens the tab it's about: the CPM's Set and "Set the CPM" the network's,
    // "Invite a teammate" the members', and "Connect your AI" and Open API keys the API keys'.
    expect(html).toMatch(new RegExp(`href="/app/${id}/settings#network"[^>]*>Set</a>`))
    expect(html).toMatch(new RegExp(`href="/app/${id}/settings#network"[^>]*>Set the CPM</a>`))
    expect(html).toMatch(new RegExp(`href="/app/${id}/settings#members"[^>]*>Invite a teammate</a>`))
    expect(html).toMatch(new RegExp(`href="/app/${id}/settings#api-keys"[^>]*>Connect your AI</a>`))
    expect(html).not.toContain(`href="/app/${id}/settings"`)
  })

  it('ticks off setup from the roster, the CPM, and a teammate, and says how the roster matched', async () => {
    fakeQloo({
      search: {
        'Deep Cuts': [{ entity_id: 'p-0001', name: 'Deep Cuts', popularity: 0.5 }],
        'Signal Boost': [{ entity_id: 'p-0002', name: 'Signal Boost', popularity: 0.5 }],
        'Paper Trail': []
      }
    })
    const ada = await openMember()
    const { id, agent } = await network(ada)
    await agent.importRoster('Deep Cuts\nSignal Boost\nPaper Trail')
    await ada.fetch(`/app/${id}/settings/network`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Night Shift Audio', cpm: 20 })
    })
    await openMember({ name: 'Grace Booker', invite: await ada.invite(id) })

    const html = await dashboard(ada, id, await agent.until((s) => s.cpm === 20))
    const read = words(html)
    expect(read).toContain('Roster 3 shows: 2 matched, 1 not in Qloo Open')
    expect(read).toContain('CPM $20 per 1,000 downloads Change')
    expect(html).toMatch(new RegExp(`href="/app/${id}/settings#network"[^>]*>Change</a>`))
    expect(read).toContain('Setup 3 of 5 done')
    // Nothing needs the member, and with a roster in, the next useful thing is to plan a launch.
    expect(read).toContain('stopped. Nothing needs you. New launch Latest runs')
    expect(html).toMatch(/<button\b[^>]*>New launch<\/button>/)
    const listed = steps(html)
    expect(listed.slice(0, 2)).toEqual([`${STEPS[0]} Done`, `${STEPS[1]} Done`])
    expect(listed[2]).toMatch(new RegExp(`^${STEPS[2]} Name`))
    expect(listed[3]).toBe(`${STEPS[3]} Done`)
    expect(listed[4]).toMatch(new RegExp(`^${STEPS[4]} Make a key in settings .+ It’s done once a key is used\\.$`))

    // With launches not run yet, still nothing needs the member: the next useful thing is the newest
    // of them, on its page, where Start run is.
    await agent.call('createLaunch', { name: 'The Night Watch' })
    const { id: newest } = await agent.call<{ id: string }>('createLaunch', { name: 'Paper Moons' })
    const planned = await dashboard(ada, id, await agent.until((s) => s.launches?.length === 2))
    expect(words(planned)).toContain('stopped. Nothing needs you. Open Paper Moons Latest runs')
    expect(needingYou(planned)).toEqual([['Open Paper Moons', `/app/${id}/launches/${newest}`]])
  })

  it('lists all five setup steps in the guest network too, and lets a guest, an owner, change its CPM', async () => {
    const guest = await openGuest()
    const agent = await connect(guest, 'guest-network')
    const html = await dashboard(guest, 'guest-network', await agent.until((s) => s.cpm === 20))
    const read = words(html)
    expect(read).toContain('CPM $20 per 1,000 downloads Change')
    expect(read).toContain('Setup 1 of 5 done Dismiss')
    const listed = steps(html)
    expect(listed).toHaveLength(STEPS.length)
    expect(listed[1]).toBe(`${STEPS[1]} Done`)
    for (const i of [0, 2, 3, 4]) expect(listed[i]).toMatch(new RegExp(`^${STEPS[i]} [A-Z]`))
    expect(listed[3]).toMatch(/^Invite a teammate Make an invite link in settings/)
    expect(listed[4]).toMatch(/^Connect your AI Make a key in settings/)
  })

  it('says, as a reset of the sample data opens the guest network’s with part of the reset left to the hourly retry, that it may take a moment to finish', async () => {
    const guest = await openGuest()
    const state = await (await connect(guest, 'guest-network')).until(() => true)
    expect(words(await dashboard(guest, 'guest-network', state, '?reset=pending'))).toMatch(
      /^Dashboard The reset may take a moment to finish: part of it failed, and Crossfeed tries it again within the hour\. Setup /
    )
    expect(words(await dashboard(guest, 'guest-network', state))).not.toContain('The reset')
    // Another network has no sample data to reset.
    const ada = await openMember()
    const { id, agent } = await network(ada)
    expect(words(await dashboard(ada, id, agent.state(), '?reset=pending'))).not.toContain('The reset')
  })

  it("is dismissed for the member who dismisses it, and stays for everyone else's", async () => {
    const ada = await openMember()
    const { id, agent } = await network(ada)
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(id) })
    await agent.call('dismissChecklist')

    const state = agent.state()
    expect(words(await dashboard(ada, id, state))).not.toContain('Setup')
    expect(words(await dashboard(grace, id, state))).toContain('Setup 1 of 5 done')
  })

  it('lines up the inbox, while guest pitches are on: its pitches, how they matched, and those set aside', async () => {
    env.GUEST_PITCHES = 'on'
    fakeQloo({ search: { 'Night Ferry': [{ entity_id: 'b-0001', name: 'Night Ferry', popularity: 0.8 }] } })
    const pitch = (n: number) => `From: Pat <pat${n}@example.com>\nSubject: Pitch ${n}\n\nPitch number ${n}.`
    fakeClaude(
      [1, 2].map(() => (request: ModelRequest) => {
        const about = JSON.stringify(request.messages)
        return turn(
          text(
            JSON.stringify(
              about.includes('Pitch number 1')
                ? { guest: 'Ada Quill', work: { title: 'Night Ferry', type: 'book', year: 2019 } }
                : { guest: 'Dot Pruitt', work: null }
            )
          )
        )
      })
    )
    const ada = await openMember()
    const { id, agent } = await network(ada)
    const html = await dashboard(ada, id, agent.state())
    expect(sections(html).at(-1)).toEqual([
      'Network',
      'The roster and inbox your runs rank, and the CPM that prices a launch’s slots.'
    ])
    expect(words(html)).toContain('Inbox No pitches loaded Open')

    await agent.call('loadInbox', { text: `${pitch(1)}\n---\n${pitch(2)}` })
    const read = words(await dashboard(ada, id, await agent.until((s) => s.inbox?.status === 'done')))
    expect(read).toContain('Inbox 2 pitches: 1 matched, 1 set aside Open')
  })

  it('lists in Needs you exactly the launches waiting on a member, latest run first, each linking to where it waits', async () => {
    const ada = await openMember()
    const { id, agent } = await network(ada)
    const state: State = {
      ...agent.state()!,
      launches: [
        launch(1, 'new', null, 'Night Shift Cinema'),
        launch(2, 'running', '2026-10-20T12:00:00Z', 'Paper Moons'),
        launch(3, 'waiting', '2026-10-18T12:00:00Z', 'Ghost Signal'),
        launch(4, 'ranked', '2026-10-22T12:00:00Z', 'Slow Burn'),
        launch(5, 'order drafted', '2026-10-21T12:00:00Z', 'Deep Cuts'),
        launch(6, 'order approved', '2026-10-23T12:00:00Z', 'Signal Boost'),
        launch(7, 'failed', '2026-10-19T12:00:00Z', 'Paper Trail'),
        launch(8, 'stopped', '2026-10-17T12:00:00Z', null)
      ]
    }
    const html = await dashboard(ada, id, state)
    // An order to approve opens the launch's plan; a question, a failure and a stop, its page.
    expect(needingYou(html)).toEqual([
      ['Deep Cuts Order drafted', `/app/${id}/launches/l-5#plan`],
      ['Paper Trail Failed', `/app/${id}/launches/l-7`],
      ['Ghost Signal Waiting', `/app/${id}/launches/l-3`],
      ['Blank Check · Filmspotting Stopped', `/app/${id}/launches/l-8`]
    ])
    expect(words(html)).not.toContain('Nothing needs you')
    // The Launches page groups the same four first.
    expect(words(await launchesPage(ada, id, state))).toMatch(
      /^Launches 8 launches · 4 need you, 1 running New launch .+ Needs you 4 Deep Cuts .+ Paper Trail .+ Ghost Signal .+ Blank Check · Filmspotting .+ Running 1 Paper Moons /
    )
  })

  it('lists the five launches run last, latest first, each with its status, when its run started and who started it, then All launches, and counts them in the header as the Launches page does', async () => {
    const ada = await openMember()
    const { id, agent } = await network(ada)
    const state: State = {
      ...agent.state()!,
      launches: [
        launch(1, 'new', null, 'Night Shift Cinema'),
        launch(2, 'running', '2026-10-20T12:00:00Z', 'Paper Moons', 'API key “Nightly sync”'),
        launch(3, 'waiting', '2026-10-18T12:00:00Z', 'Ghost Signal'),
        launch(4, 'ranked', '2026-10-22T09:05:00Z', 'Slow Burn'),
        launch(5, 'order drafted', '2026-10-21T12:00:00Z', null),
        launch(6, 'order approved', '2026-10-23T18:30:00Z', 'Signal Boost'),
        launch(7, 'failed', '2026-10-19T12:00:00Z', 'Paper Trail')
      ]
    }
    const html = await dashboard(ada, id, state)
    expect(linksIn(html, 'data-latest-runs')).toEqual([
      ['Signal Boost Order approved Oct 23, 6:30 PM · Ada Programmer', `/app/${id}/launches/l-6`],
      ['Slow Burn Ranked Oct 22, 9:05 AM · Ada Programmer', `/app/${id}/launches/l-4`],
      ['Blank Check · Filmspotting Order drafted Oct 21, 12:00 PM · Ada Programmer', `/app/${id}/launches/l-5`],
      ['Paper Moons Running Oct 20, 12:00 PM · API key “Nightly sync”', `/app/${id}/launches/l-2`],
      ['Paper Trail Failed Oct 19, 12:00 PM · Ada Programmer', `/app/${id}/launches/l-7`],
      ['All launches', `/app/${id}/launches`]
    ])
    // A running run wears the on-air dot, as on the Launches page.
    expect(hooked(html, 'data-latest-runs')[0]).toMatch(/data-mark="live"[^]*?Running/)
    expect(words(html)).toMatch(/^Dashboard 7 launches · 3 need you, 1 running Setup /)
    expect(words(await launchesPage(ada, id, state))).toMatch(
      /^Launches 7 launches · 3 need you, 1 running New launch /
    )
  })

  it("shows today's usage as the usage route reads it, with when it resets and when it was read, what's refused at a cap, and the guest budget every guest shares in the guest network", async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-19T14:30:00Z'))
    fakeQloo({ search: { 'Corner Booth': [{ entity_id: 'e-0501', name: 'Corner Booth', popularity: 0.6 }] } })
    const ada = await openMember()
    const { id, agent } = await network(ada)
    await agent.importRoster('Corner Booth')
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(id) })
    for (const member of [ada, grace]) {
      const { usage } = await island(member, `/app/${id}`)
      expect(usage).toMatchObject({ qlooCalls: { used: 1 } })
      expect(usage).toEqual(await (await member.fetch(`/api/v1/networks/${id}/usage`)).json())
      expect(words(await dashboard(member, id, agent.state()))).toContain(
        'Today’s usage What Night Shift Audio can use each UTC day, whichever member or API key uses it. Model runs 0 of 10 today Launch runs, inbox loads, and pitch runs Qloo calls 1 of 2,000 today Cached answers included Resets 00:00 UTC, in 9 h 30 min As of 2:30 PM, when the page loaded. Assistants and API'
      )
    }
    env.QLOO_VISITOR_DAILY_CALL_CAP = '1'
    expect(words(await dashboard(ada, id, agent.state()))).toContain(
      'Qloo calls 1 of 1 today Cached answers included Resets 00:00 UTC, in 9 h 30 min Limit reached No more Qloo calls today: roster imports and comp searches are refused until 00:00 UTC. As of 2:30 PM'
    )

    const guest = await openGuest()
    const { usage } = await island(guest, '/app/guest-network')
    expect(usage).toEqual(await (await guest.fetch('/api/v1/networks/guest-network/usage')).json())
    const state = await (await connect(guest, 'guest-network')).until(() => true)
    expect(words(await dashboard(guest, 'guest-network', state))).toContain(
      'Today’s usage What all guests together can use each UTC day, in the guest network and the networks guests create. Model runs'
    )
  })

  it("says how many API keys are in use and when one was last used, naming the key to owners alone, and ticks off Connect your AI at a key's first use, revoked or not", async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-19T14:30:00Z'))
    const ada = await openMember()
    const { id, agent } = await network(ada)
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(id) })
    const made = await ada.fetch(`/app/${id}/settings/api-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Claude Code' })
    })
    const { id: key, secret } = await made.json<{ id: string; secret: string }>()
    const keysOf = (html: string) => facts(hooked(html, 'data-keys')[0])

    // Made, but not used yet: the step waits for its first request.
    const unused = await dashboard(ada, id, agent.state())
    expect(keysOf(unused)).toEqual([['Keys in use', '1']])
    expect(words(unused)).toContain('Keys in use 1 No assistant or script has used a key yet. Open API keys')
    expect(steps(unused)[4]).toMatch(/^Connect your AI Make a key in settings/)

    vi.setSystemTime(new Date('2026-10-19T15:02:00Z'))
    expect((await api(secret)(`/api/v1/networks/${id}`)).status).toBe(200)
    const owners = await dashboard(ada, id, agent.state())
    expect(keysOf(owners)).toEqual([
      ['Keys in use', '1'],
      ['Last used', 'Oct 19, 3:02 PM by “Claude Code”']
    ])
    expect(steps(owners)[4]).toBe('Connect your AI A key has been used.')
    // A member sees when, but not which key: only owners see the network's keys.
    const members = await dashboard(grace, id, agent.state())
    expect(keysOf(members)).toEqual([
      ['Keys in use', '1'],
      ['Last used', 'Oct 19, 3:02 PM']
    ])
    expect(steps(members)[4]).toBe('Connect your AI A key has been used.')
    const [ownerPage, memberPage] = await Promise.all(
      [ada, grace].map(async (m) => (await m.fetch(`/app/${id}`)).text())
    )
    for (const page of [ownerPage, memberPage]) {
      expect(page).not.toContain(secret)
      expect(page).not.toContain(secret.slice(0, 12))
    }
    expect(ownerPage).toContain('Claude Code')
    expect(memberPage).not.toContain('Claude Code')

    // Revoked, it's no longer in use, and its use still counts.
    expect((await ada.fetch(`/app/${id}/settings/api-keys/${key}/revoke`, { method: 'POST' })).status).toBe(200)
    const revoked = await dashboard(ada, id, agent.state())
    expect(keysOf(revoked)).toEqual([
      ['Keys in use', '0'],
      ['Last used', 'Oct 19, 3:02 PM by “Claude Code”, since revoked']
    ])
    expect(steps(revoked)[4]).toBe('Connect your AI A key has been used.')
  })

  it('lists in Needs you, while the inbox is on, a pitch run waiting on an answer and the replies a pitch run drafted that wait for approval, each linking into the inbox', async () => {
    const pitchRun = (status: Run['status']): Run => ({
      id: 'run-2',
      status,
      notes: [],
      error: null,
      question:
        status === 'waiting'
          ? { id: 'q-1', kind: 'choice', question: 'Rank the books first?', options: ['Yes', 'No'] }
          : null,
      budget: null,
      exclusions: null,
      closing: null
    })
    const reply = (pitch: string, status: PitchReply['status']): PitchReply => ({
      pitch,
      verdict: 'book',
      angle: null,
      sharedTags: null,
      draft: 'Thanks for the pitch.',
      status
    })
    const booking = (replies: PitchReply[] | null): Booking => ({
      run: 'run-2',
      show: { name: 'The Big Picture', entity: { id: 'p-0001', name: 'The Big Picture', popularity: 0.9 } },
      pastGuests: [],
      lists: null,
      replies
    })
    const drafted = [
      reply('pitch-01', 'draft'),
      reply('pitch-02', 'approved'),
      reply('pitch-03', 'draft'),
      reply('pitch-04', 'discarded')
    ]
    for (const inbox of ['on', 'off']) {
      env.GUEST_PITCHES = inbox
      const ada = await openMember()
      const { id, agent } = await network(ada)
      const base: State = {
        ...agent.state()!,
        launches: [launch(1, 'waiting', '2026-10-20T12:00:00Z', 'Ghost Signal')]
      }
      const waiting = await dashboard(ada, id, { ...base, run: pitchRun('waiting'), booking: booking(null) })
      // Its replies wait until the run has ended, as the inbox locks them until then.
      const running = await dashboard(ada, id, { ...base, run: pitchRun('running'), booking: booking(drafted) })
      const ended = await dashboard(ada, id, { ...base, run: pitchRun('completed'), booking: booking(drafted) })
      const ghost = ['Ghost Signal Waiting', `/app/${id}/launches/l-1`]
      if (inbox === 'on') {
        expect(needingYou(waiting)).toEqual([ghost, ['Pitch run for The Big Picture Waiting', `/app/${id}/inbox`]])
        expect(needingYou(running)).toEqual([ghost])
        expect(needingYou(ended)).toEqual([
          ghost,
          ['Replies for The Big Picture 2 to approve', `/app/${id}/inbox#replies`]
        ])
        expect(sections(ended)[1]).toEqual([
          'Needs you',
          'Launches and pitch runs with a question to answer, orders and replies to approve, and runs that failed or stopped.'
        ])
      } else for (const html of [waiting, running, ended]) expect(needingYou(html)).toEqual([ghost])
    }
  })

  it("puts Dashboard first in the rail, then Launches, Roster, Inbox, and Settings, marking the page it's on, and a launch's page as Launches'", async () => {
    env.GUEST_PITCHES = 'on'
    const ada = await openMember()
    const { id, agent } = await network(ada)
    const { id: launch } = await agent.call<{ id: string }>('createLaunch', { name: 'The Night Watch' })
    const destinations = [
      ['Crossfeed', '/app'],
      ['Dashboard', `/app/${id}`],
      ['Launches', `/app/${id}/launches`],
      ['Roster', `/app/${id}/roster`],
      ['Inbox', `/app/${id}/inbox`],
      ['Settings', `/app/${id}/settings`]
    ]
    for (const [path, current, page] of [
      [`/app/${id}`, 'Dashboard', 'page'],
      [`/app/${id}/launches`, 'Launches', 'page'],
      [`/app/${id}/launches/${launch}`, 'Launches', 'true']
    ]) {
      const html = await (await ada.fetch(path)).text()
      expect(navLinks(html), path).toEqual(
        destinations.map(([name, href]) => [name, href, name === current ? page : undefined])
      )
    }
    // /app lands on the dashboard.
    const res = await ada.fetch('/app', { redirect: 'manual' })
    expect(res.headers.get('location')).toBe(`/app/${id}`)
    expect(await (await ada.fetch(`/app/${id}`)).text()).toContain('data-page="dashboard"')
    expect(await (await ada.fetch(`/app/${id}/launches`)).text()).toContain('data-page="launches"')
  })

  it("lists a launch the network's agent reports on the Launches page, with its status, plan, and last run, and nothing of the network's lines or setup", async () => {
    const ada = await openMember()
    const { id, agent } = await network(ada)
    expect(words(await launchesPage(ada, id, agent.state()))).toBe('Launches No launches yet. New launch')
    const state: State = {
      ...agent.state()!,
      launches: [
        {
          id: 'l-1',
          name: 'The Night Watch',
          comps: [],
          status: 'order approved',
          finalists: 5,
          slots: 20,
          slotValue: 52_000,
          startedBy: 'Ada Programmer',
          lastRun: '2026-10-19T12:00:00Z'
        }
      ]
    }
    const html = await launchesPage(ada, id, state)
    // The header: the title, its one summary line, and New launch.
    expect(words(html)).toMatch(/^Launches 1 launch New launch Launch Status /)
    expect(words(html)).toContain('Approved 1 The Night Watch Order approved 5 20 $52,000 Oct 19 · Ada Programmer')
    expect(html).toContain(`href="/app/${id}/launches/l-1"`)
    expect(words(html)).not.toContain('No launches yet')
    expect(sections(html)).toEqual([])
  })
})

describe('settings', () => {
  const settings = async (member: Pick<Member, 'fetch'>, id: string, state: State | undefined) => {
    const { network, memberId, members, invites, apiKeys, usage, qlooKey } = await island(member, `/app/${id}/settings`)
    return renderToStaticMarkup(
      <Settings
        state={state}
        network={network}
        memberId={memberId}
        members={members}
        invites={invites}
        apiKeys={apiKeys}
        usage={usage}
        qlooKey={qlooKey}
      />
    )
  }

  it("label the guest network's sample data once, beside the title, as its dashboard does, and say the sample CPM is arbitrary until an owner sets one (ADR 0007)", async () => {
    env.SAMPLE_NETWORK = 'on'
    fakeQloo({ search: {} })
    const guest = await openGuest()
    const agent = await connect(guest, 'guest-network')
    const loaded = await agent.until((s) => s.sample !== null && s.roster.every((r) => r.resolution !== 'pending'))
    const board = await dashboard(guest, 'guest-network', loaded)
    expect(sampleLabels(board)).toEqual(['h1: Dashboard'])
    expect(words(board)).toContain('CPM $20 per 1,000 downloads Change')
    expect(sampleLabels(await launchesPage(guest, 'guest-network', loaded))).toEqual(['h1: Launches'])
    const page = await settings(guest, 'guest-network', loaded)
    expect(sampleLabels(page)).toEqual(['h1: Settings'])
    expect(words(page)).toContain(
      'Dollars per 1,000 downloads. An arbitrary sample figure until an owner sets the network’s own.'
    )
    // A member's own network has no sample data to label.
    const ada = await openMember()
    const { id, agent: own } = await network(ada)
    expect(sampleLabels(await dashboard(ada, id, own.state()))).toEqual([])
    expect(sampleLabels(await launchesPage(ada, id, own.state()))).toEqual([])
    expect(sampleLabels(await settings(ada, id, own.state()))).toEqual([])

    const res = await guest.fetch('/app/guest-network/settings/network', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Guest network', cpm: 25 })
    })
    expect(res.status).toBe(200)
    const set = await agent.until((s) => s.cpm === 25)
    expect(words(await dashboard(guest, 'guest-network', set))).toContain('CPM $25 per 1,000 downloads Change')
    // The CPM's sample label goes; the sample data module stays.
    expect(words(await settings(guest, 'guest-network', set))).toContain('Dollars per 1,000 downloads. Save')
    // The sample roster's figures are still the sample's, so the pages' badges stay (#337).
    expect(set.sample).toMatchObject({ cpm: false })
    expect(sampleLabels(await dashboard(guest, 'guest-network', set))).toEqual(['h1: Dashboard'])
    expect(sampleLabels(await settings(guest, 'guest-network', set))).toEqual(['h1: Settings'])
  })

  it("keep the guest network's CPM the sample's over a roster import, whether it keeps a sample show or none, until an owner sets another, which leaves no sample once no show holds a sample figure (#287, #337)", async () => {
    env.SAMPLE_NETWORK = 'on'
    fakeQloo({ search: {} })
    const guest = await openGuest()
    const agent = await connect(guest, 'guest-network')
    await agent.until((s) => s.roster.length > 0 && s.roster.every((r) => r.resolution !== 'pending'))
    // The settings' CPM field, as an owner reads it: its value, and the line under it.
    const cpmField = async (state: State) => {
      const html = await settings(guest, 'guest-network', state)
      const value = html.match(/<input\b(?=[^>]*\sid="set-cpm")[^>]*?\svalue="([^"]*)"/)?.[1]
      return `$${value} ${words(html).match(/Dollars per 1,000 downloads\.(?: An arbitrary [^.]*\.)?/)?.[0]}`
    }
    const labelled =
      '$20 Dollars per 1,000 downloads. An arbitrary sample figure until an owner sets the network’s own.'

    // The Watch stays, its figures the sample's; Night Shift Cinema is new.
    const kept = await agent.importRoster('The Watch\nNight Shift Cinema')
    expect(kept).toMatchObject({ cpm: 20, sample: { cpm: true } })
    expect(kept.roster.map((s) => [s.name, s.sample])).toEqual([
      ['The Watch', ['downloads', 'status', 'description']],
      ['Night Shift Cinema', undefined]
    ])
    expect(await cpmField(kept)).toBe(labelled)
    expect(words(await dashboard(guest, 'guest-network', kept))).toContain('CPM $20 per 1,000 downloads Change')

    // No show of the sample's is left.
    const own = await agent.importRoster('Night Shift Cinema')
    expect(own).toMatchObject({ cpm: 20, sample: { cpm: true } })
    expect(await cpmField(own)).toBe(labelled)

    // An owner's own CPM drops the label, and with it the last of the sample: the dashboard and settings
    // lose their badge (#337).
    const setCpm = async (cpm: number) => {
      const res = await guest.fetch('/app/guest-network/settings/network', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Guest network', cpm })
      })
      expect(res.status).toBe(200)
      return agent.until((s) => s.cpm === cpm)
    }
    const set = await setCpm(25)
    expect(set.sample).toBeNull()
    expect(await cpmField(set)).toBe('$25 Dollars per 1,000 downloads.')
    expect(sampleLabels(await dashboard(guest, 'guest-network', set))).toEqual([])
    expect(sampleLabels(await settings(guest, 'guest-network', set))).toEqual([])
    // An import brings no sample figure back, The Watch's included, and keeps the CPM.
    const again = await agent.importRoster('Night Shift Cinema\nThe Watch')
    expect(again).toMatchObject({ cpm: 25, sample: null })
    expect(again.roster.map((s) => [s.name, s.sample])).toEqual([
      ['Night Shift Cinema', undefined],
      ['The Watch', undefined]
    ])
    expect(await cpmField(again)).toBe('$25 Dollars per 1,000 downloads.')
    // And $20 is the owner's own from then on.
    const twenty = await setCpm(20)
    expect(twenty.sample).toBeNull()
    expect(await cpmField(twenty)).toBe('$20 Dollars per 1,000 downloads.')
    expect(sampleLabels(await dashboard(guest, 'guest-network', twenty))).toEqual([])
    expect(sampleLabels(await settings(guest, 'guest-network', twenty))).toEqual([])
  })

  it("keep the guest network's sample badges over an owner's CPM while a show holds a sample figure, and the CPM's label over the same $20 (#337)", async () => {
    env.SAMPLE_NETWORK = 'on'
    fakeQloo({ search: {} })
    const guest = await openGuest()
    const agent = await connect(guest, 'guest-network')
    await agent.until((s) => s.roster.length > 0 && s.roster.every((r) => r.resolution !== 'pending'))
    const setCpm = (cpm: number) =>
      guest.fetch('/app/guest-network/settings/network', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Guest network', cpm })
      })
    // The sample's own $20 set again is still the sample's.
    expect((await setCpm(20)).status).toBe(200)
    const kept = await agent.importRoster('The Watch\nNight Shift Cinema')
    expect(kept).toMatchObject({ cpm: 20, sample: { cpm: true } })

    expect((await setCpm(25)).status).toBe(200)
    const set = await agent.until((s) => s.cpm === 25)
    expect(set.sample).toMatchObject({ network: 'The Ringer', cpm: false })
    expect(sampleLabels(await dashboard(guest, 'guest-network', set))).toEqual(['h1: Dashboard'])
    expect(sampleLabels(await settings(guest, 'guest-network', set))).toEqual(['h1: Settings'])
    expect(
      sampleLabels(
        renderToStaticMarkup(<NetworkRoster agent={{ state: set, stub: {} } as unknown as NetworkConnection} />)
      )
    ).toEqual(['h1: Roster'])
  })

  it("drop the guest network's sample badges once a show edit changes the last sample figure under an owner's CPM (#337)", async () => {
    env.SAMPLE_NETWORK = 'on'
    fakeQloo({ search: {} })
    const guest = await openGuest()
    const agent = await connect(guest, 'guest-network')
    await agent.until((s) => s.roster.length > 0 && s.roster.every((r) => r.resolution !== 'pending'))
    // A show edit can't change a description, so an import brings The Watch's.
    const own = await agent.importRoster('name,description\nThe Watch,Our TV show', 'csv')
    expect(own.roster).toMatchObject([{ name: 'The Watch', status: 'active', sample: ['downloads', 'status'] }])
    const res = await guest.fetch('/app/guest-network/settings/network', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Guest network', cpm: 25 })
    })
    expect(res.status).toBe(200)
    expect(await agent.until((s) => s.cpm === 25)).toMatchObject({ sample: { cpm: false } })

    // Its status is still the sample's.
    await agent.call('updateShow', 'The Watch', { downloads: 41_000, status: 'active' })
    const one = agent.state()!
    expect(one.roster).toMatchObject([{ name: 'The Watch', sample: ['status'] }])
    expect(one.sample).toMatchObject({ cpm: false })
    expect(sampleLabels(await dashboard(guest, 'guest-network', one))).toEqual(['h1: Dashboard'])

    await agent.call('updateShow', 'The Watch', { downloads: 42_000, status: 'hiatus' })
    const none = agent.state()!
    expect(none.roster).toMatchObject([{ name: 'The Watch', downloads: 42_000, status: 'hiatus', sample: [] }])
    expect(none.sample).toBeNull()
    expect(sampleLabels(await dashboard(guest, 'guest-network', none))).toEqual([])
    expect(sampleLabels(await settings(guest, 'guest-network', none))).toEqual([])
  })

  it('stand each module in a tab of its own, in the order a new owner needs them, with every panel in the page', async () => {
    const ada = await openMember()
    const { id, agent } = await network(ada)
    // Kept mounted, every module's panel is in the page, so what's typed in one survives a switch to
    // another; the first shows until a tab, or the hash, picks another.
    expect(tabsOf(await settings(ada, id, agent.state()))).toEqual({
      label: 'Settings sections',
      tabs: ['Network', 'Members', 'API keys', 'Qloo key', 'Usage', 'Danger zone'],
      panels: ['shown', 'hidden', 'hidden', 'hidden', 'hidden', 'hidden']
    })
    // The guest network's adds its sample data before the danger zone.
    const guest = await openGuest()
    const theirs = await settings(
      guest,
      'guest-network',
      await (await connect(guest, 'guest-network')).until(() => true)
    )
    expect(tabsOf(theirs).tabs).toEqual([
      'Network',
      'Members',
      'API keys',
      'Qloo key',
      'Usage',
      'Sample data',
      'Danger zone'
    ])
  })

  it('head each module with one sentence of what it holds, and put the rest by what it’s about', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-19T14:30:00Z'))
    const ada = await openMember()
    const { id, agent } = await network(ada)
    const html = await settings(ada, id, agent.state())
    expect(sections(html)).toEqual([
      [
        'Network',
        'The name your members see, and the CPM that prices every promo slot: downloads per episode × CPM ÷ 1,000.'
      ],
      ['Members', 'Everyone who can open Night Shift Audio.'],
      [
        'Invite links',
        'Each link lets one person join as a member, with a new account or the one they have, and works once, for seven days.'
      ],
      [
        'API keys',
        'Each key lets a script or an assistant act for Night Shift Audio through Crossfeed’s API, short of approving anything: only a member approves an insertion order or a reply, in the app.'
      ],
      [
        'Qloo key',
        'During the beta, Night Shift Audio’s Qloo calls run on Crossfeed’s shared key, within its daily caps, unless it has a key of its own.'
      ],
      ['Usage Beta', 'What Night Shift Audio can use each UTC day, whichever member or API key uses it.'],
      ['Danger zone', 'Deleting Night Shift Audio wipes it for every member, and it can’t be brought back.']
    ])
    const read = words(html)
    // What a key of its own changes is under its field, what each cap counts beside its figure, and what
    // deleting the network wipes under the field that confirms it.
    expect(html).toMatch(/<input\b(?=[^>]*\sid="qloo-key")(?=[^>]*\saria-describedby="qloo-key-what")/)
    expect(html).toMatch(
      /id="qloo-key-what"[^>]*>Night Shift Audio’s Qloo calls and its launches’ then run on it, under its own agreement with Qloo, with a cache and Qloo caps of their own\. Model runs count against Crossfeed’s caps either way\.</
    )
    expect(read).toContain(
      'Model runs 0 of 10 today Launch runs, inbox loads, and pitch runs Qloo calls 0 of 2,000 today Cached answers included Resets 00:00 UTC, in 9 h 30 min'
    )
    expect(read).toContain('Crossfeed’s caps across every network apply as well.')
    expect(html).toMatch(/<input\b(?=[^>]*\sid="delete-name")(?=[^>]*\saria-describedby="delete-what")/)
    expect(html).toMatch(
      /id="delete-what"[^>]*>Its roster, CPM, inbox, and launches go, with every run, insertion order, and Qloo record behind them, and its invite links and API keys\.</
    )
  })

  it("give an owner the network's name and CPM to change", async () => {
    const ada = await openMember()
    const { id, agent } = await network(ada)
    const html = await settings(ada, id, agent.state())
    expect(words(html)).toContain('Network The name your members see, and the CPM that prices every promo slot')
    expect(html).toMatch(/<input\b(?=[^>]*\sid="set-name")(?=[^>]*\svalue="Night Shift Audio")/)
    expect(html).toMatch(/<input\b(?=[^>]*\sid="set-cpm")(?=[^>]*\splaceholder="Not set")/)
    expect(words(html)).toContain('Save')
  })

  it("say in the title row whether the network's agent is connecting or reconnecting", async () => {
    const ada = await openMember()
    const { id, agent } = await network(ada)
    const page = await island(ada, `/app/${id}/settings`)
    const read = (state: State | undefined, reconnecting = false) =>
      words(renderToStaticMarkup(<Settings {...page} state={state} connection={{ lost: null, reconnecting }} />))
    expect(read(undefined)).toMatch(
      /^Settings You’re an owner of this network\. Working Connecting to the network… Network /
    )
    expect(read(agent.state(), true)).toMatch(/^Settings You’re an owner of this network\. Reconnecting… Network /)
    expect(read(agent.state())).toMatch(/^Settings You’re an owner of this network\. Network /)
  })

  it('show a member the same settings read-only', async () => {
    const ada = await openMember()
    const { id } = await network(ada)
    await ada.fetch(`/app/${id}/settings/network`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Night Shift Audio', cpm: 18.5 })
    })
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(id) })
    const html = await settings(grace, id, await (await connect(grace, id)).until((s) => s.cpm === 18.5))
    expect(html).not.toContain('<input')
    expect(html).not.toContain('Save')
    expect(words(html)).toContain('Name Night Shift Audio CPM $18.5 Only an owner can change these.')
  })

  it("list the network's members for an owner, with their roles, dates, and what the owner can change", async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-19T12:00:00Z'))
    const ada = await openMember()
    const { id, agent } = await network(ada)
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'))
    await openMember({ name: 'Grace Booker', invite: await ada.invite(id) })
    await ada.invite(id)

    const read = words(await settings(ada, id, agent.state()))
    expect(read).toContain('Members Everyone who can open Night Shift Audio.')
    expect(read).toContain(
      'Member Role Joined Actions Ada Programmer You Owner Oct 19 Leave Grace Booker Member Oct 20 Make owner Remove'
    )
    expect(read).toContain('You’re the only owner. Make someone else an owner before you leave.')
    expect(read).toContain('Invite links Each link lets one person join as a member')
    expect(read).toContain('Create invite link Made Oct 20 by Ada Programmer Expires Oct 27 Revoke')
    // What a change of role, a removal or leaving revokes is said in the confirm that asks for it.
    expect(read).not.toContain('loses the API keys and invite links they made')
    expect(await settings(ada, id, agent.state())).toMatch(/<button[^>]*disabled=""[^>]*>Leave<\/button>/)
  })

  it('show a member who is in the network, with only their own Leave, and no invite links', async () => {
    const ada = await openMember()
    const { id } = await network(ada)
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(id) })
    const html = await settings(grace, id, await (await connect(grace, id)).until(() => true))
    const read = words(html)
    expect(read).toContain('Ada Programmer Owner')
    expect(read).toMatch(/Grace Booker You Member \w{3} \d{1,2} Leave/)
    expect(read).toContain('Only an owner can invite people, change roles, or remove members.')
    expect(read).not.toContain('Make owner')
    expect(read).not.toContain('Remove')
    expect(read).not.toContain('Invite links')
    expect(html).not.toMatch(/disabled=""[^>]*>Leave/)
  })

  it("leave the shell's top bar the one banner, and name each region once, as the dashboard and a lost page do", async () => {
    const ada = await openMember()
    const { id, agent } = await network(ada)
    await ada.fetch(`/app/${id}/settings/api-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Nightly sync' })
    })
    const { network: page } = await island(ada, `/app/${id}`)
    const lost = renderToStaticMarkup(<LostAccess network={page} reason="You're no longer a member of this network." />)
    for (const html of [await dashboard(ada, id, agent.state()), await settings(ada, id, agent.state()), lost]) {
      expect(html).not.toContain('<header')
      const named = regions(html)
      expect(named.length).toBeGreaterThan(0)
      expect(new Set(named).size).toBe(named.length)
    }
  })

  it("list an owner's API keys by name, prefix, maker, and dates, each with Revoke", async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-19T12:00:00Z'))
    const ada = await openMember()
    const { id, agent } = await network(ada)
    const created = await ada.fetch(`/app/${id}/settings/api-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Nightly sync' })
    })
    const { secret } = await created.json<{ secret: string }>()
    vi.setSystemTime(new Date('2026-10-21T09:30:00Z'))
    await api(secret)(`/api/v1/networks/${id}`)

    const html = await settings(ada, id, agent.state())
    const read = words(html)
    expect(read).toContain('API keys Each key lets a script or an assistant act for Night Shift Audio')
    expect(read).toContain('Key name Create API key')
    expect(read).toContain(
      `Key Created Last used Actions Nightly sync ${secret.slice(0, 12)}… Oct 19 by Ada Programmer Oct 21 Revoke`
    )
    expect(read).toContain(`Programs name this network by its ID, ${id} .`)
    expect(html).not.toContain(secret)
    expect(html).toContain('href="/api/v1/openapi.json"')
  })

  it("show a member that API keys are an owner's to make, and none of them", async () => {
    const ada = await openMember()
    const { id } = await network(ada)
    await ada.fetch(`/app/${id}/settings/api-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Nightly sync' })
    })
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(id) })
    const read = words(await settings(grace, id, await (await connect(grace, id)).until(() => true)))
    expect(read).toContain('API keys Each key lets a script or an assistant act for Night Shift Audio')
    expect(read).toContain('Only an owner can create and revoke API keys.')
    expect(read).not.toContain('Nightly sync')
    expect(read).not.toContain('Create API key')
  })

  it("show every member today's usage against the network's caps, and when they reset", async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-19T14:30:00Z'))
    const ada = await openMember()
    const { id, agent } = await network(ada)
    fakeQloo({ search: { 'Corner Booth': [{ entity_id: 'e-0501', name: 'Corner Booth', popularity: 0.6 }] } })
    await agent.importRoster('Corner Booth')
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(id) })

    for (const member of [ada, grace]) {
      const read = words(await settings(member, id, agent.state()))
      expect(read).toContain(
        'Usage Beta What Night Shift Audio can use each UTC day, whichever member or API key uses it.'
      )
      expect(read).toContain(
        'Model runs 0 of 10 today Launch runs, inbox loads, and pitch runs Qloo calls 1 of 2,000 today Cached answers included Resets 00:00 UTC, in 9 h 30 min'
      )
    }
    env.QLOO_VISITOR_DAILY_CALL_CAP = '1'
    expect(words(await settings(ada, id, agent.state()))).toContain(
      'Qloo calls 1 of 1 today Cached answers included Resets 00:00 UTC, in 9 h 30 min Limit reached No more Qloo calls today: roster imports and comp searches are refused until 00:00 UTC.'
    )
  })

  it("give an owner the network's own Qloo key to add, then show it by its last four characters", async () => {
    const ada = await openMember()
    const { id, agent } = await network(ada)
    const html = await settings(ada, id, agent.state())
    const read = words(html)
    expect(read).toContain(
      'Qloo key During the beta, Night Shift Audio’s Qloo calls run on Crossfeed’s shared key, within its daily caps, unless it has a key of its own.'
    )
    expect(read).toContain(
      'Host Qloo’s production API api.qloo.com Qloo’s hackathon API hackathon.api.qloo.com, where hackathon keys work Key Night Shift Audio’s Qloo calls and its launches’ then run on it'
    )
    expect(html).toMatch(/<input\b(?=[^>]*\stype="password")(?=[^>]*\sid="qloo-key")/)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Test and save key<\/button>/)

    fakeQloo({ search: { 'Corner Booth': [{ entity_id: 'e-0501', name: 'Corner Booth', popularity: 0.6 }] } })
    const added = await ada.fetch(`/app/${id}/settings/qloo-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: 'https://hackathon.api.qloo.com', key: 'qk-made-up-7f3a' })
    })
    expect(added.status).toBe(200)
    await agent.importRoster('Corner Booth')
    const keyed = await settings(ada, id, agent.state())
    expect(words(keyed)).toContain('a key of its own. Key Ends in 7f3a Host hackathon.api.qloo.com Remove key')
    // The key's test search and the lookup, both on the network's key, as the dashboard says too.
    expect(words(keyed)).toContain('Qloo calls 2 of 2,000 today On the network’s own Qloo key')
    const board = await dashboard(ada, id, agent.state())
    expect(words(board)).toContain('Qloo calls 2 of 2,000 today On the network’s own Qloo key, cached answers included')
    expect(keyed).not.toContain('qk-made-up-7f3a')
    expect(board).not.toContain('7f3a')
    expect(keyed).not.toContain('Test and save key')

    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(id) })
    const theirs = words(await settings(grace, id, await (await connect(grace, id)).until(() => true)))
    expect(theirs).toContain(
      'a key of its own. Qloo key The network’s own Only an owner can add or remove the network’s Qloo key.'
    )
    expect(theirs).not.toContain('7f3a')
    expect(theirs).not.toContain('Remove key')
  })

  it("show a member that the network runs on Crossfeed's shared Qloo key, with nothing to change", async () => {
    const ada = await openMember()
    const { id } = await network(ada)
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(id) })
    const html = await settings(grace, id, await (await connect(grace, id)).until(() => true))
    expect(words(html)).toContain(
      'a key of its own. Qloo key Crossfeed’s shared key Only an owner can add or remove the network’s Qloo key.'
    )
    expect(html).not.toContain('id="qloo-key"')
  })

  it('give an owner the danger zone, to delete the network once they type its name, and a member none of it', async () => {
    const ada = await openMember()
    const { id, agent } = await network(ada)
    const html = await settings(ada, id, agent.state())
    const read = words(html)
    expect(read).toContain('Danger zone Deleting Night Shift Audio wipes it for every member')
    expect(read).toContain('Type Night Shift Audio to delete it Its roster, CPM, inbox, and launches go')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Delete network<\/button>/)

    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(id) })
    const theirs = words(await settings(grace, id, await (await connect(grace, id)).until(() => true)))
    expect(theirs).toContain('Danger zone')
    expect(theirs).toContain('Only an owner can delete the network.')
    expect(theirs).not.toContain('Delete network')
  })

  it('show a guest the guest network’s settings as an owner’s, with nothing to change of the guest member’s own membership', async () => {
    const guest = await openGuest()
    const id = 'guest-network'
    const invited = await guest.fetch(`/app/${id}/settings/members/invites`, { method: 'POST' })
    const dot = await openMember({ name: 'Dot Pruitt', invite: (await invited.json<{ link: string }>()).link })
    const owner = await guest.fetch(`/app/${id}/settings/members/${dot.id}/role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'owner' })
    })
    expect(owner.status).toBe(200)
    const html = await settings(guest, id, await (await connect(guest, id)).until((s) => s.cpm === 20))
    const read = words(html)
    expect(read).toMatch(/^Settings You’re an owner of this network\. Network /)
    expect(html).toMatch(/<input\b[^>]*\svalue="Guest network"/)
    expect(read).toMatch(
      /Member Role Joined Actions Guest You Owner \w{3} \d{1,2} Dot Pruitt Owner \w{3} \d{1,2} Make member Remove You’re signed in as Guest, the account every guest shares, so you can’t leave or change its role\. Invite links/
    )
    expect(read).toContain('Key name Create API key')
    expect(read).toContain(
      'From then on it shows only its last four characters. Every guest shares a key added here, and sees its last four characters.'
    )
    expect(read).toContain('Type Guest network to delete it Its roster')
    expect(read).not.toContain('Only an owner')

    // A co-owner with an account can change the guest member's role, or remove it.
    const theirs = words(await settings(dot, id, await (await connect(dot, id)).until(() => true)))
    expect(theirs).toMatch(
      /Guest Owner \w{3} \d{1,2} Make member Remove Dot Pruitt You Owner \w{3} \d{1,2} Make member Leave/
    )
    expect(theirs).not.toContain('Every guest shares a key')
  })

  it("give the guest network's owners the sample data module, to reset it for every guest, and no other network's settings", async () => {
    const guest = await openGuest()
    const html = await settings(guest, 'guest-network', await (await connect(guest, 'guest-network')).until(() => true))
    const read = words(html)
    expect(read).toContain(
      'Sample data The guest network starts every day at 12:00 UTC from the sample data: The Ringer’s shows, the sample CPM, The Watch and the sample launches. Reset the sample data Resetting closes every guest’s open pages of the guest network. Every guest shares a few resets a day, and after one, the next may wait up to an hour. Danger zone'
    )
    expect(html).toMatch(/<button[^>]*>Reset the sample data<\/button>/)

    // A person a guest invited into the guest network, as a member, sees whose it is to do.
    const invited = await guest.fetch('/app/guest-network/settings/members/invites', { method: 'POST' })
    const dot = await openMember({ name: 'Dot Pruitt', invite: (await invited.json<{ link: string }>()).link })
    const theirs = await settings(dot, 'guest-network', await (await connect(dot, 'guest-network')).until(() => true))
    expect(words(theirs)).toContain('Sample data The guest network starts every day at 12:00 UTC from the sample data')
    expect(words(theirs)).toContain('Only an owner can reset the sample data.')
    expect(theirs).not.toMatch(/>Reset the sample data</)

    // A member's own network, and one a guest created, have no sample data.
    const ada = await openMember()
    const own = await network(ada)
    expect(words(await settings(ada, own.id, own.agent.state()))).not.toContain('Sample data')
    const created = await network(guest as unknown as Member, 'Guest Side Project')
    expect(words(await settings(guest, created.id, created.agent.state()))).not.toContain('Sample data')
  })

  it('keep the guest member the guest network’s owner while it’s the only one', async () => {
    const guest = await openGuest()
    const html = await settings(guest, 'guest-network', await (await connect(guest, 'guest-network')).until(() => true))
    expect(words(html)).toMatch(/Guest You Owner \w{3} \d{1,2} You’re signed in as Guest/)
    expect(html).not.toMatch(/>(Leave|Make member|Remove)</)
  })

  it('show every guest the guest budget’s usage today, in the guest network and a guest’s own, from any address or none', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-19T14:30:00Z'))
    env.GUEST_PITCHES = 'on'
    fakeQloo({
      search: {
        'Corner Booth': [{ entity_id: 'e-0501', name: 'Corner Booth', popularity: 0.6 }],
        'Night Ferry': [{ entity_id: 'e-0502', name: 'Night Ferry', popularity: 0.4 }]
      }
    })
    // The inbox load reads its one pitch, which pitches no public work.
    fakeClaude([turn(text(JSON.stringify({ guest: 'Ada Quill', work: null })))])
    const id = 'guest-network'
    // One guest imports a show and another searches for a comp for it, each from an address of their
    // own; a third, from none, loads an inbox.
    const from = async (ip?: string) => {
      const guest = await openGuest({ ip })
      const agent = await guest.connect(`/agents/network/${id}`, ip ? { 'CF-Connecting-IP': ip } : {})
      open.push(agent)
      return { guest, agent }
    }
    const ada = await from('203.0.113.7')
    await ada.agent.importRoster('Corner Booth')
    await (await from('2001:db8::1')).agent.searchComps('Corner Booth', 'Night Ferry')
    const someone = await from()
    await someone.agent.call('loadInbox', { text: 'From: Pat <pat@example.com>\nSubject: A guest\n\nAda Quill.' })
    const state = await someone.agent.until((s) => s.inbox?.status === 'done')

    // A fourth guest's own network counts on the same budget.
    const dot = await from('192.0.2.1')
    const own = (
      await (
        await dot.guest.fetch('/app/new', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Night Shift Audio' })
        })
      ).json<{ id: string }>()
    ).id
    for (const [{ guest }, network] of [
      [ada, id],
      [someone, id],
      [dot, id],
      [dot, own]
    ] as const) {
      expect((await island(guest, `/app/${network}/settings`)).usage).toEqual({
        modelRuns: { used: 1, limit: 10 },
        qlooCalls: { used: 2, limit: 2000 },
        resets: '2026-10-20T00:00:00.000Z'
      })
      const read = words(await settings(guest, network, state))
      expect(read).toContain(
        'Usage Beta What all guests together can use each UTC day, in the guest network and the networks guests create. Model runs'
      )
      expect(read).toContain(
        'Model runs 1 of 10 today Launch runs, inbox loads, and pitch runs Qloo calls 2 of 2,000 today Cached answers included Resets 00:00 UTC, in 9 h 30 min'
      )
    }
  })
})

// What a network's page shows of its agent's socket, the same on every network page: the dashboard
// here, as DashboardPage wraps it, which says so in its title row, each block's heading shown while its
// lines are on their way.
describe("a network page's connection", () => {
  const gated = async (
    connection: {
      state?: undefined
      identified?: boolean
      connectionError?: { code: number; reason: string }
    },
    leaving = false
  ) => {
    const ada = await openMember()
    const { id, agent } = await network(ada)
    const page = await island(ada, `/app/${id}`)
    const gate = { state: agent.state(), identified: true, connectionError: null, ...connection }
    return words(
      renderToStaticMarkup(
        <NetworkGate agent={gate} network={page.network} leaving={leaving}>
          <Dashboard
            {...page}
            state={gate.state}
            connection={connectionOf(gate)}
            dismiss={async () => {}}
            createLaunch={async () => ({ id: 'l-1' })}
          />
        </NetworkGate>
      )
    )
  }

  it('says it is connecting until the first state arrives', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-19T14:30:00Z'))
    const read = await gated({ state: undefined, identified: false })
    // Nothing to act on yet: New launch comes with Needs you's empty state, and Setup with the state
    // that says whether this member dismissed it. What the server read as the page loaded, today's
    // usage and the keys' use, shows at once.
    expect(read).toBe(
      'Dashboard Working Connecting to the network… Needs you Launches with a question to answer or an order to approve, and runs that failed or stopped. Latest runs The launches run last, with when each run started and who started it. All launches Today’s usage What Night Shift Audio can use each UTC day, whichever member or API key uses it. Model runs 0 of 10 today Launch runs, inbox loads, and pitch runs Qloo calls 0 of 2,000 today Cached answers included Resets 00:00 UTC, in 9 h 30 min As of 2:30 PM, when the page loaded. Assistants and API Scripts and assistants act for Night Shift Audio with its API keys, short of approving anything. Keys in use 0 No assistant or script has used a key yet. Open API keys Network The roster your launches rank, and the CPM that prices their slots.'
    )
  })

  it("says in its block that the keys' use or today's usage didn't load, logged, and opens the rest of the page", async () => {
    const ada = await openMember()
    const { id, agent } = await network(ada)
    // The directory's API keys can't be read: the page opens all the same, with no keys' use for it.
    await env.DB.prepare('DROP TABLE api_keys').run()
    const failed = vi.spyOn(console, 'error')
    const res = await ada.fetch(`/app/${id}`)
    expect(res.status).toBe(200)
    expect(
      failed.mock.calls
        .flat()
        .map(String)
        .filter((line) => line.includes('"event":"dashboard_read"'))
        .map((line) => JSON.parse(line))
    ).toEqual([{ event: 'dashboard_read', block: 'keys', error: expect.stringContaining('no such table: api_keys') }])
    failed.mockRestore()
    const page = await island(ada, `/app/${id}`)
    expect([page.keys, page.usage]).toEqual([null, expect.objectContaining({ modelRuns: { used: 0, limit: 10 } })])
    const render = (loaded: Partial<typeof page>) =>
      words(
        renderToStaticMarkup(
          <Dashboard
            {...page}
            {...loaded}
            state={agent.state()}
            dismiss={async () => {}}
            createLaunch={async () => ({ id: 'l-1' })}
          />
        )
      )
    const read = render({})
    expect(read).toContain(
      'Assistants and API Scripts and assistants act for Night Shift Audio with its API keys, short of approving anything. Error The API keys’ use didn’t load. Reload the page to try again. Open API keys Network'
    )
    expect(read).toMatch(
      /^Dashboard Setup 0 of 5 done .+ Nothing needs you\. Import a roster Latest runs .+ No runs yet\. .+ Model runs 0 of 10 today /
    )
    // Nor did today's usage, as when its gateway didn't answer.
    expect(render({ usage: null })).toContain(
      'Today’s usage What Night Shift Audio can use each UTC day, whichever member or API key uses it. Error Today’s usage didn’t load. Reload the page to try again. Assistants and API'
    )
  })

  it('says nothing of a connection that is up', async () => {
    const read = await gated({})
    expect(read).not.toContain('Reconnecting…')
    expect(read).toMatch(/^Dashboard Setup 0 of 5 done /)
  })

  it('says it is reconnecting while the socket is down, keeping what the page showed', async () => {
    const read = await gated({ identified: false })
    expect(read).toMatch(/^Dashboard Reconnecting… Setup 0 of 5 done /)
  })

  it('says a connection closed for good without a reason of its own is lost, keeping the page', async () => {
    const read = await gated({ connectionError: { code: 1008, reason: '' } })
    expect(read).toMatch(/^Dashboard Error This page lost its connection\. Reload to try again\. Setup 0 of 5 done /)
  })

  it("drops the page for the agent's reason when it shuts the member out, 4403, or the network is gone, 4410", async () => {
    for (const [code, reason] of [
      [4403, "You're no longer a member of this network."],
      [4410, 'This network was deleted.']
    ] as const) {
      const read = await gated({ connectionError: { code, reason } })
      expect(read).toBe(`Night Shift Audio Error ${reason} Open your networks`)
    }
  })

  it('keeps the page, saying its connection is lost, while it leaves for another, having sent the change that closed it, as a reset of the sample data does', async () => {
    const reason = 'The guest network was reset to the sample data.'
    const read = await gated({ connectionError: { code: 4410, reason } }, true)
    expect(read).toMatch(/^Dashboard Error This page lost its connection\. Reload to try again\. Setup 0 of 5 done /)
    expect(read).not.toContain(reason)
  })
})
