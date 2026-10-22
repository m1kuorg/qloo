// The REST API's inbox, pitch run, and reply endpoints, driven as a program drives them: with an API
// key over HTTP, sending the email files a booker exports, polling while the agent reads and ranks,
// and branching on the error codes.
import { env } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Question, Run } from '../src/agent'
import type { PitchList } from '../src/fit'
import type { Pitch, PitchReply } from '../src/inbox'
import { mbox, nightFerry } from './emails'
import {
  fakeClaude,
  fakeInsights,
  fakeQloo,
  fakeReader,
  modelRequests,
  qlooRequests,
  requests,
  text,
  toolUse,
  turn,
  type Extracted
} from './fake'
import { networkWithKey, poll, refused } from './session'

beforeEach(() => {
  env.GUEST_PITCHES = 'on'
})
const saved = { RUN_VISITOR_DAILY_CAP: env.RUN_VISITOR_DAILY_CAP }
afterEach(() => {
  env.GUEST_PITCHES = 'off'
  Object.assign(env, saved)
})

type Inbox = { status: 'empty' | 'reading' | 'done'; pitches: Pitch[]; skipped: { pitch: string; why: string }[] }
type Call = Awaited<ReturnType<typeof networkWithKey>>['call']

// How the model reads each of the mbox's three emails.
const readings: Record<string, Extracted> = {
  'Night Ferry': { guest: 'Ada Quill', work: { title: 'Night Ferry', type: 'book', year: 2019 } },
  'Paper Moons': { guest: 'Rue Vance', work: { title: 'Paper Moons', type: 'book', year: 2016 } },
  'Static Bloom': { guest: 'Ben Ochoa', work: { title: 'Static Bloom', type: 'film', year: 2021 } }
}
const reader = (count = 3) => fakeReader(count, (text) => Object.entries(readings).find(([t]) => text.includes(t))![1])
const search = {
  'Night Ferry': [{ entity_id: 'b-0001', name: 'Night Ferry', popularity: 0.81, disambiguation: '2019, Ada Quill' }],
  'Paper Moons': [{ entity_id: 'b-0002', name: 'Paper Moons', popularity: 0.5, disambiguation: '2016, Rue Vance' }],
  'Static Bloom': [
    { entity_id: 'f-0001', name: 'Static Bloom', popularity: 0.5, disambiguation: '2021' },
    { entity_id: 'f-0002', name: 'Static Bloom', popularity: 0.3, disambiguation: '2021' }
  ]
}

// Sends pitch files as the body, as `curl --data-binary @export.mbox -H 'Content-Type: application/mbox'` does.
const loadInbox = (call: Call, network: string, body: BodyInit, type: string, query = '') =>
  call(`/api/v1/networks/${network}/inbox${query}`, { method: 'POST', headers: { 'Content-Type': type }, body })

// Polls the inbox, as a program waiting on a load does, until every pitch is read.
const inboxRead = (call: Call, network: string) =>
  poll<Inbox>(call, `/api/v1/networks/${network}/inbox`, (inbox) => inbox.status !== 'reading')
// And the roster, until every show's search has settled.
const rosterSettled = (call: Call, network: string) =>
  poll<{ status: string }>(call, `/api/v1/networks/${network}/roster`, (roster) => roster.status === 'settled')

