import { cn } from 'cn'
import { CircleDashedIcon, ClockIcon, SquareXIcon, UploadIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import type { Show, ShowPatch, SlowCall } from '../agent'
import { dollars } from '../order'
import { MAX_TITLE } from '../text'
import type { RosterFormat } from '../roster'
import type { SampleFigure } from '../sample'
import { readRosterUpload } from '../upload'
import type { Session } from './App'
import {
  Alert,
  DropCue,
  KeyValue,
  KeyValues,
  percentile,
  PickOne,
  ScrollTable,
  useAction,
  useFileDrop,
  useIntoView
} from './controls'
import { CallButton } from './Evidence'
import type { NetworkPage } from './NetworkPage'
import { Source } from './Source'
import { sentence, SlowCalls, slowText, StateLine } from './states'

// The roster's modules, shared by the demo's workspace and a network's roster page: its import, its
// counts, its table, the show editor, the roster check, and the CPM its slots are priced at.

// A link set in a line of text.
export const textLink = 'font-medium text-foreground underline decoration-1 underline-offset-4 hover:decoration-2'

// The import answers at once, and each show fills in through synced state as its search settles. A
// file can come from the picker or be dropped anywhere on the page, so one dropped beside the form
// imports too, rather than opening in the browser. From 768px the box and what it takes sit side by
// side, so the form stays short above the table.
export function RosterImport({
  roster,
  draft,
  importRoster,
  keepsSettledShows
}: {
  roster: Show[]
  draft: { current: string } // what's typed, kept by the page across a remount
  importRoster: (text: string, format: RosterFormat) => Promise<void>
  keepsSettledShows: boolean // whether an import keeps the shows already on the roster, as a network's does
}) {
  const [text, setTyped] = useState(() => draft.current)
  const setText = (value: string) => {
    draft.current = value
    setTyped(value)
  }
  const [importing, setImporting] = useState<string | null>(null)
  const action = useAction()
  const { error, run } = action
  const pending = roster.filter((s) => s.resolution === 'pending').length
  const busy = action.busy || pending > 0
  const file = useRef<HTMLInputElement>(null)
  const count = text.split('\n').filter((l) => l.trim()).length
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setImporting(`Looking up ${count} shows…`)
    if (await run(() => importRoster(text, 'lines'))) setText('')
  }
  const upload = (files: File[]) => {
    setImporting(files.length === 1 ? `Importing ${files[0].name}…` : 'Importing…')
    return run(async () => {
      const { text, format } = await readRosterUpload(files)
      await importRoster(text, format)
    })
  }
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (files.length) void upload(files)
  }
  // A file dropped while an import is still running isn't imported; the cue says to wait.
  const dragging = useFileDrop((files) => (busy ? null : upload(files)))
  return (
    <form className="grid gap-x-6 gap-y-2 md:grid-cols-2" onSubmit={submit} data-roster-import>
      {dragging && (
        <DropCue busy={busy}>
          {busy
            ? 'Wait for this import to finish, then drop the file again.'
            : 'Drop the file to import it: a CSV, or a text file with one show name per line.'}
        </DropCue>
      )}
      <label className="font-medium md:col-span-2" htmlFor="roster-names">
        Show names
      </label>
      <Textarea
        id="roster-names"
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'The Rewatchables\nThe Big Picture\nBinge Mode'}
        disabled={busy}
        className="max-h-60 min-h-24"
      />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 [&>button]:max-md:h-11">
          <Button type="submit" disabled={busy || count === 0}>
            {busy && <Spinner data-icon="inline-start" />}
            {pending > 0
              ? `Looked up ${roster.length - pending} of ${roster.length}…`
              : busy
                ? importing
                : 'Import roster'}
          </Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => file.current?.click()}>
            <UploadIcon data-icon="inline-start" aria-hidden="true" />
            Upload a file
          </Button>
          <input ref={file} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={pick} />
        </div>
        <small className="type-caption text-muted-foreground">
          {keepsSettledShows
            ? 'Up to 50 shows. Shows already on the roster keep their matches; only new ones are looked up.'
            : 'Replaces the current roster, up to 50 shows.'}
        </small>
        <p className="max-w-[72ch] type-caption text-muted-foreground">
          Drop a file anywhere on the page, or upload one: a CSV needs a <Code>name</Code> column, and{' '}
          <Code>downloads</Code>, <Code>status</Code>, and <Code>description</Code> are optional; a text file has one
          show name per line.
        </p>
      </div>
      <div className="md:col-span-2">
        <Alert error={error} />
      </div>
    </form>
  )
}

