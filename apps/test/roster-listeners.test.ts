// The roster's listener profile: one demographics call in Qloo for every distinct entity the roster's
// shows are matched or mapped to, made from a member's page or through the REST API, kept in the network's
// synced state as each show's leans, and read back; and the roster page's Listeners tab, which shows it.
// Each test drives a member's network through its agent's client protocol or the API, against the fake
// Qloo, and renders the page from the synced state.
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
import type { RosterListeners } from '../src/operations'
import { fakeDemographics, fakeQloo, requests, type Demographic } from './fake'
import { hooked, networkWithKey, openMember, poll, sections, tabsOf, type Session } from './session'

// Made-up shows, each its own Qloo entity, and Paper Trail, which Qloo has no match for until it's mapped;
// and three more, for rosters where several shows lean differently.
const names = ['Deep Cuts', 'Signal Boost', 'Field Notes', 'Corner Booth', 'Slow Burn', 'Night Ferry']
const more = ['Tide Tables', 'Low Orbit', 'Back Room']
const id = (name: string) =>
  more.includes(name) ? `e-001${more.indexOf(name) + 1}` : `e-000${names.indexOf(name) + 1}`
const search = {
  ...Object.fromEntries([...names, ...more].map((n) => [n, [{ entity_id: id(n), name: n, popularity: 0.5 }]])),
  'Paper Trail': [],
  'Paper Trail Weekly': [{ entity_id: 'e-0008', name: 'Paper Trail Weekly', popularity: 0.4 }]
}

// Each show's listeners as Qloo gives them, by age bucket, youngest first, and gender: made-up figures,
// unlike any Qloo returns, with Qloo's float noise on one. Qloo has none for Slow Burn.
const buckets = ['24_and_younger', '25_to_29', '30_to_34', '35_to_44', '45_to_54', '55_and_older']
const listeners = (name: string, age: number[], male: number): Demographic => ({
  entity_id: id(name),
  age: Object.fromEntries(buckets.map((b, i) => [b, age[i]])),
  gender: { male, female: -male }
})
const demographics = [
  listeners('Corner Booth', [-0.302, -0.115, -0.02, 0.143, 0.162, 0.091], -0.226),
  listeners('Deep Cuts', [-0.21, 0.134, 0.18800000000000003, 0.102, -0.043, -0.165], 0.312),
  listeners('Signal Boost', [0.096, 0.151, 0.07, -0.012, -0.08, -0.141], -0.064),
  listeners('Field Notes', [-0.05, 0.2, 0.11, -0.03, -0.1, -0.2], 0.25),
  listeners('Night Ferry', [-0.1, 0.05, 0.12, -0.01, -0.03, -0.12], 0.205)
]
// The leans the profile keeps for a show: its figures, rounded to Qloo's three places.
const lean = (name: string) => {
  const d = demographics.find((x) => x.entity_id === id(name))!
  return {
    age: Object.fromEntries(buckets.map((b) => [b, Math.round(d.age[b] * 1000) / 1000])),
    male: d.gender.male
  }
}

// The demographics requests Qloo got, as their bodies.
const profiles = () =>
  requests
    .filter((r) => r.url.pathname === '/v2/insights')
    .map((r) => JSON.parse(r.body) as Record<string, unknown>)
    .filter((b) => b['filter.type'] === 'urn:demographics')

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

const profiled = (s: State) => s.listenerProfile !== undefined && s.listenerProfile.status !== 'profiling'
const four = ['Deep Cuts', 'Signal Boost', 'Field Notes', 'Corner Booth']

