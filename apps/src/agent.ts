import type Anthropic from '@anthropic-ai/sdk'
import { Agent, callable, type Connection } from 'agents'
import { claude, declined } from './claude'
import type { DemographicCheck } from './demographics'
import { callNumber, type Evidence } from './evidence'
import { pitchReader } from './extract'
import { finalistsOf, markFinalists, notScorable, rankable, scorable, type Ranking } from './fit'
import { IN_FLIGHT, REQUESTS, type QlooGateway, type QlooResult } from './gateway'
import {
  qlooType,
  readInbox,
  readPastGuests,
  workNoun,
  type Booking,
  type Inbox,
  type Pitch,
  type PitchReply,
  type Work,
  type WorkMatch
} from './inbox'
import { MAX_COMPS, MAX_QLOO_CALLS, MAX_RUNS_PER_DAY, MAX_TURNS, startOfUtcDay } from './limits'
import { lineProblem, priceLines, toCsv, type InsertionOrder, type LineInput } from './order'
import { candidateLabels, lookup, lookupWork, offeredBy, sameName, type Candidate, type Lookup } from './resolve'
import { parseRoster, type RosterFormat, type RosterRow } from './roster'
import { sample, sampleCpm, sampleRoster, type Sample, type SampleFigure } from './sample'
import { tools, type ToolContext, type ToolResult } from './tools'
import { rankByTopic, topicRequest, withMoves, type Topic } from './topic'

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
  sample?: SampleFigure[] // a sample network show's figures the visitor hasn't changed; absent on an imported show
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
  comps: Comp[] // up to three released shows standing in for an unreleased launch; empty otherwise
}

// A released show the programmer named to stand in for an unreleased launch. Only a comp they
// confirmed is scored, as `entity`: its match, or the candidate they picked when it was ambiguous.
export type Comp = {
  name: string // as the programmer named it
  match: Lookup | null // how the name resolved in Qloo; null until the run looks it up
  status: 'unconfirmed' | 'confirmed' | 'rejected' // rejected: none of its matches is the comp
  entity: Candidate | null
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
  replayed?: string // why the stored sample run was replayed instead of run, such as the daily cap
  closing: string | null // Claude's closing text once the run completes; never kept from a refused or failed turn
  typed?: true // the programmer typed an answer of their own, so the run isn't the unchanged sample's to keep
}

export type Budget = { slots: number } | { dollars: number }

// A question the agent put to the programmer. `choice` is a fork in the plan, answered with one of
// its options or free text; `launch` picks the launch's candidate or renames it. `comps` asks for
// comps; `confirm_comps` confirms the comps named in `options`.
export type Question = {
  id: string // the ask_human call's tool use ID
  kind: 'choice' | 'launch' | 'budget' | 'exclusions' | 'comps' | 'confirm_comps'
  question: string
  options: string[]
}

// How the programmer answers: `choice` or `text` for a choice question, `slots` or `dollars` for
// the budget, `exclude` for exclusions, `comps` for comp names, `picks` for each comp to confirm in
// the question's order (its entity's ID, or null for none of these), and `text` as the name Qloo
// lists the launch under for a launch or comps question. Code builds every other answer, so it
// takes no typed text.
export type Reply = {
  choice?: string
  text?: string
  slots?: number
  dollars?: number
  exclude?: string[]
  comps?: string[]
  picks?: (string | null)[]
}

// One run in the session's list of runs. Its results, once it ends, come from getRun.
export type RunSummary = {
  id: string
  launch: string | null // the launch's name; null for a launch run from comps, or a pitch run
  pitchesFor?: string // a guest pitch run's show
  status: Run['status']
  startedAt: string // ISO time
  replayed?: true // the stored sample run, replayed
}

// A progress note code writes for a tool call, such as "Resolving The Big Picture".
export type Note = { text: string; status: 'running' | 'done' | 'failed' }

// A Qloo call still waiting after QLOO_SLOW_MS, the TRD's worst case per call, so the UI can say so.
export type SlowCall = { call: string; run: string | null; waitedMs: number }

// Everything the UI renders, synced to every connection of this session. Later tickets add
// their own fields; the evidence log stays out of it and is fetched with getEvidence.
export type State = {
  roster: Show[]
  cpm: number | null // CPM in dollars; no default for a real network
  launch: Launch | null
  run: Run | null // the latest run
  runs: RunSummary[] // every run this session started, oldest first
  ranking: Ranking | null // the current run's fit chart, once the roster is ranked
  demographics: DemographicCheck | null // the current run's finalists checked against the launch's listeners
  topic: Topic | null // the current run's topic baseline, the chart's last-week column
  inbox: Inbox | null // the booker's guest pitches, when GUEST_PITCHES is on
  sample: Sample | null // the sample network the session opened on, until it's cleared or a roster is imported
  booking: Booking | null // the latest guest pitch run's show, past guests, and ranked lists
  insertionOrder: InsertionOrder | null // the current run's order, once drafted; only the programmer edits or approves it
  slowCalls: SlowCall[] // this session's Qloo calls still waiting longer than they should
  guide: Guide // the sample launch's guide, for the session rather than any run
}

// The guide through the sample launch (#54): the steps the visitor did in the page, where the agent
// can't see them, and whether they dismissed it for the rest of the session. Its other steps follow
// from the run.
export type Guide = { seen: GuideMark[]; dismissed: boolean }
export type GuideMark = 'why' | 'evidence' // opened a climber's why-it-moved line, then a call it cites
const GUIDE_MARKS: GuideMark[] = ['why', 'evidence']

// What a run ended with: the synced state as it was then, so a re-run's plan can be compared to it.
// The guide stays out: it belongs to the session, so viewing or replaying a run never changes it.
export type RunSnapshot = Omit<State, 'runs' | 'guide'>

// A completed sample run any session can replay while Qloo can't be called: what it ended with,
// less the visitor's own guest pitches, and every evidence record that cites. The gateway keeps the latest.
type SampleRun = { state: Omit<RunSnapshot, 'inbox' | 'booking'>; evidence: Evidence[] }

// A call number wherever it appears in state, such as "C-07".
const CALL = /\bC-\d+\b/g

// Pitches read at once: each is one model call, then one Qloo search the gateway paces.
const READ_CONCURRENCY = 5

