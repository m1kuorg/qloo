import { cn } from 'cn'
import { ChevronDownIcon } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { RadioGroup, RadioGroupSegment } from '@/components/ui/radio-group'
import { segmentedItemVariants, segmentedTrackVariants } from '@/components/ui/variants'
import { moveGlyph, moveWords, nth } from '../text'
import { Source } from './Source'

// The re-rank (docs/DESIGN.md): ranked rows whose lens switches them between two orders, by who
// listens, Qloo's listener overlap, and an agent's ranking made with no Qloo data, each row travelling
// to its new place. Each row has its rank in the lens's order, its move between the two rankings, the
// other lens's rank, and, where it moved most, "Why it moved". The fit chart (FitChart.tsx), against a
// topic-only plan, and the inbox's pitch lists (Inbox.tsx), against what the pitches say, are built on
// it, each with its own columns around these. The rows are a grid with a table's roles, not a <table>,
// so they can travel (a transform on a <tr> is unreliable); each list's grid names the areas these
// cells take: rank, move, name (where "Why it moved" starts), and other, the other lens's rank.

// The two orders: Qloo's, and the agent's.
export type Lens = 'listeners' | 'agent'

// The agent's ranking as a list says it: the lens's words ("by topic"), its column ("Topic"), and what
// a rank in it is ("topic rank").
export type AgentRanking = { by: string; column: string; rank: string }

// A row as the re-rank reads it: its key, its rank by who listens, and its rank by the agent's ranking,
// or null where that ranking doesn't place it.
type Ranked = { key: string; rank: number; agentRank: number | null }

// The re-rank: each row travels from where it was to its new place, staggered by its new place.
const TRAVEL = { duration: 450, easing: 'cubic-bezier(0.215, 0.61, 0.355, 1)', stagger: 20 } // --ease-plate

// A list's lens and its travel. `rows` are in listener order, and `on` says the agent's ranking is in,
// so the lens can switch; until then the rows stay in listener order whatever was chosen. `start` is the
// lens and the open "Why it moved" a list starts with: by who listens, with none open, unless a page's
// test renders it as a booker's switch and press leave it.
export function useRerank<R>(
  rows: R[],
  ranked: (row: R) => Ranked,
  on: boolean,
  start: { lens?: Lens; why?: string | null } = {}
) {
  const [lens, setLens] = useState<Lens>(start.lens ?? 'listeners')
  // The row whose "Why it moved" is open, by key.
  const [why, setWhy] = useState<string | null>(start.why ?? null)
  // Each row's element by key, and where each row was on screen just before the lens switched.
  const rowEls = useRef(new Map<string, HTMLElement>())
  const before = useRef<Map<string, number> | null>(null)
  const agent = on && lens === 'agent'
  const order = agent ? agentOrder(rows, ranked) : rows
  // Flip: the rows are in their new places now, before the browser paints; each starts where it was and
  // travels to where it is. In three passes, so the layout is worked out once, not once a row: stop
  // every travel still running, read where every row now is, then start them all.
  useLayoutEffect(() => {
    const first = before.current
    before.current = null
    if (!first) return
    // Only the rows on screen are counted, so the stagger runs down the list evenly.
    const els = order.flatMap((r) => {
      const { key } = ranked(r)
      const el = rowEls.current.get(key)
      return el ? [{ key, el }] : []
    })
    for (const { el } of els) for (const a of el.getAnimations()) a.cancel()
    const now = els.map(({ el }) => el.getBoundingClientRect().top)
    els.forEach(({ key, el }, i) => {
      const from = first.get(key)
      const by = from === undefined ? 0 : from - now[i]
      if (Math.abs(by) < 1) return
      el.animate([{ transform: `translateY(${by}px)` }, { transform: 'none' }], {
        duration: TRAVEL.duration,
        easing: TRAVEL.easing,
        delay: i * TRAVEL.stagger,
        fill: 'backwards'
      })
    })
  }, [lens])
  const switchLens = (next: Lens) => {
    if (next === lens) return
    // Where each row is now, as seen, mid-travel included; with reduced motion they jump instead.
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      before.current = new Map([...rowEls.current].map(([key, el]) => [key, el.getBoundingClientRect().top]))
    setWhy(null)
    setLens(next)
  }
  // Each row's element, kept by key for the travel.
  const rowRef = (key: string) => (el: HTMLElement | null) => {
    if (el) rowEls.current.set(key, el)
    else rowEls.current.delete(key)
  }
  const toggleWhy = (key: string) => setWhy(why === key ? null : key)
  return { lens, agent, order, switchLens, rowRef, why, toggleWhy }
}

