import { afterEach, describe, expect, it } from 'vitest'
import type { Evidence } from '../src/evidence'
import { fakeClaude, fakeCompare, fakeInsights, fakeQloo, modelRequests, requests, text, toolUse, turn } from './fake'
import { openSession, type Session } from './session'

// A synthetic network whose launch, Static Hour, is one of its own shows. Six others can be ranked;
// the top five by fit are finalists.
const show = (entity_id: string, name: string) => [{ entity_id, name, popularity: 0.8 }]
const search = {
  'Static Hour': show('e-3000', 'Static Hour'),
  'Back Row': show('e-3001', 'Back Row'),
  'Two Mics': show('e-3002', 'Two Mics'),
  'Half Court': show('e-3003', 'Half Court'),
  'Liner Notes': show('e-3004', 'Liner Notes'),
  'Cold Open': show('e-3005', 'Cold Open'),
  'Box Score': show('e-3006', 'Box Score')
}
const roster = Object.keys(search).join('\n')

// Made-up scores in fit order: Half Court, the sixth, isn't a finalist.
const ranked = [
  { entity_id: 'e-3002', name: 'Two Mics', affinity: 0.947 },
  { entity_id: 'e-3001', name: 'Back Row', affinity: 0.936 },
  { entity_id: 'e-3005', name: 'Cold Open', affinity: 0.925 },
  { entity_id: 'e-3004', name: 'Liner Notes', affinity: 0.914 },
  { entity_id: 'e-3006', name: 'Box Score', affinity: 0.903 },
  { entity_id: 'e-3003', name: 'Half Court', affinity: 0.892 }
]
const finalistIds = ['e-3002', 'e-3001', 'e-3005', 'e-3004', 'e-3006']

// Shared tags in Qloo's order, with made-up scores unlike any other figure here. Every pair shares
// "Podcasts", and Qloo can list one name under two subtypes.
const tag = (kind: string, name: string, score: number) => ({
  tag_id: `urn:tag:${kind}:${name.toLowerCase().replace(/ /g, '_')}`,
  name,
  score
})
const podcasts = tag('genre:media', 'Podcasts', 0.7319)
const compare = {
  'e-3002': [
    podcasts,
    tag('keyword:qloo', 'Pop Culture', 0.7297),
    tag('host:qloo', 'Engaging', 0.7286),
    tag('content:qloo', 'Engaging', 0.7275),
    tag('style:qloo', 'Conversational', 0.7264)
  ],
  'e-3001': [
    podcasts,
    tag('host:qloo', 'Insightful', 0.7253),
    tag('keyword:qloo', 'Film', 0.7242),
    tag('style:qloo', 'Nostalgic', 0.7231),
    tag('audience:qloo', 'Curious', 0.7228),
    tag('content:qloo', 'Informative', 0.7217),
    tag('keyword:qloo', 'Interviews', 0.7206),
    tag('style:qloo', 'Humorous', 0.7195)
  ],
  'e-3005': [podcasts],
  'e-3004': [podcasts, tag('keyword:qloo', 'Music', 0.7184)],
  'e-3006': [tag('genre:media', 'Sports', 0.7173), podcasts]
}

const resolveLaunch = toolUse('resolve_entities', { names: ['Static Hour'], type: 'urn:entity:podcast' })
const rank = (anchor_ids: string[]) =>
  toolUse('rank_candidates', {
    anchor_ids,
    candidate_ids: Object.values(search).map(([s]) => s.entity_id),
    type: 'urn:entity:podcast'
  })
const sharedTags = (anchor_ids: string[], candidate_ids: string[]) =>
  toolUse('shared_tags', { anchor_ids, candidate_ids })

const open: Session[] = []
afterEach(() => open.splice(0).forEach((s) => s.close()))

