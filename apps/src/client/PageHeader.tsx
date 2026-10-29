import { useRef, useState, type ComponentProps, type ReactNode, type Ref } from 'react'
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
import { ConnectionState, StateLine, type Connection } from './states'

// The header, the empty state, and the dialog a page's action opens its form in, which the network's
// pages share: the Launches dashboard, the roster, and the inbox.

// The page's header: its title, the page's one h1, with its actions at the right on the title's line;
// then one short muted line, the page's summary in counts and the connection's state after it, the
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
  actions,
  heading
}: {
  title: string
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
        className="flex min-h-8 items-center type-title max-md:min-h-11"
        ref={heading}
        tabIndex={heading ? -1 : undefined}
      >
        {title}
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
