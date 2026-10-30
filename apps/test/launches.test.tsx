// A network's launches, each its own project: created from the Launches page on the network's agent,
// opened at its own page and agent, run on a copy of the network's roster, and reported back to the
// network's list as it changes. Each test drives a network through the Worker's routes and its
// agents' client protocol, or the Worker's own RPC to an agent, as the API will call it.
import { getAgentByName } from 'agents'
import {
  createExecutionContext,
  createScheduledController,
  evictDurableObject,
  runInDurableObject,
  waitOnExecutionContext
} from 'cloudflare:test'
import { env, exports } from 'cloudflare:workers'
import { http } from 'msw'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CrossfeedAgent, LaunchSummary, RunSnapshot, State } from '../src/agent'
import type { Session as Agent } from '../src/client/App'
import { EvidencePanel, namesOf } from '../src/client/Evidence'
import { LaunchCrumbs, LaunchWorkspace } from '../src/client/Launch'
import { Launches } from '../src/client/Launches'
import { LaunchReport } from '../src/client/Report'
import type { Evidence } from '../src/evidence'
import { globalGateway } from '../src/gateway'
import worker from '../src/index'
import { LaunchAgent } from '../src/launch-agent'
import { launchAgentName, NetworkAgent } from '../src/network-agent'
import { refusalCode } from '../src/refusal'
import type { KeptRun } from '../src/sample-launches'
import { networkLinks } from '../src/shell'
import {
  fakeClaude,
  fakeCompare,
  fakeDemographics,
  fakeInsights,
  fakeQloo,
  fakeQlooDown,
  fakeTopic,
  modelRequests,
  network as outbound,
  refusal,
  requests,
  text,
  toolUse,
  topicNames,
  turn,
  type ModelRequest
} from './fake'
import {
  readAfterReset,
  connect as connectVia,
  currentLinks,
  detailsToggle,
  facts,
  handoffLeaks,
  hooked,
  inspectorClosed,
  networkWithKey,
  openGuest,
  openMember,
  openSession,
  sampleLabels,
  sections,
  tabsOf,
  type Member,
  type Session
} from './session'

// A made-up network: Field Notes is ambiguous until settled, Ghost Signal isn't in Qloo until mapped
// to a comp, and Back Lot is left out. Night Shift Cinema, the launch, isn't on the roster.
const show = (entity_id: string, name: string) => [{ entity_id, name, popularity: 0.6 }]
const search = {
  'Night Shift Cinema': show('e-0001', 'Night Shift Cinema'),
  'The Long Take': show('e-0002', 'The Long Take'),
  'Corner Booth': show('e-0501', 'Corner Booth'),
  'Slow Burn': show('e-0502', 'Slow Burn'),
  'Paper Route': show('e-0503', 'Paper Route'),
  'Field Notes': [
    { entity_id: 'e-0101', name: 'Field Notes: Film', popularity: 0.6 },
    { entity_id: 'e-0102', name: 'Field Notes: Books', popularity: 0.3 }
  ],
  'Ghost Signal': [],
  'Ghost Signal Radio': show('e-0601', 'Ghost Signal Radio'),
  'Back Lot': show('e-0505', 'Back Lot')
}
const csv = `name,downloads
Corner Booth,48000
Slow Burn,40000
Paper Route,26000
Field Notes,17500
Ghost Signal,9000
Back Lot,12000`
// Made-up scores in fit order, unlike any other figure here.
const fit = [
  { entity_id: 'e-0501', name: 'Corner Booth', affinity: 0.913 },
  { entity_id: 'e-0502', name: 'Slow Burn', affinity: 0.902 },
  { entity_id: 'e-0503', name: 'Paper Route', affinity: 0.887 },
  { entity_id: 'e-0102', name: 'Field Notes: Books', affinity: 0.871 },
  { entity_id: 'e-0601', name: 'Ghost Signal Radio', affinity: 0.866 },
  { entity_id: 'e-0505', name: 'Back Lot', affinity: 0.85 }
]
// Qloo ranks only the candidates a request names, as it ranks a closed list, and each finalist
// shares a made-up tag with the launch.
const rankAsked = () => {
  fakeInsights((body) => fit.filter((r) => String(body['filter.results.entities']).split(',').includes(r.entity_id)))
  fakeCompare(
    Object.fromEntries(
      finalists.map((id) => [id, [{ tag_id: 'urn:tag:keyword:media:film', name: 'Film', score: 0.6131 }]])
    )
  )
}

// A launch run the way the agent plans one: resolve the launch, rank the roster, and end.
const resolve = (name: string) => toolUse('resolve_entities', { names: [name], type: 'urn:entity:podcast' })
const finalists = ['e-0501', 'e-0502', 'e-0503', 'e-0102', 'e-0601']
const rank = (anchor: string) =>
  toolUse('rank_candidates', { anchor_ids: [anchor], candidate_ids: finalists, type: 'urn:entity:podcast' })
const findTags = toolUse('shared_tags', { anchor_ids: ['e-0001'], candidate_ids: finalists })

const askBudget = toolUse('ask_human', { question: 'What is the slot budget?', kind: 'budget', options: [] })
const askExclusions = toolUse('ask_human', { question: 'Leave any shows out?', kind: 'exclusions', options: [] })
const draft = toolUse('draft_insertion_order', {
  lines: [
    { show: 'Corner Booth', slots: 8, angle: 'Late-night regulars stay up for the call-ins.' },
    { show: 'Slow Burn', slots: 6, angle: 'Its long interviews share the slow pace.' },
    { show: 'Paper Route', slots: 4, angle: 'Morning commuters who follow the same hosts.' },
    { show: 'Field Notes', slots: 2, angle: 'Shares the field-recording style.' }
  ]
})

const open: Omit<Session, 'cookie'>[] = []
const saved = {
  ACCOUNTS: env.ACCOUNTS,
  GUEST_PITCHES: env.GUEST_PITCHES,
  SAMPLE_NETWORK: env.SAMPLE_NETWORK,
  QLOO_DAILY_CALL_CAP: env.QLOO_DAILY_CALL_CAP,
  QLOO_VISITOR_DAILY_CALL_CAP: env.QLOO_VISITOR_DAILY_CALL_CAP
}
afterEach(() => {
  open.splice(0).forEach((agent) => agent.close())
  Object.assign(env, saved)
  vi.restoreAllMocks()
  vi.useRealTimers()
})

// A network the member creates, as /app/new does.
async function created(member: Member, name = 'Night Shift Audio') {
  const res = await member.fetch('/app/new', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  })
  if (res.status !== 200) throw new Error(`Creating ${name} returned ${res.status}: ${await res.text()}`)
  return (await res.json<{ id: string }>()).id
}
// An agent opened from one of the network's pages, such as its own at `/agents/network/<id>`.
async function connect(member: Pick<Member, 'connect'>, path: string, headers?: Record<string, string>) {
  const agent = await member.connect(path, headers)
  open.push(agent)
  return agent
}
// The made-up network's roster, imported and settled on its agent, and its CPM set in settings.
async function rosterOf(owner: Member, network: string, cpm = 25) {
  fakeQloo({ search })
  const agent = await connect(owner, `/agents/network/${network}`)
  await agent.importRoster(csv, 'csv')
  await agent.call('updateShow', 'Field Notes', { entityId: 'e-0102' })
  // A search the roster ends up not citing, then the one Ghost Signal is mapped from.
  await agent.searchComps('Ghost Signal', 'The Long Take')
  await agent.searchComps('Ghost Signal', 'Ghost Signal Radio')
  await agent.call('updateShow', 'Ghost Signal', { compId: 'e-0601' })
  await agent.call('updateShow', 'Back Lot', { excluded: true })
  await setCpm(owner, network, cpm)
  return agent
}
const setCpm = (owner: Member, network: string, cpm: number) =>
  owner.fetch(`/app/${network}/settings/network`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Night Shift Audio', cpm })
  })

// A new launch on the network, its page's agent opened.
async function launch(member: Member, network: string, input: object = { name: 'Night Shift Cinema' }) {
  const agent = await connect(member, `/agents/network/${network}`)
  const { id } = await agent.call<{ id: string }>('createLaunch', input)
  return { id, agent: await connect(member, `/agents/launch/${network}/${id}`) }
}

const ended = (s: State) => s.run !== null && !['running', 'waiting'].includes(s.run.status)
// Every call number the state cites, outside its list of runs.
const cited = ({ runs: _, ...state }: State) => [...new Set(JSON.stringify(state).match(/\bC-\d+\b/g))]

// Runs the Worker's scheduled handler as Cloudflare does at a cron in wrangler.jsonc: the daily one, or
// with `hourly`, the hourly one.
async function runCron({ hourly = false } = {}) {
  const handler: ExportedHandler<Env> = worker
  const ctx = createExecutionContext()
  await handler.scheduled!(createScheduledController({ cron: hourly ? '0 0-11,13-23 * * *' : '0 12 * * *' }), env, ctx)
  await waitOnExecutionContext(ctx)
}

// A member of `network` besides its owner, who signs up through the owner's invite link.
const teammate = async (owner: Member, network: string, name = 'Grace Booker') =>
  openMember({ name, invite: await owner.invite(network) })

describe('creating a launch', () => {
  it("adds it to the network's list, newest first, by name or by comps, and every member sees it at once", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const grace = await teammate(ada, network)
    const adas = await connect(ada, `/agents/network/${network}`)
    const graces = await connect(grace, `/agents/network/${network}`)

    const { id } = await adas.call<{ id: string }>('createLaunch', { name: ' The Night Watch ' })
    const fresh = {
      status: 'new',
      finalists: 0,
      slots: null,
      slotValue: null,
      startedBy: null,
      lastRun: null,
      finalistShows: [],
      approvedLines: null,
      draftLines: null
    }
    expect((await graces.until((s) => s.launches?.length === 1)).launches).toEqual([
      { id, name: 'The Night Watch', comps: [], ...fresh }
    ])

    const { id: second } = await graces.call<{ id: string }>('createLaunch', {
      comps: ['Blank Check', ' Filmspotting', '', 'blank check']
    })
    expect((await adas.until((s) => s.launches?.length === 2)).launches).toEqual([
      { id: second, name: null, comps: ['Blank Check', 'Filmspotting'], ...fresh },
      { id, name: 'The Night Watch', comps: [], ...fresh }
    ])
    expect(second).not.toBe(id)
  })

  it('never shows a member a listed launch without what it was planned with, not even for a moment', async () => {
    const reports = vi.spyOn(NetworkAgent.prototype, 'reportLaunch')
    const ada = await openMember()
    const network = await created(ada)
    const adas = await connect(ada, `/agents/network/${network}`)
    const names = ['The Night Watch', 'Paper Moons', 'Slow Burn']
    for (const name of names) await adas.call('createLaunch', { name })
    // Each launch's agent reports its row once it's planned, and the list is settled once all three
    // have; each report reaches the member as a state change, so the check runs on each.
    await adas.until(() => names.every((name) => reports.mock.calls.some(([, s]) => s.name === name)))

    const listed = adas
      .frames()
      .map((f) => JSON.parse(f))
      .filter((m) => m.type === 'cf_agent_state')
      .flatMap((m: { state: State }) => m.state.launches ?? [])
    expect(listed.filter((l) => l.name === null)).toEqual([])
    expect(reports.mock.calls.filter(([, s]) => s.name === null && s.comps.length === 0)).toEqual([])
  })

  it('refuses a launch with no name, no comps, or more than three comps, and lists nothing', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const agent = await connect(ada, `/agents/network/${network}`)
    for (const [input, error] of [
      [{ name: '  ' }, 'Name the launch to plan it.'],
      [{ comps: ['', ' '] }, 'Name at least one comp to plan it.'],
      [{ comps: ['A', 'B', 'C', 'D'] }, '4 comps is over the limit of 3.'],
      [null, 'Name the launch to plan it.']
    ] as const)
      await expect(agent.call('createLaunch', input), JSON.stringify(input)).rejects.toThrow(error)
    // The API, calling over RPC, reads why from the refusal's code.
    const rpc = await getAgentByName(env.NetworkAgent, network)
    const refused = await (async () => rpc.createLaunch({ name: ' ' }))().catch((e: unknown) => e)
    expect(refusalCode(refused)).toBe('invalid')
    expect(agent.state()!.launches).toEqual([])
  })
})

describe("a launch's page and agent", () => {
  it("open for each of the network's members, the page under the Launches page and the agent the launch's own", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const grace = await teammate(ada, network)
    const adas = await connect(ada, `/agents/network/${network}`)
    const { id } = await adas.call<{ id: string }>('createLaunch', { name: 'The Night Watch' })

    for (const [member, role] of [
      [ada, 'owner'],
      [grace, 'member']
    ] as const) {
      const res = await member.fetch(`/app/${network}/launches/${id}`)
      expect(res.status).toBe(200)
      expect(res.headers.get('cache-control')).toBe('no-store')
      const html = await res.text()
      const root = html.match(/<div id="root"([^>]*)>/)![1]
      for (const attribute of [
        'data-page="launch"',
        `data-agent-path="/agents/launch/${network}/${id}"`,
        `data-network-id="${network}"`,
        'data-network-name="Night Shift Audio"',
        `data-role="${role}"`,
        `data-roster-link="/app/${network}/roster"`,
        `data-settings-link="/app/${network}/settings"`,
        `data-orders-link="/app/${network}/launches/${id}/insertion-orders"`,
        `data-reports-link="/app/${network}/launches/${id}/report"`
      ])
        expect(root).toContain(attribute)
      // A launch belongs to the Launches page, which lists it: the shell's one nav marks Launches, and
      // the top bar's Launches leads back to the list.
      expect(html.match(/<nav\b/g)).toHaveLength(1)
      expect(currentLinks(html)).toEqual([['Launches', `/app/${network}/launches`, 'true']])
      expect(html).toMatch(new RegExp(`<a href="/app/${network}/launches"[^>]*>Launches</a>`))
      // The top bar keeps an empty slot after Launches, which the island fills with the launch's name.
      expect(html).toMatch(/<li\b[^>]*\sid="shell-launch"[^>]*><\/li>/)

      const launch = await connect(member, `/agents/launch/${network}/${id}`)
      expect(launch.state()!.launch).toEqual({ name: 'The Night Watch', match: null, comps: [] })
      expect(launch.state()!.roster).toEqual([])
    }
  })

  it("answer 404 for a launch not in the network's list, another network's launch, and anyone not a member", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const { id } = await (
      await connect(ada, `/agents/network/${network}`)
    ).call<{ id: string }>('createLaunch', {
      name: 'The Night Watch'
    })
    const other = await created(ada, 'Day Shift Audio')
    const { id: elsewhere } = await (
      await connect(ada, `/agents/network/${other}`)
    ).call<{ id: string }>('createLaunch', { name: 'The Day Watch' })
    const stranger = await openMember({ name: 'Mal Stranger' })

    for (const [member, path] of [
      [ada, `${network}/${crypto.randomUUID()}`],
      [ada, `${network}/${elsewhere}`],
      [ada, `${other}/${id}`],
      [ada, `${network}/not-a-launch`],
      [stranger, `${network}/${id}`]
    ] as const) {
      const page = await member.fetch(`/app/${path.replace('/', '/launches/')}`)
      expect(page.status, path).toBe(404)
      await expect(member.connect(`/agents/launch/${path}`), path).rejects.toThrow('did not upgrade: 404')
    }
    // Only a WebSocket upgrade from one of the app's pages gets through.
    expect((await ada.fetch(`/agents/launch/${network}/${id}`)).status).toBe(404)
    await expect(ada.connect(`/agents/launch/${network}/${id}`, { Origin: 'https://elsewhere.test' })).rejects.toThrow(
      'did not upgrade: 404'
    )
  })
})

describe("a launch's pages for a member who goes", () => {
  const gone = { code: 4403, reason: "You're no longer a member of this network." }
  const post = (member: Member, path: string) => member.fetch(path, { method: 'POST' })

  it("close with the network's when an owner removes them or they leave, and only theirs", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const grace = await teammate(ada, network)
    const lin = await teammate(ada, network, 'Lin Editor')
    const adas = await connect(ada, `/agents/network/${network}`)
    const launches = await Promise.all(
      ['The Night Watch', 'The Day Watch'].map((name) => adas.call<{ id: string }>('createLaunch', { name }))
    )
    const pages = async (member: Member) =>
      Promise.all(launches.map(({ id }) => connect(member, `/agents/launch/${network}/${id}`)))
    const [graces, lins, owners] = [await pages(grace), await pages(lin), await pages(ada)]

    expect((await post(ada, `/app/${network}/settings/members/${grace.id}/remove`)).status).toBe(200)
    for (const page of graces) expect(await page.closed()).toEqual(gone)
    expect((await post(lin, `/app/${network}/settings/members/leave`)).status).toBe(200)
    for (const page of lins) expect(await page.closed()).toEqual(gone)
    for (const member of [grace, lin])
      await expect(member.connect(`/agents/launch/${network}/${launches[0].id}`)).rejects.toThrow(
        'did not upgrade: 404'
      )

    // The owner's own launch pages stay connected.
    await expect(owners[0].call('importRoster', 'Deep Cuts')).rejects.toThrow("A launch ranks its network's roster")
  })
})

describe("a launch's agent", () => {
  it('refuses roster and inbox actions, from its page or over RPC, and changes nothing', async () => {
    env.GUEST_PITCHES = 'on'
    const ada = await openMember()
    const network = await created(ada)
    const { id } = await (
      await connect(ada, `/agents/network/${network}`)
    ).call<{ id: string }>('createLaunch', {
      name: 'The Night Watch'
    })
    const page = await connect(ada, `/agents/launch/${network}/${id}`)
    const rpc = await getAgentByName(env.LaunchAgent, `${network}:${id}`)
    const before = page.state()
    const roster =
      "A launch ranks its network's roster, which members edit on the network's roster page. Each run copies the roster as it starts."
    const inbox = "A launch has no inbox: guest pitches go to the network's inbox, on its own page."
    for (const [method, args, error] of [
      ['importRoster', ['Deep Cuts'], roster],
      ['searchComps', ['Deep Cuts', 'Deep Cuts'], roster],
      ['updateShow', ['Deep Cuts', { excluded: true }], roster],
      ['setCpm', [20], "A launch's runs take the network's CPM, which an owner changes in its settings."],
      ['loadInbox', [{ text: 'From: Pat <pat@example.com>\n\nA pitch.' }], inbox],
      ['confirmWork', ['pitch-01', 'b-0001'], inbox],
      ['startPitches', [{ show: 'Deep Cuts', pastGuests: [] }], inbox],
      ['editReply', ['pitch-01', 'Thanks!'], inbox],
      ['approveReply', ['pitch-01'], inbox],
      ['discardReply', ['pitch-01'], inbox]
    ] as const)
      await expect(page.call(method, ...args), method).rejects.toThrow(error)
    // The same methods refuse the Worker's RPC, as the API will call them.
    const asApi = rpc as unknown as { importRoster: (text: string) => Promise<void> }
    await expect((async () => asApi.importRoster('Deep Cuts'))()).rejects.toThrow(roster)
    expect(page.state()).toEqual(before)
    expect(requests).toEqual([])
    expect(modelRequests()).toEqual([])
  })
})

