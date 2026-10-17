import { afterEach, describe, expect, it } from 'vitest'
import type { Evidence } from '../src/evidence'
import { fakeClaude, fakeInsights, fakeQloo, modelRequests, requests, text, toolUse, turn } from './fake'
import { openSession, type Session } from './session'

// A synthetic network: the launch is one of its own shows, one show is ambiguous, one Qloo
// doesn't have, and one the programmer leaves out.
const show = (entity_id: string, name: string) => [{ entity_id, name, popularity: 0.8 }]
const search = {
  'Night Shift Cinema': show('e-0001', 'Night Shift Cinema'),
  'The Long Take': show('e-0201', 'The Long Take'),
  'Box Office Brawl': show('e-0202', 'Box Office Brawl'),
  'Small Screen Club': show('e-0203', 'Small Screen Club'),
  'Late Fee': show('e-0204', 'Late Fee'),
  'Pilot Season': show('e-0205', 'Pilot Season'),
  'Overtime Desk': show('e-0206', 'Overtime Desk'),
  'Credits Roll': show('e-0207', 'Credits Roll'),
  'Rerun Radio': show('e-0208', 'Rerun Radio'),
  'Deep Cuts': [
    { entity_id: 'e-0101', name: 'Deep Cuts: Marvel', popularity: 0.97 },
    { entity_id: 'e-0102', name: 'Deep Cuts: Harry Potter', popularity: 0.62 }
  ]
}
const roster = [
  'Night Shift Cinema',
  'The Long Take',
  'Box Office Brawl',
  'Deep Cuts',
  'Small Screen Club',
  'Late Fee',
  'Pilot Season',
  'Overtime Desk',
  'Ghost Signal',
  'Credits Roll',
  'Rerun Radio'
].join('\n')
// Scorable shows other than the launch, in roster order.
const candidates = ['e-0201', 'e-0202', 'e-0203', 'e-0204', 'e-0205', 'e-0207', 'e-0208']

// Made-up scores in fit order, unlike any other figure here. Late Fee gets none, so Qloo leaves it
// out of the results.
const ranked = [
  { entity_id: 'e-0203', name: 'Small Screen Club', affinity: 0.913 },
  { entity_id: 'e-0201', name: 'The Long Take', affinity: 0.902 },
  { entity_id: 'e-0207', name: 'Credits Roll', affinity: 0.887 },
  { entity_id: 'e-0205', name: 'Pilot Season', affinity: 0.874 },
  { entity_id: 'e-0202', name: 'Box Office Brawl', affinity: 0.861 },
  { entity_id: 'e-0208', name: 'Rerun Radio', affinity: 0.849 }
]

const resolveLaunch = toolUse('resolve_entities', { names: ['Night Shift Cinema'], type: 'urn:entity:podcast' })
const rank = (anchor_ids: string[], candidate_ids = ['e-0001', ...candidates]) =>
  toolUse('rank_candidates', { anchor_ids, candidate_ids, type: 'urn:entity:podcast' })

const open: Session[] = []
const session = async () => {
  const s = await openSession()
  open.push(s)
  return s
}
afterEach(() => open.splice(0).forEach((s) => s.close()))

const finished = (s: Session) => s.until((state) => state.run !== null && state.run.status !== 'running')

// A session with the network imported, Overtime Desk left out, and a launch run through `script`.
async function launch(script: Parameters<typeof fakeClaude>[0]) {
  fakeQloo({ search })
  fakeClaude(script)
  const s = await session()
  await s.importRoster(roster)
  await s.call('updateShow', 'Overtime Desk', { excluded: true })
  await s.call('startLaunch', { name: 'Night Shift Cinema' })
  return { s, state: await finished(s) }
}

