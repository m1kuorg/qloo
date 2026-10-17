// The evidence record: one per Qloo call, cached or not, appended to the calling session's log.
// The gateway fills everything but `call` and `run`; the session stamps those when it appends.
// Each endpoint's ticket fills `entities`, `tags`, or `affinities`; none reshapes the record.
export type Evidence = {
  call: string // "C-01", numbered per session
  run: string | null // the launch or pitch run that made the call; null outside a run
  at: string // ISO time the call started
  method: 'GET' | 'POST'
  endpoint: string // "/search", "/v2/insights", "/v2/analysis/compare"
  params: Record<string, string | number | boolean> // what was sent, never the key
  status: number | null // HTTP status of the last attempt; null when none came back
  latencyMs: number
  retries: number
  cacheHit: boolean
  error: string | null
  entities: { id: string; name: string; type: string; popularity: number | null }[]
  tags: { id: string; name: string; score: number | null }[]
  affinities: {
    id: string
    name: string
    affinity: number | null
    explainability: { id: string; score: number }[]
  }[]
  replayed?: true // copied from the stored sample run by a replay: no request was made for it
}

export type CallEvidence = Omit<Evidence, 'call' | 'run'>

export const callNumber = (n: number) => `C-${String(n).padStart(2, '0')}`
