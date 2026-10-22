// The MCP server at /mcp, driven as an assistant's client drives it: JSON-RPC over Streamable HTTP
// with one of the network's API keys, listing the tools, then calling them to plan a launch to a draft
// order and to rank a day's pitches, relaying each of the agent's questions with the human's answer.
import { env, exports } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  fakeClaude,
  fakeInsights,
  fakeQloo,
  fakeReader,
  modelRequests,
  qlooRequests,
  text,
  toolUse,
  turn,
  type Extracted
} from './fake'
import { networkWithKey, untilRefused } from './session'

const origin = 'https://crossfeed.test'

// What a tool call gives the assistant: concise text, the operation's result as structured content,
// and whether it was refused.
type Called<T> = { text: string; structured: T; isError: boolean }

type Tool = {
  name: string
  description: string
  inputSchema: { properties?: Record<string, unknown> }
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean }
}

// An assistant's MCP client, as `claude mcp add --transport http … --header "Authorization: Bearer …"`
// connects one: each JSON-RPC request a POST to /mcp, answered as JSON or as a server-sent event.
function assistant(secret: string | null, headers: Record<string, string> = {}) {
  let id = 0
  const post = (method: string, params: object = {}) =>
    exports.default.fetch(`${origin}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...(secret && { Authorization: `Bearer ${secret}` }),
        ...headers
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params })
    })
  // The result of one request, or its JSON-RPC error.
  const rpc = async <T>(method: string, params?: object): Promise<T> => {
    const res = await post(method, params)
    if (res.status !== 200) throw new Error(`${method} answered ${res.status}: ${await res.text()}`)
    const body = await res.text()
    const message = JSON.parse(
      res.headers.get('Content-Type')?.includes('text/event-stream')
        ? body
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5))
            .join('')
        : body
    )
    if (message.error) throw new Error(`${method}: ${JSON.stringify(message.error)}`)
    return message.result
  }
  const call = async <T = any>(name: string, args: object = {}): Promise<Called<T>> => {
    const result = await rpc<{ content: { type: string; text: string }[]; structuredContent: T; isError?: boolean }>(
      'tools/call',
      { name, arguments: args }
    )
    return {
      text: result.content.map((c) => c.text).join('\n'),
      structured: result.structuredContent,
      isError: result.isError ?? false
    }
  }
  return {
    post,
    call,
    // Calls a read tool until its structured result passes `ready`, as an assistant polls long work.
    until: async <T = any>(name: string, args: object, ready: (result: T) => boolean) => {
      for (;;) {
        const read = await call<T>(name, args)
        if (read.isError) throw new Error(`${name}: ${read.text}`)
        if (ready(read.structured)) return read
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
    },
    initialize: () =>
      rpc<{ serverInfo: { name: string }; instructions?: string }>('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test-assistant', version: '1.0.0' }
      }),
    tools: async () => (await rpc<{ tools: Tool[] }>('tools/list')).tools
  }
}

// Every tool, in the order the server lists them; the inbox's only while guest pitches are on.
const LAUNCH_TOOLS = [
  'get_network',
  'get_roster',
  'import_roster',
  'update_show',
  'search_comps',
  'list_launches',
  'create_launch',
  'start_launch_run',
  'get_launch',
  'answer_launch_question',
  'edit_order',
  'get_evidence'
]
const PITCH_TOOLS = [
  'get_inbox',
  'load_pitches',
  'confirm_work',
  'start_pitch_run',
  'list_pitch_runs',
  'get_pitch_run',
  'answer_pitch_question'
]

describe('the MCP server', () => {
  afterEach(() => {
    env.GUEST_PITCHES = 'off'
  })

  it('lists its tools for an API key, and answers 401 without one or with one it does not know', async () => {
    const { network, secret } = await networkWithKey()
    const client = assistant(secret)
    const { serverInfo, instructions } = await client.initialize()
    expect(serverInfo.name).toBe('crossfeed')
    expect(instructions).toContain(
      "Nothing here approves an insertion order: a member of the network approves it in the app on its launch's page, which get_launch links."
    )
    expect((await client.tools()).map((t) => t.name)).toEqual(LAUNCH_TOOLS)
    env.GUEST_PITCHES = 'on'
    expect((await client.initialize()).instructions).toContain(
      `Nothing here approves an insertion order or a reply: a member of the network approves an order in the app on its launch's page, which get_launch links, and a reply on the inbox page, at ${origin}/app/${network}/inbox.`
    )
    expect((await client.tools()).map((t) => t.name)).toEqual([...LAUNCH_TOOLS, ...PITCH_TOOLS])

    for (const key of [null, 'cf_live_unknown']) {
      const res = await assistant(key).post('tools/list')
      expect(res.status, String(key)).toBe(401)
      expect((await res.json<{ error: { code: string } }>()).error.code).toBe('unauthorized')
    }
  })

  it('has no tool that approves, says where a member does, and tells the assistant to relay every question', async () => {
    env.GUEST_PITCHES = 'on'
    const { network, secret } = await networkWithKey()
    const tools = await assistant(secret).tools()
    const described = (name: string) => tools.find((t) => t.name === name)!.description
    for (const name of ['start_launch_run', 'get_launch', 'edit_order'])
      expect(described(name), name).toContain(
        `Only a member of the network approves an insertion order, in the app on its launch's page, ${origin}/app/${network}/launches/<launchId>.`
      )
    for (const name of ['start_pitch_run', 'get_pitch_run'])
      expect(described(name), name).toContain(
        `Only a member of the network approves a reply, in the app on the inbox page, ${origin}/app/${network}/inbox.`
      )
    for (const tool of tools) {
      expect(tool.name).not.toMatch(/approv/)
      expect(tool.description, tool.name).toContain(
        'When a run is waiting on a question, ask the human that question as it is and answer with their words; never answer it yourself.'
      )
      expect(typeof tool.annotations?.readOnlyHint, tool.name).toBe('boolean')
      expect(typeof tool.annotations?.destructiveHint, tool.name).toBe('boolean')
    }
    const reads = tools.filter((t) => t.annotations!.readOnlyHint).map((t) => t.name)
    expect(reads).toEqual([
      'get_network',
      'get_roster',
      'list_launches',
      'get_launch',
      'get_evidence',
      'get_inbox',
      'list_pitch_runs',
      'get_pitch_run'
    ])
  })

  it("reaches only its key's network: another network's launch is no such launch, as any refusal says why", async () => {
    const theirs = await networkWithKey()
    const created = await theirs.call(`/api/v1/networks/${theirs.network}/launches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Night Shift Cinema' })
    })
    const { id: launchId } = await created.json<{ id: string }>()
    expect((await assistant(theirs.secret).call('get_launch', { launchId })).isError).toBe(false)

    const ours = assistant((await networkWithKey()).secret)
    const unreachable = "There's no such launch in this network."
    for (const [name, args] of [
      ['get_launch', { launchId }],
      ['start_launch_run', { launchId }],
      ['get_evidence', { launchId }]
    ] as const)
      expect(await ours.call(name, args), name).toEqual({
        text: unreachable,
        structured: { error: { code: 'not_found', message: unreachable } },
        isError: true
      })
    expect(
      (await ours.call('create_launch', { name: 'Night Shift Cinema', comps: ['Corner Booth'] })).structured
    ).toEqual({
      error: { code: 'invalid', message: 'Name the launch or give its comps, not both.' }
    })

    // Past the network's launch cap, a new launch is refused with why and what to do.
    const saved = env.LAUNCHES_PER_NETWORK
    env.LAUNCHES_PER_NETWORK = '1'
    try {
      expect((await ours.call('create_launch', { name: 'Night Shift Cinema' })).isError).toBe(false)
      expect((await ours.call('create_launch', { name: 'Corner Booth' })).structured).toEqual({
        error: {
          code: 'limit',
          message:
            'A network keeps at most 1 launch at once. Delete one it no longer needs, on the dashboard, to plan another.'
        }
      })
    } finally {
      env.LAUNCHES_PER_NETWORK = saved
    }
  })

  it("serves a browser on the app's own origin, on a custom domain too, and refuses one from another site", async () => {
    const { secret } = await networkWithKey()
    expect((await assistant(secret, { Origin: origin }).post('tools/list')).status).toBe(200)
    expect((await assistant(secret, { Origin: 'http://localhost:6274' }).post('tools/list')).status).toBe(200)
    expect((await assistant(secret, { Origin: 'https://elsewhere.example' }).post('tools/list')).status).toBe(403)
  })

  it("answers 404 while ACCOUNTS is off, and 429 past its key's requests a minute, as the REST API does", async () => {
    const { secret } = await networkWithKey()
    const client = assistant(secret)
    env.ACCOUNTS = 'off'
    try {
      expect((await client.post('tools/list')).status).toBe(404)
    } finally {
      env.ACCOUNTS = 'on'
    }
    // 120 requests a minute per key, as wrangler.jsonc's API_LIMITER allows.
    const { res } = await untilRefused(() => client.post('tools/list'), 120)
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('60')
    expect(await res.json()).toEqual({
      error: {
        code: 'rate_limited',
        message: 'This API key made too many requests in the last minute. Wait a minute, then try again.'
      }
    })
  })
})

// A made-up roster: Field Notes is ambiguous until settled, and Ghost Signal isn't in Qloo until mapped
// to a comp. Night Shift Cinema, the launch, isn't on it.
const show = (entity_id: string, name: string) => [{ entity_id, name, popularity: 0.6 }]
const search = {
  'Night Shift Cinema': show('e-0001', 'Night Shift Cinema'),
  'Corner Booth': show('e-0501', 'Corner Booth'),
  'Slow Burn': show('e-0502', 'Slow Burn'),
  'Field Notes': [
    { entity_id: 'e-0101', name: 'Field Notes: Film', popularity: 0.6 },
    { entity_id: 'e-0102', name: 'Field Notes: Books', popularity: 0.3 }
  ],
  'Ghost Signal': [],
  'Ghost Signal Radio': show('e-0601', 'Ghost Signal Radio')
}
const csv = 'name,downloads\nCorner Booth,48000\nSlow Burn,40000\nField Notes,17500\nGhost Signal,9000\n'
// Made-up scores in fit order, unlike any other figure here.
const fit = [
  { entity_id: 'e-0501', name: 'Corner Booth', affinity: 0.913 },
  { entity_id: 'e-0502', name: 'Slow Burn', affinity: 0.902 },
  { entity_id: 'e-0102', name: 'Field Notes: Books', affinity: 0.871 },
  { entity_id: 'e-0601', name: 'Ghost Signal Radio', affinity: 0.866 }
]
const finalists = fit.map((r) => r.entity_id)

describe('planning a launch through the MCP server', () => {
  it('sets up the roster, relays each question for the human to answer, and reads the draft order', async () => {
    fakeQloo({ search })
    fakeInsights((body) => fit.filter((r) => String(body['filter.results.entities']).split(',').includes(r.entity_id)))
    const { network, secret, call: rest } = await networkWithKey()
    const client = assistant(secret)
    const settled = () => client.until<{ status: string }>('get_roster', {}, (r) => r.status === 'settled')

    // The roster, imported and settled with the tools.
    const imported = await client.call('import_roster', { roster: csv, format: 'csv' })
    expect(imported.isError).toBe(false)
    expect(imported.structured.status).toBe('pending')
    expect((await settled()).text).toContain(
      'Field Notes: ambiguous among e-0101 Field Notes: Film, e-0102 Field Notes: Books. Pick one with update_show and entityId.'
    )
    expect((await client.call('update_show', { name: 'Field Notes', entityId: 'e-0102' })).structured).toMatchObject({
      resolution: 'resolved',
      entity: { id: 'e-0102' }
    })
    await client.call('search_comps', { name: 'Ghost Signal', query: 'Ghost Signal Radio' })
    expect((await settled()).text).toContain(
      'Ghost Signal: no match in Qloo. Its comp search for "Ghost Signal Radio" found e-0601 Ghost Signal Radio: map it to one with update_show and compId.'
    )
    await client.call('update_show', { name: 'Ghost Signal', compId: 'e-0601' })
    // The CPM is the owner's, set in settings or the REST API, not through MCP.
    await rest(`/api/v1/networks/${network}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpm: 25 })
    })

    fakeClaude([
      turn(toolUse('resolve_entities', { names: ['Night Shift Cinema'], type: 'urn:entity:podcast' })),
      turn(
        toolUse('rank_candidates', { anchor_ids: ['e-0001'], candidate_ids: finalists, type: 'urn:entity:podcast' })
      ),
      turn(toolUse('ask_human', { question: 'What is the slot budget?', kind: 'budget', options: [] })),
      turn(toolUse('ask_human', { question: 'Leave any shows out?', kind: 'exclusions', options: [] })),
      turn(
        toolUse('draft_insertion_order', {
          lines: [
            { show: 'Corner Booth', slots: 8, angle: 'Late-night regulars stay up for the call-ins.' },
            { show: 'Slow Burn', slots: 6, angle: 'Its long interviews share the slow pace.' },
            { show: 'Field Notes', slots: 2, angle: 'Shares the field-recording style.' }
          ]
        })
      ),
      turn(text('Drafted the insertion order.'))
    ])
    const created = await client.call('create_launch', { name: 'Night Shift Cinema' })
    expect(created.structured).toMatchObject({ name: 'Night Shift Cinema', status: 'new', latestRun: null })
    const launchId = created.structured.id
    const page = `${origin}/app/${network}/launches/${launchId}`
    expect(created.text).toContain(page)

    const started = await client.call('start_launch_run', { launchId })
    // The run names the assistant's API key as its starter, as the launch page's run list shows.
    expect(started.structured).toMatchObject({ status: 'running', startedBy: 'API key “Nightly sync”' })
    const runId = started.structured.id
    const read = (ready: (launch: any) => boolean) => client.until('get_launch', { launchId }, ready)

    // Each question reaches the assistant to relay as it is, with how to answer it.
    const budget = await read((l) => l.latestRun.status === 'waiting')
    const budgetId = budget.structured.latestRun.question.id
    // Claude Code reads only the structured content, so it carries the text too.
    expect(budget.structured.summary).toBe(budget.text)
    expect(budget.text).toContain(
      [
        `Run ${runId} is waiting on a question for the human (budget): What is the slot budget?`,
        `Ask the human this question as it is, and answer with their words: call answer_launch_question with launchId "${launchId}", runId "${runId}", questionId "${budgetId}", and their answer as \`slots\` (promo slots) or \`dollars\`. Never answer it yourself.`
      ].join('\n')
    )
    expect(
      (await client.call('answer_launch_question', { launchId, runId, questionId: budgetId, slots: 16 })).isError
    ).toBe(false)

    const exclusions = await read((l) => l.latestRun.question?.kind === 'exclusions')
    expect(exclusions.text).toContain(
      'as `exclude`, the shows to leave out, from: "Corner Booth", "Slow Burn", "Field Notes", "Ghost Signal"; [] for none.'
    )
    const exclusionsId = exclusions.structured.latestRun.question.id
    await client.call('answer_launch_question', { launchId, runId, questionId: exclusionsId, exclude: [] })

    // The draft order, priced at the $25 CPM, and where a member approves it.
    const drafted = await read((l) => l.latestRun.status === 'completed' && l.latestRun.topic?.status !== 'ranking')
    expect(drafted.structured).toMatchObject({
      status: 'order_drafted',
      latestRun: { insertionOrder: { total: 16_476 } }
    })
    expect(drafted.text).toBe(
      [
        `Night Shift Cinema: order_drafted. Its page in the app: ${page}`,
        `Run ${runId}: completed. It ended saying: Drafted the insertion order.`,
        "Chart, by fit with the launch's listeners in Qloo:",
        '1. Corner Booth: top, finalist, topic rank 1',
        '2. Slow Burn: top, finalist, topic rank 2',
        '3. Field Notes: middle, finalist, topic rank 3',
        '4. Ghost Signal: bottom, finalist, topic rank 4',
        'Insertion order IO-0001, draft, as it stands: 16 slots, $16,476 at a $25 CPM.',
        '- Corner Booth: 8 slots at $1,200, $9,600. Late-night regulars stay up for the call-ins.',
        '- Slow Burn: 6 slots at $1,000, $6,000. Its long interviews share the slow pace.',
        '- Field Notes: 2 slots at $438, $876. Shares the field-recording style.',
        `Change its lines with edit_order. Only a member of the network approves it, in the app: ${page}`
      ].join('\n')
    )
    // The answers reached the agent as the human's own words.
    expect(JSON.stringify(modelRequests().at(-3)!.messages.at(-1))).toContain('Slot budget: 16 promo slots.')

    const edited = await client.call('edit_order', {
      launchId,
      orderId: 'IO-0001',
      lines: [{ show: 'Corner Booth', slots: 10, angle: 'Late-night regulars stay up for the call-ins.' }]
    })
    expect(edited.structured).toMatchObject({ status: 'draft', slots: 10, total: 12_000 })
    // The closing line stays as Claude wrote it, and says the order has changed since (#202).
    const after = await client.call('get_launch', { launchId })
    expect(after.structured.latestRun).toMatchObject({
      closing: 'Drafted the insertion order.',
      insertionOrder: { total: 12_000, edited: true }
    })
    expect(after.text).toContain(
      `Run ${runId}: completed. It ended saying: Drafted the insertion order. Its insertion order has been edited since, so take its figures from the order, not from this line.\n`
    )
    expect(drafted.structured.latestRun.insertionOrder.edited).toBe(false)
    // Nor can an edit approve it.
    const approving = await client.call('edit_order', {
      launchId,
      orderId: 'IO-0001',
      lines: edited.structured.lines,
      status: 'approved'
    })
    expect(approving.isError).toBe(true)
    expect(approving.text).toContain(
      "Only an order's lines change through the API. A member approves an insertion order, in the app."
    )
    expect(edited.text).toContain(`Only a member of the network approves it, in the app: ${page}`)

    const rankCall = drafted.structured.latestRun.chart.call
    const evidence = await client.call('get_evidence', { launchId, call: rankCall })
    expect(evidence.structured.evidence).toMatchObject([{ call: rankCall, endpoint: '/v2/insights' }])
  })
})

