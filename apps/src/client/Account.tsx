import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { cn } from 'cn'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { linkVariants, marketingFrame } from '@/components/ui/variants'
import { GUEST_NETWORK_CLEARS, modelRuns } from '../text'
import { Alert, send, SignOut, useAction } from './controls'
import { Section } from './PageHeader'
import { prompted, RecoveryCode, type Ceremony } from './Passkeys'
import { StateLine } from './states'

// The accounts pages of the island: signing in or up with a passkey, or back in with a recovery
// code, and joining a network through an invite.

// The sign-in and invite pages' frame, on the marketing pages' measure so it lines up with the
// wordmark over it: from 1024px, two columns, what the page is for at display size on the left, and
// the ways in on the right, flush with the page's right edge, each a `Section` in a panel on the card.
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

// `runs` is the guest budget's model runs a day, which everyone who signs in as a guest shares, and
// `guestRefused` why a public page's guest button was refused, if it was.
export function SignInPage({ next, runs, guestRefused }: { next: string; runs: number; guestRefused?: string }) {
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
          description="Keep networks of your own, and invite your teammates to them."
          onCode={(c) => setCode({ code: c, next })}
        />
        <GuestSignIn next={next} runs={runs} refused={guestRefused ?? null} />
      </div>
    </main>
  )
}

// Signing in as a guest (ADR 0008), with no passkey, so it stays open in a browser without passkeys: one
// click to the guest member every guest is signed in as, an owner of the guest network, then on to where the
// answer says, `next` under the sign-in's rules. The public pages' guest buttons send a refused visitor
// here (#guest), with why, `refused`, which shows until they try again.
function GuestSignIn({ next, runs, refused }: { next: string; runs: number; refused: string | null }) {
  const { busy, error, run } = useAction()
  const [refusal, setRefusal] = useState(refused)
  // Opened at #guest, as /demo and a refused guest button open it, the page scrolls here once the island
  // renders the panel: the browser looked for #guest before it existed.
  const section = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (window.location.hash === '#guest') section.current?.scrollIntoView({ block: 'start' })
  }, [])
  const signIn = () =>
    run(async () => {
      setRefusal(null)
      const answer = await send<{ next: string }>(`/auth/guest?next=${encodeURIComponent(next)}`)
      window.location.assign(answer.next)
    })
  return (
    <div className={panel} id="guest" ref={section}>
      <Section
        id="way-guest"
        title="Look around as a guest"
        description="Try Crossfeed for a day on the sample network, with no account of your own."
      >
        {/* The guest's terms, read before the button, which a screen reader announces them with. */}
        <p id="guest-terms" className="type-caption text-pretty text-muted-foreground">
          You sign in as Guest, the one account every guest shares, and work in the guest network with every other
          guest. It’s cleared every day at <span className="whitespace-nowrap">{GUEST_NETWORK_CLEARS},</span> so put
          nothing private in it. All guests share one set of daily limits, {modelRuns(runs)} a day between them.
        </p>
        <Button
          variant="secondary"
          className="w-full"
          disabled={busy}
          aria-describedby="guest-terms"
          onClick={() => void signIn()}
        >
          {busy && <Spinner data-icon="inline-start" />}
          {busy ? 'Signing in…' : 'Sign in as a guest'}
        </Button>
        <Alert error={error ?? refusal} />
      </Section>
    </div>
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
    <div className={panel}>
      <Section
        id="way-in"
        title="Sign in"
        description="Use the passkey you made for Crossfeed on this device, or on a phone nearby."
      >
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
      </Section>
    </div>
  )
}

function Recover({ onBack, onCode }: { onBack: () => void; onCode: (code: string) => void }) {
  const { busy, error, run } = useAction()
  const [typed, setTyped] = useState('')
  const recover = () =>
    run(async () => onCode((await send<{ recoveryCode: string }>('/auth/recover', { code: typed })).recoveryCode))
  return (
    <div className={panel}>
      <Section
        id="way-in"
        title="Sign in with a recovery code"
        description="When you’ve lost every passkey, the code you saved signs you in instead."
      >
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
      </Section>
    </div>
  )
}

// Creating an account with a passkey. On the invite page it carries the link's token, `invite`, and
// joins the network in the same step: `onCode` gets the network's ID too. `description` is its one
// sentence; `primary` makes its button the page's one primary.
function CreateAccount({
  disabled,
  onCode,
  invite,
  title = 'Create an account',
  description,
  action = 'Create account',
  primary = false
}: {
  disabled: boolean
  onCode: (code: string, network?: string) => void
  invite?: string
  title?: string
  description: string
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
    <div className={panel}>
      <Section id="way-new" title={title} description={description}>
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
      </Section>
    </div>
  )
}

