// The one test seam: outbound HTTP. MSW intercepts fetch inside the Workers runtime, where the
// Worker and its Durable Objects share the tests' isolate, so the fakes below see every request
// the gateway makes. Fixtures are hand-written with made-up IDs and scores, never Qloo data.
import { setupNetwork } from '@msw/cloudflare'
import { env } from 'cloudflare:workers'
import { delay, http, HttpResponse } from 'msw'

export const network = setupNetwork()

export type RecordedRequest = {
  method: string
  url: URL
  headers: Headers
  body: string
  at: number // Date.now() when it arrived
  inFlight: number // Qloo requests the fake was answering when it arrived, itself included
}

// Every request a fake served, in order. Cleared after each test by setup.ts.
export const requests: RecordedRequest[] = []

// Each request Qloo got, as Qloo reads it: its path, every decoded parameter, and its body, lowercased,
// to check what never reaches Qloo, such as a guest's name.
export const qlooRequests = () =>
  requests
    .filter((r) => r.url.origin === new URL(env.QLOO_BASE_URL).origin)
    .map((r) =>
      [r.url.pathname, ...[...r.url.searchParams].map(([k, v]) => `${k}=${v}`), r.body].join('\n').toLowerCase()
    )

let inFlight = 0

// Typed structurally, because MSW's DOM Request and the Workers Request types differ.
const record = async (request: {
  method: string
  url: string
  headers: Headers
  clone(): { text(): Promise<string> }
}) =>
  requests.push({
    method: request.method,
    url: new URL(request.url),
    headers: request.headers,
    body: await request.clone().text(),
    at: Date.now(),
    inFlight
  })

// `properties` stands in for the fields Qloo returns that the app doesn't use.
export type QlooEntity = {
  entity_id: string
  name: string
  popularity: number | null
  types?: string[]
  disambiguation?: string | null // a work's year, plus the author for a book
  properties?: Record<string, unknown>
}

// A response with a raw text body, such as an HTML error page from a proxy in front of Qloo.
export type RawResponse = { status: number; body: string }

// How the fake answers one search request: with results; with that HTTP status and an error body
// in Qloo's shape for it; with a `RawResponse` as written; or 'hang': never, until the caller gives up.
type Answer = QlooEntity[] | number | RawResponse | 'hang'

// Serves `/search` from `search`, keyed by the exact query string; a query with no fixture finds
// nothing. `first` scripts the answers to a query's first requests, in order, before `search`
// answers the rest. `latencyMs` delays every answer.
export function fakeQloo({
  search,
  first = {},
  latencyMs = 0
}: {
  search: Record<string, Answer>
  first?: Record<string, Answer[]>
  latencyMs?: number
}) {
  const asked = new Map<string, number>()
  network.use(
    http.get(`${env.QLOO_BASE_URL}/search`, async ({ request }) => {
      inFlight++
      try {
        await record(request)
        const url = new URL(request.url)
        const query = url.searchParams.get('query') ?? ''
        const n = asked.get(query) ?? 0
        asked.set(query, n + 1)
        const answer = first[query]?.[n] ?? search[query]
        if (latencyMs) await delay(latencyMs)
        if (answer === 'hang') {
          await new Promise((resolve) => request.signal.addEventListener('abort', resolve, { once: true }))
          return HttpResponse.error()
        }
        if (!answer) return HttpResponse.json({ results: [] })
        // Qloo's 429 body differs from its other errors.
        if (answer === 429) return HttpResponse.json({ error_msg: 'Rate limit exceeded' }, { status: 429 })
        if (typeof answer === 'number')
          return HttpResponse.json({ error: { message: 'fake failure', code: answer } }, { status: answer })
        if (!Array.isArray(answer)) return HttpResponse.text(answer.body, { status: answer.status })
        const take = Number(url.searchParams.get('take') ?? 20)
        const types = [url.searchParams.get('types') ?? 'urn:entity:podcast']
        return HttpResponse.json({ results: answer.slice(0, take).map((r) => ({ types, ...r })) })
      } finally {
        inFlight--
      }
    })
  )
}