// A day's pitches as plain text, as an assistant pastes them, and how the model reads each.
const pitches = [
  "From: Pat Lindqvist <pat@example.com>\nSubject: Ada Quill on Night Ferry\n\nAda Quill's novel Night Ferry is about a projectionist on a car ferry.",
  'From: Rue Vance <rue@example.com>\nSubject: Paper Moons\n\nRue Vance has a new edition of Paper Moons out.',
  'From: Ben Ochoa <ben@example.com>\nSubject: Static Bloom\n\nBen Ochoa directed Static Bloom.'
].join('\n---\n')
const readings: Record<string, Extracted> = {
  'Night Ferry': { guest: 'Ada Quill', work: { title: 'Night Ferry', type: 'book', year: 2019 } },
  'Paper Moons': { guest: 'Rue Vance', work: { title: 'Paper Moons', type: 'book', year: 2016 } },
  'Static Bloom': { guest: 'Ben Ochoa', work: { title: 'Static Bloom', type: 'film', year: 2021 } }
}
const works = {
  'Night Shift Cinema': show('e-0001', 'Night Shift Cinema'),
  'Night Ferry': [{ entity_id: 'b-0001', name: 'Night Ferry', popularity: 0.81, disambiguation: '2019, Ada Quill' }],
  'Paper Moons': [{ entity_id: 'b-0002', name: 'Paper Moons', popularity: 0.5, disambiguation: '2016, Rue Vance' }],
  'Static Bloom': [
    { entity_id: 'f-0001', name: 'Static Bloom', popularity: 0.5, disambiguation: '2021' },
    { entity_id: 'f-0002', name: 'Static Bloom', popularity: 0.3, disambiguation: '2021' }
  ],
  'Talking with Ghosts': [
    { entity_id: 'b-0101', name: 'Talking with Ghosts', popularity: 0.4, disambiguation: '2022, Mo Reyes' }
  ]
}
// Made-up affinities in fit order for each list.
const scores: Record<string, { entity_id: string; name: string; affinity: number }[]> = {
  'urn:entity:book': [
    { entity_id: 'b-0002', name: 'Paper Moons', affinity: 0.7341 },
    { entity_id: 'b-0001', name: 'Night Ferry', affinity: 0.7127 }
  ],
  'urn:entity:movie': [{ entity_id: 'f-0002', name: 'Static Bloom', affinity: 0.6883 }]
}

