import { evictAllDurableObjects, runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CrossfeedAgent, RunSnapshot, State } from '../src/agent'
import type { Session as Agent } from '../src/client/App'
import { InboxWorkspace, RankedPitches } from '../src/client/Inbox'
import type { Lens } from '../src/client/Rerank'
import sample from '../src/sample-inbox.json'
import {
  fakeClaude,
  fakeInsights,
  fakePitchRanking,
  fakeQloo,
  modelRequests,
  pitchRankingRequests,
  refusal,
  requests,
  text,
  toolUse,
  topicNames,
  turn,
  type Insight,
  type ModelRequest,
  type QlooEntity
} from './fake'
import { hooked, links, openGuest, openSession, type Session } from './session'

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

const open: Omit<Session, 'cookie'>[] = []
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

// The run has stopped running, and its pitch ranking, beside it, has landed.
const finished = (s: Omit<Session, 'cookie'>) =>
  s.until(
    (state: State) =>
      state.run !== null && state.run.status !== 'running' && state.booking?.pitchRanking?.status !== 'ranking'
  )

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
  'Salt Roads': work('b-0101', 'Salt Roads', '2015, Ivo Marsh'),
  'Quiet Hours': work('t-0101', 'Quiet Hours', '2014')
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
const tvShow = { guest: 'Lou Pike', work: { title: 'Quiet Hours', type: 'tv_show', year: 2014 } }

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
    // The pitch ranking beside the run ranks the pitches in inbox order, as the fake does by default, so
    // each row's pitch rank counts its list's pitches in that order, and its move is that less its rank.
    const row = (pitch: string, id: string, rank: number, band: string, pitchRank: number, move: number) => ({
      pitch,
      entity: expect.objectContaining({ id }),
      rank,
      band,
      pitchRank,
      move
    })
    expect(state.booking!.lists).toEqual([
      {
        type: 'book',
        path: 'show',
        anchors,
        calls: ['C-08'],
        error: null,
        rows: [row('pitch-02', 'b-0002', 1, 'top', 2, 1), row('pitch-01', 'b-0001', 2, 'middle', 1, -1)],
        notScored: []
      },
      {
        type: 'film',
        path: 'show',
        anchors,
        calls: ['C-09'],
        error: null,
        rows: [row('pitch-03', 'f-0001', 1, 'top', 1, 0), row('pitch-04', 'f-0002', 2, 'middle', 2, 0)],
        notScored: []
      },
      {
        type: 'tv_show',
        path: 'show',
        anchors,
        calls: ['C-10'],
        error: null,
        rows: [row('pitch-05', 't-0001', 1, 'top', 1, 0)],
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
    // The page lists each type on its own with its finding, its anchors and call, and its lens: by rank,
    // with both ranks in words, each work's move, the work with the guest as Claude read them, its pitch
    // rank, and its band.
    expect(words(list(state, 'book'))).toBe(
      'Books · 2 ranked Night Ferry reads most on-topic but falls out of the top band by who listens. Ranked against Night Shift Cinema and Glass Harbor. C-08 By who listens By the pitch Qloo data Ranked by listener overlap with Night Shift Cinema and Glass Harbor Rank Move Public work · guest Agent Pitch Agent Fit 1 1st by who listens, 2nd by the pitch ▲1 Up 1 place Paper Moons Rue Vance Pitch #2 Strong 2 2nd by who listens, 1st by the pitch ▼1 Down 1 place Night Ferry Ada Quill Pitch #1 Good'
    )
    expect(words(list(state, 'tv_show'))).toMatch(/^TV shows · 1 ranked Ranked against .+\. C-10 /)
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
      'Books · 2 ranked Night Ferry reads most on-topic but falls out of the top band by who listens. Ranked against the past guests’ books alone: Salt Roads. Qloo scored no book against the show and every past guest (C-09). C-09 C-12'
    )
    const unranked = words(list(state, 'tv_show'))
    expect(unranked).toMatch(/^TV shows · 0 ranked Failed Not ranked: .*no past guest's work is a TV show.* C-11 /)
    expect(unranked).toMatch(/Not scored · 1 Pitch Reason Dead Air Not ranked/)
  })

  it('words a TV show as one where its list is ranked against a past guest’s TV show alone', async () => {
    fakeInsights((body) =>
      body['filter.type'] === 'urn:entity:tv_show' && body['signal.interests.entities'] !== 't-0101'
        ? []
        : scores[String(body['filter.type'])]
    )
    const { state } = await rank([film, tvShow], [turn(rankPitches(['f-0101', 't-0101'])), turn(text('Ranked.'))])

    expect(state.booking!.lists!.find((l) => l.type === 'tv_show')).toMatchObject({ path: 'same_type' })
    const tv = list(state, 'tv_show')
    expect(words(tv)).toContain(
      'TV shows · 1 ranked Ranked against the past guests’ TV shows alone: Quiet Hours. Qloo scored no TV show against the show and every past guest (C-11). C-11 C-12'
    )
    expect(tv).toContain('aria-label="Evidence for the TV show ranking: call C-11"')
    expect(tv).toContain('aria-label="Evidence for the TV show ranking: call C-12"')
  })
})

