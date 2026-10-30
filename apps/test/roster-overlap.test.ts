// The roster's overlap: one closed-list ranking in Qloo per distinct entity the roster's shows are matched
// or mapped to, measured from a member's page or through the REST API, kept in the network's synced
// state as each show's closest shows, and read back with its close pairs, and the roster page's Overlap
// tab, which shows it. Each test drives a member's network through its agent's client protocol or the
// API, against the fake Qloo, and renders the page from the synced state.
import { evictAllDurableObjects, runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import type { State } from '../src/agent'
import type { NetworkConnection } from '../src/client/NetworkPage'
import { NetworkRoster } from '../src/client/Roster'
import type { Evidence } from '../src/evidence'
import type { NetworkAgent } from '../src/network-agent'
import type { RosterOverlap } from '../src/operations'
import { fakeInsights, fakeQloo, requests, type Insight } from './fake'
import { hooked, networkWithKey, openMember, poll, sections, tabsOf, type Session } from './session'

// Made-up shows, each its own Qloo entity at a made-up place on a line, so a show's listeners overlap
// most with the shows nearest it; and Paper Trail, which Qloo has no match for until it's mapped.
const places: Record<string, number> = {
  'Deep Cuts': 0,
  'Signal Boost': 1,
  'Field Notes': 3,
  'Corner Booth': 10,
  'Slow Burn': 13,
  'Night Ferry': 21,
  'Static Bloom': 27
}
const names = Object.keys(places)
const id = (name: string) => `e-000${names.indexOf(name) + 1}`
const nameOf = (entity: string) => names.find((n) => id(n) === entity)!
const search = {
  ...Object.fromEntries(names.map((n) => [n, [{ entity_id: id(n), name: n, popularity: 0.5 }]])),
  'Paper Trail': [],
  'Paper Trail Weekly': [{ entity_id: 'e-0008', name: 'Paper Trail Weekly', popularity: 0.4 }]
}

// Qloo's ranking of the candidates against the one anchor: the nearer a show's place, the higher its
// affinity. Made-up scores, unlike any Qloo returns.
const overlapping = (body: Record<string, unknown>): Insight[] => {
  const anchor = nameOf(String(body['signal.interests.entities']))
  return String(body['filter.results.entities'])
    .split(',')
    .map((c) => ({
      entity_id: c,
      name: nameOf(c) ?? c,
      affinity: 0.95 - Math.abs(places[anchor] - places[nameOf(c)]) / 100
    }))
}

// The anchor of each ranking in the network's evidence, in the order they were asked, cache hits included.
const anchorsAsked = async (agent: Omit<Session, 'cookie'>) =>
  (await agent.call<Evidence[]>('getEvidence'))
    .filter((e) => e.endpoint === '/v2/insights')
    .map((e) => e.params['signal.interests.entities'])

// The insights requests Qloo got, as their bodies.
const rankings = () =>
  requests.filter((r) => r.url.pathname === '/v2/insights').map((r) => JSON.parse(r.body) as Record<string, unknown>)

const saved = {
  QLOO_VISITOR_DAILY_CALL_CAP: env.QLOO_VISITOR_DAILY_CALL_CAP,
  QLOO_DAILY_CALL_CAP: env.QLOO_DAILY_CALL_CAP,
  QLOO_TIMEOUT_MS: env.QLOO_TIMEOUT_MS
}
const open: Omit<Session, 'cookie'>[] = []
afterEach(() => {
  Object.assign(env, saved)
  open.splice(0).forEach((agent) => agent.close())
})

// A member's network with an API key, its roster imported and settled from a page, as its roster page
// imports one.
async function network(roster: string[]) {
  const { ada, network, call } = await networkWithKey()
  const agent = await ada.connect(`/agents/network/${network}`, {})
  open.push(agent)
  await agent.importRoster(roster.join('\n'))
  return { ada, network, call, agent }
}

const measured = (s: State) => s.overlap !== undefined && s.overlap.status !== 'measuring'
const four = ['Deep Cuts', 'Signal Boost', 'Field Notes', 'Corner Booth']

describe("measuring the roster's overlap", () => {
  it('ranks the rest of the roster against each distinct entity once, left-out shows included', async () => {
    fakeQloo({ search })
    fakeInsights(overlapping)
    const {
      ada,
      network: id_,
      call,
      agent
    } = await network([
      'Static Bloom',
      'Field Notes',
      'Deep Cuts',
      'Paper Trail',
      'Corner Booth',
      'Signal Boost',
      'Slow Burn',
      'Night Ferry'
    ])
    // Paper Trail stands in for Deep Cuts through a comp search for it, so the two are one Qloo show, and
    // Night Ferry is left out of launches.
    await agent.searchComps('Paper Trail', 'Deep Cuts')
    await agent.call('updateShow', 'Paper Trail', { compId: id('Deep Cuts') })
    await agent.call('updateShow', 'Night Ferry', { excluded: true })

    await agent.call('measureOverlap')
    const state = await agent.until(measured)

    // One ranking per entity, Deep Cuts' once: that entity the only anchor, the other six the candidates,
    // sorted by ID whatever the roster's order, with explainability.
    const ids = names.map(id).toSorted()
    expect(
      rankings().toSorted((a, b) =>
        String(a['signal.interests.entities']).localeCompare(String(b['signal.interests.entities']))
      )
    ).toEqual(
      ids.map((anchor) => ({
        'filter.type': 'urn:entity:podcast',
        'signal.interests.entities': anchor,
        'filter.results.entities': ids.filter((c) => c !== anchor).join(','),
        'feature.explainability': true,
        take: 50
      }))
    )
    // Each show's closest shows: 2 of 7, the top band of each one's ranking of the other six. The
    // calls follow the 8 lookups and the comp search, numbered in entity order.
    const closest = (...shows: string[]) => shows.map((n, i) => ({ id: id(n), name: n, rank: i + 1, band: 'top' }))
    expect(state.overlap).toEqual({
      status: 'measured',
      error: null,
      key: ids.join(','),
      asked: 7,
      answered: 7,
      measuredAt: expect.any(String),
      rows: [
        ['Deep Cuts', 'C-10', closest('Signal Boost', 'Field Notes')],
        ['Signal Boost', 'C-11', closest('Deep Cuts', 'Field Notes')],
        ['Field Notes', 'C-12', closest('Signal Boost', 'Deep Cuts')],
        ['Corner Booth', 'C-13', closest('Slow Burn', 'Field Notes')],
        ['Slow Burn', 'C-14', closest('Corner Booth', 'Night Ferry')],
        ['Night Ferry', 'C-15', closest('Static Bloom', 'Slow Burn')],
        ['Static Bloom', 'C-16', closest('Night Ferry', 'Slow Burn')]
      ].map(([show, call, near]) => ({
        entity: { id: id(show as string), name: show },
        call,
        closest: near,
        error: null
      }))
    })
    // It never says who measured it.
    expect(JSON.stringify(state.overlap)).not.toContain(ada.id)
    expect(JSON.stringify(state.overlap)).not.toContain('Ada')
    // Each call is a record in the network's evidence, with the whole ranking.
    const evidence = await agent.call<{ call: string; endpoint: string; affinities: unknown[] }[]>('getEvidence')
    expect(evidence.filter((e) => e.endpoint === '/v2/insights').map((e) => [e.call, e.affinities.length])).toEqual(
      ['C-10', 'C-11', 'C-12', 'C-13', 'C-14', 'C-15', 'C-16'].map((c) => [c, 6])
    )

    // A program reads each show's closest shows in roster order, a show sharing an entity with another
    // beside it, and the close pairs, with no call number.
    const res = await call(`/api/v1/networks/${id_}/roster/overlap`)
    expect(res.status).toBe(200)
    const read = await res.json<RosterOverlap>()
    expect(JSON.stringify(read)).not.toMatch(/C-\d+/)
    const near = (...shows: string[]) =>
      shows.map((show, i) => ({ show, sameAs: show === 'Deep Cuts' ? ['Paper Trail'] : [], rank: i + 1, band: 'top' }))
    const row = (show: string, ...closest: string[]) => ({
      show,
      sameAs: show === 'Deep Cuts' ? ['Paper Trail'] : [],
      status: 'measured',
      closest: near(...closest),
      error: null
    })
    expect(read).toEqual({
      status: 'measured',
      error: null,
      progress: { answered: 7, asked: 7 },
      measuredAt: state.overlap!.measuredAt,
      stale: false,
      closestCount: 2,
      shows: [
        row('Static Bloom', 'Night Ferry', 'Slow Burn'),
        row('Field Notes', 'Signal Boost', 'Deep Cuts'),
        row('Deep Cuts', 'Signal Boost', 'Field Notes'),
        row('Corner Booth', 'Slow Burn', 'Field Notes'),
        row('Signal Boost', 'Deep Cuts', 'Field Notes'),
        row('Slow Burn', 'Corner Booth', 'Night Ferry'),
        row('Night Ferry', 'Static Bloom', 'Slow Burn')
      ],
      closePairs: [
        ['Static Bloom', 'Night Ferry'],
        ['Field Notes', 'Deep Cuts'],
        ['Field Notes', 'Signal Boost'],
        ['Deep Cuts', 'Signal Boost'],
        ['Corner Booth', 'Slow Burn'],
        ['Slow Burn', 'Night Ferry']
      ]
    })

    // Measured again with nothing changed, every ranking has landed, so it asks Qloo nothing.
    const before = rankings().length
    const again = await call(`/api/v1/networks/${id_}/roster/overlap`, { method: 'POST' })
    expect(again.status).toBe(202)
    expect(await again.json()).toEqual(read)
    expect(rankings()).toHaveLength(before)
  })

  it('answers 202 measuring through the API, and a program polls it until it has measured', async () => {
    fakeQloo({ search })
    const answers = Promise.withResolvers<void>()
    fakeInsights(async (body) => {
      await answers.promise
      return overlapping(body)
    })
    const { network: id_, call } = await network(four)
    const res = await call(`/api/v1/networks/${id_}/roster/overlap`, { method: 'POST' })
    expect(res.status).toBe(202)
    expect(await res.json()).toMatchObject({
      status: 'measuring',
      progress: { answered: 0, asked: 4 },
      measuredAt: null,
      closestCount: 1,
      shows: four.map((show) => ({ show, status: 'measuring', closest: [] })),
      closePairs: []
    })
    answers.resolve()
    const done = await poll<RosterOverlap>(
      call,
      `/api/v1/networks/${id_}/roster/overlap`,
      (o) => o.status !== 'measuring'
    )
    // From four shows, each has its one closest.
    expect(done.shows.map((s) => [s.show, s.closest.map((c) => c.show)])).toEqual([
      ['Deep Cuts', ['Signal Boost']],
      ['Signal Boost', ['Deep Cuts']],
      ['Field Notes', ['Signal Boost']],
      ['Corner Booth', ['Field Notes']]
    ])
    expect(done.closePairs).toEqual([['Deep Cuts', 'Signal Boost']])
  })

  it("is refused under four distinct entities, while a lookup is pending, and while it's measuring", async () => {
    fakeQloo({ search })
    fakeInsights(overlapping)
    const { network: id_, call, agent } = await network(['Deep Cuts', 'Signal Boost', 'Field Notes', 'Paper Trail'])
    // Paper Trail mapped to Deep Cuts' entity counts once.
    await agent.searchComps('Paper Trail', 'Deep Cuts')
    await agent.call('updateShow', 'Paper Trail', { compId: id('Deep Cuts') })
    const few =
      'Measuring the overlap needs at least 4 shows matched in Qloo, counting shows matched to the same Qloo show once; the roster has 3. Match or map more of its shows first.'
    await expect(agent.call('measureOverlap')).rejects.toThrow(few)
    const res = await call(`/api/v1/networks/${id_}/roster/overlap`, { method: 'POST' })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: { code: 'conflict', message: few } })

    // While an import's lookup is still out.
    const lookups = Promise.withResolvers<void>()
    fakeQloo({ search, held: lookups.promise })
    await agent.call('importRoster', 'Deep Cuts\nSignal Boost\nField Notes\nCorner Booth')
    await expect(agent.call('measureOverlap')).rejects.toThrow(
      'The roster is still looking up 1 show in Qloo. Measure the overlap once the lookups have settled.'
    )
    lookups.resolve()
    await agent.until((s) => s.roster.every((show) => show.resolution !== 'pending'))

    // While a measure runs, Corner Booth's ranking held until the test lets it go.
    env.QLOO_TIMEOUT_MS = '10000'
    const held = Promise.withResolvers<void>()
    fakeInsights(async (body) => {
      if (body['signal.interests.entities'] === id('Corner Booth')) await held.promise
      return overlapping(body)
    })
    await agent.call('measureOverlap')
    await agent.until((s) => s.overlap?.answered === 3)
    await expect(agent.call('measureOverlap')).rejects.toThrow(
      'The overlap is already being measured. Wait for it to finish.'
    )
    held.resolve()
    expect((await agent.until(measured)).overlap).toMatchObject({ status: 'measured', asked: 4, answered: 4 })
    expect(rankings()).toHaveLength(4)
    expect(agent.state()!.overlap).not.toHaveProperty('startedBy')
  })

  it("reserves its calls first, refused past the network's daily calls or when the shared pool can't keep a run's", async () => {
    fakeQloo({ search })
    fakeInsights(overlapping)
    const { network: id_, call, agent } = await network(four)
    // The four lookups are the network's first calls today, and the shared pool's first requests.
    env.QLOO_VISITOR_DAILY_CALL_CAP = '7'
    await expect(agent.call('measureOverlap')).rejects.toThrow(
      'This would take you past 7 Qloo calls today, the most one network can make in a UTC day, cache hits included; they reset at 00:00 UTC.'
    )
    env.QLOO_VISITOR_DAILY_CALL_CAP = saved.QLOO_VISITOR_DAILY_CALL_CAP
    env.QLOO_DAILY_CALL_CAP = '67'
    const pool =
      "Crossfeed's shared pool, which every network on Crossfeed's Qloo key draws on, has 63 of its 67 Qloo requests a day left, too few for up to 4 more and a run's 60 after them; it resets at 00:00 UTC."
    await expect(agent.call('measureOverlap')).rejects.toThrow(pool)
    const res = await call(`/api/v1/networks/${id_}/roster/overlap`, { method: 'POST' })
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: { code: 'limit', message: pool } })
    // Refused, nothing was kept, asked, or counted.
    expect(agent.state()!.overlap).toBeUndefined()
    expect(rankings()).toEqual([])
    const usage = async () =>
      (await (await call(`/api/v1/networks/${id_}/usage`)).json<{ qlooCalls: { used: number } }>()).qlooCalls.used
    expect(await usage()).toBe(4)

    // With room for the run's calls after them, two starts at once reserve once.
    env.QLOO_DAILY_CALL_CAP = '68'
    const starts = await Promise.allSettled([agent.call('measureOverlap'), agent.call('measureOverlap')])
    expect(starts.map((s) => s.status).toSorted()).toEqual(['fulfilled', 'rejected'])
    expect(starts.find((s) => s.status === 'rejected')).toMatchObject({
      reason: new Error('The overlap is already being measured. Wait for it to finish.')
    })
    await agent.until(measured)
    expect(await usage()).toBe(8)
    expect(rankings()).toHaveLength(4)
  })

  it('checks the roster again after reserving, refusing a start an import overtook, which keeps the calls it reserved', async () => {
    fakeQloo({ search })
    fakeInsights(overlapping)
    const { network: id_, call, agent } = await network(four)
    // Slow Burn's lookup is held, so it's still pending when the measure's reservation comes back.
    env.QLOO_TIMEOUT_MS = '10000'
    const lookups = Promise.withResolvers<void>()
    fakeQloo({ search, held: lookups.promise })
    const [imported, measuring] = await Promise.allSettled([
      agent.call('importRoster', [...four, 'Slow Burn'].join('\n')),
      agent.call('measureOverlap')
    ])
    expect(imported.status).toBe('fulfilled')
    expect(measuring).toMatchObject({
      status: 'rejected',
      reason: new Error(
        'The roster is still looking up 1 show in Qloo. Measure the overlap once the lookups have settled.'
      )
    })
    expect(agent.state()!.overlap).toBeUndefined()
    expect(rankings()).toEqual([])
    // The 4 lookups, the import's 1, and the 4 the refused measure reserved, which it keeps.
    const usage = await (await call(`/api/v1/networks/${id_}/usage`)).json<{ qlooCalls: { used: number } }>()
    expect(usage.qlooCalls.used).toBe(9)
    lookups.resolve()
    await agent.until((s) => s.roster.every((show) => show.resolution !== 'pending'))
  })

  it("checks a network's own Qloo key's requests left today, not the shared pool's", async () => {
    const OWN = 'qk-made-up-7f3a'
    fakeQloo({ search, keys: [OWN, env.QLOO_API_KEY] })
    fakeInsights(overlapping)
    const { ada, network: id_ } = await networkWithKey()
    const added = await ada.fetch(`/app/${id_}/settings/qloo-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: 'https://api.qloo.com', key: OWN })
    })
    expect(added.status).toBe(200)
    const agent = await ada.connect(`/agents/network/${id_}`, {})
    open.push(agent)
    await agent.importRoster(four.join('\n'))
    // The key's test search and the four lookups are its key's first 5 requests today; Crossfeed's shared
    // pool has made none, so at 68 a day it would take the measure.
    env.QLOO_DAILY_CALL_CAP = '68'
    await expect(agent.call('measureOverlap')).rejects.toThrow(
      "The network's own Qloo key has 63 of its 68 Qloo requests a day left, too few for up to 4 more and a run's 60 after them; it resets at 00:00 UTC."
    )
    env.QLOO_DAILY_CALL_CAP = '69'
    await agent.call('measureOverlap')
    expect((await agent.until(measured)).overlap).toMatchObject({ status: 'measured', asked: 4, answered: 4 })
    const ranked = requests.filter((r) => r.url.pathname === '/v2/insights')
    expect(ranked.map((r) => [r.url.origin, r.headers.get('X-Api-Key')])).toEqual(
      ranked.map(() => ['https://api.qloo.com', OWN])
    )
    expect(ranked).toHaveLength(4)
  })

  it('keeps a failed ranking with its reason beside the rest, and measuring again asks only for it', async () => {
    fakeQloo({ search })
    fakeInsights((body) => (body['signal.interests.entities'] === id('Signal Boost') ? 503 : overlapping(body)))
    const { network: id_, call, agent } = await network(four)
    await agent.call('measureOverlap')
    const state = await agent.until(measured)
    expect(state.overlap).toMatchObject({ status: 'measured', asked: 4, answered: 4 })
    const read = await (await call(`/api/v1/networks/${id_}/roster/overlap`)).json<RosterOverlap>()
    expect(read.shows.map((s) => [s.show, s.status, s.closest.map((c) => c.show), s.error])).toEqual([
      ['Deep Cuts', 'measured', ['Signal Boost'], null],
      ['Signal Boost', 'failed', [], 'Qloo returned 503: fake failure, after 2 retries'],
      ['Field Notes', 'measured', ['Signal Boost'], null],
      ['Corner Booth', 'measured', ['Field Notes'], null]
    ])
    // Signal Boost's own ranking didn't land, so Deep Cuts can't be named its close pair.
    expect(read.closePairs).toEqual([])

    fakeInsights(overlapping)
    const before = rankings().length
    await agent.call('measureOverlap')
    const again = await agent.until(measured)
    expect(
      rankings()
        .slice(before)
        .map((b) => b['signal.interests.entities'])
    ).toEqual([id('Signal Boost')])
    expect(again.overlap).toMatchObject({ status: 'measured', asked: 1, answered: 1 })
    expect(again.overlap!.rows.map((r) => [r.entity.name, r.call, r.error])).toEqual([
      ['Deep Cuts', 'C-05', null],
      ['Signal Boost', 'C-09', null],
      ['Field Notes', 'C-07', null],
      ['Corner Booth', 'C-08', null]
    ])
    expect((await (await call(`/api/v1/networks/${id_}/roster/overlap`)).json<RosterOverlap>()).closePairs).toEqual([
      ['Deep Cuts', 'Signal Boost']
    ])
  })

  it('fails a measure a restart interrupted, keeping what landed, and measuring again asks only the rest', async () => {
    fakeQloo({ search })
    fakeInsights(overlapping)
    const { ada, network: id_, call, agent } = await network(four)
    await agent.call('measureOverlap')
    await agent.until(measured)
    // Stand in for an agent a deploy stopped mid-measure, two rankings still out, as the deploy restarts it.
    await runInDurableObject(env.NetworkAgent.get(env.NetworkAgent.idFromName(id_)), (n: NetworkAgent) => {
      const overlap = n.state.overlap!
      const rows = overlap.rows.filter((r) => [id('Deep Cuts'), id('Corner Booth')].includes(r.entity.id))
      n.setState({ ...n.state, overlap: { ...overlap, status: 'measuring', answered: 2, measuredAt: null, rows } })
    })
    await evictAllDurableObjects({ webSockets: 'close' })
    const restarted = await ada.connect(`/agents/network/${id_}`, {})
    open.push(restarted)
    expect(restarted.state()!.overlap).toMatchObject({
      status: 'failed',
      error: 'The measure was interrupted. Measure the overlap again.',
      rows: [{ entity: { name: 'Deep Cuts' } }, { entity: { name: 'Corner Booth' } }]
    })
    const read = await (await call(`/api/v1/networks/${id_}/roster/overlap`)).json<RosterOverlap>()
    expect(read.shows.map((s) => [s.show, s.status])).toEqual([
      ['Deep Cuts', 'measured'],
      ['Signal Boost', 'unmeasured'],
      ['Field Notes', 'unmeasured'],
      ['Corner Booth', 'measured']
    ])

    // The two are asked again, from the gateway's cache, as the network's evidence shows.
    await restarted.call('measureOverlap')
    const again = await restarted.until(measured)
    expect(await anchorsAsked(restarted)).toEqual([...four, 'Signal Boost', 'Field Notes'].map(id))
    expect(again.overlap).toMatchObject({ status: 'measured', error: null, asked: 2, answered: 2 })
    expect(again.overlap!.rows).toHaveLength(4)
  })

  it('drops a ranking that lands for a show that left the roster, and reads as stale once its matched shows change', async () => {
    fakeQloo({ search })
    env.QLOO_TIMEOUT_MS = '10000'
    const held = Promise.withResolvers<void>()
    fakeInsights(async (body) => {
      if (body['signal.interests.entities'] === id('Corner Booth')) await held.promise
      return overlapping(body)
    })
    const { network: id_, call, agent } = await network([...four, 'Slow Burn'])
    await agent.call('measureOverlap')
    await agent.until((s) => s.overlap?.answered === 4)
    // Corner Booth leaves the roster while its ranking is out.
    await agent.importRoster('Deep Cuts\nSignal Boost\nField Notes\nSlow Burn')
    held.resolve()
    const state = await agent.until(measured)
    expect(state.overlap!.rows.map((r) => r.entity.name)).toEqual([
      'Deep Cuts',
      'Signal Boost',
      'Field Notes',
      'Slow Burn'
    ])
    const overlap = async () => (await call(`/api/v1/networks/${id_}/roster/overlap`)).json<RosterOverlap>()
    const read = await overlap()
    expect(read.stale).toBe(true)
    // A show that left is still named among another's closest, as Qloo names it.
    expect(read.shows.find((s) => s.show === 'Slow Burn')!.closest).toEqual([
      { show: 'Corner Booth', sameAs: [], rank: 1, band: 'top' }
    ])

    // Measured again from these four, it isn't stale, and a show's figures, status, or exclusion don't
    // make it so.
    await agent.call('measureOverlap')
    await agent.until(measured)
    expect((await overlap()).stale).toBe(false)
    await agent.call('updateShow', 'Deep Cuts', { downloads: 12_000, status: 'hiatus', excluded: true })
    expect((await overlap()).stale).toBe(false)
    // Mapping a show to a comp changes its matched shows.
    await agent.importRoster('Deep Cuts\nSignal Boost\nField Notes\nSlow Burn\nPaper Trail')
    await agent.searchComps('Paper Trail', 'Paper Trail Weekly')
    expect((await overlap()).stale).toBe(false)
    await agent.call('updateShow', 'Paper Trail', { compId: 'e-0008' })
    expect(await overlap()).toMatchObject({
      stale: true,
      shows: expect.arrayContaining([
        { show: 'Paper Trail', sameAs: [], status: 'unmeasured', closest: [], error: null }
      ])
    })
  })

  it("keeps the network's evidence log under 1 MB after measuring 50 shows, and reads a list of its calls past it", async () => {
    // Long made-up names and Qloo-sized IDs, so each record is as large as a real one.
    const shows = Array.from({ length: 50 }, (_, i) => ({
      name: `Made-Up Podcast Number ${String(i).padStart(2, '0')} With Its Long Title`,
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
    }))
    fakeQloo({
      search: Object.fromEntries(shows.map((s) => [s.name, [{ entity_id: s.id, name: s.name, popularity: 0.5 }]]))
    })
    const at = (entity: string) => shows.findIndex((s) => s.id === entity)
    fakeInsights((body) => {
      const anchor = at(String(body['signal.interests.entities']))
      return String(body['filter.results.entities'])
        .split(',')
        .map((c) => ({
          entity_id: c,
          name: shows[at(c)].name,
          affinity: 0.95 - Math.abs(anchor - at(c)) / 100 - at(c) / 1e5
        }))
    })
    const { agent } = await network(shows.map((s) => s.name))
    await agent.call('measureOverlap')
    const state = await agent.until(measured)
    expect(state.overlap).toMatchObject({ status: 'measured', asked: 50, answered: 50 })
    expect(state.overlap!.rows.every((r) => r.closest.length === 3)).toBe(true)
    const evidence = await agent.call<Evidence[]>('getEvidence')
    expect(evidence).toHaveLength(100)
    expect(JSON.stringify(evidence).length).toBeLessThan(1_000_000)

    // Measured again once a show leaves, the log passes 1 MB, so a page asks for the calls it shows.
    await agent.importRoster(
      shows
        .slice(1)
        .map((s) => s.name)
        .join('\n')
    )
    await agent.call('measureOverlap')
    expect((await agent.until(measured)).overlap).toMatchObject({ status: 'measured', asked: 49, answered: 49 })
    expect(JSON.stringify(await agent.call<Evidence[]>('getEvidence')).length).toBeGreaterThan(1_000_000)
    const calls = [evidence[0].call, 'C-149', 'C-404']
    expect((await agent.call<Evidence[]>('getEvidence', calls)).map((e) => [e.call, e.endpoint])).toEqual([
      ['C-01', '/search'],
      ['C-149', '/v2/insights']
    ])
  })
})

describe("the roster page's Overlap tab", () => {
  // The roster page as a member reads it, from the network agent's synced state; its Overlap tab's
  // section; and one of that section's rows, by the show that names it.
  const page = (state: State) =>
    renderToStaticMarkup(createElement(NetworkRoster, { agent: { state, stub: {} } as unknown as NetworkConnection }))
  const tab = (state: State) => hooked(page(state), 'data-overlap')[0]
  const row = (state: State, show: string) => words(hooked(tab(state), `data-overlap-row="${show}"`)[0])
  // A row's cells in words, in order.
  const cells = (state: State, show: string) =>
    [...hooked(tab(state), `data-overlap-row="${show}"`)[0].matchAll(/<t([dh])\b[^>]*>([\s\S]*?)<\/t\1>/g)].map(
      ([, , cell]) => words(cell)
    )
  // What names a table, as a screen reader hears it: the words of the element its aria-labelledby names.
  const tableName = (table: string, html: string) => {
    const by = table.match(/^<table\b[^>]*\saria-labelledby="([^"]+)"/)![1]
    return words(html.match(new RegExp(`id="${by}"[^>]*>(.*?)</span>`))![1])
  }
  const rowsOf = (state: State) =>
    [...tab(state).matchAll(/data-overlap-row="([^"]+)"[^>]*data-state="([^"]+)"/g)].map(([, show, s]) => [show, s])
  const words = (html: string) =>
    html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#x27;|&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim()
  const heading = 'Who shares whose listeners Qloo data'

  // Six shows on five Qloo shows: Paper Trail mapped to Deep Cuts, which is on the roster too, and Night
  // Ferry left out of launches.
  const mapped = ['Paper Trail', 'Deep Cuts', 'Signal Boost', 'Field Notes', 'Corner Booth', 'Night Ferry']
  async function settle(agent: Omit<Session, 'cookie'>) {
    await agent.searchComps('Paper Trail', 'Deep Cuts')
    await agent.call('updateShow', 'Paper Trail', { compId: id('Deep Cuts') })
    await agent.call('updateShow', 'Night Ferry', { excluded: true })
    return agent.until((s) => s.roster.find((show) => show.name === 'Night Ferry')!.excluded)
  }

  it("is the roster's second tab, saying what a measure needs, then offering one with what it may spend", async () => {
    fakeQloo({ search })
    fakeInsights(overlapping)
    const { agent } = await network(['Deep Cuts', 'Signal Boost', 'Field Notes', 'Paper Trail'])
    await agent.searchComps('Paper Trail', 'Deep Cuts')
    await agent.call('updateShow', 'Paper Trail', { compId: id('Deep Cuts') })
    const few = await agent.until((s) => s.roster.some((show) => show.resolution === 'mapped'))

    // The header is the same on every tab, every panel is in the page, and Shows opens first.
    const html = page(few)
    expect(tabsOf(hooked(html, 'data-canvas')[0])).toEqual({
      label: 'Roster sections',
      tabs: ['Shows', 'Overlap', 'Listeners'],
      panels: ['shown', 'hidden', 'hidden']
    })
    expect(words(html)).toMatch(
      /^Roster 4 shows · 3 resolved, 1 mapped to a comp Details Import shows Shows Overlap Listeners /
    )
    // Paper Trail and Deep Cuts are one Qloo show, so there are three: too few, and nothing to start.
    expect(sections(tab(few))).toEqual([
      [
        heading,
        'Measuring the overlap needs at least 4 shows matched in Qloo, counting shows matched to the same Qloo show once; the roster has 3. Match or map more of its shows first.'
      ]
    ])
    expect(tab(few)).not.toContain('<button')

    // With a fourth, it's not measured yet, and offers to, one call a Qloo show at most.
    const ready = await agent.importRoster(
      ['Deep Cuts', 'Signal Boost', 'Field Notes', 'Paper Trail', 'Corner Booth'].join('\n')
    )
    expect(sections(tab(ready))).toEqual([[heading, 'The roster’s overlap hasn’t been measured yet.']])
    expect(words(tab(ready))).toBe(
      `${heading} The roster’s overlap hasn’t been measured yet. Measure the overlap Up to 4 Qloo calls`
    )
    expect(tab(ready)).toMatch(/<button[^>]*aria-describedby="overlap-cost"[^>]*>Measure the overlap<\/button>/)
    expect(requests.filter((r) => r.url.pathname === '/v2/insights')).toEqual([])
  })

  it("shows each show's closest shows in the roster's order, with its rank, band, and call, its close pairs marked", async () => {
    fakeQloo({ search })
    fakeInsights(overlapping)
    const { agent } = await network(mapped)
    await settle(agent)
    await agent.call('measureOverlap')
    const state = await agent.until(measured)

    // The finding: Deep Cuts and Signal Boost each rank as the other's closest, and Night Ferry, at the
    // end of the line, is no show's. With five Qloo shows, each has one closest show.
    expect(sections(tab(state))).toEqual([[heading, '1 close pair, and 1 of 5 shows is no other show’s closest show.']])
    // One row a Qloo show, in the roster's order, Paper Trail naming the one Deep Cuts shares, with no
    // action, since every ranking landed and nothing changed.
    expect(rowsOf(state)).toEqual(
      ['Paper Trail', 'Signal Boost', 'Field Notes', 'Corner Booth', 'Night Ferry'].map((s) => [s, 'measured'])
    )
    expect(tab(state)).not.toContain('Measure again')
    // Each row says what the roster says of its show, then its closest show's rank, the other show named
    // as the roster names it, a close pair named as one, and the ranking's call; then Show all, named for
    // whose ranking it opens. The lookups and the comp search are C-01 to C-07, and the rankings follow in
    // entity order.
    expect(row(state, 'Paper Trail')).toBe(
      'Paper Trail Mapped to Deep Cuts · Same Qloo show as Deep Cuts #1 Signal Boost , a close pair C-08 Show all 4 of Paper Trail’s ranking'
    )
    expect(row(state, 'Signal Boost')).toBe(
      'Signal Boost #1 Paper Trail , a close pair C-09 Show all 4 of Signal Boost’s ranking'
    )
    expect(row(state, 'Field Notes')).toBe('Field Notes #1 Signal Boost C-10 Show all 4 of Field Notes’ ranking')
    expect(row(state, 'Night Ferry')).toBe(
      'Night Ferry Left out #1 Corner Booth C-12 Show all 4 of Night Ferry’s ranking'
    )
    // Two columns, the show and its closest shows, and Show all under the call in the closest shows' cell,
    // so it stands by its row at every width.
    const table = hooked(tab(state), 'data-overlap-table')[0]
    expect([...table.matchAll(/<th scope="col"[^>]*>(.*?)<\/th>/g)].map(([, h]) => words(h))).toEqual([
      'Show',
      'Closest shows'
    ])
    expect(cells(state, 'Paper Trail')).toEqual([
      'Paper Trail Mapped to Deep Cuts · Same Qloo show as Deep Cuts',
      '#1 Signal Boost , a close pair C-08 Show all 4 of Paper Trail’s ranking'
    ])
    // The table is named by its heading's words alone, not its chip's.
    expect(tableName(table, tab(state))).toBe('Who shares whose listeners')
    // Its rows are two tables, the roster's first half then its second, which stand side by side on a
    // wide canvas, each with the same head and its region saying which shows it holds.
    const tables = hooked(tab(state), 'data-overlap-table')
    expect(tables.map((t) => [...t.matchAll(/data-overlap-row="([^"]+)"/g)].map(([, show]) => show))).toEqual([
      ['Paper Trail', 'Signal Boost', 'Field Notes'],
      ['Corner Booth', 'Night Ferry']
    ])
    expect([...tables[1].matchAll(/<th scope="col"[^>]*>(.*?)<\/th>/g)].map(([, h]) => words(h))).toEqual([
      'Show',
      'Closest shows'
    ])
    expect([...tab(state).matchAll(/role="region" aria-label="(Overlap table[^"]*)"/g)].map(([, l]) => l)).toEqual([
      'Overlap table, shows 1 to 3 of 5',
      'Overlap table, shows 4 to 5 of 5'
    ])
    // Each call opens its evidence in the inspector, and Show all opens the whole ranking under its row.
    expect(tab(state)).toMatch(
      /<button[^>]*aria-controls="evidence"[^>]*aria-label="Evidence for Paper Trail’s ranking: call C-08"/
    )
    expect(tab(state)).toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-controls="ranking-e-0001"/)
    // The close pair is marked on both its shows' rows, and the caption says what the mark means and that
    // a closest show is always in its ranking's top band.
    expect(hooked(tab(state), 'data-close-pair')).toHaveLength(2)
    expect(words(tab(state))).toContain(
      'Each show’s closest show is the first in its own ranking of the rest of the roster, one Qloo call per show. Bands are thirds of that ranking, as Show all gives them, so it’s in the top band. Close pair: two shows that each rank among the other’s closest show. Measured '
    )

    // The whole ranking is in the call's evidence, which the page reads by its call.
    const [record] = await agent.call<Evidence[]>('getEvidence', ['C-08'])
    expect(record.affinities.map((a) => a.name)).toEqual(['Signal Boost', 'Field Notes', 'Corner Booth', 'Night Ferry'])
  })

  it("shows a teammate's measure as it runs, show by show, then what it found", async () => {
    fakeQloo({ search })
    env.QLOO_TIMEOUT_MS = '10000'
    const held = Promise.withResolvers<void>()
    fakeInsights(async (body) => {
      if (body['signal.interests.entities'] !== id('Deep Cuts')) await held.promise
      return overlapping(body)
    })
    const { ada, network: id_, agent } = await network(mapped)
    await settle(agent)
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(id_) })
    const theirs = await grace.connect(`/agents/network/${id_}`, {})
    open.push(theirs)

    await agent.call('measureOverlap')
    const measuring = await theirs.until((s) => s.overlap?.answered === 1)
    // Its progress is the section's sentence, in a status region; the rows still out hold skeleton lines,
    // and the action has gone.
    expect(sections(tab(measuring))).toEqual([[heading, 'Working Measuring the overlap: 1 of 5 shows ranked.']])
    expect(tab(measuring)).toMatch(/<span role="status">.*Measuring the overlap: 1 of 5 shows ranked\.<\/span>/)
    expect(rowsOf(measuring)).toEqual([
      ['Paper Trail', 'measured'],
      ...['Signal Boost', 'Field Notes', 'Corner Booth', 'Night Ferry'].map((s) => [s, 'measuring'])
    ])
    expect(row(measuring, 'Signal Boost')).toBe('Signal Boost Measuring')
    expect(hooked(tab(measuring), 'data-overlap-row="Signal Boost"')[0]).toMatch(
      /aria-busy="true"[\s\S]*data-slot="skeleton"/
    )
    expect(tab(measuring)).not.toMatch(/>Measure (the overlap|again)</)

    held.resolve()
    const done = await theirs.until(measured)
    expect(sections(tab(done))).toEqual([[heading, '1 close pair, and 1 of 5 shows is no other show’s closest show.']])
    expect(rowsOf(done).map(([, s]) => s)).toEqual(Array(5).fill('measured'))
  })

  it('says why a ranking failed, offers to measure what failed, and what changed since', async () => {
    fakeQloo({ search })
    fakeInsights((body) => (body['signal.interests.entities'] === id('Signal Boost') ? 503 : overlapping(body)))
    const { agent } = await network(four)
    await agent.call('measureOverlap')
    const partial = await agent.until(measured)
    // The finding counts what landed, as the shows ranked: Signal Boost's ranking failed, so Deep Cuts can't
    // be named its close pair, and Deep Cuts and Corner Booth are no landed show's closest.
    expect(sections(tab(partial))).toEqual([
      [heading, 'No close pairs, and 2 of the 3 ranked are no other show’s closest show.']
    ])
    expect(row(partial, 'Signal Boost')).toBe(
      'Signal Boost Failed Qloo returned 503: fake failure, after 2 retries. C-06'
    )
    expect(row(partial, 'Deep Cuts')).toBe('Deep Cuts #1 Signal Boost C-05 Show all 3 of Deep Cuts’ ranking')
    expect(words(tab(partial))).toContain('Measure again Up to 1 Qloo call')

    // Once the roster's matched shows change, it says so, and measuring again asks for every show.
    fakeInsights(overlapping)
    const grown = await agent.importRoster([...four, 'Slow Burn'].join('\n'))
    expect(words(tab(grown))).toContain(
      'The roster’s matched shows have changed since the overlap was measured, so measure it again to read it as the roster is now. Measure again Up to 5 Qloo calls'
    )
    expect(row(grown, 'Slow Burn')).toBe('Slow Burn Not measured yet')

    // Under four, it says what it needs in place of the overlap.
    const fewer = await agent.importRoster(four.slice(0, 3).join('\n'))
    expect(sections(tab(fewer))).toEqual([
      [
        heading,
        'Measuring the overlap needs at least 4 shows matched in Qloo, counting shows matched to the same Qloo show once; the roster has 3. Match or map more of its shows first.'
      ]
    ])
    expect(tab(fewer)).not.toContain('data-overlap-table')
  })
})
