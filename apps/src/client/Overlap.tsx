import { cn } from 'cn'
import { ArrowLeftRightIcon, ChevronDownIcon } from 'lucide-react'
import { Fragment, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import type { Show } from '../agent'
import type { Evidence } from '../evidence'
import {
  apart,
  closePairs,
  closestCount,
  entityShows,
  isStale,
  MIN_OVERLAP_ENTITIES,
  rankingOf,
  toMeasure,
  tooFew,
  type Entity,
  type Overlap,
  type OverlapRow
} from '../overlap'
import { Alert, clock, day, FitBand, listOf, ScrollTable, useAction } from './controls'
import { CallButton, type OpenCall } from './Evidence'
import type { NetworkConnection } from './NetworkPage'
import { count, Section } from './PageHeader'
import { Source } from './Source'
import { sentence, StateLine } from './states'

// The roster page's Overlap tab: which of the network's own shows share listeners with each other, as
// Qloo measures it, one closed-list ranking per show (overlap.ts). Its sentence is the finding, the close
// pairs and the shows among no other show's closest, or the state it's in: too few shows matched, not
// measured yet, or measuring, show by show, in a status region. Then what's stale or failed, the action
// with what it may spend, and the table, in the roster's order: each show's closest shows with their
// ranks, bands and call, and its whole ranking on demand. Everything in it is Qloo's measure, never a
// proposal, so it's in ink, with no signal. A teammate's measure arrives through synced state.
export function OverlapSection({
  agent,
  roster,
  overlap,
  openCall,
  opened
}: {
  agent: NetworkConnection
  roster: Show[]
  overlap: Overlap | undefined
  openCall: OpenCall
  opened: string | null
}) {
  // The section's heading, which takes focus from the action, as the action goes with the measure it starts.
  const heading = useRef<HTMLHeadingElement>(null)
  const { busy, error, run } = useAction()
  const onRoster = entityShows(roster)
  const few = onRoster.size < MIN_OVERLAP_ENTITIES
  // What a measure would ask now: every show, or with the roster's matched shows unchanged, only those
  // whose ranking hasn't landed. With none, there's nothing to measure again.
  const { anchors } = toMeasure(roster, overlap)
  const measuring = overlap?.status === 'measuring'
  const stale = overlap !== undefined && isStale(overlap, roster)
  const landed = overlap?.rows.filter((r) => !r.error) ?? []
  const k = closestCount(overlap ? overlap.key.split(',').length : onRoster.size)
  const measure = async () => {
    if (await run(() => agent.stub.measureOverlap())) heading.current?.focus()
  }
  const state =
    overlap?.status === 'measuring' ? (
      <StateLine kind="loading">
        {`Measuring the overlap: ${overlap.answered} of ${count(overlap.asked, 'show')} ranked.`}
      </StateLine>
    ) : few ? (
      <StateLine kind="empty">{tooFew(onRoster.size)}</StateLine>
    ) : !overlap ? (
      <StateLine kind="empty">The roster’s overlap hasn’t been measured yet.</StateLine>
    ) : landed.length === 0 ? (
      <StateLine kind="failed">{sentence(overlap.error ?? 'No show’s ranking landed.')}</StateLine>
    ) : (
      finding(overlap.rows, k)
    )
  return (
    <Section
      id="overlap-h"
      title="Who shares whose listeners"
      badge={<Source of="qloo" />}
      heading={heading}
      // The sentence is a status region whatever it says, so the progress, and the finding a measure ends
      // on, a teammate's included, are told as they change.
      description={<span role="status">{state}</span>}
      data-overlap
    >
      {!few && !measuring && (
        <div className="flex flex-col items-start gap-3 empty:hidden">
          {stale && (
            <p className="max-w-[72ch] font-semibold">
              The roster’s matched shows have changed since the overlap was measured, so measure it again to read it as
              the roster is now.
            </p>
          )}
          {overlap?.status === 'failed' && landed.length > 0 && (
            <p className="max-w-[72ch]">
              <StateLine kind="failed">{sentence(overlap.error ?? 'The measure failed.')}</StateLine>
            </p>
          )}
          {anchors.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {/* Still focusable while it starts the measure, so a refusal leaves focus on it. */}
              <Button
                variant="secondary"
                disabled={busy}
                focusableWhenDisabled
                aria-describedby="overlap-cost"
                onClick={() => void measure()}
              >
                {busy && <Spinner data-icon="inline-start" />}
                {overlap ? 'Measure again' : 'Measure the overlap'}
              </Button>
              {/* A ranking the gateway's cache answers costs no real request, so it's at most this. */}
              <span id="overlap-cost" className="type-caption text-muted-foreground">
                {`Up to ${count(anchors.length, 'Qloo call')}`}
              </span>
            </div>
          )}
          {error && (
            <p className="max-w-[72ch]">
              <Alert error={error} />
            </p>
          )}
        </div>
      )}
      {overlap && (!few || measuring) && (
        <OverlapTable agent={agent} overlap={overlap} onRoster={onRoster} k={k} openCall={openCall} opened={opened} />
      )}
    </Section>
  )
}

