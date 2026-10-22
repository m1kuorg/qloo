// The TypeScript SDK in packages/sdk, driving the real Worker through its injected `fetch` as a
// program using it would: with an API key, waiting on long work with its helpers, and branching on
// each CrossfeedError's code and status.
import { env, exports } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Crossfeed, CrossfeedError, type CrossfeedOptions } from '../../packages/sdk/src/index'
import generated from '../../packages/sdk/src/openapi.ts?raw'
import { sha256 } from '../src/text'
import { fakeClaude, fakeCompare, fakeInsights, fakeQloo, fakeReader, text, toolUse, turn } from './fake'
import { networkWithKey } from './session'

// A program's client, made the way the SDK's README makes one, its requests sent to the Worker in
// the tests' isolate unless `fetch` sends them another way.
const sdk = (
  apiKey: string,
  networkId: string,
  fetch: CrossfeedOptions['fetch'] = (url, init) => exports.default.fetch(url, init)
) => new Crossfeed({ apiKey, networkId, baseUrl: 'https://crossfeed.test', fetch })

// And one for a new network, with its key.
async function client() {
  const made = await networkWithKey()
  return { ...made, crossfeed: sdk(made.secret, made.network) }
}

// What a call refused with, as a program branches on it.
const refusal = (call: Promise<unknown>) =>
  call.then(
    () => expect.fail('The call was not refused.'),
    (error: unknown) => {
      expect(error).toBeInstanceOf(CrossfeedError)
      const { code, status, message } = error as CrossfeedError
      return { code, status, message }
    }
  )

// The API's OpenAPI document as the Worker serves it, but for its server, which is each server's own
// origin, as packages/sdk/openapi.json keeps it.
const served = async () => {
  const res = await exports.default.fetch('https://crossfeed.test/api/v1/openapi.json')
  const { servers: _, ...document } = await res.json<Record<string, unknown>>()
  return `${JSON.stringify(document, null, 2)}\n`
}

describe("the SDK's types", () => {
  const regenerate = 'Run `bun run generate` in packages/sdk.'

  // `bun run generate` runs this one with --update, so it writes the document, then generates the
  // types from what it wrote.
  it('match the OpenAPI document the Worker serves', async () => {
    await expect(await served(), regenerate).toMatchFileSnapshot('../../packages/sdk/openapi.json')
  })

  it('are generated from that document', async () => {
    expect(generated.split('\n')[0], regenerate).toBe(`// From openapi.json, sha256 ${await sha256(await served())}.`)
  })
})

