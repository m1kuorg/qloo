import { env } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { State } from '../src/agent'
import type { Evidence } from '../src/evidence'
import {
  fakeClaude,
  fakeInsights,
  fakeQloo,
  fakeQlooDown,
  fakeTopic,
  modelRequests,
  requests,
  text,
  toolUse,
  topicNames,
  turn
} from './fake'
import { openSession, type Session } from './session'

// Made-up IDs and scores for four of the sample's public show names; every other name finds nothing.
const search = {
  'The Rewatchables': [{ entity_id: 'e-0201', name: 'The Rewatchables', popularity: 0.7 }],
  'The Big Picture': [{ entity_id: 'e-0301', name: 'The Big Picture', popularity: 0.6 }],
  'The Watch': [{ entity_id: 'e-0601', name: 'The Watch', popularity: 0.5 }],
  'House of R': [{ entity_id: 'e-1101', name: 'House of R', popularity: 0.4 }],
  'Night Shift Cinema': [{ entity_id: 'e-0001', name: 'Night Shift Cinema', popularity: 0.9 }]
}
const ranked = [
  { entity_id: 'e-0301', name: 'The Big Picture', affinity: 0.913 },
  { entity_id: 'e-0201', name: 'The Rewatchables', affinity: 0.887 },
  { entity_id: 'e-1101', name: 'House of R', affinity: 0.861 }
]

// The sample launch run to the end: resolved, ranked, then the budget and exclusions asked and
// answered. Like Haiku live, it asks both questions in one turn first, and the second is refused.
const askExclusions = toolUse('ask_human', { question: 'Leave any shows out?', kind: 'exclusions', options: [] })
const sampleRun = [
  turn(toolUse('resolve_entities', { names: ['The Watch'], type: 'urn:entity:podcast' })),
  turn(
    toolUse('rank_candidates', {
      anchor_ids: ['e-0601'],
      candidate_ids: ['e-0201', 'e-0301', 'e-1101'],
      type: 'urn:entity:podcast'
    })
  ),
  turn(toolUse('ask_human', { question: "What's the slot budget?", kind: 'budget', options: [] }), askExclusions),
  turn(askExclusions),
  turn(text('The Big Picture leads the finalists.'))
]

// Tests run without the sample network; these turn it on, as it's deployed.
const saved = { SAMPLE_NETWORK: env.SAMPLE_NETWORK, QLOO_DAILY_CALL_CAP: env.QLOO_DAILY_CALL_CAP }
beforeEach(() => {
  env.SAMPLE_NETWORK = 'on'
})
afterEach(() => {
  Object.assign(env, saved)
  vi.useRealTimers()
})

const open: Session[] = []
const session = async () => {
  const s = await openSession()
  open.push(s)
  return s
}
afterEach(() => open.splice(0).forEach((s) => s.close()))

const settled = (s: State) => s.roster.length > 0 && s.roster.every((show) => show.resolution !== 'pending')
const ended = (s: State) => s.run !== null && !['running', 'waiting'].includes(s.run.status)

// A new visitor on the sample network, once every show's lookup has settled.
const visitor = async () => {
  const s = await session()
  await s.until(settled)
  return s
}

// Runs the sample launch to the end in a new visitor's session, answering with `slots`.
async function completeSampleRun(slots = 20) {
  fakeQloo({ search })
  fakeInsights(ranked)
  fakeClaude(sampleRun)
  const s = await visitor()
  await s.call('startLaunch', { name: 'The Watch' })
  const budget = await s.until((st) => st.run?.question?.kind === 'budget')
  await s.call('answer', budget.run!.question!.id, { slots })
  const exclusions = await s.until((st) => st.run?.question?.kind === 'exclusions')
  await s.call('answer', exclusions.run!.question!.id, { exclude: [] })
  const state = await s.until(ended)
  expect(state.run?.status).toBe('completed')
  return { session: s, state, log: await s.call<Evidence[]>('getEvidence') }
}

// Every call number the state cites, outside the session's own run list.
const cited = ({ runs: _, ...state }: State) => [...new Set(JSON.stringify(state).match(/\bC-\d+\b/g))]

