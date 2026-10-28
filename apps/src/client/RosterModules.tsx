import { cn } from 'cn'
import { CircleDashedIcon, ClockIcon, SquareXIcon, UploadIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { linkVariants } from '@/components/ui/variants'
import type { Show, ShowPatch, SlowCall } from '../agent'
import { dollars } from '../order'
import { MAX_TITLE } from '../text'
import type { RosterFormat } from '../roster'
import type { SampleFigure } from '../sample'
import { readRosterUpload } from '../upload'
import type { Session } from './App'
import {
  Alert,
  Code,
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
import { summaryLine } from './PageHeader'
import { Source } from './Source'
import { sentence, SlowCalls, slowText, StateLine } from './states'

// The roster's modules, shared by a network's roster page and a launch's page: its import, its counts,
// its table, the show editor, the roster check, and the CPM its slots are priced at.

// The import, in the roster page's sheet, answers at once, and each show fills in through synced state
// as its search settles. A file can come from the picker or be dropped anywhere on the page, so one
// dropped beside the form imports too, rather than opening in the browser. `dropped` hears of a
// dropped file it imports, so the page can show the form it imports in.
export function RosterImport({
  roster,
  draft,
  importRoster,
  keepsSettledShows,
  dropped
}: {
  roster: Show[]
  draft: { current: string } // what's typed, kept by the page across a remount
  importRoster: (text: string, format: RosterFormat) => Promise<void>
  keepsSettledShows: boolean // whether an import keeps the shows already on the roster, as a network's does
  dropped?: () => void
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
  const dragging = useFileDrop((files) => {
    if (busy) return null
    dropped?.()
    return upload(files)
  })
  return (
    <form className="flex flex-col gap-2" onSubmit={submit} data-roster-import>
      {dragging && (
        <DropCue busy={busy}>
          {busy
            ? 'Wait for this import to finish, then drop the file again.'
            : 'Drop the file to import it: a CSV, or a text file with one show name per line.'}
        </DropCue>
      )}
      <Field>
        <FieldLabel htmlFor="roster-names">Show names</FieldLabel>
        <div className="flex flex-col gap-2">
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
            <div className="flex flex-wrap items-center gap-2">
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
            <FieldDescription>
              {keepsSettledShows
                ? 'Up to 50 shows. Shows already on the roster keep their matches; only new ones are looked up.'
                : 'Replaces the current roster, up to 50 shows.'}
            </FieldDescription>
            <FieldDescription className="max-w-[72ch]">
              Drop a file anywhere on the page, or upload one: a CSV needs a <Code>name</Code> column, and{' '}
              <Code>downloads</Code>, <Code>status</Code>, and <Code>description</Code> are optional; a text file has
              one show name per line.
            </FieldDescription>
          </div>
        </div>
      </Field>
      <div>
        <Alert error={error} />
      </div>
    </form>
  )
}

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
        {failed.length} {one ? 'show' : 'shows'} couldn’t be looked up in Qloo, so {one ? 'it' : 'they'} can’t be
        scored: {failed.join(', ')}. Import the roster again to retry {one ? 'it' : 'them'}; shows already found come
        from the cache.
      </StateLine>
    </p>
  )
}

// The roster's shows counted by how Qloo matched them, the shows left out counted apart, so the
// counts add up to the roster: the roster check lists them, and the page header's summary says them.
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

// The roster in the page header's summary, such as "19 shows · 16 resolved, 1 ambiguous, 2 missed":
// the counts that aren't 0, which say what's left to settle before a run can score every show.
export const rosterSummary = (roster: Show[]) =>
  summaryLine(
    `${roster.length} ${roster.length === 1 ? 'show' : 'shows'}`,
    rosterCounts(roster).map(({ n, words: [one, many = one] }) => n > 0 && `${n} ${n === 1 ? one : many}`)
  )

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

// Whether a show's figure, or any of them, still holds the sample network's arbitrary value, and its
// label: beside each such figure in the Show tab, and once beside the show's name in the roster table.
const sampled = (show: Show, figure: SampleFigure) => show.sample?.includes(figure) ?? false
const isSampled = (show: Show) => (show.sample?.length ?? 0) > 0
const SampleChip = () => <Badge>sample</Badge>

// The roster as a ranked list's rows, in the fit chart's anatomy: a real table, its rules bleeding
// 8px past the text as the chart's do, the show set as the chart sets it with its description under
// it, labelled sample once while any of its figures is the sample's (the Show tab says which), figures
// right-aligned. Screen readers read a row's header out before each of its cells, so they don't get
// that label: they hear "sample" after the downloads and status it marks instead (a sample description
// is in the header, so only the Show tab says so). On the roster page each show's name opens it in
// the inspector's Show tab, and the show open there, or whose evidence is, holds the tone step.
// Narrower than the table, it scrolls sideways in its region with the show's column held at the left.
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
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
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
                      {isSampled(show) && <Badge aria-hidden="true">sample</Badge>}
                    </span>
                    {show.description && (
                      <span className="line-clamp-2 type-caption text-muted-foreground" title={show.description}>
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
                  {show.downloads == null ? '–' : show.downloads.toLocaleString('en-US')}
                  {sampled(show, 'downloads') && <span className="vh"> sample</span>}
                </td>
                <td className={cell}>
                  {show.status ?? '–'}
                  {sampled(show, 'status') && <span className="vh"> sample</span>}
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

// What Qloo matched a show to, or why it matched nothing, and on the roster page the way to settle it.
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
    <Button variant="link" className="text-left whitespace-normal" onClick={settle}>
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
export function ShowEditor({
  show,
  agent,
  close,
  openCall,
  opened
}: {
  show: Show
  agent: Session
  close: () => void
  openCall: (call: string) => void
  opened: string | null
}) {
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
          <Button variant="ghost" size="sm" aria-label={`Close ${show.name}`} onClick={close} className="-my-1 -mr-1.5">
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
          note={
            <>
              Candidates from Qloo search{' '}
              <CallButton
                call={show.evidence}
                label={`Evidence for ${show.name}`}
                opened={opened}
                openCall={openCall}
              />
            </>
          }
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
        <Button variant="secondary" disabled={busy} onClick={() => void update({ excluded: !show.excluded })}>
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
      <form onSubmit={search}>
        <Field>
          <FieldLabel htmlFor="comp-q">
            {show.candidates.length > 0 ? 'Or map it to a comparable show' : 'Map it to a comparable show'}
          </FieldLabel>
          <div className="flex gap-2">
            <Input
              id="comp-q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Qloo podcasts"
              maxLength={MAX_TITLE}
              disabled={searching.busy}
            />
            <Button type="submit" variant="secondary" disabled={searching.busy || !query.trim()}>
              {searching.busy && <Spinner data-icon="inline-start" />}
              {searching.busy ? 'Searching…' : 'Search'}
            </Button>
          </div>
        </Field>
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
  const [saving, setSaving] = useState(false)
  const downloadsField = useRef<HTMLInputElement>(null)
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const digits = downloads.replace(/[,\s]/g, '')
    if (digits && !/^\d+$/.test(digits)) {
      setInvalid('Downloads per episode must be a whole number.')
      // Back to the field to fix, which the error describes.
      return downloadsField.current?.focus()
    }
    setInvalid(null)
    setSaving(true)
    await update({ downloads: digits ? Number(digits) : null, status })
    setSaving(false)
  }
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => void save(e)}>
      <FieldGroup className="gap-3">
        <Field data-invalid={invalid !== null || undefined}>
          <FieldLabel htmlFor="show-downloads" className="flex-wrap gap-1.5">
            Downloads per episode {sampled(show, 'downloads') && <SampleChip />}
          </FieldLabel>
          <Input
            id="show-downloads"
            ref={downloadsField}
            inputMode="numeric"
            aria-invalid={invalid !== null || undefined}
            aria-describedby={invalid !== null ? 'show-downloads-error' : undefined}
            value={downloads}
            onChange={(e) => setDownloads(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="show-status" className="flex-wrap gap-1.5">
            Status {sampled(show, 'status') && <SampleChip />}
          </FieldLabel>
          <Input
            id="show-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            placeholder="active, hiatus"
          />
        </Field>
      </FieldGroup>
      <Button type="submit" variant="secondary" disabled={busy} className="self-start">
        {saving && <Spinner data-icon="inline-start" />}
        Save
      </Button>
      <span id="show-downloads-error">
        <Alert error={invalid} />
      </span>
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
          <a className={linkVariants()} href={network.links.settings}>
            {cpm === null ? 'Set it in settings' : 'Change it in settings'}
          </a>
        ) : (
          'An owner sets it in settings.'
        )}
      </p>
    </section>
  )
}
