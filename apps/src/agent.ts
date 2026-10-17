import type Anthropic from '@anthropic-ai/sdk'
import { Agent, callable, type Connection } from 'agents'
import { claude } from './claude'
import { callNumber, type Evidence } from './evidence'
import { pitchReader } from './extract'
import { markFinalists, scorable, type Ranking } from './fit'
import type { QlooGateway, QlooResult } from './gateway'
import { qlooType, readInbox, type Inbox, type Pitch } from './inbox'
import { MAX_QLOO_CALLS, MAX_RUNS_PER_DAY, MAX_TURNS, startOfUtcDay } from './limits'
import { lookup, lookupWork, type Candidate, type Lookup } from './resolve'
import { parseRoster, type RosterFormat } from './roster'
import { tools, type ToolContext, type ToolResult } from './tools'

export type Show = {
  name: string
  // `mapped`: the programmer stood a comparable show in for one Qloo doesn't have.
  // `pending`: its search hasn't settled yet.
  resolution: 'pending' | 'resolved' | 'mapped' | 'ambiguous' | 'missed' | 'failed'
  entity: Candidate | null // the matched Qloo entity, or the comp's once mapped
  candidates: Candidate[] // up to three when the name was ambiguous, kept after a pick
  evidence: string // the call number of the search behind the resolution
  error: string | null // why the search failed
  compSearch: CompSearch | null // the latest search for a comp
  downloads: number | null // per episode
  status: string | null // the network's own word, such as "active" or "hiatus"
  description: string | null
  excluded: boolean // never proposed for a launch, such as a show mid-sale
}

// A search for a comp: pending until Qloo answers, then done with its results, or failed with the
// reason.
export type CompSearch = {
  query: string
  call: string
  status: 'pending' | 'done' | 'failed'
  results: Candidate[]
  error: string | null
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
  // stopped: at a turn or Qloo call limit; waiting: paused on `question` until the programmer answers
  status: 'running' | 'waiting' | 'completed' | 'stopped' | 'failed'
  notes: Note[] // one per tool call, in the order the calls started
  error: string | null // why the run failed or stopped
  question: Question | null // the open question, from ask_human
  budget: Budget | null // the slot budget the programmer gave this run; only their answer sets it
  exclusions: string[] | null // show names left out of this run only; null until answered
}

export type Budget = { slots: number } | { dollars: number }

// A question the agent put to the programmer. `choice` is a fork in the plan, answered with one of
// its options or free text.
export type Question = {
  id: string // the ask_human call's tool use ID
  kind: 'choice' | 'budget' | 'exclusions'
  question: string
  options: string[]
}

// How the programmer answers: `choice` or `text` for a choice question, `slots` or `dollars` for
// the budget, `exclude` for exclusions, and free `text` as a note on any other kind.
export type Reply = { choice?: string; text?: string; slots?: number; dollars?: number; exclude?: string[] }

// One run in the session's list of runs. Its results, once it ends, come from getRun.
export type RunSummary = {
  id: string
  launch: string | null // the launch's name; null for a launch run from comps
  status: Run['status']
  startedAt: string // ISO time
}

// A progress note code writes for a tool call, such as "Resolving The Big Picture".
export type Note = { text: string; status: 'running' | 'done' | 'failed' }

// Everything the UI renders, synced to every connection of this session. Later tickets add
// their own fields; the evidence log stays out of it and is fetched with getEvidence.
export type State = {
  roster: Show[]
  cpm: number | null // CPM in dollars; no default for a real network
  launch: Launch | null
  run: Run | null // the latest run
  runs: RunSummary[] // every run this session started, oldest first
  ranking: Ranking | null // the current run's fit chart, once the roster is ranked
  inbox: Inbox | null // the booker's guest pitches, when GUEST_PITCHES is on
}

// What a run ended with: the synced state as it was then, so a re-run's plan can be compared to it.
export type RunSnapshot = Omit<State, 'runs'>

// Pitches read at once: each is one model call, then one Qloo search the gateway paces.
const READ_CONCURRENCY = 5

// One instance per visitor session, named by the session cookie.
export class CrossfeedAgent extends Agent<Env, State> {
  initialState: State = { roster: [], cpm: null, launch: null, run: null, runs: [], ranking: null, inbox: null }

