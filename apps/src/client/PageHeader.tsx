import { cn } from 'cn'
import { useEffect, useRef, useState, type ComponentProps, type ReactNode, type Ref } from 'react'
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
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConnectionState, StateLine, type Connection } from './states'

// The page's anatomy: the header, the empty state, and the dialog a page's action opens its form in,
// which the network's pages share (the Launches dashboard, the roster, and the inbox); and the section
// every page's blocks are built as, and the tabs a long page breaks its sections into.

// The page's header: its title, the page's one h1, with its badge beside it and its actions at the right
// on the title's line; then one short muted line, the page's summary in counts and the connection's state after it, the
// only place the page says it, even beside the inbox's readout. What explains the page, or a fact
// about something on it, goes by what it's about, never here. The title's line is as tall as a
// control, 44px on a phone, so an action arriving with the agent's state doesn't move the line under
// it. On a phone it's laid out the same: the actions stay on the title's line.
export function PageHeader({
  title,
  connection,
  connecting = 'Connecting to the network…',
  empty = false,
  summary,
  badge,
  actions,
  heading
}: {
  title: string
  // Beside the title, as a `Section`'s is: "sample" on a page whose data is the sample data's, its one
  // label (#311). Like the summary, it goes while the page is empty.
  badge?: ReactNode
  // The agent's connection, or null until its first state arrives, while the header says it's
  // connecting, in `connecting`'s words. It's in a live region that's always there, so a screen reader
  // hears it as it changes.
  connection: Connection | null
  connecting?: string
  // The page has nothing yet, or doesn't know yet, so its empty state, with the page's one action, is
  // where its body will be: the header has no summary and no actions then, so nothing is said twice.
  empty?: boolean
  summary?: ReactNode // see `summaryLine`
  actions?: ReactNode // the page's primary action, and whatever else acts on the page as a whole
  heading?: Ref<HTMLHeadingElement> // where focus goes once what it was on is gone
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6">
      <h1
        className="flex min-h-8 items-center gap-2 type-title max-md:min-h-11"
        ref={heading}
        tabIndex={heading ? -1 : undefined}
      >
        {title}
        {!empty && badge}
      </h1>
      {/* Spaced from the title only while something in it shows: an empty live region takes no room. */}
      <p className="col-span-full flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground has-[>:not(:empty)]:mt-1.5">
        {!empty && summary && <span>{summary}</span>}
        <span role="status">
          {connection ? (
            <ConnectionState connection={connection} />
          ) : (
            <StateLine kind="loading">{connecting}</StateLine>
          )}
        </span>
      </p>
      {!empty && actions && (
        <div className="col-start-2 row-start-1 flex flex-wrap items-center justify-end gap-2">{actions}</div>
      )}
    </div>
  )
}

// A number of things in words: "1 launch", "1,204 shows".
export const count = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

// Counts in a page's own words, each its number, its word for one, and its word for more where that
// differs; those that aren't 0 as a list, as "16 matched, 1 to settle".
export type Counts = [n: number, one: string, many?: string][]
export const listCounts = (counts: Counts) =>
  counts
    .filter(([n]) => n > 0)
    .map(([n, one, many = one]) => count(n, one, many))
    .join(', ')

// A page's summary, in the one form every header counts in: the total, then what it's made of, as
// "19 shows · 16 resolved, 1 ambiguous, 2 missed".
export const summaryLine = (total: string, counts: Counts) => [total, listCounts(counts)].filter(Boolean).join(' · ')

// What a page shows in place of its body while it has nothing yet: one short line saying what's
// missing, in the empty state's words, and the page's one primary action, which brings in the first.
// The header has no action then (`empty`), so there's one way in. An action that takes a form opens
// it in the page's `FormDialog`. `detail`, under the line, is what the page promises of what the action
// brings in, as the inbox's privacy promise.
export function PageEmpty({
  action,
  detail,
  children
}: {
  action: ReactNode
  detail?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col items-start gap-3">
      <div className="flex max-w-[72ch] flex-col gap-1">
        <p>
          <StateLine kind="empty">{children}</StateLine>
        </p>
        {detail && <p className="type-caption text-muted-foreground">{detail}</p>}
      </div>
      {action}
    </div>
  )
}

