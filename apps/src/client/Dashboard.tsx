import { cn } from 'cn'
import { CheckIcon } from 'lucide-react'
import { useRef, type ReactNode, type RefObject } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { buttonVariants, linkVariants } from '@/components/ui/variants'
import type { LaunchInput, LaunchSummary, Show, State } from '../agent'
import type { KeyUse } from '../directory'
import type { Usage } from '../gateway'
import type { Inbox } from '../inbox'
import { dollars } from '../order'
import { Alert, clock, day, KeyValue, KeyValues, useAction } from './controls'
import { launchTitle, NewLaunch } from './LaunchFields'
import { countsLine, latestRuns, LaunchStatus, needsYou } from './LaunchStatus'
import { NetworkGate, useNetwork, type NetworkPage } from './NetworkPage'
import { count, listCounts, PageEmpty, PageHeader, Section, useFormDialog } from './PageHeader'
import { connectionOf, isLive, pitchTally, StateLine, type Connection } from './states'
import { UsageLines, usageScope } from './usage'

// What the setup checklist reads from the directory rather than the agent, besides its keys' use:
// whether anyone has been invited or has joined.
export type Setup = { invited: boolean }

// What the server read for the dashboard as the page loaded, besides the network: who's looking, the
// setup checklist's progress, today's usage, whether the network's Qloo calls count on its own key, and
// when the server read them (`usageRead`, epoch ms), and how its API keys are used, the last key's name
// for an owner alone. Usage and the keys are null when their read failed, which their blocks say.
type Loaded = {
  memberId: string
  setup: Setup
  usage: Usage | null
  ownKey: boolean
  usageRead: number
  keys: KeyUse | null
  notice?: string
}