// A reply the booker edits stays email-sized.
const MAX_REPLY_CHARS = 5_000

// One instance per visitor session, named by the session cookie.
export class CrossfeedAgent extends Agent<Env, State> {
  initialState: State = {
    roster: [],
    cpm: null,
    launch: null,
    run: null,
    runs: [],
    ranking: null,
    demographics: null,
    topic: null,
    inbox: null,
    sample: null,
    booking: null,
    insertionOrder: null,
    slowCalls: [],
    guide: { seen: [], dismissed: false }
  }

  // This session's Qloo calls still out, oldest first; a call being timed holds its timer.
  private out: { call: string; run: string | null; timer?: ReturnType<typeof setTimeout> }[] = []

  async onStart() {
    // Only this method creates the evidence table, so a session without it is starting for the first time.
    const firstStart = this.sql`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'evidence'`.length === 0
    this.sql`CREATE TABLE IF NOT EXISTS evidence (seq INTEGER PRIMARY KEY AUTOINCREMENT, record TEXT)`
    // Each run's conversation with Claude, append-only: one row per message, thinking blocks kept.
    this.sql`CREATE TABLE IF NOT EXISTS conversation (seq INTEGER PRIMARY KEY AUTOINCREMENT, run TEXT, message TEXT)`
    // One row per run: its start in epoch ms, what it has spent against the run limits, and, once it
    // has ended, the state it ended with.
    this.sql`CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, started_at INTEGER,
      turns INTEGER DEFAULT 0, qloo_calls INTEGER DEFAULT 0, cache_hits INTEGER DEFAULT 0, snapshot TEXT)`
    // The turn a run paused on and its tool results so far, until the answer completes them.
    this.sql`CREATE TABLE IF NOT EXISTS paused (run TEXT PRIMARY KEY, assistant TEXT, results TEXT)`
    // Topic baselines by a hash of their request, so the same launch and roster rank the same way.
    this.sql`CREATE TABLE IF NOT EXISTS topic_baselines (key TEXT PRIMARY KEY, ranking TEXT)`
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
    const topic = this.state.topic
    if (topic?.status === 'ranking')
      this.setState({
        ...this.state,
        topic: { ...topic, status: 'failed', error: 'The topic ranking was interrupted. Run the launch again' }
      })
    const inbox = this.state.inbox
    if (inbox?.status === 'reading') this.finishInbox(inbox.id, 'Reading was interrupted. Load the inbox again.')
    // Calls are timed in memory, so none is still waiting after a restart.
    if (this.state.slowCalls?.length) this.setState({ ...this.state, slowCalls: [] })
    // A new session opens on the sample network, looked up like an import; tests turn this off.
    if (firstStart && this.env.SAMPLE_NETWORK === 'on') this.lookUpRoster(sampleRoster, { cpm: sampleCpm, sample })
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
    this.lookUpRoster(rows, this.leaveSample())
  }

  // Empties a roster that is still the sample network, ready for the visitor's own import.
  @callable()
  clearSample() {
    if (!this.state.sample) throw new Error("The roster isn't the sample network, so there's nothing to clear.")
    if (this.state.roster.some((s) => s.resolution === 'pending'))
      throw new Error('The sample network is still being looked up. Wait for it to finish.')
    this.setState({ ...this.state, roster: [], ...this.leaveSample() })
  }

  // Marks a guide step the visitor did in the page, such as opening a climber's why-it-moved line.
  @callable()
  markGuide(mark: GuideMark) {
    if (!GUIDE_MARKS.includes(mark)) throw new Error(`${JSON.stringify(mark)} isn't a step of the guide.`)
    const guide = this.guide()
    if (!guide.seen.includes(mark)) this.setState({ ...this.state, guide: { ...guide, seen: [...guide.seen, mark] } })
  }

  // Hides the guide for the rest of the session.
  @callable()
  dismissGuide() {
    this.setState({ ...this.state, guide: { ...this.guide(), dismissed: true } })
  }