describe('replaying the sample run', () => {
  it('replays the stored sample run, labelled, when a Qloo call has failed after its retries', async () => {
    const stored = await completeSampleRun()

    fakeQlooDown()
    const judge = await visitor() // the sample network comes from the gateway's cache
    const comp = await judge.searchComps('The Zach Lowe Show', 'The Lowe Post')
    expect(comp.roster.find((s) => s.name === 'The Zach Lowe Show')?.compSearch?.error).toContain('after 2 retries')
    const sent = requests.length

    await judge.call('startLaunch', { name: 'The Watch' })
    const state = judge.state()!

    // No Qloo call and no model call: the stored run is shown as it ended, answers included.
    expect(requests).toHaveLength(sent)
    expect(state.run).toMatchObject({
      status: 'completed',
      replayed: expect.stringContaining('Qloo returned 503: fake failure, after 2 retries'),
      notes: stored.state.run!.notes,
      budget: { slots: 20 },
      exclusions: [],
      question: null,
      error: null
    })
    expect(state.run!.id).not.toBe(stored.state.run!.id)
    expect(state.runs).toEqual([
      { id: state.run!.id, launch: 'The Watch', status: 'completed', startedAt: expect.any(String), replayed: true }
    ])
    expect(state.ranking?.rows).toEqual(stored.state.ranking?.rows)
    expect(state.topic).toEqual(stored.state.topic)
    expect(state.topic?.status).toBe('ranked')
    expect(state.roster.map((s) => [s.name, s.resolution, s.entity])).toEqual(
      stored.state.roster.map((s) => [s.name, s.resolution, s.entity])
    )

    // Every call it cites is in this session's log, labelled replayed, as Qloo answered the stored run.
    const log = await judge.call<Evidence[]>('getEvidence')
    const replayed = cited(state).map((call) => log.find((e) => e.call === call))
    expect(replayed).toHaveLength(cited(stored.state).length)
    expect(replayed.every((e) => e?.replayed === true)).toBe(true)
    const ranking = log.find((e) => e.call === state.ranking?.call)
    const original = stored.log.find((e) => e.call === stored.state.ranking?.call)
    expect(ranking).toEqual({ ...original, call: state.ranking?.call, run: state.run!.id, replayed: true })
    expect(log.find((e) => e.call === state.launch?.match?.evidence)?.params).toMatchObject({ query: 'The Watch' })

    // An earlier run's view keeps the label.
    expect((await judge.call<State>('getRun', state.run!.id)).run?.replayed).toBe(state.run!.replayed)
    expect(requests).toHaveLength(sent)
  })

  it("replays the sample launch once the daily cap is reached, and stops a run on a visitor's own roster", async () => {
    await completeSampleRun()
    const own = await visitor()
    await own.importRoster('Night Shift Cinema')
    env.QLOO_DAILY_CALL_CAP = '0'
    const judge = await visitor()
    const sent = requests.length

    await judge.call('startLaunch', { name: 'The Watch' })
    expect(judge.state()?.run).toMatchObject({
      status: 'completed',
      replayed: 'The daily cap of 0 Qloo calls is reached; it resets at 00:00 UTC',
      budget: { slots: 20 }
    })

    await own.call('startLaunch', { name: 'Night Shift Cinema' })
    expect(own.state()?.run).toMatchObject({
      status: 'stopped',
      notes: [],
      error:
        'The daily cap of 0 Qloo calls is reached; it resets at 00:00 UTC, so runs on your own data wait until Qloo answers again. Only the sample launch, on the unchanged sample network, replays its stored run.'
    })
    expect(own.state()?.run?.replayed).toBeUndefined()
    expect(own.state()?.ranking).toBeNull()
    expect(own.state()?.topic).toBeNull()
    await own.call('getEvidence')
    expect(requests).toHaveLength(sent)
  })

  it('keeps only a sample run answered with the sample answers, and replays only the unchanged sample', async () => {
    await completeSampleRun(10)
    env.QLOO_DAILY_CALL_CAP = '0'
    const judge = await visitor()
    await judge.call('startLaunch', { name: 'The Watch' })
    expect(judge.state()?.run).toMatchObject({
      status: 'stopped',
      error: expect.stringContaining('and no sample run is stored to replay yet')
    })

    env.QLOO_DAILY_CALL_CAP = saved.QLOO_DAILY_CALL_CAP
    await completeSampleRun(20)
    env.QLOO_DAILY_CALL_CAP = '0'
    const edited = await visitor()
    await edited.call('updateShow', 'The Watch', { downloads: 12_345 })
    await edited.call('startLaunch', { name: 'The Watch' })
    expect(edited.state()?.run).toMatchObject({
      status: 'stopped',
      error: expect.stringContaining('so runs on your own data wait until Qloo answers again')
    })
    const otherLaunch = await visitor()
    await otherLaunch.call('startLaunch', { name: 'The Big Picture' })
    expect(otherLaunch.state()?.run?.status).toBe('stopped')
  })

  it('keeps the sample run again with its topic baseline when that lands after the run ended', async () => {
    const held = Promise.withResolvers<void>()
    fakeTopic(async (request) => {
      await held.promise
      return topicNames(request)
    })
    const stored = await completeSampleRun()
    expect(stored.state.topic?.status).toBe('ranking')
    held.resolve()
    const landed = await stored.session.until((s) => s.topic?.status === 'ranked')

    env.QLOO_DAILY_CALL_CAP = '0'
    const judge = await visitor()
    await judge.call('startLaunch', { name: 'The Watch' })
    expect(judge.state()?.run?.replayed).toBeDefined()
    expect(judge.state()?.topic).toEqual(landed.topic)
  })

  it('runs the sample launch live while Qloo answers, once it answers again, or once a failure is five minutes old', async () => {
    await completeSampleRun()
    const judge = await visitor()
    fakeClaude([turn(text('Live.')), turn(text('Live again.')), turn(text('Live once more.'))])
    const asked = modelRequests().length
    const runsLive = async (n: number) => {
      await judge.call('startLaunch', { name: 'The Watch' })
      expect((await judge.until(ended)).run).toMatchObject({ status: 'completed', notes: [] })
      expect(judge.state()?.run?.replayed).toBeUndefined()
      expect(modelRequests()).toHaveLength(asked + n)
    }
    await runsLive(1)

    fakeQlooDown()
    await judge.searchComps('The Zach Lowe Show', 'The Lowe Post')
    fakeQloo({ search })
    await judge.searchComps('The Zach Lowe Show', 'The Lowe Post')
    await runsLive(2)

    fakeQlooDown()
    await judge.searchComps('The Zach Lowe Show', 'Lowe Post')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 5 * 60_000)
    await runsLive(3)
  })
})
