import { cn } from 'cn'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import type { Launch, Run, RunSnapshot, RunSummary, Show } from '../agent'
import type { FitRow } from '../fit'
import { dollars, type OrderLine } from '../order'
import { moveGlyph, moveWords } from '../text'
import { Alert, downloads, KeyValue, KeyValues, ScrollTable } from './controls'
import { Section } from './PageHeader'
import { budgetText, runLabel, runNumber } from './Run'
import { StateLine } from './states'

// A launch's Changes tab: the run the page shows compared with an earlier one, from the two runs'
// snapshots alone, as getRun keeps them, with no call to Qloo or Claude. The inputs that changed come
// first, as the cause, then the finalists that joined and left, each ranked show's move, and the plan's
// lines and totals.

const MISSING = '–'
const NONE = 'None'

// A ranked show in one run: its name there, its rank, and whether it's a finalist.
type Place = { show: string; rank: number; finalist: boolean }

// A ranked show across the two runs, matched on its Qloo entity: where it was and where it is, null in a
// run that didn't rank it.
type Move = { key: string; show: string; before: Place | null; after: Place | null }

// An order line across the two runs, matched as its show is, null in a run whose order has no such line.
type Line = { key: string; show: string; before: OrderLine | null; after: OrderLine | null }

// What changed between two runs of one launch, `before` the earlier.
type Changes = {
  inputs: { label: string; lines: string[] }[] // only those that changed, each before → after
  ranked: 'both' | 'before' | 'after' | 'neither' // which runs ranked the roster
  joined: string[] // the finalists that joined
  left: string[] // and left
  moves: Move[] // every show either run ranked, the biggest moves first
  kept: boolean // both runs ranked every show, each at the same rank
  alike: boolean // the two runs ranked the roster alike: every show kept its rank and its finalist mark
  lines: Line[] | null // null when neither run has an order
  orders: { before: RunSnapshot['insertionOrder']; after: RunSnapshot['insertionOrder'] }
  samePlan: boolean // both orders hold the same lines, slots and values
}

const arrow = (before: string, after: string) => `${before} → ${after}`

// The launch's Qloo match, and its confirmed comps, as each run scored them. A launch from before comps
// has none to compare.
const matchOf = (launch: Launch | null) => launch?.match?.entity?.name ?? MISSING
const compsOf = (launch: Launch | null) =>
  launch?.comps === undefined
    ? MISSING
    : launch.comps.flatMap((c) => (c.status === 'confirmed' && c.entity ? [c.entity.name] : [])).join(' · ') || NONE
// What the programmer answered: a run that never asked has no budget or exclusions.
const budgetOf = (run: Run | null) => (run?.budget ? budgetText(run.budget) : MISSING)
const leftOutOf = (run: Run | null) =>
  !run?.exclusions ? MISSING : run.exclusions.length ? run.exclusions.join(', ') : NONE
// A roster show's match as a ranking scores it.
const scoredAs = (show: Show) =>
  (show.resolution === 'resolved' || show.resolution === 'mapped') && show.entity ? show.entity.name : MISSING

// The roster's shows added and removed, by the names the network gave them, then each show kept whose
// match, figures or exclusion changed, in the later roster's order.
function rosterChanges(before: Show[], after: Show[]) {
  const was = new Map(before.map((s) => [s.name, s]))
  const now = new Set(after.map((s) => s.name))
  const added = after.filter((s) => !was.has(s.name)).map((s) => s.name)
  const removed = before.filter((s) => !now.has(s.name)).map((s) => s.name)
  const lines = [
    ...(added.length ? [`Added: ${added.join(', ')}`] : []),
    ...(removed.length ? [`Removed: ${removed.join(', ')}`] : [])
  ]
  for (const show of after) {
    const old = was.get(show.name)
    if (!old) continue
    const field = (name: string, a: string, b: string) => (a === b ? [] : [`${name} ${arrow(a, b)}`])
    const changed = [
      ...field('Qloo match', scoredAs(old), scoredAs(show)),
      ...field('downloads per episode', downloads(old.downloads), downloads(show.downloads)),
      ...field('status', old.status ?? MISSING, show.status ?? MISSING),
      ...(old.excluded === show.excluded ? [] : [show.excluded ? 'included → excluded' : 'excluded → included'])
    ]
    if (changed.length) lines.push(`${show.name}: ${changed.join(', ')}`)
  }
  return lines
}