// A session with the network imported and a launch of Static Hour run through `script`.
async function launch(script: Parameters<typeof fakeClaude>[0]) {
  fakeQloo({ search })
  fakeInsights((body) => ranked.filter((r) => String(body['filter.results.entities']).split(',').includes(r.entity_id)))
  fakeClaude(script)
  const s = await openSession()
  open.push(s)
  await s.importRoster(roster)
  await s.call('startLaunch', { name: 'Static Hour' })
  return { s, state: await s.until((state) => state.run !== null && state.run.status !== 'running') }
}

describe('the tags each finalist shares with the launch', () => {
  it('shows each finalist the tags its compare returned, minus generic ones, as words with the call', async () => {
    fakeCompare(compare)
    const { state } = await launch([
      turn(resolveLaunch),
      turn(rank(['e-3000'])),
      turn(sharedTags(['e-3000'], finalistIds)),
      turn(text('Found shared tags.'))
    ])

    expect(state.run?.status).toBe('completed')
    expect(state.run?.notes.at(-1)).toEqual({
      text: 'Finding the tags 5 finalists share with Static Hour',
      status: 'done'
    })
    // Calls C-01 to C-07 are the import's, C-08 the launch's, C-09 the ranking; then one compare
    // per finalist, numbered in fit order.
    expect(state.ranking?.rows.map((r) => [r.show, r.sharedTags])).toEqual([
      ['Two Mics', { call: 'C-10', tags: ['Pop Culture', 'Engaging', 'Conversational'], error: null }],
      ['Back Row', { call: 'C-11', tags: ['Insightful', 'Film', 'Nostalgic', 'Curious', 'Informative'], error: null }],
      ['Cold Open', { call: 'C-12', tags: [], error: null }],
      ['Liner Notes', { call: 'C-13', tags: ['Music'], error: null }],
      ['Box Score', { call: 'C-14', tags: ['Sports'], error: null }],
      ['Half Court', null]
    ])
    // The model gets the same words, and no score.
    const result = modelRequests()[3].messages.at(-1).content[0]
    expect(result).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_3_1' })
    expect(result.is_error).toBeUndefined()
    expect(JSON.parse(result.content).finalists[0]).toEqual({
      show: 'Two Mics',
      id: 'e-3002',
      call: 'C-10',
      tags: ['Pop Culture', 'Engaging', 'Conversational'],
      error: null
    })
    expect(result.content).not.toContain('0.72')
  })

  it('compares every anchor on side a with one finalist on side b, all at once within the gateway limit', async () => {
    fakeCompare(compare, { latencyMs: 40 })
    // Box Score stands in as a comp beside the launch, so it leaves the candidates and Half Court is
    // a finalist. The model leaves Two Mics out, and it's compared anyway.
    const anchors = ['e-3000', 'e-3006']
    await launch([
      turn(resolveLaunch),
      turn(rank(anchors)),
      turn(sharedTags(anchors, ['e-3001', 'e-3005', 'e-3004', 'e-3003'])),
      turn(text('Found shared tags.'))
    ])

    const compares = requests.filter((r) => r.url.pathname === '/v2/analysis/compare')
    expect(compares.map((r) => [r.method, Object.fromEntries(r.url.searchParams)])).toEqual(
      ['e-3002', 'e-3001', 'e-3005', 'e-3004', 'e-3003'].map((b) => [
        'GET',
        { 'a.signal.interests.entities': 'e-3000,e-3006', 'b.signal.interests.entities': b, take: '50' }
      ])
    )
    // The gateway's limit is 3 in flight, and the five calls reach it.
    expect(Math.max(...compares.map((r) => r.inFlight))).toBe(3)
  })

  it("keeps tag scores out of synced state, and every tag Qloo returned in each compare's evidence", async () => {
    fakeCompare(compare)
    const { s } = await launch([
      turn(resolveLaunch),
      turn(rank(['e-3000'])),
      turn(sharedTags(['e-3000'], finalistIds)),
      turn(text('Found shared tags.'))
    ])

    const states = s.frames().filter((f) => JSON.parse(f).type === 'cf_agent_state')
    for (const t of Object.values(compare).flat()) expect(states.join('\n')).not.toContain(String(t.score))
    const evidence = (await s.call<Evidence[]>('getEvidence')).filter((e) => e.endpoint === '/v2/analysis/compare')
    expect(evidence.map((e) => e.call)).toEqual(['C-10', 'C-11', 'C-12', 'C-13', 'C-14'])
    expect(evidence[0]).toMatchObject({
      method: 'GET',
      params: { 'a.signal.interests.entities': 'e-3000', 'b.signal.interests.entities': 'e-3002', take: 50 },
      status: 200,
      error: null
    })
    expect(evidence[0].tags).toEqual([
      { id: 'urn:tag:genre:media:podcasts', name: 'Podcasts', score: 0.7319 },
      { id: 'urn:tag:keyword:qloo:pop_culture', name: 'Pop Culture', score: 0.7297 },
      { id: 'urn:tag:host:qloo:engaging', name: 'Engaging', score: 0.7286 },
      { id: 'urn:tag:content:qloo:engaging', name: 'Engaging', score: 0.7275 },
      { id: 'urn:tag:style:qloo:conversational', name: 'Conversational', score: 0.7264 }
    ])
  })

  it("refuses before a ranking, with anchors other than the ranking's, and with an ID that isn't a finalist", async () => {
    fakeCompare(compare)
    const { state } = await launch([
      turn(resolveLaunch, sharedTags(['e-3000'], finalistIds)),
      turn(rank(['e-3000'])),
      turn(sharedTags(['e-3001'], finalistIds), sharedTags(['e-3000'], ['e-3002', 'e-3003'])),
      turn(text('Stopped.'))
    ])

    expect(state.run?.notes[1]).toEqual({ text: 'Finding shared tags', status: 'failed' })
    const results = (n: number) => modelRequests()[n].messages.at(-1).content
    expect(results(1)[1]).toMatchObject({
      is_error: true,
      content: "There's no fit ranking to take finalists from yet. Call rank_candidates first."
    })
    expect(results(3)).toMatchObject([
      {
        is_error: true,
        content: 'The anchors must be the ones the ranking C-09 used: e-3000. Call again with those as anchor_ids.'
      },
      {
        is_error: true,
        content: "e-3003 isn't a finalist of the ranking C-09. Call again with the finalists' IDs from rank_candidates."
      }
    ])
    expect(requests.filter((r) => r.url.pathname === '/v2/analysis/compare')).toEqual([])
    expect(state.ranking?.rows.every((r) => r.sharedTags === null)).toBe(true)
  })

  it("shows a failed compare on its finalist's row, keeps the others' tags, and tells the model which failed", async () => {
    fakeCompare({ ...compare, 'e-3001': 400 })
    const { state } = await launch([
      turn(resolveLaunch),
      turn(rank(['e-3000'])),
      turn(sharedTags(['e-3000'], finalistIds)),
      turn(text('Back Row has no shared tags.'))
    ])

    expect(state.ranking?.rows[0].sharedTags?.tags).toEqual(['Pop Culture', 'Engaging', 'Conversational'])
    expect(state.ranking?.rows[1].sharedTags).toEqual({
      call: 'C-11',
      tags: [],
      error: 'Qloo returned 400: fake failure'
    })
    expect(state.run?.notes.at(-1)?.status).toBe('failed')
    const [result] = modelRequests()[3].messages.at(-1).content
    expect(result.is_error).toBe(true)
    expect(result.content).toContain(
      "The compare C-11 for Back Row failed: Qloo returned 400: fake failure. Don't call shared_tags again in this run: give that finalist a null angle, as an angle is built only from shared tags."
    )
    expect(result.content).toContain('"tags":["Pop Culture","Engaging","Conversational"]')
  })
})
