// The REST API's launch endpoints, driven as a program drives them: with an API key over HTTP,
// creating a launch, starting its runs and polling them, answering the agent's questions, editing the
// draft order, and exporting it once a member approved it in the app.
import { env, exports } from 'cloudflare:workers'
import { afterEach, describe, expect, it } from 'vitest'
import type { Question, Run } from '../src/agent'
import type { Evidence } from '../src/evidence'
import type { InsertionOrder } from '../src/order'
import {
  fakeClaude,
  fakeDemographics,
  fakeInsights,
  fakeQloo,
  fakeTopic,
  modelRequests,
  text,
  toolUse,
  topicNames,
  turn,
  type Demographic
} from './fake'
import { networkWithKey, poll } from './session'

type Call = Awaited<ReturnType<typeof networkWithKey>>['call']

// A made-up network: Field Notes is ambiguous until settled, Ghost Signal isn't in Qloo until mapped
// to a comp, and Back Lot is left out. Night Shift Cinema, the launch, isn't on the roster.
const show = (entity_id: string, name: string) => [{ entity_id, name, popularity: 0.6 }]
const search = {
  'Night Shift Cinema': show('e-0001', 'Night Shift Cinema'),
  'Corner Booth': show('e-0501', 'Corner Booth'),
  'Slow Burn': show('e-0502', 'Slow Burn'),
  'Paper Route': show('e-0503', 'Paper Route'),
  'Field Notes': [
    { entity_id: 'e-0101', name: 'Field Notes: Film', popularity: 0.6 },
    { entity_id: 'e-0102', name: 'Field Notes: Books', popularity: 0.3 }
  ],
  'Ghost Signal': [],
  'Ghost Signal Radio': show('e-0601', 'Ghost Signal Radio'),
  'Back Lot': show('e-0505', 'Back Lot'),
  // Comps for an unreleased launch: one match, and one name two feeds share.
  'The Long Take': show('e-0201', 'The Long Take'),
  'Frame by Frame': [
    { entity_id: 'e-0303', name: 'Frame by Frame', popularity: 0.71 },
    { entity_id: 'e-0304', name: 'Frame by Frame', popularity: 0.23 }
  ]
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
  { entity_id: 'e-0601', name: 'Ghost Signal Radio', affinity: 0.866 }
]
// Made-up demographics: the launch over-indexes most at 25 to 34 and skews male, and Slow Burn has
// fewer listeners aged 30 to 34.
const listeners = (entity_id: string, a30: number): Demographic => ({
  entity_id,
  age: {
    '24_and_younger': -0.3,
    '25_to_29': 0.4,
    '30_to_34': a30,
    '35_to_44': 0.05,
    '45_to_54': -0.18,
    '55_and_older': -0.44
  },
  gender: { male: 0.36, female: -0.36 }
})
const demographics = ['e-0001', 'e-0501', 'e-0503', 'e-0102', 'e-0601'].map((id) => listeners(id, 0.27))

// A launch run the way the agent plans one: resolve the launch, rank the roster, check the
// finalists' listeners, ask for the budget and exclusions, then draft the order.
const finalists = ['e-0501', 'e-0502', 'e-0503', 'e-0102', 'e-0601']
const resolve = toolUse('resolve_entities', { names: ['Night Shift Cinema'], type: 'urn:entity:podcast' })
const rank = toolUse('rank_candidates', {
  anchor_ids: ['e-0001'],
  candidate_ids: finalists,
  type: 'urn:entity:podcast'
})
const check = toolUse('check_demographics', { anchor_ids: ['e-0001'], candidate_ids: finalists })
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
const planned = [turn(resolve), turn(rank), turn(check), turn(askBudget), turn(askExclusions), turn(draft)]

const patch = (call: Call, path: string, body: unknown) =>
  call(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

// A network with an API key whose roster is imported, settled, and priced through the API, as a
// program sets one up, with Qloo's answers faked.
async function rosterReady(made?: Awaited<ReturnType<typeof networkWithKey>>) {
  fakeQloo({ search })
  fakeInsights((body) => fit.filter((r) => String(body['filter.results.entities']).split(',').includes(r.entity_id)))
  fakeDemographics([...demographics, listeners('e-0502', -0.07)])
  const { ada, network, call } = made ?? (await networkWithKey())
  const roster = `/api/v1/networks/${network}/roster`
  const settled = () => poll<{ status: string }>(call, roster, (r) => r.status === 'settled')
  await call(roster, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: csv })
  await settled()
  await patch(call, `${roster}/shows/Field%20Notes`, { entityId: 'e-0102' })
  await post(call, `${roster}/shows/Ghost%20Signal/comp-search`, { query: 'Ghost Signal Radio' })
  await settled()
  await patch(call, `${roster}/shows/Ghost%20Signal`, { compId: 'e-0601' })
  await patch(call, `${roster}/shows/Back%20Lot`, { excluded: true })
  await patch(call, `/api/v1/networks/${network}`, { cpm: 25 })
  return { ada, network, call }
}

