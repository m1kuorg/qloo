import { env } from 'cloudflare:workers'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { State } from '../src/agent'
import type { Session as Agent } from '../src/client/App'
import { LaunchWorkspace } from '../src/client/Launch'
import { fakeClaude, fakeCompare, fakeInsights, fakeQloo, fakeTopic, text, toolUse, topicNames, turn } from './fake'
import { hooked, launchPage, openSession, type Session } from './session'

// Made-up IDs and scores for seven of the sample's public show names; every other name misses.
const ids: Record<string, string> = {
  'The Watch': 'e-0706',
  'The Rewatchables': 'e-0702',
  'The Bill Simmons Podcast': 'e-0701',
  'The Big Picture': 'e-0703',
  'The Town with Matthew Belloni': 'e-0714',
  'The Ryen Russillo Podcast': 'e-0705',
  'Every Single Album': 'e-0715'
}
const search = {
  ...Object.fromEntries(Object.entries(ids).map(([name, entity_id]) => [name, [{ entity_id, name, popularity: 0.7 }]])),
  // A pitched book, for a guest pitch run.
  'Night Ferry': [{ entity_id: 'b-0001', name: 'Night Ferry', popularity: 0.5, disambiguation: '2019, Ada Quill' }]
}
// Fit order, made-up scores: The Bill Simmons Podcast is second here and fifth by topic alone, so it
// is the run's one climber.
const fit = [
  'The Rewatchables',
  'The Bill Simmons Podcast',
  'The Big Picture',
  'The Town with Matthew Belloni',
  'The Ryen Russillo Podcast',
  'Every Single Album'
].map((name, i) => ({ entity_id: ids[name], name, affinity: 0.9 - i / 100 }))
const topicOrder = [
  'Every Single Album',
  'The Rewatchables',
  'The Big Picture',
  'The Town with Matthew Belloni',
  'The Bill Simmons Podcast',
  'The Ryen Russillo Podcast'
]

// The sample launch as the agent runs it: rank the roster against The Watch, ask the budget and
// the exclusions, find the finalists' shared tags, draft the order, and end.
const finalists = fit.slice(0, 5).map((f) => f.entity_id)
const script = [
  turn(
    toolUse('rank_candidates', {
      anchor_ids: [ids['The Watch']],
      candidate_ids: fit.map((f) => f.entity_id),
      type: 'urn:entity:podcast'
    })
  ),
  turn(toolUse('ask_human', { question: 'What is the slot budget?', kind: 'budget', options: [] })),
  turn(
    toolUse('ask_human', { question: 'Which shows should this launch leave out?', kind: 'exclusions', options: [] })
  ),
  turn(toolUse('shared_tags', { anchor_ids: [ids['The Watch']], candidate_ids: finalists })),
  turn(
    toolUse('draft_insertion_order', {
      lines: [
        { show: 'The Rewatchables', slots: 8, angle: 'Rewatch fans already follow The Watch.' },
        { show: 'The Bill Simmons Podcast', slots: 6, angle: 'Its pop culture listeners overlap.' },
        { show: 'The Big Picture', slots: 6, angle: 'Film fans who watch TV too.' }
      ]
    })
  ),
  turn(text('Drafted the insertion order.'))
]

// New sessions open on the sample network here, as the guest network does deployed; other test files start empty.
const saved = env.SAMPLE_NETWORK
beforeEach(() => {
  env.SAMPLE_NETWORK = 'on'
  fakeQloo({ search })
  fakeInsights(fit)
  // Made-up tags each finalist shares with The Watch.
  fakeCompare(
    Object.fromEntries(finalists.map((id) => [id, [{ tag_id: 'urn:tag:keyword:media:tv', name: 'TV', score: 0.6131 }]]))
  )
  fakeTopic((request) => {
    const names = topicNames(request)
    return [...topicOrder.filter((n) => names.includes(n)), ...names.filter((n) => !topicOrder.includes(n))]
  })
  fakeClaude(script)
})
afterEach(() => {
  env.SAMPLE_NETWORK = saved
})

// The page renders in the tests' isolate, which has no DOM: the top bar's portals find no target.
beforeAll(() => {
  Object.assign(globalThis, { document: { getElementById: () => null } })
})
afterAll(() => {
  Reflect.deleteProperty(globalThis, 'document')
})

const open: Session[] = []
const session = async (cookie?: string) => {
  const s = await openSession(cookie)
  open.push(s)
  return s
}
afterEach(() => open.splice(0).forEach((s) => s.close()))

// The page as the session's browser renders it from synced state.
const page = (state: State) =>
  renderToStaticMarkup(<LaunchWorkspace agent={{ state, stub: {} } as unknown as Agent} {...launchPage} />)
const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
const settled = (s: State) => s.roster.length > 0 && s.roster.every((show) => show.resolution !== 'pending')
const waitingOn = (kind: string) => (s: State) => s.run?.status === 'waiting' && s.run.question?.kind === kind

// A new session, with the sample network looked up.
async function visit() {
  const s = await session()
  return { s, state: await s.until(settled) }
}

// The layout's guardrail: at every width the agent's open question is reachable without scrolling
// past the chart, so the question comes before the fit chart in reading order.
describe('the open question', () => {
  it('comes before the fit chart, so a single column reaches it first', async () => {
    const { s } = await visit()
    await s.call('startLaunch', { name: 'The Watch' })
    const html = page(await s.until(waitingOn('budget')))

    const ask = html.indexOf('aria-label="Agent asks"')
    const chart = html.indexOf('id="fit-h"')
    expect(ask).toBeGreaterThan(-1)
    expect(chart).toBeGreaterThan(-1)
    expect(ask).toBeLessThan(chart)
  })

  it('says which show leaving a finalist out brings into the finalists, and nothing for the others', async () => {
    const { s } = await visit()
    await s.call('startLaunch', { name: 'The Watch' })
    await s.until(waitingOn('budget'))
    await s.call('answer', 'toolu_2_1', { slots: 20 })
    const [ask] = hooked(page(await s.until(waitingOn('exclusions'))), 'data-ask')
    const row = (show: string) => words(hooked(ask, `data-exclusion="${show}"`)[0])

    // In fit order, with each show's band: the top five are finalists, and with any of them left out
    // the sixth, Every Single Album, comes in.
    expect(words(ask)).toMatch(
      /The Rewatchables .* The Bill Simmons Podcast .* The Big Picture .* The Town with Matthew Belloni .* The Ryen Russillo Podcast .* Every Single Album/
    )
    expect(row('The Bill Simmons Podcast')).toBe(
      'The Bill Simmons Podcast Finalist Leaving it out brings Every Single Album into the finalists. Strong'
    )
    expect(row('The Ryen Russillo Podcast')).toBe(
      'The Ryen Russillo Podcast Finalist Leaving it out brings Every Single Album into the finalists. Fair'
    )
    expect(row('Every Single Album')).toBe('Every Single Album Fair')
    expect(words(ask)).toContain('Leave all unticked for no exclusions.')
  })
})
