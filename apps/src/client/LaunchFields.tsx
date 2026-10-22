import { useState } from 'react'
import type { LaunchInput } from '../agent'
import { MAX_COMPS } from '../limits'
import { MAX_TITLE } from '../text'

// What a launch goes by: its name, or for an unreleased one, its comps. The dashboard lists it so too.
export const launchTitle = (name: string | null, comps: string[]) => name ?? comps.join(' · ')

// A form's launch: released, by its name, or unreleased, by up to three comps, starting from
// `prefill`. The launch header starts a run from it, and the dashboard plans a new launch.
export function useLaunchFields(prefill: { name: string | null; comps: string[] } | null) {
  const [name, setName] = useState(prefill?.name ?? '')
  const [unreleased, setUnreleased] = useState(!prefill?.name && (prefill?.comps.length ?? 0) > 0)
  const [comps, setComps] = useState(() => Array.from({ length: MAX_COMPS }, (_, i) => prefill?.comps[i] ?? ''))
  const named = comps.filter((c) => c.trim())
  return {
    input: (unreleased ? { comps: named } : { name }) satisfies LaunchInput,
    ready: unreleased ? named.length > 0 : name.trim() !== '',
    // Whether the form holds this released launch's name, as typed.
    named: (launch: string) => !unreleased && name === launch,
    clear: () => (unreleased ? setComps(Array(MAX_COMPS).fill('')) : setName('')),
    fields: (disabled: boolean) => (
      <>
        <span className="launch-kind" role="radiogroup" aria-label="The launch is">
          {[false, true].map((kind) => (
            <label key={String(kind)}>
              <input
                type="radio"
                name="launch-kind"
                checked={unreleased === kind}
                onChange={() => setUnreleased(kind)}
                disabled={disabled}
              />
              <span>{kind ? 'Unreleased, from comps' : 'Released'}</span>
            </label>
          ))}
        </span>
        {unreleased ? (
          comps.map((comp, i) => (
            <input
              key={i}
              className="comp-name"
              aria-label={`Comp ${i + 1}`}
              value={comp}
              onChange={(e) => setComps(comps.map((c, j) => (j === i ? e.target.value : c)))}
              placeholder={['Blank Check', 'Filmspotting', 'You Must Remember This'][i]}
              maxLength={MAX_TITLE}
              disabled={disabled}
            />
          ))
        ) : (
          <input
            aria-label="Released launch"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="The Big Picture"
            maxLength={MAX_TITLE}
            disabled={disabled}
          />
        )}
      </>
    )
  }
}
