import { DurableObject } from 'cloudflare:workers'
import { GUEST_NETWORK } from './directory'
import type { CallEvidence } from './evidence'
import { isQlooHost } from './qloo-hosts'
import { modelRuns, sha256 } from './text'

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

// A visitor's model runs today against their daily limit, and why a new one is refused, if it is.
export type ModelRuns = { used: number; limit: number; refused: string | null }

// What a visitor, or a network, has used today against its daily limits, and when they reset.
export type Usage = {
  qlooCalls: { used: number; limit: number }
  modelRuns: { used: number; limit: number }
  resets: string // ISO time, the next 00:00 UTC
}

// A network's own Qloo key as its settings show it: whether it's set, and to an owner, the host it's
// for and its last four characters. The key itself never leaves its gateway instance.
export type OwnKey = { set: boolean; host?: string; last4?: string }

// The per-visitor daily counters: tables keyed by a hash of the visitor and the day.
type Counter = 'model_runs' | 'free_starts' | 'visitor_calls' | 'signups'

// How a launch may start: as a model run (all null), or without one, because Qloo can't be called
// (`down`) or a model run limit is reached (`limited`), with the stored sample run when it's the
// sample launch. `refused` means it may not start at all: the visitor's free starts are used.
export type Admission = {
  down: QlooDown | null
  limited: string | null
  refused: string | null
  stored: string | null
}

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

// The global instance: every network's without a Qloo key of its own, and where model runs and the
// stored sample run are counted and kept for everyone (ADR 0004).
export const globalGateway = (env: Env) => env.QlooGateway.getByName(GLOBAL)
const GLOBAL = 'global'

// Why a network's instance fails a call once its wipe has begun, as when an owner removes its key.
export const WIPED =
  "The network's own Qloo key was removed, or the network deleted, while this call was out, so it was cut off. Calls made from now on go through Crossfeed's shared key"

