import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { useEffect, useRef, useState } from 'react'
import { Alert, send, useAction } from './controls'
import { MAX_NAME } from '../text'
import { StateLine } from './states'

// The accounts pages of the island: signing in or up with a passkey, or back in with a recovery
// code, joining a network through an invite, creating a network, and signing out from the app shell's
// account menu.

// What went wrong with the browser's passkey prompt, in words. A prompt the person closed, or one
// that timed out, is a NotAllowedError; adding a passkey where the device keeps one for the account
// already is an InvalidStateError, said as `already`.
export const prompted = async <T,>(prompt: () => Promise<T>, closed: string, already?: string) => {
  try {
    return await prompt()
  } catch (err) {
    const name = err instanceof Error ? err.name : null
    throw new Error(
      name === 'NotAllowedError'
        ? closed
        : name === 'InvalidStateError' && already
          ? already
          : String(err instanceof Error ? err.message : err)
    )
  }
}

// A passkey ceremony's first answer: its challenge's ID, and the options for the browser.
export type Ceremony = { challenge: string; options: never }

export function SignInPage({ next }: { next: string }) {
  // A recovery code to show once, after a sign-up or a recovery, until the member says they've saved
  // it, and where they go then: `next` after a sign-up, and the account page after a recovery, to add a
  // passkey for the device they're on.
  const [code, setCode] = useState<{ code: string; next: string } | null>(null)
  const [recovering, setRecovering] = useState(false)
  const supported = useSupported()
  if (code) return <RecoveryCode code={code.code} next={code.next} />
  const go = () => window.location.assign(next)

  return (
    <main className="acct">
      <header className="acct-hd">
        <h1>Sign in to Crossfeed</h1>
        <p className="help">
          Crossfeed signs you in with a passkey, kept by your device or password manager. There’s no password, and no
          email to confirm.
        </p>
        {supported === false && (
          <StateLine kind="error" role="alert">
            This browser can’t use passkeys. Open Crossfeed in a current Chrome, Safari, Edge, or Firefox, or sign in
            with a recovery code.
          </StateLine>
        )}
      </header>
      <div className="ways">
        {recovering ? (
          <Recover
            onBack={() => setRecovering(false)}
            onCode={(c) => setCode({ code: c, next: '/app/account?recovered' })}
          />
        ) : (
          <PasskeySignIn disabled={supported === false} onIn={go} onRecover={() => setRecovering(true)} />
        )}
        <CreateAccount disabled={supported === false} onCode={(c) => setCode({ code: c, next })} />
      </div>
    </main>
  )
}

// Whether this browser can make and use passkeys, once the page knows (null until then).
function useSupported() {
  const [supported, setSupported] = useState<boolean | null>(null)
  useEffect(() => setSupported(browserSupportsWebAuthn()), [])
  return supported
}

// Signing in with a passkey. On the invite page, `onIn` joins the network too, and there's no recovery:
// a member who lost every passkey signs in with their code first, then opens the link again.
function PasskeySignIn({
  disabled,
  onIn,
  onRecover,
  action = 'Sign in with a passkey'
}: {
  disabled: boolean
  onIn: () => unknown
  onRecover?: () => void
  action?: string
}) {
  const { busy, error, run } = useAction()
  const signIn = () =>
    run(async () => {
      const { challenge, options } = await send<Ceremony>('/auth/sign-in/options')
      const response = await prompted(
        () => startAuthentication({ optionsJSON: options }),
        'The passkey prompt closed before you chose a passkey. If this device has none for Crossfeed, create an account, or use a recovery code.'
      )
      await send('/auth/sign-in', { challenge, response })
      await onIn()
    })
  return (
    <section className="way" aria-labelledby="way-in">
      <h2 className="lbl" id="way-in">
        Sign in
      </h2>
      <p>Use the passkey you made for Crossfeed on this device, or on a phone nearby.</p>
      <div className="acts">
        <button className="btn pri" type="button" disabled={disabled || busy} onClick={() => void signIn()}>
          {busy ? 'Waiting for your passkey…' : action}
        </button>
      </div>
      <Alert error={error} />
      {onRecover ? (
        <p className="help">
          Lost every passkey?{' '}
          <button className="lnk" type="button" onClick={onRecover}>
            Use a recovery code
          </button>
        </p>
      ) : (
        <p className="help">
          Lost every passkey?{' '}
          <a className="lnk" href="/sign-in">
            Sign in with a recovery code
          </a>
          , then open this link again.
        </p>
      )}
    </section>
  )
}

