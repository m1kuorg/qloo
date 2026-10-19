import { useEffect, useState } from 'react'
import { cpmProblem, dollars } from '../../order'
import { MAX_NAME } from '../../text'
import { Alert, send, useAction } from '../controls'
import type { NetworkPage } from '../Dashboard'
import { StateLine } from '../states'

// The settings' network module: the network's name and its CPM. An owner changes them here; a member
// reads them. `cpm` is the agent's, live, and undefined until it's connected.
export function NetworkModule({ network, cpm }: { network: NetworkPage; cpm: number | null | undefined }) {
  return (
    <section className="mod set-mod" aria-labelledby="set-network-h">
      <div className="set-about">
        <h2 className="lbl" id="set-network-h">
          Network
        </h2>
        <p className="help">
          The name your members see, and the CPM that prices every promo slot: downloads per episode × CPM ÷ 1,000.
        </p>
      </div>
      {network.role === 'owner' ? (
        <NetworkForm network={network} cpm={cpm} />
      ) : (
        <NetworkRead network={network} cpm={cpm} />
      )}
    </section>
  )
}

function NetworkRead({ network, cpm }: { network: NetworkPage; cpm: number | null | undefined }) {
  return (
    <div className="set-body">
      <dl className="rec kv">
        <div className="rec-row">
          <dt>Name</dt>
          <dd>{network.name}</dd>
        </div>
        <div className="rec-row">
          <dt>CPM</dt>
          <dd>{cpm === undefined ? 'Connecting…' : cpm === null ? 'Not set' : dollars(cpm)}</dd>
        </div>
      </dl>
      <p className="help">Only an owner can change these.</p>
    </div>
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
      className="set-body set-form"
      onSubmit={(e) => {
        e.preventDefault()
        setDone(false)
        void save()
      }}
    >
      <label htmlFor="set-name">Name</label>
      <input
        id="set-name"
        className="acct-in"
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          setDone(false)
        }}
        maxLength={MAX_NAME}
        required
      />
      <label htmlFor="set-cpm">CPM</label>
      <span className="in set-cpm">
        <span className="pre">$</span>
        <input
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
      </span>
      <div className="acts">
        <button className="btn pri" type="submit" disabled={busy || !name.trim() || !changed}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {done && !changed && <StateLine kind="empty">Saved.</StateLine>}
      </div>
      <Alert error={error} />
    </form>
  )
}