type LaunchRun = {
  id: string
  status: Run['status']
  question: Question | null
  insertionOrder: InsertionOrder | null
} & Record<string, unknown>
type Launch = { id: string; status: string; latestRun: LaunchRun | null } & Record<string, unknown>

// Polls a launch's run, as a program waiting on it does, until it stops running: done, or waiting on
// its question.
const runRead = (call: Call, path: string) => poll<LaunchRun>(call, path, (run) => run.status !== 'running')

// A refusal as a program branches on it: the status, and the error's code and message.
const refused = async (res: Response) => [res.status, (await res.json<{ error: object }>()).error]

const post = (call: Call, path: string, body?: unknown) =>
  call(path, {
    method: 'POST',
    ...(body !== undefined && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  })

describe('creating a launch', () => {
  it('plans it by name or by comps, lists it newest first, and reads it back with no run yet', async () => {
    const { network, call } = await networkWithKey()
    const launches = `/api/v1/networks/${network}/launches`
    expect(await (await call(launches)).json()).toEqual({ launches: [] })

    const named = await post(call, launches, { name: '  Night Shift Cinema ' })
    expect(named.status).toBe(201)
    const first = await named.json<{ id: string }>()
    expect(first).toEqual({
      id: expect.any(String),
      name: 'Night Shift Cinema',
      comps: [],
      status: 'new',
      finalists: 0,
      slots: null,
      slotValue: null,
      startedBy: null,
      lastRun: null,
      rosterChanged: false,
      runs: [],
      latestRun: null
    })
    const fromComps = await (await post(call, launches, { comps: ['The Long Take', 'Corner Booth'] })).json()
    expect(fromComps).toMatchObject({ name: null, comps: ['The Long Take', 'Corner Booth'], status: 'new' })

    const { launches: listed } = await (await call(launches)).json<{ launches: { id: string }[] }>()
    expect(listed).toEqual([
      {
        id: (fromComps as { id: string }).id,
        name: null,
        comps: ['The Long Take', 'Corner Booth'],
        status: 'new',
        finalists: 0,
        slots: null,
        slotValue: null,
        startedBy: null,
        lastRun: null
      },
      {
        id: first.id,
        name: 'Night Shift Cinema',
        comps: [],
        status: 'new',
        finalists: 0,
        slots: null,
        slotValue: null,
        startedBy: null,
        lastRun: null
      }
    ])
    expect(await (await call(`${launches}/${first.id}`)).json()).toEqual(first)
  })

  it('refuses a launch with no name, no comps, both, or more than three comps, and lists nothing', async () => {
    const { network, call } = await networkWithKey()
    const launches = `/api/v1/networks/${network}/launches`
    for (const [body, message] of [
      [{}, 'Name the launch to plan it.'],
      [{ name: '  ' }, 'Name the launch to plan it.'],
      [{ comps: [' '] }, 'Name at least one comp to plan it.'],
      [{ name: 'Night Shift Cinema', comps: ['Corner Booth'] }, 'Name the launch or give its comps, not both.'],
      [
        { comps: ['A', 'B', 'C', 'D'] },
        '4 comps is over the limit of 3. Name up to 3 released shows to stand in for the launch.'
      ],
      [{ name: 7 }, expect.stringContaining('name')]
    ] as const)
      expect(await refused(await post(call, launches, body)), JSON.stringify(body)).toEqual([
        400,
        { code: 'invalid', message }
      ])
    expect(await (await call(launches)).json()).toEqual({ launches: [] })
    expect(await refused(await call(`${launches}/${crypto.randomUUID()}`))).toEqual([
      404,
      { code: 'not_found', message: "There's no such launch in this network." }
    ])
  })
})

describe("a launch's run", () => {
  it('ranks the roster, asks its questions, takes their answers, and drafts the order, as the launch then reads', async () => {
    const { network, call } = await rosterReady()
    // Topic alone ranks the roster the other way round.
    fakeTopic((request) => topicNames(request).toReversed())
    const held = Promise.withResolvers<void>()
    fakeClaude([
      () => held.promise.then(() => planned[0]),
      ...planned.slice(1),
      turn(text('Drafted the insertion order.'))
    ])
    const launches = `/api/v1/networks/${network}/launches`
    const { id } = await (await post(call, launches, { name: 'Night Shift Cinema' })).json<Launch>()

    // With no body, the run plans the launch as it was created.
    const res = await post(call, `${launches}/${id}/runs`)
    expect(res.status).toBe(202)
    const started = await res.json<LaunchRun>()
    expect(started).toMatchObject({
      status: 'running',
      startedBy: null,
      plan: { name: 'Night Shift Cinema', entity: null, comps: [] },
      question: null,
      chart: null,
      insertionOrder: null
    })
    held.resolve()
    const path = `${launches}/${id}/runs/${started.id}`

    const budget = await runRead(call, path)
    expect(budget).toMatchObject({
      status: 'waiting',
      question: { kind: 'budget', question: 'What is the slot budget?' }
    })
    const answered = await post(call, `${path}/answer`, { questionId: budget.question!.id, slots: 20 })
    expect(answered.status).toBe(202)
    expect(await answered.json()).toMatchObject({ id: started.id, budget: { slots: 20 } })

    const exclusions = await runRead(call, path)
    expect(exclusions.question).toMatchObject({ kind: 'exclusions', question: 'Leave any shows out?' })
    expect((await post(call, `${path}/answer`, { questionId: exclusions.question!.id, exclude: [] })).status).toBe(202)

    const done = await runRead(call, path)
    expect(done).toMatchObject({
      status: 'completed',
      error: null,
      closing: 'Drafted the insertion order.',
      budget: { slots: 20 },
      exclusions: [],
      plan: { name: 'Night Shift Cinema', entity: { id: 'e-0001', name: 'Night Shift Cinema' }, comps: [] }
    })
    // The answers reached the agent as the programmer's own words.
    expect(JSON.stringify(modelRequests().at(-3)!.messages.at(-1))).toContain('Slot budget: 20 promo slots.')

    // The chart in ranks, bands, and moves against the topic baseline, never scores.
    const chart = done.chart as { rows: Record<string, unknown>[]; notScored: unknown[] }
    expect(chart.rows.map((r) => [r.rank, r.show, r.band, r.finalist, r.topicRank, r.move, r.climber])).toEqual([
      [1, 'Corner Booth', 'top', true, 5, 4, true],
      [2, 'Slow Burn', 'top', true, 4, 2, false],
      [3, 'Paper Route', 'middle', true, 3, 0, false],
      [4, 'Field Notes', 'middle', true, 2, -2, false],
      [5, 'Ghost Signal', 'bottom', true, 1, -4, false]
    ])
    expect(chart.rows[4].entity).toEqual({ id: 'e-0601', name: 'Ghost Signal Radio', popularity: 0.6 })
    expect(chart.notScored).toEqual([{ show: 'Back Lot', reason: 'Excluded: never proposed for a launch' }])
    expect(JSON.stringify(chart)).not.toContain('0.913')
    expect(done.topic).toEqual({
      status: 'ranked',
      order: ['Back Lot', 'Ghost Signal', 'Field Notes', 'Paper Route', 'Slow Burn', 'Corner Booth'],
      error: null
    })
    // Slow Burn's listeners are flagged against the launch's; the others aren't.
    expect(done.demographics).toMatchObject({
      error: null,
      profile: { ages: ['25_to_29', '30_to_34'], skew: 'male' },
      rows: [
        { show: 'Corner Booth', reasons: [] },
        {
          show: 'Slow Burn',
          reasons: ["Fewer listeners aged 30 to 34 than average, where the launch's listeners over-index"]
        },
        { show: 'Paper Route', reasons: [] },
        { show: 'Field Notes', reasons: [] },
        { show: 'Ghost Signal', reasons: [] }
      ]
    })
    // 8 × $1,200 + 6 × $1,000 + 4 × $650 + 2 × $438, at the $25 CPM.
    expect(done.insertionOrder).toMatchObject({
      id: 'IO-0001',
      run: started.id,
      status: 'draft',
      cpm: 25,
      slots: 20,
      total: 19_076,
      complete: true,
      lines: [
        { show: 'Corner Booth', slots: 8, slotValue: 1200, value: 9600, gap: null },
        { show: 'Slow Burn', slots: 6, slotValue: 1000, value: 6000, gap: null },
        { show: 'Paper Route', slots: 4, slotValue: 650, value: 2600, gap: null },
        { show: 'Field Notes', slots: 2, slotValue: 438, value: 876, gap: null }
      ]
    })

    // The launch reads its latest run as the run does, and its row follows the order.
    const launch = await (await call(`${launches}/${id}`)).json<Launch>()
    expect(launch).toMatchObject({
      status: 'order_drafted',
      finalists: 5,
      slots: 20,
      slotValue: 19_076,
      startedBy: null,
      lastRun: started.startedAt,
      rosterChanged: false,
      runs: [{ id: started.id, status: 'completed', startedAt: started.startedAt, startedBy: null }]
    })
    expect(launch.latestRun).toEqual(done)
    const { launches: listed } = await (await call(launches)).json<{ launches: Launch[] }>()
    expect(listed[0]).toMatchObject({ id, status: 'order_drafted', slots: 20, slotValue: 19_076 })

    // Once the network's roster changes, the launch says it has since its latest run.
    await patch(call, `/api/v1/networks/${network}/roster/shows/Corner%20Booth`, { excluded: true })
    const changed = await poll<Launch>(call, `${launches}/${id}`, (l) => l.rosterChanged === true)
    expect(changed.latestRun).toEqual(done)
  })
})

describe("an unreleased launch's run", () => {
  it('plans it from comps, and takes the comps it confirms as picks among what each matched', async () => {
    const { network, call } = await rosterReady()
    const comps = ['The Long Take', 'Frame by Frame']
    fakeClaude([
      turn(toolUse('resolve_entities', { names: comps, type: 'urn:entity:podcast' })),
      turn(toolUse('ask_human', { question: 'Are these the comps you meant?', kind: 'confirm_comps', options: [] })),
      turn(
        toolUse('rank_candidates', {
          anchor_ids: ['e-0201', 'e-0304'],
          candidate_ids: finalists,
          type: 'urn:entity:podcast'
        })
      ),
      turn(text('Ranked against both comps.'))
    ])
    const launches = `/api/v1/networks/${network}/launches`
    const { id } = await (await post(call, launches, { name: 'Night Shift Cinema' })).json<Launch>()
    // A run can plan the launch anew, here from comps.
    const { id: run } = await (await post(call, `${launches}/${id}/runs`, { comps })).json<LaunchRun>()
    const path = `${launches}/${id}/runs/${run}`

    const confirming = await runRead(call, path)
    expect(confirming.question).toMatchObject({ kind: 'confirm_comps', options: comps })
    // Each comp offers what an answer picks from: its match, or the candidates of a name two feeds share.
    expect(confirming.plan).toEqual({
      name: null,
      entity: null,
      comps: [
        {
          name: 'The Long Take',
          status: 'unconfirmed',
          entity: null,
          candidates: [{ id: 'e-0201', name: 'The Long Take', popularity: 0.6 }]
        },
        {
          name: 'Frame by Frame',
          status: 'unconfirmed',
          entity: null,
          candidates: [
            { id: 'e-0303', name: 'Frame by Frame', popularity: 0.71 },
            { id: 'e-0304', name: 'Frame by Frame', popularity: 0.23 }
          ]
        }
      ]
    })
    expect(
      (await post(call, `${path}/answer`, { questionId: confirming.question!.id, picks: ['e-0201', 'e-0304'] })).status
    ).toBe(202)

    const done = await runRead(call, path)
    expect(done.status).toBe('completed')
    expect((done.plan as { comps: object[] }).comps).toMatchObject([
      { name: 'The Long Take', status: 'confirmed', entity: { id: 'e-0201' } },
      { name: 'Frame by Frame', status: 'confirmed', entity: { id: 'e-0304' } }
    ])
    expect((done.chart as { anchors: object[] }).anchors).toEqual([
      { id: 'e-0201', name: 'The Long Take' },
      { id: 'e-0304', name: 'Frame by Frame' }
    ])
    expect(await (await call(`${launches}/${id}`)).json()).toMatchObject({
      name: null,
      comps,
      status: 'ranked',
      finalists: 5
    })
  })
})

describe("a launch's run, refused", () => {
  const saved = { RUN_VISITOR_DAILY_CAP: env.RUN_VISITOR_DAILY_CAP, FREE_START_DAILY_CAP: env.FREE_START_DAILY_CAP }
  afterEach(() => Object.assign(env, saved))

  it("doesn't start while the roster is still being looked up, while a run is under way, or past the network's caps", async () => {
    fakeQloo({ search, latencyMs: 100 })
    const { network, call } = await networkWithKey()
    const launches = `/api/v1/networks/${network}/launches`
    const { id } = await (await post(call, launches, { name: 'Night Shift Cinema' })).json<Launch>()
    const runs = `${launches}/${id}/runs`
    await call(`/api/v1/networks/${network}/roster`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/csv' },
      body: csv
    })
    // The refusal comes from the network's agent, through the launch's.
    expect(await refused(await post(call, runs))).toEqual([
      409,
      {
        code: 'conflict',
        message:
          "The network's roster is still looking up 6 shows in Qloo. Start the run once the lookups have settled, so it ranks every show."
      }
    ])
    await poll<{ status: string }>(call, `/api/v1/networks/${network}/roster`, (r) => r.status === 'settled')

    for (const [body, message] of [
      [{ name: 'Night Shift Cinema', comps: ['Corner Booth'] }, 'Name the launch or give its comps, not both.'],
      [{ comps: [] }, 'Name at least one comp to start a run.'],
      [{ comp: ['Corner Booth'] }, expect.stringContaining('comp')]
    ] as const)
      expect(await refused(await post(call, runs, body)), JSON.stringify(body)).toEqual([
        400,
        { code: 'invalid', message }
      ])

    const held = Promise.withResolvers<void>()
    fakeClaude([() => held.promise.then(() => turn(text('Nothing to rank.')))])
    const { id: run } = await (await post(call, runs)).json<LaunchRun>()
    expect(await refused(await post(call, runs))).toEqual([
      409,
      { code: 'conflict', message: 'A run is already in progress. Wait for it to finish.' }
    ])
    held.resolve()
    expect((await runRead(call, `${runs}/${run}`)).status).toBe('completed')

    // Past the network's model runs, a start stops at once, saying why, until its free starts are used.
    env.RUN_VISITOR_DAILY_CAP = '1'
    env.FREE_START_DAILY_CAP = '1'
    const stopped = await post(call, runs)
    expect(stopped.status).toBe(202)
    expect(await stopped.json()).toMatchObject({
      status: 'stopped',
      error:
        "You've started 1 model run today, the most one network can start in a UTC day; they reset at 00:00 UTC, so runs on your own data wait until then. Only the sample launch, on the unchanged sample network, replays its stored run."
    })
    expect(await refused(await post(call, runs))).toEqual([
      429,
      {
        code: 'limit',
        message:
          "You've started 1 run today that replayed or stopped at once, the most one network can start in a UTC day; they reset at 00:00 UTC."
      }
    ])
    const { runs: listed } = await (await call(`${launches}/${id}`)).json<{ runs: { status: string }[] }>()
    expect(listed.map((r) => r.status)).toEqual(['completed', 'stopped'])
  })

  it('takes no answer meant for another question, a run that has ended, or none of the fields its kind takes', async () => {
    const { network, call } = await rosterReady()
    fakeClaude([...planned.slice(0, 4), ...planned.slice(0, 4)])
    const launches = `/api/v1/networks/${network}/launches`
    const { id } = await (await post(call, launches, { name: 'Night Shift Cinema' })).json<Launch>()
    const runs = `${launches}/${id}/runs`
    const first = await runRead(call, `${runs}/${(await (await post(call, runs)).json<LaunchRun>()).id}`)
    const answer = (run: string, body: object) => post(call, `${runs}/${run}/answer`, body)
    const questionId = first.question!.id

    for (const [body, status, error] of [
      [
        { questionId: 'toolu_9_9', slots: 20 },
        409,
        {
          code: 'conflict',
          message: 'That question is no longer open: it was already answered, or its run has ended.'
        }
      ],
      [
        { questionId },
        400,
        { code: 'invalid', message: 'Give the budget as a number of promo slots or a dollar amount.' }
      ],
      [
        { questionId, slots: 0 },
        400,
        { code: 'invalid', message: 'The slot budget must be a whole number of slots, 1 or more.' }
      ],
      [
        { questionId, slots: 4, dollars: 100 },
        400,
        { code: 'invalid', message: 'Give the budget as promo slots or dollars, not both.' }
      ],
      [
        { questionId, text: 'Twenty' },
        400,
        { code: 'invalid', message: 'This question is answered with its form, not typed text.' }
      ],
      [{ slots: 20 }, 400, { code: 'invalid', message: expect.stringContaining('questionId') }]
    ] as const)
      expect(await refused(await answer(first.id, body)), JSON.stringify(body)).toEqual([status, error])
    expect(await refused(await answer('run-0', { questionId, slots: 20 }))).toEqual([
      404,
      { code: 'not_found', message: "There's no run run-0 of this launch." }
    ])

    // A new run ends the one left waiting, which then has no question to answer.
    const second = await runRead(call, `${runs}/${(await (await post(call, runs)).json<LaunchRun>()).id}`)
    expect(second.status).toBe('waiting')
    expect(await refused(await answer(first.id, { questionId, slots: 20 }))).toEqual([
      409,
      { code: 'conflict', message: 'That run has ended, so it has no question to answer.' }
    ])
    expect(await (await call(`${runs}/${first.id}`)).json()).toMatchObject({
      status: 'failed',
      error: 'Left unanswered: a new run started instead.',
      question: { id: questionId, kind: 'budget' }
    })
  })
})