// Answers every Qloo request, on any endpoint, with `status` and an error body in Qloo's shape, as
// when Qloo is down. Registered after other Qloo fakes, it overrides them.
export function fakeQlooDown(status = 503) {
  network.use(
    http.all(`${env.QLOO_BASE_URL}/*`, async ({ request }) => {
      await record(request)
      return HttpResponse.json({ error: { message: 'fake failure', code: status } }, { status })
    })
  )
}

// One result of a closed-list ranking. `explainability` lists each anchor's share; left out, the
// fake splits the score evenly across the request's anchors, and `null` leaves it off the result.
export type Insight = {
  entity_id: string
  name: string
  affinity: number | null
  explainability?: { entity_id: string; score: number }[] | null
}

// Serves `POST /v2/insights` from `answer`, given the request's flat dotted-key body: the results
// to return, or an HTTP status that answers with an error body in Qloo's shape. Demographics
// requests are left to `fakeDemographics`.
export function fakeInsights(answer: Insight[] | number | ((body: Record<string, unknown>) => Insight[] | number)) {
  network.use(
    http.post(`${env.QLOO_BASE_URL}/v2/insights`, async ({ request }) => {
      const body = JSON.parse(await request.clone().text())
      if (body['filter.type'] === 'urn:demographics') return
      await record(request)
      const results = typeof answer === 'function' ? answer(body) : answer
      if (typeof results === 'number')
        return HttpResponse.json({ error: { message: 'fake failure', code: results } }, { status: results })
      const anchors = String(body['signal.interests.entities'] ?? '').split(',')
      const entities = results.map(({ entity_id, name, affinity, explainability }) => {
        const shares = explainability ?? anchors.map((id) => ({ entity_id: id, score: 1 / anchors.length }))
        return {
          entity_id,
          name,
          types: null,
          popularity: 0.5,
          query: {
            affinity,
            measurements: { audience_growth: 0 },
            ...(explainability !== null && { explainability: { 'signal.interests.entities': shares } })
          }
        }
      })
      return HttpResponse.json({ success: true, results: { entities } })
    })
  )
}

// One tag a compare answer says both sides share, with its score.
export type SharedTag = { tag_id: string; name: string; score: number }

// Serves `GET /v2/analysis/compare` from `answer`, keyed by the side-b entity ID: the shared tags
// to return, in Qloo's order, or an HTTP status that answers with an error body in Qloo's shape. A
// side b with no entry shares no tags. `latencyMs` delays every answer.
export function fakeCompare(answer: Record<string, SharedTag[] | number>, { latencyMs = 0 } = {}) {
  network.use(
    http.get(`${env.QLOO_BASE_URL}/v2/analysis/compare`, async ({ request }) => {
      inFlight++
      try {
        await record(request)
        const b = new URL(request.url).searchParams.get('b.signal.interests.entities') ?? ''
        const tags = answer[b] ?? []
        if (latencyMs) await delay(latencyMs)
        if (typeof tags === 'number')
          return HttpResponse.json({ error: { message: 'fake failure', code: tags } }, { status: tags })
        // Each side's own tags (`a`, `b`) aren't used, so they stay empty here.
        return HttpResponse.json({
          duration: 0.4,
          results: {
            a: [],
            b: [],
            matchEntities: [],
            tags: tags.map(({ tag_id, name, score }) => ({
              tag_id,
              name,
              type: 'urn:tag',
              subtype: tag_id.split(':').slice(0, -1).join(':'),
              popularity: 0.9,
              query: { score }
            }))
          }
        })
      } finally {
        inFlight--
      }
    })
  )
}

// One entity's demographics, as Qloo returns them: each age bucket and gender relative to average.
export type Demographic = {
  entity_id: string
  age: Record<string, number>
  gender: { male: number; female: number }
}

