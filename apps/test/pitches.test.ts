import { env } from 'cloudflare:workers'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { State } from '../src/agent'
import type { Session as Agent } from '../src/client/App'
import { InboxWorkspace } from '../src/client/Inbox'
import sample from '../src/sample-inbox.json'
import {
  fakeClaude,
  fakeInsights,
  fakeQloo,
  modelRequests,
  requests,
  text,
  toolUse,
  turn,
  type Insight,
  type ModelRequest,
  type QlooEntity
} from './fake'
import { hooked, links, openSession, type Session } from './session'

// The pitch text an extraction request carries, so concurrent extractions can be answered in any order.
const pitchText = (request: ModelRequest): string =>
  request.messages
    .flatMap((m: { content: string | { type: string; text?: string }[] }) =>
      typeof m.content === 'string' ? [m.content] : m.content.map((b) => b.text ?? '')
    )
    .join('\n')

type Extracted = { guest: string; work: { title: string; type: string; year: number | null } | null }

// Scripts one extraction per pitch, answered from the pitch's text.
const fakeReader = (count: number, answer: (pitch: string) => Extracted | 'refuse') =>
  fakeClaude(
    Array.from({ length: count }, () => (request: ModelRequest) => {
      const a = answer(pitchText(request))
      return a === 'refuse'
        ? { content: [], stop_reason: 'refusal' as const, category: 'general_harms' }
        : turn(text(JSON.stringify(a)))
    })
  )

const qlooRequests = () => requests.filter((r) => r.url.origin === new URL(env.QLOO_BASE_URL).origin)
const rankings = () => qlooRequests().filter((r) => r.url.pathname === '/v2/insights')
const rankingBody = (type: string) =>
  rankings()
    .map((r) => JSON.parse(r.body))
    .filter((b) => b['filter.type'] === type)

const open: Session[] = []
const session = async () => {
  const s = await openSession()
  open.push(s)
  return s
}
beforeEach(() => {
  env.GUEST_PITCHES = 'on'
})
const savedCap = env.RUN_VISITOR_DAILY_CAP
afterEach(() => {
  open.splice(0).forEach((s) => s.close())
  env.GUEST_PITCHES = 'off'
  env.RUN_VISITOR_DAILY_CAP = savedCap
})

// One work type's ranked list on the inbox page, as the browser renders it from synced state, and its
// words as a reader hears them.
const list = (state: State, type: string) =>
  hooked(
    renderToStaticMarkup(createElement(InboxWorkspace, { agent: { state, stub: {} } as unknown as Agent, links })),
    `aria-labelledby="list-${type}"`
  )[0] ?? ''
const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

const finished = (s: Session) => s.until((state: State) => state.run !== null && state.run.status !== 'running')

// A synthetic show, its past guests' works, and pitches of three types: made-up names, IDs, and scores.
const work = (entity_id: string, name: string, disambiguation: string): QlooEntity[] => [
  { entity_id, name, popularity: 0.5, disambiguation }
]
const search: Record<string, QlooEntity[]> = {
  'Night Shift Cinema': [{ entity_id: 'e-0001', name: 'Night Shift Cinema', popularity: 0.8 }],
  'Night Ferry': work('b-0001', 'Night Ferry', '2019, Ada Quill'),
  'Paper Moons': work('b-0002', 'Paper Moons', '2016, Rue Vance'),
  'Static Bloom': work('f-0001', 'Static Bloom', '2021'),
  'Low Tide': work('f-0002', 'Low Tide', '2018'),
  'Dead Air': work('t-0001', 'Dead Air', '2017'),
  // The past guests' works.
  'Glass Harbor': work('f-0101', 'Glass Harbor', '2020'),
  'Salt Roads': work('b-0101', 'Salt Roads', '2015, Ivo Marsh')
}

