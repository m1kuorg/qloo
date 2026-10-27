import { cn } from 'cn'
import { CircleDashedIcon, ClockIcon, SquareXIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Spinner } from '@/components/ui/spinner'
import type { SlowCall } from '../agent'
import type { Pitch } from '../inbox'

// The workspace's states, worded and marked the same way wherever they appear: a glyph, the state's
// word in bold, then what it's about. A state leads with its word, so it never relies on its colour
// or its glyph. Failures are crimson, with a square ✕ where the live dot is a circle.
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

// Set in the line's text, a little under its cap height, hidden from screen readers.
const glyph = 'mr-1.5 inline-block size-[1em] shrink-0 align-[-0.15em]'
const glyphs: Record<StateKind, ReactNode> = {
  empty: null,
  loading: <Spinner className={glyph} />,
  slow: <ClockIcon aria-hidden="true" className={glyph} />,
  failed: <SquareXIcon aria-hidden="true" className={cn(glyph, 'text-destructive')} />,
  missed: <CircleDashedIcon aria-hidden="true" className={cn(glyph, 'text-muted-foreground')} />,
  error: <SquareXIcon aria-hidden="true" className={cn(glyph, 'text-destructive')} />
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
  children: ReactNode
}) {
  const failure = kind === 'failed' || kind === 'error'
  return (
    <span className={kind === 'empty' ? 'text-muted-foreground' : undefined} data-state={kind} role={role}>
      {glyphs[kind]}
      {word && (
        <>
          <b className={cn('font-semibold', failure && 'text-destructive')}>{word}</b>{' '}
        </>
      )}
      {children}
    </span>
  )
}

// Qloo calls still waiting past the slow mark, by call number, as a sentence for a table row.
export const slowText = (calls: SlowCall[]) =>
  `${calls.map((c) => c.call).join(', ')} ${calls.length === 1 ? 'has' : 'have'} waited over ${calls[0].waitedMs / 1000}\u00a0s for Qloo. Still trying.`

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

// A pitch's work's match, in a word.
export const matchLabel = {
  resolved: 'Matched',
  ambiguous: 'Ambiguous',
  missed: 'Not in Qloo',
  failed: 'Lookup failed'
}

// A pitch's state in one word: still being read, its work's match, or why it was set aside. The
// dashboard's inbox line counts pitches by it too.
export const stateLabel = (p: Pitch) =>
  ({
    reading: 'Reading',
    looking_up: 'Looking up',
    no_work: 'Set aside',
    unreadable: 'Unreadable',
    failed: 'Failed',
    read: p.match ? matchLabel[p.match.resolution] : 'Looking up'
  })[p.status]

// What a page knows of its agent's socket besides the state: a connection that closed for good, or
// one that dropped and reconnects by itself. The agent's first state arrives with its identity, so a
// state without one is a reconnect, never the first connect.
export type Connection = { lost: string | null; reconnecting: boolean }
export function connectionOf(agent: { state: unknown; identified: boolean; connectionError: unknown }): Connection {
  const lost = agent.connectionError ? 'This page lost its connection. Reload to try again.' : null
  return { lost, reconnecting: !lost && agent.state !== undefined && agent.identified === false }
}

// The connection's own state as a line: lost, or reconnecting; nothing while it's connected.
export function ConnectionState({ connection }: { connection: Connection }) {
  if (connection.lost) return <StateLine kind="error">{connection.lost}</StateLine>
  if (connection.reconnecting)
    return (
      <StateLine kind="loading" word="Reconnecting…">
        {null}
      </StateLine>
    )
  return null
}