describe('triaging pitches through the MCP server', () => {
  beforeEach(() => {
    env.GUEST_PITCHES = 'on'
  })
  afterEach(() => {
    env.GUEST_PITCHES = 'off'
  })

  it("loads the pitches, confirms a work, and relays the run's question before reading its replies", async () => {
    fakeQloo({ search: works })
    fakeInsights((body) => scores[String(body['filter.type'])])
    fakeReader(3, (pitch) => Object.entries(readings).find(([title]) => pitch.includes(title))![1])
    const { network, secret } = await networkWithKey()
    const client = assistant(secret)
    await client.call('import_roster', { roster: 'Night Shift Cinema', format: 'lines' })

    const loaded = await client.call('load_pitches', { text: pitches })
    expect(loaded.isError).toBe(false)
    expect(loaded.structured.status).toBe('reading')
    const inbox = await client.until<{ status: string }>('get_inbox', {}, (i) => i.status === 'done')
    expect(inbox.text).toContain(
      '- pitch-03 from Ben Ochoa <ben@example.com>, "Static Bloom": film Static Bloom (2021) by guest Ben Ochoa, ambiguous among f-0001 Static Bloom (2021); f-0002 Static Bloom (2021). Confirm one with confirm_work and entityId.'
    )
    const confirmed = await client.call('confirm_work', { pitchId: 'pitch-03', entityId: 'f-0002' })
    expect(confirmed.structured).toMatchObject({ match: { resolution: 'resolved', entity: { id: 'f-0002' } } })
    await client.until<{ status: string }>('get_roster', {}, (r) => r.status === 'settled')

    fakeClaude([
      turn(
        toolUse('rank_pitches', {
          show_id: 'e-0001',
          past_guest_work_ids: [],
          pitch_ids: ['pitch-01', 'pitch-02', 'pitch-03']
        })
      ),
      turn(
        toolUse('ask_human', {
          question: 'Hold the film pitches for next season?',
          kind: 'choice',
          options: ['Yes', 'No']
        })
      ),
      turn(
        toolUse('draft_replies', {
          replies: [
            { pitch: 'pitch-01', verdict: 'later', angle: null, draft: "Let's revisit Night Ferry in spring." },
            { pitch: 'pitch-02', verdict: 'book', angle: null, draft: 'Paper Moons would suit the show. More soon.' },
            { pitch: 'pitch-03', verdict: 'later', angle: null, draft: "We'll come back to Static Bloom next season." }
          ]
        })
      ),
      turn(text('Drafted 1 book and 2 later.'))
    ])
    const started = await client.call('start_pitch_run', {
      show: 'Night Shift Cinema',
      pastGuests: [{ guest: 'Mo Reyes', work: { title: 'Talking with Ghosts', type: 'book', year: 2022 } }]
    })
    expect(started.structured).toMatchObject({ status: 'running', show: 'Night Shift Cinema' })
    const runId = started.structured.id
    const read = (ready: (run: any) => boolean) => client.until('get_pitch_run', { runId }, ready)

    const waiting = await read((r) => r.status === 'waiting')
    const questionId = waiting.structured.question.id
    expect(waiting.structured.summary).toBe(waiting.text)
    expect(waiting.text).toContain(
      [
        `Pitch run ${runId} is waiting on a question for the human (choice): Hold the film pitches for next season?`,
        `Ask the human this question as it is, and answer with their words: call answer_pitch_question with runId "${runId}", questionId "${questionId}", and their answer as \`choice\`, one of: "Yes", "No"; or their own words as \`text\`. Never answer it yourself.`
      ].join('\n')
    )
    expect((await client.call('answer_pitch_question', { runId, questionId, choice: 'Yes' })).isError).toBe(false)

    const done = await read((r) => r.status === 'completed')
    expect(done.text).toContain(
      `Pitch run ${runId} for Night Shift Cinema: completed. It ended saying: Drafted 1 book and 2 later.`
    )
    expect(done.text).toContain('1. pitch-02 Paper Moons')
    expect(done.text).toContain(
      [
        "- pitch-01, later, draft: Let's revisit Night Ferry in spring.",
        '- pitch-02, book, draft: Paper Moons would suit the show. More soon.',
        "- pitch-03, later, draft: We'll come back to Static Bloom next season.",
        `Only a member of the network approves a reply, in the app: ${origin}/app/${network}/inbox`
      ].join('\n')
    )
    // A new session finds the latest run, and the replies it drafted, without its ID.
    const listed = await client.call('list_pitch_runs', {})
    expect(listed.structured.pitchRuns).toEqual([
      { id: runId, status: 'completed', show: 'Night Shift Cinema', startedAt: started.structured.startedAt }
    ])
    expect(listed.text).toBe(
      [
        `- Pitch run ${runId} for Night Shift Cinema, started ${started.structured.startedAt}: completed.`,
        'Newest first: the first is the latest. Read one, with the replies it drafted, with get_pitch_run.'
      ].join('\n')
    )
    // The answer reached the agent as the human's own words, and no sender or guest reached Qloo.
    expect(JSON.stringify(modelRequests().at(-2)!.messages.at(-1))).toContain('Yes')
    for (const detail of ['pat@example.com', 'rue@example.com', 'ben@example.com', 'ada quill', 'mo reyes'])
      expect(
        qlooRequests().filter((r) => r.includes(detail)),
        detail
      ).toEqual([])
  })

  it('loads JSON pitches too, and refuses both kinds at once, or loading over pitches without replace', async () => {
    fakeQloo({ search: works })
    fakeReader(2, (pitch) => Object.entries(readings).find(([title]) => pitch.includes(title))![1])
    const client = assistant((await networkWithKey()).secret)
    const json = [{ from: 'Pat Lindqvist <pat@example.com>', body: "Ada Quill's novel Night Ferry." }]

    expect(
      (await client.call('load_pitches', { text: 'Rue Vance on Paper Moons.', pitches: json })).structured
    ).toEqual({
      error: { code: 'invalid', message: 'Give the pitches as `text` or as `pitches`: one of the two.' }
    })
    expect((await client.call('load_pitches', { pitches: json })).isError).toBe(false)
    const inbox = await client.until<{ status: string }>('get_inbox', {}, (i) => i.status === 'done')
    expect(inbox.text).toContain(
      '- pitch-01 from Pat Lindqvist <pat@example.com>: book Night Ferry (2019) by guest Ada Quill, matched b-0001 Night Ferry (2019, Ada Quill).'
    )
    expect((await client.call('load_pitches', { text: 'Rue Vance on Paper Moons.' })).structured).toEqual({
      error: {
        code: 'conflict',
        message:
          "The inbox already has pitches. Load with replace=true to load over them: they go, with the last pitch run's lists and replies."
      }
    })
    expect((await client.call('load_pitches', { text: 'Rue Vance on Paper Moons.', replace: true })).isError).toBe(
      false
    )
    expect((await client.until('get_inbox', {}, (i: { status: string }) => i.status === 'done')).text).toContain(
      'pitch-01: book Paper Moons (2016) by guest Rue Vance'
    )
  })
})
