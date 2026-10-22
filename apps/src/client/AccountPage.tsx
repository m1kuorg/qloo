import { startRegistration } from '@simplewebauthn/browser'
import { Fragment, useState, type ReactNode } from 'react'
import type { AccountNetwork, AccountPasskey } from '../directory'
import { listOf, MAX_NAME } from '../text'
import { Alert, day, ScrollTable, send, useAction } from './controls'
import { prompted, RecoveryCode, type Ceremony } from './Passkeys'
import { StateLine } from './states'

// The member's account page, at /app/account: their name, their passkeys, a new recovery code, their
// sessions, their networks, and deleting the account, one module per job in the settings' grammar.
// A recovery code signs a member in here (`recovered`), to add a passkey for the device they're on.
export function AccountPage({
  name,
  passkeys,
  sessions,
  networks,
  recovered
}: {
  name: string
  passkeys: AccountPasskey[]
  sessions: number
  networks: AccountNetwork[]
  recovered: boolean
}) {
  // A new recovery code to show once, until the member says they've saved it.
  const [code, setCode] = useState<string | null>(null)
  if (code) return <RecoveryCode code={code} next="/app/account" />
  const onlyOwner = networks.filter((n) => n.onlyOwner).map((n) => n.name)
  return (
    <>
      <header className="hd">
        <h1>Account</h1>
      </header>
      <main className="set acct-mods">
        <NameModule name={name} />
        <PasskeysModule listed={passkeys} recovered={recovered} />
        <RecoveryModule onCode={setCode} />
        <SessionsModule sessions={sessions} />
        <NetworksModule networks={networks} onlyOwner={onlyOwner} />
        <DeleteModule onlyOwner={onlyOwner} />
      </main>
    </>
  )
}

// A module's heading and what it's for, beside its body.
const About = ({ id, title, children }: { id: string; title: string; children: ReactNode }) => (
  <div className="set-about">
    <h2 className="lbl" id={id}>
      {title}
    </h2>
    <p className="help">{children}</p>
  </div>
)

function NameModule({ name: saved }: { name: string }) {
  const [name, setName] = useState(saved)
  const [kept, setKept] = useState(saved)
  const [done, setDone] = useState(false)
  const { busy, error, run } = useAction()
  const changed = name.trim() !== kept
  const save = () =>
    run(async () => {
      const answer = await send<{ name: string }>('/app/account/name', { name })
      setKept(answer.name)
      setName(answer.name)
      setDone(true)
      // The account menu is the server's: it shows the new name without a reload.
      document.querySelectorAll('[data-signed-in]').forEach((el) => (el.textContent = answer.name))
    })
  return (
    <section className="mod set-mod" aria-labelledby="acct-name-h">
      <About id="acct-name-h" title="Name">
        How your teammates see you in every network you’re in, on its members, its runs, and the orders you approve.
      </About>
      <form
        className="set-body set-form"
        onSubmit={(e) => {
          e.preventDefault()
          setDone(false)
          void save()
        }}
      >
        <label htmlFor="acct-name">Your name</label>
        <input
          id="acct-name"
          className="acct-in"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setDone(false)
          }}
          autoComplete="name"
          maxLength={MAX_NAME}
          required
        />
        <div className="acts">
          <button className="btn pri" type="submit" disabled={busy || !name.trim() || !changed}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          {done && !changed && <StateLine kind="empty">Saved.</StateLine>}
        </div>
        <Alert error={error} />
      </form>
    </section>
  )
}

