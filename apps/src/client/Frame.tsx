import { cn } from 'cn'
import { XIcon } from 'lucide-react'
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Run, SlowCall } from '../agent'
import type { OpenCall, Opened } from './Evidence'
import { PageHeader } from './PageHeader'
import { runLabel } from './Run'
import { ConnectionState, endedBadly, isLive, SlowCalls, StateLine, type Connection } from './states'

// The frame the run pages share, the launch workspace (App.tsx) and the inbox (Inbox.tsx): a canvas
// beside an inspector, the on-air readout at the head of the canvas, and the connecting state, which
// on the inbox, given its title, is its page header saying it.

// The inspector is closed as a page opens, so the canvas takes the width, with 24px gutters from
// 1024px and 16px below; blocks are 24px apart. Open from 1360px, it's beside the canvas, a 360px
// column on the card, sticky under the 48px top bar for the window's height: at 1440 that's 56 (rail)
// + 24 (gutter) + 976 (canvas) + 24 (gutter) + 360 (inspector) = 1440, and at 1360, a 896px canvas.
// Its column is as wide as it is, so closed (hidden) it takes none. Under 1360 it's a sheet over the
// canvas. 1360px is written 85rem, so Tailwind orders it after lg's 64rem. The canvas, its header with
// it, has no cap, so its tables take the window's width beside the rail and the inspector.
const WIDE = '(min-width: 85rem)'
export const frame = 'min-[85rem]:grid min-[85rem]:grid-cols-[minmax(0,1fr)_auto]'
export const canvas = 'flex w-full min-w-0 flex-col gap-6 px-4 pt-6 pb-10 lg:px-6'
// Its own scroller, which keeps a scroll at its ends from moving the page, and keeps what Tab reaches
// clear of its sticky tabs.
const aside =
  'sticky top-12 flex h-[calc(100svh-3rem)] w-90 scroll-pt-14 flex-col gap-4 self-start overflow-y-auto overscroll-contain bg-card p-4'

// The inspector's tabs: the run's trace and history, a call's evidence, and the object selected on the
// canvas, a show on the roster page or a pitch in the inbox.
export type InspectorTab = 'run' | 'evidence' | 'show' | 'pitch'
const tabName: Record<InspectorTab, string> = { run: 'Run', evidence: 'Evidence', show: 'Show', pitch: 'Pitch' }
// The inspector's id, beside the canvas or as a sheet, which the header's toggle controls.
const INSPECTOR_ID = 'inspector'

// Which of `tabs` the inspector shows, falling back to the first, Run on a run page, when the one
// asked for has gone; whether it's beside the canvas or a sheet; and whether it's open, which it isn't
// as the page opens, at any width, and needn't be after it. `inspect` opens it on a tab, `showCall`
// opens a call's evidence there, or closes the evidence when it's already shown, and `toggle`, the
// header's Details, opens it on the tab it last showed, or closes it. Each is passed the control that
// asked, where focus goes back to as it closes: a click passes itself, since Safari and Firefox on a
// Mac don't focus a clicked button. Closing it keeps what the page has selected, so it opens on the
// same again.
export function useInspector(
  tabs: InspectorTab[],
  { opened, openCall }: { opened: Opened | null; openCall: (call: string) => unknown }
) {
  const wide = useMedia(WIDE)
  const [tab, setTab] = useState<InspectorTab>('run')
  const [open, setOpen] = useState(false)
  // The inspector's element, beside the canvas or its sheet; the header's toggle; what opened it last,
  // from outside it, where focus goes back to as it closes; and whether focus stays where it is instead,
  // as it does once the toggle has closed it or focus has left the sheet.
  const element = useRef<HTMLDivElement>(null)
  const toggleButton = useRef<HTMLButtonElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const focusStays = useRef(false)
  const current = tabs.includes(tab) ? tab : tabs[0]
  const inspect = (next: InspectorTab, from: HTMLElement) => {
    if (!element.current?.contains(from)) opener.current = from
    focusStays.current = false
    setTab(next)
    setOpen(true)
  }
  const showCall: OpenCall = (call, from) => {
    if (opened?.call === call && current === 'evidence' && open) return void openCall(call)
    inspect('evidence', from)
    if (opened?.call !== call) void openCall(call)
  }
  // Where focus is to go as it closes: back to what opened it, while that's still there, or else to the
  // header's toggle; or nowhere, when it's to stay where it is. Not wherever focus is as it closes, which
  // in Safari and Firefox on a Mac is still what had it before the click.
  const returnTarget = () =>
    focusStays.current ? null : opener.current?.isConnected ? opener.current : toggleButton.current
  const close = () => {
    const back = returnTarget()
    setOpen(false)
    back?.focus()
  }
  // Closed as focus left the sheet for something it covers: focus stays there.
  const leave = useCallback(() => {
    focusStays.current = true
    setOpen(false)
  }, [])
  // Closed from the toggle, focus goes to the toggle, not back to what opened it.
  const toggle = (from: HTMLElement) => {
    if (!open) return inspect(current, from)
    leave()
    from.focus()
  }
  return {
    tabs,
    current,
    setTab,
    wide,
    open,
    setOpen,
    inspect,
    showCall,
    close,
    leave,
    toggle,
    element,
    toggleButton,
    returnTarget
  }
}