describe("a launch's run", () => {
  it("ranks the network's roster and CPM as they stood when the run started, and the next run takes them anew", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const roster = await rosterOf(ada, network)
    const atStart = roster.state()!.roster
    rankAsked()
    const held = Promise.withResolvers<void>()
    fakeClaude([
      async () => {
        await held.promise
        return turn(resolve('Night Shift Cinema'))
      },
      turn(rank('e-0001')),
      turn(text('Ranked.')),
      turn(resolve('Night Shift Cinema')),
      turn(rank('e-0001')),
      turn(text('Ranked again.'))
    ])
    const { agent } = await launch(ada, network)

    await agent.call('startLaunch', { name: 'Night Shift Cinema' })
    // The network's roster and CPM change while the run is under way.
    await roster.call('updateShow', 'Corner Booth', { excluded: true })
    await setCpm(ada, network, 30)
    held.resolve()
    const first = await agent.until(ended)

    const kept = (s: State) => s.roster.map((r) => [r.name, r.resolution, r.entity?.id, r.downloads, r.excluded])
    expect(kept(first)).toEqual(kept({ roster: atStart } as State))
    expect(first.cpm).toBe(25)
    expect(first.ranking?.rows.map((r) => [r.rank, r.show, r.finalist])).toEqual([
      [1, 'Corner Booth', true],
      [2, 'Slow Burn', true],
      [3, 'Paper Route', true],
      [4, 'Field Notes', true],
      [5, 'Ghost Signal', true]
    ])

    await agent.call('startLaunch', { name: 'Night Shift Cinema' })
    const second = await agent.until((s) => ended(s) && s.run?.closing === 'Ranked again.')
    expect(second.roster.find((r) => r.name === 'Corner Booth')?.excluded).toBe(true)
    expect(second.cpm).toBe(30)
    expect(second.ranking?.rows.map((r) => r.show)).toEqual(['Slow Burn', 'Paper Route', 'Field Notes', 'Ghost Signal'])
    // The first run keeps what it ran on, to compare.
    const earlier = await agent.call<State>('getRun', first.run!.id)
    expect(kept(earlier)).toEqual(kept(first))
    expect(earlier.cpm).toBe(25)
  })

  it('cites only its own log: every call in its chart and roster opens a record there, those from the roster marked copied', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const roster = await rosterOf(ada, network)
    const networkLog = await roster.call<Evidence[]>('getEvidence')
    rankAsked()
    fakeClaude([turn(resolve('Night Shift Cinema')), turn(rank('e-0001')), turn(text('Ranked.'))])
    const { agent } = await launch(ada, network)
    await agent.call('startLaunch', { name: 'Night Shift Cinema' })
    const state = await agent.until(ended)
    expect(state.run?.status).toBe('completed')

    const log = await agent.call<Evidence[]>('getEvidence')
    expect(cited(state).every((call) => log.some((e) => e.call === call))).toBe(true)
    // Each show cites its own copy of the network's record, under the launch's numbering. What the
    // roster no longer cites stays with the network: Ghost Signal's miss, now it's mapped, and the comp
    // search it wasn't mapped from.
    const copies = log.filter((e) => e.copiedFrom)
    expect(copies.map((e) => [e.call, e.copiedFrom])).toEqual([
      ['C-01', 'C-01'],
      ['C-02', 'C-02'],
      ['C-03', 'C-03'],
      ['C-04', 'C-04'],
      ['C-05', 'C-06'],
      ['C-06', 'C-08']
    ])
    for (const copy of copies) {
      const original = networkLog.find((e) => e.call === copy.copiedFrom)!
      expect(copy).toEqual({ ...original, call: copy.call, copiedFrom: original.call })
    }
    expect(state.roster.find((r) => r.name === 'Ghost Signal')).toMatchObject({
      resolution: 'mapped',
      evidence: 'C-06',
      compSearch: null
    })
    expect(log.slice(copies.length).map((e) => [e.call, e.endpoint, e.copiedFrom])).toEqual([
      ['C-07', '/search', undefined],
      ['C-08', '/v2/insights', undefined]
    ])
    // Nothing is replayed, and the network's log is as it was.
    expect(log.some((e) => e.replayed)).toBe(false)
    // The evidence says where a copy came from: the network's call, as text, since it numbers a call in
    // the network's log, not this one, which has a C-08 of its own.
    const opened = renderToStaticMarkup(
      <EvidencePanel
        opened={{ call: 'C-06', status: 'loaded', record: copies[5] }}
        names={namesOf(log)}
        runs={state.runs}
      />
    )
    expect(sections(opened)[0][0]).toBe('Evidence · C-06 Qloo data From the roster')
    expect(
      opened
        .replace(/<[^>]+>/g, ' ')
        .replace(/&#x27;/g, "'")
        .replace(/\s+/g, ' ')
    ).toContain(
      'Answer From the network’s roster, its call C-08 , as Qloo answered it then; the run made no new request'
    )
    expect(opened).toMatch(/<code\b[^>]*>C-08<\/code>/)
    expect(opened).not.toMatch(/<button\b[^>]*>C-08</)
    expect(state.run?.replayed).toBeUndefined()
    expect(await roster.call<Evidence[]>('getEvidence')).toEqual(networkLog)
  })

  it("doesn't start while a show on the network's roster is still being looked up, and says why", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const roster = await rosterOf(ada, network)
    // Night Ferry's search waits until the test lets it answer.
    const answer = Promise.withResolvers<void>()
    outbound.use(
      http.get(`${env.QLOO_BASE_URL}/search`, async ({ request }) => {
        if (new URL(request.url).searchParams.get('query') === 'Night Ferry') await answer.promise
      })
    )
    await roster.call('importRoster', `${csv}\nNight Ferry,4000`, 'csv')
    fakeClaude([turn(text('Nothing to rank yet.'))])
    const { agent } = await launch(ada, network)
    const before = agent.state()

    await expect(agent.call('startLaunch', { name: 'Night Shift Cinema' })).rejects.toThrow(
      "The network's roster is still looking up 1 show in Qloo. Start the run once the lookups have settled, so it ranks every show."
    )
    expect(agent.state()).toEqual(before)
    expect(modelRequests()).toEqual([])
    // Over RPC, as the API will start a run, the refusal says it's the roster's state.
    const { id } = await roster.call<{ id: string }>('createLaunch', { name: 'Night Shift Cinema' })
    const rpc = await getAgentByName(env.LaunchAgent, `${network}:${id}`)
    const refused = await (async () => rpc.startLaunch({ name: 'Night Shift Cinema' }))().catch((e: unknown) => e)
    expect(refusalCode(refused)).toBe('conflict')

    answer.resolve()
    await roster.until((s) => s.roster.every((r) => r.resolution !== 'pending'))
    await agent.call('startLaunch', { name: 'Night Shift Cinema' })
    expect((await agent.until(ended)).roster.map((r) => r.name)).toContain('Night Ferry')
  })
})

describe("the network's list of launches", () => {
  it('follows each launch live, through its run and its order, with its plan and who ran it last', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const roster = await rosterOf(ada, network)
    rankAsked()
    const held = Promise.withResolvers<void>()
    fakeClaude([
      async () => {
        await held.promise
        return turn(resolve('Night Shift Cinema'))
      },
      turn(rank('e-0001')),
      turn(askBudget),
      turn(askExclusions),
      turn(findTags),
      turn(draft),
      turn(text('Drafted the insertion order.'))
    ])
    const { id, agent } = await launch(ada, network)
    const listed = async (status: string) => (await roster.until((s) => s.launches?.[0].status === status)).launches![0]

    const started = Date.now()
    await agent.call('startLaunch', { name: 'Night Shift Cinema' })
    const running = await listed('running')
    expect(running).toMatchObject({ id, name: 'Night Shift Cinema', comps: [], finalists: 0, slots: null })
    expect(running.startedBy).toBe('Ada Programmer')
    expect(Date.parse(running.lastRun!)).toBeGreaterThanOrEqual(started - 1000)
    held.resolve()

    const waiting = await listed('waiting')
    expect(waiting).toMatchObject({ finalists: 5, slots: null, slotValue: null })
    await agent.call('answer', agent.state()!.run!.question!.id, { slots: 20 })
    const exclusions = await agent.until((s) => s.run?.question?.kind === 'exclusions')
    await agent.call('answer', exclusions.run!.question!.id, { exclude: [] })
    // 8 × $1,200 + 6 × $1,000 + 4 × $650 + 2 × $438, at the $25 CPM.
    expect(await listed('order drafted')).toEqual({
      ...running,
      status: 'order drafted',
      finalists: 5,
      slots: 20,
      slotValue: 19_076,
      finalistShows: ['Corner Booth', 'Slow Burn', 'Paper Route', 'Field Notes', 'Ghost Signal'],
      draftLines: expect.objectContaining({ cpm: 25, run: agent.state()!.run!.id })
    })

    const order = agent.state()!.insertionOrder!
    await agent.call('approveInsertionOrder', order.id)
    expect((await listed('order approved')).slotValue).toBe(19_076)
    await agent.call('editInsertionOrder', order.id, [{ show: 'Corner Booth', slots: 2, angle: 'Call-ins.' }])
    expect(await listed('order drafted')).toMatchObject({ slots: 2, slotValue: 2_400 })
  })
})

// A launch run to a drafted insertion order on the made-up roster, as `member` starts and answers it.
async function drafted(member: Member, network: string) {
  const roster = await rosterOf(member, network)
  rankAsked()
  fakeClaude([
    turn(resolve('Night Shift Cinema')),
    turn(rank('e-0001')),
    turn(askBudget),
    turn(askExclusions),
    turn(findTags),
    turn(draft),
    turn(text('Drafted the insertion order.'))
  ])
  const { id, agent } = await launch(member, network)
  await agent.call('startLaunch', { name: 'Night Shift Cinema' })
  const budget = await agent.until((s) => s.run?.question?.kind === 'budget')
  await agent.call('answer', budget.run!.question!.id, { slots: 20 })
  const exclusions = await agent.until((s) => s.run?.question?.kind === 'exclusions')
  await agent.call('answer', exclusions.run!.question!.id, { exclude: [] })
  await agent.until(ended)
  return { id, agent, roster }
}

describe("approving a launch's insertion order", () => {
  it('takes a member on the launch page, records who approved it and when, and an edit clears both', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const grace = await teammate(ada, network)
    const { id, agent } = await drafted(ada, network)
    const graces = await connect(grace, `/agents/launch/${network}/${id}`)
    const order = agent.state()!.insertionOrder!

    const before = Date.now()
    await graces.call('approveInsertionOrder', order.id)
    const approved = (await agent.until((s) => s.insertionOrder?.status === 'approved')).insertionOrder!
    expect(approved.approvedBy).toBe('Grace Booker')
    expect(Date.parse(approved.approvedAt!)).toBeGreaterThanOrEqual(before - 1000)
    expect(Date.parse(approved.approvedAt!)).toBeLessThanOrEqual(Date.now())
    // Approving it again, as from a page that hadn't seen the approval, keeps the first.
    await agent.call('approveInsertionOrder', order.id)
    expect(agent.state()!.insertionOrder).toEqual(approved)

    // An edit returns it to draft, and the approval with it.
    await agent.call('editInsertionOrder', order.id, [{ show: 'Corner Booth', slots: 2, angle: 'Call-ins.' }])
    expect(agent.state()!.insertionOrder).toEqual(
      expect.not.objectContaining({ approvedBy: expect.anything(), approvedAt: expect.anything() })
    )
    expect(agent.state()!.insertionOrder!.status).toBe('draft')
  })

  it("is refused over RPC, and on a launch's connection that carries no member, and changes nothing", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const { id, agent } = await drafted(ada, network)
    const order = agent.state()!.insertionOrder!
    const stub = async () => getAgentByName(env.LaunchAgent, `${network}:${id}`)
    const refused = 'Only a member of the network, signed in to the app, can approve an insertion order.'

    // The Worker's own call, with no connection, as the API would make it.
    await expect((async () => (await stub()).approveInsertionOrder(order.id))()).rejects.toThrow(refused)
    // Straight to the agent, as a Worker route that forgot to name the member would let it through.
    const bare = await connectVia(`/agents/launch/${network}/${id}`, {}, async (request) =>
      (await stub()).fetch(request)
    )
    open.push(bare)
    await expect(bare.call('approveInsertionOrder', order.id)).rejects.toThrow(refused)
    expect(agent.state()!.insertionOrder).toEqual(order)
  })
})

describe("exporting a launch's insertion order", () => {
  // The body as sent, byte-order mark included: Response.text() would drop it.
  const body = async (res: Response) => new TextDecoder('utf-8', { ignoreBOM: true }).decode(await res.arrayBuffer())

  it("downloads an approved order as CSV for the network's members, and refuses a draft with 409", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const grace = await teammate(ada, network)
    const { id, agent } = await drafted(ada, network)
    const path = `/app/${network}/launches/${id}/insertion-orders/IO-0001.csv`

    const draft = await ada.fetch(path)
    expect(draft.status).toBe(409)
    expect(await draft.text()).toBe('IO-0001 is a draft. Approve it before exporting.')

    await agent.call('approveInsertionOrder', 'IO-0001')
    for (const member of [ada, grace]) {
      const res = await member.fetch(path)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8')
      expect(res.headers.get('content-disposition')).toBe('attachment; filename="IO-0001.csv"')
      expect(res.headers.get('cache-control')).toBe('no-store')
      expect(await body(res)).toBe(
        '\uFEFFShow,Slots,Angle,Slot value (USD),Line value (USD)\r\n' +
          'Corner Booth,8,Late-night regulars stay up for the call-ins.,1200,9600\r\n' +
          'Slow Burn,6,Its long interviews share the slow pace.,1000,6000\r\n' +
          'Paper Route,4,Morning commuters who follow the same hosts.,650,2600\r\n' +
          'Field Notes,2,Shares the field-recording style.,438,876\r\n' +
          'Total,20,,,19076\r\n'
      )
    }
    expect((await ada.fetch(`/app/${network}/launches/${id}/insertion-orders/IO-0002.csv`)).status).toBe(404)
  })

  it("answers 404 to anyone not a member, for a launch the network doesn't list, and while accounts are off", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const { id, agent } = await drafted(ada, network)
    await agent.call('approveInsertionOrder', 'IO-0001')
    const other = await created(ada, 'Day Shift Audio')
    const stranger = await openMember({ name: 'Mal Stranger' })
    const csvOf = (net: string, launch: string) => `/app/${net}/launches/${launch}/insertion-orders/IO-0001.csv`

    expect((await stranger.fetch(csvOf(network, id))).status).toBe(404)
    expect((await ada.fetch(csvOf(other, id))).status).toBe(404)
    expect((await ada.fetch(csvOf(network, crypto.randomUUID()))).status).toBe(404)
    // Signed out, it's the sign-in page, and back.
    const signedOut = await exports.default.fetch(`https://crossfeed.test${csvOf(network, id)}`, { redirect: 'manual' })
    expect(signedOut.status).toBe(302)
    expect(signedOut.headers.get('location')).toBe(`/sign-in?next=${csvOf(network, id)}`)
    env.ACCOUNTS = 'off'
    expect((await ada.fetch(csvOf(network, id))).status).toBe(404)
  })
})

describe('deleting a launch', () => {
  const remove = (member: Member, network: string, id: string) =>
    member.fetch(`/app/${network}/launches/${id}/delete`, { method: 'POST' })
  // What the launch's agent holds, read over RPC as the Worker would.
  const held = async (network: string, id: string) => {
    const stub = await getAgentByName(env.LaunchAgent, `${network}:${id}`)
    const state = await stub.state
    return { launch: state.launch, runs: state.runs.length, evidence: (await stub.getEvidence()).length }
  }
  // A wiped agent's instance is gone once the runtime has reset it, a moment after its wipe: the next
  // call meets a new, empty one.
  const wipedOut = async (network: string, id: string) =>
    expect(await readAfterReset(() => held(network, id))).toEqual({ launch: null, runs: 0, evidence: 0 })

  it("takes it off every member's Launches page at once, closes its pages, wipes its agent, and its addresses answer 404", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const grace = await teammate(ada, network)
    const { id, agent, roster } = await drafted(ada, network)
    await agent.call('approveInsertionOrder', 'IO-0001')
    const { id: kept } = await roster.call<{ id: string }>('createLaunch', { name: 'The Long Take' })
    const dashboard = await connect(grace, `/agents/network/${network}`)
    const page = await connect(grace, `/agents/launch/${network}/${id}`)
    expect(await held(network, id)).toMatchObject({ runs: 1 })
    const failed = vi.spyOn(console, 'error')

    const res = await remove(grace, network, id)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({})
    expect((await dashboard.until((s) => s.launches!.length === 1)).launches!.map((l) => l.id)).toEqual([kept])
    expect(await page.closed()).toEqual({ code: 4410, reason: 'This launch was deleted.' })
    await wipedOut(network, id)
    expect(failed.mock.calls.flat().filter((line) => String(line).includes('"event":"wipe_failed"'))).toEqual([])

    expect((await ada.fetch(`/app/${network}/launches/${id}`)).status).toBe(404)
    await expect(ada.connect(`/agents/launch/${network}/${id}`)).rejects.toThrow('did not upgrade: 404')
    expect((await ada.fetch(`/app/${network}/launches/${id}/insertion-orders/IO-0001.csv`)).status).toBe(404)
    expect((await remove(ada, network, id)).status).toBe(404)
    // The other launch is as it was.
    expect((await ada.fetch(`/app/${network}/launches/${kept}`)).status).toBe(200)
    expect((await held(network, kept)).launch).toEqual({ name: 'The Long Take', match: null, comps: [] })
  })

  it("answers 404 to anyone not a member and for a launch the network doesn't list, and refuses a write from elsewhere", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const { id } = await launch(ada, network)
    const stranger = await openMember({ name: 'Mal Stranger' })

    expect((await remove(stranger, network, id)).status).toBe(404)
    expect((await remove(ada, network, crypto.randomUUID())).status).toBe(404)
    const elsewhere = await exports.default.fetch(`https://crossfeed.test/app/${network}/launches/${id}/delete`, {
      method: 'POST',
      headers: { Cookie: ada.cookie, Origin: 'https://elsewhere.test' }
    })
    expect(elsewhere.status).toBe(403)
    env.ACCOUNTS = 'off'
    expect((await remove(ada, network, id)).status).toBe(404)
    env.ACCOUNTS = 'on'
    expect((await ada.fetch(`/app/${network}/launches/${id}`)).status).toBe(200)
  })

  it('wipes a launch whose wipe failed at the hourly cron, and keeps one whose deletion stopped before the list let go', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const { id, agent } = await drafted(ada, network)
    const { id: other } = await launch(ada, network, { name: 'The Long Take' })
    const failed = vi.spyOn(console, 'error')

    // The list lets go of the first, but its wipe fails, twice: it's off the Launches page, and kept for the cron.
    vi.spyOn(LaunchAgent.prototype, 'destroy')
      .mockRejectedValueOnce(new Error('The agent is overloaded.'))
      .mockRejectedValueOnce(new Error('The agent is overloaded.'))
    expect((await remove(ada, network, id)).status).toBe(200)
    expect((await ada.fetch(`/app/${network}/launches/${id}`)).status).toBe(404)
    expect(failed.mock.calls.flat().some((line) => String(line).includes('"event":"wipe_failed"'))).toBe(true)
    expect(await held(network, id)).toMatchObject({ runs: 1 })
    // The second's deletion stops before the list lets go of it, so it stays a launch.
    vi.spyOn(NetworkAgent.prototype, 'dropLaunch').mockImplementationOnce(() => {
      throw new Error('The network is overloaded.')
    })
    expect((await remove(ada, network, other)).status).toBe(500)
    agent.close()

    // The cron retries a wipe once it's a minute old, so it never races a deletion under way.
    await runCron({ hourly: true })
    expect(await held(network, id)).toMatchObject({ runs: 1 })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 2 * 60_000)
    // A retry that fails again fails the cron's run, and is kept for the next.
    await expect(runCron({ hourly: true })).rejects.toThrow('1 agent wipe failed')
    expect(await held(network, id)).toMatchObject({ runs: 1 })
    await runCron({ hourly: true })
    await wipedOut(network, id)
    expect((await ada.fetch(`/app/${network}/launches/${other}`)).status).toBe(200)
    expect((await held(network, other)).launch).toEqual({ name: 'The Long Take', match: null, comps: [] })
  })
})