describe("the SDK's methods", () => {
  it('reach every route the OpenAPI document describes', async () => {
    const { secret, network } = await networkWithKey()
    const sent: string[] = []
    const crossfeed = sdk(secret, network, (url, init) => {
      sent.push(`${init.method} ${new URL(url).pathname}`)
      return exports.default.fetch(url, init)
    })
    const [launch, run, order, pitch] = ['launch-1', 'run-1', 'IO-0001', 'pitch-01']
    const answer = { questionId: 'toolu_01', choice: 'Yes' }
    // One call of each method. What each answers, mostly refusals of made-up IDs, doesn't matter here,
    // so long as a refusal is the API's.
    for (const call of [
      () => crossfeed.network.get(),
      () => crossfeed.network.update({}),
      () => crossfeed.network.usage(),
      () => crossfeed.roster.get(),
      () => crossfeed.roster.import(''),
      () => crossfeed.roster.updateShow('Corner Booth', {}),
      () => crossfeed.roster.searchComps('Corner Booth', 'Slow Burn'),
      () => crossfeed.launches.list(),
      () => crossfeed.launches.create({}),
      () => crossfeed.launches.get(launch),
      () => crossfeed.launches.delete(launch),
      () => crossfeed.runs.start(launch),
      () => crossfeed.runs.get(launch, run),
      () => crossfeed.runs.answer(launch, run, answer),
      () => crossfeed.insertionOrders.edit(launch, order, { lines: [] }),
      () => crossfeed.insertionOrders.exportCsv(launch, order),
      () => crossfeed.evidence.list(launch),
      () => crossfeed.inbox.get(),
      () => crossfeed.inbox.load({ pitches: [] }),
      () => crossfeed.inbox.confirmWork(pitch, 'f-0001'),
      () => crossfeed.pitchRuns.start({ show: 'Corner Booth' }),
      () => crossfeed.pitchRuns.list(),
      () => crossfeed.pitchRuns.get(run),
      () => crossfeed.pitchRuns.answer(run, answer),
      () => crossfeed.replies.edit(run, pitch, 'Thanks.'),
      () => crossfeed.replies.discard(run, pitch)
    ])
      await call().catch((error) => expect(error).toBeInstanceOf(CrossfeedError))

    const { paths } = JSON.parse(await served()) as { paths: Record<string, object> }
    const documented = Object.entries(paths).flatMap(([path, methods]) =>
      Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`)
    )
    const routeOf = (request: string) =>
      documented.find((route) => new RegExp(`^${route.replace(/\{\w+\}/g, '[^/]+')}$`).test(request)) ?? request
    expect([...new Set(sent.map(routeOf))].toSorted()).toEqual(documented.toSorted())
  })
})

describe('a client', () => {
  it("reads and changes the network with the network's API key", async () => {
    const { crossfeed, network } = await client()
    expect(await crossfeed.network.get()).toEqual({ id: network, name: 'Night Shift Audio', cpm: null })
    expect(await crossfeed.network.update({ cpm: 25 })).toEqual({ id: network, name: 'Night Shift Audio', cpm: 25 })
    expect(await crossfeed.network.usage()).toMatchObject({ qlooCalls: { used: 0 }, modelRuns: { used: 0 } })
  })

  it("rejects with the API's code, message, and status as a CrossfeedError", async () => {
    const { crossfeed, secret, network } = await client()
    expect(await refusal(crossfeed.network.update({ cpm: 0 }))).toEqual({
      code: 'invalid',
      status: 400,
      message: 'The CPM must be a dollar amount above 0.'
    })
    expect(await refusal(sdk(`${secret}x`, network).network.get())).toEqual({
      code: 'unauthorized',
      status: 401,
      message:
        'This API key is unknown or was revoked. Send a key from the network\'s settings as "Authorization: Bearer cf_live_…".'
    })
    // An answer that isn't one of Crossfeed's errors, as from a proxy, or a wrong baseUrl.
    const proxy = sdk(secret, network, async () => new Response('<h1>502 Bad Gateway</h1>', { status: 502 }))
    expect(await refusal(proxy.network.get())).toEqual({
      code: 'unexpected_response',
      status: 502,
      message: `GET /api/v1/networks/${network} answered 502, not with one of Crossfeed's errors. Check baseUrl. It said: <h1>502 Bad Gateway</h1>`
    })
  })
})

