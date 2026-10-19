import { useState } from 'react'
import type { OwnKey, Usage } from '../../gateway'
import { QLOO_HOSTS } from '../../qloo-hosts'
import { Alert, send, useAction } from '../controls'
import type { NetworkPage } from '../Dashboard'
import { StateLine } from '../states'

const hostName = (host: string | undefined) => (host ? new URL(host).host : '')

// What saving or removing the key answers: the key as the settings show it, and today's usage, now
// read where the network's Qloo calls count.
type KeyChange = { key: OwnKey; usage: Usage }

// The settings' Qloo key module: the network's own Qloo key (ADR 0004). An owner picks the host it's
// for and pastes it; the gateway tests it with one search before it keeps it, and from then on it shows
// only its last four characters, with a way to remove it, back to Crossfeed's shared key. A member sees
// whether the network has one, not which.
export function QlooKeyModule({
  network,
  qlooKey,
  onChange
}: {
  network: NetworkPage
  qlooKey: OwnKey
  onChange: (change: KeyChange) => void
}) {
  // Whether the key on show was saved on this page, to say it was tested.
  const [saved, setSaved] = useState(false)
  return (
    <section className="mod set-mod" aria-labelledby="set-qloo-h">
      <div className="set-about">
        <h2 className="lbl" id="set-qloo-h">
          Qloo key
        </h2>
        <p className="help">
          During the beta, a network’s Qloo calls run on Crossfeed’s shared key, within its daily caps. With a key of
          its own, {network.name}’s calls and its launches’ run on that key, under its own agreement with Qloo, with a
          cache and Qloo caps of their own. Model runs count against Crossfeed’s caps either way.
        </p>
      </div>
      {network.role !== 'owner' ? (
        <div className="set-body">
          <dl className="rec kv">
            <div className="rec-row">
              <dt>Qloo key</dt>
              <dd>{qlooKey.set ? 'The network’s own' : 'Crossfeed’s shared key'}</dd>
            </div>
          </dl>
          <p className="help">Only an owner can add or remove the network’s Qloo key.</p>
        </div>
      ) : qlooKey.set ? (
        <OwnKeyRecord
          network={network}
          qlooKey={qlooKey}
          saved={saved}
          onChange={(change) => {
            setSaved(false)
            onChange(change)
          }}
        />
      ) : (
        <AddKey
          network={network}
          onChange={(change) => {
            setSaved(true)
            onChange(change)
          }}
        />
      )}
    </section>
  )
}

function AddKey({ network, onChange }: { network: NetworkPage; onChange: (change: KeyChange) => void }) {
  const [host, setHost] = useState<string | null>(null)
  const [key, setKey] = useState('')
  const { busy, error, run } = useAction()
  const save = () =>
    run(async () => {
      onChange(await send<KeyChange>(`/app/${network.id}/settings/qloo-key`, { host, key }))
    })
  return (
    <form
      className="set-body set-form qloo-key"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <fieldset disabled={busy}>
        <legend>Host</legend>
        <div className="opts">
          {QLOO_HOSTS.map((h) => (
            <label key={h.url}>
              <input type="radio" name="qloo-host" checked={host === h.url} onChange={() => setHost(h.url)} />
              <span>
                {h.name}
                <span className="tg opt-desc">
                  {hostName(h.url)}
                  {h.note}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label htmlFor="qloo-key">Key</label>
      <input
        type="password"
        id="qloo-key"
        className="acct-in"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        disabled={busy}
      />
      <div className="acts">
        <button className="btn pri" type="submit" disabled={busy || !host || !key.trim()}>
          {busy ? 'Testing…' : 'Test and save key'}
        </button>
      </div>
      <Alert error={error} />
      <p className="help">
        Crossfeed tries one search with it first and saves it only once Qloo answers, encrypted. From then on it shows
        only its last four characters.
      </p>
    </form>
  )
}

function OwnKeyRecord({
  network,
  qlooKey,
  saved,
  onChange
}: {
  network: NetworkPage
  qlooKey: OwnKey
  saved: boolean
  onChange: (change: KeyChange) => void
}) {
  // Whether removing it waits on a yes.
  const [asking, setAsking] = useState(false)
  const { busy, error, run } = useAction()
  const remove = () =>
    run(async () => {
      onChange(await send<KeyChange>(`/app/${network.id}/settings/qloo-key/remove`))
    })
  return (
    <div className="set-body qloo-key">
      <dl className="rec kv">
        <div className="rec-row">
          <dt>Key</dt>
          <dd>
            Ends in <code>{qlooKey.last4}</code>
          </dd>
        </div>
        <div className="rec-row">
          <dt>Host</dt>
          <dd>{hostName(qlooKey.host)}</dd>
        </div>
      </dl>
      {asking ? (
        <div className="set-ask">
          <p>
            Remove {network.name}’s own Qloo key? Its cache and today’s Qloo counts go with it, and its Qloo calls go
            back to Crossfeed’s shared key.
          </p>
          <div className="acts">
            <button className="btn pri" type="button" disabled={busy} onClick={() => void remove()}>
              {busy ? 'Removing…' : 'Remove key'}
            </button>
            <button className="lnk" type="button" onClick={() => setAsking(false)}>
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <div className="acts">
          <button className="btn" type="button" onClick={() => setAsking(true)}>
            Remove key
          </button>
          {saved && <StateLine kind="empty">Tested and saved.</StateLine>}
        </div>
      )}
      <Alert error={error} />
      <p className="help">
        The network’s and its launches’ Qloo calls go with this key to its host. To use another key, remove this one and
        add the new one.
      </p>
    </div>
  )
}
