import { Agent, callable, type Connection } from 'agents'
import { callNumber, type Evidence } from './evidence'
import type { QlooGateway, QlooResult } from './gateway'
import { resolveName, type Candidate } from './resolve'
import { parseRoster, type RosterFormat } from './roster'

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

// Everything the UI renders, synced to every connection of this session. Later tickets add
// their own fields; the evidence log stays out of it and is fetched with getEvidence.
export type State = { roster: Show[]; cpm: number | null } // CPM in dollars; no default for a real network

// One instance per visitor session, named by the session cookie.
export class CrossfeedAgent extends Agent<Env, State> {
  initialState: State = { roster: [], cpm: null }

  async onStart() {
    this.sql`CREATE TABLE IF NOT EXISTS evidence (seq INTEGER PRIMARY KEY AUTOINCREMENT, record TEXT)`
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
