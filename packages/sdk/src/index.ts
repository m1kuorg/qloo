// A typed client for Crossfeed's REST API, for one network, with one of its API keys. Its methods
// mirror the API's routes, typed from the OpenAPI document in openapi.ts, and it needs nothing but
// `fetch`, so it runs in Node, Bun, Deno, and Workers alike. Every refusal rejects as a
// CrossfeedError with the API's code, message, and HTTP status. Nothing here approves an insertion
// order or a reply: only a member does, in the app.
import type { components, paths } from './openapi.ts'

export type { components, paths }
export type Schemas = components['schemas']
export type Network = Schemas['Network']
export type Usage = Schemas['Usage']
export type Roster = Schemas['Roster']
export type Show = Schemas['Show']
export type RosterOverlap = Schemas['RosterOverlap']
export type LaunchPlan = Schemas['LaunchPlan']
export type LaunchSummary = Schemas['LaunchSummary']
export type Launch = Schemas['Launch']
export type LaunchRun = Schemas['LaunchRun']
export type Question = Schemas['Question']
export type Answer = Schemas['Answer']
export type InsertionOrder = Schemas['InsertionOrder']
export type Evidence = Schemas['Evidence']
export type Inbox = Schemas['Inbox']
export type Pitch = Schemas['Pitch']
export type PitchRun = Schemas['PitchRun']
export type Reply = Schemas['Reply']

export type CrossfeedOptions = {
  /** One of the network's API keys, `cf_live_…`, which an owner makes in its settings. */
  apiKey: string
  /** The network's ID, which its settings show under its API keys. */
  networkId: string
  /** Where Crossfeed is served; `https://crossfeed.m1kuorg.workers.dev` unless given. */
  baseUrl?: string
  /** What sends each request; the runtime's own `fetch` unless given. */
  fetch?: (url: string, init: RequestInit) => Promise<Response>
}

/** How long a wait helper polls, and what stops it. */
export type WaitOptions = {
  /** Milliseconds between reads; 1,000 unless given. */
  interval?: number
  /** Milliseconds before it rejects with a `timeout` CrossfeedError; 300,000 (5 minutes) unless given. */
  timeout?: number
  /** Stops the wait, which rejects with the signal's reason. */
  signal?: AbortSignal
}

/**
 * The API's error codes, and the SDK's own: `run_failed` and `run_stopped` for a run a wait helper
 * saw end without completing, `timeout` for a wait that ran out of time, and `unexpected_response`
 * for an answer that isn't one of Crossfeed's errors, as from a wrong `baseUrl`.
 */
export type ErrorCode =
  Schemas['Error']['error']['code'] | 'run_failed' | 'run_stopped' | 'timeout' | 'unexpected_response'

/**
 * A refusal: the API's stable `code` to branch on, its `message` for a person, and the HTTP
 * `status`, which is null for the wait helpers' own errors.
 */
export class CrossfeedError extends Error {
  readonly code: ErrorCode
  readonly status: number | null

  constructor(code: ErrorCode, message: string, status: number | null) {
    super(message)
    this.name = 'CrossfeedError'
    this.code = code
    this.status = status
  }
}

/** What stops a read, such as a wait helper's. */
export type ReadOptions = { signal?: AbortSignal }

/** A file to send as a request's body. */
export type FileBody = string | Blob | BufferSource

type Method = 'get' | 'post' | 'patch' | 'delete'
type Route = keyof paths
type Operation<R extends Route, M extends Method> = NonNullable<paths[R][M]>
// A route's path parameters, but for the network's, which the client fills in.
type Params<O> = O extends { parameters: { path: infer P } } ? Omit<P, 'networkId'> : never
type Query<O> = O extends { parameters: { query?: infer Q } } ? Q : never
type JsonBody<O> = O extends { requestBody?: { content: { 'application/json': infer B } } } ? B : never
// The media types a route takes a file in.
type Files<O> = O extends { requestBody?: { content: infer C } } ? Exclude<keyof C, 'application/json'> : never
// What a route answers when it succeeds, as JSON.
type Success<O> = O extends { responses: infer R }
  ? R[Extract<keyof R, 200 | 201 | 202>] extends { content: { 'application/json': infer T } }
    ? T
    : never
  : never