// A name as a file spells it, such as a CSV column or a file type: a code, a touch smaller than the
// text around it, as mono runs large, but never under 12px.
export const Code = ({ children }: { children: string }) => (
  <code className="rounded-sm bg-muted px-1 font-mono text-[length:max(0.75rem,0.92em)] text-foreground">
    {children}
  </code>
)

const resolutionLabel: Record<Show['resolution'], string> = {
  pending: 'Looking up',
  resolved: 'Resolved',
  mapped: 'Mapped',
  ambiguous: 'Ambiguous',
  missed: 'Missed',
  failed: 'Lookup failed'
}

// The shows Qloo failed to look up, which no ranking can score until they're looked up again.
export function RosterFailures({ roster }: { roster: Show[] }) {
  const failed = roster.filter((s) => s.resolution === 'failed' && !s.excluded).map((s) => s.name)
  if (failed.length === 0) return null
  const one = failed.length === 1
  return (
    <p className="max-w-[72ch]">
      <StateLine kind="failed">
        {failed.length} {one ? 'show' : 'shows'} couldn&apos;t be looked up in Qloo, so {one ? 'it' : 'they'} can&apos;t
        be scored: {failed.join(', ')}. Import the roster again to retry {one ? 'it' : 'them'}; shows already found come
        from the cache.
      </StateLine>
    </p>
  )
}

// The roster's shows counted by how Qloo matched them, the shows left out counted apart, so the
// counts add up to the roster: the roster check lists them, and the counts line says them.
function rosterCounts(roster: Show[]) {
  const count = (r: Show['resolution']) => roster.filter((s) => s.resolution === r && !s.excluded).length
  return [
    { label: 'Looking up', words: ['looking up'], n: count('pending'), always: false },
    { label: 'Resolved', words: ['resolved'], n: count('resolved'), always: true },
    { label: 'Mapped to a comp', words: ['mapped to a comp'], n: count('mapped'), always: true },
    { label: 'Ambiguous', words: ['ambiguous'], n: count('ambiguous'), always: true },
    { label: 'Missed', words: ['missed'], n: count('missed'), always: true },
    { label: 'Lookup failed', words: ['lookup failed', 'lookups failed'], n: count('failed'), always: true },
    { label: 'Excluded', words: ['excluded'], n: roster.filter((s) => s.excluded).length, always: true }
  ]
}

// The roster in a line, such as "19 shows: 16 resolved, 1 ambiguous, 2 missed": the counts that
// aren't 0, which say what's left to settle before a run can score every show.
export function RosterCounts({ roster }: { roster: Show[] }) {
  if (roster.length === 0) return null
  const parts = rosterCounts(roster)
    .filter((c) => c.n > 0)
    .map(({ n, words: [one, many = one] }) => `${n} ${n === 1 ? one : many}`)
  return (
    <p data-roster-counts>
      {roster.length} {roster.length === 1 ? 'show' : 'shows'}: {parts.join(', ')}
    </p>
  )
}

// A show's match chip, marked when its match is in trouble: slow, failed, or missed in Qloo. One that
// needs a person, ambiguous or missed, is outlined; a failure is crimson with its square ✕.
function MatchChip({ show, slow }: { show: Show; slow: boolean }) {
  const { resolution } = show
  const state = slow ? 'slow' : resolution === 'failed' || resolution === 'missed' ? resolution : undefined
  return (
    <Badge
      variant={
        resolution === 'failed'
          ? 'destructive'
          : resolution === 'ambiguous' || resolution === 'missed'
            ? 'outline'
            : 'default'
      }
      data-state={state}
    >
      {slow ? (
        <ClockIcon aria-hidden="true" />
      ) : resolution === 'pending' ? (
        <Spinner />
      ) : resolution === 'failed' ? (
        <SquareXIcon aria-hidden="true" />
      ) : resolution === 'missed' ? (
        <CircleDashedIcon aria-hidden="true" />
      ) : null}
      {slow ? 'Slow Qloo' : resolutionLabel[resolution]}
    </Badge>
  )
}

// Whether a show's figure still holds the sample network's arbitrary value, and its label beside it.
const sampled = (show: Show, figure: SampleFigure) => show.sample?.includes(figure) ?? false
const SampleChip = () => <Badge>sample</Badge>