// Serves `POST /v2/insights` with `filter.type=urn:demographics`: the entries of `answer` whose
// entity the request's signal names, in `answer`'s order rather than the request's, as Qloo does;
// or an HTTP status that answers with an error body in Qloo's shape. Other insights requests are
// left to `fakeInsights`.
export function fakeDemographics(answer: Demographic[] | number) {
  network.use(
    http.post(`${env.QLOO_BASE_URL}/v2/insights`, async ({ request }) => {
      const body = JSON.parse(await request.clone().text())
      if (body['filter.type'] !== 'urn:demographics') return
      await record(request)
      if (typeof answer === 'number')
        return HttpResponse.json({ error: { message: 'fake failure', code: answer } }, { status: answer })
      const ids = String(body['signal.interests.entities'] ?? '').split(',')
      const demographics = answer
        .filter((d) => ids.includes(d.entity_id))
        .map(({ entity_id, age, gender }) => ({ entity_id, query: { age, gender } }))
      return HttpResponse.json({ success: true, results: { demographics }, duration: 12 })
    })
  )
}

// The scripted model: each request to the Messages API gets the next turn of `script`, streamed
// as server-sent events the way the API streams them. Every turn opens with a thinking block whose
// text is omitted and only its signature sent, as Haiku 5.5's are. A script entry can be a function
// of the request, to hold a turn or choose it from what the agent sent. Past the end of the script,
// the fake answers 400, so a run that calls the model more often than scripted fails.
export type ScriptedBlock =
  { type: 'text'; text: string } | { type: 'tool_use'; name: string; input: Record<string, unknown> }
export type ScriptedTurn = {
  content: ScriptedBlock[]
  stop_reason: 'end_turn' | 'tool_use' | 'refusal' | 'max_tokens'
  category?: string // a refusal's stop_details category
}
export type ModelRequest = Record<string, any> // the request body, as the agent sent it

export const text = (text: string): ScriptedBlock => ({ type: 'text', text })
export const toolUse = (name: string, input: Record<string, unknown>): ScriptedBlock => ({
  type: 'tool_use',
  name,
  input
})
// A turn that ends in tool calls if it has any, else ends the agent's turn.
export const turn = (...content: ScriptedBlock[]): ScriptedTurn => ({
  content,
  stop_reason: content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn'
})
// A turn the safety classifiers declined: HTTP 200 with stop_reason "refusal".
export const refusal = (category = 'cyber', ...content: ScriptedBlock[]): ScriptedTurn => ({
  content,
  stop_reason: 'refusal',
  category
})

export function fakeClaude(
  script: (ScriptedTurn | ((request: ModelRequest) => ScriptedTurn | Promise<ScriptedTurn>))[]
) {
  let turns = 0
  network.use(
    http.post(`${env.ANTHROPIC_BASE_URL}/v1/messages`, async ({ request }) => {
      await record(request)
      const body = JSON.parse(await request.clone().text())
      // A topic baseline request is answered by fakeTopic, so it never spends a scripted turn.
      if (isTopic(body)) return topicResponse(body)
      const next = script[turns++]
      if (!next)
        return HttpResponse.json(
          {
            type: 'error',
            error: { type: 'invalid_request_error', message: 'The fake model has no scripted turn left' }
          },
          { status: 400, headers: { 'x-should-retry': 'false' } }
        )
      const scripted = typeof next === 'function' ? await next(body) : next
      return new HttpResponse(stream(scripted, turns), { headers: { 'content-type': 'text/event-stream' } })
    })
  )
}

const anthropicRequests = (): ModelRequest[] =>
  requests.filter((r) => r.url.origin === new URL(env.ANTHROPIC_BASE_URL).origin).map((r) => JSON.parse(r.body))

// The body of every request the scripted model got, in order. Topic baseline requests aren't among them.
export const modelRequests = (): ModelRequest[] => anthropicRequests().filter((r) => !isTopic(r))

// The pitch text an extraction request carries, so concurrent extractions can be answered in any order.
const pitchText = (request: ModelRequest): string =>
  request.messages
    .flatMap((m: { content: string | { type: string; text?: string }[] }) =>
      typeof m.content === 'string' ? [m.content] : m.content.map((b) => b.text ?? '')
    )
    .join('\n')

