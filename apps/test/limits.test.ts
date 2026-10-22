import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { State } from '../src/agent'
import type { Evidence } from '../src/evidence'
import { fakeClaude, fakeQloo, modelRequests, requests, text, toolUse, turn } from './fake'
import { openSession, type Session } from './session'

// Synthetic show: one exact match.
const search = { 'Night Shift Cinema': [{ entity_id: 'e-0001', name: 'Night Shift Cinema', popularity: 0.91 }] }
const resolve = (...names: string[]) => toolUse('resolve_entities', { names, type: 'urn:entity:podcast' })

// A visitor's address, as Cloudflare's edge sends it.
const visitorA = '203.0.113.7'

const open: Session[] = []
const session = async (ip?: string) => {
  const s = await openSession(undefined, ip)
  open.push(s)
  return s
}
const saved = {
  RUN_VISITOR_DAILY_CAP: env.RUN_VISITOR_DAILY_CAP,
  FREE_START_DAILY_CAP: env.FREE_START_DAILY_CAP,
  QLOO_DAILY_CALL_CAP: env.QLOO_DAILY_CALL_CAP,
  QLOO_VISITOR_DAILY_CALL_CAP: env.QLOO_VISITOR_DAILY_CALL_CAP,
  SAMPLE_NETWORK: env.SAMPLE_NETWORK
}
afterEach(() => {
  Object.assign(env, saved)
  open.splice(0).forEach((s) => s.close())
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// Records the agent's structured log lines from here on, as Workers Logs would show them.
const watchLogs = () => {
  const log = vi.spyOn(console, 'log')
  return () =>
    log.mock.calls.flatMap(([line]) => {
      const parsed = typeof line === 'string' && line.startsWith('{') ? JSON.parse(line) : null
      return parsed?.event === 'model_call' || parsed?.event === 'run_summary' ? [parsed] : []
    })
}

const finished = (s: Session) => s.until((state) => state.run !== null && state.run.status !== 'running')

describe('a run at its limits', () => {
  it('cuts off a model that never stops after 12 turns, and says what it had not done', async () => {
    const logged = watchLogs()
    fakeQloo({ search })
    // Every turn asks for another lookup, so only the turn limit ends the run.
    fakeClaude(Array.from({ length: 13 }, (_, i) => turn(resolve(i === 11 ? 'Deep Cuts' : 'Night Shift Cinema'))))
    const s = await session()
    await s.call('startLaunch', { name: 'Night Shift Cinema' })

    const { run } = await finished(s)
    expect(modelRequests()).toHaveLength(12)
    expect(run?.status).toBe('stopped')
    expect(run?.error).toBe(
      'Stopped at the limit of 12 Claude turns per run, before Claude finished, so this plan is incomplete. Not run: Resolving Deep Cuts.'
    )
    expect(run?.notes).toHaveLength(11)
    expect(run?.notes.every((n) => n.status === 'done')).toBe(true)
    expect(logged().filter((l) => l.event === 'run_summary')).toMatchObject([
      { outcome: 'stopped', turns: 12, qlooCalls: 11 }
    ])
  })

  it('stops a run before its 61st Qloo call', async () => {
    fakeQloo({ search })
    const shows = (from: number, n: number) => Array.from({ length: n }, (_, i) => `Show ${from + i}`)
    fakeClaude([
      turn(resolve(...shows(1, 40))),
      turn(resolve(...shows(41, 20))),
      turn(resolve('Deep Cuts')),
      turn(text('Done.'))
    ])
    const s = await session()
    await s.call('startLaunch', { name: 'Night Shift Cinema' })

    const { run } = await finished(s)
    expect(requests.filter((r) => r.url.pathname === '/search')).toHaveLength(60)
    expect(await s.call<Evidence[]>('getEvidence')).toHaveLength(60)
    expect(modelRequests()).toHaveLength(3)
    expect(run?.status).toBe('stopped')
    expect(run?.error).toBe(
      'Stopped at the limit of 60 Qloo calls per run, before Claude finished, so this plan is incomplete. Cut off: Resolving Deep Cuts.'
    )
    expect(run?.notes.map((n) => n.status)).toEqual(['done', 'done', 'failed'])
  })

  it("stops a visitor's 11th model run of the UTC day across sessions, while another visitor still runs", async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-17T23:00:00Z'))
    fakeQloo({ search })
    fakeClaude(Array.from({ length: 12 }, () => turn(text('Done.'))))
    // One visitor in two browsers: two session cookies, one address.
    const [first, second] = [await session(visitorA), await session(visitorA)]
    for (let i = 0; i < 10; i++) {
      const s = i % 2 ? second : first
      await s.call('startLaunch', { name: 'Night Shift Cinema' })
      expect((await finished(s)).run?.status).toBe('completed')
    }

    await first.call('startLaunch', { name: 'Night Shift Cinema' })
    expect((await finished(first)).run).toMatchObject({
      status: 'stopped',
      notes: [],
      error:
        "You've started 10 model runs today, the most one visitor can start in a UTC day; they reset at 00:00 UTC, so runs on your own data wait until then. Only the sample launch, on the unchanged sample network, replays its stored run."
    })
    expect(modelRequests()).toHaveLength(10)

    const other = await session('198.51.100.4')
    await other.call('startLaunch', { name: 'Night Shift Cinema' })
    expect((await finished(other)).run?.status).toBe('completed')

    vi.setSystemTime(new Date('2026-10-18T00:01:00Z'))
    await second.call('startLaunch', { name: 'Night Shift Cinema' })
    expect((await finished(second)).run?.status).toBe('completed')
    expect(modelRequests()).toHaveLength(12)
  })

  it('counts a double-clicked start once', async () => {
    // The runs count against a UTC day, so the test keeps to one, whenever it runs.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-17T12:00:00Z'))
    env.RUN_VISITOR_DAILY_CAP = '2'
    fakeQloo({ search })
    // The first run's turn waits until both clicks are answered, so the second click finds that run
    // starting or running however late it reaches the agent. Answered at once, the run could end
    // before a click slowed by a loaded machine arrived, and that click would start a run of its own.
    const answered = Promise.withResolvers<void>()
    fakeClaude([() => answered.promise.then(() => turn(text('Done.'))), turn(text('Done.'))])
    const s = await session(visitorA)
    const clicks = await Promise.allSettled([
      s.call('startLaunch', { name: 'Night Shift Cinema' }),
      s.call('startLaunch', { name: 'Night Shift Cinema' })
    ])
    answered.resolve()
    // What each click got and how each run stands, for any assertion that fails.
    const outcomes = () =>
      JSON.stringify({
        clicks: clicks.map((c) => (c.status === 'fulfilled' ? c.value : String(c.reason))),
        runs: s.state()?.runs.map((r) => r.status),
        error: s.state()?.run?.error
      })
    expect(clicks.map((c) => c.status).sort(), outcomes()).toEqual(['fulfilled', 'rejected'])
    expect((await finished(s)).run?.status, outcomes()).toBe('completed')

    // The second model run of the day is still there, and then the limit is reached.
    await s.call('startLaunch', { name: 'Night Shift Cinema' })
    expect((await finished(s)).run?.status, outcomes()).toBe('completed')
    await s.call('startLaunch', { name: 'Night Shift Cinema' })
    expect((await finished(s)).run, outcomes()).toMatchObject({
      status: 'stopped',
      error: expect.stringMatching(/^You've started 2 model runs today, /)
    })
  })

  it("refuses a visitor's start once the day's free starts are used, and keeps no run of it", async () => {
    env.FREE_START_DAILY_CAP = '2'
    fakeQloo({ search })
    fakeClaude([turn(text('Done.'))])
    const s = await session(visitorA)
    // A model run isn't a free start.
    await s.call('startLaunch', { name: 'Night Shift Cinema' })
    expect((await finished(s)).run?.status).toBe('completed')

    env.QLOO_DAILY_CALL_CAP = '0' // so every start stops at once, without a model call
    for (let i = 0; i < 2; i++) {
      await s.call('startLaunch', { name: 'Night Shift Cinema' })
      expect(s.state()?.run?.status).toBe('stopped')
    }
    await expect(s.call('startLaunch', { name: 'Night Shift Cinema' })).rejects.toThrow(
      "You've started 2 runs today that replayed or stopped at once, the most one visitor can start in a UTC day; they reset at 00:00 UTC."
    )
    expect(s.state()?.runs).toHaveLength(3)
    expect(s.state()?.run?.status).toBe('stopped')

    const other = await session('198.51.100.4')
    await other.call('startLaunch', { name: 'Night Shift Cinema' })
    expect(other.state()?.run?.status).toBe('stopped')
    expect(modelRequests()).toHaveLength(1)
  })

  it("refuses an import or a comp search past the visitor's Qloo calls for the day, and keeps nothing of it", async () => {
    env.QLOO_VISITOR_DAILY_CALL_CAP = '3'
    fakeQloo({ search })
    const s = await session(visitorA)
    await s.importRoster('Night Shift Cinema\nDeep Cuts')
    await s.searchComps('Deep Cuts', 'Night Shift')

    const limit =
      'This would take you past 3 Qloo calls today, the most one visitor can make in a UTC day, cache hits included; they reset at 00:00 UTC.'
    await expect(s.call('importRoster', 'Night Shift Cinema')).rejects.toThrow(limit)
    await expect(s.call('searchComps', 'Deep Cuts', 'Night Shift')).rejects.toThrow(limit)
    expect(s.state()?.roster.map((show) => [show.name, show.resolution, show.compSearch?.call])).toEqual([
      ['Night Shift Cinema', 'resolved', undefined],
      ['Deep Cuts', 'missed', 'C-03']
    ])
    expect(await s.call<Evidence[]>('getEvidence')).toHaveLength(3)

    // Nothing was numbered either: the next call allowed is C-04.
    env.QLOO_VISITOR_DAILY_CALL_CAP = '4'
    await s.searchComps('Deep Cuts', 'Night Shift')
    expect(s.state()?.roster[1].compSearch?.call).toBe('C-04')

    const other = await session('198.51.100.4')
    await other.importRoster('Night Shift Cinema\nDeep Cuts')
    expect(other.state()?.roster).toHaveLength(2)
  })

  it("counts a run's Qloo calls among the visitor's calls for the day", async () => {
    env.QLOO_VISITOR_DAILY_CALL_CAP = '3'
    fakeQloo({ search })
    fakeClaude([turn(resolve('Night Shift Cinema')), turn(text('Resolved.'))])
    const s = await session(visitorA)
    await s.importRoster('Night Shift Cinema')
    await s.call('startLaunch', { name: 'Night Shift Cinema' })
    expect((await finished(s)).run?.status).toBe('completed')

    await expect(s.call('importRoster', 'Night Shift Cinema\nDeep Cuts')).rejects.toThrow(
      'This would take you past 3 Qloo calls today'
    )
    await s.importRoster('Deep Cuts')
    expect(s.state()?.roster.map((show) => show.name)).toEqual(['Deep Cuts'])
  })

  it("counts a new session's look-up of the sample network, and opens one past the limit empty", async () => {
    env.SAMPLE_NETWORK = 'on'
    env.QLOO_VISITOR_DAILY_CALL_CAP = '20'
    fakeQloo({ search })
    const first = await session(visitorA)
    expect((await first.until((st) => st.roster.every((show) => show.resolution !== 'pending'))).roster).toHaveLength(
      19
    )

    const second = await session(visitorA)
    expect(second.state()?.roster).toEqual([])
    expect(second.state()?.sample).toBeNull()
    const other = await session('198.51.100.4')
    expect(other.state()?.roster).toHaveLength(19)
  })

  it('counts the addresses in one IPv6 /64 as one visitor', async () => {
    env.RUN_VISITOR_DAILY_CAP = '1'
    fakeQloo({ search })
    fakeClaude([turn(text('Done.')), turn(text('Done.'))])
    const run = async (ip: string) => {
      const s = await session(ip)
      await s.call('startLaunch', { name: 'Night Shift Cinema' })
      return (await finished(s)).run?.status
    }
    expect(await run('2001:db8:1:2::a')).toBe('completed')
    expect(await run('2001:db8:1:2:ffff:1:2:3')).toBe('stopped')
    expect(await run('2001:db8:1:3::a')).toBe('completed')
  })

  it("starts a new run on a re-run, and keeps the earlier run's results viewable", async () => {
    fakeQloo({ search: { ...search, 'Deep Cuts': [{ entity_id: 'e-0101', name: 'Deep Cuts', popularity: 0.5 }] } })
    fakeClaude([turn(resolve('Night Shift Cinema')), turn(text('Resolved.')), turn(text('Done again.'))])
    const s = await session()
    await s.importRoster('Deep Cuts')
    await s.call('setCpm', 20)
    const first = await s.call<{ runId: string }>('startLaunch', { name: 'Night Shift Cinema' })
    const ran = await finished(s)

    // Change the plan's inputs, then run the launch again.
    await s.call('setCpm', 25)
    await s.call('updateShow', 'Deep Cuts', { excluded: true })
    const second = await s.call<{ runId: string }>('startLaunch', { name: 'Night Shift Cinema' })
    const state = await finished(s)

    expect(second.runId).not.toBe(first.runId)
    expect(state.run).toMatchObject({ id: second.runId, status: 'completed', notes: [] })
    expect(state.runs).toEqual([
      { id: first.runId, launch: 'Night Shift Cinema', status: 'completed', startedAt: expect.any(String) },
      { id: second.runId, launch: 'Night Shift Cinema', status: 'completed', startedAt: expect.any(String) }
    ])
    const earlier = await s.call<State>('getRun', first.runId)
    expect(earlier).toMatchObject({ cpm: 20, launch: ran.launch, run: ran.run })
    expect(earlier.run?.notes).toEqual([{ text: 'Resolving Night Shift Cinema', status: 'done' }])
    expect(earlier.roster.map((show) => [show.name, show.excluded])).toEqual([['Deep Cuts', false]])
    await expect(s.call('getRun', 'no-such-run')).rejects.toThrow('This session has no run with that ID.')
  })

  it('logs each model call with its tokens and cache reads, and one summary line per run', async () => {
    const logged = watchLogs()
    fakeQloo({ search: { ...search, 'Deep Cuts': [{ entity_id: 'e-0101', name: 'Deep Cuts', popularity: 0.5 }] } })
    fakeClaude([turn(resolve('Night Shift Cinema', 'Deep Cuts')), turn(text('Resolved both.'))])
    const s = await session()
    await s.importRoster('Night Shift Cinema') // so the run's first search is a cache hit
    const { runId } = await s.call<{ runId: string }>('startLaunch', { name: 'Night Shift Cinema' })
    await finished(s)

    expect(logged()).toEqual([
      {
        event: 'model_call',
        run: runId,
        turn: 1,
        stopReason: 'tool_use',
        inputTokens: 100,
        outputTokens: 20,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 900,
        latencyMs: expect.any(Number)
      },
      {
        event: 'model_call',
        run: runId,
        turn: 2,
        stopReason: 'end_turn',
        inputTokens: 100,
        outputTokens: 20,
        cacheReadInputTokens: 900,
        cacheCreationInputTokens: 0,
        latencyMs: expect.any(Number)
      },
      {
        event: 'run_summary',
        run: runId,
        outcome: 'completed',
        turns: 2,
        qlooCalls: 2,
        cacheHits: 1,
        wallMs: expect.any(Number)
      }
    ])
  })

  it('logs a run paused on a question as paused, then as it ends', async () => {
    const logged = watchLogs()
    fakeQloo({ search })
    const ask = toolUse('ask_human', { question: 'What is the slot budget?', kind: 'budget', options: [] })
    fakeClaude([turn(ask), turn(text('Budget noted.'))])
    const s = await session()
    const { runId } = await s.call<{ runId: string }>('startLaunch', { name: 'Night Shift Cinema' })
    await s.until((state) => state.run?.status === 'waiting')
    await s.call('answer', 'toolu_1_1', { slots: 20 })
    await finished(s)

    expect(logged().filter((l) => l.event === 'run_summary')).toMatchObject([
      { run: runId, outcome: 'paused', turns: 1 },
      { run: runId, outcome: 'completed', turns: 2 }
    ])
  })
})