// The roster as a ranked list's rows, in the fit chart's anatomy: a real table, its rules bleeding
// 8px past the text as the chart's do, the show set as the chart sets it with its description under
// it, figures right-aligned. On the demo each show's name opens it in the inspector's Show tab, and
// the show open there, or whose evidence is, holds the tone step. Narrower than the table, it
// scrolls sideways in its region with the show's column held at the left.
export function RosterTable({
  roster,
  selected,
  select,
  slowCalls,
  openCall,
  opened
}: {
  roster: Show[]
  selected: string | null
  select: ((name: string) => void) | null // null where the roster is read-only, as on a launch's page
  slowCalls: SlowCall[]
  openCall: (call: string) => void
  opened: string | null
}) {
  if (roster.length === 0)
    return (
      <p className="rounded-xl bg-muted px-4 py-3 text-muted-foreground">
        No roster yet. Paste show names above to import one.
      </p>
    )
  // One selected row: the show open in the editor or, with none open, the show whose evidence is open.
  const hot = selected ?? roster.find((s) => s.evidence === opened)?.name
  const cell = 'border-b py-3 pl-3 align-top group-data-selected/row:bg-muted'
  const head = 'border-b pb-2 pl-3 text-left align-bottom font-normal'
  // The show's column, held at the left while the rest scrolls under it, ruled where they meet.
  const held = 'sticky left-0 bg-background pl-2 max-md:border-r max-md:pr-3'
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 type-caption text-muted-foreground" id="roster-cap">
        <Source of="qloo" /> Matches from Qloo search, one call per show.{' '}
        {select
          ? 'Select a show to settle or edit it, or open a call for its evidence.'
          : 'Open a call for its evidence.'}
      </p>
      <ScrollTable label="Roster table" className="-mx-2 max-w-none">
        <table className="w-full min-w-[42rem] border-separate border-spacing-0" aria-describedby="roster-cap">
          <thead className="type-caption text-muted-foreground">
            <tr>
              <th scope="col" className={cn(head, held)}>
                Show
              </th>
              <th scope="col" className={cn(head, 'w-28')}>
                Match
              </th>
              <th scope="col" className={head}>
                Qloo entity · popularity percentile
              </th>
              <th scope="col" className={cn(head, 'w-28 text-right')}>
                Downloads per episode
              </th>
              <th scope="col" className={cn(head, 'w-20')}>
                Status
              </th>
              <th scope="col" className={cn(head, 'w-16 pr-2 text-right')}>
                Call
              </th>
            </tr>
          </thead>
          <tbody>
            {roster.map((show) => (
              <tr
                key={show.name}
                // On the selected row's tone step, its tone-filled chips lift onto the card.
                className="group/row data-excluded:text-muted-foreground [&[data-selected]_[data-variant=default]]:bg-card"
                data-resolution={show.resolution}
                data-selected={show.name === hot || undefined}
                data-excluded={show.excluded || undefined}
                aria-busy={show.resolution === 'pending' || undefined}
              >
                <th scope="row" className={cn(cell, held, 'text-left font-normal')}>
                  <span className="flex min-w-40 flex-col items-start gap-1 md:min-w-48">
                    {select ? (
                      <button
                        type="button"
                        data-open-show
                        aria-current={show.name === selected || undefined}
                        onClick={() => select(show.name)}
                        className="cursor-pointer text-left text-[15px] leading-snug font-semibold decoration-1 underline-offset-4 hover:underline aria-[current]:underline max-md:-my-3 max-md:py-3"
                      >
                        {show.name}
                      </button>
                    ) : (
                      <span className="text-[15px] leading-snug font-semibold">{show.name}</span>
                    )}
                    {show.description && (
                      <span className="line-clamp-2 type-caption text-muted-foreground" title={show.description}>
                        {sampled(show, 'description') && <span className="font-medium">Sample:</span>}{' '}
                        {show.description}
                      </span>
                    )}
                  </span>
                </th>
                <td className={cell}>
                  <span className="flex flex-wrap gap-1">
                    <MatchChip
                      show={show}
                      slow={show.resolution === 'pending' && slowCalls.some((c) => c.call === show.evidence)}
                    />
                    {show.excluded && <Badge>Excluded</Badge>}
                  </span>
                </td>
                <td className={cell}>
                  <Match
                    show={show}
                    slow={slowCalls.filter((c) => c.call === show.evidence)}
                    settle={select && (() => select(show.name))}
                  />
                </td>
                <td className={cn(cell, 'text-right')}>
                  <span className="flex flex-col items-end gap-1">
                    {show.downloads == null ? '–' : show.downloads.toLocaleString('en-US')}
                    {sampled(show, 'downloads') && <SampleChip />}
                  </span>
                </td>
                <td className={cell}>
                  <span className="flex flex-col items-start gap-1">
                    {show.status ?? '–'}
                    {sampled(show, 'status') && <SampleChip />}
                  </span>
                </td>
                <td className={cn(cell, 'pr-2 text-right')}>
                  {/* A pending call has no evidence record yet, so it opens once the search settles. */}
                  {show.resolution === 'pending' ? (
                    <code className="px-1 font-mono text-xs text-muted-foreground">{show.evidence}</code>
                  ) : (
                    <CallButton
                      call={show.evidence}
                      label={`Evidence for ${show.name}`}
                      opened={opened}
                      openCall={openCall}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollTable>
    </div>
  )
}

// What Qloo matched a show to, or why it matched nothing, and on the demo the way to settle it.
function Match({ show, slow, settle }: { show: Show; slow: SlowCall[]; settle: (() => void) | null }) {
  if (show.resolution === 'pending')
    return <span className="text-muted-foreground">{slow.length > 0 ? slowText(slow) : 'Looking it up in Qloo…'}</span>
  if ((show.resolution === 'resolved' || show.resolution === 'mapped') && show.entity)
    return (
      <span>
        {show.resolution === 'mapped' && 'Mapped to '}
        <span className="font-medium">{show.entity.name}</span>{' '}
        <span className="text-muted-foreground">{percentile(show.entity.popularity)}</span>
      </span>
    )
  const action = show.excluded ? null : show.resolution === 'ambiguous' ? 'Pick the match' : 'Map a comp or leave out'
  const settleButton = action && settle && (
    <Button variant="link" className="text-left whitespace-normal max-md:-my-3 max-md:py-3" onClick={settle}>
      {action}
    </Button>
  )
  return (
    <span className="flex flex-col items-start gap-1">
      {show.resolution === 'ambiguous' ? (
        <ul className="flex flex-col gap-0.5 type-caption" aria-label={`Candidates for ${show.name}`}>
          {show.candidates.map((c) => (
            <li key={c.id}>
              {c.name} <span className="text-muted-foreground">{percentile(c.popularity)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-muted-foreground">
          {show.resolution === 'failed'
            ? `${sentence(show.error ?? 'The lookup failed')} Not scored.`
            : 'No show by this name in Qloo.'}
        </span>
      )}
      {settleButton}
    </span>
  )
}

// The selected show, in the inspector's Show tab: settle its match, edit its figures, or leave it
// out. Each part is its own form, so a search or a pick doesn't send the figures being typed.
export function ShowEditor({ show, agent, close }: { show: Show; agent: Session; close: () => void }) {
  const { busy, error, run } = useAction()
  const update = (patch: ShowPatch) => run(() => agent.stub.updateShow(show.name, patch))
  const ref = useIntoView<HTMLElement>()
  return (
    // Scrolled to, it stops clear of the inspector's sticky tabs.
    <section className="flex min-w-0 scroll-mt-16 flex-col gap-6" ref={ref} aria-labelledby="show-ed" data-show-editor>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base leading-snug font-semibold text-balance" id="show-ed">
            {show.name}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Close ${show.name}`}
            onClick={close}
            className="-my-1 -mr-1.5 max-md:h-11"
          >
            Close
          </Button>
        </div>
        <span className="flex flex-wrap gap-1">
          <MatchChip show={show} slow={false} />
          {show.excluded && <Badge>Excluded</Badge>}
        </span>
        {show.description && (
          <p className="text-muted-foreground">
            {sampled(show, 'description') && <span className="font-medium">Sample:</span>} {show.description}
          </p>
        )}
      </div>
      {show.candidates.length > 0 && (
        <PickOne
          legend={`Which Qloo show is ${show.name}?`}
          options={show.candidates}
          current={show.resolution === 'resolved' ? show.entity?.id : undefined}
          note={`Candidates from Qloo search ${show.evidence}`}
          submit="Use this match"
          busy={busy}
          pick={(entityId) => update({ entityId })}
        />
      )}
      {show.resolution === 'pending' && (
        <p>
          <StateLine kind="loading" word={null}>
            Looking it up in Qloo. You can edit its figures or leave it out meanwhile.
          </StateLine>
        </p>
      )}
      {show.resolution !== 'resolved' && show.resolution !== 'pending' && (
        <CompSearch show={show} agent={agent} update={update} busy={busy} />
      )}
      <ShowFields show={show} update={update} busy={busy} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => void update({ excluded: !show.excluded })}
          className="max-md:h-11"
        >
          {show.excluded ? 'Include again' : 'Leave out'}
        </Button>
        <small className="type-caption text-muted-foreground">
          {show.excluded ? 'Excluded: kept here, never proposed for a launch.' : 'Excluded shows are never proposed.'}
        </small>
      </div>
      <Alert error={error} />
    </section>
  )
}

// Finds a comparable show in Qloo to stand in for this one, and maps it.
function CompSearch({
  show,
  agent,
  update,
  busy
}: {
  show: Show
  agent: Session
  update: (patch: ShowPatch) => Promise<boolean>
  busy: boolean
}) {
  const [query, setQuery] = useState(show.compSearch?.query ?? '')
  const searching = useAction()
  const found = show.compSearch
  const search = (e: React.FormEvent) => {
    e.preventDefault()
    void searching.run(() => agent.stub.searchComps(show.name, query))
  }
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <form onSubmit={search} className="flex flex-col gap-1.5">
        <label className="font-medium" htmlFor="comp-q">
          {show.candidates.length > 0 ? 'Or map it to a comparable show' : 'Map it to a comparable show'}
        </label>
        <div className="flex gap-2">
          <Input
            id="comp-q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Qloo podcasts"
            maxLength={MAX_TITLE}
            disabled={searching.busy}
            className="max-md:h-11"
          />
          <Button type="submit" variant="secondary" disabled={searching.busy || !query.trim()} className="max-md:h-11">
            {searching.busy && <Spinner data-icon="inline-start" />}
            {searching.busy ? 'Searching…' : 'Search'}
          </Button>
        </div>
      </form>
      <Alert error={searching.error} />
      {found &&
        (found.status === 'pending' ? (
          <p className="flex flex-col gap-1" role="status">
            <StateLine kind="loading" word={null}>
              Searching Qloo for “{found.query}”… <Call>{found.call}</Call>
            </StateLine>
            <SlowCalls calls={(agent.state?.slowCalls ?? []).filter((c) => c.call === found.call)} />
          </p>
        ) : found.status === 'failed' ? (
          <StateLine kind="failed" role="alert">
            The search for “{found.query}” failed: {found.error} <Call>{found.call}</Call>
          </StateLine>
        ) : found.results.length > 0 ? (
          <PickOne
            key={found.call}
            legend={`Results for “${found.query}”`}
            options={found.results}
            current={show.resolution === 'mapped' ? show.entity?.id : undefined}
            note={`Qloo search ${found.call}`}
            submit="Map to comp"
            busy={busy}
            pick={(compId) => update({ compId })}
          />
        ) : (
          <p className="text-muted-foreground">
            No podcasts in Qloo match “{found.query}”. <Call>{found.call}</Call>
          </p>
        ))}
    </div>
  )
}

// A call number in a line, as a code: the comp search's, which the editor doesn't open.
const Call = ({ children }: { children: string }) => <code className="font-mono text-xs">{children}</code>

function ShowFields({
  show,
  update,
  busy
}: {
  show: Show
  update: (patch: ShowPatch) => Promise<boolean>
  busy: boolean
}) {
  const [downloads, setDownloads] = useState(show.downloads == null ? '' : String(show.downloads))
  const [status, setStatus] = useState(show.status ?? '')
  const [invalid, setInvalid] = useState<string | null>(null)
  const save = (e: React.FormEvent) => {
    e.preventDefault()
    const digits = downloads.replace(/[,\s]/g, '')
    if (digits && !/^\d+$/.test(digits)) return setInvalid('Downloads per episode must be a whole number.')
    setInvalid(null)
    void update({ downloads: digits ? Number(digits) : null, status })
  }
  return (
    <form className="flex flex-col gap-3" onSubmit={save}>
      <label className="flex flex-col gap-1.5">
        <span className="flex flex-wrap items-center gap-1.5 font-medium">
          Downloads per episode {sampled(show, 'downloads') && <SampleChip />}
        </span>
        <Input
          inputMode="numeric"
          aria-invalid={invalid !== null || undefined}
          value={downloads}
          onChange={(e) => setDownloads(e.target.value)}
          className="max-md:h-11"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="flex flex-wrap items-center gap-1.5 font-medium">
          Status {sampled(show, 'status') && <SampleChip />}
        </span>
        <Input
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          placeholder="active, hiatus"
          className="max-md:h-11"
        />
      </label>
      <Button type="submit" variant="secondary" disabled={busy} className="self-start max-md:h-11">
        Save
      </Button>
      <Alert error={invalid} />
    </form>
  )
}

// The roster's shows counted by how Qloo matched them, which says how many a ranking can score: a
// compact key/value list, two pairs to a row.
export function RosterCheck({ roster }: { roster: Show[] }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="roster-check">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold" id="roster-check">
          Roster check
        </h2>
        <Source of="qloo" />
      </div>
      <p className="type-caption text-muted-foreground">
        Resolved and mapped shows can be scored. Until an ambiguous, missed, or failed show is settled or left out,
        rankings list it as not scored.
      </p>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1">
        {rosterCounts(roster)
          .filter((c) => c.always || c.n > 0)
          .map(({ label, n }) => (
            <div key={label} className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="tabular-nums">{n}</dd>
            </div>
          ))}
      </dl>
    </section>
  )
}

// The CPM's heading, with "Not set" while there's none, and what it prices. `cpm` is undefined until
// the agent is connected.
function CpmHead({ cpm }: { cpm: number | null | undefined }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="font-semibold" id="cpm-h">
        Network CPM
      </h2>
      {cpm === null && <Badge>Not set</Badge>}
    </div>
  )
}
const PRICES = 'Prices each promo slot: downloads per episode × CPM ÷ 1,000.'

// The demo's CPM, which the visitor sets: a dollar field labelled by its heading, saved with Save,
// and labelled sample while it's still the sample network's.
export function NetworkCpm({ cpm, sample, agent }: { cpm: number | null; sample: boolean; agent: Session }) {
  const [value, setValue] = useState(cpm == null ? '' : String(cpm))
  const { busy, error, run } = useAction()
  const save = (e: React.FormEvent) => {
    e.preventDefault()
    void run(() => agent.stub.setCpm(Number(value)))
  }
  return (
    <section className="flex flex-col gap-2" aria-labelledby="cpm-h">
      <CpmHead cpm={cpm} />
      <p className="text-muted-foreground">{PRICES}</p>
      <form className="flex flex-wrap items-center gap-x-3 gap-y-2" onSubmit={save}>
        <span className="relative">
          <span
            className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-muted-foreground"
            aria-hidden="true"
          >
            $
          </span>
          <Input
            aria-labelledby="cpm-h"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="CPM in dollars, e.g. 20"
            className="w-52 pl-6 max-md:h-11"
          />
        </span>
        <Button
          type="submit"
          variant="secondary"
          disabled={busy || !value.trim() || Number(value) === cpm}
          className="max-md:h-11"
        >
          Save
        </Button>
        {sample && (
          <small className="flex items-center gap-1.5 type-caption text-muted-foreground">
            <SampleChip /> Arbitrary sample figure, not the network&apos;s. Enter your own.
          </small>
        )}
      </form>
      <Alert error={error} />
    </section>
  )
}

// The CPM that prices every launch's slots, read-only, which an owner changes in the network's
// settings: on the network's roster page, and as a launch's run took it. `cpm` is undefined until the
// agent is connected.
export function CpmRecord({
  cpm,
  network,
  note
}: {
  cpm: number | null | undefined
  network: NetworkPage
  note?: string
}) {
  return (
    <section className="flex flex-col gap-2" aria-labelledby="cpm-h">
      <CpmHead cpm={cpm} />
      {cpm != null && (
        <KeyValues>
          <KeyValue label="CPM">{dollars(cpm)} per 1,000 downloads</KeyValue>
        </KeyValues>
      )}
      <p className="type-caption text-muted-foreground">
        {PRICES} {note && `${note} `}
        {network.role === 'owner' ? (
          <a className={textLink} href={network.links.settings}>
            {cpm === null ? 'Set it in settings' : 'Change it in settings'}
          </a>
        ) : (
          'An owner sets it in settings.'
        )}
      </p>
    </section>
  )
}