  async onStart() {
    this.sql`CREATE TABLE IF NOT EXISTS evidence (seq INTEGER PRIMARY KEY AUTOINCREMENT, record TEXT)`
    // Each run's conversation with Claude, append-only: one row per message, thinking blocks kept.
    this.sql`CREATE TABLE IF NOT EXISTS conversation (seq INTEGER PRIMARY KEY AUTOINCREMENT, run TEXT, message TEXT)`
    // One row per run: its start in epoch ms, what it has spent against the run limits, and, once it
    // has ended, the state it ended with.
    this.sql`CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, started_at INTEGER,
      turns INTEGER DEFAULT 0, qloo_calls INTEGER DEFAULT 0, cache_hits INTEGER DEFAULT 0, snapshot TEXT)`
    // The turn a run paused on and its tool results so far, until the answer completes them.
    this.sql`CREATE TABLE IF NOT EXISTS paused (run TEXT PRIMARY KEY, assistant TEXT, results TEXT)`
    // A run is kept alive while its loop runs, so one still running at startup lost its loop.
    const run = this.state.run
    if (run?.status === 'running') this.finish(run.id, 'The run was interrupted. Start it again.')
    // The same goes for a show still waiting on its search.
    const interrupted = { resolution: 'failed', error: 'The lookup was interrupted. Import the roster again.' } as const
    if (this.state.roster.some((s) => s.resolution === 'pending'))
      this.setState({
        ...this.state,
        roster: this.state.roster.map((s) => (s.resolution === 'pending' ? { ...s, ...interrupted } : s))
      })
    // And for a comp search.
    const stopped = { status: 'failed', error: 'The search was interrupted. Search again.' } as const
    if (this.state.roster.some((s) => s.compSearch?.status === 'pending'))
      this.setState({
        ...this.state,
        roster: this.state.roster.map((s) =>
          s.compSearch?.status === 'pending' ? { ...s, compSearch: { ...s.compSearch, ...stopped } } : s
        )
      })
    const inbox = this.state.inbox
    if (inbox?.status === 'reading') this.finishInbox(inbox.id, 'Reading was interrupted. Load the inbox again.')
  }

  // State changes only through actions; a client can't write it directly.
  validateStateChange(_next: State, source: Connection | 'server') {
    if (source !== 'server') throw new Error('State is read-only; use an action')
  }

  // Replaces the roster with pasted show names, one per line, or a CSV with a `name` column and
  // optional `downloads`, `status`, and `description` columns. Each show is resolved through Qloo.
  // It returns once every show is pending, and each show fills in as its search settles: one search
  // can take a minute when Qloo hangs, past the client's 30-second call timeout.
  @callable()
  importRoster(text: string, format: RosterFormat = 'lines') {
    const rows = parseRoster(text, format)
    if (rows.length === 0)
      throw new Error(format === 'csv' ? 'The CSV has no show rows.' : 'Paste at least one show name, one per line.')
    if (rows.length > MAX_SHOWS)
      throw new Error(
        `${rows.length} shows is over the ${MAX_SHOWS}-show limit: one comparison scores at most ${MAX_SHOWS} shows, Qloo's largest page, and scores from separate comparisons can't be compared. Import ${MAX_SHOWS} shows or fewer.`
      )
    if (this.state.roster.some((s) => s.resolution === 'pending'))
      throw new Error('The last import is still looking up its shows. Wait for it to finish.')
    // Numbered now, in roster order, so a pending show cites the call it waits on.
    const calls = rows.map(() => this.numberCall())
    const roster = rows.map(({ name, ...fields }, i): Show => ({
      name,
      resolution: 'pending',
      entity: null,
      candidates: [],
      evidence: callNumber(calls[i]),
      error: null,
      compSearch: null,
      ...fields,
      excluded: false
    }))
    this.setState({ ...this.state, roster })
    // All at once: the gateway paces, limits, and retries the calls.
    void this.keepAliveWhile(() => Promise.all(rows.map(({ name }, i) => this.lookUpShow(name, calls[i]))))
  }

