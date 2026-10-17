import { env, exports } from 'cloudflare:workers'
import { http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import type { Evidence } from '../src/evidence'
import { fakeQloo, network, requests } from './fake'
import { openSession, type Session } from './session'

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

  it('keeps the roster for the session and starts a new session empty', async () => {
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

    const stranger = await session()
    expect(stranger.cookie).not.toBe(first.cookie)
    expect(stranger.state()?.roster).toEqual([])
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

describe('session routing', () => {
  it('reaches only the agent named by the session cookie', async () => {
    const upgrade = { headers: { Upgrade: 'websocket' } }
    expect((await exports.default.fetch('https://crossfeed.test/agents/session', upgrade)).status).toBe(401)
    for (const path of ['/agents/qloo-gateway/global', '/agents/crossfeed-agent/someone-else']) {
      expect((await exports.default.fetch(`https://crossfeed.test${path}`, upgrade)).status).toBe(404)
    }
  })
})
