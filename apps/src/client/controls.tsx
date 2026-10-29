import { cn } from 'cn'
import { CheckIcon, CopyIcon } from 'lucide-react'
import { useEffect, useRef, useState, type ComponentProps, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { round } from '../demographics'
import { bandMeter, type Band } from '../fit'
import type { Candidate } from '../resolve'
import { StateLine } from './states'

// A write to one of the Worker's routes, as JSON, answered with JSON or `{ error }`. `fetch` sends the
// page's Origin, which every signed-in write needs; an HTML form wouldn't (apps/README.md).
export async function send<T>(path: string, body: object = {}): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const answer = (await res.json().catch(() => null)) as { error?: string } | null
  if (!res.ok || !answer)
    throw new Refused(answer?.error ?? `Crossfeed answered ${res.status}. Try again.`, res.status, answer)
  return answer as T
}

// A refusal `send` throws: its words, and the status and the whole answer, for a caller that branches
// on more than the words, such as a change held until the member confirms it's them.
export class Refused extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly answer: Record<string, unknown> | null
  ) {
    super(message)
  }
}

// Runs one action at a time for a form, keeping its error for the form to show until the next run, or
// until `clear`, once something else has made it stale.
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run, clear: () => setError(null) }
}

// While `dirty`, leaving the page (a link in the shell, a reload, closing the tab) asks first, so edits
// typed and not yet saved aren't lost without a word.
export function useLeaveGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    const ask = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', ask)
    return () => window.removeEventListener('beforeunload', ask)
  }, [dirty])
}

export const Alert = ({ error }: { error: string | null }) =>
  error && (
    <StateLine kind="error" role="alert">
      {error}
    </StateLine>
  )

// Signing out of this browser's session alone, as a guest does to create an account of their own (ADR
// 0008), and a member on an invite page to join with another account: the button, busy while it works, and
// the route's error after it. Then the sign-in page opens, unless `then` goes elsewhere.
export function SignOut({
  children,
  variant,
  className,
  then = () => window.location.assign('/sign-in')
}: {
  children: string
  variant?: ComponentProps<typeof Button>['variant']
  className?: string
  then?: () => void
}) {
  const { busy, error, run } = useAction()
  const signOut = () =>
    run(async () => {
      await send('/auth/sign-out')
      then()
    })
  return (
    <>
      <Button variant={variant} className={className} disabled={busy} onClick={() => void signOut()}>
        {busy && <Spinner data-icon="inline-start" />}
        {busy ? 'Signing out…' : children}
      </Button>
      <Alert error={error} />
    </>
  )
}

export { bandMeter } from '../fit'
export { listOf, listParts } from '../text'

// A show's fit band as a three-step meter, filled from the left, then its word: in signal for a
// finalist, what the agent puts forward, in ink otherwise. The word says it, so the meter is hidden
// from screen readers. `quiet` keeps the word's place but shows it only while its row (a `group/row`)
// is hovered or holds focus, and on touch screens, which can't hover; screen readers always hear it.
export function FitBand({ band, finalist, quiet = false }: { band: Band; finalist: boolean; quiet?: boolean }) {
  const { bars, word } = bandMeter[band]
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 type-caption text-muted-foreground">
      <span className="inline-flex items-end gap-0.5" aria-hidden="true">
        {[1, 2, 3].map((step) => (
          <span
            key={step}
            className={cn(
              'h-3 w-1 rounded-[1px]',
              step > bars ? 'bg-border' : finalist ? 'bg-signal' : 'bg-foreground'
            )}
          />
        ))}
      </span>
      <span
        className={
          quiet
            ? 'opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 pointer-coarse:opacity-100'
            : undefined
        }
      >
        {word}
      </span>
    </span>
  )
}

