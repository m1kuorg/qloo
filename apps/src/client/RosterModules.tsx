import { useRef, useState } from 'react'
import type { Show, ShowPatch, SlowCall } from '../agent'
import { dollars } from '../order'
import { MAX_TITLE } from '../limits'
import type { RosterFormat } from '../roster'
import type { SampleFigure } from '../sample'
import { readRosterUpload } from '../upload'
import type { Session } from './App'
import { Alert, DropCue, percentile, PickOne, ScrollTable, useAction, useFileDrop, useIntoView } from './controls'
import { CallButton } from './Evidence'
import type { NetworkPage } from './NetworkPage'
import { Source } from './Source'
import { sentence, SlowCalls, slowText, StateLine } from './states'

// The roster's modules, shared by the demo's workspace and a network's roster page: its import, its
// table, the show editor, the roster check, and the CPM its slots are priced at.

// The import answers at once, and each show fills in through synced state as its search settles. A
// file can come from the picker or be dropped anywhere on the page, so one dropped beside the form
// imports too, rather than opening in the browser.
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
    <form className="import" onSubmit={submit}>
      {dragging && (
        <DropCue busy={busy}>
          {busy
            ? 'Wait for this import to finish, then drop the file again.'
            : 'Drop the file to import it: a CSV, or a text file with one show name per line.'}
        </DropCue>
      )}
      <label className="lbl" htmlFor="roster-names">
        Show names
      </label>
      <textarea
        id="roster-names"
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'The Rewatchables\nThe Big Picture\nBinge Mode'}
        disabled={busy}
      />
      <div className="acts">
        <button className="btn pri" type="submit" disabled={busy || count === 0}>
          {pending > 0
            ? `Looked up ${roster.length - pending} of ${roster.length}…`
            : busy
              ? importing
              : 'Import roster'}
        </button>
        <button className="btn" type="button" disabled={busy} onClick={() => file.current?.click()}>
          Upload a file
        </button>
        <input ref={file} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={pick} />
        <small>
          {keepsSettledShows
            ? 'Up to 50 shows. Shows already on the roster keep their matches; only new ones are looked up.'
            : 'Replaces the current roster, up to 50 shows.'}
        </small>
      </div>
      <p className="help">
        Drop a file anywhere on the page, or upload one: a CSV needs a <code>name</code> column, and{' '}
        <code>downloads</code>, <code>status</code>, and <code>description</code> are optional; a text file has one show
        name per line.
      </p>
      <Alert error={error} />
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
    <StateLine kind="failed">
      {failed.length} {one ? 'show' : 'shows'} couldn&apos;t be looked up in Qloo, so {one ? 'it' : 'they'} can&apos;t
      be scored: {failed.join(', ')}. Import the roster again to retry {one ? 'it' : 'them'}; shows already found come
      from the cache.
    </StateLine>
  )
}

