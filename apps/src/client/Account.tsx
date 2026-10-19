import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { useEffect, useRef, useState } from 'react'
import { Alert, useAction } from './controls'
import { StateLine } from './states'

// The accounts pages of the island: signing in or up with a passkey, or back in with a recovery
// code, and, until there are networks, the signed-in member's page.

// A write to the Worker's auth routes, as JSON. `fetch` sends the page's Origin, which they check.
async function send<T>(path: string, body: object = {}): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const answer = (await res.json().catch(() => null)) as { error?: string } | null
  if (!res.ok) throw new Error(answer?.error ?? `Crossfeed answered ${res.status}. Try again.`)
  return answer as T
}

// What went wrong with the browser's passkey prompt, in words. A prompt the person closed, or one
// that timed out, is a NotAllowedError.
const prompted = async <T,>(prompt: () => Promise<T>, closed: string) => {
  try {
    return await prompt()
  } catch (err) {
    throw new Error(
      err instanceof Error && err.name === 'NotAllowedError' ? closed : String(err instanceof Error ? err.message : err)
    )
  }
}

type Ceremony = { challenge: string; options: never }

export function SignInPage({ next }: { next: string }) {
  // A recovery code to show once, after a sign-up or a recovery, until the member says they've saved it.
  const [code, setCode] = useState<string | null>(null)
  const [recovering, setRecovering] = useState(false)
  const supported = useSupported()
  if (code) return <RecoveryCode code={code} next={next} />
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
          <Recover onBack={() => setRecovering(false)} onCode={setCode} />
        ) : (
          <PasskeySignIn disabled={supported === false} onIn={go} onRecover={() => setRecovering(true)} />
        )}
        <CreateAccount disabled={supported === false} onCode={setCode} />
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

function PasskeySignIn({ disabled, onIn, onRecover }: { disabled: boolean; onIn: () => void; onRecover: () => void }) {
  const { busy, error, run } = useAction()
  const signIn = () =>
    run(async () => {
      const { challenge, options } = await send<Ceremony>('/auth/sign-in/options')
      const response = await prompted(
        () => startAuthentication({ optionsJSON: options }),
        'The passkey prompt closed before you chose a passkey. If this device has none for Crossfeed, create an account, or use a recovery code.'
      )
      await send('/auth/sign-in', { challenge, response })
      onIn()
    })
  return (
    <section className="way" aria-labelledby="way-in">
      <h2 className="lbl" id="way-in">
        Sign in
      </h2>
      <p>Use the passkey you made for Crossfeed on this device, or on a phone nearby.</p>
      <div className="acts">
        <button className="btn pri" type="button" disabled={disabled || busy} onClick={() => void signIn()}>
          {busy ? 'Waiting for your passkey…' : 'Sign in with a passkey'}
        </button>
      </div>
      <Alert error={error} />
      <p className="help">
        Lost every passkey?{' '}
        <button className="lnk" type="button" onClick={onRecover}>
          Use a recovery code
        </button>
      </p>
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

function CreateAccount({ disabled, onCode }: { disabled: boolean; onCode: (code: string) => void }) {
  const { busy, error, run } = useAction()
  const [name, setName] = useState('')
  const create = () =>
    run(async () => {
      const { challenge, options } = await send<Ceremony>('/auth/sign-up/options', { name })
      const response = await prompted(
        () => startRegistration({ optionsJSON: options }),
        'The passkey prompt closed before your passkey was made. Try again when you’re ready.'
      )
      onCode((await send<{ recoveryCode: string }>('/auth/sign-up', { challenge, response })).recoveryCode)
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
            {busy ? 'Waiting for your passkey…' : 'Create account'}
          </button>
        </div>
      </form>
      <Alert error={error} />
      <p className="help">Your browser makes a passkey for Crossfeed, then you get a recovery code to keep.</p>
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

// The signed-in member's page until there are networks: who they are, and a way to sign out.
export function MemberPage({ name }: { name: string }) {
  const { busy, error, run } = useAction()
  const signOut = () =>
    run(async () => {
      await send('/auth/sign-out')
      window.location.assign('/sign-in')
    })
  return (
    <main className="acct">
      <header className="acct-hd">
        <h1>{name}</h1>
        <p className="help">You’re signed in to Crossfeed. You don’t belong to a network yet.</p>
      </header>
      <div className="saved">
        <div className="acts">
          <a className="btn" href="/demo">
            Open the sample network
          </a>
          <button className="btn" type="button" disabled={busy} onClick={() => void signOut()}>
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
        <Alert error={error} />
      </div>
    </main>
  )
}
