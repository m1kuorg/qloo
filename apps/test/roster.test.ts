import { env, exports } from 'cloudflare:workers'
import { http } from 'msw'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import type { State } from '../src/agent'
import { Workspace, type Session as Agent } from '../src/client/App'
import { ShowEditor } from '../src/client/RosterModules'
import type { Evidence } from '../src/evidence'
import { fakeQloo, network, requests } from './fake'
import { links, openSession, type Session } from './session'

// Synthetic shows: one exact match, one name shared by two spin-off feeds, one Qloo doesn't have.
const search = {
  'Night Shift Cinema': [
    { entity_id: 'e-0001', name: 'Night Shift Cinema', popularity: 0.91 },
    { entity_id: 'e-0002', name: 'Night Shift Cinema Club', popularity: 0.4 }
  ],
  'Deep Cuts': [
    { entity_id: 'e-0101', name: 'Deep Cuts: Marvel', popularity: 0.97 },
    { entity_id: 'e-0102', name: 'Deep Cuts: Harry Potter', popularity: 0.62 },
    { entity_id: 'e-0103', name: 'Cut Deep', popularity: 0.12 }
  ],
  'The Ghost Signal Show': [
    { entity_id: 'e-0201', name: 'The Ghost Hour Show', popularity: 0.88 },
    { entity_id: 'e-0202', name: 'Signal Boost', popularity: 0.3 }
  ]
}

const roster = 'Night Shift Cinema\n\n  Deep Cuts  \nThe Ghost Signal Show\n'

// A pasted name carries no figures, has no comp search yet, and starts included.
const pasted = { compSearch: null, downloads: null, status: null, description: null, excluded: false }

const open: Session[] = []
const session = async (cookie?: string) => {
  const s = await openSession(cookie)
  open.push(s)
  return s
}
afterEach(() => open.splice(0).forEach((s) => s.close()))

