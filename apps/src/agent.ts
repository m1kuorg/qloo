import type Anthropic from '@anthropic-ai/sdk'
import { Agent, callable, type Connection } from 'agents'
import { claude } from './claude'
import { callNumber, type Evidence } from './evidence'
import type { QlooGateway, QlooResult } from './gateway'
import { resolveName, type Candidate, type Lookup } from './resolve'
import { parseRoster, type RosterFormat } from './roster'
import { tools, type ToolContext, type ToolResult } from './tools'

export type Show = {
  name: string
  // `mapped`: the programmer stood a comparable show in for one Qloo doesn't have.
  resolution: 'resolved' | 'mapped' | 'ambiguous' | 'missed' | 'failed'
  entity: Candidate | null // the matched Qloo entity, or the comp's once mapped
  candidates: Candidate[] // up to three when the name was ambiguous, kept after a pick
  evidence: string // the call number of the search behind the resolution
  error: string | null // why the search failed
  compSearch: { query: string; call: string; results: Candidate[] } | null // the latest search for a comp
  downloads: number | null // per episode
  status: string | null // the network's own word, such as "active" or "hiatus"
  description: string | null
  excluded: boolean // never proposed for a launch, such as a show mid-sale
}

// What the programmer can change about a show; a field left out stays as it is. `entityId` picks
// one of its candidates, and `compId` maps it to one of its comp search's results.
export type ShowPatch = {
  entityId?: string
  compId?: string
  downloads?: number | null
  status?: string | null
  excluded?: boolean
}
const PATCH_KEYS = ['entityId', 'compId', 'downloads', 'status', 'excluded']

// One Qloo comparison ranks at most 50 candidates, and scores from separate calls aren't comparable.
const MAX_SHOWS = 50

// What a launch run starts from: a released launch's name, or up to three comps standing in for an
// unreleased one (#40).
export type LaunchInput = { name: string } | { comps: string[] }

export type Launch = {
  name: string | null // null for a launch run from comps
  match: Lookup | null // how the launch resolved in Qloo; null until the run has looked it up
}

export type Run = {
  id: string
  status: 'running' | 'completed' | 'failed'
  notes: Note[] // one per tool call, in the order the calls started
  error: string | null // why the run failed
}

// A progress note code writes for a tool call, such as "Resolving The Big Picture".
export type Note = { text: string; status: 'running' | 'done' | 'failed' }

// Everything the UI renders, synced to every connection of this session. Later tickets add
// their own fields; the evidence log stays out of it and is fetched with getEvidence.
export type State = {
  roster: Show[]
  cpm: number | null // CPM in dollars; no default for a real network
  launch: Launch | null
  run: Run | null
}

// One instance per visitor session, named by the session cookie.
export class CrossfeedAgent extends Agent<Env, State> {
  initialState: State = { roster: [], cpm: null, launch: null, run: null }

  async onStart() {
    this.sql`CREATE TABLE IF NOT EXISTS evidence (seq INTEGER PRIMARY KEY AUTOINCREMENT, record TEXT)`
    // Each run's conversation with Claude, append-only: one row per message, thinking blocks kept.
    this.sql`CREATE TABLE IF NOT EXISTS conversation (seq INTEGER PRIMARY KEY AUTOINCREMENT, run TEXT, message TEXT)`
    // A run is kept alive while its loop runs, so one still running at startup lost its loop.
    const run = this.state.run
    if (run?.status === 'running') this.finish(run.id, 'The run was interrupted. Start it again.')
  }

  // State changes only through actions; a client can't write it directly.
  validateStateChange(_next: State, source: Connection | 'server') {
    if (source !== 'server') throw new Error('State is read-only; use an action')
  }

  // Replaces the roster with pasted show names, one per line, or a CSV with a `name` column and
  // optional `downloads`, `status`, and `description` columns. Each show is resolved through Qloo.
  @callable()
  async importRoster(text: string, format: RosterFormat = 'lines') {
    const rows = parseRoster(text, format)
    if (rows.length === 0)
      throw new Error(format === 'csv' ? 'The CSV has no show rows.' : 'Paste at least one show name, one per line.')
    if (rows.length > MAX_SHOWS)
      throw new Error(
        `${rows.length} shows is over the ${MAX_SHOWS}-show limit: one comparison scores at most ${MAX_SHOWS} shows, Qloo's largest page, and scores from separate comparisons can't be compared. Import ${MAX_SHOWS} shows or fewer.`
      )
    // One search at a time: Qloo answered 429 to bursts of three fast searches. #35 moves pacing
    // and retries into the gateway.
    const roster: Show[] = []
    for (const { name, ...fields } of rows) {
      const { call, result } = await this.qloo((gateway) => gateway.search(name, 'urn:entity:podcast'))
      const match = result.ok
        ? { ...resolveName(name, result.data), error: null }
        : { resolution: 'failed' as const, entity: null, candidates: [], error: result.error }
      roster.push({ name, ...match, evidence: call, compSearch: null, ...fields, excluded: false })
    }
    this.setState({ ...this.state, roster })
  }

