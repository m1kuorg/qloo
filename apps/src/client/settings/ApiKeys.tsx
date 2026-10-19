import { Fragment, useState } from 'react'
import type { ApiKey } from '../../directory'
import { MAX_NAME } from '../../text'
import { Alert, ScrollTable, send, useAction } from '../controls'
import { day, type NetworkPage } from '../Dashboard'
import { StateLine } from '../states'

// The settings' API keys module: the keys a script or an assistant acts for the network with, through
// the API, short of approving anything (ADR 0002). An owner creates one, sees its secret this once,
// and revokes it, which stops it at once; the list shows each by its prefix and dates. `keys` is null
// for a member, who sees only who makes them.
export function ApiKeysModule({ network, keys }: { network: NetworkPage; keys: ApiKey[] | null }) {
  return (
    <section className="mod set-mod" aria-labelledby="set-keys-h">
      <div className="set-about">
        <h2 className="lbl" id="set-keys-h">
          API keys
        </h2>
        <p className="help">
          Each key lets a script or an assistant act for {network.name} through Crossfeed’s API, short of approving
          anything: only a member approves an insertion order or a reply, in the app.
        </p>
      </div>
      {keys ? (
        <OwnerKeys network={network} keys={keys} />
      ) : (
        <div className="set-body">
          <p className="help">Only an owner can create and revoke API keys.</p>
        </div>
      )}
    </section>
  )
}

function OwnerKeys({ network, keys: listed }: { network: NetworkPage; keys: ApiKey[] }) {
  const [keys, setKeys] = useState(listed)
  const [name, setName] = useState('')
  const [made, setMade] = useState<{ id: string; secret: string } | null>(null)
  const [copied, setCopied] = useState<boolean | null>(null)
  // The key whose revocation waits on a yes.
  const [asking, setAsking] = useState<string | null>(null)
  const { busy, error, run } = useAction()
  const path = `/app/${network.id}/settings/api-keys`

  const create = () =>
    run(async () => {
      const answer = await send<{ id: string; secret: string; keys: ApiKey[] }>(path, { name })
      setMade({ id: answer.id, secret: answer.secret })
      setCopied(null)
      setKeys(answer.keys)
      setName('')
    })
  const revoke = (id: string) =>
    run(async () => {
      setKeys((await send<{ keys: ApiKey[] }>(`${path}/${id}/revoke`)).keys)
      setAsking(null)
      if (made?.id === id) setMade(null)
    })
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(made!.secret)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="set-body wide api-keys">
      <form
        className="set-form"
        onSubmit={(e) => {
          e.preventDefault()
          void create()
        }}
      >
        <label htmlFor="key-name">Key name</label>
        <input
          id="key-name"
          className="acct-in"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_NAME}
          placeholder="Such as Nightly roster sync"
          required
        />
        <div className="acts">
          <button className="btn pri" type="submit" disabled={busy || !name.trim()}>
            {busy ? 'Working…' : 'Create API key'}
          </button>
        </div>
      </form>
      {made && (
        <div className="new-link">
          <label htmlFor="key-secret">New API key</label>
          <input
            id="key-secret"
            className="acct-in key-in"
            value={made.secret}
            readOnly
            onFocus={(e) => e.target.select()}
            spellCheck={false}
          />
          <div className="acts">
            <button className="btn" type="button" onClick={() => void copy()}>
              {copied ? 'Copied' : 'Copy key'}
            </button>
          </div>
          {copied === false && (
            <StateLine kind="error" role="alert">
              This browser didn’t let Crossfeed copy it. Select the key and copy it yourself.
            </StateLine>
          )}
          <p className="help">
            Copy it now and keep it where your script keeps secrets: Crossfeed shows each key only once. Send it as{' '}
            <code>Authorization: Bearer</code> and the key.
          </p>
        </div>
      )}
      <Alert error={error} />
      {keys.length === 0 ? (
        <StateLine kind="empty">No API keys in use.</StateLine>
      ) : (
        <ScrollTable label="API keys">
          <table className="chart keys">
            <thead>
              <tr>
                <th scope="col">Key</th>
                <th scope="col">Created</th>
                <th scope="col">Last used</th>
                <th scope="col">
                  <span className="vh">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <Fragment key={k.id}>
                  <tr className={asking === k.id ? 'on' : undefined}>
                    <td className="nm">
                      {k.name}
                      {made?.id === k.id && <span className="chip">New</span>}
                      <code className="tg">{k.prefix}…</code>
                    </td>
                    <td>
                      {day(k.created)}
                      {k.by && <span className="tg">by {k.by}</span>}
                    </td>
                    <td>{k.lastUsed === null ? 'Never' : day(k.lastUsed)}</td>
                    <td className="r">
                      <button
                        className="lnk"
                        type="button"
                        disabled={busy}
                        aria-expanded={asking === k.id}
                        onClick={() => setAsking(asking === k.id ? null : k.id)}
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                  {asking === k.id && (
                    <tr className="on ask">
                      <td colSpan={4}>
                        <p>Revoke {k.name}? Every script or assistant using it is refused from its next request.</p>
                        <div className="acts">
                          <button className="btn pri" type="button" disabled={busy} onClick={() => void revoke(k.id)}>
                            {busy ? 'Revoking…' : 'Revoke'}
                          </button>
                          <button className="lnk" type="button" onClick={() => setAsking(null)}>
                            Keep
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </ScrollTable>
      )}
      <p className="help">
        Programs name this network by its ID, <code>{network.id}</code>. The API’s requests and answers are in its{' '}
        <a className="lnk" href="/api/v1/openapi.json">
          OpenAPI document
        </a>
        .
      </p>
    </div>
  )
}
