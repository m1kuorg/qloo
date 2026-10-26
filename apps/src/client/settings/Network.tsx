import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'
import { cpmProblem, dollars } from '../../order'
import { MAX_NAME } from '../../text'
import { Alert, KeyValue, KeyValues, send, useAction } from '../controls'
import type { NetworkPage } from '../NetworkPage'
import { Done, Module } from './Module'

// The settings' network module: the network's name and its CPM. An owner changes them here; a member
// reads them. `cpm` is the agent's, live, and undefined until it's connected.
export function NetworkModule({ network, cpm }: { network: NetworkPage; cpm: number | null | undefined }) {
  return (
    <Module
      id="set-network-h"
      title="Network"
      help="The name your members see, and the CPM that prices every promo slot: downloads per episode × CPM ÷ 1,000."
    >
      {network.role === 'owner' ? (
        <NetworkForm network={network} cpm={cpm} />
      ) : (
        <>
          <KeyValues>
            <KeyValue label="Name">{network.name}</KeyValue>
            <KeyValue label="CPM">
              {cpm === undefined ? 'Connecting…' : cpm === null ? 'Not set' : dollars(cpm)}
            </KeyValue>
          </KeyValues>
          <p className="text-muted-foreground">Only an owner can change these.</p>
        </>
      )}
    </Module>
  )
}

function NetworkForm({ network, cpm }: { network: NetworkPage; cpm: number | null | undefined }) {
  const [name, setName] = useState(network.name)
  const [saved, setSaved] = useState({ name: network.name, cpm: cpm ?? null })
  const [typedCpm, setTypedCpm] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const { busy, error, run } = useAction()
  // The CPM field follows the agent's until the owner types in it.
  const shownCpm = typedCpm ?? (cpm == null ? '' : String(cpm))
  useEffect(() => setSaved((s) => ({ ...s, cpm: cpm ?? null })), [cpm])
  const changed = name.trim() !== saved.name || (shownCpm.trim() !== '' && Number(shownCpm) !== saved.cpm)
  const save = () =>
    run(async () => {
      // An empty field leaves the CPM as it is; anything else must be a dollar amount.
      const typed = shownCpm.trim() === '' ? null : Number(shownCpm)
      const problem = typed === null ? null : cpmProblem(typed)
      if (problem) throw new Error(problem)
      const answer = await send<{ name: string; cpm: number | null }>(`/app/${network.id}/settings/network`, {
        name,
        cpm: typed
      })
      setSaved({ name: answer.name, cpm: answer.cpm ?? saved.cpm })
      setName(answer.name)
      setTypedCpm(null)
      setDone(true)
      // The top bar is the server's: its switcher shows the new name without a reload.
      document.querySelectorAll('[data-current-network]').forEach((el) => (el.textContent = answer.name))
    })
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        setDone(false)
        void save()
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="set-name">Name</FieldLabel>
          <Input
            id="set-name"
            className="max-w-sm max-md:h-11"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setDone(false)
            }}
            maxLength={MAX_NAME}
            required
          />
        </Field>
        <Field data-disabled={cpm === undefined || undefined}>
          <FieldLabel htmlFor="set-cpm">CPM</FieldLabel>
          <InputGroup className="max-w-40 max-md:h-11">
            <InputGroupAddon>$</InputGroupAddon>
            <InputGroupInput
              id="set-cpm"
              inputMode="decimal"
              value={shownCpm}
              disabled={cpm === undefined}
              onChange={(e) => {
                setTypedCpm(e.target.value)
                setDone(false)
              }}
              placeholder={cpm === undefined ? 'Connecting…' : 'Not set'}
            />
          </InputGroup>
          <FieldDescription>Dollars per 1,000 downloads.</FieldDescription>
        </Field>
      </FieldGroup>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy || !name.trim() || !changed} className="max-md:h-11">
          {busy && <Spinner data-icon="inline-start" />}
          {busy ? 'Saving…' : 'Save'}
        </Button>
        <Done shown={done && !changed}>Saved.</Done>
      </div>
      <Alert error={error} />
    </form>
  )
}
