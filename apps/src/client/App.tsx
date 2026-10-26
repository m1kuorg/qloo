import { useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { TabsContent } from '@/components/ui/tabs'
import { buttonVariants } from '@/components/ui/variants'
import type { Comp, GuideMark, Launch, LaunchInput, Run, RunSnapshot, RunSummary, SlowCall } from '../agent'
import { inProgress } from '../limits'
import type { Sample } from '../sample'
import { Alert, percentile, useAction } from './controls'
import { SampleShell, useSession } from './Demo'
import { CallButton, EvidencePanel, useEvidence } from './Evidence'
import { FitChart } from './FitChart'
import { canvas, Connecting, frame, Inspector, OnAir, Readout, RunState, useInspector } from './Frame'
import { Guide } from './Guide'
import { InsertionOrderPanel } from './InsertionOrder'
import { launchTitle, useLaunchFields } from './LaunchFields'
import type { NetworkPage } from './NetworkPage'
import {
  CpmRecord,
  NetworkCpm,
  RosterCheck,
  RosterCounts,
  RosterFailures,
  RosterImport,
  RosterTable,
  ShowEditor,
  textLink
} from './RosterModules'
import { OpenQuestion, ORDER_CHANGED, runLabel, RunList, RunLog, runNumber } from './Run'
import { Source } from './Source'
import { connectionOf, sentence, StateLine, type Connection } from './states'

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
// The canvas reads in the order a run asks for attention: the launch and its readout, the guide, the
// launch form, the agent's question, then the fit chart, the plan and the roster. The inspector
// beside it holds what a person checks: the run's trace, a call's evidence, the selected show.
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
  const evidence = useEvidence(agent)
  const { opened } = evidence
  // Names typed into the roster's import box, kept here so they outlast its form.
  const importDraft = useRef('')
  // The guide's page steps, marked once each while it shows.
  const guiding = useAction()
  const guide = agent.state?.guide
  const markSeen = (mark: GuideMark) => {
    if (sample && !guide?.dismissed && !guide?.seen.includes(mark)) void guiding.run(() => agent.stub.markGuide(mark))
  }
  // A dropped connection reconnects by itself; one that closed for good says so.
  const connection = connectionOf(agent)
  // Who edits the roster: the visitor here, or for a launch, the network's members on its roster page.
  const editing = !viewing && !network
  const editorOpen = editing && show !== undefined
  // The inspector: the run's trace and history, a call's evidence, and on the demo the show selected
  // in the roster. A call number anywhere opens its evidence there.
  const inspector = useInspector(editorOpen ? ['run', 'evidence', 'show'] : ['run', 'evidence'], evidence)
  const { inspect, showCall } = inspector

  if (!agent.state)
    return <Connecting label={network ? 'Connecting to the launch…' : 'Connecting to your demo session…'} />

  const shell = sample && <SampleShell sample={sample} />
  const order = shown?.insertionOrder ?? null
  // The roster the run ranks: on the demo, its counts, the sample's notice, the import and the table,
  // whose shows open in the inspector's Show tab; on a launch's page, the copy its latest run took,
  // read-only, and where the network's members edit it. The CPM that prices its slots follows it.
  const rosterSection = (
    <section className="flex min-w-0 flex-col gap-6" aria-labelledby="roster-h" data-roster>
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold" id="roster-h">
          Roster
        </h2>
        {!network && <RosterCounts roster={roster} />}
        {(viewing || network || !sample) && (
          <p className="max-w-[72ch] text-muted-foreground">
            {viewing ? (
              `As it was when run ${runNumber(runs, viewing.id)} ended, with that run's exclusions.`
            ) : network ? (
              <>
                {runs.length > 0
                  ? `The latest run ranks ${network.name}'s roster as it stood when that run started.`
                  : `Each run ranks ${network.name}'s roster as it stands when the run starts.`}{' '}
                {runs.length > 0 && agent.state?.rosterChanged && (
                  <>
                    <b className="font-semibold text-foreground">
                      It has changed since then, so run again to rank it as it is now.
                    </b>{' '}
                  </>
                )}
                Edit its shows on{' '}
                <a className={textLink} href={links.roster}>
                  the roster page
                </a>
                .
              </>
            ) : (
              "Paste your network's show names, one per line, or upload a CSV. Crossfeed looks each one up in Qloo."
            )}
          </p>
        )}
      </div>
      {sample && !viewing && <SampleNotice sample={sample} clear={() => agent.stub.clearSample()} />}
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
          select={
            editing
              ? (name) => {
                  setSelected(name)
                  inspect('show')
                }
              : null
          }
          slowCalls={slowCalls}
          openCall={showCall}
          opened={opened?.call ?? null}
        />
      )}
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
    </section>
  )
  const panels = (
    <>
      {/* Every panel stays mounted, so the ids calls point at (aria-controls="evidence") are always
          there; Base UI hides and inerts the panels not shown, and nothing else. */}
      <TabsContent value="run" keepMounted className="flex flex-col gap-8">
        {run && (
          <RunLog
            run={run}
            changedNote={order?.run === run.id && order.edited ? ORDER_CHANGED : null}
            openCall={showCall}
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
        {!run && runs.length === 0 && network && roster.length === 0 && (
          <p className="text-muted-foreground">Not run yet. Each run&apos;s steps and its closing line show here.</p>
        )}
      </TabsContent>
      <TabsContent value="evidence" keepMounted>
        <EvidencePanel opened={opened} />
      </TabsContent>
      {editorOpen && (
        <TabsContent value="show" keepMounted>
          <ShowEditor key={show.name} show={show} agent={agent} close={() => setSelected(null)} />
        </TabsContent>
      )}
    </>
  )
  return (
    <>
      {shell}
      <div className={frame}>
        <main className={canvas} data-canvas>
          <LaunchHead
            // A launch's page fills its form in with the launch it plans as that arrives or changes.
            key={network ? `launch ${launchName(agent.state.launch)}` : (sampleLaunch ?? 'none')}
            suggested={sampleLaunch}
            ownLaunch={Boolean(network)}
            ran={runs.some((r) => !r.pitchesFor)}
            latest={runs.findLast((r) => !r.pitchesFor) ?? null}
            launch={shown?.launch ?? null}
            hasRoster={roster.length > 0}
            slowCalls={slowCalls}
            run={run}
            order={order !== null}
            viewing={viewing && runNumber(runs, viewing.id)}
            back={() => setViewing(null)}
            startLaunch={(input) => agent.stub.startLaunch(input)}
            openCall={showCall}
            opened={opened?.call ?? null}
            connection={connection}
            runLog={inspector.wide ? null : () => inspect('run')}
            guide={
              !viewing && (
                <Guide
                  state={agent.state}
                  dismiss={() => void guiding.run(() => agent.stub.dismissGuide())}
                  error={guiding.error}
                />
              )
            }
          />
          {/* Before the chart, so the question is what a person reaches first. */}
          {run?.status === 'waiting' && run.question && (
            <OpenQuestion
              key={run.question.id}
              question={run.question}
              launch={shown?.launch ?? null}
              agent={agent}
              ranking={shown?.ranking ?? null}
            />
          )}
          {/* The chart has nothing to show before a run ranks the roster, or starts to. */}
          {(shown?.ranking || run?.status === 'running') && (
            <FitChart
              ranking={shown?.ranking ?? null}
              launch={shown?.launch ?? null}
              leftOut={shown?.run?.exclusions ?? []}
              demographics={shown?.demographics ?? null}
              topic={shown?.topic ?? null}
              failed={roster.filter((s) => s.resolution === 'failed' && !s.excluded).map((s) => s.name)}
              running={run?.status === 'running'}
              openCall={showCall}
              opened={opened?.call ?? null}
              markSeen={markSeen}
              roster={roster}
              cpm={shown?.cpm ?? null}
              sampleCpm={shown?.sample?.cpm ?? false}
            />
          )}
          {shown && order && (
            // "Review the plan" in the title row jumps here, clear of the sticky top bar.
            <div id="plan" className="scroll-mt-16">
              <InsertionOrderPanel
                key={`${viewing?.id ?? 'latest'} ${order.id}`}
                order={order}
                roster={roster}
                cpm={shown.cpm}
                sampleCpm={shown.sample?.cpm ?? false}
                budget={run?.id === order.run ? run.budget : null}
                sharedTags={Object.fromEntries(
                  (shown.ranking?.rows ?? []).flatMap((r) => (r.sharedTags ? [[r.show, r.sharedTags]] : []))
                )}
                openCall={showCall}
                opened={opened?.call ?? null}
                exportHref={`${links.orders ?? '/api/insertion-orders'}/${order.id}.csv`}
                actions={
                  viewing || inProgress(run, order.run)
                    ? null
                    : {
                        edit: async (lines) => {
                          await agent.stub.editInsertionOrder(order.id, lines)
                        },
                        approve: () => agent.stub.approveInsertionOrder(order.id)
                      }
                }
                readOnly={
                  viewing
                    ? `Run ${runNumber(runs, viewing.id)}'s order, read-only.`
                    : 'Edit and approve it once the run ends.'
                }
              />
            </div>
          )}
          {rosterSection}
        </main>
        <Inspector inspector={inspector}>{panels}</Inspector>
      </div>
    </>
  )
}

// The head of the canvas: the title row, the on-air readout, the guide, and the launch form. The
// title row names the launch, with its Qloo match and comps, and holds the run's actions: Start run
// for the form, or once a run has ended, Run again and Change launch, which opens the form; Back to
// the latest run while an earlier one is viewed; and Review the plan once there's one. The form
// starts a run from a released launch's name, or from up to three comps for an unreleased one.
function LaunchHead({
  suggested,
  ownLaunch,
  ran,
  latest,
  launch,
  hasRoster,
  slowCalls,
  run,
  order,
  viewing,
  back,
  startLaunch,
  openCall,
  opened,
  connection,
  runLog,
  guide
}: {
  suggested: string | null // the sample launch, prefilled for the visitor to start
  // A launch's page, which plans one launch: its form keeps the launch's name or comps, to run again as
  // they are or changed, and a launch from comps goes by them.
  ownLaunch: boolean
  ran: boolean // whether any launch run has started here
  latest: RunSummary | null // the latest launch run, which `run` is unless a pitch run came after it
  launch: Launch | null
  hasRoster: boolean
  slowCalls: SlowCall[]
  run: Run | null
  order: boolean // whether there's an insertion order to review
  viewing: number | null // the number of the earlier run shown
  back: () => void
  startLaunch: (input: LaunchInput) => Promise<unknown>
  openCall: (call: string) => void
  opened: string | null
  connection: Connection
  runLog: (() => void) | null // opens the inspector's Run tab, where it's a sheet
  guide: React.ReactNode
}) {
  const form = useLaunchFields(
    suggested
      ? { name: suggested, comps: [] }
      : ownLaunch && launch
        ? { name: launch.name, comps: launch.comps.map((c) => c.name) }
        : null
  )
  const action = useAction()
  // The form opened again after a run, to start one for another launch.
  const [changing, setChanging] = useState(false)
  const running = run?.status === 'running'
  const live = running || run?.status === 'waiting'
  // Whether the latest launch run has ended, read from its summary when a pitch run came after it.
  const ended = run ? !live : latest !== null && latest.status !== 'running' && latest.status !== 'waiting'
  const formShown = !viewing && (!ran || changing)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (await action.run(() => startLaunch(form.input))) {
      if (!ownLaunch) form.clear()
      setChanging(false)
    }
  }
  // The launch to run again once its run has ended: from its comps, if it has any.
  const launchComps = launch?.comps ?? [] // sessions from before comps have none
  const again: LaunchInput | null =
    ended && launch
      ? launchComps.length
        ? { comps: launchComps.map((c) => c.name) }
        : launch.name
          ? { name: launch.name }
          : null
      : null
  const title =
    launch?.name ?? (launchComps.length ? `From comps: ${launchComps.map((c) => c.name).join(' · ')}` : null)
  // Back to the latest run, its button goes, and focus goes to the page's heading.
  const heading = useRef<HTMLHeadingElement>(null)
  return (
    <>
      {/* The name and its lines take what the actions leave, and wrap before the actions do. */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-md flex-col gap-1.5">
          <h1 className="type-title text-balance" ref={heading} tabIndex={-1}>
            {title ?? 'No launch yet'}
          </h1>
          <div className="flex flex-col gap-1 type-caption text-muted-foreground">
            {viewing && (
              <p className="flex flex-wrap items-center gap-1.5">
                <Badge>Run {viewing}</Badge> An earlier run, read-only.
              </p>
            )}
            {launch?.name && (launch.match || ran || running) && (
              <LaunchMatch launch={launch} running={running} openCall={openCall} opened={opened} />
            )}
            {launchComps.length > 0 && (
              <LaunchComps comps={launchComps} running={running} openCall={openCall} opened={opened} />
            )}
            {!launch && (
              <StateLine kind="empty">
                {hasRoster
                  ? 'Name a released launch below and start a run to rank the roster.'
                  : 'Import a roster first, then name a released launch to rank it.'}
              </StateLine>
            )}
          </div>
        </div>
        {/* On a phone the primary leads, where the row wraps. */}
        <div className="flex flex-wrap items-center gap-2 [&>*]:max-md:h-11">
          {order && (
            <a href="#plan" className={buttonVariants({ variant: 'ghost' })}>
              Review the plan
            </a>
          )}
          {viewing ? (
            <Button
              variant="secondary"
              onClick={() => {
                back()
                heading.current?.focus()
              }}
            >
              Back to the latest run
            </Button>
          ) : formShown ? (
            <>
              {changing && (
                <Button variant="ghost" onClick={() => setChanging(false)}>
                  Cancel
                </Button>
              )}
              <Button
                type="submit"
                form="launch-form"
                disabled={action.busy || running || !form.ready}
                className="max-sm:order-first"
              >
                Start run
              </Button>
            </>
          ) : (
            ended && (
              <>
                <Button variant="ghost" onClick={() => setChanging(true)}>
                  Change launch
                </Button>
                {again && (
                  <Button
                    disabled={action.busy}
                    onClick={() => void action.run(() => startLaunch(again))}
                    className="max-sm:order-first"
                  >
                    Run again
                  </Button>
                )}
              </>
            )
          )}
        </div>
      </div>
      {!formShown && <Alert error={action.error} />}
      <Readout
        connection={connection}
        since={running && !viewing && latest && latest.id === run?.id ? latest.startedAt : null}
        runLog={runLog}
      >
        {run ? (
          <RunState run={run} slowCalls={slowCalls} />
        ) : latest ? (
          // A guest pitch run came after the latest launch run, which the inbox shows instead.
          <span className="inline-flex items-center gap-2">
            <OnAir live={false} />
            <b className="font-semibold">{runLabel[latest.status]}</b>
          </span>
        ) : (
          <span className="inline-flex items-center gap-2">
            <OnAir live={false} idle />
            {ownLaunch
              ? 'Not run yet. A run looks it up in Qloo.'
              : 'Not run yet. A run looks the launch up in Qloo and ranks the roster against it.'}
          </span>
        )}
      </Readout>
      {guide}
      {formShown && (
        <form id="launch-form" className="flex flex-col gap-2" onSubmit={submit}>
          <div className="flex flex-wrap items-center gap-2">
            {form.fields(action.busy || running)}
            {suggested && form.named(suggested) && <Badge>Sample launch</Badge>}
          </div>
          <Alert error={action.error} />
        </form>
      )}
    </>
  )
}

const launchName = (launch: Launch | null | undefined) =>
  launch &&
  launchTitle(
    launch.name,
    launch.comps.map((c) => c.name)
  )

// The launch's Qloo match, under its name: the entity and its popularity, or why there's none, with
// the call it came from.
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
  if (!match) return <p>{running ? 'Looking it up in Qloo…' : 'Not looked up.'}</p>
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <Source of="qloo" />{' '}
      {match.resolution === 'resolved' && match.entity ? (
        <span>
          <span className="font-medium text-foreground">{match.entity.name}</span> popularity{' '}
          {percentile(match.entity.popularity)}
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
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <Source of="qloo" /> Comps:{' '}
      {comps.map((c, i) => (
        <span key={c.name} className="inline-flex flex-wrap items-center gap-x-1.5">
          {i > 0 && <span aria-hidden="true">·</span>}
          {c.status === 'confirmed' && c.entity ? (
            <span>
              <span className="font-medium text-foreground">{c.entity.name}</span> popularity{' '}
              {percentile(c.entity.popularity)}
            </span>
          ) : (
            <span>
              <span className="font-medium text-foreground">{c.name}</span> {state(c)}
            </span>
          )}
          {c.match && (
            <CallButton
              call={c.match.evidence}
              label={`Evidence for the comp ${c.name}`}
              opened={opened}
              openCall={openCall}
            />
          )}
        </span>
      ))}
    </p>
  )
}

// The roster's notice while it is the sample network, and a way back to an empty roster: a block on
// the card, as notices about the page's data are, with its one action.
function SampleNotice({ sample, clear }: { sample: Sample; clear: () => Promise<void> }) {
  const { busy, error, run } = useAction()
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-4 md:flex-row md:items-start md:gap-8" data-sample-notice>
      <p className="max-w-[72ch] flex-1">
        <b className="font-semibold">{sample.network}.</b> {sample.notice}
      </p>
      <div className="flex flex-col items-start gap-1.5 md:w-60 md:shrink-0">
        <Button variant="secondary" disabled={busy} onClick={() => void run(clear)} className="max-md:h-11">
          {busy && <Spinner data-icon="inline-start" />}
          Clear sample network
        </Button>
        <small className="type-caption text-muted-foreground">
          Empties the roster so you can import your own. Or edit any figure.
        </small>
        <Alert error={error} />
      </div>
    </div>
  )
}
