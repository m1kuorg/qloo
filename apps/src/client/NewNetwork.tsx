import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { MAX_NAME } from '../text'
import { Alert, send, SignOut, useAction } from './controls'

// Naming a new network, which its creator then owns. `cap` is how many networks one member can create.
// From 1024px, two columns on one centred measure: what a network is, at display size, beside the
// field that names it, on the card. A guest (`guest`), who can't create one, is offered signing out to
// create an account instead (ADR 0006).
export function NewNetworkPage({ cap, guest = false }: { cap: number; guest?: boolean }) {
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
      {guest ? (
        <section className="flex flex-col gap-4 rounded-xl bg-card p-4 sm:p-6" aria-label="Signed in as a guest">
          <p>A guest can’t create a network. Sign out and create an account to create one of your own.</p>
          <SignOut className="self-start">Sign out and create an account</SignOut>
        </section>
      ) : (
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
          <Button type="submit" disabled={busy || !name.trim()} className="self-start">
            {busy && <Spinner data-icon="inline-start" />}
            {busy ? 'Creating…' : 'Create network'}
          </Button>
          <Alert error={error} />
        </form>
      )}
    </main>
  )
}
