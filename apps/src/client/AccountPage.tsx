import { startRegistration } from '@simplewebauthn/browser'
import { useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { linkVariants } from '@/components/ui/variants'
import type { AccountNetwork, AccountPasskey } from '../directory'
import { initials, listOf, MAX_NAME } from '../text'
import { useConfirm } from './Confirm'
import { Alert, day, ScrollTable, send, useAction, useLeaveGuard } from './controls'
import { prompted, RecoveryCode, sendConfirmed, useCodeAsk, type Ceremony } from './Passkeys'
import { cell, Done, head, Module, settingsColumn } from './settings/Module'
import { StateLine } from './states'

// The member's account page, at /app/account: their name, their passkeys, a new recovery code, their
// sessions, their networks, and deleting the account, one module per job in the settings' grammar.
// A recovery code signs a member in here (`recovered`), to add a passkey for the device they're on.
// Every destructive change confirms first; one that needs the member to confirm it's them (step-up)
// asks once the confirm has closed, never over it. A guest member's page (`guest`) says their account is
// temporary until their first passkey keeps it, which shows its recovery code once, as a sign-up does
// (ADR 0006).
export function AccountPage({
  name,
  passkeys,
  sessions,
  networks,
  recovered,
  guest = false
}: {
  name: string
  passkeys: AccountPasskey[]
  sessions: number
  networks: AccountNetwork[]
  recovered: boolean
  guest?: boolean
}) {
  // A new recovery code to show once, until the member says they've saved it.
  const [code, setCode] = useState<string | null>(null)
  if (code) return <RecoveryCode code={code} next="/app/account" frame={codeFrame} />
  const onlyOwner = networks.filter((n) => n.onlyOwner).map((n) => n.name)
  return (
    <main className={settingsColumn}>
      <h1 className="type-title">Account</h1>
      <div className="flex flex-col gap-12">
        <NameModule name={name} />
        <PasskeysModule listed={passkeys} recovered={recovered} guest={guest} onKept={setCode} />
        <RecoveryModule onCode={setCode} guest={guest} />
        <SessionsModule sessions={sessions} guest={guest} />
        <NetworksModule networks={networks} onlyOwner={onlyOwner} />
        <DeleteModule onlyOwner={onlyOwner} />
      </div>
    </main>
  )
}

// The recovery code screen in the app's canvas: two columns from 1024px on the new network page's
// centred measure.
const codeFrame =
  'mx-auto grid w-full max-w-[1152px] items-start gap-8 px-4 pt-10 pb-16 lg:grid-cols-2 lg:gap-12 lg:px-6 lg:pt-20'

function NameModule({ name: saved }: { name: string }) {
  const [name, setName] = useState(saved)
  const [kept, setKept] = useState(saved)
  const [done, setDone] = useState(false)
  const { busy, error, run } = useAction()
  const changed = name.trim() !== kept
  // Typed and not saved: leaving the page asks first.
  useLeaveGuard(changed)
  const save = () =>
    run(async () => {
      const answer = await send<{ name: string }>('/app/account/name', { name })
      setKept(answer.name)
      setName(answer.name)
      setDone(true)
      // The account menu is the server's: it shows the new name, and its avatar the new initials,
      // without a reload.
      document.querySelectorAll('[data-signed-in]').forEach((el) => (el.textContent = answer.name))
      document.querySelectorAll('[data-initials]').forEach((el) => (el.textContent = initials(answer.name)))
    })
  return (
    <Module
      id="acct-name-h"
      title="Name"
      help="How your teammates see you in every network you’re in, on its members, its runs, and the orders you approve."
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          setDone(false)
          void save()
        }}
      >
        <Field>
          <FieldLabel htmlFor="acct-name">Your name</FieldLabel>
          <Input
            id="acct-name"
            className="max-w-sm"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setDone(false)
            }}
            autoComplete="name"
            maxLength={MAX_NAME}
            required
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy || !name.trim() || !changed}>
            {busy && <Spinner data-icon="inline-start" />}
            {busy ? 'Saving…' : 'Save'}
          </Button>
          <Done shown={done && !changed}>Saved.</Done>
        </div>
        <Alert error={error} />
      </form>
    </Module>
  )
}

