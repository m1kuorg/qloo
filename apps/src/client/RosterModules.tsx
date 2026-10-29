import { cn } from 'cn'
import { CircleDashedIcon, ClockIcon, SquareXIcon, UploadIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { buttonVariants } from '@/components/ui/variants'
import type { Show, ShowPatch, SlowCall } from '../agent'
import { dollars } from '../order'
import { LOOKUP_RETRIED, MAX_TITLE } from '../text'
import type { RosterFormat } from '../roster'
import { readRosterUpload } from '../upload'
import type { Session } from './App'
import {
  Alert,
  Code,
  downloads,
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
import { CallButton, type OpenCall } from './Evidence'
import type { NetworkPage } from './NetworkPage'
import { count, FormDialog, Section, summaryLine, useFormDialog } from './PageHeader'
import { Source } from './Source'
import { sentence, SlowCalls, slowText, StateLine } from './states'

// The roster's modules, shared by a network's roster page and a launch's page: its import, its counts,
// its table, the show editor, the roster check, and the CPM its slots are priced at.

// The import, in the roster page's form dialog (`dialog`), answers at once and closes the dialog, and
// each show fills in on the page through synced state as its search settles; a refusal stays in the
// dialog. A file can come from the picker or be dropped anywhere on the page, so one dropped beside
// the form imports too, rather than opening in the browser, and opens the dialog it imports in.
export function RosterImport({
  dialog,
  roster,
  draft,
  importRoster
}: {
  dialog: ReturnType<typeof useFormDialog>
  roster: Show[]
  draft: { current: string } // what's typed, kept by the page across a remount
  importRoster: (text: string, format: RosterFormat) => Promise<void>
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
    if (await run(() => importRoster(text, 'lines'))) {
      setText('')
      dialog.close()
    }
  }
  const upload = async (files: File[]) => {
    setImporting(files.length === 1 ? `Importing ${files[0].name}…` : 'Importing…')
    const imported = await run(async () => {
      const { text, format } = await readRosterUpload(files)
      await importRoster(text, format)
    })
    if (imported) dialog.close()
  }
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (files.length) void upload(files)
  }
  // A file dropped while an import is still running isn't imported; the cue says to wait.
  const dragging = useFileDrop((files) => {
    if (busy) return null
    dialog.show()
    return upload(files)
  })
  return (
    <>
      {dragging && (
        <DropCue busy={busy}>
          {busy
            ? 'Wait for this import to finish, then drop the file again.'
            : 'Drop the file to import it: a CSV, or a text file with one show name per line.'}
        </DropCue>
      )}
      <FormDialog
        dialog={dialog}
        description="Paste show names or upload the roster’s file, and Crossfeed looks each new one up in Qloo."
        form="roster-import"
        submit={
          pending > 0 ? `Looked up ${roster.length - pending} of ${roster.length}…` : busy ? importing : 'Import roster'
        }
        busy={busy}
        disabled={count === 0}
      >
        <form id="roster-import" className="flex flex-col gap-2" onSubmit={submit} data-roster-import>
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
                aria-describedby="roster-names-limit"
                className="max-h-60 min-h-24"
              />
              <div className="flex flex-col items-start gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  aria-describedby="roster-file-format"
                  onClick={() => file.current?.click()}
                >
                  <UploadIcon data-icon="inline-start" aria-hidden="true" />
                  Upload a file
                </Button>
                <input ref={file} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={pick} />
                <FieldDescription id="roster-names-limit">
                  Up to 50 shows. Shows already on the roster keep their matches; only new ones are looked up.
                </FieldDescription>
                <FieldDescription id="roster-file-format" className="max-w-[72ch]">
                  Drop a file anywhere on the page, or upload one: a CSV needs a <Code>name</Code> column, and{' '}
                  <Code>downloads</Code>, <Code>status</Code>, and <Code>description</Code> are optional; a text file
                  has one show name per line.
                </FieldDescription>
              </div>
            </div>
          </Field>
          <div>
            <Alert error={error} />
          </div>
        </form>
      </FormDialog>
    </>
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

// The shows Qloo failed to look up, which no ranking can score until they're looked up again. While the
// guest network's sample is still loading, Crossfeed retries them itself, as an interrupted lookup's error
// says (LOOKUP_RETRIED).
export function RosterFailures({ roster }: { roster: Show[] }) {
  const failed = roster.filter((s) => s.resolution === 'failed' && !s.excluded)
  if (failed.length === 0) return null
  const one = failed.length === 1
  const retried = failed.some((s) => s.error === LOOKUP_RETRIED)
  return (
    <p className="max-w-[72ch]">
      <StateLine kind="failed">
        {failed.length} {one ? 'show' : 'shows'} couldn’t be looked up in Qloo, so {one ? 'it' : 'they'} can’t be
        scored: {failed.map((s) => s.name).join(', ')}.{' '}
        {retried
          ? `Crossfeed tries ${one ? 'it' : 'them'} again later.`
          : `Import the roster again to retry ${one ? 'it' : 'them'}; shows already found come from the cache.`}
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
    count(roster.length, 'show'),
    rosterCounts(roster).map(({ n, words: [one, many] }) => [n, one, many])
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

// The roster as a ranked list's rows, in the fit chart's anatomy: a real table, its rules bleeding
// 8px past the text as the chart's do, the show set as the chart sets it with its description under
// it, figures right-aligned. Sample figures carry no label of their own: the page's header says the
// roster is the sample data's (#311). On the roster page each show's name opens it in the inspector's
// Show tab, and the show open there, or whose evidence is, holds the tone step.
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
  // Opens a show from the control that asked; null where the roster is read-only, as on a launch's page.
  select: ((name: string, from: HTMLElement) => void) | null
  slowCalls: SlowCall[]
  openCall: OpenCall
  opened: string | null
}) {
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
                          onClick={(e) => select(show.name, e.currentTarget)}
                          className="cursor-pointer text-left text-[15px] leading-snug font-semibold decoration-1 underline-offset-4 hover:underline aria-[current]:underline max-md:-my-3 max-md:py-3"
                        >
                          {show.name}
                        </button>
                      ) : (
                        <span className="text-[15px] leading-snug font-semibold">{show.name}</span>
                      )}
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
                    settle={select && ((from) => select(show.name, from))}
                  />
                </td>
                <td className={cn(cell, 'text-right')}>{downloads(show.downloads)}</td>
                <td className={cell}>{show.status ?? '–'}</td>
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
function Match({ show, slow, settle }: { show: Show; slow: SlowCall[]; settle: ((from: HTMLElement) => void) | null }) {
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
    <Button variant="link" className="text-left whitespace-normal" onClick={(e) => settle(e.currentTarget)}>
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

// A show's state in words, saying what's next when it needs something: left out, whatever its match;
// or how Qloo matched it.
const showState = (show: Show) =>
  show.excluded
    ? 'Left out, so it’s never proposed.'
    : {
        pending: 'Looking it up in Qloo.',
        resolved: 'Matched in Qloo, so a launch can propose it.',
        mapped: 'Mapped to a comparable show in Qloo.',
        ambiguous: 'Qloo found more than one show by this name. Pick the match.',
        missed: 'No show by this name in Qloo. Map a comparable show or leave it out.',
        failed: `${sentence(show.error ?? 'The lookup failed')} Not scored.`
      }[show.resolution]

// The selected show, in the inspector's Show tab, in the inspector's anatomy: its name with its chips,
// its state in a sentence, and its facts, its Qloo match with the call that found it, its popularity
// and what it's about; then settle its match, edit its figures, or leave it out. Each part is its own
// form, so a search or a pick doesn't send the figures being typed. Downloads and status are the form's,
// so they aren't facts too. It has no Close of its own: the inspector's closes it, and selecting
// another row changes the show.
export function ShowEditor({
  show,
  agent,
  openCall,
  opened
}: {
  show: Show
  agent: Session
  openCall: OpenCall
  opened: string | null
}) {
  const { busy, error, run } = useAction()
  const update = (patch: ShowPatch) => run(() => agent.stub.updateShow(show.name, patch))
  const ref = useIntoView<HTMLDivElement>()
  return (
    // Scrolled to, it stops clear of the inspector's sticky tabs.
    <div className="min-w-0 scroll-mt-16" ref={ref} data-show-editor>
      <Section
        id="show-ed"
        title={show.name}
        badge={
          <>
            <MatchChip show={show} slow={false} />
            {show.excluded && <Badge>Excluded</Badge>}
          </>
        }
        description={showState(show)}
      >
        <KeyValues>
          <KeyValue label="Qloo match">
            {show.entity ? (
              <>
                {show.entity.name}{' '}
                <CallButton
                  call={show.evidence}
                  label={`Evidence for ${show.name}`}
                  opened={opened}
                  openCall={openCall}
                />
              </>
            ) : (
              '–'
            )}
          </KeyValue>
          <KeyValue label="Popularity percentile">{percentile(show.entity?.popularity ?? null)}</KeyValue>
          {/* Three lines at most, the whole of it in its tooltip. */}
          <KeyValue label="About">
            {show.description ? (
              <span className="line-clamp-3" title={show.description}>
                {show.description}
              </span>
            ) : (
              '–'
            )}
          </KeyValue>
        </KeyValues>
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
        {show.resolution !== 'resolved' && show.resolution !== 'pending' && (
          <CompSearch show={show} agent={agent} update={update} busy={busy} />
        )}
        <ShowFields show={show} update={update} busy={busy} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button variant="secondary" disabled={busy} onClick={() => void update({ excluded: !show.excluded })}>
            {show.excluded ? 'Include again' : 'Leave out'}
          </Button>
          {/* Once it's left out, its sentence says so. */}
          {!show.excluded && (
            <small className="type-caption text-muted-foreground">Excluded shows are never proposed.</small>
          )}
        </div>
        <Alert error={error} />
      </Section>
    </div>
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
  // It opens on the figure as the row shows it, "700,000", which saves unchanged, as commas are dropped.
  const [typed, setTyped] = useState(show.downloads == null ? '' : downloads(show.downloads))
  const [status, setStatus] = useState(show.status ?? '')
  const [invalid, setInvalid] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const downloadsField = useRef<HTMLInputElement>(null)
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const digits = typed.replace(/[,\s]/g, '')
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
          <FieldLabel htmlFor="show-downloads">Downloads per episode</FieldLabel>
          <Input
            id="show-downloads"
            ref={downloadsField}
            inputMode="numeric"
            aria-invalid={invalid !== null || undefined}
            aria-describedby={invalid !== null ? 'show-downloads-error' : undefined}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="show-status">Status</FieldLabel>
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
    <Section
      id="roster-check"
      title="Roster check"
      badge={<Source of="qloo" />}
      description="Rankings score resolved and mapped shows, and list an ambiguous, missed, or failed one as not scored until it’s settled or left out."
    >
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
    </Section>
  )
}

// The CPM that prices every slot of a launch's run, as the run took it, read-only: an owner changes the
// network's in its settings, on its network tab. It says "Not set" while there's none.
export function CpmRecord({ cpm, network }: { cpm: number | null; network: NetworkPage }) {
  return (
    <Section
      id="cpm-h"
      title="Network CPM"
      badge={cpm === null && <Badge>Not set</Badge>}
      description="Each run takes the network’s CPM as it starts, to price each promo slot: downloads per episode × CPM ÷ 1,000."
      actions={
        network.role === 'owner' && (
          <a
            className={buttonVariants({ variant: 'ghost', size: 'sm', className: '-my-1 -mr-1.5' })}
            href={`${network.links.settings}#network`}
          >
            {cpm === null ? 'Set it in settings' : 'Change it in settings'}
          </a>
        )
      }
    >
      {cpm !== null && (
        <KeyValues>
          <KeyValue label="CPM">{dollars(cpm)} per 1,000 downloads</KeyValue>
        </KeyValues>
      )}
      {network.role !== 'owner' && <p className="type-caption text-muted-foreground">An owner sets it in settings.</p>}
    </Section>
  )
}
