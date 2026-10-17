import { useAgent } from 'agents/react'
import { useRef, useState } from 'react'
import type { CrossfeedAgent, Launch, Run, Show, ShowPatch, State } from '../agent'
import type { RosterFormat } from '../roster'
import { EvidencePanel, type Opened } from './Evidence'
import { Source } from './Source'

// The session's agent; the server picks the instance from the session cookie.
const useSession = () => useAgent<CrossfeedAgent, State>({ agent: 'CrossfeedAgent', basePath: 'agents/session' })
type Session = ReturnType<typeof useSession>

export function App() {
  const agent = useSession()
  const roster = agent.state?.roster ?? []
  const run = agent.state?.run ?? null
  const [selected, setSelected] = useState<string | null>(null)
  const show = roster.find((s) => s.name === selected)
  const [opened, setOpened] = useState<Opened | null>(null)
  const latest = useRef<string | null>(null)
  // Opens a call's evidence, or closes it when it's already open. Only the latest click's answer lands.
  const openCall = async (call: string) => {
    const closing = opened?.call === call
    latest.current = closing ? null : call
    if (closing) return setOpened(null)
    setOpened({ call, status: 'loading' })
    try {
      const log = await agent.stub.getEvidence()
      if (latest.current === call) setOpened({ call, status: 'loaded', record: log.find((e) => e.call === call) })
    } catch (err) {
      if (latest.current === call)
        setOpened({ call, status: 'failed', error: err instanceof Error ? err.message : String(err) })
    }
  }
  return (
    <>
      <LaunchHeader
        launch={agent.state?.launch ?? null}
        run={run}
        startLaunch={(name) => agent.stub.startLaunch({ name })}
        openCall={openCall}
        opened={opened?.call ?? null}
      />
      <section className="hd">
        <h1>Roster</h1>
        <p className="help">
          Paste your network's show names, one per line, or upload a CSV. Crossfeed looks each one up in Qloo.
        </p>
      </section>
      <main className="main">
        <section className="chart-col" aria-label="Roster">
          <RosterImport roster={roster} importRoster={(text, format) => agent.stub.importRoster(text, format)} />
          <RosterTable
            roster={roster}
            selected={show?.name ?? null}
            select={setSelected}
            openCall={openCall}
            opened={opened?.call ?? null}
          />
        </section>
        <aside className="rail" aria-label="Details">
          {run && <RunLog run={run} />}
          {show && <ShowEditor key={show.name} show={show} agent={agent} close={() => setSelected(null)} />}
          <RosterCheck roster={roster} />
          <EvidencePanel opened={opened} />
          <NetworkCpm key={agent.state?.cpm ?? 'none'} cpm={agent.state?.cpm ?? null} agent={agent} />
        </aside>
      </main>
    </>
  )
}

const runLabel: Record<Run['status'], string> = { running: 'Running', completed: 'Completed', failed: 'Failed' }

// The launch header: start a run from a released launch's name, then follow it here.
function LaunchHeader({
  launch,
  run,
  startLaunch,
  openCall,
  opened
}: {
  launch: Launch | null
  run: Run | null
  startLaunch: (name: string) => Promise<unknown>
  openCall: (call: string) => void
  opened: string | null
}) {
  const [name, setName] = useState('')
  const action = useAction()
  const running = run?.status === 'running'
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (await action.run(() => startLaunch(name))) setName('')
  }
  const current = run?.notes.findLast((n) => n.status === 'running')?.text
  return (
    <section className="hd" aria-label="Launch">
      <div className="hd-row">
        <div>
          <h1>
            <span>Launch ·</span> {launch?.name ?? 'None yet'}
          </h1>
          {launch && <LaunchMatch launch={launch} running={running} openCall={openCall} opened={opened} />}
        </div>
        {run && (
          <div className="status" role="status">
            <b>{runLabel[run.status]}</b>
            {run.status === 'running' && <p>{current ?? 'Waiting for Claude'}</p>}
            {run.status === 'failed' && <p>{run.error}</p>}
          </div>
        )}
      </div>
      <form className="launch-form" onSubmit={submit}>
        <label className="lbl" htmlFor="launch-name">
          Released launch
        </label>
        <input
          id="launch-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="The Big Picture"
          disabled={action.busy || running}
        />
        <button className="btn pri" type="submit" disabled={action.busy || running || !name.trim()}>
          Start run
        </button>
      </form>
      {action.error && (
        <p className="err" role="alert">
          {action.error}
        </p>
      )}
    </section>
  )
}