export function DashboardPage(props: { agentPath: string; network: NetworkPage } & Loaded) {
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
// A card set beside another, as tall as the row: its section fills it, so a link last in the section
// sits at the foot of either card (`mt-auto`).
const paired = cn(card, 'flex flex-col [&>section]:flex-1')

// The network's home, which answers "What needs me?": the header, its title badged sample while the
// network holds the sample data, the page's one sample label (ADR 0007), and the counts of its
// launches, what Needs you lists among them, the inbox's rows included; under it, a `notice` the server
// gave the page, as a reset of the guest network's sample data that's still finishing opens it with;
// then the blocks, each on a card. From 1024px they stand in two columns, the old split's: the main one
// holds Needs you, Latest runs, then Today's usage and Assistants and API, side by side where both fit
// 288px, at 1440 but not at 1024; the side one Setup, until this member dismisses it, over Network.
// The main column spans both of the side column's rows, so neither column waits on the other's
// heights. Under 1024px they stack in one in the order of what needs a member first, which is also
// their order in the page: Setup while it shows, Needs you, Latest runs, Today's usage, Assistants and
// API, then Network. Tests render it from a network agent's synced state; `state` is undefined until it
// arrives. At 1440 the grid is 56 (rail) + 24 + 992 + 24 + 320 + 24 = 1440, and the main column's pair
// 484 + 24 + 484 = 992.
export function Dashboard({
  state,
  connection = { lost: null, reconnecting: false },
  network,
  memberId,
  setup,
  usage,
  ownKey,
  usageRead,
  keys,
  notice,
  dismiss,
  createLaunch
}: {
  state: State | undefined
  connection?: Connection
  network: NetworkPage
  dismiss: () => Promise<unknown>
  createLaunch: (input: LaunchInput) => Promise<{ id: string }>
} & Loaded) {
  // New launch's dialog, which Needs you's empty state and the checklist open.
  const planning = useFormDialog('New launch')
  // Needs you's heading, the next block in the page's order, which takes focus once Setup is dismissed,
  // its Dismiss gone with it.
  const needsYou = useRef<HTMLHeadingElement>(null)
  // Setup's place, kept while the agent's state is on its way, since it shows until it's dismissed.
  const checklist = !state || !state.checklistDismissed?.includes(memberId)
  const launches = state?.launches ?? []
  // What waits on a member in the inbox while it's on, which Needs you lists after the launches.
  const inbox = state && network.links.inbox ? inboxWaiting(state, network.links.inbox) : []
  return (
    <main className="flex min-w-0 flex-col gap-6 px-4 pt-6 pb-10 lg:px-6" aria-busy={!state || undefined}>
      <PageHeader
        title="Dashboard"
        connection={state ? connection : null}
        badge={state?.sample && <Badge>sample</Badge>}
        summary={(launches.length > 0 || inbox.length > 0) && countsLine(launches, inbox.length)}
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
          rather than widening it. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-[auto_1fr]">
        {checklist &&
          (state ? (
            <div className={cn(card, 'lg:col-start-2 lg:row-start-1')}>
              <Checklist
                state={state}
                network={network}
                keys={keys}
                setup={setup}
                dismiss={async () => {
                  await dismiss()
                  needsYou.current?.focus()
                }}
                plan={planning.show}
              />
            </div>
          ) : (
            <Skeleton className="h-64 rounded-xl lg:col-start-2 lg:row-start-1" />
          ))}
        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <div className={card}>
            <NeedsYou state={state} network={network} inbox={inbox} newLaunch={planning.button()} heading={needsYou} />
          </div>
          <div className={card}>
            <LatestRuns state={state} network={network} />
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[repeat(auto-fit,minmax(18rem,1fr))]">
            <div className={paired}>
              <TodaysUsage network={network} usage={usage} ownKey={ownKey} read={usageRead} />
            </div>
            <div className={paired}>
              <KeysUsed network={network} keys={keys} />
            </div>
          </div>
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

// A row of Needs you: what waits, where it's worked on, and its state in a word.
type Waiting = { key: string; title: string; href: string; state: ReactNode }

// The launches waiting on a member, as the Launches page's first group lists them, latest run first;
// then, while the inbox is on, what waits there (`inbox`, from `inboxWaiting`). Each row is its link,
// with its state in a word. With none, it says so, with the next useful thing to do (`NextStep`).
function NeedsYou({
  state,
  network,
  inbox,
  newLaunch,
  heading
}: {
  state: State | undefined
  network: NetworkPage
  inbox: Waiting[]
  newLaunch: ReactNode // New launch, for the empty state
  heading: RefObject<HTMLHeadingElement | null>
}) {
  const rows: Waiting[] = [
    ...needsYou(state?.launches ?? []).map((l) => ({
      key: l.id,
      title: launchTitle(l.name, l.comps),
      href: workedOn(l, network),
      state: <LaunchStatus status={l.status} />
    })),
    ...inbox
  ]
  return (
    <Section
      id="needs-you-h"
      heading={heading}
      title="Needs you"
      description={
        network.links.inbox
          ? 'Launches and pitch runs with a question to answer, orders and replies to approve, and runs that failed or stopped.'
          : 'Launches with a question to answer or an order to approve, and runs that failed or stopped.'
      }
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
          {rows.map((r) => (
            <li key={r.key}>
              <a className="group flex items-baseline justify-between gap-4 py-2 max-md:min-h-11" href={r.href}>
                <span className="min-w-0 font-semibold break-words decoration-1 underline-offset-4 group-hover:underline">
                  {r.title}
                </span>
                {r.state}
              </a>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

// What waits on a member in the inbox, at `inbox`: the latest pitch run while it waits on an answer,
// which the inbox page opens on, and once it has ended, the replies it drafted that no one has
// approved or discarded yet, which the inbox's Replies tab holds.
function inboxWaiting({ run, booking }: State, inbox: string): Waiting[] {
  if (!booking) return []
  const pitchRun = run?.id === booking.run ? run : null
  const drafts = isLive(pitchRun?.status) ? 0 : (booking.replies ?? []).filter((r) => r.status === 'draft').length
  const rows: Waiting[] = []
  if (pitchRun?.status === 'waiting')
    rows.push({
      key: 'pitch-run',
      title: `Pitch run for ${booking.show.name}`,
      href: inbox,
      state: <LaunchStatus status="waiting" />
    })
  if (drafts > 0)
    rows.push({
      key: 'replies',
      title: `Replies for ${booking.show.name}`,
      href: `${inbox}#replies`,
      state: <span className="whitespace-nowrap">{drafts.toLocaleString('en-US')} to approve</span>
    })
  return rows
}

// The five launches run last, each row its link: the launch, its status in a word as the Launches page
// marks it, the on-air dot while a run is running or waiting, and when its last run started and who
// started it, a member or an API key by its name, as runs say; then the way to the Launches page. From
// 768px the three are columns, the when and who as wide as the widest, up to 352px, past which a long
// key's name wraps; under it, a row is two lines, the when and who under the name.
function LatestRuns({ state, network }: { state: State | undefined; network: NetworkPage }) {
  const rows = latestRuns(state?.launches ?? [])
  return (
    <Section
      id="latest-runs-h"
      title="Latest runs"
      description="The launches run last, with when each run started and who started it."
      data-latest-runs
    >
      {!state ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5" />
          <Skeleton className="h-5" />
        </div>
      ) : rows.length === 0 ? (
        <p>
          <StateLine kind="empty">No runs yet.</StateLine>
        </p>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 md:grid-cols-[minmax(0,1fr)_auto_fit-content(22rem)]">
          {rows.map((l) => (
            <li key={l.id} className="col-span-full grid grid-cols-subgrid">
              <a
                className="group col-span-full grid grid-cols-subgrid items-baseline py-2"
                href={`${network.links.launches}/${l.id}`}
              >
                <span className="min-w-0 font-semibold break-words decoration-1 underline-offset-4 group-hover:underline">
                  {launchTitle(l.name, l.comps)}
                </span>
                <LaunchStatus status={l.status} />
                <span className="col-span-full break-words text-muted-foreground max-md:type-caption md:col-span-1">
                  {day(l.lastRun!)}, {clock(l.lastRun!)}
                  {l.startedBy && ` · ${l.startedBy}`}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <a className={linkVariants({ className: 'self-start' })} href={network.links.launches}>
        All launches
      </a>
    </Section>
  )
}

// Today's usage of the network's daily caps, as the settings' Usage tab shows it, with when the server
// read it (`read`), as the page loaded, since it isn't on the agent's socket, so it doesn't follow the
// day's use as Needs you follows the launches; how long until the reset is counted from then too. A
// read that failed says so.
function TodaysUsage({
  network,
  usage,
  ownKey,
  read
}: {
  network: NetworkPage
  usage: Usage | null
  ownKey: boolean
  read: number
}) {
  return (
    <Section id="usage-h" title="Today’s usage" description={`${usageScope(network)}.`} data-usage>
      {usage ? (
        <>
          <UsageLines usage={usage} hasOwnKey={ownKey} read={read} />
          <p className="type-caption text-muted-foreground">As of {clock(read)}, when the page loaded.</p>
        </>
      ) : (
        <p>
          <StateLine kind="error">Today’s usage didn’t load. Reload the page to try again.</StateLine>
        </p>
      )}
    </Section>
  )
}

// How the network's API keys are used: how many are active, not revoked, and when any key, revoked or
// not, was last used, naming the key to an owner alone, as settings lists the keys to owners alone
// (a run still says who started it, an API key by its name); or that none has been. It leads to Connect
// your AI on the Developers page, where an owner makes a key and every member reads how an assistant
// connects with one, at the card's foot. A read that failed says so.
function KeysUsed({ network, keys }: { network: NetworkPage; keys: KeyUse | null }) {
  const last = keys?.last
  return (
    <Section
      id="keys-h"
      title="Assistants and API"
      description={`Scripts and assistants act for ${network.name} with its API keys, short of approving anything.`}
      data-keys
    >
      {!keys ? (
        <p>
          <StateLine kind="error">The API keys’ use didn’t load. Reload the page to try again.</StateLine>
        </p>
      ) : (
        <>
          <KeyValues>
            <KeyValue label="Active keys">{keys.inUse.toLocaleString('en-US')}</KeyValue>
            {last && (
              <KeyValue label="Last used">
                {day(last.at)}, {clock(last.at)}
                {last.name && ` by “${last.name}”${last.revoked ? ', since revoked' : ''}`}
              </KeyValue>
            )}
          </KeyValues>
          {!last && (
            <p>
              <StateLine kind="empty">No assistant or script has used a key yet.</StateLine>
            </p>
          )}
        </>
      )}
      <a className={linkVariants({ className: 'mt-auto self-start' })} href={`${network.links.developers}#connect`}>
        Connect your AI
      </a>
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
// a numbered list under its count; "Connect your AI" once any of its keys, revoked or not, has been
// used for a request, as Assistants and API says (`keys`), and while that couldn't be read, neither done
// nor not: the step says so, and the count leaves it out. A member can dismiss it for themselves; it
// stays for everyone else. Dismiss is disabled while it works, and stays focusable.
function Checklist({
  state,
  network,
  setup,
  keys,
  dismiss,
  plan
}: {
  state: State
  network: NetworkPage
  setup: Setup
  keys: KeyUse | null
  dismiss: () => Promise<unknown>
  plan: () => void
}) {
  const { busy, error, run } = useAction()
  const owner = network.role === 'owner'
  const { roster, settings } = network.links
  // A step links where it's done only for a member who can do it there, in settings the tab it's done
  // in; planning a launch opens New launch's dialog. Connect your AI links every member to the Developers
  // page, whose steps a member follows with a key an owner made. Done, it says so, in its own words where it has
  // them (`said`); `done` is null while it couldn't be told, with `unknown` saying so.
  const items: {
    title: string
    how: string
    go: string | (() => void) | null
    done: boolean | null
    said?: string
    unknown?: string
  }[] = [
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
      title: 'Connect your AI',
      how: owner
        ? 'Make a key on the Developers page for an assistant or a script to act for the network, short of approving anything. It’s done once a key is used.'
        : 'An owner makes the key an assistant or a script acts with. The Developers page shows how one connects.',
      go: `${network.links.developers}#connect`,
      done: keys ? keys.last !== null : null,
      said: 'A key has been used.',
      unknown: 'Couldn’t check whether a key has been used.'
    }
  ]
  const done = items.filter((i) => i.done).length
  const unknown = items.filter((i) => i.done === null).length
  return (
    <Section
      id="setup-h"
      title="Setup"
      description={
        done === items.length
          ? 'Done'
          : `${done} of ${items.length} done${unknown ? `, ${count(unknown, 'unknown', 'unknown')}` : ''}`
      }
      actions={
        <Button
          variant="ghost"
          size="sm"
          className="-my-1 -mr-1.5"
          disabled={busy}
          focusableWhenDisabled
          onClick={() => void run(dismiss)}
        >
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
                {item.said ?? 'Done'}
              </span>
            ) : item.done === null ? (
              <span className="block type-caption">
                <StateLine kind="error">{item.unknown}</StateLine>
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
