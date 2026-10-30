// The guest network's sample launches beside The Watch (ADR 0007, #289): one launch in each of four
// statuses, captured from real runs and loaded into D1, as scripts/capture-sample-launches.ts and
// `wrangler d1 execute` do, then seeded as the guest network starts, with no call to Qloo or Claude. Here
// the runs are made on the guest network against the fakes, captured through the launches' own agents with
// test/capture.ts, loaded with its SQL, and the guest network cleared by the daily cron, as each day.
import { getAgentByName } from 'agents'
import {
  createExecutionContext,
  createScheduledController,
  evictAllDurableObjects,
  waitOnExecutionContext
} from 'cloudflare:test'
import { env, exports } from 'cloudflare:workers'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommittedLines, LaunchSummary, RunSnapshot, State } from '../src/agent'
import type { Session as Agent } from '../src/client/App'
import { Launches } from '../src/client/Launches'
import { utcDay } from '../src/client/controls'
import { EvidencePanel, namesOf } from '../src/client/Evidence'
import { LaunchWorkspace } from '../src/client/Launch'
import type { Evidence } from '../src/evidence'
import worker from '../src/index'
import { LaunchAgent } from '../src/launch-agent'
import { readSampleLaunches, type SampleLaunchesRow } from '../src/sample-launches'
import { networkLinks } from '../src/shell'
import { WIPES_PER_RUN } from '../src/wipe'
import { fakeClaude, fakeCompare, fakeInsights, fakeQloo, modelRequests, requests, text, toolUse, turn } from './fake'
import { capturedRunOf, sampleLaunchesSql } from './capture'
import { counting } from './counting'
import { api, hooked, openGuest, openMember, readAfterReset, sampleLabels, type Guest, type Session } from './session'

// Made-up IDs for three of the sample's public show names, and for the made-up launches; every other
// name finds nothing.
const show = (entity_id: string, name: string) => [{ entity_id, name, popularity: 0.6 }]
const search = {
  'The Watch': show('e-0601', 'The Watch'),
  'The Big Picture': show('e-0301', 'The Big Picture'),
  'The Rewatchables': show('e-0201', 'The Rewatchables'),
  'Night Shift Cinema': show('e-0001', 'Night Shift Cinema'),
  'Paper Moons': show('e-0002', 'Paper Moons'),
  'Slow Burn': show('e-0003', 'Slow Burn')
}
const roster = ['e-0201', 'e-0301', 'e-0601']
// Made-up scores, and a made-up tag each show shares with any launch.
const fakeRanking = () => {
  const fit = [
    { entity_id: 'e-0301', name: 'The Big Picture', affinity: 0.913 },
    { entity_id: 'e-0201', name: 'The Rewatchables', affinity: 0.887 },
    { entity_id: 'e-0601', name: 'The Watch', affinity: 0.861 }
  ]
  fakeInsights((body) => fit.filter((r) => String(body['filter.results.entities']).split(',').includes(r.entity_id)))
  fakeCompare(
    Object.fromEntries(roster.map((id) => [id, [{ tag_id: 'urn:tag:keyword:media:film', name: 'Film', score: 0.61 }]]))
  )
}

// A launch run the way the agent plans one, to its closing, drafting `lines` if it's given any.
const plan = (name: string, anchor: string, closing: string, lines?: object[]) => [
  turn(toolUse('resolve_entities', { names: [name], type: 'urn:entity:podcast' })),
  turn(toolUse('rank_candidates', { anchor_ids: [anchor], candidate_ids: roster, type: 'urn:entity:podcast' })),
  turn(toolUse('ask_human', { question: 'What is the slot budget?', kind: 'budget', options: [] })),
  turn(toolUse('ask_human', { question: 'Leave any shows out?', kind: 'exclusions', options: [] })),
  turn(toolUse('shared_tags', { anchor_ids: [anchor], candidate_ids: roster })),
  ...(lines ? [turn(toolUse('draft_insertion_order', { lines }))] : []),
  turn(text(closing))
]
const lines = [
  { show: 'The Big Picture', slots: 6, angle: 'Film lovers who stay for the long reviews.' },
  { show: 'The Rewatchables', slots: 4, angle: 'Its rewatch crowd shares the film talk.' }
]

