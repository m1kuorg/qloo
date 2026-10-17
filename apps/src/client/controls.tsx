import { useState } from 'react'
import type { Band } from '../fit'
import type { Candidate } from '../resolve'
import { StateLine } from './states'

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

// Fit bands as the charts word them: a meter of three bars filled from the left, then the word.
export const bandMeter: Record<Band, { bars: number; word: string }> = {
  top: { bars: 3, word: 'Strong' },
  middle: { bars: 2, word: 'Good' },
  bottom: { bars: 1, word: 'Fair' }
}

export { listOf } from '../demographics'

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