// A show's match chip, marked when its match is in trouble: slow, failed, or missed in Qloo.
function MatchChip({ show, slow }: { show: Show; slow: boolean }) {
  const state = slow
    ? 'slow'
    : show.resolution === 'failed' || show.resolution === 'missed'
      ? show.resolution
      : undefined
  return (
    <span className="chip" data-state={state}>
      {slow ? 'Slow Qloo' : resolutionLabel[show.resolution]}
    </span>
  )
}

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
  select: ((name: string) => void) | null // null while an earlier run is viewed, read-only
  slowCalls: SlowCall[]
  openCall: (call: string) => void
  opened: string | null
}) {
  if (roster.length === 0) return <p className="empty">No roster yet. Paste show names above to import one.</p>
  // One selected row: the show open in the rail's editor or, with none open, the show whose evidence is open.
  const hot = selected ?? roster.find((s) => s.evidence === opened)?.name
  return (
    <ScrollTable label="Roster table">
      <table className="chart roster">
        <caption>
          {/* A block of its own, so it wraps within a phone's screen while the table scrolls wider. */}
          <span className="cap">
            <Source of="qloo" /> Matches from Qloo search, one call per show.{' '}
            {select
              ? 'Select a show to settle or edit it, or open a call for its evidence.'
              : 'Open a call for its evidence.'}
          </span>
        </caption>
        <colgroup>
          <col className="c-show" />
          <col className="c-match" />
          <col />
          <col className="c-dl" />
          <col className="c-status" />
          <col className="c-call" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Show</th>
            <th scope="col">Match</th>
            <th scope="col">
              Qloo entity<small>popularity percentile</small>
            </th>
            <th scope="col" className="r">
              Downloads<small>per episode</small>
            </th>
            <th scope="col">Status</th>
            <th scope="col" className="r">
              Call
            </th>
          </tr>
        </thead>
        <tbody>
          {roster.map((show) => (
            <tr
              key={show.name}
              data-resolution={show.resolution}
              data-selected={show.name === hot || undefined}
              data-excluded={show.excluded || undefined}
              aria-busy={show.resolution === 'pending' || undefined}
            >
              <td>
                {select ? (
                  <button
                    type="button"
                    className="row-open"
                    aria-current={show.name === selected || undefined}
                    onClick={() => select(show.name)}
                  >
                    <span className="nm">{show.name}</span>
                  </button>
                ) : (
                  <span className="nm row-open">{show.name}</span>
                )}
                {show.description && (
                  <div className="tg desc" title={show.description}>
                    <SampleLabel show={show} figure="description" text="Sample:" /> {show.description}
                  </div>
                )}
              </td>
              <td>
                <span className="chips">
                  <MatchChip
                    show={show}
                    slow={show.resolution === 'pending' && slowCalls.some((c) => c.call === show.evidence)}
                  />
                  {show.excluded && <span className="chip">Excluded</span>}
                </span>
              </td>
              <td>
                <Match
                  show={show}
                  slow={slowCalls.filter((c) => c.call === show.evidence)}
                  settle={select && (() => select(show.name))}
                />
              </td>
              <td className="r">
                {show.downloads == null ? '–' : show.downloads.toLocaleString('en-US')}
                <SampleLabel show={show} figure="downloads" block />
              </td>
              <td>
                {show.status ?? '–'}
                <SampleLabel show={show} figure="status" block />
              </td>
              <td className="r">
                {/* A pending call has no evidence record yet, so it opens once the search settles. */}
                {show.resolution === 'pending' ? (
                  <code className="call">{show.evidence}</code>
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
  )
}

function Match({ show, slow, settle }: { show: Show; slow: SlowCall[]; settle: (() => void) | null }) {
  if (show.resolution === 'pending')
    return <span className="tg">{slow.length > 0 ? slowText(slow) : 'Looking it up in Qloo…'}</span>
  const action = show.excluded ? null : show.resolution === 'ambiguous' ? 'Pick the match' : 'Map a comp or leave out'
  if ((show.resolution === 'resolved' || show.resolution === 'mapped') && show.entity)
    return (
      <span className="ent">
        {show.resolution === 'mapped' && 'Mapped to '}
        {show.entity.name} <span className="pop">{percentile(show.entity.popularity)}</span>
      </span>
    )
  const settleButton = action && settle && (
    <button type="button" className="lnk" onClick={settle}>
      {action}
    </button>
  )
  if (show.resolution === 'ambiguous')
    return (
      <>
        <ul className="cands" aria-label={`Candidates for ${show.name}`}>
          {show.candidates.map((c) => (
            <li key={c.id}>
              {c.name} <span className="pop">{percentile(c.popularity)}</span>
            </li>
          ))}
        </ul>
        {settleButton}
      </>
    )
  return (
    <>
      {show.resolution === 'failed' ? (
        <span className="tg">{sentence(show.error ?? 'The lookup failed')} Not scored.</span>
      ) : (
        <span className="tg">No show by this name in Qloo.</span>
      )}{' '}
      {settleButton}
    </>
  )
}

// The selected show: settle its match, edit its figures, or leave it out.
export function ShowEditor({ show, agent, close }: { show: Show; agent: Session; close: () => void }) {
  const { busy, error, run } = useAction()
  const update = (patch: ShowPatch) => run(() => agent.stub.updateShow(show.name, patch))
  const ref = useIntoView<HTMLElement>()
  return (
    <section className="mod ed" ref={ref} aria-labelledby="show-ed">
      <div className="mh">
        <span className="lbl" id="show-ed">
          Show
        </span>
        <span className="chips">
          <MatchChip show={show} slow={false} />
          {show.excluded && <span className="chip">Excluded</span>}
          <button type="button" className="lnk" onClick={close}>
            Close
          </button>
        </span>
      </div>
      <p className="q">{show.name}</p>
      {show.description && (
        <p className="help">
          <SampleLabel show={show} figure="description" text="Sample:" /> {show.description}
        </p>
      )}
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
        <p className="help">Looking it up in Qloo. You can edit its figures or leave it out meanwhile.</p>
      )}
      {show.resolution !== 'resolved' && show.resolution !== 'pending' && (
        <CompSearch show={show} agent={agent} update={update} busy={busy} />
      )}
      <ShowFields show={show} update={update} busy={busy} />
      <div className="acts">
        <button type="button" className="btn" disabled={busy} onClick={() => update({ excluded: !show.excluded })}>
          {show.excluded ? 'Include again' : 'Leave out'}
        </button>
        <small>
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
    <div className="comp">
      <form onSubmit={search}>
        <label className="lbl" htmlFor="comp-q">
          {show.candidates.length > 0 ? 'Or map it to a comparable show' : 'Map it to a comparable show'}
        </label>
        <div className="bar">
          <span className="in">
            <input
              id="comp-q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Qloo podcasts"
              maxLength={MAX_TITLE}
              disabled={searching.busy}
            />
          </span>
          <button className="btn" type="submit" disabled={searching.busy || !query.trim()}>
            {searching.busy ? 'Searching…' : 'Search'}
          </button>
        </div>
      </form>
      <Alert error={searching.error} />
      {found &&
        (found.status === 'pending' ? (
          <p className="help" role="status">
            Searching Qloo for “{found.query}”… <code className="call">{found.call}</code>
            <SlowCalls calls={(agent.state?.slowCalls ?? []).filter((c) => c.call === found.call)} />
          </p>
        ) : found.status === 'failed' ? (
          <StateLine kind="failed" role="alert">
            The search for “{found.query}” failed: {found.error} <code className="call">{found.call}</code>
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
          <p className="help">
            No podcasts in Qloo match “{found.query}”. <code className="call">{found.call}</code>
          </p>
        ))}
    </div>
  )
}

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
    <form className="fields" onSubmit={save}>
      <label className="field">
        <span className="lbl">
          Downloads per episode <SampleLabel show={show} figure="downloads" />
        </span>
        <span className="in">
          <input inputMode="numeric" value={downloads} onChange={(e) => setDownloads(e.target.value)} />
        </span>
      </label>
      <label className="field">
        <span className="lbl">
          Status <SampleLabel show={show} figure="status" />
        </span>
        <span className="in">
          <input value={status} onChange={(e) => setStatus(e.target.value)} placeholder="active, hiatus" />
        </span>
      </label>
      <div className="acts">
        <button className="btn" type="submit" disabled={busy}>
          Save
        </button>
      </div>
      <Alert error={invalid} />
    </form>
  )
}

export function RosterCheck({ roster }: { roster: Show[] }) {
  const count = (r: Show['resolution']) => roster.filter((s) => s.resolution === r && !s.excluded).length
  const rows: [string, number][] = [
    ...(count('pending') > 0 ? [['Looking up', count('pending')] as [string, number]] : []),
    ['Resolved', count('resolved')],
    ['Mapped to a comp', count('mapped')],
    ['Ambiguous', count('ambiguous')],
    ['Missed', count('missed')],
    ['Lookup failed', count('failed')],
    ['Excluded', roster.filter((s) => s.excluded).length]
  ]
  return (
    <section className="mod" aria-labelledby="roster-check">
      <div className="mh">
        <span className="lbl" id="roster-check">
          Roster check
        </span>
        <Source of="qloo" />
      </div>
      <p className="help">
        Resolved and mapped shows can be scored. Until an ambiguous, missed, or failed show is settled or left out,
        rankings list it as not scored.
      </p>
      <dl className="rec">
        {rows.map(([label, n]) => (
          <div key={label} className="rec-row">
            <dt>{label}</dt>
            <dd>{n}</dd>
          </div>
        ))}
      </dl>
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
    <section className="mod" aria-labelledby="cpm-h">
      <div className="mh">
        <h2 className="lbl" id="cpm-h">
          Network CPM
        </h2>
        {cpm === null && <span className="chip">Not set</span>}
      </div>
      {cpm != null && (
        <dl className="rec kv">
          <div className="rec-row">
            <dt>CPM</dt>
            <dd>{dollars(cpm)} per 1,000 downloads</dd>
          </div>
        </dl>
      )}
      <p className="help">
        Prices each promo slot: downloads per episode × CPM ÷ 1,000. {note && `${note} `}
        {network.role === 'owner' ? (
          <a className="lnk" href={network.links.settings}>
            {cpm === null ? 'Set it in settings' : 'Change it in settings'}
          </a>
        ) : (
          'An owner sets it in settings.'
        )}
      </p>
    </section>
  )
}

// Labels a show's figure as an arbitrary sample figure, beside it, while it still holds the sample's value.
function SampleLabel({
  show,
  figure,
  text = 'sample',
  block = false
}: {
  show: Show
  figure: SampleFigure
  text?: string
  block?: boolean
}) {
  if (!show.sample?.includes(figure)) return null
  return <small className={block ? 'smp blk' : 'smp'}>{text}</small>
}
