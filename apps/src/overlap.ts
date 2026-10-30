// The roster's overlap: which of a network's own shows share listeners with each other. It's measured
// with one closed-list ranking in Qloo per distinct entity the roster's shows are matched or mapped to,
// that entity the only anchor and the roster's other entities the candidates. Scores from separate calls
// aren't comparable, so each anchor keeps only ranks and bands within its own ranking, as the fit chart
// does, and its whole ranking stays in its call's evidence.
import type { Show } from './agent'
import type { Evidence } from './evidence'
import { band, matched, scoredOf, type Band } from './fit'
import type { Ranked } from './gateway'

// A Qloo entity a roster show is matched or mapped to: its ID and Qloo's name for it.
export type Entity = { id: string; name: string }

// One of a show's closest shows: its entity, its rank in the anchor's ranking, from 1, and its band, the
// third of that ranking it falls in.
export type Closest = Entity & { rank: number; band: Band }

// One anchor's ranking, as the overlap keeps it: its closest shows, best first, or why its call failed.
export type OverlapRow = {
  entity: Entity
  call: string // the ranking's call number in the network's evidence, which holds the whole ranking
  closest: Closest[] // empty when the call failed
  error: string | null
}

// The network's overlap, in its synced state. It never says who measured it, which would outlive a
// deleted member in the state's stored snapshots.
export type Overlap = {
  // measuring: calls still out; measured: every call of the latest measure has answered; failed: a
  // restart interrupted the measure, or no anchor's ranking landed, as `error` says.
  status: 'measuring' | 'measured' | 'failed'
  error: string | null
  key: string // the entities it was measured from (entityKey), so it can tell when it's stale
  asked: number // the anchors the latest measure asked
  answered: number // of them, those whose call has answered, landed or failed
  measuredAt: string | null // when a measure of these entities last ended (ISO time); null until one has
  rows: OverlapRow[] // one per anchor whose call has answered, in entity ID order
}

// The overlap as a launch's run copies it with the roster (RosterCopy): the network's last completed
// measure, its entities' key, when it ended, and the rows whose ranking landed, each citing the network's
// call. The launch holds none of those calls' records until its run drafts an order, which copies its
// finalists' into the launch's log (CrossfeedAgent.citeOverlap) and notes on each row the call number it
// holds the record under, `copy`.
export type OverlapCopy = Pick<Overlap, 'key' | 'measuredAt'> & { rows: (OverlapRow & { copy?: string })[] }

// What a launch's run copies of the network's overlap: its last completed measure, or null while none
// has completed, as before the first, while one measures, or once one failed.
export const overlapCopy = (overlap: Overlap | undefined): OverlapCopy | null =>
  overlap?.status === 'measured'
    ? { key: overlap.key, measuredAt: overlap.measuredAt, rows: overlap.rows.filter((r) => !r.error) }
    : null

// The fewest distinct entities a measure takes: under four, no show has a closest show (closestCount).
// Profiling the roster's listeners takes as many (listeners.ts), so the roster's two analyses open together.
export const MIN_OVERLAP_ENTITIES = 4

// Why a roster of `n` distinct entities can't be measured, and what it needs: the measure's refusal, and
// the Overlap tab's line in its place; or with `doing`, the listener profile's.
export const tooFew = (n: number, doing = 'Measuring the overlap') =>
  `${doing} needs at least ${MIN_OVERLAP_ENTITIES} shows matched in Qloo, counting shows matched to the same Qloo show once; the roster has ${n}. Match or map more of its shows first.`

// Why a measure is refused while one runs, and what a measure a restart interrupted says.
export const OVERLAP_MEASURING = 'The overlap is already being measured. Wait for it to finish.'
export const OVERLAP_INTERRUPTED = 'The measure was interrupted. Measure the overlap again.'

// The distinct entities the roster's shows are matched or mapped to, sorted by ID, so a ranking's
// candidates, and the gateway's cache key with them, don't depend on roster order. Shows left out of
// launches are included, since the overlap describes the roster, not a plan, and shows sharing an entity
// count once.
export function rosterEntities(roster: Show[]): Entity[] {
  const entities = new Map<string, Entity>()
  for (const { entity } of roster.filter(matched))
    if (!entities.has(entity.id)) entities.set(entity.id, { id: entity.id, name: entity.name })
  return [...entities.values()].sort(byId)
}

// The roster's matched shows by the distinct entity they're matched or mapped to, in roster order: each
// entity once, with its shows, its first on the roster first. That show names the entity wherever the
// overlap is read, and the others are listed with it, as shows matched to the same Qloo show.
export function entityShows(roster: Show[]) {
  const entities = new Map<string, { entity: Entity; shows: Show[] }>()
  for (const show of roster.filter(matched)) {
    const { id, name } = show.entity
    const on = entities.get(id)
    if (on) on.shows.push(show)
    else entities.set(id, { entity: { id, name }, shows: [show] })
  }
  return entities
}

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
export const byEntity = (a: OverlapRow, b: OverlapRow) => byId(a.entity, b.entity)

// A set of entities as one string, to tell whether the roster's still match a measure's.
export const entityKey = (entities: Entity[]) => entities.map((e) => e.id).join(',')