// A launch whose first run drafted its insertion order, all through the API, with `more` scripted
// for later runs.
async function drafted(more: Parameters<typeof fakeClaude>[0] = []) {
  const ready = await rosterReady()
  fakeClaude([...planned, turn(text('Drafted the insertion order.')), ...more])
  const launches = `/api/v1/networks/${ready.network}/launches`
  const { id } = await (await post(ready.call, launches, { name: 'Night Shift Cinema' })).json<Launch>()
  const launch = `${launches}/${id}`
  let run = await runRead(
    ready.call,
    `${launch}/runs/${(await (await post(ready.call, `${launch}/runs`)).json<LaunchRun>()).id}`
  )
  for (const answer of [{ slots: 20 }, { exclude: [] }]) {
    await post(ready.call, `${launch}/runs/${run.id}/answer`, { questionId: run.question!.id, ...answer })
    run = await runRead(ready.call, `${launch}/runs/${run.id}`)
  }
  return { ...ready, id, launch, run }
}

describe("a launch's insertion order", () => {
  // The body as sent, byte-order mark included: Response.text() would drop it.
  const body = async (res: Response) => new TextDecoder('utf-8', { ignoreBOM: true }).decode(await res.arrayBuffer())
  const csvOf = (lines: string[]) =>
    `\uFEFFShow,Slots,Angle,Slot value (USD),Line value (USD)\r\n${lines.map((l) => `${l}\r\n`).join('')}`

  it('is edited as a draft, exports as CSV only once a member approved it in the app, and an edit takes that back', async () => {
    const ask = toolUse('ask_human', {
      question: 'Hold a slot for the finale?',
      kind: 'choice',
      options: ['Yes', 'No']
    })
    const { ada, network, call, id, launch, run } = await drafted([...planned, turn(ask)])
    const order = `${launch}/insertion-orders/IO-0001`
    expect(run.insertionOrder).toMatchObject({ id: 'IO-0001', status: 'draft', slots: 20 })
    expect(await refused(await call(`${order}/csv`))).toEqual([
      409,
      { code: 'conflict', message: 'IO-0001 is a draft. Approve it before exporting.' }
    ])

    // Lines as the run reads them, priced fields and all, with one dropped and one changed.
    const lines = run.insertionOrder!.lines.slice(0, 2).map((l) => (l.show === 'Slow Burn' ? { ...l, slots: 2 } : l))
    const edited = await patch(call, order, { lines })
    expect(edited.status).toBe(200)
    expect(await edited.json()).toMatchObject({
      id: 'IO-0001',
      status: 'draft',
      slots: 10,
      total: 11_600,
      lines: [
        { show: 'Corner Booth', slots: 8, slotValue: 1200, value: 9600 },
        { show: 'Slow Burn', slots: 2, slotValue: 1000, value: 2000 }
      ]
    })

    // A member approves it on the launch's page.
    const page = await ada.connect(`/agents/launch/${network}/${id}`)
    await page.call('approveInsertionOrder', 'IO-0001')
    page.close()
    const approved = await (await call(launch)).json<Launch>()
    expect(approved).toMatchObject({ status: 'order_approved', slots: 10, slotValue: 11_600 })
    expect(approved.latestRun!.insertionOrder).toMatchObject({ status: 'approved', approvedBy: 'Ada Programmer' })
    const exported = await call(`${order}/csv`)
    expect(exported.status).toBe(200)
    expect(exported.headers.get('content-type')).toBe('text/csv; charset=utf-8')
    expect(exported.headers.get('content-disposition')).toBe('attachment; filename="IO-0001.csv"')
    expect(exported.headers.get('cache-control')).toBe('no-store')
    const shipped = csvOf([
      'Corner Booth,8,Late-night regulars stay up for the call-ins.,1200,9600',
      'Slow Burn,2,Its long interviews share the slow pace.,1000,2000',
      'Total,10,,,11600'
    ])
    expect(await body(exported)).toBe(shipped)

    // An edit returns it to draft, and the export is refused again until a member approves it anew.
    const back = await (await patch(call, order, { lines: lines.map((l) => ({ ...l, angle: `${l.angle} ` })) })).json()
    expect(back).toMatchObject({ status: 'draft' })
    expect(back).not.toHaveProperty('approvedBy')
    expect((await call(`${order}/csv`)).status).toBe(409)
    const again = await ada.connect(`/agents/launch/${network}/${id}`)
    await again.call('approveInsertionOrder', 'IO-0001')
    again.close()

    // A re-run drafts its own order; the earlier one can't be edited, but still exports as approved.
    const second = (await (await post(call, `${launch}/runs`)).json<LaunchRun>()).id
    let rerun = await runRead(call, `${launch}/runs/${second}`)
    for (const answer of [{ slots: 20 }, { exclude: [] }]) {
      await post(call, `${launch}/runs/${second}/answer`, { questionId: rerun.question!.id, ...answer })
      rerun = await runRead(call, `${launch}/runs/${second}`)
    }
    expect(rerun).toMatchObject({ status: 'waiting', insertionOrder: { id: 'IO-0002', status: 'draft' } })
    expect(await refused(await patch(call, `${launch}/insertion-orders/IO-0002`, { lines }))).toEqual([
      409,
      {
        code: 'conflict',
        message: 'The agent is still working on this run. Edit or approve the order once the run has ended.'
      }
    ])
    expect(await refused(await patch(call, order, { lines }))).toEqual([
      409,
      { code: 'conflict', message: "IO-0001 isn't the current insertion order. Reload to see the latest." }
    ])
    expect(await body(await call(`${order}/csv`))).toBe(shipped)
    expect((await call(`${launch}/runs/${run.id}`).then((r) => r.json<LaunchRun>())).insertionOrder).toMatchObject({
      id: 'IO-0001',
      status: 'approved',
      slots: 10
    })
  })

  it("is never approved through the API, which refuses lines the order can't take", async () => {
    const { call, launch } = await drafted()
    const order = `${launch}/insertion-orders/IO-0001`
    expect((await post(call, `${order}/approve`)).status).toBe(404)
    const line = { show: 'Corner Booth', slots: 8, angle: 'Call-ins.' }
    for (const [path, change, status, error] of [
      [
        order,
        { lines: [line], status: 'approved' },
        400,
        {
          code: 'invalid',
          message: "Only an order's lines change through the API. A member approves an insertion order, in the app."
        }
      ],
      [order, { lines: [] }, 400, { code: 'invalid', message: 'The order has no lines.' }],
      [
        order,
        { lines: [{ ...line, show: 'Back Lot' }] },
        400,
        {
          code: 'invalid',
          message:
            '"Back Lot" isn\'t one of this run\'s finalists, which are Corner Booth, Slow Burn, Paper Route, Field Notes, Ghost Signal.'
        }
      ],
      [
        order,
        { lines: [{ ...line, slots: 1.5 }] },
        400,
        { code: 'invalid', message: 'Corner Booth needs a whole number of slots, 1 or more.' }
      ],
      [
        order,
        { lines: [{ ...line, angle: ' ' }] },
        400,
        { code: 'invalid', message: 'Corner Booth needs a host-read angle.' }
      ],
      [order, {}, 400, { code: 'invalid', message: expect.stringContaining('lines') }],
      [
        `${launch}/insertion-orders/IO-0009`,
        { lines: [line] },
        404,
        { code: 'not_found', message: "IO-0009 isn't the current insertion order. Reload to see the latest." }
      ]
    ] as const)
      expect(await refused(await patch(call, path, change)), JSON.stringify(change)).toEqual([status, error])
    expect(await refused(await call(`${launch}/insertion-orders/IO-0009/csv`))).toEqual([
      404,
      { code: 'not_found', message: "There's no insertion order IO-0009 in this launch." }
    ])
    // Nothing changed.
    expect((await (await call(launch)).json<Launch>()).latestRun!.insertionOrder).toMatchObject({
      status: 'draft',
      slots: 20
    })
  })
})

