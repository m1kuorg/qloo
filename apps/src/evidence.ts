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
  // Copied from the run one of the guest network's sample launches was seeded with (sample-launches.ts):
  // Qloo answered it at `at`, as the run was captured, and no request was made for it since.
  fromSample?: true
  // The network's call this record copies, as a launch's run started: the network's agent made the
  // request when its roster was looked up, and the launch's run made none.
  copiedFrom?: string
}

export type CallEvidence = Omit<Evidence, 'call' | 'run'>

export const callNumber = (n: number) => `C-${String(n).padStart(2, '0')}`

// A call number wherever it appears in state, such as "C-07".
export const CALL = /\bC-\d+\b/g
