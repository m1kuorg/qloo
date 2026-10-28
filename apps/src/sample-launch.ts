// The guest network's sample launches beside The Watch (ADR 0007, #289): each a launch in a status of its
// own, its one run captured from real runs on a development guest network, trimmed as the stored sample
// run is, and seeded into the guest network with no call to Qloo or Claude. They hold Qloo data, so they
// live only in each environment's D1, in `sample_launches`, loaded there by hand from what
// scripts/capture-sample-launches.ts writes outside the repo, never in the repo itself.
import type { RunSnapshot, RunSummary, State } from './agent'
import { CALL, type Evidence } from './evidence'

// A run as a replay or a seed keeps it: what it ended with, less the guest pitch flow's fields, which are
// the network's own, and every evidence record that cites.
export type KeptRun = { state: Omit<RunSnapshot, 'inbox' | 'booking'>; evidence: Evidence[] }

// A sample launch: its run's row in the launch's list of runs, the run kept, and when it was captured.
export type SampleLaunch = KeptRun & { captured: string; summary: RunSummary }

// What a replay or a seed keeps of the state a run ended with: all of it but the guest pitch flow's
// fields, and each comp search, whose query a person typed; and from `log`, every record it cites. Null
// when a record it cites is missing.
export function keptRun({ inbox: _, booking: __, ...ended }: RunSnapshot, log: Evidence[]): KeptRun | null {
  const state = { ...ended, roster: ended.roster.map((s) => ({ ...s, compSearch: null })) }
  const cited = new Set(JSON.stringify(state).match(CALL))
  const evidence = log.filter((e) => cited.has(e.call))
  return evidence.length < cited.size ? null : { state, evidence }
}

// A launch's state and evidence log as a sample launch, captured at `captured`: its one run, which has
// ended, kept as keptRun keeps it, with no call still slow. Only a first run is taken, so its order's
// number is the first run's, as a seeded launch's list of runs starts with it. Throws, saying why, for any
// other launch.
export function sampleLaunchOf({ runs, ...ended }: State, log: Evidence[], captured: string): SampleLaunch {
  const [summary] = runs
  if (runs.length !== 1 || ended.run?.id !== summary.id)
    throw new Error(`A sample launch is one run of a launch; this one has ${runs.length}.`)
  if (ended.run.status === 'running' || ended.run.status === 'waiting')
    throw new Error(`Its run is ${ended.run.status}; only a run that has ended can be seeded.`)
  const kept = keptRun({ ...ended, slowCalls: [] }, log)
  if (!kept) throw new Error('A call its run cites is missing from its evidence log.')
  return { captured, summary, ...kept }
}

// The most characters of a launch's JSON one row of `sample_launches` holds. The JSON is ASCII, so a
// row's statement stays well inside D1's 100 KB limit on one SQL statement, its quotes doubled and all.
const CHUNK = 40_000

// The SQL that replaces what `sample_launches` holds with `launches`, each by its key, such as
// "approved", as ASCII JSON in chunks of CHUNK characters, to run with `wrangler d1 execute`.
export function sampleLaunchesSql(launches: { key: string; launch: SampleLaunch }[]) {
  const quoted = (s: string) => `'${s.replaceAll("'", "''")}'`
  const statements = ['DELETE FROM sample_launches;']
  for (const { key, launch } of launches) {
    // Each non-ASCII UTF-16 unit escaped, so no chunk splits a character, and a row's length is its size.
    const json = JSON.stringify(launch).replace(
      /[^\x20-\x7e]/g,
      (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`
    )
    for (let seq = 0; seq * CHUNK < json.length; seq++)
      statements.push(
        `INSERT INTO sample_launches (key, seq, chunk) VALUES (${quoted(key)}, ${seq}, ${quoted(json.slice(seq * CHUNK, (seq + 1) * CHUNK))});`
      )
  }
  return `${statements.join('\n')}\n`
}

// The sample launches from `sample_launches`' rows, read in key and chunk order, each by its key.
export function readSampleLaunches(rows: { key: string; chunk: string }[]) {
  const json = new Map<string, string>()
  for (const { key, chunk } of rows) json.set(key, (json.get(key) ?? '') + chunk)
  return [...json].map(([key, text]) => ({ key, launch: JSON.parse(text) as SampleLaunch }))
}
