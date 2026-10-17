import { env, exports } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { State } from '../src/agent'
import type { WorkMatch } from '../src/inbox'
import sample from '../src/sample-inbox.json'
import {
  fakeClaude,
  fakeQloo,
  modelRequests,
  refusal,
  requests,
  text,
  turn,
  type ModelRequest,
  type QlooEntity,
  type ScriptedTurn
} from './fake'
import { openSession, type Session } from './session'

type Extracted = { guest: string; work: { title: string; type: string; year: number | null } | null }

// The scripted model's answer to one extraction request: the pitch's guest and public work, as JSON.
const extraction = (answer: Extracted) => turn(text(JSON.stringify(answer)))

// The pitch text an extraction request carries, so a script entry can answer for the right pitch
// whatever order concurrent requests arrive in.
const pitchText = (request: ModelRequest): string =>
  request.messages
    .flatMap((m: { content: string | { type: string; text?: string }[] }) =>
      typeof m.content === 'string' ? [m.content] : m.content.map((b) => b.text ?? '')
    )
    .join('\n')

// Scripts one extraction per pitch, chosen from the pitch's text.
const fakeReader = (count: number, answer: (pitch: string) => ScriptedTurn) =>
  fakeClaude(Array.from({ length: count }, () => (request: ModelRequest) => answer(pitchText(request))))

const origin = 'https://crossfeed.test'
const qlooRequests = () => requests.filter((r) => r.url.origin === new URL(env.QLOO_BASE_URL).origin)

const open: Session[] = []
const session = async (cookie?: string) => {
  const s = await openSession(cookie)
  open.push(s)
  return s
}
beforeEach(() => {
  env.GUEST_PITCHES = 'on'
})
afterEach(() => {
  open.splice(0).forEach((s) => s.close())
  env.GUEST_PITCHES = 'off'
})

const loaded = (s: Session) => s.until((state: State) => state.inbox?.status === 'done')

// A synthetic pitch for a synthetic book.
const pasted = `From: Pat Lindqvist <pat.lindqvist@example.com>
Subject: Ada Quill on Night Ferry

Hi team, Ada Quill's novel Night Ferry is about a projectionist on a car ferry. She'd love to talk movies.`

describe('loading a pasted pitch', () => {
  it("extracts the guest and work, and resolves the work's title in Qloo", async () => {
    fakeQloo({
      search: {
        'Night Ferry': [
          { entity_id: 'b-0001', name: 'Night Ferry', popularity: 0.81, disambiguation: '2019, Ada Quill' },
          { entity_id: 'b-0002', name: 'The Night Ferryman', popularity: 0.4, disambiguation: '2003, Jo Bell' }
        ]
      }
    })
    fakeReader(1, () => extraction({ guest: 'Ada Quill', work: { title: 'Night Ferry', type: 'book', year: 2019 } }))
    const s = await session()

    await s.call('loadInbox', { text: pasted })
    const state = await loaded(s)

    expect(state.inbox).toEqual({
      id: expect.any(String),
      sample: false,
      notice: null,
      show: null,
      status: 'done',
      pitches: [
        {
          id: 'pitch-01',
          from: null,
          subject: null,
          body: pasted,
          status: 'read',
          guest: 'Ada Quill',
          work: { title: 'Night Ferry', type: 'book', year: 2019 },
          match: {
            resolution: 'resolved',
            entity: { id: 'b-0001', name: 'Night Ferry', popularity: 0.81, disambiguation: '2019, Ada Quill' },
            candidates: [],
            evidence: 'C-01',
            error: null
          },
          error: null
        }
      ]
    })
    expect(qlooRequests().map((r) => Object.fromEntries(r.url.searchParams))).toEqual([
      { query: 'Night Ferry', types: 'urn:entity:book', take: '5' }
    ])
  })

  it('reads each pitch with one structured-output call at low effort', async () => {
    fakeQloo({ search: {} })
    fakeReader(1, () => extraction({ guest: 'Ada Quill', work: { title: 'Night Ferry', type: 'book', year: 2019 } }))
    const s = await session()

    await s.call('loadInbox', { text: pasted })
    await loaded(s)

    const [request, ...more] = modelRequests()
    expect(more).toEqual([])
    expect(request).toMatchObject({
      model: 'claude-haiku-5-5',
      max_tokens: 16_000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: expect.any(Object) } }
    })
    for (const key of ['temperature', 'top_p', 'top_k', 'tools', 'thinking']) expect(request).not.toHaveProperty(key)
    expect(pitchText(request)).toContain(pasted)
  })
})

