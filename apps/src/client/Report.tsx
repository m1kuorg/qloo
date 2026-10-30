import { cn } from 'cn'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { buttonVariants } from '@/components/ui/variants'
import type { Launch, RunSnapshot, RunSummary } from '../agent'
import type { Evidence } from '../evidence'
import { finalistsOf } from '../fit'
import { dollars, type InsertionOrder } from '../order'
import { planPairs, type PlanPairs } from '../overlap'
import { sameName } from '../resolve'
import { sampleCpmOf, showsSample, type Session } from './App'
import { Alert, clock, day, FitBand, KeyValue, KeyValues } from './controls'
import { CallButton, CallLinks, citedCall } from './Evidence'
import { DemographicSummary, finding, SlotValue, tagWords, whoShares } from './FitChart'
import { canvas } from './Frame'
import { ClosePairs, OrderBadge, OrderLines, OrderTitle, PLAN_SENTENCE, sampleLine } from './InsertionOrder'
import { LaunchCrumb, useLaunch } from './Launch'
import { launchTitle } from './LaunchFields'
import { NetworkGate, type NetworkPage } from './NetworkPage'
import { PageEmpty, Section } from './PageHeader'
import { runNumber } from './Run'
import { Source } from './Source'
import { connectionOf, ConnectionState, StateLine } from './states'

// A launch's report page (routes/app.tsx), on the launch's agent as its page is, read-only: the report of
// run `run`, or with none named, of the latest run whose order is approved. `launch` is the launch's page.
export function ReportPage({
  agentPath,
  network,
  launch,
  run
}: {
  agentPath: string
  network: NetworkPage
  launch: string
  run: string | null
}) {
  const agent = useLaunch(agentPath)
  return (
    <NetworkGate agent={agent} network={network}>
      <LaunchReport agent={agent} network={network} launch={launch} run={run} />
    </NetworkGate>
  )
}

// What the report reads besides the launch's state: an earlier run as getRun keeps it, by its ID, and the
// records of the calls it cites, from getEvidence. Each is being read, read, or why it couldn't be.
type Read<T> = 'reading' | T | { failed: string }
const failure = (read: Read<unknown> | undefined) =>
  typeof read === 'object' && read !== null && 'failed' in read ? read.failed : null

// Each call number's entry in "Calls cited", which every call number in the report links to, since the
// report has no inspector.
const entry = (call: string) => `call-${call}`
const toEntry = (call: string) => `#${entry(call)}`
// The report opens no evidence, so its call numbers' handlers do nothing.
const noInspector = () => {}

