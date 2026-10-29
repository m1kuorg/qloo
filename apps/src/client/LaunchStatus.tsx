import { CheckIcon } from 'lucide-react'
import type { LaunchSummary } from '../agent'
import { OnAir } from './Frame'
import { endedBadly, isLive, StateLine } from './states'

// A launch's status as the Launches page and the dashboard show it, and the groups by who's blocked
// that the Launches page lists launches in, the first of which is the dashboard's Needs you.

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

// The launches in `statuses`, latest run first. The agent lists launches newest first, and the sort is
// stable, so launches not run yet stay newest first and rows don't swap while nothing about them
// changes.
function latestFirst(launches: LaunchSummary[], statuses: LaunchSummary['status'][]) {
  const latest = (l: LaunchSummary) => (l.lastRun ? Date.parse(l.lastRun) : -Infinity)
  return launches.filter((l) => statuses.includes(l.status)).sort((a, b) => latest(b) - latest(a))
}

// The groups that have launches, each latest run first.
export const grouped = (launches: LaunchSummary[]) =>
  GROUPS.map((g) => ({ name: g.name, rows: latestFirst(launches, g.statuses) })).filter((g) => g.rows.length > 0)

// The launches that need a person, the first group, latest run first.
export const needsYou = (launches: LaunchSummary[]) => latestFirst(launches, GROUPS[0].statuses)

// What the Launches page and the dashboard call each status.
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
export function LaunchStatus({ status }: { status: LaunchSummary['status'] }) {
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
