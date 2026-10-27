import { cn } from 'cn'
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Run, SlowCall } from '../agent'
import type { Opened } from './Evidence'
import { runLabel } from './Run'
import { ConnectionState, SlowCalls, StateLine, type Connection } from './states'

// The frame the run pages share, the launch workspace (App.tsx) and the inbox (Inbox.tsx): a canvas
// beside an inspector, the on-air readout at the head of the canvas, and the connecting state.

// From 1360px, the canvas beside the inspector, a 360px column on the card, sticky under the 48px top
// bar for the window's height. At 1440 that's 56 (rail) + 24 (gutter) + 976 (canvas) + 24 (gap) + 360
// (inspector) = 1440; at 1360, a 896px canvas. Under 1360 the inspector is a sheet and the canvas
// takes the width, with 24px gutters from 1024px and 16px below. Blocks are 24px apart. 1360px is
// written 85rem, so Tailwind orders it after lg's 64rem and the canvas's right gutter goes from it.
const WIDE = '(min-width: 85rem)'
export const frame = 'min-[85rem]:grid min-[85rem]:grid-cols-[minmax(0,1fr)_360px] min-[85rem]:gap-6'
export const canvas = 'flex min-w-0 flex-col gap-6 px-4 pt-6 pb-10 lg:px-6 min-[85rem]:pr-0'
// Its own scroller, which keeps a scroll at its ends from moving the page, and keeps what Tab reaches
// clear of its sticky tabs.
const aside =
  'sticky top-12 flex h-[calc(100svh-3rem)] scroll-pt-14 flex-col gap-4 self-start overflow-y-auto overscroll-contain bg-card p-4'

// The inspector's tabs: the run's trace and history, a call's evidence, and the object selected on the
// canvas, a show on the demo or a pitch in the inbox.
export type InspectorTab = 'run' | 'evidence' | 'show' | 'pitch'
const tabName: Record<InspectorTab, string> = { run: 'Run', evidence: 'Evidence', show: 'Show', pitch: 'Pitch' }

// Which of `tabs` the inspector shows, falling back to the first, Run on a run page, when the one
// asked for has gone (its show or pitch closed); whether it's beside the canvas or a sheet, and the
// sheet's state. `inspect` opens it on a tab, and `showCall` opens a call's evidence there, or closes
// it when it's already shown.
export function useInspector(
  tabs: InspectorTab[],
  { opened, openCall }: { opened: Opened | null; openCall: (call: string) => unknown }
) {
  const wide = useMedia(WIDE)
  const [tab, setTab] = useState<InspectorTab>('run')
  // The inspector's sheet, under 1360px, which opens on the tab asked for.
  const [sheet, setSheet] = useState(false)
  const current = tabs.includes(tab) ? tab : tabs[0]
  const inspect = (next: InspectorTab) => {
    setTab(next)
    if (!wide) setSheet(true)
  }
  const showCall = (call: string) => {
    if (opened?.call === call && current === 'evidence' && (wide || sheet)) return void openCall(call)
    inspect('evidence')
    if (opened?.call !== call) void openCall(call)
  }
  return { tabs, current, setTab, wide, sheet, setSheet, inspect, showCall }
}

// The inspector, a Base UI Tabs panel: beside the canvas from 1360px, and below it a non-modal right
// sheet. `children` are its TabsContent panels, each kept mounted, so the ids calls point at
// (aria-controls="evidence") are always there; Base UI hides and inerts the panels not shown, and
// nothing else. The sheet leaves the page usable, so focus may leave it; when Tab takes focus to
// something the sheet covers (all of the canvas on a phone, where it's full width), the sheet closes
// and focus stays where it went.
// `initialFocus` is what the sheet focuses as it opens, when the page asks for more than Base UI's
// default, such as an opened object's heading.
export function Inspector({
  inspector: { tabs, current, setTab, wide, sheet, setSheet },
  initialFocus,
  children
}: {
  inspector: ReturnType<typeof useInspector>
  initialFocus?: () => HTMLElement | true
  children: ReactNode
}) {
  const popup = useRef<HTMLDivElement>(null)
  // Closed because focus went under it: focus stays where it went.
  const away = useRef(false)
  useEffect(() => {
    if (wide || !sheet) return
    away.current = false
    const moved = (e: FocusEvent) => {
      const to = e.target
      const from = popup.current
      // Inside the sheet, or anything floating over it, such as its own focus guards.
      if (!from || !(to instanceof Element) || from.contains(to) || to.closest('[data-base-ui-portal]')) return
      const a = from.getBoundingClientRect()
      const b = to.getBoundingClientRect()
      if (b.right > a.left && b.left < a.right && b.bottom > a.top && b.top < a.bottom) {
        away.current = true
        setSheet(false)
      }
    }
    document.addEventListener('focusin', moved)
    return () => document.removeEventListener('focusin', moved)
  }, [wide, sheet, setSheet])
  const panels = (
    <Tabs value={current} onValueChange={(next) => setTab(next as InspectorTab)}>
      {/* The tabs stay at the top of the inspector while what's in it scrolls under them. */}
      {/* It sticks at the scroller's padding edge, so beside the canvas it's pulled up over the aside's 16px. */}
      <div className={cn('sticky z-10 -mx-4 bg-card px-4 pb-1', wide ? '-top-4 -mt-4 pt-4' : 'top-0 pt-1')}>
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t} value={t}>
              {tabName[t]}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {children}
    </Tabs>
  )
  return wide ? (
    <aside className={aside} aria-label="Details">
      {panels}
    </aside>
  ) : (
    // Non-modal and kept mounted while closed: the canvas stays usable beside it, its guide included,
    // and the calls' aria-controls="evidence" always finds its panel.
    <Sheet open={sheet} onOpenChange={setSheet} modal={false} disablePointerDismissal>
      <SheetContent
        ref={popup}
        overlay={false}
        keepMounted
        className="gap-0"
        finalFocus={() => !away.current}
        {...(initialFocus && { initialFocus })}
      >
        <SheetHeader className="pr-14">
          <SheetTitle>Details</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 scroll-pt-14 overflow-y-auto overscroll-contain px-4 pb-6">{panels}</div>
      </SheetContent>
    </Sheet>
  )
}

