import { afterEach, describe, expect, it } from 'vitest'
import type { RunSnapshot, State } from '../src/agent'
import {
  fakeClaude,
  fakeInsights,
  fakeQloo,
  fakeTopic,
  modelRequests,
  refusal,
  text,
  toolUse,
  topicNames,
  topicRequests,
  turn
} from './fake'
import { openSession, type Session } from './session'

// A synthetic network with its own descriptions: the launch is one of its shows, Qloo gives Late
// Fee no score, and Ghost Signal isn't in Qloo.
const show = (entity_id: string, name: string) => [{ entity_id, name, popularity: 0.8 }]
const search = {
  'Night Shift Cinema': show('e-0001', 'Night Shift Cinema'),
  'The Long Take': show('e-0201', 'The Long Take'),
  'Box Office Brawl': show('e-0202', 'Box Office Brawl'),
  'Small Screen Club': show('e-0203', 'Small Screen Club'),
  'Late Fee': show('e-0204', 'Late Fee'),
  'Pilot Season': show('e-0205', 'Pilot Season'),
  'Credits Roll': show('e-0207', 'Credits Roll'),
  'Rerun Radio': show('e-0208', 'Rerun Radio')
}
const roster = `name,description
Night Shift Cinema,Two projectionists watch midnight movies.
The Long Take,Slow cinema reviewed one shot at a time.
Box Office Brawl,Weekend grosses argued like a boxing card.
Small Screen Club,A book club for prestige TV.
Late Fee,Video store clerks remember the rentals.
Pilot Season,Every new TV pilot graded.
Ghost Signal,Radio dramas from the archive.
Credits Roll,The people behind the end credits.
Rerun Radio,Sitcom reruns rewatched.`

// Made-up scores in fit order: Small Screen Club leads, and Late Fee gets none.
const fit = [
  { entity_id: 'e-0203', name: 'Small Screen Club', affinity: 0.917 },
  { entity_id: 'e-0201', name: 'The Long Take', affinity: 0.906 },
  { entity_id: 'e-0207', name: 'Credits Roll', affinity: 0.893 },
  { entity_id: 'e-0205', name: 'Pilot Season', affinity: 0.871 },
  { entity_id: 'e-0202', name: 'Box Office Brawl', affinity: 0.866 },
  { entity_id: 'e-0208', name: 'Rerun Radio', affinity: 0.852 }
]
const fitOrder = fit.map((f) => f.name)

const script = () => [
  turn(toolUse('resolve_entities', { names: ['Night Shift Cinema'], type: 'urn:entity:podcast' })),
  turn(
    toolUse('rank_candidates', {
      anchor_ids: ['e-0001'],
      candidate_ids: ['e-0201', 'e-0202', 'e-0203', 'e-0204', 'e-0205', 'e-0207', 'e-0208'],
      type: 'urn:entity:podcast'
    })
  ),
  turn(text('Ranked.'))
]

const open: Session[] = []
afterEach(() => open.splice(0).forEach((s) => s.close()))

// The run and its topic baseline have both finished.
const settled = (state: State) =>
  state.run !== null && state.run.status !== 'running' && state.topic !== null && state.topic.status !== 'ranking'

async function launch() {
  fakeQloo({ search })
  fakeInsights(fit)
  fakeClaude(script())
  const s = await openSession()
  open.push(s)
  await s.importRoster(roster, 'csv')
  await s.call('startLaunch', { name: 'Night Shift Cinema' })
  return { s, state: await s.until(settled) }
}