// A run's ranked shows, or null when the run didn't rank the roster.
const rowsOf = (state: RunSnapshot) => (state.ranking && !state.ranking.error ? state.ranking.rows : null)

// The Qloo entities two ranked shows share in either run, as a show mapped onto another's entity does.
// Shows on them are matched on entity and name in both runs alike, so a show keeps its key when another
// is mapped onto its entity.
function sharedEntities(...states: RunSnapshot[]) {
  const shared = new Set<string>()
  for (const state of states) {
    const seen = new Set<string>()
    for (const r of rowsOf(state) ?? []) {
      if (seen.has(r.entity.id)) shared.add(r.entity.id)
      seen.add(r.entity.id)
    }
  }
  return shared
}

// A run's ranked shows by their Qloo entity, or by entity and name on a `shared` one; null when the run
// didn't rank the roster.
function ranked(state: RunSnapshot, shared: Set<string>) {
  const rows = rowsOf(state)
  return rows && new Map(rows.map((r) => [shared.has(r.entity.id) ? `${r.entity.id} ${r.show}` : r.entity.id, r]))
}

// The order of moves, by group: shows that moved, biggest first, then those only the later run ranked,
// then those only the earlier one did, then those at the same rank; each group in rank order.
const MOVED = 0
const ONLY_LATER = 1
const ONLY_EARLIER = 2
const SAME_RANK = 3
const group = ({ before, after }: Move) =>
  before && after ? (before.rank === after.rank ? SAME_RANK : MOVED) : after ? ONLY_LATER : ONLY_EARLIER
const size = ({ before, after }: Move) => (before && after ? Math.abs(before.rank - after.rank) : 0)
const byMove = (a: Move, b: Move) =>
  group(a) - group(b) || size(b) - size(a) || (a.after ?? a.before)!.rank - (b.after ?? b.before)!.rank

// What changed from run `before` to run `after`, a pure function of the two snapshots.
function compare(before: RunSnapshot, after: RunSnapshot): Changes {
  const inputs: Changes['inputs'] = []
  // A value one run's snapshot lacks against none in the other, such as no exclusions where an older
  // snapshot predates the answer, is never a change.
  const changed = (label: string, a: string, b: string) => {
    if (a !== b && [a, b].some((v) => v !== MISSING && v !== NONE)) inputs.push({ label, lines: [arrow(a, b)] })
  }
  changed('Qloo match', matchOf(before.launch), matchOf(after.launch))
  changed('Comps', compsOf(before.launch), compsOf(after.launch))
  const roster = rosterChanges(before.roster, after.roster)
  if (roster.length) inputs.push({ label: 'Roster', lines: roster })
  changed('CPM', before.cpm === null ? MISSING : dollars(before.cpm), after.cpm === null ? MISSING : dollars(after.cpm))
  changed('Slot budget', budgetOf(before.run), budgetOf(after.run))
  changed('Left out', leftOutOf(before.run), leftOutOf(after.run))

  const shared = sharedEntities(before, after)
  const [was, now] = [ranked(before, shared), ranked(after, shared)]
  const place = (r: FitRow | undefined) => (r ? { show: r.show, rank: r.rank, finalist: r.finalist } : null)
  const moves =
    was && now
      ? [...new Set([...now.keys(), ...was.keys()])]
          .map((key) => ({
            key,
            show: (now.get(key) ?? was.get(key))!.show,
            before: place(was.get(key)),
            after: place(now.get(key))
          }))
          .sort(byMove)
      : []
  const kept = !!was && !!now && moves.every((m) => group(m) === SAME_RANK)
  const joined = moves.filter((m) => m.after?.finalist && !m.before?.finalist).map((m) => m.show)
  const left = moves.filter((m) => m.before?.finalist && !m.after?.finalist).map((m) => m.show)

  // Each order's lines by the key its show ranks under in that run, so a line follows its show's entity.
  const linesOf = (state: RunSnapshot, rows: Map<string, FitRow> | null) => {
    const keys = new Map([...(rows ?? [])].map(([key, r]) => [r.show, key]))
    return new Map((state.insertionOrder?.lines ?? []).map((l) => [keys.get(l.show) ?? l.show, l]))
  }
  const orders = { before: before.insertionOrder, after: after.insertionOrder }
  const [linesBefore, linesAfter] = [linesOf(before, was), linesOf(after, now)]
  const lines =
    orders.before || orders.after
      ? [...new Set([...linesAfter.keys(), ...linesBefore.keys()])].map((key) => ({
          key,
          show: (linesAfter.get(key) ?? linesBefore.get(key))!.show,
          before: linesBefore.get(key) ?? null,
          after: linesAfter.get(key) ?? null
        }))
      : null
  return {
    inputs,
    ranked: was ? (now ? 'both' : 'before') : now ? 'after' : 'neither',
    joined,
    left,
    moves,
    kept,
    alike: kept && moves.every((m) => m.before!.finalist === m.after!.finalist),
    lines,
    orders,
    samePlan:
      !!orders.before &&
      !!orders.after &&
      orders.before.total === orders.after.total &&
      lines!.every((l) => l.before && l.after && l.before.slots === l.after.slots && l.before.value === l.after.value)
  }
}

