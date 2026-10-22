import { env } from 'cloudflare:workers'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { State } from '../src/agent'
import { Workspace, type Session as Agent } from '../src/client/App'
import { InboxPage } from '../src/client/Inbox'
import type { Evidence } from '../src/evidence'
import {
  fakeClaude,
  fakeCompare,
  fakeInsights,
  fakeQloo,
  modelRequests,
  requests,
  text,
  toolUse,
  turn,
  type ModelRequest,
  type QlooEntity
} from './fake'
import { links, openSession, type Session } from './session'

// The pitch text an extraction request carries, so concurrent extractions can be answered in any order.
const pitchText = (request: ModelRequest): string =>
  request.messages
    .flatMap((m: { content: string | { type: string; text?: string }[] }) =>
      typeof m.content === 'string' ? [m.content] : m.content.map((b) => b.text ?? '')
    )
    .join('\n')

// A synthetic show and pitches of three types: made-up names, IDs, and scores.
const work = (entity_id: string, name: string, disambiguation: string): QlooEntity[] => [
  { entity_id, name, popularity: 0.5, disambiguation }
]
const search: Record<string, QlooEntity[]> = {
  'Night Shift Cinema': [{ entity_id: 'e-0001', name: 'Night Shift Cinema', popularity: 0.8 }],
  'Night Ferry': work('b-0001', 'Night Ferry', '2019, Ada Quill'),
  'Paper Moons': work('b-0002', 'Paper Moons', '2016, Rue Vance'),
  'Fen Light': work('b-0003', 'Fen Light', '2014, Oda Brink'),
  'Static Bloom': work('f-0001', 'Static Bloom', '2021'),
  'Low Tide': work('f-0002', 'Low Tide', '2018'),
  'Dead Air': work('t-0001', 'Dead Air', '2017')
}

// The guest names are the leak markers: none may reach Qloo or the agent's model calls.
const pitches = [
  {
    text: 'Ada Quill would love to talk about her novel Night Ferry.',
    guest: 'Ada Quill',
    title: 'Night Ferry',
    type: 'book'
  },
  { text: 'Rue Vance has a new edition of Paper Moons out.', guest: 'Rue Vance', title: 'Paper Moons', type: 'book' },
  { text: 'Oda Brink wrote Fen Light, a marsh mystery.', guest: 'Oda Brink', title: 'Fen Light', type: 'book' },
  {
    text: 'Ben Ochoa directed Static Bloom and loves your show.',
    guest: 'Ben Ochoa',
    title: 'Static Bloom',
    type: 'film'
  },
  { text: 'Cy Lund on making Low Tide on a shoestring.', guest: 'Cy Lund', title: 'Low Tide', type: 'film' },
  { text: 'Kit Arno created Dead Air, a radio-station sitcom.', guest: 'Kit Arno', title: 'Dead Air', type: 'tv_show' }
] as const
const noWork = 'Dot Pruitt ran a projection booth for thirty years. No book, just stories.'
const inboxText = [...pitches.map((p) => p.text), noWork].join('\n---\n')
const guests = [...pitches.map((p) => p.guest), 'Dot Pruitt']

// Made-up affinities in fit order. Books: Paper Moons top, Night Ferry middle, Fen Light bottom.
const scores: Record<string, { entity_id: string; name: string; affinity: number }[]> = {
  'urn:entity:book': [
    { entity_id: 'b-0002', name: 'Paper Moons', affinity: 0.7341 },
    { entity_id: 'b-0001', name: 'Night Ferry', affinity: 0.7127 },
    { entity_id: 'b-0003', name: 'Fen Light', affinity: 0.7013 }
  ],
  'urn:entity:movie': [
    { entity_id: 'f-0001', name: 'Static Bloom', affinity: 0.6883 },
    { entity_id: 'f-0002', name: 'Low Tide', affinity: 0.6719 }
  ],
  'urn:entity:tv_show': [{ entity_id: 't-0001', name: 'Dead Air', affinity: 0.6557 }]
}