// What a ranking left out, and why: the fit chart's shows and a pitch list's pitches, as a compact
// table under the ranked rows, captioned, or named by the heading of a section of its own (`labelledBy`).
export const NotScored = ({
  noun,
  rows,
  labelledBy
}: {
  noun: string
  rows: { key: string; name: string; reason: string }[]
  labelledBy?: string
}) => (
  <table className="type-caption" aria-labelledby={labelledBy}>
    {!labelledBy && <caption className="pb-1.5 text-left type-ui font-semibold">Not scored · {rows.length}</caption>}
    <thead className="text-muted-foreground">
      <tr className="border-b">
        <th scope="col" className="py-1.5 pr-4 text-left font-normal">
          {noun}
        </th>
        <th scope="col" className="py-1.5 text-left font-normal">
          Reason
        </th>
      </tr>
    </thead>
    <tbody>
      {rows.map((n) => (
        <tr key={n.key} className="border-b">
          <td className="py-1.5 pr-4 align-top font-medium">{n.name}</td>
          <td className="py-1.5 align-top text-muted-foreground">{n.reason}</td>
        </tr>
      ))}
    </tbody>
  </table>
)

// Each metric's one format, wherever its figure shows (docs/DESIGN.md, Figures), a missing one as "–".
// A count in words takes `count` (PageHeader.tsx), which separates thousands as `downloads` does.

// Downloads per episode, with thousands separators: "700,000".
export const downloads = (n: number | null) => (n == null ? '–' : n.toLocaleString('en-US'))

// Popularity, as a percentile to one decimal: "99.7".
export const percentile = (p: number | null) => (p === null ? '–' : (p * 100).toFixed(1))

// An affinity, or a tag's score, to three decimals: "0.978".
export const score = (x: number | null) => (x === null ? '–' : x.toFixed(3))

// A demographic score, to three decimals, as Qloo sends it and the mismatch check rounds it
// (demographics.ts), signed with a true minus sign: "−0.248", "+0.420". No lean, −0 included, is "0.000".
export const demographic = (x: number | null) => {
  if (x === null) return '–'
  const r = round(x)
  return r === 0 ? '0.000' : `${r > 0 ? '+' : '\u2212'}${Math.abs(r).toFixed(3)}`
}

// A day as the app writes it, such as "Oct 19", from an ISO string or epoch ms.
export const day = (when: string | number) =>
  new Date(when).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

// And the UTC day, as the capture of the run one of the sample launches is seeded with is dated, so its
// run log reads as the run’s own text does (scripts/capture-sample-launches.ts).
export const utcDay = (when: string | number) =>
  new Date(when).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