  // Searches Qloo for a comparable show to stand in for one it can't match, such as a miss. It
  // returns once the search is pending, and the search fills in when Qloo answers.
  @callable()
  searchComps(name: string, query: string) {
    // A comp mapped now would be overwritten when the show's own search lands.
    if (this.show(name).resolution === 'pending') throw new Error(`${name} is still being looked up in Qloo.`)
    const q = query.trim()
    if (!q) throw new Error('Type the name of a comparable show.')
    const seq = this.numberCall()
    const compSearch: CompSearch = { query: q, call: callNumber(seq), status: 'pending', results: [], error: null }
    this.editShow(name, (show) => ({ ...show, compSearch }))
    void this.keepAliveWhile(() => this.findComps(name, compSearch, seq))
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
    const [{ started }] = this.sql<{ started: number }>`
      SELECT COUNT(*) AS started FROM runs WHERE started_at >= ${startOfUtcDay()}`
    if (started >= MAX_RUNS_PER_DAY)
      throw new Error(
        `This session has started its ${MAX_RUNS_PER_DAY} runs for today. Runs reset at 00:00 UTC; earlier runs stay viewable.`
      )

    // A run left waiting on a question ends unanswered, and its paused turn with it.
    const waiting = this.state.run
    if (waiting?.status === 'waiting') this.finish(waiting.id, 'Left unanswered: a new run started instead.')
    this.sql`DELETE FROM paused`

    const run = crypto.randomUUID()
    const startedAt = Date.now()
    this.sql`INSERT INTO runs (id, started_at) VALUES (${run}, ${startedAt})`
    this.setState({
      ...this.state,
      launch: { name, match: null },
      run: { id: run, status: 'running', notes: [], error: null, question: null, budget: null, exclusions: null },
      // Sessions from before run limits have no list.
      runs: [
        ...(this.state.runs ?? []),
        { id: run, launch: name, status: 'running', startedAt: new Date(startedAt).toISOString() }
      ],
      ranking: null
    })
    // The roster's IDs go in the run's first message, so the frozen system prompt stays session-free.
    const shows = this.state.roster.filter(scorable)
    const roster = shows.length
      ? `The roster shows that can be ranked, as name: Qloo ID:\n${shows.map((s) => `- ${s.name}: ${s.entity.id}`).join('\n')}`
      : 'The roster has no shows that can be ranked yet.'
    this.append(run, {
      role: 'user',
      content: `The launch is a released show named "${name}". Plan its promos.\n\n${roster}`
    })
    void this.keepAliveWhile(() => this.runLoop(run)).catch((e) => this.finish(run, `The run stopped: ${message(e)}`))
    return { runId: run }
  }

  // Answers the run's open question and resumes the run. The answer goes to Claude as the
  // programmer's own text, after the tool result, which only says they were asked. Leaving shows
  // out recomputes the finalists, which the tool result then lists.
  @callable()
  answer(questionId: string, reply: Reply) {
    const run = this.state.run
    const question = run?.status === 'waiting' ? run.question : null
    if (!run || !question || question.id !== questionId)
      throw new Error('That question is no longer open: it was already answered, or its run has ended.')
    const given = typeof reply === 'object' && reply !== null ? reply : {} // it arrives as untrusted JSON
    const { answer, stored } = settle(question, given)
    let notice = 'Asked the programmer. Their answer follows.'
    if (stored.exclusions && this.state.ranking) {
      const ranking = markFinalists(this.state.ranking, stored.exclusions)
      this.setState({ ...this.state, ranking })
      const finalists = ranking.rows.filter((r) => r.finalist).map((r) => r.show)
      notice += ` Code has left those shows out of the fit ranking ${ranking.call}; the finalists are now ${finalists.join(', ') || 'none'}.`
    }
    const [paused] = this.sql<{ assistant: string; results: string }>`
      SELECT assistant, results FROM paused WHERE run = ${run.id}`
    const results: Anthropic.ToolResultBlockParam[] = JSON.parse(paused.results)
    this.append(run.id, JSON.parse(paused.assistant), {
      role: 'user',
      content: [
        ...results.map((r) => (r.tool_use_id === question.id ? { ...r, content: notice } : r)),
        { type: 'text', text: answer }
      ]
    })
    this.sql`DELETE FROM paused WHERE run = ${run.id}`
    this.setStatus(run.id, 'running', { ...stored, question: null })
    void this.keepAliveWhile(() => this.runLoop(run.id)).catch((e) =>
      this.finish(run.id, `The run stopped: ${message(e)}`)
    )
  }