type RequestOptions<O> = ({} extends Params<O> ? { params?: undefined } : { params: Params<O> }) & {
  query?: Query<O>
  json?: JsonBody<O>
  file?: { body: FileBody; type: Files<O> }
  signal?: AbortSignal
}

/**
 * Loads the inbox, answering at once with the pitches reading; wait with `waitForInbox`. Pitches go
 * one by one, or as a file of the `type` given: an .eml (`message/rfc822`), an .mbox export
 * (`application/mbox`), or text with a line of `---` between pitches (`text/plain`). Over an inbox
 * that has pitches, it needs `replace: true`.
 */
type LoadInbox = {
  (pitches: Schemas['PitchBatch'], options?: { replace?: boolean }): Promise<Inbox>
  (file: FileBody, options: { type: PitchFile; replace?: boolean }): Promise<Inbox>
}

/** The media types a roster file is sent as: a CSV, or one show name per line. */
export type RosterFile = Files<Operation<'/api/v1/networks/{networkId}/roster', 'post'>>
/** The media types pitches are sent as: an .eml, an .mbox export, or text with `---` between pitches. */
export type PitchFile = Files<Operation<'/api/v1/networks/{networkId}/inbox', 'post'>>

export class Crossfeed {
  readonly #apiKey: string
  readonly #networkId: string
  readonly #baseUrl: string
  readonly #fetch: (url: string, init: RequestInit) => Promise<Response>

  constructor({ apiKey, networkId, baseUrl = 'https://crossfeed.m1kuorg.workers.dev', fetch }: CrossfeedOptions) {
    this.#apiKey = apiKey
    this.#networkId = networkId
    this.#baseUrl = baseUrl.replace(/\/+$/, '')
    // Called, not kept as a method, as Workers refuse a `fetch` called on anything but its global.
    this.#fetch = fetch ?? ((url, init) => globalThis.fetch(url, init))
  }

  /** The network: its name, its CPM, and today's usage against its daily caps. */
  readonly network = {
    get: () => this.#json('get', '/api/v1/networks/{networkId}', {}),
    /** Renames it or sets its CPM; a field left out stays as it is. */
    update: (change: Schemas['NetworkChange']) => this.#json('patch', '/api/v1/networks/{networkId}', { json: change }),
    usage: () => this.#json('get', '/api/v1/networks/{networkId}/usage', {})
  }