// The only code that calls Qloo, reached over Durable Object RPC: the global instance, on Crossfeed's
// key, and one instance per network that brings its own key, `network:<networkId>`, on that key, with
// its own cache and Qloo counts (ADR 0004).
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
    // Model runs per visitor per UTC day, keyed by a hash of the visitor's salted key and the day, so
    // no address is stored and a key can't be followed from one day to the next. Kept for today only.
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS model_runs (key TEXT PRIMARY KEY, day TEXT NOT NULL, count INTEGER NOT NULL)'
    )
    // Free starts, which call no model, and Qloo calls, cache hits included, per visitor per UTC day,
    // keyed and kept the same way.
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS free_starts (key TEXT PRIMARY KEY, day TEXT NOT NULL, count INTEGER NOT NULL)'
    )
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS visitor_calls (key TEXT PRIMARY KEY, day TEXT NOT NULL, count INTEGER NOT NULL)'
    )
    // Accounts created per visitor per UTC day, keyed and kept the same way.
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS signups (key TEXT PRIMARY KEY, day TEXT NOT NULL, count INTEGER NOT NULL)'
    )
    // A network's own Qloo key, in its own instance: the host it's for, the key sealed with AES-GCM
    // under QLOO_KEY_SECRET (seal), and its last four characters, all its settings ever show of it.
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS own_key (id INTEGER PRIMARY KEY CHECK (id = 1), host TEXT NOT NULL, sealed TEXT NOT NULL, last4 TEXT NOT NULL)'
    )
  }

  // The network's own key, if this instance has one, as an owner sees it.
  ownKey(): OwnKey {
    const [own] = this.sql.exec<{ host: string; last4: string }>('SELECT host, last4 FROM own_key').toArray()
    return own ? { set: true, host: own.host, last4: own.last4 } : { set: false }
  }

  // Wipes this instance, as removing the network's own key or deleting the network does: its key, cache,
  // and counts. It resets a moment later, cutting off any request still queued or in flight, so the
  // next call meets a new, empty instance. From the wipe's start until then, any call it's still making,
  // and any that reaches it, fails saying so (WIPED), rather than meeting the tables it dropped. A wipe
  // that fails resets it too, with what it kept.
  async wipe() {
    this.wiped = true
    try {
      await this.ctx.storage.deleteAll()
    } finally {
      setTimeout(() => this.ctx.abort(WIPED), 0)
    }
  }

  // Whether this instance's wipe has begun.
  private wiped = false

  // This instance's SQL storage, until its wipe begins.
  private get sql() {
    if (this.wiped) throw new Error(WIPED)
    return this.ctx.storage.sql
  }

  // Tests `key` with one search on `host`, past the cache, and keeps it as this network's own only once
  // Qloo answers, replacing any key before it; or says why Qloo refused it, keeping nothing. The search
  // counts against today's cap like any request, and once the key is saved, among the network's calls,
  // under `visitor`, the key its limits count under (networkLimitKey): it was a call on the network's own
  // key, and this instance serves that network alone. A refused key's search isn't counted there, as its
  // usage doesn't read this instance until a key is saved.
  async setKey(host: string, key: string, visitor: string): Promise<string | null> {
    // The key goes nowhere but Qloo, whatever the caller checked.
    if (!isQlooHost(host)) throw new Error(`${host} isn't one of Qloo's hosts.`)
    const url = new URL(REQUESTS.search.endpoint, host)
    url.search = String(new URLSearchParams(KEY_TEST))
    if (!this.spend()) return `${capReached(this.env.QLOO_DAILY_CALL_CAP)}, so the key can't be tested until then.`
    await this.takeSlot()
    // The test only needs Qloo to answer, so it reads nothing of the answer.
    const tested = await this.attempt(url, undefined, Number(this.env.QLOO_TIMEOUT_MS), key, () => null).finally(() =>
      this.releaseSlot()
    )
    console.log(JSON.stringify({ event: 'qloo_key_test', status: tested.status }))
    if (!tested.ok)
      return `The key's test search on ${new URL(host).host} failed: ${tested.error}. The key isn't saved: check it, and that it's for that host, then try again.`
    this.sql.exec(
      'INSERT OR REPLACE INTO own_key (id, host, sealed, last4) VALUES (1, ?, ?, ?)',
      host,
      await seal(this.env.QLOO_KEY_SECRET, key),
      key.slice(-4)
    )
    const day = utcDay()
    this.add('visitor_calls', await sha256(`${visitor}:${day}`), day)
    return null
  }

  // Why `visitor` can't create another account today, or null when they can
  // (SIGNUP_VISITOR_DAILY_CAP). A sign-up asks as it starts, so a refused one makes no passkey, and
  // with `count` once its passkey verifies, which counts it.
  async admitSignup(visitor: string, count: boolean): Promise<string | null> {
    const day = utcDay()
    const key = await sha256(`${visitor}:${day}`)
    // From here on nothing awaits, so concurrent sign-ups can't both pass the limit.
    // A limit that isn't a number refuses every sign-up, rather than none.
    const limit = Number(this.env.SIGNUP_VISITOR_DAILY_CAP) || 0
    if (this.used('signups', key, day) >= limit)
      return `You've created ${limit === 1 ? '1 account' : `${limit} accounts`} today, the most one visitor can create in a UTC day; it resets at 00:00 UTC.`
    if (count) this.add('signups', key, day)
    return null
  }

  // Counts `n` Qloo calls for `visitor` today before they're made, or refuses them all if they would
  // pass QLOO_VISITOR_DAILY_CALL_CAP. Imports and comp searches ask first, so a refused one keeps
  // nothing; every other call is counted as it's made (forVisitor).
  async reserveCalls(visitor: string, n: number): Promise<string | null> {
    const day = utcDay()
    const key = await sha256(`${visitor}:${day}`)
    // From here on nothing awaits, so concurrent reservations can't both pass the limit.
    // A limit that isn't a number refuses every call, rather than none.
    const limit = Number(this.env.QLOO_VISITOR_DAILY_CALL_CAP) || 0
    const who = whoCounts(visitor)
    if (this.used('visitor_calls', key, day) + n > limit)
      return `This would take ${who.you} past ${limit} Qloo calls today, the most ${who.limitFor} can make in a UTC day${who.sharedClause}, cache hits included; they reset at 00:00 UTC`
    this.add('visitor_calls', key, day, n)
    return null
  }

  // Makes one Qloo request for `visitor`, as `method` makes it, and counts it among their calls today.
  // It's never refused: a run's calls are bounded by the model run limits.
  async forVisitor(visitor: string, method: keyof typeof REQUESTS, args: unknown[]) {
    if (!Object.hasOwn(REQUESTS, method)) throw new Error(`${method} isn't a Qloo request.`)
    const day = utcDay()
    this.add('visitor_calls', await sha256(`${visitor}:${day}`), day, 1)
    return (this[method] as (...a: unknown[]) => Promise<QlooResult<unknown>>)(...args)
  }

  // Counts a model run for `visitor` today, or refuses it once the visitor's daily limit or the
  // daily cap across all visitors is reached (RUN_VISITOR_DAILY_CAP, RUN_DAILY_CAP). Only a run that
  // calls Claude asks, so a replay never counts.
  async startModelRun(visitor: string): Promise<ModelRuns> {
    const day = utcDay()
    return this.countModelRun(await sha256(`${visitor}:${day}`), day, whoCounts(visitor))
  }

  // Decides how a launch starts, in one call: as a model run, counted; or, while Qloo can't be called
  // or a model run limit is reached, as a free start, counted against FREE_START_DAILY_CAP, with the
  // stored sample run when `sample`; or not at all, once the visitor's free starts are used. `down` is
  // why Qloo can't be called, as the gateway the run's calls go through says (health): this one, or a
  // network's own (ADR 0004).
  async admitLaunch(visitor: string, sample: boolean, down: QlooDown | null): Promise<Admission> {
    const day = utcDay()
    const key = await sha256(`${visitor}:${day}`)
    // From here on nothing awaits, so concurrent starts can't both pass a limit.
    const who = whoCounts(visitor)
    const limited = down ? null : this.countModelRun(key, day, who).refused
    if (!down && !limited) return { down, limited, refused: null, stored: null }
    // A limit that isn't a number refuses every start, rather than none.
    const limit = Number(this.env.FREE_START_DAILY_CAP) || 0
    if (this.used('free_starts', key, day) >= limit)
      return {
        down,
        limited,
        refused: `${who.youHave} started ${limit === 1 ? '1 run' : `${limit} runs`} today that replayed or stopped at once, the most ${who.limitFor} can start in a UTC day${who.sharedClause}; they reset at 00:00 UTC`,
        stored: null
      }
    this.add('free_starts', key, day)
    return { down, limited, refused: null, stored: sample ? this.sampleRun() : null }
  }

  // What `visitor` has used today: Qloo calls (QLOO_VISITOR_DAILY_CALL_CAP) and model runs
  // (RUN_VISITOR_DAILY_CAP), as the limits count them.
  async usage(visitor: string): Promise<Usage> {
    const day = utcDay()
    const key = await sha256(`${visitor}:${day}`)
    const resets = new Date(`${day}T00:00:00Z`)
    resets.setUTCDate(resets.getUTCDate() + 1)
    return {
      qlooCalls: {
        used: this.used('visitor_calls', key, day),
        limit: Number(this.env.QLOO_VISITOR_DAILY_CALL_CAP) || 0
      },
      modelRuns: { used: this.used('model_runs', key, day), limit: Number(this.env.RUN_VISITOR_DAILY_CAP) || 0 },
      resets: resets.toISOString()
    }
  }

  // Counts a model run under `key` (a visitor and a day, hashed), or says which limit refuses `who`.
  private countModelRun(key: string, day: string, who: Who): ModelRuns {
    const used = this.used('model_runs', key, day)
    const [all] = this.sql.exec<{ count: number }>('SELECT COALESCE(SUM(count), 0) AS count FROM model_runs').toArray()
    // A limit that isn't a number refuses every run, rather than none.
    const limit = Number(this.env.RUN_VISITOR_DAILY_CAP) || 0
    const cap = Number(this.env.RUN_DAILY_CAP) || 0
    if (used >= limit)
      return {
        used,
        limit,
        refused: `${who.youHave} started ${modelRuns(limit)} today, the most ${who.limitFor} can start in a UTC day${who.sharedClause}; they reset at 00:00 UTC`
      }
    if (all.count >= cap)
      return {
        used,
        limit,
        refused: `Crossfeed's cap of ${modelRuns(cap)} a day across all visitors is reached; it resets at 00:00 UTC`
      }
    this.add('model_runs', key, day)
    return { used: used + 1, limit, refused: null }
  }

  // A visitor's count today in one of the per-visitor counters, once earlier days' counts are dropped.
  private used(counter: Counter, key: string, day: string) {
    const sql = this.sql
    sql.exec(`DELETE FROM ${counter} WHERE day < ?`, day)
    const [row] = sql.exec<{ count: number }>(`SELECT count FROM ${counter} WHERE key = ?`, key).toArray()
    return row?.count ?? 0
  }

  private add(counter: Counter, key: string, day: string, n = 1) {
    this.sql.exec(
      `INSERT INTO ${counter} (key, day, count) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET count = count + ?`,
      key,
      day,
      n,
      n
    )
  }

  // Why Qloo can't be called now, or null when it can: this instance has no key it can send, today's
  // cap is reached, or the latest request sent failed after its retries in the last few minutes. Cache
  // hits say nothing either way.
  async health(): Promise<QlooDown | null> {
    const credentials = await this.credentials()
    if (typeof credentials === 'string') return { capped: false, reason: credentials }
    const cap = Number(this.env.QLOO_DAILY_CALL_CAP)
    if (this.callsToday() >= cap) return { capped: true, reason: capReached(cap) }
    const [failing] = this.sql.exec<{ at: number; error: string }>('SELECT at, error FROM failing').toArray()
    if (failing && Date.now() - failing.at < FAILING_FOR_MS)
      return { capped: false, reason: `Qloo is failing (${failing.error})` }
    return null
  }

  // Keeps a session's completed sample run, replacing the one kept before, for any session to replay.
  keepSampleRun(run: string) {
    this.sql.exec('INSERT OR REPLACE INTO sample_run (id, run) VALUES (1, ?)', run)
  }

  // Replaces the kept sample run with `sampleRun` only while it's still run `run`'s, in one statement,
  // so a newer run kept meanwhile is never lost.
  patchSampleRun(run: string, sampleRun: string) {
    this.sql.exec(
      "UPDATE sample_run SET run = ? WHERE id = 1 AND json_extract(run, '$.state.run.id') = ?",
      sampleRun,
      run
    )
  }

  sampleRun(): string | null {
    const [row] = this.sql.exec<{ run: string }>('SELECT run FROM sample_run').toArray()
    return row?.run ?? null
  }

  // Finds entities by name. Qloo's search is fuzzy, so deciding whether a result is the show is
  // the caller's job (see resolve.ts).
  async search(query: string, type: string, take = 3, cache: CacheUse = 'use'): Promise<QlooResult<QlooEntity[]>> {
    const result = await this.request(
      REQUESTS.search,
      { query, types: type, take },
      (data) =>
        list<SearchResult>(data, 'results').map((r) => ({
          id: r.entity_id,
          name: r.name,
          type: r.types?.[0] ?? type,
          popularity: r.popularity ?? null,
          disambiguation: r.disambiguation ?? null,
          description: describe(r.properties)
        })),
      cache
    )
    if (!result.ok) return result
    const entities = result.data
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
      (data) => {
        const raw = list<InsightResult>(data, 'results', 'entities')
        const affinities = raw.map((r) => ({
          id: r.entity_id,
          name: r.name,
          affinity: r.query?.affinity ?? null,
          explainability: (r.query?.explainability?.['signal.interests.entities'] ?? []).map((x) => ({
            id: x.entity_id,
            score: x.score
          }))
        }))
        return { raw, affinities }
      },
      cache
    )
    if (!result.ok) return result
    const { raw, affinities } = result.data
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
    const result = await this.request(
      REQUESTS.compare,
      {
        'a.signal.interests.entities': a.join(','),
        'b.signal.interests.entities': b,
        take: 50
      },
      (data) =>
        list<CompareTag>(data, 'results', 'tags').map((t) => ({
          id: t.tag_id,
          name: t.name,
          score: t.query?.score ?? null
        }))
    )
    if (!result.ok) return result
    const tags = result.data
    return { ok: true, data: tags, evidence: { ...result.evidence, tags } }
  }

  // Each entity's listeners by age bucket and gender, relative to average, in one call for every
  // entity, sent as one signal. Qloo answers one entry per entity, by ID only and in no set order,
  // so the caller names them. An entry for an entity not asked about means Qloo ignored the signal.
  // The record has no demographics list, so each entity goes in `affinities` with no overall
  // affinity and one score per bucket, such as `age.25_to_29`, as Qloo calls them affinity scores.
  async demographics(entities: { id: string; name: string }[]): Promise<QlooResult<Demographics>> {
    const ids = [...new Set(entities.map((e) => e.id))]
    const name = (id: string) => entities.find((e) => e.id === id)?.name ?? id
    const result = await this.request(
      REQUESTS.demographics,
      {
        'filter.type': 'urn:demographics',
        'signal.interests.entities': ids.join(',')
      },
      (data) => {
        const raw = list<DemographicResult>(data, 'results', 'demographics')
        const affinities = raw.map((r) => ({
          id: r.entity_id,
          name: name(r.entity_id),
          affinity: null,
          explainability: [
            ...Object.entries(r.query?.age ?? {}).map(([bucket, score]) => ({ id: `age.${bucket}`, score })),
            ...Object.entries(r.query?.gender ?? {}).map(([gender, score]) => ({ id: `gender.${gender}`, score }))
          ]
        }))
        return { raw, affinities }
      }
    )
    if (!result.ok) return result
    const { raw, affinities } = result.data
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
  // `read` is how the method reads Qloo's answer: one it can't read fails, and only one it can is kept.
  private async request<T>(
    qlooRequest: QlooRequest,
    params: Params,
    read: (data: unknown) => T,
    cache: CacheUse = 'use'
  ): Promise<QlooResult<T>> {
    const { method, endpoint } = qlooRequest
    const evidence = blankEvidence(qlooRequest, params)
    const credentials = await this.credentials()
    if (typeof credentials === 'string') return this.fail(evidence, credentials)
    const url = new URL(endpoint, credentials.host)
    const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))
    if (method === 'GET') url.search = String(query)
    const payload = method === 'POST' ? JSON.stringify(params) : undefined
    // Latency runs from the first request sent, so time queued behind other calls isn't blamed on Qloo.
    const started = Date.now()
    let sentAt: number | undefined
    const key = await cacheKey(method, endpoint, query)
    const timeoutMs = Number(this.env.QLOO_TIMEOUT_MS)
    const retryDelays = this.env.QLOO_RETRY_DELAYS_MS.split(',').map(Number)
    try {
      const [hit] =
        cache === 'bypass' ? [] : this.sql.exec<CacheRow>('SELECT status, body FROM cache WHERE key = ?', key).toArray()
      // A kept answer is read again; one that no longer reads, such as one kept before its method
      // changed, is asked for again.
      const kept = hit && readAnswer(hit.status, JSON.parse(hit.body), read)
      if (kept?.ok) {
        evidence.status = kept.status
        evidence.cacheHit = true
        return { ok: true, data: kept.value, evidence }
      }
      if (cache === 'only') return this.fail(evidence, 'Not in the cache')
      for (;;) {
        if (!this.spend()) return this.fail(evidence, capReached(this.env.QLOO_DAILY_CALL_CAP) + retried(evidence))
        await this.takeSlot()
        sentAt ??= Date.now()
        const attempt = await this.attempt(url, payload, timeoutMs, credentials.key, read).finally(() =>
          this.releaseSlot()
        )
        evidence.status = attempt.status
        if (attempt.ok) {
          const body = JSON.stringify(attempt.data)
          this.sql.exec('INSERT OR REPLACE INTO cache (key, status, body) VALUES (?, ?, ?)', key, attempt.status, body)
          this.sql.exec('DELETE FROM failing')
          return { ok: true, data: attempt.value, evidence }
        }
        const delay = retryDelays[evidence.retries]
        if (!attempt.retry || delay === undefined) {
          const error = attempt.error + retried(evidence)
          // A 400 is Qloo refusing this request's parameters, which says nothing about Qloo itself.
          if (attempt.status !== 400)
            this.sql.exec('INSERT OR REPLACE INTO failing (id, at, error) VALUES (1, ?, ?)', Date.now(), error)
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

  // Where this instance sends Qloo requests, and with which key: the network's own, for a network's
  // instance, or Crossfeed's, for the global one. Or why it can't send any: a network's instance whose
  // key was removed, or one QLOO_KEY_SECRET no longer opens.
  private async credentials(): Promise<{ host: string; key: string } | string> {
    const [own] = this.sql.exec<{ host: string; sealed: string }>('SELECT host, sealed FROM own_key').toArray()
    if (!own)
      return this.ctx.id.name === GLOBAL
        ? { host: this.env.QLOO_BASE_URL, key: this.env.QLOO_API_KEY }
        : "The network's own Qloo key was removed, so its calls go through Crossfeed's shared key from now on"
    const key = await unseal(this.env.QLOO_KEY_SECRET, own.sealed).catch(() => null)
    if (key === null)
      return "The network's own Qloo key can't be read, since Crossfeed's secret for it has changed. An owner adds the key again in settings"
    return { host: own.host, key }
  }

  // Counts one request against today's cap, or refuses it once the cap is reached. Counted when
  // queued rather than sent, so a refusal doesn't wait its turn; every queued request is sent.
  private spend() {
    if (this.callsToday() >= Number(this.env.QLOO_DAILY_CALL_CAP)) return false
    const day = utcDay()
    this.sql.exec(
      'INSERT INTO daily_calls (day, count) VALUES (?, 1) ON CONFLICT (day) DO UPDATE SET count = count + 1',
      day
    )
    return true
  }

  // Requests counted against today's cap so far.
  private callsToday() {
    const day = utcDay()
    const sql = this.sql
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

  // One request to Qloo, its answer read with `read`. Rate limits, gateway errors, and timeouts are
  // worth retrying; a 400 or any other error is not, and keeps Qloo's message.
  private async attempt<T>(
    url: URL,
    payload: string | undefined,
    timeoutMs: number,
    key: string,
    read: (data: unknown) => T
  ): Promise<Attempt<T>> {
    try {
      const response = await fetch(url, {
        method: payload === undefined ? 'GET' : 'POST',
        headers: {
          'X-Api-Key': key,
          ...(payload !== undefined && { 'Content-Type': 'application/json' })
        },
        body: payload,
        signal: AbortSignal.timeout(timeoutMs)
      })
      const { status } = response
      const body = await response.text()
      // Qloo documents 404 as "No results" for search; live it answers 200 with an empty list.
      if (status === 404) return readAnswer(status, null, read)
      if (!response.ok) {
        const message = errorMessage(body)
        const retry = [429, 502, 503, 504].includes(status)
        return { ok: false, status, retry, error: `Qloo returned ${status}${message ? `: ${message}` : ''}` }
      }
      const data = parseJson(body)
      if (data === undefined)
        return { ok: false, status, retry: false, error: `Qloo returned ${status} with a body that isn't JSON` }
      return readAnswer(status, data, read)
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

type Attempt<T> =
  | { ok: true; status: number; data: unknown; value: T }
  | { ok: false; status: number | null; retry: boolean; error: string }

// An answer as its method reads it, or, when the method can't, an error like a body that isn't
// JSON, never retried or kept.
function readAnswer<T>(status: number, data: unknown, read: (data: unknown) => T): Attempt<T> {
  try {
    return { ok: true, status, data, value: read(data) }
  } catch (e) {
    const error = `Qloo returned ${status} with an answer Crossfeed can't read: ${e instanceof Error ? e.message : String(e)}`
    return { ok: false, status, retry: false, error }
  }
}

// The list at `path` in an answer, or none when it's absent, as when nothing matched. Anything else
// throws, so the answer fails to read.
function list<T>(data: unknown, ...path: string[]): T[] {
  const value = path.reduce<unknown>((v, key) => (v as Record<string, unknown> | null | undefined)?.[key], data)
  if (value == null) return []
  if (!Array.isArray(value)) throw new Error(`${path.join('.')} isn't a list`)
  return value
}

// Who a per-visitor limit counts, in its refusal: whose use it is (`you`, and `youHave` to start a
// sentence), and who the limit is for (`limitFor`), one visitor or one network, as a signed-in network's
// agents count as their network. The guest budget is every guest's, in the guest network and in each
// network a guest creates, which count under the guest network's key (ADR 0006), so its refusals say
// where, in a clause after the limit (`sharedClause`).
type Who = { you: string; youHave: string; limitFor: string; sharedClause: string }
const whoCounts = (visitor: string): Who =>
  visitor === `network:${GUEST_NETWORK}`
    ? {
        you: 'guests',
        youHave: 'Guests have',
        limitFor: 'all guests together',
        sharedClause: ', in the guest network and the networks guests create'
      }
    : {
        you: 'you',
        youHave: "You've",
        limitFor: visitor.startsWith('network:') ? 'one network' : 'one visitor',
        sharedClause: ''
      }

// Today in UTC, such as "2026-10-18": the day the caps count in.
const utcDay = () => new Date().toISOString().slice(0, 10)

const capReached = (cap: string | number) => `The daily cap of ${cap} Qloo calls is reached; it resets at 00:00 UTC`

const retried = ({ retries }: CallEvidence) =>
  retries ? `, after ${retries} ${retries === 1 ? 'retry' : 'retries'}` : ''

type CacheRow = { status: number; body: string }

// The one search a network's own key is tested with before it's saved: any podcast Qloo knows.
const KEY_TEST = { query: 'The Rewatchables', types: 'urn:entity:podcast', take: '1' }

// A network's own Qloo key sealed for storage: AES-GCM under a key derived from QLOO_KEY_SECRET, with a
// fresh IV each time, kept as `<iv>.<ciphertext>` in base64.
async function seal(secret: string, key: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await sealing(secret), utf8.encode(key))
  return `${base64(iv)}.${base64(new Uint8Array(sealed))}`
}

// The key `seal` sealed, or a throw when another secret sealed it.
async function unseal(secret: string, sealed: string) {
  const [iv, data] = sealed.split('.').map(unbase64)
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await sealing(secret), data))
}

// The AES-GCM key behind `seal`, derived from QLOO_KEY_SECRET with HKDF, so any secret long enough to
// guess at makes a key of the right size.
async function sealing(secret: string) {
  const material = await crypto.subtle.importKey('raw', utf8.encode(secret), 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: utf8.encode('crossfeed:qloo-key') },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

const utf8 = new TextEncoder()
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const unbase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))

// A hash of the method, path, and parameters sorted by name, so one request is one entry.
async function cacheKey(method: string, endpoint: string, params: URLSearchParams) {
  const sorted = new URLSearchParams(params)
  sorted.sort()
  return sha256(`${method} ${endpoint}?${sorted}`)
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