const counted = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const capitalized = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// The comparison's finding, in one sentence: how the ranking changed, then the plan. With no show moved,
// it says so, or, once the roster changed between the runs, that the shows both ranked kept their ranks.
function finding(c: Changes, n: number, m: number) {
  // A finalist that joined took the place of one that left, so a swap counts once.
  const finalists = Math.max(c.joined.length, c.left.length)
  const moved = c.moves.filter((mv) => group(mv) === MOVED).length
  const changed = [
    ...(finalists ? [counted(finalists, 'finalist changed', 'finalists changed')] : []),
    moved
      ? counted(moved, 'show moved', 'shows moved')
      : c.kept
        ? 'no show moved'
        : 'the shows both runs ranked kept their ranks'
  ]
  const ranking =
    c.ranked === 'neither'
      ? `neither run ${m} nor run ${n} ranked the roster`
      : c.ranked !== 'both'
        ? `only run ${c.ranked === 'after' ? n : m} ranked the roster`
        : c.alike
          ? `run ${n} ranked the roster as run ${m} did`
          : changed.join(', ')
  const { before, after } = c.orders
  const priced = before && after && (!before.complete || !after.complete) ? ', before the lines without a value' : ''
  const delta = before && after ? after.total - before.total : 0
  const plan =
    c.samePlan || (!before && !after)
      ? null
      : !before
        ? `run ${n} has a plan worth ${dollars(after!.total)} and run ${m} had none`
        : !after
          ? `run ${n} has no plan and run ${m}’s was worth ${dollars(before.total)}`
          : delta > 0
            ? `the plan’s value rose ${dollars(delta)}${priced}`
            : delta < 0
              ? `the plan’s value fell ${dollars(-delta)}${priced}`
              : `the plan’s value held at ${dollars(after.total)}${priced}`
  return `${capitalized(ranking)}${plan ? `; ${plan}` : ''}.`
}

// A run the comparison can start from: one that ranked the roster itself, not a replay of the sample.
const comparable = (r: RunSummary) => r.status === 'completed' && !r.replayed

// An earlier run as the tab has it: being read, read, or why it couldn't be.
type Read = 'reading' | RunSnapshot | { failed: string }

