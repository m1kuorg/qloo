import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupSegment } from '@/components/ui/radio-group'
import { segmentedItemVariants, segmentedTrackVariants } from '@/components/ui/variants'
import type { LaunchInput } from '../agent'
import { MAX_COMPS } from '../limits'
import { MAX_TITLE } from '../text'

// What a launch goes by: its name, or for an unreleased one, its comps. The dashboard lists it so too.
export const launchTitle = (name: string | null, comps: string[]) => name ?? comps.join(' · ')

// A form's launch: released, by its name, or unreleased, by up to three comps, starting from
// `prefill`. The workspace starts a run from it, and the dashboard plans a new launch. Which kind
// the launch is, is a segmented control of two radios; the text boxes set no `type`.
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
        <RadioGroup
          aria-label="The launch is"
          value={unreleased ? 'unreleased' : 'released'}
          onValueChange={(kind) => setUnreleased(kind === 'unreleased')}
          disabled={disabled}
          className={segmentedTrackVariants({ className: 'flex shrink-0 max-md:h-11' })}
        >
          {['released', 'unreleased'].map((kind) => (
            <RadioGroupSegment key={kind} value={kind} className={segmentedItemVariants({ className: 'max-md:h-10' })}>
              {kind === 'unreleased' ? 'Unreleased, from comps' : 'Released'}
            </RadioGroupSegment>
          ))}
        </RadioGroup>
        {unreleased ? (
          comps.map((comp, i) => (
            <Input
              key={i}
              aria-label={`Comp ${i + 1}`}
              value={comp}
              onChange={(e) => setComps(comps.map((c, j) => (j === i ? e.target.value : c)))}
              placeholder={['Blank Check', 'Filmspotting', 'You Must Remember This'][i]}
              maxLength={MAX_TITLE}
              disabled={disabled}
              className="sm:w-48 max-md:h-11"
            />
          ))
        ) : (
          <Input
            aria-label="Released launch"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="The Big Picture"
            maxLength={MAX_TITLE}
            disabled={disabled}
            className="sm:w-72 max-md:h-11"
          />
        )}
      </>
    )
  }
}