// Synthetic search results for every work in the sample inbox: made-up IDs and scores, one result
// with the work's title and year, so it resolves to `w-<pitch id>`. A few works get the same-title
// results the live catalog showed (#31), with years and popularity that tell them apart or don't.
const sampleWorks = sample.pitches.flatMap((p) => (p.expected.work ? [{ pitch: p.id, ...p.expected.work }] : []))
const sampleSearch: Record<string, QlooEntity[]> = {
  ...Object.fromEntries(
    sampleWorks.map((w) => [
      w.title,
      [{ entity_id: `w-${w.pitch}`, name: w.title, popularity: 0.5, disambiguation: String(w.year) }]
    ])
  ),
  // An older film of the same name ranks first; the year picks the pitched one.
  Frankenstein: [
    { entity_id: 'w-old-frankenstein', name: 'Frankenstein', popularity: 0.97, disambiguation: '1931' },
    { entity_id: 'w-pitch-09', name: 'Frankenstein', popularity: 0.89, disambiguation: '2025' }
  ],
  // Two same-year entries with no popularity: the booker has to confirm one.
  Digger: [
    { entity_id: 'w-digger-2020', name: 'Digger', popularity: 0.82, disambiguation: '2020' },
    { entity_id: 'w-digger-a', name: 'Digger', popularity: null, disambiguation: '2026' },
    { entity_id: 'w-digger-b', name: 'Digger', popularity: null, disambiguation: '2026' }
  ],
  // Same title, other years only: the pitched book isn't in Qloo.
  'Hollywood, Ending': [
    { entity_id: 'w-hollywood-2008', name: 'Hollywood Ending', popularity: 0.3, disambiguation: '2008' },
    { entity_id: 'w-hollywood-2022', name: 'Hollywood Ending: A Subtitle', popularity: 0.2, disambiguation: '2022' }
  ],
  // Qloo's names can carry a series suffix or end in "Podcast".
  'Onyx Storm': [
    {
      entity_id: 'w-pitch-07',
      name: 'Onyx Storm (The Empyrean, #3)',
      popularity: 0.99,
      disambiguation: '2025, Rebecca Yarros'
    }
  ],
  Scriptnotes: [{ entity_id: 'w-pitch-26', name: 'Scriptnotes Podcast', popularity: 0.95, disambiguation: null }]
}

const readSample = () =>
  fakeReader(sample.pitches.length, (text) => {
    const p = sample.pitches.find((p) => text.includes(p.body))!
    return extraction({ guest: p.expected.guest, work: p.expected.work })
  })

