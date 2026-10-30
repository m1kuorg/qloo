import { cn } from 'cn'
import { Fragment, type ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { linkVariants } from '@/components/ui/variants'
import type { CommittedLines, LaunchSummary, State } from '../agent'
import { dollars } from '../order'
import { ScrollTable } from './controls'
import { launchTitle } from './LaunchFields'
import { count, Section } from './PageHeader'
import { StateLine } from './states'

// The Launches page's Inventory tab (#406): the network's promo inventory across its launches, from what
// each launch's row says it commits (`finalistShows`, `approvedLines` and `draftLines`). A row reported
// before rows said it has none of them, so its launch hasn't reported, and the totals leave it out.

// A show on the roster or in an order: whether it's still on the roster; how many launches' latest
// completed runs made it a finalist; the slots the approved orders commit to it, the value of those its
// lines priced, and whether any line was priced; the slots the drafts commit, never added to the approved;
// and the launches whose orders commit any, in the network's order.
type Row = {
  show: string
  onRoster: boolean
  finalistIn: number
  approved: number
  approvedValue: number
  priced: boolean
  drafted: number
  launches: LaunchSummary[]
}

// The groups the table puts the rows in, in order.
const IN_ORDER = 'In an order'
const FINALIST_ONLY = 'Finalist only'
const NEVER = 'Never a finalist'

// The totals the sentence gives, over the reported launches' orders, the approved apart from the drafted,
// never added together: each kind's orders and their slots, and of the approved, the value of the lines
// priced, whether a line had no value, and the orders priced at a CPM labelled the sample's.
function totalsOf(reported: LaunchSummary[]) {
  const slotsOf = (orders: CommittedLines[]) => orders.reduce((n, o) => n + o.lines.reduce((m, l) => m + l.slots, 0), 0)
  const approved = reported.flatMap((l) => (l.approvedLines ? [l.approvedLines] : []))
  const drafted = reported.flatMap((l) => (l.draftLines ? [l.draftLines] : []))
  const lines = approved.flatMap((o) => o.lines)
  return {
    approvedOrders: approved.length,
    approvedSlots: slotsOf(approved),
    draftOrders: drafted.length,
    draftSlots: slotsOf(drafted),
    value: lines.reduce((n, l) => n + (l.value ?? 0), 0),
    unpriced: lines.some((l) => l.value === null),
    sample: approved.filter((o) => o.sampleCpm)
  }
}

// The network's inventory from its launches' rows and its roster: whether any reported launch has ranked
// the roster, how many launches haven't reported, the totals, and the rows in their groups. A group
// that's in an order leads with the most slots approved, then drafted, then finalists; Finalist only
// with the most finalists; and each then in the roster's order, a show that left it last.
function inventoryOf(launches: LaunchSummary[], roster: State['roster']) {
  const reported = launches.filter((l) => l.finalistShows !== undefined)
  const rows = new Map<string, Row>()
  const row = (show: string) => {
    const r = rows.get(show) ?? {
      show,
      onRoster: false,
      finalistIn: 0,
      approved: 0,
      approvedValue: 0,
      priced: false,
      drafted: 0,
      launches: []
    }
    rows.set(show, r)
    return r
  }
  for (const s of roster) row(s.name).onRoster = true
  for (const l of reported) {
    const commit = (
      lines: CommittedLines | null | undefined,
      add: (r: Row, slots: number, value: number | null) => void
    ) => {
      for (const line of lines?.lines ?? []) {
        const r = row(line.show)
        add(r, line.slots, line.value)
        if (!r.launches.includes(l)) r.launches.push(l)
      }
    }
    commit(l.approvedLines, (r, slots, value) => {
      r.approved += slots
      if (value === null) return
      r.approvedValue += value
      r.priced = true
    })
    commit(l.draftLines, (r, slots) => {
      r.drafted += slots
    })
  }
  // Only a show on the roster or in an order has a row, so a finalist that has since left both has none.
  for (const l of reported)
    for (const show of new Set(l.finalistShows)) {
      const r = rows.get(show)
      if (r) r.finalistIn++
    }
  const place = new Map(roster.map((s, i) => [s.name, i]))
  const inRoster = (a: Row, b: Row) =>
    (place.get(a.show) ?? roster.length) - (place.get(b.show) ?? roster.length) || a.show.localeCompare(b.show)
  const all = [...rows.values()]
  const committed = all.filter((r) => r.approved > 0 || r.drafted > 0)
  const finalists = all.filter((r) => !committed.includes(r) && r.finalistIn > 0)
  return {
    ranked: reported.some((l) => l.finalistShows!.length > 0 || l.approvedLines || l.draftLines),
    unreported: launches.length - reported.length,
    totals: totalsOf(reported),
    groups: [
      {
        name: IN_ORDER,
        rows: committed.toSorted(
          (a, b) => b.approved - a.approved || b.drafted - a.drafted || b.finalistIn - a.finalistIn || inRoster(a, b)
        )
      },
      { name: FINALIST_ONLY, rows: finalists.toSorted((a, b) => b.finalistIn - a.finalistIn || inRoster(a, b)) },
      { name: NEVER, rows: all.filter((r) => r.finalistIn === 0 && !committed.includes(r)).toSorted(inRoster) }
    ].filter((g) => g.rows.length > 0)
  }
}

// The section's sentence: the slots approved, across how many orders, and what they're worth as each order
// was priced, naming the sample CPM where an approved order was priced at it; then, apart, the slots
// drafted, never added to them; then how many shows on the roster have never been a finalist.
function finding({ totals: t, groups }: ReturnType<typeof inventoryOf>, roster: State['roster']) {
  const never = groups.find((g) => g.name === NEVER)?.rows.length ?? 0
  const nevers =
    roster.length === 0
      ? 'the roster has no shows'
      : never === 0
        ? 'every show on the roster has been a finalist'
        : `${count(never, 'show')} ${never === 1 ? 'has' : 'have'} never been a finalist`
  if (t.approvedOrders + t.draftOrders === 0) return `No insertion orders yet; ${nevers}.`
  const cpm = t.sample[0]?.cpm
  const sample =
    cpm == null
      ? ''
      : t.sample.length === t.approvedOrders
        ? `, at the ${dollars(cpm)} sample CPM`
        : `, ${count(t.sample.length, 'order')} at the ${dollars(cpm)} sample CPM`
  const approved =
    t.approvedOrders === 0
      ? 'No slots approved yet'
      : `${count(t.approvedSlots, 'slot')} approved across ${count(t.approvedOrders, 'insertion order')}, worth ${dollars(t.value)} as each order was priced${t.unpriced ? ', before the lines without a value' : ''}${sample}`
  const drafted =
    t.draftOrders === 0
      ? []
      : [
          `${count(t.draftSlots, 'slot')} drafted across ${count(t.draftOrders, t.approvedOrders === 0 ? 'insertion order' : 'order')}`
        ]
  return `${[approved, ...drafted, nevers].join('; ')}.`
}

// The Inventory tab: a `Section` "Promo inventory", its sentence the totals, then, once a reported launch
// has ranked the roster, a line saying how many launches haven't reported yet, if any, and the table.
// Before any has, its sentence says so, or that launches haven't reported, with no count of shows never
// a finalist, as every show would be one. `state` is undefined until the agent's first state arrives,
// while the table's frame holds skeleton rows, as the Launches table's does. Each launch an order
// commits a show to is a link to its plan, under `launchesLink`.
export function Inventory({ state, launchesLink }: { state: State | undefined; launchesLink: string }) {
  if (!state)
    return (
      <Section id="inventory-h" title="Promo inventory" data-inventory>
        <InventoryTable>
          <tbody>
            {[0, 1, 2].map((i) => (
              <tr key={i}>
                <td colSpan={5} className="border-b py-3 pl-2">
                  <Skeleton className="h-5" />
                </td>
              </tr>
            ))}
          </tbody>
        </InventoryTable>
      </Section>
    )
  const roster = state.roster
  const inventory = inventoryOf(state.launches ?? [], roster)
  const n = inventory.unreported
  const unreported =
    n > 0 &&
    `${count(n, 'launch', 'launches')} ${n === 1 ? 'hasn’t' : 'haven’t'} reported yet; the totals leave ${n === 1 ? 'it' : 'them'} out.`
  if (!inventory.ranked)
    return (
      <Section
        id="inventory-h"
        title="Promo inventory"
        description={unreported || 'No launch has ranked the roster yet.'}
        data-inventory
      >
        {null}
      </Section>
    )
  return (
    <Section id="inventory-h" title="Promo inventory" description={finding(inventory, roster)} data-inventory>
      {unreported && (
        <p>
          <StateLine kind="empty">{unreported}</StateLine>
        </p>
      )}
      <div className="flex flex-col gap-3">
        <InventoryTable>
          {inventory.groups.map((group) => (
            <tbody key={group.name}>
              <tr>
                <th colSpan={5} scope="rowgroup" className="rounded-lg bg-muted py-1.5 pl-2 text-left font-normal">
                  <span className="sticky left-2">
                    <span className="font-semibold">{group.name}</span>{' '}
                    <span className="text-muted-foreground tabular-nums">{group.rows.length}</span>
                  </span>
                </th>
              </tr>
              {group.rows.map((r) => (
                <InventoryRow key={r.show} row={r} launchesLink={launchesLink} none={group.name === NEVER} />
              ))}
            </tbody>
          ))}
        </InventoryTable>
        <p className="max-w-[72ch] type-caption text-muted-foreground">
          Finalist in counts each launch’s latest completed run, and an approved order keeps counting apart from a newer
          run’s draft.
        </p>
      </div>
    </Section>
  )
}

// The table's frame and head, in the ranked-list anatomy: a real table, its rules bleeding 8px past the
// text, figures right-aligned; narrower than the table, it scrolls in its region with the show column held
// at the left, ruled where they meet, a name too long for it breaking anywhere rather than widening it.
// Its five columns need no more than 64rem, so on a wide canvas it stops there rather than leaving a gap
// of half the screen between a show's name and its figures.
const head = 'border-b pb-2 pl-3 text-right align-bottom font-normal'
const cell = 'border-b py-3 pl-3 text-right align-top'
const held = 'sticky left-0 bg-background pl-2 text-left wrap-anywhere max-lg:border-r max-lg:pr-3'
function InventoryTable({ children }: { children: ReactNode }) {
  return (
    <ScrollTable label="Promo inventory table" className="-mx-2 max-w-[65rem]">
      {/* Positioned, so Never a finalist's visually hidden "None"s scroll and clip with the table, not the page. */}
      <table className="relative w-full min-w-[36rem] border-separate border-spacing-0" aria-labelledby="inventory-h">
        <thead className="type-caption text-muted-foreground">
          <tr>
            <th scope="col" className={cn(head, held)}>
              Show
            </th>
            <th scope="col" className={cn(head, 'w-24')}>
              Finalist in
            </th>
            <th scope="col" className={cn(head, 'w-28')}>
              Slots approved
            </th>
            <th scope="col" className={cn(head, 'w-32')}>
              Approved value
            </th>
            <th scope="col" className={cn(head, 'w-28 pr-2')}>
              Slots drafted
            </th>
          </tr>
        </thead>
        {children}
      </table>
    </ScrollTable>
  )
}

// A show's row: its name, then the launches its orders commit it to, each a link to that launch's plan,
// and whether it has left the roster; then its figures, a zero in muted ink, and an approved value `–`
// when none of its lines was priced. Counts and slots align as tabular figures, and money stays
// proportional. In Never a finalist (`none`), whose figures are all zero, the cells are left empty and
// say "None" to screen readers, as the launches table's do, so the group reads as the list of names it is.
function InventoryRow({ row: r, launchesLink, none }: { row: Row; launchesLink: string; none: boolean }) {
  const zero = (n: number, text = String(n)) =>
    none ? <span className="vh">None</span> : n === 0 ? <span className="text-muted-foreground">{text}</span> : text
  return (
    <tr data-inventory-show={r.show}>
      <th scope="row" className={cn(cell, held, 'min-w-44 font-normal lg:min-w-56')}>
        <span className="text-[15px] leading-snug font-semibold">{r.show}</span>
        {r.launches.length > 0 && (
          <span className="block type-caption text-muted-foreground">
            {r.launches.map((l, i) => (
              <Fragment key={l.id}>
                {i > 0 && ', '}
                <a className={linkVariants()} href={`${launchesLink}/${l.id}#plan`}>
                  {launchTitle(l.name, l.comps)}
                </a>
              </Fragment>
            ))}
          </span>
        )}
        {!r.onRoster && <span className="block type-caption text-muted-foreground">No longer on the roster</span>}
      </th>
      <td className={cn(cell, 'tabular-nums')}>{zero(r.finalistIn)}</td>
      <td className={cn(cell, 'tabular-nums')}>{zero(r.approved)}</td>
      <td className={cell}>
        {r.approved > 0 && !r.priced ? (
          <span className="text-muted-foreground">–</span>
        ) : (
          zero(r.approvedValue, dollars(r.approvedValue))
        )}
      </td>
      <td className={cn(cell, 'pr-2 tabular-nums')}>{zero(r.drafted)}</td>
    </tr>
  )
}