  /** The network's roster of shows, each matched in Qloo. */
  readonly roster = {
    get: ({ signal }: ReadOptions = {}) => this.#json('get', '/api/v1/networks/{networkId}/roster', { signal }),
    /**
     * Imports a roster file: a CSV with a `name` column and optional `downloads`, `status`, and
     * `description` columns, or, as `text/plain`, one show name per line. It answers at once with
     * the new shows pending; wait with `waitForRoster`. Over a roster that has shows, it needs
     * `replace: true`.
     */
    import: (file: FileBody, { type = 'text/csv', replace }: { type?: RosterFile; replace?: boolean } = {}) =>
      this.#json('post', '/api/v1/networks/{networkId}/roster', {
        query: replaceQuery(replace),
        file: { body: file, type }
      }),
    /** Picks an ambiguous show's candidate, maps it to a comp, or changes its figures or exclusion. */
    updateShow: (name: string, change: Schemas['ShowChange']) =>
      this.#json('patch', '/api/v1/networks/{networkId}/roster/shows/{name}', { params: { name }, json: change }),
    /** Searches Qloo for a comp to stand in for a show it has no match for; wait with `waitForRoster`. */
    searchComps: (name: string, query: string) =>
      this.#json('post', '/api/v1/networks/{networkId}/roster/shows/{name}/comp-search', {
        params: { name },
        json: { query }
      }),
    /** Which of its shows share listeners: each show's closest shows in Qloo, and the close pairs. */
    overlap: ({ signal }: ReadOptions = {}) =>
      this.#json('get', '/api/v1/networks/{networkId}/roster/overlap', { signal }),
    /**
     * Measures the overlap, one Qloo call per show matched in Qloo, or with the roster's matched shows
     * unchanged, per show whose ranking is missing or failed. It answers at once with the overlap
     * measuring; wait with `waitForOverlap`.
     */
    measureOverlap: () => this.#json('post', '/api/v1/networks/{networkId}/roster/overlap', {})
  }

  /** The network's launches, each with its own runs and insertion orders. */
  readonly launches = {
    list: () => this.#json('get', '/api/v1/networks/{networkId}/launches', {}),
    /** Plans a launch by its name, as Qloo lists a released show, or by up to three released shows as comps. */
    create: (plan: LaunchPlan) => this.#json('post', '/api/v1/networks/{networkId}/launches', { json: plan }),
    /** The launch, its runs, and its latest run in full. */
    get: (launchId: string) =>
      this.#json('get', '/api/v1/networks/{networkId}/launches/{launchId}', { params: { launchId } }),
    /** Refused to an API key with a `forbidden` CrossfeedError: a member deletes a launch, in the app. */
    delete: async (launchId: string): Promise<void> => {
      await this.#send('delete', '/api/v1/networks/{networkId}/launches/{launchId}', { params: { launchId } })
    }
  }

  /** A launch's runs: each ranks the roster for the launch and drafts its insertion order. */
  readonly runs = {
    /**
     * Starts a run, as the launch was planned, or anew from a name or comps. It answers at once with
     * the run running; wait with `waitForRun`.
     */
    start: (launchId: string, plan?: LaunchPlan) =>
      this.#json('post', '/api/v1/networks/{networkId}/launches/{launchId}/runs', { params: { launchId }, json: plan }),
    get: (launchId: string, runId: string, { signal }: ReadOptions = {}) =>
      this.#json('get', '/api/v1/networks/{networkId}/launches/{launchId}/runs/{runId}', {
        params: { launchId, runId },
        signal
      }),
    /** Answers the question the run waits on, with the person's own words; wait with `waitForRun` again. */
    answer: (launchId: string, runId: string, answer: Answer) =>
      this.#json('post', '/api/v1/networks/{networkId}/launches/{launchId}/runs/{runId}/answer', {
        params: { launchId, runId },
        json: answer
      })
  }

  /** A launch's insertion orders, which only a member approves, in the app. */
  readonly insertionOrders = {
    /** Changes the current draft's lines; editing an approved order returns it to draft. */
    edit: (launchId: string, orderId: string, change: Schemas['OrderChange']) =>
      this.#json('patch', '/api/v1/networks/{networkId}/launches/{launchId}/insertion-orders/{orderId}', {
        params: { launchId, orderId },
        json: change
      }),
    /**
     * The order as the CSV file the app exports, byte-order mark included. A draft is refused with a
     * `conflict` CrossfeedError until a member approves it.
     */
    exportCsv: async (launchId: string, orderId: string): Promise<string> => {
      const res = await this.#send(
        'get',
        '/api/v1/networks/{networkId}/launches/{launchId}/insertion-orders/{orderId}/csv',
        { params: { launchId, orderId } }
      )
      return new TextDecoder('utf-8', { ignoreBOM: true }).decode(await res.arrayBuffer())
    }
  }

  /** A launch's evidence: one record per Qloo call its runs made, each cited by its call number. */
  readonly evidence = {
    list: (launchId: string) =>
      this.#json('get', '/api/v1/networks/{networkId}/launches/{launchId}/evidence', { params: { launchId } })
  }

  /** The network's inbox of guest pitches, while guest pitches are switched on. */
  readonly inbox = {
    get: ({ signal }: ReadOptions = {}) => this.#json('get', '/api/v1/networks/{networkId}/inbox', { signal }),
    load: ((
      source: Schemas['PitchBatch'] | FileBody,
      { type, replace }: { type?: PitchFile; replace?: boolean } = {}
    ) =>
      this.#json('post', '/api/v1/networks/{networkId}/inbox', {
        query: replaceQuery(replace),
        ...(type ? { file: { body: source as FileBody, type } } : { json: source as Schemas['PitchBatch'] })
      })) as LoadInbox,
    /** Confirms which of an ambiguous work's same-title candidates a pitch is about. */
    confirmWork: (pitchId: string, entityId: string) =>
      this.#json('patch', '/api/v1/networks/{networkId}/inbox/pitches/{pitchId}', {
        params: { pitchId },
        json: { entityId }
      })
  }

  /** Pitch runs: each ranks the inbox's pitched works against a show, then drafts a reply to every pitch. */
  readonly pitchRuns = {
    /** Starts a pitch run against a roster show matched in Qloo; wait with `waitForRun`. */
    start: (start: Schemas['PitchRunStart']) =>
      this.#json('post', '/api/v1/networks/{networkId}/pitch-runs', { json: start }),
    /** The network's pitch runs, newest first: the first is the latest, whose replies the inbox holds. */
    list: () => this.#json('get', '/api/v1/networks/{networkId}/pitch-runs', {}),
    get: (runId: string, { signal }: ReadOptions = {}) =>
      this.#json('get', '/api/v1/networks/{networkId}/pitch-runs/{runId}', { params: { runId }, signal }),
    /** Answers the question the run waits on, with the person's own words; wait with `waitForRun` again. */
    answer: (runId: string, answer: Answer) =>
      this.#json('post', '/api/v1/networks/{networkId}/pitch-runs/{runId}/answer', { params: { runId }, json: answer })
  }

  /** The latest pitch run's drafted replies, which only a member approves, in the app. */
  readonly replies = {
    /** Rewords a reply; editing an approved reply returns it to draft, and a discarded one is restored. */
    edit: (runId: string, pitchId: string, draft: string) =>
      this.#json('patch', '/api/v1/networks/{networkId}/pitch-runs/{runId}/replies/{pitchId}', {
        params: { runId, pitchId },
        json: { draft }
      }),
    discard: (runId: string, pitchId: string) =>
      this.#json('post', '/api/v1/networks/{networkId}/pitch-runs/{runId}/replies/{pitchId}/discard', {
        params: { runId, pitchId }
      })
  }

  /** Resolves with the roster once no show or comp search is still being looked up in Qloo. */
  waitForRoster(options: WaitOptions = {}): Promise<Roster> {
    return poll(
      (signal) => this.roster.get({ signal }),
      (roster) => roster.status === 'settled',
      'The roster was still pending',
      options
    )
  }

  /**
   * Resolves with a launch's run, or with a pitch run, once it's no longer running: completed, or
   * waiting on its question. A run that failed or stopped rejects with a `run_failed` or
   * `run_stopped` CrossfeedError, its message saying why.
   */
  waitForRun(run: { launchId: string; runId: string }, options?: WaitOptions): Promise<LaunchRun>
  waitForRun(run: { pitchRunId: string }, options?: WaitOptions): Promise<PitchRun>
  async waitForRun(
    run: { launchId: string; runId: string } | { pitchRunId: string },
    options: WaitOptions = {}
  ): Promise<LaunchRun | PitchRun> {
    const read =
      'pitchRunId' in run
        ? (signal?: AbortSignal) => this.pitchRuns.get(run.pitchRunId, { signal })
        : (signal?: AbortSignal) => this.runs.get(run.launchId, run.runId, { signal })
    const id = 'pitchRunId' in run ? run.pitchRunId : run.runId
    const settled = await poll<LaunchRun | PitchRun>(
      read,
      (r) => r.status !== 'running',
      `Run ${id} was still running`,
      options
    )
    if (settled.status === 'failed' || settled.status === 'stopped')
      throw new CrossfeedError(`run_${settled.status}`, settled.error ?? `Run ${id} ${settled.status}.`, null)
    return settled
  }

  /** Resolves with the roster's overlap once it's no longer measuring: measured, or failed with why. */
  waitForOverlap(options: WaitOptions = {}): Promise<RosterOverlap> {
    return poll(
      (signal) => this.roster.overlap({ signal }),
      (overlap) => overlap.status !== 'measuring',
      'The overlap was still measuring',
      options
    )
  }

  /** Resolves with the inbox once no pitch is still being read. */
  waitForInbox(options: WaitOptions = {}): Promise<Inbox> {
    return poll(
      (signal) => this.inbox.get({ signal }),
      (inbox) => inbox.status !== 'reading',
      'The inbox was still reading',
      options
    )
  }

  // Sends a request to a route, filling in its path, and rejects with the API's error unless it
  // succeeds.
  async #send<R extends Route, M extends Method>(
    method: M,
    route: R,
    { params, query, json, file, signal }: RequestOptions<Operation<R, M>>
  ): Promise<Response> {
    const values: Record<string, string> = { ...params, networkId: this.#networkId }
    const url = new URL(this.#baseUrl + route.replace(/\{(\w+)\}/g, (_, name) => encodeURIComponent(values[name])))
    for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, String(value))
    const headers: Record<string, string> = { Authorization: `Bearer ${this.#apiKey}` }
    let body: FileBody | undefined
    if (json !== undefined) {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(json)
    } else if (file) {
      headers['Content-Type'] = file.type as string
      body = file.body
    }
    const res = await this.#fetch(url.href, { method: method.toUpperCase(), headers, body, signal })
    if (res.ok) return res
    const text = await res.text()
    const error = parsed(text)?.error
    if (typeof error?.code === 'string' && typeof error.message === 'string')
      throw new CrossfeedError(error.code as ErrorCode, error.message, res.status)
    throw new CrossfeedError(
      'unexpected_response',
      `${method.toUpperCase()} ${url.pathname} answered ${res.status}, not with one of Crossfeed's errors. Check baseUrl. It said: ${text.slice(0, 200)}`,
      res.status
    )
  }

  async #json<R extends Route, M extends Method>(
    method: M,
    route: R,
    request: RequestOptions<Operation<R, M>>
  ): Promise<Success<Operation<R, M>>> {
    return (await this.#send(method, route, request)).json()
  }
}

