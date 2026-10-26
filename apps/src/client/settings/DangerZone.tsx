import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Alert, send, useAction } from '../controls'
import type { NetworkPage } from '../NetworkPage'
import { Module } from './Module'

// The settings' danger zone: an owner deletes the network, for every member, once they've typed its
// name, so it can't happen by a slip; typing it is the confirmation, so there's no dialog. Its pages,
// agents, and API answer 404 from then on, and its storage is wiped. A member sees only whose it is to do.
export function DangerZoneModule({ network }: { network: NetworkPage }) {
  return (
    <Module
      id="set-danger-h"
      title="Danger zone"
      help={`Deleting ${network.name} wipes its roster, CPM, inbox, and launches, with every run, insertion order, and Qloo record behind them, and its invite links and API keys, for every member. It can’t be brought back.`}
    >
      {network.role === 'owner' ? (
        <DeleteNetwork network={network} />
      ) : (
        <p className="text-muted-foreground">Only an owner can delete the network.</p>
      )}
    </Module>
  )
}

function DeleteNetwork({ network }: { network: NetworkPage }) {
  const [typed, setTyped] = useState('')
  const { busy, error, run } = useAction()
  const remove = () =>
    run(async () => {
      await send(`/app/${network.id}/settings/delete`, { name: typed })
      window.location.assign('/app')
    })
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void remove()
      }}
    >
      <Field>
        <FieldLabel htmlFor="delete-name" className="inline-block">
          Type <b className="font-semibold">{network.name}</b> to delete it
        </FieldLabel>
        <Input
          id="delete-name"
          className="max-w-sm max-md:h-11"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      <div>
        <Button
          type="submit"
          variant="destructive"
          className="max-md:h-11"
          disabled={busy || typed.trim() !== network.name}
        >
          {busy && <Spinner data-icon="inline-start" />}
          {busy ? 'Deleting…' : 'Delete network'}
        </Button>
      </div>
      <Alert error={error} />
    </form>
  )
}