// A made-up network: Field Notes is ambiguous until settled, and Qloo has no Ghost Signal until it's
// mapped to a comp. Night Shift Cinema is the launch.
const show = (entity_id: string, name: string) => [{ entity_id, name, popularity: 0.6 }]
const search = {
  'Night Shift Cinema': show('e-0001', 'Night Shift Cinema'),
  'Corner Booth': show('e-0501', 'Corner Booth'),
  'Slow Burn': show('e-0502', 'Slow Burn'),
  'Field Notes': [
    { entity_id: 'e-0101', name: 'Field Notes: Film', popularity: 0.6 },
    { entity_id: 'e-0102', name: 'Field Notes: Books', popularity: 0.3 }
  ],
  'Ghost Signal': [],
  'Ghost Signal Radio': show('e-0601', 'Ghost Signal Radio')
}
const roster = 'name,downloads\nCorner Booth,48000\nSlow Burn,40000\nField Notes,17500\nGhost Signal,9000\n'
// Made-up scores in fit order.
const fit = [
  { entity_id: 'e-0501', name: 'Corner Booth', affinity: 0.913 },
  { entity_id: 'e-0502', name: 'Slow Burn', affinity: 0.902 },
  { entity_id: 'e-0102', name: 'Field Notes: Books', affinity: 0.871 },
  { entity_id: 'e-0601', name: 'Ghost Signal Radio', affinity: 0.866 }
]
// The agent's turns: resolve the launch, rank the roster, ask for the budget and exclusions, find the
// finalists' shared tags, then draft the order.
const planned = [
  turn(toolUse('resolve_entities', { names: ['Night Shift Cinema'], type: 'urn:entity:podcast' })),
  turn(
    toolUse('rank_candidates', {
      anchor_ids: ['e-0001'],
      candidate_ids: fit.map((r) => r.entity_id),
      type: 'urn:entity:podcast'
    })
  ),
  turn(toolUse('ask_human', { question: 'What is the slot budget?', kind: 'budget', options: [] })),
  turn(toolUse('ask_human', { question: 'Leave any shows out?', kind: 'exclusions', options: [] })),
  turn(toolUse('shared_tags', { anchor_ids: ['e-0001'], candidate_ids: fit.map((r) => r.entity_id) })),
  turn(
    toolUse('draft_insertion_order', {
      lines: [
        { show: 'Corner Booth', slots: 8, angle: 'Late-night regulars stay up for the call-ins.' },
        { show: 'Slow Burn', slots: 6, angle: 'Its long interviews share the slow pace.' },
        { show: 'Field Notes', slots: 4, angle: 'Shares the field-recording style.' },
        { show: 'Ghost Signal', slots: 2, angle: 'Its listeners stay for the radio drama.' }
      ]
    })
  ),
  turn(text('Drafted the insertion order.'))
]

