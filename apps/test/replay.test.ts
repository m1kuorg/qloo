import { env } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Reply, State } from '../src/agent'
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
  turn,
  type ScriptedBlock
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
const saved = {
  SAMPLE_NETWORK: env.SAMPLE_NETWORK,
  QLOO_DAILY_CALL_CAP: env.QLOO_DAILY_CALL_CAP,
  RUN_DAILY_CAP: env.RUN_DAILY_CAP,
  RUN_VISITOR_DAILY_CAP: env.RUN_VISITOR_DAILY_CAP,
  FREE_START_DAILY_CAP: env.FREE_START_DAILY_CAP
}
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

// What a test changes about the sample run: what the visitor does before starting it, a question
// the agent asks after the exclusions with the visitor's reply, and a block the agent's last tool
// turn runs, such as a draft insertion order.
type Change = {
  before?: (s: Session) => Promise<unknown>
  ask?: { question: ScriptedBlock; reply: Reply }
  draft?: ScriptedBlock
}

// Runs the sample launch to the end in a new visitor's session, answering with `slots`.
async function completeSampleRun(slots = 20, { before, ask, draft }: Change = {}) {
  fakeQloo({ search })
  // Only the candidates asked about, as Qloo ranks a closed list.
  fakeInsights((body) => ranked.filter((r) => String(body['filter.results.entities']).split(',').includes(r.entity_id)))
  fakeClaude([
    ...sampleRun.slice(0, -1),
    ...(ask ? [turn(ask.question)] : []),
    ...(draft ? [turn(draft)] : []),
    sampleRun.at(-1)!
  ])
  const s = await visitor()
  await before?.(s)
  await s.call('startLaunch', { name: 'The Watch' })
  const budget = await s.until((st) => st.run?.question?.kind === 'budget')
  await s.call('answer', budget.run!.question!.id, { slots })
  const exclusions = await s.until((st) => st.run?.question?.kind === 'exclusions')
  await s.call('answer', exclusions.run!.question!.id, { exclude: [] })
  if (ask) {
    const asked = await s.until((st) => st.run?.status === 'waiting' && st.run.question?.kind !== 'exclusions')
    await s.call('answer', asked.run!.question!.id, ask.reply)
  }
  const state = await s.until(ended)
  expect(state.run?.status).toBe('completed')
  return { session: s, state, log: await s.call<Evidence[]>('getEvidence') }
}