describe('loading the inbox', () => {
  it('takes an .mbox body, answers 202 while reading, and reads each email for its guest and work', async () => {
    const lookups = Promise.withResolvers<void>()
    fakeQloo({ search, held: lookups.promise })
    reader()
    const { network, call } = await networkWithKey()
    expect(await (await call(`/api/v1/networks/${network}/inbox`)).json()).toEqual({
      status: 'empty',
      sample: null,
      pitches: [],
      skipped: []
    })

    const res = await loadInbox(call, network, mbox, 'application/mbox')
    expect(res.status).toBe(202)
    const reading = await res.json<Inbox>()
    expect(reading.status).toBe('reading')
    expect(reading.pitches.map((p) => [p.id, p.from, p.subject])).toEqual([
      ['pitch-01', 'Pat Lindqvist <pat.lindqvist@example.com>', 'Ada Quill on Night Ferry'],
      ['pitch-02', 'Rue Vance <rue@example.com>', 'Paper Moons — new edition'],
      ['pitch-03', 'Ben Ochoa <ben.ochoa@example.com>', 'Static Bloom']
    ])

    lookups.resolve()
    const inbox = await inboxRead(call, network)
    expect(inbox.status).toBe('done')
    expect(
      inbox.pitches.map((p) => [p.guest, p.work?.title, p.match?.resolution, p.match?.entity?.id ?? null])
    ).toEqual([
      ['Ada Quill', 'Night Ferry', 'resolved', 'b-0001'],
      ['Rue Vance', 'Paper Moons', 'resolved', 'b-0002'],
      ['Ben Ochoa', 'Static Bloom', 'ambiguous', null]
    ])
  })

  it('takes an .eml body, a text file of pitches, and JSON pitches, and needs replace=true over pitches', async () => {
    fakeQloo({ search })
    reader(4)
    const { network, call } = await networkWithKey()

    expect((await loadInbox(call, network, nightFerry, 'message/rfc822')).status).toBe(202)
    const eml = await inboxRead(call, network)
    expect(eml.pitches.map((p) => [p.from, p.subject, p.guest])).toEqual([
      ['Pat Lindqvist <pat.lindqvist@example.com>', 'Ada Quill on Night Ferry', 'Ada Quill']
    ])

    const again = await loadInbox(call, network, 'Rue Vance on Paper Moons.', 'text/plain')
    expect(again.status).toBe(409)
    expect(await again.json()).toEqual({
      error: {
        code: 'conflict',
        message:
          "The inbox already has pitches. Load with replace=true to load over them: they go, with the last pitch run's lists and replies."
      }
    })
    expect((await loadInbox(call, network, 'Rue Vance on Paper Moons.', 'text/plain', '?replace=false')).status).toBe(
      409
    )
    expect((await inboxRead(call, network)).pitches).toEqual(eml.pitches)

    const text =
      'From: Rue Vance <rue@example.com>\nSubject: Paper Moons\n\nRue Vance on Paper Moons.\n---\nBen Ochoa directed Static Bloom.\n'
    expect((await loadInbox(call, network, text, 'text/plain; charset=utf-8', '?replace=true')).status).toBe(202)
    expect((await inboxRead(call, network)).pitches.map((p) => [p.id, p.from, p.subject, p.body, p.guest])).toEqual([
      ['pitch-01', 'Rue Vance <rue@example.com>', 'Paper Moons', 'Rue Vance on Paper Moons.', 'Rue Vance'],
      ['pitch-02', null, null, 'Ben Ochoa directed Static Bloom.', 'Ben Ochoa']
    ])

    const json = {
      pitches: [{ from: 'Pat Lindqvist <pat@example.com>', subject: null, body: 'Ada Quill on Night Ferry.' }]
    }
    expect((await loadInbox(call, network, JSON.stringify(json), 'application/json', '?replace=true')).status).toBe(202)
    expect((await inboxRead(call, network)).pitches.map((p) => [p.from, p.subject, p.body, p.guest])).toEqual([
      ['Pat Lindqvist <pat@example.com>', null, 'Ada Quill on Night Ferry.', 'Ada Quill']
    ])
  })

  it("refuses what it can't read with 422, a body over 5 MB with 413, and another type or bad JSON with 400", async () => {
    fakeQloo({ search })
    const { network, call } = await networkWithKey()
    const many = Array.from({ length: 51 }, (_, i) => `Pitch number ${i + 1}.`).join('\n---\n')
    const blank = [nightFerry.split('\r\n\r\n')[0], '', ''].join('\r\n')
    for (const [body, type, status, code, message] of [
      [
        nightFerry,
        'application/mbox',
        422,
        'unreadable',
        '"pitches.mbox" isn\'t an mbox export: its first line should start an email with "From ".'
      ],
      ['---\n---\n', 'text/plain', 422, 'unreadable', '"pitches.txt" has no pitch in it.'],
      [' \n', 'message/rfc822', 422, 'unreadable', '"pitch.eml" is empty.'],
      [many, 'text/plain', 422, 'unreadable', '51 pitches is over the 50-pitch limit. Upload 50 or fewer.'],
      [
        blank,
        'message/rfc822',
        422,
        'unreadable',
        'No pitch here can be read: "Ada Quill on Night Ferry" has no text.'
      ],
      [
        'x'.repeat(5 * 1024 * 1024 + 1),
        'application/mbox',
        413,
        'too_large',
        '"pitches.mbox" is 5.0 MB, over the 5 MB limit for an upload.'
      ],
      [
        nightFerry,
        'application/octet-stream',
        400,
        'invalid',
        'Send the pitches as message/rfc822 (an .eml file), application/mbox, text/plain with a line of three dashes between pitches, or application/json.'
      ],
      ['{"pitches": [', 'application/json', 400, 'invalid', "The body isn't valid JSON. Send it as application/json."],
      [
        JSON.stringify({ pitches: [{ body: 'x'.repeat(5 * 1024 * 1024) }] }),
        'application/json',
        413,
        'too_large',
        '"pitches.json" is 5.0 MB, over the 5 MB limit for an upload.'
      ],
      [
        JSON.stringify({ pitches: [{ subject: 'Night Ferry' }] }),
        'application/json',
        400,
        'invalid',
        'pitches.0.body:'
      ],
      [JSON.stringify({ pitches: [] }), 'application/json', 422, 'unreadable', 'Upload at least one pitch.']
    ] as const) {
      const res = await loadInbox(call, network, body, type)
      expect(res.status, message).toBe(status)
      const { error } = await res.json<{ error: { code: string; message: string } }>()
      expect(error.code, message).toBe(code)
      expect(error.message).toContain(message)
    }
    expect((await inboxRead(call, network)).status).toBe('empty')
    expect(requests).toEqual([])
  })

  it("answers 409 while the inbox is still reading, and 429 past the network's model runs", async () => {
    const lookups = Promise.withResolvers<void>()
    fakeQloo({ search, held: lookups.promise })
    reader(1)
    const { network, call } = await networkWithKey()
    await loadInbox(call, network, nightFerry, 'message/rfc822')
    const busy = await loadInbox(call, network, mbox, 'application/mbox', '?replace=true')
    expect(busy.status).toBe(409)
    expect(await busy.json()).toEqual({
      error: { code: 'conflict', message: 'The inbox is still loading. Wait for it to finish.' }
    })
    lookups.resolve()
    await inboxRead(call, network)

    env.RUN_VISITOR_DAILY_CAP = '1'
    const capped = await loadInbox(call, network, mbox, 'application/mbox', '?replace=true')
    expect(capped.status).toBe(429)
    expect(await capped.json()).toEqual({
      error: {
        code: 'limit',
        message:
          "You've started 1 model run today, the most one network can start in a UTC day; they reset at 00:00 UTC."
      }
    })
  })

  it('is a 404, as if it had no such route, while guest pitches are off', async () => {
    env.GUEST_PITCHES = 'off'
    const { network, call } = await networkWithKey()
    for (const res of [
      await call(`/api/v1/networks/${network}/inbox`),
      await loadInbox(call, network, nightFerry, 'message/rfc822'),
      await call(`/api/v1/networks/${network}/inbox/pitches/pitch-01`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: 'b-0001' })
      }),
      await startRun(call, network, { show: 'Night Shift Cinema' }),
      await call(`/api/v1/networks/${network}/pitch-runs`),
      await call(`/api/v1/networks/${network}/pitch-runs/run-0`)
    ]) {
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: { code: 'not_found', message: "Guest pitches aren't switched on." } })
    }
  })
})