const open: Omit<Session, 'cookie'>[] = []
const connect = async (guest: Guest, path: string) => {
  const agent = await guest.connect(path)
  open.push(agent)
  return agent
}
const saved = {
  SAMPLE_NETWORK: env.SAMPLE_NETWORK,
  RUN_VISITOR_DAILY_CAP: env.RUN_VISITOR_DAILY_CAP,
  LAUNCHES_PER_NETWORK: env.LAUNCHES_PER_NETWORK
}
beforeEach(() => {
  env.SAMPLE_NETWORK = 'on'
})
afterEach(() => {
  open.splice(0).forEach((agent) => agent.close())
  Object.assign(env, saved)
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const ended = (s: State) => s.run !== null && !['running', 'waiting'].includes(s.run.status)
const settled = (s: State) => s.roster.length > 0 && s.roster.every((r) => r.resolution !== 'pending')

// Runs the Worker's scheduled handler as Cloudflare does at the daily cron in wrangler.jsonc, or another,
// with `bindings` in place of the Worker's.
async function runCron(cron = '0 12 * * *', bindings: Env = env) {
  const ctx = createExecutionContext()
  await (worker as ExportedHandler<Env>).scheduled!(createScheduledController({ cron }), bindings, ctx)
  await waitOnExecutionContext(ctx)
}

// The four sample launches, run as a guest on the guest network as it loads the sample: one approved,
// one with its order drafted, one ranked with no order, its budget too small for a slot, and one stopped
// at once by the guest budget's daily model runs. Each is captured through its page's agent as the
// script captures it, and their SQL loaded into D1. Returns each launch's row as the guest network listed
// it then, by key.
async function captureSampleLaunches(guest: Guest) {
  fakeQloo({ search })
  fakeRanking()
  const network = await connect(guest, '/agents/network/guest-network')
  await network.until((s) => settled(s) && s.launches?.length === 1)
  fakeClaude([
    ...plan('Night Shift Cinema', 'e-0001', 'The order is drafted at $86,400.', lines),
    ...plan('Paper Moons', 'e-0002', 'The order is drafted at $86,400.', lines),
    ...plan('Slow Burn', 'e-0003', "A $1,000 budget doesn't buy one slot on any finalist.")
  ])
  const run = async (name: string, budget: object) => {
    const { id } = await network.call<{ id: string }>('createLaunch', { name })
    const launch = await connect(guest, `/agents/launch/guest-network/${id}`)
    await launch.call('startLaunch', { name })
    const asked = await launch.until((s) => s.run?.question?.kind === 'budget')
    await launch.call('answer', asked.run!.question!.id, budget)
    const exclusions = await launch.until((s) => s.run?.question?.kind === 'exclusions')
    await launch.call('answer', exclusions.run!.question!.id, { exclude: [] })
    return { id, launch, state: await launch.until(ended) }
  }
  const approved = await run('Night Shift Cinema', { slots: 10 })
  await approved.launch.call('approveInsertionOrder', approved.state.insertionOrder!.id)
  const drafted = await run('Paper Moons', { slots: 10 })
  const ranked = await run('Slow Burn', { dollars: 1_000 })
  // The guest budget's model runs for the day are used, so the next start stops at once.
  env.RUN_VISITOR_DAILY_CAP = '3'
  const { id } = await network.call<{ id: string }>('createLaunch', { name: 'Ghost Signal' })
  const stopped = { id, launch: await connect(guest, `/agents/launch/guest-network/${id}`) }
  await stopped.launch.call('startLaunch', { name: 'Ghost Signal' })
  await stopped.launch.until(ended)
  env.RUN_VISITOR_DAILY_CAP = saved.RUN_VISITOR_DAILY_CAP

  const launches = { approved, drafted, ranked, stopped }
  const statuses = { approved: 'order approved', drafted: 'order drafted', ranked: 'ranked', stopped: 'stopped' }
  const listed = await network.until((s) =>
    Object.entries(launches).every(([key, { id }]) =>
      s.launches!.some((l) => l.id === id && l.status === statuses[key as keyof typeof statuses])
    )
  )
  const captured = new Date().toISOString()
  const sql = []
  const rows: Record<string, LaunchSummary> = {}
  for (const [key, { id, launch }] of Object.entries(launches)) {
    sql.push({ key, run: capturedRunOf(launch.state()!, await launch.call<Evidence[]>('getEvidence'), captured) })
    rows[key] = listed.launches!.find((l) => l.id === id)!
  }
  await env.DB.exec(sampleLaunchesSql(sql))
  return rows as Record<keyof typeof launches, LaunchSummary>
}

// The guest network as it next starts after the daily cron clears it, once it lists `n` launches.
async function nextDay(guest: Guest, n: number) {
  await runCron()
  await readAfterReset(async () => (await getAgentByName(env.NetworkAgent, 'guest-network')).state)
  const network = await connect(guest, '/agents/network/guest-network')
  return network.until((s) => settled(s) && s.launches?.length === n)
}

const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const launchesWords = (state: State) =>
  words(
    renderToStaticMarkup(
      <Launches
        state={state}
        network={{
          id: 'guest-network',
          name: 'Guest network',
          role: 'owner',
          guestBudget: true,
          links: networkLinks(env, 'guest-network')
        }}
        createLaunch={async () => ({ id: 'l-1' })}
      />
    )
  )

describe("the guest network's sample launches", () => {
  it('open beside The Watch after the daily clearing, one in each status, with their figures and a recent last run, calling neither Qloo nor Claude', async () => {
    const guest = await openGuest()
    const captured = await captureSampleLaunches(guest)
    const models = modelRequests().length
    const qloo = requests.length
    // Hours later, within the guest's day-long session.
    vi.useFakeTimers({ toFake: ['Date'] })
    const later = 6 * 60 * 60_000
    vi.setSystemTime(Date.now() + later)

    const fresh = await nextDay(guest, 5)
    const listed = (key: keyof typeof captured) => fresh.launches!.find((l) => l.name === captured[key].name)!
    // Its orders' lines are the captured run's, under the run it's seeded as.
    const seeded = (lines: CommittedLines | null | undefined) => lines && { ...lines, run: expect.any(String) }
    for (const key of ['approved', 'drafted', 'ranked', 'stopped'] as const) {
      const { id, lastRun, ...row } = listed(key)
      const { id: was, lastRun: then, ...before } = captured[key]
      expect(row, key).toEqual({
        ...before,
        approvedLines: seeded(before.approvedLines),
        draftLines: seeded(before.draftLines)
      })
      expect(id, key).not.toBe(was)
      // Moved on by the hours since its capture, give or take the moments the clearing took.
      expect(Date.parse(lastRun!) - Date.parse(then!), key).toBeGreaterThanOrEqual(later)
      expect(Date.parse(lastRun!) - Date.parse(then!), key).toBeLessThan(later + 60_000)
    }
    expect(fresh.launches!.map((l) => [l.name, l.status, l.finalists, l.slots, l.slotValue, l.startedBy])).toEqual(
      expect.arrayContaining([
        ['Night Shift Cinema', 'order approved', 3, 10, 86_400, 'Guest'],
        ['Paper Moons', 'order drafted', 3, 10, 86_400, 'Guest'],
        ['Slow Burn', 'ranked', 3, null, null, 'Guest'],
        ['Ghost Signal', 'stopped', 0, null, null, 'Guest'],
        ['The Watch', 'new', 0, null, null, null]
      ])
    )
    // Each reports what it commits of the roster's promo inventory as it's seeded: its run's finalists, and
    // its order's lines, priced at the sample CPM; so the Inventory tab totals them.
    const order = {
      run: expect.any(String),
      cpm: 20,
      sampleCpm: true,
      lines: [
        { show: 'The Big Picture', slots: 6, value: expect.any(Number) },
        { show: 'The Rewatchables', slots: 4, value: expect.any(Number) }
      ]
    }
    const finalists = ['The Big Picture', 'The Rewatchables', 'The Watch']
    expect(fresh.launches!.map((l) => [l.name, l.finalistShows, l.approvedLines, l.draftLines])).toEqual(
      expect.arrayContaining([
        ['Night Shift Cinema', finalists, order, null],
        ['Paper Moons', finalists, null, order],
        ['Slow Burn', finalists, null, null],
        ['Ghost Signal', [], null, null],
        ['The Watch', [], null, null]
      ])
    )
    expect(launchesWords(fresh)).toMatch(
      /Needs you 2 .+ Ranked 1 Slow Burn .+ Not run yet 1 The Watch .+ Approved 1 Night Shift Cinema /
    )
    expect(launchesWords(fresh)).toContain(
      'Promo inventory 20 slots across 2 insertion orders, 10 of them approved, worth $86,400 as each order was priced, at the $20 sample CPM; 16 shows have never been a finalist.'
    )
    // The load called no model, and Qloo for nothing but the cron's health check and the sample roster.
    expect(modelRequests()).toHaveLength(models)
    expect(requests.slice(qloo).map((r) => r.url.pathname)).not.toContain('/v2/insights')
    expect(requests.slice(qloo).map((r) => r.url.pathname)).not.toContain('/v2/analysis/compare')
  })

  it('each show their run, every call it cites in their evidence as the sample’s, their order, and where it’s from, and View opens it', async () => {
    const guest = await openGuest()
    await captureSampleLaunches(guest)
    const fresh = await nextDay(guest, 5)
    const seeded = fresh.launches!.filter((l) => l.name !== 'The Watch')
    expect(seeded).toHaveLength(4)

    for (const { id, name } of seeded) {
      const launch = await connect(guest, `/agents/launch/guest-network/${id}`)
      const { runs, ...state } = launch.state()!
      const log = await launch.call<Evidence[]>('getEvidence')
      // Every call the run cites opens in the inspector, copied from the sample, as Qloo answered it then.
      const cited = [...new Set(JSON.stringify(state).match(/\bC-\d+\b/g))]
      expect(cited.length, name!).toBeGreaterThanOrEqual(19)
      for (const call of cited)
        expect(
          log.find((e) => e.call === call),
          `${name} ${call}`
        ).toBeDefined()
      expect(
        log.every((e) => e.fromSample === true && !e.replayed && !e.copiedFrom),
        name!
      ).toBe(true)
      // Captured at the sample CPM, so it's priced at the sample's, but it carries no sample (#333).
      expect(state).toMatchObject({ sample: null, sampleCpm: true, rosterChanged: false, slowCalls: [] })
      expect(state.run).toMatchObject({ capturedAt: expect.any(String) })
      expect(runs).toEqual([expect.objectContaining({ id: state.run!.id, fromSample: true, startedBy: 'Guest' })])
      // The run list's View opens it as it ended.
      expect(await launch.call<RunSnapshot>('getRun', state.run!.id)).toEqual(state)

      const html = renderToStaticMarkup(
        <LaunchWorkspace
          agent={{ state: launch.state(), stub: {} } as unknown as Agent}
          network={{
            id: 'guest-network',
            name: 'Guest network',
            role: 'owner',
            links: networkLinks(env, 'guest-network')
          }}
          orders={`/app/guest-network/launches/${id}/insertion-orders`}
        />
      )
      const page = words(html)
      // Its page's title carries the one "sample" badge; the readout, the run log and the rest carry none,
      // and the list of runs says where the run is from.
      expect(sampleLabels(html), name!).toEqual([`h1: ${name}`])
      expect(hooked(html, 'data-chart-foot').map(words), name!).toEqual(
        state.ranking ? ['Slot value = downloads × $20 sample CPM ÷ 1,000 · sample figures'] : []
      )
      expect(page, name!).not.toContain('This run is from the sample data')
      expect(page, name!).toMatch(/Run 1 · .+ · Sample data Shown/)
      // The run log says the day the run was captured (ADR 0007), in words rather than a badge.
      expect(page, name!).toContain(
        `Each step the run took when it was captured from the sample data on ${utcDay(state.run!.capturedAt!)}, and how it ended.`
      )
      expect(page, name!).not.toContain('Replayed')
      const evidence = renderToStaticMarkup(
        <EvidencePanel opened={{ call: cited[0], status: 'loaded', record: log[0] }} names={namesOf(log)} runs={runs} />
      )
      expect(sampleLabels(evidence), name!).toEqual([])
      expect(words(evidence), name!).toContain('From the sample data, as Qloo answered it')
      expect(words(evidence), name!).not.toContain('Replayed')

      if (name === 'Night Shift Cinema') {
        expect(state.insertionOrder).toMatchObject({ status: 'approved', approvedBy: 'Guest', fromSample: true })
        expect(page).toContain('Approved in the sample data')
      } else if (name === 'Paper Moons') {
        expect(state.insertionOrder).toMatchObject({ status: 'draft', slots: 10, total: 86_400 })
        expect(state.insertionOrder!.fromSample).toBeUndefined()
      } else expect(state.insertionOrder, name!).toBeNull()
    }
  })

  it('run again as any launch does, counted on the guest budget, and an edit makes the approved order a draft of the guest’s own', async () => {
    const guest = await openGuest()
    await captureSampleLaunches(guest)
    const fresh = await nextDay(guest, 5)
    const usage = async () =>
      (
        JSON.parse(
          (await (await guest.fetch('/app/guest-network/settings')).text())
            .match(/data-usage="([^"]*)"/)![1]
            .replace(/&quot;/g, '"')
        ) as { modelRuns: { used: number } }
      ).modelRuns.used
    const before = await usage()
    const approved = fresh.launches!.find((l) => l.name === 'Night Shift Cinema')!
    const launch = await connect(guest, `/agents/launch/guest-network/${approved.id}`)

    const order = launch.state()!.insertionOrder!
    await launch.call('editInsertionOrder', order.id, [{ show: 'The Big Picture', slots: 2, angle: 'Film talk.' }])
    expect(launch.state()!.insertionOrder).toMatchObject({ status: 'draft', edited: true, slots: 2 })
    expect(launch.state()!.insertionOrder).not.toHaveProperty('fromSample')
    expect(launch.state()!.insertionOrder).not.toHaveProperty('approvedBy')

    fakeQloo({ search })
    fakeRanking()
    fakeClaude(plan('Night Shift Cinema', 'e-0001', 'The order is drafted at $86,400.', lines))
    await launch.call('startLaunch', { name: 'Night Shift Cinema' })
    const asked = await launch.until((s) => s.run?.question?.kind === 'budget')
    await launch.call('answer', asked.run!.question!.id, { slots: 10 })
    const exclusions = await launch.until((s) => s.run?.question?.kind === 'exclusions')
    await launch.call('answer', exclusions.run!.question!.id, { exclude: [] })
    const rerun = await launch.until(ended)
    expect(rerun.run).toMatchObject({ status: 'completed' })
    expect(rerun.run).not.toHaveProperty('capturedAt')
    expect(rerun.runs.map((r) => [r.status, r.fromSample ?? false])).toEqual([
      ['completed', true],
      ['completed', false]
    ])
    expect(rerun.insertionOrder).toMatchObject({ id: 'IO-0002', status: 'draft' })
    // Its copy takes the guest network's CPM and the CPM's label as any launch's does (#333).
    expect(rerun).toMatchObject({ cpm: 20, sampleCpm: true, sample: null })
    expect(await usage()).toBe(before + 1)
  })

  it('read their CPM as the sample’s when captured at the sample CPM, those captured before the label included, and not when captured at another (#333)', async () => {
    const guest = await openGuest()
    await captureSampleLaunches(guest)
    // As an environment's rows may stand: captured before the label, and one at an owner's $25.
    const { results } = await env.DB.prepare(
      'SELECT key, chunk FROM sample_launches ORDER BY key, seq'
    ).all<SampleLaunchesRow>()
    const unlabelled = readSampleLaunches(results).map(({ key, run }) => {
      const { sampleCpm: _, ...state } = run.state
      return { key, run: { ...run, state: key === 'ranked' ? { ...state, cpm: 25 } : state } }
    })
    expect(unlabelled.map(({ key }) => key)).toEqual(['approved', 'drafted', 'ranked', 'stopped'])
    await env.DB.exec(sampleLaunchesSql(unlabelled))
    const fresh = await nextDay(guest, 5)

    const seeded = fresh.launches!.filter((l) => l.name !== 'The Watch')
    const read = await Promise.all(
      seeded.map(async ({ id, name }) => {
        const state = (await connect(guest, `/agents/launch/guest-network/${id}`)).state()!
        const html = renderToStaticMarkup(
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
        return [name, state.cpm, state.sampleCpm, sampleLabels(html), hooked(html, 'data-chart-foot').map(words)]
      })
    )
    expect(read).toEqual(
      expect.arrayContaining([
        [
          'Night Shift Cinema',
          20,
          true,
          ['h1: Night Shift Cinema'],
          ['Slot value = downloads × $20 sample CPM ÷ 1,000 · sample figures']
        ],
        [
          'Paper Moons',
          20,
          true,
          ['h1: Paper Moons'],
          ['Slot value = downloads × $20 sample CPM ÷ 1,000 · sample figures']
        ],
        ['Slow Burn', 25, false, ['h1: Slow Burn'], ['Slot value = downloads × $25 CPM ÷ 1,000 · sample figures']],
        ['Ghost Signal', 20, true, ['h1: Ghost Signal'], []]
      ])
    )
    expect(read).toHaveLength(4)
  })

  it('take no more work from a page still open once the next clearing has let go of them, changing nothing', async () => {
    const guest = await openGuest()
    await captureSampleLaunches(guest)
    const fresh = await nextDay(guest, 5)
    const page = async (name: string) => {
      const { id } = fresh.launches!.find((l) => l.name === name)!
      const launch = await connect(guest, `/agents/launch/guest-network/${id}`)
      const held = async () => (await getAgentByName(env.LaunchAgent, `guest-network:${id}`)).state
      return { launch, held, before: await held() }
    }
    const approved = await page('Night Shift Cinema')
    const drafted = await page('Paper Moons')
    const ranked = await page('Slow Burn')
    await runCron()
    const models = modelRequests().length

    // Each call closes its launch's pages, saying why, and leaves the launch as it was.
    const cleared = { code: 4410, reason: 'The guest network was cleared, as it is every day at 12:00 UTC.' }
    const order = approved.before.insertionOrder!
    void approved.launch.call('editInsertionOrder', order.id, [{ show: 'The Big Picture', slots: 2, angle: 'Film.' }])
    expect(await approved.launch.closed()).toEqual(cleared)
    expect((await approved.held()).insertionOrder).toEqual(order)
    void drafted.launch.call('approveInsertionOrder', drafted.before.insertionOrder!.id)
    expect(await drafted.launch.closed()).toEqual(cleared)
    expect((await drafted.held()).insertionOrder).toEqual(drafted.before.insertionOrder)
    void ranked.launch.call('startLaunch', { name: 'Slow Burn' })
    expect(await ranked.launch.closed()).toEqual(cleared)
    expect((await ranked.held()).runs).toEqual(ranked.before.runs)
    expect(modelRequests()).toHaveLength(models)
  })

  it('keep the API’s evidence shape, as Qloo answered, and say through the API and the MCP server that the approved order is the sample data’s', async () => {
    const guest = await openGuest()
    await captureSampleLaunches(guest)
    const fresh = await nextDay(guest, 5)
    const made = await guest.fetch('/app/guest-network/settings/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Nightly sync' })
    })
    const { secret } = await made.json<{ secret: string }>()
    const call = api(secret)
    const listed = (name: string) => fresh.launches!.find((l) => l.name === name)!.id
    const res = await call(`/api/v1/networks/guest-network/launches/${listed('Paper Moons')}/evidence`)
    expect(res.status).toBe(200)
    const { evidence } = await res.json<{ evidence: Record<string, unknown>[] }>()
    expect(evidence.length).toBeGreaterThanOrEqual(19)
    for (const record of evidence) expect(Object.keys(record)).not.toContain('fromSample')

    const approved = listed('Night Shift Cinema')
    const launch = await (
      await call(`/api/v1/networks/guest-network/launches/${approved}`)
    ).json<{
      latestRun: { insertionOrder: object }
    }>()
    expect(launch.latestRun.insertionOrder).toMatchObject({ status: 'approved', approvedBy: 'Guest', fromSample: true })
    // The MCP server's get_launch, as an assistant calls it with the same key.
    const mcp = await exports.default.fetch('https://crossfeed.test/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${secret}`
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'get_launch', arguments: { launchId: approved } }
      })
    })
    const body = await mcp.text()
    const said = body.includes('data:')
      ? body
          .split('\n')
          .find((line) => line.startsWith('data:'))!
          .slice(5)
      : body
    const { result } = JSON.parse(said) as { result: { content: { text: string }[] } }
    const text = result.content.map((c) => c.text).join('\n')
    expect(text).toContain(
      "Approved in the guest network's sample data, by Guest as its run was captured, not by a member of this network."
    )
    expect(text).not.toContain('Approved by Guest in the app')
  })

  it('that fail to seed, or that the launch cap refuses, are seeded as the guest network next starts, each once, and one deleted stays deleted', async () => {
    const guest = await openGuest()
    await captureSampleLaunches(guest)
    const failed = vi.spyOn(console, 'error')
    vi.spyOn(LaunchAgent.prototype, 'seed').mockRejectedValueOnce(new Error('The agent is overloaded.'))
    env.LAUNCHES_PER_NETWORK = '3'
    const names = (s: State) => s.launches!.map((l) => l.name).sort()

    // One fails, and with The Watch and two seeded, the cap refuses the last.
    const first = await nextDay(guest, 3)
    expect(names(first)).toContain('The Watch')
    const logged = failed.mock.calls.flat().filter((line) => String(line).includes('"event":"sample_launches_load"'))
    expect(logged).toHaveLength(2)
    expect(logged.join()).toContain('The agent is overloaded.')
    expect(logged.join()).toContain('A network keeps at most 3 launches at once.')

    env.LAUNCHES_PER_NETWORK = saved.LAUNCHES_PER_NETWORK
    const restart = async (n: number) => {
      await evictAllDurableObjects({ webSockets: 'close' })
      return (await connect(guest, '/agents/network/guest-network')).until((s) => s.launches?.length === n)
    }
    const all = await restart(5)
    expect(names(all)).toEqual(['Ghost Signal', 'Night Shift Cinema', 'Paper Moons', 'Slow Burn', 'The Watch'])
    // Each listed once, under the ID the first start gave it.
    for (const { id, name } of first.launches!) expect(all.launches!.find((l) => l.name === name)!.id).toBe(id)

    const ranked = all.launches!.find((l) => l.name === 'Slow Burn')!
    expect((await guest.fetch(`/app/guest-network/launches/${ranked.id}/delete`, { method: 'POST' })).status).toBe(200)
    // Once its wiped agent has reset.
    await readAfterReset(async () => (await getAgentByName(env.LaunchAgent, `guest-network:${ranked.id}`)).state)
    await restart(4)
    expect(names(await restart(4))).toEqual(['Ghost Signal', 'Night Shift Cinema', 'Paper Moons', 'The Watch'])
  })
})

