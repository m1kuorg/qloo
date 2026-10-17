import { abortAllDurableObjects } from 'cloudflare:test'
import { afterEach, describe, expect, it } from 'vitest'
import type { State } from '../src/agent'
import { fakeClaude, fakeInsights, fakeQloo, modelRequests, text, toolUse, turn } from './fake'
import { openSession, type Session } from './session'

// A synthetic launch with two same-name feeds, so the agent has a real fork to ask about.
const search = {
  'Late Reel': [
    { entity_id: 'e-0201', name: 'Late Reel', popularity: 0.88 },
    { entity_id: 'e-0202', name: 'Late Reel', popularity: 0.31 }
  ]
}

const askLaunch = toolUse('ask_human', {
  question: 'Two shows in Qloo are named Late Reel. Which one is the launch?',
  kind: 'choice',
  options: ['Late Reel (popularity 88.0)', 'Late Reel (popularity 31.0)']
})

const open: Session[] = []
const session = async (cookie?: string) => {
  const s = await openSession(cookie)
  open.push(s)
  return s
}
afterEach(() => open.splice(0).forEach((s) => s.close()))

const waiting = (s: Session) => s.until((state) => state.run?.status === 'waiting')
const finished = (s: Session) =>
  s.until((state) => state.run !== null && (state.run.status === 'completed' || state.run.status === 'failed'))
const question = (state: State) => state.run!.question!