// The pitch ranking: one call beside each pitch run ranks its pitches by what they say, with no Qloo
// data. Seven film pitches, each with a sender and a subject, two of them for one work, Low Tide; made-up
// names, IDs, and scores.
describe('ranking the pitches by what they say', () => {
  const films = [
    { guest: 'Ben Ochoa', title: 'Static Bloom', year: 2021 },
    { guest: 'Cy Lund', title: 'Low Tide', year: 2018 },
    { guest: 'Ida Wren', title: 'Glass Lantern', year: 2022 },
    { guest: 'Jo Hale', title: 'Paper Planes', year: 2019 },
    { guest: 'Ola Lund', title: 'Low Tide', year: 2018 },
    { guest: 'Pia Stone', title: 'Red Static', year: 2023 },
    { guest: 'Rex Moor', title: 'Night Owls', year: 2016 }
  ]
  const ids = films.map((_, i) => `pitch-0${i + 1}`)
  const address = (guest: string) => `${guest.split(' ')[0].toLowerCase()}@example.com`
  // Each pitch names its guest and work; Ola Lund's runs past the opening the ranking reads.
  const body = (f: (typeof films)[number]) =>
    f.guest === 'Ola Lund'
      ? `${f.guest} made ${f.title}, and here is the whole story. ${'It was a long shoot. '.repeat(40)}The very end.`
      : `${f.guest} made ${f.title}.`
  const inbox = films
    .map(
      (f, i) => `From: ${f.guest} Publicity <${address(f.guest)}>\nSubject: ${f.title}: pitch ${i + 1}\n\n${body(f)}`
    )
    .join('\n---\n')
  // Made-up affinities: Glass Lantern scores best, then Low Tide, which both its pitches share.
  const filmScores: Insight[] = [
    { entity_id: 'f-0003', name: 'Glass Lantern', affinity: 0.7103 },
    { entity_id: 'f-0002', name: 'Low Tide', affinity: 0.6911 },
    { entity_id: 'f-0006', name: 'Night Owls', affinity: 0.6647 },
    { entity_id: 'f-0001', name: 'Static Bloom', affinity: 0.6409 },
    { entity_id: 'f-0005', name: 'Red Static', affinity: 0.6122 },
    { entity_id: 'f-0004', name: 'Paper Planes', affinity: 0.5871 }
  ]
  const filmSearch = {
    ...search,
    'Glass Lantern': work('f-0003', 'Glass Lantern', '2022'),
    'Paper Planes': work('f-0004', 'Paper Planes', '2019'),
    'Red Static': work('f-0005', 'Red Static', '2023'),
    'Night Owls': work('f-0006', 'Night Owls', '2016')
  }

  // A session with the show imported and the film pitches loaded and read, each work searched in
  // `searched`.
  async function filmsLoaded(searched = filmSearch) {
    fakeQloo({ search: searched })
    fakeInsights(filmScores)
    fakeReader(films.length, (t) => {
      const f = films.find((f) => t.includes(`${f.guest} made`))!
      return { guest: f.guest, work: { title: f.title, type: 'film', year: f.year } }
    })
    const s = await session()
    await s.importRoster('Night Shift Cinema')
    await s.call('loadInbox', { text: inbox })
    await s.until((state) => state.inbox?.status === 'done')
    return s
  }
  // Starts a pitch run against the show and Mae Ford's Glass Harbor, ranking every pitch, its first turn
  // held until `held` resolves.
  const start = async (s: Omit<Session, 'cookie'>, held?: Promise<void>) => {
    const rank = turn(toolUse('rank_pitches', { show_id: 'e-0001', past_guest_work_ids: ['f-0101'], pitch_ids: ids }))
    fakeClaude([held ? () => held.then(() => rank) : rank, turn(text('Ranked.'))])
    return (await s.call<{ runId: string }>('startPitches', { show: 'Night Shift Cinema', pastGuests: [film] })).runId
  }
  // The section over the lists, as the browser renders it from synced state.
  const lists = (state: State) =>
    hooked(
      renderToStaticMarkup(createElement(InboxWorkspace, { agent: { state, stub: {} } as unknown as Agent, links })),
      'aria-labelledby="lists-h"'
    )[0] ?? ''

  it('gives each row its pitch rank and its move by who listens, and says which pitches climb and which on-topic ones fall', async () => {
    fakePitchRanking(['pitch-04', 'pitch-01', 'pitch-06', 'pitch-02', 'pitch-07', 'pitch-03', 'pitch-05'])
    const s = await filmsLoaded()
    await start(s)
    const state = await finished(s)

    expect(state.booking!.pitchRanking).toEqual({
      status: 'ranked',
      order: ['pitch-04', 'pitch-01', 'pitch-06', 'pitch-02', 'pitch-07', 'pitch-03', 'pitch-05'],
      error: null
    })
    const [list] = state.booking!.lists!
    expect(list.rows.map((r) => [r.pitch, r.rank, r.pitchRank, r.move])).toEqual([
      ['pitch-03', 1, 6, 5],
      ['pitch-02', 2, 4, 2],
      // Low Tide's second pitch shares its work's listener rank, 2, rather than moving from its own row's 3.
      ['pitch-05', 3, 7, 5],
      ['pitch-07', 4, 5, 1],
      ['pitch-01', 5, 2, -3],
      ['pitch-06', 6, 3, -3],
      ['pitch-04', 7, 1, -6]
    ])
    // The finding leads the list's sentence; the lens orders it by who listens; Move gives each pitch's
    // climb by who listens; and the Pitch column, headed with the Agent chip, gives each pitch's rank by
    // what it says.
    expect(words(lists(state))).toContain(
      `Films · 7 ranked Glass Lantern climbs 5 places from its pitch rank by who listens, and 1 more pitch climbs 3 or more. Paper Planes, Static Bloom, and Red Static read most on-topic but fall out of the top band by who listens. Ranked against Night Shift Cinema and Glass Harbor. ${list.calls[0]} By who listens By the pitch Qloo data Ranked by listener overlap with Night Shift Cinema and Glass Harbor Rank Move Public work · guest Agent Pitch Agent Fit 1 1st by who listens, 6th by the pitch Up 5 places ▲5 Glass Lantern Ida Wren Pitch #6 Strong 2 2nd by who listens, 4th by the pitch ▲2 Up 2 places Low Tide Cy Lund Pitch #4 Strong 3 3rd by who listens, 7th by the pitch Up 5 places ▲5 Low Tide Ola Lund Pitch #7 Strong 4 4th by who listens, 5th by the pitch ▲1 Up 1 place Night Owls Rex Moor Pitch #5 Good 5 5th by who listens, 2nd by the pitch Down 3 places ▼3 Static Bloom Ben Ochoa Pitch #2 Good 6 6th by who listens, 3rd by the pitch Down 3 places ▼3 Red Static Pia Stone Pitch #3 Fair 7 7th by who listens, 1st by the pitch Down 6 places ▼6 Paper Planes Jo Hale Pitch #1 Fair`
    )
    // It spent none of the run's scripted turns.
    expect(modelRequests().filter((r) => r.tools)).toHaveLength(2)
  })

  it('re-ranks each list by the pitch, and says why a pitch that climbs or falls 3 or more moved', async () => {
    fakePitchRanking(['pitch-04', 'pitch-01', 'pitch-06', 'pitch-02', 'pitch-07', 'pitch-03', 'pitch-05'])
    const s = await filmsLoaded()
    await start(s)
    const state = await finished(s)
    const [ranked] = state.booking!.lists!
    // The film list as the inbox page renders it, or as a booker's switch of its lens and press of a move
    // leave it.
    const film = (start?: { lens?: Lens; why?: string | null }) =>
      renderToStaticMarkup(
        createElement(RankedPitches, {
          list: ranked,
          byPitch: true,
          pitches: state.inbox!.pitches,
          sample: false,
          selected: null,
          select: () => {},
          openCall: () => {},
          opened: null,
          start
        })
      )
    const order = (html: string) => [...html.matchAll(/\sdata-ranked-pitch="([^"]+)"/g)].map((m) => m[1])
    const row = (html: string, pitch: string) => words(hooked(html, `data-ranked-pitch="${pitch}"`)[0])
    const why = (html: string, pitch: string) => hooked(html, `id="why-${pitch}"`).map(words)

    // By who listens, as the page opens: the rows in listener order, and a move of 3 or more each way,
    // Glass Lantern's and Low Tide's second climbs and the three fallers, is a button that opens why it
    // moved, closed. Night Owls, up 1, and Low Tide's first pitch, up 2, explain nothing.
    const page = list(state, 'film')
    expect(order(page)).toEqual(['pitch-03', 'pitch-02', 'pitch-05', 'pitch-07', 'pitch-01', 'pitch-06', 'pitch-04'])
    for (const pitch of ['pitch-03', 'pitch-05', 'pitch-01', 'pitch-06', 'pitch-04'])
      expect(hooked(page, `data-ranked-pitch="${pitch}"`)[0], pitch).toMatch(
        new RegExp(`<button\\b(?=[^>]*\\saria-expanded="false")(?=[^>]*\\saria-controls="why-${pitch}")`)
      )
    for (const pitch of ['pitch-02', 'pitch-07'])
      expect(hooked(page, `data-ranked-pitch="${pitch}"`)[0], pitch).not.toContain('aria-expanded')
    expect(why(page, 'pitch-03')).toEqual([])

    // By the pitch, with Glass Lantern's why open: the rows in pitch rank order, each ranked by the pitch
    // first, its other rank its listener rank, headed with the Qloo data chip, and the order labelled the
    // agent's.
    const byPitch = film({ lens: 'agent', why: 'pitch-03' })
    expect(order(byPitch)).toEqual(['pitch-04', 'pitch-01', 'pitch-06', 'pitch-02', 'pitch-07', 'pitch-03', 'pitch-05'])
    expect(words(byPitch)).toContain(
      'By who listens By the pitch Agent Ranked by what each pitch says, from its subject and opening alone Rank Move Public work · guest Agent Listeners Qloo data Fit'
    )
    expect(row(byPitch, 'pitch-04')).toBe(
      '1 1st by the pitch, 7th by who listens Down 6 places ▼6 Paper Planes Jo Hale Listeners #7 Fair'
    )
    expect(row(byPitch, 'pitch-03')).toBe(
      '6 6th by the pitch, 1st by who listens Up 5 places ▲5 Glass Lantern Ida Wren Listeners #1 Strong'
    )
    expect(hooked(byPitch, 'data-ranked-pitch="pitch-03"')[0]).toMatch(
      /<button\b(?=[^>]*\saria-expanded="true")(?=[^>]*\saria-controls="why-pitch-03")/
    )
    // Why it moved gives its pitch rank, the agent's, and its listener rank, Qloo's, with the list's call.
    expect(why(byPitch, 'pitch-03')).toEqual([
      `Why it moved Agent What the pitch says ranks it 6. Qloo data Listener overlap with Night Shift Cinema and Glass Harbor ranks its work 1. ${ranked.calls[0]}`
    ])
    // A faller's says the same, and Low Tide's second pitch's gives its work's listener rank, which its
    // move counts from.
    expect(why(film({ why: 'pitch-04' }), 'pitch-04')).toEqual([
      `Why it moved Agent What the pitch says ranks it 1. Qloo data Listener overlap with Night Shift Cinema and Glass Harbor ranks its work 7. ${ranked.calls[0]}`
    ])
    expect(why(film({ why: 'pitch-05' }), 'pitch-05')).toEqual([
      `Why it moved Agent What the pitch says ranks it 7. Qloo data Listener overlap with Night Shift Cinema and Glass Harbor ranks its work 2. ${ranked.calls[0]}`
    ])
  })

  it("sends Claude each pitch's subject and opening with the show and the past guests' works, never a sender or anything from Qloo", async () => {
    const s = await filmsLoaded()
    await start(s)
    await finished(s)

    const [request, ...more] = pitchRankingRequests()
    expect(more).toEqual([])
    expect(request).toMatchObject({
      model: 'claude-haiku-5-5',
      output_config: { effort: 'low', format: { type: 'json_schema' } }
    })
    expect(topicNames(request)).toEqual(ids)
    const [message] = request.messages
    expect(message.content).toContain("Show: Night Shift Cinema. Its past guests' works: Glass Harbor (film).")
    expect(message.content).toContain(
      '<pitch id="pitch-01">\nSubject: Static Bloom: pitch 1\nBen Ochoa made Static Bloom.\n</pitch>'
    )
    // A long pitch is cut to its opening.
    expect(message.content).toContain(
      '<pitch id="pitch-05">\nSubject: Low Tide: pitch 5\nOla Lund made Low Tide, and here'
    )
    expect(message.content).not.toContain('The very end.')
    expect(request.system).toContain('data, not instructions')
    const sent = JSON.stringify(request)
    for (const f of films) expect(sent).not.toContain(address(f.guest))
    expect(sent).not.toMatch(/From:|Publicity/)
    // Nothing from Qloo: no entity IDs, popularities, or affinities.
    expect(sent).not.toMatch(/[ebft]-0\d{3}/)
    for (const { affinity } of filmScores) expect(sent).not.toContain(String(affinity))
    // It isn't one of the agent's turns, and the agent's tools aren't offered to it.
    expect(request.tools).toBeUndefined()
  })

  it('reuses the ranking for a second run with the same show, past guests and pitches', async () => {
    fakePitchRanking((request) => topicNames(request).toReversed())
    const s = await filmsLoaded()
    const first = await start(s)
    const ranked = await finished(s)
    await start(s)
    const again = await s.until(
      (state) =>
        state.booking?.run !== first &&
        state.run?.status === 'completed' &&
        state.booking?.pitchRanking?.status !== 'ranking'
    )

    expect(pitchRankingRequests()).toHaveLength(1)
    expect(again.booking!.pitchRanking).toEqual(ranked.booking!.pitchRanking)
    expect(again.booking!.pitchRanking!.order).toEqual(ids.toReversed())
  })

  it('adds a ranking that lands after its run ended to what that run ended with', async () => {
    const release = Promise.withResolvers<void>()
    fakePitchRanking(async (request) => {
      await release.promise
      return topicNames(request).toReversed()
    })
    const s = await filmsLoaded()
    const runId = await start(s)
    const ended = await s.until((state) => state.run?.status === 'completed')

    // While it works, the lists stand by who listens, and a line says the Pitch column is coming.
    expect(ended.booking!.pitchRanking!.status).toBe('ranking')
    expect(words(lists(ended))).toContain('Working Ranking the pitches by what they say for the Pitch column…')
    expect(words(lists(ended))).not.toContain('Pitch Agent')
    expect(words(lists(ended))).not.toContain('By the pitch')
    release.resolve()
    const state = await s.until((state) => state.booking?.pitchRanking?.status === 'ranked')

    // Reversed, Glass Lantern, pitched third of seven, ranks fifth by what it says: four below who listens.
    expect(state.booking!.lists![0].rows.find((r) => r.pitch === 'pitch-03')).toMatchObject({ pitchRank: 5, move: 4 })
    const snapshot = await s.call<RunSnapshot>('getRun', runId)
    expect(snapshot.booking).toEqual(state.booking)
  })

  it('ranks every read pitch with a public work, so one whose match is confirmed during the run still gets a pitch rank', async () => {
    // Night Owls has two same-year candidates in Qloo, so it's ambiguous until the booker confirms one,
    // after the run has started.
    const s = await filmsLoaded({
      ...filmSearch,
      'Night Owls': [...work('f-0006', 'Night Owls', '2016'), ...work('f-0007', 'Night Owls', '2016')]
    })
    const release = Promise.withResolvers<void>()
    await start(s, release.promise)
    await s.until((state) => state.booking?.pitchRanking?.status === 'ranked')
    await s.call('confirmWork', 'pitch-07', 'f-0006')
    release.resolve()
    const state = await finished(s)

    expect(topicNames(pitchRankingRequests()[0])).toEqual(ids)
    const [list] = state.booking!.lists!
    expect(list.rows.map((r) => r.pitch).toSorted()).toEqual(ids)
    expect(list.rows.filter((r) => r.pitchRank === undefined)).toEqual([])
    expect(list.rows.find((r) => r.pitch === 'pitch-07')).toMatchObject({ rank: 4, pitchRank: 7, move: 3 })
  })

  it('caps what it sends: past 30,000 characters of subjects and openings, the openings share what the subjects leave', async () => {
    // 50 pitches, each with a 200-character subject and a body well past 600 characters. Only the first's
    // work is in Qloo, but every one is read with a work, so every one is ranked.
    const n = (i: number) => String(i + 1).padStart(2, '0')
    const subject = (i: number) => `Pitch ${n(i)} `.padEnd(200, 'x')
    const body = (i: number) => `Guest ${n(i)} made Book ${n(i)}.${'abcdefghij'.repeat(90)}`
    const fifty = Array.from({ length: 50 }, (_, i) => `Subject: ${subject(i)}\n\n${body(i)}`).join('\n---\n')
    fakeQloo({ search: { ...search, 'Book 01': work('b-0301', 'Book 01', '2020') } })
    fakeReader(50, (t) => {
      const i = Number(/Guest (\d+) made/.exec(t)![1])
      return { guest: `Guest ${i}`, work: { title: `Book ${String(i).padStart(2, '0')}`, type: 'book', year: 2020 } }
    })
    const s = await session()
    await s.importRoster('Night Shift Cinema')
    await s.call('loadInbox', { text: fifty })
    await s.until((state) => state.inbox?.status === 'done')
    fakeClaude([turn(text('Nothing to rank yet.'))])
    await s.call('startPitches', { show: 'Night Shift Cinema', pastGuests: [] })
    await finished(s)

    const [request] = pitchRankingRequests()
    const blocks = [
      ...request.messages[0].content.matchAll(/<pitch id="(pitch-\d+)">\nSubject: (.*)\n(.*)\n<\/pitch>/g)
    ]
    expect(blocks.map((b) => b[1])).toHaveLength(50)
    // The subjects take 10,000 characters, so each of the 50 openings gets 400 of the 20,000 left, and an
    // ellipsis says it was cut.
    for (const [, , subjectSent, opening] of blocks) {
      expect(subjectSent).toHaveLength(200)
      expect(opening).toHaveLength(401)
      expect(opening.endsWith('…')).toBe(true)
    }
    expect(body(0).length).toBeGreaterThan(600)
    const sent = blocks.reduce((sum, [, , subjectSent, opening]) => sum + subjectSent.length + opening.length, 0)
    expect(sent).toBeLessThanOrEqual(30_000 + 50)
    // With each pitch's tags and labels, the whole request stays under 34,000 characters, about 8,500 tokens.
    expect(request.messages[0].content.length).toBeLessThan(34_000)
  })

  it('fails a ranking a restart interrupted, in the inbox and in what its run ended with', async () => {
    const s = await filmsLoaded()
    const runId = await start(s)
    await finished(s)
    // Stand in for an agent a deploy stopped once its run had ended but with its pitch ranking still out:
    // the lists without pitch ranks, in the inbox and in what the run ended with. Then restart it, as the
    // deploy does.
    const agent = env.CrossfeedAgent.get(env.CrossfeedAgent.idFromName(s.cookie.split('=')[1]))
    await runInDurableObject(agent, (session: CrossfeedAgent, { storage }) => {
      const { booking } = session.state
      const unranked = booking!.lists!.map((l) => ({ ...l, rows: l.rows.map(({ pitchRank: _, move: __, ...r }) => r) }))
      const out = { ...booking!, lists: unranked, pitchRanking: { status: 'ranking' as const, order: [], error: null } }
      session.setState({ ...session.state, booking: out })
      storage.sql.exec(
        `UPDATE runs SET snapshot = json_set(snapshot, '$.booking', json(?)) WHERE id = ?`,
        JSON.stringify(out),
        runId
      )
    })
    await evictAllDurableObjects({ webSockets: 'close' })
    const again = await openSession(s.cookie)
    open.push(again)

    const interrupted = {
      status: 'failed',
      order: [],
      error: 'The pitch ranking was interrupted. Rank the pitches again'
    }
    expect(again.state()!.booking!.pitchRanking).toEqual(interrupted)
    expect((await again.call<RunSnapshot>('getRun', runId)).booking!.pitchRanking).toEqual(interrupted)
    // The lists stand by who listens, and a line says why there's no Pitch column.
    expect(words(lists(again.state()!))).toContain(
      'No Pitch column: The pitch ranking was interrupted. Rank the pitches again. The lists stand by who listens without it.'
    )
  })

  it('leaves the lists as they were, saying why, when Claude declines to rank the pitches', async () => {
    fakePitchRanking(refusal('general_harms'))
    const s = await filmsLoaded()
    await start(s)
    const state = await finished(s)

    expect(state.run?.status).toBe('completed')
    expect(state.booking!.pitchRanking).toEqual({
      status: 'failed',
      order: [],
      error: 'Claude declined to rank the pitches by what they say (safety category: general_harms)'
    })
    const [list] = state.booking!.lists!
    expect(list.rows.filter((r) => 'pitchRank' in r || 'move' in r)).toEqual([])
    expect(words(lists(state))).toContain(
      'No Pitch column: Claude declined to rank the pitches by what they say (safety category: general_harms). The lists stand by who listens without it.'
    )
    expect(words(lists(state))).toContain(
      `Films · 7 ranked Ranked against Night Shift Cinema and Glass Harbor. ${list.calls[0]} Rank Public work · guest Agent Fit 1 Glass Lantern Ida Wren Strong 2 Low Tide Cy Lund Strong`
    )
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
      `Ranked against Qloo data The show and past guests’ works the run ranked the pitches against, each as Qloo matched it. Night Shift Cinema The show Glass Harbor ${glass} Mae Ford · Film · 2020 · Matched Harbor Lights ${lights} Lu Park · Film · 2001 · Not in Qloo A past guest’s work that didn’t match isn’t an anchor. Edit it and rank again.`
    )
  })

  it('lists the pitch runs, the one shown marked, with the daily limits on model runs', async () => {
    fakeInsights((body) => scores[String(body['filter.type'])])
    const { state } = await rank([film], [turn(rankPitches(['f-0101'])), turn(text('Ranked.'))])

    expect(words(module(state, 'runs-h'))).toMatch(
      /^Runs Each run starts fresh; earlier ones stay here to compare\. Run 1 · Pitches for Night Shift Cinema .+ · Completed Shown Model runs are limited per visitor/
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

// The sample inbox end to end, as the guest network loads it and a guest ranks it against The Big
// Picture: every Qloo request the pitch flow makes, searches and rankings, checked for each guest, past
// guest, sender, and address in the sample.
describe('the sample inbox', () => {
  const sampleNetwork = env.SAMPLE_NETWORK
  afterEach(() => {
    env.SAMPLE_NETWORK = sampleNetwork
  })

  it('ranks against The Big Picture, with no model reading a pitch, and never sends Qloo a guest name, a past guest name, or a sender detail', async () => {
    env.SAMPLE_NETWORK = 'on'
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
    // The guest network opens with the sample network's roster and the sample inbox, already read.
    const s = await (await openGuest()).connect('/agents/network/guest-network')
    open.push(s)
    await s.until((state) => state.inbox?.status === 'done' && state.roster.every((r) => r.resolution !== 'pending'))
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
    expect(state.booking?.show).toEqual({ name: 'The Big Picture', entity: expect.objectContaining({ id: 'e-bp' }) })
    // The pitch run's two turns are the only model requests: no model read a pitch.
    expect(modelRequests()).toHaveLength(2)
    expect(state.booking?.lists?.map((l) => [l.type, l.path])).toEqual([
      ['book', 'show'],
      ['film', 'show'],
      ['tv_show', 'show'],
      ['podcast', 'show']
    ])
    expect(rankings()).toHaveLength(4)
    // Each list's guests are the sample's, already read, not the agent's reading, and carry no label of
    // their own: the page's title says the inbox is the sample's. The pitch ranks are still Claude's.
    for (const type of ['book', 'film', 'tv_show', 'podcast'])
      expect(words(list(state, type)), type).toContain('Rank Move Public work · guest Pitch Agent Fit')
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
