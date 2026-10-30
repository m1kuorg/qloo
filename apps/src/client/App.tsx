import { useRef, useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { TabsContent } from '@/components/ui/tabs'
import { buttonVariants } from '@/components/ui/variants'
import type { useAgent } from 'agents/react'
import type { Comp, CrossfeedAgent, Launch, LaunchInput, Run, RunSnapshot, RunSummary, SlowCall, State } from '../agent'
import { inProgress } from '../limits'
import { holdsSample } from '../roster'
import { RunChanges } from './Changes'
import { Alert, percentile, useAction } from './controls'
import { CallButton, EvidencePanel, useEvidence, type OpenCall } from './Evidence'
import { FitChart } from './FitChart'
import { canvas, Connecting, frame, Inspector, InspectorToggle, OnAir, Readout, RunState, useInspector } from './Frame'
import { InsertionOrderPanel } from './InsertionOrder'
import { launchTitle, useLaunchFields } from './LaunchFields'
import type { NetworkPage } from './NetworkPage'
import { PageTabs, Section } from './PageHeader'
import { CpmRecord, RosterCheck, RosterTable } from './RosterModules'
import { OpenQuestion, ORDER_CHANGED, runLabel, RunList, RunLog, runNumber } from './Run'
import { Source } from './Source'
import { connectionOf, isLive, sentence, StateLine, type Connection } from './states'

// The agent connection the workspace's modules take: a launch's, or a network's for its inbox, each
// the engine's, CrossfeedAgent, extended.
export type Session = ReturnType<typeof useAgent<CrossfeedAgent, State>>

// Where the island's pages link, as the server gives them: the network's roster page.
export type Links = { roster: string }

// A launch's page of `network` (Launch.tsx), on its connected agent; tests render it from a launch's
// synced state. It ranks the network's roster, read-only here, and its approved insertion orders
// export under `orders`, as `<orders>/<id>.csv`, and the reports of the runs that drafted them open
// under `reports`, as `<reports>/<run id>`, on a launch's page; an engine session's has none. The
// canvas reads in the order a run asks for attention: the launch and its readout, the launch form, the
// agent's question, then, from the first run on, the run's sections in tabs: Ranking (the fit chart),
// Plan once there's an order, Changes once the launch has two completed runs, and Roster. Before it
// there's only the roster. The inspector beside it, closed until something opens it, holds what a
// person checks: the run's trace and a call's evidence. `earlier` holds earlier runs as getRun returns
// them, which Changes reads itself unless it's given them, as the tests give them.
export function Workspace({
  agent,
  network,
  orders,
  reports,
  earlier
}: {
  agent: Session
  network: NetworkPage
  orders: string
  reports?: string
  earlier?: Record<string, RunSnapshot>
}) {
  // An earlier run being viewed: the page shows what it ended with, read-only, instead of the latest.
  const [viewing, setViewing] = useState<{ id: string; state: RunSnapshot } | null>(null)
  // Whether Changes has shown, so the earlier run it compares with is read only once it's wanted.
  const [changesSeen, setChangesSeen] = useState(false)
  const shown = viewing?.state ?? agent.state
  const roster = shown?.roster ?? []
  // The latest run, unless it's a guest pitch run, which the inbox page shows instead.
  const run = shown?.run && shown.booking?.run !== shown.run.id ? shown.run : null
  const runs = agent.state?.runs ?? []
  const sampleCpm = sampleCpmOf(shown)
  // Whether the page shows the sample data, which its title's one badge says.
  const sample = showsSample(shown, run)
  // Live, never a run's snapshot: calls waiting on Qloo right now. Sessions from before it have none.
  const slowCalls = agent.state?.slowCalls ?? []
  const evidence = useEvidence(agent)
  const { opened } = evidence
  // A dropped connection reconnects by itself; one that closed for good says so.
  const connection = connectionOf(agent)
  // The inspector: the run's trace and history, and a call's evidence. A call number anywhere opens its
  // evidence there.
  const inspector = useInspector(['run', 'evidence'], evidence)
  const { inspect, showCall } = inspector

  if (!agent.state) return <Connecting label="Connecting to the launch…" />

  const order = shown?.insertionOrder ?? null
  // The roster the run ranks: the copy its latest run took, read-only, and where the network's members
  // edit it.
  const rosterSection = (
    <Section
      id="roster-h"
      title="Roster"
      description={
        viewing ? (
          `As it was when run ${runNumber(runs, viewing.id)} ended, with that run’s exclusions.`
        ) : runs.length === 0 ? (
          `Each run ranks ${network.name}’s roster as it stands when the run starts.`
        ) : agent.state?.rosterChanged ? (
          <b className="font-semibold text-foreground">
            {network.name}’s roster has changed since the latest run started, so run again to rank it as it is now.
          </b>
        ) : (
          `The latest run ranks ${network.name}’s roster as it stood when that run started.`
        )
      }
      actions={
        !viewing && (
          <a
            className={buttonVariants({ variant: 'ghost', size: 'sm', className: '-my-1 -mr-1.5' })}
            href={network.links.roster}
          >
            Edit the roster
          </a>
        )
      }
      data-roster
    >
      {/* A launch's roster arrives with its first run. */}
      {roster.length > 0 && (
        <RosterTable
          roster={roster}
          selected={null}
          select={null}
          slowCalls={slowCalls}
          openCall={showCall}
          opened={opened?.call ?? null}
        />
      )}
    </Section>
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
            counted="network"
            report={reports ? (id) => `${reports}/${id}` : undefined}
          />
        )}
        {roster.length > 0 && <RosterCheck roster={roster} />}
        {!run && runs.length === 0 && roster.length === 0 && (
          <p className="text-muted-foreground">Not run yet. Each run’s steps and its closing line show here.</p>
        )}
      </TabsContent>
      <TabsContent value="evidence" keepMounted>
        <EvidencePanel opened={opened} names={evidence.names} runs={runs} />
      </TabsContent>
    </>
  )
  return (
    <div className={frame}>
      <main className={canvas} data-canvas>
        <LaunchHead
          // The form fills in with the launch the page plans as that arrives or changes.
          key={`launch ${launchName(agent.state.launch)}`}
          sample={sample}
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
          details={<InspectorToggle open={inspector.open} toggle={inspector.toggle} ref={inspector.toggleButton} />}
          // Once there's a run for the Run tab to log.
          runLog={run || runs.length > 0 ? (from) => inspect('run', from) : null}
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
        {runs.length === 0 ? (
          rosterSection
        ) : (
          // From the first run on, the run's sections in tabs: the ranking, the plan once there's one, what
          // changed since an earlier run once two have completed, and the roster it ranked, with the CPM
          // that prices its slots.
          <PageTabs
            label="Launch sections"
            onShown={(id) => id === 'changes' && setChangesSeen(true)}
            tabs={[
              {
                id: 'ranking',
                title: 'Ranking',
                content: (
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
                    roster={roster}
                    cpm={shown?.cpm ?? null}
                    sampleCpm={sampleCpm}
                  />
                )
              },
              ...(shown && order
                ? [
                    {
                      id: 'plan',
                      title: 'Plan',
                      content: (
                        // "Review the plan" in the title row opens this tab, and jumps here, clear of the
                        // sticky top bar.
                        <div id="plan" className="scroll-mt-16">
                          <InsertionOrderPanel
                            key={`${viewing?.id ?? 'latest'} ${order.id}`}
                            order={order}
                            roster={roster}
                            cpm={shown.cpm}
                            sampleCpm={sampleCpm}
                            budget={run?.id === order.run ? run.budget : null}
                            sharedTags={Object.fromEntries(
                              (shown.ranking?.rows ?? []).flatMap((r) => (r.sharedTags ? [[r.show, r.sharedTags]] : []))
                            )}
                            overlap={shown.rosterOverlap}
                            openCall={showCall}
                            opened={opened?.call ?? null}
                            exportHref={`${orders}/${order.id}.csv`}
                            reportHref={reports ? `${reports}/${order.run}` : null}
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
                                ? `Run ${runNumber(runs, viewing.id)}’s order, read-only.`
                                : 'Edit and approve it once the run ends.'
                            }
                          />
                        </div>
                      )
                    }
                  ]
                : []),
              ...(shown && run && runs.filter((r) => r.status === 'completed').length >= 2
                ? [
                    {
                      id: 'changes',
                      title: 'Changes',
                      content: (
                        <RunChanges
                          runs={runs}
                          shown={{ id: run.id, state: shown }}
                          read={(id) => agent.stub.getRun(id)}
                          seen={changesSeen}
                          earlier={earlier}
                        />
                      )
                    }
                  ]
                : []),
              {
                id: 'roster',
                title: 'Roster',
                content: (
                  <>
                    {rosterSection}
                    <CpmRecord cpm={shown?.cpm ?? null} network={network} />
                  </>
                )
              }
            ]}
          />
        )}
      </main>
      <Inspector inspector={inspector}>{panels}</Inspector>
    </div>
  )
}