  // Searches Qloo for a comparable show to stand in for one it can't match, such as a miss.
  @callable()
  async searchComps(name: string, query: string) {
    this.show(name)
    const q = query.trim()
    if (!q) throw new Error('Type the name of a comparable show.')
    const { call, result } = await this.qloo((gateway) => gateway.search(q, 'urn:entity:podcast', 5))
    if (!result.ok) throw new Error(`The search for "${q}" failed: ${result.error}`)
    const results = result.data.map(({ id, name, popularity }) => ({ id, name, popularity }))
    // Read the show again: the roster may have changed while Qloo answered.
    this.editShow(name, (show) => ({ ...show, compSearch: { query: q, call, results } }))
  }

  // Settles or edits one show, named as imported. A patch that fails changes nothing.
  @callable()
  updateShow(name: string, patch: ShowPatch) {
    const unknown = Object.keys(patch).filter((k) => !PATCH_KEYS.includes(k))
    if (unknown.length > 0) throw new Error(`Can't change ${unknown.join(', ')}.`)
    this.editShow(name, (show) => {
      const next = { ...show }
      if (patch.entityId !== undefined) {
        const entity = show.candidates.find((c) => c.id === patch.entityId)
        if (!entity) throw new Error(`That isn't one of the candidates for ${name}.`)
        Object.assign(next, { resolution: 'resolved', entity })
      }
      if (patch.compId !== undefined) {
        const entity = show.compSearch?.results.find((c) => c.id === patch.compId)
        if (!entity) throw new Error(`That isn't one of the search results for ${name}.`)
        // A comp replaces the name's own candidates, and the comp's search becomes the evidence.
        Object.assign(next, { resolution: 'mapped', entity, candidates: [], evidence: show.compSearch!.call })
      }
      if (patch.downloads !== undefined) {
        const d = patch.downloads
        if (d !== null && !(Number.isSafeInteger(d) && d >= 0))
          throw new Error('Downloads per episode must be a whole number, 0 or more.')
        next.downloads = d
      }
      if (patch.status !== undefined) {
        if (patch.status !== null && typeof patch.status !== 'string') throw new Error('Status must be text.')
        next.status = patch.status?.trim() || null
      }
      if (patch.excluded !== undefined) {
        if (typeof patch.excluded !== 'boolean') throw new Error('Excluded must be true or false.')
        next.excluded = patch.excluded
      }
      return next
    })
  }

  // The network's CPM in dollars, which prices every promo slot.
  @callable()
  setCpm(cpm: number) {
    if (typeof cpm !== 'number' || !Number.isFinite(cpm) || cpm <= 0)
      throw new Error('The CPM must be a dollar amount above 0.')
    this.setState({ ...this.state, cpm })
  }

  // Starts a launch run and returns at once; the run's progress arrives in synced state.
  @callable()
  async startLaunch(input: LaunchInput) {
    const given = typeof input === 'object' && input !== null ? input : {} // it arrives as untrusted JSON
    if ('comps' in given) throw new Error("Starting from comps isn't available yet. Name a released launch.")
    const name = 'name' in given && typeof given.name === 'string' ? given.name.trim() : ''
    if (!name) throw new Error('Name the launch to start a run.')
    if (this.state.run?.status === 'running') throw new Error('A run is already in progress. Wait for it to finish.')

    const run = crypto.randomUUID()
    this.setState({
      ...this.state,
      launch: { name, match: null },
      run: { id: run, status: 'running', notes: [], error: null }
    })
    this.append(run, { role: 'user', content: `The launch is a released show named "${name}". Plan its promos.` })
    void this.keepAliveWhile(() => this.runLoop(run)).catch((e) => this.finish(run, `The run stopped: ${message(e)}`))
    return { runId: run }
  }

  // The session's evidence log: one record per Qloo call, oldest first.
  @callable()
  getEvidence(): Evidence[] {
    return this.sql<{ record: string }>`SELECT record FROM evidence WHERE record IS NOT NULL ORDER BY seq`.map((r) =>
      JSON.parse(r.record)
    )
  }

  private show(name: string) {
    const show = this.state.roster.find((s) => s.name === name)
    if (!show) throw new Error(`No show named "${name}" in the roster.`)
    return show
  }

  private editShow(name: string, edit: (show: Show) => Show) {
    const show = this.show(name)
    const next = edit(show)
    this.setState({ ...this.state, roster: this.state.roster.map((s) => (s === show ? next : s)) })
  }

