import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import type { Show } from '../agent'
import type { Entity } from '../overlap'
import { Alert, listOf } from './controls'
import { count } from './PageHeader'
import { sentence, StateLine } from './states'

// The pieces the roster page's two analyses, the Overlap tab and the Listeners tab, share: what stands
// under each one's sentence, with its action, and the show column of each one's table.

// What stands under the sentence of one of the roster's analyses, the overlap's or the listener profile's,
// once it can start: a line in bold once the roster's matched shows have changed since it was made
// (`stale`); the `failed` line of one that failed with rows landed; then its `action`, a secondary, with
// up to how many Qloo calls it may spend beside it, which describes it, unless it has none to ask; and a
// refusal under it, in the limits' words. A call the gateway's cache answers costs no real request, so
// it's "up to".
export function AnalysisAction({
  stale,
  failed,
  action,
  calls,
  costId,
  busy,
  error,
  start
}: {
  stale: string | false
  failed: string | null
  action: string
  calls: number
  costId: string
  busy: boolean
  error: string | null
  start: () => void
}) {
  return (
    <div className="flex flex-col items-start gap-3 empty:hidden">
      {stale && <p className="max-w-[72ch] font-semibold">{stale}</p>}
      {failed && (
        <p className="max-w-[72ch]">
          <StateLine kind="failed">{sentence(failed)}</StateLine>
        </p>
      )}
      {calls > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {/* Still focusable while it starts, so a refusal leaves focus on it. */}
          <Button variant="secondary" disabled={busy} focusableWhenDisabled aria-describedby={costId} onClick={start}>
            {busy && <Spinner data-icon="inline-start" />}
            {action}
          </Button>
          <span id={costId} className="type-caption text-muted-foreground">
            {`Up to ${count(calls, 'Qloo call')}`}
          </span>
        </div>
      )}
      {error && (
        <p className="max-w-[72ch]">
          <Alert error={error} />
        </p>
      )}
    </div>
  )
}

// The show's column of the roster's analyses' tables, held at the left while the rest scrolls under it,
// ruled where they meet, as the roster table's is, and over the call numbers passing under it. A word too
// long for it breaks anywhere rather than widening it.
export const heldShow = 'sticky left-0 z-10 bg-background pl-2 wrap-anywhere max-md:border-r max-md:pr-3'

// A Qloo show's row header in those tables: its first show on the roster, with what the roster says of it
// under its name, and the shows matched to the same Qloo show, which are measured once and listed with it;
// then, under them, the analysis's own `note` on the show, such as "Leans differently". In the held column,
// it stays in view however far the table is scrolled.
export function AnalysisShow({
  entity,
  shows: [first, ...others],
  note,
  className
}: {
  entity: Entity
  shows: Show[]
  note?: string
  className?: string
}) {
  const notes = [
    first.resolution === 'mapped' && `Mapped to ${entity.name}`,
    first.excluded && 'Left out',
    others.length > 0 && `Same Qloo show as ${listOf(others.map((s) => s.name))}`
  ].filter(Boolean)
  return (
    <th scope="row" className={cn('border-b py-3 pl-3 align-top', heldShow, 'text-left font-normal', className)}>
      <span className="flex min-w-40 flex-col items-start gap-1 md:min-w-48">
        <span className="text-[15px] leading-snug font-semibold">{first.name}</span>
        {notes.length > 0 && <span className="type-caption text-muted-foreground">{notes.join(' · ')}</span>}
        {note && <span className="type-caption text-muted-foreground">{note}</span>}
      </span>
    </th>
  )
}