// What `/auth/invite` answers for an invite link: the network it's for, and whether the daily clearing
// clears it, as the guest network or one only guests own (ADR 0008); or why it can't be used.
type InviteAnswer = { network: string; clearedDaily: boolean } | { error: string }

// The invite page: the link's token is in the address's fragment, which the browser never sends, so
// the page reads it and posts it, then shows the answer (Invite). `memberName` is who's signed in, and
// `guestMember` whether it's the guest member every guest is signed in as.
export function InvitePage({ memberName, guestMember = false }: { memberName: string | null; guestMember?: boolean }) {
  const [token] = useState(() => window.location.hash.slice(1))
  const [invite, setInvite] = useState<InviteAnswer | null>(null)
  // Another link opened in this tab changes only the fragment, which loads no page: load it.
  useEffect(() => {
    const reload = () => window.location.reload()
    window.addEventListener('hashchange', reload)
    return () => window.removeEventListener('hashchange', reload)
  }, [])
  useEffect(() => {
    send<{ network: string; clearedDaily: boolean }>('/auth/invite', { token }).then(
      (open) => {
        document.title = `Join ${open.network} · Crossfeed`
        setInvite(open)
      },
      (err: Error) => setInvite({ error: err.message })
    )
  }, [token])
  return <Invite token={token} invite={invite} memberName={memberName} guestMember={guestMember} />
}

// The invite page for the link's `token`, once `/auth/invite` has answered (`invite`, null until then):
// it names the network, says when the daily clearing clears it, as the guest network or one only guests
// own, then lets a signed-in member join, or anyone else create an account or sign in, and join in the same
// step. A guest (`guestMember`) is told to sign out and create an account to join (ADR 0008).
export function Invite({
  token,
  invite,
  memberName,
  guestMember = false
}: {
  token: string
  invite: InviteAnswer | null
  memberName: string | null
  guestMember?: boolean
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
        {invite.clearedDaily && (
          <p className="max-w-[48ch] type-body">
            {invite.network} belongs to the guest account every guest shares, so it’s cleared, with everything in it,
            every day at {GUEST_NETWORK_CLEARS}.
          </p>
        )}
        {supported === false && !memberName && (
          <p className="max-w-[48ch]">
            <StateLine kind="error" role="alert">
              This browser can’t use passkeys. Open the link in a current Chrome, Safari, Edge, or Firefox.
            </StateLine>
          </p>
        )}
      </Lede>
      {guestMember ? (
        <GuestCantJoin network={invite.network} />
      ) : memberName ? (
        <JoinAs name={memberName} network={invite.network} join={join} />
      ) : (
        <div className={ways}>
          <CreateAccount
            disabled={supported === false}
            invite={token}
            description={`Your new account joins ${invite.network} as soon as it’s made.`}
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

// A guest can't join: the guest member, every guest's, joins no network, so they sign out, and the page
// opens on the invite again, to create an account and join with it.
function GuestCantJoin({ network }: { network: string }) {
  return (
    <div className={panel}>
      <Section
        id="way-join"
        title={`Join ${network}`}
        description="You’re signed in as Guest, the one account every guest shares, which can’t join a network."
      >
        <SignOut className="w-full" then={() => window.location.reload()}>
          Sign out and create an account
        </SignOut>
      </Section>
    </div>
  )
}

// A signed-in member joins as themselves, in one step, or signs out to join with another account.
function JoinAs({ name, network, join }: { name: string; network: string; join: () => Promise<void> }) {
  const { busy, error, run } = useAction()
  return (
    <div className={panel}>
      <Section id="way-join" title={`Join ${network}`} description={`You’re signed in as ${name}.`}>
        <Button className="w-full" disabled={busy} onClick={() => void run(join)}>
          {busy && <Spinner data-icon="inline-start" />}
          {busy ? 'Joining…' : `Join ${network}`}
        </Button>
        <Alert error={error} />
        <p className="text-muted-foreground">
          Not {name}?{' '}
          <SignOut
            variant="link"
            // The link's fragment stays in the address, so the page opens on the invite again, signed out.
            then={() => window.location.reload()}
          >
            Sign out
          </SignOut>{' '}
          to join with another account.
        </p>
      </Section>
    </div>
  )
}