describe("a pitch's work", () => {
  const confirm = (call: Call, network: string, pitch: string, body: object) =>
    call(`/api/v1/networks/${network}/inbox/pitches/${pitch}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

  it("is confirmed among an ambiguous work's candidates, and nothing else is", async () => {
    fakeQloo({ search })
    reader()
    const { network, call } = await networkWithKey()
    await loadInbox(call, network, mbox, 'application/mbox')
    await inboxRead(call, network)

    const res = await confirm(call, network, 'pitch-03', { entityId: 'f-0002' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      id: 'pitch-03',
      match: { resolution: 'resolved', entity: { id: 'f-0002', name: 'Static Bloom' }, candidates: [{}, {}] }
    })

    for (const [pitch, body, status, error] of [
      [
        'pitch-01',
        { entityId: 'f-0001' },
        400,
        { code: 'invalid', message: "That isn't one of the candidates for Night Ferry." }
      ],
      ['pitch-09', { entityId: 'f-0001' }, 404, { code: 'not_found', message: 'No pitch pitch-09 in the inbox.' }],
      ['pitch-03', {}, 400, { code: 'invalid', message: expect.stringContaining('entityId') }]
    ] as const) {
      const refused = await confirm(call, network, pitch, body)
      expect(refused.status).toBe(status)
      expect((await refused.json<{ error: object }>()).error).toEqual(error)
    }
    const { pitches } = await inboxRead(call, network)
    expect(pitches.map((p) => p.match?.entity?.id ?? null)).toEqual(['b-0001', 'b-0002', 'f-0002'])
  })
})

type PitchRun = {
  id: string
  status: Run['status']
  show: string
  startedAt: string
  question: Question | null
  error: string | null
  closing: string | null
  lists: PitchList[] | null
  replies: PitchReply[] | null
  repliesEdited: boolean
}

// The show the pitches are for, on the roster, and made-up affinities in fit order for each list.
const show = { 'Night Shift Cinema': [{ entity_id: 'e-0001', name: 'Night Shift Cinema', popularity: 0.8 }] }
// A past guest's work, which the run looks up by its title and type alone.
const pastGuest = { guest: 'Mo Reyes', work: { title: 'Talking with Ghosts', type: 'book', year: 2022 } }
const pastWork = {
  'Talking with Ghosts': [
    { entity_id: 'b-0101', name: 'Talking with Ghosts', popularity: 0.4, disambiguation: '2022, Mo Reyes' }
  ]
}
const scores: Record<string, { entity_id: string; name: string; affinity: number }[]> = {
  'urn:entity:book': [
    { entity_id: 'b-0002', name: 'Paper Moons', affinity: 0.7341 },
    { entity_id: 'b-0001', name: 'Night Ferry', affinity: 0.7127 }
  ],
  'urn:entity:movie': [{ entity_id: 'f-0002', name: 'Static Bloom', affinity: 0.6883 }]
}

// A network whose roster has the show and whose inbox holds the mbox's pitches, each work matched,
// all through the API, then the pitch run's turns scripted through `script`.
async function readyToRank(script: Parameters<typeof fakeClaude>[0], key?: Awaited<ReturnType<typeof networkWithKey>>) {
  fakeQloo({ search: { ...search, ...show, ...pastWork, 'Paper Trail': [] } })
  fakeInsights((body) => scores[String(body['filter.type'])])
  reader()
  const made = key ?? (await networkWithKey())
  const { network, call } = made
  await call(`/api/v1/networks/${network}/roster`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: 'Night Shift Cinema\n'
  })
  await loadInbox(call, network, mbox, 'application/mbox')
  await inboxRead(call, network)
  await rosterSettled(call, network)
  await call(`/api/v1/networks/${network}/inbox/pitches/pitch-03`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entityId: 'f-0002' })
  })
  fakeClaude(script)
  return made
}

const startRun = (call: Call, network: string, body: object) =>
  call(`/api/v1/networks/${network}/pitch-runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

// Polls the pitch run, as a program waiting on it does, until it stops running: done, or waiting on
// its question.
const runRead = (call: Call, network: string, run: string) =>
  poll<PitchRun>(call, `/api/v1/networks/${network}/pitch-runs/${run}`, (read) => read.status !== 'running')

const rank = turn(
  toolUse('rank_pitches', {
    show_id: 'e-0001',
    past_guest_work_ids: [],
    pitch_ids: ['pitch-01', 'pitch-02', 'pitch-03']
  })
)
const ask = turn(
  toolUse('ask_human', { question: 'Hold the film pitches for next season?', kind: 'choice', options: ['Yes', 'No'] })
)
const draft = turn(
  toolUse('draft_replies', {
    replies: [
      { pitch: 'pitch-01', verdict: 'later', angle: null, draft: "Let's revisit Night Ferry in spring." },
      { pitch: 'pitch-02', verdict: 'book', angle: null, draft: 'Paper Moons would suit the show. More soon.' },
      { pitch: 'pitch-03', verdict: 'later', angle: null, draft: "We'll come back to Static Bloom next season." }
    ]
  })
)

describe('a pitch run', () => {
  it('ranks the pitches against a roster show, asks its question, and once answered drafts the replies', async () => {
    // The model's first turn waits until the start's answer is read.
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    const { network, call } = await readyToRank([
      () => held.then(() => rank),
      ask,
      draft,
      turn(text('Drafted 1 book and 2 later.'))
    ])

    const res = await startRun(call, network, { show: 'Night Shift Cinema', pastGuests: [pastGuest] })
    expect(res.status).toBe(202)
    const started = await res.json<PitchRun>()
    expect(started).toMatchObject({ status: 'running', show: 'Night Shift Cinema', question: null, replies: null })
    release()

    const waiting = await runRead(call, network, started.id)
    expect(waiting).toMatchObject({
      id: started.id,
      status: 'waiting',
      question: { kind: 'choice', question: 'Hold the film pitches for next season?', options: ['Yes', 'No'] }
    })
    expect(waiting.lists!.map((l) => [l.type, l.rows.map((r) => r.pitch)])).toEqual([
      ['book', ['pitch-02', 'pitch-01']],
      ['film', ['pitch-03']]
    ])

    const answered = await call(`/api/v1/networks/${network}/pitch-runs/${started.id}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: waiting.question!.id, choice: 'Yes' })
    })
    expect(answered.status).toBe(202)
    // It may finish before the answer's own response is written.
    expect(await answered.json()).toMatchObject({ id: started.id, question: null })

    const done = await runRead(call, network, started.id)
    expect(done).toMatchObject({ status: 'completed', error: null, closing: 'Drafted 1 book and 2 later.' })
    expect(done.replies!.map((r) => [r.pitch, r.verdict, r.status, r.draft])).toEqual([
      ['pitch-01', 'later', 'draft', "Let's revisit Night Ferry in spring."],
      ['pitch-02', 'book', 'draft', 'Paper Moons would suit the show. More soon.'],
      ['pitch-03', 'later', 'draft', "We'll come back to Static Bloom next season."]
    ])
    // The answer reached the agent as the booker's own words.
    expect(JSON.stringify(modelRequests().at(-2)!.messages.at(-1))).toContain('Yes')
    // Of the pitches and the past guest, only works' titles and types, then their Qloo IDs, reached
    // Qloo: no sender, and no guest.
    const senders = ['Pat Lindqvist', 'pat.lindqvist@example.com', 'rue@example.com', 'ben.ochoa@example.com']
    const sent = qlooRequests()
    expect(sent.filter((r) => r.includes('talking with ghosts'))).toHaveLength(1)
    expect(sent.filter((r) => r.includes('/v2/insights'))).toHaveLength(2)
    for (const detail of [...senders, ...Object.values(readings).map((r) => r.guest), pastGuest.guest, '@'])
      expect(
        sent.filter((r) => r.includes(detail.toLowerCase())),
        detail
      ).toEqual([])
  })

  it('are listed newest first, so a program finds the latest without its ID', async () => {
    const { network, call } = await readyToRank([
      turn(text('Drafted nothing yet.')),
      turn(text('Drafted nothing again.'))
    ])
    const list = async () => (await call(`/api/v1/networks/${network}/pitch-runs`)).json()
    expect(await list()).toEqual({ pitchRuns: [] })

    const first = await (await startRun(call, network, { show: 'Night Shift Cinema' })).json<PitchRun>()
    await runRead(call, network, first.id)
    const second = await (await startRun(call, network, { show: 'Night Shift Cinema' })).json<PitchRun>()
    const latest = await runRead(call, network, second.id)
    expect(await list()).toEqual({
      pitchRuns: [
        { id: second.id, status: latest.status, show: 'Night Shift Cinema', startedAt: second.startedAt },
        { id: first.id, status: 'completed', show: 'Night Shift Cinema', startedAt: first.startedAt }
      ]
    })
  })

  it("refuses a start, a read, or an answer the network's state or the request can't take, saying why", async () => {
    const made = await networkWithKey()
    const { network, call } = made
    const start = (body: object) => startRun(call, network, body)
    expect(await refused(await start({ show: 'Night Shift Cinema' }))).toEqual([
      409,
      { code: 'conflict', message: 'Load an inbox first.' }
    ])

    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    await readyToRank([() => held.then(() => rank), ask], made)
    await call(`/api/v1/networks/${network}/roster?replace=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'Night Shift Cinema\nPaper Trail\n'
    })
    await rosterSettled(call, network)
    for (const [body, status, error] of [
      [{ pastGuests: [] }, 400, { code: 'invalid', message: expect.stringContaining('show') }],
      [{ show: 'Deep Cuts' }, 404, { code: 'not_found', message: 'No show named "Deep Cuts" in the roster.' }],
      [
        { show: 'Paper Trail' },
        409,
        { code: 'conflict', message: "Paper Trail isn't matched in Qloo. Settle it in the roster first." }
      ],
      [
        {
          show: 'Night Shift Cinema',
          pastGuests: [{ guest: 'Mo Reyes', work: { title: 'Mo Reyes Live', type: 'book' } }]
        },
        400,
        { code: 'invalid', message: "Past guest 1's work title holds their name, so it isn't sent to Qloo." }
      ]
    ] as const)
      expect(await refused(await start(body))).toEqual([status, error])

    env.RUN_VISITOR_DAILY_CAP = '1' // the inbox's reading was one
    expect(await refused(await start({ show: 'Night Shift Cinema' }))).toEqual([
      429,
      {
        code: 'limit',
        message:
          "You've started 1 model run today, the most one network can start in a UTC day; they reset at 00:00 UTC."
      }
    ])
    env.RUN_VISITOR_DAILY_CAP = saved.RUN_VISITOR_DAILY_CAP

    const { id } = await (await start({ show: 'Night Shift Cinema' })).json<PitchRun>()
    expect(await refused(await start({ show: 'Night Shift Cinema' }))).toEqual([
      409,
      { code: 'conflict', message: 'A run is already in progress. Wait for it to finish.' }
    ])
    release()
    const { question } = await runRead(call, network, id)

    const answer = (run: string, body: object) =>
      call(`/api/v1/networks/${network}/pitch-runs/${run}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
    for (const [run, body, status, error] of [
      [
        id,
        { questionId: 'toolu_9_9', choice: 'Yes' },
        409,
        {
          code: 'conflict',
          message: 'That question is no longer open: it was already answered, or its run has ended.'
        }
      ],
      [
        id,
        { questionId: question!.id, choice: 'Maybe' },
        400,
        { code: 'invalid', message: "That isn't one of the options." }
      ],
      [id, { questionId: question!.id }, 400, { code: 'invalid', message: 'Pick an option or type an answer.' }],
      [id, { choice: 'Yes' }, 400, { code: 'invalid', message: expect.stringContaining('questionId') }],
      [
        'run-0',
        { questionId: question!.id, choice: 'Yes' },
        404,
        { code: 'not_found', message: "There's no pitch run run-0." }
      ]
    ] as const)
      expect(await refused(await answer(run, body))).toEqual([status, error])
    expect(await refused(await call(`/api/v1/networks/${network}/pitch-runs/run-0`))).toEqual([
      404,
      { code: 'not_found', message: "There's no pitch run run-0." }
    ])
    // Still waiting on its question.
    expect((await runRead(call, network, id)).status).toBe('waiting')
  })
})

describe("a pitch run's replies", () => {
  // A network whose pitch run has drafted its replies, through the API.
  async function drafted(script = [rank, draft, turn(text('Drafted.'))]) {
    const ready = await readyToRank(script)
    const { id } = await (await startRun(ready.call, ready.network, { show: 'Night Shift Cinema' })).json<PitchRun>()
    return { ...ready, run: await runRead(ready.call, ready.network, id) }
  }
  const change = (call: Call, network: string, run: string, pitch: string, body: unknown) =>
    call(`/api/v1/networks/${network}/pitch-runs/${run}/replies/${pitch}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  const discard = (call: Call, network: string, run: string, pitch: string) =>
    call(`/api/v1/networks/${network}/pitch-runs/${run}/replies/${pitch}/discard`, { method: 'POST' })

  it('are edited and discarded, editing a discarded one restores it, and the app shows what the program did', async () => {
    const { ada, network, call, run } = await drafted()
    expect(run.status).toBe('completed')

    const edited = await change(call, network, run.id, 'pitch-01', { draft: '  Night Ferry is a fit for spring.  ' })
    expect(edited.status).toBe(200)
    expect(await edited.json()).toMatchObject({
      pitch: 'pitch-01',
      verdict: 'later',
      status: 'draft',
      draft: 'Night Ferry is a fit for spring.'
    })
    const discarded = await discard(call, network, run.id, 'pitch-02')
    expect(discarded.status).toBe(200)
    expect(await discarded.json()).toMatchObject({ pitch: 'pitch-02', status: 'discarded' })
    expect((await runRead(call, network, run.id)).replies!.map((r) => [r.pitch, r.status, r.draft])).toEqual([
      ['pitch-01', 'draft', 'Night Ferry is a fit for spring.'],
      ['pitch-02', 'discarded', 'Paper Moons would suit the show. More soon.'],
      ['pitch-03', 'draft', "We'll come back to Static Bloom next season."]
    ])
    const restored = await change(call, network, run.id, 'pitch-02', { draft: 'Paper Moons, yes.' })
    expect(await restored.json()).toMatchObject({ status: 'draft', draft: 'Paper Moons, yes.' })

    // A member's page, connected to the network's agent, sees the same replies.
    const page = await ada.connect(`/agents/network/${network}`)
    const synced = await page.until((s) => s.booking?.replies?.[1].draft === 'Paper Moons, yes.')
    expect(synced.booking!.replies!.map((r) => r.status)).toEqual(['draft', 'draft', 'draft'])
    page.close()

    // Once a new inbox replaces them, the run still reads with its replies as they were left.
    await discard(call, network, run.id, 'pitch-03')
    reader()
    await loadInbox(call, network, nightFerry, 'message/rfc822', '?replace=true')
    await inboxRead(call, network)
    expect((await runRead(call, network, run.id)).replies!.map((r) => [r.pitch, r.status, r.draft])).toEqual([
      ['pitch-01', 'draft', 'Night Ferry is a fit for spring.'],
      ['pitch-02', 'draft', 'Paper Moons, yes.'],
      ['pitch-03', 'discarded', "We'll come back to Static Bloom next season."]
    ])
  })

  it("say when an edit or a discard has changed them since the run's closing line, which stays as Claude wrote it", async () => {
    const { network, call, run } = await drafted()
    expect(run).toMatchObject({ status: 'completed', closing: 'Drafted.', repliesEdited: false })

    await change(call, network, run.id, 'pitch-01', { draft: "Let's revisit Night Ferry in spring." })
    expect(await runRead(call, network, run.id)).toMatchObject({ closing: 'Drafted.', repliesEdited: false })
    await discard(call, network, run.id, 'pitch-02')
    expect(await runRead(call, network, run.id)).toMatchObject({
      closing: 'Drafted.',
      replies: [{ status: 'draft' }, { status: 'discarded' }, { status: 'draft' }],
      repliesEdited: true
    })
  })

  it("are never approved through the API, which refuses what a reply can't take", async () => {
    const { network, call, run } = await drafted()
    const approve = await call(`/api/v1/networks/${network}/pitch-runs/${run.id}/replies/pitch-01/approve`, {
      method: 'POST'
    })
    expect(approve.status).toBe(404)
    const smuggled = await change(call, network, run.id, 'pitch-01', { draft: 'Yes.', status: 'approved' })
    expect(smuggled.status).toBe(400)
    expect(await smuggled.json()).toEqual({
      error: {
        code: 'invalid',
        message: "Only a reply's draft can be changed through the API. A member approves a reply, in the app."
      }
    })
    for (const [pitch, body, status, error] of [
      [
        'pitch-01',
        { draft: '   ' },
        400,
        { code: 'invalid', message: 'A reply needs some text. Discard it instead to leave it out.' }
      ],
      [
        'pitch-01',
        { draft: 'x'.repeat(5001) },
        400,
        { code: 'invalid', message: 'A reply is at most 5,000 characters. Shorten it.' }
      ],
      ['pitch-01', {}, 400, { code: 'invalid', message: expect.stringContaining('draft') }],
      [
        'pitch-09',
        { draft: 'Yes.' },
        404,
        { code: 'not_found', message: "There's no drafted reply to pitch-09. Reload to see the latest." }
      ]
    ] as const)
      expect(await refused(await change(call, network, run.id, pitch, body))).toEqual([status, error])
    expect(await refused(await discard(call, network, 'run-0', 'pitch-01'))).toEqual([
      404,
      { code: 'not_found', message: "There's no pitch run run-0." }
    ])
    // Nothing changed.
    expect((await runRead(call, network, run.id)).replies!.map((r) => r.status)).toEqual(['draft', 'draft', 'draft'])
  })

  it('are refused while the run is still drafting, and once a later run or load replaced them', async () => {
    const { network, call, run } = await drafted([rank, draft, ask])
    expect(run.status).toBe('waiting')
    const drafting = {
      code: 'conflict',
      message: 'The agent is still drafting replies. Approve, edit, or discard them once the run has ended.'
    }
    expect(await refused(await change(call, network, run.id, 'pitch-01', { draft: 'Yes.' }))).toEqual([409, drafting])
    expect(await refused(await discard(call, network, run.id, 'pitch-01'))).toEqual([409, drafting])

    reader()
    await loadInbox(call, network, mbox, 'application/mbox', '?replace=true')
    await inboxRead(call, network)
    const replaced = {
      code: 'conflict',
      message: "That pitch run's replies were replaced by a later run or a new inbox. Edit the latest run's replies."
    }
    expect(await refused(await change(call, network, run.id, 'pitch-01', { draft: 'Yes.' }))).toEqual([409, replaced])
    expect(await refused(await discard(call, network, run.id, 'pitch-01'))).toEqual([409, replaced])
    // The load ended it unanswered, and it still reads as it ended.
    expect(await runRead(call, network, run.id)).toMatchObject({
      status: 'failed',
      error: 'Left unanswered: a new inbox was loaded instead.',
      question: { kind: 'choice' },
      replies: [{ pitch: 'pitch-01', status: 'draft' }, {}, {}]
    })
  })
})
