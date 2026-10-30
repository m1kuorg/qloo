// The guest network's sample launches, beside the sample launch, The Watch (ADR 0007, #289): a launch in
// each other status, each seeded with one run captured from real runs on a development guest network,
// trimmed as the stored sample run is, with no call to Qloo or Claude. They hold Qloo data, so they live
// only in each environment's D1, in `sample_launches`, loaded there by hand from what
// scripts/capture-sample-launches.ts writes outside the repo (test/capture.ts), never in the repo itself.
import type { RunSnapshot, RunSummary } from './agent'
import { CALL, type Evidence } from './evidence'

// A run as a replay or a seed keeps it: what it ended with, less the guest pitch flow's fields, which are
// the network's own, and the roster's overlap, which cites the network's calls; and every evidence record
// that cites.
export type KeptRun = { state: Omit<RunSnapshot, 'inbox' | 'booking' | 'rosterOverlap'>; evidence: Evidence[] }

// The run one of the sample launches is seeded with: its row in the launch's list of runs, the run kept,
// and when it was captured (ISO time).
export type CapturedRun = KeptRun & { captured: string; summary: RunSummary }

// A row of `sample_launches`: a chunk of a captured run's JSON, under its launch's key, such as "approved".
export type SampleLaunchesRow = { key: string; chunk: string }

// A captured run under its launch's key.
export type KeyedRun = { key: string; run: CapturedRun }

// What a replay or a seed keeps of the state a run ended with: all of it but the guest pitch flow's
// fields, each comp search, whose query a person typed, and the roster's overlap, which cites the
// network's calls rather than this log's, so no ranking of it, failed or not, keeps the run from being
// stored; and from `log`, every record it cites. Null when a record it cites is missing.
export function keptRun(
  { inbox: _, booking: __, rosterOverlap: ___, ...ended }: RunSnapshot,
  log: Evidence[]
): KeptRun | null {
  const state = { ...ended, roster: ended.roster.map((s) => ({ ...s, compSearch: null })) }
  const cited = new Set(JSON.stringify(state).match(CALL))
  const evidence = log.filter((e) => cited.has(e.call))
  return evidence.length < cited.size ? null : { state, evidence }
}

// The captured runs from `sample_launches`' rows, read in key and chunk order, each by its key.
export function readSampleLaunches(rows: SampleLaunchesRow[]): KeyedRun[] {
  const json = new Map<string, string>()
  for (const { key, chunk } of rows) json.set(key, (json.get(key) ?? '') + chunk)
  return [...json].map(([key, text]) => ({ key, run: JSON.parse(text) as CapturedRun }))
}