  // What an earlier run ended with, roster and all, to compare with a re-run.
  @callable()
  getRun(id: string): RunSnapshot {
    const [row] = this.sql<{ snapshot: string | null }>`SELECT snapshot FROM runs WHERE id = ${id}`
    if (!row) throw new Error('This session has no run with that ID.')
    if (!row.snapshot) throw new Error("That run hasn't ended yet.")
    return JSON.parse(row.snapshot)
  }

  // Replaces the inbox with the sample inbox or pasted pitches and returns at once. Claude reads each
  // pitch for its guest and public work, and each work's title and type are searched in Qloo; the
  // pitches fill in through synced state.
  @callable()
  loadInbox(source: unknown) {
    this.guestPitches()
    if (this.state.inbox?.status === 'reading') throw new Error('The inbox is still loading. Wait for it to finish.')
    const inbox: Inbox = { id: crypto.randomUUID(), status: 'reading', ...readInbox(source) }
    this.setState({ ...this.state, inbox })
    void this.keepAliveWhile(() => this.readPitches(inbox)).catch((e) =>
      this.finishInbox(inbox.id, `Reading stopped: ${message(e)}`)
    )
  }

  // Confirms which of an ambiguous work's same-title candidates the pitch is about.
  @callable()
  confirmWork(pitchId: string, entityId: string) {
    this.guestPitches()
    const inbox = this.state.inbox
    const pitch = inbox?.pitches.find((p) => p.id === pitchId)
    if (!inbox || !pitch) throw new Error(`No pitch ${pitchId} in the inbox.`)
    const entity = pitch.match?.candidates.find((c) => c.id === entityId)
    if (!pitch.match || !entity)
      throw new Error(`That isn't one of the candidates for ${pitch.work?.title ?? pitchId}.`)
    const match = { ...pitch.match, resolution: 'resolved' as const, entity }
    this.editPitch(inbox.id, pitchId, (p) => ({ ...p, match }))
  }

  // The session's evidence log: one record per Qloo call, oldest first.
  @callable()
  getEvidence(): Evidence[] {
    return this.sql<{ record: string }>`SELECT record FROM evidence WHERE record IS NOT NULL ORDER BY seq`.map((r) =>
      JSON.parse(r.record)
    )
  }

  // Searches Qloo for an imported show and fills in its row, keeping any edit made while it waited.
  private async lookUpShow(name: string, seq: number) {
    let match: Lookup
    try {
      const { call, result } = await this.qloo((gateway) => gateway.search(name, 'urn:entity:podcast'), null, seq)
      match = lookup(name, call, result)
    } catch (e) {
      // The gateway itself failed; the show still settles, so the import can't stay pending.
      const error = `The lookup failed: ${message(e)}`
      match = { resolution: 'failed', entity: null, candidates: [], evidence: callNumber(seq), error }
    }
    this.editShow(name, (show) => ({ ...show, ...match }))
  }

  // Runs a pending comp search and fills it in, unless a newer search or an import replaced it.
  private async findComps(name: string, search: CompSearch, seq: number) {
    let landed: CompSearch
    try {
      const { result } = await this.qloo((gateway) => gateway.search(search.query, 'urn:entity:podcast', 5), null, seq)
      landed = result.ok
        ? {
            ...search,
            status: 'done',
            results: result.data.map(({ id, name, popularity }) => ({ id, name, popularity }))
          }
        : { ...search, status: 'failed', error: result.error }
    } catch (e) {
      landed = { ...search, status: 'failed', error: `The search failed: ${message(e)}` }
    }
    const show = this.state.roster.find((s) => s.name === name)
    if (show?.compSearch?.call === search.call) this.editShow(name, (s) => ({ ...s, compSearch: landed }))
  }