// A launch's report: one run whose insertion order is approved, set as a document to read and print, the
// handoff a member gives their boss or ad operations. Its facts, the finding, the finalists by who listens,
// the demographics, close pairs, the plan with its prices, and the Qloo calls it cites, each call number a
// link to its entry. It carries what the launch's page shows of the run, never what was sent to Qloo, an
// ID, a URN or a raw affinity (the TRD's "Handoff pages"). The run is the launch's latest, as its state
// has it, live; or an earlier one, read once with getRun. Any other run's report, like its draft's CSV,
// doesn't exist: the page says it opens once the plan is approved, and nothing prints. Print waits until
// all of it has arrived, so a skeleton never prints. Tests give it `reads`, as the page would read them.
export function LaunchReport({
  agent,
  network,
  launch,
  run,
  reads = {}
}: {
  agent: Session
  network: NetworkPage
  launch: string
  run: string | null
  reads?: { runs?: Record<string, RunSnapshot>; evidence?: Evidence[] }
}) {
  const state = agent.state
  const runs = state?.runs ?? []
  const id = run ?? runs.findLast((r) => r.orderApproved)?.id ?? null
  const latest = id !== null && state?.run?.id === id
  const known = id !== null && runs.some((r) => r.id === id)
  const [snapshots, setSnapshots] = useState<Record<string, Read<RunSnapshot>>>(reads.runs ?? {})
  const snapshot = id === null ? undefined : snapshots[id]
  const unread = failure(snapshot) // why the run didn't load
  const shown = latest ? state : typeof snapshot === 'object' && !unread ? (snapshot as RunSnapshot) : undefined
  // The run's own order, once it's approved.
  const approved = shown?.insertionOrder
  const order = approved?.run === id && approved.status === 'approved' ? approved : null
  const cited = shown && order ? citedCalls(shown, order) : []
  const [evidence, setEvidence] = useState<{ key: string; read: Read<Evidence[]> } | null>(
    reads.evidence ? { key: '', read: reads.evidence } : null
  )
  const key = cited.join(',')
  const readRun = (run: string) => {
    setSnapshots((r) => ({ ...r, [run]: 'reading' }))
    agent.stub.getRun(run).then(
      (snapshot) => setSnapshots((r) => ({ ...r, [run]: snapshot })),
      (e: unknown) => setSnapshots((r) => ({ ...r, [run]: { failed: e instanceof Error ? e.message : String(e) } }))
    )
  }
  // A read lands only while it's still the one for the calls the report cites.
  const readEvidence = () => {
    const landed = (read: Read<Evidence[]>) => setEvidence((e) => (e?.key === key ? { key, read } : e))
    setEvidence({ key, read: 'reading' })
    agent.stub
      .getEvidence(cited)
      .then(landed, (e: unknown) => landed({ failed: e instanceof Error ? e.message : String(e) }))
  }
  useEffect(() => {
    if (state && known && !latest && !snapshot) readRun(id)
  }, [state !== undefined, id, known, latest])
  useEffect(() => {
    if (cited.length > 0 && !reads.evidence && evidence?.key !== key) readEvidence()
  }, [key])

  // The page's title and the top bar's breadcrumb name the launch as its page does.
  const named = state?.launch
  const crumb = named
    ? launchTitle(
        named.name,
        named.comps.map((c) => c.name)
      )
    : null
  useEffect(() => {
    if (crumb) document.title = `Report · ${crumb} · ${network.name} · Crossfeed`
  }, [crumb, network.name])
  const connection = connectionOf(agent)

  // The report's head, as a launch's title row has it: the launch, its one "sample" badge after the title's
  // last word while the run shows the sample data, and under it what the page is, with the connection's
  // state; then its one action, Print, which waits until `ready`, unless there's nothing to print.
  const head = (title: string, ready: boolean | null, sample = false) => (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 flex-1 basis-md flex-col gap-1.5">
        <h1 className="type-title text-balance">
          {title}
          {sample && (
            <>
              {' '}
              <Badge className="ml-0.5 align-middle">sample</Badge>
            </>
          )}
        </h1>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
          <span>Launch report</span>
          <span role="status" className="print:hidden">
            {state ? (
              <ConnectionState connection={connection} />
            ) : (
              <StateLine kind="loading">Connecting to the launch…</StateLine>
            )}
          </span>
        </p>
      </div>
      {ready !== null && (
        <Button disabled={!ready} focusableWhenDisabled onClick={() => window.print()} className="print:hidden">
          Print or save as PDF
        </Button>
      )}
    </div>
  )
  // The run's launch, as it was named for the run, or the launch as it now is.
  const titled = shown?.launch ?? named
  const title = titled ? launchHeading(titled) : 'Launch report'

  // Until the state arrives, and while an earlier run is read, the document's shape, still.
  if (!state || (known && !shown && !unread))
    return (
      <main className={cn(canvas, 'items-center')} aria-busy="true" data-report>
        <LaunchCrumb title={crumb} launch={launch} />
        <article className={sheet}>
          {head(title, false)}
          <div className="flex flex-col gap-2" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-4 w-80 max-w-full" />
            ))}
          </div>
        </article>
      </main>
    )
  // A run that isn't the launch's, or an earlier run that didn't load.
  if ((id !== null && !known) || unread)
    return (
      <main className={cn(canvas, 'print:hidden')} data-report>
        <LaunchCrumb title={crumb} launch={launch} />
        {head(title, null)}
        <div className="flex flex-col items-start gap-3">
          <Alert error={unread ? `This run didn’t load: ${unread}` : 'This launch has no such run.'} />
          {unread ? (
            <Button variant="secondary" onClick={() => readRun(id!)}>
              Try again
            </Button>
          ) : (
            <a className={buttonVariants({ variant: 'secondary' })} href={launch}>
              Open the launch
            </a>
          )}
        </div>
      </main>
    )
  // Like the CSV, a draft has no report, nor a run with no order.
  if (!shown || !order)
    return (
      <main className={cn(canvas, 'print:hidden')} data-report>
        <LaunchCrumb title={crumb} launch={launch} />
        {head(title, null)}
        <PageEmpty
          action={
            <a className={buttonVariants()} href={`${launch}#plan`}>
              Review the plan
            </a>
          }
        >
          This run’s report opens once its plan is approved.
        </PageEmpty>
      </main>
    )

  const log = evidence?.read
  const records = Array.isArray(log) ? log : null
  const n = runNumber(runs, id!)
  const summary = runs.find((r) => r.id === id)!
  return (
    <main className={cn(canvas, 'items-center print:p-0')} data-report>
      <LaunchCrumb title={crumb} launch={launch} />
      <CallLinks value={toEntry}>
        <article className={sheet}>
          {head(title, cited.length === 0 || records !== null, showsSample(shown, shown.run))}
          <Facts shown={shown} order={order} n={n} summary={summary} />
          <Finalists shown={shown} />
          <Pairs
            pairs={planPairs(shown.rosterOverlap, order.lines, shown.roster)}
            measuredAt={shown.rosterOverlap?.measuredAt ?? null}
          />
          <Section id="report-plan-h" title="The plan" description={PLAN_SENTENCE}>
            <Section
              id="report-io-h"
              level={3}
              title={<OrderTitle order={order} />}
              badge={<OrderBadge order={order} />}
            >
              <OrderLines
                order={order}
                sample={sampleLine(shown.roster, sampleCpmOf(shown))}
                sharedTags={Object.fromEntries(
                  (shown.ranking?.rows ?? []).flatMap((r) => (r.sharedTags ? [[r.show, r.sharedTags]] : []))
                )}
                openCall={noInspector}
                opened={null}
              />
            </Section>
          </Section>
          <CallsCited cited={cited} log={log} retry={readEvidence} />
        </article>
      </CallLinks>
    </main>
  )
}

