import { cn } from 'cn'
import { CheckIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { buttonVariants, linkVariants } from '@/components/ui/variants'
import type { LaunchInput, LaunchSummary, Show, State } from '../agent'
import type { Inbox } from '../inbox'
import { dollars } from '../order'
import { Alert, useAction } from './controls'
import { launchTitle, NewLaunch } from './LaunchFields'
import { LaunchStatus, needsYou } from './LaunchStatus'
import { NetworkGate, useNetwork, type NetworkPage } from './NetworkPage'
import { count, listCounts, PageEmpty, PageHeader, Section, useFormDialog } from './PageHeader'
import { connectionOf, pitchTally, StateLine, type Connection } from './states'

// What the setup checklist reads from the directory rather than the agent: whether anyone has been
// invited or has joined, and whether an API key was ever created.
export type Setup = { invited: boolean; apiKey: boolean }

export function DashboardPage(props: {
  agentPath: string
  network: NetworkPage
  memberId: string
  setup: Setup
  notice?: string
}) {
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

// Each of the dashboard's blocks is a `Section` on a card.
const card = 'rounded-xl bg-card p-4'

// The network's home, which answers "What needs me?": the header, its title badged sample while the
// network holds the sample data, the page's one sample label (ADR 0007); under it, a `notice` the
// server gave the page, as a reset of the guest network's sample data that's still finishing opens it
// with; then the blocks, each on a card. From 1024px they stand in two columns, the main one holding
// Needs you and the side one Setup, until this member dismisses it, over Network; under 1024px they
// stack in one, Setup first while it shows, then Needs you, then Network. Tests render it from a network
// agent's synced state; `state` is undefined until it arrives. At 1440 the grid is 56 (rail) + 24 +
// 992 + 24 + 320 + 24 = 1440.
export function Dashboard({
  state,
  connection = { lost: null, reconnecting: false },
  network,
  memberId,
  setup,
  notice,
  dismiss,
  createLaunch
}: {
  state: State | undefined
  connection?: Connection
  network: NetworkPage
  memberId: string
  setup: Setup
  notice?: string
  dismiss: () => Promise<unknown>
  createLaunch: (input: LaunchInput) => Promise<{ id: string }>
}) {
  // New launch's dialog, which Needs you's empty state and the checklist open.
  const planning = useFormDialog('New launch')
  // Setup's place, kept while the agent's state is on its way, since it shows until it's dismissed.
  const checklist = !state || !state.checklistDismissed?.includes(memberId)
  return (
    <main className="flex min-w-0 flex-col gap-6 px-4 pt-6 pb-10 lg:px-6" aria-busy={!state || undefined}>
      <PageHeader
        title="Dashboard"
        connection={state ? connection : null}
        badge={state?.sample && <Badge>sample</Badge>}
      />
      {notice && (
        <p className="max-w-[72ch]">
          <StateLine kind="slow" word={null}>
            {notice}
          </StateLine>
        </p>
      )}
      <NewLaunch network={network} create={createLaunch} dialog={planning} />
      {/* One column, as wide as the page and never wider, so a long name in a block is cut short or wraps
          rather than widening it. From 1024px, Needs you fills the main column across both rows, so
          neither column waits on the other's heights. In the side column the first row is Setup's and
          the last, which takes what height is left, Network's, or both once Setup is dismissed. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-[auto_1fr]">
        {checklist &&
          (state ? (
            <div className={cn(card, 'lg:col-start-2 lg:row-start-1')}>
              <Checklist state={state} network={network} setup={setup} dismiss={dismiss} plan={planning.show} />
            </div>
          ) : (
            <Skeleton className="h-64 rounded-xl lg:col-start-2 lg:row-start-1" />
          ))}
        <div className={cn(card, 'lg:col-start-1 lg:row-span-2 lg:row-start-1')}>
          <NeedsYou state={state} network={network} newLaunch={planning.button()} />
        </div>
        <div className={cn(card, 'lg:col-start-2', checklist ? 'lg:row-start-2' : 'lg:row-span-2 lg:row-start-1')}>
          <NetworkLines state={state} network={network} />
        </div>
      </div>
    </main>
  )
}

// Where a launch that needs a person is worked on: the plan's tab of its page for an order to approve,
// and otherwise its page, which opens on a waiting question and says why a run failed or stopped.
const workedOn = (launch: LaunchSummary, network: NetworkPage) =>
  `${network.links.launches}/${launch.id}${launch.status === 'order drafted' ? '#plan' : ''}`

// The launches waiting on a member, as the Launches page's first group lists them, latest run first,
// each row its link, with its status in a word. With none, it says so, with the next useful thing to
// do (`NextStep`).
function NeedsYou({
  state,
  network,
  newLaunch
}: {
  state: State | undefined
  network: NetworkPage
  newLaunch: ReactNode // New launch, for the empty state
}) {
  const rows = needsYou(state?.launches ?? [])
  return (
    <Section
      id="needs-you-h"
      title="Needs you"
      description="Launches with a question to answer or an order to approve, and runs that failed or stopped."
      data-needs-you
    >
      {!state ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5" />
          <Skeleton className="h-5" />
        </div>
      ) : rows.length === 0 ? (
        <PageEmpty action={<NextStep state={state} network={network} newLaunch={newLaunch} />}>
          Nothing needs you.
        </PageEmpty>
      ) : (
        <ul className="flex flex-col">
          {rows.map((l) => (
            <li key={l.id}>
              <a
                className="group flex items-baseline justify-between gap-4 py-2 max-md:min-h-11"
                href={workedOn(l, network)}
              >
                <span className="min-w-0 font-semibold break-words decoration-1 underline-offset-4 group-hover:underline">
                  {launchTitle(l.name, l.comps)}
                </span>
                <LaunchStatus status={l.status} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

// What a member with nothing waiting on them does next, as a primary: import a roster while the network
// has none; then open the newest launch not run yet on its page, where Start run is, as the guest
// network's sample launch, The Watch, is each day; and otherwise plan a launch, in New launch's dialog.
// A long name is cut short with an ellipsis, and the link keeps it whole for screen readers.
function NextStep({ state, network, newLaunch }: { state: State; network: NetworkPage; newLaunch: ReactNode }) {
  if (state.roster.length === 0)
    return (
      <a className={buttonVariants()} href={network.links.roster}>
        Import a roster
      </a>
    )
  // The agent lists launches newest first.
  const notRun = state.launches?.find((l) => l.status === 'new')
  if (!notRun) return newLaunch
  return (
    <a className={buttonVariants({ className: 'max-w-full' })} href={`${network.links.launches}/${notRun.id}`}>
      <span className="truncate">Open {launchTitle(notRun.name, notRun.comps)}</span>
    </a>
  )
}

// One line each for the roster, the inbox, and the CPM, with where to change them, the CPM in the
// settings' network tab; until the agent's state arrives, a bar where each line will be.
function NetworkLines({ state, network }: { state: State | undefined; network: NetworkPage }) {
  return (
    <Section
      id="network-h"
      title="Network"
      description={
        network.links.inbox
          ? 'The roster and inbox your runs rank, and the CPM that prices a launch’s slots.'
          : 'The roster your launches rank, and the CPM that prices their slots.'
      }
    >
      {state ? (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 gap-y-2">
          {networkRows(state, network).map(([label, line, href, go]) => (
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
      ) : (
        <div className="flex flex-col gap-2">
          {(network.links.inbox ? [0, 1, 2] : [0, 1]).map((i) => (
            <Skeleton key={i} className="h-5" />
          ))}
        </div>
      )}
    </Section>
  )
}

// The network's lines, each its label, what it holds, where it's changed, and the link's word.
function networkRows(state: State, network: NetworkPage) {
  const rows: [string, ReactNode, string, string][] = [
    ['Roster', rosterLine(state.roster), network.links.roster, 'Open']
  ]
  if (network.links.inbox) rows.push(['Inbox', inboxLine(state.inbox), network.links.inbox, 'Open'])
  rows.push([
    'CPM',
    state.cpm === null ? 'Not set' : `${dollars(state.cpm)} per 1,000 downloads`,
    `${network.links.settings}#network`,
    network.role === 'owner' ? (state.cpm === null ? 'Set' : 'Change') : 'View'
  ])
  return rows
}

// The roster in a line: how many shows matched in Qloo, and how many need settling.
function rosterLine(roster: Show[]) {
  if (roster.length === 0) return 'No shows yet'
  const n = (...of: Show['resolution'][]) => roster.filter((s) => of.includes(s.resolution)).length
  const pending = n('pending')
  if (pending) return `Looking up ${pending} of ${count(roster.length, 'show')} in Qloo…`
  return `${count(roster.length, 'show')}: ${listCounts([
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
  const n = pitchTally(pitches)
  return `${count(pitches.length, 'pitch', 'pitches')}: ${listCounts([
    [n('Matched'), 'matched'],
    [n('Ambiguous'), 'to confirm'],
    [n('Not in Qloo'), 'not in Qloo'],
    [n('Lookup failed'), 'lookup failed', 'lookups failed'],
    [n('Set aside'), 'set aside'],
    [n('Unreadable'), 'unreadable'],
    [n('Failed'), 'failed']
  ])}`
}

// What a new network needs, ticked off from its agent's state and the directory as each arrives, as
// a numbered list under its count. A member can dismiss it for themselves; it stays for everyone else.
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
  // A step links where it's done only for a member who can do it there, in settings the tab it's done
  // in; planning a launch opens New launch's dialog.
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
      go: owner ? `${settings}#network` : null,
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
      go: owner ? `${settings}#members` : null,
      done: setup.invited
    },
    {
      title: 'Create an API key',
      how: owner
        ? 'Make a key in settings for a script or an assistant to act for the network, short of approving anything.'
        : 'An owner makes API keys in settings, for scripts and assistants.',
      go: owner ? `${settings}#api-keys` : null,
      done: setup.apiKey
    }
  ]
  const done = items.filter((i) => i.done).length
  return (
    <Section
      id="setup-h"
      title="Setup"
      description={done === items.length ? 'Done' : `${done} of ${items.length} done`}
      actions={
        <Button variant="ghost" size="sm" className="-my-1 -mr-1.5" onClick={() => void run(dismiss)}>
          Dismiss
        </Button>
      }
      data-checklist
    >
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
    </Section>
  )
}