// The rows in the agent's order, with any row the agent's ranking doesn't place after the rest, in
// listener order.
const agentOrder = <R,>(rows: R[], ranked: (row: R) => Ranked) =>
  rows.toSorted(
    (a, b) => (ranked(a).agentRank ?? Infinity) - (ranked(b).agentRank ?? Infinity) || ranked(a).rank - ranked(b).rank
  )

// The lens: a radio group styled as a segmented control, by who listens or by the agent's ranking.
export function LensSwitch({
  label,
  agent,
  lens,
  onChange
}: {
  label: string // what the group does, such as "Order the chart"
  agent: AgentRanking
  lens: Lens
  onChange: (lens: Lens) => void
}) {
  return (
    <RadioGroup
      aria-label={label}
      value={lens}
      onValueChange={(next) => onChange(next as Lens)}
      className={segmentedTrackVariants({ className: 'flex' })}
    >
      <RadioGroupSegment value="listeners" className={segmentedItemVariants()}>
        By who listens
      </RadioGroupSegment>
      <RadioGroupSegment value="agent" className={segmentedItemVariants()}>
        {agent.by[0].toUpperCase() + agent.by.slice(1)}
      </RadioGroupSegment>
    </RadioGroup>
  )
}

// Where the order on screen comes from, labelled by who ranked it.
export function LensSource({ agent, listeners, byAgent }: { agent: boolean; listeners: string; byAgent: string }) {
  return (
    <p className="type-caption text-muted-foreground">
      {agent ? (
        <>
          <Source of="agent" /> {byAgent}
        </>
      ) : (
        <>
          <Source of="qloo" /> {listeners}
        </>
      )}
    </p>
  )
}

// A row's rank in the lens's order, the order the rows are in; once the agent's ranking is in, screen
// readers hear both ranks, the lens's first.
export function RankCell({ row, lens, agent }: { row: Ranked; lens: Lens | null; agent: AgentRanking }) {
  return (
    <span role="cell" className="text-right type-title tabular-nums [grid-area:rank]">
      {lens ? (
        <>
          <span aria-hidden="true">{lens === 'agent' ? (row.agentRank ?? '–') : row.rank}</span>
          <span className="vh">{rankWords(row, lens, agent)}</span>
        </>
      ) : (
        row.rank
      )}
    </span>
  )
}

// A row's two ranks in words, the lens's first: "2nd by who listens, 6th by topic". A row the agent's
// ranking doesn't place has no rank by it.
function rankWords({ rank, agentRank }: Ranked, lens: Lens, agent: AgentRanking) {
  const listeners = `${nth(rank)} by who listens`
  const byIt = agentRank === null ? `not ranked ${agent.by}` : `${nth(agentRank)} ${agent.by}`
  return lens === 'agent' ? `${byIt}, ${listeners}` : `${listeners}, ${byIt}`
}

// The Move column's header.
export const MoveHeader = ({ className }: { className?: string }) => (
  <span role="columnheader" className={cn('[grid-area:move]', className)}>
    Move
  </span>
)