describe('importing a pasted roster', () => {
  it('shows each show as resolved, ambiguous with candidates, or missed', async () => {
    fakeQloo({ search })
    const s = await session()
    expect(s.state()?.roster).toEqual([])

    await s.importRoster(roster)

    expect(s.state()?.roster).toEqual([
      {
        name: 'Night Shift Cinema',
        resolution: 'resolved',
        entity: { id: 'e-0001', name: 'Night Shift Cinema', popularity: 0.91 },
        candidates: [],
        evidence: 'C-01',
        error: null,
        ...pasted
      },
      {
        name: 'Deep Cuts',
        resolution: 'ambiguous',
        entity: null,
        candidates: [
          { id: 'e-0101', name: 'Deep Cuts: Marvel', popularity: 0.97 },
          { id: 'e-0102', name: 'Deep Cuts: Harry Potter', popularity: 0.62 },
          { id: 'e-0103', name: 'Cut Deep', popularity: 0.12 }
        ],
        evidence: 'C-02',
        error: null,
        ...pasted
      },
      {
        name: 'The Ghost Signal Show',
        resolution: 'missed',
        entity: null,
        candidates: [],
        evidence: 'C-03',
        error: null,
        ...pasted
      }
    ])
  })

  it('searches Qloo once per show with the key header and the podcast type', async () => {
    fakeQloo({ search })
    const s = await session()
    await s.importRoster(roster)

    expect(requests.map((r) => r.url.searchParams.get('query')).sort()).toEqual(
      ['Deep Cuts', 'Night Shift Cinema', 'The Ghost Signal Show'].sort()
    )
    for (const r of requests) {
      expect(r.method).toBe('GET')
      expect(r.headers.get('x-api-key')).toBe('test-qloo-key')
      expect(r.url.searchParams.get('types')).toBe('urn:entity:podcast')
      expect(r.url.searchParams.get('take')).toBe('3')
    }
  })

  // A new session opens on the sample network instead; see sample.test.ts.
  it('keeps the roster for the session', async () => {
    fakeQloo({ search })
    const first = await session()
    await first.importRoster(roster)
    first.close()

    const reloaded = await session(first.cookie)
    expect(reloaded.state()?.roster.map((show) => show.name)).toEqual([
      'Night Shift Cinema',
      'Deep Cuts',
      'The Ghost Signal Show'
    ])
  })

  it('appends an evidence record for every Qloo call, to the calling session only', async () => {
    fakeQloo({ search })
    const s = await session()
    await s.importRoster(roster)

    const log = await s.call<Evidence[]>('getEvidence')
    expect(log.map((e) => e.call)).toEqual(['C-01', 'C-02', 'C-03'])
    const deepCuts = log.find((e) => e.params.query === 'Deep Cuts')!
    expect(deepCuts).toMatchObject({
      run: null,
      method: 'GET',
      endpoint: '/search',
      params: { query: 'Deep Cuts', types: 'urn:entity:podcast', take: 3 },
      status: 200,
      retries: 0,
      cacheHit: false,
      error: null,
      entities: [
        { id: 'e-0101', name: 'Deep Cuts: Marvel', type: 'urn:entity:podcast', popularity: 0.97 },
        { id: 'e-0102', name: 'Deep Cuts: Harry Potter', type: 'urn:entity:podcast', popularity: 0.62 },
        { id: 'e-0103', name: 'Cut Deep', type: 'urn:entity:podcast', popularity: 0.12 }
      ],
      tags: [],
      affinities: []
    })
    expect(deepCuts.latencyMs).toBeGreaterThanOrEqual(0)
    expect(JSON.stringify(log)).not.toContain(env.QLOO_API_KEY)

    const other = await session()
    expect(await other.call<Evidence[]>('getEvidence')).toEqual([])
  })

  it('treats an empty search, or the 404 Qloo documents for one, as a miss', async () => {
    fakeQloo({ search: { 'Gone Pod': 404 } })
    const s = await session()
    await s.importRoster('Unknown Pod\nGone Pod')

    expect(s.state()?.roster).toEqual([
      {
        name: 'Unknown Pod',
        resolution: 'missed',
        entity: null,
        candidates: [],
        evidence: 'C-01',
        error: null,
        ...pasted
      },
      { name: 'Gone Pod', resolution: 'missed', entity: null, candidates: [], evidence: 'C-02', error: null, ...pasted }
    ])
    expect(await s.call<Evidence[]>('getEvidence')).toMatchObject([
      { status: 200, error: null, entities: [] },
      { status: 404, error: null, entities: [] }
    ])
  })

  it('marks a show whose search failed as failed, with the reason, and logs the call', async () => {
    fakeQloo({ search: { ...search, 'Deep Cuts': 500 } })
    const s = await session()
    await s.importRoster(roster)

    expect(s.state()?.roster.map((show) => [show.name, show.resolution, show.error])).toEqual([
      ['Night Shift Cinema', 'resolved', null],
      ['Deep Cuts', 'failed', 'Qloo returned 500: fake failure'],
      ['The Ghost Signal Show', 'missed', null]
    ])
    const log = await s.call<Evidence[]>('getEvidence')
    expect(log.find((e) => e.params.query === 'Deep Cuts')).toMatchObject({
      status: 500,
      error: 'Qloo returned 500: fake failure',
      entities: []
    })
  })

  it('refuses another import while the first is still looking up its shows', async () => {
    fakeQloo({ search })
    // Holds every search until released; returning nothing hands the request on to fakeQloo.
    const held = Promise.withResolvers<void>()
    network.use(http.get(`${env.QLOO_BASE_URL}/search`, () => held.promise))
    const s = await session()
    await s.call('importRoster', roster)

    await expect(s.call('importRoster', 'Some Other Show')).rejects.toThrow(
      'The last import is still looking up its shows. Wait for it to finish.'
    )
    held.resolve()
    const settled = await s.until((state) => state.roster.every((show) => show.resolution !== 'pending'))
    expect(settled.roster.map((show) => [show.name, show.resolution])).toEqual([
      ['Night Shift Cinema', 'resolved'],
      ['Deep Cuts', 'ambiguous'],
      ['The Ghost Signal Show', 'missed']
    ])
    expect(requests).toHaveLength(3)
  })

  it('keeps a change made while a show is looked up, but takes a comp only once its search lands', async () => {
    fakeQloo({ search })
    const held = Promise.withResolvers<void>()
    network.use(
      http.get(`${env.QLOO_BASE_URL}/search`, ({ request }) =>
        new URL(request.url).searchParams.get('query') === 'Deep Cuts' ? held.promise : undefined
      )
    )
    const s = await session()
    await s.call('importRoster', 'Deep Cuts')

    await expect(s.call('searchComps', 'Deep Cuts', 'Cut Deep')).rejects.toThrow(
      'Deep Cuts is still being looked up in Qloo.'
    )
    await s.call('updateShow', 'Deep Cuts', { excluded: true })
    held.resolve()
    const settled = await s.until((state) => state.roster.every((show) => show.resolution !== 'pending'))
    expect(settled.roster).toMatchObject([
      { name: 'Deep Cuts', resolution: 'ambiguous', excluded: true, compSearch: null }
    ])
  })

  it('refuses a comp search over 200 characters, and searches nothing', async () => {
    fakeQloo({ search })
    const s = await session()
    await s.importRoster(roster)
    const sent = requests.length

    await expect(s.call('searchComps', 'Deep Cuts', 'C'.repeat(201))).rejects.toThrow(
      'Use a show name of at most 200 characters.'
    )
    expect(requests).toHaveLength(sent)
  })

  it('refuses state written by the client', async () => {
    fakeQloo({ search })
    const s = await session()
    await s.importRoster(roster)

    const forged = { roster: [{ name: 'Forged', resolution: 'resolved' }] }
    const reply = await s.send({ type: 'cf_agent_state', state: forged }, 'cf_agent_state_error')
    expect(reply.type).toBe('cf_agent_state_error')

    const reloaded = await session(s.cookie)
    expect(reloaded.state()?.roster).toHaveLength(3)
  })
})

