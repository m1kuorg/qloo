import { useEffect, useRef, useState } from 'react'
import { StateLine } from './states'

// What the sign-in and account pages share: a passkey prompt's errors in words, a ceremony's first
// answer, and the recovery code, for when a member has lost every passkey.

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
