import { cn } from 'cn'
import { ChevronDownIcon } from 'lucide-react'
import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupSegment } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import { segmentedItemVariants, segmentedTrackVariants } from '@/components/ui/variants'
import type { GuideMark, Launch, Show } from '../agent'
import { ageWords, type DemographicCheck } from '../demographics'
import { FINALISTS, type FitRow, type Ranking } from '../fit'
import { dollars, slotPrice } from '../order'
import { sameName } from '../resolve'
import { moveGlyph, moveWords, nth } from '../text'
import { topicFinding, type Move, type Topic } from '../topic'
import { FitBand, listOf, NotScored } from './controls'
import { CallButton } from './Evidence'
import { Source } from './Source'
import { sentence, StateLine } from './states'

// The two orders the chart's lens switches between: Qloo's listener overlap, and the topic-only
// plan Claude ranks from names and descriptions alone.
type Lens = 'listeners' | 'topic'

// The rows are a grid with a table's roles, not a <table>, so they can travel when the lens
// re-orders them (a transform on a <tr> is unreliable). Each row is its own grid on one template, so
// the columns line up: fixed widths, the show taking the rest. From 768px one line: rank, move,
// show, topic, fit, slot value (at 976px: 40 + 48 + 512 + 96 + 72 + 128 + 5 × 16 gaps = 976). Under
// it each row folds to two: rank, show and fit, then the move, the topic rank and the slot value.
// Without a topic column there's no move or topic. Rows bleed their tint and rule 8px past the text,
// and each is opaque, so rows passing each other mid-travel don't show through.
const rowGrid = {
  topic:
    "grid gap-x-3 gap-y-1 grid-cols-[2rem_auto_auto_minmax(0,1fr)_auto] [grid-template-areas:'rank_show_show_show_fit'_'rank_move_topic_slot_slot'] md:gap-x-4 md:grid-cols-[2.5rem_3rem_minmax(0,1fr)_6rem_4.5rem_8rem] md:[grid-template-areas:'rank_move_show_topic_fit_slot']",
  plain:
    "grid gap-x-3 gap-y-1 grid-cols-[2rem_minmax(0,1fr)_auto] [grid-template-areas:'rank_show_fit'_'rank_slot_slot'] md:gap-x-4 md:grid-cols-[2.5rem_minmax(0,1fr)_4.5rem_8rem] md:[grid-template-areas:'rank_show_fit_slot']"
}
const bleed = '-mx-2 px-2'

// The re-rank: each row travels from where it was to its new place, staggered by its new place.
const TRAVEL = { duration: 450, easing: 'cubic-bezier(0.215, 0.61, 0.355, 1)', stagger: 20 } // --ease-plate

// Who the chart's ranking is against, as its heading asks it.
const whoShares = (names: string[]) =>
  names.length === 1
    ? `Who shares ${names[0]}'s listeners`
    : names.length
      ? `Who shares the listeners of ${listOf(names)}`
      : "Who shares the launch's listeners"

// The chart's finding, from the ranking and the topic moves.
const finding = (ranking: Ranking, moves: Move[] | null) =>
  topicFinding(ranking.rows.filter((r) => r.finalist).length, moves && moves.filter((m) => m.climber))