describe('a launch, planned through the SDK', () => {
  it('goes from a roster import to a draft order, which exports once a member approves it in the app', async () => {
    fakeQloo({ search })
    fakeInsights((body) => fit.filter((r) => String(body['filter.results.entities']).split(',').includes(r.entity_id)))
    // Made-up tags each finalist shares with the launch.
    fakeCompare(
      Object.fromEntries(
        fit.map((r) => [r.entity_id, [{ tag_id: 'urn:tag:keyword:media:film', name: 'Film', score: 0.6131 }]])
      )
    )
    fakeClaude(planned)
    const { crossfeed, ada, network } = await client()

    // The roster, imported, settled, mapped, and priced.
    expect((await crossfeed.roster.import(roster)).status).toBe('pending')
    const settled = await crossfeed.waitForRoster({ interval: 10 })
    expect(settled.shows.map((s) => [s.name, s.resolution])).toEqual([
      ['Corner Booth', 'resolved'],
      ['Slow Burn', 'resolved'],
      ['Field Notes', 'ambiguous'],
      ['Ghost Signal', 'missed']
    ])
    expect(await crossfeed.roster.updateShow('Field Notes', { entityId: 'e-0102' })).toMatchObject({
      resolution: 'resolved',
      entity: { id: 'e-0102' }
    })
    expect((await crossfeed.roster.searchComps('Ghost Signal', 'Ghost Signal Radio')).compSearch).toMatchObject({
      query: 'Ghost Signal Radio'
    })
    await crossfeed.waitForRoster({ interval: 10 })
    expect(await crossfeed.roster.updateShow('Ghost Signal', { compId: 'e-0601' })).toMatchObject({
      resolution: 'mapped'
    })
    await crossfeed.network.update({ cpm: 25 })

    // The launch, and its run, answered as the person planning it would.
    const launch = await crossfeed.launches.create({ name: 'Night Shift Cinema' })
    expect(launch).toMatchObject({ name: 'Night Shift Cinema', status: 'new', latestRun: null })
    const started = await crossfeed.runs.start(launch.id)
    expect(started.status).toBe('running')
    const run = { launchId: launch.id, runId: started.id }
    const budget = await crossfeed.waitForRun(run, { interval: 10 })
    expect(budget).toMatchObject({ status: 'waiting', question: { kind: 'budget' } })
    await crossfeed.runs.answer(launch.id, started.id, { questionId: budget.question!.id, slots: 20 })
    const exclusions = await crossfeed.waitForRun(run, { interval: 10 })
    expect(exclusions.question).toMatchObject({ kind: 'exclusions' })
    await crossfeed.runs.answer(launch.id, started.id, { questionId: exclusions.question!.id, exclude: [] })
    const done = await crossfeed.waitForRun(run, { interval: 10 })

    // 8 × $1,200 + 6 × $1,000 + 4 × $438 + 2 × $225, at the $25 CPM.
    expect(done).toMatchObject({
      status: 'completed',
      closing: 'Drafted the insertion order.',
      insertionOrder: { id: 'IO-0001', status: 'draft', cpm: 25, slots: 20, total: 17_802, complete: true }
    })
    expect(done.chart!.rows.map((r) => [r.rank, r.show, r.finalist])).toEqual([
      [1, 'Corner Booth', true],
      [2, 'Slow Burn', true],
      [3, 'Field Notes', true],
      [4, 'Ghost Signal', true]
    ])
    expect(await crossfeed.launches.get(launch.id)).toMatchObject({ status: 'order_drafted', latestRun: done })
    expect((await crossfeed.launches.list()).launches).toMatchObject([{ id: launch.id, status: 'order_drafted' }])
    expect(await crossfeed.runs.get(launch.id, started.id)).toEqual(done)
    // Every call number the chart cites opens a record in the launch's evidence.
    const { evidence } = await crossfeed.evidence.list(launch.id)
    expect(evidence.map((e) => e.call)).toContain(done.chart!.call)

    // The draft, edited, then refused for export until a member approves it in the app.
    const lines = done.insertionOrder!.lines.slice(0, 3).map((l) => (l.show === 'Field Notes' ? { ...l, slots: 2 } : l))
    expect(await crossfeed.insertionOrders.edit(launch.id, 'IO-0001', { lines })).toMatchObject({
      status: 'draft',
      slots: 16,
      total: 16_476
    })
    expect(await refusal(crossfeed.insertionOrders.exportCsv(launch.id, 'IO-0001'))).toEqual({
      code: 'conflict',
      status: 409,
      message:
        "IO-0001 is a draft. A member of the network approves it on the launch's page in the app; then it exports."
    })
    const page = await ada.connect(`/agents/launch/${network}/${launch.id}`)
    await page.call('approveInsertionOrder', 'IO-0001')
    page.close()
    expect(await crossfeed.insertionOrders.exportCsv(launch.id, 'IO-0001')).toBe(
      '\uFEFFShow,Slots,Angle,Slot value (USD),Line value (USD)\r\n' +
        'Corner Booth,8,Late-night regulars stay up for the call-ins.,1200,9600\r\n' +
        'Slow Burn,6,Its long interviews share the slow pace.,1000,6000\r\n' +
        'Field Notes,2,Shares the field-recording style.,438,876\r\n' +
        'Total,16,,,16476\r\n'
    )
  })
})

