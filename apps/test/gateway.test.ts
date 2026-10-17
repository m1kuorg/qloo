import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { State } from '../src/agent'
import type { Evidence } from '../src/evidence'
import { fakeQloo, requests } from './fake'
import { openSession, type Session } from './session'

// Synthetic shows, one exact match each.
const names = ['Night Shift Cinema', 'Deep Cuts', 'Signal Boost', 'Paper Trail', 'Field Notes', 'Open Mic Hour']
const search = Object.fromEntries(names.map((name, i) => [name, [{ entity_id: `e-0${i}01`, name, popularity: 0.5 }]]))

const open: Session[] = []
const session = async (cookie?: string) => {
  const s = await openSession(cookie)
  open.push(s)
  return s
}
afterEach(() => open.splice(0).forEach((s) => s.close()))

// Sets Worker variables for one test, as an operator would on the Worker; restored after it.
type Vars = 'QLOO_TIMEOUT_MS' | 'QLOO_MIN_INTERVAL_MS' | 'QLOO_DAILY_CALL_CAP'
const saved = new Map<Vars, string>()
const configure = (vars: Partial<Record<Vars, string>>) => {
  for (const [name, value] of Object.entries(vars) as [Vars, string][]) {
    if (!saved.has(name)) saved.set(name, env[name])
    env[name] = value
  }
}
afterEach(() => {
  for (const [name, value] of saved) env[name] = value
  saved.clear()
})

const asked = (query: string) => requests.filter((r) => r.url.searchParams.get('query') === query)
const rows = (s: Session) => s.state()?.roster.map((show) => [show.name, show.resolution, show.error])
const evidenceFor = async (s: Session, query: string) =>
  (await s.call<Evidence[]>('getEvidence')).find((e) => e.params.query === query)

describe('a slow or failing Qloo', () => {
  it('retries a 503 twice and resolves the show on the third request', async () => {
    fakeQloo({ search, first: { 'Deep Cuts': [503, 503] } })
    const s = await session()
    await s.importRoster('Night Shift Cinema\nDeep Cuts')

    expect(rows(s)).toEqual([
      ['Night Shift Cinema', 'resolved', null],
      ['Deep Cuts', 'resolved', null]
    ])
    expect(asked('Deep Cuts')).toHaveLength(3)
    expect(await evidenceFor(s, 'Deep Cuts')).toMatchObject({ status: 200, retries: 2, error: null })
  })

  it("gives up on a rate limit after two retries, with Qloo's message and what was retried", async () => {
    fakeQloo({ search: { ...search, 'Deep Cuts': 429 } })
    const s = await session()
    await s.importRoster('Deep Cuts')

    const failure = 'Qloo returned 429: Rate limit exceeded, after 2 retries'
    expect(rows(s)).toEqual([['Deep Cuts', 'failed', failure]])
    expect(asked('Deep Cuts')).toHaveLength(3)
    expect(await evidenceFor(s, 'Deep Cuts')).toMatchObject({ status: 429, retries: 2, error: failure })
  })

  it("never retries a 400, and shows Qloo's message on the show", async () => {
    fakeQloo({ search: { ...search, 'Deep Cuts': 400 } })
    const s = await session()
    await s.importRoster('Night Shift Cinema\nDeep Cuts')

    expect(rows(s)).toEqual([
      ['Night Shift Cinema', 'resolved', null],
      ['Deep Cuts', 'failed', 'Qloo returned 400: fake failure']
    ])
    expect(asked('Deep Cuts')).toHaveLength(1)
  })

  it('fails a show whose search times out three times, and tries it again on the next import', async () => {
    configure({ QLOO_TIMEOUT_MS: '100' })
    fakeQloo({ search: { ...search, 'Deep Cuts': 'hang' } })
    const s = await session()
    await s.importRoster('Night Shift Cinema\nDeep Cuts')

    const failure = "Qloo didn't answer within 0.1 s, after 2 retries"
    expect(rows(s)).toEqual([
      ['Night Shift Cinema', 'resolved', null],
      ['Deep Cuts', 'failed', failure]
    ])
    expect(asked('Deep Cuts')).toHaveLength(3)
    expect(await evidenceFor(s, 'Deep Cuts')).toMatchObject({ status: null, retries: 2, error: failure })

    await s.importRoster('Night Shift Cinema\nDeep Cuts')
    expect(asked('Deep Cuts')).toHaveLength(6)
  })

  it('answers the import at once, then fills in each show as its search settles', async () => {
    configure({ QLOO_TIMEOUT_MS: '100' })
    fakeQloo({ search: { ...search, 'Deep Cuts': 'hang' } })
    const s = await session()
    await s.call('importRoster', 'Night Shift Cinema\nDeep Cuts')

    // The call is back while both searches are out, so no client timeout can fire; each row cites
    // the call it waits on.
    const cited = (state: State) => state.roster.map((show) => [show.name, show.resolution, show.evidence])
    expect(cited(s.state()!)).toEqual([
      ['Night Shift Cinema', 'pending', 'C-01'],
      ['Deep Cuts', 'pending', 'C-02']
    ])
    const first = await s.until((state) => state.roster.some((show) => show.resolution !== 'pending'))
    expect(cited(first)).toEqual([
      ['Night Shift Cinema', 'resolved', 'C-01'],
      ['Deep Cuts', 'pending', 'C-02']
    ])
    await s.until((state) => state.roster.every((show) => show.resolution !== 'pending'))
    expect(rows(s)).toEqual([
      ['Night Shift Cinema', 'resolved', null],
      ['Deep Cuts', 'failed', "Qloo didn't answer within 0.1 s, after 2 retries"]
    ])
  })

  it('answers a comp search at once, then shows why it failed', async () => {
    configure({ QLOO_TIMEOUT_MS: '100' })
    fakeQloo({ search: { ...search, 'Night Shift Movies': 'hang' } })
    const s = await session()
    await s.importRoster('Night Shift Cinema')
    await s.call('searchComps', 'Night Shift Cinema', 'Night Shift Movies')

    // The call is back while the search is out, so no client timeout can fire.
    const comp = (state: State) => state.roster[0].compSearch
    expect(comp(s.state()!)).toEqual({
      query: 'Night Shift Movies',
      call: 'C-02',
      status: 'pending',
      results: [],
      error: null
    })
    const settled = await s.until((state) => comp(state)?.status !== 'pending')
    expect(comp(settled)).toEqual({
      query: 'Night Shift Movies',
      call: 'C-02',
      status: 'failed',
      results: [],
      error: "Qloo didn't answer within 0.1 s, after 2 retries"
    })
    expect(await evidenceFor(s, 'Night Shift Movies')).toMatchObject({ call: 'C-02', retries: 2 })
  })
})