// A row's move, the agent's rank less its listener rank, so a climb by who listens is positive: ▲3 in
// signal ink and 600 for a climber, ▼2 or = muted, its words for screen readers. A row whose move
// explains itself on demand holds the button that opens its "Why it moved".
export function MoveCell({
  move,
  climber,
  agent,
  why
}: {
  move: number | null
  climber: boolean
  agent: AgentRanking
  why?: WhyState
}) {
  const words = move !== null && <span className="vh">{moveWords(move, agent.rank)}</span>
  const glyph = move !== null && <span aria-hidden="true">{moveGlyph(move)}</span>
  return (
    <span
      role="cell"
      className={cn(
        'tabular-nums [grid-area:move]',
        climber ? 'font-semibold text-signal-ink' : 'text-muted-foreground'
      )}
    >
      {why ? (
        <WhyToggle {...why} end={glyph}>
          {words}
        </WhyToggle>
      ) : (
        <>
          {glyph}
          {words}
        </>
      )}
    </span>
  )
}

// The other lens's rank's header, labelled by who ranked it: the agent's ranking, or under the agent's
// lens the listener rank Qloo's data gave it. Wider than its column, it runs left into the name's, which
// has room.
export function OtherRankHeader({ lens, agent, className }: { lens: Lens; agent: AgentRanking; className?: string }) {
  return (
    <span
      role="columnheader"
      className={cn('flex w-max items-center gap-1.5 justify-self-end [grid-area:other]', className)}
    >
      {lens === 'agent' ? (
        <>
          Listeners <Source of="qloo" />
        </>
      ) : (
        <>
          {agent.column} <Source of="agent" />
        </>
      )}
    </span>
  )
}

// A row's rank by the other lens, "#6", or – where the agent's ranking doesn't place it. On a phone,
// where the header is hidden, the column's name comes before it.
export function OtherRankCell({ row, lens, agent }: { row: Ranked; lens: Lens; agent: AgentRanking }) {
  return (
    <span role="cell" className="text-right text-muted-foreground [grid-area:other]">
      <span className="md:hidden" aria-hidden="true">
        {lens === 'agent' ? 'Listeners' : agent.column}{' '}
      </span>
      {lens === 'agent' ? (
        <span className="tabular-nums">#{row.rank}</span>
      ) : row.agentRank !== null ? (
        <span className="tabular-nums">#{row.agentRank}</span>
      ) : (
        '–'
      )}
    </span>
  )
}

// What opens a row's "Why it moved": whether it's open, the row it opens, and the press.
type WhyState = { open: boolean; controls: string; onToggle: () => void }

// The button that opens a row's "Why it moved", underlined, its chevron riding on `end`, the last of
// its words, so words that wrap keep the chevron beside their end rather than at the row's far edge.
export function WhyToggle({
  open,
  controls,
  onToggle,
  className,
  end,
  children
}: WhyState & { className?: string; end: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      className={cn(
        'group/why inline-block cursor-pointer text-left underline decoration-muted-foreground decoration-1 underline-offset-4 hover:decoration-foreground max-md:min-h-11',
        className
      )}
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
    >
      {children}
      <span className="whitespace-nowrap">
        {end}
        <ChevronDownIcon
          aria-hidden="true"
          className="ml-1 inline-block size-4 align-[-0.1875rem] text-muted-foreground transition-transform group-aria-expanded/why:rotate-180"
        />
      </span>
    </button>
  )
}

// "Why it moved", a row of its own under the row it explains, under the name and the columns after it:
// each line labelled by who ranked it, as `children` give them.
export function WhyRow({
  id,
  className,
  columns,
  children
}: {
  id: string
  className: string // the list's grid, and the row's tint
  columns: number
  children: ReactNode
}) {
  return (
    <div role="row" id={id} className={className}>
      <div
        role="cell"
        aria-colspan={columns}
        className="flex flex-col gap-1.5 [grid-column:name-start/-1] [grid-row:1/-1]"
      >
        <p className="font-semibold">Why it moved</p>
        {children}
      </div>
    </div>
  )
}