// A radio list of Qloo entities with their popularity, and for works their year and a line on what
// each is, and a button that commits the pick, beside `note`, where the options came from, which goes
// on to name the figure each shows. Options that Qloo gives nothing else to tell apart
// show their Qloo IDs, and the list says so (#128). The button disables itself while the pick is sent
// and once it's the match, which leaves focus on nothing, so focus goes back to the picked option:
// the match as it now stands, from where Tab reaches what follows.
export function PickOne({
  legend,
  options,
  current,
  note,
  submit,
  busy,
  pick
}: {
  legend: string
  options: (Candidate & { disambiguation?: string | null; description?: string | null })[]
  current: string | undefined
  note: ReactNode
  submit: string
  busy: boolean
  pick: (id: string) => Promise<unknown>
}) {
  const [choice, setChoice] = useState(current ?? '')
  const form = useRef<HTMLFormElement>(null)
  // A missing description (on candidates synced before there were any) reads like none.
  const described = options.some((c) => c.description)
  const twins = twinIds(options, (c) => [c.name, c.disambiguation || '', percentile(c.popularity), c.description || ''])
  return (
    <form
      ref={form}
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault()
        await pick(choice)
        // Unless the person has gone elsewhere meanwhile.
        const at = document.activeElement
        if (at && at !== document.body && !form.current?.contains(at)) return
        form.current?.querySelector<HTMLInputElement>('input[type=radio]:checked')?.focus()
      }}
    >
      <fieldset className="flex min-w-0 flex-col gap-1">
        <legend className="mb-2 font-medium">{legend}</legend>
        {options.map((c) => (
          <label
            key={c.id}
            data-candidate={c.id}
            className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted has-checked:bg-muted"
          >
            <input
              type="radio"
              name={legend}
              value={c.id}
              checked={choice === c.id}
              onChange={() => setChoice(c.id)}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span className="flex min-w-0 flex-col">
              <span>
                {c.name}
                {c.disambiguation && <span className="text-muted-foreground"> ({c.disambiguation})</span>}{' '}
                <span className="text-muted-foreground">{percentile(c.popularity)}</span>
              </span>
              {(c.description || described) && (
                <span className="type-caption text-muted-foreground">{c.description || 'No description in Qloo'}</span>
              )}
              {twins.has(c) && (
                <span className="type-caption text-muted-foreground">
                  Qloo ID <span className="font-mono">{twins.get(c)}</span>
                </span>
              )}
            </span>
          </label>
        ))}
        {twins.size > 0 && (
          <p className="mt-1 type-caption text-muted-foreground">
            Qloo gives nothing else to tell {twins.size === options.length ? 'these' : 'some of these'} apart, so they
            show their Qloo IDs.
          </p>
        )}
      </fieldset>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button type="submit" disabled={busy || !choice || choice === current}>
          {busy && <Spinner data-icon="inline-start" />}
          {submit}
        </Button>
        <small className="type-caption text-muted-foreground">{note} with each one’s popularity percentile</small>
      </div>
    </form>
  )
}

// The rows of one list that read the same, by `shown`, so each shows its Qloo ID (#128): each such
// row's ID as it shows it. An entity's is cut to the shortest start, from 8
// characters, that tells every twin apart; a tag's URN is whole, as its start tells none apart.
export function twinIds<T extends { id: string }>(rows: T[], shown: (row: T) => string[]) {
  const said = (row: T) => shown(row).join('\n')
  const twins = rows.filter((r) => rows.some((o) => o !== r && said(o) === said(r)))
  let size = 8
  while (size < 36 && new Set(twins.map((r) => r.id.slice(0, size))).size < twins.length) size += 4
  return new Map(twins.map((r) => [r, r.id.startsWith('urn:') ? r.id : r.id.slice(0, size)]))
}

// A record as key/value pairs: each key in grey beside its value, on one grid so the values share a
// left edge, a word too long for a value's line, such as a network's name with no spaces, breaking.
// `KeyValue`s go straight inside. `className` places it, such as on a parent's subgrid, so two records
// share their values' edge.
export const KeyValues = ({ className, children }: { className?: string; children: ReactNode }) => (
  <dl className={cn('grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5', className)}>{children}</dl>
)
export const KeyValue = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="col-span-full grid grid-cols-subgrid">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="min-w-0 break-words">{children}</dd>
  </div>
)

// A name as a file spells it, such as a CSV column or a file type: a code, a touch smaller than the
// text around it, as mono runs large, but never under 12px.
export const Code = ({ children }: { children: string }) => (
  <code className="rounded-sm bg-muted px-1 font-mono text-[length:max(0.75rem,0.92em)] text-foreground">
    {children}
  </code>
)

// A wide table on a narrow screen scrolls sideways inside this, never the page. `className` places it,
// such as a table whose rules bleed past the text.
export const ScrollTable = ({
  label,
  className,
  children
}: {
  label: string
  className?: string
  children: ReactNode
}) => (
  <div
    className={cn('max-w-full overflow-x-auto overscroll-x-contain', className)}
    role="region"
    aria-label={label}
    tabIndex={0}
  >
    {children}
  </div>
)

// Copies `value` to the clipboard: `copied` says whether the browser let it, and is null until it's tried.
export function useCopy(value: string) {
  const [copied, setCopied] = useState<boolean | null>(null)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return { copied, copy }
}