// The fit chart: the roster ranked by listener overlap with the launch, its finding first. Fit shows as
// rank and band; raw affinities stay in the ranking call's evidence. Once the topic column is in, the
// lens re-orders the rows by topic alone, and each show's move is what Qloo changed. By default it
// shows what's in contention: the finalists, the shows a topic-only plan picks, the climbers and any
// left out; "Show all" lists every ranked show.
export function FitChart({
  ranking,
  launch,
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
  launch: Launch | null // what the chart's heading names before the ranking does
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
  const [lens, setLens] = useState<Lens>('listeners')
  const [all, setAll] = useState(false)
  // The climber whose "Why it moved" row is open.
  const [why, setWhy] = useState<string | null>(null)
  // Each row's element by show, and where each row was on screen just before the lens switched.
  const rowEls = useRef(new Map<string, HTMLElement>())
  const before = useRef<Map<string, number> | null>(null)
  const moves = topic?.status === 'ranked' && ranking && !ranking.error ? topic.moves : null
  const order = rowOrder(ranking?.rows ?? [], lens, moves)
  // Flip: the rows are in their new places now, before the browser paints; each starts where it was and
  // travels to where it is. In three passes, so the layout is worked out once, not once a row: stop
  // every travel still running, read where every row now is, then start them all.
  useLayoutEffect(() => {
    const first = before.current
    before.current = null
    if (!first) return
    // Only the rows on screen are counted, so the stagger runs down the chart evenly.
    const els = order.flatMap((r) => rowEls.current.get(r.show) ?? [])
    for (const el of els) for (const a of el.getAnimations()) a.cancel()
    const now = els.map((el) => el.getBoundingClientRect().top)
    els.forEach((el, i) => {
      const from = first.get(el.dataset.show!)
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

  const heading = (
    <h2 className="text-base font-semibold text-balance" id="fit-h">
      {whoShares(
        ranking?.anchors.map((a) => a.name) ?? (launch?.name ? [launch.name] : (launch?.comps.map((c) => c.name) ?? []))
      )}
    </h2>
  )
  if (!ranking)
    return running ? (
      <section className="flex flex-col gap-3" aria-label="Fit chart">
        {heading}
        <StateLine kind="loading">The fit chart appears once the agent ranks the roster.</StateLine>
        {/* The chart's rows in their shape, still. */}
        <div aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={cn(rowGrid.plain, bleed, 'items-center border-b py-3')}>
              <Skeleton className="h-7 w-6 justify-self-end [grid-area:rank]" />
              <Skeleton className="h-4 w-48 max-w-full [grid-area:show]" />
              <Skeleton className="h-3 w-5 [grid-area:fit]" />
              <Skeleton className="h-4 w-16 justify-self-end [grid-area:slot]" />
            </div>
          ))}
        </div>
      </section>
    ) : null

  const anchors = listOf(ranking.anchors.map((a) => a.name))
  const byShow = new Map(moves?.map((m) => [m.show, m]))
  const switchLens = (next: Lens) => {
    if (next === lens) return
    // Where each row is now, as seen, mid-travel included; with reduced motion they jump instead.
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      before.current = new Map([...rowEls.current].map(([show, el]) => [show, el.getBoundingClientRect().top]))
    setWhy(null)
    setLens(next)
  }
  // What's in contention, which the chart shows until "Show all": the finalists, a topic-only plan's
  // picks (its top five, after the shows left out), the climbers, and the shows left out.
  const topicPicks = new Set(
    (moves ?? [])
      .filter((m) => !leftOut.includes(m.show))
      .toSorted((a, b) => a.topicRank - b.topicRank)
      .slice(0, FINALISTS)
      .map((m) => m.show)
  )
  const featured = (r: FitRow) =>
    r.finalist || topicPicks.has(r.show) || byShow.get(r.show)?.climber || leftOut.includes(r.show)
  const shown = all ? order : order.filter(featured)
  const folded = order.length - order.filter(featured).length
  const grid = moves ? rowGrid.topic : rowGrid.plain
  const topicLens = moves !== null && lens === 'topic'
  // A ranking without shows Qloo failed to look up is partial, never presented as the whole roster.
  const missing = ranking.error ? [] : ranking.notScored.filter((n) => failed.includes(n.show)).map((n) => n.show)
  const show = (name: string) => roster.find((s) => s.name === name)
  return (
    <section className="flex flex-col gap-3" aria-label="Fit chart">
      <div className="flex flex-col gap-1">
        {heading}
        {!ranking.error && (
          <p>
            {finding(ranking, moves)}{' '}
            <CallButton call={ranking.call} label="Evidence for the fit ranking" opened={opened} openCall={openCall} />
          </p>
        )}
      </div>
      {ranking.error ? (
        <StateLine kind="failed">Nothing is ranked: {sentence(ranking.error)}</StateLine>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {moves && (
              <RadioGroup
                aria-label="Order the chart"
                value={lens}
                onValueChange={(next) => switchLens(next as Lens)}
                className={segmentedTrackVariants({ className: 'flex max-md:h-11' })}
              >
                <RadioGroupSegment value="listeners" className={segmentedItemVariants({ className: 'max-md:h-10' })}>
                  By who listens
                </RadioGroupSegment>
                <RadioGroupSegment value="topic" className={segmentedItemVariants({ className: 'max-md:h-10' })}>
                  By topic
                </RadioGroupSegment>
              </RadioGroup>
            )}
            {/* Where the order on screen comes from. */}
            <p className="type-caption text-muted-foreground">
              {moves && lens === 'topic' ? (
                <>
                  <Source of="agent" /> Ranked by topic alone, from show names and descriptions
                </>
              ) : (
                <>
                  <Source of="qloo" /> Ranked by listener overlap with {anchors}
                </>
              )}
            </p>
            {topic?.status === 'ranking' ? (
              <StateLine kind="loading">Ranking the roster by topic alone for the Topic column…</StateLine>
            ) : topic && topic.status !== 'ranked' ? (
              <StateLine kind="error">No topic column: {topic.error}. The fit ranking stands without it.</StateLine>
            ) : null}
          </div>
          <div role="table" aria-labelledby="fit-h" data-fit-chart>
            <div role="rowgroup">
              <div
                role="row"
                className={cn(grid, bleed, 'border-b pb-2 type-caption text-muted-foreground max-md:sr-only')}
              >
                <span role="columnheader" className="text-right [grid-area:rank]">
                  Rank
                </span>
                {moves && (
                  <span role="columnheader" className="[grid-area:move]">
                    Move
                  </span>
                )}
                <span role="columnheader" className="[grid-area:show]">
                  Show
                </span>
                {/* The other lens's rank, labelled by who ranked it: the topic rank Claude gave it, or under
                    "By topic" the listener rank Qloo's data gave it. Wider than its column, the header runs
                    left into the show's, which has room. */}
                {moves && (
                  <span
                    role="columnheader"
                    className="flex w-max items-center gap-1.5 justify-self-end [grid-area:topic]"
                  >
                    {topicLens ? (
                      <>
                        Listeners <Source of="qloo" />
                      </>
                    ) : (
                      <>
                        Topic <Source of="agent" />
                      </>
                    )}
                  </span>
                )}
                <span role="columnheader" className="[grid-area:fit]">
                  Fit
                </span>
                <span role="columnheader" className="text-right [grid-area:slot]">
                  Slot value
                </span>
              </div>
            </div>
            <div role="rowgroup">
              {shown.map((r) => {
                const move = byShow.get(r.show)
                const open = move?.climber === true && why === r.show
                const out = leftOut.includes(r.show)
                const flagged = r.finalist ? demographics?.rows.find((d) => d.show === r.show)?.reasons : null
                const shared = r.sharedTags ?? null // runs from before shared tags have none
                const notes = [
                  !sameName(r.entity.name, r.show) && `Mapped to ${r.entity.name}`,
                  ranking.anchors.length > 1 &&
                    (r.leadingComp ? `Led by ${r.leadingComp.name}` : 'Comps contributed evenly')
                ].filter(Boolean)
                // `cited`: the "Why it moved" row cites it, which is a step of the guide.
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
                const tint = r.finalist ? 'bg-signal-tint' : 'bg-background'
                return (
                  <Fragment key={r.show}>
                    <div
                      role="row"
                      ref={(el) => {
                        if (el) rowEls.current.set(r.show, el)
                        else rowEls.current.delete(r.show)
                      }}
                      className={cn(
                        grid,
                        bleed,
                        'group/row items-baseline border-b py-3',
                        tint,
                        open && 'border-b-transparent'
                      )}
                      data-show={r.show}
                      data-finalist={r.finalist || undefined}
                      data-left-out={out || undefined}
                    >
                      {/* The rank in the lens's order, the order the rows are in; screen readers hear both
                          ranks, the lens's first. */}
                      <span role="cell" className="text-right type-title tabular-nums [grid-area:rank]">
                        {moves ? (
                          <>
                            <span aria-hidden="true">{topicLens ? (move?.topicRank ?? '–') : r.rank}</span>
                            <span className="vh">{rankWords(r.rank, move?.topicRank ?? null, lens)}</span>
                          </>
                        ) : (
                          r.rank
                        )}
                      </span>
                      {moves && (
                        <span
                          role="cell"
                          className={cn(
                            'tabular-nums [grid-area:move]',
                            move?.climber ? 'font-semibold text-signal-ink' : 'text-muted-foreground'
                          )}
                        >
                          {move && (
                            <>
                              <span aria-hidden="true">{moveGlyph(move.move)}</span>
                              <span className="vh">{moveWords(move.move)}</span>
                            </>
                          )}
                        </span>
                      )}
                      <div role="cell" className="flex min-w-0 flex-col gap-1 [grid-area:show]">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          {move?.climber ? (
                            // The chevron rides on the name's last word, so a name that wraps keeps it beside
                            // its end rather than at the row's far edge.
                            <button
                              type="button"
                              className="group/why inline-block cursor-pointer text-left text-[15px] leading-snug font-semibold underline decoration-muted-foreground decoration-1 underline-offset-4 hover:decoration-foreground max-md:min-h-11"
                              aria-expanded={open}
                              aria-controls={`why-${r.rank}`}
                              onClick={() => {
                                setWhy(open ? null : r.show)
                                if (!open) markSeen('why')
                              }}
                            >
                              {r.show.includes(' ') && `${r.show.slice(0, r.show.lastIndexOf(' '))} `}
                              <span className="whitespace-nowrap">
                                {r.show.slice(r.show.lastIndexOf(' ') + 1)}
                                <ChevronDownIcon
                                  aria-hidden="true"
                                  className="ml-1 inline-block size-4 align-[-0.1875rem] text-muted-foreground transition-transform group-aria-expanded/why:rotate-180"
                                />
                              </span>
                            </button>
                          ) : (
                            <span className="text-[15px] leading-snug font-semibold">{r.show}</span>
                          )}
                          {r.finalist && <Badge mark="signal">Finalist</Badge>}
                          {out && <Badge>Left out</Badge>}
                          {flagged?.length ? <Badge variant="outline">Listeners differ</Badge> : null}
                        </div>
                        {(shared || notes.length > 0) && (
                          <p className="type-caption text-muted-foreground">
                            {shared && (
                              <>
                                {shared.error
                                  ? `Shared tags failed: ${shared.error}`
                                  : shared.tags.length > 0
                                    ? shared.tags.join('\u00a0· ') // a separator never starts a line
                                    : 'No distinctive shared tags'}{' '}
                                {callButton(shared.call, `Evidence for the tags ${r.show} shares`)}
                                {notes.length > 0 && ' · '}
                              </>
                            )}
                            {notes.join(' · ')}
                          </p>
                        )}
                        {flagged?.length ? (
                          <p className="type-caption text-muted-foreground">{flagged.join('. ')}.</p>
                        ) : null}
                      </div>
                      {moves && (
                        <span role="cell" className="text-right text-muted-foreground [grid-area:topic]">
                          <span className="md:hidden" aria-hidden="true">
                            {topicLens ? 'Listeners' : 'Topic'}{' '}
                          </span>
                          {topicLens ? (
                            <span className="tabular-nums">#{r.rank}</span>
                          ) : move ? (
                            <span className="tabular-nums">#{move.topicRank}</span>
                          ) : (
                            '–'
                          )}
                        </span>
                      )}
                      <span role="cell" className="[grid-area:fit]">
                        <FitBand band={r.band} finalist={r.finalist} quiet />
                      </span>
                      <span role="cell" className="[grid-area:slot]" data-slot-value>
                        <SlotValue show={show(r.show)} cpm={cpm} sampleCpm={sampleCpm} />
                      </span>
                    </div>
                    {open && (
                      <div role="row" id={`why-${r.rank}`} className={cn(grid, bleed, 'border-b pb-3', tint)}>
                        {/* Under the show and the columns after it. */}
                        <div
                          role="cell"
                          aria-colspan={moves ? 6 : 4}
                          className="flex flex-col gap-1.5 [grid-column:show-start/-1] [grid-row:1/-1]"
                        >
                          <p className="font-semibold">Why it moved</p>
                          {/* Topic rank is Claude's baseline, fit rank Qloo's: each labelled, neither
                              wrapped off its words. */}
                          <p>
                            <Source of="agent" /> Topic alone ranks it{'\u00a0'}
                            {move.topicRank}.
                          </p>
                          <p>
                            <Source of="qloo" /> Listener overlap with {anchors} ranks it{'\u00a0'}
                            {r.rank}. {callButton(ranking.call, `Evidence for ${r.show}'s fit`, true)}
                          </p>
                          {r.leadingComp && <p>Led by {r.leadingComp.name}.</p>}
                          {shared && !shared.error && shared.tags.length > 0 && (
                            <p>
                              Shared tags: {listOf(shared.tags)}.{' '}
                              {callButton(shared.call, `Evidence for the tags ${r.show} shares`, true)}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </Fragment>
                )
              })}
            </div>
          </div>
          {(folded > 0 || all) && (
            <Button variant="ghost" size="sm" className="-ml-2.5 self-start max-md:h-11" onClick={() => setAll(!all)}>
              {all ? 'Show fewer' : `Show all ${order.length}`}
            </Button>
          )}
          <div className="flex flex-col gap-1.5 type-caption text-muted-foreground">
            <p>
              Fit bands are thirds of this ranking, and the top five, after any shows left out, are finalists.
              {moves && ' Topic is the rank a topic-only plan gives each show, from names and descriptions alone.'}
            </p>
            <p data-chart-foot>
              {cpm === null
                ? 'Slot values need the network’s CPM: set it under Network CPM.'
                : `Slot value = downloads × ${dollars(cpm)}${sampleCpm ? ' sample' : ''} CPM ÷ 1,000${sampleCpm ? ' · sample figures' : ''}`}
            </p>
            {demographics && (
              <DemographicSummary check={demographics} ranking={ranking} openCall={openCall} opened={opened} />
            )}
          </div>
          {missing.length > 0 && (
            <StateLine kind="failed">
              Partial ranking: {listOf(missing)} {missing.length === 1 ? "isn't" : "aren't"} in it, because{' '}
              {missing.length === 1 ? 'its Qloo lookup' : 'their Qloo lookups'} failed.
            </StateLine>
          )}
        </>
      )}
      {ranking.notScored.length > 0 && (
        <NotScored noun="Show" rows={ranking.notScored.map((n) => ({ key: n.show, name: n.show, reason: n.reason }))} />
      )}
    </section>
  )
}

// A row's two ranks in words, the lens's first: "2nd by who listens, 6th by topic". A show the topic
// ranking doesn't place has no topic rank.
function rankWords(fit: number, topic: number | null, lens: Lens) {
  const listeners = `${nth(fit)} by who listens`
  const byTopic = topic === null ? 'not ranked by topic' : `${nth(topic)} by topic`
  return lens === 'topic' ? `${byTopic}, ${listeners}` : `${listeners}, ${byTopic}`
}

// The rows in the lens's order: fit order, or topic rank, with any show the topic ranking doesn't
// place after the rest, in fit order.
function rowOrder(rows: FitRow[], lens: Lens, moves: Move[] | null) {
  if (lens === 'listeners' || !moves) return rows
  const rank = new Map(moves.map((m) => [m.show, m.topicRank]))
  return rows.toSorted((a, b) => (rank.get(a.show) ?? Infinity) - (rank.get(b.show) ?? Infinity) || a.rank - b.rank)
}

// What one promo slot on a show displaces, from its downloads and the CPM, labelled sample while a sample
// figure prices it; or the figure it's missing. The value and its sample chip share a right edge, the
// downloads under them; on a phone's second line they run on.
function SlotValue({ show, cpm, sampleCpm }: { show: Show | undefined; cpm: number | null; sampleCpm: boolean }) {
  const downloads = show?.downloads ?? null // shows from before downloads have none
  const { slotValue, gap } = slotPrice(downloads, cpm)
  if (slotValue === null)
    return (
      <span className="flex flex-wrap items-baseline justify-end gap-x-1.5 text-muted-foreground">
        <span aria-hidden="true">–</span>
        {/* Every row lacks the CPM alike, so the chart's footnote says it once. */}
        {cpm === null ? (
          <span className="vh">{gap}</span>
        ) : (
          <span className="type-caption md:basis-full md:text-right">{gap}</span>
        )}
      </span>
    )
  return (
    <span className="flex flex-wrap items-center justify-end gap-x-1.5">
      <span className="font-medium">{dollars(slotValue)}</span>
      <span className="type-caption text-muted-foreground md:basis-full md:text-right">
        {downloads!.toLocaleString('en-US')} downloads
      </span>
      {(sampleCpm || show?.sample?.includes('downloads')) && <Badge className="order-first">sample</Badge>}
    </span>
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
    <p>
      <b className="font-semibold text-foreground">Demographics</b> {cite} · Checked against the listeners of{' '}
      {listOf(from)}
      {from.length > 1 && ' on average'}, who {who.join(' and ')}.
      {disagree.length > 0 && ` The comps disagree: ${disagree.join('; ')}.`}
      {noData.length > 0 && ` Qloo had no demographics for ${listOf(noData)}.`}{' '}
      <b className="font-semibold text-foreground">
        {flagged
          ? `${flagged} of ${check.rows.length} finalists' listeners differ.`
          : `No demographic mismatches among the ${check.rows.length} finalists.`}
      </b>
      {unchecked.length > 0 &&
        ` Qloo had no demographics for ${listOf(unchecked)}, so ${unchecked.length > 1 ? "they weren't" : "it wasn't"} checked.`}
    </p>
  )
}
