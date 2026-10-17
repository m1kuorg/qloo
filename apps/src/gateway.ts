import { DurableObject } from 'cloudflare:workers'
import type { CallEvidence } from './evidence'

export type QlooEntity = {
  id: string
  name: string
  type: string
  popularity: number | null
  disambiguation: string | null // a work's year, plus the author for a book, such as "2022, Quentin Tarantino"
  description: string | null // one line on what it is, to tell same-title results apart
}

// What every gateway method returns. A failure comes back as a value, not a throw, so its
// evidence survives the RPC hop and the session can log it.
// `unscored` marks a ranking that scored no candidate, so a caller can try other anchors.
export type QlooResult<T> = { evidence: CallEvidence } & (
  { ok: true; data: T } | { ok: false; error: string; unscored?: true }
)

type Params = Record<string, string | number | boolean>

// How a call uses the shared cache: answered from it when it can; never, so the answer is Qloo's
// today; or only from it, never reaching Qloo. The health check uses the last two.
export type CacheUse = 'use' | 'bypass' | 'only'

// One ranked result: its raw affinity and each anchor's share of it, from explainability.
export type Affinity = CallEvidence['affinities'][number]

// A closed-list ranking: the scored candidates, best first, and the candidates Qloo gave no score.
export type Ranked = { scored: (Affinity & { affinity: number })[]; unscored: string[] }

// One tag two signals share, from compare.
export type SharedTag = CallEvidence['tags'][number]

// One entity's listeners relative to average: by age bucket, such as `25_to_29`, and how far they
// skew male, which is the negative of how far they skew female in every response seen.
export type Profile = { id: string; age: Record<string, number>; male: number }

// A demographics call: a profile per entity Qloo returned, and the IDs it returned none for.
export type Demographics = { profiles: Profile[]; missing: string[] }

// Why Qloo can't be called now: today's cap is reached, or Qloo is failing.
export type QlooDown = { capped: boolean; reason: string }

// How long a request that failed after its retries marks Qloo as failing, unless one succeeds sooner.
const FAILING_FOR_MS = 5 * 60_000

// Requests in flight to Qloo at once, across all sessions.
export const IN_FLIGHT = 3

// The Qloo request behind each gateway method, so a call the gateway threw on can still say what it was.
export const REQUESTS = {
  search: { method: 'GET', endpoint: '/search' },
  rank: { method: 'POST', endpoint: '/v2/insights' },
  compare: { method: 'GET', endpoint: '/v2/analysis/compare' },
  demographics: { method: 'POST', endpoint: '/v2/insights' }
} as const

type QlooRequest = (typeof REQUESTS)[keyof typeof REQUESTS]

// A call's record before anything has come back: the request alone, started now.
export const blankEvidence = ({ method, endpoint }: QlooRequest, params: Params): CallEvidence => ({
  at: new Date().toISOString(),
  method,
  endpoint,
  params,
  status: null,
  latencyMs: 0,
  retries: 0,
  cacheHit: false,
  error: null,
  entities: [],
  tags: [],
  affinities: []
})

