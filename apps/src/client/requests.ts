// The playground's requests, with no React in them: the operations it reads from the API's OpenAPI
// document, the request a member's draft of one makes and what's wrong with it, what a send that isn't a
// read does, the request as a curl command, a 429's wait, and the last requests a browser tab keeps.
// Playground.tsx draws them; the tests read them as they are.
import type { Cost } from '../routes/api'
import { GUEST_NETWORK_CLEARS } from '../text'
import type { NetworkPage } from './NetworkPage'

// The pieces of the OpenAPI document (/api/v1/openapi.json) the playground reads.
type Schema = {
  $ref?: string
  type?: string | string[]
  example?: unknown
  properties?: Record<string, Schema>
  required?: string[]
  enum?: string[]
}
type DocOperation = {
  tags?: string[]
  summary?: string
  description?: string
  parameters?: { name: string; in: string; required?: boolean; description?: string; schema?: Schema }[]
  requestBody?: { required?: boolean; content: Record<string, { schema?: Schema }> }
  responses?: Record<string, { description?: string }>
  'x-crossfeed-cost'?: string
  'x-crossfeed-session-only'?: boolean
}
export type OpenApi = {
  paths: Record<string, Record<string, DocOperation>>
  components?: { schemas?: Record<string, Schema> }
}

// One operation as the playground lists and builds it: `key` is its method and path, as the API's cost
// table names it; `cost` its label, null when the document gives none the API has; each parameter in the
// path or the query, with the values a query's takes; its body's media types, each with what the field
// opens on (`initial`) and, for an optional body, which opens empty, its example as a hint; and the
// document's words for each status it answers.
export type Param = { name: string; in: 'path' | 'query'; description: string | null; choices: string[] | null }
export type Operation = {
  key: string
  method: string
  path: string
  tag: string
  summary: string
  description: string | null
  cost: Cost | null
  sessionOnly: boolean
  params: Param[]
  body: { required: boolean; types: { type: string; initial: string; hint: string }[] } | null
  answers: Record<string, string>
}

const METHODS = ['get', 'post', 'patch', 'put', 'delete']
// Every network's routes are under it, so the list shows each path after it, as the docs' Every route does.
export const NETWORK_PATH = '/api/v1/networks/{networkId}'
// The inbox and pitch runs answer 404 while guest pitches are off, though the document lists them.
const INBOX_PATH = /^\/api\/v1\/networks\/\{networkId\}\/(inbox|pitch-runs)(\/|$)/

export const isJson = (type: string) => type === 'application/json' || type.endsWith('+json')

// A schema, or the named one it refers to.
const resolved = (doc: OpenApi, schema: Schema = {}): Schema =>
  schema.$ref ? (doc.components?.schemas?.[schema.$ref.split('/').at(-1)!] ?? {}) : schema

// What a field of `schema`'s type holds before anyone types in it: "" for text, 0, false, [] or {}.
function placeholder(schema: Schema) {
  const type = [schema.type].flat().find((t) => t !== 'null')
  if (type === 'number' || type === 'integer') return 0
  if (type === 'boolean') return false
  if (type === 'array') return []
  if (type === 'object') return {}
  return ''
}

// A body of media type `type` as its schema describes it: the schema's example, or for JSON with none,
// its required fields with typed placeholders, as `{ "questionId": "" }`; a file type with no example,
// such as an email, is empty.
function exampleBody(doc: OpenApi, type: string, schema?: Schema) {
  const s = resolved(doc, schema)
  if (!isJson(type)) return typeof s.example === 'string' ? s.example : ''
  if (s.example !== undefined) return JSON.stringify(s.example, null, 2)
  const fields = (s.required ?? []).map((name) => [name, placeholder(resolved(doc, s.properties?.[name]))])
  return JSON.stringify(Object.fromEntries(fields), null, 2)
}

