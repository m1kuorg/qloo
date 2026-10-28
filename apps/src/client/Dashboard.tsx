import { cn } from 'cn'
import { CheckIcon, EllipsisIcon } from 'lucide-react'
import { useRef, useState, type ReactNode, type RefObject } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { linkVariants } from '@/components/ui/variants'
import type { LaunchInput, LaunchSummary, Show, State } from '../agent'
import type { Inbox } from '../inbox'
import { dollars } from '../order'
import { Alert, day, ScrollTable, send, useAction } from './controls'
import { OnAir } from './Frame'
import { launchTitle, useLaunchFields } from './LaunchFields'
import { NetworkGate, useNetwork, type NetworkPage } from './NetworkPage'
import { connectionOf, ConnectionState, endedBadly, isLive, stateLabel, StateLine, type Connection } from './states'

// What the setup checklist reads from the directory rather than the agent: whether anyone has been
// invited or has joined, and whether an API key was ever created.
export type Setup = { invited: boolean; apiKey: boolean }

export function DashboardPage(props: { agentPath: string; network: NetworkPage; memberId: string; setup: Setup }) {
  const agent = useNetwork(props.agentPath)
  return (
    <NetworkGate agent={agent} network={props.network}>
      <Dashboard
        {...props}
        state={agent.state}
        connection={connectionOf(agent)}
        dismiss={() => agent.stub.dismissChecklist()}
        createLaunch={(input) => agent.stub.createLaunch(input)}
      />
    </NetworkGate>
  )
}

// The network's home, which answers "Which launches need me?": the title row with the launches'
// counts and New launch, the launches grouped by who's blocked, and beside them (under them below
// 1024px) a line each for the roster, the inbox and the CPM, and the setup checklist. Tests render
// it from a network agent's synced state; `state` is undefined until it arrives. At 1440 the grid is
// 56 (rail) + 24 + 992 (table) + 24 + 320 + 24 = 1440.
export function Dashboard({
  state,
  connection = { lost: null, reconnecting: false },
  network,
  memberId,
  setup,
  dismiss,
  createLaunch
}: {
  state: State | undefined
  connection?: Connection
  network: NetworkPage
  memberId: string
  setup: Setup
  dismiss: () => Promise<unknown>
  createLaunch: (input: LaunchInput) => Promise<{ id: string }>
}) {
  const launches = state?.launches ?? []
  // New launch's dialog, which the title row, the empty table and the checklist open.
  const [planning, setPlanning] = useState(false)
  const plan = () => setPlanning(true)
  // Where focus goes once a launch it was on is deleted.
  const heading = useRef<HTMLHeadingElement>(null)
  return (
    <main className="flex min-w-0 flex-col gap-6 px-4 pt-6 pb-10 lg:px-6" aria-busy={!state || undefined}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="type-title" id="launches-h" ref={heading} tabIndex={-1}>
            Launches
          </h1>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 type-caption text-muted-foreground">
            {state && <span>{countsLine(launches)}</span>}
            {/* Always there, so a screen reader hears the line as it appears. */}
            <span role="status">
              {state ? (
                <ConnectionState connection={connection} />
              ) : (
                <StateLine kind="loading">Connecting to the network…</StateLine>
              )}
            </span>
          </p>
        </div>
        <Button onClick={plan} disabled={!state}>
          New launch
        </Button>
      </div>
      <NewLaunch network={network} create={createLaunch} open={planning} setOpen={setPlanning} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {state ? <Launches launches={launches} network={network} plan={plan} heading={heading} /> : <LaunchesLoading />}
        <div className="flex min-w-0 flex-col gap-6">
          {state ? (
            <>
              <NetworkLines state={state} network={network} />
              {!state.checklistDismissed?.includes(memberId) && (
                <Checklist state={state} network={network} setup={setup} dismiss={dismiss} plan={plan} />
              )}
            </>
          ) : (
            <>
              <Skeleton className="h-36 rounded-xl" />
              <Skeleton className="h-64 rounded-xl" />
            </>
          )}
        </div>
      </div>
    </main>
  )
}

// The launches by who's blocked, in the order a member works through them: the launches that need a
// person (a question waiting, an order to approve, a run that failed or stopped, each status word
// saying which), then those running, ranked without an order, not run yet, and approved.
const GROUPS: { name: string; statuses: LaunchSummary['status'][] }[] = [
  { name: 'Needs you', statuses: ['waiting', 'order drafted', 'failed', 'stopped'] },
  { name: 'Running', statuses: ['running'] },
  { name: 'Ranked', statuses: ['ranked'] },
  { name: 'Not run yet', statuses: ['new'] },
  { name: 'Approved', statuses: ['order approved'] }
]