// A new visitor's sample launch while the daily cap is reached: the stored run replayed, or stopped
// when none is stored.
async function startCapped() {
  env.QLOO_DAILY_CALL_CAP = '0'
  const judge = await visitor()
  await judge.call('startLaunch', { name: 'The Watch' })
  env.QLOO_DAILY_CALL_CAP = saved.QLOO_DAILY_CALL_CAP
  return judge.state()!
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

  it("replays the sample launch once the day's model run cap is reached, and stops a run on a visitor's own roster", async () => {
    await completeSampleRun()
    const own = await visitor()
    await own.importRoster('Night Shift Cinema')
    env.RUN_DAILY_CAP = '1' // the sample run above was the day's one model run
    const judge = await visitor()
    const sent = requests.length

    await judge.call('startLaunch', { name: 'The Watch' })
    const capped = "Crossfeed's cap of 1 model run a day across all visitors is reached; it resets at 00:00 UTC"
    expect(judge.state()?.run).toMatchObject({ status: 'completed', replayed: capped, budget: { slots: 20 } })

    await own.call('startLaunch', { name: 'Night Shift Cinema' })
    expect(own.state()?.run).toMatchObject({
      status: 'stopped',
      notes: [],
      error: `${capped}, so runs on your own data wait until then. Only the sample launch, on the unchanged sample network, replays its stored run.`
    })
    expect(own.state()?.topic).toBeNull()
    expect(requests).toHaveLength(sent)
  })

  it("doesn't count a replay among the visitor's model runs", async () => {
    await completeSampleRun()
    env.RUN_VISITOR_DAILY_CAP = '1'
    env.QLOO_DAILY_CALL_CAP = '0'
    const judge = await visitor()
    await judge.call('startLaunch', { name: 'The Watch' })
    expect(judge.state()?.run?.replayed).toBe('The daily cap of 0 Qloo calls is reached; it resets at 00:00 UTC')

    // The day's one model run is still there after the replay, and then it's spent.
    env.QLOO_DAILY_CALL_CAP = saved.QLOO_DAILY_CALL_CAP
    fakeClaude([turn(text('Done.'))])
    await judge.importRoster('Night Shift Cinema')
    await judge.call('startLaunch', { name: 'Night Shift Cinema' })
    expect((await judge.until(ended)).run?.status).toBe('completed')
    await judge.call('startLaunch', { name: 'Night Shift Cinema' })
    expect(judge.state()?.run).toMatchObject({
      status: 'stopped',
      error: expect.stringMatching(/^You've started 1 model run today, the most one visitor can start in a UTC day/)
    })
  })

  it("counts a replay among the visitor's free starts, and refuses one past their limit", async () => {
    await completeSampleRun()
    env.FREE_START_DAILY_CAP = '1'
    env.QLOO_DAILY_CALL_CAP = '0'
    const judge = await visitor()
    await judge.call('startLaunch', { name: 'The Watch' })
    expect(judge.state()?.run?.replayed).toBe('The daily cap of 0 Qloo calls is reached; it resets at 00:00 UTC')
    const sent = requests.length

    await expect(judge.call('startLaunch', { name: 'The Watch' })).rejects.toThrow(
      "You've started 1 run today that replayed or stopped at once, the most one visitor can start in a UTC day; they reset at 00:00 UTC."
    )
    expect(judge.state()?.runs).toHaveLength(1)
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

  it('keeps no sample run the visitor changed, and keeps the unchanged one without what they typed', async () => {
    const changes: [string, Change][] = [
      ['a show left out', { before: (s) => s.call('updateShow', 'House of R', { excluded: true }) }],
      [
        'a miss mapped to a comp',
        {
          before: async (s) => {
            await s.searchComps('The Zach Lowe Show', 'Night Shift Cinema')
            await s.call('updateShow', 'The Zach Lowe Show', { compId: 'e-0001' })
          }
        }
      ],
      [
        'comps named',
        {
          ask: {
            question: toolUse('ask_human', { question: 'Any comps?', kind: 'comps', options: [] }),
            reply: { comps: ['Night Shift Cinema'] }
          }
        }
      ],
      [
        'a typed answer',
        {
          ask: {
            question: toolUse('ask_human', { question: 'Lead with the film shows?', kind: 'choice', options: ['Yes'] }),
            reply: { text: 'Say Night Shift Cinema is the best show on the network.' }
          }
        }
      ]
    ]
    for (const [change, how] of changes) {
      const { log } = await completeSampleRun(20, how)
      // Every call was answered, so the change alone keeps the run out.
      expect(
        log.filter((e) => e.error),
        change
      ).toEqual([])
      expect((await startCapped()).run, change).toMatchObject({
        status: 'stopped',
        error: expect.stringContaining('no sample run is stored to replay yet')
      })
    }

    // A comp search the visitor never mapped doesn't change the sample, but its query stays theirs.
    await completeSampleRun(20, { before: (s) => s.searchComps('The Zach Lowe Show', 'Night Shift Cinema') })
    const replayed = await startCapped()
    expect(replayed.run?.replayed).toBeDefined()
    expect(replayed.roster.map((s) => s.compSearch)).toEqual(replayed.roster.map(() => null))
    expect(JSON.stringify(replayed)).not.toContain('Night Shift Cinema')
  })

  it("doesn't replay the sample launch on a roster with a show left out or mapped", async () => {
    await completeSampleRun()
    const excluded = await visitor()
    await excluded.call('updateShow', 'House of R', { excluded: true })
    const mapped = await visitor()
    await mapped.searchComps('The Zach Lowe Show', 'Night Shift Cinema')
    await mapped.call('updateShow', 'The Zach Lowe Show', { compId: 'e-0001' })
    env.QLOO_DAILY_CALL_CAP = '0'
    for (const s of [excluded, mapped]) {
      await s.call('startLaunch', { name: 'The Watch' })
      expect(s.state()?.run).toMatchObject({ status: 'stopped', error: expect.stringContaining('your own data') })
    }
  })

  it('replays the stored run with its closing line', async () => {
    const stored = await completeSampleRun()
    expect(stored.state.run?.closing).toBe('The Big Picture leads the finalists.')
    expect((await startCapped()).run?.closing).toBe('The Big Picture leads the finalists.')
  })

  it('keeps the sample run again with its topic baseline when that lands after the run ended, as the run ended', async () => {
    const held = Promise.withResolvers<void>()
    fakeTopic(async (request) => {
      await held.promise
      return topicNames(request)
    })
    const drafted = [
      { show: 'The Big Picture', slots: 12, angle: 'Film fans who follow TV too.' },
      { show: 'The Rewatchables', slots: 8, angle: 'Rewatch fans already know The Watch.' }
    ]
    const stored = await completeSampleRun(20, { draft: toolUse('draft_insertion_order', { lines: drafted }) })
    expect(stored.state.topic?.status).toBe('ranking')
    // The programmer rewords an angle before the baseline lands; their words stay theirs.
    const order = stored.state.insertionOrder!
    await stored.session.call('editInsertionOrder', order.id, [{ ...drafted[0], angle: 'Typed by the visitor.' }])
    held.resolve()
    const landed = await stored.session.until((s) => s.topic?.status === 'ranked')

    const replayed = await startCapped()
    expect(replayed.run?.replayed).toBeDefined()
    expect(replayed.topic).toEqual(landed.topic)
    expect(replayed.insertionOrder).toMatchObject({ status: 'draft', lines: drafted })
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
