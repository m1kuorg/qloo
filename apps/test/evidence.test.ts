import { env } from 'cloudflare:workers'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EvidencePanel } from '../src/client/Evidence'
import type { Evidence } from '../src/evidence'
import { QlooGateway } from '../src/gateway'
import { fakeClaude, fakeInsights, fakeQloo, requests, text, toolUse, turn, type QlooEntity } from './fake'
import { hooked, openSession, type Session } from './session'

const open: Session[] = []
const session = async (cookie?: string) => {
  const s = await openSession(cookie)
  open.push(s)
  return s
}
afterEach(() => {
  open.splice(0).forEach((s) => s.close())
  vi.restoreAllMocks()
})

describe('the evidence behind each Qloo call', () => {
  it("links each show's resolution to its search call, with the query, status, latency, and entities", async () => {
    fakeQloo({
      search: {
        'Night Shift Cinema': [
          { entity_id: 'e-0001', name: 'Night Shift Cinema', popularity: 0.91 },
          { entity_id: 'e-0002', name: 'Night Shift Cinema Club', popularity: 0.4 }
        ],
        'Deep Cuts': 429
      }
    })
    const s = await session()
    await s.importRoster('The Ghost Signal Show\nNight Shift Cinema\nDeep Cuts')
    const log = await s.call<Evidence[]>('getEvidence')
    const opened = (name: string) =>
      log.find((e) => e.call === s.state()?.roster.find((r) => r.name === name)?.evidence)

    expect(opened('Night Shift Cinema')).toMatchObject({
      call: 'C-02',
      endpoint: '/search',
      params: { query: 'Night Shift Cinema' },
      status: 200,
      entities: [
        { id: 'e-0001', name: 'Night Shift Cinema', popularity: 0.91 },
        { id: 'e-0002', name: 'Night Shift Cinema Club', popularity: 0.4 }
      ]
    })
    expect(opened('Night Shift Cinema')?.latencyMs).toBeGreaterThanOrEqual(0)
    expect(opened('The Ghost Signal Show')).toMatchObject({ call: 'C-01', status: 200, entities: [] })
    expect(opened('Deep Cuts')).toMatchObject({
      call: 'C-03',
      status: 429,
      error: 'Qloo returned 429: Rate limit exceeded, after 2 retries',
      entities: []
    })
  })

  it('keeps a failed record for a call the gateway threw on, so its call number still opens', async () => {
    // The call throws past the gateway's failure values, as Durable Object RPC does when the instance
    // is reset or overloaded; workerd logs the rejection, which the session catches.
    fakeQloo({ search: {} })
    vi.spyOn(QlooGateway.prototype, 'search').mockRejectedValueOnce(new Error('The gateway is overloaded.'))
    const s = await session()
    const state = await s.importRoster('Night Shift Cinema')

    const show = state.roster[0]
    expect(show).toMatchObject({ resolution: 'failed', evidence: 'C-01' })
    expect(show.error).toBe('The Qloo gateway failed: The gateway is overloaded.')
    const log = await s.call<Evidence[]>('getEvidence')
    expect(log).toMatchObject([
      {
        call: 'C-01',
        run: null,
        method: 'GET',
        endpoint: '/search',
        status: null,
        cacheHit: false,
        error: show.error,
        entities: [],
        tags: [],
        affinities: []
      }
    ])
  })

  const unreadable = "Qloo returned 200 with an answer Crossfeed can't read: "
  it.each([
    ["results that aren't a list", '{"results": {"not": "a list"}}', `${unreadable}results isn't a list`],
    ['a result that is null', '{"results": [null]}', expect.stringMatching(new RegExp(`^${unreadable}.+`))]
  ])('fails a 200 with %s, and keeps nothing, so the next lookup asks Qloo again', async (_, body, error) => {
    fakeQloo({ search: { 'Night Shift Cinema': { status: 200, body } } })
    const s = await session()
    const state = await s.importRoster('Night Shift Cinema')

    expect(state.roster[0]).toMatchObject({ resolution: 'failed', evidence: 'C-01', error })
    expect(await s.call<Evidence[]>('getEvidence')).toMatchObject([
      { call: 'C-01', status: 200, cacheHit: false, error }
    ])

    fakeQloo({
      search: { 'Night Shift Cinema': [{ entity_id: 'e-0001', name: 'Night Shift Cinema', popularity: 0.9 }] }
    })
    const again = await (await session()).importRoster('Night Shift Cinema')
    expect(again.roster[0]).toMatchObject({ resolution: 'resolved', error: null })
    expect(requests.filter((r) => r.url.pathname === '/search')).toHaveLength(2)
  })

  it('settles a show whose lookup throws after the request, and leaves the import usable', async () => {
    // A result with no name passes the gateway, then breaks the session's own matching.
    const nameless = { entity_id: 'e-0001', name: null, popularity: 0.9 } as unknown as QlooEntity
    fakeQloo({
      search: {
        'Night Shift Cinema': [nameless],
        'Deep Cuts': [{ entity_id: 'e-0002', name: 'Deep Cuts', popularity: 0.5 }]
      }
    })
    const s = await session()
    const state = await s.importRoster('Night Shift Cinema')

    expect(state.roster[0]).toMatchObject({ resolution: 'failed', evidence: 'C-01' })
    expect(state.roster[0].error).toMatch(/^The lookup failed: /)
    const again = await s.importRoster('Deep Cuts')
    expect(again.roster).toMatchObject([{ name: 'Deep Cuts', resolution: 'resolved' }])
  })

  it("returns only the calling session's own calls", async () => {
    fakeQloo({ search: {} })
    const first = await session()
    const second = await session()
    await first.importRoster('Night Shift Cinema\nDeep Cuts')
    await second.importRoster('The Ghost Signal Show')

    const queries = async (s: Session) => (await s.call<Evidence[]>('getEvidence')).map((e) => [e.call, e.params.query])
    expect(await queries(first)).toEqual([
      ['C-01', 'Night Shift Cinema'],
      ['C-02', 'Deep Cuts']
    ])
    expect(await queries(second)).toEqual([['C-01', 'The Ghost Signal Show']])
    expect(await queries(await session(first.cookie))).toHaveLength(2)
  })

  it('never sends the browser a raw response body, the API key, or the evidence log in state', async () => {
    // Each body carries a marker the app has no reason to repeat: a field it doesn't use, a proxy's
    // HTML error page (500, which is never retried), and a 200 that isn't JSON.
    fakeQloo({
      search: {
        'Night Shift Cinema': [
          {
            entity_id: 'e-0001',
            name: 'Night Shift Cinema',
            popularity: 0.91,
            properties: { description: 'raw-marker unused field' }
          }
        ],
        'Deep Cuts': {
          status: 500,
          body: '<html><body><h1>Internal Server Error</h1>raw-marker proxy page</body></html>'
        },
        'The Ghost Signal Show': { status: 200, body: '<html>raw-marker not json</html>' }
      }
    })
    const s = await session()
    await s.importRoster('Night Shift Cinema\nDeep Cuts\nThe Ghost Signal Show')
    await s.call<Evidence[]>('getEvidence')

    expect(s.state()?.roster.map((show) => [show.name, show.resolution, show.error])).toEqual([
      ['Night Shift Cinema', 'resolved', null],
      ['Deep Cuts', 'failed', 'Qloo returned 500'],
      ['The Ghost Signal Show', 'failed', "Qloo returned 200 with a body that isn't JSON"]
    ])
    const received = s.frames().join('\n')
    expect(received).not.toContain('raw-marker')
    expect(received).not.toContain('Internal Server Error')
    expect(received).not.toContain(env.QLOO_API_KEY)
    // The log is fetched on demand with getEvidence, never synced.
    const states = s.frames().filter((f) => JSON.parse(f).type === 'cf_agent_state')
    expect(states.length).toBeGreaterThan(0)
    for (const f of states) expect(f).not.toContain('latencyMs')
  })

  it("shows a call's parameters one to a line, and a list of entity IDs as its count and each ID", async () => {
    const names = ['Night Shift Cinema', 'Deep Cuts', 'Signal Boost', 'Paper Trail', 'Field Notes', 'Slow Burn']
    const id = (name: string) => `e-07${names.indexOf(name)}0`
    fakeQloo({
      search: Object.fromEntries(names.map((name) => [name, [{ entity_id: id(name), name, popularity: 0.5 }]]))
    })
    fakeInsights(names.slice(1).map((name, i) => ({ entity_id: id(name), name, affinity: 0.9 - i / 100 })))
    fakeClaude([
      turn(toolUse('resolve_entities', { names: [names[0]], type: 'urn:entity:podcast' })),
      turn(
        toolUse('rank_candidates', {
          anchor_ids: [id(names[0])],
          candidate_ids: names.slice(1).map(id),
          type: 'urn:entity:podcast'
        })
      ),
      turn(text('Ranked.'))
    ])
    const s = await session()
    await s.importRoster(names.slice(1).join('\n'))
    await s.call('startLaunch', { name: names[0] })
    const state = await s.until((state) => state.run?.status === 'completed')
    const record = (await s.call<Evidence[]>('getEvidence')).find((e) => e.call === state.ranking?.call)!

    // The inspector's Evidence tab, as the browser renders it for the ranking's call.
    const html = renderToStaticMarkup(
      createElement(EvidencePanel, { opened: { call: record.call, status: 'loaded', record } })
    )
    const param = (key: string) => hooked(html, `data-param="${key}"`)[0]
    const words = (part: string) =>
      part
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    expect(words(param('filter.type'))).toBe('filter.type urn:entity:podcast')
    expect(words(param('signal.interests.entities'))).toBe('signal.interests.entities 1 entity ID e-0700')
    // A long list folds behind its count, each ID on its own line, whole in its tooltip.
    expect(words(param('filter.results.entities'))).toBe(
      'filter.results.entities 5 entity IDs e-0710 e-0720 e-0730 e-0740 e-0750'
    )
    expect(param('filter.results.entities')).toContain('<details')
    expect([...param('filter.results.entities').matchAll(/<code\b[^>]*\stitle="(e-07\d0)"/g)].map((m) => m[1])).toEqual(
      names.slice(1).map(id)
    )
  })

  it("shows each figure in its metric's one format", () => {
    // Synthetic records of each call type, with figures as Qloo's JSON writes them: binary-float noise
    // (its answer for The Watch had "30_to_34": -0.11400000000000002), more digits than the view needs,
    // and a demographic bucket of -0, which reads as no lean either way.
    const record = (call: string, endpoint: string, results: Partial<Evidence>): Evidence => ({
      call,
      run: null,
      at: '2026-10-19T12:00:00.000Z',
      method: endpoint === '/v2/insights' ? 'POST' : 'GET',
      endpoint,
      params: {},
      status: 200,
      latencyMs: 12,
      retries: 0,
      cacheHit: false,
      error: null,
      entities: [],
      tags: [],
      affinities: [],
      ...results
    })
    const shown = (r: Evidence) =>
      renderToStaticMarkup(createElement(EvidencePanel, { opened: { call: r.call, status: 'loaded', record: r } }))
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
    const search = record('C-01', '/search', {
      entities: [
        { id: 'e-0001', name: 'Night Shift Cinema', type: 'urn:entity:podcast', popularity: 0.9971234567890123 },
        { id: 'e-0002', name: 'Deep Cuts', type: 'urn:entity:podcast', popularity: null }
      ]
    })
    const compare = record('C-02', '/v2/analysis/compare', {
      tags: [{ id: 't-0001', name: 'Film criticism', score: 0.9780580150851146 }]
    })
    const ranking = record('C-03', '/v2/insights', {
      affinities: [{ id: 'e-0002', name: 'Deep Cuts', affinity: 0.6667777, explainability: [] }]
    })
    const scores = JSON.parse(
      '[{"id":"age.25_to_29","score":-0.11400000000000002},{"id":"age.30_to_34","score":0.1234567890123456},{"id":"age.35_to_44","score":-0},{"id":"gender.male","score":0.42},{"id":"gender.female","score":-0.0004}]'
    ) as { id: string; score: number }[]
    const demographics = record('C-04', '/v2/insights', {
      params: { 'filter.type': 'urn:demographics', 'signal.interests.entities': 'e-0001' },
      affinities: [{ id: 'e-0001', name: 'Night Shift Cinema', affinity: null, explainability: scores }]
    })

    // Popularity is a percentile to one decimal, and a missing one is a dash.
    expect(shown(search)).toContain(
      'Name Popularity percentile Night Shift Cinema e-0001 urn:entity:podcast 99.7 Deep Cuts e-0002 urn:entity:podcast –'
    )
    // A tag's score and an affinity are to three decimals.
    expect(shown(compare)).toContain('Name Score Film criticism t-0001 0.978')
    expect(shown(ranking)).toContain('Name Affinity Deep Cuts e-0002 0.667')
    // A demographic score is signed to three decimals with a true minus sign, and no lean, -0 or a
    // figure that rounds to it, is 0.000, unsigned.
    const minus = '\u2212'
    expect(shown(demographics)).toContain(
      `age.25_to_29 ${minus}0.114 age.30_to_34 +0.123 age.35_to_44 0.000 gender.male +0.420 gender.female 0.000 –`
    )
  })
})
