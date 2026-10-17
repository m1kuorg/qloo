import { useAgent } from 'agents/react'
import { Fragment, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type {
  Budget,
  Comp,
  CrossfeedAgent,
  Launch,
  LaunchInput,
  Question,
  Reply,
  Run,
  RunSnapshot,
  RunSummary,
  Show,
  ShowPatch,
  SlowCall,
  State
} from '../agent'
import { ageWords, type DemographicCheck } from '../demographics'
import type { Ranking } from '../fit'
import { MAX_COMPS, MAX_RUNS_PER_DAY, startOfUtcDay } from '../limits'
import { offeredBy, sameName } from '../resolve'
import type { RosterFormat } from '../roster'
import type { Sample, SampleFigure } from '../sample'
import type { Move, Topic } from '../topic'
import { Alert, bandMeter, listOf, percentile, PickOne, useAction } from './controls'
import { EvidencePanel, type Opened } from './Evidence'
import { InboxPage } from './Inbox'
import { InsertionOrderPanel } from './InsertionOrder'
import { Source } from './Source'
import { sentence, SlowCalls, slowText, StateLine } from './states'

// The session's agent; the server picks the instance from the session cookie.
const useSession = () => useAgent<CrossfeedAgent, State>({ agent: 'CrossfeedAgent', basePath: 'agents/session' })
export type Session = ReturnType<typeof useSession>

// `page` is the server's choice of page: "roster", or "inbox" while GUEST_PITCHES is on.
export function App({ page }: { page: string | undefined }) {
  return <Workspace page={page} agent={useSession()} />
}

// The page for a connected session; tests render it from a session's synced state.
export function Workspace({ page, agent }: { page: string | undefined; agent: Session }) {
  // An earlier run being viewed: the page shows what it ended with, read-only, instead of the latest.
  const [viewing, setViewing] = useState<{ id: string; state: RunSnapshot } | null>(null)
  const shown = viewing?.state ?? agent.state
  const roster = shown?.roster ?? []
  // The latest run, unless it's a guest pitch run, which the inbox page shows instead.
  const run = shown?.run && shown.booking?.run !== shown.run.id ? shown.run : null
  const runs = agent.state?.runs ?? []
  const sample = agent.state?.sample ?? null
  const sampleLaunch = sample && 'name' in sample.launch ? sample.launch.name : null
  // Live, never a run's snapshot: calls waiting on Qloo right now. Sessions from before it have none.
  const slowCalls = agent.state?.slowCalls ?? []
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
  const shell = sample && <SampleShell sample={sample} />
  if (page === 'inbox') {
    const lastRun = agent.state?.run
    const pitchRun = lastRun && agent.state?.booking?.run === lastRun.id ? lastRun : null
    return (
      <>
        {shell}
        <InboxPage
          inbox={agent.state?.inbox ?? null}
          roster={agent.state?.roster ?? []}
          booking={agent.state?.booking ?? null}
          ranking={pitchRun?.status === 'running'}
          runLog={
            pitchRun && (
              <>
                {pitchRun.status === 'waiting' && pitchRun.question && (
                  <OpenQuestion key={pitchRun.question.id} question={pitchRun.question} launch={null} agent={agent} />
                )}
                <RunLog run={pitchRun} />
              </>
            )
          }
          slowCalls={slowCalls}
          loadInbox={(source) => agent.stub.loadInbox(source)}
          confirmWork={(pitchId, entityId) => agent.stub.confirmWork(pitchId, entityId)}
          startPitches={(input) => agent.stub.startPitches(input)}
          openCall={openCall}
          opened={opened}
        />
      </>
    )
  }
  return (
    <>
      {shell}
      <LaunchHeader
        key={sampleLaunch ?? 'none'}
        suggested={sampleLaunch}
        launch={shown?.launch ?? null}
        hasRoster={roster.length > 0}
        slowCalls={slowCalls}
        run={run}
        viewing={viewing && runNumber(runs, viewing.id)}
        back={() => setViewing(null)}
        startLaunch={(input) => agent.stub.startLaunch(input)}
        openCall={openCall}
        opened={opened?.call ?? null}
      />
      <main className="main">
        <div className="chart-col">
          <FitChart
            ranking={shown?.ranking ?? null}
            leftOut={shown?.run?.exclusions ?? []}
            demographics={shown?.demographics ?? null}
            topic={shown?.topic ?? null}
            failed={roster.filter((s) => s.resolution === 'failed' && !s.excluded).map((s) => s.name)}
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
            {sample && !viewing ? (
              <SampleNotice sample={sample} clear={() => agent.stub.clearSample()} />
            ) : (
              <p className="help sec-help">
                {viewing
                  ? `As it was when run ${runNumber(runs, viewing.id)} ended, with that run's exclusions.`
                  : "Paste your network's show names, one per line, or upload a CSV. Crossfeed looks each one up in Qloo."}
              </p>
            )}
            {!viewing && <RosterFailures roster={roster} />}
            {!viewing && (
              <RosterImport roster={roster} importRoster={(text, format) => agent.stub.importRoster(text, format)} />
            )}
            <RosterTable
              roster={roster}
              selected={viewing ? null : (show?.name ?? null)}
              select={viewing ? null : setSelected}
              slowCalls={slowCalls}
              openCall={openCall}
              opened={opened?.call ?? null}
            />
          </section>
        </div>
        <aside className="rail" aria-label="Details">
          {run?.status === 'waiting' && run.question && (
            <OpenQuestion key={run.question.id} question={run.question} launch={shown?.launch ?? null} agent={agent} />
          )}
          {shown?.insertionOrder && (
            <InsertionOrderPanel
              key={`${viewing?.id ?? 'latest'} ${shown.insertionOrder.id}`}
              order={shown.insertionOrder}
              roster={roster}
              cpm={shown.cpm}
              sampleCpm={shown.sample?.cpm ?? false}
              budget={run?.id === shown.insertionOrder.run ? run.budget : null}
              actions={
                viewing ||
                (run?.id === shown.insertionOrder.run && (run.status === 'running' || run.status === 'waiting'))
                  ? null
                  : {
                      edit: (lines) => agent.stub.editInsertionOrder(shown.insertionOrder!.id, lines),
                      approve: () => agent.stub.approveInsertionOrder(shown.insertionOrder!.id)
                    }
              }
              readOnly={
                viewing
                  ? `Run ${runNumber(runs, viewing.id)}'s order, read-only.`
                  : 'Edit and approve it once the run ends.'
              }
            />
          )}
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
          {!viewing && (
            <NetworkCpm
              key={agent.state?.cpm ?? 'none'}
              cpm={agent.state?.cpm ?? null}
              sample={sample?.cpm ?? false}
              agent={agent}
            />
          )}
        </aside>
      </main>
    </>
  )
}

const runLabel: Record<Run['status'], string> = {
  running: 'Running',
  waiting: 'Waiting on you',
  completed: 'Completed',
  stopped: 'Stopped at a limit',
  failed: 'Failed'
}

// Runs are numbered in the order this session started them.
const runNumber = (runs: RunSummary[], id: string) => runs.findIndex((r) => r.id === id) + 1

// The launch header: start a run from a released launch's name, or from up to three comps for an
// unreleased one, then follow it here. While an earlier run is viewed, it shows that run and a way
// back instead of the form.
function LaunchHeader({
  suggested,
  launch,
  hasRoster,
  slowCalls,
  run,
  viewing,
  back,
  startLaunch,
  openCall,
  opened
}: {
  suggested: string | null // the sample launch, prefilled for the visitor to start
  launch: Launch | null
  hasRoster: boolean
  slowCalls: SlowCall[]
  run: Run | null
  viewing: number | null // the number of the earlier run shown
  back: () => void
  startLaunch: (input: LaunchInput) => Promise<unknown>
  openCall: (call: string) => void
  opened: string | null
}) {
  const [name, setName] = useState(suggested ?? '')
  const [unreleased, setUnreleased] = useState(false)
  const [comps, setComps] = useState<string[]>(Array(MAX_COMPS).fill(''))
  const action = useAction()
  const running = run?.status === 'running'
  const named = comps.filter((c) => c.trim())
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!unreleased) {
      if (await action.run(() => startLaunch({ name }))) setName('')
    } else if (await action.run(() => startLaunch({ comps: named }))) setComps(Array(MAX_COMPS).fill(''))
  }
  // The launch to run again once its run has ended: from its comps, if it has any.
  const launchComps = launch?.comps ?? [] // sessions from before comps have none
  const again: LaunchInput | null =
    run && !running && launch
      ? launchComps.length
        ? { comps: launchComps.map((c) => c.name) }
        : launch.name
          ? { name: launch.name }
          : null
      : null
  // The current step is the latest note still running; between tool calls, Claude is choosing the next.
  const step = run ? run.notes.findLastIndex((n) => n.status === 'running') : -1
  return (
    <section className="hd" aria-label="Launch">
      <div className="hd-row">
        <div>
          <h1>
            <span>Launch ·</span> {launch?.name ?? (launchComps.length ? 'Unreleased, from comps' : 'None yet')}
          </h1>
          {launch?.name && <LaunchMatch launch={launch} running={running} openCall={openCall} opened={opened} />}
          {launchComps.length > 0 && (
            <LaunchComps comps={launchComps} running={running} openCall={openCall} opened={opened} />
          )}
          {!launch && (
            <StateLine kind="empty">
              {hasRoster
                ? 'No launch yet. Name a released launch below and start a run to rank the roster.'
                : 'No launch yet. Import a roster first, then name a released launch to rank it.'}
            </StateLine>
          )}
        </div>
        {run && (
          <div className="status" role="status">
            {run.status === 'failed' || run.status === 'stopped' ? (
              <StateLine kind="error" word={runLabel[run.status]}>
                {run.error}
              </StateLine>
            ) : (
              <b>{runLabel[run.status]}</b>
            )}
            {run.replayed && (
              <>
                {' '}
                <span className="chip">Replayed</span>
                <p>
                  {run.replayed}, so this is the stored sample run, replayed with its answers. Nothing new was asked of
                  Qloo or Claude.
                </p>
              </>
            )}
            {run.status === 'running' && (
              <p>{step >= 0 ? `${run.notes[step].text} · step ${step + 1}` : 'Waiting for Claude'}</p>
            )}
            <SlowCalls calls={slowCalls.filter((c) => c.run === run.id)} />
            {run.status === 'waiting' && <p>Answer the agent's question to go on.</p>}
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
          <span className="launch-kind" role="radiogroup" aria-label="The launch is">
            {[false, true].map((kind) => (
              <label key={String(kind)}>
                <input
                  type="radio"
                  name="launch-kind"
                  checked={unreleased === kind}
                  onChange={() => setUnreleased(kind)}
                  disabled={action.busy || running}
                />
                <span>{kind ? 'Unreleased, from comps' : 'Released'}</span>
              </label>
            ))}
          </span>
          {unreleased ? (
            comps.map((comp, i) => (
              <input
                key={i}
                className="comp-name"
                aria-label={`Comp ${i + 1}`}
                value={comp}
                onChange={(e) => setComps(comps.map((c, j) => (j === i ? e.target.value : c)))}
                placeholder={['Blank Check', 'Filmspotting', 'You Must Remember This'][i]}
                disabled={action.busy || running}
              />
            ))
          ) : (
            <input
              aria-label="Released launch"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="The Big Picture"
              disabled={action.busy || running}
            />
          )}
          <button
            className="btn pri"
            type="submit"
            disabled={action.busy || running || (unreleased ? named.length === 0 : !name.trim())}
          >
            Start run
          </button>
          {!unreleased && suggested && name === suggested && <small className="smp">Sample launch</small>}
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
      <Alert error={action.error} />
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
        <StateLine kind="failed">
          The launch isn&apos;t resolved, so nothing can be ranked: {sentence(match.error ?? 'the lookup failed')}
        </StateLine>
      ) : (
        <StateLine kind="missed">No show by this name in Qloo.</StateLine>
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

// The comps standing in for an unreleased launch: each confirmed one as its Qloo match, the rest
// with what's still needed, and each with the search it came from.
function LaunchComps({
  comps,
  running,
  openCall,
  opened
}: {
  comps: Comp[]
  running: boolean
  openCall: (call: string) => void
  opened: string | null
}) {
  const state = (c: Comp) => {
    if (c.status === 'rejected') return 'not confirmed'
    if (!c.match) return running ? 'looking it up' : 'not looked up'
    if (c.match.resolution === 'missed') return 'not in Qloo'
    if (c.match.resolution === 'failed') return 'lookup failed'
    return 'to confirm'
  }
  return (
    <p className="sub-line comps">
      <Source of="qloo" /> Comps:{' '}
      {comps.map((c, i) => (
        <span key={c.name}>
          {i > 0 && ' · '}
          {c.status === 'confirmed' && c.entity ? (
            <span className="ent">
              <b>{c.entity.name}</b> <span className="pop">{percentile(c.entity.popularity)}</span>
            </span>
          ) : (
            <>
              <b>{c.name}</b> <span className="tg">{state(c)}</span>
            </>
          )}
          {c.match && (
            <>
              {' '}
              <button
                type="button"
                className="call"
                aria-pressed={c.match.evidence === opened}
                aria-controls="evidence"
                aria-label={`Evidence for the comp ${c.name}: call ${c.match.evidence}`}
                onClick={() => openCall(c.match!.evidence)}
              >
                {c.match.evidence}
              </button>
            </>
          )}
        </span>
      ))}
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
        <span className="chips">
          {run.replayed && <span className="chip">Replayed</span>}
          <span className="chip">{runLabel[run.status]}</span>
        </span>
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
      {(run.budget || run.exclusions) && (
        <dl className="rec">
          {run.budget && (
            <div className="rec-row">
              <dt>Slot budget</dt>
              <dd>{budgetText(run.budget)}</dd>
            </div>
          )}
          {run.exclusions && (
            <div className="rec-row">
              <dt>Left out</dt>
              <dd>{run.exclusions.length ? run.exclusions.join(', ') : 'None'}</dd>
            </div>
          )}
        </dl>
      )}
    </section>
  )
}

// The confirm form's "None of these", until the reply sends it as null.
const NONE = 'none'

const budgetText = (b: Budget) => ('slots' in b ? `${b.slots} promo slots` : `$${b.dollars.toLocaleString('en-US')}`)

// The agent's open question, the rail's primary action: the run waits here until it's answered.
function OpenQuestion({ question, launch, agent }: { question: Question; launch: Launch | null; agent: Session }) {
  const { busy, error, run } = useAction()
  const [choice, setChoice] = useState<string | undefined>(undefined)
  const [text, setText] = useState('')
  const [unit, setUnit] = useState<'slots' | 'dollars'>('slots')
  const [amount, setAmount] = useState('')
  const [exclude, setExclude] = useState<string[]>([])
  // Asked again for comps, the programmer edits the ones they gave.
  const [comps, setComps] = useState(() => Array.from({ length: MAX_COMPS }, (_, i) => launch?.comps?.[i]?.name ?? ''))
  // The comps to confirm, in the question's order, with what each offers; a single match starts picked.
  const confirming = question.options.map((name) => ({
    name,
    offered: offeredBy(launch?.comps?.find((c) => c.name === name)?.match ?? null)
  }))
  const [picks, setPicks] = useState<Record<string, string>>(() =>
    question.kind === 'confirm_comps'
      ? Object.fromEntries(confirming.flatMap((c) => (c.offered.length === 1 ? [[c.name, c.offered[0].id]] : [])))
      : {}
  )
  const reply = (): Reply => {
    const note = text.trim() ? { text } : {}
    if (question.kind === 'budget') {
      const digits = amount.replace(/[,\s$]/g, '')
      return { ...note, ...(digits && { [unit]: Number(digits) }) }
    }
    if (question.kind === 'exclusions') return { ...note, exclude }
    if (question.kind === 'comps') return { ...note, comps: comps.filter((c) => c.trim()) }
    if (question.kind === 'confirm_comps')
      return { ...note, picks: question.options.map((name) => (picks[name] === NONE ? null : picks[name])) }
    return { ...note, ...(choice !== undefined && { choice }) }
  }
  const unpicked = question.kind === 'confirm_comps' && question.options.some((name) => !picks[name])
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    void run(() => agent.stub.answer(question.id, reply()))
  }
  const toggle = (name: string) =>
    setExclude((names) => (names.includes(name) ? names.filter((n) => n !== name) : [...names, name]))
  return (
    <section className="mod ask" aria-labelledby="ask-h">
      <div className="mh">
        <span className="lbl" id="ask-h">
          Agent asks
        </span>
        <span className="chips">
          <Source of="agent" />
          <span className="chip">Waiting on you</span>
        </span>
      </div>
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <legend className="q">{question.question}</legend>
          {(question.kind === 'choice' || question.kind === 'launch') && question.options.length > 0 && (
            <div className="opts">
              {question.options.map((option) => (
                <label key={option}>
                  <input
                    type="radio"
                    name="ask-choice"
                    checked={choice === option}
                    onChange={() => {
                      setChoice(option)
                      // A launch is a pick or a name, never both.
                      if (question.kind === 'launch') setText('')
                    }}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          )}
          {question.kind === 'budget' && (
            <>
              <p className="help">The insertion order is checked against it.</p>
              <div className="opts">
                <label>
                  <input type="radio" name="ask-unit" checked={unit === 'slots'} onChange={() => setUnit('slots')} />
                  <span>Promo slots</span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="ask-unit"
                    checked={unit === 'dollars'}
                    onChange={() => setUnit('dollars')}
                  />
                  <span>A dollar budget</span>
                </label>
              </div>
              <span className="in">
                {unit === 'dollars' && <span className="pre">$</span>}
                <input
                  aria-label={unit === 'slots' ? 'Promo slots' : 'Dollar budget'}
                  inputMode={unit === 'slots' ? 'numeric' : 'decimal'}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={unit === 'slots' ? 'Slots, e.g. 20' : 'Budget, e.g. 150,000'}
                />
              </span>
            </>
          )}
          {question.kind === 'exclusions' &&
            (question.options.length > 0 ? (
              <>
                <p className="help">Left out of this run only; the roster keeps them.</p>
                <div className="opts">
                  {question.options.map((name) => (
                    <label key={name}>
                      <input type="checkbox" checked={exclude.includes(name)} onChange={() => toggle(name)} />
                      <span>{name}</span>
                    </label>
                  ))}
                </div>
              </>
            ) : (
              <p className="help">No roster show can be scored yet, so there's nothing to leave out.</p>
            ))}
          {question.kind === 'comps' && (
            <>
              <p className="help">Released shows with listeners like the launch's. All of them are scored together.</p>
              <div className="field comp-names" role="group" aria-labelledby="ask-comps">
                <span className="lbl" id="ask-comps">
                  Comps, up to {MAX_COMPS}
                </span>
                {comps.map((comp, i) => (
                  <span className="in" key={i}>
                    <input
                      aria-label={`Comp ${i + 1}`}
                      value={comp}
                      onChange={(e) => setComps(comps.map((c, j) => (j === i ? e.target.value : c)))}
                    />
                  </span>
                ))}
              </div>
            </>
          )}
          {question.kind === 'confirm_comps' &&
            confirming.map(({ name, offered }, i) => (
              <fieldset key={name} className="confirm">
                <legend className="lbl">{name}</legend>
                <div className="opts">
                  {[...offered, null].map((c) => (
                    <label key={c?.id ?? NONE}>
                      <input
                        type="radio"
                        name={`confirm-${i}`}
                        checked={picks[name] === (c?.id ?? NONE)}
                        onChange={() => setPicks({ ...picks, [name]: c?.id ?? NONE })}
                      />
                      {c ? (
                        <span>
                          {c.name} <span className="pop">{percentile(c.popularity)}</span>
                        </span>
                      ) : (
                        <span>None of these</span>
                      )}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          <label className="field">
            <span className="lbl">
              {question.kind === 'launch'
                ? question.options.length > 0
                  ? 'Or the name Qloo lists it under'
                  : 'The name Qloo lists it under'
                : question.kind === 'comps' && launch?.name
                  ? 'Or the name Qloo lists it under'
                  : question.kind !== 'choice'
                    ? 'Note for the agent, optional'
                    : question.options.length > 0
                      ? 'Or type your own answer'
                      : 'Your answer'}
            </span>
            <span className="in">
              <input
                value={text}
                onChange={(e) => {
                  setText(e.target.value)
                  if (question.kind === 'launch') setChoice(undefined)
                }}
              />
            </span>
          </label>
          <div className="acts">
            <button className="btn pri" type="submit" disabled={unpicked}>
              Answer
            </button>
            {question.kind === 'exclusions' && <small>Leave all unticked for no exclusions.</small>}
            {question.kind === 'confirm_comps' && <small>Only the comps you confirm are scored.</small>}
          </div>
        </fieldset>
      </form>
      <Alert error={error} />
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
                  <b>Run {r.n}</b> · {r.pitchesFor ? `Pitches for ${r.pitchesFor}` : (r.launch ?? 'From comps')}{' '}
                  <span className="tg">
                    {new Date(r.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </span>
                <span className="tg">
                  {runLabel[r.status]}
                  {r.replayed && ' · Replayed'}
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

// A move as the chart sets it: ▲ for a climb over topic rank, ▼ for a fall, = for none.
const moveGlyph = ({ move }: Move) => (move > 0 ? `▲${move}` : move < 0 ? `▼${-move}` : '=')
const moveWords = ({ move }: Move) =>
  move === 0
    ? 'Same as topic rank'
    : `${move > 0 ? 'Up' : 'Down'} ${Math.abs(move)} place${Math.abs(move) === 1 ? '' : 's'}`

// The Weekly Chart: the roster ranked by listener overlap with the launch, position first, then band.
// Raw affinities stay in the ranking call's evidence. Beside fit rank, last week is the rank a
// topic-only plan gives each show, and the moves between them are what Qloo changed.
function FitChart({
  ranking,
  leftOut,
  demographics,
  topic,
  failed,
  running,
  openCall,
  opened
}: {
  ranking: Ranking | null
  leftOut: string[] // shows the run's exclusions answer left out
  demographics: DemographicCheck | null // the finalists checked against the launch's listeners
  topic: Topic | null
  failed: string[] // roster shows whose Qloo lookup failed
  running: boolean
  openCall: (call: string) => void
  opened: string | null
}) {
  // The climber whose "why it moved" line is open.
  const [why, setWhy] = useState<string | null>(null)
  if (!ranking)
    return running ? (
      <div className="sec">
        <StateLine kind="loading">The fit chart appears here once the agent ranks the roster.</StateLine>
      </div>
    ) : null
  const comps = ranking.anchors.length > 1
  const tagged = ranking.rows.some((r) => r.sharedTags)
  const moves = topic?.status === 'ranked' ? new Map(topic.moves.map((m) => [m.show, m])) : null
  const climbers = topic?.moves.some((m) => m.climber) ?? false
  // A ranking without shows Qloo failed to look up is partial, never presented as the whole roster.
  const missing = ranking.error ? [] : ranking.notScored.filter((n) => failed.includes(n.show)).map((n) => n.show)
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
        {listOf(ranking.anchors.map((a) => a.name))}. Bands are thirds of this ranking, and the top five, after any
        shows left out, are finalists.
        {moves && ' Last week is the rank a topic-only plan gives each show, from names and descriptions alone.'}
      </p>
      {demographics && !ranking.error && (
        <DemographicSummary check={demographics} ranking={ranking} openCall={openCall} opened={opened} />
      )}
      {topic &&
        !ranking.error &&
        (topic.status === 'ranking' ? (
          <StateLine kind="loading">Ranking the roster by topic alone for the last-week column…</StateLine>
        ) : topic.status !== 'ranked' ? (
          <StateLine kind="error">No topic column: {topic.error}. The fit ranking stands without it.</StateLine>
        ) : null)}
      {moves && climbers && !ranking.error && (
        <p className="legend">
          <i className="bul" aria-hidden="true" />
          Bullet: up 3+ places on topic rank. Select a climber for why it moved.
        </p>
      )}
      {missing.length > 0 && (
        <StateLine kind="failed">
          Partial ranking: {listOf(missing)} {missing.length === 1 ? "isn't" : "aren't"} in it, because{' '}
          {missing.length === 1 ? 'its Qloo lookup' : 'their Qloo lookups'} failed.
        </StateLine>
      )}
      {ranking.error ? (
        <StateLine kind="failed">Nothing is ranked: {sentence(ranking.error)}</StateLine>
      ) : (
        <table className="chart fit-chart" aria-labelledby="fit-h">
          <colgroup>
            <col className="c-pos" />
            {moves && <col className="c-lw" />}
            {moves && <col className="c-mv" />}
            <col />
            <col className="c-band" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">
                This week<small>fit rank</small>
              </th>
              {moves && (
                <th scope="col">
                  Last week<small>topic rank</small>
                </th>
              )}
              {moves && (
                <th scope="col">
                  Move<small>vs topic</small>
                </th>
              )}
              <th scope="col">
                Show
                <small>
                  {tagged && 'shared Qloo tags · '}
                  {comps ? 'Qloo match · leading comp' : 'Qloo match'}
                </small>
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
              const shared = r.sharedTags ?? null // runs from before shared tags have none
              const flagged = r.finalist ? demographics?.rows.find((d) => d.show === r.show)?.reasons : null
              const move = moves?.get(r.show)
              const open = move?.climber && why === r.show
              const callButton = (call: string, label: string) => (
                <button
                  type="button"
                  className="call"
                  aria-pressed={call === opened}
                  aria-controls="evidence"
                  aria-label={`${label}: call ${call}`}
                  onClick={() => openCall(call)}
                >
                  {call}
                </button>
              )
              return (
                <Fragment key={r.show}>
                  <tr
                    data-finalist={r.finalist || undefined}
                    data-left-out={leftOut.includes(r.show) || undefined}
                    className={open ? 'hot' : undefined}
                  >
                    <td className="pos">
                      {r.rank}
                      {move?.climber && <i className="bul" aria-hidden="true" />}
                    </td>
                    {moves && <td className="lw">{move?.topicRank ?? '–'}</td>}
                    {moves && (
                      <td className={`mv${!move || move.move < 0 ? ' dn' : move.move === 0 ? ' eq' : ''}`}>
                        {move && (
                          <>
                            <span aria-hidden="true">{moveGlyph(move)}</span>
                            <span className="vh">{moveWords(move)}</span>
                          </>
                        )}
                      </td>
                    )}
                    <td>
                      <div className="nm-row">
                        {move?.climber ? (
                          <button
                            type="button"
                            className="row-open"
                            aria-expanded={open}
                            aria-controls={`why-${r.rank}`}
                            onClick={() => setWhy(open ? null : r.show)}
                          >
                            <span className="nm">{r.show}</span>
                          </button>
                        ) : (
                          <span className="nm">{r.show}</span>
                        )}
                        {r.finalist && <span className="chip">Finalist</span>}
                        {leftOut.includes(r.show) && <span className="chip">Left out</span>}
                        {flagged?.length ? <span className="chip flag">Listeners differ</span> : null}
                      </div>
                      {shared && (
                        <div className="tg">
                          {shared.error
                            ? `Shared tags failed: ${shared.error}`
                            : shared.tags.length > 0
                              ? shared.tags.join('\u00a0· ') // a separator never starts a line
                              : 'No distinctive shared tags'}{' '}
                          {callButton(shared.call, `Evidence for the tags ${r.show} shares`)}
                        </div>
                      )}
                      {notes.length > 0 && <div className="tg">{notes.join(' · ')}</div>}
                      {flagged?.length ? <div className="flag-why">{flagged.join('. ')}.</div> : null}
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
                  {open && (
                    <tr className="why" id={`why-${r.rank}`}>
                      <td colSpan={3} />
                      {/* The show column and every column after it. */}
                      <td colSpan={2}>
                        <span className="lbl">Why it moved</span>
                        <Source of="qloo" /> Topic alone ranks it {move.topicRank}; listener overlap with{' '}
                        {listOf(ranking.anchors.map((a) => a.name))} ranks it {r.rank}.{' '}
                        {callButton(ranking.call, `Evidence for ${r.show}'s fit`)}
                        {r.leadingComp && ` Led by ${r.leadingComp.name}.`}
                        {shared && !shared.error && shared.tags.length > 0 && (
                          <>
                            {' '}
                            Shared tags: {listOf(shared.tags)}.{' '}
                            {callButton(shared.call, `Evidence for the tags ${r.show} shares`)}
                          </>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
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

// The demographic check in one line, citing its call: who the launch's listeners are, in words,
// and how many finalists' listeners differ. The values stay in the call's evidence.
function DemographicSummary({
  check,
  ranking,
  openCall,
  opened
}: {
  check: DemographicCheck
  ranking: Ranking
  openCall: (call: string) => void
  opened: string | null
}) {
  const cite = (
    <button
      type="button"
      className="call"
      aria-pressed={check.call === opened}
      aria-controls="evidence"
      aria-label={`Evidence for the demographic check: call ${check.call}`}
      onClick={() => openCall(check.call)}
    >
      {check.call}
    </button>
  )
  if (!check.profile)
    return (
      <StateLine kind="failed" role="alert">
        Demographics {cite} not checked: {check.error}.
      </StateLine>
    )
  const { from, ages, skew } = check.profile
  const who = [
    ages.length ? `over-index at ages ${listOf(ages.map(ageWords))}` : 'over-index at no age band',
    skew ? `skew ${skew}` : 'have no strong gender skew'
  ]
  const noData = ranking.anchors.filter((a) => !from.includes(a.name)).map((a) => a.name)
  const unchecked = check.rows.filter((r) => r.reasons === null).map((r) => r.show)
  const flagged = check.rows.filter((r) => r.reasons?.length).length
  return (
    <p className="help sec-help demo-sum">
      <b>Demographics</b> {cite} · Checked against the listeners of {listOf(from)}
      {from.length > 1 && ' on average'}, who {who.join(' and ')}.
      {noData.length > 0 && ` Qloo had no demographics for ${listOf(noData)}.`}{' '}
      <b>
        {flagged
          ? `${flagged} of ${check.rows.length} finalists' listeners differ.`
          : `No demographic mismatches among the ${check.rows.length} finalists.`}
      </b>
      {unchecked.length > 0 &&
        ` Qloo had no demographics for ${listOf(unchecked)}, so ${unchecked.length > 1 ? "they weren't" : "it wasn't"} checked.`}
    </p>
  )
}

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

// The shows Qloo failed to look up, which no ranking can score until they're looked up again.
function RosterFailures({ roster }: { roster: Show[] }) {
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

function RosterTable({
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
        <col style={{ width: 144 }} />
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

function NetworkCpm({ cpm, sample, agent }: { cpm: number | null; sample: boolean; agent: Session }) {
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
      {sample && <small className="smp">Arbitrary sample figure, not the network's. Enter your own.</small>}
      <Alert error={error} />
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

// The sample network's name and not-affiliated notice, in the top bar the server renders.
function SampleShell({ sample }: { sample: Sample }) {
  const network = document.getElementById('shell-network')
  const notice = document.getElementById('shell-notice')
  return (
    <>
      {network && createPortal(<span className="net">{sample.network} · sample network</span>, network)}
      {notice &&
        createPortal(<span className="sample-tag">Sample data · not affiliated with {sample.network}</span>, notice)}
    </>
  )
}

// The roster's notice while it is the sample network, and a way back to an empty roster.
function SampleNotice({ sample, clear }: { sample: Sample; clear: () => Promise<void> }) {
  const { busy, error, run } = useAction()
  return (
    <div className="sample-notice">
      <p className="help">
        <b>{sample.network}.</b> {sample.notice}
      </p>
      <div className="acts">
        <button type="button" className="btn" disabled={busy} onClick={() => void run(clear)}>
          Clear sample network
        </button>
        <small>Empties the roster so you can import your own. Or edit any figure.</small>
      </div>
      <Alert error={error} />
    </div>
  )
}