export type Extracted = { guest: string; work: { title: string; type: string; year: number | null } | null }
// Scripts the model's reading of `count` pitches, each answer chosen from the pitch's text.
export const fakeReader = (count: number, answer: (pitch: string) => Extracted) =>
  fakeClaude(
    Array.from(
      { length: count },
      () => (request: ModelRequest) => turn(text(JSON.stringify(answer(pitchText(request)))))
    )
  )

// The topic baseline: the run's one structured call that ranks the roster by topic alone.
const isTopic = (body: ModelRequest) => body.output_config?.format?.schema?.properties?.ranking !== undefined

// The names a topic baseline request may rank, in the order it lists them.
export const topicNames = (request: ModelRequest): string[] =>
  request.output_config.format.schema.properties.ranking.items.enum

// How the fake answers a topic baseline request: show names in topic order, a scripted turn such
// as a refusal, or an HTTP status. A function of the request can choose or hold its answer.
type TopicAnswer = string[] | ScriptedTurn | number
let topicAnswer: TopicAnswer | ((request: ModelRequest) => TopicAnswer | Promise<TopicAnswer>) = topicNames

// Sets how fakeClaude answers topic baseline requests. Left out, it ranks the shows in the order the
// request lists them, as it does by default; setup.ts puts the default back after each test.
export const fakeTopic = (answer: typeof topicAnswer = topicNames) => {
  topicAnswer = answer
}

// The body of every topic baseline request, in order.
export const topicRequests = (): ModelRequest[] => anthropicRequests().filter(isTopic)

async function topicResponse(body: ModelRequest) {
  const answer = typeof topicAnswer === 'function' ? await topicAnswer(body) : topicAnswer
  if (typeof answer === 'number')
    return HttpResponse.json(
      { type: 'error', error: { type: 'api_error', message: 'fake failure' } },
      { status: answer, headers: { 'x-should-retry': 'false' } }
    )
  const scripted = Array.isArray(answer) ? turn(text(JSON.stringify({ ranking: answer }))) : answer
  return new HttpResponse(stream(scripted, 0), { headers: { 'content-type': 'text/event-stream' } })
}

// Tool use IDs are `toolu_<turn>_<block>`, counting from 1, so tests can match results to calls.
function stream({ content, stop_reason, category }: ScriptedTurn, n: number) {
  const events: [string, object][] = [
    [
      'message_start',
      {
        message: {
          id: `msg_${n}`,
          type: 'message',
          role: 'assistant',
          model: 'claude-haiku-5-5',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          stop_details: null,
          // The first request writes the prompt cache and later ones read it, as a cached prefix does.
          usage: {
            input_tokens: 100,
            output_tokens: 1,
            cache_creation_input_tokens: n === 1 ? 900 : 0,
            cache_read_input_tokens: n === 1 ? 0 : 900
          }
        }
      }
    ]
  ]
  const block = (index: number, start: object, delta: object) =>
    events.push(
      ['content_block_start', { index, content_block: start }],
      ['content_block_delta', { index, delta }],
      ['content_block_stop', { index }]
    )
  block(0, { type: 'thinking', thinking: '', signature: '' }, { type: 'signature_delta', signature: `sig-${n}` })
  content.forEach((b, i) =>
    b.type === 'text'
      ? block(i + 1, { type: 'text', text: '' }, { type: 'text_delta', text: b.text })
      : block(
          i + 1,
          { type: 'tool_use', id: `toolu_${n}_${i + 1}`, name: b.name, input: {} },
          { type: 'input_json_delta', partial_json: JSON.stringify(b.input) }
        )
  )
  const stop_details = stop_reason === 'refusal' ? { type: 'refusal', category, explanation: null } : null
  events.push(
    ['message_delta', { delta: { stop_reason, stop_sequence: null, stop_details }, usage: { output_tokens: 20 } }],
    ['message_stop', {}]
  )
  return events.map(([type, data]) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`).join('')
}
