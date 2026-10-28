import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { cn } from 'cn'
import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { linkVariants, marketingFrame } from '@/components/ui/variants'
import { GUEST_NETWORK_CLEARS, modelRuns } from '../text'
import { Alert, send, SignOut, useAction } from './controls'
import { prompted, RecoveryCode, type Ceremony } from './Passkeys'
import { StateLine } from './states'

// The accounts pages of the island: signing in or up with a passkey, or back in with a recovery
// code, and joining a network through an invite.

// The sign-in and invite pages' frame, on the marketing pages' measure so it lines up with the
// wordmark over it: from 1024px, two columns, what the page is for at display size on the left, and
// the ways in on the right, flush with the page's right edge, each a panel on the card.
const frame = cn(marketingFrame, 'grid items-start gap-10 pt-6 pb-16 md:pt-10 lg:grid-cols-2 lg:gap-16 lg:pt-16')
const panel = 'flex w-full max-w-[32rem] flex-col gap-4 rounded-xl bg-card p-4 sm:p-6 lg:justify-self-end'
const ways = 'flex w-full max-w-[32rem] flex-col gap-4 lg:justify-self-end'

// The left column: the page's h1 at display size, and what it says under it.
const Lede = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="flex flex-col gap-4">
    <h1 className="type-display text-balance">{title}</h1>
    {children}
  </div>
)

// `runs` is the guest network's model runs a day, which everyone who signs in as a guest shares.
export function SignInPage({ next, runs }: { next: string; runs: number }) {
  // A recovery code to show once, after a sign-up or a recovery, until the member says they've saved
  // it, and where they go then: `next` after a sign-up, and the account page after a recovery, to add a
  // passkey for the device they're on.
  const [code, setCode] = useState<{ code: string; next: string } | null>(null)
  const [recovering, setRecovering] = useState(false)
  const supported = useSupported()
  if (code) return <RecoveryCode code={code.code} next={code.next} frame={frame} />
  const go = () => window.location.assign(next)

  return (
    <main className={frame}>
      <Lede title="Sign in to Crossfeed">
        <p className="max-w-[48ch] type-body text-muted-foreground">
          Crossfeed signs you in with a passkey, kept by your device or password manager. There’s no password, and no
          email to confirm.
        </p>
        {supported === false && (
          <p className="max-w-[48ch]">
            <StateLine kind="error" role="alert">
              This browser can’t use passkeys. Open Crossfeed in a current Chrome, Safari, Edge, or Firefox, sign in
              with a recovery code, or sign in as a guest.
            </StateLine>
          </p>
        )}
      </Lede>
      <div className={ways}>
        {recovering ? (
          <Recover
            onBack={() => setRecovering(false)}
            onCode={(c) => setCode({ code: c, next: '/app/account?recovered' })}
          />
        ) : (
          <PasskeySignIn disabled={supported === false} onIn={go} onRecover={() => setRecovering(true)} primary />
        )}
        <CreateAccount
          disabled={supported === false}
          title="New here? Create an account"
          onCode={(c) => setCode({ code: c, next })}
        />
        <GuestSignIn next={next} runs={runs} />
      </div>
    </main>
  )
}