// The page's action that opens a form, the dashboard's "New launch", the roster's "Import shows" or the
// inbox's "Load pitches", and the dialog it opens the form in, titled as the action is. `button` is the
// action, in the header's actions or in the empty state, never both at once. `show` opens it, as a file
// dropped anywhere on the page does, and the form closes it once what it sent is accepted. Closing it
// returns focus to what opened it while that's still on the page, or else to the page's action as it is
// then: the header's, once the first import or load has taken the empty state away.
export function useFormDialog(title: string) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const opener = useRef<Element | null>(null)
  const show = () => {
    if (!open) opener.current = document.activeElement
    setOpen(true)
  }
  const close = () => setOpen(false)
  const finalFocus = () => {
    const from = opener.current
    return from instanceof HTMLElement && from !== document.body && from.isConnected ? from : (trigger.current ?? true)
  }
  const button = (variant?: 'secondary') => (
    <Button ref={trigger} variant={variant} onClick={show}>
      {title}
    </Button>
  )
  return { title, open, setOpen, show, close, finalFocus, button }
}

// The dialog a page's form opens in, centred: the action's name as its title and one sentence of what
// the form takes, then the form's fields, each with its limit or format under it, then a footer with
// Cancel and the primary submit, which sits outside the form and sends it by its id (`form`). The
// submit's label says what the form is doing while it's busy. It's kept mounted while closed, so the
// form's ids are always there, and a refusal stays in it under the fields.
export function FormDialog({
  dialog: { title, open, setOpen, finalFocus },
  description,
  form,
  submit,
  busy,
  disabled = false,
  initialFocus,
  children
}: {
  dialog: ReturnType<typeof useFormDialog>
  description: ReactNode // one sentence
  form: string // the id of the form among `children`
  submit: ReactNode // the submit's label, or while busy, what the form is doing
  busy: boolean
  disabled?: boolean // the form has nothing to send yet
  initialFocus?: ComponentProps<typeof DialogContent>['initialFocus']
  children: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* A scroll at the ends of a form taller than a phone's screen doesn't move the page. */}
      <DialogContent keepMounted className="overscroll-contain" finalFocus={finalFocus} initialFocus={initialFocus}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>
          <DialogClose render={<Button variant="secondary" />}>Cancel</DialogClose>
          <Button type="submit" form={form} disabled={busy || disabled}>
            {busy && <Spinner data-icon="inline-start" />}
            {submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// A section of a page: its heading, one muted sentence of what it's for or what it holds (or, where
// that's what it most needs to say, a live state such as a count), then its content 16px below. An h3
// whose section's sentence already says what it holds has none of its own, as the plan's insertion
// order. The heading is an h2, 16px semibold, or an h3 at the body size for a section inside another;
// `actions` sit at the right of its line, as the page header's do, on a phone too. It draws no panel: a
// page puts it on a card, or a panel inside it, as the settings' modules do. `heading` takes focus once
// what had it is gone; `badge`, its chips (Beta, a status), follows the title's last word in the heading,
// so a long title, such as a show's name, wraps at the column's width and the chips follow its last
// line rather than squeezing it; `data-*` attributes reach the section.
export function Section({
  id,
  title,
  description,
  level = 2,
  badge,
  actions,
  heading,
  children,
  ...data
}: {
  id: string // the heading's, which names the section
  title: ReactNode // its words, with a code such as an order's ID in its own type
  description?: ReactNode // one sentence
  level?: 2 | 3
  badge?: ReactNode
  actions?: ReactNode
  heading?: Ref<HTMLHeadingElement>
  children: ReactNode
} & { [attribute: `data-${string}`]: string | boolean | undefined }) {
  const Heading = level === 2 ? 'h2' : 'h3'
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-4" {...data}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4">
        <Heading
          id={id}
          ref={heading}
          tabIndex={heading ? -1 : undefined}
          className={cn('font-semibold text-balance break-words', level === 2 && 'type-body')}
        >
          {title}
          {/* 8px after the title's last word, a space widened rather than a margin, so chips wrapped
              onto a line of their own start at the title's left edge. */}
          {badge && (
            <>
              <span className="[word-spacing:0.25rem]"> </span>
              <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 align-middle">{badge}</span>
            </>
          )}
        </Heading>
        {description && (
          <p className="col-span-full mt-1 max-w-[72ch] text-pretty text-muted-foreground">{description}</p>
        )}
        {actions && (
          <div className="col-start-2 row-start-1 flex flex-wrap items-center justify-end gap-2">{actions}</div>
        )}
      </div>
      {children}
    </section>
  )
}

// A tab of a page's `PageTabs`: `id` is the hash that opens it, as "members" for #members.
export type PageTab = { id: string; title: string; content: ReactNode }

// A long page's sections in tabs, on the segmented track the inspector's tabs use, its list named for
// the page (`label`, as "Settings sections"). Every panel stays mounted, so a draft, a lens or an edit
// in one survives a switch to another, and a page rendered on the server holds every panel; in each,
// the sections stand 48px apart, as the settings' modules do. The chosen tab is the URL's hash: one
// that names a tab as the page opens, or as it changes (a link such as "Review the plan"), opens that
// tab, and scrolls its list into view, clear of the sticky top bar, only when it's out of view; or, when
// the hash is also an element's id in the tab's panel, as "Review the plan"'s #plan, scrolls to that
// element once the panel shows, as the browser would have had it been showing. Choosing a tab writes
// the hash without a history entry. A hash that names none is left alone, so the first tab
// shows, as it does once the chosen one goes away. Tabs
// activate by hand, Base UI's default: arrow keys move focus, and Enter or Space opens a tab. Wider
// than the page, as on a phone, the list scrolls sideways, keeping the open tab in view.
export function PageTabs({ label, tabs }: { label: string; tabs: PageTab[] }) {
  const [chosen, setChosen] = useState(() => (typeof location === 'undefined' ? '' : location.hash.slice(1)))
  const shown = tabs.some((t) => t.id === chosen) ? chosen : tabs[0].id
  const named = useRef(tabs)
  named.current = tabs
  const track = useRef<HTMLDivElement>(null)
  // The hash whose element was in a hidden panel as the hash changed, so the browser's jump to it
  // couldn't land: it's made once the panel shows.
  const jump = useRef<string | null>(null)
  useEffect(() => {
    const follow = () => {
      const hash = location.hash.slice(1)
      if (!named.current.some((t) => t.id === hash)) return
      setChosen(hash)
      if (document.getElementById(hash)?.closest('[hidden]')) jump.current = hash
      else track.current?.scrollIntoView({ block: 'nearest' })
    }
    follow()
    window.addEventListener('hashchange', follow)
    return () => window.removeEventListener('hashchange', follow)
  }, [])
  useEffect(() => {
    if (jump.current !== shown) return
    jump.current = null
    document.getElementById(shown)?.scrollIntoView()
  }, [shown])
  // The open tab, as it opens and as the list's width changes (a phone turned), scrolled sideways into
  // view: sideways only, so the page itself never moves for it.
  useEffect(() => {
    const scroller = track.current
    if (!scroller) return
    const reveal = () => {
      const tab = scroller.querySelector('[data-active]')
      if (!tab) return
      const [s, t] = [scroller.getBoundingClientRect(), tab.getBoundingClientRect()]
      if (t.left < s.left || t.right > s.right) scroller.scrollLeft += t.left + t.width / 2 - (s.left + s.width / 2)
    }
    // It reports the list's size as it starts watching, too.
    const resized = new ResizeObserver(reveal)
    resized.observe(scroller)
    return () => resized.disconnect()
  }, [shown])
  return (
    <Tabs
      value={shown}
      onValueChange={(next: string) => {
        setChosen(next)
        history.replaceState(history.state, '', `#${next}`)
      }}
      className="gap-6"
    >
      {/* It scrolls inside the page's margin, as a wide table does, with room around the track for the focus ring. */}
      <div ref={track} className="-m-1 scroll-mt-16 overflow-x-auto overscroll-x-contain p-1">
        <TabsList aria-label={label} className="max-w-none *:shrink-0">
          {tabs.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.title}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {tabs.map((t) => (
        <TabsContent key={t.id} value={t.id} keepMounted className="flex flex-col gap-12">
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  )
}