// Something shown once, such as a new invite link or API key, in a read-only field that selects
// itself, with a button that copies it, and `children` saying what to do with it. Key it by what it
// shows, so a new one starts uncopied.
export function ShownOnce({
  id,
  label,
  noun,
  value,
  mono = false,
  children
}: {
  id: string
  label: string
  noun: string
  value: string
  mono?: boolean
  children: ReactNode
}) {
  const { copied, copy } = useCopy(value)
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <div className="flex gap-2">
        <Input
          id={id}
          className={cn('min-w-0 flex-1', mono && 'font-mono')}
          value={value}
          readOnly
          onFocus={(e) => e.target.select()}
          spellCheck={false}
        />
        <Button variant="secondary" onClick={() => void copy()}>
          {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
          {copied ? 'Copied' : `Copy ${noun}`}
        </Button>
      </div>
      {/* The button's "Copied", told to screen readers too. */}
      <span role="status" className="vh">
        {copied ? 'Copied' : ''}
      </span>
      {copied === false && (
        <StateLine kind="error" role="alert">
          This browser didn’t let Crossfeed copy it. Select the {noun} and copy it yourself.
        </StateLine>
      )}
      <p className="type-caption text-muted-foreground">{children}</p>
    </div>
  )
}

// A rail module opened from a table row can sit far from it, as in a single column: it's brought into
// view once, and `focus`, if given, then takes focus without scrolling again. A block body, because
// newer browsers' scrollIntoView returns a promise, which React would call as a cleanup.
export function useIntoView<T extends HTMLElement>(focus?: RefObject<HTMLElement | null>) {
  const ref = useRef<T>(null)
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest' })
    focus?.current?.focus({ preventScroll: true })
  }, [])
  return ref
}

// While a file is dragged over the page, the window is ruled in ink, as keyboard focus is, with a line
// along its foot saying what a drop does, wherever the page is scrolled; while the form is still
// busy, the line alone says to wait. It's portalled to the body, so no container of the page's
// holds its fixed box.
export function DropCue({ busy, children }: { busy: boolean; children: ReactNode }) {
  return createPortal(
    <div
      className="pointer-events-none fixed inset-0 z-50 ring-2 ring-ring ring-inset data-busy:ring-0"
      data-busy={busy || undefined}
      role="status"
    >
      <p className="absolute inset-x-0 bottom-0 bg-primary px-4 py-3 font-medium text-primary-foreground">{children}</p>
    </div>,
    document.body
  )
}

// Whether files are being dragged over the page, which takes a drop anywhere on it and hands the
// files to `drop`, so the browser never opens one in place of the page. Drags of anything else, such
// as selected text, pass through. Mount it once per page.
export function useFileDrop(drop: (files: File[]) => unknown) {
  const [dragging, setDragging] = useState(false)
  const latest = useRef(drop)
  latest.current = drop
  useEffect(() => {
    // Entering a child of the page fires before leaving its parent, so count to know when the drag left.
    let depth = 0
    const files = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false
    const enter = (e: DragEvent) => {
      if (!files(e)) return
      depth++
      setDragging(true)
    }
    const leave = (e: DragEvent) => {
      if (files(e) && --depth <= 0) {
        depth = 0
        setDragging(false)
      }
    }
    const over = (e: DragEvent) => {
      if (files(e)) e.preventDefault()
    }
    const dropped = (e: DragEvent) => {
      if (!files(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      void latest.current([...e.dataTransfer!.files])
    }
    const listeners = { dragenter: enter, dragleave: leave, dragover: over, drop: dropped }
    for (const [type, listener] of Object.entries(listeners)) window.addEventListener(type, listener as EventListener)
    return () => {
      for (const [type, listener] of Object.entries(listeners))
        window.removeEventListener(type, listener as EventListener)
    }
  }, [])
  return dragging
}