describe('the topic baseline beside the fit chart', () => {
  it('moves each charted show by its topic rank minus its fit rank, and marks a climb of 3 or more', async () => {
    // Topic order across the whole roster but the launch; Late Fee and Ghost Signal aren't charted.
    fakeTopic([
      'The Long Take',
      'Late Fee',
      'Box Office Brawl',
      'Ghost Signal',
      'Credits Roll',
      'Rerun Radio',
      'Pilot Season',
      'Small Screen Club'
    ])
    const { state } = await launch()

    expect(state.topic?.status).toBe('ranked')
    expect(state.topic?.error).toBeNull()
    // Topic ranks count only the shows on the chart, so unscored shows can't inflate a move.
    expect(state.topic?.moves).toEqual([
      { show: 'Small Screen Club', topicRank: 6, move: 5, climber: true },
      { show: 'The Long Take', topicRank: 1, move: -1, climber: false },
      { show: 'Credits Roll', topicRank: 3, move: 0, climber: false },
      { show: 'Pilot Season', topicRank: 5, move: 1, climber: false },
      { show: 'Box Office Brawl', topicRank: 2, move: -3, climber: false },
      { show: 'Rerun Radio', topicRank: 4, move: -2, climber: false }
    ])
  })

  it('marks no climber when no show climbs 3 or more places', async () => {
    // Small Screen Club climbs 2, from topic rank 3 to fit rank 1; nothing else climbs.
    fakeTopic([
      'The Long Take',
      'Credits Roll',
      'Small Screen Club',
      'Pilot Season',
      'Box Office Brawl',
      'Rerun Radio',
      'Late Fee',
      'Ghost Signal'
    ])
    const { state } = await launch()

    expect(state.topic?.moves.map((m) => [m.show, m.move])).toEqual([
      ['Small Screen Club', 2],
      ['The Long Take', -1],
      ['Credits Roll', -1],
      ['Pilot Season', 0],
      ['Box Office Brawl', 0],
      ['Rerun Radio', 0]
    ])
    expect(state.topic?.moves.some((m) => m.climber)).toBe(false)
  })

  it('asks Claude with show names and descriptions only, leaving the launch out of its own candidates', async () => {
    await launch()

    const [request, ...more] = topicRequests()
    expect(more).toEqual([])
    expect(request).toMatchObject({
      model: 'claude-haiku-5-5',
      output_config: { effort: 'low', format: { type: 'json_schema' } }
    })
    expect(topicNames(request)).toEqual([
      'The Long Take',
      'Box Office Brawl',
      'Small Screen Club',
      'Late Fee',
      'Pilot Season',
      'Ghost Signal',
      'Credits Roll',
      'Rerun Radio'
    ])
    const [message] = request.messages
    expect(message.content).toContain('Launch: Night Shift Cinema. Two projectionists watch midnight movies.')
    expect(message.content).toContain('Rank all 8 roster shows:')
    expect(message.content).toContain('- Box Office Brawl: Weekend grosses argued like a boxing card.')
    expect(message.content).toContain('- Ghost Signal: Radio dramas from the archive.')
    // Nothing from Qloo: no entity IDs, popularities, or affinities.
    const sent = JSON.stringify(request)
    expect(sent).not.toMatch(/e-0\d{3}/)
    expect(sent).not.toContain('0.8')
    for (const { affinity } of fit) expect(sent).not.toContain(String(affinity))
    // It isn't one of the agent's turns, and the agent's tools aren't offered to it.
    expect(request.tools).toBeUndefined()
    expect(modelRequests()).toHaveLength(3)
  })

  it('reuses the ranking for a second run with the same launch and roster', async () => {
    fakeTopic(() => [...fitOrder].reverse().concat('Late Fee', 'Ghost Signal'))
    const { s, state: first } = await launch()
    fakeClaude(script())
    await s.call('startLaunch', { name: 'Night Shift Cinema' })
    const second = await s.until((state) => settled(state) && state.run?.id !== first.run?.id)

    expect(topicRequests()).toHaveLength(1)
    expect(second.topic).toEqual(first.topic)
    expect(second.topic?.status).toBe('ranked')
  })

  it('keeps the fit chart and says why there is no topic column when Claude declines', async () => {
    fakeTopic(refusal('general_harms'))
    const { state } = await launch()

    expect(state.topic).toEqual({
      status: 'refused',
      order: [],
      error: 'Claude declined to rank the roster by topic (safety category: general_harms)',
      moves: []
    })
    expect(state.ranking?.rows.map((r) => r.show)).toEqual(fitOrder)
    expect(state.run?.status).toBe('completed')
  })

  it('adds a baseline that lands after its run ended to what that run ended with', async () => {
    const release = Promise.withResolvers<void>()
    fakeTopic(async (request) => {
      await release.promise
      return [...topicNames(request)].reverse()
    })
    fakeQloo({ search })
    fakeInsights(fit)
    fakeClaude(script())
    const s = await openSession()
    open.push(s)
    await s.importRoster(roster, 'csv')
    const { runId } = await s.call<{ runId: string }>('startLaunch', { name: 'Night Shift Cinema' })
    const ended = await s.until((state) => state.run?.status === 'completed')
    expect(ended.topic?.status).toBe('ranking')
    release.resolve()
    const state = await s.until(settled)

    // Reversed roster order puts Rerun Radio first and Small Screen Club fourth among charted shows.
    expect(state.topic?.moves.find((m) => m.show === 'Rerun Radio')).toEqual({
      show: 'Rerun Radio',
      topicRank: 1,
      move: -5,
      climber: false
    })
    expect(state.topic?.moves.find((m) => m.show === 'Small Screen Club')).toMatchObject({ move: 3, climber: true })
    const snapshot = await s.call<RunSnapshot>('getRun', runId)
    expect(snapshot.topic).toEqual(state.topic)
  })

  it('shows no topic column when Claude ranks only some of the shows', async () => {
    fakeTopic(['Small Screen Club', 'The Long Take', 'Credits Roll'])
    const { state } = await launch()

    expect(state.topic).toMatchObject({
      status: 'failed',
      error: 'Claude ranked 3 of the 8 roster shows, not all of them',
      moves: []
    })
    expect(state.ranking?.rows).toHaveLength(6)
  })
})
