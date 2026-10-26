import { Fragment, useEffect, useRef, useState } from 'react'
import type { Comp, GuideMark, Launch, LaunchInput, Run, RunSnapshot, RunSummary, Show, SlowCall } from '../agent'
import { ageWords, type DemographicCheck } from '../demographics'
import type { Ranking } from '../fit'
import { inProgress } from '../limits'
import { dollars, slotPrice } from '../order'
import { sameName } from '../resolve'
import { moveGlyph, moveWords } from '../text'
import type { Sample } from '../sample'
import type { Topic } from '../topic'
import { Alert, bandMeter, listOf, percentile, useAction } from './controls'
import { SampleShell, useSession } from './Demo'
import { CallButton, EvidencePanel, useEvidence } from './Evidence'
import { Guide } from './Guide'
import { InsertionOrderPanel } from './InsertionOrder'
import { launchTitle, useLaunchFields } from './LaunchFields'
import type { NetworkPage } from './NetworkPage'
import { CpmRecord, RosterCheck, RosterFailures, RosterImport, RosterTable, ShowEditor } from './RosterModules'
import { OpenQuestion, ORDER_CHANGED, runLabel, RunLog } from './Run'
import { Source } from './Source'
import { sentence, SlowCalls, StateLine } from './states'

// The agent connection the workspace's modules take, as `useSession` (Demo.tsx) opens it.
export type Session = ReturnType<typeof useSession>

// Where the island's pages link, as the server gives them. `orders` is where a launch's approved
// insertion orders export, as `<orders>/<id>.csv`; the demo's export has its own route.
export type Links = { roster: string; orders?: string }

// The demo's roster page, on the visitor's session, with the agent's path and the links the server gives.
export function App({ agentPath, links }: { agentPath: string; links: Links }) {
  return <Workspace agent={useSession(agentPath)} links={links} />
}

