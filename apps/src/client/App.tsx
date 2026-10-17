import { useAgent } from 'agents/react'
import { useRef, useState } from 'react'
import type { CrossfeedAgent, Launch, Run, RunSnapshot, RunSummary, Show, ShowPatch, State } from '../agent'
import type { Band, Ranking } from '../fit'
import { MAX_RUNS_PER_DAY, startOfUtcDay } from '../limits'
import { sameName } from '../resolve'
import type { RosterFormat } from '../roster'
import { EvidencePanel, type Opened } from './Evidence'
import { Source } from './Source'

// The session's agent; the server picks the instance from the session cookie.
const useSession = () => useAgent<CrossfeedAgent, State>({ agent: 'CrossfeedAgent', basePath: 'agents/session' })
type Session = ReturnType<typeof useSession>

export function App() {
  const agent = useSession()
  // An earlier run being viewed: the page shows what it ended with, read-only, instead of the latest.
  const [viewing, setViewing] = useState<{ id: string; state: RunSnapshot } | null>(null)
  const shown = viewing?.state ?? agent.state
  const roster = shown?.roster ?? []
  const run = shown?.run ?? null
  const runs = agent.state?.runs ?? []
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
        launch={shown?.launch ?? null}
        run={run}
        viewing={viewing && runNumber(runs, viewing.id)}
        back={() => setViewing(null)}
        startLaunch={(name) => agent.stub.startLaunch({ name })}
        openCall={openCall}
        opened={opened?.call ?? null}
      />
      <main className="main">
        <div className="chart-col">
          <FitChart
            ranking={shown?.ranking ?? null}
            running={run?.status === 'running'}
            openCall={openCall}
            opened={opened?.call ?? null}
          />
          <section className="sec" aria-labelledby="roster-h">
            <div className="mh">
              <h2 className="lbl" id="roster-h">
                Roster
              </h2>
            </div>
            <p className="help sec-help">
              {viewing
                ? `As it was when run ${runNumber(runs, viewing.id)} ended, with that run's exclusions.`
                : "Paste your network's show names, one per line, or upload a CSV. Crossfeed looks each one up in Qloo."}
            </p>
            {!viewing && (
              <RosterImport roster={roster} importRoster={(text, format) => agent.stub.importRoster(text, format)} />
            )}
            <RosterTable
              roster={roster}
              selected={viewing ? null : (show?.name ?? null)}
              select={viewing ? null : setSelected}
              openCall={openCall}
              opened={opened?.call ?? null}
            />
          </section>
        </div>
        <aside className="rail" aria-label="Details">
          {run && <RunLog run={run} />}
          {runs.length > 0 && (
            <RunList
              runs={runs}
              viewing={viewing?.id ?? null}
              view={async (id) => setViewing(id === null ? null : { id, state: await agent.stub.getRun(id) })}
            />
          )}
          {show && !viewing && <ShowEditor key={show.name} show={show} agent={agent} close={() => setSelected(null)} />}
          <RosterCheck roster={roster} />
          <EvidencePanel opened={opened} />
          {!viewing && <NetworkCpm key={agent.state?.cpm ?? 'none'} cpm={agent.state?.cpm ?? null} agent={agent} />}
        </aside>
      </main>
    </>
  )
}

const runLabel: Record<Run['status'], string> = {
  running: 'Running',
  completed: 'Completed',
  stopped: 'Stopped at a limit',
  failed: 'Failed'
}

// Runs are numbered in the order this session started them.
const runNumber = (runs: RunSummary[], id: string) => runs.findIndex((r) => r.id === id) + 1

