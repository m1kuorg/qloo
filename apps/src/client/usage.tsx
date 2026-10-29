import { cn } from 'cn'
import type { Usage } from '../gateway'
import { clock, KeyValue, KeyValues } from './controls'
import type { NetworkPage } from './NetworkPage'
import { StateLine } from './states'

// Today's usage of a network's daily caps, as the settings' Usage tab and the dashboard both show it.

// Whose use the counts are: the network's, whichever member or API key spends it, or in a network on
// the guest budget, every guest's together, there and in the guest network (ADR 0006).
export const usageScope = (network: NetworkPage) =>
  network.guestBudget
    ? 'What all guests together can use each UTC day, in the guest network and the networks guests create'
    : `What ${network.name} can use each UTC day, whichever member or API key uses it`

// Each counter as "3 of 10 today", with what it counts and its meter, then when they reset, at 00:00
// UTC and in the browser's own time; then a line for each counter at its cap, saying what's refused
// until then. The network's Qloo calls count on its own key while it has one (`hasOwnKey`), which their
// line says.
export function UsageLines({ usage, hasOwnKey }: { usage: Usage; hasOwnKey: boolean }) {
  const rows = [
    {
      name: 'Model runs',
      ...usage.modelRuns,
      counts: 'Launch runs, inbox loads, and pitch runs',
      reached: 'No more model runs today: launch runs, inbox loads, and pitch runs are refused'
    },
    {
      name: 'Qloo calls',
      ...usage.qlooCalls,
      counts: hasOwnKey ? 'On the network’s own Qloo key, cached answers included' : 'Cached answers included',
      reached: 'No more Qloo calls today: roster imports and comp searches are refused'
    }
  ]
  const local = localTime(usage.resets)
  return (
    <>
      <KeyValues>
        {rows.map((r) => (
          <KeyValue key={r.name} label={r.name}>
            <span className="flex flex-col gap-1.5">
              <span>
                <span className="font-medium">{r.used.toLocaleString('en-US')}</span> of{' '}
                {r.limit.toLocaleString('en-US')} today
                <span className="block type-caption text-muted-foreground">{r.counts}</span>
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
    </>
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
  return m === 0 ? `in ${h}\u00a0h` : `in ${h}\u00a0h ${m}\u00a0min`
}

// `when` in the browser's own time, such as "8:00 PM", or null where that's UTC already.
function localTime(when: string) {
  if (new Date(when).getTimezoneOffset() === 0) return null
  return clock(when)
}