describe('loading the sample inbox', () => {
  it('lists every pitch with its extracted guest, work, type, and match state, labelled as sample data', async () => {
    fakeQloo({ search: sampleSearch })
    readSample()
    const s = await session()

    await s.call('loadInbox', { sample: true })
    const { inbox } = await loaded(s)

    expect(inbox).toMatchObject({ sample: true, notice: sample.notice, status: 'done' })
    expect(inbox!.pitches.map((p) => p.id)).toEqual(sample.pitches.map((p) => p.id))
    const special: Record<string, Partial<WorkMatch>> = {
      'pitch-01': { resolution: 'missed', entity: null, candidates: [] },
      'pitch-30': {
        resolution: 'ambiguous',
        entity: null,
        candidates: [
          { id: 'w-digger-a', name: 'Digger', popularity: null, disambiguation: '2026' },
          { id: 'w-digger-b', name: 'Digger', popularity: null, disambiguation: '2026' }
        ]
      }
    }
    for (const [i, p] of sample.pitches.entries()) {
      const { guest, work } = p.expected
      expect(inbox!.pitches[i]).toMatchObject({
        from: `${p.senderName} <${p.senderEmail}>`,
        subject: p.subject,
        body: p.body,
        status: work ? 'read' : 'no_work',
        guest,
        work,
        error: null
      })
      if (!work) expect(inbox!.pitches[i].match).toBeNull()
      else
        expect(inbox!.pitches[i].match, p.id).toMatchObject(
          special[p.id] ?? { resolution: 'resolved', entity: { id: `w-${p.id}` }, error: null }
        )
    }
  })

  it('sets aside pitches with no public work, and searches only the works', async () => {
    fakeQloo({ search: sampleSearch })
    readSample()
    const s = await session()

    await s.call('loadInbox', { sample: true })
    const { inbox } = await loaded(s)

    const setAside = inbox!.pitches.filter((p) => p.status === 'no_work').map((p) => p.id)
    expect(setAside).toEqual(sample.pitches.filter((p) => !p.expected.work).map((p) => p.id))
    expect(setAside).toHaveLength(4)
    const searched = qlooRequests().map((r) => r.url.searchParams.get('query'))
    expect(searched.toSorted()).toEqual(sampleWorks.map((w) => w.title).toSorted())
  })

  it('never sends Qloo a guest name, an email address, or any sender detail', async () => {
    fakeQloo({ search: sampleSearch })
    readSample()
    const s = await session()

    await s.call('loadInbox', { sample: true })
    await loaded(s)

    // Each request as Qloo reads it: the path, every decoded parameter, and the body.
    const sent = qlooRequests().map((r) =>
      [r.url.pathname, ...[...r.url.searchParams].map(([k, v]) => `${k}=${v}`), r.body].join('\n').toLowerCase()
    )
    expect(sent).toHaveLength(sampleWorks.length)
    const personal = sample.pitches.flatMap((p) => [p.expected.guest, p.senderName, p.senderEmail, '@'])
    for (const detail of personal)
      expect(
        sent.filter((r) => r.includes(detail.toLowerCase())),
        detail
      ).toEqual([])
  })
})

describe("a pitched work's title", () => {
  it("never reaches Qloo when Claude's reading puts the guest's or the sender's name in it", async () => {
    fakeQloo({ search: sampleSearch })
    const [byGuest, bySender, ...rest] = sample.pitches.filter((p) => p.expected.work)
    // The model reads two titles wrong: one with the guest's name, as a possessive, and one with the sender's.
    const titled: Record<string, string> = {
      [byGuest.id]: `${byGuest.expected.guest}'s ${byGuest.expected.work!.title}`,
      [bySender.id]: `${bySender.expected.work!.title}, pitched by ${bySender.senderName}`
    }
    fakeReader(sample.pitches.length, (text) => {
      const p = sample.pitches.find((p) => text.includes(p.body))!
      const work = p.expected.work && { ...p.expected.work, title: titled[p.id] ?? p.expected.work.title }
      return extraction({ guest: p.expected.guest, work })
    })
    const s = await session()

    await s.call('loadInbox', { sample: true })
    const { inbox } = await loaded(s)

    expect(inbox!.pitches.filter((p) => p.id in titled)).toMatchObject(
      [byGuest, bySender].map((p) => ({
        id: p.id,
        status: 'unreadable',
        match: null,
        error: "The work's title holds the guest's or sender's name, so it isn't sent to Qloo."
      }))
    )
    const searched = qlooRequests().map((r) => r.url.searchParams.get('query'))
    expect(searched.toSorted()).toEqual(rest.map((p) => p.expected.work!.title).toSorted())
  })
})

// Three synthetic pitches pasted together: a book, a private person, and one Claude refuses.
const book = 'Ada Quill would love to talk about her novel Night Ferry.'
const person = 'I ran a projection booth for thirty years and have stories to tell. No book, just stories.'
const refused = 'A pitch the safety classifiers decline.'
const threePitches = `${book}\n\n---\n${person}\n  -----  \n${refused}\n---\n`

