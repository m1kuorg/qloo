// The roster's overlap: which of a network's own shows share listeners with each other. It's measured
// with one closed-list ranking in Qloo per distinct entity the roster's shows are matched or mapped to,
// that entity the only anchor and the roster's other entities the candidates. Scores from separate calls
// aren't comparable, so each anchor keeps only ranks and bands within its own ranking, as the fit chart
// does, and its whole ranking stays in its call's evidence.
import type { Show } from './agent'
import { band, matched, type Band } from './fit'
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

// The fewest distinct entities a measure takes: under four, no show has a closest show (closestCount).
export const MIN_OVERLAP_ENTITIES = 4

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

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
export const byEntity = (a: OverlapRow, b: OverlapRow) => byId(a.entity, b.entity)

// A set of entities as one string, to tell whether the roster's still match a measure's.
export const entityKey = (entities: Entity[]) => entities.map((e) => e.id).join(',')

// How many closest shows each show has, among `n` distinct entities: up to three, and never more than
// the top band of its ranking holds. So 3 from 10 shows, 2 from 7, 1 from 4, and none under 4.
export const closestCount = (n: number) => Math.max(0, Math.min(3, Math.floor((n - 1) / 3)))

// Whether the roster's matched entities differ from those the overlap was measured from. A show's
// figures, status or exclusion never make it stale.
export const isStale = (overlap: Overlap, roster: Show[]) => overlap.key !== entityKey(rosterEntities(roster))

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