function Recover({ onBack, onCode }: { onBack: () => void; onCode: (code: string) => void }) {
  const { busy, error, run } = useAction()
  const [typed, setTyped] = useState('')
  const recover = () =>
    run(async () => onCode((await send<{ recoveryCode: string }>('/auth/recover', { code: typed })).recoveryCode))
  return (
    <section className="way" aria-labelledby="way-in">
      <h2 className="lbl" id="way-in">
        Sign in with a recovery code
      </h2>
      <form
        className="field"
        onSubmit={(e) => {
          e.preventDefault()
          void recover()
        }}
      >
        <label htmlFor="recovery-code">Your recovery code</label>
        <input
          id="recovery-code"
          className="acct-in code-in"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          autoFocus
          required
        />
        <div className="acts">
          <button className="btn pri" type="submit" disabled={busy || !typed.trim()}>
            {busy ? 'Checking…' : 'Sign in'}
          </button>
          <button className="lnk" type="button" onClick={onBack}>
            Use a passkey instead
          </button>
        </div>
      </form>
      <Alert error={error} />
      <p className="help">
        The code you saved when you made your account, or when you last used one. It works once, and you’ll get a new
        one to keep.
      </p>
    </section>
  )
}

// Creating an account with a passkey. On the invite page it carries the link's token, `invite`, and
// joins the network in the same step: `onCode` gets the network's ID too.
function CreateAccount({
  disabled,
  onCode,
  invite,
  action = 'Create account'
}: {
  disabled: boolean
  onCode: (code: string, network?: string) => void
  invite?: string
  action?: string
}) {
  const { busy, error, run } = useAction()
  const [name, setName] = useState('')
  const create = () =>
    run(async () => {
      const { challenge, options } = await send<Ceremony>('/auth/sign-up/options', { name, invite })
      const response = await prompted(
        () => startRegistration({ optionsJSON: options }),
        'The passkey prompt closed before your passkey was made. Try again when you’re ready.'
      )
      const done = await send<{ recoveryCode: string; network?: string }>('/auth/sign-up', {
        challenge,
        response,
        invite
      })
      onCode(done.recoveryCode, done.network)
    })
  return (
    <section className="way" aria-labelledby="way-new">
      <h2 className="lbl" id="way-new">
        Create an account
      </h2>
      <form
        className="field"
        onSubmit={(e) => {
          e.preventDefault()
          void create()
        }}
      >
        <label htmlFor="member-name">Your name, as your teammates will see it</label>
        <input
          id="member-name"
          className="acct-in"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          maxLength={64}
          required
        />
        <div className="acts">
          <button className="btn pri" type="submit" disabled={disabled || busy || !name.trim()}>
            {busy ? 'Waiting for your passkey…' : action}
          </button>
        </div>
      </form>
      <Alert error={error} />
      <p className="help">Your browser makes a passkey for Crossfeed, then you get a recovery code to keep.</p>
    </section>
  )
}