// The launch header: start a run from a released launch's name, then follow it here. While an
// earlier run is viewed, it shows that run and a way back instead of the form.
function LaunchHeader({
  launch,
  run,
  viewing,
  back,
  startLaunch,
  openCall,
  opened
}: {
  launch: Launch | null
  run: Run | null
  viewing: number | null // the number of the earlier run shown
  back: () => void
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
  // The launch to run again once its run has ended.
  const again = run && !running ? (launch?.name ?? null) : null
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
            {(run.status === 'failed' || run.status === 'stopped') && <p>{run.error}</p>}
          </div>
        )}
      </div>
      {viewing ? (
        <p className="viewing">
          <span className="chip">Run {viewing}</span> An earlier run, read-only.{' '}
          <button type="button" className="lnk" onClick={back}>
            Back to the latest run
          </button>
        </p>
      ) : (
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
          {again && (
            <>
              <button
                className="btn"
                type="button"
                disabled={action.busy}
                onClick={() => void action.run(() => startLaunch(again))}
              >
                Run again
              </button>
              <small>A new run; this one stays in Runs to compare.</small>
            </>
          )}
        </form>
      )}
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
        {(run.status === 'failed' || run.status === 'stopped') && (
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

// Every run this session started, newest first. An earlier run opens read-only, to compare its plan
// with the latest.
function RunList({
  runs,
  viewing,
  view
}: {
  runs: RunSummary[]
  viewing: string | null
  view: (id: string | null) => Promise<void>
}) {
  const { busy, error, run } = useAction()
  const today = runs.filter((r) => Date.parse(r.startedAt) >= startOfUtcDay()).length
  const latest = runs.at(-1)?.id
  return (
    <section className="mod" aria-labelledby="runs-h">
      <div className="mh">
        <span className="lbl" id="runs-h">
          Runs
        </span>
        <span className="chip">
          {today} of {MAX_RUNS_PER_DAY} today
        </span>
      </div>
      <ol className="notes runs">
        {runs
          .map((r, i) => ({ ...r, n: i + 1 }))
          .reverse()
          .map((r) => {
            const shown = viewing === null ? r.id === latest : r.id === viewing
            return (
              <li key={r.id} aria-current={shown || undefined}>
                <span>
                  <b>Run {r.n}</b> · {r.launch ?? 'From comps'}{' '}
                  <span className="tg">
                    {new Date(r.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </span>
                <span className="tg">
                  {runLabel[r.status]}
                  {' · '}
                  {shown ? (
                    'Shown'
                  ) : (
                    <button
                      type="button"
                      className="lnk"
                      disabled={busy}
                      aria-label={`View run ${r.n}`}
                      onClick={() => void run(() => view(r.id === latest ? null : r.id))}
                    >
                      View
                    </button>
                  )}
                </span>
              </li>
            )
          })}
      </ol>
      <p className="help">
        Each run starts fresh; earlier ones stay here to compare. A session can start {MAX_RUNS_PER_DAY} runs a UTC day.
      </p>
      <Alert error={error} />
    </section>
  )
}

// Fit bands as the chart words them: a meter of three bars filled from the left, then the word.
const bandMeter: Record<Band, { bars: number; word: string }> = {
  top: { bars: 3, word: 'Strong' },
  middle: { bars: 2, word: 'Good' },
  bottom: { bars: 1, word: 'Fair' }
}

const listOf = (names: string[]) =>
  names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`

// The Weekly Chart: the roster ranked by listener overlap with the launch, position first, then band.
// Raw affinities stay in the ranking call's evidence.
function FitChart({
  ranking,
  running,
  openCall,
  opened
}: {
  ranking: Ranking | null
  running: boolean
  openCall: (call: string) => void
  opened: string | null
}) {
  if (!ranking)
    return running ? <p className="help sec">The fit chart appears here once the agent ranks the roster.</p> : null
  const comps = ranking.anchors.length > 1
  return (
    <section className="sec fit" aria-labelledby="fit-h">
      <div className="mh">
        <h2 className="lbl" id="fit-h">
          Fit chart
        </h2>
        <span className="chips">
          <Source of="qloo" />
          <button
            type="button"
            className="call"
            aria-pressed={ranking.call === opened}
            aria-controls="evidence"
            aria-label={`Evidence for the fit ranking: call ${ranking.call}`}
            onClick={() => openCall(ranking.call)}
          >
            {ranking.call}
          </button>
        </span>
      </div>
      <p className="help sec-help">
        Ranked by how much each show&apos;s listeners overlap the listeners of{' '}
        {listOf(ranking.anchors.map((a) => a.name))}. Bands are thirds of this ranking, and the top five are finalists.
      </p>
      {ranking.error ? (
        <p className="err" role="alert">
          Not scored: {ranking.error}. Nothing is ranked.
        </p>
      ) : (
        <table className="chart fit-chart" aria-labelledby="fit-h">
          <colgroup>
            <col className="c-pos" />
            <col />
            <col className="c-band" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">
                This week<small>fit rank</small>
              </th>
              <th scope="col">
                Show<small>{comps ? 'Qloo match · leading comp' : 'Qloo match'}</small>
              </th>
              <th scope="col">
                Fit band<small>listener overlap</small>
              </th>
            </tr>
          </thead>
          <tbody>
            {ranking.rows.map((r) => {
              const { bars, word } = bandMeter[r.band]
              const notes = [
                !sameName(r.entity.name, r.show) && `Mapped to ${r.entity.name}`,
                comps && (r.leadingComp ? `Led by ${r.leadingComp.name}` : 'Comps contributed evenly')
              ].filter(Boolean)
              return (
                <tr key={r.show} data-finalist={r.finalist || undefined}>
                  <td className="pos">{r.rank}</td>
                  <td>
                    <div className="nm-row">
                      <span className="nm">{r.show}</span>
                      {r.finalist && <span className="chip">Finalist</span>}
                    </div>
                    {notes.length > 0 && <div className="tg">{notes.join(' · ')}</div>}
                  </td>
                  <td>
                    <span className={`band b${bars}`}>
                      <i aria-hidden="true" />
                      <i aria-hidden="true" />
                      <i aria-hidden="true" />
                      {word}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {ranking.notScored.length > 0 && (
        <table className="ev not-scored">
          <caption>Not scored · {ranking.notScored.length}</caption>
          <thead>
            <tr>
              <th scope="col">Show</th>
              <th scope="col">Reason</th>
            </tr>
          </thead>
          <tbody>
            {ranking.notScored.map((n) => (
              <tr key={n.show}>
                <td>{n.show}</td>
                <td>{n.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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
  select: ((name: string) => void) | null // null while an earlier run is viewed, read-only
  openCall: (call: string) => void
  opened: string | null
}) {
  if (roster.length === 0) return <p className="empty">No roster yet. Paste show names above to import one.</p>
  return (
    <table className="chart roster">
      <caption>
        <Source of="qloo" /> Matches from Qloo search, one call per show.{' '}
        {select
          ? 'Select a show to settle or edit it, or open a call for its evidence.'
          : 'Open a call for its evidence.'}
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
              <Match show={show} settle={select && (() => select(show.name))} />
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

function Match({ show, settle }: { show: Show; settle: (() => void) | null }) {
  if (show.resolution === 'pending') return <span className="tg">Looking it up in Qloo…</span>
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