// The groups that have launches, each latest run first. The agent lists launches newest first, and
// the sort is stable, so launches not run yet stay newest first and rows don't swap while nothing
// about them changes.
function grouped(launches: LaunchSummary[]) {
  const latest = (l: LaunchSummary) => (l.lastRun ? Date.parse(l.lastRun) : -Infinity)
  return GROUPS.map((g) => ({
    name: g.name,
    rows: launches.filter((l) => g.statuses.includes(l.status)).sort((a, b) => latest(b) - latest(a))
  })).filter((g) => g.rows.length > 0)
}

// The title row's counts: "2 need you · 1 running · 4 launches".
function countsLine(launches: LaunchSummary[]) {
  const needs = launches.filter((l) => GROUPS[0].statuses.includes(l.status)).length
  const running = launches.filter((l) => l.status === 'running').length
  return [
    needs > 0 && `${needs} ${needs === 1 ? 'needs' : 'need'} you`,
    running > 0 && `${running} running`,
    count(launches.length, 'launch', 'launches')
  ]
    .filter(Boolean)
    .join(' · ')
}

// The dashboard's decision: a new launch, named or from comps, in a dialog; created, it opens on its
// own page. A refusal, such as the network's 100-launch limit, stays in the dialog.
function NewLaunch({
  network,
  create,
  open,
  setOpen
}: {
  network: NetworkPage
  create: (input: LaunchInput) => Promise<{ id: string }>
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const form = useLaunchFields(null)
  const { busy, error, run } = useAction()
  const fields = useRef<HTMLFormElement>(null)
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    void run(async () => location.assign(`${network.links.launches}/${(await create(form.input)).id}`))
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* It opens on the launch's name, past the kind already chosen. */}
      <DialogContent initialFocus={() => fields.current?.querySelector<HTMLElement>('[data-slot=input]') ?? true}>
        <DialogHeader>
          <DialogTitle>New launch</DialogTitle>
          <DialogDescription>
            Name a released launch, or up to three comps for an unreleased one. It opens on its own page, where a run
            ranks the roster against it.
          </DialogDescription>
        </DialogHeader>
        <form id="new-launch" ref={fields} className="flex flex-col gap-3" onSubmit={submit}>
          {form.fields(busy, true)}
          <Alert error={error} />
        </form>
        <DialogFooter>
          <DialogClose render={<Button variant="secondary" />}>Cancel</DialogClose>
          <Button type="submit" form="new-launch" disabled={busy || !form.ready}>
            {busy && <Spinner data-icon="inline-start" />}
            {busy ? 'Creating…' : 'Create launch'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// What the dashboard calls each status.
const statusLabel: Record<LaunchSummary['status'], string> = {
  new: 'New',
  running: 'Running',
  waiting: 'Waiting',
  ranked: 'Ranked',
  'order drafted': 'Order drafted',
  'order approved': 'Order approved',
  failed: 'Failed',
  stopped: 'Stopped'
}

// A status in a word, after its glyph, in a slot every row keeps so the words line up: the on-air dot
// while a run is running or waiting on a person, an ink check on an approved order, and on a failed
// or stopped run the square ✕ with the word in crimson. The word sits on the text's baseline and the
// slot is centred on the line, so what's in the slot, or nothing, never moves the word; it doesn't wrap,
// so a second line never starts under the slot.
function Status({ status }: { status: LaunchSummary['status'] }) {
  if (endedBadly(status))
    return (
      <StateLine kind="error" word={statusLabel[status]}>
        {null}
      </StateLine>
    )
  const live = isLive(status)
  return (
    <span className="whitespace-nowrap">
      <span
        className="mr-1.5 inline-flex size-[1em] shrink-0 items-center justify-center align-middle"
        aria-hidden="true"
        data-mark={live ? 'live' : status === 'order approved' ? 'approved' : undefined}
      >
        {live && <OnAir live />}
        {status === 'order approved' && <CheckIcon className="size-[1em]" />}
      </span>
      {statusLabel[status]}
    </span>
  )
}

// A launch's finalists: a five-step meter in signal, what the agent puts forward, then the count,
// which says it, so the meter is hidden from screen readers. A launch not yet ranked has none, and its
// cell is empty.
function Finalists({ n }: { n: number }) {
  if (n === 0) return null
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex items-end gap-0.5" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((step) => (
          <span key={step} className={cn('h-3 w-1 rounded-[1px]', step > n ? 'bg-border' : 'bg-signal')} />
        ))}
      </span>
      <span className="tabular-nums">{n}</span>
    </span>
  )
}