describe("the guest network's sample launches, loaded after it started", () => {
  it('open as it next starts, beside The Watch, which it had alone', async () => {
    const guest = await openGuest()
    await captureSampleLaunches(guest)
    // As before an environment's database is loaded: the table is empty as the guest network starts.
    const { results: rows } = await env.DB.prepare('SELECT key, seq, chunk FROM sample_launches').all<{
      key: string
      seq: number
      chunk: string
    }>()
    await env.DB.exec('DELETE FROM sample_launches')
    expect((await nextDay(guest, 1)).launches!.map((l) => l.name)).toEqual(['The Watch'])

    await env.DB.batch(
      rows.map((r) =>
        env.DB.prepare('INSERT INTO sample_launches (key, seq, chunk) VALUES (?, ?, ?)').bind(r.key, r.seq, r.chunk)
      )
    )
    await evictAllDurableObjects({ webSockets: 'close' })
    const loaded = await (await connect(guest, '/agents/network/guest-network')).until((s) => s.launches?.length === 5)
    expect(loaded.launches!.map((l) => l.status).sort()).toEqual([
      'new',
      'order approved',
      'order drafted',
      'ranked',
      'stopped'
    ])
  })
})

describe('the daily cron, with the sample launches', () => {
  it('clears the guest network in 50 subrequests at most, D1 queries and Durable Object calls together, however many launches it lists, and leaves their agents to the hourly retry', async () => {
    const guest = await openGuest()
    await captureSampleLaunches(guest)
    const network = await connect(guest, '/agents/network/guest-network')
    // Guests' own launches, beside the sample's.
    for (const name of ['Late Show', 'Early Show', 'Matinee', 'Night Owl', 'Morning Run', 'Dusk'])
      await network.call('createLaunch', { name })
    // The networks guests made, the most the guest member can, one shared with a member who owns it too.
    const made: string[] = []
    for (const name of ['Night Shift Audio', 'Day Shift Audio', 'Swing Shift Audio']) {
      const { id } = await (
        await guest.fetch('/app/new', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        })
      ).json<{ id: string }>()
      made.push(id)
      const theirs = await connect(guest, `/agents/network/${id}`)
      for (const launch of ['Paper Route', 'Field Notes']) await theirs.call('createLaunch', { name: launch })
    }
    const link = await (
      await guest.fetch(`/app/${made[2]}/settings/members/invites`, { method: 'POST' })
    ).json<{ link: string }>()
    const dot = await openMember({ name: 'Dot Pruitt', invite: link.link })
    expect(
      (
        await guest.fetch(`/app/${made[2]}/settings/members/${dot.id}/role`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'owner' })
        })
      ).status
    ).toBe(200)
    // And a queue of wipes noted earlier, a full hour's retry and more.
    await env.DB.batch(
      Array.from({ length: WIPES_PER_RUN + 3 }, (_, i) =>
        env.DB.prepare('INSERT INTO wipes (binding, name, created) VALUES (?, ?, ?)').bind(
          'LaunchAgent',
          `gone-network:launch-${i}`,
          Date.now() - 2 * 60 * 60_000
        )
      )
    )
    const listed = network.state()!.launches!.map((l) => l.id)
    expect(listed).toHaveLength(11)
    const logged = vi.spyOn(console, 'log')

    const { counted, env: bindings } = counting()
    await runCron('0 12 * * *', bindings)
    // Stricter than either of the Free plan's limits (TRD crons).
    expect(counted.d1 + counted.durableObjects).toBeLessThanOrEqual(50)
    expect(logged).toHaveBeenCalledWith(JSON.stringify({ event: 'guest_network_reset', launches: 11, failed: 0 }))
    // Each launch it listed is noted for the hourly retry, which wipes the oldest WIPES_PER_RUN a run.
    const noted = (
      await env.DB.prepare("SELECT name FROM wipes WHERE binding = 'LaunchAgent'").all<{ name: string }>()
    ).results.map((r) => r.name)
    for (const id of listed) expect(noted).toContain(`guest-network:${id}`)
  })
})