// The report as a sheet on the canvas, on a reading measure; on paper, the page itself.
const sheet =
  'flex w-full max-w-3xl flex-col gap-8 rounded-xl bg-card p-4 md:p-8 print:max-w-none print:rounded-none print:p-0'

// What the launch goes by, as its page's title row says it.
const launchHeading = (launch: Launch) => launch.name ?? `From comps: ${launch.comps.map((c) => c.name).join(' · ')}`

// The run's facts: what the launch was looked up as, its comps or its Qloo match, each citing its search;
// the run, when it started and who started it; the CPM, and whether it's the sample's; and who approved
// the order, and when, or that the sample data's was approved as it was captured.
function Facts({
  shown,
  order,
  n,
  summary
}: {
  shown: RunSnapshot
  order: InsertionOrder
  n: number
  summary: RunSummary
}) {
  const { launch, cpm } = shown
  const cite = (call: string, label: string) => (
    <CallButton call={call} label={label} opened={null} openCall={noInspector} />
  )
  const comps = launch?.comps.filter((c) => c.status === 'confirmed' && c.entity) ?? []
  const match = launch?.match?.resolution === 'resolved' ? launch.match : null
  const approvedAt = order.approvedAt
  return (
    <KeyValues>
      {comps.length > 0 ? (
        <KeyValue label="Comps">
          {comps.map((c, i) => (
            <span key={c.name}>
              {i > 0 && ' · '}
              {c.entity!.name} {c.match && cite(c.match.evidence, `Evidence for the comp ${c.name}`)}
            </span>
          ))}
        </KeyValue>
      ) : (
        match?.entity && (
          <KeyValue label="Qloo match">
            {match.entity.name} {cite(match.evidence, `Evidence for ${launch?.name ?? 'the launch'}`)}
          </KeyValue>
        )
      )}
      <KeyValue label="Run">{`Run ${n}`}</KeyValue>
      <KeyValue label="Started">
        {`${day(summary.startedAt)}, ${clock(summary.startedAt)}`}
        {summary.startedBy && ` by ${summary.startedBy}`}
      </KeyValue>
      <KeyValue label="CPM">
        {cpm === null ? '–' : `${dollars(cpm)}${sampleCpmOf(shown) ? ', the sample network’s' : ''}`}
      </KeyValue>
      <KeyValue label="Approved">
        {order.fromSample
          ? `In the sample data, by ${order.approvedBy} as it was captured, not by anyone in this network`
          : order.approvedBy && approvedAt
            ? `By ${order.approvedBy} on ${day(approvedAt)} at ${clock(approvedAt)}`
            : 'Yes'}
      </KeyValue>
    </KeyValues>
  )
}