// The Changes tab. `shown` is the run the page shows, the latest as the launch's state has it or an
// earlier one as getRun returned it, and `runs` every run, oldest first. It compares the shown run, once
// it's completed, with the latest earlier run that completed without replaying the sample, or with the
// one chosen; the choice lists every earlier run, those that can't be compared disabled with their
// status. Each earlier run is read with `read` once the tab has shown (`seen`), unless the page was given
// it (`earlier`), as the tests give them, and kept for the page's life, as an ended run's snapshot only
// changes with its order, which only the latest run's can.
export function RunChanges({
  runs,
  shown,
  read,
  seen,
  earlier = {}
}: {
  runs: RunSummary[]
  shown: { id: string; state: RunSnapshot }
  read: (id: string) => Promise<RunSnapshot>
  seen: boolean
  earlier?: Record<string, RunSnapshot>
}) {
  const [reads, setReads] = useState<Record<string, Read>>(earlier)
  // The run chosen to compare with, for the run it was chosen for, so viewing another starts afresh.
  const [choice, setChoice] = useState<{ for: string; id: string } | null>(null)
  const n = runNumber(runs, shown.id)
  const before = runs.slice(0, Math.max(n - 1, 0))
  const baseline = choice?.for === shown.id ? choice.id : before.findLast(comparable)?.id
  const m = baseline ? runNumber(runs, baseline) : null
  const status = shown.state.run?.status
  const load = (id: string) => {
    setReads((r) => ({ ...r, [id]: 'reading' }))
    read(id).then(
      (state) => setReads((r) => ({ ...r, [id]: state })),
      (e: unknown) => setReads((r) => ({ ...r, [id]: { failed: e instanceof Error ? e.message : String(e) } }))
    )
  }
  useEffect(() => {
    if (seen && status === 'completed' && baseline && !reads[baseline]) load(baseline)
  }, [seen, status, baseline])

  const earlierRun = baseline ? reads[baseline] : undefined
  const changes = typeof earlierRun === 'object' && 'roster' in earlierRun ? compare(earlierRun, shown.state) : null
  const failed = typeof earlierRun === 'object' && 'failed' in earlierRun ? earlierRun.failed : null
  const state =
    status === 'running' || status === 'waiting' ? (
      <StateLine kind="loading">{`Run ${n}’s changes show once it completes.`}</StateLine>
    ) : status !== 'completed' ? (
      <StateLine kind="empty">
        {`Run ${n} ${status === 'stopped' ? 'stopped at a limit' : 'failed'}, so there’s nothing to compare.`}
      </StateLine>
    ) : !m ? (
      <StateLine kind="empty">
        {before.length === 0
          ? `Run ${n} is the launch’s first run, so there’s nothing earlier to compare.`
          : `No run before run ${n} can be compared with it: each failed, stopped or replayed the sample.`}
      </StateLine>
    ) : changes ? (
      finding(changes, n, m)
    ) : failed ? (
      <Alert error={`Run ${m} didn’t load: ${failed}`} />
    ) : (
      <StateLine kind="loading" word="Reading">{`run ${m}…`}</StateLine>
    )
  // The sentence is told politely as it changes, so choosing another run says its finding; a failure is
  // an alert of its own.
  const description = failed && !changes ? state : <span role="status">{state}</span>
  return (
    <Section id="changes-h" title={m ? `Changes since run ${m}` : 'Changes'} description={description} data-changes>
      {status === 'completed' && m && (
        <Field>
          <FieldLabel htmlFor="changes-run">Compare with</FieldLabel>
          <NativeSelect
            id="changes-run"
            value={baseline}
            onChange={(e) => setChoice({ for: shown.id, id: e.target.value })}
            className="w-full sm:w-64"
          >
            {before
              .map((r, i) => ({ ...r, number: i + 1 }))
              .reverse()
              .map((r) => (
                <NativeSelectOption key={r.id} value={r.id} disabled={!comparable(r)}>
                  {`Run ${r.number} · ${runLabel[r.status]}${r.replayed ? ' · Replayed' : ''}`}
                </NativeSelectOption>
              ))}
          </NativeSelect>
        </Field>
      )}
      {status === 'completed' &&
        m &&
        !changes &&
        (failed ? (
          <Button variant="secondary" className="self-start" onClick={() => load(baseline!)}>
            Try again
          </Button>
        ) : (
          // The comparison's shape, still, while the earlier run is read.
          <div className="flex flex-col gap-2" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-4 w-80 max-w-full" />
            ))}
          </div>
        ))}
      {changes && m && (
        <>
          {/* The h3s say no more than their titles, as the finding over them says what changed; the
              inputs' sentence is there only when none changed, and the ranks' only when no show moved,
              in place of a row a show. */}
          <Section
            id="changes-inputs-h"
            level={3}
            title="Inputs"
            description={changes.inputs.length === 0 && `Run ${n} ran on the same inputs as run ${m}.`}
          >
            {changes.inputs.length > 0 && (
              <KeyValues>
                {changes.inputs.map((input) => (
                  <KeyValue key={input.label} label={input.label}>
                    {input.lines.map((line) => (
                      <span key={line} className="block">
                        {line}
                      </span>
                    ))}
                  </KeyValue>
                ))}
              </KeyValues>
            )}
          </Section>
          {changes.ranked === 'both' && !changes.alike && (
            <Section
              id="changes-ranks-h"
              level={3}
              title="Ranks"
              description={changes.kept && 'Every show kept its rank.'}
            >
              {(changes.joined.length > 0 || changes.left.length > 0) && (
                <KeyValues>
                  <KeyValue label="Joined the finalists">{changes.joined.join(', ') || NONE}</KeyValue>
                  <KeyValue label="Left the finalists">{changes.left.join(', ') || NONE}</KeyValue>
                </KeyValues>
              )}
              {!changes.kept && <Moves moves={changes.moves} n={n} m={m} />}
            </Section>
          )}
          {changes.lines && !changes.samePlan && (
            <Section id="changes-plan-h" level={3} title="Plan">
              <PlanLines lines={changes.lines} orders={changes.orders} m={m} />
            </Section>
          )}
        </>
      )}
    </Section>
  )
}

