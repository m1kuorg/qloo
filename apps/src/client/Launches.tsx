import { cn } from 'cn'
import { EllipsisIcon } from 'lucide-react'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import type { LaunchInput, LaunchSummary, State } from '../agent'
import { dollars } from '../order'
import { Alert, day, ScrollTable, send, useAction } from './controls'
import { launchTitle, NewLaunch } from './LaunchFields'
import { grouped, LaunchStatus, needsYou } from './LaunchStatus'
import { NetworkGate, useNetwork, type NetworkPage } from './NetworkPage'
import { count, PageEmpty, PageHeader, summaryLine, useFormDialog } from './PageHeader'
import { connectionOf, type Connection } from './states'

export function LaunchesPage(props: { agentPath: string; network: NetworkPage }) {
  const agent = useNetwork(props.agentPath)
  return (
    <NetworkGate agent={agent} network={props.network}>
      <Launches
        network={props.network}
        state={agent.state}
        connection={connectionOf(agent)}
        createLaunch={(input) => agent.stub.createLaunch(input)}
      />
    </NetworkGate>
  )
}

// The Launches page, which answers "Which launches need me?": the header with the launches' counts
// and New launch, its title badged sample while the network holds the sample data, the page's one
// sample label (ADR 0007); then the launches grouped by who's blocked, or until there's one, the empty
// state. Tests render it from a network agent's synced state; `state` is undefined until it arrives.
// At 1440 the table is the canvas's width: 56 (rail) + 24 + 1336 + 24 = 1440.
export function Launches({
  state,
  connection = { lost: null, reconnecting: false },
  network,
  createLaunch
}: {
  state: State | undefined
  connection?: Connection
  network: NetworkPage
  createLaunch: (input: LaunchInput) => Promise<{ id: string }>
}) {
  const launches = state?.launches ?? []
  // New launch's dialog, which the header and the empty state open.
  const planning = useFormDialog('New launch')
  // The page's one action, in the header once there are launches, and until then in the empty state.
  const newLaunch = planning.button()
  // Where focus goes once a launch it was on is deleted.
  const heading = useRef<HTMLHeadingElement>(null)
  return (
    <main className="flex min-w-0 flex-col gap-6 px-4 pt-6 pb-10 lg:px-6" aria-busy={!state || undefined}>
      <PageHeader
        title="Launches"
        heading={heading}
        connection={state ? connection : null}
        empty={launches.length === 0}
        summary={countsLine(launches)}
        badge={state?.sample && <Badge>sample</Badge>}
        actions={newLaunch}
      />
      <NewLaunch network={network} create={createLaunch} dialog={planning} />
      {state ? (
        <LaunchList launches={launches} network={network} newLaunch={newLaunch} heading={heading} />
      ) : (
        <LaunchesLoading />
      )}
    </main>
  )
}

// The header's summary: "7 launches · 4 need you, 1 running".
function countsLine(launches: LaunchSummary[]) {
  const needs = needsYou(launches).length
  const running = launches.filter((l) => l.status === 'running').length
  return summaryLine(count(launches.length, 'launch', 'launches'), [
    [needs, 'needs you', 'need you'],
    [running, 'running']
  ])
}

// A launch's finalists: a five-step meter in signal, what the agent puts forward, then the count,
// which says it, so the meter is hidden from screen readers. A launch not yet ranked has none: its
// cell looks empty, and says "None" to screen readers.
function Finalists({ n }: { n: number }) {
  if (n === 0) return <span className="vh">None</span>
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
// there's one, the empty state, with New launch. An unreleased launch goes by its comps.
// Any member can delete one from its row's menu, after a yes in the confirm dialog; it then leaves
// every member's list as the network's agent drops it.
function LaunchList({
  launches,
  network,
  newLaunch,
  heading
}: {
  launches: LaunchSummary[]
  network: NetworkPage
  newLaunch: ReactNode // the page's New launch, for the empty state
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
      {launches.length === 0 ? (
        <PageEmpty action={newLaunch}>No launches yet.</PageEmpty>
      ) : (
        <LaunchesTable>
          {grouped(launches).map((group) => (
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
          ))}
        </LaunchesTable>
      )}
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

// A launch's row. A cell with nothing in it yet, as an unrun launch's slots, slot value and last run
// have, looks empty, and says "None" or "Not run yet" to screen readers rather than "blank".
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
        <LaunchStatus status={l.status} />
      </td>
      <td className={cn(cell, 'text-right')}>
        <Finalists n={l.finalists} />
      </td>
      <td className={cn(cell, 'text-right tabular-nums')}>{l.slots ?? <span className="vh">None</span>}</td>
      <td className={cn(cell, 'text-right')}>
        {l.slotValue === null ? <span className="vh">None</span> : dollars(l.slotValue)}
      </td>
      <td className={cn(cell, 'text-muted-foreground')}>
        {l.lastRun ? (
          <>
            {day(l.lastRun)}
            {l.startedBy && (
              <span className="max-lg:block">
                <span className="max-lg:hidden"> · </span>
                {l.startedBy}
              </span>
            )}
          </>
        ) : (
          <span className="vh">Not run yet</span>
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
