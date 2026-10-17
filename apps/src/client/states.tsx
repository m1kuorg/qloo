import type { SlowCall } from '../agent'

// The workspace's states, worded and marked the same way wherever they appear. A state leads with
// its word, so it never relies on its color, and no state color is Chart Red (DESIGN.md colors).
// `failed` is Qloo failing after its retries or at the daily cap; `error` is anything else that went wrong.
export type StateKind = 'empty' | 'loading' | 'slow' | 'failed' | 'missed' | 'error'

const words: Record<StateKind, string | null> = {
  empty: null,
  loading: 'Working',
  slow: 'Slow Qloo',
  failed: 'Failed',
  missed: 'Missed',
  error: 'Error'
}

// A span, so it can sit in a line of text; it's set as a block of its own elsewhere. `word`
// replaces the state's own, such as a run's "Stopped at a limit".
export function StateLine({
  kind,
  word = words[kind],
  role,
  children
}: {
  kind: StateKind
  word?: string | null
  role?: 'alert'
  children: React.ReactNode
}) {
  return (
    <span className="state" data-state={kind} role={role}>
      {word && (
        <>
          <b className="state-w">{word}</b>{' '}
        </>
      )}
      {children}
    </span>
  )
}

// Qloo calls still waiting past the slow mark, by call number, as a sentence for a table row.
export const slowText = (calls: SlowCall[]) =>
  `${calls.map((c) => c.call).join(', ')} ${calls.length === 1 ? 'has' : 'have'} waited over ${calls[0].waitedMs / 1000} s for Qloo. Still trying.`

// The same as a line of its own, with what happens next.
export function SlowCalls({ calls }: { calls: SlowCall[] }) {
  if (calls.length === 0) return null
  return (
    <StateLine kind="slow">
      {slowText(calls)} A call Qloo doesn’t answer is retried twice, so it can take about a minute.
    </StateLine>
  )
}

// Ends an error message as a sentence, whether or not it came with its own full stop.
export const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`)