// The only code that calls Qloo: one global instance, reached over Durable Object RPC.
export class QlooGateway extends DurableObject<Env> {
  // At most IN_FLIGHT requests in flight across all sessions, each started at least
  // QLOO_MIN_INTERVAL_MS after the last: Qloo rate-limits bursts of fast calls, not only concurrent ones.
  private free = IN_FLIGHT
  private waiting: (() => void)[] = []
  private nextStart = 0

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Qloo's answers, shared by every session and kept with no expiry. Only successes are kept.
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, status INTEGER NOT NULL, body TEXT NOT NULL)'
    )
    // Requests sent to Qloo per UTC day, retries included, against QLOO_DAILY_CALL_CAP.
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS daily_calls (day TEXT PRIMARY KEY, count INTEGER NOT NULL)')
    // The latest request that failed after its retries, until a request succeeds.
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS failing (id INTEGER PRIMARY KEY CHECK (id = 1), at INTEGER NOT NULL, error TEXT NOT NULL)'
    )
    // The sample run any session replays while Qloo can't be called, as the session stored it.
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS sample_run (id INTEGER PRIMARY KEY CHECK (id = 1), run TEXT NOT NULL)'
    )
  }

  // Why Qloo can't be called now, or null when it can: today's cap is reached, or the latest request
  // sent failed after its retries in the last few minutes. Cache hits say nothing either way.
  health(): QlooDown | null {
    const cap = Number(this.env.QLOO_DAILY_CALL_CAP)
    if (this.callsToday() >= cap) return { capped: true, reason: capReached(cap) }
    const [failing] = this.ctx.storage.sql
      .exec<{ at: number; error: string }>('SELECT at, error FROM failing')
      .toArray()
    if (failing && Date.now() - failing.at < FAILING_FOR_MS)
      return { capped: false, reason: `Qloo is failing (${failing.error})` }
    return null
  }

  // Keeps a session's completed sample run, replacing the one kept before, for any session to replay.
  keepSampleRun(run: string) {
    this.ctx.storage.sql.exec('INSERT OR REPLACE INTO sample_run (id, run) VALUES (1, ?)', run)
  }

  // Replaces the kept sample run with `sampleRun` only while it's still run `run`'s, in one statement,
  // so a newer run kept meanwhile is never lost.
  patchSampleRun(run: string, sampleRun: string) {
    this.ctx.storage.sql.exec(
      "UPDATE sample_run SET run = ? WHERE id = 1 AND json_extract(run, '$.state.run.id') = ?",
      sampleRun,
      run
    )
  }

  sampleRun(): string | null {
    const [row] = this.ctx.storage.sql.exec<{ run: string }>('SELECT run FROM sample_run').toArray()
    return row?.run ?? null
  }

  // Finds entities by name. Qloo's search is fuzzy, so deciding whether a result is the show is
  // the caller's job (see resolve.ts).
  async search(query: string, type: string, take = 3, cache: CacheUse = 'use'): Promise<QlooResult<QlooEntity[]>> {
    const result = await this.request(REQUESTS.search, { query, types: type, take }, cache)
    if (!result.ok) return result
    const raw = (result.data as { results?: SearchResult[] } | null)?.results ?? []
    const entities = raw.map((r) => ({
      id: r.entity_id,
      name: r.name,
      type: r.types?.[0] ?? type,
      popularity: r.popularity ?? null,
      disambiguation: r.disambiguation ?? null,
      description: describe(r.properties)
    }))
    // Search fills only `entities`: each result's genre tags describe that result, not the call, so
    // `tags` stays empty here.
    const evidence = { ...result.evidence, entities: entities.map(({ disambiguation, description, ...e }) => e) }
    return { ok: true, data: entities, evidence }
  }

  // Ranks a closed list of candidates against the anchors, sent together as one signal, each ID
  // once. Qloo silently ignores parameters it doesn't apply, so a result outside the list or one
  // without explainability is an error, not a ranking; so are all-null affinities, marked `unscored`:
  // the anchors gave no signal, or no candidate has one. A candidate left out of the results, or
  // scored null, is unscored.
  async rank(
    anchors: string[],
    candidates: string[],
    type: string,
    cache: CacheUse = 'use'
  ): Promise<QlooResult<Ranked>> {
    const ids = [...new Set(candidates)]
    const result = await this.request(
      REQUESTS.rank,
      {
        'filter.type': type,
        'signal.interests.entities': anchors.join(','),
        'filter.results.entities': ids.join(','),
        'feature.explainability': true,
        take: 50
      },
      cache
    )
    if (!result.ok) return result
    const raw = (result.data as { results?: { entities?: InsightResult[] } } | null)?.results?.entities ?? []
    const affinities = raw.map((r) => ({
      id: r.entity_id,
      name: r.name,
      affinity: r.query?.affinity ?? null,
      explainability: (r.query?.explainability?.['signal.interests.entities'] ?? []).map((x) => ({
        id: x.entity_id,
        score: x.score
      }))
    }))
    const evidence = { ...result.evidence, affinities }
    const names = (rs: InsightResult[]) => rs.map((r) => `${r.name} (${r.entity_id})`).join(', ')
    const outside = raw.filter((r) => !ids.includes(r.entity_id))
    if (outside.length > 0)
      return this.fail(evidence, `Qloo ranked ${names(outside)}, outside the candidate list, so it ignored the list`)
    const unexplained = raw.filter((r) => !r.query?.explainability?.['signal.interests.entities'])
    if (unexplained.length > 0)
      return this.fail(evidence, `Qloo returned no explainability for ${names(unexplained)}, so it ignored the request`)
    const scored = affinities
      .filter((a): a is Ranked['scored'][number] => a.affinity !== null)
      .sort((a, b) => b.affinity - a.affinity)
    if (scored.length === 0) {
      evidence.error = "Qloo returned no affinity for any candidate, so the anchors' signal didn't score"
      return { ok: false, error: evidence.error, unscored: true, evidence }
    }
    const unscored = ids.filter((id) => !scored.some((s) => s.id === id))
    return { ok: true, data: { scored, unscored }, evidence }
  }

  // The tags the audiences of side `a`, its entities sent together as one signal, share with entity
  // `b`'s, in Qloo's order. Several entities on side `a` all count: on 2026-10-17 three comps gave
  // the union of each comp's own shared tags.
  async compare(a: string[], b: string): Promise<QlooResult<SharedTag[]>> {
    const result = await this.request(REQUESTS.compare, {
      'a.signal.interests.entities': a.join(','),
      'b.signal.interests.entities': b,
      take: 50
    })
    if (!result.ok) return result
    const raw = (result.data as { results?: { tags?: CompareTag[] } } | null)?.results?.tags ?? []
    const tags = raw.map((t) => ({ id: t.tag_id, name: t.name, score: t.query?.score ?? null }))
    return { ok: true, data: tags, evidence: { ...result.evidence, tags } }
  }

  // Each entity's listeners by age bucket and gender, relative to average, in one call for every
  // entity, sent as one signal. Qloo answers one entry per entity, by ID only and in no set order,
  // so the caller names them. An entry for an entity not asked about means Qloo ignored the signal.
  // The record has no demographics list, so each entity goes in `affinities` with no overall
  // affinity and one score per bucket, such as `age.25_to_29`, as Qloo calls them affinity scores.
  async demographics(entities: { id: string; name: string }[]): Promise<QlooResult<Demographics>> {
    const ids = [...new Set(entities.map((e) => e.id))]
    const result = await this.request(REQUESTS.demographics, {
      'filter.type': 'urn:demographics',
      'signal.interests.entities': ids.join(',')
    })
    if (!result.ok) return result
    const raw =
      (result.data as { results?: { demographics?: DemographicResult[] } } | null)?.results?.demographics ?? []
    const name = (id: string) => entities.find((e) => e.id === id)?.name ?? id
    const affinities = raw.map((r) => ({
      id: r.entity_id,
      name: name(r.entity_id),
      affinity: null,
      explainability: [
        ...Object.entries(r.query?.age ?? {}).map(([bucket, score]) => ({ id: `age.${bucket}`, score })),
        ...Object.entries(r.query?.gender ?? {}).map(([gender, score]) => ({ id: `gender.${gender}`, score }))
      ]
    }))
    const evidence = { ...result.evidence, affinities }
    const outside = raw.filter((r) => !ids.includes(r.entity_id))
    if (outside.length > 0)
      return this.fail(
        evidence,
        `Qloo returned demographics for ${outside.map((r) => r.entity_id).join(', ')}, which wasn't asked about, so it ignored the signal`
      )
    const profiles = raw.map((r) => ({ id: r.entity_id, age: r.query?.age ?? {}, male: r.query?.gender?.male ?? 0 }))
    const missing = ids.filter((id) => !raw.some((r) => r.entity_id === id))
    return { ok: true, data: { profiles, missing }, evidence }
  }

  // GET sends the parameters in the query string; POST sends them as a JSON body of flat dotted
  // keys, such as {"filter.type": "urn:entity:podcast"}, because Qloo answers a nested body with 400.
  private async request(
    qlooRequest: QlooRequest,
    params: Params,
    cache: CacheUse = 'use'
  ): Promise<QlooResult<unknown>> {
    const { method, endpoint } = qlooRequest
    const url = new URL(endpoint, this.env.QLOO_BASE_URL)
    const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))
    if (method === 'GET') url.search = String(query)
    const payload = method === 'POST' ? JSON.stringify(params) : undefined
    const evidence = blankEvidence(qlooRequest, params)
    // Latency runs from the first request sent, so time queued behind other calls isn't blamed on Qloo.
    const started = Date.now()
    let sentAt: number | undefined
    const key = await cacheKey(method, endpoint, query)
    const timeoutMs = Number(this.env.QLOO_TIMEOUT_MS)
    const retryDelays = this.env.QLOO_RETRY_DELAYS_MS.split(',').map(Number)
    try {
      const [hit] =
        cache === 'bypass'
          ? []
          : this.ctx.storage.sql.exec<CacheRow>('SELECT status, body FROM cache WHERE key = ?', key).toArray()
      if (hit) {
        evidence.status = hit.status
        evidence.cacheHit = true
        return { ok: true, data: JSON.parse(hit.body), evidence }
      }
      if (cache === 'only') return this.fail(evidence, 'Not in the cache')
      for (;;) {
        if (!this.spend()) return this.fail(evidence, capReached(this.env.QLOO_DAILY_CALL_CAP) + retried(evidence))
        await this.takeSlot()
        sentAt ??= Date.now()
        const attempt = await this.attempt(url, payload, timeoutMs).finally(() => this.releaseSlot())
        evidence.status = attempt.status
        if (attempt.ok) {
          const body = JSON.stringify(attempt.data)
          this.ctx.storage.sql.exec(
            'INSERT OR REPLACE INTO cache (key, status, body) VALUES (?, ?, ?)',
            key,
            attempt.status,
            body
          )
          this.ctx.storage.sql.exec('DELETE FROM failing')
          return { ok: true, data: attempt.data, evidence }
        }
        const delay = retryDelays[evidence.retries]
        if (!attempt.retry || delay === undefined) {
          const error = attempt.error + retried(evidence)
          // A 400 is Qloo refusing this request's parameters, which says nothing about Qloo itself.
          if (attempt.status !== 400)
            this.ctx.storage.sql.exec(
              'INSERT OR REPLACE INTO failing (id, at, error) VALUES (1, ?, ?)',
              Date.now(),
              error
            )
          return this.fail(evidence, error)
        }
        // About 1 then 3 seconds, give or take a fifth, so callers that failed together don't retry together.
        await sleep(delay * (0.8 + Math.random() * 0.4))
        evidence.retries++
      }
    } finally {
      evidence.latencyMs = Date.now() - (sentAt ?? started)
      const { endpoint: e, status, latencyMs, retries, cacheHit } = evidence
      console.log(JSON.stringify({ event: 'qloo_call', endpoint: e, status, latencyMs, retries, cacheHit }))
    }
  }

  // Counts one request against today's cap, or refuses it once the cap is reached. Counted when
  // queued rather than sent, so a refusal doesn't wait its turn; every queued request is sent.
  private spend() {
    if (this.callsToday() >= Number(this.env.QLOO_DAILY_CALL_CAP)) return false
    const day = new Date().toISOString().slice(0, 10)
    this.ctx.storage.sql.exec(
      'INSERT INTO daily_calls (day, count) VALUES (?, 1) ON CONFLICT (day) DO UPDATE SET count = count + 1',
      day
    )
    return true
  }

  // Requests counted against today's cap so far.
  private callsToday() {
    const day = new Date().toISOString().slice(0, 10)
    const sql = this.ctx.storage.sql
    const [today] = sql.exec<{ count: number }>('SELECT count FROM daily_calls WHERE day = ?', day).toArray()
    return today?.count ?? 0
  }

  // Waits for a free slot, first come first served, then for this request's turn to start.
  private async takeSlot() {
    if (this.free > 0) this.free--
    else await new Promise<void>((resolve) => this.waiting.push(resolve))
    const now = Date.now()
    const start = Math.max(now, this.nextStart)
    this.nextStart = start + Number(this.env.QLOO_MIN_INTERVAL_MS)
    if (start > now) await sleep(start - now)
  }

  // Hands the slot straight to the next waiter, so a newcomer can't jump the queue.
  private releaseSlot() {
    const next = this.waiting.shift()
    if (next) next()
    else this.free++
  }

  // One request to Qloo. Rate limits, gateway errors, and timeouts are worth retrying; a 400 or
  // any other error is not, and keeps Qloo's message.
  private async attempt(url: URL, payload: string | undefined, timeoutMs: number): Promise<Attempt> {
    try {
      const response = await fetch(url, {
        method: payload === undefined ? 'GET' : 'POST',
        headers: {
          'X-Api-Key': this.env.QLOO_API_KEY,
          ...(payload !== undefined && { 'Content-Type': 'application/json' })
        },
        body: payload,
        signal: AbortSignal.timeout(timeoutMs)
      })
      const { status } = response
      const body = await response.text()
      // Qloo documents 404 as "No results" for search; live it answers 200 with an empty list.
      if (status === 404) return { ok: true, status, data: null }
      if (!response.ok) {
        const message = errorMessage(body)
        const retry = [429, 502, 503, 504].includes(status)
        return { ok: false, status, retry, error: `Qloo returned ${status}${message ? `: ${message}` : ''}` }
      }
      const data = parseJson(body)
      if (data === undefined)
        return { ok: false, status, retry: false, error: `Qloo returned ${status} with a body that isn't JSON` }
      return { ok: true, status, data }
    } catch (e) {
      if (e instanceof Error && e.name === 'TimeoutError')
        return { ok: false, status: null, retry: true, error: `Qloo didn't answer within ${timeoutMs / 1000} s` }
      return {
        ok: false,
        status: null,
        retry: false,
        error: `Qloo request failed: ${e instanceof Error ? e.message : String(e)}`
      }
    }
  }

  private fail(evidence: CallEvidence, error: string): QlooResult<never> {
    evidence.error = error
    return { ok: false, error, evidence }
  }
}