// Shared tags in Qloo's order, with made-up scores unlike any other figure here.
const tag = (kind: string, name: string, score: number) => ({
  tag_id: `urn:tag:${kind}:${name.toLowerCase().replace(/ /g, '_')}`,
  name,
  score
})
const compare = {
  'b-0002': [tag('genre:media', 'Podcasts', 0.7319), tag('keyword:qloo', 'Film History', 0.7297)],
  'f-0001': [tag('keyword:qloo', 'Indie Film', 0.7286), tag('style:qloo', 'Conversational', 0.7264)],
  't-0001': [tag('keyword:qloo', 'Radio', 0.7253)]
}

const open: Session[] = []
const session = async () => {
  const s = await openSession()
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

const finished = (s: Session) => s.until((state: State) => state.run !== null && state.run.status !== 'running')

// A session with the show imported, the pitches loaded, and a pitch run against the show alone
// started and scripted through `script`.
async function startRun(script: Parameters<typeof fakeClaude>[0]) {
  fakeQloo({ search })
  fakeInsights((body) => scores[String(body['filter.type'])])
  fakeCompare(compare)
  fakeClaude(
    Array.from({ length: pitches.length + 1 }, () => (request: ModelRequest) => {
      const t = pitchText(request)
      const p = pitches.find((p) => t.includes(p.text))
      const answer = p
        ? { guest: p.guest, work: { title: p.title, type: p.type, year: null } }
        : { guest: 'Dot Pruitt', work: null }
      return turn(text(JSON.stringify(answer)))
    })
  )
  const s = await session()
  await s.importRoster('Night Shift Cinema')
  await s.call('loadInbox', { text: inboxText })
  await s.until((state) => state.inbox?.status === 'done')
  const extractions = modelRequests().length
  fakeClaude(script)
  await s.call('startPitches', { show: 'Night Shift Cinema', pastGuests: [] })
  return { s, agentRequests: () => modelRequests().slice(extractions) }
}

// The same, once the run has ended.
async function pitchRun(script: Parameters<typeof fakeClaude>[0]) {
  const started = await startRun(script)
  return { ...started, state: await finished(started.s) }
}

const rankPitches = toolUse('rank_pitches', {
  show_id: 'e-0001',
  past_guest_work_ids: [],
  pitch_ids: ['pitch-01', 'pitch-02', 'pitch-03', 'pitch-04', 'pitch-05', 'pitch-06']
})
const sharedTags = (anchor_ids: string[], candidate_ids: string[]) =>
  toolUse('shared_tags', { anchor_ids, candidate_ids })
type Draft = { pitch: string; verdict: string; angle: string | null; draft: string }
const draftReplies = (replies: Draft[]) => toolUse('draft_replies', { replies })

const replies: Draft[] = [
  { pitch: 'pitch-01', verdict: 'later', angle: null, draft: 'Thanks for thinking of us for Night Ferry.' },
  {
    pitch: 'pitch-02',
    verdict: 'book',
    angle: 'Paper Moons as a door into film history.',
    draft: "We'd love to book Paper Moons for Night Shift Cinema."
  },
  { pitch: 'pitch-03', verdict: 'decline', angle: null, draft: "Fen Light isn't the right fit for us." },
  {
    pitch: 'pitch-04',
    verdict: 'book',
    angle: 'Static Bloom and the indie film scene.',
    draft: "We'd love to book Static Bloom."
  },
  { pitch: 'pitch-05', verdict: 'later', angle: null, draft: "Let's revisit Low Tide later this season." },
  { pitch: 'pitch-06', verdict: 'book', angle: 'Dead Air and radio on screen.', draft: "Let's book Dead Air." },
  { pitch: 'pitch-07', verdict: 'decline', angle: null, draft: 'We book guests around a public work.' }
]

describe('drafting replies to pitches', () => {
  it('compares every top pitch with the show and stores a draft reply per pitch, its angle citing those tags', async () => {
    // The model leaves Dead Air, the TV list's top pitch, out of shared_tags; it's compared anyway.
    const { s, state } = await pitchRun([
      turn(rankPitches),
      turn(sharedTags(['e-0001'], ['pitch-02', 'pitch-04'])),
      turn(draftReplies(replies)),
      turn(text('Drafted.'))
    ])

    expect(state.run).toMatchObject({ status: 'completed', error: null })
    expect(state.run?.notes.map((n) => n.text)).toEqual([
      'Ranking 6 pitched works against Night Shift Cinema',
      'Finding the tags 3 top pitches share with Night Shift Cinema',
      'Drafting 7 replies'
    ])
    // One compare per top pitch's work, with the show alone on side a and IDs only.
    const compares = requests.filter((r) => r.url.pathname === '/v2/analysis/compare')
    expect(
      compares.map((r) => Object.fromEntries(r.url.searchParams)).toSorted((a, b) => (a.b < b.b ? -1 : 1))
    ).toEqual(
      ['b-0002', 'f-0001', 't-0001'].map((b) => ({
        'a.signal.interests.entities': 'e-0001',
        'b.signal.interests.entities': b,
        take: '50'
      }))
    )
    const evidence = await s.call<Evidence[]>('getEvidence')
    const compareOf = (entity: string) =>
      evidence.find((e) => e.endpoint === '/v2/analysis/compare' && e.params['b.signal.interests.entities'] === entity)!
        .call

    // Every pitch has a draft, in inbox order; an angle carries the tags its compare returned.
    expect(state.booking?.replies).toEqual([
      { ...replies[0], sharedTags: null, status: 'draft' },
      {
        ...replies[1],
        sharedTags: { call: compareOf('b-0002'), tags: ['Film History'], error: null },
        status: 'draft'
      },
      { ...replies[2], sharedTags: null, status: 'draft' },
      {
        ...replies[3],
        sharedTags: { call: compareOf('f-0001'), tags: ['Indie Film', 'Conversational'], error: null },
        status: 'draft'
      },
      { ...replies[4], sharedTags: null, status: 'draft' },
      { ...replies[5], sharedTags: { call: compareOf('t-0001'), tags: ['Radio'], error: null }, status: 'draft' },
      { ...replies[6], sharedTags: null, status: 'draft' }
    ])
    // The top pitches' rows in the lists show the same tags.
    const books = state.booking!.lists!.find((l) => l.type === 'book')!
    expect(books.rows.map((r) => [r.pitch, r.band, r.sharedTags?.tags ?? null])).toEqual([
      ['pitch-02', 'top', ['Film History']],
      ['pitch-01', 'middle', null],
      ['pitch-03', 'bottom', null]
    ])
  })

  it("gives the whole run's verdict counts in each draft_replies result, so the closing can quote them", async () => {
    // Two calls in one turn, as Haiku drafts 40 replies in two calls of 20.
    const { state, agentRequests } = await pitchRun([
      turn(rankPitches),
      turn(sharedTags(['e-0001'], ['pitch-02', 'pitch-04', 'pitch-06'])),
      turn(draftReplies(replies.slice(0, 3)), draftReplies(replies.slice(3))),
      turn(text('Drafted.'))
    ])
    expect(state.run?.notes.slice(-2).map((n) => n.text)).toEqual(['Drafting 3 replies', 'Drafting 4 replies'])

    const [first, second] = agentRequests()[3]
      .messages.at(-1)
      .content.map((r: { content: string }) => JSON.parse(r.content))
    expect(first).toMatchObject({
      stored: 3,
      verdictsSoFar: { book: 1, later: 1, decline: 1 },
      withoutReply: ['pitch-04', 'pitch-05', 'pitch-06', 'pitch-07']
    })
    expect(first.next).not.toContain('Every pitch')
    expect(second).toEqual({
      stored: 4,
      verdictsSoFar: { book: 3, later: 2, decline: 2 },
      withoutReply: [],
      next: "Every pitch has a draft reply: 3 book, 2 later, and 2 decline, counting every call. The booker approves, edits, or discards each reply in the UI. Now end the run in under 60 words: give these counts and cite the ranking calls. Don't list, name, or count the pitches that weren't scored or matched, since the lists name them, and never write a pitch ID or a tool's name."
    })
  })

  it('counts a redrafted reply once, with its new verdict', async () => {
    const { state, agentRequests } = await pitchRun([
      turn(rankPitches),
      turn(sharedTags(['e-0001'], ['pitch-02', 'pitch-04', 'pitch-06'])),
      turn(draftReplies(replies.slice(0, 3))),
      turn(draftReplies([{ ...replies[0], verdict: 'book' }, ...replies.slice(3)])),
      turn(text('Drafted.'))
    ])

    const [result] = agentRequests()[4].messages.at(-1).content
    expect(JSON.parse(result.content).verdictsSoFar).toEqual({ book: 4, later: 1, decline: 2 })
    // The log's figures add up to the 7 replies: 3, then 4 new and 1 replaced.
    expect(state.run?.notes.slice(-2).map((n) => n.text)).toEqual([
      'Drafting 3 replies',
      'Drafting 4 replies and redrafting 1'
    ])
    expect(state.booking?.replies?.filter((r) => r.verdict === 'book')).toHaveLength(4)
  })

  it('words a call that only replaces drafted replies as a redraft', async () => {
    // Two calls of 3 and 4, then a third that replaces one reply, as a live run did.
    const { state } = await pitchRun([
      turn(rankPitches),
      turn(sharedTags(['e-0001'], ['pitch-02', 'pitch-04', 'pitch-06'])),
      turn(draftReplies(replies.slice(0, 3)), draftReplies(replies.slice(3))),
      turn(draftReplies([{ ...replies[4], draft: "Let's talk about Low Tide next month." }])),
      turn(text('Drafted.'))
    ])

    expect(state.run?.notes.slice(-3).map((n) => n.text)).toEqual([
      'Drafting 3 replies',
      'Drafting 4 replies',
      'Redrafting 1 reply'
    ])
    expect(state.booking?.replies).toHaveLength(7)
  })

  it('refuses tags and replies before the ranking, tags for anything but the show and its top pitches, and ungrounded angles', async () => {
    const { state, agentRequests } = await pitchRun([
      turn(sharedTags(['e-0001'], ['pitch-02']), draftReplies(replies)),
      turn(rankPitches),
      turn(sharedTags(['e-0001', 'b-0001'], ['pitch-02']), sharedTags(['e-0001'], ['pitch-01'])),
      turn(
        draftReplies([
          replies[1],
          { pitch: 'pitch-99', verdict: 'book', angle: null, draft: 'Hello.' },
          replies[0],
          replies[0],
          { ...replies[2], draft: '  ' }
        ])
      ),
      turn(text('Stopped.'))
    ])

    const results = (n: number) => agentRequests()[n].messages.at(-1).content
    expect(results(1)).toMatchObject([
      { is_error: true, content: "The pitches aren't ranked yet. Call rank_pitches first." },
      { is_error: true, content: "The pitches aren't ranked yet. Call rank_pitches before drafting replies." }
    ])
    expect(results(3)).toMatchObject([
      {
        is_error: true,
        content: 'In a guest pitch run the show is the only anchor: e-0001. Call again with that as anchor_ids.'
      },
      {
        is_error: true,
        content:
          "pitch-01 isn't a top pitch. Call again with the IDs of the pitches in the top band of each rank_pitches list: pitch-02, pitch-04, pitch-06."
      }
    ])
    // Paper Moons has an angle but was never compared.
    expect(results(4)).toMatchObject([
      {
        is_error: true,
        content:
          "pitch-99 isn't a pitch in the inbox. pitch-01 has more than one reply; give each pitch one. The draft for pitch-03 is empty. pitch-02 has no shared tags from shared_tags to build an angle from, so give it a null angle. Nothing was stored. Fix the replies and call draft_replies again."
      }
    ])
    expect(requests.filter((r) => r.url.pathname === '/v2/analysis/compare')).toEqual([])
    expect(state.booking?.replies).toBeNull()
  })
})

const drafted = [
  turn(rankPitches),
  turn(sharedTags(['e-0001'], ['pitch-02', 'pitch-04', 'pitch-06'])),
  turn(draftReplies(replies)),
  turn(text('Drafted.'))
]
const statuses = (state: State) => state.booking!.replies!.map((r) => [r.pitch, r.status])

describe('the booker clearing the inbox', () => {
  it('approves one reply and leaves the rest as drafts', async () => {
    const { s } = await pitchRun(drafted)

    await s.call('approveReply', 'pitch-02')
    expect(statuses(s.state()!)).toEqual([
      ['pitch-01', 'draft'],
      ['pitch-02', 'approved'],
      ['pitch-03', 'draft'],
      ['pitch-04', 'draft'],
      ['pitch-05', 'draft'],
      ['pitch-06', 'draft'],
      ['pitch-07', 'draft']
    ])
  })

  it('enables Copy on a reply only once it is approved, and drops it from a discarded one', async () => {
    const { s } = await pitchRun(drafted)
    // The inbox page as the browser renders it from synced state.
    const page = () => {
      const state = s.state()!
      const noop = async () => {}
      return renderToStaticMarkup(
        createElement(InboxPage, {
          inbox: state.inbox,
          roster: state.roster,
          booking: state.booking,
          pitchRunStatus: null,
          question: null,
          runLog: null,
          slowCalls: [],
          loadInbox: noop,
          confirmWork: noop,
          startPitches: noop,
          editReply: noop,
          approveReply: noop,
          discardReply: noop,
          openCall: () => {},
          opened: null,
          links
        })
      )
    }
    // Each reply's Copy button: 'enabled', 'disabled', or null when it has none.
    const copy = (html: string, pitch: string) => {
      const reply = html.split(`data-pitch="${pitch}"`)[1]?.split('</li>')[0] ?? ''
      const button = reply.match(/<button[^>]*>Copy<\/button>/)?.[0]
      return button ? (button.includes('disabled') ? 'disabled' : 'enabled') : null
    }
    const pitchIds = replies.map((r) => r.pitch)

    expect(pitchIds.map((p) => copy(page(), p))).toEqual(pitchIds.map(() => 'disabled'))
    await s.call('approveReply', 'pitch-02')
    await s.call('discardReply', 'pitch-03')
    const html = page()
    expect(pitchIds.map((p) => [p, copy(html, p)])).toEqual([
      ['pitch-01', 'disabled'],
      ['pitch-02', 'enabled'],
      ['pitch-03', null],
      ['pitch-04', 'disabled'],
      ['pitch-05', 'disabled'],
      ['pitch-06', 'disabled'],
      ['pitch-07', 'disabled']
    ])
    // The angle is shown with the tags it's built from and the compare that returned them.
    const reply = html.split('data-pitch="pitch-02"')[1].split('</li>')[0]
    expect(reply).toContain(replies[1].angle)
    expect(reply).toContain('Film History')
    expect(reply).toContain(s.state()!.booking!.replies![1].sharedTags!.call)
  })

  it('keeps edits and discards across a reload, and returns an edited approved reply to draft', async () => {
    const { s } = await pitchRun(drafted)

    await s.call('approveReply', 'pitch-04')
    await s.call('editReply', 'pitch-04', '  Static Bloom is a yes from us. Which dates suit?  ')
    await s.call('discardReply', 'pitch-03')
    const again = await openSession(s.cookie)
    open.push(again)
    const reloaded = again.state()!.booking!.replies!
    expect(reloaded.find((r) => r.pitch === 'pitch-04')).toMatchObject({
      draft: 'Static Bloom is a yes from us. Which dates suit?',
      status: 'draft',
      verdict: 'book',
      angle: replies[3].angle
    })
    expect(reloaded.find((r) => r.pitch === 'pitch-03')?.status).toBe('discarded')
    await expect(again.call('approveReply', 'pitch-03')).rejects.toThrow(
      'That reply was discarded. Restore it before approving it.'
    )
    // Restoring a discarded reply makes it a draft again.
    await again.call('editReply', 'pitch-03', replies[2].draft)
    expect(again.state()!.booking!.replies![2]).toMatchObject({ draft: replies[2].draft, status: 'draft' })
    await expect(again.call('editReply', 'pitch-01', ' ')).rejects.toThrow(
      'A reply needs some text. Discard it instead to leave it out.'
    )
    await expect(again.call('approveReply', 'pitch-42')).rejects.toThrow("There's no drafted reply to pitch-42.")
  })

  it('refuses to approve, edit, or discard while the run is still going', async () => {
    const closing = Promise.withResolvers<void>()
    const held = [
      ...drafted.slice(0, 3),
      async () => {
        await closing.promise
        return turn(text('Drafted.'))
      }
    ]
    const { s } = await startRun(held)
    await s.until((state) => state.booking?.replies?.length === 7)

    const busy = 'The agent is still drafting replies. Approve, edit, or discard them once the run has ended.'
    await expect(s.call('approveReply', 'pitch-02')).rejects.toThrow(busy)
    await expect(s.call('editReply', 'pitch-02', 'Yes.')).rejects.toThrow(busy)
    await expect(s.call('discardReply', 'pitch-02')).rejects.toThrow(busy)
    closing.resolve()
    await finished(s)
    await s.call('approveReply', 'pitch-02')
    expect(s.state()!.booking!.replies![1].status).toBe('approved')
  })

  it('asks its question before the lists and locks the replies while the run waits on it', async () => {
    const ask = toolUse('ask_human', {
      question: 'Hold the film pitches for next season?',
      kind: 'choice',
      options: ['Yes', 'No']
    })
    const { s } = await startRun([...drafted.slice(0, 3), turn(ask)])
    const state = await s.until((state) => state.run?.status === 'waiting')
    // The inbox page as the browser renders it from synced state.
    const html = renderToStaticMarkup(
      createElement(Workspace, { page: 'inbox', agent: { state, stub: {} } as unknown as Agent, links })
    )

    // Before the lists, so a single column reaches it first.
    expect(html.indexOf('Hold the film pitches for next season?')).toBeGreaterThan(-1)
    expect(html.indexOf('Hold the film pitches for next season?')).toBeLessThan(html.indexOf('id="lists-h"'))
    // A reply's action buttons, by name, and whether they're disabled.
    const actions = html.split('data-pitch="pitch-02"')[1].split('</li>')[0].split('class="acts"')[1]
    const buttons = [...actions.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)].map(([, attrs, name]) => [
      name,
      attrs.includes('disabled')
    ])
    expect(buttons).toEqual([
      ['Approve', true],
      ['Copy', true],
      ['Edit', true],
      ['Discard', true]
    ])
    await expect(s.call('approveReply', 'pitch-02')).rejects.toThrow('The agent is still drafting replies.')
  })

  it('refuses every reply action with GUEST_PITCHES off', async () => {
    const { s } = await pitchRun(drafted)
    env.GUEST_PITCHES = 'off'
    for (const [action, ...args] of [
      ['approveReply', 'pitch-02'],
      ['editReply', 'pitch-02', 'Yes.'],
      ['discardReply', 'pitch-02']
    ])
      await expect(s.call(action, ...args)).rejects.toThrow("Guest pitches aren't switched on.")
  })

  it('gives the model no tool that approves, edits, discards, or sends a reply', async () => {
    const { agentRequests } = await pitchRun(drafted)

    const names: string[] = agentRequests()[0].tools.map((t: { name: string }) => t.name)
    expect(names).toContain('draft_replies')
    expect(names.filter((n) => /approve|edit|discard|send|copy|email/i.test(n))).toEqual([])
  })

  it("lists the pitches that can't be ranked in the run's first message, with why, so each gets a reply", async () => {
    const { agentRequests } = await pitchRun(drafted)

    const first: string = agentRequests()[0].messages[0].content
    expect(first).toContain(
      "The other pitches, which can't be ranked, as pitch ID: work, and why:\n- pitch-07: no public work, so it was set aside and never sent to Qloo"
    )
    expect(first).toContain('Reply to every pitch listed here.')
  })

  it("never sends a guest's name to Qloo or to the agent's model calls", async () => {
    const { agentRequests } = await pitchRun(drafted)

    const qloo = requests
      .filter((r) => r.url.origin === new URL(env.QLOO_BASE_URL).origin)
      .map((r) => [...r.url.searchParams.values(), r.body].join('\n'))
    const agent = agentRequests().map((r) => JSON.stringify(r))
    for (const guest of guests) {
      expect(
        qloo.filter((r) => r.includes(guest)),
        guest
      ).toEqual([])
      expect(
        agent.filter((r) => r.includes(guest)),
        guest
      ).toEqual([])
    }
  })
})

