import { cn } from 'cn'
import { Badge } from '@/components/ui/badge'
import type { Usage } from '../../gateway'
import { KeyValue, KeyValues } from '../controls'
import type { NetworkPage } from '../NetworkPage'
import { StateLine } from '../states'
import { Module } from './Module'

// The settings' usage module: what the network has used today against the beta's daily caps, as the
// gateway counts them for the network whichever member or API key spends them, and when they reset.
// Every member sees it, so a refused run is never a surprise. `usage` is read as the page loads, and
// again as the network's own Qloo key comes or goes (`hasOwnKey`), since its Qloo calls count in its own
// gateway instance while it has one.
export function UsageModule({ network, usage, hasOwnKey }: { network: NetworkPage; usage: Usage; hasOwnKey: boolean }) {
  const rows = [
    {
      name: 'Model runs',
      ...usage.modelRuns,
      reached: 'No more model runs today: launch runs, inbox loads, and pitch runs are refused',
      on: null
    },
    {
      name: 'Qloo calls',
      ...usage.qlooCalls,
      reached: 'No more Qloo calls today: roster imports and comp searches are refused',
      on: hasOwnKey ? 'On the network’s own Qloo key' : null
    }
  ]
  const local = localTime(usage.resets)
  return (
    <Module
      id="set-usage-h"
      title="Usage"
      badge={<Badge>Beta</Badge>}
      help={`What ${network.name} can use each UTC day, whichever member or API key uses it. Model runs are launch runs, inbox loads, and pitch runs; Qloo calls count cached answers too. Crossfeed’s caps across every network apply as well.`}
    >
      <KeyValues>
        {rows.map((r) => (
          <KeyValue key={r.name} label={r.name}>
            <span className="flex flex-col gap-1.5">
              <span>
                <span className="font-medium">{r.used.toLocaleString('en-US')}</span> of{' '}
                {r.limit.toLocaleString('en-US')} today
                {r.on && <span className="block type-caption text-muted-foreground">{r.on}</span>}
              </span>
              <Meter used={r.used} limit={r.limit} />
            </span>
          </KeyValue>
        ))}
        <KeyValue label="Resets">
          00:00 UTC, {fromNow(usage.resets)}
          {local && <span className="block type-caption text-muted-foreground">{local} your time</span>}
        </KeyValue>
      </KeyValues>
      {rows
        .filter((r) => r.used >= r.limit)
        .map((r) => (
          <p key={r.name}>
            <StateLine kind="failed" word="Limit reached">
              {r.reached} until 00:00 UTC.
            </StateLine>
          </p>
        ))}
    </Module>
  )
}

// A thin meter of the day's use at its true ratio, in ink, and crimson once it's at the cap. The words
// beside it say it, so screen readers skip it.
function Meter({ used, limit }: { used: number; limit: number }) {
  const ratio = limit > 0 ? Math.min(1, used / limit) : 1
  return (
    <span aria-hidden="true" className="block h-1 w-full max-w-60 overflow-hidden rounded-full bg-foreground/10">
      <span
        className={cn('block h-full rounded-full', ratio >= 1 ? 'bg-destructive' : 'bg-foreground')}
        style={{ width: `${ratio * 100}%` }}
      />
    </span>
  )
}

// How long until `when`, as "in 9 h 30 min".
function fromNow(when: string) {
  const minutes = Math.max(0, Math.floor((Date.parse(when) - Date.now()) / 60_000))
  const [h, m] = [Math.floor(minutes / 60), minutes % 60]
  if (h === 0) return m === 0 ? 'in under a minute' : `in ${m} min`
  return m === 0 ? `in ${h} h` : `in ${h} h ${m} min`
}

// `when` in the browser's own time, such as "8:00 PM", or null where that's UTC already.
function localTime(when: string) {
  const date = new Date(when)
  if (date.getTimezoneOffset() === 0) return null
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
