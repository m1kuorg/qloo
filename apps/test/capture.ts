// Capturing the guest network's sample launches (ADR 0007, #289), as scripts/capture-sample-launches.ts
// does from a dev server, and test/sample-launches.test.tsx from runs against the fakes: each launch's one
// run, trimmed as the stored sample run is (keptRun in src/sample-launches.ts), and the SQL that loads them
// into D1's `sample_launches`. Neither is the Worker's, so it lives here, outside its bundle.
import type { State } from '../src/agent'
import type { Evidence } from '../src/evidence'
import { keptRun, type CapturedRun, type KeyedRun } from '../src/sample-launches'

// A launch's state and evidence log as the run one of the sample launches is seeded with, captured at
// `captured`: its one run, which has ended, kept as keptRun keeps it, with no call still slow. Only a first
// run is taken, so its order's number is the first run's, as each seeded list of runs starts with it.
// Throws, saying why, for any other launch.
export function capturedRunOf({ runs, ...ended }: State, log: Evidence[], captured: string): CapturedRun {
  const [summary] = runs
  if (runs.length !== 1 || ended.run?.id !== summary.id)
    throw new Error(`One of the sample launches is one run of a launch; this one has ${runs.length}.`)
  if (ended.run.status === 'running' || ended.run.status === 'waiting')
    throw new Error(`Its run is ${ended.run.status}; only a run that has ended can be seeded.`)
  const kept = keptRun({ ...ended, slowCalls: [] }, log)
  if (!kept) throw new Error('A call its run cites is missing from its evidence log.')
  return { captured, summary, ...kept }
}

// The most characters of a run's JSON one row of `sample_launches` holds. The JSON is ASCII, so a row's
// statement stays well inside D1's 100 KB limit on one SQL statement, its quotes doubled and all.
const CHUNK = 40_000

// The SQL that replaces what `sample_launches` holds with `runs`, each by its key, such as "approved", as
// ASCII JSON in chunks of CHUNK characters, to run with `wrangler d1 execute`.
export function sampleLaunchesSql(runs: KeyedRun[]) {
  const quoted = (s: string) => `'${s.replaceAll("'", "''")}'`
  const statements = ['DELETE FROM sample_launches;']
  for (const { key, run } of runs) {
    // Each non-ASCII UTF-16 unit escaped, so no chunk splits a character, and a row's length is its size.
    const json = JSON.stringify(run).replace(
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