describe('the response cache', () => {
  it('serves a search another session already made, without asking Qloo again', async () => {
    fakeQloo({ search })
    const roster = 'Night Shift Cinema\nDeep Cuts'
    const first = await session()
    await first.importRoster(roster)
    expect(requests).toHaveLength(2)

    const second = await session()
    await second.importRoster(roster)

    expect(requests).toHaveLength(2)
    expect(rows(second)).toEqual(rows(first))
    const log = await second.call<Evidence[]>('getEvidence')
    expect(log.map((e) => [e.call, e.params.query, e.status, e.retries, e.cacheHit])).toEqual([
      ['C-01', 'Night Shift Cinema', 200, 0, true],
      ['C-02', 'Deep Cuts', 200, 0, true]
    ])
    expect(log[1].entities).toEqual([{ id: 'e-0101', name: 'Deep Cuts', type: 'urn:entity:podcast', popularity: 0.5 }])
    expect((await first.call<Evidence[]>('getEvidence')).map((e) => e.cacheHit)).toEqual([false, false])
  })
})

describe('sharing Qloo between sessions', () => {
  it('keeps at most 3 requests in flight while two sessions import at once', async () => {
    fakeQloo({ search, latencyMs: 60 })
    const [a, b] = await Promise.all([session(), session()])
    await Promise.all([a.importRoster(names.slice(0, 3).join('\n')), b.importRoster(names.slice(3).join('\n'))])

    expect([...rows(a)!, ...rows(b)!].map(([, resolution]) => resolution)).toEqual(Array(6).fill('resolved'))
    expect(requests).toHaveLength(6)
    expect(Math.max(...requests.map((r) => r.inFlight))).toBe(3)
  })

  it("spaces the start of each request by the pacing interval, and doesn't count the wait as latency", async () => {
    configure({ QLOO_MIN_INTERVAL_MS: '40' })
    fakeQloo({ search })
    const s = await session()
    await s.importRoster(names.slice(0, 4).join('\n'))

    expect(requests).toHaveLength(4)
    const starts = requests.map((r) => r.at)
    // Timers fire late, never early; the slack covers how late each request reaches the fake.
    for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(30)
    // The fake answers at once, so latency is well under one interval though the last call waited three.
    const log = await s.call<Evidence[]>('getEvidence')
    expect(log.map((e) => e.latencyMs).filter((ms) => ms >= 40)).toEqual([])
  })
})

describe('the daily cap', () => {
  afterEach(() => vi.useRealTimers())

  it('refuses calls past the cap, says so on the show, and starts over on the next UTC day', async () => {
    configure({ QLOO_DAILY_CALL_CAP: '5' })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-17T23:59:00Z'))
    fakeQloo({ search })
    const s = await session()
    await s.importRoster(names.join('\n'))

    const capped = 'The daily cap of 5 Qloo calls is reached; it resets at 00:00 UTC'
    expect(requests).toHaveLength(5)
    const refused = s.state()!.roster.filter((show) => show.resolution === 'failed')
    expect(refused.map((show) => show.error)).toEqual([capped])
    expect(await evidenceFor(s, refused[0].name)).toMatchObject({
      status: null,
      retries: 0,
      cacheHit: false,
      error: capped
    })

    vi.setSystemTime(new Date('2026-10-18T00:01:00Z'))
    await s.importRoster(names.join('\n'))

    expect(requests).toHaveLength(6)
    expect(asked(refused[0].name)).toHaveLength(1)
    expect(rows(s)?.map(([, resolution]) => resolution)).toEqual(Array(6).fill('resolved'))
  })
})