describe('pitches, triaged through the SDK', () => {
  beforeEach(() => {
    env.GUEST_PITCHES = 'on'
  })
  afterEach(() => {
    env.GUEST_PITCHES = 'off'
  })

  // Two made-up pitches, as a text file of them: Low Tide is a title two films of one year share until
  // one is confirmed, and Paper Moons a book.
  const pitches =
    'From: Cy Lund <cy@example.com>\nSubject: Low Tide\n\nCy Lund on making Low Tide on a shoestring.\n---\nRue Vance on her novel Paper Moons.\n'
  const works = {
    'Low Tide': [
      { entity_id: 'f-0001', name: 'Low Tide', popularity: 0.5, disambiguation: '2021' },
      { entity_id: 'f-0002', name: 'Low Tide', popularity: 0.3, disambiguation: '2021' }
    ],
    'Paper Moons': [{ entity_id: 'b-0002', name: 'Paper Moons', popularity: 0.5, disambiguation: '2016, Rue Vance' }]
  }
  const readings = {
    'Low Tide': { guest: 'Cy Lund', work: { title: 'Low Tide', type: 'film', year: 2021 } },
    'Paper Moons': { guest: 'Rue Vance', work: { title: 'Paper Moons', type: 'book', year: 2016 } }
  }
  // Made-up scores, one list per work type.
  const scores: Record<string, { entity_id: string; name: string; affinity: number }[]> = {
    'urn:entity:book': [{ entity_id: 'b-0002', name: 'Paper Moons', affinity: 0.7341 }],
    'urn:entity:movie': [{ entity_id: 'f-0002', name: 'Low Tide', affinity: 0.6883 }]
  }

  it('loads, reads, and ranks them against a show, takes its answer, and drafts replies to edit or discard', async () => {
    fakeQloo({ search: { ...works, 'Night Shift Cinema': show('e-0001', 'Night Shift Cinema') } })
    fakeInsights((body) => scores[String(body['filter.type'])])
    // Neither top pitch shares a tag with the show, so the replies have no angles.
    fakeCompare({})
    fakeReader(2, (pitch) => Object.entries(readings).find(([title]) => pitch.includes(title))![1])
    const { crossfeed } = await client()
    await crossfeed.roster.import('Night Shift Cinema\n', { type: 'text/plain' })
    await crossfeed.waitForRoster({ interval: 10 })

    // The works' lookups answer once the test has seen the inbox still reading.
    const lookups = Promise.withResolvers<void>()
    fakeQloo({
      search: { ...works, 'Night Shift Cinema': show('e-0001', 'Night Shift Cinema') },
      held: lookups.promise
    })
    expect((await crossfeed.inbox.load(pitches, { type: 'text/plain' })).status).toBe('reading')
    lookups.resolve()
    const inbox = await crossfeed.waitForInbox({ interval: 10 })
    expect(inbox.pitches.map((p) => [p.id, p.from, p.guest, p.match?.resolution])).toEqual([
      ['pitch-01', 'Cy Lund <cy@example.com>', 'Cy Lund', 'ambiguous'],
      ['pitch-02', null, 'Rue Vance', 'resolved']
    ])
    expect(await crossfeed.inbox.confirmWork('pitch-01', 'f-0002')).toMatchObject({
      match: { resolution: 'resolved', entity: { id: 'f-0002' } }
    })
    expect(await crossfeed.inbox.get()).toMatchObject({
      status: 'done',
      pitches: [{ match: { entity: { id: 'f-0002' } } }, {}]
    })

    fakeClaude([
      turn(
        toolUse('rank_pitches', { show_id: 'e-0001', past_guest_work_ids: [], pitch_ids: ['pitch-01', 'pitch-02'] })
      ),
      turn(
        toolUse('ask_human', {
          question: 'Hold the film pitch for next season?',
          kind: 'choice',
          options: ['Yes', 'No']
        })
      ),
      turn(toolUse('shared_tags', { anchor_ids: ['e-0001'], candidate_ids: ['pitch-01', 'pitch-02'] })),
      turn(
        toolUse('draft_replies', {
          replies: [
            { pitch: 'pitch-01', verdict: 'later', angle: null, draft: "We'll come back to Low Tide next season." },
            { pitch: 'pitch-02', verdict: 'book', angle: null, draft: 'Paper Moons would suit the show. More soon.' }
          ]
        })
      ),
      turn(text('Drafted 1 book and 1 later.'))
    ])
    const started = await crossfeed.pitchRuns.start({ show: 'Night Shift Cinema' })
    expect(started).toMatchObject({ status: 'running', show: 'Night Shift Cinema' })
    const waiting = await crossfeed.waitForRun({ pitchRunId: started.id }, { interval: 10 })
    expect(waiting).toMatchObject({ status: 'waiting', question: { kind: 'choice', options: ['Yes', 'No'] } })
    expect(waiting.lists!.map((l) => [l.type, l.rows.map((r) => r.pitch)])).toEqual([
      ['book', ['pitch-02']],
      ['film', ['pitch-01']]
    ])
    await crossfeed.pitchRuns.answer(started.id, { questionId: waiting.question!.id, choice: 'Yes' })
    const done = await crossfeed.waitForRun({ pitchRunId: started.id }, { interval: 10 })
    expect(done).toMatchObject({ status: 'completed', closing: 'Drafted 1 book and 1 later.' })
    // The latest run, found without its ID.
    expect((await crossfeed.pitchRuns.list()).pitchRuns).toEqual([
      { id: started.id, status: 'completed', show: 'Night Shift Cinema', startedAt: started.startedAt }
    ])

    expect(await crossfeed.replies.edit(started.id, 'pitch-01', 'Low Tide fits the spring season.')).toMatchObject({
      pitch: 'pitch-01',
      status: 'draft',
      draft: 'Low Tide fits the spring season.'
    })
    expect(await crossfeed.replies.discard(started.id, 'pitch-02')).toMatchObject({
      pitch: 'pitch-02',
      status: 'discarded'
    })
    expect((await crossfeed.pitchRuns.get(started.id)).replies!.map((r) => [r.pitch, r.status, r.draft])).toEqual([
      ['pitch-01', 'draft', 'Low Tide fits the spring season.'],
      ['pitch-02', 'discarded', 'Paper Moons would suit the show. More soon.']
    ])
  })
})