// The header's toggle for the inspector, "Details", which says whether it's open (aria-expanded) and
// which it opens (aria-controls): on the tab it last showed, or the first. `ref` is the hook's
// `toggleButton`, where focus goes as the inspector closes once what opened it has gone.
export function InspectorToggle({
  open,
  toggle,
  ref
}: {
  open: boolean
  toggle: (from: HTMLElement) => void
  ref: Ref<HTMLButtonElement>
}) {
  return (
    <Button
      ref={ref}
      variant="ghost"
      aria-expanded={open}
      aria-controls={INSPECTOR_ID}
      onClick={(e) => toggle(e.currentTarget)}
    >
      Details
    </Button>
  )
}

// The inspector, a Base UI Tabs panel, closed until something opens it: beside the canvas from 1360px,
// on the card at rest, with no shadow, and below it a non-modal right sheet, which floats, with the
// floating shadow. Each has a close button, and Escape closes it while focus is in it, never from the
// canvas, focus going back to what opened it. `children` are its TabsContent panels, each kept
// mounted, closed too, so the ids calls point at (aria-controls="evidence") are always there, and what
// a panel holds, such as a show's figures being typed, is there as it was when it opens again; Base UI
// hides and inerts the panels not shown, and nothing else. The sheet leaves the page usable, so focus
// may leave it; when Tab takes focus to something the sheet covers (all of the canvas on a phone, where
// it's full width), the sheet closes and focus stays where it went.
// `initialFocus` is what the sheet focuses as it opens, when the page asks for more than Base UI's
// default, such as an opened object's heading.
export function Inspector({
  inspector: { tabs, current, setTab, wide, open, setOpen, close, leave, element, returnTarget },
  initialFocus,
  children
}: {
  inspector: ReturnType<typeof useInspector>
  initialFocus?: () => HTMLElement | true
  children: ReactNode
}) {
  useEffect(() => {
    if (wide || !open) return
    const moved = (e: FocusEvent) => {
      const to = e.target
      const from = element.current
      // Inside the sheet, or anything floating over it, such as its own focus guards.
      if (!from || !(to instanceof Element) || from.contains(to) || to.closest('[data-base-ui-portal]')) return
      const a = from.getBoundingClientRect()
      const b = to.getBoundingClientRect()
      if (b.right > a.left && b.left < a.right && b.bottom > a.top && b.top < a.bottom) leave()
    }
    document.addEventListener('focusin', moved)
    return () => document.removeEventListener('focusin', moved)
  }, [wide, open, leave, element])
  const panels = (
    <Tabs value={current} onValueChange={(next) => setTab(next as InspectorTab)}>
      {/* The tabs stay at the top of the inspector while what's in it scrolls under them. */}
      {/* It sticks at the scroller's padding edge, so beside the canvas it's pulled up over the aside's 16px. */}
      <div
        className={cn(
          'sticky z-10 -mx-4 flex items-center justify-between gap-2 bg-card px-4 pb-1',
          wide ? '-top-4 -mt-4 pt-4' : 'top-0 pt-1'
        )}
      >
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t} value={t}>
              {tabName[t]}
            </TabsTrigger>
          ))}
        </TabsList>
        {/* The sheet has its own, by its title. */}
        {wide && (
          <Button variant="ghost" size="icon-sm" onClick={close}>
            <XIcon />
            <span className="sr-only">Close</span>
          </Button>
        )}
      </div>
      {children}
    </Tabs>
  )
  return wide ? (
    <aside
      ref={element}
      id={INSPECTOR_ID}
      className={aside}
      aria-label="Details"
      hidden={!open}
      // Escape in the inspector itself, not in what floats over it from it, as a select's options.
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || e.defaultPrevented || !e.currentTarget.contains(e.target as Node)) return
        e.preventDefault()
        close()
      }}
    >
      {panels}
    </aside>
  ) : (
    // Non-modal and kept mounted while closed: the canvas stays usable beside it, its guide included,
    // and the calls' aria-controls="evidence" always finds its panel. Base UI hears Escape anywhere on
    // the page, so it closes the sheet only from inside it, as beside the canvas, and Escape on the
    // canvas goes on to whatever it was for there.
    <Sheet
      open={open}
      onOpenChange={(next, details) => {
        if (!next && details.reason === 'escape-key' && !element.current?.contains(details.event.target as Node)) {
          details.cancel()
          details.allowPropagation()
          return
        }
        setOpen(next)
      }}
      modal={false}
      disablePointerDismissal
    >
      <SheetContent
        ref={element}
        id={INSPECTOR_ID}
        overlay={false}
        keepMounted
        className="gap-0"
        finalFocus={() => returnTarget() ?? false}
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
// it's connecting; or, on a page whose title is known before its state, as the inbox's, the page
// header, saying it under the title, as the network's other pages do.
export function Connecting({ label, title }: { label: string; title?: string }) {
  return (
    <div className={frame}>
      <main className={canvas} aria-busy="true">
        {title ? (
          <PageHeader title={title} connection={null} connecting={label} />
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-7 w-72 max-w-full" />
              <Skeleton className="h-4 w-96 max-w-full" />
            </div>
            <div className={readout}>
              <span role="status">
                <StateLine kind="loading">{label}</StateLine>
              </span>
            </div>
          </>
        )}
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-56" />
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-11 rounded-lg" />
          ))}
        </div>
      </main>
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