const pitches = [
  {
    text: 'Ada Quill would love to talk about her novel Night Ferry.',
    guest: 'Ada Quill',
    title: 'Night Ferry',
    type: 'book',
    year: 2019
  },
  {
    text: 'Rue Vance has a new edition of Paper Moons out.',
    guest: 'Rue Vance',
    title: 'Paper Moons',
    type: 'book',
    year: 2016
  },
  {
    text: 'Ben Ochoa directed Static Bloom and loves your show.',
    guest: 'Ben Ochoa',
    title: 'Static Bloom',
    type: 'film',
    year: 2021
  },
  {
    text: 'Cy Lund on making Low Tide on a shoestring.',
    guest: 'Cy Lund',
    title: 'Low Tide',
    type: 'film',
    year: 2018
  },
  {
    text: 'Kit Arno created Dead Air, a radio-station sitcom.',
    guest: 'Kit Arno',
    title: 'Dead Air',
    type: 'tv_show',
    year: 2017
  }
] as const
// Two pitches that are set aside: a private person with no public work, and one Claude declines.
const noWork = 'Dot Pruitt ran a projection booth for thirty years. No book, just stories.'
const declined = 'A pitch the safety classifiers decline.'

const inboxText = [...pitches.map((p) => p.text), noWork, declined].join('\n---\n')

const film = { guest: 'Mae Ford', work: { title: 'Glass Harbor', type: 'film', year: 2020 } }
const book = { guest: 'Ivo Marsh', work: { title: 'Salt Roads', type: 'book', year: 2015 } }

// A session with the show imported, the pitches loaded, and a pitch run started with `pastGuests`
// and scripted through `script`.
async function rank(pastGuests: unknown[], script: Parameters<typeof fakeClaude>[0]) {
  const s = await loaded()
  fakeClaude(script)
  await s.call('startPitches', { show: 'Night Shift Cinema', pastGuests })
  return { s, state: await finished(s) }
}

// A session with the show imported and the pitches loaded.
async function loaded() {
  fakeQloo({ search })
  fakeReader(pitches.length + 2, (t) => {
    if (t.includes(declined)) return 'refuse'
    if (t.includes(noWork)) return { guest: 'Dot Pruitt', work: null }
    const p = pitches.find((p) => t.includes(p.text))!
    return { guest: p.guest, work: { title: p.title, type: p.type, year: p.year } }
  })
  const s = await session()
  await s.importRoster('Night Shift Cinema')
  await s.call('loadInbox', { text: inboxText })
  await s.until((state) => state.inbox?.status === 'done')
  return s
}

// The model passes every pitch, the set-aside ones included; the tool must leave those out.
const rankPitches = (past_guest_work_ids: string[]) =>
  toolUse('rank_pitches', {
    show_id: 'e-0001',
    past_guest_work_ids,
    pitch_ids: ['pitch-01', 'pitch-02', 'pitch-03', 'pitch-04', 'pitch-05', 'pitch-06', 'pitch-07']
  })

// Made-up affinities, unlike any other figure here, so a leak into state would show.
const scores: Record<string, Insight[]> = {
  'urn:entity:book': [
    { entity_id: 'b-0002', name: 'Paper Moons', affinity: 0.7341 },
    { entity_id: 'b-0001', name: 'Night Ferry', affinity: 0.7127 }
  ],
  'urn:entity:movie': [
    { entity_id: 'f-0001', name: 'Static Bloom', affinity: 0.6883 },
    { entity_id: 'f-0002', name: 'Low Tide', affinity: 0.6719 }
  ],
  'urn:entity:tv_show': [{ entity_id: 't-0001', name: 'Dead Air', affinity: 0.6557 }]
}
const affinities = Object.values(scores).flatMap((s) => s.map((i) => String(i.affinity)))