// The finalists by who listens, the fit chart's default lens, fixed: its heading and its finding, citing
// the ranking, then each finalist's rank, its shared tags with their call, its band and its slot value,
// as a real table; then the footnotes and the demographics line, as the chart has them. Under 640px each
// row folds to two lines, as the chart's do: the rank beside the show, then its band and slot value.
function Finalists({ shown }: { shown: RunSnapshot }) {
  const ranking = shown.ranking!
  const moves = shown.topic?.status === 'ranked' && !ranking.error ? shown.topic.moves : null
  const rows = finalistsOf(ranking)
  const cpm = shown.cpm
  const show = (name: string) => shown.roster.find((s) => s.name === name)
  const head = 'border-b pb-2 align-bottom font-normal'
  const cell = 'border-b py-2.5 align-baseline max-sm:border-b-0 max-sm:py-0'
  return (
    <Section
      id="report-fit-h"
      title={whoShares(ranking.anchors.map((a) => a.name))}
      description={
        <>
          {finding(ranking, moves)}{' '}
          <CallButton call={ranking.call} label="Evidence for the fit ranking" opened={null} openCall={noInspector} />
        </>
      }
    >
      <table className="w-full border-separate border-spacing-0" aria-labelledby="report-fit-h" data-report-finalists>
        <thead className="type-caption text-muted-foreground">
          <tr className="max-sm:sr-only">
            <th scope="col" className={cn(head, 'w-10 pr-1 text-right')}>
              Rank
            </th>
            <th scope="col" className={cn(head, 'pl-3 text-left')}>
              Show
            </th>
            <th scope="col" className={cn(head, 'w-20 pl-3 text-left')}>
              Fit
            </th>
            <th scope="col" className={cn(head, 'w-32 pl-3 text-right')}>
              Slot value
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.show}
              className="max-sm:grid max-sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] max-sm:items-baseline max-sm:gap-y-1.5 max-sm:border-b max-sm:py-2.5 max-sm:[grid-template-areas:'rank_show_show'_'rank_fit_slot']"
            >
              <td className={cn(cell, 'pr-1 text-right type-title tabular-nums max-sm:[grid-area:rank]')}>{r.rank}</td>
              <th scope="row" className={cn(cell, 'pl-3 text-left font-normal max-sm:[grid-area:show]')}>
                <span className="text-[15px] leading-snug font-semibold wrap-anywhere">{r.show}</span>
                {(r.sharedTags || !sameName(r.entity.name, r.show)) && (
                  <span className="mt-1 block type-caption text-muted-foreground">
                    {r.sharedTags && (
                      <>
                        {tagWords(r.sharedTags)}{' '}
                        <CallButton
                          call={r.sharedTags.call}
                          label={`Evidence for the tags ${r.show} shares`}
                          opened={null}
                          openCall={noInspector}
                        />
                      </>
                    )}
                    {r.sharedTags && !sameName(r.entity.name, r.show) && ' · '}
                    {!sameName(r.entity.name, r.show) && `Mapped to ${r.entity.name}`}
                  </span>
                )}
              </th>
              <td className={cn(cell, 'pl-3 max-sm:[grid-area:fit]')}>
                <FitBand band={r.band} finalist />
              </td>
              <td className={cn(cell, 'pl-3 max-sm:[grid-area:slot]')}>
                <SlotValue show={show(r.show)} cpm={cpm} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-col gap-1.5 type-caption text-muted-foreground">
        <p>Fit bands are thirds of this ranking, and the top five, after any shows left out, are finalists.</p>
        <p>
          {cpm === null
            ? 'Slot values need the network’s CPM.'
            : `Slot value = downloads × ${dollars(cpm)}${sampleCpmOf(shown) ? ' sample' : ''} CPM ÷ 1,000${rows.some((r) => show(r.show)?.sample?.includes('downloads')) ? ' · sample figures' : ''}`}
        </p>
        {shown.demographics && (
          <DemographicSummary check={shown.demographics} ranking={ranking} openCall={noInspector} opened={null} />
        )}
      </div>
    </Section>
  )
}

// The close pairs among the plan's shows, as the plan names them, from the roster's overlap as the run
// copied it when it started; with none copied, as on a roster never measured, the report says nothing of
// pairs, as the plan doesn't.
function Pairs({ pairs, measuredAt }: { pairs: PlanPairs | null; measuredAt: string | null }) {
  if (!pairs) return null
  return (
    <Section
      id="report-pairs-h"
      title="Close pairs"
      description={`From the roster’s overlap${measuredAt ? `, measured ${day(measuredAt)},` : ''} as the run copied it when it started.`}
    >
      <ClosePairs pairs={pairs} openCall={noInspector} opened={null} />
    </Section>
  )
}

