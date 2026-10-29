import { useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupSegment } from '@/components/ui/radio-group'
import { segmentedItemVariants, segmentedTrackVariants } from '@/components/ui/variants'
import type { LaunchInput } from '../agent'
import { MAX_COMPS } from '../limits'
import { MAX_TITLE } from '../text'
import { Alert, useAction } from './controls'
import type { NetworkPage } from './NetworkPage'
import { FormDialog, type useFormDialog } from './PageHeader'

// What a launch goes by: its name, or for an unreleased one, its comps. The Launches page and the
// dashboard list it so too.
export const launchTitle = (name: string | null, comps: string[]) => name ?? comps.join(' · ')

// A form's launch: released, by its name, or unreleased, by up to three comps, starting from
// `prefill`. The workspace starts a run from it, in a row, and New launch plans a new launch, in its
// dialog, `stacked`. Which kind the launch is, is a segmented control of two radios; the text
// boxes set no `type`.
export function useLaunchFields(prefill: { name: string | null; comps: string[] } | null) {
  const [name, setName] = useState(prefill?.name ?? '')
  const [unreleased, setUnreleased] = useState(!prefill?.name && (prefill?.comps.length ?? 0) > 0)
  const [comps, setComps] = useState(() => Array.from({ length: MAX_COMPS }, (_, i) => prefill?.comps[i] ?? ''))
  const named = comps.filter((c) => c.trim())
  return {
    input: (unreleased ? { comps: named } : { name }) satisfies LaunchInput,
    ready: unreleased ? named.length > 0 : name.trim() !== '',
    clear: () => (unreleased ? setComps(Array(MAX_COMPS).fill('')) : setName('')),
    fields: (disabled: boolean, stacked = false) => (
      <>
        <RadioGroup
          aria-label="The launch is"
          value={unreleased ? 'unreleased' : 'released'}
          onValueChange={(kind) => setUnreleased(kind === 'unreleased')}
          disabled={disabled}
          className={segmentedTrackVariants({ className: 'flex shrink-0' })}
        >
          {['released', 'unreleased'].map((kind) => (
            <RadioGroupSegment key={kind} value={kind} className={segmentedItemVariants()}>
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
              className={stacked ? undefined : 'sm:w-48'}
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
            className={stacked ? undefined : 'sm:w-72'}
          />
        )}
      </>
    )
  }
}

// New launch, the Launches page's decision, which the dashboard opens too: a new launch, named or from
// comps, in the page's form dialog; created, it opens on its own page. A refusal, such as the network's
// 100-launch limit, stays in the dialog.
export function NewLaunch({
  network,
  create,
  dialog
}: {
  network: NetworkPage
  create: (input: LaunchInput) => Promise<{ id: string }>
  dialog: ReturnType<typeof useFormDialog>
}) {
  const form = useLaunchFields(null)
  const { busy, error, run } = useAction()
  const fields = useRef<HTMLFormElement>(null)
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    void run(async () => location.assign(`${network.links.launches}/${(await create(form.input)).id}`))
  }
  return (
    <FormDialog
      dialog={dialog}
      description="Name a released launch, or up to three comps for an unreleased one."
      form="new-launch"
      submit={busy ? 'Creating…' : 'Create launch'}
      busy={busy}
      disabled={!form.ready}
      // It opens on the launch's name, past the kind already chosen.
      initialFocus={() => fields.current?.querySelector<HTMLElement>('[data-slot=input]') ?? true}
    >
      <form id="new-launch" ref={fields} className="flex flex-col gap-3" onSubmit={submit}>
        {form.fields(busy, true)}
        <Alert error={error} />
      </form>
    </FormDialog>
  )
}