  // Sessions from before the guide have none in their state.
  private guide(): Guide {
    return this.state.guide ?? { seen: [], dismissed: false }
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
      // A sample figure the visitor changes is theirs from then on.
      if (show.sample) next.sample = show.sample.filter((f) => next[f] === show[f])
      return next
    })
    if (patch.downloads !== undefined) this.repriceOrder()
  }

  // The network's CPM in dollars, which prices every promo slot.
  @callable()
  setCpm(cpm: number) {
    if (typeof cpm !== 'number' || !Number.isFinite(cpm) || cpm <= 0)
      throw new Error('The CPM must be a dollar amount above 0.')
    const s = this.state.sample
    this.setState({ ...this.state, cpm, sample: s && { ...s, cpm: s.cpm && cpm === this.state.cpm } })
    this.repriceOrder()
  }

  // Starts a launch run and returns at once; the run's progress arrives in synced state.
  @callable()
  async startLaunch(input: LaunchInput) {
    const given = typeof input === 'object' && input !== null ? input : {} // it arrives as untrusted JSON
    const comps = 'comps' in given ? readComps(given.comps) : null
    if (comps?.length === 0) throw new Error('Name at least one comp to start a run.')
    const name = comps ? null : 'name' in given && typeof given.name === 'string' ? given.name.trim() : ''
    if (name === '') throw new Error('Name the launch to start a run.')
    // Decided before anything runs: while Qloo can't be called, the unchanged sample launch replays
    // the stored sample run and any other run stops, so neither calls Qloo or Claude.
    const gateway = this.env.QlooGateway.getByName('global')
    const down = await gateway.health()
    const stored = down && onSampleLaunch(this.state, name) ? await gateway.sampleRun() : null
    const { run, startedAt } = this.beginRun()
    this.setState({
      ...this.state,
      launch: { name, match: null, comps: (comps ?? []).map(newComp) },
      run: newRun(run),
      // Sessions from before run limits have no list.
      runs: [
        ...(this.state.runs ?? []),
        { id: run, launch: name, status: 'running', startedAt: new Date(startedAt).toISOString() }
      ],
      ranking: null,
      demographics: null,
      // A start that replays or stops runs no topic baseline.
      topic: down ? null : { status: 'ranking', order: [], error: null, moves: [] },
      insertionOrder: null
    })
    if (down) {
      if (stored && onSampleLaunch(this.state, name)) this.replay(run, JSON.parse(stored), down.reason)
      else
        this.finish(
          run,
          onSampleLaunch(this.state, name)
            ? `${down.reason}, and no sample run is stored to replay yet. Start it again once Qloo answers.`
            : `${down.reason}, so runs on your own data wait until Qloo answers again. Only the sample launch, on the unchanged sample network, replays its stored run.`,
          down.capped ? 'stopped' : 'failed'
        )
      return { runId: run }
    }
    // Beside the agent loop, not a tool of it: it needs no Qloo data.
    const imported = this.state.roster
    // A launch from comps is described to the topic baseline by its comps.
    const topicLaunch = name ?? `an unreleased show like ${comps!.join(', ')}`
    void this.keepAliveWhile(() => this.rankRosterByTopic(run, topicLaunch, imported)).catch((e) =>
      this.landTopic(run, { status: 'failed', order: [], error: `The topic ranking stopped: ${message(e)}`, moves: [] })
    )
    // The roster's IDs go in the run's first message, so the frozen system prompt stays session-free.
    // Every show is listed with its state, so the model never takes an unranked show for one off the roster.
    const all = this.state.roster
    const shows = all.filter(scorable)
    const mapped = (s: Show) => (s.resolution === 'mapped' ? ` (mapped to ${s.entity!.name})` : '')
    const unranked = all.flatMap((s) => {
      const why = notScorable(s)
      return why ? [`- ${s.name}: ${why}`] : []
    })
    const roster = [
      `The roster has ${all.length} shows. ` +
        (shows.length
          ? `These can be ranked, as name: Qloo ID:\n${shows.map((s) => `- ${s.name}${mapped(s)}: ${s.entity.id}`).join('\n')}`
          : 'None can be ranked yet.'),
      ...(unranked.length ? [`These roster shows can't be ranked, and why:\n${unranked.join('\n')}`] : [])
    ].join('\n\n')
    const launch = comps
      ? `The launch is unreleased, so it has no listeners yet. The programmer named these released shows as its comps, to stand in for it: ${comps.map((c) => `"${c}"`).join(', ')}.`
      : `The launch is a released show named "${name}".`
    this.append(run, { role: 'user', content: `${launch} Plan its promos.\n\n${roster}` })
    void this.keepAliveWhile(() => this.runLoop(run)).catch((e) => this.finish(run, `The run stopped: ${message(e)}`))
    return { runId: run }
  }

  // Starts a guest pitch run and returns at once. The past guests' works are looked up in Qloo like
  // pitched works, then Claude ranks the inbox's pitches against the show and those works, one list
  // per work type. The run's progress and lists arrive in synced state.
  @callable()
  startPitches(input: unknown) {
    this.guestPitches()
    const given = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
    const inbox = this.state.inbox
    if (!inbox) throw new Error('Load an inbox first.')
    if (inbox.status === 'reading') throw new Error('The inbox is still loading. Wait for it to finish.')
    if (typeof given.show !== 'string' || !given.show) throw new Error('Pick the roster show the pitches are for.')
    const show = this.show(given.show)
    // A show left out of launches can still be booked.
    if (!show.entity || (show.resolution !== 'resolved' && show.resolution !== 'mapped'))
      throw new Error(`${show.name} isn't matched in Qloo. Settle it in the roster first.`)
    const pastGuests = readPastGuests(given.pastGuests)
    if (!inbox.pitches.some(rankable))
      throw new Error('No pitched work is matched in Qloo, so there is nothing to rank. Confirm the ambiguous matches.')
    const { run, startedAt } = this.beginRun()
    this.setState({
      ...this.state,
      booking: {
        run,
        show: { name: show.name, entity: show.entity! },
        pastGuests: pastGuests.map((g) => ({ ...g, match: null })),
        lists: null,
        replies: null
      },
      run: newRun(run),
      runs: [
        ...(this.state.runs ?? []),
        {
          id: run,
          launch: null,
          pitchesFor: show.name,
          status: 'running',
          startedAt: new Date(startedAt).toISOString()
        }
      ]
    })
    void this.keepAliveWhile(() => this.runPitches(run)).catch((e) =>
      this.finish(run, `The run stopped: ${message(e)}`)
    )
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
    const { answer, stored, launch, record } = settle(question, given, this.state.launch)
    let notice = 'Asked the programmer. Their answer follows.'
    if (launch) this.setState({ ...this.state, launch })
    if (record) notice += ` ${record}`
    else if (launch)
      notice += launch.match
        ? ` Code set the launch to ${launch.match.entity!.name} (Qloo ID ${launch.match.entity!.id}), from ${launch.match.evidence}; don't resolve it again.`
        : ` Code renamed the launch "${launch.name}"; resolve that name.`
    if (stored.exclusions && this.state.ranking) {
      const ranking = markFinalists(this.state.ranking, stored.exclusions)
      this.setState({ ...this.state, ranking })
      const finalists = finalistsOf(ranking).map((r) => r.show)
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

  // The programmer's edit of the current insertion order: slot counts, dropped shows, and reworded
  // angles, priced again in code. Editing an approved order returns it to draft. The budget bounds
  // the agent's draft, not this: the final plan is the programmer's, and the UI shows it over budget.
  @callable()
  editInsertionOrder(id: string, lines: LineInput[]) {
    const order = this.editableOrder(id)
    const finalists = finalistsOf(this.state.ranking).map((r) => r.show)
    const problem = lineProblem(lines, finalists)
    if (problem) throw new Error(problem)
    const edited = lines.map(({ show, slots, angle }) => ({ show, slots, angle: angle.trim() }))
    this.saveOrder({ ...order, ...priceLines(edited, this.state.roster, this.state.cpm), status: 'draft' })
  }

  // The programmer's approval: only an approved order exports.
  @callable()
  approveInsertionOrder(id: string) {
    this.saveOrder({ ...this.editableOrder(id), status: 'approved' })
  }

  // An approved order from this session as CSV, the current one or an earlier run's, for the export
  // route. It's an RPC method for the Worker, not a callable, and refuses a draft. An earlier order
  // is read from the run that drafted it, which keeps it as the programmer left it.
  exportInsertionOrder(id: string): { status: 200; csv: string } | { status: 404 | 409; error: string } {
    const [earlier] = this.sql<{ order: string }>`
      SELECT json_extract(snapshot, '$.insertionOrder') AS "order" FROM runs
      WHERE json_extract(snapshot, '$.insertionOrder.id') = ${id} AND json_extract(snapshot, '$.insertionOrder.run') = id`
    const order =
      this.state.insertionOrder?.id === id ? this.state.insertionOrder : earlier && JSON.parse(earlier.order)
    if (!order) return { status: 404, error: `This session has no insertion order ${id}.` }
    if (order.status !== 'approved') return { status: 409, error: `${id} is a draft. Approve it before exporting.` }
    return { status: 200, csv: toCsv(order) }
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
    if (this.state.run?.status === 'running' && this.state.booking?.run === this.state.run.id)
      throw new Error('The pitches are being ranked. Wait for the run to finish.')
    const inbox: Inbox = { id: crypto.randomUUID(), status: 'reading', ...readInbox(source) }
    // The last pitch run's lists name the old inbox's pitches, so they go with it.
    this.setState({ ...this.state, inbox, booking: null })
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

  // The booker's rewording of a drafted reply. Editing an approved reply returns it to draft, so only
  // words the booker approved can be copied, and editing a discarded one restores it.
  @callable()
  editReply(pitchId: string, draft: string) {
    const reply = this.editableReply(pitchId)
    const text = typeof draft === 'string' ? draft.trim() : ''
    if (!text) throw new Error('A reply needs some text. Discard it instead to leave it out.')
    if (text.length > MAX_REPLY_CHARS)
      throw new Error(`A reply is at most ${MAX_REPLY_CHARS.toLocaleString('en-US')} characters. Shorten it.`)
    this.saveReply({ ...reply, draft: text, status: 'draft' })
  }

  // The booker's approval: only an approved reply can be copied out.
  @callable()
  approveReply(pitchId: string) {
    const reply = this.editableReply(pitchId)
    if (reply.status === 'discarded') throw new Error('That reply was discarded. Restore it before approving it.')
    this.saveReply({ ...reply, status: 'approved' })
  }

  // Leaves a reply out; editing it again restores it as a draft.
  @callable()
  discardReply(pitchId: string) {
    this.saveReply({ ...this.editableReply(pitchId), status: 'discarded' })
  }

  // The session's evidence log: one record per Qloo call, oldest first.
  @callable()
  getEvidence(): Evidence[] {
    return this.sql<{ record: string }>`SELECT record FROM evidence WHERE record IS NOT NULL ORDER BY seq`.map((r) =>
      JSON.parse(r.record)
    )
  }

  // Replaces the roster with these rows, each pending on its search, together with any other state
  // that changes with it, and returns; each row fills in as its search settles.
  private lookUpRoster(rows: (RosterRow & Pick<Show, 'sample'>)[], alongside: Partial<State>) {
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
    this.setState({ ...this.state, ...alongside, roster })
    // All at once: the gateway paces, limits, and retries the calls.
    void this.keepAliveWhile(() => Promise.all(rows.map(({ name }, i) => this.lookUpShow(name, calls[i]))))
  }

  // What leaving the sample network changes besides the roster: its CPM goes too, unless the visitor
  // set their own, because a real network's CPM has no default.
  private leaveSample(): Partial<State> {
    const s = this.state.sample
    return s ? { sample: null, cpm: s.cpm ? null : this.state.cpm } : {}
  }

  // Searches Qloo for an imported show and fills in its row, keeping any edit made while it waited.
  private async lookUpShow(name: string, seq: number) {
    const { call, result } = await this.qloo((gateway) => gateway.search(name, 'urn:entity:podcast'), null, seq)
    const match = lookup(name, call, result)
    this.editShow(name, (show) => ({ ...show, ...match }))
  }

  // Runs a pending comp search and fills it in, unless a newer search or an import replaced it.
  private async findComps(name: string, search: CompSearch, seq: number) {
    const { result } = await this.qloo((gateway) => gateway.search(search.query, 'urn:entity:podcast', 5), null, seq)
    const landed: CompSearch = result.ok
      ? {
          ...search,
          status: 'done',
          results: result.data.map(({ id, name, popularity }) => ({ id, name, popularity }))
        }
      : { ...search, status: 'failed', error: result.error }
    const show = this.state.roster.find((s) => s.name === name)
    if (show?.compSearch?.call === search.call) this.editShow(name, (s) => ({ ...s, compSearch: landed }))
  }

  // The run's topic baseline, from the cache when the same launch and roster were ranked before.
  // Only a full ranking is kept, so a refused or failed one is tried again next run.
  private async rankRosterByTopic(run: string, launch: string, roster: Show[]) {
    const started = Date.now()
    const request = await topicRequest(launch, roster)
    const [cached] = this.sql<{ ranking: string }>`SELECT ranking FROM topic_baselines WHERE key = ${request.key}`
    const topic = cached
      ? { status: 'ranked' as const, order: JSON.parse(cached.ranking), error: null }
      : await rankByTopic(this.env, request)
    if (!cached && topic.status === 'ranked') {
      const ranking = JSON.stringify(topic.order)
      this.sql`INSERT OR REPLACE INTO topic_baselines (key, ranking) VALUES (${request.key}, ${ranking})`
    }
    log({
      event: 'topic_baseline',
      run,
      status: topic.status,
      cacheHit: Boolean(cached),
      latencyMs: Date.now() - started
    })
    this.landTopic(run, { ...topic, moves: [] })
  }

  // A baseline lands in synced state while its run is the latest, and in what its run ended with,
  // since the run can end first.
  private landTopic(run: string, topic: Topic) {
    if (this.state.run?.id === run) this.setState(withMoves({ ...this.state, topic }))
    const [ended] = this.sql<{ snapshot: string | null }>`SELECT snapshot FROM runs WHERE id = ${run}`
    if (ended?.snapshot) {
      const snapshot = withMoves({ ...(JSON.parse(ended.snapshot) as RunSnapshot), topic })
      this.sql`UPDATE runs SET snapshot = ${JSON.stringify(snapshot)} WHERE id = ${run}`
      // A sample run kept before its baseline landed is kept again with it.
      if (snapshot.run?.status === 'completed' && !snapshot.run.replayed)
        void this.keepAliveWhile(() => this.keepTopic(run, topic)).catch((e) =>
          log({ event: 'sample_run', run, error: message(e) })
        )
    }
  }

  // Checks the run limits, ends a run left waiting on a question, and records a new run.
  private beginRun() {
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
    return { run, startedAt }
  }

  // A pitch run: looks up the past guests' works by title and type, as pitched works are, then gives
  // Claude the show, the works that resolved, and the pitches it can rank. Guest names are compared
  // here and never sent.
  private async runPitches(run: string) {
    const { pastGuests } = this.state.booking!
    if (pastGuests.length > 0) {
      const count = pastGuests.length
      const note = this.addNote(run, `Looking up ${count} past ${count === 1 ? "guest's work" : "guests' works"}`)
      // They count toward the run's Qloo call limit, which a handful of searches can't reach.
      this.sql`UPDATE runs SET qloo_calls = qloo_calls + ${count} WHERE id = ${run}`
      const matches = await Promise.all(
        pastGuests.map(async ({ guest, work }) => {
          const { call, result } = await this.qloo((gateway) => gateway.search(work.title, qlooType[work.type], 5), run)
          return lookupWork(work, guest, call, result)
        })
      )
      const booking = this.state.booking!
      this.setState({
        ...this.state,
        booking: { ...booking, pastGuests: booking.pastGuests.map((g, i) => ({ ...g, match: matches[i] })) }
      })
      this.updateRun(run, (r) => ({ ...r, notes: r.notes.map((n, i) => (i === note ? { ...n, status: 'done' } : n)) }))
    }
    this.append(run, { role: 'user', content: pitchBrief(this.state.booking!, this.state.inbox!) })
    await this.runLoop(run)
  }

  // The current order, if it's the one the programmer means and its run has ended: until then the
  // agent can still redraft it. A guest pitch run since then doesn't hold it up.
  private editableOrder(id: string) {
    const order = this.state.insertionOrder
    if (!order || order.id !== id) throw new Error(`${id} isn't the current insertion order. Reload to see the latest.`)
    if (this.inProgress(order.run))
      throw new Error('The agent is still working on this run. Edit or approve the order once the run has ended.')
    return order
  }

  // Stores the current order, and puts it in its run's snapshot once the run has ended, so an
  // earlier run shows, and exports, its order as the programmer left it.
  private saveOrder(order: InsertionOrder) {
    this.setState({ ...this.state, insertionOrder: order })
    this.sql`UPDATE runs SET snapshot = json_set(snapshot, '$.insertionOrder', json(${JSON.stringify(order)}))
      WHERE id = ${order.run} AND snapshot IS NOT NULL`
  }

  // Prices the current order again after a figure it uses changed. An approved order whose price
  // changes returns to draft, so nothing the programmer approved changes under them.
  private repriceOrder() {
    const order = this.state.insertionOrder
    if (!order) return
    const priced = priceLines(order.lines, this.state.roster, this.state.cpm)
    const same = priced.cpm === order.cpm && priced.lines.every((l, i) => l.slotValue === order.lines[i].slotValue)
    if (!same) this.saveOrder({ ...order, ...priced, status: 'draft' })
  }

  // Reserves the next call number, before the call is made.
  private numberCall() {
    const [{ seq }] = this.sql<{ seq: number }>`INSERT INTO evidence (record) VALUES (NULL) RETURNING seq`
    return seq
  }

  // Whether `run` is the latest run and the agent is still working on it, or waiting on an answer.
  private inProgress(run: string) {
    const r = this.state.run
    return r?.id === run && (r.status === 'running' || r.status === 'waiting')
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

  // A reply of the latest pitch run, once that run has ended: until then the agent can still redraft it.
  private editableReply(pitchId: string) {
    this.guestPitches()
    const booking = this.state.booking
    const reply = booking?.replies?.find((r) => r.pitch === pitchId)
    if (!booking || !reply) throw new Error(`There's no drafted reply to ${pitchId}. Reload to see the latest.`)
    if (this.inProgress(booking.run))
      throw new Error('The agent is still drafting replies. Approve, edit, or discard them once the run has ended.')
    return reply
  }

  private saveReply(reply: PitchReply) {
    const booking = this.state.booking!
    const replies = booking.replies!.map((r) => (r.pitch === reply.pitch ? reply : r))
    this.setState({ ...this.state, booking: { ...booking, replies } })
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
      if (reply.stop_reason === 'refusal') return this.finish(run, `${declined(reply, 'continue this run')}.`)
      if (reply.stop_reason === 'max_tokens')
        return this.finish(run, "Claude's reply hit the output limit, so its tool calls were not run.")
      const assistant: Anthropic.MessageParam = { role: 'assistant', content: reply.content }
      if (reply.stop_reason === 'end_turn') {
        this.append(run, assistant)
        const texts = reply.content.flatMap((b) => (b.type === 'text' ? [b.text.trim()] : [])).filter(Boolean)
        return this.complete(run, texts.join('\n\n') || null)
      }
      const calls = reply.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      if (reply.stop_reason !== 'tool_use' || calls.length === 0)
        return this.finish(run, `Claude stopped unexpectedly (${reply.stop_reason}).`)
      // The last turn's calls aren't run: their results would need one more turn to reach Claude.
      if (turns >= MAX_TURNS)
        return this.finish(
          run,
          `Stopped at the limit of ${MAX_TURNS} Claude turns per run, before Claude finished, so this plan is incomplete. Not run: ${calls.flatMap((c) => noteFor(c, this.state) ?? []).join(', ')}.`,
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
        if (spent) log(summary(run, 'paused', spent))
        return
      }
      // The turn and its results are stored together, so history never ends on an unanswered call.
      this.append(run, assistant, { role: 'user', content: results.map((r) => r.block) })
      if (cut.length > 0)
        return this.finish(
          run,
          `Stopped at the limit of ${MAX_QLOO_CALLS} Qloo calls per run, before Claude finished, so this plan is incomplete. Cut off: ${cut.flatMap((c) => noteFor(c, this.state) ?? []).join(', ')}.`,
          'stopped'
        )
    }
  }

  // Runs one tool call. `cutOff` says the run's Qloo call limit refused one of its calls.
  private async callTool(run: string, call: Anthropic.ToolUseBlock) {
    const tool = tools.find((t) => t.definition.name === call.name)
    const text = noteFor(call, this.state)
    const note = text === null ? -1 : this.addNote(run, text)
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

  // Ends the run as failed, or stopped at a limit, with the reason and any unfinished notes marked
  // failed.
  private finish(run: string, error: string, status: 'failed' | 'stopped' = 'failed') {
    this.end(run, (r) => ({
      ...r,
      status,
      error,
      notes: r.notes.map((n) => (n.status === 'running' ? { ...n, status: 'failed' } : n))
    }))
  }

  // Ends the run as completed, with Claude's closing text, in the same state change.
  private complete(run: string, closing: string | null) {
    this.end(run, (r) => ({ ...r, status: 'completed', closing }))
  }

  // Ends the run as `ending` says and keeps what it ended with for getRun.
  private end(run: string, ending: (r: Run) => Run) {
    const r = this.state.run
    if (r?.id !== run) return
    const ended = ending(r)
    const runs = (this.state.runs ?? []).map((s) => (s.id === run ? { ...s, status: ended.status } : s))
    this.setState({ ...this.state, run: ended, runs })
    const { runs: _, guide: __, ...snapshot } = this.state
    const [spent] = this.sql<Spent>`
      UPDATE runs SET snapshot = ${JSON.stringify(snapshot)} WHERE id = ${run}
      RETURNING started_at, turns, qloo_calls, cache_hits`
    // A run started before run limits has no row to summarize.
    if (spent) log({ ...summary(run, ended.status, spent), ...(ended.replayed && { replayed: true }) })
    if (ended.status === 'completed' && !ended.replayed) this.keepSampleRun(run, snapshot)
  }

  // Keeps a completed sample launch run, answered with the sample answers and nothing the visitor
  // typed, for any session to replay while Qloo can't be called. Only a run whose every cited Qloo
  // call was answered is kept; a tool error Claude recovered from, such as a second question in one
  // turn, doesn't count. The guest pitch flow's fields are the visitor's own, not the run's, so they
  // stay out, and so does a comp search's query, which they typed.
  private keepSampleRun(run: string, { inbox: _, booking: __, ...ended }: RunSnapshot) {
    const state = { ...ended, roster: ended.roster.map((s) => ({ ...s, compSearch: null })) }
    const { sample, launch, run: r } = state
    if (!sample || !launch?.name || launch.comps.length > 0 || !r || r.typed || !onSampleLaunch(state, launch.name))
      return
    const { budget, exclusions } = sample.answers
    if (JSON.stringify([r.budget, r.exclusions]) !== JSON.stringify([budget, exclusions])) return
    const cited = new Set(JSON.stringify(state).match(CALL))
    const evidence = this.getEvidence().filter((e) => cited.has(e.call))
    if (evidence.length < cited.size || evidence.some((e) => e.error)) return
    this.storeSampleRun(run, { state, evidence })
  }

  private storeSampleRun(run: string, sampleRun: SampleRun) {
    void this.keepAliveWhile(() => this.env.QlooGateway.getByName('global').keepSampleRun(JSON.stringify(sampleRun)))
      .then(() => log({ event: 'sample_run', run, calls: sampleRun.evidence.length }))
      .catch((e) => log({ event: 'sample_run', run, error: message(e) }))
  }

  // A baseline that lands after its sample run was kept goes into the kept copy, which is what the
  // run ended with, rather than the run's snapshot, where the programmer may since have edited the
  // order. A copy another run has since replaced is left alone.
  private async keepTopic(run: string, topic: Topic) {
    const stored = await this.env.QlooGateway.getByName('global').sampleRun()
    const kept: SampleRun | null = stored && JSON.parse(stored)
    if (kept?.state.run?.id === run) this.storeSampleRun(run, { ...kept, state: withMoves({ ...kept.state, topic }) })
  }

  // Replays the stored sample run as this run: what it ended with, roster and all, with the calls
  // it cites copied into this session's log under new numbers and labelled replayed. Nothing calls
  // Qloo or Claude.
  private replay(run: string, stored: SampleRun, reason: string) {
    const seqs = stored.evidence.map(() => this.numberCall())
    const numbers = new Map(stored.evidence.map((e, i) => [e.call, callNumber(seqs[i])]))
    const renumbered = JSON.stringify(stored)
      .replace(CALL, (call) => numbers.get(call) ?? call)
      .replaceAll(stored.state.run!.id, run)
    const { state, evidence }: SampleRun = JSON.parse(renumbered)
    evidence.forEach((e, i) => {
      const record: Evidence = { ...e, replayed: true }
      this.sql`UPDATE evidence SET record = ${JSON.stringify(record)} WHERE seq = ${seqs[i]}`
    })
    this.setState({
      ...this.state,
      ...state,
      run: { ...state.run!, replayed: reason },
      runs: this.state.runs.map((s) => (s.id === run ? { ...s, replayed: true } : s))
    })
    // Runs stored before closing lines have none.
    this.complete(run, state.run!.closing ?? null)
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
  // evidence, success or failure. A gateway that throws instead of answering, such as one reset by
  // a deploy, fails the call like Qloo failing would, with its own record.
  private async qloo<T>(
    request: (gateway: DurableObjectStub<QlooGateway>) => Promise<QlooResult<T>>,
    run: string | null = null,
    seq = this.numberCall()
  ): Promise<{ call: string; result: QlooResult<T> }> {
    const call = callNumber(seq)
    const settled = this.watch(call, run)
    const started = Date.now()
    // Every request calls one gateway method; noting which lets a failed record name its request.
    let asked: keyof typeof REQUESTS | undefined
    const gateway = new Proxy(this.env.QlooGateway.getByName('global'), {
      get: (stub, key) => {
        if (typeof key === 'string' && key in REQUESTS) asked = key as keyof typeof REQUESTS
        return Reflect.get(stub, key)
      }
    })
    let result: QlooResult<T>
    try {
      result = (await request(gateway)) as QlooResult<T>
    } catch (e) {
      const error = `The Qloo gateway failed: ${message(e)}`
      const evidence = {
        at: new Date(started).toISOString(),
        ...REQUESTS[asked!],
        params: {},
        status: null,
        latencyMs: Date.now() - started,
        retries: 0,
        cacheHit: false,
        error,
        entities: [],
        tags: [],
        affinities: []
      }
      result = { ok: false, error, evidence }
    } finally {
      settled()
    }
    const record: Evidence = { call, run, ...result.evidence }
    this.sql`UPDATE evidence SET record = ${JSON.stringify(record)} WHERE seq = ${seq}`
    if (run && record.cacheHit) this.sql`UPDATE runs SET cache_hits = cache_hits + 1 WHERE id = ${run}`
    return { call, result }
  }

  // Times a Qloo call until it settles, and returns what to call then. Only the session's IN_FLIGHT
  // oldest calls are timed: the gateway sends that many at once, first come first served, so a later
  // call is still queued behind them, and time spent queued isn't Qloo being slow.
  private watch(call: string, run: string | null) {
    const entry: (typeof this.out)[number] = { call, run }
    this.out.push(entry)
    this.timeOldest()
    return () => {
      clearTimeout(entry.timer)
      this.out = this.out.filter((e) => e !== entry)
      const slow = this.state.slowCalls ?? []
      if (slow.some((c) => c.call === call))
        this.setState({ ...this.state, slowCalls: slow.filter((c) => c.call !== call) })
      this.timeOldest()
    }
  }

  private timeOldest() {
    const waitedMs = Number(this.env.QLOO_SLOW_MS)
    for (const entry of this.out.slice(0, IN_FLIGHT))
      entry.timer ??= setTimeout(() => {
        const slowCalls = [...(this.state.slowCalls ?? []), { call: entry.call, run: entry.run, waitedMs }]
        this.setState({ ...this.state, slowCalls })
      }, waitedMs)
  }
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

// Whether this is the sample launch on the unchanged sample network: the sample's CPM and every
// show's sample figures untouched (#44), and no show left out or mapped to a comp. Picking an
// ambiguous show's candidate, one of Qloo's own, doesn't change it.
function onSampleLaunch({ sample, roster }: Pick<State, 'sample' | 'roster'>, name: string | null) {
  if (!sample?.cpm || !('name' in sample.launch) || sample.launch.name !== name) return false
  return roster.every(
    (show) =>
      !show.excluded &&
      show.resolution !== 'mapped' &&
      sampleRoster.find((r) => r.name === show.name)?.sample.every((f) => show.sample?.includes(f))
  )
}

// A pitch run's first message: the show, the past guests' works that can anchor its rankings, and the
// pitches that can be ranked, by ID. Guest names and pitch text stay out of it.
function pitchBrief({ show, pastGuests }: Booking, inbox: Inbox) {
  const work = (w: Work) => `${w.title} (${workNoun[w.type]})`
  const unmatched: Record<WorkMatch['resolution'], string> = {
    resolved: 'resolved',
    ambiguous: 'ambiguous in Qloo search',
    missed: 'not in Qloo',
    failed: 'its lookup failed'
  }
  const anchors = pastGuests.filter((g) => g.match?.resolution === 'resolved' && g.match.entity)
  const others = pastGuests.filter((g) => !anchors.includes(g))
  const pitches = inbox.pitches.filter(rankable)
  // Every other pitch still gets a reply, so it's listed with why it can't be ranked.
  const setAside: Partial<Record<Pitch['status'], string>> = {
    no_work: 'no public work, so it was set aside and never sent to Qloo',
    unreadable: "it couldn't be read",
    failed: 'reading it failed'
  }
  const unranked = inbox.pitches.filter((p) => !rankable(p))
  const why = (p: Pitch) =>
    p.work ? `${work(p.work)}, ${p.match ? unmatched[p.match.resolution] : 'not looked up'}` : setAside[p.status]
  return [
    `This is a guest pitch run for the roster show "${show.name}", Qloo ID ${show.entity.id}. Rank the inbox's pitched works against it.`,
    anchors.length > 0
      ? `The past guests' works that resolved, as work: Qloo ID:\n${anchors.map((g) => `- ${work(g.work)}: ${g.match!.entity!.id}`).join('\n')}`
      : "No past guest's work resolved in Qloo, so the show is the only anchor.",
    others.length > 0 &&
      `Past guests' works that can't be anchors: ${others.map((g) => `${work(g.work)}, ${g.match ? unmatched[g.match.resolution] : 'not looked up'}`).join('; ')}.`,
    `The pitches whose works can be ranked, as pitch ID: work:\n${pitches.map((p) => `- ${p.id}: ${work(p.work)}`).join('\n')}`,
    unranked.length > 0 &&
      `The other pitches, which can't be ranked, as pitch ID: work, and why:\n${unranked.map((p) => `- ${p.id}: ${why(p)}`).join('\n')}`,
    'Reply to every pitch listed here.'
  ]
    .filter(Boolean)
    .join('\n\n')
}

// One structured line in Workers Logs, like the gateway's qloo_call lines.
const log = (
  line: { event: 'model_call' | 'run_summary' | 'topic_baseline' | 'sample_run' } & Record<string, unknown>
) => console.log(JSON.stringify(line))

// What a run has spent against its limits, from its row in `runs`.
type Spent = { started_at: number; turns: number; qloo_calls: number; cache_hits: number }

// The summary line for a run that ended, or paused on a question (TRD observability).
const summary = (run: string, outcome: Run['status'] | 'paused', spent: Spent) => ({
  event: 'run_summary' as const,
  run,
  outcome,
  turns: spent.turns,
  qlooCalls: spent.qloo_calls,
  cacheHits: spent.cache_hits,
  wallMs: Date.now() - spent.started_at
})

// The programmer's answer as Claude reads it, what code stores on the run from it, the launch it
// sets, and for comps, code's record of it for the tool result. Throws, changing nothing, when the
// reply doesn't fit the question.
function settle(
  question: Question,
  reply: Reply,
  launch: Launch | null
): { answer: string; stored: Partial<Run>; launch?: Launch; record?: string } {
  const typed = typeof reply.text === 'string' ? reply.text.trim() : ''
  const choice = reply.choice
  if (choice !== undefined && !question.options.includes(choice)) throw new Error("That isn't one of the options.")
  // Code builds the other kinds' answers, so the programmer's own words reach Claude only here.
  if (typed && question.kind !== 'choice' && question.kind !== 'launch' && question.kind !== 'comps')
    throw new Error('This question is answered with its form, not typed text.')
  if (question.kind === 'launch') return settleLaunch(choice, typed, launch)
  if (question.kind === 'comps') {
    const comps = readComps(reply.comps ?? [])
    // A name instead of comps is the name Qloo lists the launch under, as with a launch question.
    if (comps.length === 0) {
      if (!typed || !launch?.name)
        throw new Error(`Name up to ${MAX_COMPS} comps, or type the name Qloo lists the launch under.`)
      return settleLaunch(undefined, typed, launch)
    }
    if (typed) throw new Error('Name comps or type the name Qloo lists the launch under, not both.')
    return {
      answer: `Comps: ${comps.join(', ')}.`,
      stored: {},
      launch: { ...launch!, comps: comps.map(newComp) },
      record: `Code set the launch's comps to ${comps.join(', ')}; resolve them, then confirm their matches.`
    }
  }
  if (question.kind === 'confirm_comps') return confirmComps(question.options, reply.picks, launch!)
  if (question.kind === 'budget') {
    const budget = readBudget(reply)
    const amount = 'slots' in budget ? `${budget.slots} promo slots` : `$${budget.dollars.toLocaleString('en-US')}`
    return { answer: `Slot budget: ${amount}.`, stored: { budget } }
  }
  if (question.kind === 'exclusions') {
    if (!Array.isArray(reply.exclude)) throw new Error('List the shows to leave out, or none.')
    const exclusions = [...new Set(reply.exclude)]
    const unknown = exclusions.find((name) => !question.options.includes(name))
    if (unknown !== undefined) throw new Error(`"${unknown}" isn't one of the shows this launch can leave out.`)
    const answer = exclusions.length
      ? `Leave out of this launch: ${exclusions.join(', ')}.`
      : 'No exclusions for this launch.'
    return { answer, stored: { exclusions } }
  }
  const answer = [choice, typed].filter(Boolean).join('\n\n')
  if (!answer) throw new Error('Pick an option or type an answer.')
  return { answer, stored: typed ? { typed: true } : {} }
}

// A launch pick sets the launch's match to that candidate, citing the search it came from; a name
// renames the launch, for the agent to look up.
function settleLaunch(
  choice: string | undefined,
  name: string,
  launch: Launch | null
): { answer: string; stored: Partial<Run>; launch: Launch } {
  if (choice !== undefined && name) throw new Error('Pick a candidate or type a name, not both.')
  if (choice === undefined && !name) throw new Error('Pick a candidate or type the name Qloo lists it under.')
  if (name)
    return { answer: `Look it up as "${name}".`, stored: {}, launch: { name, match: null, comps: launch?.comps ?? [] } }
  const match = launch?.match
  const candidates = match?.resolution === 'ambiguous' ? match.candidates : []
  const entity = candidates[candidateLabels(candidates).indexOf(choice!)]
  if (!match || !entity) throw new Error("The launch's candidates have changed. Start the run again.")
  return {
    answer: `The launch is ${choice}.`,
    stored: {},
    launch: {
      ...launch!,
      match: { resolution: 'resolved', entity, candidates: [], evidence: match.evidence, error: null }
    }
  }
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

// Comp names as the programmer gave them: trimmed, blanks dropped, and the same name once. Throws
// past the limit.
function readComps(names: unknown): string[] {
  const given = Array.isArray(names) ? names.filter((n): n is string => typeof n === 'string') : []
  const comps: string[] = []
  for (const name of given.map((n) => n.trim()).filter(Boolean))
    if (!comps.some((c) => sameName(c, name))) comps.push(name)
  if (comps.length > MAX_COMPS)
    throw new Error(
      `${comps.length} comps is over the limit of ${MAX_COMPS}. Name up to ${MAX_COMPS} released shows to stand in for the launch.`
    )
  return comps
}

const newComp = (name: string): Comp => ({ name, match: null, status: 'unconfirmed', entity: null })

// A run as it starts: running, with nothing asked or answered yet.
const newRun = (id: string): Run => ({
  id,
  status: 'running',
  notes: [],
  error: null,
  question: null,
  budget: null,
  exclusions: null,
  closing: null
})

// The programmer's pick for each comp the question offered, in its order: one of its matches, which
// becomes the comp's entity, or null for none of these.
function confirmComps(
  offered: string[],
  picks: unknown,
  launch: Launch
): { answer: string; stored: Partial<Run>; launch: Launch; record: string } {
  if (!Array.isArray(picks) || picks.length !== offered.length) throw new Error('Confirm or reject each comp.')
  const comps = [...launch.comps]
  const lines = offered.map((name, i) => {
    const at = comps.findIndex((c) => c.name === name)
    if (at < 0) throw new Error("The launch's comps have changed. Start the run again.")
    if (picks[i] === null) {
      comps[at] = { ...comps[at], status: 'rejected', entity: null }
      return `${name}: none of these.`
    }
    const entity = offeredBy(comps[at].match).find((c) => c.id === picks[i])
    if (!entity) throw new Error(`That isn't one of the matches for ${name}.`)
    comps[at] = { ...comps[at], status: 'confirmed', entity }
    return `${name}: ${candidateLabels([entity])[0]}.`
  })
  const confirmed = comps.filter((c) => c.status === 'confirmed')
  const record = confirmed.length
    ? `Code confirmed these comps: ${confirmed.map((c) => `${c.name} (Qloo ID ${c.entity!.id})`).join(', ')}.`
    : 'No comp is confirmed.'
  return { answer: lines.join('\n'), stored: {}, launch: { ...launch, comps }, record }
}

// The progress note a tool call shows, such as "Resolving The Big Picture".
function noteFor(call: Anthropic.ToolUseBlock, state: State) {
  const tool = tools.find((t) => t.definition.name === call.name)
  return tool ? tool.note(call.input, state) : `Calling ${call.name}`
}