function PasskeysModule({ listed, recovered }: { listed: AccountPasskey[]; recovered: boolean }) {
  const [passkeys, setPasskeys] = useState(listed)
  // The passkey whose removal waits on a yes, and the one just added.
  const [asking, setAsking] = useState<string | null>(null)
  const [added, setAdded] = useState<string | null>(null)
  const { busy, error, run } = useAction()
  const only = passkeys.length === 1

  const add = () =>
    run(async () => {
      const { challenge, options } = await send<Ceremony>('/auth/passkeys/options')
      const response = await prompted(
        () => startRegistration({ optionsJSON: options }),
        'The passkey prompt closed before a passkey was made. Try again when you’re ready.',
        'This device or password manager already keeps a passkey for your account. Add one from another device.'
      )
      const answer = await send<{ passkeys: AccountPasskey[] }>('/auth/passkeys', { challenge, response })
      setAdded(answer.passkeys.find((p) => !passkeys.some((q) => q.id === p.id))?.id ?? null)
      setPasskeys(answer.passkeys)
    })
  const remove = (id: string) =>
    run(async () => {
      setPasskeys((await send<{ passkeys: AccountPasskey[] }>(`/app/account/passkeys/${id}/remove`)).passkeys)
      setAsking(null)
    })

  return (
    <section className="mod set-mod" aria-labelledby="acct-keys-h">
      <About id="acct-keys-h" title="Passkeys">
        Each passkey signs you in from the device or password manager that keeps it. Keep one on a second device, so
        losing one doesn’t lock you out.
      </About>
      <div className="set-body wide">
        {recovered && !added && (
          <div className="set-ask" role="status">
            <p>
              You signed in with your recovery code. Add a passkey for this device now, so you can sign in without a
              code next time.
            </p>
          </div>
        )}
        <ScrollTable label="Passkeys">
          <table className="chart passkeys">
            <thead>
              <tr>
                <th scope="col">Passkey</th>
                <th scope="col">Added</th>
                <th scope="col">Last used</th>
                <th scope="col">
                  <span className="vh">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {passkeys.map((p) => (
                <Fragment key={p.id}>
                  <tr className={asking === p.id ? 'on' : undefined}>
                    <td className="nm">
                      {p.label}
                      {added === p.id && <span className="chip">New</span>}
                    </td>
                    <td>{addedAt(p, passkeys)}</td>
                    <td>{p.lastUsed === null ? 'Never' : day(p.lastUsed)}</td>
                    <td className="r">
                      <button
                        className="lnk"
                        type="button"
                        disabled={busy || only}
                        aria-expanded={asking === p.id}
                        onClick={() => setAsking(asking === p.id ? null : p.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                  {asking === p.id && (
                    <tr className="on ask">
                      <td colSpan={4}>
                        <p>
                          Remove the passkey from {p.label}, added {addedAt(p, passkeys)}? It won’t sign you in again.
                        </p>
                        <div className="acts">
                          <button className="btn pri" type="button" disabled={busy} onClick={() => void remove(p.id)}>
                            {busy ? 'Removing…' : 'Remove'}
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
        {only && <p className="help">Your only passkey can’t be removed: add another first.</p>}
        <div className="acts">
          <button className="btn pri" type="button" disabled={busy} onClick={() => void add()}>
            {busy ? 'Waiting for your passkey…' : 'Add a passkey'}
          </button>
        </div>
        <Alert error={error} />
        <p className="help">
          Your browser asks where to keep it: on this device, a phone nearby, or your password manager.
        </p>
      </div>
    </section>
  )
}

// When a passkey was added: the day, and the time too when another from the same browser was added
// that day, so the two read apart.
function addedAt(p: AccountPasskey, all: AccountPasskey[]) {
  const twin = all.some((q) => q.id !== p.id && q.label === p.label && day(q.created) === day(p.created))
  if (!twin) return day(p.created)
  return `${day(p.created)}, ${new Date(p.created).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
}

function RecoveryModule({ onCode }: { onCode: (code: string) => void }) {
  const { busy, error, run } = useAction()
  const renew = () =>
    run(async () => onCode((await send<{ recoveryCode: string }>('/app/account/recovery-code')).recoveryCode))
  return (
    <section className="mod set-mod" aria-labelledby="acct-code-h">
      <About id="acct-code-h" title="Recovery code">
        If you lose every passkey, your recovery code signs you in once. Crossfeed keeps no copy it can read.
      </About>
      <div className="set-body">
        <div className="acts">
          <button className="btn" type="button" disabled={busy} onClick={() => void renew()}>
            {busy ? 'Working…' : 'Get a new recovery code'}
          </button>
        </div>
        <Alert error={error} />
        <p className="help">
          For a code you’ve lost, or one someone else may have seen: your old code stops working, and the new one shows
          once.
        </p>
      </div>
    </section>
  )
}

function SessionsModule({ sessions }: { sessions: number }) {
  const [asking, setAsking] = useState(false)
  const { busy, error, run } = useAction()
  const signOut = () =>
    run(async () => {
      await send('/app/account/sign-out-everywhere')
      window.location.assign('/sign-in')
    })
  return (
    <section className="mod set-mod" aria-labelledby="acct-sessions-h">
      <About id="acct-sessions-h" title="Sessions">
        Each browser you sign in on stays signed in for 30 days from the last time you use it.
      </About>
      <div className="set-body">
        <p>
          You’re signed in on{' '}
          {sessions <= 1 ? '1 browser, this one.' : `${sessions.toLocaleString('en-US')} browsers, this one included.`}
        </p>
        {asking ? (
          <div className="set-ask">
            <p>
              Sign out of every browser, this one too? Your open pages close, and each browser needs your passkey again.
            </p>
            <div className="acts">
              <button className="btn pri" type="button" disabled={busy} onClick={() => void signOut()}>
                {busy ? 'Signing out…' : 'Sign out everywhere'}
              </button>
              <button className="lnk" type="button" onClick={() => setAsking(false)}>
                Stay signed in
              </button>
            </div>
          </div>
        ) : (
          <div className="acts">
            <button className="btn" type="button" onClick={() => setAsking(true)}>
              Sign out everywhere
            </button>
          </div>
        )}
        <Alert error={error} />
        <p className="help">
          For a lost or shared device: it’s signed out the next time it asks Crossfeed for anything.
        </p>
      </div>
    </section>
  )
}

function NetworksModule({ networks, onlyOwner }: { networks: AccountNetwork[]; onlyOwner: string[] }) {
  // The network whose leaving waits on a yes.
  const [asking, setAsking] = useState<string | null>(null)
  const { busy, error, run } = useAction()
  const leave = (id: string) =>
    run(async () => {
      await send(`/app/${id}/settings/members/leave`)
      // The bar's switcher is the server's: a reload drops the network from it too.
      window.location.reload()
    })
  return (
    <section className="mod set-mod" aria-labelledby="acct-networks-h">
      <About id="acct-networks-h" title="Networks">
        The networks you’re a member of, and your role in each. Leaving one closes your open pages of it.
      </About>
      <div className="set-body wide">
        {networks.length === 0 ? (
          <p>
            <StateLine kind="empty">You’re not in any network yet.</StateLine>{' '}
            <a className="lnk" href="/app/new">
              Create a network
            </a>
          </p>
        ) : (
          <ScrollTable label="Your networks">
            <table className="chart nets">
              <thead>
                <tr>
                  <th scope="col">Network</th>
                  <th scope="col">Role</th>
                  <th scope="col">
                    <span className="vh">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {networks.map((n) => (
                  <Fragment key={n.id}>
                    <tr className={asking === n.id ? 'on' : undefined}>
                      <td className="nm">
                        <a className="lnk" href={`/app/${n.id}`}>
                          {n.name}
                        </a>
                      </td>
                      <td>{n.role === 'owner' ? 'Owner' : 'Member'}</td>
                      <td className="r">
                        <button
                          className="lnk"
                          type="button"
                          disabled={busy || n.onlyOwner}
                          aria-expanded={asking === n.id}
                          onClick={() => setAsking(asking === n.id ? null : n.id)}
                        >
                          Leave
                        </button>
                      </td>
                    </tr>
                    {asking === n.id && (
                      <tr className="on ask">
                        <td colSpan={3}>
                          <p>Leave {n.name}? Your open pages of it close, and you’ll need a new invite to come back.</p>
                          <div className="acts">
                            <button className="btn pri" type="button" disabled={busy} onClick={() => void leave(n.id)}>
                              {busy ? 'Leaving…' : 'Leave'}
                            </button>
                            <button className="lnk" type="button" onClick={() => setAsking(null)}>
                              Stay
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
        <Alert error={error} />
        {onlyOwner.length > 0 && (
          <p className="help">
            You’re the only owner of {listOf(onlyOwner)}. Make someone else an owner in its settings, or delete the
            network there, before you leave it or delete your account.
          </p>
        )}
      </div>
    </section>
  )
}

function DeleteModule({ onlyOwner }: { onlyOwner: string[] }) {
  const [asking, setAsking] = useState(false)
  const { busy, error, run } = useAction()
  const blocked = onlyOwner.length > 0
  const remove = () =>
    run(async () => {
      await send('/app/account/delete')
      window.location.assign('/')
    })
  return (
    <section className="mod set-mod" aria-labelledby="acct-delete-h">
      <About id="acct-delete-h" title="Delete account">
        Deletes your account, passkeys, recovery code, and sessions, and takes you out of every network. What you did in
        your networks stays with them, such as the runs you started and the orders you approved, but under “Former
        member”, not your name.
      </About>
      <div className="set-body">
        {asking ? (
          <div className="set-ask">
            <p>Delete your account? You’re signed out everywhere, and it can’t be brought back.</p>
            <div className="acts">
              <button className="btn pri" type="button" disabled={busy} onClick={() => void remove()}>
                {busy ? 'Deleting…' : 'Delete account'}
              </button>
              <button className="lnk" type="button" onClick={() => setAsking(false)}>
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <div className="acts">
            <button className="btn" type="button" disabled={blocked} onClick={() => setAsking(true)}>
              Delete account
            </button>
          </div>
        )}
        <Alert error={error} />
        {blocked && (
          <p className="help">
            A network needs an owner: while you’re the only owner of {listOf(onlyOwner)}, your account stays.
          </p>
        )}
      </div>
    </section>
  )
}