describe('a member who deletes their account', () => {
  const deleteAccount = (member: Member) => member.fetch('/app/account/delete', { method: 'POST' })
  // Who started each of a launch's runs, as a member opening its page now reads them.
  const startedBy = async (member: Member, network: string, id: string) =>
    (await (await connect(member, `/agents/launch/${network}/${id}`)).until(() => true)).runs.map((r) => r.startedBy)

  it("is forgotten by name in each of their networks' launches: the runs they started, in the app or through the API, and the orders they approved, earlier runs' too", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const grace = await teammate(ada, network)
    // Another member of the same name keeps theirs.
    const namesake = await teammate(ada, network)
    const roster = await rosterOf(ada, network)
    rankAsked()
    fakeClaude([
      turn(resolve('Night Shift Cinema')),
      turn(rank('e-0001')),
      turn(askBudget),
      turn(askExclusions),
      turn(findTags),
      turn(draft),
      turn(text('Drafted the insertion order.')),
      turn(text('Ranked again.')),
      turn(text('Ranked once more.')),
      turn(text('No roster to rank yet.'))
    ])
    const { id, agent } = await launch(grace, network)
    await agent.call('startLaunch', { name: 'Night Shift Cinema' })
    const budget = await agent.until((s) => s.run?.question?.kind === 'budget')
    await agent.call('answer', budget.run!.question!.id, { slots: 20 })
    const exclusions = await agent.until((s) => s.run?.question?.kind === 'exclusions')
    await agent.call('answer', exclusions.run!.question!.id, { exclude: [] })
    const order = (await agent.until(ended)).insertionOrder!
    await agent.call('approveInsertionOrder', order.id)
    const first = agent.state()!.runs[0].id
    const theirs = await connect(namesake, `/agents/launch/${network}/${id}`)
    await theirs.call('startLaunch', { name: 'Night Shift Cinema' })
    await agent.until((s) => s.runs.length === 2 && ended(s))
    const started = await grace.fetch(`/api/v1/networks/${network}/launches/${id}/runs`, { method: 'POST' })
    expect(started.status).toBe(202)
    await agent.until((s) => s.runs.length === 3 && ended(s))
    const runPath = `/api/v1/networks/${network}/launches/${id}/runs/${first}`
    const approved = await (await ada.fetch(runPath)).json<{ insertionOrder: object }>()
    expect(approved.insertionOrder).toMatchObject({ id: order.id, status: 'approved', approvedBy: 'Grace Booker' })
    // The API names people, never their IDs.
    expect(JSON.stringify(approved)).not.toContain(grace.id)
    // A launch in another network of hers.
    const day = await created(ada, 'Day Shift Audio')
    const token = new URL(await ada.invite(day)).hash.slice(1)
    const joined = await grace.fetch('/auth/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    })
    expect(joined.status).toBe(200)
    const elsewhere = await launch(grace, day)
    await elsewhere.agent.call('startLaunch', { name: 'Night Shift Cinema' })
    await elsewhere.agent.until(ended)

    expect((await deleteAccount(grace)).status).toBe(200)
    const forgotten = await (await connect(ada, `/agents/launch/${network}/${id}`)).until(() => true)
    expect(forgotten.runs.map((r) => r.startedBy)).toEqual(['Former member', 'Grace Booker', 'Former member'])
    expect(JSON.stringify(forgotten)).not.toContain(grace.id)
    expect((await (await ada.fetch(runPath)).json<{ insertionOrder: object }>()).insertionOrder).toMatchObject({
      id: order.id,
      status: 'approved',
      approvedBy: 'Former member'
    })
    expect(await startedBy(ada, day, elsewhere.id)).toEqual(['Former member'])
    // The Launches page's row follows its launch.
    await roster.until((s) => s.launches![0].startedBy === 'Former member')
  })

  it('is forgotten by name in the launches of the networks they left or were removed from before', async () => {
    const ada = await openMember()
    const [left, removed] = [await created(ada), await created(ada, 'Day Shift Audio')]
    const grace = await teammate(ada, left)
    const token = new URL(await ada.invite(removed)).hash.slice(1)
    const join = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }
    expect((await grace.fetch('/auth/join', join)).status).toBe(200)
    fakeClaude([turn(text('No roster to rank yet.')), turn(text('No roster to rank yet.'))])
    const launches = await Promise.all(
      [left, removed].map(async (network) => {
        const { id, agent } = await launch(grace, network)
        await agent.call('startLaunch', { name: 'Night Shift Cinema' })
        await agent.until(ended)
        return { network, id }
      })
    )
    expect((await grace.fetch(`/app/${left}/settings/members/leave`, { method: 'POST' })).status).toBe(200)
    const removal = await ada.fetch(`/app/${removed}/settings/members/${grace.id}/remove`, { method: 'POST' })
    expect(removal.status).toBe(200)
    for (const { network, id } of launches) expect(await startedBy(ada, network, id)).toEqual(['Grace Booker'])

    expect((await deleteAccount(grace)).status).toBe(200)
    for (const { network, id } of launches) expect(await startedBy(ada, network, id)).toEqual(['Former member'])
    const dashboard = await connect(ada, `/agents/network/${left}`)
    expect((await dashboard.until(() => true)).launches![0].startedBy).toBe('Former member')
  })

  it("forgets it at the next hourly cleanup when a launch can't be reached at once", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const grace = await teammate(ada, network)
    fakeClaude([turn(text('No roster to rank yet.'))])
    const { id, agent } = await launch(grace, network)
    await agent.call('startLaunch', { name: 'Night Shift Cinema' })
    await agent.until(ended)
    vi.spyOn(LaunchAgent.prototype, 'forgetMember').mockRejectedValueOnce(new Error('The agent is overloaded.'))
    const failed = vi.spyOn(console, 'error')

    expect((await deleteAccount(grace)).status).toBe(200)
    expect(failed.mock.calls.flat().filter((line) => String(line).includes('"event":"wipe_failed"'))).toHaveLength(1)
    expect(await startedBy(ada, network, id)).toEqual(['Grace Booker'])

    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 2 * 60_000)
    await runCron({ hourly: true })
    expect(await startedBy(ada, network, id)).toEqual(['Former member'])
  })
})

describe('two launches of one network', () => {
  it("run at the same time, neither changing the other's state, and the list follows both", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const roster = await rosterOf(ada, network)
    rankAsked()
    // Each launch's turns, answered by which launch a request plans. Neither run's first turn is
    // answered until both runs have asked for it.
    const turns = {
      'Night Shift Cinema': [turn(resolve('Night Shift Cinema')), turn(rank('e-0001')), turn(text('Ranked.'))],
      'The Long Take': [turn(resolve('The Long Take')), refusal('cyber')]
    }
    const asked = Promise.withResolvers<void>()
    const go = Promise.withResolvers<void>()
    let first = 0
    const plan = async (request: ModelRequest) => {
      const name = request.messages[0].content.includes('Night Shift Cinema') ? 'Night Shift Cinema' : 'The Long Take'
      const step = request.messages.filter((m: { role: string }) => m.role === 'assistant').length
      if (step === 0) {
        if (++first === 2) asked.resolve()
        await go.promise
      }
      return turns[name][step]
    }
    fakeClaude(Array.from({ length: 5 }, () => plan))
    const night = await launch(ada, network)
    const long = await launch(ada, network, { name: 'The Long Take' })

    await night.agent.call('startLaunch', { name: 'Night Shift Cinema' })
    await long.agent.call('startLaunch', { name: 'The Long Take' })
    await asked.promise
    const both = await roster.until((s) => s.launches!.every((l) => l.status === 'running'))
    expect(both.launches!.map((l) => l.name)).toEqual(['The Long Take', 'Night Shift Cinema'])
    go.resolve()

    const [a, b] = await Promise.all([night.agent.until(ended), long.agent.until(ended)])
    expect([a.launch?.match?.entity?.id, a.run?.status, a.ranking?.anchors]).toEqual([
      'e-0001',
      'completed',
      [{ id: 'e-0001', name: 'Night Shift Cinema' }]
    ])
    expect([b.launch?.match?.entity?.id, b.run?.status, b.ranking]).toEqual(['e-0002', 'failed', null])
    expect([a.runs.length, b.runs.length]).toEqual([1, 1])
    // Each copied the roster into its own log, then resolved its own launch there.
    const searched = async (agent: Omit<Session, 'cookie'>) =>
      (await agent.call<Evidence[]>('getEvidence')).filter((e) => !e.copiedFrom).map((e) => [e.call, e.params.query])
    expect(await searched(night.agent)).toEqual([
      ['C-07', 'Night Shift Cinema'],
      ['C-08', undefined]
    ])
    expect(await searched(long.agent)).toEqual([['C-07', 'The Long Take']])

    const listed = await roster.until((s) => s.launches!.every((l) => l.status !== 'running'))
    expect(listed.launches!.map((l) => [l.name, l.status, l.finalists])).toEqual([
      ['The Long Take', 'failed', 0],
      ['Night Shift Cinema', 'ranked', 5]
    ])
  })
})

describe('a launch on the sample roster', () => {
  // Made-up IDs and scores for four of the sample's public show names; every other name finds nothing.
  const sampleSearch = {
    'The Rewatchables': show('e-0201', 'The Rewatchables'),
    'The Big Picture': show('e-0301', 'The Big Picture'),
    'The Watch': show('e-0601', 'The Watch'),
    'House of R': show('e-1101', 'House of R')
  }
  const sampleFit = [
    { entity_id: 'e-0301', name: 'The Big Picture', affinity: 0.913 },
    { entity_id: 'e-0201', name: 'The Rewatchables', affinity: 0.887 },
    { entity_id: 'e-1101', name: 'House of R', affinity: 0.861 }
  ]
  // The sample launch, The Watch, run to the end with the sample's answers: 20 slots and no exclusions.
  const theWatch = () => [
    turn(resolve('The Watch')),
    turn(
      toolUse('rank_candidates', {
        anchor_ids: ['e-0601'],
        candidate_ids: ['e-0201', 'e-0301', 'e-1101'],
        type: 'urn:entity:podcast'
      })
    ),
    turn(askBudget),
    turn(askExclusions),
    turn(text('The Big Picture leads the finalists.'))
  ]
  const answerSample = async (agent: Omit<Session, 'cookie'>) => {
    const budget = await agent.until((s) => s.run?.question?.kind === 'budget')
    await agent.call('answer', budget.run!.question!.id, { slots: 20 })
    const exclusions = await agent.until((s) => s.run?.question?.kind === 'exclusions')
    await agent.call('answer', exclusions.run!.question!.id, { exclude: [] })
    return agent.until(ended)
  }
  // With four shows matched, the guest network measures their overlap and profiles their listeners as the
  // sample loads (#403): Qloo has no listener profile for any of them here.
  const fakes = () => {
    fakeQloo({ search: sampleSearch })
    fakeInsights((body) =>
      sampleFit.filter((r) => String(body['filter.results.entities']).split(',').includes(r.entity_id))
    )
    fakeDemographics([])
  }
  // The guest network as it loads the sample (ADR 0007), and its sample launch's page agent. With `rank`,
  // Qloo answers the rankings with it instead, the load's overlap's among them.
  async function guestSampleLaunch(rank?: Parameters<typeof fakeInsights>[0]) {
    env.SAMPLE_NETWORK = 'on'
    fakes()
    if (rank) fakeInsights(rank)
    const guest = await openGuest()
    const network = await connect(guest, '/agents/network/guest-network')
    const loaded = await network.until(
      (s) => s.roster.length > 0 && s.roster.every((r) => r.resolution !== 'pending') && s.launches?.length === 1
    )
    const [{ id }] = loaded.launches!
    return { guest, network, id, agent: await connect(guest, `/agents/launch/guest-network/${id}`) }
  }
  // The sample launch run live to the end with the sample's answers, which keeps it as the sample run.
  async function storeSampleRun(agent: Omit<Session, 'cookie'>) {
    const logged = vi.spyOn(console, 'log')
    fakeClaude(theWatch())
    await agent.call('startLaunch', { name: 'The Watch' })
    const state = await answerSample(agent)
    expect(state.run?.status).toBe('completed')
    expect(state.run?.replayed).toBeUndefined()
    await vi.waitFor(() =>
      expect(logged.mock.calls.flat().some((line) => String(line).includes('"event":"sample_run"'))).toBe(true)
    )
    return state
  }
  const capped = 'The daily cap of 0 Qloo calls is reached; it resets at 00:00 UTC'
  // A launch's page of the guest network, as a guest, an owner, reads it.
  const guestPage = (state: State, id: string) =>
    renderToStaticMarkup(
      <LaunchWorkspace
        agent={{ state, stub: {} } as unknown as Agent}
        network={{
          id: 'guest-network',
          name: 'Guest network',
          role: 'owner',
          links: networkLinks(env, 'guest-network')
        }}
        orders={`/app/guest-network/launches/${id}/insertion-orders`}
      />
    )

  const words = (html: string) =>
    html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  // The line under a guest page's fit chart that says how its slot values are priced.
  const footnote = (state: State, id: string) => words(hooked(guestPage(state, id), 'data-chart-foot')[0])
  // An owner's CPM for the guest network, set in its settings.
  const setGuestCpm = (guest: Pick<Member, 'fetch'>, cpm: number) =>
    guest.fetch('/app/guest-network/settings/network', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Guest network', cpm })
    })

  it('keeps its figures and CPM labelled sample on another launch of the guest network, but not the sample, which only its sample launch carries, and never stores its run as the sample run (#333)', async () => {
    const { guest, network } = await guestSampleLaunch()
    const logged = vi.spyOn(console, 'log')
    // The Watch planned again by a guest isn't the sample launch.
    const { id } = await network.call<{ id: string }>('createLaunch', { name: 'The Watch' })
    const agent = await connect(guest, `/agents/launch/guest-network/${id}`)
    // Before its first run it holds none of the sample's figures, so nothing on it is labelled.
    expect(sampleLabels(guestPage(agent.state()!, id))).toEqual([])
    fakeClaude(theWatch())
    await agent.call('startLaunch', { name: 'The Watch' })
    const state = await answerSample(agent)

    expect(state.run?.status).toBe('completed')
    // Its copy takes the CPM's label with the CPM, and no sample.
    expect(state).toMatchObject({ cpm: 20, sampleCpm: true, sample: null })
    expect(state.roster.map((r) => [r.name, r.sample])).toEqual(network.state()!.roster.map((r) => [r.name, r.sample]))
    // Its run is priced with the sample's downloads and CPM, so the page's title says so, once, and the
    // chart's footnote in words: the chart's slot values, the plan and the roster carry no label of their own.
    expect(sampleLabels(guestPage(state, id))).toEqual(['h1: The Watch'])
    expect(footnote(state, id)).toBe('Slot value = downloads × $20 sample CPM ÷ 1,000 · sample figures')
    expect(logged.mock.calls.flat().filter((line) => String(line).includes('"event":"sample_run"'))).toEqual([])
    // So the engine has no stored run to replay when Qloo can't be called.
    env.QLOO_DAILY_CALL_CAP = '0'
    const judge = await openSession()
    open.push(judge)
    await judge.until((s) => s.roster.every((r) => r.resolution !== 'pending'))
    await judge.call('startLaunch', { name: 'The Watch' })
    expect(judge.state()!.run).toMatchObject({
      status: 'stopped',
      error: expect.stringContaining('no sample run is stored to replay yet')
    })
  })

  it('prices a new launch’s slots at the sample CPM after a guest’s import keeps a sample show, and says so (#287, #333)', async () => {
    const { guest, network } = await guestSampleLaunch()
    await network.importRoster('The Watch\nNight Shift Cinema')
    const { id } = await network.call<{ id: string }>('createLaunch', { name: 'The Rewatchables' })
    const agent = await connect(guest, `/agents/launch/guest-network/${id}`)
    fakeInsights([{ entity_id: 'e-0601', name: 'The Watch', affinity: 0.9 }])
    fakeClaude([
      turn(resolve('The Rewatchables')),
      turn(
        toolUse('rank_candidates', { anchor_ids: ['e-0201'], candidate_ids: ['e-0601'], type: 'urn:entity:podcast' })
      ),
      turn(text('The Watch is the one finalist.'))
    ])
    await agent.call('startLaunch', { name: 'The Rewatchables' })
    const ran = await agent.until(ended)
    expect(ran.run?.status).toBe('completed')
    expect(ran).toMatchObject({ cpm: 20, sampleCpm: true, sample: null })
    expect(footnote(ran, id)).toBe('Slot value = downloads × $20 sample CPM ÷ 1,000 · sample figures')
    expect(sampleLabels(guestPage(ran, id))).toEqual(['h1: The Rewatchables'])
    // The Watch's sample downloads, 340,000, × $20 ÷ 1,000.
    const [row] = hooked(hooked(guestPage(ran, id), 'data-fit-chart')[0], 'data-show="The Watch"')
    const value = hooked(row, 'data-slot-value')[0]
    expect(
      value
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    ).toBe('$6,800 340,000 downloads')
  })

  it("labels the sample CPM on a run over the guest's own shows, and its order's total, but not a later run's at an owner's CPM, while the earlier run keeps its label (#333)", async () => {
    const { guest, network } = await guestSampleLaunch()
    fakeQloo({
      search: {
        'Night Shift Cinema': show('e-0001', 'Night Shift Cinema'),
        'Corner Booth': show('e-0501', 'Corner Booth'),
        'Slow Burn': show('e-0502', 'Slow Burn')
      }
    })
    const imported = await network.importRoster('name,downloads\nCorner Booth,48000\nSlow Burn,40000', 'csv')
    // No show holds a sample figure, but the CPM is still the sample's.
    expect(imported).toMatchObject({ cpm: 20, sample: { cpm: true } })
    expect(imported.roster.some((r) => r.sample?.length)).toBe(false)
    const { id } = await network.call<{ id: string }>('createLaunch', { name: 'Night Shift Cinema' })
    const agent = await connect(guest, `/agents/launch/guest-network/${id}`)
    const shows = ['e-0501', 'e-0502']
    fakeInsights([
      { entity_id: 'e-0501', name: 'Corner Booth', affinity: 0.913 },
      { entity_id: 'e-0502', name: 'Slow Burn', affinity: 0.902 }
    ])
    fakeCompare(
      Object.fromEntries(shows.map((s) => [s, [{ tag_id: 'urn:tag:keyword:media:film', name: 'Film', score: 0.61 }]]))
    )
    const ranks = toolUse('rank_candidates', {
      anchor_ids: ['e-0001'],
      candidate_ids: shows,
      type: 'urn:entity:podcast'
    })
    fakeClaude([
      turn(resolve('Night Shift Cinema')),
      turn(ranks),
      turn(askBudget),
      turn(askExclusions),
      turn(toolUse('shared_tags', { anchor_ids: ['e-0001'], candidate_ids: shows })),
      turn(
        toolUse('draft_insertion_order', {
          lines: [
            { show: 'Corner Booth', slots: 6, angle: 'Film talk.' },
            { show: 'Slow Burn', slots: 4, angle: 'Film talk.' }
          ]
        })
      ),
      turn(text('Drafted the order.')),
      turn(resolve('Night Shift Cinema')),
      turn(ranks),
      turn(text('Ranked again.'))
    ])
    await agent.call('startLaunch', { name: 'Night Shift Cinema' })
    const first = await answerSample(agent)
    expect(first.run?.status).toBe('completed')
    expect(first).toMatchObject({ cpm: 20, sampleCpm: true, sample: null })
    // Priced at the sample CPM from the guest's own downloads, so the footnote says the CPM alone, and the
    // page's title carries its one badge.
    expect(footnote(first, id)).toBe('Slot value = downloads × $20 sample CPM ÷ 1,000')
    expect(sampleLabels(guestPage(first, id))).toEqual(['h1: Night Shift Cinema'])
    // 6 × 48,000 × $20 ÷ 1,000 + 4 × 40,000 × $20 ÷ 1,000.
    expect(words(hooked(guestPage(first, id), 'data-io')[0])).toContain(' Total 10 $8,960 sample figures ')

    // An owner's CPM leaves nothing of the sample (#337), so the next run's copy takes no label.
    expect((await setGuestCpm(guest, 25)).status).toBe(200)
    await network.until((s) => s.cpm === 25 && s.sample === null)
    await agent.call('startLaunch', { name: 'Night Shift Cinema' })
    const second = await agent.until((s) => ended(s) && s.run?.closing === 'Ranked again.')
    expect(second).toMatchObject({ cpm: 25, sampleCpm: false, sample: null })
    expect(footnote(second, id)).toBe('Slot value = downloads × $25 CPM ÷ 1,000')
    expect(sampleLabels(guestPage(second, id))).toEqual([])
    // The earlier run, as the run list's View shows it, keeps the label its own copy took.
    const viewed = { ...(await agent.call<RunSnapshot>('getRun', first.run!.id)), runs: second.runs }
    expect(footnote(viewed, id)).toBe('Slot value = downloads × $20 sample CPM ÷ 1,000')
    expect(sampleLabels(guestPage(viewed, id))).toEqual(['h1: Night Shift Cinema'])
  })

  it("leaves an owner's CPM unlabelled while shows keep their sample downloads, which the footnote still says, on another launch and on the sample launch alike (#333)", async () => {
    const { guest, network, id: watch, agent: sampleLaunch } = await guestSampleLaunch()
    expect((await setGuestCpm(guest, 25)).status).toBe(200)
    expect(await network.until((s) => s.cpm === 25)).toMatchObject({ sample: { cpm: false } })
    // The Watch planned again by a guest isn't the sample launch.
    const { id } = await network.call<{ id: string }>('createLaunch', { name: 'The Watch' })
    const other = await connect(guest, `/agents/launch/guest-network/${id}`)
    fakeClaude([...theWatch(), ...theWatch()])
    await other.call('startLaunch', { name: 'The Watch' })
    const ran = await answerSample(other)
    expect(ran).toMatchObject({ cpm: 25, sampleCpm: false, sample: null })
    expect(footnote(ran, id)).toBe('Slot value = downloads × $25 CPM ÷ 1,000 · sample figures')
    expect(sampleLabels(guestPage(ran, id))).toEqual(['h1: The Watch'])

    await sampleLaunch.call('startLaunch', { name: 'The Watch' })
    const sampled = await answerSample(sampleLaunch)
    expect(sampled).toMatchObject({ cpm: 25, sampleCpm: false, sample: { cpm: false } })
    expect(footnote(sampled, watch)).toBe('Slot value = downloads × $25 CPM ÷ 1,000 · sample figures')
    expect(sampleLabels(guestPage(sampled, watch))).toEqual(['h1: The Watch'])
  })

  it('says “sample figures” for a ranked show with sample downloads that the chart folds behind “Show all” (#333)', async () => {
    const { guest, network } = await guestSampleLaunch()
    // Shows of the guest's own, by their made-up IDs, with no figures.
    const own: Record<string, string> = {
      'Corner Booth': 'e-0501',
      'Slow Burn': 'e-0502',
      'Paper Route': 'e-0503',
      'Back Lot': 'e-0505',
      'The Long Take': 'e-0002'
    }
    fakeQloo({ search: { ...search, 'The Watch': show('e-0601', 'The Watch') } })
    // And The Watch, which keeps its sample downloads.
    const imported = await network.importRoster([...Object.keys(own), 'The Watch'].join('\n'))
    expect(imported.roster.filter((r) => r.sample?.includes('downloads')).map((r) => r.name)).toEqual(['The Watch'])
    // An owner's CPM, so only the figures are left to label.
    expect((await setGuestCpm(guest, 25)).status).toBe(200)
    await network.until((s) => s.cpm === 25)
    const { id } = await network.call<{ id: string }>('createLaunch', { name: 'Night Shift Cinema' })
    const agent = await connect(guest, `/agents/launch/guest-network/${id}`)
    const ranked = [...Object.values(own), 'e-0601']
    // The Watch last by fit and by topic: not a finalist, a topic pick or a climber.
    fakeInsights(
      [...Object.keys(own), 'The Watch'].map((name, i) => ({ entity_id: ranked[i], name, affinity: 0.9 - i / 100 }))
    )
    fakeTopic((request) => [...topicNames(request).filter((n) => n !== 'The Watch'), 'The Watch'])
    fakeClaude([
      turn(resolve('Night Shift Cinema')),
      turn(toolUse('rank_candidates', { anchor_ids: ['e-0001'], candidate_ids: ranked, type: 'urn:entity:podcast' })),
      turn(text('Ranked.'))
    ])
    await agent.call('startLaunch', { name: 'Night Shift Cinema' })
    const ran = await agent.until((s) => ended(s) && s.topic?.status !== 'ranking')
    expect(ran).toMatchObject({ cpm: 25, sampleCpm: false })
    const html = guestPage(ran, id)
    const [chart] = hooked(html, 'data-fit-chart')
    expect(ran.ranking?.rows.at(-1)).toMatchObject({ show: 'The Watch', finalist: false })
    expect(hooked(chart, 'data-show="The Watch"')).toEqual([])
    expect(words(html)).toContain(`Show all ${ran.ranking!.rows.length}`)
    expect(footnote(ran, id)).toBe('Slot value = downloads × $25 CPM ÷ 1,000 · sample figures')
  })

  it("carries the sample on the guest network's sample launch, which replays its stored run while Qloo is capped or down", async () => {
    const { network, id, agent } = await guestSampleLaunch()
    const { sample } = network.state()!
    expect(agent.state()!.sample).toEqual(sample)
    // The sample launch's page labels it once, beside its title, and the launch form nowhere else.
    const page = guestPage(agent.state()!, id)
    expect(sampleLabels(page)).toEqual(['h1: The Watch'])
    expect(page).not.toContain('Clear sample network')
    const live = await storeSampleRun(agent)
    expect(live.sample).toEqual(sample)

    env.QLOO_DAILY_CALL_CAP = '0'
    const sent = requests.length
    await agent.call('startLaunch', { name: 'The Watch' })
    expect((await agent.until(ended)).run).toMatchObject({
      status: 'completed',
      replayed: capped,
      budget: { slots: 20 }
    })
    expect(agent.state()!.ranking?.rows).toEqual(live.ranking?.rows)
    expect(agent.state()!.sample).toEqual(sample)
    expect(requests).toHaveLength(sent)
    const replayed = agent.state()!
    expect(footnote(replayed, id)).toBe('Slot value = downloads × $20 sample CPM ÷ 1,000 · sample figures')
    // A run from before the copy took the CPM's label, as the stored sample run may be, reads it from the
    // sample it carries (#333).
    const { sampleCpm: _, ...unlabelled } = replayed
    expect(footnote(unlabelled, id)).toBe('Slot value = downloads × $20 sample CPM ÷ 1,000 · sample figures')

    env.QLOO_DAILY_CALL_CAP = saved.QLOO_DAILY_CALL_CAP
    fakeQlooDown()
    await network.searchComps('The Zach Lowe Show', 'The Lowe Post')
    await agent.call('startLaunch', { name: 'The Watch' })
    expect((await agent.until(ended)).run).toMatchObject({
      status: 'completed',
      replayed: expect.stringContaining('Qloo returned 503: fake failure, after 2 retries')
    })
  })

  it('stores The Watch’s run as the sample run without the overlap it copied, though one of the sample roster’s rankings failed (#404)', async () => {
    // The sample load measures the overlap, and its ranking against House of R fails; the rest land.
    const { network, id, agent } = await guestSampleLaunch((body) =>
      body['signal.interests.entities'] === 'e-1101'
        ? 503
        : sampleFit.filter((r) => String(body['filter.results.entities']).split(',').includes(r.entity_id))
    )
    const overlap = (await network.until((s) => s.overlap?.status === 'measured')).overlap!
    expect(overlap.rows.find((r) => r.entity.id === 'e-1101')?.error).toEqual(expect.any(String))
    // Qloo answers the next call, a comp search, so it's no longer failing as The Watch starts.
    await network.searchComps('The Zach Lowe Show', 'The Lowe Post')
    await network.until((s) => s.roster.find((r) => r.name === 'The Zach Lowe Show')?.compSearch?.status === 'done')
    const finalists = ['e-0301', 'e-0201', 'e-1101']
    fakeCompare(
      Object.fromEntries(
        finalists.map((f) => [f, [{ tag_id: 'urn:tag:keyword:media:film', name: 'Film', score: 0.6 }]])
      )
    )
    const logged = vi.spyOn(console, 'log')
    fakeClaude([
      ...theWatch().slice(0, 4),
      turn(toolUse('shared_tags', { anchor_ids: ['e-0601'], candidate_ids: finalists })),
      turn(
        toolUse('draft_insertion_order', {
          lines: ['The Big Picture', 'The Rewatchables', 'House of R'].map((show) => ({
            show,
            slots: 4,
            angle: 'Film listeners.'
          }))
        })
      ),
      turn(text('Drafted the insertion order.'))
    ])
    await agent.call('startLaunch', { name: 'The Watch' })
    const live = await answerSample(agent)
    expect(live.run?.status).toBe('completed')

    // The plan names its pair from the overlap the run copied, and says it can't check House of R.
    const calls = Object.fromEntries(
      (await agent.call<Evidence[]>('getEvidence'))
        .filter((e) => e.endpoint === '/v2/insights' && e.copiedFrom)
        .map((e) => [e.params['signal.interests.entities'], e.call])
    )
    expect(Object.keys(calls).toSorted()).toEqual(['e-0201', 'e-0301'])
    expect(hooked(guestPage(live, id), 'data-close-pairs').map(words)).toEqual([
      `Qloo data The Big Picture and The Rewatchables are each other’s closest show by listener overlap. ${calls['e-0301']} ${calls['e-0201']} The roster’s overlap has no ranking of House of R for this run, so the plan can’t say whether it’s in a close pair.`
    ])
    // The run is stored as the sample run all the same, without the overlap or its copied rankings.
    await vi.waitFor(() =>
      expect(logged.mock.calls.flat().some((line) => String(line).includes('"event":"sample_run"'))).toBe(true)
    )
    const stored: KeptRun = JSON.parse((await globalGateway(env).sampleRun())!)
    expect(stored.state.run?.id).toBe(live.run!.id)
    expect(stored.state).not.toHaveProperty('rosterOverlap')
    expect(stored.evidence.filter((e) => e.copiedFrom && e.endpoint === '/v2/insights')).toEqual([])
    // Replayed, it's the stored run, which says nothing of pairs.
    env.QLOO_DAILY_CALL_CAP = '0'
    await agent.call('startLaunch', { name: 'The Watch' })
    const replayed = await agent.until((s) => ended(s) && s.run?.id !== live.run!.id)
    expect(replayed.run).toMatchObject({ status: 'completed', replayed: capped })
    expect(replayed.rosterOverlap).toBeUndefined()
    expect(hooked(guestPage(replayed, id), 'data-close-pairs')).toEqual([])
  })

  const own = 'so runs on your own data wait until Qloo answers again'

  it("doesn't replay the guest network's sample launch once a guest changes its roster or runs it as another launch, nor carry the sample on another launch", async () => {
    const { guest, network, agent } = await guestSampleLaunch()
    await storeSampleRun(agent)
    env.QLOO_DAILY_CALL_CAP = '0'

    await agent.call('startLaunch', { name: 'The Big Picture' })
    expect((await agent.until(ended)).run).toMatchObject({ status: 'stopped', error: expect.stringContaining(own) })
    // The Watch planned again by a guest isn't the sample launch.
    const { id } = await network.call<{ id: string }>('createLaunch', { name: 'The Watch' })
    const other = await connect(guest, `/agents/launch/guest-network/${id}`)
    expect(other.state()!.sample).toBeNull()
    await other.call('startLaunch', { name: 'The Watch' })
    const stopped = await other.until(ended)
    expect(stopped.run).toMatchObject({ status: 'stopped', error: expect.stringContaining(own) })
    // It takes the CPM's label as any launch does, but not the sample (#333).
    expect(stopped).toMatchObject({ sample: null, sampleCpm: true })

    await network.call('updateShow', 'The Watch', { downloads: 12_345 })
    await agent.call('startLaunch', { name: 'The Watch' })
    expect((await agent.until(ended)).run).toMatchObject({ status: 'stopped', error: expect.stringContaining(own) })
  })

  it("doesn't replay the guest network's sample launch once a guest changes the CPM, until the daily clearing loads the sample again", async () => {
    const { guest, agent } = await guestSampleLaunch()
    await storeSampleRun(agent)
    const set = await guest.fetch('/app/guest-network/settings/network', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Guest network', cpm: 25 })
    })
    expect(set.status).toBe(200)
    env.QLOO_DAILY_CALL_CAP = '0'
    await agent.call('startLaunch', { name: 'The Watch' })
    const stopped = await agent.until(ended)
    expect(stopped.run).toMatchObject({ status: 'stopped', error: expect.stringContaining(own) })
    // The run copied the network's CPM, no longer the sample's.
    expect(stopped).toMatchObject({ cpm: 25, sample: { cpm: false } })

    env.QLOO_DAILY_CALL_CAP = saved.QLOO_DAILY_CALL_CAP
    await runCron()
    await readAfterReset(async () => (await getAgentByName(env.NetworkAgent, 'guest-network')).state)
    const { agent: fresh } = await guestSampleLaunch()
    env.QLOO_DAILY_CALL_CAP = '0'
    await fresh.call('startLaunch', { name: 'The Watch' })
    expect((await fresh.until(ended)).run).toMatchObject({ status: 'completed', replayed: capped })
  })

  it("copies no sample to the guest network's sample launch on its next run once the network holds none of it, so its page drops the badge (#337)", async () => {
    const { guest, network, id, agent } = await guestSampleLaunch()
    await network.importRoster('Night Shift Cinema')
    const set = await guest.fetch('/app/guest-network/settings/network', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Guest network', cpm: 25 })
    })
    expect(set.status).toBe(200)
    await network.until((s) => s.cpm === 25 && s.sample === null)
    // Until it runs again, it shows the sample it was planned with.
    expect(sampleLabels(guestPage(agent.state()!, id))).toEqual(['h1: The Watch'])

    env.QLOO_DAILY_CALL_CAP = '0'
    await agent.call('startLaunch', { name: 'The Watch' })
    const stopped = await agent.until(ended)
    expect(stopped.run).toMatchObject({ status: 'stopped', error: expect.stringContaining(own) })
    expect(stopped).toMatchObject({ cpm: 25, sample: null, roster: [{ name: 'Night Shift Cinema' }] })
    expect(sampleLabels(guestPage(stopped, id))).toEqual([])
  })

  it("doesn't take the guest network's sample launch for the unchanged sample while the guest budget's refusal leaves the roster empty", async () => {
    env.SAMPLE_NETWORK = 'on'
    env.QLOO_VISITOR_DAILY_CALL_CAP = '18'
    fakes()
    const guest = await openGuest()
    const network = await connect(guest, '/agents/network/guest-network')
    expect(network.state()).toMatchObject({ roster: [], sample: { cpm: true }, launches: [{ name: 'The Watch' }] })
    const [{ id }] = network.state()!.launches!
    const agent = await connect(guest, `/agents/launch/guest-network/${id}`)

    env.QLOO_DAILY_CALL_CAP = '0'
    await agent.call('startLaunch', { name: 'The Watch' })
    const stopped = await agent.until(ended)
    expect(stopped.run).toMatchObject({ status: 'stopped', error: expect.stringContaining(own) })
    expect(stopped.run?.replayed).toBeUndefined()
  })
})