// Signing in as a guest (ADR 0005), with no passkey, so it stays open in a browser without passkeys:
// one click into the guest network, which every guest shares with its daily limits, then on to where
// the answer says, `next` under the sign-in's rules.
function GuestSignIn({ next, runs }: { next: string; runs: number }) {
  const { busy, error, run } = useAction()
  const signIn = () =>
    run(async () => {
      const answer = await send<{ next: string }>(`/auth/guest?next=${encodeURIComponent(next)}`)
      window.location.assign(answer.next)
    })
  return (
    <section className={panel} aria-labelledby="way-guest">
      <div className="flex flex-col gap-1">
        <h2 className="type-body font-medium" id="way-guest">
          Look around as a guest
        </h2>
        <p className="text-muted-foreground">
          Everyone who signs in as a guest shares one guest network and its daily limits, {modelRuns(runs)} a day
          between them, so put nothing private in it. It’s cleared every day at {GUEST_NETWORK_CLEARS}.
        </p>
      </div>
      <Button variant="secondary" className="w-full" disabled={busy} onClick={() => void signIn()}>
        {busy && <Spinner data-icon="inline-start" />}
        {busy ? 'Signing in…' : 'Sign in as a guest'}
      </Button>
      <Alert error={error} />
    </section>
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
// `primary` makes its button the page's one primary.
function PasskeySignIn({
  disabled,
  onIn,
  onRecover,
  action = 'Sign in with a passkey',
  primary = false
}: {
  disabled: boolean
  onIn: () => unknown
  onRecover?: () => void
  action?: string
  primary?: boolean
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
    <section className={panel} aria-labelledby="way-in">
      <div className="flex flex-col gap-1">
        <h2 className="type-body font-medium" id="way-in">
          Sign in
        </h2>
        <p className="text-muted-foreground">
          Use the passkey you made for Crossfeed on this device, or on a phone nearby.
        </p>
      </div>
      <Button
        variant={primary ? 'default' : 'secondary'}
        className="w-full"
        disabled={disabled || busy}
        onClick={() => void signIn()}
      >
        {busy && <Spinner data-icon="inline-start" />}
        {busy ? 'Waiting for your passkey…' : action}
      </Button>
      <Alert error={error} />
      {onRecover ? (
        <p className="text-muted-foreground">
          Lost every passkey?{' '}
          <Button variant="link" onClick={onRecover}>
            Use a recovery code
          </Button>
        </p>
      ) : (
        <p className="text-muted-foreground">
          Lost every passkey?{' '}
          <a className={linkVariants()} href="/sign-in">
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
    <section className={panel} aria-labelledby="way-in">
      <h2 className="type-body font-medium" id="way-in">
        Sign in with a recovery code
      </h2>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void recover()
        }}
      >
        <Field>
          <FieldLabel htmlFor="recovery-code">Your recovery code</FieldLabel>
          <Input
            id="recovery-code"
            className="font-mono"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            autoFocus
            required
          />
          <FieldDescription>
            The code you saved when you made your account, or when you last used one. It works once, and you’ll get a
            new one to keep.
          </FieldDescription>
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={busy || !typed.trim()}>
            {busy && <Spinner data-icon="inline-start" />}
            {busy ? 'Checking…' : 'Sign in'}
          </Button>
          <Button variant="ghost" onClick={onBack}>
            Use a passkey instead
          </Button>
        </div>
      </form>
      <Alert error={error} />
    </section>
  )
}

// Creating an account with a passkey. On the invite page it carries the link's token, `invite`, and
// joins the network in the same step: `onCode` gets the network's ID too. `primary` makes its button
// the page's one primary.
function CreateAccount({
  disabled,
  onCode,
  invite,
  title = 'Create an account',
  action = 'Create account',
  primary = false
}: {
  disabled: boolean
  onCode: (code: string, network?: string) => void
  invite?: string
  title?: string
  action?: string
  primary?: boolean
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
    <section className={panel} aria-labelledby="way-new">
      <h2 className="type-body font-medium" id="way-new">
        {title}
      </h2>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void create()
        }}
      >
        <Field>
          <FieldLabel htmlFor="member-name">Your name, as your teammates will see it</FieldLabel>
          <Input
            id="member-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            maxLength={64}
            required
          />
          <FieldDescription>
            Your browser makes a passkey for Crossfeed, then you get a recovery code to keep.
          </FieldDescription>
        </Field>
        <Button
          type="submit"
          variant={primary ? 'default' : 'secondary'}
          className="w-full"
          disabled={disabled || busy || !name.trim()}
        >
          {busy && <Spinner data-icon="inline-start" />}
          {busy ? 'Waiting for your passkey…' : action}
        </Button>
      </form>
      <Alert error={error} />
    </section>
  )
}

// What `/auth/invite` answers for an invite link: the network it's for, or why it can't be used.
type InviteAnswer = { network: string } | { error: string }

// The invite page: the link's token is in the address's fragment, which the browser never sends, so
// the page reads it and posts it, then shows the answer (Invite). `memberName` is who's signed in, and
// `guest` whether that's a guest member, who can't join (ADR 0006).
export function InvitePage({ memberName, guest = false }: { memberName: string | null; guest?: boolean }) {
  const [token] = useState(() => window.location.hash.slice(1))
  const [invite, setInvite] = useState<InviteAnswer | null>(null)
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
  return <Invite token={token} invite={invite} memberName={memberName} guest={guest} />
}