function LaunchMatch({
  launch: { name, match },
  running,
  openCall,
  opened
}: {
  launch: Launch
  running: boolean
  openCall: (call: string) => void
  opened: string | null
}) {
  if (!match) return <p className="sub-line tg">{running ? 'Looking it up in Qloo…' : 'Not looked up.'}</p>
  return (
    <p className="sub-line">
      <Source of="qloo" />{' '}
      {match.resolution === 'resolved' && match.entity ? (
        <span className="ent">
          {match.entity.name} <span className="pop">{percentile(match.entity.popularity)}</span>
        </span>
      ) : match.resolution === 'ambiguous' ? (
        <span>Ambiguous: {match.candidates.map((c) => c.name).join(', ')}</span>
      ) : match.resolution === 'failed' ? (
        <span className="tg">Lookup failed: {match.error}</span>
      ) : (
        <span className="tg">No show by this name in Qloo.</span>
      )}{' '}
      <button
        type="button"
        className="call"
        aria-pressed={match.evidence === opened}
        aria-controls="evidence"
        aria-label={`Evidence for ${name ?? 'the launch'}: call ${match.evidence}`}
        onClick={() => openCall(match.evidence)}
      >
        {match.evidence}
      </button>
    </p>
  )
}

const noteLabel: Record<Run['notes'][number]['status'], string> = { running: 'Running', done: 'Done', failed: 'Failed' }

// What the run has done so far: one note per tool call, then why it stopped if it failed.
function RunLog({ run }: { run: Run }) {
  return (
    <section className="mod" aria-labelledby="run-log">
      <div className="mh">
        <span className="lbl" id="run-log">
          Run
        </span>
        <span className="chip">{runLabel[run.status]}</span>
      </div>
      <ol className="notes">
        {run.notes.map((n, i) => (
          <li key={i} data-status={n.status}>
            <span>{n.text}</span>
            <span className="tg">{noteLabel[n.status]}</span>
          </li>
        ))}
        {run.status === 'failed' && (
          <li data-status="failed">
            <span>{run.error}</span>
            <span className="tg">Stopped</span>
          </li>
        )}
      </ol>
      {run.notes.length === 0 && run.status === 'running' && <p className="help">Waiting for Claude.</p>}
    </section>
  )
}

// Runs one action at a time for a form, keeping its error for the form to show.
function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

const Alert = ({ error }: { error: string | null }) =>
  error && (
    <p className="err" role="alert">
      {error}
    </p>
  )

