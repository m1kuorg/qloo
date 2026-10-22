import { useState } from 'react'
import { MAX_NAME } from '../text'
import { Alert, send, useAction } from './controls'

// Naming a new network, which its creator then owns. `cap` is how many networks one member can create.
export function NewNetworkPage({ cap }: { cap: number }) {
  const { busy, error, run } = useAction()
  const [name, setName] = useState('')
  const create = () =>
    run(async () => {
      const { id } = await send<{ id: string }>('/app/new', { name })
      window.location.assign(`/app/${id}`)
    })
  return (
    <main className="acct">
      <header className="acct-hd">
        <h1>Create a network</h1>
        <p className="help">
          A network holds your roster, its launches, and your booking inbox, for you and the teammates you invite. You
          own the networks you create, up to {cap}.
        </p>
      </header>
      <form
        className="way"
        onSubmit={(e) => {
          e.preventDefault()
          void create()
        }}
      >
        <label htmlFor="network-name">Network name, as its members will see it</label>
        <input
          id="network-name"
          className="acct-in"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="organization"
          maxLength={MAX_NAME}
          autoFocus
          required
        />
        <div className="acts">
          <button className="btn pri" type="submit" disabled={busy || !name.trim()}>
            {busy ? 'Creating…' : 'Create network'}
          </button>
        </div>
        <Alert error={error} />
      </form>
    </main>
  )
}