describe('ranking pitched works against the show', () => {
  it('makes one ranking per work type, with the show and past guests as anchors, and lists each by rank and band', async () => {
    fakeInsights((body) => scores[String(body['filter.type'])])
    const { s, state } = await rank([film], [turn(rankPitches(['f-0101'])), turn(text('Ranked.'))])

    expect(state.run).toMatchObject({ status: 'completed', error: null })
    expect(state.booking).toMatchObject({
      run: state.run!.id,
      show: { name: 'Night Shift Cinema', entity: { id: 'e-0001' } },
      pastGuests: [{ guest: 'Mae Ford', match: { resolution: 'resolved', entity: { id: 'f-0101' } } }]
    })
    const anchors = [
      { id: 'e-0001', name: 'Night Shift Cinema' },
      { id: 'f-0101', name: 'Glass Harbor' }
    ]
    expect(state.booking!.lists).toEqual([
      {
        type: 'book',
        path: 'show',
        anchors,
        calls: ['C-08'],
        error: null,
        rows: [
          { pitch: 'pitch-02', entity: expect.objectContaining({ id: 'b-0002' }), rank: 1, band: 'top' },
          { pitch: 'pitch-01', entity: expect.objectContaining({ id: 'b-0001' }), rank: 2, band: 'middle' }
        ],
        notScored: []
      },
      {
        type: 'film',
        path: 'show',
        anchors,
        calls: ['C-09'],
        error: null,
        rows: [
          { pitch: 'pitch-03', entity: expect.objectContaining({ id: 'f-0001' }), rank: 1, band: 'top' },
          { pitch: 'pitch-04', entity: expect.objectContaining({ id: 'f-0002' }), rank: 2, band: 'middle' }
        ],
        notScored: []
      },
      {
        type: 'tv_show',
        path: 'show',
        anchors,
        calls: ['C-10'],
        error: null,
        rows: [{ pitch: 'pitch-05', entity: expect.objectContaining({ id: 't-0001' }), rank: 1, band: 'top' }],
        notScored: []
      }
    ])
    // Each list is its own closed-list request, filtered to its type.
    const signal = { 'signal.interests.entities': 'e-0001,f-0101', 'feature.explainability': true, take: 50 }
    expect(rankings()).toHaveLength(3)
    expect(rankingBody('urn:entity:book')).toEqual([
      { 'filter.type': 'urn:entity:book', 'filter.results.entities': 'b-0001,b-0002', ...signal }
    ])
    expect(rankingBody('urn:entity:movie')).toEqual([
      { 'filter.type': 'urn:entity:movie', 'filter.results.entities': 'f-0001,f-0002', ...signal }
    ])
    // Ranks and bands reach the browser; the raw affinities stay in the evidence.
    for (const a of affinities) expect(s.frames().filter((f) => f.includes(a))).toEqual([])
    // The page lists each type on its own with its call and anchors: by rank, each work with the guest
    // as Claude read them, and its band.
    expect(words(list(state, 'book'))).toBe(
      'Books · 2 ranked C-08 Ranked against Night Shift Cinema and Glass Harbor. Rank Public work · guest Agent Fit 1 Paper Moons Rue Vance Strong 2 Night Ferry Ada Quill Good'
    )
    expect(words(list(state, 'tv_show'))).toContain('TV shows · 1 ranked C-10')
    // Each work opens its pitch.
    expect(list(state, 'film')).toMatch(/<button\b[^>]*>Static Bloom<\/button>/)
  })

  it('never sends a set-aside pitch, a guest name, or a sender detail in a ranking', async () => {
    fakeInsights((body) => scores[String(body['filter.type'])])
    await rank([film], [turn(rankPitches(['f-0101'])), turn(text('Ranked.'))])

    const candidates = rankings().flatMap((r) => String(JSON.parse(r.body)['filter.results.entities']).split(','))
    expect(candidates.toSorted()).toEqual(['b-0001', 'b-0002', 'f-0001', 'f-0002', 't-0001'])
    const sent = qlooRequests().map((r) => [...r.url.searchParams.values(), r.body].join('\n'))
    for (const detail of ['Dot Pruitt', 'Ada Quill', 'Mae Ford', 'projection', 'pitch-0'])
      expect(
        sent.filter((r) => r.includes(detail)),
        detail
      ).toEqual([])
  })

  it('ranks a type Qloo left unscored against the past guests of its type alone, and says which anchors it used', async () => {
    fakeInsights((body) => {
      const type = String(body['filter.type'])
      const signal = String(body['signal.interests.entities'])
      // Nothing scores against the show: books then rank against the past guest's book alone, and
      // TV shows, with no past guest's TV show, stay unranked.
      if (type === 'urn:entity:book') return signal === 'b-0101' ? scores[type] : []
      if (type === 'urn:entity:tv_show') return []
      return scores[type]
    })
    const { state } = await rank([film, book], [turn(rankPitches(['f-0101', 'b-0101'])), turn(text('Ranked.'))])

    const [books, films, tv] = state.booking!.lists!
    expect(books).toMatchObject({
      type: 'book',
      path: 'same_type',
      anchors: [{ id: 'b-0101', name: 'Salt Roads' }],
      calls: ['C-09', 'C-12'],
      error: null,
      rows: [
        { pitch: 'pitch-02', rank: 1 },
        { pitch: 'pitch-01', rank: 2 }
      ]
    })
    expect(films).toMatchObject({ type: 'film', path: 'show', calls: ['C-10'], rows: [{ rank: 1 }, { rank: 2 }] })
    expect(tv).toMatchObject({ type: 'tv_show', path: 'unranked', calls: ['C-11'], rows: [] })
    expect(tv.error).toContain("no past guest's work is a TV show")
    expect(tv.notScored).toEqual([{ pitch: 'pitch-05', reason: expect.stringContaining('Not ranked') }])
    expect(rankingBody('urn:entity:book').map((b) => b['signal.interests.entities'])).toEqual([
      'e-0001,f-0101,b-0101',
      'b-0101'
    ])
    // The page says which anchors each list used, and why a type isn't ranked, with its pitches.
    expect(words(list(state, 'book'))).toContain(
      'Books · 2 ranked C-09 C-12 Ranked against the past guests’ books alone: Salt Roads. Qloo scored no book against the show and every past guest (C-09).'
    )
    const unranked = words(list(state, 'tv_show'))
    expect(unranked).toMatch(/^TV shows · 0 ranked C-11 Failed Not ranked: .*no past guest's work is a TV show/)
    expect(unranked).toMatch(/Not scored · 1 Pitch Reason Dead Air Not ranked/)
  })
})

describe("the inbox's Run tab", () => {
  // A module of the Run tab, as the browser renders it from synced state.
  const module = (state: State, heading: string) =>
    hooked(
      renderToStaticMarkup(createElement(InboxWorkspace, { agent: { state, stub: {} } as unknown as Agent, links })),
      `aria-labelledby="${heading}"`
    )[0] ?? ''

  it("records what the run ranked against, each past guest's work with its match and call, and says when one didn't match", async () => {
    fakeInsights((body) => scores[String(body['filter.type'])])
    const missing = { guest: 'Lu Park', work: { title: 'Harbor Lights', type: 'film', year: 2001 } }
    const { state } = await rank([film, missing], [turn(rankPitches(['f-0101'])), turn(text('Ranked.'))])

    const [glass, lights] = state.booking!.pastGuests.map((g) => g.match!.evidence)
    expect(words(module(state, 'anchors-h'))).toBe(
      `Ranked against Qloo data Night Shift Cinema The show Glass Harbor ${glass} Mae Ford · Film · 2020 · Matched Harbor Lights ${lights} Lu Park · Film · 2001 · Not in Qloo A past guest’s work that didn’t match isn’t an anchor. Edit it and rank again.`
    )
  })

  it('lists the pitch runs, the one shown marked, with the daily limits on model runs', async () => {
    fakeInsights((body) => scores[String(body['filter.type'])])
    const { state } = await rank([film], [turn(rankPitches(['f-0101'])), turn(text('Ranked.'))])

    expect(words(module(state, 'runs-h'))).toMatch(
      /^Runs Run 1 · Pitches for Night Shift Cinema .+ · Completed Shown Each run starts fresh; earlier ones stay here to compare\. Model runs are limited per visitor/
    )
  })
})

describe("the model's view of the ranking", () => {
  it('names every pitch in the tool result by its work, scored or not', async () => {
    // Films score, except Low Tide, which Qloo leaves out; TV shows stay unranked.
    fakeInsights((body) => {
      const type = String(body['filter.type'])
      if (type === 'urn:entity:movie') return scores[type].slice(0, 1)
      if (type === 'urn:entity:tv_show') return []
      return scores[type]
    })
    await rank([film], [turn(rankPitches(['f-0101'])), turn(text('Ranked.'))])

    // The agent's second request carries the tool result; the reader's requests have no tools.
    const [, second] = modelRequests().filter((r) => r.tools)
    const lists = JSON.parse(second.messages.at(-1).content[0].content)
    const entries = lists.flatMap((l: { ranked: object[]; notScored: object[] }) => [...l.ranked, ...l.notScored])
    expect(entries.map((e: { pitch: string; work: string }) => [e.pitch, e.work]).toSorted()).toEqual([
      ['pitch-01', 'Night Ferry'],
      ['pitch-02', 'Paper Moons'],
      ['pitch-03', 'Static Bloom'],
      ['pitch-04', 'Low Tide'],
      ['pitch-05', 'Dead Air']
    ])
  })
})

describe('starting a pitch run', () => {
  it("counts loading an inbox and a pitch run among the visitor's model runs, and refuses both past the limit", async () => {
    env.RUN_VISITOR_DAILY_CAP = '2'
    fakeInsights((body) => scores[String(body['filter.type'])])
    const { s, state } = await rank([film], [turn(rankPitches(['f-0101'])), turn(text('Ranked the pitches.'))])
    expect(state.run?.status).toBe('completed')
    const asked = modelRequests().length

    const limit =
      "You've started 2 model runs today, the most one visitor can start in a UTC day; they reset at 00:00 UTC."
    await expect(s.call('loadInbox', { text: inboxText })).rejects.toThrow(limit)
    await expect(s.call('startPitches', { show: 'Night Shift Cinema', pastGuests: [film] })).rejects.toThrow(limit)
    expect(modelRequests()).toHaveLength(asked)
    expect(s.state()?.inbox?.status).toBe('done')
    expect(s.state()?.run?.id).toBe(state.run?.id)
  })

  it('refuses with GUEST_PITCHES off', async () => {
    env.GUEST_PITCHES = 'off'
    const s = await session()
    await expect(s.call('startPitches', { show: 'Night Shift Cinema', pastGuests: [] })).rejects.toThrow(
      "Guest pitches aren't switched on."
    )
    expect(requests).toEqual([])
  })

  it("refuses a past guest whose work title holds an email address or the guest's name, and sends nothing", async () => {
    const s = await loaded()
    const sent = requests.length
    const start = (title: string) =>
      s.call('startPitches', { show: 'Night Shift Cinema', pastGuests: [{ ...film, work: { ...film.work, title } }] })
    await expect(start('Glass Harbor mae@example.com')).rejects.toThrow(
      "Past guest 1's work title holds an email address."
    )
    await expect(start("Mae Ford's Glass Harbor")).rejects.toThrow(
      "Past guest 1's work title holds their name, so it isn't sent to Qloo."
    )
    expect(s.state()?.booking).toBeNull()
    expect(requests).toHaveLength(sent)
  })

  it("refuses a past guest's name or work title over 200 characters at once, before reading it, and sends nothing", async () => {
    const s = await loaded()
    const sent = requests.length
    const start = (guest: string, title: string) =>
      s.call('startPitches', { show: 'Night Shift Cinema', pastGuests: [{ guest, work: { ...film.work, title } }] })
    const began = Date.now()
    // A title an email-address pattern would take seconds to rule out.
    await expect(start('Mae Ford', '@'.repeat(4_000))).rejects.toThrow(
      "Past guest 1's work title is over 200 characters. Shorten it."
    )
    await expect(start('M'.repeat(201), 'Glass Harbor')).rejects.toThrow(
      "Past guest 1's name is over 200 characters. Shorten it."
    )
    expect(Date.now() - began).toBeLessThan(2_000)
    // At the limit, both are taken.
    fakeClaude([turn(text('Ranked.'))])
    await s.call('startPitches', {
      show: 'Night Shift Cinema',
      pastGuests: [{ guest: 'M'.repeat(200), work: { ...film.work, title: `Glass Harbor ${'x'.repeat(187)}` } }]
    })
    expect(s.state()?.booking?.pastGuests.map((g) => [g.guest.length, g.work.title.length])).toEqual([[200, 200]])
    await finished(s)
  })
})

// The sample inbox end to end: every Qloo request the pitch flow makes, searches and rankings,
// checked for each guest, past guest, sender, and address in the sample.
describe('the sample inbox', () => {
  it('never sends Qloo a guest name, a past guest name, or a sender detail', async () => {
    const works = sample.pitches.flatMap((p) => (p.expected.work ? [{ pitch: p.id, ...p.expected.work }] : []))
    const past = sample.show.pastGuests.map((g, i) => ({ ...g.work, id: `pg-${i + 1}` }))
    fakeQloo({
      search: {
        'The Big Picture': [{ entity_id: 'e-bp', name: 'The Big Picture', popularity: 0.9 }],
        ...Object.fromEntries(
          [...works.map((w) => ({ ...w, id: `w-${w.pitch}` })), ...past].map((w) => [
            w.title,
            [{ entity_id: w.id, name: w.title, popularity: 0.5, disambiguation: String(w.year) }]
          ])
        )
      }
    })
    fakeInsights((body) =>
      String(body['filter.results.entities'])
        .split(',')
        .map((id, i) => ({ entity_id: id, name: id, affinity: 0.9 - i / 100 }))
    )
    fakeReader(sample.pitches.length, (t) => {
      const p = sample.pitches.find((p) => t.includes(p.body))!
      return { guest: p.expected.guest, work: p.expected.work }
    })
    const s = await session()
    await s.importRoster('The Big Picture')
    await s.call('loadInbox', { sample: true })
    await s.until((state) => state.inbox?.status === 'done')
    fakeClaude([
      turn(
        toolUse('rank_pitches', {
          show_id: 'e-bp',
          past_guest_work_ids: past.map((w) => w.id),
          pitch_ids: sample.pitches.map((p) => p.id)
        })
      ),
      turn(text('Ranked.'))
    ])
    // The sample inbox carries its show and past guests, which the page fills in.
    const { show } = s.state()!.inbox!
    expect(show).toEqual({
      name: 'The Big Picture',
      pastGuests: sample.show.pastGuests.map(({ guest, work }) => ({ guest, work }))
    })
    await s.call('startPitches', { show: show!.name, pastGuests: show!.pastGuests })
    const state = await finished(s)

    expect(state.run?.status).toBe('completed')
    expect(state.booking?.lists?.map((l) => [l.type, l.path])).toEqual([
      ['book', 'show'],
      ['film', 'show'],
      ['tv_show', 'show'],
      ['podcast', 'show']
    ])
    expect(rankings()).toHaveLength(4)
    // Each request as Qloo reads it: the path, every decoded parameter, and the body.
    const sent = qlooRequests().map((r) =>
      [r.url.pathname, ...[...r.url.searchParams].map(([k, v]) => `${k}=${v}`), r.body].join('\n').toLowerCase()
    )
    const personal = [
      ...sample.pitches.flatMap((p) => [p.expected.guest, p.senderName, p.senderEmail]),
      ...sample.show.pastGuests.map((g) => g.guest),
      '@'
    ]
    for (const detail of personal)
      expect(
        sent.filter((r) => r.includes(detail.toLowerCase())),
        detail
      ).toEqual([])
  })
})