describe('loading pasted pitches', () => {
  it('reads each pitch between dashed lines, sets aside one with no public work, and marks a refused one unreadable', async () => {
    fakeQloo({ search: { 'Night Ferry': [{ entity_id: 'b-0001', name: 'Night Ferry', popularity: 0.81 }] } })
    fakeReader(3, (text) =>
      text.includes(book)
        ? extraction({ guest: 'Ada Quill', work: { title: 'Night Ferry', type: 'book', year: null } })
        : text.includes(person)
          ? extraction({ guest: 'Dot Pruitt', work: null })
          : refusal('general_harms')
    )
    const s = await session()

    await s.call('loadInbox', { text: threePitches })
    const { inbox } = await loaded(s)

    expect(inbox!.pitches).toMatchObject([
      { id: 'pitch-01', body: book, status: 'read', guest: 'Ada Quill', match: { resolution: 'resolved' } },
      { id: 'pitch-02', body: person, status: 'no_work', guest: 'Dot Pruitt', work: null, match: null, error: null },
      {
        id: 'pitch-03',
        body: refused,
        status: 'unreadable',
        guest: null,
        work: null,
        match: null,
        error: 'Claude declined to read this pitch (safety category: general_harms).'
      }
    ])
    expect(qlooRequests().map((r) => r.url.searchParams.get('query'))).toEqual(['Night Ferry'])
  })

  it('refuses a paste with no pitch in it, and leaves the inbox as it was', async () => {
    const s = await session()
    await expect(s.call('loadInbox', { text: ' \n---\n ' })).rejects.toThrow('Paste at least one pitch.')
    expect(s.state()?.inbox).toBeNull()
  })
})

describe('confirming an ambiguous work', () => {
  it('keeps the confirmed match across a reload', async () => {
    fakeQloo({
      search: {
        Frankenstein: [
          { entity_id: 'f-1931', name: 'Frankenstein', popularity: 0.97, disambiguation: '1931' },
          { entity_id: 'f-2025', name: 'Frankenstein', popularity: 0.89, disambiguation: '2025' }
        ]
      }
    })
    // No year to tell the two films apart.
    fakeReader(1, () => extraction({ guest: 'Gil Toro', work: { title: 'Frankenstein', type: 'film', year: null } }))
    const s = await session()
    await s.call('loadInbox', { text: 'Gil Toro on his Frankenstein.' })
    const { inbox } = await loaded(s)
    expect(inbox!.pitches[0].match).toMatchObject({
      resolution: 'ambiguous',
      candidates: [{ id: 'f-1931' }, { id: 'f-2025' }]
    })

    await expect(s.call('confirmWork', 'pitch-01', 'f-9999')).rejects.toThrow("That isn't one of the candidates")
    await s.call('confirmWork', 'pitch-01', 'f-2025')
    s.close()
    const reloaded = await session(s.cookie)

    expect(reloaded.state()?.inbox?.pitches[0].match).toEqual({
      resolution: 'resolved',
      entity: { id: 'f-2025', name: 'Frankenstein', popularity: 0.89, disambiguation: '2025' },
      candidates: [
        { id: 'f-1931', name: 'Frankenstein', popularity: 0.97, disambiguation: '1931' },
        { id: 'f-2025', name: 'Frankenstein', popularity: 0.89, disambiguation: '2025' }
      ],
      evidence: 'C-01',
      error: null
    })
  })
})

describe('telling same-title works apart', () => {
  it('leaves a work with no year ambiguous, rather than matching the one same-title result that has popularity', async () => {
    fakeQloo({
      search: {
        Digger: [
          { entity_id: 'd-2020', name: 'Digger', popularity: 0.82, disambiguation: '2020' },
          { entity_id: 'd-2026', name: 'Digger', popularity: null, disambiguation: '2026' }
        ]
      }
    })
    fakeReader(1, () => extraction({ guest: 'Ali Inar', work: { title: 'Digger', type: 'film', year: null } }))
    const s = await session()

    await s.call('loadInbox', { text: 'Ali Inar on his new film Digger.' })
    const { inbox } = await loaded(s)

    expect(inbox!.pitches[0].match).toMatchObject({
      resolution: 'ambiguous',
      candidates: [{ id: 'd-2020' }, { id: 'd-2026' }]
    })
  })
})

describe('telling same-title books apart', () => {
  it("matches the guest's own book whatever year Claude gave, and misses when every same-title book is someone else's", async () => {
    fakeQloo({
      search: {
        // The guest's book is listed twice, once with no popularity, as Qloo lists some books.
        'Night Ferry': [
          { entity_id: 'n-bell', name: 'Night Ferry', popularity: 0.9, disambiguation: '2015, Jo Bell' },
          { entity_id: 'n-quill', name: 'Night Ferry: A Novel', popularity: 0.6, disambiguation: '2021, Ada Quill' },
          { entity_id: 'n-quill-2', name: 'Night Ferry: A Novel', popularity: null, disambiguation: '2021, Ada Quill' }
        ],
        'Look Away': [{ entity_id: 'l-bell', name: 'Look Away', popularity: 0.7, disambiguation: '2008, Jo Bell' }]
      }
    })
    fakeReader(2, (text) =>
      text.includes('Night Ferry')
        ? extraction({ guest: 'Ada Quill', work: { title: 'Night Ferry', type: 'book', year: 2015 } })
        : extraction({ guest: 'Sam Ode and Ada Quill', work: { title: 'Look Away', type: 'book', year: 2008 } })
    )
    const s = await session()

    await s.call('loadInbox', { text: 'Ada Quill on Night Ferry.\n---\nSam Ode and Ada Quill on Look Away.' })
    const { inbox } = await loaded(s)

    expect(inbox!.pitches.map((p) => p.match)).toMatchObject([
      { resolution: 'resolved', entity: { id: 'n-quill' } },
      { resolution: 'missed', entity: null, candidates: [] }
    ])
  })
})

