import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { MAX_NAME } from '../text'
import { Alert, send, useAction } from './controls'

// Naming a new network, which its creator then owns. `cap` is how many networks one member can create.
// From 1024px, two columns on one centred measure: what a network is, at display size, beside the
// field that names it, on the card.
export function NewNetworkPage({ cap }: { cap: number }) {
  const { busy, error, run } = useAction()
  const [name, setName] = useState('')
  const create = () =>
    run(async () => {
      const { id } = await send<{ id: string }>('/app/new', { name })
      window.location.assign(`/app/${id}`)
    })
  return (
    <main className="mx-auto grid w-full max-w-[1152px] items-start gap-8 px-4 pt-10 pb-16 lg:grid-cols-2 lg:gap-12 lg:px-6 lg:pt-20">
      <div className="flex flex-col gap-4">
        <h1 className="type-display text-balance">Create a network</h1>
        <p className="max-w-[48ch] type-body text-muted-foreground">
          A network holds your roster, its launches, and your booking inbox, for you and the teammates you invite. You
          own the networks you create, up to {cap}.
        </p>
      </div>
      <form
        className="flex flex-col gap-4 rounded-xl bg-card p-4 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault()
          void create()
        }}
      >
        <Field>
          <FieldLabel htmlFor="network-name">Network name, as its members will see it</FieldLabel>
          <Input
            id="network-name"
            className="h-10"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="organization"
            maxLength={MAX_NAME}
            autoFocus
            required
          />
        </Field>
        <Button type="submit" disabled={busy || !name.trim()} className="self-start max-md:h-11">
          {busy && <Spinner data-icon="inline-start" />}
          {busy ? 'Creating…' : 'Create network'}
        </Button>
        <Alert error={error} />
      </form>
    </main>
  )
}