// The invite page for the link's `token`, once `/auth/invite` has answered (`invite`, null until then):
// it names the network, then lets a signed-in member join, or anyone else create an account or sign
// in, and join in the same step.
export function Invite({
  token,
  invite,
  memberName,
  guest
}: {
  token: string
  invite: InviteAnswer | null
  memberName: string | null
  guest: boolean
}) {
  const [code, setCode] = useState<{ code: string; next: string } | null>(null)
  const supported = useSupported()
  if (code) return <RecoveryCode code={code.code} next={code.next} frame={frame} />
  // Joins as whoever is signed in now, and opens the network.
  const join = async () => window.location.assign(`/app/${(await send<{ id: string }>('/auth/join', { token })).id}`)

  if (!invite || 'error' in invite)
    return (
      <main className={frame}>
        <Lede title={invite ? 'This invite link can’t be used' : 'Opening your invite'}>
          <p className="max-w-[48ch] type-body">
            {invite ? (
              <StateLine kind="error" role="alert">
                {invite.error}
              </StateLine>
            ) : (
              <StateLine kind="loading">Checking the link…</StateLine>
            )}
          </p>
          {invite && (
            <p className="type-body">
              <a className={linkVariants()} href={memberName ? '/app' : '/sign-in'}>
                {memberName ? 'Open your networks' : 'Sign in to Crossfeed'}
              </a>
            </p>
          )}
        </Lede>
      </main>
    )

  return (
    <main className={frame}>
      <Lede title={`Join ${invite.network}`}>
        <p className="max-w-[48ch] type-body text-muted-foreground">
          You’re invited to {invite.network} on Crossfeed, as a member: you’ll work on its roster, launches, and inbox
          with its other members. The link works once.
        </p>
        {supported === false && !memberName && (
          <p className="max-w-[48ch]">
            <StateLine kind="error" role="alert">
              This browser can’t use passkeys. Open the link in a current Chrome, Safari, Edge, or Firefox.
            </StateLine>
          </p>
        )}
      </Lede>
      {memberName ? (
        <JoinAs name={memberName} network={invite.network} guest={guest} join={join} />
      ) : (
        <div className={ways}>
          <CreateAccount
            disabled={supported === false}
            invite={token}
            action="Create account and join"
            onCode={(recoveryCode, network) => setCode({ code: recoveryCode, next: `/app/${network}` })}
            primary
          />
          <PasskeySignIn disabled={supported === false} onIn={join} action="Sign in and join" />
        </div>
      )}
    </main>
  )
}

// A signed-in member joins as themselves, in one step, or signs out to join with another account. A
// guest can only sign out, to create an account and join with it.
function JoinAs({
  name,
  network,
  guest,
  join
}: {
  name: string
  network: string
  guest: boolean
  join: () => Promise<void>
}) {
  const { busy, error, run } = useAction()
  const signOut = () =>
    run(async () => {
      await send('/auth/sign-out')
      // The link's fragment stays in the address, so the page opens on the invite again, signed out.
      window.location.reload()
    })
  if (guest)
    return (
      <section className={panel} aria-label={`Join ${network}`}>
        <p>
          You’re signed in as a guest, and a guest can’t join a network. Sign out and create an account to join{' '}
          {network}.
        </p>
        {/* As signOut does above: signed out, the page opens on the invite again. */}
        <SignOut className="w-full" then={() => window.location.reload()}>
          Sign out and create an account
        </SignOut>
      </section>
    )
  return (
    <section className={panel} aria-label={`Join ${network}`}>
      <p>
        You’re signed in as <b className="font-semibold">{name}</b>.
      </p>
      <Button className="w-full" disabled={busy} onClick={() => void run(join)}>
        {busy && <Spinner data-icon="inline-start" />}
        {busy ? 'Joining…' : `Join ${network}`}
      </Button>
      <Alert error={error} />
      <p className="text-muted-foreground">
        Not {name}?{' '}
        <Button variant="link" disabled={busy} onClick={() => void signOut()}>
          Sign out
        </Button>{' '}
        to join with another account.
      </p>
    </section>
  )
}
