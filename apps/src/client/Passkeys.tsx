import { startAuthentication } from '@simplewebauthn/browser'
import { CheckIcon, CopyIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
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

// Asks for the recovery code, for a change in a browser signed in with it: `ask` resolves with the
// code the member types, or rejects once they cancel or close it; `form`, rendered anywhere in the
// module, is the Dialog it asks in, and `asking` says it's open. `id` names its field. It's only ever
// asked once a confirm has closed, so it never stacks on one.
export function useCodeAsk(id: string) {
  const [asking, setAsking] = useState<{ resolve: (code: string) => void; reject: (err: Error) => void } | null>(null)
  const [typed, setTyped] = useState('')
  const ask = () =>
    new Promise<string>((resolve, reject) => {
      setTyped('')
      setAsking({ resolve, reject })
    })
  const cancel = () => {
    asking?.reject(new Error('Not confirmed, so nothing changed.'))
    setAsking(null)
  }
  const form = (
    <Dialog open={asking !== null} onOpenChange={(open) => !open && cancel()}>
      <DialogContent>
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            asking?.resolve(typed)
            setAsking(null)
          }}
        >
          <DialogHeader>
            <DialogTitle>Confirm it’s you with your recovery code</DialogTitle>
            <DialogDescription>
              This browser signed in with it, so it has no passkey of yours to ask for. Use the code Crossfeed showed
              you last.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor={id}>Your recovery code</FieldLabel>
            <Input
              id={id}
              className="font-mono"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
            />
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={cancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={!typed.trim()}>
              Confirm
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
  return { ask, form, asking: asking !== null }
}

// The recovery code, shown once: the member copies or writes it down, then goes on. Its heading takes
// focus as it shows. The code is set in mono at title size, 18px on a phone so it fits one line, its
// five groups of four apart, and read to screen readers letter by letter, a group at a time. Where it
// can't fit, it wraps between groups, each dash leading its group, never at a line's end. In `frame`, the page's two columns from 1024px:
// what it is, at display size, beside the code on the card.
export function RecoveryCode({ code, next, frame }: { code: string; next: string; frame: string }) {
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
  const groups = code.split('-')
  return (
    <main className={frame}>
      <div className="flex flex-col gap-4">
        <h1 ref={heading} tabIndex={-1} className="type-display text-balance">
          Save your recovery code
        </h1>
        <p className="max-w-[48ch] type-body text-muted-foreground">
          If you lose every passkey, this code signs you in once. Crossfeed shows it only now, and keeps no copy it can
          read.
        </p>
      </div>
      <div className="flex w-full max-w-[32rem] flex-col gap-4 rounded-xl bg-card p-4 sm:p-6 lg:justify-self-end">
        <p className="font-mono type-title max-sm:text-[1.125rem]">
          <span className="sr-only">Recovery code: {groups.map((g) => g.split('').join(' ')).join(', ')}</span>
          <span aria-hidden="true">
            {groups.map((g, i) => (
              <span key={i} className="inline-block whitespace-nowrap">
                {i > 0 && <span className="mx-1 text-muted-foreground">-</span>}
                {g}
              </span>
            ))}
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void copy()}>
            {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
            {copied ? 'Copied' : 'Copy code'}
          </Button>
          {/* The button's "Copied", told to screen readers too. */}
          <span role="status" className="vh">
            {copied ? 'Copied' : ''}
          </span>
          <Button onClick={() => window.location.assign(next)}>I’ve saved it</Button>
        </div>
        {copied === false && (
          <StateLine kind="error" role="alert">
            This browser didn’t let Crossfeed copy it. Select the code and copy it yourself.
          </StateLine>
        )}
        <p className="text-muted-foreground">
          Keep it somewhere other than this device, such as your password manager or on paper.
        </p>
      </div>
    </main>
  )
}