  // Reserves the next call number, before the call is made.
  private numberCall() {
    const [{ seq }] = this.sql<{ seq: number }>`INSERT INTO evidence (record) VALUES (NULL) RETURNING seq`
    return seq
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

  private guestPitches() {
    if (this.env.GUEST_PITCHES !== 'on') throw new Error("Guest pitches aren't switched on.")
  }

  private async readPitches(inbox: Inbox) {
    const read = pitchReader(this.env)
    const today = new Date().toISOString().slice(0, 10)
    const queue = [...inbox.pitches]
    const next = async () => {
      for (let pitch = queue.shift(); pitch; pitch = queue.shift()) {
        try {
          await this.readPitch(inbox.id, pitch, read, today)
        } catch (e) {
          this.editPitch(inbox.id, pitch.id, (p) => ({ ...p, status: 'failed', error: message(e) }))
        }
      }
    }
    await Promise.all(Array.from({ length: READ_CONCURRENCY }, next))
    this.finishInbox(inbox.id, null)
  }

  // Reads one pitch, then searches its work by title and type only: the guest's name, the sender,
  // and the pitch text never reach Qloo. A pitch with no public work is set aside unsearched.
  private async readPitch(inbox: string, pitch: Pitch, read: ReturnType<typeof pitchReader>, today: string) {
    const reading = await read(pitch, today)
    if (reading.status !== 'read') return this.editPitch(inbox, pitch.id, (p) => ({ ...p, ...reading }))
    const { work } = reading
    this.editPitch(inbox, pitch.id, (p) => ({ ...p, ...reading, status: 'looking_up' }))
    const { call, result } = await this.qloo((gateway) => gateway.search(work.title, qlooType[work.type], 5))
    const match = lookupWork(work, reading.guest, call, result)
    this.editPitch(inbox, pitch.id, (p) => ({ ...p, status: 'read', match }))
  }

  // Marks the inbox read. With an error, any pitch still being read failed with it.
  private finishInbox(inbox: string, error: string | null) {
    const current = this.state.inbox
    if (current?.id !== inbox) return
    const unfinished = (p: Pitch) => p.status === 'reading' || p.status === 'looking_up'
    const pitches = current.pitches.map((p) =>
      error && unfinished(p) ? { ...p, status: 'failed' as const, error } : p
    )
    this.setState({ ...this.state, inbox: { ...current, status: 'done', pitches } })
  }

  // Changes one pitch of the current inbox; a pitch of an inbox since replaced is left alone.
  private editPitch(inbox: string, pitchId: string, edit: (pitch: Pitch) => Pitch) {
    const current = this.state.inbox
    if (current?.id !== inbox) return
    const pitches = current.pitches.map((p) => (p.id === pitchId ? edit(p) : p))
    this.setState({ ...this.state, inbox: { ...current, pitches } })
  }

  // The agent loop: call Claude, run every tool it asks for at once, and send all the results back
  // in one message, until it ends its turn. Any failure ends the run as failed, with the reason.
  private async runLoop(run: string) {
    const model = claude(this.env)
    for (;;) {
      const [{ turns }] = this.sql<{ turns: number }>`
        UPDATE runs SET turns = turns + 1 WHERE id = ${run} RETURNING turns`
      let reply: Anthropic.Message
      const started = Date.now()
      try {
        reply = await model(this.history(run))
      } catch (e) {
        log({ event: 'model_call', run, turn: turns, latencyMs: Date.now() - started, error: message(e) })
        return this.finish(run, `The request to Claude failed: ${message(e)}`)
      }
      const { usage } = reply
      log({
        event: 'model_call',
        run,
        turn: turns,
        stopReason: reply.stop_reason,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheReadInputTokens: usage.cache_read_input_tokens,
        cacheCreationInputTokens: usage.cache_creation_input_tokens,
        latencyMs: Date.now() - started
      })
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
      // The last turn's calls aren't run: their results would need one more turn to reach Claude.
      if (turns >= MAX_TURNS)
        return this.finish(
          run,
          `Stopped at the limit of ${MAX_TURNS} Claude turns per run, before Claude finished, so this plan is incomplete. Not run: ${calls.map((c) => noteFor(c, this.state)).join(', ')}.`,
          'stopped'
        )
      const results = await Promise.all(calls.map((call) => this.callTool(run, call)))
      const cut = calls.filter((_, i) => results[i].cutOff)
      // A question pauses the run: this turn and its results wait in storage for the answer.
      if (cut.length === 0 && this.state.run?.id === run && this.state.run.question) {
        this.sql`INSERT INTO paused (run, assistant, results)
          VALUES (${run}, ${JSON.stringify(assistant)}, ${JSON.stringify(results.map((r) => r.block))})`
        this.setStatus(run, 'waiting')
        const [spent] = this.sql<Spent>`SELECT started_at, turns, qloo_calls, cache_hits FROM runs WHERE id = ${run}`
        if (spent) log(summary(run, 'waiting', spent))
        return
      }
      // The turn and its results are stored together, so history never ends on an unanswered call.
      this.append(run, assistant, { role: 'user', content: results.map((r) => r.block) })
      if (cut.length > 0)
        return this.finish(
          run,
          `Stopped at the limit of ${MAX_QLOO_CALLS} Qloo calls per run, before Claude finished, so this plan is incomplete. Cut off: ${cut.map((c) => noteFor(c, this.state)).join(', ')}.`,
          'stopped'
        )
    }
  }

  // Runs one tool call. `cutOff` says the run's Qloo call limit refused one of its calls.
  private async callTool(run: string, call: Anthropic.ToolUseBlock) {
    const tool = tools.find((t) => t.definition.name === call.name)
    const note = this.addNote(run, noteFor(call, this.state))
    let cutOff = false
    const context: ToolContext = {
      run,
      call: call.id,
      qloo: async (request) => {
        // Checked and counted before any await, so concurrent tools can't pass the limit together.
        const counted = this.sql`
          UPDATE runs SET qloo_calls = qloo_calls + 1 WHERE id = ${run} AND qloo_calls < ${MAX_QLOO_CALLS}
          RETURNING id`
        if (counted.length === 0) {
          cutOff = true
          throw new Error(`the run reached its limit of ${MAX_QLOO_CALLS} Qloo calls`)
        }
        return this.qloo(request, run)
      },
      state: () => this.state,
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
      notes: r.notes.map((n, i) => (i === note ? { ...n, status: result.isError || cutOff ? 'failed' : 'done' } : n))
    }))
    const block: Anthropic.ToolResultBlockParam = {
      type: 'tool_result',
      tool_use_id: call.id,
      content: result.content,
      ...(result.isError && { is_error: true })
    }
    return { block, cutOff }
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

