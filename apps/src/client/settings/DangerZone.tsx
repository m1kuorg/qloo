import { useState } from 'react'
import { Alert, send, useAction } from '../controls'
import type { NetworkPage } from '../NetworkPage'

// The settings' danger zone: an owner deletes the network, for every member, once they've typed its
// name, so it can't happen by a slip. Its pages, agents, and API answer 404 from then on, and its
// storage is wiped. A member sees only whose it is to do.
export function DangerZoneModule({ network }: { network: NetworkPage }) {
  return (
    <section className="mod set-mod" aria-labelledby="set-danger-h">
      <div className="set-about">
        <h2 className="lbl" id="set-danger-h">
          Danger zone
        </h2>
        <p className="help">
          Deleting {network.name} wipes its roster, CPM, inbox, and launches, with every run, insertion order, and Qloo
          record behind them, and its invite links and API keys, for every member. It can’t be brought back.
        </p>
      </div>
      {network.role === 'owner' ? (
        <DeleteNetwork network={network} />
      ) : (
        <div className="set-body">
          <p className="help">Only an owner can delete the network.</p>
        </div>
      )}
    </section>
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
      className="set-body set-form"
      onSubmit={(e) => {
        e.preventDefault()
        void remove()
      }}
    >
      <label htmlFor="delete-name">
        Type <b>{network.name}</b> to delete it
      </label>
      <input
        id="delete-name"
        className="acct-in"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      <div className="acts">
        <button className="btn pri" type="submit" disabled={busy || typed.trim() !== network.name}>
          {busy ? 'Deleting…' : 'Delete network'}
        </button>
      </div>
      <Alert error={error} />
    </form>
  )
}
