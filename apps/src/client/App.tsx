import { cn } from 'cn'
import { Fragment, useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { buttonVariants } from '@/components/ui/variants'
import type { Comp, GuideMark, Launch, LaunchInput, Run, RunSnapshot, RunSummary, SlowCall } from '../agent'
import { inProgress } from '../limits'
import type { Sample } from '../sample'
import { Alert, percentile, useAction } from './controls'
import { SampleShell, useSession } from './Demo'
import { CallButton, EvidencePanel, useEvidence } from './Evidence'
import { FitChart } from './FitChart'
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

// The inspector's tabs: the run's trace and history, a call's evidence, and on the demo the show
// selected in the roster.
type InspectorTab = 'run' | 'evidence' | 'show'

// The frame, from 1360px: the canvas beside the inspector, a 360px column on the card, sticky under
// the 48px top bar for the window's height. At 1440 that's 56 (rail) + 24 (gutter) + 976 (canvas) +
// 24 (gap) + 360 (inspector) = 1440; at 1360, a 896px canvas. Under 1360 the inspector is a sheet
// and the canvas takes the width, with 24px gutters from 1024px and 16px below. Blocks are 24px apart.
const WIDE = '(min-width: 1360px)'
const frame = 'min-[1360px]:grid min-[1360px]:grid-cols-[minmax(0,1fr)_360px] min-[1360px]:gap-6'
const canvas = 'flex min-w-0 flex-col gap-6 px-4 pt-6 pb-10 lg:px-6 min-[1360px]:pr-0'
const aside = 'sticky top-12 flex h-[calc(100svh-3rem)] flex-col gap-4 self-start overflow-y-auto bg-card p-4'

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
  const { opened, openCall } = useEvidence(agent)
  const wide = useMedia(WIDE)
  const [tab, setTab] = useState<InspectorTab>('run')
  // The inspector's sheet, under 1360px, which opens on the tab asked for.
  const [sheet, setSheet] = useState(false)
  const inspect = (next: InspectorTab) => {
    setTab(next)
    if (!wide) setSheet(true)
  }
  // Names typed into the roster's import box, kept here so they outlast its form.
  const importDraft = useRef('')
  // The guide's page steps, marked once each while it shows.
  const guiding = useAction()
  const guide = agent.state?.guide
  const markSeen = (mark: GuideMark) => {
    if (sample && !guide?.dismissed && !guide?.seen.includes(mark)) void guiding.run(() => agent.stub.markGuide(mark))
  }
  // A dropped connection reconnects by itself; one that closed for good says so. The agent's first
  // state arrives with its identity, so a state without one is a reconnect, never the first connect.
  const lost = agent.connectionError ? 'This page lost its connection. Reload to try again.' : null
  const reconnecting = !lost && agent.state !== undefined && agent.identified === false
  // Who edits the roster: the visitor here, or for a launch, the network's members on its roster page.
  const editing = !viewing && !network
  const editorOpen = editing && show !== undefined
  const current: InspectorTab = tab === 'show' && !editorOpen ? 'run' : tab
  // A call number opens its evidence in the inspector, or closes it when it's already shown there.
  const showCall = (call: string) => {
    if (opened?.call === call && current === 'evidence' && (wide || sheet)) return void openCall(call)
    inspect('evidence')
    if (opened?.call !== call) void openCall(call)
  }

  if (!agent.state) return <Connecting network={network} wide={wide} />

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
  const inspector = (
    <Tabs value={current} onValueChange={(next) => setTab(next as InspectorTab)}>
      {/* The tabs stay at the top of the inspector while what's in it scrolls under them. */}
      {/* It sticks at the scroller's padding edge, so beside the canvas it's pulled up over the aside's 16px. */}
      <div className={cn('sticky z-10 -mx-4 bg-card px-4 pb-1', wide ? '-top-4 -mt-4 pt-4' : 'top-0 pt-1')}>
        <TabsList className="max-md:h-11">
          {(['run', 'evidence', ...(editorOpen ? ['show'] : [])] as InspectorTab[]).map((t) => (
            <TabsTrigger key={t} value={t} className="max-md:h-10">
              {tabName[t]}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
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
    </Tabs>
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
            connection={{ lost, reconnecting }}
            runLog={wide ? null : () => inspect('run')}
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
        {wide ? (
          <aside className={aside} aria-label="Details">
            {inspector}
          </aside>
        ) : (
          // Non-modal and kept mounted while closed: the canvas stays usable beside it, its guide
          // included, and the calls' aria-controls="evidence" always finds its panel.
          <Sheet open={sheet} onOpenChange={setSheet} modal={false} disablePointerDismissal>
            <SheetContent overlay={false} keepMounted className="gap-0">
              <SheetHeader className="pr-14">
                <SheetTitle>Details</SheetTitle>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">{inspector}</div>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </>
  )
}

const tabName: Record<InspectorTab, string> = { run: 'Run', evidence: 'Evidence', show: 'Show' }

// Until the agent's first state arrives: the frame in the shapes it will fill, and the readout saying
// it's connecting.
function Connecting({ network, wide }: { network?: NetworkPage; wide: boolean }) {
  return (
    <div className={frame}>
      <main className={canvas} aria-busy="true">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-72 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className={readout}>
          <span role="status">
            <StateLine kind="loading">
              {network ? 'Connecting to the launch…' : 'Connecting to your demo session…'}
            </StateLine>
          </span>
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-56" />
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-11 rounded-lg" />
          ))}
        </div>
      </main>
      {wide && (
        <aside className={aside} aria-label="Details">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24" />
        </aside>
      )}
    </div>
  )
}

// Whether the window matches a media query, following it as it changes. Rendered without a window, as
// in tests, it's the wide layout.
function useMedia(query: string) {
  const [matches, setMatches] = useState(() => typeof window === 'undefined' || window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const change = () => setMatches(media.matches)
    change()
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [query])
  return matches
}

// Runs are numbered in the order this session started them.
const runNumber = (runs: RunSummary[], id: string) => runs.findIndex((r) => r.id === id) + 1

// The on-air readout's strip: one line on the tone step, which wraps when it has more to say.
const readout = 'flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted px-3 py-2'

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
  connection: { lost: string | null; reconnecting: boolean }
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
  // The current step is the latest note still running; between tool calls, Claude is choosing the next.
  const step = run ? run.notes.findLastIndex((n) => n.status === 'running') : -1
  const elapsed = useElapsed(running && !viewing && latest && latest.id === run?.id ? latest.startedAt : null)
  const title =
    launch?.name ?? (launchComps.length ? `From comps: ${launchComps.map((c) => c.name).join(' · ')}` : null)
  return (
    <>
      {/* The name and its lines take what the actions leave, and wrap before the actions do. */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-md flex-col gap-1.5">
          <h1 className="type-title text-balance">{title ?? 'No launch yet'}</h1>
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
            <Button variant="secondary" onClick={back}>
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
      <div className={readout}>
        <div role="status" className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          {connection.lost && <StateLine kind="error">{connection.lost}</StateLine>}
          {connection.reconnecting && (
            <StateLine kind="loading" word="Reconnecting…">
              {null}
            </StateLine>
          )}
          {run ? (
            <>
              {run.status === 'failed' || run.status === 'stopped' ? (
                <StateLine kind="error" word={runLabel[run.status]}>
                  {run.error}
                </StateLine>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <OnAir live={live} />
                  <b className="font-semibold">{runLabel[run.status]}</b>
                </span>
              )}
              {running && (
                <span>{step >= 0 ? `${run.notes[step].text} · step ${step + 1}` : 'Waiting for Claude'}</span>
              )}
              {run.status === 'waiting' && <span>Answer the agent&apos;s question to go on.</span>}
              {run.replayed && (
                <span className="flex basis-full flex-wrap items-center gap-x-2 gap-y-1 type-caption">
                  <Badge variant="outline">Replayed</Badge>
                  <span>
                    {run.replayed}, so this is the stored sample run, replayed with its answers. Nothing new was asked
                    of Qloo or Claude.
                  </span>
                </span>
              )}
              {slowCalls.some((c) => c.run === run.id) && (
                <span className="basis-full type-caption">
                  <SlowCalls calls={slowCalls.filter((c) => c.run === run.id)} />
                </span>
              )}
            </>
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
        </div>
        {/* Outside the live region, so screen readers aren't told the time every second. */}
        {/* Its digits are tabular, so it doesn't jitter as it ticks; its colons aren't, since this
            face's tabular colon is a digit wide. */}
        {elapsed && (
          <span className="text-muted-foreground" aria-hidden="true">
            {elapsed.split(':').map((part, i) => (
              <Fragment key={i}>
                {i > 0 && ':'}
                <span className="tabular-nums">{part}</span>
              </Fragment>
            ))}
          </span>
        )}
        {runLog && (
          <Button variant="ghost" size="sm" className="-my-1 -mr-1.5 max-md:h-11" onClick={runLog}>
            Run log
          </Button>
        )}
      </div>
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

// The on-air dot: signal orange, breathing, while a run is running or waiting on a person; ink once it
// has ended; an empty ring before the first run. Failures show the square ✕ of their state line
// instead, so the dot is never the only sign of a state.
const OnAir = ({ live, idle = false }: { live: boolean; idle?: boolean }) => (
  <span
    aria-hidden="true"
    className={cn(
      'size-2 shrink-0 rounded-full',
      idle ? 'border border-muted-foreground' : live ? 'bg-signal motion-safe:animate-live' : 'bg-foreground'
    )}
  />
)

// The time since `since` as a clock, such as 1:05, ticking each second; null without a time, and until
// the page has run in a browser, so a server render never shows a stale one.
function useElapsed(since: string | null) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    if (!since) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [since])
  if (!since || now === null) return null
  const seconds = Math.max(0, Math.floor((now - Date.parse(since)) / 1000))
  const [h, m, s] = [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
  const two = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`
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

// Every run this session started, newest first: its number and launch, when and by whom it started,
// how it ended, and the one shown, or View, which opens an earlier run read-only to compare its plan
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
    <section className="flex flex-col gap-3" aria-labelledby="runs-h">
      <h2 className="font-semibold" id="runs-h">
        Runs
      </h2>
      <ol className="-mx-2 flex flex-col gap-0.5">
        {runs
          .map((r, i) => ({ ...r, n: i + 1 }))
          .reverse()
          .map((r) => {
            const shown = viewing === null ? r.id === latest : r.id === viewing
            return (
              <li
                key={r.id}
                aria-current={shown || undefined}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg px-2 py-1.5 aria-[current]:bg-muted"
              >
                <span className="min-w-0">
                  <b className="font-semibold">Run {r.n}</b> ·{' '}
                  {r.pitchesFor ? `Pitches for ${r.pitchesFor}` : (r.launch ?? 'From comps')}
                </span>
                <span className="type-caption text-muted-foreground">
                  {new Date(r.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {r.startedBy && ` by ${r.startedBy}`} · {runLabel[r.status]}
                  {r.replayed && ' · Replayed'}
                </span>
                <span className="col-start-2 row-span-2 row-start-1 justify-self-end">
                  {shown ? (
                    <span className="type-caption text-muted-foreground">Shown</span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      aria-label={`View run ${r.n}`}
                      onClick={() => void run(() => view(r.id === latest ? null : r.id))}
                      className="-mr-1 max-md:h-11"
                    >
                      View
                    </Button>
                  )}
                </span>
              </li>
            )
          })}
      </ol>
      <p className="type-caption text-muted-foreground">
        Each run starts fresh; earlier ones stay here to compare.{' '}
        {counted === 'network'
          ? "Model runs are limited per UTC day across the network's launches and inbox, whoever starts them. Runs that stop at once have a higher limit of their own."
          : 'Model runs are limited per visitor and per UTC day, across browsers. Runs that replay or stop at once have a higher limit of their own.'}
      </p>
      <Alert error={error} />
    </section>
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