  // Ends the run: completed when `error` is null, else failed, or stopped at a limit, with the
  // reason and any unfinished notes marked failed. Keeps what it ended with for getRun.
  private finish(run: string, error: string | null, status: 'failed' | 'stopped' = 'failed') {
    const r = this.state.run
    if (r?.id !== run) return
    const ended: Run =
      error === null
        ? { ...r, status: 'completed' }
        : {
            ...r,
            status,
            error,
            notes: r.notes.map((n) => (n.status === 'running' ? { ...n, status: 'failed' } : n))
          }
    const runs = (this.state.runs ?? []).map((s) => (s.id === run ? { ...s, status: ended.status } : s))
    this.setState({ ...this.state, run: ended, runs })
    const { runs: _, ...snapshot } = this.state
    const [spent] = this.sql<Spent>`
      UPDATE runs SET snapshot = ${JSON.stringify(snapshot)} WHERE id = ${run}
      RETURNING started_at, turns, qloo_calls, cache_hits`
    // A run started before run limits has no row to summarize.
    if (spent) log(summary(run, ended.status, spent))
  }

  // Pauses or resumes the run, here and in the session's list of runs.
  private setStatus(run: string, status: 'running' | 'waiting', change: Partial<Run> = {}) {
    if (this.state.run?.id !== run) return
    const runs = (this.state.runs ?? []).map((s) => (s.id === run ? { ...s, status } : s))
    this.setState({ ...this.state, run: { ...this.state.run, ...change, status }, runs })
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

  // The session's only path to Qloo. It numbers the call when the call starts, unless the caller
  // numbered it earlier, so numbers follow the order calls were made, and appends the gateway's
  // evidence, success or failure.
  private async qloo<T>(
    request: (gateway: DurableObjectStub<QlooGateway>) => Promise<QlooResult<T>>,
    run: string | null = null,
    seq = this.numberCall()
  ) {
    const call = callNumber(seq)
    const result = (await request(this.env.QlooGateway.getByName('global'))) as QlooResult<T>
    const record: Evidence = { call, run, ...result.evidence }
    this.sql`UPDATE evidence SET record = ${JSON.stringify(record)} WHERE seq = ${seq}`
    if (run && record.cacheHit) this.sql`UPDATE runs SET cache_hits = cache_hits + 1 WHERE id = ${run}`
    return { call, result }
  }
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

// One structured line in Workers Logs, like the gateway's qloo_call lines.
const log = (line: { event: 'model_call' | 'run_summary' } & Record<string, unknown>) =>
  console.log(JSON.stringify(line))

// What a run has spent against its limits, from its row in `runs`.
type Spent = { started_at: number; turns: number; qloo_calls: number; cache_hits: number }

// The summary line for a run that ended, or paused on a question.
const summary = (run: string, outcome: Run['status'], spent: Spent) => ({
  event: 'run_summary' as const,
  run,
  outcome,
  turns: spent.turns,
  qlooCalls: spent.qloo_calls,
  cacheHits: spent.cache_hits,
  wallMs: Date.now() - spent.started_at
})

// The programmer's answer as Claude reads it, and what code stores on the run from it. Throws,
// changing nothing, when the reply doesn't fit the question.
function settle(question: Question, reply: Reply): { answer: string; stored: Partial<Run> } {
  const note = typeof reply.text === 'string' ? reply.text.trim() : ''
  const choice = reply.choice
  if (choice !== undefined && !question.options.includes(choice)) throw new Error("That isn't one of the options.")
  const withNote = (answer: string) => [answer, note].filter(Boolean).join('\n\n')
  if (question.kind === 'budget') {
    const budget = readBudget(reply)
    const amount = 'slots' in budget ? `${budget.slots} promo slots` : `$${budget.dollars.toLocaleString('en-US')}`
    return { answer: withNote(`Slot budget: ${amount}.`), stored: { budget } }
  }
  if (question.kind === 'exclusions') {
    if (!Array.isArray(reply.exclude)) throw new Error('List the shows to leave out, or none.')
    const exclusions = [...new Set(reply.exclude)]
    const unknown = exclusions.find((name) => !question.options.includes(name))
    if (unknown !== undefined) throw new Error(`"${unknown}" isn't one of the shows this launch can leave out.`)
    const answer = exclusions.length
      ? `Leave out of this launch: ${exclusions.join(', ')}.`
      : 'No exclusions for this launch.'
    return { answer: withNote(answer), stored: { exclusions } }
  }
  const answer = withNote(choice ?? '')
  if (!answer) throw new Error('Pick an option or type an answer.')
  return { answer, stored: {} }
}

function readBudget({ slots, dollars }: Reply): Budget {
  if (slots === undefined && dollars === undefined)
    throw new Error('Give the budget as a number of promo slots or a dollar amount.')
  if (slots !== undefined && dollars !== undefined)
    throw new Error('Give the budget as promo slots or dollars, not both.')
  if (slots !== undefined) {
    if (!Number.isSafeInteger(slots) || slots < 1)
      throw new Error('The slot budget must be a whole number of slots, 1 or more.')
    return { slots }
  }
  if (typeof dollars !== 'number' || !Number.isFinite(dollars) || dollars <= 0)
    throw new Error('The dollar budget must be an amount above $0.')
  return { dollars }
}

// The progress note a tool call shows, such as "Resolving The Big Picture".
function noteFor(call: Anthropic.ToolUseBlock, state: State) {
  const tool = tools.find((t) => t.definition.name === call.name)
  return tool ? tool.note(call.input, state) : `Calling ${call.name}`
}

// A refusal has no server-side fallback on this model, so the run stops and shows it.
function refusalNotice(reply: Anthropic.Message) {
  const category = reply.stop_details?.type === 'refusal' ? reply.stop_details.category : null
  return `Claude declined to continue this run${category ? ` (safety category: ${category})` : ''}.`
}
