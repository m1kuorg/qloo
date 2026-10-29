// The fit chart as a visitor reads it: its finding with the ranking's call, the shows in contention
// before "Show all", each show's move against a topic-only plan, and the lens once the topic column is
// in. Each test runs a launch through the fakes and renders the real workspace from the synced state.
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { State } from '../src/agent'
import type { Session as Agent } from '../src/client/App'
import { LaunchWorkspace } from '../src/client/Launch'
import { fakeClaude, fakeInsights, fakeQloo, fakeTopic, text, toolUse, turn } from './fake'
import { hooked, launchPage, openSession, type Session } from './session'

// A made-up launch and eight made-up shows, one exact match each. Fit order is the shows' order.
const launch = 'Night Shift Cinema'
const shows = [
  'Deep Cuts',
  'Signal Boost',
  'Paper Trail',
  'Field Notes',
  'Slow Burn',
  'Corner Booth',
  'Ghost Signal',
  'Late Reel'
]
const id = (name: string) => `e-0${[launch, ...shows].indexOf(name)}01`
const search = Object.fromEntries(
  [launch, ...shows].map((name) => [name, [{ entity_id: id(name), name, popularity: 0.5 }]])
)
// By topic alone, Signal Boost is sixth: second by fit, it climbs 4. Corner Booth, sixth by fit, is in
// a topic-only plan's top five; Ghost Signal and Late Reel are in contention neither way.
const topicOrder = [
  'Deep Cuts',
  'Paper Trail',
  'Field Notes',
  'Slow Burn',
  'Corner Booth',
  'Signal Boost',
  'Late Reel',
  'Ghost Signal'
]

beforeEach(() => {
  fakeQloo({ search })
  fakeInsights(shows.map((name, i) => ({ entity_id: id(name), name, affinity: 0.9 - i / 100 })))
  fakeTopic(topicOrder)
  fakeClaude([
    turn(toolUse('resolve_entities', { names: [launch], type: 'urn:entity:podcast' })),
    turn(
      toolUse('rank_candidates', {
        anchor_ids: [id(launch)],
        candidate_ids: shows.map(id),
        type: 'urn:entity:podcast'
      })
    ),
    turn(text('Ranked.'))
  ])
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

const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
const chart = (state: State) =>
  hooked(
    renderToStaticMarkup(<LaunchWorkspace agent={{ state, stub: {} } as unknown as Agent} {...launchPage} />),
    'aria-labelledby="fit-h"'
  )[0]
// The chart's rows, by show, in the order they're listed.
const rows = (state: State) =>
  [...hooked(chart(state), 'data-fit-chart')[0].matchAll(/\sdata-show="([^"]+)"/g)].map((m) => m[1])
// A button's words run together across the inline markup in it, as its accessible name does: a
// climber's chevron rides on its name's last character.
const named = (html: string) =>
  html.replace(/<button\b[^>]*>[\s\S]*?<\/button>/g, (b) => `<button>${b.replace(/<[^>]+>/g, '')}</button>`)
const row = (state: State, show: string) => words(named(hooked(chart(state), `data-show="${show}"`)[0]))

const ranked = (s: State) => s.ranking !== null && s.run?.status === 'completed'

// A session with the eight shows on its roster and the launch run, ranked.
async function launched(ready: (s: State) => boolean = (s) => ranked(s) && s.topic?.status === 'ranked') {
  const s = await openSession()
  open.push(s)
  await s.importRoster(shows.join('\n'))
  await s.call('startLaunch', { name: launch })
  return s.until(ready)
}

describe('the fit chart', () => {
  it('leads with its finding and the ranking’s call', async () => {
    const state = await launched()

    expect(words(chart(state))).toMatch(
      new RegExp(
        `^Who shares Night Shift Cinema’s listeners 5 finalists\\. Signal Boost climbs 4 places over a topic-only plan\\. ${state.ranking!.call} `
      )
    )
  })

  it('lists the shows in contention, in fit order, until every ranked show is asked for', async () => {
    const state = await launched()

    // The finalists, then Corner Booth, which a topic-only plan picks.
    expect(rows(state)).toEqual([
      'Deep Cuts',
      'Signal Boost',
      'Paper Trail',
      'Field Notes',
      'Slow Burn',
      'Corner Booth'
    ])
    expect(words(chart(state))).toContain('Show all 8')
  })

  it('marks each show’s move against its topic rank, which it labels the agent’s', async () => {
    const state = await launched()

    expect(words(hooked(chart(state), 'role="rowgroup"')[0])).toBe('Rank Move Show Topic Agent Fit Slot value')
    // The glyph is for the eye, its words for screen readers, as are both ranks, the lens's first; the
    // band is the meter's word.
    expect(row(state, 'Signal Boost')).toBe(
      '2 2nd by who listens, 6th by topic ▲4 Up 4 places Signal Boost Finalist Topic #6 Strong – No network CPM'
    )
    expect(row(state, 'Paper Trail')).toBe(
      '3 3rd by who listens, 2nd by topic ▼1 Down 1 place Paper Trail Finalist Topic #2 Strong – No network CPM'
    )
    expect(row(state, 'Corner Booth')).toBe(
      '6 6th by who listens, 5th by topic ▼1 Down 1 place Corner Booth Topic #5 Good – No network CPM'
    )
    // A climber's name opens why it moved; no other show's does.
    const climber = hooked(chart(state), 'data-show="Signal Boost"')[0]
    expect(climber).toMatch(/<button\b(?=[^>]*\saria-expanded="false")(?=[^>]*\saria-controls="why-2")/)
    expect(words(named(climber.match(/<button\b[\s\S]*?<\/button>/)![0]))).toBe('Signal Boost')
    expect(hooked(chart(state), 'data-show="Paper Trail"')[0]).not.toContain('<button')
  })

  it('offers the topic lens only once the topic column has ranked', async () => {
    const held = Promise.withResolvers<void>()
    fakeTopic(async () => {
      await held.promise
      return topicOrder
    })
    const state = await launched((s) => ranked(s) && s.topic?.status === 'ranking')

    const text = words(chart(state))
    expect(text).toContain('Working Ranking the roster by topic alone for the Topic column…')
    expect(text).not.toContain('By topic')
    expect(text).toContain('Qloo data Ranked by listener overlap with Night Shift Cinema')

    held.resolve()
    const lens = words(chart(await open[0].until((s) => s.topic?.status === 'ranked')))
    expect(lens).toContain('By who listens By topic Qloo data Ranked by listener overlap with Night Shift Cinema')
  })
})
