import { afterEach, describe, expect, it, vi } from 'vitest'
import type { State } from '../src/agent'
import type { Evidence } from '../src/evidence'
import { fakeClaude, fakeQloo, modelRequests, requests, text, toolUse, turn } from './fake'
import { openSession, type Session } from './session'

// Synthetic show: one exact match.
const search = { 'Night Shift Cinema': [{ entity_id: 'e-0001', name: 'Night Shift Cinema', popularity: 0.91 }] }
const resolve = (...names: string[]) => toolUse('resolve_entities', { names, type: 'urn:entity:podcast' })

const open: Session[] = []
const session = async () => {
  const s = await openSession()
  open.push(s)
  return s
}
afterEach(() => {
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

  it("refuses a session's 11th run on one UTC day, and allows it the next day", async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-17T23:00:00Z'))
    fakeQloo({ search })
    fakeClaude(Array.from({ length: 11 }, () => turn(text('Done.'))))
    const s = await session()
    for (let i = 0; i < 10; i++) {
      await s.call('startLaunch', { name: 'Night Shift Cinema' })
      await finished(s)
    }

    await expect(s.call('startLaunch', { name: 'Night Shift Cinema' })).rejects.toThrow(
      'This session has started its 10 runs for today. Runs reset at 00:00 UTC; earlier runs stay viewable.'
    )
    expect(modelRequests()).toHaveLength(10)

    vi.setSystemTime(new Date('2026-10-18T00:01:00Z'))
    await s.call('startLaunch', { name: 'Night Shift Cinema' })
    expect((await finished(s)).run?.status).toBe('completed')
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