describe('ranking the roster by fit to the launch', () => {
  it('charts each scorable show by fit rank and band, marks the top five as finalists, and lists the rest', async () => {
    fakeInsights(ranked)
    const { state } = await launch([turn(resolveLaunch), turn(rank(['e-0001'])), turn(text('Ranked.'))])

    expect(state.run?.notes).toEqual([
      { text: 'Resolving Night Shift Cinema', status: 'done' },
      { text: 'Scoring 7 shows against Night Shift Cinema', status: 'done' }
    ])
    expect(state.ranking).toMatchObject({ call: 'C-13', anchors: [{ id: 'e-0001', name: 'Night Shift Cinema' }] })
    expect(state.ranking?.error).toBeNull()
    expect(state.ranking?.rows.map((r) => [r.rank, r.show, r.band, r.finalist, r.leadingComp])).toEqual([
      [1, 'Small Screen Club', 'top', true, null],
      [2, 'The Long Take', 'top', true, null],
      [3, 'Credits Roll', 'middle', true, null],
      [4, 'Pilot Season', 'middle', true, null],
      [5, 'Box Office Brawl', 'bottom', true, null],
      [6, 'Rerun Radio', 'bottom', false, null]
    ])
    expect(state.ranking?.notScored).toEqual([
      { show: 'Night Shift Cinema', reason: 'The launch: not ranked against itself' },
      { show: 'Deep Cuts', reason: 'Ambiguous in Qloo search: pick its match in the roster' },
      { show: 'Late Fee', reason: 'Qloo returned no score for it against this launch' },
      { show: 'Overtime Desk', reason: 'Excluded: never proposed for a launch' },
      { show: 'Ghost Signal', reason: 'Not in Qloo: map a comp or leave it out' }
    ])
    // The model gets the scorable roster's IDs in the run's opening message, never in the system prompt.
    const [first] = modelRequests()
    expect(first.messages[0].content).toContain('The Long Take: e-0201')
    expect(first.messages[0].content).not.toContain('e-0206')
    expect(JSON.stringify(first.system)).not.toContain('e-0201')
  })

  it('sends one closed-list ranking with flat dotted keys, every anchor in one signal, and explainability', async () => {
    fakeInsights(ranked)
    await launch([turn(resolveLaunch), turn(rank(['e-0001'])), turn(text('Ranked.'))])

    const insights = requests.filter((r) => r.url.pathname === '/v2/insights')
    expect(insights).toHaveLength(1)
    expect(insights[0].method).toBe('POST')
    expect(insights[0].url.search).toBe('')
    // The launch, the excluded show, and the unsettled shows are never candidates.
    expect(JSON.parse(insights[0].body)).toEqual({
      'filter.type': 'urn:entity:podcast',
      'signal.interests.entities': 'e-0001',
      'filter.results.entities': candidates.join(','),
      'feature.explainability': true,
      take: 50
    })
  })

  // The tool result the model got for the ranking, the second turn's only call.
  const rankResult = () => modelRequests()[2].messages.at(-1).content[0]

  it('gives the model an error and the chart "not scored", never a ranking, when every affinity is null', async () => {
    fakeInsights(ranked.map((r) => ({ ...r, affinity: null })))
    const { state } = await launch([turn(resolveLaunch), turn(rank(['e-0001'])), turn(text('Not scored.'))])

    expect(rankResult()).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_2_1', is_error: true })
    expect(rankResult().content).toContain(
      "The ranking C-13 failed: Qloo returned no affinity for any candidate, so the anchors' signal didn't score."
    )
    expect(rankResult().content).toContain("Don't call rank_candidates again in this run.")
    expect(state.ranking).toMatchObject({
      call: 'C-13',
      error: "Qloo returned no affinity for any candidate, so the anchors' signal didn't score",
      rows: []
    })
    expect(state.ranking?.notScored).toContainEqual({ show: 'The Long Take', reason: 'Not scored: the ranking failed' })
    expect(state.run?.notes.at(-1)).toEqual({ text: 'Scoring 7 shows against Night Shift Cinema', status: 'failed' })
  })

  it('rejects a ranking with a result outside the candidate list', async () => {
    fakeInsights([...ranked, { entity_id: 'e-0999', name: 'Someone Else’s Show', affinity: 0.99 }])
    const outside = await launch([turn(resolveLaunch), turn(rank(['e-0001'])), turn(text('Stopped.'))])
    expect(rankResult()).toMatchObject({ is_error: true })
    expect(rankResult().content).toContain(
      'Qloo ranked Someone Else’s Show (e-0999), outside the candidate list, so it ignored the list'
    )
    expect(outside.state.ranking?.rows).toEqual([])
  })

  it('rejects a ranking whose results lack explainability', async () => {
    fakeInsights(ranked.map((r, i) => (i === 2 ? { ...r, explainability: null } : r)))
    const { state } = await launch([turn(resolveLaunch), turn(rank(['e-0001'])), turn(text('Stopped.'))])
    expect(rankResult()).toMatchObject({ is_error: true })
    expect(rankResult().content).toContain(
      'Qloo returned no explainability for Credits Roll (e-0207), so it ignored the request'
    )
    expect(state.ranking?.rows).toEqual([])
  })

  it('names the comp that leads a show by 0.05 or more of its score, and only with two or more anchors', async () => {
    // The launch plus two roster shows as comps; each comp leaves the candidates.
    const shares = (a: number, b: number, c: number) => [
      { entity_id: 'e-0001', score: a },
      { entity_id: 'e-0201', score: b },
      { entity_id: 'e-0202', score: c }
    ]
    const explained: Record<string, ReturnType<typeof shares>> = {
      'e-0203': shares(0.45, 0.3, 0.25), // the launch leads by 0.15
      'e-0207': shares(0.35, 0.33, 0.32), // even
      'e-0205': [{ entity_id: 'e-0202', score: 1 }] // only one comp listed: it leads
    }
    fakeInsights((body) =>
      ranked
        .filter((r) => String(body['filter.results.entities']).split(',').includes(r.entity_id))
        .map((r) => ({ ...r, explainability: explained[r.entity_id] }))
    )
    const { state } = await launch([
      turn(resolveLaunch),
      turn(rank(['e-0001', 'e-0201', 'e-0202'])),
      turn(text('Ranked.'))
    ])

    expect(state.ranking?.rows.map((r) => [r.show, r.leadingComp?.name ?? null])).toEqual([
      ['Small Screen Club', 'Night Shift Cinema'],
      ['Credits Roll', null],
      ['Pilot Season', 'Box Office Brawl'],
      ['Rerun Radio', null]
    ])
    expect(state.ranking?.notScored).toContainEqual({
      show: 'The Long Take',
      reason: 'A comp for the launch: not ranked against it'
    })
    expect(JSON.parse(requests.find((r) => r.url.pathname === '/v2/insights')!.body)).toMatchObject({
      'signal.interests.entities': 'e-0001,e-0201,e-0202'
    })
  })

  it("keeps raw affinities out of synced state, and in the ranking call's evidence with its anchors and candidates", async () => {
    fakeInsights(ranked)
    const { s } = await launch([turn(resolveLaunch), turn(rank(['e-0001'])), turn(text('Ranked.'))])

    const states = s.frames().filter((f) => JSON.parse(f).type === 'cf_agent_state')
    for (const { affinity } of ranked) expect(states.join('\n')).not.toContain(String(affinity))
    const evidence = (await s.call<Evidence[]>('getEvidence')).find((e) => e.call === 'C-13')
    expect(evidence).toMatchObject({
      method: 'POST',
      endpoint: '/v2/insights',
      params: { 'signal.interests.entities': 'e-0001', 'filter.results.entities': candidates.join(',') },
      status: 200,
      error: null
    })
    expect(evidence?.affinities[0]).toEqual({
      id: 'e-0203',
      name: 'Small Screen Club',
      affinity: 0.913,
      explainability: [{ id: 'e-0001', score: 1 }]
    })
    expect(evidence?.affinities).toHaveLength(6)
  })

  it('sends an entity two shows are mapped to once, and scores both shows', async () => {
    fakeQloo({ search: { ...search, 'Long Take': show('e-0201', 'The Long Take') } })
    fakeInsights(ranked)
    fakeClaude([turn(resolveLaunch), turn(rank(['e-0001'])), turn(text('Ranked.'))])
    const s = await session()
    await s.importRoster(roster)
    await s.call('updateShow', 'Overtime Desk', { excluded: true })
    await s.searchComps('Ghost Signal', 'Long Take')
    await s.call('updateShow', 'Ghost Signal', { compId: 'e-0201' })
    await s.call('startLaunch', { name: 'Night Shift Cinema' })
    const state = await finished(s)

    const body = JSON.parse(requests.find((r) => r.url.pathname === '/v2/insights')!.body)
    expect(body['filter.results.entities']).toBe(candidates.join(','))
    expect(state.ranking?.rows.slice(0, 3).map((r) => [r.rank, r.show, r.entity.name])).toEqual([
      [1, 'Small Screen Club', 'Small Screen Club'],
      [2, 'The Long Take', 'The Long Take'],
      [3, 'Ghost Signal', 'The Long Take']
    ])
    expect(state.ranking?.notScored.map((n) => n.show)).not.toContain('Ghost Signal')
  })

  it('refuses an ID that is no roster show, and ranks every scorable show even when the model leaves one out', async () => {
    fakeInsights((body) =>
      ranked.filter((r) => String(body['filter.results.entities']).split(',').includes(r.entity_id))
    )
    const { state } = await launch([
      turn(resolveLaunch),
      turn(rank(['e-0001'], ['e-0201', 'e-0777'])),
      turn(rank(['e-0001'], ['e-0201'])),
      turn(text('Ranked.'))
    ])

    const [refused] = modelRequests()[2].messages.at(-1).content
    expect(refused).toMatchObject({ is_error: true })
    expect(refused.content).toBe("e-0777 isn't a roster show. Call again with the IDs the run's first message lists.")
    expect(requests.filter((r) => r.url.pathname === '/v2/insights')).toHaveLength(1)
    expect(state.ranking?.rows).toHaveLength(6)
  })

  it('refuses an anchor this session never resolved', async () => {
    const { state } = await launch([turn(resolveLaunch), turn(rank(['e-4242'])), turn(text('Stopped.'))])

    expect(rankResult()).toMatchObject({ is_error: true })
    expect(rankResult().content).toContain("e-4242 isn't the launch or a roster show this session resolved.")
    expect(requests.filter((r) => r.url.pathname === '/v2/insights')).toEqual([])
    expect(state.ranking).toBeNull()
  })
})