// Until the agent's first state arrives: the frame in the shapes it will fill, and the readout saying
// it's connecting.
export function Connecting({ label }: { label: string }) {
  const wide = useMedia(WIDE)
  return (
    <div className={frame}>
      <main className={canvas} aria-busy="true">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-72 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className={readout}>
          <span role="status">
            <StateLine kind="loading">{label}</StateLine>
          </span>
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-56" />
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-11 rounded-lg" />
          ))}
        </div>
      </main>
      {wide && (
        <aside className={aside} aria-label="Details">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24" />
        </aside>
      )}
    </div>
  )
}

// Whether the window matches a media query, following it as it changes. Rendered without a window, as
// in tests, it's the wide layout.
function useMedia(query: string) {
  const [matches, setMatches] = useState(() => typeof window === 'undefined' || window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const change = () => setMatches(media.matches)
    change()
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [query])
  return matches
}

// The on-air readout's strip: one line on the tone step, which wraps when it has more to say.
const readout = 'flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted px-3 py-2'

// The on-air readout (role="status"): the connection's state, then what the page's run or work is
// doing (`children`); while a run is running, the time since `since`, outside the live region; and
// where the inspector is a sheet, "Run log", which opens it on the Run tab.
export function Readout({
  connection,
  since,
  runLog,
  children
}: {
  connection: Connection
  since: string | null
  runLog: (() => void) | null
  children: ReactNode
}) {
  const elapsed = useElapsed(since)
  return (
    <div className={readout}>
      <div role="status" className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        <ConnectionState connection={connection} />
        {children}
      </div>
      {/* Outside the live region, so screen readers aren't told the time every second. */}
      {/* Its digits are tabular, so it doesn't jitter as it ticks; its colons aren't, since this
          face's tabular colon is a digit wide. */}
      {elapsed && (
        <span className="text-muted-foreground" aria-hidden="true">
          {elapsed.split(':').map((part, i) => (
            <Fragment key={i}>
              {i > 0 && ':'}
              <span className="tabular-nums">{part}</span>
            </Fragment>
          ))}
        </span>
      )}
      {runLog && (
        <Button variant="ghost" size="sm" className="-my-1 -mr-1.5" onClick={runLog}>
          Run log
        </Button>
      )}
    </div>
  )
}

// A run in the readout: the live dot and its word, or a failure's word and why; while it runs, the
// current step (the latest note still running; between tool calls, Claude is choosing the next); the
// replay's explanation; and its calls still waiting on Qloo.
export function RunState({ run, slowCalls }: { run: Run; slowCalls: SlowCall[] }) {
  const running = run.status === 'running'
  const step = run.notes.findLastIndex((n) => n.status === 'running')
  const slow = slowCalls.filter((c) => c.run === run.id)
  return (
    <>
      {run.status === 'failed' || run.status === 'stopped' ? (
        <StateLine kind="error" word={runLabel[run.status]}>
          {run.error}
        </StateLine>
      ) : (
        <span className="inline-flex items-center gap-2">
          <OnAir live={running || run.status === 'waiting'} />
          <b className="font-semibold">{runLabel[run.status]}</b>
        </span>
      )}
      {running && <span>{step >= 0 ? `${run.notes[step].text} · step ${step + 1}` : 'Waiting for Claude'}</span>}
      {run.status === 'waiting' && <span>Answer the agent&apos;s question to go on.</span>}
      {run.replayed && (
        <span className="flex basis-full flex-wrap items-center gap-x-2 gap-y-1 type-caption">
          <Badge variant="outline">Replayed</Badge>
          <span>
            {run.replayed}, so this is the stored sample run, replayed with its answers. Nothing new was asked of Qloo
            or Claude.
          </span>
        </span>
      )}
      {slow.length > 0 && (
        <span className="basis-full type-caption">
          <SlowCalls calls={slow} />
        </span>
      )}
    </>
  )
}

// The on-air dot: signal orange, breathing, while a run is running or waiting on a person; ink once it
// has ended; an empty ring before the first run. Failures show the square ✕ of their state line
// instead, so the dot is never the only sign of a state.
export const OnAir = ({ live, idle = false }: { live: boolean; idle?: boolean }) => (
  <span
    aria-hidden="true"
    className={cn(
      'size-2 shrink-0 rounded-full',
      idle ? 'border border-muted-foreground' : live ? 'bg-signal motion-safe:animate-live' : 'bg-foreground'
    )}
  />
)

// The time since `since` as a clock, such as 1:05, ticking each second; null without a time, and until
// the page has run in a browser, so a server render never shows a stale one.
function useElapsed(since: string | null) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    if (!since) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [since])
  if (!since || now === null) return null
  const seconds = Math.max(0, Math.floor((now - Date.parse(since)) / 1000))
  const [h, m, s] = [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
  const two = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`
}
