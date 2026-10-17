import { evictAllDurableObjects } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { http } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { State } from '../src/agent'
import type { Evidence } from '../src/evidence'
import sample from '../src/sample-network.json'
import { fakeQloo, network, requests } from './fake'
import { openSession, type Session } from './session'

// Made-up IDs and scores for two of the sample's public show names; every other name finds nothing.
const search = {
  'The Watch': [{ entity_id: 'e-0601', name: 'The Watch', popularity: 0.5 }],
  'Binge Mode': [
    { entity_id: 'e-1201', name: 'Binge Mode: Spin-off', popularity: 0.6 },
    { entity_id: 'e-1202', name: 'Binge Mode: Other Feed', popularity: 0.2 }
  ]
}

const allFigures = ['downloads', 'status', 'description']

// Tests run without the sample network, so other files' sessions start empty; these turn it on.
const saved = env.SAMPLE_NETWORK
beforeEach(() => {
  env.SAMPLE_NETWORK = 'on'
})
afterEach(() => {
  env.SAMPLE_NETWORK = saved
})

const open: Session[] = []
const session = async (cookie?: string) => {
  const s = await openSession(cookie)
  open.push(s)
  return s
}
afterEach(() => open.splice(0).forEach((s) => s.close()))

const settled = (s: State) => s.roster.length > 0 && s.roster.every((show) => show.resolution !== 'pending')
const show = (s: Session, name: string) => s.state()!.roster.find((r) => r.name === name)!

describe('opening the demo', () => {
  it('opens a new session on the sample network, with every figure flagged as sample', async () => {
    fakeQloo({ search })
    const s = await session()
    const state = await s.until(settled)

    expect(state.roster).toHaveLength(19)
    expect(state.roster.map((r) => [r.name, r.downloads, r.status, r.description, r.sample])).toEqual(
      sample.shows.map((r) => [r.name, r.downloadsPerEpisode.value, r.status.value, r.description.value, allFigures])
    )
    expect(state.cpm).toBe(20)
    expect(state.sample).toEqual({
      network: 'The Ringer',
      notice: sample.notice,
      launch: { name: 'The Watch' },
      answers: { budget: { slots: 20 }, exclusions: [] },
      cpm: true
    })
    // The launch is prefilled, not started, and the run's answers are only suggested.
    expect(state.launch).toBeNull()
    expect(state.run).toBeNull()
  })

  it('resolves the sample roster through the gateway, leaving the ambiguous and missed shows to settle', async () => {
    fakeQloo({ search })
    const s = await session()
    await s.until(settled)

    expect(requests.map((r) => r.url.searchParams.get('query')).sort()).toEqual(sample.shows.map((r) => r.name).sort())
    expect(show(s, 'The Watch')).toMatchObject({
      resolution: 'resolved',
      entity: { id: 'e-0601', name: 'The Watch', popularity: 0.5 }
    })
    expect(show(s, 'Binge Mode')).toMatchObject({
      resolution: 'ambiguous',
      candidates: [
        { id: 'e-1201', name: 'Binge Mode: Spin-off', popularity: 0.6 },
        { id: 'e-1202', name: 'Binge Mode: Other Feed', popularity: 0.2 }
      ]
    })
    expect(show(s, 'The Zach Lowe Show').resolution).toBe('missed')
    expect(show(s, 'The Press Box').resolution).toBe('missed')
    const log = await s.call<Evidence[]>('getEvidence')
    expect(log.map((e) => e.call)).toEqual(state(s).roster.map((r) => r.evidence))
  })

  it("serves the next visitor's sample network from the gateway's cache", async () => {
    fakeQloo({ search })
    await (await session()).until(settled)
    const sent = requests.length

    const next = await session()
    await next.until(settled)

    expect(requests).toHaveLength(sent)
    const log = await next.call<Evidence[]>('getEvidence')
    expect(log).toHaveLength(19)
    expect(log.every((e) => e.cacheHit)).toBe(true)
    expect(show(next, 'The Watch').resolution).toBe('resolved')
  })

  it('keeps the visitor’s edits when the session restarts, and opens the sample only once', async () => {
    fakeQloo({ search })
    const s = await session()
    await s.until(settled)
    await s.call('updateShow', 'The Watch', { downloads: 12_345 })
    s.close()
    // As after a deploy or an idle eviction: storage stays, and the agent starts again.
    await evictAllDurableObjects({ webSockets: 'close' })

    const reloaded = await session(s.cookie)
    expect(show(reloaded, 'The Watch').downloads).toBe(12_345)
    expect(requests).toHaveLength(19)

    const stranger = await session()
    await stranger.until(settled)
    expect(show(stranger, 'The Watch').downloads).toBe(340_000)
  })
})