// The ranked shows in the fit chart's row anatomy, as a real table: each one's rank in run `n`, its move
// since run `m` beside it, the mark (▲ and its places in signal ink for a climb, ▼ muted for a fall, = for
// none) then the move in words, and its name, with a chip when it joined or left the finalists. A show
// only one run ranked has `–` where the other run's rank would be. It lists the shows that changed, those
// that moved, joined or left the finalists, or only one run ranked, with "Show all N" for the rest, as the
// fit chart lists its own.
function Moves({ moves, n, m }: { moves: Move[]; n: number; m: number }) {
  const [all, setAll] = useState(false)
  const changed = moves.filter((mv) => group(mv) !== SAME_RANK || mv.before!.finalist !== mv.after!.finalist)
  const head = 'border-b pb-2 pl-3 text-left align-bottom font-normal'
  const cell = 'border-b py-3 pl-3 align-baseline'
  return (
    <>
      {/* It scrolls with no held column, as the name follows the rank and move, so names stay whole. */}
      <ScrollTable label={`Ranks since run ${m}`} className="-mx-2 max-w-none">
        <table className="w-full border-separate border-spacing-0" aria-labelledby="changes-ranks-h">
          <thead className="type-caption text-muted-foreground">
            <tr>
              <th scope="col" className={cn(head, 'w-12 pl-2 text-right')}>
                Rank
              </th>
              <th scope="col" className={cn(head, 'w-32')}>{`Since run ${m}`}</th>
              <th scope="col" className={cn(head, 'pr-2')}>
                Show
              </th>
            </tr>
          </thead>
          <tbody>
            {(all ? moves : changed).map(({ key, show, before, after }) => {
              const move = before && after ? before.rank - after.rank : null
              return (
                <tr key={key} data-move={show}>
                  <td className={cn(cell, 'pl-2 text-right type-title tabular-nums')}>
                    {after ? (
                      after.rank
                    ) : (
                      <>
                        <span aria-hidden="true">–</span>
                        <span className="vh">{`Not ranked in run ${n}`}</span>
                      </>
                    )}
                  </td>
                  <td className={cn(cell, 'whitespace-nowrap')}>
                    <span
                      className={cn(
                        'mr-1.5 tabular-nums',
                        move !== null && move > 0 ? 'font-semibold text-signal-ink' : 'text-muted-foreground'
                      )}
                    >
                      <span aria-hidden="true">{move === null ? '–' : moveGlyph(move)}</span>
                      {move ? <span className="vh">{moveWords(move)}</span> : null}
                      {!before && <span className="vh">{`Not ranked in run ${m}`}</span>}
                    </span>
                    {before && (move === 0 ? 'Same rank' : `Was #${before.rank}`)}
                  </td>
                  <th scope="row" className={cn(cell, 'pr-2 text-left font-normal')}>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[15px] leading-snug font-semibold">{show}</span>
                      {after?.finalist && !before?.finalist && <Badge mark="signal">New finalist</Badge>}
                      {before?.finalist && !after?.finalist && <Badge>Left the finalists</Badge>}
                    </span>
                  </th>
                </tr>
              )
            })}
          </tbody>
        </table>
      </ScrollTable>
      {changed.length < moves.length && (
        <Button variant="ghost" size="sm" className="-ml-2.5 self-start" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${moves.length}`}
        </Button>
      )}
      {moves.some((mv) => !mv.before || !mv.after) && (
        <p className="type-caption text-muted-foreground">
          – marks a show ranked in only one of the two runs: the roster changed between them.
        </p>
      )}
    </>
  )
}

// The plan's lines, run `m`'s slots and value → the shown run's, then the totals, in a named region that
// scrolls sideways with the show column held at the left, as the roster's table does. A line only one
// run's order has shows `–` for the other, as does a line with no value.
function PlanLines({ lines, orders, m }: { lines: Line[]; orders: Changes['orders']; m: number }) {
  const slots = (x: { slots: number } | null) => (x ? String(x.slots) : MISSING)
  const value = (l: OrderLine | null) => (l?.value == null ? MISSING : dollars(l.value))
  const head = 'border-b pb-2 pl-3 text-right align-bottom font-normal'
  const cell = 'border-b py-3 pl-3 text-right align-baseline whitespace-nowrap'
  // Held where the rest scrolls under it, ruled where they meet; a name too long for it breaks anywhere.
  const held = 'sticky left-0 bg-background pl-2 text-left wrap-anywhere max-md:border-r max-md:pr-3'
  return (
    <ScrollTable label={`The plan’s lines since run ${m}`} className="-mx-2 max-w-none">
      <table className="w-full border-separate border-spacing-0" aria-labelledby="changes-plan-h">
        <thead className="type-caption text-muted-foreground">
          <tr>
            <th scope="col" className={cn(head, held)}>
              Show
            </th>
            <th scope="col" className={head}>
              Slots
            </th>
            <th scope="col" className={cn(head, 'pr-2')}>
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.key} data-change-line={l.show}>
              <th scope="row" className={cn(cell, held, 'font-normal whitespace-normal')}>
                <span className="text-[15px] leading-snug font-semibold">{l.show}</span>
              </th>
              <td className={cn(cell, 'tabular-nums')}>{arrow(slots(l.before), slots(l.after))}</td>
              <td className={cn(cell, 'pr-2')}>{arrow(value(l.before), value(l.after))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className={cn(held, 'pt-3 font-semibold')}>
              Total
            </th>
            <td className="pt-3 pl-3 text-right font-semibold whitespace-nowrap tabular-nums">
              {arrow(slots(orders.before), slots(orders.after))}
            </td>
            <td className="pt-3 pr-2 pl-3 text-right font-semibold whitespace-nowrap">
              {arrow(
                orders.before ? dollars(orders.before.total) : MISSING,
                orders.after ? dollars(orders.after.total) : MISSING
              )}
            </td>
          </tr>
        </tfoot>
      </table>
    </ScrollTable>
  )
}