// What a send that isn't a read does, by its cost, in the network's words, for its confirm; a network on
// the guest budget shares it, and the budget, with every guest. Keyed by the API's cost labels, so a new
// label doesn't build until it's worded here.
const BUDGET = 'the guest budget, the one set of daily limits every guest shares'
const DOES: Record<Cost, (network: Pick<NetworkPage, 'name' | 'guestBudget'>) => string> = {
  Reads: ({ name }) => `It reads what ${name} has, and changes nothing.`,
  Changes: ({ name, guestBudget }) =>
    guestBudget
      ? `It changes what ${name} has for every guest, as every guest shares it until it’s cleared at ${GUEST_NETWORK_CLEARS}.`
      : `It changes what ${name} has, for every member.`,
  Deletes: ({ name, guestBudget }) =>
    `What it deletes goes for every ${guestBudget ? `guest, as every guest shares ${name},` : `member of ${name},`} and can’t be brought back.`,
  'Spends a model run': ({ name, guestBudget }) =>
    guestBudget
      ? `It spends one of today’s model runs from ${BUDGET}.`
      : `It spends one of ${name}’s model runs for today.`,
  'Calls Qloo': ({ name, guestBudget }) =>
    guestBudget ? `It counts in today’s Qloo calls from ${BUDGET}.` : `It counts in ${name}’s Qloo calls for today.`
}
const known = (label?: string): Cost | null => (label && Object.hasOwn(DOES, label) ? (label as Cost) : null)

// The two routes that do more with replace=true than without it, as the API reference says, and what
// more: each sentence goes in its confirm.
const REPLACES: Record<string, string> = {
  [`POST ${NETWORK_PATH}/roster`]: 'With replace=true, the shows already on the roster also take the file’s figures.',
  [`POST ${NETWORK_PATH}/inbox`]:
    'With replace=true, it also deletes the inbox’s pitches, with the last pitch run’s lists and replies, and ends a pitch run waiting on a question.'
}

// Whether a draft of `op` sends replace=true where that does more.
export const replaces = (op: Operation, draft: Draft) => op.key in REPLACES && draft.params.replace === 'true'

// What a send that isn't a read does, in words: what its cost says, or for a cost the document doesn't
// give, that it may change or spend anything; then what replace=true adds.
export function consequence(op: Operation, network: Pick<NetworkPage, 'name' | 'guestBudget'>, replace: boolean) {
  const does = op.cost
    ? DOES[op.cost](network)
    : `The API doesn’t say what it costs, so it may change what ${network.name} has or spend ${network.guestBudget ? BUDGET : 'its daily limits'}.`
  return replace ? `${does} ${REPLACES[op.key]}` : does
}

// Whether a send goes without asking: a GET the document says reads. Anything else, a label it doesn't
// give or one the playground doesn't know included, asks first.
export const sendsAtOnce = (op: Operation) => op.method === 'GET' && op.cost === 'Reads'

// The document's operations in its order, grouped later by their first tag, as /docs/api groups them,
// leaving out the inbox's and pitch runs' while the inbox is off.
export function operationsOf(doc: OpenApi, inbox: boolean): Operation[] {
  return Object.entries(doc.paths).flatMap(([path, item]) =>
    METHODS.flatMap((m) => {
      const op = item[m]
      if (!op || (!inbox && INBOX_PATH.test(path))) return []
      const method = m.toUpperCase()
      const content = Object.entries(op.requestBody?.content ?? {})
      const required = op.requestBody?.required ?? false
      return [
        {
          key: `${method} ${path}`,
          method,
          path,
          tag: op.tags?.[0] ?? 'Other',
          summary: op.summary ?? `${method} ${path}`,
          description: op.description ?? null,
          cost: known(op['x-crossfeed-cost']),
          sessionOnly: op['x-crossfeed-session-only'] === true,
          params: (op.parameters ?? [])
            .filter((p) => p.in === 'path' || p.in === 'query')
            .map((p) => ({
              name: p.name,
              in: p.in as Param['in'],
              description: p.description ?? null,
              choices: p.schema?.enum ?? null
            })),
          body:
            content.length === 0
              ? null
              : {
                  required,
                  // JSON first where it's offered, as most routes take it, then the document's order.
                  types: content
                    .sort(([a], [b]) => Number(isJson(b)) - Number(isJson(a)))
                    .map(([type, { schema }]) => {
                      const example = exampleBody(doc, type, schema)
                      return { type, initial: required ? example : '', hint: required ? '' : example }
                    })
                },
          answers: Object.fromEntries(
            Object.entries(op.responses ?? {}).map(([status, r]) => [status, r.description ?? ''])
          )
        }
      ]
    })
  )
}

