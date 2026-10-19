// A network's launches, each its own project: created from the dashboard on the network's agent,
// opened at its own page and agent, run on a copy of the network's roster, and reported back to the
// network's list as it changes. Each test drives a network through the Worker's routes and its
// agents' client protocol, or the Worker's own RPC to an agent, as the API will call it.
import { getAgentByName } from 'agents'
import { env } from 'cloudflare:workers'
import { http } from 'msw'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { State } from '../src/agent'
import type { Session as Agent } from '../src/client/App'
import { Dashboard } from '../src/client/Dashboard'
import { EvidencePanel } from '../src/client/Evidence'
import { LaunchWorkspace } from '../src/client/Launch'
import type { Evidence } from '../src/evidence'
import { refusalCode } from '../src/refusal'
import { networkLinks } from '../src/shell'
import {
  fakeClaude,
  fakeInsights,
  fakeQloo,
  modelRequests,
  network as outbound,
  refusal,
  requests,
  text,
  toolUse,
  turn,
  type ModelRequest
} from './fake'
import { openMember, openSession, type Member, type Session } from './session'

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
// Qloo ranks only the candidates a request names, as it ranks a closed list.
const rankAsked = () =>
  fakeInsights((body) => fit.filter((r) => String(body['filter.results.entities']).split(',').includes(r.entity_id)))