describe("the SDK's wait helpers", () => {
  const saved = { RUN_VISITOR_DAILY_CAP: env.RUN_VISITOR_DAILY_CAP }
  afterEach(() => Object.assign(env, saved))

  // A client whose roster has one show, settled, and a launch to run.
  async function launchReady() {
    fakeQloo({ search })
    const made = await client()
    await made.crossfeed.roster.import('Corner Booth\n', { type: 'text/plain' })
    await made.crossfeed.waitForRoster({ interval: 10 })
    const launch = await made.crossfeed.launches.create({ name: 'Night Shift Cinema' })
    return { ...made, launch }
  }

  it('reject a run that failed or stopped with a CrossfeedError saying why', async () => {
    const { crossfeed, launch } = await launchReady()
    // The model answers its first request with an error, so the run fails.
    fakeClaude([])
    const failed = await crossfeed.runs.start(launch.id)
    const failure = await refusal(crossfeed.waitForRun({ launchId: launch.id, runId: failed.id }, { interval: 10 }))
    const read = await crossfeed.runs.get(launch.id, failed.id)
    expect(read.status).toBe('failed')
    expect(failure).toEqual({ code: 'run_failed', status: null, message: read.error })

    // Past the network's model runs, a start stops at once.
    env.RUN_VISITOR_DAILY_CAP = '1'
    const stopped = await crossfeed.runs.start(launch.id)
    expect(await refusal(crossfeed.waitForRun({ launchId: launch.id, runId: stopped.id }))).toEqual({
      code: 'run_stopped',
      status: null,
      message: stopped.error
    })
    expect(stopped.error).toContain("You've started 1 model run today")
  })

  it('reject with a timeout CrossfeedError once their time is up, and with the reason once aborted', async () => {
    // Qloo answers only once the test is done, so the roster stays pending for every wait.
    const lookups = Promise.withResolvers<void>()
    fakeQloo({ search, held: lookups.promise })
    const { crossfeed, secret, network } = await client()
    await crossfeed.roster.import('Corner Booth\n', { type: 'text/plain' })
    expect(await refusal(crossfeed.waitForRoster({ interval: 10, timeout: 50 }))).toEqual({
      code: 'timeout',
      status: null,
      message: 'The roster was still pending after 0.05 s. Wait again, or give a longer timeout.'
    })

    // Aborted between reads, a wait stops at once rather than at its next read.
    const stop = new AbortController()
    const waiting = crossfeed.waitForRoster({ interval: 60_000, signal: stop.signal })
    setTimeout(() => stop.abort(), 100)
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' })
    // So it does when the read it was waiting on ends after the abort, with a fetch that ignores signals.
    const late = new AbortController()
    const ignoring = sdk(secret, network, async (url, init) => {
      const res = await exports.default.fetch(url, { ...init, signal: undefined })
      late.abort()
      return res
    })
    await expect(ignoring.waitForRoster({ interval: 60_000, signal: late.signal })).rejects.toMatchObject({
      name: 'AbortError'
    })
    // An aborted signal stops a wait before it reads anything.
    await expect(crossfeed.waitForInbox({ signal: AbortSignal.abort() })).rejects.toMatchObject({ name: 'AbortError' })
    lookups.resolve()
  })
})