// The closing line is Claude's words as the run completed, and it gives the replies' verdict counts;
// replies changed since then say so, and the closing line stays as Claude wrote it (#213).
describe('a closing line the replies have changed since', () => {
  it("flags the replies once an edit changes a reply's words, but not for the same words or an approval", async () => {
    const { s, state } = await pitchRun(drafted)
    const run = state.run!.id
    expect(state.run?.closing).toBe('Drafted.')
    expect(state.booking?.repliesEdited).toBeFalsy()

    // The same words, with spaces round them, and an approved reply saved again as it was.
    await s.call('editReply', 'pitch-02', `  ${replies[1].draft} `)
    await s.call('approveReply', 'pitch-04')
    await s.call('editReply', 'pitch-04', replies[3].draft)
    expect(statuses(s.state()!).slice(1, 4)).toEqual([
      ['pitch-02', 'draft'],
      ['pitch-03', 'draft'],
      ['pitch-04', 'draft']
    ])
    expect(s.state()?.booking?.repliesEdited).toBeFalsy()

    await s.call('editReply', 'pitch-01', 'Night Ferry is a yes for spring.')
    await s.call('approveReply', 'pitch-01')
    expect(s.state()?.booking?.replies?.[0].status).toBe('approved')
    expect(s.state()?.booking?.repliesEdited).toBe(true)
    expect(s.state()?.run?.closing).toBe('Drafted.')
    // What the run ended with keeps both, to read it once a new inbox replaces its replies.
    const ended = await s.call<State>('getRun', run)
    expect(ended).toMatchObject({ run: { closing: 'Drafted.' }, booking: { repliesEdited: true } })
    expect(ended.booking?.replies?.[0].draft).toBe('Night Ferry is a yes for spring.')
  })

  it('flags the replies once one is discarded', async () => {
    const { s } = await pitchRun(drafted)

    await s.call('discardReply', 'pitch-03')
    expect(s.state()?.booking?.repliesEdited).toBe(true)
    expect(s.state()?.run?.closing).toBe('Drafted.')
  })

  it("notes under the closing line, in code's words, that the replies have changed since Claude drafted them", async () => {
    const { s, state } = await pitchRun(drafted)
    // The inbox rail's Run module as the browser renders it.
    const runModule = (state: State) =>
      renderToStaticMarkup(
        createElement(Workspace, { page: 'inbox', agent: { state, stub: {} } as unknown as Agent, links })
      ).match(/<section class="mod" aria-labelledby="run-log">[\s\S]*?<\/section>/)![0]
    const note = 'The replies have changed since Claude drafted them: each reply as listed is the current one.'
    expect(runModule(state)).toContain('Drafted.')
    expect(runModule(state)).not.toContain(note)

    await s.call('discardReply', 'pitch-03')
    expect(runModule(s.state()!)).toMatch(new RegExp(`Drafted\\.</p><p[^>]*>${note}</p>`))
  })
})
