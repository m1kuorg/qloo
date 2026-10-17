import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it } from 'vitest'
import type { Evidence } from '../src/evidence'
import { fakeQloo, type QlooEntity } from './fake'
import { openSession, type Session } from './session'

const open: Session[] = []
const session = async (cookie?: string) => {
  const s = await openSession(cookie)
  open.push(s)
  return s
}
afterEach(() => open.splice(0).forEach((s) => s.close()))

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
    // A 200 whose results aren't a list makes the gateway's own code throw, past its failure values.
    fakeQloo({ search: { 'Night Shift Cinema': { status: 200, body: '{"results": {"not": "a list"}}' } } })
    const s = await session()
    const state = await s.importRoster('Night Shift Cinema')

    const show = state.roster[0]
    expect(show).toMatchObject({ resolution: 'failed', evidence: 'C-01' })
    expect(show.error).toContain('The Qloo gateway failed')
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
})
