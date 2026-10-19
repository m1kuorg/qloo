import { env } from 'cloudflare:workers'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { State } from '../src/agent'
import { Workspace, type Session as Agent } from '../src/client/App'
import { fakeClaude, fakeInsights, fakeQloo, fakeTopic, text, toolUse, turn } from './fake'
import { links, openSession, type Session } from './session'

// Made-up IDs and scores for four of the sample's public show names; every other name misses.
const ids: Record<string, string> = {
  'The Watch': 'e-1906',
  'The Rewatchables': 'e-1902',
  'The Bill Simmons Podcast': 'e-1901',
  'The Big Picture': 'e-1903'
}
const search = Object.fromEntries(
  Object.entries(ids).map(([name, entity_id]) => [name, [{ entity_id, name, popularity: 0.7 }]])
)
const fit = ['The Rewatchables', 'The Bill Simmons Podcast', 'The Big Picture'].map((name, i) => ({
  entity_id: ids[name],
  name,
  affinity: 0.9 - i / 100
}))
// The agent ranks the roster against The Watch and ends.
const script = [
  turn(
    toolUse('rank_candidates', {
      anchor_ids: [ids['The Watch']],
      candidate_ids: fit.map((f) => f.entity_id),
      type: 'urn:entity:podcast'
    })
  ),
  turn(text('Ranked.'))
]

beforeEach(() => {
  fakeQloo({ search })
  fakeInsights(fit)
  fakeTopic()
  fakeClaude(script)
})

// The page renders in the tests' isolate, which has no DOM: the top bar's portals find no target.
beforeAll(() => {
  Object.assign(globalThis, { document: { getElementById: () => null } })
})
afterAll(() => {
  Reflect.deleteProperty(globalThis, 'document')
})

const open: Session[] = []
afterEach(() => open.splice(0).forEach((s) => s.close()))
const saved = env.SAMPLE_NETWORK
afterEach(() => {
  env.SAMPLE_NETWORK = saved
})

const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
const page = (state: State) =>
  renderToStaticMarkup(<Workspace page="roster" agent={{ state, stub: {} } as unknown as Agent} links={links} />)
// A fit chart row's slot value cell, as read: the value, the downloads it's priced from, any sample label.
const slot = (state: State, show: string) => {
  const chart = page(state).match(/<table class="chart fit-chart"[\s\S]*?<\/table>/)![0]
  const row = chart.split('<tr').find((r) => r.includes(`<span class="nm">${show}</span>`))
  return words(row!.match(/<td class="r val">([\s\S]*?)<\/td>/)![1])
}
// The line under the fit chart that says how slot values are priced.
const footnote = (state: State) => words(page(state).match(/<p class="help chart-foot">([\s\S]*?)<\/p>/)![1])

const charted = (s: State) => s.ranking !== null && s.run?.status === 'completed'
const settled = (s: State) => s.roster.length > 0 && s.roster.every((show) => show.resolution !== 'pending')

// A session on the sample network, with the sample launch run and ranked.
async function sampleRun() {
  env.SAMPLE_NETWORK = 'on'
  const s = await openSession()
  open.push(s)
  await s.until(settled)
  await s.call('startLaunch', { name: 'The Watch' })
  await s.until(charted)
  return s
}

describe('the fit chart’s slot value', () => {
  it('prices each scored show’s slot, labelled sample while sample figures price it', async () => {
    const s = await sampleRun()

    expect(slot(s.state()!, 'The Rewatchables')).toBe('$9,600 480,000 downloads sample')
    expect(slot(s.state()!, 'The Bill Simmons Podcast')).toBe('$14,000 700,000 downloads sample')
    expect(slot(s.state()!, 'The Big Picture')).toBe('$8,000 400,000 downloads sample')
    expect(footnote(s.state()!)).toBe('Slot value = downloads × $20 sample CPM ÷ 1,000 · sample figures')
  })

  it('reprices a row when the network changes its figures, dropping their sample label', async () => {
    const s = await sampleRun()

    await s.call('setCpm', 25)
    // The downloads are still the sample's, so the row still says so.
    expect(slot(s.state()!, 'The Rewatchables')).toBe('$12,000 480,000 downloads sample')
    expect(footnote(s.state()!)).toBe('Slot value = downloads × $25 CPM ÷ 1,000')

    await s.call('updateShow', 'The Rewatchables', { downloads: 500_000 })
    expect(slot(s.state()!, 'The Rewatchables')).toBe('$12,500 500,000 downloads')
  })

  it('leaves a gap where a show has no downloads', async () => {
    const s = await sampleRun()

    await s.call('updateShow', 'The Big Picture', { downloads: null })
    expect(slot(s.state()!, 'The Big Picture')).toBe('– No downloads per episode')
  })

  it('asks for the network CPM before pricing any slot', async () => {
    const s = await openSession()
    open.push(s)
    await s.importRoster('The Watch\nThe Rewatchables\nThe Bill Simmons Podcast\nThe Big Picture')
    await s.call('startLaunch', { name: 'The Watch' })
    const state = await s.until(charted)

    expect(state.cpm).toBeNull()
    expect(slot(state, 'The Rewatchables')).toBe('– No network CPM')
    expect(footnote(state)).toBe('Slot values need the network’s CPM: set it under Network CPM.')
  })
})