// A launch run the way the agent plans one: resolve the launch, rank the roster, and end.
const resolve = (name: string) => toolUse('resolve_entities', { names: [name], type: 'urn:entity:podcast' })
const rank = (anchor: string) =>
  toolUse('rank_candidates', {
    anchor_ids: [anchor],
    candidate_ids: ['e-0501', 'e-0502', 'e-0503', 'e-0102', 'e-0601'],
    type: 'urn:entity:podcast'
  })

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
  GUEST_PITCHES: env.GUEST_PITCHES,
  SAMPLE_NETWORK: env.SAMPLE_NETWORK,
  QLOO_DAILY_CALL_CAP: env.QLOO_DAILY_CALL_CAP
}
afterEach(() => {
  open.splice(0).forEach((agent) => agent.close())
  Object.assign(env, saved)
  vi.restoreAllMocks()
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
async function connect(member: Member, path: string, headers?: Record<string, string>) {
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
    const fresh = { status: 'new', finalists: 0, slots: null, slotValue: null, startedBy: null, lastRun: null }
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
  it("open for each of the network's members, the page under the dashboard and the agent the launch's own", async () => {
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
        `data-settings-link="/app/${network}/settings"`
      ])
        expect(root).toContain(attribute)
      // A launch belongs to the dashboard, which lists it.
      expect(html).toContain(`<a class="on" href="/app/${network}" aria-current="true">Dashboard</a>`)

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
      ['clearSample', [], roster],
      ['searchComps', ['Deep Cuts', 'Deep Cuts'], roster],
      ['updateShow', ['Deep Cuts', { excluded: true }], roster],
      ['setCpm', [20], "A launch's runs take the network's CPM, which an owner changes in its settings."],
      ['loadInbox', [{ text: 'From: Pat <pat@example.com>\n\nA pitch.' }], inbox],
      ['confirmWork', ['pitch-01', 'b-0001'], inbox],
      ['startPitches', [{ show: 'Deep Cuts', pastGuests: [] }], inbox],
      ['editReply', ['pitch-01', 'Thanks!'], inbox],
      ['approveReply', ['pitch-01'], inbox],
      ['discardReply', ['pitch-01'], inbox],
      ['markGuide', ['why'], "A launch has no guide: it's the sample network's, at /demo."],
      ['dismissGuide', [], "A launch has no guide: it's the sample network's, at /demo."]
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
    // The evidence says where a copy came from.
    const opened = renderToStaticMarkup(
      <EvidencePanel opened={{ call: 'C-06', status: 'loaded', record: copies[5] }} />
    )
    expect(
      opened
        .replace(/<[^>]+>/g, ' ')
        .replace(/&#x27;/g, "'")
        .replace(/\s+/g, ' ')
    ).toContain(
      "Evidence · C-06 From the roster Qloo data Copied From the network's roster, its call C-08, as Qloo answered it then; the run made no new request"
    )
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
      slotValue: 19_076
    })

    const order = agent.state()!.insertionOrder!
    await agent.call('approveInsertionOrder', order.id)
    expect((await listed('order approved')).slotValue).toBe(19_076)
    await agent.call('editInsertionOrder', order.id, [{ show: 'Corner Booth', slots: 2, angle: 'Call-ins.' }])
    expect(await listed('order drafted')).toMatchObject({ slots: 2, slotValue: 2_400 })
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

describe('a launch on a network started from the sample roster', () => {
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
  const fakes = () => {
    fakeQloo({ search: sampleSearch })
    fakeInsights((body) =>
      sampleFit.filter((r) => String(body['filter.results.entities']).split(',').includes(r.entity_id))
    )
  }
  // A network started from the sample roster, every show looked up, and a launch of The Watch.
  async function sampleLaunch() {
    const ada = await openMember()
    const network = await created(ada)
    const roster = await connect(ada, `/agents/network/${network}`)
    await roster.call('startFromSample')
    await roster.until((s) => s.roster.length > 0 && s.roster.every((r) => r.resolution !== 'pending'))
    const sent = requests.length
    const { agent } = await launch(ada, network, { name: 'The Watch' })
    // A launch never opens on the sample network, even with it on.
    expect([agent.state()!.roster, agent.state()!.sample, requests.length]).toEqual([[], null, sent])
    return { roster, agent }
  }

  it('keeps its figures labelled sample, but never the sample marker, and never stores its run as the sample run', async () => {
    env.SAMPLE_NETWORK = 'on'
    fakes()
    const logged = vi.spyOn(console, 'log')
    const { roster, agent } = await sampleLaunch()
    fakeClaude(theWatch())
    await agent.call('startLaunch', { name: 'The Watch' })
    const state = await answerSample(agent)

    expect(state.run?.status).toBe('completed')
    expect(state.sample).toBeNull()
    expect(state.roster.map((r) => [r.name, r.sample])).toEqual(roster.state()!.roster.map((r) => [r.name, r.sample]))
    expect(logged.mock.calls.flat().filter((line) => String(line).includes('"event":"sample_run"'))).toEqual([])
    // So the demo has no stored run to replay when Qloo can't be called.
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

  it("never replays the demo's stored sample run, and stops instead while Qloo can't be called", async () => {
    env.SAMPLE_NETWORK = 'on'
    fakes()
    const logged = vi.spyOn(console, 'log')
    // A visitor runs the sample launch on the demo, which keeps it for replays.
    const visitor = await openSession()
    open.push(visitor)
    await visitor.until((s) => s.roster.length > 0 && s.roster.every((r) => r.resolution !== 'pending'))
    fakeClaude([...theWatch(), ...theWatch()])
    await visitor.call('startLaunch', { name: 'The Watch' })
    expect((await answerSample(visitor)).run?.status).toBe('completed')
    await vi.waitFor(() =>
      expect(logged.mock.calls.flat().some((line) => String(line).includes('"event":"sample_run"'))).toBe(true)
    )

    const { agent } = await sampleLaunch()
    env.QLOO_DAILY_CALL_CAP = '0'
    await agent.call('startLaunch', { name: 'The Watch' })
    const state = await agent.until(ended)
    expect(state.run).toMatchObject({
      status: 'stopped',
      error: expect.stringContaining('so runs on your own data wait until Qloo answers again')
    })
    expect(state.run?.replayed).toBeUndefined()
    expect(state.ranking).toBeNull()
    expect((await agent.call<Evidence[]>('getEvidence')).some((e) => e.replayed)).toBe(false)
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
  const dashboard = (network: string, state: State | undefined) =>
    renderToStaticMarkup(
      <Dashboard
        state={state}
        network={page(network)}
        memberId="m-1"
        setup={{ invited: false, apiKey: false }}
        dismiss={async () => {}}
        createLaunch={async () => ({ id: 'l-1' })}
      />
    )
  const workspace = (network: string, agent: Omit<Session, 'cookie'>) =>
    renderToStaticMarkup(
      <LaunchWorkspace agent={{ state: agent.state(), stub: {} } as unknown as Agent} network={page(network)} />
    )

  it('puts New launch atop the dashboard, and lists each launch by name or comps, linked to its page', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const agent = await connect(ada, `/agents/network/${network}`)
    expect(words(dashboard(network, agent.state()))).toContain(
      'Night Shift Audio Released Unreleased, from comps New launch Launches'
    )
    const { id } = await agent.call<{ id: string }>('createLaunch', { name: 'The Night Watch' })
    const { id: fromComps } = await agent.call<{ id: string }>('createLaunch', {
      comps: ['Blank Check', 'Filmspotting']
    })

    const html = dashboard(network, agent.state())
    expect(words(html)).toContain(
      'Blank Check · Filmspotting Unreleased, from comps New – – – Not run yet The Night Watch New – – – Not run yet'
    )
    expect(html).toContain(`href="/app/${network}/launches/${id}"`)
    expect(html).toContain(`href="/app/${network}/launches/${fromComps}"`)
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
    const html = dashboard('n-1', {
      ...agent.state()!,
      launches: statuses.map((status, i) => ({ ...base, id: `l-${i}`, status }))
    })
    expect(words(html).match(/The Night Watch [A-Z][a-z]+( [a-z]+)?/g)).toEqual([
      'The Night Watch Running',
      'The Night Watch Waiting',
      'The Night Watch Ranked',
      'The Night Watch Order drafted',
      'The Night Watch Order approved',
      'The Night Watch Failed',
      'The Night Watch Stopped'
    ])
    expect(html).toContain('<span class="chip flag">Order approved</span>')
    expect(html).toContain('<span class="chip" data-state="failed">Failed</span>')
    expect(html).toContain('<span class="chip" data-state="failed">Stopped</span>')
  })

  it('titles a launch from comps by its comps, and keeps them in its form', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const { agent } = await launch(ada, network, { comps: ['Blank Check', 'Filmspotting'] })
    const html = workspace(network, agent)
    expect(words(html)).toContain('Launch · Blank Check · Filmspotting Qloo data Comps: Blank Check not looked up')
    expect(html).toMatch(/<input class="comp-name" aria-label="Comp 1"[^>]*value="Blank Check"/)
    expect(html).toMatch(/<input class="comp-name" aria-label="Comp 2"[^>]*value="Filmspotting"/)
  })

  it("shows the launch's workspace with the roster it ranks read-only, linked to the roster page", async () => {
    const ada = await openMember()
    const network = await created(ada)
    await rosterOf(ada, network)
    const { agent } = await launch(ada, network, { name: 'The Night Watch' })

    // Before its first run: the launch it plans is ready to start, and the roster is the network's.
    const before = workspace(network, agent)
    expect(before).toMatch(/<input aria-label="Released launch"[^>]*value="The Night Watch"/)
    expect(words(before)).toContain(
      "Roster Each run ranks Night Shift Audio's roster as it stands when the run starts. Edit its shows on the roster page ."
    )
    // Nothing is counted or priced until a run brings the roster and its CPM.
    expect(words(before)).not.toContain('Roster check')
    expect(words(before)).not.toContain('Network CPM')
    expect(before).toContain(`<a class="lnk" href="/app/${network}/roster">the roster page</a>`)

    rankAsked()
    fakeClaude([turn(resolve('The Night Watch')), turn(rank('e-0001')), turn(text('Ranked.'))])
    fakeQloo({ search: { ...search, 'The Night Watch': show('e-0001', 'The Night Watch') } })
    await agent.call('startLaunch', { name: 'The Night Watch' })
    await agent.until(ended)
    const after = workspace(network, agent)
    // The form still plans this launch, to run again as it is or with other comps.
    expect(after).toMatch(/<input aria-label="Released launch"[^>]*value="The Night Watch"/)
    const read = words(after)
    expect(read).toContain(
      "Roster The latest run ranks Night Shift Audio's roster as it stood when that run started. Edit its shows on the roster page ."
    )
    expect(read).toContain('Corner Booth Resolved Corner Booth')
    expect(read).toContain('Network CPM CPM $25 per 1,000 downloads')
    expect(read).toContain("Each run takes the network's CPM as it starts.")
    expect(read).toContain(
      "Model runs are limited per UTC day across the network's launches and inbox, whoever starts them."
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
    // No CPM field, and no show to open in an editor.
    expect(after).not.toMatch(/<input[^>]*aria-labelledby="cpm-h"/)
    expect(after).not.toContain('<button type="button" class="row-open"')
  })
})