describe("a launch's evidence", () => {
  it('holds a record for every call its runs cite, those from the roster marked copied, scores and all', async () => {
    const { call, launch, run } = await drafted()
    const res = await call(`${launch}/evidence`)
    expect(res.status).toBe(200)
    const { evidence } = await res.json<{ evidence: Evidence[] }>()
    const calls = evidence.map((e) => e.call)
    expect(new Set(calls).size).toBe(calls.length)
    const { runs: _, ...latest } = (await (await call(launch)).json<Launch>()).latestRun! as Record<string, unknown>
    // The run cites its ranking call and its demographics call.
    const cited = [...new Set(JSON.stringify(latest).match(/\bC-\d+\b/g))]
    expect(cited).toEqual([(run.chart as { call: string }).call, (run.demographics as { call: string }).call])
    for (const c of cited) expect(calls, c).toContain(c)

    // The roster's lookups were made by the network's agent, and copied in as the run started.
    const copied = evidence.filter((e) => e.copiedFrom)
    expect(copied.map((e) => e.entities[0].name).sort()).toEqual([
      'Back Lot',
      'Corner Booth',
      'Field Notes: Film',
      'Ghost Signal Radio',
      'Paper Route',
      'Slow Burn'
    ])
    // The chart shows ranks; its ranking call's record keeps what Qloo scored.
    const ranking = evidence.find((e) => e.call === (run.chart as { call: string }).call)!
    expect(ranking).toMatchObject({ run: run.id, endpoint: '/v2/insights', error: null })
    expect(ranking.affinities.map((a) => [a.name, a.affinity])).toEqual(fit.map((f) => [f.name, f.affinity]))
  })
})

