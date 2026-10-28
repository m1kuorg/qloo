import type { ReactNode, Ref } from 'react'
import { ConnectionState, StateLine, type Connection } from './states'

// The header and the empty state the network's pages share: the Launches dashboard, the roster, and
// the inbox.

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
        {summary && <span>{summary}</span>}
        <span role="status">
          {connection ? (
            <ConnectionState connection={connection} />
          ) : (
            <StateLine kind="loading">{connecting}</StateLine>
          )}
        </span>
      </p>
      {actions && (
        <div className="col-start-2 row-start-1 flex flex-wrap items-center justify-end gap-2">{actions}</div>
      )}
    </div>
  )
}

// A page's summary, in the one form every header counts in: the total, then what it's made of, the
// counts that aren't 0, as "19 shows · 16 resolved, 1 ambiguous, 2 missed".
export const summaryLine = (total: string, parts: (string | false)[]) =>
  [total, parts.filter(Boolean).join(', ')].filter(Boolean).join(' · ')

// What a page shows in place of its body while it has nothing yet: one short line saying what's
// missing, in the empty state's words, and the page's one primary action, which brings in the first.
// The header has no action then, so there's one way in. An action that takes a form opens it in the
// page's sheet. `detail`, under the line, is what the page promises of what the action brings in, as
// the inbox's privacy promise.
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
