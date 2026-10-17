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

export const listOf = (names: string[]) =>
  names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`

export const percentile = (p: number | null) => (p === null ? '–' : (p * 100).toFixed(1))

// A radio list of Qloo entities with their popularity, and their year when they're works, and a
// button that commits the pick.
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
  options: (Candidate & { disambiguation?: string | null })[]
  current: string | undefined
  note: string
  submit: string
  busy: boolean
  pick: (id: string) => Promise<unknown>
}) {
  const [choice, setChoice] = useState(current ?? '')
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
              </span>
            </label>
          ))}
        </div>
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