// A guest member's first passkey keeps their account, and its answer has their recovery code, for
// `onKept` to show.
function PasskeysModule({
  listed,
  recovered,
  guest,
  onKept
}: {
  listed: AccountPasskey[]
  recovered: boolean
  guest: boolean
  onKept: (code: string) => void
}) {
  const [passkeys, setPasskeys] = useState(listed)
  // The passkey just added.
  const [added, setAdded] = useState<string | null>(null)
  const { busy, error, run } = useAction()
  const heading = useRef<HTMLHeadingElement>(null)
  const { confirm, dialog } = useConfirm(heading)
  const code = useCodeAsk('acct-keys-code')
  const only = passkeys.length === 1

  const add = () =>
    run(async () => {
      const { challenge, options } = await sendConfirmed<Ceremony>('/auth/passkeys/options', code.ask)
      const response = await prompted(
        () => startRegistration({ optionsJSON: options }),
        'The passkey prompt closed before a passkey was made. Try again when you’re ready.',
        'This device or password manager already keeps a passkey for your account. Add one from another device.'
      )
      const answer = await send<{ passkeys: AccountPasskey[]; recoveryCode?: string }>('/auth/passkeys', {
        challenge,
        response
      })
      if (answer.recoveryCode) return onKept(answer.recoveryCode)
      setAdded(answer.passkeys.find((p) => !passkeys.some((q) => q.id === p.id))?.id ?? null)
      setPasskeys(answer.passkeys)
    })
  const askRemove = (p: AccountPasskey) =>
    confirm({
      title: `Remove the passkey from ${p.label}, added ${addedAt(p, passkeys)}?`,
      consequence: 'It won’t sign you in again.',
      verb: 'Remove',
      busy: 'Removing…',
      keep: 'Keep',
      action: async () =>
        setPasskeys((await send<{ passkeys: AccountPasskey[] }>(`/app/account/passkeys/${p.id}/remove`)).passkeys)
    })
  // What a recovery code's sign-in, or a guest's temporary account, asks for, so it's the page's one
  // primary until it's done.
  const asked = (recovered || guest) && !added

  return (
    <Module
      id="acct-keys-h"
      title="Passkeys"
      heading={heading}
      help="Each passkey signs you in from the device or password manager that keeps it. Keep one on a second device, so losing one doesn’t lock you out."
    >
      {asked && (
        <p role="status" className="rounded-lg bg-card p-3">
          {guest
            ? 'Your account is temporary: as a guest’s, it lasts a day from when you signed in. Add a passkey to keep it, with the networks you own; you get a recovery code with it.'
            : 'You signed in with your recovery code. Add a passkey for this device now, so you can sign in without a code next time.'}
        </p>
      )}
      {passkeys.length === 0 ? (
        <p>
          <StateLine kind="empty">No passkeys yet.</StateLine>
        </p>
      ) : (
        /* Narrower than its columns, as on a phone, it scrolls in its region rather than crowd them. */
        <ScrollTable label="Passkeys table">
          <table className="relative w-full min-w-[24rem] border-separate border-spacing-0">
            <thead className="type-caption text-muted-foreground">
              <tr>
                <th scope="col" className={head}>
                  Passkey
                </th>
                <th scope="col" className={head}>
                  Added
                </th>
                <th scope="col" className={head}>
                  Last used
                </th>
                <th scope="col" className={head}>
                  <span className="vh">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {passkeys.map((p) => (
                <tr key={p.id}>
                  <th scope="row" className={`${cell} text-left font-medium`}>
                    <span className="inline-flex flex-wrap items-center gap-2">
                      {p.label}
                      {added === p.id && <Badge variant="outline">New</Badge>}
                    </span>
                  </th>
                  <td className={`${cell} whitespace-nowrap`}>{addedAt(p, passkeys)}</td>
                  <td className={`${cell} whitespace-nowrap text-muted-foreground`}>
                    {p.lastUsed === null ? 'Never' : day(p.lastUsed)}
                  </td>
                  <td className={`${cell} pr-0 text-right`}>
                    <Button variant="ghost" size="sm" disabled={busy || only} onClick={() => askRemove(p)}>
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
      )}
      {only && <p className="text-muted-foreground">Your only passkey can’t be removed: add another first.</p>}
      <div>
        <Button variant={asked ? 'default' : 'secondary'} disabled={busy} onClick={() => void add()}>
          {busy && <Spinner data-icon="inline-start" />}
          {code.asking ? 'Confirming…' : busy ? 'Waiting for your passkey…' : 'Add a passkey'}
        </Button>
      </div>
      <Alert error={error} />
      <p className="text-muted-foreground">
        Your browser asks where to keep it: on this device, a phone nearby, or your password manager.
        {/* A guest's first passkey asks no step-up (ADR 0006). */}
        {!guest && ' If you haven’t confirmed it’s you in the last five minutes, Crossfeed asks you to first.'}
      </p>
      {code.form}
      {dialog}
    </Module>
  )
}

// When a passkey was added: the day, and the time too when another from the same browser was added
// that day, so the two read apart.
function addedAt(p: AccountPasskey, all: AccountPasskey[]) {
  const twin = all.some((q) => q.id !== p.id && q.label === p.label && day(q.created) === day(p.created))
  if (!twin) return day(p.created)
  return `${day(p.created)}, ${new Date(p.created).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
}

// A guest member has no recovery code until their first passkey brings one.
function RecoveryModule({ onCode, guest }: { onCode: (code: string) => void; guest: boolean }) {
  return (
    <Module
      id="acct-code-h"
      title="Recovery code"
      help="If you lose every passkey, your recovery code signs you in once. Crossfeed keeps no copy it can read."
    >
      {guest ? <p>You get your recovery code with your first passkey.</p> : <RenewCode onCode={onCode} />}
    </Module>
  )
}

function RenewCode({ onCode }: { onCode: (code: string) => void }) {
  const { busy, error, run } = useAction()
  const code = useCodeAsk('acct-code-code')
  const renew = () =>
    run(async () =>
      onCode((await sendConfirmed<{ recoveryCode: string }>('/app/account/recovery-code', code.ask)).recoveryCode)
    )
  return (
    <>
      <div>
        <Button variant="secondary" disabled={busy} onClick={() => void renew()}>
          {busy && <Spinner data-icon="inline-start" />}
          {code.asking ? 'Confirming…' : busy ? 'Working…' : 'Get a new recovery code'}
        </Button>
      </div>
      <Alert error={error} />
      <p className="text-muted-foreground">
        For a code you’ve lost, or one someone else may have seen: your old code stops working, and the new one shows
        once. If you haven’t confirmed it’s you in the last five minutes, Crossfeed asks you to first.
      </p>
      {code.form}
    </>
  )
}

// A guest member's session is their only way in, until a passkey keeps the account.
function SessionsModule({ sessions, guest }: { sessions: number; guest: boolean }) {
  const { confirm, dialog } = useConfirm()
  const askSignOut = () =>
    confirm({
      title: 'Sign out of every browser, this one too?',
      consequence: guest
        ? 'Your open pages close, and with no passkey, you can’t sign in to this account again.'
        : 'Your open pages close, and each browser needs your passkey again.',
      verb: 'Sign out everywhere',
      busy: 'Signing out…',
      keep: 'Stay signed in',
      action: async () => {
        await send('/app/account/sign-out-everywhere')
        window.location.assign('/sign-in')
      }
    })
  return (
    <Module
      id="acct-sessions-h"
      title="Sessions"
      help={
        guest
          ? 'As a guest, you’re signed in on this browser alone, for a day from when you signed in. Once you add a passkey, each browser you sign in on stays signed in for 30 days from the last time you use it.'
          : 'Each browser you sign in on stays signed in for 30 days from the last time you use it.'
      }
    >
      <p>
        You’re signed in on{' '}
        {sessions <= 1 ? '1 browser, this one.' : `${sessions.toLocaleString('en-US')} browsers, this one included.`}
      </p>
      <div>
        <Button variant="destructive" onClick={askSignOut}>
          Sign out everywhere
        </Button>
      </div>
      <p className="text-muted-foreground">
        For a lost or shared device: it’s signed out the next time it asks Crossfeed for anything.
      </p>
      {dialog}
    </Module>
  )
}

function NetworksModule({ networks, onlyOwner }: { networks: AccountNetwork[]; onlyOwner: string[] }) {
  const { confirm, dialog } = useConfirm()
  const askLeave = (n: AccountNetwork) =>
    confirm({
      title: `Leave ${n.name}?`,
      consequence: `Your open pages of it close${n.role === 'owner' ? ', the API keys and invite links you made in it are revoked' : ''}, and you’ll need a new invite to come back.`,
      verb: 'Leave',
      busy: 'Leaving…',
      keep: 'Stay',
      action: async () => {
        await send(`/app/${n.id}/settings/members/leave`)
        // The bar's switcher is the server's: a reload drops the network from it too.
        window.location.reload()
      }
    })
  return (
    <Module
      id="acct-networks-h"
      title="Networks"
      help="The networks you’re a member of, and your role in each. Leaving one closes your open pages of it."
    >
      {networks.length === 0 ? (
        <p>
          <StateLine kind="empty">You’re not in any network yet.</StateLine>{' '}
          <a className={linkVariants()} href="/app/new">
            Create a network
          </a>
        </p>
      ) : (
        <ScrollTable label="Your networks">
          <table className="relative w-full min-w-[20rem] border-separate border-spacing-0">
            <thead className="type-caption text-muted-foreground">
              <tr>
                <th scope="col" className={head}>
                  Network
                </th>
                <th scope="col" className={head}>
                  Role
                </th>
                <th scope="col" className={head}>
                  <span className="vh">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {networks.map((n) => (
                <tr key={n.id}>
                  <th scope="row" className={`${cell} text-left font-normal`}>
                    <a className={linkVariants()} href={`/app/${n.id}`}>
                      {n.name}
                    </a>
                  </th>
                  <td className={`${cell} whitespace-nowrap`}>{n.role === 'owner' ? 'Owner' : 'Member'}</td>
                  <td className={`${cell} pr-0 text-right`}>
                    <Button variant="ghost" size="sm" disabled={n.onlyOwner} onClick={() => askLeave(n)}>
                      Leave
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
      )}
      {onlyOwner.length > 0 && (
        <p className="text-muted-foreground">
          You’re the only owner of {listOf(onlyOwner)}. Make someone else an owner in its settings, or delete the
          network there, before you leave it or delete your account.
        </p>
      )}
      {dialog}
    </Module>
  )
}

function DeleteModule({ onlyOwner }: { onlyOwner: string[] }) {
  const { busy, error, run } = useAction()
  const code = useCodeAsk('acct-delete-code')
  const { confirm, dialog } = useConfirm()
  const blocked = onlyOwner.length > 0
  // The confirm closes first, then the change goes, asking the member to confirm it's them if it's
  // been over five minutes: the step-up never stacks on the confirm.
  const askDelete = () =>
    confirm({
      title: 'Delete your account?',
      consequence: 'You’re signed out everywhere, and it can’t be brought back.',
      verb: 'Delete account',
      busy: 'Deleting…',
      keep: 'Keep it',
      after: true,
      action: () =>
        run(async () => {
          await sendConfirmed('/app/account/delete', code.ask)
          window.location.assign('/')
        })
    })
  return (
    <Module
      id="acct-delete-h"
      title="Delete account"
      help="Deletes your account, passkeys, recovery code, and sessions, takes you out of every network, and revokes the API keys and invite links you made. What you did in your networks, and in those you left before, stays with them, such as the runs you started and the orders you approved, but under “Former member”, not your name."
    >
      <div>
        <Button variant="destructive" disabled={blocked || busy} onClick={askDelete}>
          {busy && <Spinner data-icon="inline-start" />}
          {code.asking ? 'Confirming…' : busy ? 'Deleting…' : 'Delete account'}
        </Button>
      </div>
      <Alert error={error} />
      {blocked && (
        <p className="text-muted-foreground">
          A network needs an owner: while you’re the only owner of {listOf(onlyOwner)}, your account stays.
        </p>
      )}
      {code.form}
      {dialog}
    </Module>
  )
}
