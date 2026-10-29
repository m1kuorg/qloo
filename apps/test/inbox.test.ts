import { abortAllDurableObjects } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { http } from 'msw'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { State } from '../src/agent'
import type { Session as Agent } from '../src/client/App'
import { PickOne } from '../src/client/controls'
import { InboxWorkspace } from '../src/client/Inbox'
import type { WorkCandidate, WorkMatch } from '../src/inbox'
import sample from '../src/sample-inbox.json'
import {
  fakeClaude,
  fakeQloo,
  modelRequests,
  network,
  refusal,
  requests,
  text,
  turn,
  type ModelRequest,
  type QlooEntity,
  type ScriptedTurn
} from './fake'
import { facts, hooked, links, openGuest, openSession, sampleLabels, sections, type Session } from './session'

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
          from: 'Pat Lindqvist <pat.lindqvist@example.com>',
          subject: 'Ada Quill on Night Ferry',
          body: "Hi team, Ada Quill's novel Night Ferry is about a projectionist on a car ferry. She'd love to talk movies.",
          status: 'read',
          guest: 'Ada Quill',
          work: { title: 'Night Ferry', type: 'book', year: 2019 },
          match: {
            resolution: 'resolved',
            entity: {
              id: 'b-0001',
              name: 'Night Ferry',
              popularity: 0.81,
              disambiguation: '2019, Ada Quill',
              description: null
            },
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

// The sample inbox comes only with the guest network, already read (network-agent.ts).
describe('the sample inbox, as the guest network loads it', () => {
  const sampleNetwork = env.SAMPLE_NETWORK
  afterEach(() => {
    env.SAMPLE_NETWORK = sampleNetwork
  })

  it('lists every pitch with its guest, work, type, and match state, under the page’s one sample label', async () => {
    env.SAMPLE_NETWORK = 'on'
    fakeQloo({ search: sampleSearch })
    const network = await (await openGuest()).connect('/agents/network/guest-network')
    const state = await network.until((s: State) => s.inbox?.status === 'done')
    network.close()
    const { inbox } = state

    expect(inbox).toMatchObject({ sample: true, notice: sample.notice, status: 'done' })
    expect(inbox!.pitches.map((p) => p.id)).toEqual(sample.pitches.map((p) => p.id))
    const special: Record<string, Partial<WorkMatch>> = {
      'pitch-01': { resolution: 'missed', entity: null, candidates: [] },
      'pitch-30': {
        resolution: 'ambiguous',
        entity: null,
        candidates: [
          { id: 'w-digger-a', name: 'Digger', popularity: null, disambiguation: '2026', description: null },
          { id: 'w-digger-b', name: 'Digger', popularity: null, disambiguation: '2026', description: null }
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
    // The page's header counts the pitches for the show the sample was written for, its title badged
    // sample, the page's one sample label, under no notice, and no readout while it's at rest; its
    // Pitches section says what reaches Qloo, and its table how each work matched, with a row per pitch
    // saying so and, where one is needed, how to settle it.
    const page = renderToStaticMarkup(
      createElement(InboxWorkspace, { agent: { state, stub: {} } as unknown as Agent, links })
    )
    expect(sampleLabels(page)).toEqual(['h1: Inbox'])
    expect(words(page)).toMatch(
      /^Inbox sample 40 pitches for The Big Picture · 34 matched, 1 ambiguous, 1 not in Qloo, 4 set aside Details Load pitches Pitches Rank /
    )
    expect(words(page)).toContain(
      'Pitches Only the work’s title and type are looked up in Qloo; names, addresses, and pitch text never are. Qloo data Matches from Qloo search, one call per work.'
    )
    for (const gone of [
      'Sample inbox',
      'Sample data',
      'Sample data for Crossfeed’s guest pitches',
      "Sample data for Crossfeed's guest pitches",
      'Claude read'
    ])
      expect(words(page)).not.toContain(gone)
    const rows = hooked(page, 'data-status').map(words)
    expect(rows).toHaveLength(sample.pitches.length)
    const row = (id: string) => rows[sample.pitches.findIndex((p) => p.id === id)]
    expect(row('pitch-30')).toContain('Ambiguous 2 with this title Confirm the match')
    expect(row('pitch-01')).toMatch(/Not in Qloo No \w+ with this title.* in Qloo\./)
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

    // The sample's pitches as an upload gives them, each with its sender.
    await s.call('loadInbox', {
      pitches: sample.pitches.map((p) => ({
        from: `${p.senderName} <${p.senderEmail}>`,
        subject: p.subject,
        body: p.body
      }))
    })
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

describe("Claude's reading of a pitch", () => {
  it('is set aside at once when it gives a title or a guest over 200 characters, and nothing reaches Qloo', async () => {
    fakeQloo({ search: {} })
    // A title an email-address pattern would take seconds to rule out, and a guest's name past the limit.
    fakeReader(2, (text) =>
      extraction(
        text.includes('Night Ferry')
          ? { guest: 'Ada Quill', work: { title: '@'.repeat(4_000), type: 'book', year: 2019 } }
          : { guest: 'G'.repeat(201), work: { title: 'Low Tide', type: 'film', year: 2018 } }
      )
    )
    const s = await session()
    const began = Date.now()

    await s.call('loadInbox', { text: `${pasted}\n---\nLow Tide is a film about a harbour town.` })
    const { inbox } = await loaded(s)

    expect(Date.now() - began).toBeLessThan(4_000)
    expect(inbox!.pitches.map((p) => [p.status, p.error])).toEqual([
      ['unreadable', "The work's title is over 200 characters, so it isn't sent to Qloo."],
      ['unreadable', "The guest's name is over 200 characters, so the pitch is set aside."]
    ])
    expect(qlooRequests()).toEqual([])
  })
})

describe("a guest's whole name", () => {
  it('keeps a title holding it from Qloo however the guest is written, but not a title holding a first name alone', async () => {
    fakeQloo({ search: {} })
    // Each pitch's text, and how Claude reads its guest and title.
    const read: Record<string, Extracted> = {
      'Dr. Ada Quill on her novel.': {
        guest: 'Dr. Ada Quill',
        work: { title: "Ada Quill's Night Ferry", type: 'book', year: null }
      },
      'Quill, Ada on her novel.': {
        guest: 'Quill, Ada',
        work: { title: "Ada Quill's Night Ferry", type: 'book', year: null }
      },
      'Ada Quill, PhD, on her novel.': {
        guest: 'Ada Quill, PhD',
        work: { title: "Ada Quill's Night Ferry", type: 'book', year: null }
      },
      'Ada Quill on a book for her niece.': {
        guest: 'Ada Quill',
        work: { title: 'Night Ferry for Ada', type: 'book', year: null }
      }
    }
    fakeReader(4, (text) => extraction(Object.entries(read).find(([pitch]) => text.includes(pitch))![1]))
    const s = await session()

    await s.call('loadInbox', { text: Object.keys(read).join('\n---\n') })
    const { inbox } = await loaded(s)

    expect(inbox!.pitches.map((p) => [p.status, p.error])).toEqual([
      ...Array.from({ length: 3 }, () => [
        'unreadable',
        "The work's title holds the guest's or sender's name, so it isn't sent to Qloo."
      ]),
      ['read', null]
    ])
    expect(qlooRequests().map((r) => r.url.searchParams.get('query'))).toEqual(['Night Ferry for Ada'])
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

  it('refuses the sample inbox, which only the guest network loads, already read, so no model reads it', async () => {
    const s = await session()
    await expect(s.call('loadInbox', { sample: true })).rejects.toThrow('Paste pitches or upload them.')
    expect(s.state()?.inbox).toBeNull()
    expect(requests).toEqual([])
  })
})

describe("the inspector's Pitch tab", () => {
  // A pitch with a sender whose book Qloo matches, and one with no public work.
  const twoPitches = async () => {
    fakeQloo({
      search: {
        'Night Ferry': [
          { entity_id: 'b-0001', name: 'Night Ferry', popularity: 0.81, disambiguation: '2019, Ada Quill' },
          { entity_id: 'b-0002', name: 'The Night Ferryman', popularity: 0.4, disambiguation: '2003, Jo Bell' }
        ]
      }
    })
    fakeReader(2, (text) =>
      text.includes('Night Ferry')
        ? extraction({ guest: 'Ada Quill', work: { title: 'Night Ferry', type: 'book', year: 2019 } })
        : extraction({ guest: 'Dot Pruitt', work: null })
    )
    const s = await session()
    await s.call('loadInbox', { text: `${pasted}\n---\n${person}` })
    return loaded(s)
  }
  // The inbox page as it renders with a pitch open in the inspector, and the Pitch tab's panel.
  const pitchTab = (state: State, pitch: string) =>
    hooked(
      renderToStaticMarkup(
        createElement(InboxWorkspace, { agent: { state, stub: {} } as unknown as Agent, links, defaultPitch: pitch })
      ),
      'data-pitch-detail'
    )[0]

  it('opens a matched pitch on its state, then its sender, guest, work, Qloo match with its call, and reader', async () => {
    const html = pitchTab(await twoPitches(), 'pitch-01')

    // Its chip follows its subject in the heading.
    expect(html).toMatch(
      /<h2\b[^>]*\sid="pitch-ed"[^>]*>Ada Quill on Night Ferry<(?:(?!<\/h2>).)*\sdata-slot="badge"[^>]*>Matched</
    )
    expect(sections(html)).toEqual([
      ['Ada Quill on Night Ferry Matched', 'Its work matched in Qloo, so a run can rank it.']
    ])
    expect(facts(html)).toEqual([
      ['From', 'Pat Lindqvist <pat.lindqvist@example.com>'],
      ['Guest', 'Ada Quill'],
      ['Public work', 'Night Ferry · Book · 2019'],
      ['Qloo match', 'Night Ferry (2019, Ada Quill) C-01'],
      ['Read by', 'Agent']
    ])
    expect(html).toMatch(/<button\b[^>]*\saria-label="Evidence for Night Ferry: call C-01"[^>]*>C-01<\/button>/)
    expect(words(html)).toMatch(/Read by Agent Hi team, Ada Quill's novel Night Ferry/)
  })

  it('opens a set-aside pitch on why it never reaches Qloo, with no sender, work, or match', async () => {
    const html = pitchTab(await twoPitches(), 'pitch-02')

    expect(sections(html)).toEqual([[`${person} Set aside`, 'No public work, so it never reaches Qloo.']])
    expect(facts(html)).toEqual([
      ['Guest', 'Dot Pruitt'],
      ['Public work', '–'],
      ['Qloo match', '–'],
      ['Read by', 'Agent']
    ])
  })

  it('credits the agent only once it has read a pitch: not while it reads, nor when reading failed or was declined', async () => {
    fakeQloo({ search: { 'Night Ferry': [{ entity_id: 'b-0001', name: 'Night Ferry', popularity: 0.81 }] } })
    // The book's reading is held until the other two have settled, one on a reply that isn't JSON.
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    fakeClaude(
      Array.from({ length: 3 }, () => async (request: ModelRequest) => {
        const body = pitchText(request)
        if (!body.includes(book)) return body.includes(person) ? turn(text('Not JSON.')) : refusal('general_harms')
        await held
        return extraction({ guest: 'Ada Quill', work: { title: 'Night Ferry', type: 'book', year: null } })
      })
    )
    const s = await session()
    await s.call('loadInbox', { text: threePitches })
    const reading = await s.until(
      (state: State) => state.inbox?.pitches.filter((p) => p.status !== 'reading').length === 2
    )
    const readBy = (state: State, pitch: string) => facts(pitchTab(state, pitch)).find(([label]) => label === 'Read by')

    expect(reading.inbox!.pitches.map((p) => p.status)).toEqual(['reading', 'failed', 'unreadable'])
    expect(readBy(reading, 'pitch-01')).toEqual(['Read by', '–'])
    expect(readBy(reading, 'pitch-02')).toEqual(['Read by', '–'])
    expect(readBy(reading, 'pitch-03')).toEqual(['Read by', '–'])
    release()
    expect(readBy(await loaded(s), 'pitch-01')).toEqual(['Read by', 'Agent'])
  })

  it("keeps crediting the agent when the work's lookup fails after Claude read the pitch", async () => {
    fakeQloo({ search: { 'Night Ferry': [{ entity_id: 'b-0001', name: 'Night Ferry', popularity: 0.81 }] } })
    // Holds the work's search, so the agent restarts with the pitch read and its lookup out.
    const held = Promise.withResolvers<void>()
    network.use(http.get(`${env.QLOO_BASE_URL}/search`, () => held.promise))
    fakeReader(1, () => extraction({ guest: 'Ada Quill', work: { title: 'Night Ferry', type: 'book', year: 2019 } }))
    const first = await session()
    await first.call('loadInbox', { text: pasted })
    await first.until((state: State) => state.inbox?.pitches[0]?.status === 'looking_up')
    first.close()
    await abortAllDurableObjects()

    const state = (await session(first.cookie)).state()!
    expect(state.inbox!.pitches[0]).toMatchObject({ status: 'failed', guest: 'Ada Quill' })
    expect(facts(pitchTab(state, 'pitch-01')).find(([label]) => label === 'Read by')).toEqual(['Read by', 'Agent'])
    held.resolve()
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
      entity: { id: 'f-2025', name: 'Frankenstein', popularity: 0.89, disambiguation: '2025', description: null },
      candidates: [
        { id: 'f-1931', name: 'Frankenstein', popularity: 0.97, disambiguation: '1931', description: null },
        { id: 'f-2025', name: 'Frankenstein', popularity: 0.89, disambiguation: '2025', description: null }
      ],
      evidence: 'C-01',
      error: null
    })
  })
})

// A page's words, as a reader hears them.
const words = (html: string) =>
  html
    .replace(/<!--.*?-->|<[^>]+>/g, ' ')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

// The confirm picker as the browser renders it from synced candidates: each option's text, in order,
// and the picker's whole text.
function picker(options: WorkCandidate[]) {
  const html = renderToStaticMarkup(
    createElement(PickOne, {
      legend: 'Which Qloo film is Lantern?',
      options,
      current: undefined,
      note: '',
      submit: 'Use this match',
      busy: false,
      pick: async () => {}
    })
  )
  const plain = (s: string) =>
    s
      .replace(/<!--.*?-->|<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  return { labels: hooked(html, 'data-candidate').map(plain), text: plain(html) }
}

// Loads one pasted pitch for the film "Lantern" (2026), whose search returns `results`.
async function lantern(results: QlooEntity[]) {
  fakeQloo({ search: { Lantern: results } })
  fakeReader(1, () => extraction({ guest: 'Ida Moss', work: { title: 'Lantern', type: 'film', year: 2026 } }))
  const s = await session()
  await s.call('loadInbox', { text: 'Ida Moss on her film Lantern.' })
  const { inbox } = await loaded(s)
  const match = inbox!.pitches[0].match!
  expect(match.resolution).toBe('ambiguous')
  return match.candidates
}

describe('telling same-title candidates apart in the confirm picker', () => {
  it("shows each candidate's description from Qloo, and says when one has none", async () => {
    const long = 'A lighthouse keeper on a remote island writes letters to the sea, and the sea writes back. '.repeat(4)
    const candidates = await lantern([
      {
        entity_id: 'l-0001',
        name: 'Lantern',
        popularity: null,
        disambiguation: '2026',
        properties: {
          short_descriptions: [
            { language: 'fr', value: 'Un veilleur de nuit.' },
            { language: 'en', value: ' A night watchman keeps a lighthouse burning. ' }
          ]
        }
      },
      { entity_id: 'l-0002', name: 'Lantern', popularity: null, disambiguation: '2026', properties: {} },
      {
        entity_id: 'l-0003',
        name: 'Lantern',
        popularity: null,
        disambiguation: '2026',
        properties: { description: long }
      }
    ])

    expect(candidates.map((c) => c.description)).toEqual([
      'A night watchman keeps a lighthouse burning.',
      null,
      expect.stringMatching(/^A lighthouse keeper on a remote island .{100,}…$/)
    ])
    expect(candidates[2].description!.length).toBeLessThanOrEqual(201)
    const { labels, text } = picker(candidates)
    expect(new Set(labels).size).toBe(3)
    expect(labels[0]).toContain('A night watchman keeps a lighthouse burning.')
    expect(labels[1]).toContain('No description in Qloo')
    expect(text).not.toContain('nothing else')
  })

  it('shows Qloo IDs, and says Qloo gave nothing else, when candidates are otherwise identical', async () => {
    const candidates = await lantern([
      { entity_id: 'D1661E40-AAAA-0000', name: 'Lantern', popularity: null, disambiguation: '2026' },
      { entity_id: 'D1661E40-BBBB-0000', name: 'Lantern', popularity: null, disambiguation: '2026' }
    ])

    const { labels, text } = picker(candidates)
    expect(labels).toEqual([
      expect.stringContaining('Qloo ID D1661E40-A'),
      expect.stringContaining('Qloo ID D1661E40-B')
    ])
    expect(text).toContain('Qloo gives nothing else to tell these apart')
    expect(text).not.toContain('No description')
    // Candidates synced before descriptions existed have no such field, and read the same.
    expect(picker(candidates.map(({ description, ...c }) => c as WorkCandidate)).labels).toEqual(labels)
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
  it('refuses inbox actions', async () => {
    env.GUEST_PITCHES = 'off'
    const s = await session()
    await expect(s.call('loadInbox', { text: pasted })).rejects.toThrow("Guest pitches aren't switched on.")
    await expect(s.call('confirmWork', 'pitch-01', 'x')).rejects.toThrow("Guest pitches aren't switched on.")
    expect(requests).toEqual([])
  })
})

describe("the inbox page's links", () => {
  it('sends a booker with no matched show to the roster page it is given', async () => {
    fakeQloo({ search: { 'Night Ferry': [{ entity_id: 'b-0001', name: 'Night Ferry', popularity: 0.81 }] } })
    fakeReader(1, () => extraction({ guest: 'Ada Quill', work: { title: 'Night Ferry', type: 'book', year: 2019 } }))
    const s = await session()
    await s.call('loadInbox', { text: pasted })
    const state = await loaded(s)

    const agent = { state, stub: {} } as unknown as Agent
    const html = renderToStaticMarkup(createElement(InboxWorkspace, { agent, links: { roster: '/elsewhere/roster' } }))
    expect(html).toMatch(/<a\b[^>]*\shref="\/elsewhere\/roster"[^>]*>Import the roster<\/a>/)
  })
})
