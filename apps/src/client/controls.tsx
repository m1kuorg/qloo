import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
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
  if (!res.ok || !answer) throw new Error(answer?.error ?? `Crossfeed answered ${res.status}. Try again.`)
  return answer as T
}

// Runs one action at a time for a form, keeping its error for the form to show.
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
  return { busy, error, run }
}

export const Alert = ({ error }: { error: string | null }) =>
  error && (
    <StateLine kind="error" role="alert">
      {error}
    </StateLine>
  )

export { bandMeter } from '../fit'
export { listOf } from '../text'

export const percentile = (p: number | null) => (p === null ? '–' : (p * 100).toFixed(1))

// A radio list of Qloo entities with their popularity, and for works their year and a line on what
// each is, and a button that commits the pick. Options that Qloo gives nothing else to tell apart
// show their Qloo IDs, and the list says so (#128).
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
  note: string
  submit: string
  busy: boolean
  pick: (id: string) => Promise<unknown>
}) {
  const [choice, setChoice] = useState(current ?? '')
  // A missing description (on candidates synced before there were any) reads like none.
  const described = options.some((c) => c.description)
  const shown = (c: (typeof options)[number]) =>
    [c.name, c.disambiguation || '', percentile(c.popularity), c.description || ''].join('\n')
  const twins = options.filter((c) => options.some((o) => o !== c && shown(o) === shown(c)))
  // The shortest ID prefix, from 8 characters, that tells every twin apart.
  let size = 8
  while (size < 36 && new Set(twins.map((c) => c.id.slice(0, size))).size < twins.length) size += 4
  return (
    <form
      className="pick"
      onSubmit={(e) => {
        e.preventDefault()
        void pick(choice)
      }}
    >
      <fieldset>
        <legend className="lbl">{legend}</legend>
        <div className="opts">
          {options.map((c) => (
            <label key={c.id}>
              <input
                type="radio"
                name={legend}
                value={c.id}
                checked={choice === c.id}
                onChange={() => setChoice(c.id)}
              />
              <span>
                {c.name}
                {c.disambiguation && <span className="tg"> ({c.disambiguation})</span>}{' '}
                <span className="pop">{percentile(c.popularity)}</span>
                {(c.description || described) && (
                  <span className="tg opt-desc">{c.description || 'No description in Qloo'}</span>
                )}
                {twins.includes(c) && <span className="tg opt-desc">Qloo ID {c.id.slice(0, size)}</span>}
              </span>
            </label>
          ))}
        </div>
        {twins.length > 0 && (
          <p className="help">
            Qloo gives nothing else to tell {twins.length === options.length ? 'these' : 'some of these'} apart, so they
            show their Qloo IDs.
          </p>
        )}
      </fieldset>
      <div className="acts">
        <button className="btn pri" type="submit" disabled={busy || !choice || choice === current}>
          {submit}
        </button>
        <small>{note}</small>
      </div>
    </form>
  )
}

// A wide table on a narrow screen scrolls sideways inside this, never the page.
export const ScrollTable = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="scroll-x" role="region" aria-label={label} tabIndex={0}>
    {children}
  </div>
)

// Something shown once, such as a new invite link or API key, on Panel Grey in a read-only field that
// selects itself, with a button that copies it, and `children` saying what to do with it. Key it by
// what it shows, so a new one starts uncopied.
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
  const [copied, setCopied] = useState<boolean | null>(null)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="new-link">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className={mono ? 'acct-in key-in' : 'acct-in'}
        value={value}
        readOnly
        onFocus={(e) => e.target.select()}
        spellCheck={false}
      />
      <div className="acts">
        <button className="btn" type="button" onClick={() => void copy()}>
          {copied ? 'Copied' : `Copy ${noun}`}
        </button>
      </div>
      {copied === false && (
        <StateLine kind="error" role="alert">
          This browser didn’t let Crossfeed copy it. Select the {noun} and copy it yourself.
        </StateLine>
      )}
      <p className="help">{children}</p>
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