type Attempt =
  { ok: true; status: number; data: unknown } | { ok: false; status: number | null; retry: boolean; error: string }

const capReached = (cap: string | number) => `The daily cap of ${cap} Qloo calls is reached; it resets at 00:00 UTC`

const retried = ({ retries }: CallEvidence) =>
  retries ? `, after ${retries} ${retries === 1 ? 'retry' : 'retries'}` : ''

type CacheRow = { status: number; body: string }

// A hash of the method, path, and parameters sorted by name, so one request is one entry.
async function cacheKey(method: string, endpoint: string, params: URLSearchParams) {
  const sorted = new URLSearchParams(params)
  sorted.sort()
  return sha256(`${method} ${endpoint}?${sorted}`)
}

// The SHA-256 hash of `text`, in hex: the gateway's cache keys and the topic baselines' (topic.ts).
export async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type SearchResult = {
  entity_id: string
  name: string
  types?: string[]
  popularity?: number
  disambiguation?: string | null
  properties?: {
    short_descriptions?: unknown // [{ language, value }] for films and TV
    short_description?: unknown // podcasts
    description?: unknown // books, and most films
  }
}

// A search result's description in one line: the English short description, a podcast's short
// description, or the full description, cut to about 200 characters. Same-title works can share
// everything else, such as one film Qloo lists twice (#128).
function describe(properties: SearchResult['properties']): string | null {
  const shorts = Array.isArray(properties?.short_descriptions) ? properties.short_descriptions : []
  const english = shorts.find((d) => d?.language === 'en')?.value
  const text = [english, properties?.short_description, properties?.description]
    .map((d) => (typeof d === 'string' ? d.replace(/\s+/g, ' ').trim() : ''))
    .find(Boolean)
  if (!text) return null
  if (text.length <= 200) return text
  const cut = text.slice(0, 200)
  const space = cut.lastIndexOf(' ')
  return `${(space > 100 ? cut.slice(0, space) : cut).replace(/[\s,.;:]+$/, '')}…`
}

type InsightResult = {
  entity_id: string
  name: string
  query?: {
    affinity?: number | null
    explainability?: { 'signal.interests.entities'?: { entity_id: string; score: number }[] }
  }
}

type CompareTag = { tag_id: string; name: string; query?: { score?: number } }

type DemographicResult = {
  entity_id: string
  query?: { age?: Record<string, number>; gender?: Record<string, number> }
}

// Qloo errors look like {"error": {"message": "..."}}, or {"error_msg": "..."} for a 429. Any other
// body, such as a proxy's HTML error page, is left out: raw response bodies never reach the browser.
function errorMessage(body: string): string | null {
  const json = parseJson(body) as { error?: { message?: unknown }; error_msg?: unknown; message?: unknown } | null
  const message = json?.error?.message ?? json?.error_msg ?? json?.message
  return typeof message === 'string' ? message : null
}

// The parsed body, or undefined when it isn't JSON. JSON.parse's own error quotes the body.
function parseJson(body: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    return undefined
  }
}