describe('editing the sample network', () => {
  it('stops flagging a figure as sample once the visitor changes it', async () => {
    fakeQloo({ search })
    const s = await session()
    await s.until(settled)

    // The show editor saves downloads and status together; only the changed one becomes the visitor's.
    await s.call('updateShow', 'The Watch', { downloads: 340_000, status: 'hiatus' })
    expect(show(s, 'The Watch')).toMatchObject({ downloads: 340_000, status: 'hiatus' })
    expect(show(s, 'The Watch').sample).toEqual(['downloads', 'description'])
    expect(show(s, 'Binge Mode').sample).toEqual(allFigures)

    await s.call('setCpm', 20)
    expect(s.state()?.sample?.cpm).toBe(true)
    await s.call('setCpm', 25)
    expect(s.state()).toMatchObject({ cpm: 25, sample: { cpm: false } })
  })

  it('clears the sample network to an empty roster ready for an import', async () => {
    fakeQloo({
      search: {
        ...search,
        'Night Shift Cinema': [{ entity_id: 'e-0001', name: 'Night Shift Cinema', popularity: 0.9 }]
      }
    })
    const s = await session()
    await s.until(settled)

    await s.call('clearSample')
    expect(s.state()).toMatchObject({ roster: [], cpm: null, sample: null, launch: null, run: null })

    const state = await s.importRoster('Night Shift Cinema')
    expect(state.roster.map((r) => [r.name, r.resolution, r.sample])).toEqual([
      ['Night Shift Cinema', 'resolved', undefined]
    ])
    await expect(s.call('clearSample')).rejects.toThrow("The roster isn't the sample network")
    expect(s.state()?.roster).toHaveLength(1)
  })

  it('replaces the sample network with an imported roster, keeping only a CPM the visitor set', async () => {
    fakeQloo({ search })
    const sampleCpm = await session()
    await sampleCpm.until(settled)
    const imported = await sampleCpm.importRoster('Deep Cuts')
    expect(imported).toMatchObject({ roster: [{ name: 'Deep Cuts', resolution: 'missed' }], cpm: null, sample: null })

    const ownCpm = await session()
    await ownCpm.until(settled)
    await ownCpm.call('setCpm', 25)
    await ownCpm.call('clearSample')
    expect(ownCpm.state()).toMatchObject({ roster: [], cpm: 25, sample: null })
  })

  it('refuses to clear the sample network while its shows are still being looked up', async () => {
    fakeQloo({ search })
    const held = Promise.withResolvers<undefined>()
    network.use(
      http.get(`${env.QLOO_BASE_URL}/search`, ({ request }) =>
        new URL(request.url).searchParams.get('query') === 'The Watch' ? held.promise : undefined
      )
    )
    const s = await session()
    await s.until((st) => st.roster.filter((r) => r.resolution === 'pending').length === 1)

    await expect(s.call('clearSample')).rejects.toThrow('still being looked up')
    expect(s.state()?.roster).toHaveLength(19)
    held.resolve(undefined)
    await s.until(settled)
  })
})

const state = (s: Session) => s.state()!