// Every launch with its status and plan, grouped by who's blocked, each opening its page; until
// there's one, the table's frame with a sentence saying so. An unreleased launch goes by its comps.
// Any member can delete one from its row's menu, after a yes in the confirm dialog; it then leaves
// every member's list as the network's agent drops it.
function Launches({
  launches,
  network,
  plan,
  heading
}: {
  launches: LaunchSummary[]
  network: NetworkPage
  plan: () => void
  heading: RefObject<HTMLHeadingElement | null>
}) {
  // The launch the confirm dialog asks about, kept while it closes so its words don't empty.
  const [asking, setAsking] = useState<LaunchSummary | null>(null)
  const [confirming, setConfirming] = useState(false)
  const deleted = useRef(false)
  const { busy, error, run } = useAction()
  const remove = (id: string) =>
    run(async () => {
      await send(`${network.links.launches}/${id}/delete`)
      deleted.current = true
      setConfirming(false)
    })
  const ask = (launch: LaunchSummary) => {
    deleted.current = false
    setAsking(launch)
    setConfirming(true)
  }
  const askingTitle = asking && launchTitle(asking.name, asking.comps)
  return (
    <>
      <LaunchesTable>
        {launches.length === 0 ? (
          <tbody>
            <tr>
              <td colSpan={7} className="border-b py-4 pl-2">
                <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                  <p className="max-w-[60ch] text-muted-foreground">
                    No launches yet. Each launch you plan is listed here with its status, finalists, promo slots, and
                    their slot value.
                  </p>
                  <Button variant="secondary" onClick={plan}>
                    New launch
                  </Button>
                </div>
              </td>
            </tr>
          </tbody>
        ) : (
          grouped(launches).map((group) => (
            <tbody key={group.name}>
              <tr>
                <th colSpan={7} scope="rowgroup" className="rounded-lg bg-muted py-1.5 pl-2 text-left font-normal">
                  <span className="sticky left-2">
                    <span className="font-semibold">{group.name}</span>{' '}
                    <span className="text-muted-foreground tabular-nums">{group.rows.length}</span>
                  </span>
                </th>
              </tr>
              {group.rows.map((l) => (
                <LaunchRow key={l.id} launch={l} href={`${network.links.launches}/${l.id}`} ask={() => ask(l)} />
              ))}
            </tbody>
          ))
        )}
      </LaunchesTable>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        {/* Deleted, its row and menu are gone, so focus goes to the page's heading. */}
        <AlertDialogContent finalFocus={() => (deleted.current ? heading.current : true)}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {askingTitle} for everyone in {network.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {asking?.status === 'order approved' && 'Its approved insertion order can’t be exported after. '}
              Its runs and their evidence go with it, and can’t be brought back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Alert error={error} />
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => asking && void remove(asking.id)}>
              {busy && <Spinner data-icon="inline-start" />}
              {busy ? 'Deleting…' : 'Delete launch'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// The launches table's frame and head: a real table, its rules bleeding 8px past the text as the
// roster's do, figures right-aligned; narrower than the table, it scrolls in its region with the
// launch's column held at the left, ruled where they meet. Under 1024px its columns tighten and a run's
// starter goes under its day, so at 768px the whole table, its row menus included, fits the canvas.
const head = 'border-b pb-2 pl-3 text-left align-bottom font-normal'
const cell = 'border-b py-3 pl-3 align-top'
const held = 'sticky left-0 bg-background pl-2 max-lg:border-r max-lg:pr-3'
function LaunchesTable({ children }: { children: React.ReactNode }) {
  return (
    <ScrollTable label="Launches table" className="-mx-2 max-w-none">
      {/* Positioned, so the visually hidden "Actions" scrolls and clips with the table, not the page. */}
      <table className="relative w-full min-w-[43rem] border-separate border-spacing-0 lg:min-w-[46rem]">
        <thead className="type-caption text-muted-foreground">
          <tr>
            <th scope="col" className={cn(head, held)}>
              Launch
            </th>
            <th scope="col" className={cn(head, 'w-36')}>
              Status
            </th>
            <th scope="col" className={cn(head, 'w-20 text-right lg:w-24')}>
              Finalists
            </th>
            <th scope="col" className={cn(head, 'w-16 text-right')}>
              Slots
            </th>
            <th scope="col" className={cn(head, 'w-20 text-right lg:w-24')}>
              Slot value
            </th>
            <th scope="col" className={cn(head, 'w-32 lg:w-48')}>
              Last run
            </th>
            <th scope="col" className={cn(head, 'w-12 pr-2')}>
              <span className="vh">Actions</span>
            </th>
          </tr>
        </thead>
        {children}
      </table>
    </ScrollTable>
  )
}

function LaunchRow({ launch: l, href, ask }: { launch: LaunchSummary; href: string; ask: () => void }) {
  const title = launchTitle(l.name, l.comps)
  return (
    <tr data-status={l.status}>
      <th scope="row" className={cn(cell, held, 'min-w-36 text-left font-normal lg:min-w-44')}>
        <a
          className="text-[15px] leading-snug font-semibold decoration-1 underline-offset-4 hover:underline"
          href={href}
        >
          {title}
        </a>
        {l.name === null && <span className="block type-caption text-muted-foreground">Unreleased, from comps</span>}
      </th>
      <td className={cell}>
        <Status status={l.status} />
      </td>
      <td className={cn(cell, 'text-right')}>
        <Finalists n={l.finalists} />
      </td>
      <td className={cn(cell, 'text-right tabular-nums')}>{l.slots}</td>
      <td className={cn(cell, 'text-right')}>{l.slotValue !== null && dollars(l.slotValue)}</td>
      <td className={cn(cell, 'text-muted-foreground')}>
        {l.lastRun && (
          <>
            {day(l.lastRun)}
            {l.startedBy && (
              <span className="max-lg:block">
                <span className="max-lg:hidden"> · </span>
                {l.startedBy}
              </span>
            )}
          </>
        )}
      </td>
      <td className={cn(cell, 'py-2 pr-2 text-right')}>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />} aria-label={`Actions for ${title}`}>
            <EllipsisIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem variant="destructive" onClick={ask}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  )
}

// Until the agent's first state arrives: the table's frame with rows in the shape they'll fill.
function LaunchesLoading() {
  return (
    <LaunchesTable>
      <tbody>
        {[0, 1, 2].map((i) => (
          <tr key={i}>
            <td colSpan={7} className="border-b py-3 pl-2">
              <Skeleton className="h-5" />
            </td>
          </tr>
        ))}
      </tbody>
    </LaunchesTable>
  )
}

// One line each for the roster, the inbox, and the CPM, with where to change them. The CPM is labelled
// sample while it's still the sample network's, as the guest network's starts (ADR 0007).
function NetworkLines({ state, network }: { state: State; network: NetworkPage }) {
  const rows: [string, ReactNode, string, string][] = [
    ['Roster', rosterLine(state.roster), network.links.roster, 'Open']
  ]
  if (network.links.inbox) rows.push(['Inbox', inboxLine(state.inbox), network.links.inbox, 'Open'])
  rows.push([
    'CPM',
    state.cpm === null ? (
      'Not set'
    ) : (
      <>
        {dollars(state.cpm)} per 1,000 downloads {state.sample?.cpm && <Badge>sample</Badge>}
      </>
    ),
    network.links.settings,
    network.role === 'owner' ? (state.cpm === null ? 'Set' : 'Change') : 'View'
  ])
  return (
    <section className="flex flex-col gap-3 rounded-xl bg-card p-4" aria-labelledby="network-h">
      <h2 className="font-semibold" id="network-h">
        Network
      </h2>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 gap-y-2">
        {rows.map(([label, line, href, go]) => (
          <div key={label} className="col-span-full grid grid-cols-subgrid">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0">{line}</dd>
            <dd>
              <a
                className={linkVariants()}
                href={href}
                aria-label={`${go} ${label === 'CPM' ? 'the CPM' : `the ${label.toLowerCase()}`}`}
              >
                {go}
              </a>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

// The roster in a line: how many shows matched in Qloo, and how many need settling.
function rosterLine(roster: Show[]) {
  if (roster.length === 0) return 'No shows yet'
  const n = (...of: Show['resolution'][]) => roster.filter((s) => of.includes(s.resolution)).length
  const pending = n('pending')
  if (pending) return `Looking up ${pending} of ${count(roster.length, 'show')} in Qloo…`
  return `${count(roster.length, 'show')}: ${parts([
    [n('resolved', 'mapped'), 'matched'],
    [n('ambiguous'), 'to settle'],
    [n('missed'), 'not in Qloo'],
    [n('failed'), 'lookup failed', 'lookups failed']
  ])}`
}

// The inbox in a line: how many pitches, how their works matched, and how many were set aside, in the
// inbox check's terms.
function inboxLine(inbox: Inbox | null) {
  if (!inbox || inbox.pitches.length === 0) return 'No pitches loaded'
  const { pitches } = inbox
  if (inbox.status === 'reading') return `Reading ${count(pitches.length, 'pitch', 'pitches')}…`
  const n = (label: string) => pitches.filter((p) => stateLabel(p) === label).length
  return `${count(pitches.length, 'pitch', 'pitches')}: ${parts([
    [n('Matched'), 'matched'],
    [n('Ambiguous'), 'to confirm'],
    [n('Not in Qloo'), 'not in Qloo'],
    [n('Lookup failed'), 'lookup failed', 'lookups failed'],
    [n('Set aside'), 'set aside'],
    [n('Unreadable'), 'unreadable'],
    [n('Failed'), 'failed']
  ])}`
}

const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`
// The counts that aren't 0, as a list: "16 matched, 1 to settle".
const parts = (counts: [number, string, string?][]) =>
  counts
    .filter(([n]) => n > 0)
    .map(([n, one, many = one]) => `${n} ${n === 1 ? one : many}`)
    .join(', ')

// What a new network needs, ticked off from its agent's state and the directory as each arrives, as
// a numbered list. A member can dismiss it for themselves; it stays for everyone else.
function Checklist({
  state,
  network,
  setup,
  dismiss,
  plan
}: {
  state: State
  network: NetworkPage
  setup: Setup
  dismiss: () => Promise<unknown>
  plan: () => void
}) {
  const { error, run } = useAction()
  const owner = network.role === 'owner'
  const { roster, settings } = network.links
  // A step links where it's done only for a member who can do it there; planning a launch opens New
  // launch's dialog.
  const items: { title: string; how: string; go: string | (() => void) | null; done: boolean }[] = [
    {
      title: 'Import the roster',
      how: 'Paste your shows’ names, or upload the roster’s CSV, and Crossfeed finds each one in Qloo.',
      go: roster,
      done: state.roster.length > 0
    },
    {
      title: 'Set the CPM',
      how: owner
        ? 'Your CPM prices every promo slot. Set it in settings.'
        : 'Your CPM prices every promo slot. An owner sets it in settings.',
      go: owner ? settings : null,
      done: state.cpm !== null
    },
    {
      title: 'Plan a launch',
      how: 'Name a released launch, or up to three comps for an unreleased one, and Crossfeed ranks the roster against it.',
      go: plan,
      done: (state.launches?.length ?? 0) > 0
    },
    {
      title: 'Invite a teammate',
      how: owner
        ? 'Make an invite link in settings and send it to them. It works once, for seven days.'
        : 'An owner makes invite links in settings.',
      go: owner ? settings : null,
      done: setup.invited
    },
    {
      title: 'Create an API key',
      how: owner
        ? 'Make a key in settings for a script or an assistant to act for the network, short of approving anything.'
        : 'An owner makes API keys in settings, for scripts and assistants.',
      go: owner ? settings : null,
      done: setup.apiKey
    }
  ]
  const done = items.filter((i) => i.done).length
  return (
    <section className="flex flex-col gap-3 rounded-xl bg-card p-4" aria-labelledby="setup-h" data-checklist>
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold" id="setup-h">
          Setup{' '}
          <span className="font-normal whitespace-nowrap text-muted-foreground">
            · {done === items.length ? 'Done' : `${done} of ${items.length} done`}
          </span>
        </h2>
        <Button variant="ghost" size="sm" className="-my-1 -mr-1.5" onClick={() => void run(dismiss)}>
          Dismiss
        </Button>
      </div>
      {/* The steps' numbers are the list's own, so a screen reader hears "3 of 5" too. */}
      <ol className="flex list-outside list-decimal flex-col gap-3 pl-5 marker:text-muted-foreground marker:normal-nums">
        {items.map((item) => (
          <li key={item.title} data-done={item.done || undefined}>
            {item.done || !item.go ? (
              <span className={item.done ? 'text-muted-foreground' : 'font-medium'}>{item.title}</span>
            ) : typeof item.go === 'string' ? (
              <a className={linkVariants()} href={item.go}>
                {item.title}
              </a>
            ) : (
              <button type="button" className={linkVariants({ className: 'cursor-pointer' })} onClick={item.go}>
                {item.title}
              </button>
            )}
            {item.done ? (
              <span className="flex items-center gap-1 type-caption">
                <CheckIcon aria-hidden="true" className="size-3.5" />
                Done
              </span>
            ) : (
              <span className="block type-caption text-muted-foreground">{item.how}</span>
            )}
          </li>
        ))}
      </ol>
      <Alert error={error} />
    </section>
  )
}
