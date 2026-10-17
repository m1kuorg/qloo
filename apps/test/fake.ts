// The one test seam: outbound HTTP. MSW intercepts fetch inside the Workers runtime, where the
// Worker and its Durable Objects share the tests' isolate, so the fakes below see every request
// the gateway makes. Fixtures are hand-written with made-up IDs and scores, never Qloo data.
import { setupNetwork } from '@msw/cloudflare'
import { env } from 'cloudflare:workers'
import { http, HttpResponse } from 'msw'

export const network = setupNetwork()

export type RecordedRequest = { method: string; url: URL; headers: Headers; body: string }

// Every request a fake served, in order. Cleared after each test by setup.ts.
export const requests: RecordedRequest[] = []

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
    body: await request.clone().text()
  })

// `properties` stands in for the fields Qloo returns that the app doesn't use.
export type QlooEntity = {
  entity_id: string
  name: string
  popularity: number
  types?: string[]
  properties?: Record<string, unknown>
}

// A response with a raw text body, such as an HTML error page from a proxy in front of Qloo.
export type RawResponse = { status: number; body: string }

// Serves `/search` from `search`, keyed by the exact query string. A number answers with that
// HTTP status and an error body in Qloo's shape, a `RawResponse` answers as written, and a query
// with no fixture finds nothing.
export function fakeQloo({ search }: { search: Record<string, QlooEntity[] | number | RawResponse> }) {
  network.use(
    http.get(`${env.QLOO_BASE_URL}/search`, async ({ request }) => {
      await record(request)
      const url = new URL(request.url)
      const take = Number(url.searchParams.get('take') ?? 20)
      const results = search[url.searchParams.get('query') ?? '']
      if (!results) return HttpResponse.json({ results: [] })
      if (typeof results === 'number')
        return HttpResponse.json({ error: { message: 'fake failure', code: results } }, { status: results })
      if (!Array.isArray(results)) return HttpResponse.text(results.body, { status: results.status })
      const types = [url.searchParams.get('types') ?? 'urn:entity:podcast']
      return HttpResponse.json({ results: results.slice(0, take).map((r) => ({ types, ...r })) })
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

// The body of every request the scripted model got, in order.
export const modelRequests = (): ModelRequest[] =>
  requests.filter((r) => r.url.origin === new URL(env.ANTHROPIC_BASE_URL).origin).map((r) => JSON.parse(r.body))

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
          usage: { input_tokens: 100, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
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