  // The agent loop: call Claude, run every tool it asks for at once, and send all the results back
  // in one message, until it ends its turn. Any failure ends the run as failed, with the reason.
  private async runLoop(run: string) {
    const model = claude(this.env)
    for (;;) {
      let reply: Anthropic.Message
      try {
        reply = await model(this.history(run))
      } catch (e) {
        return this.finish(run, `The request to Claude failed: ${message(e)}`)
      }
      // Check the stop reason before reading content: a refused or cut-off reply is discarded.
      if (reply.stop_reason === 'refusal') return this.finish(run, refusalNotice(reply))
      if (reply.stop_reason === 'max_tokens')
        return this.finish(run, "Claude's reply hit the output limit, so its tool calls were not run.")
      const assistant: Anthropic.MessageParam = { role: 'assistant', content: reply.content }
      if (reply.stop_reason === 'end_turn') {
        this.append(run, assistant)
        return this.finish(run, null)
      }
      const calls = reply.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      if (reply.stop_reason !== 'tool_use' || calls.length === 0)
        return this.finish(run, `Claude stopped unexpectedly (${reply.stop_reason}).`)
      const results = await Promise.all(calls.map((call) => this.callTool(run, call)))
      // The turn and its results are stored together, so history never ends on an unanswered call.
      this.append(run, assistant, { role: 'user', content: results })
    }
  }

  private async callTool(run: string, call: Anthropic.ToolUseBlock): Promise<Anthropic.ToolResultBlockParam> {
    const tool = tools.find((t) => t.definition.name === call.name)
    const note = this.addNote(run, tool ? tool.note(call.input) : `Calling ${call.name}`)
    const context: ToolContext = {
      run,
      qloo: (request) => this.qloo(request, run),
      update: (change) => {
        const next = change(this.state)
        if (next !== this.state) this.setState(next)
      }
    }
    let result: ToolResult
    try {
      result = tool
        ? await tool.run(call.input, context)
        : {
            isError: true,
            content: `There is no tool named ${call.name}. Use one of: ${tools.map((t) => t.definition.name).join(', ')}.`
          }
    } catch (e) {
      result = {
        isError: true,
        content: `${call.name} failed: ${message(e)}. Try once more; if it fails again, stop and say what is missing.`
      }
    }
    this.updateRun(run, (r) => ({
      ...r,
      notes: r.notes.map((n, i) => (i === note ? { ...n, status: result.isError ? 'failed' : 'done' } : n))
    }))
    return {
      type: 'tool_result',
      tool_use_id: call.id,
      content: result.content,
      ...(result.isError && { is_error: true })
    }
  }

  // Adds a running note to the run and returns its index.
  private addNote(run: string, text: string) {
    let index = -1
    this.updateRun(run, (r) => {
      index = r.notes.length
      return { ...r, notes: [...r.notes, { text, status: 'running' }] }
    })
    return index
  }

  // Ends the run: completed when `error` is null, else failed with the reason and any unfinished
  // notes marked failed.
  private finish(run: string, error: string | null) {
    this.updateRun(run, (r) =>
      error === null
        ? { ...r, status: 'completed' }
        : {
            ...r,
            status: 'failed',
            error,
            notes: r.notes.map((n) => (n.status === 'running' ? { ...n, status: 'failed' } : n))
          }
    )
  }

  private updateRun(run: string, change: (r: Run) => Run) {
    if (this.state.run?.id === run) this.setState({ ...this.state, run: change(this.state.run) })
  }

  private history(run: string): Anthropic.MessageParam[] {
    return this.sql<{ message: string }>`SELECT message FROM conversation WHERE run = ${run} ORDER BY seq`.map((r) =>
      JSON.parse(r.message)
    )
  }

  private append(run: string, ...messages: Anthropic.MessageParam[]) {
    for (const m of messages) this.sql`INSERT INTO conversation (run, message) VALUES (${run}, ${JSON.stringify(m)})`
  }

  // The session's only path to Qloo. It numbers the call when the call starts, so numbers follow
  // the order calls were made, and appends the gateway's evidence, success or failure.
  private async qloo<T>(
    request: (gateway: DurableObjectStub<QlooGateway>) => Promise<QlooResult<T>>,
    run: string | null = null
  ) {
    const [{ seq }] = this.sql<{ seq: number }>`INSERT INTO evidence (record) VALUES (NULL) RETURNING seq`
    const call = callNumber(seq)
    const result = (await request(this.env.QlooGateway.getByName('global'))) as QlooResult<T>
    const record: Evidence = { call, run, ...result.evidence }
    this.sql`UPDATE evidence SET record = ${JSON.stringify(record)} WHERE seq = ${seq}`
    return { call, result }
  }
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

// A refusal has no server-side fallback on this model, so the run stops and shows it.
function refusalNotice(reply: Anthropic.Message) {
  const category = reply.stop_details?.type === 'refusal' ? reply.stop_details.category : null
  return `Claude declined to continue this run${category ? ` (safety category: ${category})` : ''}.`
}