describe('matching a podcast named with its hosts', () => {
  it('matches "<title> with <hosts>" when a host is one of the guests, and nothing else named that way', async () => {
    fakeQloo({
      search: {
        // Synthetic shows: the pitched podcast with its hosts, another podcast with someone else's
        // name, and a film that only looks like the podcast pattern.
        'High Tide': [
          { entity_id: 'p-sea', name: 'Seaside Radio', popularity: 0.97, disambiguation: '' },
          { entity_id: 'p-tide', name: 'High Tide with Cal & Rory Brennan', popularity: 0.92, disambiguation: '' }
        ],
        Dinner: [{ entity_id: 'p-dinner', name: 'Dinner with Friends', popularity: 0.8, disambiguation: '' }],
        'Talking with Ghosts': [
          { entity_id: 'p-ghosts', name: 'Talking with Ghosts with Mo Reyes', popularity: 0.6, disambiguation: '' }
        ],
        'Night Ferry': [
          { entity_id: 'f-ferry', name: 'Night Ferry with Ada Quill', popularity: 0.5, disambiguation: '2019' }
        ]
      }
    })
    const works: Record<string, Extracted> = {
      'High Tide': { guest: 'Cal and Rory Brennan', work: { title: 'High Tide', type: 'podcast', year: 2020 } },
      Dinner: { guest: 'Ada Quill', work: { title: 'Dinner', type: 'podcast', year: null } },
      'Talking with Ghosts': { guest: 'Mo Reyes', work: { title: 'Talking with Ghosts', type: 'podcast', year: null } },
      'Night Ferry': { guest: 'Ada Quill', work: { title: 'Night Ferry', type: 'film', year: 2019 } }
    }
    fakeReader(4, (text) => extraction(Object.entries(works).find(([title]) => text.includes(`on ${title}.`))![1]))
    const s = await session()

    await s.call('loadInbox', {
      text: Object.keys(works)
        .map((title) => `A pitch on ${title}.`)
        .join('\n---\n')
    })
    const { inbox } = await loaded(s)

    expect(inbox!.pitches.map((p) => [p.work!.title, p.match])).toMatchObject([
      ['High Tide', { resolution: 'resolved', entity: { id: 'p-tide' } }],
      ['Dinner', { resolution: 'missed', entity: null }],
      ['Talking with Ghosts', { resolution: 'resolved', entity: { id: 'p-ghosts' } }],
      ['Night Ferry', { resolution: 'missed', entity: null }]
    ])
  })
})

describe('with GUEST_PITCHES off', () => {
  it('has no inbox page or link, and refuses inbox actions', async () => {
    env.GUEST_PITCHES = 'off'
    const page = await exports.default.fetch(`${origin}/`)
    expect(await page.text()).not.toContain('/inbox')
    expect((await exports.default.fetch(`${origin}/inbox`)).status).toBe(404)
    const s = await session()
    await expect(s.call('loadInbox', { sample: true })).rejects.toThrow("Guest pitches aren't switched on.")
    await expect(s.call('confirmWork', 'pitch-01', 'x')).rejects.toThrow("Guest pitches aren't switched on.")
    expect(requests).toEqual([])
  })

  it('with it on, links the inbox page from the top bar', async () => {
    const page = await exports.default.fetch(`${origin}/`)
    expect(await page.text()).toContain('href="/inbox"')
    const inbox = await exports.default.fetch(`${origin}/inbox`)
    expect(inbox.status).toBe(200)
    expect(await inbox.text()).toContain('data-page="inbox"')
  })
})