describe('asking the programmer', () => {
  it('pauses the run on the question, and the answer resumes it as a separate text block', async () => {
    fakeQloo({ search })
    fakeClaude([turn(askLaunch), turn(text('The launch is Late Reel, the more popular feed.'))])
    const s = await session()
    await s.call('startLaunch', { name: 'Late Reel' })

    const paused = await waiting(s)
    expect(paused.run).toMatchObject({
      status: 'waiting',
      notes: [{ text: 'Asking: Two shows in Qloo are named Late Reel. Which one is the launch?', status: 'done' }],
      question: {
        id: 'toolu_1_1',
        kind: 'choice',
        question: 'Two shows in Qloo are named Late Reel. Which one is the launch?',
        options: ['Late Reel (popularity 88.0)', 'Late Reel (popularity 31.0)']
      }
    })
    expect(modelRequests()).toHaveLength(1)

    await s.call('answer', 'toolu_1_1', { choice: 'Late Reel (popularity 88.0)' })
    const state = await finished(s)
    expect(state.run).toMatchObject({ status: 'completed', question: null, error: null })

    const [first, second] = modelRequests()
    expect(second.messages.slice(0, first.messages.length)).toEqual(first.messages)
    expect(second.messages.at(-2)).toMatchObject({
      role: 'assistant',
      content: [{ type: 'thinking' }, { type: 'tool_use', id: 'toolu_1_1', name: 'ask_human' }]
    })
    // The answer is the programmer's text, outside the tool result, which only says they were asked.
    expect(second.messages.at(-1)).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'toolu_1_1', content: 'Asked the programmer. Their answer follows.' },
        { type: 'text', text: 'Late Reel (popularity 88.0)' }
      ]
    })
  })

  it('refuses an answer to a question that is already answered, and one that was never asked', async () => {
    fakeQloo({ search })
    const resumed = Promise.withResolvers<void>()
    fakeClaude([
      turn(askLaunch),
      async () => {
        await resumed.promise
        return turn(text('Done.'))
      }
    ])
    const s = await session()
    await s.call('startLaunch', { name: 'Late Reel' })
    await waiting(s)
    await expect(s.call('answer', 'toolu_9_9', { text: 'The popular one.' })).rejects.toThrow(
      'That question is no longer open: it was already answered, or its run has ended.'
    )

    await s.call('answer', 'toolu_1_1', { text: 'The popular one.' })
    // A second answer, from a double click or another tab, while the run is going again.
    await expect(s.call('answer', 'toolu_1_1', { text: 'The other one.' })).rejects.toThrow(
      'That question is no longer open: it was already answered, or its run has ended.'
    )
    resumed.resolve()
    await finished(s)
    await expect(s.call('answer', 'toolu_1_1', { text: 'The other one.' })).rejects.toThrow('no longer open')
    // Claude heard the first answer only.
    const resumedWith = modelRequests()[1].messages.at(-1).content
    expect(resumedWith.at(-1)).toEqual({ type: 'text', text: 'The popular one.' })
  })

  it('refuses an answer that is neither an option nor text, and keeps the question open', async () => {
    fakeQloo({ search })
    fakeClaude([turn(askLaunch), turn(text('Done.'))])
    const s = await session()
    await s.call('startLaunch', { name: 'Late Reel' })
    await waiting(s)

    await expect(s.call('answer', 'toolu_1_1', { choice: 'Late Reel (popularity 50.0)' })).rejects.toThrow(
      "That isn't one of the options."
    )
    await expect(s.call('answer', 'toolu_1_1', { text: '   ' })).rejects.toThrow('Pick an option or type an answer.')
    await expect(s.call('answer', 'toolu_1_1', null)).rejects.toThrow('Pick an option or type an answer.')
    expect(s.state()?.run).toMatchObject({ status: 'waiting', question: { id: 'toolu_1_1' } })
    expect(modelRequests()).toHaveLength(1)

    await s.call('answer', 'toolu_1_1', { choice: 'Late Reel (popularity 31.0)', text: 'The smaller feed is ours.' })
    await finished(s)
    expect(modelRequests()[1].messages.at(-1).content.at(-1)).toEqual({
      type: 'text',
      text: 'Late Reel (popularity 31.0)\n\nThe smaller feed is ours.'
    })
  })

  it('stores the slot budget on the run, as a count or a dollar amount', async () => {
    fakeQloo({ search })
    const askBudget = toolUse('ask_human', {
      question: 'How many promo slots can this launch spend?',
      kind: 'budget',
      options: ['12 slots', '20 slots']
    })
    fakeClaude([turn(askBudget), turn(text('Budget noted.')), turn(askBudget), turn(text('Budget noted.'))])
    const s = await session()
    await s.call('startLaunch', { name: 'Late Reel' })
    const paused = await waiting(s)
    // Code builds the budget form, so the model's options are dropped.
    expect(paused.run).toMatchObject({
      notes: [{ text: 'Asking for the slot budget', status: 'done' }],
      question: { kind: 'budget', options: [] },
      budget: null
    })

    for (const [reply, error] of [
      [{}, 'Give the budget as a number of promo slots or a dollar amount.'],
      [{ slots: 12, dollars: 5000 }, 'Give the budget as promo slots or dollars, not both.'],
      [{ slots: 0 }, 'The slot budget must be a whole number of slots, 1 or more.'],
      [{ slots: 2.5 }, 'The slot budget must be a whole number of slots, 1 or more.'],
      [{ dollars: -10 }, 'The dollar budget must be an amount above $0.'],
      [{ dollars: '5000' }, 'The dollar budget must be an amount above $0.'],
      [{ choice: '12 slots' }, "That isn't one of the options."]
    ] as const)
      await expect(s.call('answer', 'toolu_1_1', reply), JSON.stringify(reply)).rejects.toThrow(error)
    expect(s.state()?.run).toMatchObject({ status: 'waiting', budget: null })

    await s.call('answer', 'toolu_1_1', { slots: 20 })
    expect((await finished(s)).run?.budget).toEqual({ slots: 20 })
    expect(modelRequests()[1].messages.at(-1).content.at(-1)).toEqual({
      type: 'text',
      text: 'Slot budget: 20 promo slots.'
    })

    await s.call('startLaunch', { name: 'Late Reel' })
    expect(s.state()?.run?.budget).toBeNull()
    await waiting(s)
    await s.call('answer', 'toolu_3_1', { dollars: 150000, text: 'Keep it to the big shows.' })
    expect((await finished(s)).run?.budget).toEqual({ dollars: 150000 })
    expect(modelRequests()[3].messages.at(-1).content.at(-1)).toEqual({
      type: 'text',
      text: 'Slot budget: $150,000.\n\nKeep it to the big shows.'
    })
  })

  it("stores the shows left out as this run's exclusions, offering only shows that can be scored", async () => {
    fakeQloo({
      search: {
        ...search,
        'Late Reel Live': [{ entity_id: 'e-0304', name: 'Late Reel Live', popularity: 0.4 }],
        'Quiet Hours': [{ entity_id: 'e-0301', name: 'Quiet Hours', popularity: 0.7 }],
        'Static Bloom': [{ entity_id: 'e-0302', name: 'Static Bloom', popularity: 0.6 }],
        'Long Table': [{ entity_id: 'e-0303', name: 'Long Table', popularity: 0.5 }]
      }
    })
    const askExclusions = toolUse('ask_human', {
      question: 'Which shows should this launch leave out?',
      kind: 'exclusions',
      options: []
    })
    fakeClaude([turn(askExclusions), turn(text('Noted.')), turn(askExclusions), turn(text('Noted.'))])
    const s = await session()
    await s.importRoster('Late Reel Live\nQuiet Hours\nStatic Bloom\nLong Table\nGlass Harbor')
    await s.call('updateShow', 'Long Table', { excluded: true })
    await s.call('startLaunch', { name: 'Quiet Hours' })

    // Quiet Hours is the launch, Long Table is already left out of every launch, and Glass Harbor,
    // a miss, can't be scored.
    expect((await waiting(s)).run).toMatchObject({
      notes: [{ text: 'Asking for exclusions', status: 'done' }],
      question: { kind: 'exclusions', options: ['Late Reel Live', 'Static Bloom'] },
      exclusions: null
    })
    await expect(s.call('answer', 'toolu_1_1', { exclude: ['Glass Harbor'] })).rejects.toThrow(
      '"Glass Harbor" isn\'t one of the shows this launch can leave out.'
    )
    await expect(s.call('answer', 'toolu_1_1', { exclude: 'Static Bloom' })).rejects.toThrow(
      'List the shows to leave out, or none.'
    )
    await expect(s.call('answer', 'toolu_1_1', {})).rejects.toThrow('List the shows to leave out, or none.')

    await s.call('answer', 'toolu_1_1', { exclude: ['Static Bloom'] })
    const state = await finished(s)
    expect(state.run?.exclusions).toEqual(['Static Bloom'])
    // For this run only: the roster still offers the show to later launches.
    expect(state.roster.find((show) => show.name === 'Static Bloom')?.excluded).toBe(false)
    expect(modelRequests()[1].messages.at(-1).content.at(-1)).toEqual({
      type: 'text',
      text: 'Leave out of this launch: Static Bloom.'
    })

    await s.call('startLaunch', { name: 'Quiet Hours' })
    expect(s.state()?.run?.exclusions).toBeNull()
    await waiting(s)
    await s.call('answer', 'toolu_3_1', { exclude: [] })
    expect((await finished(s)).run?.exclusions).toEqual([])
    expect(modelRequests()[3].messages.at(-1).content.at(-1)).toEqual({
      type: 'text',
      text: 'No exclusions for this launch.'
    })
  })

  it('keeps the open question through a reload and a restart, and still resumes on the answer', async () => {
    fakeQloo({ search })
    fakeClaude([turn(askLaunch), turn(text('The launch is Late Reel.'))])
    const first = await session()
    await first.call('startLaunch', { name: 'Late Reel' })
    const paused = await waiting(first)
    first.close()
    // The agent restarts, losing everything in memory, as a deploy or an idle eviction does.
    await abortAllDurableObjects()

    const s = await session(first.cookie)
    expect(s.state()?.run).toEqual(paused.run)
    await s.call('answer', question(paused).id, { choice: 'Late Reel (popularity 88.0)' })
    expect((await finished(s)).run?.status).toBe('completed')
    const [before, after] = modelRequests()
    expect(after.messages.slice(0, before.messages.length)).toEqual(before.messages)
    expect(after.messages.at(-1).content.at(-1)).toEqual({ type: 'text', text: 'Late Reel (popularity 88.0)' })
  })

  it('asks one question at a time, and returns every result of the paused turn with the answer', async () => {
    fakeQloo({ search })
    const resolve = toolUse('resolve_entities', { names: ['Late Reel'], type: 'urn:entity:podcast' })
    const askBudget = toolUse('ask_human', { question: 'What is the slot budget?', kind: 'budget', options: [] })
    fakeClaude([turn(resolve, askLaunch, askBudget), turn(text('Done.'))])
    const s = await session()
    await s.call('startLaunch', { name: 'Late Reel' })

    const paused = await waiting(s)
    expect(question(paused)).toMatchObject({ id: 'toolu_1_2', kind: 'choice' })
    expect(paused.run?.notes.map((n) => n.status)).toEqual(['done', 'done', 'failed'])
    await s.call('answer', 'toolu_1_2', { text: 'The popular one.' })
    await finished(s)

    const resumedWith = modelRequests()[1].messages.at(-1).content
    expect(resumedWith.map((b: { type: string; tool_use_id?: string }) => [b.type, b.tool_use_id])).toEqual([
      ['tool_result', 'toolu_1_1'],
      ['tool_result', 'toolu_1_2'],
      ['tool_result', 'toolu_1_3'],
      ['text', undefined]
    ])
    expect(JSON.parse(resumedWith[0].content)[0]).toMatchObject({ name: 'Late Reel', resolution: 'ambiguous' })
    expect(resumedWith[2]).toMatchObject({ is_error: true })
    expect(resumedWith[2].content).toContain('Ask one question at a time')
  })

  it('drops a finalist the programmer leaves out, and the next show by fit becomes a finalist', async () => {
    const show = (entity_id: string, name: string) => [{ entity_id, name, popularity: 0.8 }]
    fakeQloo({
      search: {
        'Night Owl Hour': show('e-0400', 'Night Owl Hour'),
        'Tape Delay': show('e-0401', 'Tape Delay'),
        'Second Feature': show('e-0402', 'Second Feature'),
        'Open Mic Nite': show('e-0403', 'Open Mic Nite'),
        'Box Set Club': show('e-0404', 'Box Set Club'),
        'Short Wave': show('e-0405', 'Short Wave'),
        'Dial Tone': show('e-0406', 'Dial Tone')
      }
    })
    // Made-up scores, in fit order.
    fakeInsights([
      { entity_id: 'e-0403', name: 'Open Mic Nite', affinity: 0.931 },
      { entity_id: 'e-0401', name: 'Tape Delay', affinity: 0.917 },
      { entity_id: 'e-0406', name: 'Dial Tone', affinity: 0.902 },
      { entity_id: 'e-0402', name: 'Second Feature', affinity: 0.884 },
      { entity_id: 'e-0405', name: 'Short Wave', affinity: 0.871 },
      { entity_id: 'e-0404', name: 'Box Set Club', affinity: 0.856 }
    ])
    const rank = toolUse('rank_candidates', {
      anchor_ids: ['e-0400'],
      candidate_ids: ['e-0401', 'e-0402', 'e-0403', 'e-0404', 'e-0405', 'e-0406'],
      type: 'urn:entity:podcast'
    })
    fakeClaude([
      turn(toolUse('resolve_entities', { names: ['Night Owl Hour'], type: 'urn:entity:podcast' })),
      turn(rank),
      turn(
        toolUse('ask_human', { question: 'Which shows should this launch leave out?', kind: 'exclusions', options: [] })
      ),
      // Ranking again later in the run keeps the programmer's exclusions.
      turn(rank),
      turn(text('Done.'))
    ])
    const s = await session()
    await s.importRoster(
      'Night Owl Hour\nTape Delay\nSecond Feature\nOpen Mic Nite\nBox Set Club\nShort Wave\nDial Tone'
    )
    await s.call('startLaunch', { name: 'Night Owl Hour' })

    const paused = await waiting(s)
    const finalists = (state: State) => state.ranking?.rows.filter((r) => r.finalist).map((r) => r.show)
    expect(finalists(paused)).toEqual(['Open Mic Nite', 'Tape Delay', 'Dial Tone', 'Second Feature', 'Short Wave'])
    // The programmer picks from the chart, in fit order.
    expect(question(paused).options).toEqual([
      'Open Mic Nite',
      'Tape Delay',
      'Dial Tone',
      'Second Feature',
      'Short Wave',
      'Box Set Club'
    ])

    await s.call('answer', question(paused).id, { exclude: ['Tape Delay'] })
    const after = ['Open Mic Nite', 'Dial Tone', 'Second Feature', 'Short Wave', 'Box Set Club']
    expect(finalists(s.state()!)).toEqual(after)
    const state = await finished(s)
    expect(state.run?.status).toBe('completed')
    expect(finalists(state)).toEqual(after)
    // Tape Delay keeps its place on the chart; it just isn't a finalist.
    expect(state.ranking?.rows.find((r) => r.show === 'Tape Delay')).toMatchObject({ rank: 2, finalist: false })

    const resumedWith = modelRequests()[3].messages.at(-1).content
    expect(resumedWith[0]).toEqual({
      type: 'tool_result',
      tool_use_id: 'toolu_3_1',
      content:
        'Asked the programmer. Their answer follows. Code has left those shows out of the fit ranking C-09; the finalists are now Open Mic Nite, Dial Tone, Second Feature, Short Wave, Box Set Club.'
    })
    expect(resumedWith[1]).toEqual({ type: 'text', text: 'Leave out of this launch: Tape Delay.' })
  })

  it('ends a run still waiting when a new one starts, keeping what it ended with', async () => {
    fakeQloo({ search })
    fakeClaude([turn(askLaunch), turn(askLaunch), turn(text('Done.'))])
    const s = await session()
    const { runId: first } = await s.call<{ runId: string }>('startLaunch', { name: 'Late Reel' })
    expect((await waiting(s)).runs).toMatchObject([{ id: first, status: 'waiting' }])

    const { runId: second } = await s.call<{ runId: string }>('startLaunch', { name: 'Late Reel' })
    expect(s.state()?.runs).toMatchObject([
      { id: first, status: 'failed' },
      { id: second, status: 'running' }
    ])
    expect((await s.call<State>('getRun', first)).run).toMatchObject({
      status: 'failed',
      error: 'Left unanswered: a new run started instead.'
    })
    await expect(s.call('answer', 'toolu_1_1', { text: 'Too late.' })).rejects.toThrow('no longer open')

    await waiting(s)
    await s.call('answer', 'toolu_2_1', { text: 'The popular one.' })
    expect((await finished(s)).runs).toMatchObject([
      { id: first, status: 'failed' },
      { id: second, status: 'completed' }
    ])
    // Each run keeps its own conversation: the second resumed from its own turn only.
    expect(modelRequests()[2].messages).toHaveLength(3)
  })
})
