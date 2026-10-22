import { startAuthentication } from '@simplewebauthn/browser'
import { useEffect, useRef, useState } from 'react'
import { Refused, send } from './controls'
import { StateLine } from './states'

// What the sign-in and account pages share: a passkey prompt's errors in words, a ceremony's first
// answer, the recovery code, for when a member has lost every passkey, and confirming it's the member
// before a change to how they sign in.

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

// A change the Worker holds until the member confirms it's them (step-up): with a passkey of theirs,
// whose ceremony comes with the refusal, or, in a browser signed in with the recovery code, that code.
type StepUp = ({ stepUp: 'passkey' } & Ceremony) | { stepUp: 'code' }

// Sends a change, which takes no body, as `send` does. When the Worker holds it until the member
// confirms it's them, the browser asks for their passkey there and then, or `askCode` asks for their
// recovery code; once it's confirmed, the change goes again.
export async function sendConfirmed<T>(path: string, askCode: () => Promise<string>): Promise<T> {
  try {
    return await send<T>(path)
  } catch (err) {
    const held = err instanceof Refused && err.status === 403 ? (err.answer as Partial<StepUp> | null) : null
    if (!held?.stepUp) throw err
    if (held.stepUp === 'code') await send('/auth/verify', { code: await askCode() })
    else {
      const response = await prompted(
        () => startAuthentication({ optionsJSON: (held as Ceremony).options }),
        'The passkey prompt closed before you confirmed it’s you, so nothing changed. Try again, or, on a device with no passkey of yours, sign in with your recovery code first.'
      )
      await send('/auth/verify', { challenge: (held as Ceremony).challenge, response })
    }
    return send<T>(path)
  }
}

// Asks for the recovery code in place, for a change in a browser signed in with it: `ask` resolves with
// the code the member types, or rejects once they cancel; `form`, on Panel Grey, is what shows meanwhile,
// and `asking` says it's showing. `id` names its field.
export function useCodeAsk(id: string) {
  const [asking, setAsking] = useState<{ resolve: (code: string) => void; reject: (err: Error) => void } | null>(null)
  const [typed, setTyped] = useState('')
  const ask = () =>
    new Promise<string>((resolve, reject) => {
      setTyped('')
      setAsking({ resolve, reject })
    })
  const form = asking && (
    <form
      className="set-ask"
      onSubmit={(e) => {
        e.preventDefault()
        asking.resolve(typed)
        setAsking(null)
      }}
    >
      <label htmlFor={id}>Confirm it’s you with your recovery code</label>
      <p className="help">
        This browser signed in with it, so it has no passkey of yours to ask for. Use the code Crossfeed showed you
        last.
      </p>
      <input
        id={id}
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
        <button className="btn pri" type="submit" disabled={!typed.trim()}>
          Confirm
        </button>
        <button
          className="lnk"
          type="button"
          onClick={() => {
            asking.reject(new Error('Not confirmed, so nothing changed.'))
            setAsking(null)
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  )
  return { ask, form, asking: asking !== null }
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
