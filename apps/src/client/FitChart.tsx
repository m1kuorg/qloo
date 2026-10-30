import { cn } from 'cn'
import { Fragment, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { Launch, Show } from '../agent'
import { ageWords, type DemographicCheck } from '../demographics'
import { FINALISTS, topicFinding, type FitRow, type Ranking, type SharedTags } from '../fit'
import { dollars, slotPrice } from '../order'
import { sameName } from '../resolve'
import type { Move, Topic } from '../topic'
import { FitBand, listOf, NotScored } from './controls'
import { CallButton, type OpenCall } from './Evidence'
import { Section } from './PageHeader'
import {
  bleed,
  LensSource,
  LensSwitch,
  MoveCell,
  MoveHeader,
  OtherRankCell,
  OtherRankHeader,
  RankCell,
  useRerank,
  WhyRow,
  WhyToggle,
  type AgentRanking
} from './Rerank'
import { Source } from './Source'
import { sentence, StateLine } from './states'

// The chart's lens switches between Qloo's listener overlap and the topic-only plan Claude ranks from
// names and descriptions alone.
const byTopic: AgentRanking = { by: 'by topic', column: 'Topic', rank: 'topic rank' }

// The rows are the re-rank's grid (Rerank.tsx). Each row is its own grid on one template, so the
// columns line up: fixed widths, the show taking the rest. From 768px one line: rank, move, show, topic,
// fit, slot value (at 976px: 40 + 48 + 512 + 96 + 72 + 128 + 5 × 16 gaps = 976). Under it each row folds
// to two: rank, show and fit, then the move, the topic rank and the slot value. Without a topic column
// there's no move or topic. Rows bleed their tint and rule 8px past the text, and each is opaque, so
// rows passing each other mid-travel don't show through.
const rowGrid = {
  topic:
    "grid gap-x-3 gap-y-1 grid-cols-[2rem_auto_auto_minmax(0,1fr)_auto] [grid-template-areas:'rank_name_name_name_fit'_'rank_move_other_slot_slot'] md:gap-x-4 md:grid-cols-[2.5rem_3rem_minmax(0,1fr)_6rem_4.5rem_8rem] md:[grid-template-areas:'rank_move_name_other_fit_slot']",
  plain:
    "grid gap-x-3 gap-y-1 grid-cols-[2rem_minmax(0,1fr)_auto] [grid-template-areas:'rank_name_fit'_'rank_slot_slot'] md:gap-x-4 md:grid-cols-[2.5rem_minmax(0,1fr)_4.5rem_8rem] md:[grid-template-areas:'rank_name_fit_slot']"
}

// Who the chart's ranking is against, as its heading asks it, and the launch report's.
export const whoShares = (names: string[]) =>
  names.length === 1
    ? `Who shares ${names[0]}’s listeners`
    : names.length
      ? `Who shares the listeners of ${listOf(names)}`
      : 'Who shares the launch’s listeners'

// The chart's finding, from the ranking and the topic moves, which the launch report states too.
export const finding = (ranking: Ranking, moves: Move[] | null) =>
  topicFinding(ranking.rows.filter((r) => r.finalist).length, moves && moves.filter((m) => m.climber))

// The fit chart: the roster ranked by listener overlap with the launch, its finding its sentence, then
// what the ranking didn't score, a section of its own. Fit shows as rank and band; raw affinities stay
// in the ranking call's evidence. Once the topic column is in, the lens re-orders the rows by topic
// alone, and each show's move is what Qloo changed. By default it shows what's in contention: the
// finalists, the shows a topic-only plan picks, the climbers and any left out; "Show all" lists every
// ranked show.
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
  openCall: OpenCall
  opened: string | null
  roster: Show[] // for each show's downloads
  cpm: number | null
  sampleCpm: boolean // the CPM is still the sample network's, as the footnote says
}) {
  const [all, setAll] = useState(false)
  const moves = topic?.status === 'ranked' && ranking && !ranking.error ? topic.moves : null
  const byShow = new Map(moves?.map((m) => [m.show, m]))
  // A show's ranks as the lens reads them: by fit, and by topic alone.
  const ranks = (r: FitRow) => ({ key: r.show, rank: r.rank, agentRank: byShow.get(r.show)?.topicRank ?? null })
  // The lens, its travel, and the climber whose "Why it moved" row is open.
  const {
    lens,
    byAgent: topicLens,
    order,
    switchLens,
    rowRef,
    why,
    toggleWhy
  } = useRerank(ranking?.rows ?? [], ranks, moves !== null)

  const title = whoShares(
    ranking?.anchors.map((a) => a.name) ?? (launch?.name ? [launch.name] : (launch?.comps.map((c) => c.name) ?? []))
  )
  if (!ranking)
    return (
      <Section
        id="fit-h"
        title={title}
        description={
          running ? (
            <StateLine kind="loading">The fit chart appears once the agent ranks the roster.</StateLine>
          ) : (
            <StateLine kind="empty">The fit chart appears once a run ranks the roster.</StateLine>
          )
        }
      >
        {running && (
          // The chart's rows in their shape, still.
          <div aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className={cn(rowGrid.plain, bleed, 'items-center border-b py-3')}>
                <Skeleton className="h-7 w-6 justify-self-end [grid-area:rank]" />
                <Skeleton className="h-4 w-48 max-w-full [grid-area:name]" />
                <Skeleton className="h-3 w-5 [grid-area:fit]" />
                <Skeleton className="h-4 w-16 justify-self-end [grid-area:slot]" />
              </div>
            ))}
          </div>
        )}
      </Section>
    )

  const anchors = listOf(ranking.anchors.map((a) => a.name))
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
  // A ranking without shows Qloo failed to look up is partial, never presented as the whole roster.
  const missing = ranking.error ? [] : ranking.notScored.filter((n) => failed.includes(n.show)).map((n) => n.show)
  const show = (name: string) => roster.find((s) => s.name === name)
  // Whether a ranked show, shown or folded behind "Show all", is priced from sample downloads (#333).
  const sampleFigures = ranking.rows.some((r) => show(r.show)?.sample?.includes('downloads'))
  return (
    <>
      <Section
        id="fit-h"
        title={title}
        description={
          ranking.error ? (
            <StateLine kind="failed">Nothing is ranked: {sentence(ranking.error)}</StateLine>
          ) : (
            <>
              {finding(ranking, moves)}{' '}
              <CallButton
                call={ranking.call}
                label="Evidence for the fit ranking"
                opened={opened}
                openCall={openCall}
              />
            </>
          )
        }
      >
        {!ranking.error && (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {moves && <LensSwitch label="Order the chart" agent={byTopic} lens={lens} onChange={switchLens} />}
              <LensSource
                byAgent={topicLens}
                captions={{
                  listeners: `Ranked by listener overlap with ${anchors}`,
                  agent: 'Ranked by topic alone, from show names and descriptions'
                }}
              />
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
                  {moves && <MoveHeader />}
                  <span role="columnheader" className="[grid-area:name]">
                    Show
                  </span>
                  {/* The other lens's rank: the topic rank Claude gave it, or under "By topic" its listener rank. */}
                  {moves && <OtherRankHeader lens={lens} agent={byTopic} />}
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
                  const ranked = ranks(r)
                  const out = leftOut.includes(r.show)
                  const flagged = r.finalist ? demographics?.rows.find((d) => d.show === r.show)?.reasons : null
                  const shared = r.sharedTags ?? null // runs from before shared tags have none
                  const notes = [
                    !sameName(r.entity.name, r.show) && `Mapped to ${r.entity.name}`,
                    ranking.anchors.length > 1 &&
                      (r.leadingComp ? `Led by ${r.leadingComp.name}` : 'Comps contributed evenly')
                  ].filter(Boolean)
                  const callButton = (call: string, label: string) => (
                    <CallButton call={call} label={label} opened={opened} openCall={openCall} />
                  )
                  const tint = r.finalist ? 'bg-signal-tint' : 'bg-background'
                  const end = move?.climber ? lastGrapheme(r.show) : '' // what the climber's chevron rides on
                  return (
                    <Fragment key={r.show}>
                      <div
                        role="row"
                        ref={rowRef(r.show)}
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
                        <RankCell row={ranked} lens={moves ? lens : null} agent={byTopic} />
                        {moves && (
                          <MoveCell move={move?.move ?? null} climber={move?.climber === true} agent={byTopic} />
                        )}
                        <div role="cell" className="flex min-w-0 flex-col gap-1 [grid-area:name]">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            {/* A name sizes to its words, so one too long for the row, such as a name with no
                                spaces, breaks anywhere. */}
                            {move?.climber ? (
                              // The chevron rides on the name's last character, so a name that wraps, or breaks
                              // inside a word, keeps it beside its end rather than at the row's far edge.
                              <WhyToggle
                                open={open}
                                controls={`why-${r.rank}`}
                                onToggle={() => toggleWhy(r.show)}
                                className="text-[15px] leading-snug font-semibold wrap-anywhere"
                                end={end}
                              >
                                {r.show.slice(0, r.show.length - end.length)}
                              </WhyToggle>
                            ) : (
                              <span className="text-[15px] leading-snug font-semibold wrap-anywhere">{r.show}</span>
                            )}
                            {r.finalist && <Badge mark="signal">Finalist</Badge>}
                            {out && <Badge>Left out</Badge>}
                            {flagged?.length ? <Badge variant="outline">Listeners differ</Badge> : null}
                          </div>
                          {(shared || notes.length > 0) && (
                            <p className="type-caption text-muted-foreground">
                              {shared && (
                                <>
                                  {tagWords(shared)} {callButton(shared.call, `Evidence for the tags ${r.show} shares`)}
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
                        {moves && <OtherRankCell row={ranked} lens={lens} agent={byTopic} />}
                        <span role="cell" className="[grid-area:fit]">
                          <FitBand band={r.band} finalist={r.finalist} quiet />
                        </span>
                        <span role="cell" className="[grid-area:slot]" data-slot-value>
                          <SlotValue show={show(r.show)} cpm={cpm} />
                        </span>
                      </div>
                      {open && (
                        <WhyRow id={`why-${r.rank}`} className={cn(grid, bleed, 'border-b pb-3', tint)} columns={6}>
                          {/* Topic rank is Claude's baseline, fit rank Qloo's: each labelled, neither wrapped off
                            its words. */}
                          <p>
                            <Source of="agent" /> Topic alone ranks it{'\u00a0'}
                            {move.topicRank}.
                          </p>
                          <p>
                            <Source of="qloo" /> Listener overlap with {anchors} ranks it{'\u00a0'}
                            {r.rank}. {callButton(ranking.call, `Evidence for ${r.show}’s fit`)}
                          </p>
                          {r.leadingComp && <p>Led by {r.leadingComp.name}.</p>}
                          {shared && !shared.error && shared.tags.length > 0 && (
                            <p>
                              Shared tags: {listOf(shared.tags)}.{' '}
                              {callButton(shared.call, `Evidence for the tags ${r.show} shares`)}
                            </p>
                          )}
                        </WhyRow>
                      )}
                    </Fragment>
                  )
                })}
              </div>
            </div>
            {(folded > 0 || all) && (
              <Button variant="ghost" size="sm" className="-ml-2.5 self-start" onClick={() => setAll(!all)}>
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
                  : `Slot value = downloads × ${dollars(cpm)}${sampleCpm ? ' sample' : ''} CPM ÷ 1,000${sampleFigures ? ' · sample figures' : ''}`}
              </p>
              {demographics && (
                <DemographicSummary check={demographics} ranking={ranking} openCall={openCall} opened={opened} />
              )}
            </div>
            {missing.length > 0 && (
              <StateLine kind="failed">
                Partial ranking: {listOf(missing)} {missing.length === 1 ? 'isn’t' : 'aren’t'} in it, because{' '}
                {missing.length === 1 ? 'its Qloo lookup' : 'their Qloo lookups'} failed.
              </StateLine>
            )}
          </>
        )}
      </Section>
      {ranking.notScored.length > 0 && (
        <Section
          id="not-scored-h"
          title={`Not scored · ${ranking.notScored.length}`}
          description="The roster’s shows that the ranking left out, and why."
        >
          <NotScored
            noun="Show"
            labelledBy="not-scored-h"
            rows={ranking.notScored.map((n) => ({ key: n.show, name: n.show, reason: n.reason }))}
          />
        </Section>
      )}
    </>
  )
}

// A name's last character as a reader sees it, whole: a letter with its accent, an emoji with its
// modifiers, or a flag.
const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' })
const lastGrapheme = (name: string) => [...graphemes.segment(name)].at(-1)?.segment ?? ''

// What a finalist's shared tags say under its name: the tags, why their compare failed, or that it
// found none. A separator never starts a line.
export const tagWords = (shared: SharedTags) =>
  shared.error
    ? `Shared tags failed: ${shared.error}`
    : shared.tags.length > 0
      ? shared.tags.join('\u00a0· ')
      : 'No distinctive shared tags'

// What one promo slot on a show displaces, from its downloads and the CPM; or the figure it's missing.
// The value and the downloads under it share a right edge; on a phone's second line they run on.
export function SlotValue({ show, cpm }: { show: Show | undefined; cpm: number | null }) {
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
    </span>
  )
}

// The demographic check in one line, citing its call: who the launch's listeners are, in words,
// and how many finalists' listeners differ. The values stay in the call's evidence.
export function DemographicSummary({
  check,
  ranking,
  openCall,
  opened
}: {
  check: DemographicCheck
  ranking: Ranking
  openCall: OpenCall
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
          ? `${flagged} of ${check.rows.length} finalists’ listeners differ.`
          : `No demographic mismatches among the ${check.rows.length} finalists.`}
      </b>
      {unchecked.length > 0 &&
        ` Qloo had no demographics for ${listOf(unchecked)}, so ${unchecked.length > 1 ? 'they weren’t' : 'it wasn’t'} checked.`}
    </p>
  )
}
