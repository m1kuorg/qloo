// A network's launches, each its own project: created from the dashboard on the network's agent,
// opened at its own page and agent, run on a copy of the network's roster, and reported back to the
// network's list as it changes. Each test drives a network through the Worker's routes and its
// agents' client protocol, or the Worker's own RPC to an agent, as the API will call it.
import { getAgentByName } from 'agents'
import { createExecutionContext, createScheduledController, waitOnExecutionContext } from 'cloudflare:test'
import { env, exports } from 'cloudflare:workers'
import { http } from 'msw'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { State } from '../src/agent'
import type { Session as Agent } from '../src/client/App'
import { Dashboard } from '../src/client/Dashboard'
import { EvidencePanel } from '../src/client/Evidence'
import { LaunchWorkspace } from '../src/client/Launch'
import type { Evidence } from '../src/evidence'
import worker from '../src/index'
import { LaunchAgent } from '../src/launch-agent'
import { NetworkAgent } from '../src/network-agent'
import { refusalCode } from '../src/refusal'
import { networkLinks } from '../src/shell'
import {
  fakeClaude,
  fakeCompare,
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
import {
  readAfterReset,
  connect as connectVia,
  currentLinks,
  hooked,
  openMember,
  openSession,
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
  QLOO_DAILY_CALL_CAP: env.QLOO_DAILY_CALL_CAP
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

// Runs the Worker's scheduled handler as Cloudflare does at the cron in wrangler.jsonc.
async function runCron() {
  const handler: ExportedHandler<Env> = worker
  const ctx = createExecutionContext()
  await handler.scheduled!(createScheduledController({ cron: '0 12 * * *' }), env, ctx)
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
        `data-settings-link="/app/${network}/settings"`,
        `data-orders-link="/app/${network}/launches/${id}/insertion-orders"`
      ])
        expect(root).toContain(attribute)
      // A launch belongs to the dashboard, which lists it: the shell's one nav marks Launches.
      expect(html.match(/<nav\b/g)).toHaveLength(1)
      expect(currentLinks(html)).toEqual([['Launches', `/app/${network}`, 'true']])
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
      'Evidence · C-06 Qloo data From the roster Copied From the network’s roster, its call C-08 , as Qloo answered it then; the run made no new request'
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
      slotValue: 19_076
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

  it("takes it off every member's dashboard at once, closes its pages, wipes its agent, and its addresses answer 404", async () => {
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

  it('wipes a launch whose wipe failed at the daily cron, and keeps one whose deletion stopped before the list let go', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const { id, agent } = await drafted(ada, network)
    const { id: other } = await launch(ada, network, { name: 'The Long Take' })
    const failed = vi.spyOn(console, 'error')

    // The list lets go of the first, but its wipe fails, twice: it's off the dashboard, and kept for the cron.
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
    await runCron()
    expect(await held(network, id)).toMatchObject({ runs: 1 })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 2 * 60_000)
    // A retry that fails again fails the cron's run, and is kept for the next.
    await expect(runCron()).rejects.toThrow('1 agent wipe failed')
    expect(await held(network, id)).toMatchObject({ runs: 1 })
    await runCron()
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
    // The dashboard's row follows its launch.
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

  it("forgets it at the next day's cleanup when a launch can't be reached at once", async () => {
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
    await runCron()
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
  const workspace = (network: string, agent: Omit<Session, 'cookie'>, id = 'l-1') =>
    renderToStaticMarkup(
      <LaunchWorkspace
        agent={{ state: agent.state(), stub: {} } as unknown as Agent}
        network={page(network)}
        orders={`/app/${network}/launches/${id}/insertion-orders`}
      />
    )

  it('puts New launch atop the dashboard, and lists each launch by name or comps, linked to its page', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const agent = await connect(ada, `/agents/network/${network}`)
    expect(words(dashboard(network, agent.state()))).toMatch(/^Launches 0 launches New launch /)
    const { id } = await agent.call<{ id: string }>('createLaunch', { name: 'The Night Watch' })
    const { id: fromComps } = await agent.call<{ id: string }>('createLaunch', {
      comps: ['Blank Check', 'Filmspotting']
    })

    const html = dashboard(network, agent.state())
    expect(words(html)).toMatch(/^Launches 2 launches New launch /)
    expect(words(html)).toContain(
      'Not run yet 2 Blank Check · Filmspotting Unreleased, from comps New – – – Not run yet The Night Watch New – – – Not run yet'
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
    const html = dashboard('n-1', {
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
    expect(words(html)).toMatch(/^Launches 4 need you · 1 running · 7 launches New launch /)
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
      words(dashboard('n-1', { ...agent.state()!, launches: list })).match(
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
    expect(words(draftPlan)).toMatch(/^The plan Insertion order IO-0001 Draft /)
    expect(draftHtml).not.toContain('Export CSV')

    const graces = await connect(grace, `/agents/launch/${network}/${id}`)
    await graces.call('approveInsertionOrder', 'IO-0001')
    await agent.until((s) => s.insertionOrder?.status === 'approved')
    const html = workspace(network, agent, id)
    const at = new Date(agent.state()!.insertionOrder!.approvedAt!)
    const day = at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    const [plan] = hooked(html, 'data-io')
    expect(words(plan)).toMatch(/^The plan Insertion order IO-0001 Approved /)
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
    const changed = 'It has changed since then, so run again to rank it as it is now.'
    // Not run yet: there's no copy to compare.
    await roster.call('updateShow', 'Slow Burn', { downloads: 41000 })
    expect(words(workspace(network, agent))).not.toContain(changed)

    await agent.call('startLaunch', { name: 'Night Shift Cinema' })
    await agent.until(ended)
    expect(words(workspace(network, agent))).not.toContain(changed)
    // A teammate's edit on the roster page shows on the launch's page as it's made.
    await roster.call('updateShow', 'Paper Route', { excluded: true })
    await agent.until((s) => s.rosterChanged === true)
    expect(words(workspace(network, agent))).toContain(
      `Roster The latest run ranks Night Shift Audio’s roster as it stood when that run started. ${changed} Edit its shows on the roster page .`
    )
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

    // Before its first run: the launch it plans is ready to start, and the roster is the network's.
    const before = workspace(network, agent)
    expect(words(before)).toMatch(/^The Night Watch Start run Not run yet\. A run looks it up in Qloo\. /)
    expect(before).toMatch(/<input\b(?=[^>]*\saria-label="Released launch")(?=[^>]*\svalue="The Night Watch")/)
    expect(words(before)).toContain(
      'Roster Each run ranks Night Shift Audio’s roster as it stands when the run starts. Edit its shows on the roster page .'
    )
    // Nothing is counted or priced until a run brings the roster and its CPM.
    expect(words(before)).not.toContain('Roster check')
    expect(words(before)).not.toContain('Network CPM')
    expect(before).toMatch(new RegExp(`<a\\b[^>]*\\shref="/app/${network}/roster"[^>]*>the roster page</a>`))

    rankAsked()
    fakeClaude([turn(resolve('The Night Watch')), turn(rank('e-0001')), turn(text('Ranked.'))])
    fakeQloo({ search: { ...search, 'The Night Watch': show('e-0001', 'The Night Watch') } })
    await agent.call('startLaunch', { name: 'The Night Watch' })
    await agent.until(ended)
    const after = workspace(network, agent)
    // The title row runs this launch again as it is, or opens the form, still planning it, to change it.
    expect(words(after)).toMatch(
      /^The Night Watch Qloo data The Night Watch popularity \S+ C-\d+ Change launch Run again Completed /
    )
    const read = words(after)
    expect(read).toContain(
      'Roster The latest run ranks Night Shift Audio’s roster as it stood when that run started. Edit its shows on the roster page .'
    )
    expect(read).toContain('Corner Booth Resolved Corner Booth')
    expect(read).toContain('Network CPM CPM $25 per 1,000 downloads')
    expect(read).toContain('Each run takes the network’s CPM as it starts.')
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
})