describe("profiling the roster's listeners", () => {
  it('asks Qloo once for every distinct entity, left-out shows included, and keeps each show’s leans', async () => {
    fakeQloo({ search })
    fakeDemographics(demographics)
    const {
      ada,
      network: id_,
      call,
      agent
    } = await network([
      'Night Ferry',
      'Deep Cuts',
      'Paper Trail',
      'Signal Boost',
      'Field Notes',
      'Corner Booth',
      'Slow Burn'
    ])
    // Paper Trail stands in for Deep Cuts through a comp search for it, so the two are one Qloo show, and
    // Night Ferry is left out of launches.
    await agent.searchComps('Paper Trail', 'Deep Cuts')
    await agent.call('updateShow', 'Paper Trail', { compId: id('Deep Cuts') })
    await agent.call('updateShow', 'Night Ferry', { excluded: true })

    await agent.call('profileListeners')
    const state = await agent.until(profiled)

    // One call, its six entities, Deep Cuts' once, sorted by ID whatever the roster's order.
    const ids = names.map(id).toSorted()
    expect(profiles()).toEqual([{ 'filter.type': 'urn:demographics', 'signal.interests.entities': ids.join(',') }])
    // Each show's leans, in entity order, Slow Burn's none. The call follows the 7 lookups and the comp search.
    expect(state.listenerProfile).toEqual({
      status: 'profiled',
      error: null,
      key: ids.join(','),
      call: 'C-09',
      profiledAt: expect.any(String),
      rows: names.map((n) => ({
        entity: { id: id(n), name: n },
        lean: n === 'Slow Burn' ? null : lean(n)
      }))
    })
    expect(state.listenerProfile!.rows[0].lean!.age['30_to_34']).toBe(0.188)
    // It never says who profiled it.
    expect(JSON.stringify(state.listenerProfile)).not.toContain(ada.id)
    expect(JSON.stringify(state.listenerProfile)).not.toContain('Ada')
    // The call is a record in the network's evidence, with Qloo's figures for the five it profiled.
    const [record] = await agent.call<Evidence[]>('getEvidence', ['C-09'])
    expect(record).toMatchObject({ endpoint: '/v2/insights', status: 200 })
    expect(record.affinities.map((a) => a.name)).toEqual([
      'Corner Booth',
      'Deep Cuts',
      'Signal Boost',
      'Field Notes',
      'Night Ferry'
    ])

    // A program reads each show's leans in roster order, a show sharing an entity with another beside it,
    // with no call number.
    const res = await call(`/api/v1/networks/${id_}/roster/listeners`)
    expect(res.status).toBe(200)
    const read = await res.json<RosterListeners>()
    expect(JSON.stringify(read)).not.toMatch(/C-\d+/)
    const show = (name: string, sameAs: string[] = []) =>
      name === 'Slow Burn'
        ? { show: name, sameAs, status: 'missing', lean: null }
        : { show: name, sameAs, status: 'profiled', lean: lean(name) }
    expect(read).toEqual({
      status: 'profiled',
      error: null,
      profiledAt: state.listenerProfile!.profiledAt,
      stale: false,
      shows: [
        show('Night Ferry'),
        show('Deep Cuts', ['Paper Trail']),
        show('Signal Boost'),
        show('Field Notes'),
        show('Corner Booth'),
        show('Slow Burn')
      ]
    })

    // Profiled again with nothing changed, it asks Qloo nothing.
    const again = await call(`/api/v1/networks/${id_}/roster/listeners`, { method: 'POST' })
    expect(again.status).toBe(202)
    expect(await again.json()).toEqual(read)
    expect(profiles()).toHaveLength(1)
  })

  it('answers 202 profiling through the API, and a program polls it until it has profiled', async () => {
    fakeQloo({ search })
    const answers = Promise.withResolvers<void>()
    fakeDemographics(async () => {
      await answers.promise
      return demographics
    })
    const { network: id_, call } = await network(four)
    const res = await call(`/api/v1/networks/${id_}/roster/listeners`, { method: 'POST' })
    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({
      status: 'profiling',
      error: null,
      profiledAt: null,
      stale: false,
      shows: four.map((show) => ({ show, sameAs: [], status: 'profiling', lean: null }))
    })
    answers.resolve()
    const done = await poll<RosterListeners>(
      call,
      `/api/v1/networks/${id_}/roster/listeners`,
      (l) => l.status !== 'profiling'
    )
    expect(done.shows.map((s) => [s.show, s.status, s.lean])).toEqual(four.map((n) => [n, 'profiled', lean(n)]))
  })

  it("is refused under four distinct entities, while a lookup is pending, and while it's profiling", async () => {
    fakeQloo({ search })
    fakeDemographics(demographics)
    const { network: id_, call, agent } = await network(['Deep Cuts', 'Signal Boost', 'Field Notes', 'Paper Trail'])
    // Paper Trail mapped to Deep Cuts' entity counts once.
    await agent.searchComps('Paper Trail', 'Deep Cuts')
    await agent.call('updateShow', 'Paper Trail', { compId: id('Deep Cuts') })
    const few =
      'Profiling the listeners needs at least 4 shows matched in Qloo, counting shows matched to the same Qloo show once; the roster has 3. Match or map more of its shows first.'
    await expect(agent.call('profileListeners')).rejects.toThrow(few)
    const res = await call(`/api/v1/networks/${id_}/roster/listeners`, { method: 'POST' })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: { code: 'conflict', message: few } })

    // While an import's lookup is still out.
    const lookups = Promise.withResolvers<void>()
    fakeQloo({ search, held: lookups.promise })
    await agent.call('importRoster', four.join('\n'))
    await expect(agent.call('profileListeners')).rejects.toThrow(
      'The roster is still looking up 1 show in Qloo. Profile the listeners once the lookups have settled.'
    )
    lookups.resolve()
    await agent.until((s) => s.roster.every((show) => show.resolution !== 'pending'))

    // While a profile is being made, its call held until the test lets it go.
    env.QLOO_TIMEOUT_MS = '10000'
    const held = Promise.withResolvers<void>()
    fakeDemographics(async () => {
      await held.promise
      return demographics
    })
    await agent.call('profileListeners')
    await expect(agent.call('profileListeners')).rejects.toThrow(
      'The listeners are already being profiled. Wait for it to finish.'
    )
    held.resolve()
    expect((await agent.until(profiled)).listenerProfile).toMatchObject({ status: 'profiled', error: null })
    expect(profiles()).toHaveLength(1)
  })

  it("reserves its call first, refused past the network's daily calls or when the shared pool can't keep a run's", async () => {
    fakeQloo({ search })
    fakeDemographics(demographics)
    const { network: id_, call, agent } = await network(four)
    // The four lookups are the network's first calls today, and the shared pool's first requests.
    env.QLOO_VISITOR_DAILY_CALL_CAP = '4'
    await expect(agent.call('profileListeners')).rejects.toThrow(
      'This would take you past 4 Qloo calls today, the most one network can make in a UTC day, cache hits included; they reset at 00:00 UTC.'
    )
    env.QLOO_VISITOR_DAILY_CALL_CAP = saved.QLOO_VISITOR_DAILY_CALL_CAP
    env.QLOO_DAILY_CALL_CAP = '64'
    const pool =
      "Crossfeed's shared pool, which every network on Crossfeed's Qloo key draws on, has 60 of its 64 Qloo requests a day left, too few for up to 1 more and a run's 60 after them; it resets at 00:00 UTC."
    await expect(agent.call('profileListeners')).rejects.toThrow(pool)
    const res = await call(`/api/v1/networks/${id_}/roster/listeners`, { method: 'POST' })
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: { code: 'limit', message: pool } })
    // Refused, nothing was kept, asked, or counted.
    expect(agent.state()!.listenerProfile).toBeUndefined()
    expect(profiles()).toEqual([])
    const usage = async () =>
      (await (await call(`/api/v1/networks/${id_}/usage`)).json<{ qlooCalls: { used: number } }>()).qlooCalls.used
    expect(await usage()).toBe(4)

    // With room for a run's calls after it, two starts at once reserve once.
    env.QLOO_DAILY_CALL_CAP = '65'
    const starts = await Promise.allSettled([agent.call('profileListeners'), agent.call('profileListeners')])
    expect(starts.map((s) => s.status).toSorted()).toEqual(['fulfilled', 'rejected'])
    expect(starts.find((s) => s.status === 'rejected')).toMatchObject({
      reason: new Error('The listeners are already being profiled. Wait for it to finish.')
    })
    await agent.until(profiled)
    expect(await usage()).toBe(5)
    expect(profiles()).toHaveLength(1)
  })

  it('checks the roster again after reserving, refusing a start an import overtook, which keeps the call it reserved', async () => {
    fakeQloo({ search })
    fakeDemographics(demographics)
    const { network: id_, call, agent } = await network(four)
    // Slow Burn's lookup is held, so it's still pending when the profile's reservation comes back.
    env.QLOO_TIMEOUT_MS = '10000'
    const lookups = Promise.withResolvers<void>()
    fakeQloo({ search, held: lookups.promise })
    const [imported, profiling] = await Promise.allSettled([
      agent.call('importRoster', [...four, 'Slow Burn'].join('\n')),
      agent.call('profileListeners')
    ])
    expect(imported.status).toBe('fulfilled')
    expect(profiling).toMatchObject({
      status: 'rejected',
      reason: new Error(
        'The roster is still looking up 1 show in Qloo. Profile the listeners once the lookups have settled.'
      )
    })
    expect(agent.state()!.listenerProfile).toBeUndefined()
    expect(profiles()).toEqual([])
    // The 4 lookups, the import's 1, and the 1 the refused profile reserved, which it keeps.
    const usage = await (await call(`/api/v1/networks/${id_}/usage`)).json<{ qlooCalls: { used: number } }>()
    expect(usage.qlooCalls.used).toBe(6)
    lookups.resolve()
    await agent.until((s) => s.roster.every((show) => show.resolution !== 'pending'))
  })

  it('fails with its reason when the call fails, and profiling again asks again', async () => {
    fakeQloo({ search })
    fakeDemographics(503)
    const { network: id_, call, agent } = await network(four)
    await agent.call('profileListeners')
    expect((await agent.until(profiled)).listenerProfile).toEqual({
      status: 'failed',
      error: 'Qloo returned 503: fake failure, after 2 retries',
      key: four.map(id).toSorted().join(','),
      call: 'C-05',
      profiledAt: null,
      rows: []
    })
    const read = await (await call(`/api/v1/networks/${id_}/roster/listeners`)).json<RosterListeners>()
    expect(read).toMatchObject({ status: 'failed', error: 'Qloo returned 503: fake failure, after 2 retries' })
    expect(read.shows.map((s) => s.status)).toEqual(['unprofiled', 'unprofiled', 'unprofiled', 'unprofiled'])

    fakeDemographics(demographics)
    await agent.call('profileListeners')
    expect((await agent.until(profiled)).listenerProfile).toMatchObject({ status: 'profiled', call: 'C-06' })
    // The failed call's first try and its two retries, then the one that landed.
    expect(profiles()).toHaveLength(4)
  })

  it('fails a profile a restart interrupted, and profiling again asks again', async () => {
    fakeQloo({ search })
    fakeDemographics(demographics)
    const { ada, network: id_, agent } = await network(four)
    // Stand in for an agent a deploy stopped with its call out, as the deploy restarts it.
    await runInDurableObject(env.NetworkAgent.get(env.NetworkAgent.idFromName(id_)), (n: NetworkAgent) => {
      const key = four.map(id).toSorted().join(',')
      n.setState({
        ...n.state,
        listenerProfile: { status: 'profiling', error: null, key, call: null, profiledAt: null, rows: [] }
      })
    })
    await evictAllDurableObjects({ webSockets: 'close' })
    const restarted = await ada.connect(`/agents/network/${id_}`, {})
    open.push(restarted)
    expect(restarted.state()!.listenerProfile).toMatchObject({
      status: 'failed',
      error: 'The profile was interrupted. Profile the listeners again.',
      rows: []
    })
    await restarted.call('profileListeners')
    expect((await restarted.until(profiled)).listenerProfile).toMatchObject({ status: 'profiled', error: null })
    expect(profiles()).toHaveLength(1)
  })

  it('drops a show that left the roster while its call was out, and reads as stale once its matched shows change', async () => {
    fakeQloo({ search })
    env.QLOO_TIMEOUT_MS = '10000'
    const held = Promise.withResolvers<void>()
    fakeDemographics(async () => {
      await held.promise
      return demographics
    })
    const { network: id_, call, agent } = await network([...four, 'Night Ferry'])
    await agent.call('profileListeners')
    // Corner Booth leaves the roster while the call is out.
    await agent.importRoster('Deep Cuts\nSignal Boost\nField Notes\nNight Ferry')
    held.resolve()
    const state = await agent.until(profiled)
    expect(state.listenerProfile!.rows.map((r) => r.entity.name)).toEqual([
      'Deep Cuts',
      'Signal Boost',
      'Field Notes',
      'Night Ferry'
    ])
    const read = async () => (await call(`/api/v1/networks/${id_}/roster/listeners`)).json<RosterListeners>()
    expect((await read()).stale).toBe(true)

    // Profiled again from these four, it isn't stale, and a show's figures, status, or exclusion don't
    // make it so.
    fakeDemographics(demographics)
    await agent.call('profileListeners')
    await agent.until(profiled)
    expect((await read()).stale).toBe(false)
    await agent.call('updateShow', 'Deep Cuts', { downloads: 12_000, status: 'hiatus', excluded: true })
    expect((await read()).stale).toBe(false)
    // Mapping a show to a comp changes its matched shows.
    await agent.importRoster('Deep Cuts\nSignal Boost\nField Notes\nNight Ferry\nPaper Trail')
    await agent.searchComps('Paper Trail', 'Paper Trail Weekly')
    expect((await read()).stale).toBe(false)
    await agent.call('updateShow', 'Paper Trail', { compId: 'e-0008' })
    expect(await read()).toMatchObject({
      stale: true,
      shows: expect.arrayContaining([{ show: 'Paper Trail', sameAs: [], status: 'unprofiled', lean: null }])
    })
  })
})