describe('the pages, as a member reads them', () => {
  // A page's words, as a reader hears them.
  const words = (html: string) =>
    html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#x27;|&apos;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim()
  const page = (network: string) => ({
    id: network,
    name: 'Night Shift Audio',
    role: 'owner' as const,
    links: networkLinks(env, network)
  })
  const launchesPage = (network: string, state: State | undefined) =>
    renderToStaticMarkup(<Launches state={state} network={page(network)} createLaunch={async () => ({ id: 'l-1' })} />)
  // A launch's page, given `earlier`, the earlier runs it reads to compare, as getRun returns them.
  const workspace = (
    network: string,
    agent: Omit<Session, 'cookie'>,
    id = 'l-1',
    earlier?: Record<string, RunSnapshot>
  ) =>
    renderToStaticMarkup(
      <LaunchWorkspace
        agent={{ state: agent.state(), stub: {} } as unknown as Agent}
        network={page(network)}
        orders={`/app/${network}/launches/${id}/insertion-orders`}
        earlier={earlier}
      />
    )

  it('offers New launch in the empty state, then atop the Launches page, and lists each launch by name or comps, linked to its page', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const agent = await connect(ada, `/agents/network/${network}`)
    expect(words(launchesPage(network, agent.state()))).toBe('Launches No launches yet. New launch')
    const { id } = await agent.call<{ id: string }>('createLaunch', { name: 'The Night Watch' })
    const { id: fromComps } = await agent.call<{ id: string }>('createLaunch', {
      comps: ['Blank Check', 'Filmspotting']
    })

    const html = launchesPage(network, agent.state())
    expect(words(html)).toMatch(/^Launches 2 launches New launch /)
    expect(words(html)).toContain(
      'Not run yet 2 Blank Check · Filmspotting Unreleased, from comps New None None None Not run yet The Night Watch New None None None Not run yet'
    )
    // An unrun launch's finalists, slots, slot value and last run look empty, and say so to screen readers.
    expect(html).toContain(
      '<td class="border-b py-3 pl-3 align-top text-right"><span class="vh">None</span></td><td class="border-b py-3 pl-3 align-top text-right tabular-nums"><span class="vh">None</span></td><td class="border-b py-3 pl-3 align-top text-right"><span class="vh">None</span></td><td class="border-b py-3 pl-3 align-top text-muted-foreground"><span class="vh">Not run yet</span></td>'
    )
    expect(html).toContain(`href="/app/${network}/launches/${id}"`)
    expect(html).toContain(`href="/app/${network}/launches/${fromComps}"`)
    // Each row ends with its menu, whose Delete asks before it deletes.
    for (const title of ['The Night Watch', 'Blank Check · Filmspotting'])
      expect(html).toMatch(
        new RegExp(`<button\\b(?=[^>]*\\saria-haspopup="menu")(?=[^>]*\\saria-label="Actions for ${title}")`)
      )
  })

  it("marks a launch's status as the run moves, a failed or stopped one in its state's colour", async () => {
    const ada = await openMember()
    const agent = await connect(ada, `/agents/network/${await created(ada)}`)
    const base = {
      id: 'l-1',
      name: 'The Night Watch',
      comps: [],
      finalists: 0,
      slots: null,
      slotValue: null,
      startedBy: 'Ada Programmer',
      lastRun: '2026-10-19T12:00:00Z'
    }
    const statuses = ['running', 'waiting', 'ranked', 'order drafted', 'order approved', 'failed', 'stopped'] as const
    const html = launchesPage('n-1', {
      ...agent.state()!,
      launches: statuses.map((status, i) => ({ ...base, id: `l-${i}`, status }))
    })
    // Grouped by who's blocked: what needs a person first, then running, ranked, and approved.
    expect(words(html).match(/(Needs you|Running|Ranked|Not run yet|Approved) \d+/g)).toEqual([
      'Needs you 4',
      'Running 1',
      'Ranked 1',
      'Approved 1'
    ])
    // The summary: the launches, then who they wait on, in the one form every page's header counts in.
    expect(words(html)).toMatch(/^Launches 7 launches · 4 need you, 1 running New launch /)
    expect(words(html).match(/The Night Watch [A-Z][a-z]+( [a-z]+)?/g)).toEqual([
      'The Night Watch Waiting',
      'The Night Watch Order drafted',
      'The Night Watch Failed',
      'The Night Watch Stopped',
      'The Night Watch Running',
      'The Night Watch Ranked',
      'The Night Watch Order approved'
    ])
    // The live dot on a run running or waiting, a check on an approved order, a failure's ✕ and word.
    const row = (status: string) => html.match(new RegExp(`<tr data-status="${status}".*?</tr>`))![0]
    for (const status of statuses) {
      expect(row(status).includes('data-mark="live"'), status).toBe(status === 'running' || status === 'waiting')
      expect(row(status).includes('data-mark="approved"'), status).toBe(status === 'order approved')
      expect(row(status).includes('data-state="error"'), status).toBe(status === 'failed' || status === 'stopped')
    }
  })

  it('moves a launch to its group as its status changes, latest run first, the rest in their order', async () => {
    const ada = await openMember()
    const agent = await connect(ada, `/agents/network/${await created(ada)}`)
    const at = (lastRun: string | null, startedBy: string | null = lastRun && 'Ada Programmer') => ({
      comps: [],
      finalists: 0,
      slots: null,
      slotValue: null,
      startedBy,
      lastRun
    })
    const launches = [
      { id: 'l-5', name: 'Paper Moons', status: 'new', ...at(null) },
      { id: 'l-4', name: 'Slow Burn', status: 'waiting', ...at('2026-10-19T12:00:00Z') },
      { id: 'l-3', name: 'The Long Take', status: 'new', ...at(null) },
      { id: 'l-2', name: 'Corner Booth', status: 'order drafted', ...at('2026-10-20T12:00:00Z') },
      { id: 'l-1', name: 'Night Shift Cinema', status: 'running', ...at('2026-10-21T12:00:00Z') }
    ] satisfies NonNullable<State['launches']>
    const order = (list: NonNullable<State['launches']>) =>
      words(launchesPage('n-1', { ...agent.state()!, launches: list })).match(
        /Needs you \d+|Running \d+|Not run yet \d+|Paper Moons|Slow Burn|The Long Take|Corner Booth|Night Shift Cinema/g
      )
    expect(order(launches)).toEqual([
      'Needs you 2',
      'Corner Booth',
      'Slow Burn',
      'Running 1',
      'Night Shift Cinema',
      'Not run yet 2',
      'Paper Moons',
      'The Long Take'
    ])
    // Slow Burn's question is answered, and its run goes on.
    expect(order(launches.map((l) => (l.id === 'l-4' ? { ...l, status: 'running' as const } : l)))).toEqual([
      'Needs you 1',
      'Corner Booth',
      'Running 2',
      'Night Shift Cinema',
      'Slow Burn',
      'Not run yet 2',
      'Paper Moons',
      'The Long Take'
    ])
  })

  it('titles a launch from comps by its comps, and keeps them in its form', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const { agent } = await launch(ada, network, { comps: ['Blank Check', 'Filmspotting'] })
    const html = workspace(network, agent)
    expect(words(html)).toContain(
      'From comps: Blank Check · Filmspotting Qloo data Comps: Blank Check not looked up · Filmspotting not looked up'
    )
    expect(html).toMatch(/<input\b(?=[^>]*\saria-label="Comp 1")(?=[^>]*\svalue="Blank Check")/)
    expect(html).toMatch(/<input\b(?=[^>]*\saria-label="Comp 2")(?=[^>]*\svalue="Filmspotting")/)
  })

  it('names who started each run and who approved the order, and when, and exports it under the launch', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const grace = await teammate(ada, network)
    const { id, agent } = await drafted(ada, network)
    const draftHtml = workspace(network, agent, id)
    expect(words(draftHtml)).toMatch(/Run 1 · Night Shift Cinema \S+( [AP]M)? by Ada Programmer · Completed Shown/)
    // A draft is approved, or edited, and says what approving does; it has nothing to export yet.
    const [draftPlan] = hooked(draftHtml, 'data-io')
    expect(words(draftPlan)).toContain(
      'Approve Edit lines Nothing is final until you approve it. Editing returns it to draft.'
    )
    expect(words(draftPlan)).toMatch(
      /^The plan Agent drafted the slots and angles, and code prices each slot at downloads per episode × CPM ÷ 1,000\. Insertion order IO-0001 Draft Show · angle /
    )
    expect(draftHtml).not.toContain('Export CSV')
    // A member's network never labels its CPM, nor its figures, the sample's (#333).
    expect(agent.state()!.sampleCpm).toBe(false)
    expect(words(hooked(draftHtml, 'data-chart-foot')[0])).toBe('Slot value = downloads × $25 CPM ÷ 1,000')
    expect(sampleLabels(draftHtml)).toEqual([])

    const graces = await connect(grace, `/agents/launch/${network}/${id}`)
    await graces.call('approveInsertionOrder', 'IO-0001')
    await agent.until((s) => s.insertionOrder?.status === 'approved')
    const html = workspace(network, agent, id)
    const at = new Date(agent.state()!.insertionOrder!.approvedAt!)
    const day = at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    const [plan] = hooked(html, 'data-io')
    expect(words(plan)).toMatch(/ Insertion order IO-0001 Approved /)
    expect(words(plan)).toContain(
      `Approved by Grace Booker on ${day} at ${time}. Export CSV Edit lines Editing returns it to draft.`
    )
    expect(plan).not.toMatch(/>Approve<\/button>/)
    // The export is a download link under the launch, not a button.
    expect(plan).toMatch(
      new RegExp(
        `<a\\b(?=[^>]*\\shref="/app/${network}/launches/${id}/insertion-orders/IO-0001\\.csv")(?=[^>]*\\sdownload="")[^>]*>Export CSV</a>`
      )
    )
  })

  it("says when the network's roster has changed since the latest run, until it's as the run copied it", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const roster = await rosterOf(ada, network)
    rankAsked()
    fakeClaude([
      turn(resolve('Night Shift Cinema')),
      turn(rank('e-0001')),
      turn(text('Ranked.')),
      turn(resolve('Night Shift Cinema')),
      turn(rank('e-0001')),
      turn(text('Ranked again.'))
    ])
    const { agent } = await launch(ada, network)
    const changed =
      'Night Shift Audio’s roster has changed since the latest run started, so run again to rank it as it is now.'
    // Not run yet: there's no copy to compare.
    await roster.call('updateShow', 'Slow Burn', { downloads: 41000 })
    expect(words(workspace(network, agent))).not.toContain(changed)

    await agent.call('startLaunch', { name: 'Night Shift Cinema' })
    await agent.until(ended)
    expect(words(workspace(network, agent))).not.toContain(changed)
    // A teammate's edit on the roster page shows on the launch's page as it's made.
    await roster.call('updateShow', 'Paper Route', { excluded: true })
    await agent.until((s) => s.rosterChanged === true)
    expect(words(workspace(network, agent))).toContain(`Roster ${changed} Edit the roster`)
    // Put back as it was, the roster is the run's again.
    await roster.call('updateShow', 'Paper Route', { excluded: false })
    await agent.until((s) => s.rosterChanged === false)
    expect(words(workspace(network, agent))).not.toContain(changed)

    await roster.call('updateShow', 'Paper Route', { downloads: 30000 })
    await agent.until((s) => s.rosterChanged === true)
    await agent.call('startLaunch', { name: 'Night Shift Cinema' })
    const again = await agent.until((s) => ended(s) && s.run?.closing === 'Ranked again.')
    expect(again.rosterChanged).toBe(false)
    expect(words(workspace(network, agent))).not.toContain(changed)
  })

  it("shows the launch's workspace with the roster it ranks read-only, linked to the roster page", async () => {
    const ada = await openMember()
    const network = await created(ada)
    await rosterOf(ada, network)
    const { agent } = await launch(ada, network, { name: 'The Night Watch' })

    // Before its first run: the launch it plans is ready to start, and the roster is the network's. The
    // inspector is closed as the page opens, so the canvas takes the width, and the title row's Details
    // opens it. The readout has no Run log until there's a run to log.
    const before = workspace(network, agent)
    expect(words(before)).toMatch(/^The Night Watch Details Start run Not run yet\. A run looks it up in Qloo\. /)
    expect(words(before)).not.toContain('Run log')
    expect(before).toMatch(inspectorClosed)
    expect(before).toMatch(detailsToggle)
    expect(before).toMatch(/<input\b(?=[^>]*\saria-label="Released launch")(?=[^>]*\svalue="The Night Watch")/)
    expect(words(before)).toContain(
      'Roster Each run ranks Night Shift Audio’s roster as it stands when the run starts. Edit the roster'
    )
    // Nothing is counted or priced until a run brings the roster and its CPM.
    expect(words(before)).not.toContain('Roster check')
    expect(words(before)).not.toContain('Network CPM')
    expect(before).toMatch(new RegExp(`<a\\b[^>]*\\shref="/app/${network}/roster"[^>]*>Edit the roster</a>`))

    rankAsked()
    fakeClaude([turn(resolve('The Night Watch')), turn(rank('e-0001')), turn(text('Ranked.'))])
    fakeQloo({ search: { ...search, 'The Night Watch': show('e-0001', 'The Night Watch') } })
    await agent.call('startLaunch', { name: 'The Night Watch' })
    await agent.until(ended)
    const after = workspace(network, agent)
    // The title row runs this launch again as it is, or opens the form, still planning it, to change it.
    // A completed run leaves nothing for the readout to say, so the tabs follow the title row, and
    // Details opens the run's log.
    expect(words(after)).toMatch(
      /^The Night Watch Qloo data The Night Watch popularity \S+ C-\d+ Details Change launch Run again Ranking Roster /
    )
    const read = words(after)
    expect(read).toContain(
      'Roster The latest run ranks Night Shift Audio’s roster as it stood when that run started. Edit the roster'
    )
    expect(read).toContain('Corner Booth Resolved Corner Booth')
    expect(read).toContain(
      'Network CPM Each run takes the network’s CPM as it starts, to price each promo slot: downloads per episode × CPM ÷ 1,000. Change it in settings CPM $25 per 1,000 downloads'
    )
    // Changing it opens the settings' network tab.
    expect(after).toMatch(new RegExp(`href="/app/${network}/settings#network"[^>]*>Change it in settings</a>`))
    expect(read).toContain(
      'Model runs are limited per UTC day across the network’s launches and inbox, whoever starts them.'
    )
    for (const elsewhere of [
      'Import roster',
      'Upload a file',
      'Clear sample network',
      'Select a show to settle',
      'Guide',
      'Map a comp or leave out'
    ])
      expect(read).not.toContain(elsewhere)
    // No CPM field, and no show to open in an editor (the demo's rows open theirs with data-open-show).
    expect(after).not.toMatch(/<input[^>]*aria-labelledby="cpm-h"/)
    expect(after).not.toContain('data-open-show')
  })

  it('tabs a launch from its first run on, under its question: Ranking and Roster, then Plan once there’s an order', async () => {
    const ada = await openMember()
    const network = await created(ada)
    await rosterOf(ada, network)
    rankAsked()
    fakeClaude([
      turn(resolve('Night Shift Cinema')),
      turn(rank('e-0001')),
      turn(askBudget),
      turn(askExclusions),
      turn(findTags),
      turn(draft),
      turn(text('Drafted the insertion order.'))
    ])
    const { agent } = await launch(ada, network)
    // The canvas, beside the inspector and its own tabs, and its sections, by heading, in each tab's
    // panel.
    const canvas = (html: string) => hooked(html, 'data-canvas')[0]
    const panels = (html: string) =>
      hooked(canvas(html), 'role="tabpanel"').map((panel) => sections(panel).map(([heading]) => heading))

    // Before its first run there are no tabs: the roster it will rank is the page's one section.
    const before = workspace(network, agent)
    expect(tabsOf(canvas(before)).tabs).toEqual([])
    expect(sections(canvas(before)).map(([heading]) => heading)).toEqual(['Roster'])

    // Its first run ranks the roster and asks: the question stays above the tabs, the first of which,
    // Ranking, shows the fit chart and what it didn't score, and Roster the run's roster and its CPM.
    await agent.call('startLaunch', { name: 'Night Shift Cinema' })
    const budget = await agent.until((s) => s.run?.status === 'waiting' && s.run.question?.kind === 'budget')
    const asked = workspace(network, agent)
    expect(tabsOf(canvas(asked))).toEqual({
      label: 'Launch sections',
      tabs: ['Ranking', 'Roster'],
      panels: ['shown', 'hidden']
    })
    expect(asked.indexOf('aria-label="Agent asks"')).toBeGreaterThan(-1)
    expect(asked.indexOf('aria-label="Agent asks"')).toBeLessThan(asked.indexOf('role="tablist"'))
    expect(panels(asked)).toEqual([
      ['Who shares Night Shift Cinema’s listeners', 'Not scored · 1'],
      ['Roster', 'Network CPM']
    ])
    expect(asked).not.toContain('Review the plan')

    // Answered, it drafts the plan, which takes its own tab between them; "Review the plan" opens it by
    // its hash, where the plan is.
    await agent.call('answer', budget.run!.question!.id, { slots: 20 })
    const exclusions = await agent.until((s) => s.run?.question?.kind === 'exclusions')
    await agent.call('answer', exclusions.run!.question!.id, { exclude: [] })
    await agent.until(ended)
    const planned = workspace(network, agent)
    expect(tabsOf(canvas(planned))).toEqual({
      label: 'Launch sections',
      tabs: ['Ranking', 'Plan', 'Roster'],
      panels: ['shown', 'hidden', 'hidden']
    })
    expect(panels(planned)[1]).toEqual(['The plan', 'Insertion order IO-0001 Draft'])
    expect(planned).toMatch(/<a\b[^>]*\shref="#plan"[^>]*>Review the plan<\/a>/)
    const plan = hooked(canvas(planned), 'role="tabpanel"')[1]
    expect(plan).toMatch(/<div\b[^>]*\sid="plan"/)
    expect(hooked(plan, 'data-io')).toHaveLength(1)
  })

  it('heads each of a launch’s sections, and the inspector’s, with one sentence of what it holds', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const { agent } = await drafted(ada, network)
    const html = workspace(network, agent)
    const ranking = agent.state()!.ranking!

    expect(sections(hooked(html, 'data-canvas')[0])).toEqual([
      [
        'Who shares Night Shift Cinema’s listeners',
        `5 finalists. No show climbs 3 or more places over a topic-only plan. ${ranking.call}`
      ],
      ['Not scored · 1', 'The roster’s shows that the ranking left out, and why.'],
      [
        'The plan',
        'Agent drafted the slots and angles, and code prices each slot at downloads per episode × CPM ÷ 1,000.'
      ],
      // On the card, the order says no more than its heading, its badge and its lines.
      ['Insertion order IO-0001 Draft'],
      ['Roster', 'The latest run ranks Night Shift Audio’s roster as it stood when that run started.'],
      [
        'Network CPM',
        'Each run takes the network’s CPM as it starts, to price each promo slot: downloads per episode × CPM ÷ 1,000.'
      ]
    ])
    expect(sections(hooked(html, 'id="inspector"')[0])).toEqual([
      ['Run log Completed', 'Each step the run took, and how it ended.'],
      ['Runs', 'Each run starts fresh; earlier ones stay here to compare.'],
      [
        'Roster check Qloo data',
        'Rankings score resolved and mapped shows, and list an ambiguous, missed, or failed one as not scored until it’s settled or left out.'
      ]
    ])
    // A member's own network's launch isn't the sample data's, so nothing on it is labelled so.
    expect(sampleLabels(html)).toEqual([])
  })

  // A launch's Changes tab, as a reader meets it: its choice of run to compare with, each option's words
  // and whether it's the one chosen or can't be chosen; and the rows hooked by `hook`, each in words.
  const changesOf = (html: string) => hooked(html, 'data-changes')[0]
  const options = (html: string) =>
    [...html.matchAll(/<option\b([^>]*)>(.*?)<\/option>/g)].map(([, attributes, label]) => [
      words(label),
      /\sdisabled=""/.test(attributes) ? 'disabled' : /\sselected=""/.test(attributes) ? 'selected' : 'enabled'
    ])
  const rowsOf = (html: string, hook: string) => hooked(html, hook).map(words)
  const canvasOf = (html: string) => hooked(html, 'data-canvas')[0]
  // A second run of the drafted launch, answered with `slots` and `exclude`, as the agent plans it: the
  // `finalists` it ranks and finds tags for, and the `lines` it drafts.
  const runAgain = async (
    agent: Omit<Session, 'cookie'>,
    {
      slots,
      exclude,
      finalists: tagged = finalists,
      lines
    }: { slots: number; exclude: string[]; finalists?: string[]; lines?: object[] }
  ) => {
    fakeClaude([
      turn(resolve('Night Shift Cinema')),
      turn(toolUse('rank_candidates', { anchor_ids: ['e-0001'], candidate_ids: tagged, type: 'urn:entity:podcast' })),
      turn(askBudget),
      turn(askExclusions),
      turn(toolUse('shared_tags', { anchor_ids: ['e-0001'], candidate_ids: tagged })),
      lines ? turn(toolUse('draft_insertion_order', { lines })) : turn(draft),
      turn(text('Drafted it again.'))
    ])
    await agent.call('startLaunch', { name: 'Night Shift Cinema' })
    const budget = await agent.until((s) => s.run?.status === 'waiting' && s.run.question?.kind === 'budget')
    await agent.call('answer', budget.run!.question!.id, { slots })
    const exclusions = await agent.until((s) => s.run?.question?.kind === 'exclusions')
    await agent.call('answer', exclusions.run!.question!.id, { exclude })
    return agent.until((s) => ended(s) && s.run?.closing === 'Drafted it again.')
  }

  it('compares a launch’s second completed run with the first: the inputs that changed, the finalists that joined and left, every move in words, and the plan', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const { id, agent, roster } = await drafted(ada, network)
    const first = agent.state()!.run!.id
    // One completed run has nothing to compare with.
    expect(tabsOf(canvasOf(workspace(network, agent, id))).tabs).toEqual(['Ranking', 'Plan', 'Roster'])

    // Before the second run, Back Lot is included again and Paper Route's downloads change; Qloo then
    // ranks Back Lot first and Paper Route over Corner Booth, which the run leaves out at a smaller budget.
    await roster.call('updateShow', 'Back Lot', { excluded: false })
    await roster.call('updateShow', 'Paper Route', { downloads: 30000 })
    const scores = [
      { entity_id: 'e-0505', name: 'Back Lot', affinity: 0.95 },
      { entity_id: 'e-0503', name: 'Paper Route', affinity: 0.93 },
      { entity_id: 'e-0501', name: 'Corner Booth', affinity: 0.913 },
      { entity_id: 'e-0502', name: 'Slow Burn', affinity: 0.902 },
      { entity_id: 'e-0102', name: 'Field Notes: Books', affinity: 0.871 },
      { entity_id: 'e-0601', name: 'Ghost Signal Radio', affinity: 0.866 }
    ]
    fakeInsights((body) =>
      scores.filter((r) => String(body['filter.results.entities']).split(',').includes(r.entity_id))
    )
    const again = ['e-0505', 'e-0503', 'e-0502', 'e-0102', 'e-0601']
    fakeCompare(
      Object.fromEntries(again.map((e) => [e, [{ tag_id: 'urn:tag:keyword:media:film', name: 'Film', score: 0.6131 }]]))
    )
    await runAgain(agent, {
      slots: 12,
      exclude: ['Corner Booth'],
      finalists: again,
      lines: [
        { show: 'Back Lot', slots: 4, angle: 'Its studio tours share the late hours.' },
        { show: 'Paper Route', slots: 4, angle: 'Morning commuters who follow the same hosts.' },
        { show: 'Slow Burn', slots: 2, angle: 'Its long interviews share the slow pace.' },
        { show: 'Field Notes', slots: 2, angle: 'Shares the field-recording style.' }
      ]
    })

    const html = workspace(network, agent, id, { [first]: await agent.call<RunSnapshot>('getRun', first) })
    // From the second completed run on, Changes sits between Plan and Roster.
    expect(tabsOf(canvasOf(html)).tabs).toEqual(['Ranking', 'Plan', 'Changes', 'Roster'])
    const changes = changesOf(html)
    // 6 × $1,000 + 8 × $1,200 + 4 × $650 + 2 × $438 = $19,076 then; 4 × $300 + 4 × $750 + 2 × $1,000 +
    // 2 × $438 = $7,076 now.
    expect(sections(changes)).toEqual([
      ['Changes since run 1', '1 finalist changed, 5 shows moved; the plan’s value fell $12,000.'],
      ['Inputs'],
      ['Ranks'],
      ['Plan']
    ])
    expect(options(changes)).toEqual([['Run 1 · Completed', 'selected']])
    // The inputs that changed, before → after, then the finalists that joined and left.
    expect(facts(changes)).toEqual([
      ['Roster', 'Paper Route: downloads per episode 26,000 → 30,000 Back Lot: excluded → included'],
      ['Slot budget', '20 promo slots → 12 promo slots'],
      ['Left out', 'None → Corner Booth'],
      ['Joined the finalists', 'Back Lot'],
      ['Left the finalists', 'Corner Booth']
    ])
    // Each show's rank now, its move since run 1 beside it in words, the biggest moves first, then its name,
    // with a chip if it joined or left the finalists; Back Lot, ranked only in this run, has no move.
    expect(words(changes)).toContain(' Rank Since run 1 Show ')
    expect(rowsOf(changes, 'data-move')).toEqual([
      '3 ▼2 Down 2 places Was #1 Corner Booth Left the finalists',
      '4 ▼2 Down 2 places Was #2 Slow Burn',
      '2 ▲1 Up 1 place Was #3 Paper Route',
      '5 ▼1 Down 1 place Was #4 Field Notes',
      '6 ▼1 Down 1 place Was #5 Ghost Signal',
      '1 – Not ranked in run 1 Back Lot New finalist'
    ])
    expect(words(changes)).toContain(
      '– marks a show ranked in only one of the two runs: the roster changed between them.'
    )
    // A climb in signal ink, a fall muted.
    expect(hooked(changes, 'data-move="Paper Route"')[0]).toMatch(/class="[^"]*text-signal-ink/)
    expect(hooked(changes, 'data-move="Corner Booth"')[0]).not.toMatch(/text-signal-ink/)
    // The plan's lines, each run's slots and value, then the totals.
    expect(rowsOf(changes, 'data-change-line')).toEqual([
      'Back Lot – → 4 – → $1,200',
      'Paper Route 4 → 4 $2,600 → $3,000',
      'Slow Burn 6 → 2 $6,000 → $2,000',
      'Field Notes 2 → 2 $876 → $876',
      'Corner Booth 8 → – $9,600 → –'
    ])
    expect(words(changes)).toContain(' Total 20 → 12 $19,076 → $7,076')
  })

  it('says when two runs ranked the roster alike, and that the next run’s changes show once it completes', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const { id, agent } = await drafted(ada, network)
    const first = agent.state()!.run!.id
    await runAgain(agent, { slots: 20, exclude: [] })
    const earlier = { [first]: await agent.call<RunSnapshot>('getRun', first) }

    const alike = [
      ['Changes since run 1', 'Run 2 ranked the roster as run 1 did.'],
      ['Inputs', 'Run 2 ran on the same inputs as run 1.']
    ]
    const changes = changesOf(workspace(network, agent, id, earlier))
    expect(sections(changes)).toEqual(alike)
    expect(facts(changes)).toEqual([])
    expect(hooked(changes, 'data-move')).toEqual([])
    expect(hooked(changes, 'data-change-line')).toEqual([])
    // A snapshot from before comps or the exclusions answer lacks them, which is no change from none.
    const { run, launch, ...older } = earlier[first]
    const before = { ...older, run: { ...run!, exclusions: undefined }, launch: { ...launch!, comps: undefined } }
    const lacking = changesOf(workspace(network, agent, id, { [first]: before as unknown as RunSnapshot }))
    expect(sections(lacking)).toEqual(alike)
    expect(facts(lacking)).toEqual([])

    // While the next run is under way, the tab waits for it.
    fakeClaude([turn(resolve('Night Shift Cinema')), turn(rank('e-0001')), turn(askBudget)])
    await agent.call('startLaunch', { name: 'Night Shift Cinema' })
    await agent.until((s) => s.run?.status === 'waiting')
    const waiting = changesOf(workspace(network, agent, id, earlier))
    expect(sections(waiting)).toEqual([['Changes since run 2', 'Working Run 3’s changes show once it completes.']])
    expect(options(waiting)).toEqual([])
  })

  it('compares with the latest completed run before it, listing a failed run as one that can’t be chosen, with its status', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const { id, agent } = await drafted(ada, network)
    const first = agent.state()!.run!.id
    // The second run fails, as Claude has no turn to give it, so the launch still has one completed run.
    fakeClaude([])
    await agent.call('startLaunch', { name: 'Night Shift Cinema' })
    await agent.until((s) => s.run?.status === 'failed')
    expect(tabsOf(canvasOf(workspace(network, agent, id))).tabs).not.toContain('Changes')

    await runAgain(agent, { slots: 20, exclude: [] })
    const changes = changesOf(
      workspace(network, agent, id, { [first]: await agent.call<RunSnapshot>('getRun', first) })
    )
    expect(sections(changes)[0]).toEqual(['Changes since run 1', 'Run 3 ranked the roster as run 1 did.'])
    expect(options(changes)).toEqual([
      ['Run 2 · Failed', 'disabled'],
      ['Run 1 · Completed', 'selected']
    ])

    // A run that replayed the sample didn't rank the roster, so it's skipped and can't be chosen either.
    const state = agent.state()!
    const replayed = {
      state: () => ({
        ...state,
        runs: state.runs.map((r, i) => (i === 1 ? { ...r, status: 'completed' as const, replayed: true as const } : r))
      })
    } as Omit<Session, 'cookie'>
    const skipped = changesOf(
      workspace(network, replayed, id, { [first]: await agent.call<RunSnapshot>('getRun', first) })
    )
    expect(sections(skipped)[0]).toEqual(['Changes since run 1', 'Run 3 ranked the roster as run 1 did.'])
    expect(options(skipped)).toEqual([
      ['Run 2 · Completed · Replayed', 'disabled'],
      ['Run 1 · Completed', 'selected']
    ])
  })

  it('matches a show on its Qloo entity when another show is mapped onto that entity between runs', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const { id, agent, roster } = await drafted(ada, network)
    const first = agent.state()!.run!.id
    // Ghost Signal is mapped onto Corner Booth's entity, so the second run scores the two as one show.
    await roster.searchComps('Ghost Signal', 'Corner Booth')
    await roster.call('updateShow', 'Ghost Signal', { compId: 'e-0501' })
    await runAgain(agent, { slots: 20, exclude: [], finalists: ['e-0501', 'e-0502', 'e-0503', 'e-0102'] })

    const changes = changesOf(
      workspace(network, agent, id, { [first]: await agent.call<RunSnapshot>('getRun', first) })
    )
    expect(facts(changes)[0]).toEqual(['Roster', 'Ghost Signal: Qloo match Ghost Signal Radio → Corner Booth'])
    // Corner Booth keeps its entity, so it's the same show at the same rank, neither new nor gone. Ghost
    // Signal, on another entity now, is ranked in each run as a different show.
    expect(rowsOf(changes, 'data-move')).toEqual([
      '3 ▼1 Down 1 place Was #2 Slow Burn',
      '4 ▼1 Down 1 place Was #3 Paper Route',
      '5 ▼1 Down 1 place Was #4 Field Notes',
      '2 – Not ranked in run 1 Ghost Signal New finalist',
      '– Not ranked in run 2 – Was #5 Ghost Signal Left the finalists',
      '1 = Same rank Corner Booth'
    ])
    // Its line is the same in both plans.
    expect(sections(changes).map(([heading]) => heading)).toEqual(['Changes since run 1', 'Inputs', 'Ranks'])
  })

  // The Launches page's Inventory tab, and the inventory each launch's row reports (#406).
  const inventoryOf = (html: string) => hooked(html, 'data-inventory')[0]
  const shows = (html: string) => rowsOf(inventoryOf(html), 'data-inventory-show')
  // The rows Night Shift Cinema's first drafted order commits, at the $25 CPM: 8 × $1,200, 6 × $1,000,
  // 4 × $650 and 2 × $438.
  const firstOrder = (run: string) => ({
    run,
    cpm: 25,
    sampleCpm: false,
    lines: [
      { show: 'Corner Booth', slots: 8, value: 9600 },
      { show: 'Slow Burn', slots: 6, value: 6000 },
      { show: 'Paper Route', slots: 4, value: 2600 },
      { show: 'Field Notes', slots: 2, value: 876 }
    ]
  })

  it("reports each launch's finalists and orders from what its runs ended with, and keeps an approved order counting, apart from a newer draft, as it runs again", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const { id, agent, roster } = await drafted(ada, network)
    const first = agent.state()!.run!.id
    const row = async (ready: (l: LaunchSummary) => boolean) =>
      (await roster.until((s) => s.launches?.some((l) => l.id === id && ready(l)) ?? false)).launches!.find(
        (l) => l.id === id
      )!
    const finalistShows = ['Corner Booth', 'Slow Burn', 'Paper Route', 'Field Notes', 'Ghost Signal']
    expect(await row((l) => l.status === 'order drafted')).toMatchObject({
      finalists: 5,
      finalistShows,
      approvedLines: null,
      draftLines: firstOrder(first)
    })
    await agent.call('approveInsertionOrder', agent.state()!.insertionOrder!.id)
    expect(await row((l) => l.status === 'order approved')).toMatchObject({
      finalistShows,
      approvedLines: firstOrder(first),
      draftLines: null
    })

    // Run again: as it starts, the launch's ranking and order are cleared, but the approved order and the
    // last completed run's finalists still count.
    const held = Promise.withResolvers<void>()
    fakeClaude([
      async () => {
        await held.promise
        return turn(resolve('Night Shift Cinema'))
      },
      turn(rank('e-0001')),
      turn(askBudget),
      turn(askExclusions),
      turn(findTags),
      turn(
        toolUse('draft_insertion_order', {
          lines: [
            { show: 'Slow Burn', slots: 10, angle: 'Its long interviews share the slow pace.' },
            { show: 'Field Notes', slots: 2, angle: 'Shares the field-recording style.' }
          ]
        })
      ),
      turn(text('Drafted it again.'))
    ])
    await agent.call('startLaunch', { name: 'Night Shift Cinema' })
    const second = agent.state()!.run!.id
    expect(await row((l) => l.status === 'running')).toMatchObject({
      slots: null,
      finalistShows,
      approvedLines: firstOrder(first),
      draftLines: null
    })
    held.resolve()
    const budget = await agent.until((s) => s.run?.question?.kind === 'budget')
    await agent.call('answer', budget.run!.question!.id, { slots: 12 })
    const exclusions = await agent.until((s) => s.run?.question?.kind === 'exclusions')
    await agent.call('answer', exclusions.run!.question!.id, { exclude: [] })
    // The new draft counts as drafted, beside the approved order, never added to it.
    const redrafted = {
      run: second,
      cpm: 25,
      sampleCpm: false,
      lines: [
        { show: 'Slow Burn', slots: 10, value: 10_000 },
        { show: 'Field Notes', slots: 2, value: 876 }
      ]
    }
    const both = await row((l) => l.status === 'order drafted')
    expect(both).toMatchObject({ slots: 12, approvedLines: firstOrder(first), draftLines: redrafted })
    const html = launchesPage(network, roster.state())
    expect(tabsOf(html)).toEqual({
      label: 'Launches sections',
      tabs: ['Launches', 'Inventory'],
      panels: ['shown', 'hidden']
    })
    expect(sections(inventoryOf(html))).toEqual([
      [
        'Promo inventory',
        '20 slots approved across 1 insertion order, worth $19,076 as each order was priced; 12 slots drafted across 1 order; 1 show has never been a finalist.'
      ]
    ])
    // A show never a finalist has no figures: its cells say "None" to screen readers alone.
    expect(shows(html)).toEqual([
      'Corner Booth Night Shift Cinema 1 8 $9,600 0',
      'Slow Burn Night Shift Cinema 1 6 $6,000 10',
      'Paper Route Night Shift Cinema 1 4 $2,600 0',
      'Field Notes Night Shift Cinema 1 2 $876 2',
      'Ghost Signal 1 0 $0 0',
      'Back Lot None None None None'
    ])

    // Approving the new order makes it the approved one; editing it returns it to draft, and the latest order
    // still approved, the first run's, which ad operations may already have, counts again.
    const order2 = agent.state()!.insertionOrder!.id
    await agent.call('approveInsertionOrder', order2)
    expect(await row((l) => l.status === 'order approved')).toMatchObject({
      approvedLines: redrafted,
      draftLines: null
    })
    await agent.call('editInsertionOrder', order2, [{ show: 'Slow Burn', slots: 4, angle: 'Call-ins.' }])
    expect(await row((l) => l.status === 'order drafted')).toMatchObject({
      approvedLines: firstOrder(first),
      draftLines: { ...redrafted, lines: [{ show: 'Slow Burn', slots: 4, value: 4000 }] }
    })

    // A run that stops at once, as Qloo can't be called, clears the draft, and the approved order stays.
    env.QLOO_DAILY_CALL_CAP = '0'
    await agent.call('startLaunch', { name: 'Night Shift Cinema' })
    expect(await row((l) => l.status === 'stopped')).toMatchObject({
      slots: null,
      finalistShows,
      approvedLines: firstOrder(first),
      draftLines: null
    })
  })

  it('totals the inventory of every launch that has reported it: the slots, how many approved and their value, and each show in its group, linked to the plans it’s in', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const roster = await rosterOf(ada, network)
    const base = { comps: [], finalists: 5, slots: null, slotValue: null, startedBy: 'Ada Programmer', lastRun: null }
    const lines = (run: string, cpm: number, sampleCpm: boolean, ...shown: [string, number, number | null][]) => ({
      run,
      cpm,
      sampleCpm,
      lines: shown.map(([show, slots, value]) => ({ show, slots, value }))
    })
    const launches: LaunchSummary[] = [
      {
        ...base,
        id: 'l-1',
        name: 'Night Shift Cinema',
        status: 'order drafted',
        finalistShows: ['Slow Burn', 'Corner Booth', 'Paper Route', 'Field Notes', 'Ghost Signal'],
        approvedLines: lines('r-1', 25, false, ['Corner Booth', 8, 9600], ['Slow Burn', 6, 6000]),
        // A show the network has since taken off its roster stays in the order.
        draftLines: lines('r-2', 25, false, ['Slow Burn', 10, 10_000], ['Dead Air', 2, 500])
      },
      {
        ...base,
        id: 'l-2',
        name: null,
        comps: ['Blank Check', 'Filmspotting'],
        status: 'order drafted',
        finalistShows: ['Paper Route', 'Corner Booth', 'Slow Burn'],
        approvedLines: null,
        draftLines: lines('r-3', 25, false, ['Paper Route', 4, 2600])
      },
      {
        ...base,
        id: 'l-3',
        name: 'The Long Take',
        status: 'new',
        finalists: 0,
        finalistShows: [],
        approvedLines: null,
        draftLines: null
      },
      // A row from before rows reported it.
      { ...base, id: 'l-4', name: 'Paper Moons', status: 'order approved' }
    ]
    const html = launchesPage(network, { ...roster.state()!, launches })
    const inventory = inventoryOf(html)
    expect(sections(inventory)).toEqual([
      [
        'Promo inventory',
        '14 slots approved across 1 insertion order, worth $15,600 as each order was priced; 16 slots drafted across 2 orders; 1 show has never been a finalist.'
      ]
    ])
    expect(words(inventory)).toMatch(
      /^Promo inventory .+ 1 launch hasn’t reported yet; the totals leave it out\. Show Finalist in Slots approved Approved value Slots drafted In an order 4 /
    )
    // Grouped, most slots approved first, then drafted; then by finalists, and in the roster's order.
    expect(words(inventory).match(/(In an order|Finalist only|Never a finalist) \d+/g)).toEqual([
      'In an order 4',
      'Finalist only 2',
      'Never a finalist 1'
    ])
    expect(shows(html)).toEqual([
      'Corner Booth Night Shift Cinema 2 8 $9,600 0',
      'Slow Burn Night Shift Cinema 2 6 $6,000 10',
      'Paper Route Blank Check · Filmspotting 2 0 $0 4',
      'Dead Air Night Shift Cinema No longer on the roster 0 0 $0 2',
      'Field Notes 1 0 $0 0',
      'Ghost Signal 1 0 $0 0',
      'Back Lot None None None None'
    ])
    // Each launch an order commits a show to links to its plan.
    const [corner] = hooked(inventory, 'data-inventory-show="Corner Booth"')
    expect([...corner.matchAll(/href="([^"]+)"/g)].map(([, href]) => href)).toEqual([
      `/app/${network}/launches/l-1#plan`
    ])
    const [paper] = hooked(inventory, 'data-inventory-show="Paper Route"')
    expect([...paper.matchAll(/href="([^"]+)"/g)].map(([, href]) => href)).toEqual([
      `/app/${network}/launches/l-2#plan`
    ])

    // An order priced at the sample CPM is named; a line without a value leaves its slots out of the value,
    // which a show with no line priced shows as `–`, and one with some priced as theirs.
    const sample = launchesPage(network, {
      ...roster.state()!,
      launches: [
        {
          ...launches[0],
          approvedLines: lines(
            'r-1',
            20,
            true,
            ['Corner Booth', 8, 7680],
            ['Slow Burn', 6, null],
            ['Paper Route', 2, null]
          ),
          draftLines: null
        },
        { ...launches[1], approvedLines: lines('r-3', 25, false, ['Slow Burn', 2, 2000]), draftLines: null }
      ]
    })
    expect(sections(inventoryOf(sample))[0][1]).toBe(
      '18 slots approved across 2 insertion orders, worth $9,680 as each order was priced, before the lines without a value, 1 order at the $20 sample CPM; 1 show has never been a finalist.'
    )
    expect(shows(sample).slice(0, 3)).toEqual([
      'Corner Booth Night Shift Cinema 2 8 $7,680 0',
      'Slow Burn Night Shift Cinema , Blank Check · Filmspotting 2 8 $2,000 0',
      'Paper Route Night Shift Cinema 2 2 – 0'
    ])
  })

  it('says when no launch has ranked the roster yet, or launches haven’t reported, and holds skeleton rows until the state arrives', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const roster = await rosterOf(ada, network)
    const base = { comps: [], finalists: 0, slots: null, slotValue: null, startedBy: null, lastRun: null }
    const fresh: LaunchSummary = {
      ...base,
      id: 'l-1',
      name: 'The Long Take',
      status: 'new',
      finalistShows: [],
      approvedLines: null,
      draftLines: null
    }
    const old: LaunchSummary = { ...base, id: 'l-2', name: 'Paper Moons', status: 'ranked', finalists: 5 }
    const said = (launches: LaunchSummary[]) =>
      sections(inventoryOf(launchesPage(network, { ...roster.state()!, launches })))
    expect(said([fresh])).toEqual([['Promo inventory', 'No launch has ranked the roster yet.']])
    expect(said([fresh, old, { ...old, id: 'l-3' }])).toEqual([
      ['Promo inventory', '2 launches haven’t reported yet; the totals leave them out.']
    ])
    expect(shows(launchesPage(network, { ...roster.state()!, launches: [fresh] }))).toEqual([])

    // Until the network's state arrives, both tabs hold their skeletons.
    const loading = launchesPage(network, undefined)
    expect(tabsOf(loading).tabs).toEqual(['Launches', 'Inventory'])
    expect(sections(inventoryOf(loading))).toEqual([['Promo inventory']])
    expect(inventoryOf(loading).match(/data-slot="skeleton"/g)).toHaveLength(3)
  })

  it('asks a launch whose row predates its inventory for it as the network starts, and again at the next start when it fails to answer', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const { id, roster } = await drafted(ada, network)
    const reported = (await roster.until((s) => s.launches?.[0].draftLines != null)).launches!
    // Stand in for a network from before #406: its launch's row has none of it, and it has asked for none.
    const stub = env.NetworkAgent.get(env.NetworkAgent.idFromName(network))
    const old = ({ finalistShows: _, approvedLines: __, draftLines: ___, ...row }: LaunchSummary) => row
    await runInDurableObject(stub, (n: NetworkAgent, { storage }) => {
      n.setState({ ...n.state, launches: n.state.launches!.map(old) })
      storage.kv.delete('crossfeed_inventory_asked')
    })
    const unreported = launchesPage(network, (await connect(ada, `/agents/network/${network}`)).state())
    expect(words(inventoryOf(unreported))).toContain('1 launch hasn’t reported yet; the totals leave it out.')

    // As the network next starts, the launch fails to answer: its row stays unreported, and the next
    // start asks it again.
    const asked = vi.spyOn(LaunchAgent.prototype, 'summary').mockImplementationOnce(() => {
      throw new Error('The launch is overloaded.')
    })
    await evictDurableObject(stub, { webSockets: 'close' })
    const failed = await connect(ada, `/agents/network/${network}`)
    await vi.waitFor(() => expect(asked).toHaveBeenCalledOnce())
    await vi.waitFor(async () =>
      expect(
        await runInDurableObject(stub, (_, { storage }) => storage.kv.get('crossfeed_inventory_asked'))
      ).toBeUndefined()
    )
    expect(failed.state()!.launches![0].finalistShows).toBeUndefined()

    await evictDurableObject(stub, { webSockets: 'close' })
    const filled = await connect(ada, `/agents/network/${network}`)
    expect((await filled.until((s) => s.launches?.[0].finalistShows !== undefined)).launches).toEqual(reported)
    expect(await runInDurableObject(stub, (_, { storage }) => storage.kv.get('crossfeed_inventory_asked'))).toBe(1)
    expect(asked).toHaveBeenCalledTimes(2)
    expect(reported[0].id).toBe(id)
  })

  it('counts the draft of a run that failed after drafting it, as its plan can still be approved', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const roster = await rosterOf(ada, network)
    rankAsked()
    // The run drafts its order, then Claude has no turn left to give it, so it fails.
    fakeClaude([
      turn(resolve('Night Shift Cinema')),
      turn(rank('e-0001')),
      turn(askBudget),
      turn(askExclusions),
      turn(findTags),
      turn(draft)
    ])
    const { id, agent } = await launch(ada, network)
    await agent.call('startLaunch', { name: 'Night Shift Cinema' })
    const budget = await agent.until((s) => s.run?.question?.kind === 'budget')
    await agent.call('answer', budget.run!.question!.id, { slots: 20 })
    const exclusions = await agent.until((s) => s.run?.question?.kind === 'exclusions')
    await agent.call('answer', exclusions.run!.question!.id, { exclude: [] })
    const failed = await agent.until((s) => s.run?.status === 'failed')
    expect(failed.insertionOrder?.status).toBe('draft')

    // No run has completed, so it has no finalists, but its draft counts as drafted.
    const listed = await roster.until((s) => s.launches?.some((l) => l.id === id && l.draftLines != null) ?? false)
    expect(listed.launches!.find((l) => l.id === id)).toMatchObject({
      status: 'failed',
      finalistShows: [],
      approvedLines: null,
      draftLines: firstOrder(failed.run!.id)
    })
    expect(sections(inventoryOf(launchesPage(network, roster.state())))[0][1]).toBe(
      'No slots approved yet; 20 slots drafted across 1 insertion order; 2 shows have never been a finalist.'
    )
  })

  it('asks no launch the list has let go of while the network was asking the others', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const agent = await connect(ada, `/agents/network/${network}`)
    const reports = vi.spyOn(NetworkAgent.prototype, 'reportLaunch')
    for (const name of ['Corner Booth', 'Slow Burn', 'Paper Route', 'Field Notes', 'Ghost Signal', 'Back Lot'])
      await agent.call('createLaunch', { name })
    // Each launch reports its row once it's planned; once all six have, none reports again.
    await vi.waitFor(() => expect(reports).toHaveBeenCalledTimes(6))
    // Six launches from before #406, so the network asks five at once and the sixth waits its turn.
    const stub = env.NetworkAgent.get(env.NetworkAgent.idFromName(network))
    const old = ({ finalistShows: _, approvedLines: __, draftLines: ___, ...row }: LaunchSummary) => row
    await runInDurableObject(stub, (n: NetworkAgent, { storage }) => {
      n.setState({ ...n.state, launches: n.state.launches!.map(old) })
      storage.kv.delete('crossfeed_inventory_asked')
    })
    const summary = LaunchAgent.prototype.summary
    const held = Promise.withResolvers<void>()
    const asked = vi.spyOn(LaunchAgent.prototype, 'summary').mockImplementation(function (this: LaunchAgent) {
      return held.promise.then(() => summary.call(this)) as unknown as ReturnType<typeof summary>
    })
    await evictDurableObject(stub, { webSockets: 'close' })
    const restarted = await connect(ada, `/agents/network/${network}`)
    await vi.waitFor(() => expect(asked).toHaveBeenCalledTimes(5))

    // The sixth is deleted from the Launches page while the first five are asked.
    const sixth = restarted.state()!.launches!.at(-1)!.id
    expect((await ada.fetch(`/app/${network}/launches/${sixth}/delete`, { method: 'POST' })).status).toBe(200)
    held.resolve()
    const filled = await restarted.until(
      (s) => s.launches!.length === 5 && s.launches!.every((l) => l.finalistShows !== undefined)
    )
    expect(filled.launches!.map((l) => l.id)).not.toContain(sixth)
    expect(asked).toHaveBeenCalledTimes(5)
    // Every launch it still lists answered, so it's noted as asked.
    await vi.waitFor(async () =>
      expect(await runInDurableObject(stub, (_, { storage }) => storage.kv.get('crossfeed_inventory_asked'))).toBe(1)
    )
  })
})