// Whether a run's state, the launch's own or a snapshot getRun returns, prices its slots at a CPM
// labelled the sample's: as its copy of the roster took the label, or as the sample it carries says, as an
// engine session's does, and The Watch's runs from before the copy took one (#333).
export const sampleCpmOf = (shown: RunSnapshot | undefined) => !!(shown?.sample?.cpm || shown?.sampleCpm)

// Whether it shows the sample data (ADR 0007), as a launch's page and its report say once each, in their
// title's badge: the guest network's sample launch, which carries the sample; `run`, if one of the sample
// launches was seeded with it; a roster still holding sample figures, as another launch of the guest
// network ranks; or a run priced at the labelled sample CPM.
export const showsSample = (shown: RunSnapshot | undefined, run: Run | null) =>
  !!shown?.sample || !!run?.capturedAt || holdsSample(shown?.roster ?? []) || sampleCpmOf(shown)

// The head of the canvas: the title row, the on-air readout, and the launch form. The title row names
// the launch, badged sample while the page shows the sample data, with its Qloo match and comps, and
// holds the inspector's toggle and the run's actions: Start run for the form, or once a run has ended,
// Run again and Change launch, which opens the form; Back to the latest run while an earlier one is
// viewed; and Review the plan once there's one. The
// form keeps the launch's name or comps, to run again as they are or changed: from a released launch's
// name, or from up to three comps for an unreleased one.
function LaunchHead({
  sample,
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
  details,
  runLog
}: {
  sample: boolean // the page shows the sample data, which the title's badge says
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
  openCall: OpenCall
  opened: string | null
  connection: Connection
  details: ReactNode // the inspector's toggle
  runLog: ((from: HTMLElement) => void) | null // opens the inspector on its Run tab, once there's a run
}) {
  const form = useLaunchFields(launch ? { name: launch.name, comps: launch.comps.map((c) => c.name) } : null)
  const action = useAction()
  // The form opened again after a run, to start one for another launch.
  const [changing, setChanging] = useState(false)
  const running = run?.status === 'running'
  // Whether the latest launch run has ended, read from its summary when a pitch run came after it.
  const ended = run ? !isLive(run.status) : latest !== null && !isLive(latest.status)
  const formShown = !viewing && (!ran || changing)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (await action.run(() => startLaunch(form.input))) setChanging(false)
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
  // A run that completed with nothing more to say, not replayed and with no call still slow, leaves the
  // readout nothing to add while the connection holds: the title row and the tabs say the rest, and
  // Details opens the run's log. It's back as a run starts, fails or stops, or the connection drops.
  const lastRun = run ?? latest
  const atRest =
    lastRun?.status === 'completed' &&
    !run?.replayed &&
    !slowCalls.some((c) => c.run === lastRun.id) &&
    !connection.lost &&
    !connection.reconnecting
  return (
    <>
      {/* The name and its lines take what the actions leave, and wrap before the actions do. */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-md flex-col gap-1.5">
          {/* The badge follows the title's last word, as the page header's does, however it wraps. */}
          <h1 className="type-title text-balance" ref={heading} tabIndex={-1}>
            {title ?? 'No launch yet'}
            {sample && (
              <>
                {' '}
                <Badge className="ml-0.5 align-middle">sample</Badge>
              </>
            )}
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
        {/* On a phone the primary leads, on a line of its own, and the rest share the line under it. */}
        <div className="flex flex-wrap items-center gap-2 max-sm:w-full">
          {details}
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
                className="max-sm:order-first max-sm:basis-full"
              >
                {action.busy && <Spinner data-icon="inline-start" />}
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
                    className="max-sm:order-first max-sm:basis-full"
                  >
                    {action.busy && <Spinner data-icon="inline-start" />}
                    Run again
                  </Button>
                )}
              </>
            )
          )}
        </div>
      </div>
      {!formShown && <Alert error={action.error} />}
      {!atRest && (
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
              Not run yet. A run looks it up in Qloo.
            </span>
          )}
        </Readout>
      )}
      {formShown && (
        <form id="launch-form" className="flex flex-col gap-2" onSubmit={submit}>
          <div className="flex flex-wrap items-center gap-2">{form.fields(action.busy || running)}</div>
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
  openCall: OpenCall
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
          The launch isn’t resolved, so nothing can be ranked: {sentence(match.error ?? 'the lookup failed')}
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
// with what's still needed, and each with the search it came from. Each is as wide as its words, so a
// comp's name with no spaces breaks anywhere.
function LaunchComps({
  comps,
  running,
  openCall,
  opened
}: {
  comps: Comp[]
  running: boolean
  openCall: OpenCall
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
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 wrap-anywhere">
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