describe('deleting a launch', () => {
  it("takes a member's session, never an API key, and the launch's routes answer 404 after", async () => {
    const { ada, network, call } = await networkWithKey()
    const launches = `/api/v1/networks/${network}/launches`
    const { id } = await (await post(call, launches, { name: 'Night Shift Cinema' })).json<Launch>()
    const launch = `${launches}/${id}`

    expect(await refused(await call(launch, { method: 'DELETE' }))).toEqual([
      403,
      {
        code: 'forbidden',
        message: "A launch is deleted by a member of the network, signed in to the app. An API key can't delete one."
      }
    ])
    expect((await call(launch)).status).toBe(200)
    // A session's write must come from one of the app's pages.
    const elsewhere = await exports.default.fetch(`https://crossfeed.test${launch}`, {
      method: 'DELETE',
      headers: { Cookie: ada.cookie, Origin: 'https://elsewhere.test' }
    })
    expect(elsewhere.status).toBe(403)
    expect((await ada.fetch(`${launches}/${crypto.randomUUID()}`, { method: 'DELETE' })).status).toBe(404)

    const deleted = await ada.fetch(launch, { method: 'DELETE' })
    expect(deleted.status).toBe(204)
    expect(await (await call(launches)).json()).toEqual({ launches: [] })
    for (const res of [await call(launch), await call(`${launch}/evidence`), await post(call, `${launch}/runs`)])
      expect(await refused(res)).toEqual([
        404,
        { code: 'not_found', message: "There's no such launch in this network." }
      ])
    expect((await ada.fetch(launch, { method: 'DELETE' })).status).toBe(404)
  })
})

describe("a launch's routes", () => {
  it("answer 404 for another network's launch, and to another network's key", async () => {
    const { ada, network, call } = await networkWithKey()
    const other = await networkWithKey(ada)
    const { id } = await (
      await post(call, `/api/v1/networks/${network}/launches`, { name: 'Night Shift Cinema' })
    ).json<Launch>()
    for (const path of [`/launches/${id}`, `/launches/${id}/runs/run-0`, `/launches/${id}/evidence`])
      expect(await refused(await other.call(`/api/v1/networks/${other.network}${path}`))).toEqual([
        404,
        { code: 'not_found', message: "There's no such launch in this network." }
      ])
    expect((await other.call(`/api/v1/networks/${network}/launches/${id}`)).status).toBe(404)
    // A member's session reads them too.
    expect((await ada.fetch(`/api/v1/networks/${network}/launches/${id}`)).status).toBe(200)
  })
})