// Four more made-up shows for the made-up roster, so it has 10 shows matched in Qloo, and each show 3
// closest shows.
const more = {
  'Night Ferry': show('e-0701', 'Night Ferry'),
  'Static Bloom': show('e-0702', 'Static Bloom'),
  'Deep Cuts': show('e-0703', 'Deep Cuts'),
  'Signal Boost': show('e-0704', 'Signal Boost')
}
const names: Record<string, string> = Object.fromEntries(
  [...Object.values(search), ...Object.values(more)].flat().map((e) => [e.entity_id, e.name])
)
// Each Qloo show's made-up place on a line, so its listeners overlap most with the shows nearest it. Of
// the order's shows, Corner Booth and Slow Burn each rank among the other's 3 closest shows, and Paper
// Route and Field Notes are in no pair with another of them.
const places: Record<string, number> = {
  'e-0501': 0,
  'e-0502': 1,
  'e-0701': 3,
  'e-0702': 7,
  'e-0503': 20,
  'e-0601': 21,
  'e-0505': 22,
  'e-0102': 40,
  'e-0703': 41,
  'e-0704': 42
}
// Qloo ranks the roster against the launch as rankAsked has it, and against one of the roster's own
// shows by how near each candidate's place in `spots` is to that show's. Made-up scores.
const overlapping = (spots: Record<string, number>) => {
  rankAsked()
  fakeInsights((body) => {
    const anchor = String(body['signal.interests.entities'])
    const candidates = String(body['filter.results.entities']).split(',')
    if (anchor === 'e-0001') return fit.filter((r) => candidates.includes(r.entity_id))
    return candidates.map((c) => ({
      entity_id: c,
      name: names[c],
      affinity: 0.95 - Math.abs(spots[anchor] - spots[c]) / 100
    }))
  })
}
// The made-up network's roster with the four more shows, settled, and its overlap measured unless
// `measure` is false.
async function measured(owner: Member, network: string, { measure = true } = {}) {
  const roster = await rosterOf(owner, network)
  fakeQloo({ search: { ...search, ...more } })
  const rows = Object.keys(more).map((name, i) => `${name},${4000 - i * 500}`)
  await roster.call('importRoster', [csv, ...rows].join('\n'), 'csv')
  await roster.until((s) => s.roster.length === 10 && s.roster.every((r) => r.resolution !== 'pending'))
  if (measure) {
    await roster.call('measureOverlap')
    await roster.until((s) => s.overlap?.status === 'measured')
  }
  return roster
}
// A new launch run to a drafted order on the network, as drafted() runs one, doing `meanwhile` while
// it waits on the budget, before it drafts.
async function planned(
  member: Member,
  network: string,
  meanwhile: (agent: Omit<Session, 'cookie'>) => Promise<void> = async () => {}
) {
  fakeClaude([
    turn(resolve('Night Shift Cinema')),
    turn(rank('e-0001')),
    turn(askBudget),
    turn(askExclusions),
    turn(findTags),
    turn(draft),
    turn(text('Drafted the insertion order.'))
  ])
  const { id, agent } = await launch(member, network)
  await agent.call('startLaunch', { name: 'Night Shift Cinema' })
  const budget = await agent.until((s) => s.run?.question?.kind === 'budget')
  await meanwhile(agent)
  await agent.call('answer', budget.run!.question!.id, { slots: 20 })
  const exclusions = await agent.until((s) => s.run?.question?.kind === 'exclusions')
  await agent.call('answer', exclusions.run!.question!.id, { exclude: [] })
  await agent.until(ended)
  return { id, agent }
}