// How many closest shows each show has, among `n` distinct entities: up to three, and never more than
// the top band of its ranking holds. So 3 from 10 shows, 2 from 7, 1 from 4, and none under 4.
export const closestCount = (n: number) => Math.max(0, Math.min(3, Math.floor((n - 1) / 3)))

// Whether the roster's matched entities differ from those the overlap was measured from, or the listener
// profile made from (listeners.ts). A show's figures, status or exclusion never make either stale.
export const isStale = (analysis: { key: string }, roster: Show[]) => analysis.key !== entityKey(rosterEntities(roster))

// What measuring the roster asks Qloo: one ranking per anchor. With the roster's entities unchanged since
// the last measure, only the anchors whose ranking hasn't landed, missing or failed; otherwise all of them.
export function toMeasure(roster: Show[], overlap: Overlap | undefined) {
  const entities = rosterEntities(roster)
  const key = entityKey(entities)
  const landed = new Set(overlap?.key === key ? overlap.rows.filter((r) => !r.error).map((r) => r.entity.id) : [])
  return { entities, key, anchors: entities.filter((e) => !landed.has(e.id)) }
}

// An anchor's closest shows: the top `k` of its ranking, best first, each with its rank and band.
export const closestOf = (scored: Ranked['scored'], k: number): Closest[] =>
  scored.slice(0, k).map(({ id, name }, i) => ({ id, name, rank: i + 1, band: band(i, scored.length) }))

// The close pairs among `rows`: two shows each among the other's closest, so only when both rankings
// landed. Each pair is named once, by its entities' IDs, in the order of `rows`. Under four entities no
// show has a closest show, so there are none. Every surface that names a pair reads it from here.
export function closePairs(rows: OverlapRow[]): [string, string][] {
  const closest = new Map(rows.map((r) => [r.entity.id, new Set(r.closest.map((c) => c.id))]))
  const close = (a: string, b: string) => closest.get(a)!.has(b) && closest.get(b)!.has(a)
  return rows.flatMap(({ entity: a }, i) =>
    rows.slice(i + 1).flatMap(({ entity: b }) => (close(a.id, b.id) ? [[a.id, b.id] as [string, string]] : []))
  )
}

// What a launch's plan says of the close pairs among its order's lines' shows, from the overlap its run
// copied: each pair by its lines' shows, citing both shows' rankings by the calls the launch holds them
// under; the lines' shows it has no copied ranking of, so no pair with them can be named; and whether the
// overlap is stale against the run's roster, when it names none. `closestCount` is how many closest shows
// each show had in that measure.
export type PlanPairs = {
  closestCount: number
  stale: boolean
  pairs: { shows: [string, string]; calls: [string, string] }[]
  unchecked: string[]
}

// The plan's close pairs (PlanPairs), derived from the copied overlap and the order's current lines, never
// stored, so an edit that drops a line drops its pair. The plan and the API both read them here. Null with
// no overlap copied, so the plan says nothing of pairs.
export function planPairs(copy: OverlapCopy | undefined, lines: { show: string }[], roster: Show[]): PlanPairs | null {
  if (!copy) return null
  const closest = closestCount(copy.key.split(',').length)
  if (isStale(copy, roster)) return { closestCount: closest, stale: true, pairs: [], unchecked: [] }
  // Each line's entity, named by its first line, as two shows on one Qloo show are measured once.
  const shows = new Map<string, string>()
  const unmatched: string[] = []
  for (const { show } of lines) {
    const entity = roster.find((s) => s.name === show && matched(s))?.entity
    if (!entity) unmatched.push(show)
    else if (!shows.has(entity.id)) shows.set(entity.id, show)
  }
  // In the lines' order, so each pair is named as the order lists its shows.
  const rows = [...shows.keys()].flatMap((id) => copy.rows.find((r) => r.entity.id === id && r.copy) ?? [])
  const calls = new Map(rows.map((r) => [r.entity.id, r.copy!]))
  return {
    closestCount: closest,
    stale: false,
    pairs: closePairs(rows).map(([a, b]) => ({
      shows: [shows.get(a)!, shows.get(b)!],
      calls: [calls.get(a)!, calls.get(b)!]
    })),
    unchecked: [...unmatched, ...[...shows].filter(([id]) => !calls.has(id)).map(([, show]) => show)]
  }
}

// The shows that rank among no other show's closest, by entity ID, counted over the rows that landed, as
// the Overlap tab's finding counts them.
export function apart(rows: OverlapRow[]): string[] {
  const landed = rows.filter((r) => !r.error)
  const closest = new Set(landed.flatMap((r) => r.closest.map((c) => c.id)))
  return landed.filter((r) => !closest.has(r.entity.id)).map((r) => r.entity.id)
}

// An anchor's whole ranking, read back from its call's evidence record, which keeps every candidate as
// Qloo returned it: those Qloo scored, best first as the gateway ranks them, each with its rank and band,
// so its first are its closest shows (closestOf).
export const rankingOf = (record: Evidence): Closest[] => closestOf(scoredOf(record.affinities), Infinity)