// The import answers at once, and each show fills in through synced state as its search settles.
function RosterImport({
  roster,
  importRoster
}: {
  roster: Show[]
  importRoster: (text: string, format: RosterFormat) => Promise<void>
}) {
  const [text, setText] = useState('')
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
  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const csv = e.target.files?.[0]
    e.target.value = ''
    if (!csv) return
    setImporting(`Importing ${csv.name}…`)
    await run(async () => importRoster(await csv.text(), 'csv'))
  }
  return (
    <form className="import" onSubmit={submit}>
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
          Upload CSV
        </button>
        <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={upload} />
        <small>Replaces the current roster, up to 50 shows.</small>
      </div>
      <p className="help">
        A CSV needs a <code>name</code> column; <code>downloads</code>, <code>status</code>, and{' '}
        <code>description</code> are optional.
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

function RosterTable({
  roster,
  selected,
  select,
  openCall,
  opened
}: {
  roster: Show[]
  selected: string | null
  select: (name: string) => void
  openCall: (call: string) => void
  opened: string | null
}) {
  if (roster.length === 0) return <p className="empty">No roster yet. Paste show names above to import one.</p>
  return (
    <table className="chart roster">
      <caption>
        <Source of="qloo" /> Matches from Qloo search, one call per show. Select a show to settle or edit it, or open a
        call for its evidence.
      </caption>
      <colgroup>
        <col style={{ width: '28%' }} />
        <col style={{ width: 128 }} />
        <col />
        <col style={{ width: 96 }} />
        <col style={{ width: 88 }} />
        <col style={{ width: 64 }} />
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
            className={show.evidence === opened ? 'on' : undefined}
            data-selected={show.name === selected || undefined}
            data-excluded={show.excluded || undefined}
            aria-busy={show.resolution === 'pending' || undefined}
          >
            <td>
              <button
                type="button"
                className="row-open"
                aria-current={show.name === selected || undefined}
                onClick={() => select(show.name)}
              >
                <span className="nm">{show.name}</span>
              </button>
              {show.description && (
                <div className="tg desc" title={show.description}>
                  {show.description}
                </div>
              )}
            </td>
            <td>
              <span className="chips">
                <span className="chip">{resolutionLabel[show.resolution]}</span>
                {show.excluded && <span className="chip">Excluded</span>}
              </span>
            </td>
            <td>
              <Match show={show} settle={() => select(show.name)} />
            </td>
            <td className="r">{show.downloads == null ? '–' : show.downloads.toLocaleString('en-US')}</td>
            <td>{show.status ?? '–'}</td>
            <td className="r">
              {/* A pending call has no evidence record yet, so it opens once the search settles. */}
              {show.resolution === 'pending' ? (
                <code className="call">{show.evidence}</code>
              ) : (
                <button
                  type="button"
                  className="call"
                  aria-pressed={show.evidence === opened}
                  aria-controls="evidence"
                  aria-label={`Evidence for ${show.name}: call ${show.evidence}`}
                  onClick={() => openCall(show.evidence)}
                >
                  {show.evidence}
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const percentile = (p: number | null) => (p === null ? '–' : (p * 100).toFixed(1))

function Match({ show, settle }: { show: Show; settle: () => void }) {
  if (show.resolution === 'pending') return <span className="tg">Looking it up in Qloo…</span>
  const action = show.excluded ? null : show.resolution === 'ambiguous' ? 'Pick the match' : 'Map a comp or leave out'
  if ((show.resolution === 'resolved' || show.resolution === 'mapped') && show.entity)
    return (
      <span className="ent">
        {show.resolution === 'mapped' && 'Mapped to '}
        {show.entity.name} <span className="pop">{percentile(show.entity.popularity)}</span>
      </span>
    )
  const settleButton = action && (
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
      <span className="tg">{show.resolution === 'failed' ? show.error : 'No show by this name in Qloo.'}</span>{' '}
      {settleButton}
    </>
  )
}

// The selected show: settle its match, edit its figures, or leave it out.
function ShowEditor({ show, agent, close }: { show: Show; agent: Session; close: () => void }) {
  const { busy, error, run } = useAction()
  const update = (patch: ShowPatch) => run(() => agent.stub.updateShow(show.name, patch))
  return (
    <section className="mod ed" aria-labelledby="show-ed">
      <div className="mh">
        <span className="lbl" id="show-ed">
          Show
        </span>
        <span className="chips">
          <span className="chip">{resolutionLabel[show.resolution]}</span>
          {show.excluded && <span className="chip">Excluded</span>}
          <button type="button" className="lnk" onClick={close}>
            Close
          </button>
        </span>
      </div>
      <p className="q">{show.name}</p>
      {show.description && <p className="help">{show.description}</p>}
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

// A radio list of Qloo entities with their popularity, and a button that commits the pick.
function PickOne({
  legend,
  options,
  current,
  note,
  submit,
  busy,
  pick
}: {
  legend: string
  options: Show['candidates']
  current: string | undefined
  note: string
  submit: string
  busy: boolean
  pick: (id: string) => Promise<unknown>
}) {
  const [choice, setChoice] = useState(current ?? '')
  return (
    <form
      className="pick"
      onSubmit={(e) => {
        e.preventDefault()
        void pick(choice)
      }}
    >
      <fieldset>
        <legend className="lbl">{legend}</legend>
        <div className="opts">
          {options.map((c) => (
            <label key={c.id}>
              <input
                type="radio"
                name={legend}
                value={c.id}
                checked={choice === c.id}
                onChange={() => setChoice(c.id)}
              />
              <span>
                {c.name} <span className="pop">{percentile(c.popularity)}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="acts">
        <button className="btn pri" type="submit" disabled={busy || !choice || choice === current}>
          {submit}
        </button>
        <small>{note}</small>
      </div>
    </form>
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
        (found.results.length > 0 ? (
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
        <span className="lbl">Downloads per episode</span>
        <span className="in">
          <input inputMode="numeric" value={downloads} onChange={(e) => setDownloads(e.target.value)} />
        </span>
      </label>
      <label className="field">
        <span className="lbl">Status</span>
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

function RosterCheck({ roster }: { roster: Show[] }) {
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

function NetworkCpm({ cpm, agent }: { cpm: number | null; agent: Session }) {
  const [value, setValue] = useState(cpm == null ? '' : String(cpm))
  const { busy, error, run } = useAction()
  const save = (e: React.FormEvent) => {
    e.preventDefault()
    void run(() => agent.stub.setCpm(Number(value)))
  }
  return (
    <section className="mod" aria-labelledby="cpm-h">
      <div className="mh">
        <span className="lbl" id="cpm-h">
          Network CPM
        </span>
        {cpm == null && <span className="chip">Not set</span>}
      </div>
      <p className="help">Prices each promo slot: downloads per episode × CPM ÷ 1,000.</p>
      <form className="bar" onSubmit={save}>
        <span className="in">
          <span className="pre">$</span>
          <input
            aria-labelledby="cpm-h"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="CPM in dollars, e.g. 20"
          />
        </span>
        <button className="btn" type="submit" disabled={busy || !value.trim() || Number(value) === cpm}>
          Save
        </button>
      </form>
      <Alert error={error} />
    </section>
  )
}