describe('close pairs in the plan', () => {
  const words = (html: string) =>
    html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  // The launch's page as a member reads it.
  const page = (network: string, state: State, id: string) =>
    renderToStaticMarkup(
      <LaunchWorkspace
        agent={{ state, stub: {} } as unknown as Agent}
        network={{ id: network, name: 'Night Shift Audio', role: 'owner', links: networkLinks(env, network) }}
        orders={`/app/${network}/launches/${id}/insertion-orders`}
      />
    )
  // What the plan says of close pairs, line by line, and whether each line is muted.
  const pairLines = (html: string) =>
    hooked(html, 'data-close-pairs').flatMap((said) =>
      [...said.matchAll(/<p\b([^>]*)>(.*?)<\/p>/g)].map(([, attributes, line]) =>
        attributes.includes('text-muted-foreground') ? `muted: ${words(line)}` : words(line)
      )
    )
  // The overlap rankings a launch's log holds, which it copied from its network's.
  const copiedRankings = async (agent: Omit<Session, 'cookie'>) =>
    (await agent.call<Evidence[]>('getEvidence')).filter((e) => e.endpoint === '/v2/insights' && e.copiedFrom)
  const anchorOf = (e: Evidence) => e.params['signal.interests.entities']
  // The text an assistant reads from MCP tool `name`, with the network's API key `secret`.
  const mcpText = async (secret: string, name: string, args: object) => {
    const res = await exports.default.fetch('https://crossfeed.test/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${secret}`
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
    })
    const body = await res.text()
    const json = res.headers.get('Content-Type')?.includes('text/event-stream')
      ? body
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5))
          .join('')
      : body
    const { result } = JSON.parse(json) as { result: { content: { text: string }[] } }
    return result.content.map((c) => c.text).join('\n')
  }
  const runOf = async (call: (path: string) => Promise<Response>, network: string, id: string, state: State) =>
    (await call(`/api/v1/networks/${network}/launches/${id}/runs/${state.run!.id}`)).json<{
      insertionOrder: Record<string, unknown> & { closePairs?: unknown }
    }>()

  it('names each close pair among its order’s shows, citing both shows’ rankings it copied as it drafted, and an edit that drops a line drops its pair', async () => {
    const { ada, network, call, secret } = await networkWithKey()
    overlapping(places)
    const roster = await measured(ada, network)
    const overlap = roster.state()!.overlap!
    const networkLog = await roster.call<Evidence[]>('getEvidence')
    const { id, agent } = await planned(ada, network, async (agent) => {
      // As the run starts, it copies the overlap with the roster, citing the network's calls, and none of
      // their records.
      expect(agent.state()!.rosterOverlap).toEqual({
        key: overlap.key,
        measuredAt: overlap.measuredAt,
        rows: overlap.rows
      })
      expect(await copiedRankings(agent)).toEqual([])
    })
    const state = agent.state()!

    // As it drafted its order, it copied its 5 finalists' rankings into its log, in the network's order,
    // each marked with the network's call it copies, and noted each one's copy on its row.
    const copies = await copiedRankings(agent)
    expect(copies.map(anchorOf)).toEqual(['e-0102', 'e-0501', 'e-0502', 'e-0503', 'e-0601'])
    for (const copy of copies) {
      const original = networkLog.find((e) => e.call === copy.copiedFrom)!
      expect(copy).toEqual({ ...original, call: copy.call, copiedFrom: original.call })
    }
    expect(state.rosterOverlap!.rows.filter((r) => r.copy).map((r) => [r.call, r.copy])).toEqual(
      copies.map((e) => [e.copiedFrom, e.call])
    )
    const copyOf = (entity: string) => copies.find((e) => anchorOf(e) === entity)!.call
    const [cb, sb, pr, fn] = ['e-0501', 'e-0502', 'e-0503', 'e-0102'].map(copyOf)

    // The plan names the pair under its checks, in ink, with the Qloo data chip and both calls.
    const html = page(network, state, id)
    expect(pairLines(html)).toEqual([
      `Qloo data Corner Booth and Slow Burn each rank among the other’s 3 closest shows by listener overlap. ${cb} ${sb}`
    ])
    expect(html).toContain(`aria-label="Evidence for Corner Booth’s closest shows: call ${cb}"`)
    expect(html).toContain(`aria-label="Evidence for Slow Burn’s closest shows: call ${sb}"`)
    // A program reads it on the run's order, citing the calls the launch's evidence holds.
    const pairs = {
      closestCount: 3,
      stale: false,
      pairs: [{ shows: ['Corner Booth', 'Slow Burn'], calls: [cb, sb] }],
      checked: [
        { show: 'Corner Booth', call: cb },
        { show: 'Slow Burn', call: sb },
        { show: 'Paper Route', call: pr },
        { show: 'Field Notes', call: fn }
      ],
      unchecked: []
    }
    expect((await runOf(call, network, id, state)).insertionOrder.closePairs).toEqual(pairs)
    // An assistant reads the pair in the order's text, as the plan words it.
    expect(await mcpText(secret, 'get_launch', { launchId: id })).toContain(
      '\nCorner Booth and Slow Burn each rank among the other’s 3 closest shows by listener overlap.\n'
    )

    // A copied ranking's evidence says it's from the roster's overlap, and which of the network's calls.
    const record = copies.find((e) => e.call === cb)!
    const opened = renderToStaticMarkup(
      <EvidencePanel
        opened={{ call: cb, status: 'loaded', record }}
        names={namesOf(await agent.call<Evidence[]>('getEvidence'))}
        runs={state.runs}
      />
    )
    expect(sections(opened)[0][0]).toBe(`Evidence · ${cb} Qloo data From the roster’s overlap`)
    expect(words(opened)).toContain(
      `Answer From the roster’s overlap, the network’s call ${record.copiedFrom} , as Qloo answered it then; the run made no new request`
    )

    // Dropping Slow Burn's line drops the pair, which was never stored: no two of the plan's shows are one.
    const order = state.insertionOrder!
    const edited = await call(`/api/v1/networks/${network}/launches/${id}/insertion-orders/${order.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lines: order.lines
          .filter((l) => l.show !== 'Slow Burn')
          .map(({ show, slots, angle }) => ({ show, slots, angle }))
      })
    })
    expect(edited.status).toBe(200)
    expect((await edited.json<{ closePairs: unknown }>()).closePairs).toEqual({
      ...pairs,
      pairs: [],
      checked: pairs.checked.filter((c) => c.show !== 'Slow Burn')
    })
    // The plan says so, citing each ranking it checked.
    const after = await agent.until((s) => s.insertionOrder?.lines.length === 3)
    expect(pairLines(page(network, after, id))).toEqual([
      `muted: Qloo data No two of the plan’s shows each rank among the other’s 3 closest shows by listener overlap. ${cb} ${pr} ${fn}`
    ])
  })

  it('copies each finalist’s ranking once, however many times the run drafts its order', async () => {
    const ada = await openMember()
    const network = await created(ada)
    overlapping(places)
    await measured(ada, network)
    // The agent drafts twice in one turn, then once more.
    fakeClaude([
      turn(resolve('Night Shift Cinema')),
      turn(rank('e-0001')),
      turn(askBudget),
      turn(askExclusions),
      turn(findTags),
      turn(draft, draft),
      turn(draft),
      turn(text('Drafted the insertion order.'))
    ])
    const { agent } = await launch(ada, network)
    await agent.call('startLaunch', { name: 'Night Shift Cinema' })
    const budget = await agent.until((s) => s.run?.question?.kind === 'budget')
    await agent.call('answer', budget.run!.question!.id, { slots: 20 })
    const exclusions = await agent.until((s) => s.run?.question?.kind === 'exclusions')
    await agent.call('answer', exclusions.run!.question!.id, { exclude: [] })
    const state = await agent.until(ended)

    expect(state.run?.status).toBe('completed')
    const copies = await copiedRankings(agent)
    expect(copies.map(anchorOf)).toEqual(['e-0102', 'e-0501', 'e-0502', 'e-0503', 'e-0601'])
    expect(state.rosterOverlap!.rows.filter((r) => r.copy).map((r) => r.copy)).toEqual(copies.map((e) => e.call))
  })

  it('copies no overlap into a run started while a measure runs, or after one failed, and the plan says nothing of pairs', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const roster = await measured(ada, network, { measure: false })
    // The overlap's rankings wait until the run has started.
    const held = Promise.withResolvers<void>()
    rankAsked()
    fakeInsights(async (body) => {
      const candidates = String(body['filter.results.entities']).split(',')
      if (body['signal.interests.entities'] === 'e-0001') return fit.filter((r) => candidates.includes(r.entity_id))
      await held.promise
      return candidates.map((c) => ({ entity_id: c, name: names[c], affinity: 0.9 }))
    })
    await roster.call('measureOverlap')
    await roster.until((s) => s.overlap?.status === 'measuring')
    fakeClaude([
      turn(resolve('Night Shift Cinema')),
      turn(rank('e-0001')),
      turn(askBudget),
      turn(askExclusions),
      turn(findTags),
      turn(draft),
      turn(text('Drafted the insertion order.'))
    ])
    const { id, agent } = await launch(ada, network)
    await agent.call('startLaunch', { name: 'Night Shift Cinema' })
    expect(agent.state()!.rosterOverlap).toBeUndefined()
    held.resolve()
    await roster.until((s) => s.overlap?.status === 'measured')
    const budget = await agent.until((s) => s.run?.question?.kind === 'budget')
    await agent.call('answer', budget.run!.question!.id, { slots: 20 })
    const exclusions = await agent.until((s) => s.run?.question?.kind === 'exclusions')
    await agent.call('answer', exclusions.run!.question!.id, { exclude: [] })
    const during = await agent.until(ended)
    // The overlap measured since doesn't reach the run, which drafted with none.
    expect(during.insertionOrder).not.toBeNull()
    expect(during.rosterOverlap).toBeUndefined()
    expect(await copiedRankings(agent)).toEqual([])
    expect(hooked(page(network, during, id), 'data-close-pairs')).toEqual([])

    // A show joins the roster, and the measure of it fails at every ranking.
    fakeQloo({ search: { ...search, ...more, 'Night Owl': show('e-0705', 'Night Owl') } })
    const rows = [...Object.keys(more), 'Night Owl'].map((name) => `${name},1000`)
    await roster.call('importRoster', [csv, ...rows].join('\n'), 'csv')
    await roster.until((s) => s.roster.length === 11 && s.roster.every((r) => r.resolution !== 'pending'))
    rankAsked()
    fakeInsights((body) =>
      body['signal.interests.entities'] === 'e-0001'
        ? fit.filter((r) => String(body['filter.results.entities']).split(',').includes(r.entity_id))
        : 503
    )
    await roster.call('measureOverlap')
    expect((await roster.until((s) => s.overlap?.status !== 'measuring')).overlap?.status).toBe('failed')
    // Qloo answers the next call, a comp search the gateway hasn't cached, so it's no longer failing as the
    // run starts.
    await roster.searchComps('Ghost Signal', 'Ghost Signal Weekly')
    await roster.until((s) => s.roster.find((r) => r.name === 'Ghost Signal')?.compSearch?.status === 'done')
    fakeClaude([
      turn(resolve('Night Shift Cinema')),
      turn(rank('e-0001')),
      turn(askBudget),
      turn(askExclusions),
      turn(findTags),
      turn(draft),
      turn(text('Drafted it again.'))
    ])
    await agent.call('startLaunch', { name: 'Night Shift Cinema' })
    const again = await agent.until((s) => s.run?.question?.kind === 'budget')
    await agent.call('answer', again.run!.question!.id, { slots: 20 })
    const left = await agent.until((s) => s.run?.question?.kind === 'exclusions')
    await agent.call('answer', left.run!.question!.id, { exclude: [] })
    const after = await agent.until((s) => ended(s) && s.run?.closing === 'Drafted it again.')
    expect(after.insertionOrder).not.toBeNull()
    expect(after.rosterOverlap).toBeUndefined()
    expect(await copiedRankings(agent)).toEqual([])
    expect(hooked(page(network, after, id), 'data-close-pairs')).toEqual([])
  })

  it('says nothing of pairs on a roster whose overlap was never measured, and copies none', async () => {
    const { ada, network, call } = await networkWithKey()
    overlapping(places)
    await measured(ada, network, { measure: false })
    const { id, agent } = await planned(ada, network)
    const state = agent.state()!

    expect(state.insertionOrder).not.toBeNull()
    expect(state.rosterOverlap).toBeUndefined()
    expect(await copiedRankings(agent)).toEqual([])
    expect(hooked(page(network, state, id), 'data-close-pairs')).toEqual([])
    expect((await runOf(call, network, id, state)).insertionOrder).not.toHaveProperty('closePairs')
  })

  it('says in one muted line that an overlap measured before the roster’s matched shows changed is stale, and names no pairs', async () => {
    const { ada, network, call } = await networkWithKey()
    overlapping(places)
    const roster = await measured(ada, network)
    // A show joins the roster, so the overlap no longer covers its matched shows.
    fakeQloo({ search: { ...search, ...more, 'Night Owl': show('e-0705', 'Night Owl') } })
    const rows = [...Object.keys(more), 'Night Owl'].map((name) => `${name},1000`)
    await roster.call('importRoster', [csv, ...rows].join('\n'), 'csv')
    await roster.until((s) => s.roster.length === 11 && s.roster.every((r) => r.resolution !== 'pending'))
    const { id, agent } = await planned(ada, network)
    const state = agent.state()!

    expect(pairLines(page(network, state, id))).toEqual([
      'muted: The roster’s matched shows had changed since its overlap was measured, so the plan can’t say which of its shows are close pairs. Measure the overlap again, then run again.'
    ])
    expect((await runOf(call, network, id, state)).insertionOrder.closePairs).toEqual({
      closestCount: 3,
      stale: true,
      pairs: [],
      checked: [],
      unchecked: []
    })
    // It names no pair, so it copies no ranking.
    expect(await copiedRankings(agent)).toEqual([])
  })

  it('keeps the overlap its run copied as it started, whatever a measure made later finds', async () => {
    const ada = await openMember()
    const network = await created(ada)
    overlapping(places)
    const roster = await measured(ada, network)
    const first = roster.state()!.overlap!
    const { id, agent } = await planned(ada, network, async () => {
      // While the run waits, a show joins the roster and the overlap is measured again, now with Corner
      // Booth and Slow Burn far apart.
      fakeQloo({ search: { ...search, ...more, 'Night Owl': show('e-0705', 'Night Owl') } })
      const rows = [...Object.keys(more), 'Night Owl'].map((name) => `${name},1000`)
      await roster.call('importRoster', [csv, ...rows].join('\n'), 'csv')
      await roster.until((s) => s.roster.length === 11 && s.roster.every((r) => r.resolution !== 'pending'))
      overlapping({ ...places, 'e-0502': 60, 'e-0705': 30 })
      await roster.call('measureOverlap')
      const again = await roster.until((s) => s.overlap?.status === 'measured' && s.overlap.key !== first.key)
      const corner = again.overlap!.rows.find((r) => r.entity.id === 'e-0501')!
      expect(corner.closest.map((c) => c.id)).not.toContain('e-0502')
    })
    const state = agent.state()!

    // The run's copy is the first measure, and its records are the first measure's calls.
    expect(state.rosterOverlap).toMatchObject({ key: first.key, measuredAt: first.measuredAt })
    const copies = await copiedRankings(agent)
    expect(copies.map((e) => e.copiedFrom)).toEqual(
      first.rows
        .filter((r) => ['e-0102', 'e-0501', 'e-0502', 'e-0503', 'e-0601'].includes(r.entity.id))
        .map((r) => r.call)
    )
    const [cb, sb] = ['e-0501', 'e-0502'].map((entity) => copies.find((e) => anchorOf(e) === entity)!.call)
    expect(pairLines(page(network, state, id))).toEqual([
      `Qloo data Corner Booth and Slow Burn each rank among the other’s 3 closest shows by listener overlap. ${cb} ${sb}`
    ])
  })
})

describe("a launch's report", () => {
  const words = (html: string) =>
    html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#x27;|&apos;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim()
  const page = (network: string) => ({
    id: network,
    name: 'Night Shift Audio',
    role: 'owner' as const,
    links: networkLinks(env, network)
  })
  // The report of run `run`, or of the latest approved, from the launch's state as its page has it and
  // what the page would read: earlier runs as getRun returns them, and the launch's evidence.
  const report = (
    network: string,
    id: string,
    state: State,
    run: string | null,
    reads: { runs?: Record<string, RunSnapshot>; evidence?: Evidence[] }
  ) =>
    renderToStaticMarkup(
      <LaunchReport
        agent={{ state, stub: {} } as unknown as Agent}
        network={page(network)}
        launch={`/app/${network}/launches/${id}`}
        run={run}
        reads={reads}
      />
    )
  // The launch's page, with where its runs' reports open.
  const workspace = (network: string, id: string, state: State) =>
    renderToStaticMarkup(
      <LaunchWorkspace
        agent={{ state, stub: {} } as unknown as Agent}
        network={page(network)}
        orders={`/app/${network}/launches/${id}/insertion-orders`}
        reports={`/app/${network}/launches/${id}/report`}
      />
    )
  // The report links on a page, by their words, or the name a screen reader hears, and where they go.
  const reportLinks = (html: string) =>
    [...html.matchAll(/<a\b([^>]*)>([^<]*)<\/a>/g)]
      .filter(([, attributes]) => /\shref="[^"]*\/report\//.test(attributes))
      .map(([, attributes, inner]) => [
        attributes.match(/\saria-label="([^"]*)"/)?.[1] ?? inner,
        attributes.match(/\shref="([^"]*)"/)![1]
      ])
  // Each call number the report cites, as the links it is, and the entries of its "Calls cited".
  const callLinks = (html: string) => [...html.matchAll(/<a\b[^>]*\shref="#call-(C-\d+)"/g)].map(([, call]) => call)
  const entries = (html: string) =>
    [...hooked(html, 'data-calls-cited')[0].matchAll(/<tr\b[^>]*\sid="call-(C-\d+)"[^>]*>(.*?)<\/tr>/g)].map(
      ([, call, row]) => [call, words(row)]
    )
  const byNumber = (a: string, b: string) => Number(a.slice(2)) - Number(b.slice(2))
  const made = (at: string) =>
    `${new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  const print = /<button\b([^>]*)>Print or save as PDF<\/button>/
  // Made-up listeners of the launch and its finalists, by age band and gender, against the average.
  const profile = (entity_id: string, lean: number) => ({
    entity_id,
    age: {
      '24_and_younger': -lean,
      '25_to_29': lean,
      '30_to_34': lean / 2,
      '35_to_44': 0.05,
      '45_to_54': -0.1,
      '55_and_older': -0.3
    },
    gender: { male: lean, female: -lean }
  })

  it('sets an approved run out as a document: its facts, the finding, the finalists by who listens, the demographics, close pairs, the plan and the calls it cites, with no ID or URN', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const grace = await teammate(ada, network)
    overlapping(places)
    await measured(ada, network)
    fakeDemographics(['e-0001', ...finalists].map((e, i) => profile(e, 0.3 - i * 0.02)))
    // Ghost Signal's compare fails, as Qloo answers it with an error.
    fakeCompare(
      Object.fromEntries(
        finalists.map((id) => [
          id,
          id === 'e-0601' ? 503 : [{ tag_id: 'urn:tag:keyword:media:film', name: 'Film', score: 0.6131 }]
        ])
      )
    )
    fakeClaude([
      turn(resolve('Night Shift Cinema')),
      turn(rank('e-0001')),
      turn(askBudget),
      turn(askExclusions),
      turn(findTags),
      turn(toolUse('check_demographics', { anchor_ids: ['e-0001'], candidate_ids: finalists })),
      turn(draft),
      turn(text('Drafted the insertion order.'))
    ])
    const { id, agent } = await launch(ada, network)
    await agent.call('startLaunch', { name: 'Night Shift Cinema' })
    const budget = await agent.until((s) => s.run?.question?.kind === 'budget')
    await agent.call('answer', budget.run!.question!.id, { slots: 20 })
    const exclusions = await agent.until((s) => s.run?.question?.kind === 'exclusions')
    await agent.call('answer', exclusions.run!.question!.id, { exclude: [] })
    await agent.until(ended)
    await (await connect(grace, `/agents/launch/${network}/${id}`)).call('approveInsertionOrder', 'IO-0001')
    const state = await agent.until((s) => s.insertionOrder?.status === 'approved')
    const log = await agent.call<Evidence[]>('getEvidence')
    const run = state.run!.id
    expect(state.runs).toEqual([expect.objectContaining({ id: run, orderApproved: true })])

    // The plan links its run's report once it's approved, and so does the run's entry in Runs.
    expect(reportLinks(workspace(network, id, state))).toEqual([
      ['Open the report', `/app/${network}/launches/${id}/report/${run}`],
      ['Report of run 1', `/app/${network}/launches/${id}/report/${run}`]
    ])

    const html = report(network, id, state, null, { evidence: log })
    // By default the latest approved run's, by its ID the same.
    expect(report(network, id, state, run, { evidence: log })).toBe(html)
    expect(words(html.match(/<h1\b.*?<\/h1>/)![0])).toBe('Night Shift Cinema')
    expect(sampleLabels(html)).toEqual([])
    const searched = state.launch!.match!.evidence
    const at = new Date(state.insertionOrder!.approvedAt!)
    expect(facts(html)).toEqual([
      ['Qloo match', `Night Shift Cinema ${searched}`],
      ['Run', 'Run 1'],
      ['Started', `${made(state.runs[0].startedAt)} by Ada Programmer`],
      ['CPM', '$25'],
      [
        'Approved',
        `By Grace Booker on ${at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
      ]
    ])
    // Its sections in order, the finding as the fit chart states it.
    const chart = sections(workspace(network, id, state)).find(
      ([title]) => title === 'Who shares Night Shift Cinema’s listeners'
    )!
    expect(sections(html)).toEqual([
      chart,
      [
        'Close pairs',
        `From the roster’s overlap, measured ${made(state.rosterOverlap!.measuredAt!).split(',')[0]}, as the run copied it when it started.`
      ],
      [
        'The plan',
        'Agent drafted the slots and angles, and code prices each slot at downloads per episode × CPM ÷ 1,000.'
      ],
      ['Insertion order IO-0001 Approved'],
      [
        'Calls cited Qloo data',
        'Each Qloo call the report cites, by its number: what kind of call it was, and when it was made.'
      ]
    ])
    // The finalists by who listens, each with its band, its shared tags and their call, and its slot value.
    const tags = (show: string) => state.ranking!.rows.find((r) => r.show === show)!.sharedTags!.call
    // The phone's fold of each row's band and slot value under its show is left out here, as its cells are
    // on a phone.
    const [finalistTable] = hooked(html, 'data-report-finalists').map((table) =>
      hooked(table, 'data-fold').reduce((rest, fold) => rest.replace(fold, ''), table)
    )
    expect(words(finalistTable)).toBe(
      [
        'Rank Show Fit Slot value',
        `1 Corner Booth Film ${tags('Corner Booth')} Strong $1,200 48,000 downloads`,
        `2 Slow Burn Film ${tags('Slow Burn')} Strong $1,000 40,000 downloads`,
        `3 Paper Route Film ${tags('Paper Route')} Good $650 26,000 downloads`,
        `4 Field Notes Film ${tags('Field Notes')} · Mapped to Field Notes: Books Good $438 17,500 downloads`,
        `5 Ghost Signal Shared tags failed ${tags('Ghost Signal')} · Mapped to Ghost Signal Radio Fair $225 9,000 downloads`
      ].join(' ')
    )
    // On a phone, the same band and slot value fold under each show.
    expect(hooked(html, 'data-fold').map(words)).toEqual([
      'Strong $1,200 48,000 downloads',
      'Strong $1,000 40,000 downloads',
      'Good $650 26,000 downloads',
      'Good $438 17,500 downloads',
      'Fair $225 9,000 downloads'
    ])
    // Qloo's reason for the failed compare stays in the evidence, as the launch's page gives it.
    const failure = state.ranking!.rows.find((r) => r.show === 'Ghost Signal')!.sharedTags!.error!
    expect(failure).toBeTruthy()
    expect(html).not.toContain(failure)
    expect(words(workspace(network, id, state))).toContain(`Shared tags failed: ${failure}`)
    // Then the chart's caption and notes, the demographics line, the close pair and the plan's lines, with
    // their angles and prices.
    const page = words(html)
    expect(page).toContain('Qloo data Ranked by listener overlap with Night Shift Cinema Rank Show')
    expect(page).toContain(
      'Fit bands are thirds of this ranking, and the top five, after any shows left out, are finalists. Slot value = downloads × $25 CPM ÷ 1,000 Demographics'
    )
    expect(page).toContain(
      `Demographics ${state.demographics!.call} · Checked against the listeners of Night Shift Cinema`
    )
    const [cb, sb] = ['Corner Booth', 'Slow Burn'].map(
      (show) => state.rosterOverlap!.rows.find((r) => r.entity.name === show)!.copy!
    )
    expect(page).toContain(
      `Close pairs From the roster’s overlap, measured ${made(state.rosterOverlap!.measuredAt!).split(',')[0]}, as the run copied it when it started. Qloo data Corner Booth and Slow Burn each rank among the other’s 3 closest shows by listener overlap. ${cb} ${sb}`
    )
    expect(page).toContain(
      `Corner Booth 8 $9,600 Late-night regulars stay up for the call-ins. ${tags('Corner Booth')} $1,200 a slot`
    )
    expect(page).toContain('Total 20 $19,076')

    // Every call number is a link to its entry in "Calls cited", which lists every call it cites and no
    // other, in call order, each with its kind and when it was made.
    expect(html).not.toContain('aria-controls="evidence"')
    const cited = [...new Set(callLinks(html))].sort(byNumber)
    expect(entries(html).map(([call]) => call)).toEqual(cited)
    expect(cited).toEqual(
      [
        searched,
        state.ranking!.call,
        ...finalists.map((e) => tags(state.ranking!.rows.find((r) => r.entity.id === e)!.show)),
        state.demographics!.call,
        cb,
        sb
      ].sort(byNumber)
    )
    const record = (call: string) => log.find((e) => e.call === call)!
    expect(Object.fromEntries(entries(html))).toMatchObject({
      [searched]: `${searched} Search ${made(record(searched).at)}`,
      [state.ranking!.call]:
        `${state.ranking!.call} Ranking by listener overlap ${made(record(state.ranking!.call).at)}`,
      [tags('Corner Booth')]: `${tags('Corner Booth')} Shared tags ${made(record(tags('Corner Booth')).at)}`,
      [state.demographics!.call]:
        `${state.demographics!.call} Listener age and gender ${made(record(state.demographics!.call).at)}`,
      [cb]: `${cb} Ranking by listener overlap From the roster’s overlap, as Qloo answered the network ${made(record(cb).at)}`
    })
    // Everything has arrived, so it prints; until the calls it cites have, it doesn't, so a skeleton never
    // prints.
    expect(html.match(print)![1]).toContain('aria-disabled="false"')
    const reading = report(network, id, state, null, {})
    expect(reading.match(print)![1]).toContain('aria-disabled="true"')
    expect(entries(reading)).toEqual(cited.map((call) => [call, call]))

    // It carries what the app shows of the run: no request parameter, entity ID, URN, raw affinity or score,
    // and no ID of the run or the launch, while the check finds them where they are.
    expect(handoffLeaks(html, state, log)).toEqual([])
    expect(handoffLeaks('<p>e-0501 0.913 urn:tag:genre</p>', state, log)).toEqual(['e-0501', '0.913', 'urn:tag:genre'])
    expect(html.replace(/\sclass="[^"]*"/g, '')).not.toMatch(/\d\.\d{2,}/)
    expect(html).not.toContain(run)
    expect(html).not.toContain(id)
    // A demographic check that failed says so, citing its call, with Qloo's reason left in the evidence.
    const unchecked = { ...state.demographics!, profile: null, error: 'Qloo returned 500: fake failure' }
    const failed = report(network, id, { ...state, demographics: unchecked }, null, { evidence: log })
    expect(words(failed)).toContain(`Demographics ${state.demographics!.call} not checked.`)
    expect(failed).not.toContain('fake failure')
  })

  it("reports an earlier approved run, by default and by its ID, and a draft's or a run's with no order only says it opens once its plan is approved", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const { id, agent } = await drafted(ada, network)
    const runOne = agent.state()!.run!.id
    // Before approval, no report: the plan and Runs link none, and the report says it opens once approved.
    const before = agent.state()!
    expect(reportLinks(workspace(network, id, before))).toEqual([])
    const notYet = report(network, id, before, null, {})
    expect(words(notYet)).toBe(
      'Night Shift Cinema Launch report This run’s report opens once its plan is approved. Review the plan'
    )
    expect(notYet).toContain(`href="/app/${network}/launches/${id}#plan"`)
    expect(notYet).not.toMatch(print)
    expect(sections(notYet)).toEqual([])
    expect(facts(notYet)).toEqual([])

    // Approved, then edited back to draft, then approved again: the run's entry follows.
    await agent.call('approveInsertionOrder', 'IO-0001')
    expect((await agent.until((s) => s.insertionOrder?.status === 'approved')).runs[0].orderApproved).toBe(true)
    const lines = before.insertionOrder!.lines.map(({ show, slots, angle }) => ({ show, slots: slots + 1, angle }))
    await agent.call('editInsertionOrder', 'IO-0001', lines)
    expect((await agent.until((s) => s.insertionOrder?.status === 'draft')).runs[0].orderApproved).toBeUndefined()
    await agent.call('approveInsertionOrder', 'IO-0001')
    await agent.until((s) => s.runs[0].orderApproved === true)

    // A second run drafts an order of its own, a draft, and a third drafts none.
    fakeClaude([
      turn(resolve('Night Shift Cinema')),
      turn(rank('e-0001')),
      turn(askBudget),
      turn(askExclusions),
      turn(findTags),
      turn(draft),
      turn(text('Drafted it again.')),
      turn(resolve('Night Shift Cinema')),
      turn(rank('e-0001')),
      turn(askBudget),
      turn(askExclusions),
      turn(text('Ranked it, with no order.'))
    ])
    const again = async () => {
      const runs = agent.state()!.runs.length
      await agent.call('startLaunch', { name: 'Night Shift Cinema' })
      const budget = await agent.until((s) => s.runs.length > runs && s.run?.question?.kind === 'budget')
      await agent.call('answer', budget.run!.question!.id, { slots: 20 })
      const exclusions = await agent.until((s) => s.run?.question?.kind === 'exclusions')
      await agent.call('answer', exclusions.run!.question!.id, { exclude: [] })
      return agent.until(ended)
    }
    const runTwo = (await again()).run!.id
    const state = await again()
    const runThree = state.run!.id
    expect(state.runs.map((r) => r.orderApproved)).toEqual([true, undefined, undefined])
    expect(state.insertionOrder).toBeNull()
    // Only run 1's entry links its report; the latest run has no plan to link one.
    expect(reportLinks(workspace(network, id, state))).toEqual([
      ['Report of run 1', `/app/${network}/launches/${id}/report/${runOne}`]
    ])

    // The report defaults to run 1, the latest approved, read as getRun keeps it; by its ID, the same.
    const reads = {
      runs: { [runOne]: await agent.call<RunSnapshot>('getRun', runOne) },
      evidence: await agent.call<Evidence[]>('getEvidence')
    }
    const html = report(network, id, state, null, reads)
    expect(report(network, id, state, runOne, reads)).toBe(html)
    expect(facts(html)).toContainEqual(['Run', 'Run 1'])
    expect(words(html)).toContain('Total 24 ')
    expect(html.match(print)![1]).toContain('aria-disabled="false"')
    expect(handoffLeaks(html, reads.runs[runOne], reads.evidence)).toEqual([])
    // Run 2's draft and run 3, with no order, have none; the launch's page shows no plan to review, so they
    // lead to the launch.
    for (const run of [runTwo, runThree]) {
      const none = report(network, id, state, run, {
        runs: { [runTwo]: await agent.call<RunSnapshot>('getRun', runTwo) }
      })
      expect(words(none), run).toBe(
        'Night Shift Cinema Launch report This run’s report opens once its plan is approved. Open the launch'
      )
      expect(none, run).toContain(`href="/app/${network}/launches/${id}"`)
      expect(none, run).not.toMatch(print)
    }
    // A run the launch doesn't have says so.
    expect(words(report(network, id, state, crypto.randomUUID(), {}))).toBe(
      'Night Shift Cinema Launch report Error This launch has no such run. Open the launch'
    )
  })

  it('names the launch in the top bar as a link back to its page, then Report, where a launch’s page names it alone', () => {
    expect(
      renderToStaticMarkup(<LaunchCrumbs title="Night Shift Cinema" launch="/app/n-1/launches/l-1" />).replace(
        /\sclass="[^"]*"/g,
        ''
      )
    ).toBe(
      '<span aria-hidden="true">/</span><a href="/app/n-1/launches/l-1">Night Shift Cinema</a><span aria-hidden="true">/</span><span aria-current="page">Report</span>'
    )
    expect(renderToStaticMarkup(<LaunchCrumbs title="Night Shift Cinema" />).replace(/\sclass="[^"]*"/g, '')).toBe(
      '<span aria-hidden="true">/</span><span aria-current="page">Night Shift Cinema</span>'
    )
  })

  it('opens at the launch’s address, with or without a run’s ID, for its network’s members alone, marking Launches', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const { id, agent } = await drafted(ada, network)
    const run = agent.state()!.run!.id
    const stranger = await openMember({ name: 'Mal Stranger' })
    for (const path of ['report', `report/${run}`]) {
      const res = await ada.fetch(`/app/${network}/launches/${id}/${path}`)
      expect(res.status, path).toBe(200)
      const html = await res.text()
      const root = html.match(/<div id="root"([^>]*)>/)![1]
      for (const attribute of [
        'data-page="launch-report"',
        `data-agent-path="/agents/launch/${network}/${id}"`,
        `data-launch-link="/app/${network}/launches/${id}"`
      ])
        expect(root, path).toContain(attribute)
      if (path === 'report') expect(root).not.toContain('data-run-id')
      else expect(root).toContain(`data-run-id="${run}"`)
      // It belongs to the launch, under Launches: the rail marks Launches, the top bar leads back to the list,
      // and its slot after it, which the island fills with the launch's name as a link to its page.
      expect(currentLinks(html), path).toEqual([['Launches', `/app/${network}/launches`, 'true']])
      expect(html).toMatch(/<li\b[^>]*\sid="shell-launch"[^>]*><\/li>/)
      expect((await stranger.fetch(`/app/${network}/launches/${id}/${path}`)).status, path).toBe(404)
      expect((await ada.fetch(`/app/${network}/launches/${crypto.randomUUID()}/${path}`)).status, path).toBe(404)
    }
  })

  it('marks the runs of a launch from before reports whose orders are approved, as it next starts', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const { id, agent } = await drafted(ada, network)
    await agent.call('approveInsertionOrder', 'IO-0001')
    const approved = await agent.until((s) => s.runs[0].orderApproved === true)
    // Stand in for a launch from before #407, whose runs don't say whether their order is approved.
    const stub = env.LaunchAgent.get(env.LaunchAgent.idFromName(launchAgentName(network, id)))
    await runInDurableObject(stub, (launch: LaunchAgent) => {
      launch.setState({ ...launch.state, runs: launch.state.runs.map(({ orderApproved: _, ...r }) => r) })
    })
    expect((await connect(ada, `/agents/launch/${network}/${id}`)).state()!.runs[0].orderApproved).toBeUndefined()
    await evictDurableObject(stub, { webSockets: 'close' })
    expect((await connect(ada, `/agents/launch/${network}/${id}`)).state()!.runs).toEqual(approved.runs)
  })

  it('starts a session from before run limits, which keeps no list of runs, and leaves it without one', async () => {
    const session = await openSession()
    open.push(session)
    // Stand in for a session stored before run limits, whose state has no `runs`.
    const stub = env.CrossfeedAgent.get(env.CrossfeedAgent.idFromName(session.cookie.split('=')[1]))
    await runInDurableObject(stub, (agent: CrossfeedAgent) => {
      const { runs: _, ...old } = agent.state
      agent.setState(old as State)
    })
    await evictDurableObject(stub, { webSockets: 'close' })
    const again = await openSession(session.cookie)
    open.push(again)
    expect(again.state()).not.toHaveProperty('runs')
  })
})
