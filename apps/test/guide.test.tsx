import { evictAllDurableObjects } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { State } from '../src/agent'
import { Workspace, type Session as Agent } from '../src/client/App'
import { fakeClaude, fakeInsights, fakeQloo, fakeTopic, text, toolUse, topicNames, turn } from './fake'
import { openSession, type Session } from './session'

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
// the exclusions, draft the order, and end.
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

// New sessions open on the sample network here, as deployed; other test files start empty.
const saved = env.SAMPLE_NETWORK
const savedPitches = env.GUEST_PITCHES
beforeEach(() => {
  env.SAMPLE_NETWORK = 'on'
  fakeQloo({ search })
  fakeInsights(fit)
  fakeTopic((request) => {
    const names = topicNames(request)
    return [...topicOrder.filter((n) => names.includes(n)), ...names.filter((n) => !topicOrder.includes(n))]
  })
  fakeClaude(script)
})
afterEach(() => {
  env.SAMPLE_NETWORK = saved
  env.GUEST_PITCHES = savedPitches
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
  renderToStaticMarkup(<Workspace page="roster" agent={{ state, stub: {} } as unknown as Agent} />)
const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
// The guide's text, or null when the page has no guide.
const guide = (state: State) => {
  const html = page(state).match(/<section class="mod guide"[\s\S]*?<\/section>/)
  return html && words(html[0])
}

const settled = (s: State) => s.roster.length > 0 && s.roster.every((show) => show.resolution !== 'pending')
const charted = (s: State) => s.ranking !== null && s.topic?.status === 'ranked'
const waitingOn = (kind: string) => (s: State) => s.run?.status === 'waiting' && s.run.question?.kind === kind
const completed = (s: State) => s.run?.status === 'completed'

// A new visitor, with the sample network looked up.
async function visit() {
  const s = await session()
  return { s, state: await s.until(settled) }
}

// The guided sample launch, every step done, through to the approved order.
async function guidedLaunch(s: Session) {
  await s.call('startLaunch', { name: 'The Watch' })
  await s.until(charted)
  await s.call('markGuide', 'why')
  await s.call('markGuide', 'evidence')
  await s.until(waitingOn('budget'))
  await s.call('answer', 'toolu_2_1', { slots: 20 })
  await s.until(waitingOn('exclusions'))
  await s.call('answer', 'toolu_3_1', { exclude: [] })
  const { insertionOrder } = await s.until(completed)
  await s.call('approveInsertionOrder', insertionOrder!.id)
  return s.state()!
}

// A one-pitch inbox and a guest pitch run for The Big Picture, which becomes the session's latest run.
async function pitchRun(s: Session) {
  env.GUEST_PITCHES = 'on'
  fakeClaude([
    turn(text(JSON.stringify({ guest: 'Ada Quill', work: { title: 'Night Ferry', type: 'book', year: 2019 } }))),
    turn(text('Nothing to rank yet.'))
  ])
  await s.call('loadInbox', { text: 'Ada Quill would love to talk about her novel Night Ferry.' })
  await s.until((state) => state.inbox?.status === 'done')
  await s.call('startPitches', { show: 'The Big Picture', pastGuests: [] })
  return s.until((state) => state.booking?.run === state.run?.id && state.run?.status === 'completed')
}

describe('the guide through the sample launch', () => {
  it('opens a new session at step 1, beside controls that all still work', async () => {
    const { state } = await visit()

    expect(guide(state)).toContain('Step 1 of 5')
    expect(guide(state)).toContain('The Watch is in the launch field. Select Start run.')
    // Nothing is covered or disabled for it: no overlay, and the launch can be started.
    const html = page(state)
    expect(html).not.toMatch(/aria-modal|inert/)
    expect(html).toMatch(/<button class="btn pri" type="submit">Start run<\/button>/)
  })

  it('advances with each step, from the climber and its evidence to the approved order', async () => {
    const { s } = await visit()
    await s.call('startLaunch', { name: 'The Watch' })
    let state = await s.until(charted)
    expect(guide(state)).toContain('Step 2 of 5')
    expect(guide(state)).toContain('Select The Bill Simmons Podcast, marked with the red bullet, for why it moved.')

    // Opening the why-it-moved line and a call it cites happen in the page, which marks them.
    await s.call('markGuide', 'why')
    expect(guide(s.state()!)).toContain('Step 3 of 5')
    expect(guide(s.state()!)).toContain(`Select ${state.ranking!.call} in the why-it-moved line`)
    await s.call('markGuide', 'evidence')
    state = await s.until(waitingOn('budget'))
    expect(guide(state)).toContain('Step 4 of 5')
    // The sample's suggested answers, shown and never filled in.
    expect(guide(state)).toContain('Sample answers: 20 promo slots, then leave every show unticked.')
    expect(state.run?.budget).toBeNull()

    await s.call('answer', 'toolu_2_1', { slots: 20 })
    state = await s.until(waitingOn('exclusions'))
    expect(guide(state)).toContain('Step 4 of 5')
    await s.call('answer', 'toolu_3_1', { exclude: [] })
    state = await s.until(completed)
    expect(guide(state)).toContain('Step 5 of 5')
    expect(guide(state)).toContain('select Approve on the insertion order draft')

    await s.call('approveInsertionOrder', state.insertionOrder!.id)
    expect(guide(s.state()!)).toMatch(/^Guide Done Dismiss 1\. Start the sample launch Done .* 5\. .* Done/)
    expect(guide(s.state()!)).not.toContain('Skipped')
  })

  it('follows a visitor who answers before trying the page steps, marking those skipped', async () => {
    const { s } = await visit()
    await s.call('startLaunch', { name: 'The Watch' })
    await s.until(waitingOn('budget'))
    await s.call('answer', 'toolu_2_1', { slots: 20 })
    await s.until(waitingOn('exclusions'))
    await s.call('answer', 'toolu_3_1', { exclude: [] })
    const state = await s.until(completed)

    expect(guide(state)).toContain('Step 5 of 5')
    expect(guide(state)).toMatch(/2\. [^0-9]* Skipped 3\. [^0-9]* Skipped 4\./)
  })

  it('stays hidden for the rest of the session once dismissed', async () => {
    const { s } = await visit()
    await s.call('dismissGuide')
    expect(guide(s.state()!)).toBeNull()

    // A reload, then a restart of the session's agent with its storage kept.
    s.close()
    expect(guide((await session(s.cookie)).state()!)).toBeNull()
    await evictAllDurableObjects({ webSockets: 'close' })
    const restarted = await session(s.cookie)
    expect(guide(restarted.state()!)).toBeNull()
    // A run's state doesn't bring it back either.
    await restarted.call('startLaunch', { name: 'The Watch' })
    expect(guide(await restarted.until(charted))).toBeNull()

    const stranger = await visit()
    expect(guide(stranger.state)).toContain('Step 1 of 5')
  })

  it('stays done after a guest pitch run replaces the guided launch as the latest run', async () => {
    const { s } = await visit()
    const launched = await guidedLaunch(s)
    expect(guide(launched)).toMatch(/^Guide Done /)

    const pitched = await pitchRun(s)
    expect(pitched.runs.map((r) => r.pitchesFor ?? r.launch)).toEqual(['The Watch', 'The Big Picture'])
    expect(guide(pitched)).toMatch(/^Guide Done Dismiss 1\. Start the sample launch Done .* 5\. .* Done/)
    expect(guide(pitched)).not.toContain('Skipped')
  })

  it('starts at step 1 when the only run is a guest pitch run', async () => {
    const { s } = await visit()
    expect(guide(await pitchRun(s))).toContain('Step 1 of 5')
  })

  it("doesn't show once the roster isn't the sample network", async () => {
    const { s } = await visit()
    await s.call('clearSample')
    expect(guide(s.state()!)).toBeNull()
  })

  it('refuses a mark that is no guide step', async () => {
    const { s } = await visit()
    await expect(s.call('markGuide', 'approved')).rejects.toThrow("isn't a step")
    expect(guide(s.state()!)).toContain('Step 1 of 5')
  })
})

// DESIGN.md's layout guardrail: at every width the agent's open question is reachable without
// scrolling past the chart. A narrow screen stacks the page in reading order, so the question
// must come before the fit chart there.
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
})
