import { Agent, callable, type Connection } from 'agents'
import { callNumber, type Evidence } from './evidence'
import type { QlooGateway, QlooResult } from './gateway'
import { resolveName, type Candidate } from './resolve'

export type Show = {
  name: string
  resolution: 'resolved' | 'ambiguous' | 'missed' | 'failed'
  entity: Candidate | null // the matched Qloo entity, once resolved
  candidates: Candidate[] // up to three, while ambiguous
  evidence: string // the call number of the search behind the resolution
  error: string | null // why the search failed
}

// Everything the UI renders, synced to every connection of this session. Later tickets add
// their own fields; the evidence log stays out of it and is fetched with getEvidence.
export type State = { roster: Show[] }

// One instance per visitor session, named by the session cookie.
export class CrossfeedAgent extends Agent<Env, State> {
  initialState: State = { roster: [] }

  async onStart() {
    this.sql`CREATE TABLE IF NOT EXISTS evidence (seq INTEGER PRIMARY KEY AUTOINCREMENT, record TEXT)`
  }

  // State changes only through actions; a client can't write it directly.
  validateStateChange(_next: State, source: Connection | 'server') {
    if (source !== 'server') throw new Error('State is read-only; use an action')
  }

  // Replaces the roster with the pasted show names, one per line, each resolved through Qloo.
  @callable()
  async importRoster(text: string) {
    const names = [...new Map(lines(text).map((n) => [n.toLowerCase(), n])).values()]
    if (names.length === 0) throw new Error('Paste at least one show name, one per line.')
    // One search at a time: Qloo answered 429 to bursts of three fast searches. #35 moves pacing
    // and retries into the gateway.
    const roster: Show[] = []
    for (const name of names) {
      const { call, result } = await this.qloo((gateway) => gateway.search(name, 'urn:entity:podcast'))
      roster.push(
        result.ok
          ? { name, ...resolveName(name, result.data), evidence: call, error: null }
          : { name, resolution: 'failed', entity: null, candidates: [], evidence: call, error: result.error }
      )
    }
    this.setState({ ...this.state, roster })
  }

  // The session's evidence log: one record per Qloo call, oldest first.
  @callable()
  getEvidence(): Evidence[] {
    return this.sql<{ record: string }>`SELECT record FROM evidence WHERE record IS NOT NULL ORDER BY seq`.map((r) =>
      JSON.parse(r.record)
    )
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

const lines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