// Every call the report cites, by its number, each the entry its call numbers link to: what kind of Qloo
// call it was, where its answer came from when the launch didn't make the request, and when it was made.
// Where every call's answer came from the same place, as the sample data's do, a caption says it once
// under the table instead. While their records are read, the table's shape, still; a read that failed
// says why, with Try again.
function CallsCited({ cited, log, retry }: { cited: string[]; log: Read<Evidence[]> | undefined; retry: () => void }) {
  const failed = failure(log)
  const records = Array.isArray(log) ? log : null
  const said = new Map((records ?? []).filter((r) => cited.includes(r.call)).map((r) => [r.call, citedCall(r)]))
  const froms = new Set([...said.values()].map((c) => c.from))
  const shared = said.size === cited.length && froms.size === 1 ? [...froms][0] : null
  const head = 'border-b pb-2 align-bottom font-normal text-left'
  const cell = 'border-b py-2 align-baseline'
  return (
    <Section
      id="report-calls-h"
      title="Calls cited"
      badge={<Source of="qloo" />}
      description="Each Qloo call the report cites, by its number: what kind of call it was, and when it was made."
      data-calls-cited
    >
      {failed ? (
        <div className="flex flex-col items-start gap-3">
          <Alert error={`The calls didn’t load: ${failed}`} />
          <Button variant="secondary" onClick={retry}>
            Try again
          </Button>
        </div>
      ) : (
        <table
          className="w-full border-separate border-spacing-0"
          aria-labelledby="report-calls-h"
          aria-describedby={shared ? 'report-calls-from' : undefined}
          aria-busy={!records || undefined}
        >
          <thead className="type-caption text-muted-foreground">
            <tr>
              <th scope="col" className={cn(head, 'w-16')}>
                Call
              </th>
              <th scope="col" className={cn(head, 'pl-3')}>
                Kind
              </th>
              <th scope="col" className={cn(head, 'w-36 pl-3 text-right')}>
                Made
              </th>
            </tr>
          </thead>
          <tbody>
            {cited.map((call) => {
              const record = records?.find((r) => r.call === call)
              const what = said.get(call)
              return (
                <tr key={call} id={entry(call)} className="target:bg-muted">
                  <th scope="row" className={cn(cell, 'text-left font-normal')}>
                    <code className="font-mono text-xs" translate="no">
                      {call}
                    </code>
                  </th>
                  <td className={cn(cell, 'pl-3')}>
                    {!records ? (
                      <Skeleton className="h-4 w-48 max-w-full" />
                    ) : what ? (
                      <>
                        {what.kind}
                        {record!.error && ', which failed'}
                        {what.from && !shared && (
                          <span className="block type-caption text-muted-foreground">{what.from}</span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">Not in the launch’s log.</span>
                    )}
                  </td>
                  <td className={cn(cell, 'pl-3 text-right')}>
                    {!records ? (
                      <Skeleton className="ml-auto h-4 w-24" />
                    ) : record ? (
                      `${day(record.at)}, ${clock(record.at)}`
                    ) : (
                      '–'
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {shared && (
        <p id="report-calls-from" className="type-caption text-muted-foreground">
          {`Each call’s answer is ${shared[0].toLowerCase()}${shared.slice(1)}.`}
        </p>
      )}
    </Section>
  )
}

// The calls the report cites, in call order: the launch's searches, the ranking, the finalists' shared
// tags, the demographic check, the rankings its close pairs cite, and the plan's lines' tags.
function citedCalls(shown: RunSnapshot, order: InsertionOrder) {
  const { launch, ranking, demographics } = shown
  const pairs = planPairs(shown.rosterOverlap, order.lines, shown.roster)
  const tags = new Map((ranking?.rows ?? []).flatMap((r) => (r.sharedTags ? [[r.show, r.sharedTags.call]] : [])))
  const calls = [
    ...(launch?.comps.some((c) => c.status === 'confirmed' && c.entity)
      ? launch.comps.filter((c) => c.status === 'confirmed' && c.entity && c.match).map((c) => c.match!.evidence)
      : launch?.match?.resolution === 'resolved' && launch.match.entity
        ? [launch.match.evidence]
        : []),
    ...(ranking ? [ranking.call] : []),
    ...finalistsOf(ranking).flatMap((r) => (r.sharedTags ? [r.sharedTags.call] : [])),
    ...(demographics ? [demographics.call] : []),
    ...(pairs && !pairs.stale
      ? [
          ...pairs.pairs.flatMap((p) => p.calls),
          ...(pairs.pairs.length === 0 && pairs.unchecked.length === 0 ? pairs.checked.map((c) => c.call) : [])
        ]
      : []),
    ...order.lines.flatMap((l) => tags.get(l.show) ?? [])
  ]
  return [...new Set(calls)].sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)))
}