// A value for the shell, single-quoted, each ' in it closing the quote, escaped, and opening it again.
const quoted = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`

// The request as a curl command a terminal runs as it's pasted, bash or zsh: the key from the shell's
// CROSSFEED_API_KEY, which the double quotes let the shell fill in, never the key itself; the body
// sent byte for byte with its Content-Type, by --data-binary, or by --data-raw for a body that starts
// with @, which --data-binary would read as a file's name; every other value single-quoted. Lines end
// in a backslash, with no comment, which interactive zsh would run as words.
export function curl({
  method,
  url,
  type,
  body
}: {
  method: string
  url: string
  type: string | null
  body: string | null
}) {
  const lines = [
    `curl${method === 'GET' ? '' : ` -X ${method}`} ${quoted(url)}`,
    '-H "Authorization: Bearer $CROSSFEED_API_KEY"',
    ...(body !== null && type
      ? [
          `-H ${quoted(`Content-Type: ${type}`)}`,
          `${body.startsWith('@') ? '--data-raw' : '--data-binary'} ${quoted(body)}`
        ]
      : [])
  ]
  return lines.join(' \\\n  ')
}

// What a member has typed for an operation: each parameter's value, the body's media type, and the
// body for each media type, so switching between them, or to another operation and back, keeps it.
export type Draft = { params: Record<string, string>; type: string | null; bodies: Record<string, string> }
export const fresh = (op: Operation, network: Pick<NetworkPage, 'id'>): Draft => ({
  params: Object.fromEntries(op.params.map((p) => [p.name, p.name === 'networkId' ? network.id : ''])),
  type: op.body?.types[0]?.type ?? null,
  bodies: Object.fromEntries((op.body?.types ?? []).map((t) => [t.type, t.initial]))
})

// The request a draft makes: its path with each value in place, its query, and its body, null when it
// sends none (an optional body left empty).
export function built(op: Operation, draft: Draft) {
  const path = op.path.replace(/\{(\w+)\}/g, (_, name: string) => encodeURIComponent(draft.params[name] ?? ''))
  const query = new URLSearchParams(
    op.params.filter((p) => p.in === 'query' && draft.params[p.name]).map((p) => [p.name, draft.params[p.name]])
  ).toString()
  const text = draft.type ? (draft.bodies[draft.type] ?? '') : ''
  const body = op.body && (op.body.required || text.trim()) ? text : null
  return { path, query: query ? `?${query}` : '', type: draft.type, body }
}

// What's wrong with a draft before it's sent, by the field it's about: a path value left empty, or one
// that's . or .., which the address would read as a step through the path, not a value, so the request
// would go elsewhere than the confirm says; a JSON body that doesn't parse; and in key mode, no key, or
// one with a character no key has, such as the docs' cf_live_… with its ellipsis, which a header can't
// carry either.
export type Problems = Record<string, string>
export function problemsOf(op: Operation, draft: Draft, key: string | null) {
  const problems: Problems = {}
  for (const p of op.params) {
    if (p.in !== 'path') continue
    const value = draft.params[p.name]?.trim()
    if (!value) problems[`param-${p.name}`] = `Fill in ${p.name}.`
    else if (value === '.' || value === '..')
      problems[`param-${p.name}`] = `${p.name} can’t be ${value}: the address would read it as a step through the path.`
  }
  const { type, body } = built(op, draft)
  if (body !== null && type && isJson(type)) {
    if (!body.trim()) problems.body = 'Write the body as JSON.'
    else
      try {
        JSON.parse(body)
      } catch (e) {
        problems.body = `The body isn’t valid JSON: ${e instanceof Error ? e.message : String(e)}`
      }
  }
  if (key !== null) {
    if (!key.trim()) problems.key = 'Paste one of the network’s API keys.'
    else if (!/^[\x21-\x7e]+$/.test(key.trim()))
      problems.key =
        'An API key has plain letters, digits and symbols alone, with no space or other character, such as an ellipsis: paste the whole key.'
  }
  return problems
}

// How many seconds a 429's Retry-After asks to wait, given as seconds or as a date, from `now`; null
// with none, or one that's neither.
export function retryAfter(value: string | null, now = Date.now()) {
  if (!value) return null
  if (/^\s*\d+\s*$/.test(value)) return Number(value)
  const at = Date.parse(value)
  return Number.isNaN(at) ? null : Math.max(0, Math.ceil((at - now) / 1000))
}

// One of the last requests, as this tab keeps it: the operation, its values and media type, its body
// when it's small (`kept` false when it was too big to keep), what it answered (null when it didn't
// reach Crossfeed) and when, and whether a key sent it, never which. Kept per network, newest first.
export type Sent = {
  op: string
  params: Record<string, string>
  type: string | null
  body: string | null
  kept: boolean
  status: number | null
  at: number
  key: boolean
}
export const KEPT = 20
const SMALL = 4 * 1024
const store = (network: string) => `crossfeed-playground:${network}`

// A request as the last requests keep it: its body only when it's at most SMALL.
export function sent(op: Operation, draft: Draft, keyed: boolean, at: number, status: number | null): Sent {
  const { type, body } = built(op, draft)
  const small = body === null || new Blob([body]).size <= SMALL
  return { op: op.key, params: draft.params, type, body: small ? body : null, kept: small, status, at, key: keyed }
}

// Why this tab can't keep its last requests past the page, in words: its storage is full
// (QuotaExceededError), or the browser keeps none for the page.
const storageProblem = (e: unknown) =>
  e instanceof DOMException && e.name === 'QuotaExceededError'
    ? 'This tab’s storage is full, so these requests go once the page closes.'
    : `This browser keeps no storage for this page (${e instanceof Error ? e.message : String(e)}), so these requests go once the page closes.`

// The last requests this tab kept for network `id`, and why it can't keep them, if it can't. Rendered
// on the server, as the tests render the page, there's no storage, and nothing kept. A blocked store
// throws as it's touched; what isn't a list of requests, as an earlier page's might not be, is none.
export function recalled(id: string): { sent: Sent[]; problem: string | null } {
  try {
    if (typeof sessionStorage === 'undefined') return { sent: [], problem: null }
    const kept = JSON.parse(sessionStorage.getItem(store(id)) ?? '[]') as unknown
    const valid = (s: Partial<Sent>) =>
      typeof s?.op === 'string' && typeof s.at === 'number' && typeof s.params === 'object'
    return { sent: Array.isArray(kept) ? kept.filter(valid) : [], problem: null }
  } catch (e) {
    return { sent: [], problem: e instanceof SyntaxError ? null : storageProblem(e) }
  }
}

// `entry` first among network `id`'s last requests, the oldest past KEPT dropped, written to this tab's
// storage; when the storage refuses them, they're still the list, with why they won't outlast the page.
export function remembered(id: string, last: Sent[], entry: Sent): { sent: Sent[]; problem: string | null } {
  const next = [entry, ...last].slice(0, KEPT)
  try {
    sessionStorage.setItem(store(id), JSON.stringify(next))
    return { sent: next, problem: null }
  } catch (e) {
    return { sent: next, problem: storageProblem(e) }
  }
}