describe('the roster as the demo shows it', () => {
  // The page's words, as a visitor reads them, and its HTML, from the session's synced state.
  const words = (html: string) =>
    html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#x27;|&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim()
  const agentOf = (state: State) => ({ state, stub: {} }) as unknown as Agent
  const workspace = (state: State) => renderToStaticMarkup(createElement(Workspace, { agent: agentOf(state), links }))
  // The inspector's Show tab for one of the roster's shows, as selecting its row opens it.
  const editor = (state: State, name: string) =>
    renderToStaticMarkup(
      createElement(ShowEditor, {
        show: state.roster.find((show) => show.name === name)!,
        agent: agentOf(state),
        close: () => {},
        openCall: () => {},
        opened: null
      })
    )

  it('counts the shows by match, and lists each with its match and a way to settle it', async () => {
    fakeQloo({ search })
    const s = await session()
    const html = workspace(await s.importRoster(roster))

    const read = words(html)
    expect(read).toContain('Roster 3 shows: 1 resolved, 1 ambiguous, 1 missed')
    expect(read).toContain(
      'Show Match Qloo entity · popularity percentile Downloads per episode Status Call Night Shift Cinema Resolved Night Shift Cinema 91.0 – – C-01'
    )
    expect(read).toContain(
      'Deep Cuts Ambiguous Deep Cuts: Marvel 97.0 Deep Cuts: Harry Potter 62.0 Cut Deep 12.0 Pick the match – – C-02'
    )
    expect(read).toContain(
      'The Ghost Signal Show Missed No show by this name in Qloo. Map a comp or leave out – – C-03'
    )
    // Each show's name opens it in the inspector's Show tab.
    expect([...html.matchAll(/<button\b[^>]*\sdata-open-show[^>]*>([^<]*)<\/button>/g)].map((m) => m[1])).toEqual([
      'Night Shift Cinema',
      'Deep Cuts',
      'The Ghost Signal Show'
    ])
    expect(html).toMatch(/<tr\b(?=[^>]*\sdata-resolution="ambiguous")[^>]*>/)
  })

  it('opens an ambiguous show to pick its match, edit its figures, or leave it out', async () => {
    fakeQloo({ search })
    const s = await session()
    const html = editor(await s.importRoster(roster), 'Deep Cuts')

    expect(html).toMatch(/<h2\b[^>]*\sid="show-ed"[^>]*>Deep Cuts<\/h2>/)
    expect(words(html)).toContain(
      'Deep Cuts Close Ambiguous Which Qloo show is Deep Cuts? Deep Cuts: Marvel 97.0 Deep Cuts: Harry Potter 62.0 Cut Deep 12.0 Use this match Candidates from Qloo search C-02 Or map it to a comparable show Search Downloads per episode Status Save Leave out Excluded shows are never proposed.'
    )
    expect(html).toMatch(/<label\b[^>]*\sfor="comp-q"/)
    expect(html).toMatch(/<input\b[^>]*\sid="comp-q"/)
  })

  it('maps a missed show to a comp from its search, then counts it as mapped', async () => {
    fakeQloo({
      search: { ...search, 'Ghost Hour': [{ entity_id: 'e-0201', name: 'The Ghost Hour Show', popularity: 0.88 }] }
    })
    const s = await session()
    await s.importRoster(roster)
    const searched = await s.searchComps('The Ghost Signal Show', 'Ghost Hour')

    expect(words(editor(searched, 'The Ghost Signal Show'))).toContain(
      'The Ghost Signal Show Close Missed Map it to a comparable show Search Results for “Ghost Hour” The Ghost Hour Show 88.0 Map to comp Qloo search C-04 Downloads per episode'
    )
    await s.call('updateShow', 'The Ghost Signal Show', { compId: 'e-0201' })
    const read = words(workspace(s.state()!))
    expect(read).toContain('Roster 3 shows: 1 resolved, 1 mapped to a comp, 1 ambiguous')
    expect(read).toContain('The Ghost Signal Show Mapped Mapped to The Ghost Hour Show 88.0 – – C-04')
  })

  it('says a comp search is under way, citing its call, until Qloo answers', async () => {
    fakeQloo({ search })
    const s = await session()
    await s.importRoster(roster)
    // Holds the comp search until released; returning nothing hands the request on to fakeQloo.
    const held = Promise.withResolvers<void>()
    network.use(
      http.get(`${env.QLOO_BASE_URL}/search`, ({ request }) =>
        new URL(request.url).searchParams.get('query') === 'Ghost Hour' ? held.promise : undefined
      )
    )
    await s.call('searchComps', 'The Ghost Signal Show', 'Ghost Hour')

    const html = editor(s.state()!, 'The Ghost Signal Show')
    expect(html).toMatch(/<p\b[^>]*\srole="status"[^>]*>[\s\S]*Searching Qloo for “Ghost Hour”…/)
    expect(words(html)).toContain('Searching Qloo for “Ghost Hour”… C-04')
    held.resolve()
    const done = await s.until((st) => st.roster.some((show) => show.compSearch?.status === 'done'))
    expect(words(editor(done, 'The Ghost Signal Show'))).toContain('No podcasts in Qloo match “Ghost Hour”. C-04')
  })

  it('marks a show left out, counted apart, and offers to include it again', async () => {
    fakeQloo({ search })
    const s = await session()
    await s.importRoster(roster)
    await s.call('updateShow', 'The Ghost Signal Show', { excluded: true })

    const html = workspace(s.state()!)
    expect(words(html)).toContain('Roster 3 shows: 1 resolved, 1 ambiguous, 1 excluded')
    // Left out, it needs nothing settled.
    expect(words(html)).toContain('The Ghost Signal Show Missed Excluded No show by this name in Qloo. – – C-03')
    expect(html).toMatch(/<tr\b(?=[^>]*\sdata-excluded="true")[^>]*>\s*<th\b[^>]*>[\s\S]*?The Ghost Signal Show/)
    expect(words(editor(s.state()!, 'The Ghost Signal Show'))).toContain(
      'Include again Excluded: kept here, never proposed for a launch.'
    )
  })
})

describe('session routing', () => {
  it('reaches only the agent named by the session cookie', async () => {
    const upgrade = { headers: { Upgrade: 'websocket' } }
    expect((await exports.default.fetch('https://crossfeed.test/agents/session', upgrade)).status).toBe(401)
    for (const path of ['/agents/qloo-gateway/global', '/agents/crossfeed-agent/someone-else']) {
      expect((await exports.default.fetch(`https://crossfeed.test${path}`, upgrade)).status).toBe(404)
    }
  })
})