describe("the roster page's Listeners tab", () => {
  // The roster page as a member reads it, from the network agent's synced state; its Listeners tab's
  // section; and one of that section's rows, by the show that names it.
  const page = (state: State) =>
    renderToStaticMarkup(createElement(NetworkRoster, { agent: { state, stub: {} } as unknown as NetworkConnection }))
  const tab = (state: State) => hooked(page(state), 'data-listeners')[0]
  const row = (state: State, show: string) => words(hooked(tab(state), `data-listener-row="${show}"`)[0])
  const rowsOf = (state: State) =>
    [...tab(state).matchAll(/data-listener-row="([^"]+)"[^>]*data-state="([^"]+)"/g)].map(([, show, s]) => [show, s])
  const words = (html: string) =>
    html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#x27;|&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim()
  const heading = 'Who your shows reach Qloo data'

  // Seven shows on six Qloo shows: Paper Trail mapped to Deep Cuts, which is on the roster too, Night Ferry
  // left out of launches, and Slow Burn, which Qloo has no listener profile for.
  const mapped = ['Paper Trail', 'Deep Cuts', 'Signal Boost', 'Field Notes', 'Corner Booth', 'Slow Burn', 'Night Ferry']
  async function settle(agent: Omit<Session, 'cookie'>) {
    await agent.searchComps('Paper Trail', 'Deep Cuts')
    await agent.call('updateShow', 'Paper Trail', { compId: id('Deep Cuts') })
    await agent.call('updateShow', 'Night Ferry', { excluded: true })
    return agent.until((s) => s.roster.find((show) => show.name === 'Night Ferry')!.excluded)
  }

  it("is the roster's third tab, saying what a profile needs, then offering one with what it may spend", async () => {
    fakeQloo({ search })
    fakeDemographics(demographics)
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
    // Paper Trail and Deep Cuts are one Qloo show, so there are three: too few, and nothing to start.
    expect(sections(tab(few))).toEqual([
      [
        heading,
        'Profiling the listeners needs at least 4 shows matched in Qloo, counting shows matched to the same Qloo show once; the roster has 3. Match or map more of its shows first.'
      ]
    ])
    expect(tab(few)).not.toContain('<button')

    // With a fourth, it's not profiled yet, and offers to, in one call at most.
    const ready = await agent.importRoster(
      ['Deep Cuts', 'Signal Boost', 'Field Notes', 'Paper Trail', 'Corner Booth'].join('\n')
    )
    expect(words(tab(ready))).toBe(
      `${heading} The roster’s listeners haven’t been profiled yet. Profile the listeners Up to 1 Qloo call`
    )
    expect(tab(ready)).toMatch(/<button[^>]*aria-describedby="listeners-cost"[^>]*>Profile the listeners<\/button>/)
    expect(profiles()).toEqual([])
  })

  it("shows each show's leans in the roster's order, as signed figures over ink bars, under the finding", async () => {
    fakeQloo({ search })
    fakeDemographics(demographics)
    const { agent } = await network(mapped)
    await settle(agent)
    await agent.call('profileListeners')
    const state = await agent.until(profiled)

    // The finding counts the five Qloo has a profile for: most lean toward 25 to 29 and 30 to 34, and male,
    // Night Ferry's +0.205 just at the threshold and Signal Boost's −0.064 inside it, uncounted; Corner
    // Booth leans toward neither band, and female. The call follows the finding, with no action, since
    // nothing changed.
    expect(sections(tab(state))).toEqual([
      [
        heading,
        'Most of the 5 shows Qloo has a profile for lean toward listeners aged 25 to 29 and 30 to 34, and most lean male; Corner Booth leans differently. C-09'
      ]
    ])
    expect(tab(state)).toMatch(
      /<button[^>]*aria-controls="evidence"[^>]*aria-label="Evidence for the listener profile: call C-09"/
    )
    expect(tab(state)).not.toContain('Profile again')
    // One row a Qloo show, in the roster's order, Paper Trail naming the one Deep Cuts shares.
    expect(rowsOf(state)).toEqual([
      ['Paper Trail', 'profiled'],
      ['Signal Boost', 'profiled'],
      ['Field Notes', 'profiled'],
      ['Corner Booth', 'profiled'],
      ['Slow Burn', 'missing'],
      ['Night Ferry', 'profiled']
    ])
    // The columns: the six age bands, youngest first, then gender, its two ends named and said in words.
    expect(words(hooked(tab(state), 'data-listeners-table')[0].match(/<thead[\s\S]*<\/thead>/)![0])).toBe(
      'Show 24 and younger 25 to 29 30 to 34 35 to 44 45 to 54 55 and older Female Male Gender: the lean toward male listeners'
    )
    // Each cell its signed figure, rounded to three places with a true minus sign, and its gender lean in
    // words for screen readers, and whether it counts.
    expect(row(state, 'Paper Trail')).toBe(
      'Paper Trail Mapped to Deep Cuts · Same Qloo show as Deep Cuts −0.210 +0.134 +0.188 +0.102 −0.043 −0.165 +0.312 , leans male'
    )
    expect(row(state, 'Signal Boost')).toBe(
      'Signal Boost +0.096 +0.151 +0.070 −0.012 −0.080 −0.141 −0.064 , leans female, inside the zone, not counted'
    )
    expect(row(state, 'Night Ferry')).toContain('Left out')
    expect(row(state, 'Night Ferry')).toMatch(/\+0\.205 , leans male$/)
    // Its words stand under its name, in the column that stays in view as the table scrolls, and so does
    // the row of the show the finding names as leaning differently.
    expect(row(state, 'Slow Burn')).toBe('Slow Burn No listener profile in Qloo. None')
    expect(row(state, 'Corner Booth')).toMatch(/^Corner Booth Leans differently −0\.302 /)
    expect(hooked(tab(state), 'data-listener-row="Slow Burn"')[0]).toMatch(
      /<th[^>]*>[\s\S]*No listener profile in Qloo\.[\s\S]*<\/th>/
    )
    // A bar each, its side the lean's sign and its tone too, ink for a lean toward, secondary ink for one
    // away, its length the lean's size on one scale for the table, its largest lean, 0.312, up to 0.4; and
    // the gender column's zone, ±0.2 on that scale.
    const bars = [
      ...hooked(tab(state), 'data-listener-row="Corner Booth"')[0].matchAll(
        /<span class="(absolute inset-y-0\.5 [^"]*)" style="width:([^"]+)"/g
      )
    ]
    const tone = (cls: string) => (cls.includes('bg-muted-foreground') ? 'secondary ink' : 'ink')
    expect(bars.map(([, cls, width]) => [cls.includes('left-1/2') ? 'right' : 'left', tone(cls), width])).toEqual([
      ['left', 'secondary ink', '37.75%'],
      ['left', 'secondary ink', '14.375%'],
      ['left', 'secondary ink', '2.5%'],
      ['right', 'ink', '17.875%'],
      ['right', 'ink', '20.25%'],
      ['right', 'ink', '11.375%'],
      ['left', 'secondary ink', '28.25%']
    ])
    expect(hooked(tab(state), 'data-zone')).toHaveLength(5)
    expect(hooked(tab(state), 'data-zone')[0]).toContain('left:calc(50% - 25%);width:calc(2 * 25%)')
    // No bar is signal orange, and no colour says which way a show leans.
    expect(tab(state)).not.toMatch(/\b(bg|text)-signal/)
    expect(words(tab(state))).toContain(
      'Leans are relative to the average in Qloo and describe listeners, not people. A gender lean inside the shaded zone isn’t counted. Profiled '
    )
  })

  it("shows a teammate's profile as it's made, then what it found", async () => {
    fakeQloo({ search })
    env.QLOO_TIMEOUT_MS = '10000'
    const held = Promise.withResolvers<void>()
    fakeDemographics(async () => {
      await held.promise
      return demographics
    })
    const { ada, network: id_, agent } = await network(mapped)
    await settle(agent)
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(id_) })
    const theirs = await grace.connect(`/agents/network/${id_}`, {})
    open.push(theirs)

    await agent.call('profileListeners')
    const profiling = await theirs.until((s) => s.listenerProfile?.status === 'profiling')
    // Its progress is the section's sentence, in a status region; every row holds skeleton cells, and the
    // action has gone.
    expect(sections(tab(profiling))).toEqual([[heading, 'Working Profiling the listeners of 6 shows.']])
    expect(tab(profiling)).toMatch(/<span role="status">.*Profiling the listeners of 6 shows\.<\/span>/)
    expect(rowsOf(profiling).map(([, s]) => s)).toEqual(Array(6).fill('profiling'))
    expect(hooked(tab(profiling), 'data-listener-row="Signal Boost"')[0]).toMatch(
      /aria-busy="true"[\s\S]*data-slot="skeleton"/
    )
    expect(tab(profiling)).not.toMatch(/>Profile (the listeners|again)</)

    held.resolve()
    const done = await theirs.until(profiled)
    expect(sections(tab(done))[0][1]).toMatch(/^Most of the 5 shows Qloo has a profile for lean toward /)
    expect(row(done, 'Slow Burn')).toBe('Slow Burn No listener profile in Qloo. None')
  })

  it('says why a profile failed, offers to make it again, and what changed since', async () => {
    fakeQloo({ search })
    fakeDemographics(503)
    const { agent } = await network(four)
    await agent.call('profileListeners')
    const failed = await agent.until(profiled)
    expect(sections(tab(failed))).toEqual([[heading, 'Failed Qloo returned 503: fake failure, after 2 retries. C-05']])
    expect(words(tab(failed))).toContain('Profile again Up to 1 Qloo call')
    expect(tab(failed)).not.toContain('data-listeners-table')

    // Profiled, then the roster's matched shows change: it says so, and offers to profile them again. Of the
    // four, two lean male, which isn't most.
    fakeDemographics(demographics)
    await agent.call('profileListeners')
    const four_ = await agent.until((s) => s.listenerProfile?.status === 'profiled')
    expect(sections(tab(four_))[0][1]).toBe(
      'Most of the 4 shows lean toward listeners aged 25 to 29 and 30 to 34; Corner Booth leans differently. C-06'
    )
    // Corner Booth leaves and Night Ferry joins: the finding counts the three still on the roster that the
    // profile answered for, so Corner Booth no longer leans differently, and Night Ferry waits.
    const changed = await agent.importRoster(['Deep Cuts', 'Signal Boost', 'Field Notes', 'Night Ferry'].join('\n'))
    expect(sections(tab(changed))[0][1]).toBe(
      'Most of the 3 shows lean toward listeners aged 25 to 29 and 30 to 34, and most lean male; none leans differently. C-06'
    )
    expect(words(tab(changed))).toContain(
      'The roster’s matched shows have changed since the listeners were profiled, so profile them again to read them as the roster is now. Profile again Up to 1 Qloo call'
    )
    expect(row(changed, 'Night Ferry')).toBe('Night Ferry Not profiled yet None')
    expect(rowsOf(changed).map(([show]) => show)).toEqual(['Deep Cuts', 'Signal Boost', 'Field Notes', 'Night Ferry'])
  })

  // A roster of `shows`, profiled with `demographics`, as the page reads it.
  async function profiledWith(shows: string[], answer: Demographic[]) {
    fakeQloo({ search })
    fakeDemographics(answer)
    const { agent } = await network(shows)
    await agent.call('profileListeners')
    return agent.until(profiled)
  }
  // A show's made-up listeners: leaning `age` on 25 to 29 and `old` on 55 and older, -0.1 elsewhere, and
  // `male` toward male listeners.
  const leaning = (name: string, { age = -0.1, old = -0.1, male = 0 }) =>
    listeners(name, [-0.1, age, -0.1, -0.1, -0.1, old], male)
  const finding = (state: State) => sections(tab(state))[0][1].replace(/ C-\d+$/, '')

  it('names up to three shows that lean differently, in the roster order, counts the rest, and marks each row', async () => {
    // Five of nine lean toward 25 to 29; the other four, toward 55 and older; all lean male.
    const toward = ['Deep Cuts', 'Signal Boost', 'Field Notes', 'Corner Booth', 'Slow Burn']
    const away = ['Back Room', 'Low Orbit', 'Tide Tables', 'Night Ferry']
    const roster = [
      'Back Room',
      'Low Orbit',
      'Deep Cuts',
      'Tide Tables',
      'Signal Boost',
      'Night Ferry',
      ...toward.slice(2)
    ]
    const state = await profiledWith(roster, [
      ...toward.map((n) => leaning(n, { age: 0.2, male: 0.3 })),
      ...away.map((n) => leaning(n, { old: 0.2, male: 0.3 }))
    ])
    // In entity order the first three would be Night Ferry, Tide Tables and Low Orbit.
    expect(finding(state)).toBe(
      'Most of the 9 shows lean toward listeners aged 25 to 29, and most lean male; Back Room, Low Orbit, Tide Tables, and 1 more lean differently.'
    )
    expect(roster.filter((show) => row(state, show).startsWith(`${show} Leans differently `))).toEqual(away)
  })

  it('says when no age band or gender is a lean most shows share, and words two shows, one, and none', async () => {
    // Each of four leans toward its own band, and none leans male or female past 0.2.
    const own = (name: string, band: number, male: number) =>
      listeners(name, [0, 1, 2, 3].map((i) => (i === band ? 0.2 : -0.1)).concat(-0.1, -0.1), male)
    const apart = await profiledWith(four, [
      own('Deep Cuts', 0, 0.1),
      own('Signal Boost', 1, -0.1),
      own('Field Notes', 2, 0.19),
      own('Corner Booth', 3, -0.19)
    ])
    expect(finding(apart)).toBe('No age band or gender is a lean most of the 4 shows share.')
    expect(apart.listenerProfile!.rows.every((r) => r.lean)).toBe(true)
    expect(tab(apart)).not.toContain('Leans differently')

    // Each roster below is a set of shows of its own, since the gateway's cache would answer the same
    // demographics request with the first answer. Qloo has a profile for two of these four: both lean
    // toward 25 to 29 and female.
    const two = await profiledWith(
      ['Deep Cuts', 'Signal Boost', 'Field Notes', 'Night Ferry'],
      [leaning('Signal Boost', { age: 0.2, male: -0.4 }), leaning('Field Notes', { age: 0.3, male: -0.25 })]
    )
    expect(finding(two)).toBe(
      'Both shows Qloo has a profile for lean toward listeners aged 25 to 29, and both lean female.'
    )
    expect(row(two, 'Deep Cuts')).toBe('Deep Cuts No listener profile in Qloo. None')

    // For one alone, it names it.
    const one = await profiledWith(
      ['Deep Cuts', 'Signal Boost', 'Corner Booth', 'Night Ferry'],
      [leaning('Corner Booth', { old: 0.2, male: 0.3 })]
    )
    expect(finding(one)).toBe(
      'Qloo has a listener profile for Corner Booth alone, which leans toward listeners aged 55 and older and leans male.'
    )

    // For none, it says so, and each row says it under its name.
    const others = ['Tide Tables', 'Low Orbit', 'Back Room', 'Slow Burn']
    const none = await profiledWith(others, [])
    expect(finding(none)).toBe('Qloo has no listener profile for any of these shows.')
    expect(others.map((show) => row(none, show))).toEqual(
      others.map((show) => `${show} No listener profile in Qloo. None`)
    )
  })
})