// The invite page: the link's token is in the address's fragment, which the browser never sends, so
// the page reads it and posts it. It names the network, then lets a signed-in member join, or anyone
// else create an account or sign in, and join in the same step. `memberName` is who's signed in.
export function InvitePage({ memberName }: { memberName: string | null }) {
  const [token] = useState(() => window.location.hash.slice(1))
  const [invite, setInvite] = useState<{ network: string } | { error: string } | null>(null)
  const [code, setCode] = useState<{ code: string; next: string } | null>(null)
  const supported = useSupported()
  // Another link opened in this tab changes only the fragment, which loads no page: load it.
  useEffect(() => {
    const reload = () => window.location.reload()
    window.addEventListener('hashchange', reload)
    return () => window.removeEventListener('hashchange', reload)
  }, [])
  useEffect(() => {
    send<{ network: string }>('/auth/invite', { token }).then(
      (open) => {
        document.title = `Join ${open.network} · Crossfeed`
        setInvite(open)
      },
      (err: Error) => setInvite({ error: err.message })
    )
  }, [token])
  if (code) return <RecoveryCode code={code.code} next={code.next} />
  // Joins as whoever is signed in now, and opens the network.
  const join = async () => window.location.assign(`/app/${(await send<{ id: string }>('/auth/join', { token })).id}`)

  if (!invite || 'error' in invite)
    return (
      <main className="acct">
        <header className="acct-hd">
          <h1>{invite ? 'This invite link can’t be used' : 'Opening your invite'}</h1>
          {invite ? (
            <StateLine kind="error" role="alert">
              {invite.error}
            </StateLine>
          ) : (
            <StateLine kind="loading">Checking the link…</StateLine>
          )}
        </header>
        {invite && (
          <p className="acct-next">
            <a className="lnk" href={memberName ? '/app' : '/sign-in'}>
              {memberName ? 'Open your networks' : 'Sign in to Crossfeed'}
            </a>
          </p>
        )}
      </main>
    )

  return (
    <main className="acct">
      <header className="acct-hd">
        <h1>Join {invite.network}</h1>
        <p className="help">
          You’re invited to {invite.network} on Crossfeed, as a member: you’ll work on its roster, launches, and inbox
          with its other members. The link works once.
        </p>
        {supported === false && !memberName && (
          <StateLine kind="error" role="alert">
            This browser can’t use passkeys. Open the link in a current Chrome, Safari, Edge, or Firefox.
          </StateLine>
        )}
      </header>
      {memberName ? (
        <JoinAs name={memberName} network={invite.network} join={join} />
      ) : (
        <div className="ways">
          <CreateAccount
            disabled={supported === false}
            invite={token}
            action="Create account and join"
            onCode={(recoveryCode, network) => setCode({ code: recoveryCode, next: `/app/${network}` })}
          />
          <PasskeySignIn disabled={supported === false} onIn={join} action="Sign in and join" />
        </div>
      )}
    </main>
  )
}

// A signed-in member joins as themselves, in one step, or signs out to join with another account.
function JoinAs({ name, network, join }: { name: string; network: string; join: () => Promise<void> }) {
  const { busy, error, run } = useAction()
  const signOut = () =>
    run(async () => {
      await send('/auth/sign-out')
      // The link's fragment stays in the address, so the page opens on the invite again, signed out.
      window.location.reload()
    })
  return (
    <section className="way" aria-label={`Join ${network}`}>
      <p>
        You’re signed in as <b>{name}</b>.
      </p>
      <div className="acts">
        <button className="btn pri" type="button" disabled={busy} onClick={() => void run(join)}>
          {busy ? 'Joining…' : `Join ${network}`}
        </button>
      </div>
      <Alert error={error} />
      <p className="help">
        Not {name}?{' '}
        <button className="lnk" type="button" disabled={busy} onClick={() => void signOut()}>
          Sign out
        </button>{' '}
        to join with another account.
      </p>
    </section>
  )
}

// The recovery code, shown once: the member copies or writes it down, then goes on.
export function RecoveryCode({ code, next }: { code: string; next: string }) {
  const heading = useRef<HTMLHeadingElement>(null)
  const [copied, setCopied] = useState<boolean | null>(null)
  useEffect(() => heading.current?.focus(), [])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <main className="acct">
      <header className="acct-hd">
        <h1 ref={heading} tabIndex={-1}>
          Save your recovery code
        </h1>
        <p className="help">
          If you lose every passkey, this code signs you in once. Crossfeed shows it only now, and keeps no copy it can
          read.
        </p>
      </header>
      <div className="saved">
        <p className="code" aria-label={`Recovery code ${code.split('').join(' ')}`}>
          {code}
        </p>
        <div className="acts">
          <button className="btn" type="button" onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy code'}
          </button>
          <button className="btn pri" type="button" onClick={() => window.location.assign(next)}>
            I’ve saved it
          </button>
        </div>
        {copied === false && (
          <StateLine kind="error" role="alert">
            This browser didn’t let Crossfeed copy it. Select the code and copy it yourself.
          </StateLine>
        )}
        <p className="help">Keep it somewhere other than this device, such as your password manager or on paper.</p>
      </div>
    </main>
  )
}

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

// The app shell's account menu: its Sign out button ends the session, then goes to the sign-in page.
// The shell is server-rendered, so the island finds the button rather than rendering it.
export function wireSignOut(button: HTMLButtonElement) {
  button.addEventListener('click', async () => {
    button.disabled = true
    try {
      await send('/auth/sign-out')
      window.location.assign('/sign-in')
    } catch {
      button.disabled = false
      button.textContent = 'Sign out failed. Try again'
    }
  })
}
