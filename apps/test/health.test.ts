import { createExecutionContext, createScheduledController, waitOnExecutionContext } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index'
import type { State } from '../src/agent'
import { fakeClaude, fakeInsights, fakeQloo, requests, text, toolUse, turn } from './fake'
import { openSession, type Session } from './session'

// Runs the Worker's scheduled handler as Cloudflare does at the daily cron in wrangler.jsonc, or the one
// `cron` names, and waits for everything it started.
async function runCron(cron = '0 12 * * *') {
  const handler: ExportedHandler<Env> = worker
  const ctx = createExecutionContext()
  await handler.scheduled!(createScheduledController({ cron }), env, ctx)
  await waitOnExecutionContext(ctx)
}

// The health check's log lines from here on, as Workers Logs would show them, with their level.
const watchLogs = () => {
  const info = vi.spyOn(console, 'log')
  const error = vi.spyOn(console, 'error')
  const lines = (level: 'info' | 'error', calls: unknown[][]) =>
    calls.flatMap(([line]) => {
      const parsed = typeof line === 'string' && line.startsWith('{') ? JSON.parse(line) : null
      return parsed?.event === 'health_check' ? [{ level, ...parsed }] : []
    })
  return () => [...lines('info', info.mock.calls), ...lines('error', error.mock.calls)]
}
afterEach(() => vi.restoreAllMocks())

// The health-check search's answer, a made-up result.
const rewatchables = [{ entity_id: 'e-0701', name: 'The Rewatchables', popularity: 0.7 }]

// Made-up IDs for four of the sample network's public show names; every other name finds nothing.
const sampleSearch = {
  'The Bill Simmons Podcast': [{ entity_id: 'e-0711', name: 'The Bill Simmons Podcast', popularity: 0.9 }],
  'The Rewatchables': rewatchables,
  'The Big Picture': [{ entity_id: 'e-0712', name: 'The Big Picture', popularity: 0.6 }],
  'The Watch': [{ entity_id: 'e-0713', name: 'The Watch', popularity: 0.5 }]
}
// Made-up scores for the shows other than The Watch.
const sampleRanking = [
  { entity_id: 'e-0712', name: 'The Big Picture', affinity: 0.734 },
  { entity_id: 'e-0711', name: 'The Bill Simmons Podcast', affinity: 0.721 },
  { entity_id: 'e-0701', name: 'The Rewatchables', affinity: 0.708 }
]

// A judge's visit: a new session opens on the sample network, which caches its searches. With
// `start`, the judge starts the sample launch as prefilled, settling nothing, and the model
// resolves the launch and ranks the roster.
async function visitSample({ start }: { start: boolean }) {
  const saved = env.SAMPLE_NETWORK
  env.SAMPLE_NETWORK = 'on'
  try {
    const s = await openSession()
    await s.until((state) => state.roster.length > 0 && state.roster.every((r) => r.resolution !== 'pending'))
    if (start) await runSampleLaunch(s)
    s.close()
  } finally {
    env.SAMPLE_NETWORK = saved
  }
}

async function runSampleLaunch(s: Session) {
  fakeClaude([
    turn(toolUse('resolve_entities', { names: ['The Watch'], type: 'urn:entity:podcast' })),
    turn(
      toolUse('rank_candidates', {
        anchor_ids: ['e-0713'],
        candidate_ids: ['e-0711', 'e-0701', 'e-0712'],
        type: 'urn:entity:podcast'
      })
    ),
    turn(text('Ranked.'))
  ])
  await s.call('startLaunch', { name: 'The Watch' })
  const done = await s.until((state: State) => state.run?.status === 'completed')
  expect(done.ranking?.rows.map((r) => r.show)).toEqual([
    'The Big Picture',
    'The Bill Simmons Podcast',
    'The Rewatchables'
  ])
}

describe('the daily health check', () => {
  it('logs success when Qloo answers the health-check search', async () => {
    const logged = watchLogs()
    fakeQloo({ search: { 'The Rewatchables': rewatchables } })

    await runCron()
    expect(logged().filter((l) => l.check === 'qloo_search')).toEqual([
      { level: 'info', event: 'health_check', check: 'qloo_search', ok: true }
    ])
  })

  it.each([401, 500])('logs a failure naming the search check when Qloo answers %i', async (status) => {
    const logged = watchLogs()
    fakeQloo({ search: { 'The Rewatchables': status } })

    await runCron()
    expect(logged().filter((l) => l.check === 'qloo_search')).toEqual([
      {
        level: 'error',
        event: 'health_check',
        check: 'qloo_search',
        ok: false,
        error: `Qloo returned ${status}: fake failure`
      }
    ])
  })

  it('runs at the daily cron alone, not the hourly one', async () => {
    const logged = watchLogs()
    fakeQloo({ search: { 'The Rewatchables': rewatchables } })

    await runCron('0 0-11,13-23 * * *')
    expect(logged()).toEqual([])
    expect(requests).toEqual([])
  })

  it('asks Qloo every day instead of answering from the cache', async () => {
    fakeQloo({ search: { 'The Rewatchables': rewatchables } })

    await runCron()
    await runCron()
    const searches = requests.filter((r) => r.url.pathname === '/search')
    expect(searches.map((r) => Object.fromEntries(r.url.searchParams))).toEqual([
      { query: 'The Rewatchables', types: 'urn:entity:podcast', take: '1' },
      { query: 'The Rewatchables', types: 'urn:entity:podcast', take: '1' }
    ])
  })

  it('logs a failure naming the cache check when no visit has looked up the sample network', async () => {
    const logged = watchLogs()
    fakeQloo({ search: { 'The Rewatchables': rewatchables } })

    await runCron()
    const [line, ...more] = logged().filter((l) => l.check === 'sample_ranking_cached')
    expect(more).toEqual([])
    expect(line).toMatchObject({ level: 'error', event: 'health_check', check: 'sample_ranking_cached', ok: false })
    expect(line.error).toMatch(
      /^The sample network's searches aren't cached for: The Watch, The Bill Simmons Podcast, /
    )
    // Only the health-check search reached Qloo: the cache check never fills the cache itself.
    expect(requests.map((r) => r.url.searchParams.get('query'))).toEqual(['The Rewatchables'])
  })

  it('logs a failure naming the cache check when the sample launch has never been ranked', async () => {
    fakeQloo({ search: sampleSearch })
    await visitSample({ start: false })
    const before = requests.length

    const logged = watchLogs()
    await runCron()
    expect(logged().filter((l) => l.check === 'sample_ranking_cached')).toEqual([
      {
        level: 'error',
        event: 'health_check',
        check: 'sample_ranking_cached',
        ok: false,
        error: "The sample launch's ranking (The Watch against 3 shows): Not in the cache"
      }
    ])
    expect(requests.slice(before).map((r) => r.url.pathname)).toEqual(['/search'])
  })

  it('logs success once a visit to the sample network has ranked the sample launch, without asking Qloo again', async () => {
    fakeQloo({ search: sampleSearch })
    fakeInsights(sampleRanking)
    await visitSample({ start: true })
    const before = requests.length

    const logged = watchLogs()
    await runCron()
    expect(logged().filter((l) => l.check === 'sample_ranking_cached')).toEqual([
      { level: 'info', event: 'health_check', check: 'sample_ranking_cached', ok: true }
    ])
    expect(requests.slice(before).map((r) => r.url.searchParams.get('query'))).toEqual(['The Rewatchables'])
  })
})