// The page for a connected session; tests render it from a session's synced state. With `network`,
// it's a launch's page of that network (Launch.tsx): it ranks the network's roster, read-only here.
export function Workspace({ agent, links, network }: { agent: Session; links: Links; network?: NetworkPage }) {
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
  const { opened, openCall } = useEvidence(agent)
  const oneColumn = useOneColumn()
  // The roster section moves when the page crosses one column, which remounts it; names typed into
  // its import box are kept here so the move doesn't drop them.
  const importDraft = useRef('')
  // The guide's page steps, marked once each while it shows.
  const guiding = useAction()
  const guide = agent.state?.guide
  const markSeen = (mark: GuideMark) => {
    if (sample && !guide?.dismissed && !guide?.seen.includes(mark)) void guiding.run(() => agent.stub.markGuide(mark))
  }
  const shell = sample && <SampleShell sample={sample} />
  // Who edits the roster: the visitor here, or for a launch, the network's members on its roster page.
  const editing = !viewing && !network
  const rosterSection = (
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
          {viewing ? (
            `As it was when run ${runNumber(runs, viewing.id)} ended, with that run's exclusions.`
          ) : network ? (
            <>
              {runs.length > 0
                ? `The latest run ranks ${network.name}'s roster as it stood when that run started.`
                : `Each run ranks ${network.name}'s roster as it stands when the run starts.`}{' '}
              {runs.length > 0 && agent.state?.rosterChanged && (
                <>
                  <b>It has changed since then, so run again to rank it as it is now.</b>{' '}
                </>
              )}
              Edit its shows on{' '}
              <a className="lnk" href={links.roster}>
                the roster page
              </a>
              .
            </>
          ) : (
            "Paste your network's show names, one per line, or upload a CSV. Crossfeed looks each one up in Qloo."
          )}
        </p>
      )}
      {editing && <RosterFailures roster={roster} />}
      {editing && (
        <RosterImport
          roster={roster}
          draft={importDraft}
          importRoster={(text, format) => agent.stub.importRoster(text, format)}
          keepsSettledShows={false}
        />
      )}
      {/* A launch's roster arrives with its first run. */}
      {(!network || roster.length > 0) && (
        <RosterTable
          roster={roster}
          selected={editing ? (show?.name ?? null) : null}
          select={editing ? setSelected : null}
          slowCalls={slowCalls}
          openCall={openCall}
          opened={opened?.call ?? null}
        />
      )}
    </section>
  )
  return (
    <>
      {shell}
      <LaunchHeader
        // A launch's page fills its form in with the launch it plans as that arrives or changes.
        key={network ? `launch ${launchName(agent.state?.launch)}` : (sampleLaunch ?? 'none')}
        suggested={sampleLaunch}
        ownLaunch={Boolean(network)}
        ran={runs.some((r) => !r.pitchesFor)}
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
        {/* Before the chart, so a single column reaches it first; the grid sets it atop the rail when wide. */}
        {run?.status === 'waiting' && run.question && (
          <OpenQuestion key={run.question.id} question={run.question} launch={shown?.launch ?? null} agent={agent} />
        )}
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
            markSeen={markSeen}
            roster={roster}
            cpm={shown?.cpm ?? null}
            sampleCpm={shown?.sample?.cpm ?? false}
          />
          {!oneColumn && rosterSection}
        </div>
        {/* The contract's rail: the open question, the selected show and its evidence, the order to approve. */}
        <aside className="rail" aria-label="Details">
          {agent.state && !viewing && (
            <Guide
              state={agent.state}
              dismiss={() => void guiding.run(() => agent.stub.dismissGuide())}
              error={guiding.error}
            />
          )}
          {show && !viewing && <ShowEditor key={show.name} show={show} agent={agent} close={() => setSelected(null)} />}
          <EvidencePanel opened={opened} />
          {shown?.insertionOrder && (
            <InsertionOrderPanel
              key={`${viewing?.id ?? 'latest'} ${shown.insertionOrder.id}`}
              order={shown.insertionOrder}
              roster={roster}
              cpm={shown.cpm}
              sampleCpm={shown.sample?.cpm ?? false}
              budget={run?.id === shown.insertionOrder.run ? run.budget : null}
              sharedTags={Object.fromEntries(
                (shown.ranking?.rows ?? []).flatMap((r) => (r.sharedTags ? [[r.show, r.sharedTags]] : []))
              )}
              openCall={openCall}
              opened={opened?.call ?? null}
              exportHref={`${links.orders ?? '/api/insertion-orders'}/${shown.insertionOrder.id}.csv`}
              actions={
                viewing || inProgress(run, shown.insertionOrder.run)
                  ? null
                  : {
                      edit: async (lines) => {
                        await agent.stub.editInsertionOrder(shown.insertionOrder!.id, lines)
                      },
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
          {run && (
            <RunLog
              run={run}
              changedNote={shown?.insertionOrder?.run === run.id && shown.insertionOrder.edited ? ORDER_CHANGED : null}
              openCall={openCall}
              opened={opened?.call ?? null}
            />
          )}
          {runs.length > 0 && (
            <RunList
              runs={runs}
              viewing={viewing?.id ?? null}
              view={async (id) => setViewing(id === null ? null : { id, state: await agent.stub.getRun(id) })}
              counted={network ? 'network' : 'visitor'}
            />
          )}
          {(!network || roster.length > 0) && <RosterCheck roster={roster} />}
          {network
            ? // A launch takes its CPM with the roster, so it has none to show before its first run.
              runs.length > 0 && (
                <CpmRecord
                  cpm={shown?.cpm ?? null}
                  network={network}
                  note="Each run takes the network's CPM as it starts."
                />
              )
            : !viewing && (
                <NetworkCpm
                  key={agent.state?.cpm ?? 'none'}
                  cpm={agent.state?.cpm ?? null}
                  sample={sample?.cpm ?? false}
                  agent={agent}
                />
              )}
        </aside>
        {/* In one column the roster follows the rail, so the evidence and the order come right after the chart. */}
        {oneColumn && <div className="chart-col">{rosterSection}</div>}
      </main>
    </>
  )
}

// Whether the page is one column, as style.css lays it out below 960px. Rendered without a window,
// as in tests, it's two.
const ONE_COLUMN = '(max-width: 960px)'
function useOneColumn() {
  const [one, setOne] = useState(() => typeof window !== 'undefined' && window.matchMedia(ONE_COLUMN).matches)
  useEffect(() => {
    const media = window.matchMedia(ONE_COLUMN)
    const change = () => setOne(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  return one
}

// Runs are numbered in the order this session started them.
const runNumber = (runs: RunSummary[], id: string) => runs.findIndex((r) => r.id === id) + 1

// The launch header: start a run from a released launch's name, or from up to three comps for an
// unreleased one, then follow it here. While an earlier run is viewed, it shows that run and a way
// back instead of the form.
function LaunchHeader({
  suggested,
  ownLaunch,
  ran,
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
  // A launch's page, which plans one launch: its form keeps the launch's name or comps, to run again as
  // they are or changed, and a launch from comps goes by them.
  ownLaunch: boolean
  ran: boolean // whether any launch run has started here
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
  const form = useLaunchFields(
    suggested
      ? { name: suggested, comps: [] }
      : ownLaunch && launch
        ? { name: launch.name, comps: launch.comps.map((c) => c.name) }
        : null
  )
  const action = useAction()
  const running = run?.status === 'running'
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if ((await action.run(() => startLaunch(form.input))) && !ownLaunch) form.clear()
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
            <span>Launch ·</span>{' '}
            {launch?.name ??
              (launchComps.length ? (ownLaunch ? launchName(launch) : 'Unreleased, from comps') : 'None yet')}
          </h1>
          {launch?.name && (
            <LaunchMatch launch={launch} running={running} ran={ran} openCall={openCall} opened={opened} />
          )}
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
          {form.fields(action.busy || running)}
          <button className="btn pri" type="submit" disabled={action.busy || running || !form.ready}>
            Start run
          </button>
          {suggested && form.named(suggested) && <small className="smp">Sample launch</small>}
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

const launchName = (launch: Launch | null | undefined) =>
  launch &&
  launchTitle(
    launch.name,
    launch.comps.map((c) => c.name)
  )

function LaunchMatch({
  launch: { name, match },
  running,
  ran,
  openCall,
  opened
}: {
  launch: Launch
  running: boolean
  ran: boolean // a launch's page plans its launch before any run looks it up
  openCall: (call: string) => void
  opened: string | null
}) {
  if (!match)
    return (
      <p className="sub-line tg">
        {running ? 'Looking it up in Qloo…' : ran ? 'Not looked up.' : 'Not run yet. A run looks it up in Qloo.'}
      </p>
    )
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
      <CallButton
        call={match.evidence}
        label={`Evidence for ${name ?? 'the launch'}`}
        opened={opened}
        openCall={openCall}
      />
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
              <CallButton
                call={c.match.evidence}
                label={`Evidence for the comp ${c.name}`}
                opened={opened}
                openCall={openCall}
              />
            </>
          )}
        </span>
      ))}
    </p>
  )
}

// Every run this session started, newest first. An earlier run opens read-only, to compare its plan
// with the latest.
function RunList({
  runs,
  viewing,
  view,
  counted
}: {
  runs: RunSummary[]
  viewing: string | null
  view: (id: string | null) => Promise<void>
  counted: 'visitor' | 'network' // whom the daily limits on model runs count
}) {
  const { busy, error, run } = useAction()
  const latest = runs.at(-1)?.id
  return (
    <section className="mod" aria-labelledby="runs-h">
      <div className="mh">
        <span className="lbl" id="runs-h">
          Runs
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
                    {r.startedBy && ` by ${r.startedBy}`}
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
        Each run starts fresh; earlier ones stay here to compare.{' '}
        {counted === 'network'
          ? "Model runs are limited per UTC day across the network's launches and inbox, whoever starts them. Runs that stop at once have a higher limit of their own."
          : 'Model runs are limited per visitor and per UTC day, across browsers. Runs that replay or stop at once have a higher limit of their own.'}
      </p>
      <Alert error={error} />
    </section>
  )
}

// A move as the chart sets it: ▲ for a climb over topic rank, ▼ for a fall, = for none.

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
  opened,
  markSeen,
  roster,
  cpm,
  sampleCpm
}: {
  ranking: Ranking | null
  leftOut: string[] // shows the run's exclusions answer left out
  demographics: DemographicCheck | null // the finalists checked against the launch's listeners
  topic: Topic | null
  failed: string[] // roster shows whose Qloo lookup failed
  running: boolean
  openCall: (call: string) => void
  opened: string | null
  markSeen: (mark: GuideMark) => void // tells the guide its step was done
  roster: Show[] // for each show's downloads and its sample labels
  cpm: number | null
  sampleCpm: boolean // the CPM is still the sample network's
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
  // Each climber's place among them, top down, so their bullets land down the chart in turn.
  const landing = new Map(topic?.moves.filter((m) => m.climber).map((m, i) => [m.show, i] as const))
  const show = (name: string) => roster.find((s) => s.name === name)
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
          <CallButton call={ranking.call} label="Evidence for the fit ranking" opened={opened} openCall={openCall} />
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
        <table className="chart fit-chart" aria-labelledby="fit-h" data-fit-chart>
          <colgroup>
            <col className="c-pos" />
            {moves && <col className="c-lw" />}
            {moves && <col className="c-mv" />}
            <col />
            <col className="c-band" />
            <col className="c-val" />
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
              <th scope="col" className="r val">
                Slot value<small>per episode</small>
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
              // `cited`: the why-it-moved line cites it, which is a step of the guide.
              const callButton = (call: string, label: string, cited = false) => (
                <CallButton
                  call={call}
                  label={label}
                  opened={opened}
                  openCall={(c) => {
                    openCall(c)
                    if (cited) markSeen('evidence')
                  }}
                />
              )
              return (
                <Fragment key={r.show}>
                  <tr
                    data-show={r.show}
                    data-finalist={r.finalist || undefined}
                    data-left-out={leftOut.includes(r.show) || undefined}
                    className={open ? 'hot' : undefined}
                  >
                    <td className="pos">
                      {r.rank}
                      {move?.climber && (
                        <i
                          className="bul"
                          aria-hidden="true"
                          style={{ '--landing': Math.min(landing.get(r.show) ?? 0, 6) } as React.CSSProperties}
                        />
                      )}
                    </td>
                    {moves && <td className="lw">{move?.topicRank ?? '–'}</td>}
                    {moves && (
                      <td className={`mv${!move || move.move < 0 ? ' dn' : move.move === 0 ? ' eq' : ''}`}>
                        {move && (
                          <>
                            <span aria-hidden="true">{moveGlyph(move.move)}</span>
                            <span className="vh">{moveWords(move.move)}</span>
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
                            onClick={() => {
                              setWhy(open ? null : r.show)
                              if (!open) markSeen('why')
                            }}
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
                      {/* Shown in place of the slot value column when the chart is too narrow for it. */}
                      {cpm !== null && (
                        <div className="tg val-inline">
                          <SlotValue show={show(r.show)} cpm={cpm} sampleCpm={sampleCpm} inline />
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`band b${bars}`}>
                        <i aria-hidden="true" />
                        <i aria-hidden="true" />
                        <i aria-hidden="true" />
                        {word}
                      </span>
                    </td>
                    <td className="r val" data-slot-value>
                      <SlotValue show={show(r.show)} cpm={cpm} sampleCpm={sampleCpm} />
                    </td>
                  </tr>
                  {open && (
                    <tr className="why" id={`why-${r.rank}`}>
                      <td colSpan={3} />
                      {/* The show column and every column after it. */}
                      <td colSpan={3}>
                        <span className="lbl">Why it moved</span>
                        {/* Topic rank is Claude's baseline, fit rank Qloo's: each labelled, neither wrapped off its words. */}
                        <Source of="agent" /> Topic alone ranks it{'\u00a0'}
                        {move.topicRank}. <Source of="qloo" /> Listener overlap with{' '}
                        {listOf(ranking.anchors.map((a) => a.name))} ranks it{'\u00a0'}
                        {r.rank}. {callButton(ranking.call, `Evidence for ${r.show}'s fit`, true)}
                        {r.leadingComp && ` Led by ${r.leadingComp.name}.`}
                        {shared && !shared.error && shared.tags.length > 0 && (
                          <>
                            {' '}
                            Shared tags: {listOf(shared.tags)}.{' '}
                            {callButton(shared.call, `Evidence for the tags ${r.show} shares`, true)}
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
      {!ranking.error && (
        <p className="help chart-foot" data-chart-foot>
          {cpm === null
            ? 'Slot values need the network’s CPM: set it under Network CPM.'
            : `Slot value = downloads × ${dollars(cpm)}${sampleCpm ? ' sample' : ''} CPM ÷ 1,000${sampleCpm ? ' · sample figures' : ''}`}
        </p>
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

// What one promo slot on a show displaces, from its downloads and the CPM, labelled sample while a sample
// figure prices it; or the figure it's missing. `inline` is the one-line form set under the show's name.
function SlotValue({
  show,
  cpm,
  sampleCpm,
  inline = false
}: {
  show: Show | undefined
  cpm: number | null
  sampleCpm: boolean
  inline?: boolean
}) {
  const downloads = show?.downloads ?? null // shows from before downloads have none
  const { slotValue, gap } = slotPrice(downloads, cpm)
  const sample = (sampleCpm || show?.sample?.includes('downloads')) && <small className="smp">sample</small>
  if (inline)
    return slotValue === null ? (
      gap
    ) : (
      <>
        {dollars(slotValue)} a slot{sample}
      </>
    )
  if (slotValue === null)
    return (
      <>
        <span aria-hidden="true">–</span>
        {/* Every row lacks the CPM alike, so the chart's footnote says it once. */}
        {cpm === null ? <span className="vh">{gap}</span> : <small>{gap}</small>}
      </>
    )
  return (
    <>
      {dollars(slotValue)}
      <small>{downloads!.toLocaleString('en-US')} downloads</small>
      {sample}
    </>
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
    <CallButton call={check.call} label="Evidence for the demographic check" opened={opened} openCall={openCall} />
  )
  if (!check.profile)
    return (
      <StateLine kind="failed" role="alert">
        Demographics {cite} not checked: {check.error}.
      </StateLine>
    )
  const { from, ages, skew } = check.profile
  const disagree = check.profile.disagree ?? [] // runs from before #89 have none
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
      {disagree.length > 0 && ` The comps disagree: ${disagree.join('; ')}.`}
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
