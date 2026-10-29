import { env } from 'cloudflare:workers'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EvidencePanel, namesOf } from '../src/client/Evidence'
import type { Evidence } from '../src/evidence'
import { QlooGateway } from '../src/gateway'
import { fakeClaude, fakeInsights, fakeQloo, requests, text, toolUse, turn, type QlooEntity } from './fake'
import { hooked, openSession, sections, type Session } from './session'

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

// A rendered part's words, as a reader hears them.
const words = (part: string) =>
  part
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

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

  it('says in words what a ranking sent and when, naming every entity, and keeps its IDs in the stored record', async () => {
    // A launch ranked against itself and one roster show, the 16 other shows its candidates, each with
    // a Qloo ID shaped as Qloo's are.
    const launch = 'Night Shift Cinema'
    const roster = [
      'Deep Cuts',
      'Signal Boost',
      'Paper Trail',
      'Field Notes',
      'Slow Burn',
      'Ghost Signal',
      'Corner Booth',
      'Paper Route',
      'Late Fee',
      'Pilot Season',
      'Overtime Desk',
      'Credits Roll',
      'Rerun Radio',
      'The Long Take',
      'Box Office Brawl',
      'Small Screen Club',
      'Night Ferry'
    ]
    const names = [launch, ...roster]
    const id = (name: string) => `D95B20A8-0CEA-4BDC-8074-${String(names.indexOf(name)).padStart(12, '0')}`
    const candidates = roster.slice(1)
    fakeQloo({
      search: Object.fromEntries(names.map((name) => [name, [{ entity_id: id(name), name, popularity: 0.5 }]]))
    })
    fakeInsights(candidates.map((name, i) => ({ entity_id: id(name), name, affinity: 0.9 - i / 100 })))
    fakeClaude([
      turn(toolUse('resolve_entities', { names: [launch], type: 'urn:entity:podcast' })),
      turn(
        toolUse('rank_candidates', {
          anchor_ids: [id(launch), id(roster[0])],
          candidate_ids: candidates.map(id),
          type: 'urn:entity:podcast'
        })
      ),
      turn(text('Ranked.'))
    ])
    const s = await session()
    await s.importRoster(roster.join('\n'))
    await s.call('startLaunch', { name: launch })
    const state = await s.until((state) => state.run?.status === 'completed')
    const log = await s.call<Evidence[]>('getEvidence')
    const record = log.find((e) => e.call === state.ranking?.call)!

    // The inspector's Evidence tab, as the browser renders it for the ranking's call, its names drawn
    // from the session's log.
    const html = renderToStaticMarkup(
      createElement(EvidencePanel, {
        opened: { call: record.call, status: 'loaded', record },
        names: namesOf(log),
        runs: state.runs
      })
    )
    // Everything above what Qloo returned.
    const view = html.slice(0, html.indexOf('<table'))
    expect(words(view)).toContain(`Evidence · ${record.call} Qloo data Qloo scored 16 of 16 candidates.`)
    expect(words(view)).toMatch(
      /Request POST \/v2\/insights Status 200 Called [A-Z][a-z]{2} \d{1,2}, \d{2}:\d{2}:\d{2} · [\d,]+ ms Run Run 1 /
    )
    expect(words(view)).toContain(
      `What was sent Type Podcast Ranked against ${launch} and ${roster[0]} Candidates 16 podcasts ${candidates.join(' ')} Explainability On Results Up to 50`
    )
    // A list of more than three folds behind its count.
    expect(view).toMatch(/<details\b(?![^>]*\sopen)[^>]*><summary\b[^>]*>16 podcasts</)
    expect(view).not.toMatch(/[0-9A-F]{8}-[0-9A-F]{4}-/i)
    expect(view).not.toContain('urn:')
    // The stored record, closed, keeps the request as it was sent.
    const stored = hooked(html, 'data-stored')[0]
    expect(stored).toMatch(/^<details\b(?![^>]*\sopen)/)
    expect(words(stored)).toMatch(/^Stored record Copy /)
    for (const name of names) expect(stored).toContain(id(name))
    expect(stored).toContain('urn:entity:podcast')
  })

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
  const search = record('C-01', '/search', {
    params: { query: 'Night Shift Cinema', types: 'urn:entity:podcast', take: 5 },
    entities: [
      { id: 'e-0001', name: 'Night Shift Cinema', type: 'urn:entity:podcast', popularity: 0.9971234567890123 },
      { id: 'e-0002', name: 'Deep Cuts', type: 'urn:entity:podcast', popularity: null }
    ]
  })
  const compare = record('C-02', '/v2/analysis/compare', {
    params: { 'a.signal.interests.entities': 'e-0001', 'b.signal.interests.entities': 'e-0002', take: 50 },
    tags: [{ id: 't-0001', name: 'Film criticism', score: 0.9780580150851146 }]
  })
  const ranking = record('C-03', '/v2/insights', {
    params: {
      'filter.type': 'urn:entity:podcast',
      'signal.interests.entities': 'e-0001',
      'filter.results.entities': 'e-0002,e-0003',
      'feature.explainability': true,
      take: 50
    },
    affinities: [{ id: 'e-0002', name: 'Deep Cuts', affinity: 0.6667777, explainability: [] }]
  })
  const scores = JSON.parse(
    '[{"id":"age.25_to_29","score":-0.11400000000000002},{"id":"age.30_to_34","score":0.1234567890123456},{"id":"age.35_to_44","score":-0},{"id":"gender.male","score":0.42},{"id":"gender.female","score":-0.0004}]'
  ) as { id: string; score: number }[]
  const demographics = record('C-04', '/v2/insights', {
    params: { 'filter.type': 'urn:demographics', 'signal.interests.entities': 'e-0001' },
    affinities: [{ id: 'e-0001', name: 'Night Shift Cinema', affinity: null, explainability: scores }]
  })
  // The Evidence tab for a record, its names drawn from `log`, as the session's log would hold it.
  const panel = (r: Evidence, log = [r]) =>
    renderToStaticMarkup(
      createElement(EvidencePanel, {
        opened: { call: r.call, status: 'loaded', record: r },
        names: namesOf(log),
        runs: []
      })
    )
  const shown = (r: Evidence, log?: Evidence[]) => words(panel(r, log))

  it("shows each figure in its metric's one format", () => {
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

  it('keeps each figure exactly as Qloo wrote it in the stored record, and only there', () => {
    const exact: [Evidence, string[]][] = [
      [search, ['0.9971234567890123']],
      [compare, ['0.9780580150851146']],
      [ranking, ['0.6667777']],
      [demographics, ['-0.11400000000000002', '0.1234567890123456', '-0.0004']]
    ]
    for (const [r, figures] of exact) {
      const html = panel(r)
      const stored = hooked(html, 'data-stored')[0]
      for (const figure of figures) {
        expect(stored, r.call).toContain(figure)
        expect(html.replace(stored, ''), r.call).not.toContain(figure)
      }
    }
  })

  it('says what each call did, by its outcome, and what it sent, in words', () => {
    const sentence = (r: Evidence, log?: Evidence[]) => sections(panel(r, log))[0]
    expect(sentence(search)).toEqual(['Evidence · C-01 Qloo data', 'Qloo’s search returned 2 podcasts.'])
    expect(sentence(compare)).toEqual([
      'Evidence · C-02 Qloo data',
      'Qloo returned 1 tag the two sides’ listeners share.'
    ])
    expect(sentence(ranking)).toEqual(['Evidence · C-03 Qloo data', 'Qloo scored 1 of 2 candidates.'])
    // The entities' type is a search's, from the log.
    expect(sentence(demographics, [search, demographics])).toEqual([
      'Evidence · C-04 Qloo data',
      'Qloo returned listener age and gender for 1 podcast.'
    ])
    expect(shown(search)).toContain(
      'Request GET /search Status 200 Called Oct 19, 12:00:00 · 12 ms What was sent Search “Night Shift Cinema” Type Podcast Results Up to 5 '
    )
    expect(shown({ ...search, cacheHit: true })).toContain(
      'Called Oct 19, 12:00:00 · 12 ms · from the cache What was sent'
    )
    expect(shown(compare, [search, compare])).toContain(
      'What was sent Compared Night Shift Cinema With Deep Cuts Results Up to 50 '
    )
    // An ID no record names is a short code, whole in its tooltip.
    expect(shown(ranking, [search, ranking])).toContain(
      'What was sent Type Podcast Ranked against Night Shift Cinema Candidates Deep Cuts and e-0003 Explainability On Results Up to 50 '
    )
    expect(panel(ranking)).toContain('title="e-0003"')
    expect(shown(demographics, [search, demographics])).toContain(
      'What was sent Type Demographics For Night Shift Cinema '
    )

    // A failed call says what failed, its status, and its error.
    const limited = record('C-05', '/search', {
      params: { query: 'Deep Cuts', types: 'urn:entity:podcast', take: 5 },
      status: 429,
      retries: 2,
      error: 'Qloo returned 429: Rate limit exceeded, after 2 retries'
    })
    expect(sentence(limited)).toEqual(['Evidence · C-05 Qloo data', 'The search failed.'])
    expect(shown(limited)).toContain(
      'Status 429 Called Oct 19, 12:00:00 · 12 ms · 2 retries Error Qloo returned 429: Rate limit exceeded, after 2 retries What was sent'
    )
    const unasked = '0B8D2671-52FC-4AD8-9934-286693100000'
    const ignored = record('C-06', '/v2/insights', {
      params: demographics.params,
      error: `Qloo returned demographics for ${unasked}, which wasn't asked about, so it ignored the signal`
    })
    expect(sentence(ignored)).toEqual(['Evidence · C-06 Qloo data', 'The demographic check failed.'])
    expect(shown(ignored)).toMatch(
      /Error Qloo returned demographics for 0B8D2671 ?, which wasn't asked about, so it ignored the signal/
    )
    expect(panel(ignored)).toContain(`title="${unasked}"`)
    // A call the gateway threw on kept no parameters, so there's nothing to say was sent.
    const thrown = record('C-07', '/v2/insights', { status: null, error: 'The Qloo gateway failed: It is overloaded.' })
    expect(sentence(thrown)).toEqual([
      'Evidence · C-07 Qloo data',
      'The Qloo request behind a call, and what Qloo returned.'
    ])
    expect(shown(thrown)).toContain('Status No response')
    expect(shown(thrown)).not.toContain('What was sent')
  })

  it('names the entities in a failed ranking’s error, never their IDs', async () => {
    const id = (n: number) => `9F5E5C2B-B52E-47C2-B8AF-${String(n).padStart(12, '0')}`
    const shows = ['Night Shift Cinema', 'Deep Cuts', 'Signal Boost']
    fakeQloo({
      search: Object.fromEntries(shows.map((name, i) => [name, [{ entity_id: id(i), name, popularity: 0.5 }]]))
    })
    fakeInsights([
      { entity_id: id(1), name: 'Deep Cuts', affinity: 0.9 },
      { entity_id: id(9), name: 'Someone Else’s Show', affinity: 0.8 }
    ])
    fakeClaude([
      turn(toolUse('resolve_entities', { names: [shows[0]], type: 'urn:entity:podcast' })),
      turn(
        toolUse('rank_candidates', { anchor_ids: [id(0)], candidate_ids: [id(1), id(2)], type: 'urn:entity:podcast' })
      ),
      turn(text('Stopped.'))
    ])
    const s = await session()
    await s.importRoster(shows.slice(1).join('\n'))
    await s.call('startLaunch', { name: shows[0] })
    const state = await s.until((state) => state.run?.status === 'completed')
    const log = await s.call<Evidence[]>('getEvidence')
    const failed = log.find((e) => e.call === state.ranking?.call)!
    expect(failed.error).toBe(
      `Qloo ranked Someone Else’s Show (${id(9)}), outside the candidate list, so it ignored the list`
    )

    const html = panel(failed, log)
    expect(sections(html)[0]).toEqual([`Evidence · ${failed.call} Qloo data`, 'The ranking failed.'])
    const view = html.slice(0, html.indexOf('<table'))
    expect(words(view)).toContain('Status 200 Called')
    expect(words(view)).toContain(
      'Error Qloo ranked Someone Else’s Show, outside the candidate list, so it ignored the list What was sent Type Podcast Ranked against Night Shift Cinema Candidates Deep Cuts and Signal Boost'
    )
    expect(view).not.toMatch(/[0-9A-F]{8}-[0-9A-F]{4}-/i)
  })
})