// A `replace` query: left out unless given.
const replaceQuery = (replace?: boolean): { replace?: 'true' | 'false' } =>
  replace === undefined ? {} : { replace: replace ? 'true' : 'false' }

// A body's JSON, or undefined when it isn't JSON.
function parsed(text: string): { error?: { code?: unknown; message?: unknown } } | undefined {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

// Reads with `read` every `interval` milliseconds until `settled` passes what it read, and resolves
// with that. Past `timeout` it rejects with a `timeout` CrossfeedError that begins with `pending`;
// once `signal` aborts, with its reason.
async function poll<T>(
  read: (signal?: AbortSignal) => Promise<T>,
  settled: (value: T) => boolean,
  pending: string,
  { interval = 1000, timeout = 300_000, signal }: WaitOptions
): Promise<T> {
  const deadline = Date.now() + timeout
  for (;;) {
    signal?.throwIfAborted()
    const value = await read(signal)
    if (settled(value)) return value
    if (Date.now() >= deadline)
      throw new CrossfeedError(
        'timeout',
        `${pending} after ${timeout / 1000} s. Wait again, or give a longer timeout.`,
        null
      )
    await sleep(Math.min(interval, deadline - Date.now()), signal)
  }
}

// Resolves after `ms` milliseconds, or rejects with `signal`'s reason once it aborts, at once if it
// already has, as when a `fetch` that ignores signals finished a read after the abort.
function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const abort = () => {
      clearTimeout(timer)
      reject(signal!.reason)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', abort, { once: true })
  })
}