// A show's closest shows in words: "3 closest shows", or on a roster of four to six, "closest show".
const closestWords = (k: number) => (k === 1 ? 'closest show' : `${k} closest shows`)

// The overlap's finding, counted over the rows that landed: its close pairs, or that there are none, and
// how many shows rank among no other show's closest. It says only what was measured.
function finding(rows: OverlapRow[], k: number) {
  const pairs = closePairs(rows).length
  const shows = rows.filter((r) => !r.error).length
  const alone = apart(rows).length
  const among = (whose: string) => (k === 1 ? `${whose} ${closestWords(k)}` : `among ${whose} ${closestWords(k)}`)
  return `${pairs === 0 ? 'No close pairs' : count(pairs, 'close pair')}, and ${
    alone === 0
      ? `every show is ${among('another show’s')}`
      : `${alone} of ${count(shows, 'show')} ${alone === 1 ? 'is' : 'are'} ${among('no other show’s')}`
  }.`
}

// An anchor's whole ranking as it's read from its call's evidence, on demand.
type Read = { status: 'loading' } | { status: 'loaded'; record: Evidence } | { status: 'failed'; error: string }

// The overlap as a real table, in the roster's order, with no rank column: one row per Qloo show, named by
// its first show on the roster, as the program's overlap names it. Narrower than the table, it scrolls
// sideways in its region with the show's column held at the left, as the roster's table does. Each row's
// "Show all" opens its whole ranking under it, read from its call's evidence record, in the fit chart's
// ranked-row anatomy; a row still measuring holds skeleton lines where its closest shows will be.
function OverlapTable({
  agent,
  overlap,
  onRoster,
  k,
  openCall,
  opened
}: {
  agent: NetworkConnection
  overlap: Overlap
  onRoster: ReturnType<typeof entityShows>
  k: number
  openCall: OpenCall
  opened: string | null
}) {
  // The rows whose whole ranking is open, by entity, and each ranking read, by call.
  const [open, setOpen] = useState<string[]>([])
  const [reads, setReads] = useState<Record<string, Read>>({})
  const rows = new Map(overlap.rows.map((r) => [r.entity.id, r]))
  const measured = new Set(overlap.key.split(','))
  const pairs = closePairs(overlap.rows)
  const paired = (a: string, b: string) => pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a))
  // A Qloo show by its first show on the roster, or as Qloo names it once none is.
  const name = (e: Entity) => onRoster.get(e.id)?.shows[0].name ?? e.name
  const read = async (call: string) => {
    setReads((r) => ({ ...r, [call]: { status: 'loading' } }))
    try {
      const [record] = await agent.stub.getEvidence([call])
      setReads((r) => ({
        ...r,
        [call]: record ? { status: 'loaded', record } : { status: 'failed', error: `The network has no call ${call}` }
      }))
    } catch (e) {
      setReads((r) => ({ ...r, [call]: { status: 'failed', error: e instanceof Error ? e.message : String(e) } }))
    }
  }
  const toggle = (row: OverlapRow) => {
    const id = row.entity.id
    if (open.includes(id)) return setOpen(open.filter((o) => o !== id))
    setOpen([...open, id])
    const status = reads[row.call]?.status
    if (status !== 'loaded' && status !== 'loading') void read(row.call)
  }
  const cell = 'border-b py-3 pl-3 align-top'
  const head = 'border-b pb-2 pl-3 text-left align-bottom font-normal'
  // The show's column, held at the left while the rest scrolls under it, ruled where they meet, as the
  // roster table's is, and over the call numbers passing under it. A word too long for it breaks anywhere
  // rather than widening it.
  const held = 'sticky left-0 z-10 bg-background pl-2 wrap-anywhere max-md:border-r max-md:pr-3'
  // The close pair's mark, in ink, beside the other show's name; screen readers hear it in words, from a
  // visually hidden span, which its row holds (`relative`) so it never widens the page as the table scrolls.
  const pairMark = (
    <>
      <ArrowLeftRightIcon aria-hidden="true" className="ml-1.5 inline-block size-3.5 align-[-0.125rem]" />
      <span className="vh">, a close pair</span>
    </>
  )
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <ScrollTable label="Overlap table" className="-mx-2 max-w-none">
        <table
          className="w-full min-w-[36rem] border-separate border-spacing-0"
          aria-labelledby="overlap-h"
          aria-describedby="overlap-cap"
          data-overlap-table
        >
          <thead className="type-caption text-muted-foreground">
            <tr>
              <th scope="col" className={cn(head, held, 'w-44 md:w-72')}>
                Show
              </th>
              <th scope="col" className={head}>
                Closest shows
              </th>
              <th scope="col" className={cn(head, 'w-32 pr-2 text-right')}>
                Ranking
              </th>
            </tr>
          </thead>
          <tbody>
            {[...onRoster.values()].map(({ entity, shows: [first, ...others] }) => {
              const row = rows.get(entity.id)
              const state = row
                ? row.error
                  ? 'failed'
                  : 'measured'
                : overlap.status === 'measuring' && measured.has(entity.id)
                  ? 'measuring'
                  : 'unmeasured'
              const isOpen = state === 'measured' && open.includes(entity.id)
              // What the roster says of the show, under its name, and the shows matched to the same Qloo
              // show, which are measured once and listed with it.
              const notes = [
                first.resolution === 'mapped' && `Mapped to ${entity.name}`,
                first.excluded && 'Left out',
                others.length > 0 && `Same Qloo show as ${listOf(others.map((s) => s.name))}`
              ].filter(Boolean)
              const call = row && (
                <CallButton
                  call={row.call}
                  label={`Evidence for ${first.name}’s ranking`}
                  opened={opened}
                  openCall={openCall}
                />
              )
              return (
                <Fragment key={entity.id}>
                  <tr data-overlap-row={first.name} data-state={state} aria-busy={state === 'measuring' || undefined}>
                    <th
                      scope="row"
                      className={cn(cell, held, 'text-left font-normal', isOpen && 'border-b-transparent')}
                    >
                      <span className="flex min-w-40 flex-col items-start gap-1 md:min-w-48">
                        <span className="text-[15px] leading-snug font-semibold">{first.name}</span>
                        {notes.length > 0 && (
                          <span className="type-caption text-muted-foreground">{notes.join(' · ')}</span>
                        )}
                      </span>
                    </th>
                    <td className={cn(cell, isOpen && 'border-b-transparent')}>
                      {state === 'measured' ? (
                        <div className="flex flex-col items-start gap-1.5">
                          <ol className="flex flex-col gap-1" aria-label={`${first.name}’s closest shows`}>
                            {row!.closest.map((c) => (
                              <li
                                key={c.id}
                                className="relative grid grid-cols-[2rem_minmax(10rem,16rem)_auto] items-baseline gap-x-3"
                              >
                                <span className="text-muted-foreground tabular-nums">{`#${c.rank}`}</span>
                                <span className="break-words">
                                  {name(c)}
                                  {paired(entity.id, c.id) && pairMark}
                                </span>
                                <FitBand band={c.band} finalist={false} />
                              </li>
                            ))}
                          </ol>
                          {/* Its number on the ranks' edge, its fill reaching past it. */}
                          <span className="-ml-1">{call}</span>
                        </div>
                      ) : state === 'failed' ? (
                        <p className="max-w-[48ch]">
                          <StateLine kind="failed">{sentence(row!.error!)}</StateLine> {call}
                        </p>
                      ) : state === 'measuring' ? (
                        <div className="relative flex flex-col gap-2 py-0.5">
                          <span className="vh">Measuring</span>
                          {Array.from({ length: Math.max(k, 1) }, (_, i) => (
                            <Skeleton key={i} className="h-4 w-56 max-w-full" />
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Not measured yet</span>
                      )}
                    </td>
                    <td className={cn(cell, 'pr-2 text-right', isOpen && 'border-b-transparent')}>
                      {state === 'measured' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="-my-1 -mr-1.5"
                          aria-expanded={isOpen}
                          aria-controls={`ranking-${entity.id}`}
                          onClick={() => toggle(row!)}
                        >
                          {isOpen ? 'Show fewer' : `Show all ${measured.size - 1}`}
                          <ChevronDownIcon
                            data-icon="inline-end"
                            aria-hidden="true"
                            className="transition-transform group-aria-expanded/button:rotate-180"
                          />
                        </Button>
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr id={`ranking-${entity.id}`}>
                      <td colSpan={3} className="border-b pb-4 pl-2">
                        {/* On a phone it stays in view however far the table is scrolled; from 768px it
                            stands under the closest shows. */}
                        <div className="sticky left-2 w-[calc(100vw-3rem)] max-w-xl md:static md:w-full md:max-w-none md:pl-[18.25rem]">
                          <WholeRanking
                            show={first.name}
                            call={row!.call}
                            read={reads[row!.call]}
                            again={() => void read(row!.call)}
                            name={name}
                            paired={(id) => paired(entity.id, id) && pairMark}
                            candidates={measured.size - 1}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </ScrollTable>
      <div id="overlap-cap" className="flex max-w-[72ch] flex-col gap-1 type-caption text-muted-foreground">
        <p>
          {`Each show’s closest shows are the first ${k} in its own ranking of the rest of the roster, one Qloo call per show, and bands are thirds of that ranking.`}
        </p>
        <p>
          <ArrowLeftRightIcon aria-hidden="true" className="mr-1.5 inline-block size-3.5 align-[-0.125rem]" />
          {`Close pair: two shows that each rank among the other’s ${closestWords(k)}.${overlap.measuredAt ? ` Measured ${day(overlap.measuredAt)}, ${clock(overlap.measuredAt)}.` : ''}`}
        </p>
      </div>
    </div>
  )
}

// One show's whole ranking of the rest of the roster, from its call's evidence record, in the fit chart's
// ranked-row anatomy as a compact real table: the rank, the show, and its band. While it's read, its
// rows' shape, still; a read that failed says why, with a way to try again.
function WholeRanking({
  show,
  call,
  read,
  again,
  name,
  paired,
  candidates
}: {
  show: string
  call: string
  read: Read | undefined
  again: () => void
  name: (e: Entity) => string
  paired: (id: string) => React.ReactNode
  candidates: number
}) {
  if (!read || read.status === 'loading')
    return (
      <div className="flex flex-col gap-2 pt-1">
        <p role="status">
          <StateLine kind="loading" word={null}>
            {`Loading ${show}’s ranking, ${call}…`}
          </StateLine>
        </p>
        <div className="flex flex-col gap-3" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-6 w-6" />
              <Skeleton className="h-4 w-48" />
            </div>
          ))}
        </div>
      </div>
    )
  if (read.status === 'failed')
    return (
      <p className="flex flex-wrap items-baseline gap-x-2 pt-1">
        <StateLine kind="error" role="alert">
          {`Couldn’t load ${call}: ${sentence(read.error)}`}
        </StateLine>
        <Button variant="link" onClick={again}>
          Try again
        </Button>
      </p>
    )
  const ranked = rankingOf(read.record)
  return (
    <table className="w-full border-separate border-spacing-0 md:max-w-xl" data-whole-ranking={show}>
      <caption className="pb-1.5 text-left type-caption text-muted-foreground">
        {`${show}’s ranking of the rest of the roster by listener overlap${ranked.length < candidates ? `: Qloo scored ${ranked.length} of ${candidates}` : ''}.`}
      </caption>
      <thead className="type-caption text-muted-foreground">
        <tr>
          <th scope="col" className="w-12 border-b pr-1 pb-2 text-right align-bottom font-normal">
            Rank
          </th>
          <th scope="col" className="border-b pb-2 pl-3 text-left align-bottom font-normal">
            Show
          </th>
          <th scope="col" className="w-24 border-b pb-2 pl-3 text-left align-bottom font-normal">
            Fit
          </th>
        </tr>
      </thead>
      <tbody>
        {ranked.map((c) => (
          <tr key={c.id}>
            <td className="border-b py-2.5 pr-1 text-right align-baseline type-title tabular-nums">{c.rank}</td>
            <th scope="row" className="border-b py-2.5 pl-3 text-left align-baseline font-normal">
              <span className="text-[15px] leading-snug font-semibold break-words">{name(c)}</span>
              {paired(c.id)}
            </th>
            <td className="border-b py-2.5 pl-3 align-baseline">
              <FitBand band={c.band} finalist={false} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