// The on-air readout (role="status"): the connection's state on a launch's page, whose title row
// doesn't say it as the page header does on the inbox, then what the page's run or work is doing
// (`children`); while a run is running, the time since `since`, outside the live region; and once
// there's a run, "Run log" (`runLog`), which opens the inspector on the Run tab.
export function Readout({
  connection,
  since,
  runLog,
  children
}: {
  connection?: Connection
  since: string | null
  runLog: ((from: HTMLElement) => void) | null
  children: ReactNode
}) {
  const elapsed = useElapsed(since)
  return (
    <div className={readout}>
      {/* Each part is as wide as its words, so a step or an error quoting a name with no spaces breaks anywhere. */}
      <div role="status" className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 wrap-anywhere">
        {connection && <ConnectionState connection={connection} />}
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
        <Button variant="ghost" size="sm" className="-my-1 -mr-1.5" onClick={(e) => runLog(e.currentTarget)}>
          Run log
        </Button>
      )}
    </div>
  )
}

// A run in the readout: the live dot and its word, or a failure's word and why; while it runs, the
// current step (the latest note still running; between tool calls, Claude is choosing the next); the
// replay's explanation; and its calls still waiting on Qloo. A run one of the sample launches was
// seeded with says so by the page's title badge alone (#311).
export function RunState({ run, slowCalls }: { run: Run; slowCalls: SlowCall[] }) {
  const running = run.status === 'running'
  const step = run.notes.findLastIndex((n) => n.status === 'running')
  const slow = slowCalls.filter((c) => c.run === run.id)
  return (
    <>
      {endedBadly(run.status) ? (
        <StateLine kind="error" word={runLabel[run.status]}>
          {run.error}
        </StateLine>
      ) : (
        <span className="inline-flex items-center gap-2">
          <OnAir live={isLive(run.status)} />
          <b className="font-semibold">{runLabel[run.status]}</b>
        </span>
      )}
      {running && <span>{step >= 0 ? `${run.notes[step].text} · step ${step + 1}` : 'Waiting for Claude'}</span>}
      {run.status === 'waiting' && <span>Answer the agent’s question to go on.</span>}
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
