// The fit ranking as the chart shows it: the TRD's derived values, worked out from one Qloo
// closed-list ranking of the roster, and the pitch lists, one per work type. Raw affinities stay in
// the evidence; the charts get ranks.
import type { Show } from './agent'
import type { QlooResult, Ranked } from './gateway'
import type { Pitch, Work, WorkCandidate, WorkMatch, WorkType } from './inbox'
import type { Candidate } from './resolve'

export type Anchor = { id: string; name: string }

// Top, middle, or bottom third by rank within one ranking.
export type Band = 'top' | 'middle' | 'bottom'

export type FitRow = {
  show: string // the roster show, named as imported
  entity: Candidate // what Qloo scored for it: its own match, or the comp it's mapped to
  rank: number // fit rank, from 1
  band: Band
  leadingComp: Anchor | null // the anchor that clearly drove this show's fit; never with one anchor
  finalist: boolean // one of the top five by fit
  sharedTags: SharedTags | null // a finalist's, once shared_tags has run
}

// The tags a finalist's listeners share with the launch's, from one compare call: words in Qloo's
// order, generic ones dropped, never scores.
export type SharedTags = { call: string; tags: string[]; error: string | null }

export type NotScored = { show: string; reason: string }

export type Ranking = {
  call: string // the ranking's evidence
  anchors: Anchor[] // the launch, or its comps
  error: string | null // why Qloo gave no ranking; then `rows` is empty
  rows: FitRow[] // in fit order
  notScored: NotScored[] // every other roster show, in roster order, with the reason
}

// One pitched work in its type's list. Pitches of the same work share its score.
export type PitchRow = {
  pitch: string // the pitch's ID, such as "pitch-07"
  entity: WorkCandidate // the work Qloo scored
  rank: number // from 1, within this list only
  band: Band
}

export type PitchNotScored = { pitch: string; reason: string }

// The pitched works of one type, ranked against the show by one Qloo call. Another type's list comes
// from another call, so its scores can't be compared with these.
export type PitchList = {
  type: WorkType
  // show: against the show and the past guests' works. same_type: against only the past guests'
  // works of this type, because Qloo scored none of them against the show. unranked: not ranked.
  path: 'show' | 'same_type' | 'unranked'
  anchors: Anchor[] // what its last ranking call ranked against
  calls: string[] // its ranking calls, in the order made
  error: string | null // why it's unranked
  rows: PitchRow[] // in fit order
  notScored: PitchNotScored[] // this type's other pitches, in inbox order, with the reason
}

const FINALISTS = 5
const LEAD = 0.05 // how far the top anchor's share must beat the next one's to name it

// A show the ranking can score: matched in Qloo, directly or through a comp, and not left out.
export const scorable = (show: Show): show is Show & { entity: Candidate } =>
  (show.resolution === 'resolved' || show.resolution === 'mapped') && show.entity !== null && !show.excluded

// Builds the chart from the roster and the ranking call. Shows mapped to the same entity share its
// score, and ties keep roster order. `launch` is the launch's own entity ID, when it has one.
export function rankRoster(
  roster: Show[],
  anchors: Anchor[],
  launch: string | null,
  call: string,
  result: QlooResult<Ranked>
): Ranking {
  const isAnchor = (s: Show) => anchors.some((a) => a.id === s.entity?.id)
  const scores = new Map(result.ok ? result.data.scored.map((s) => [s.id, s]) : [])
  const ranked = roster
    .filter((s) => scorable(s) && !isAnchor(s) && scores.has(s.entity!.id))
    .map((s) => ({ show: s, score: scores.get(s.entity!.id)! }))
    .sort((a, b) => b.score.affinity - a.score.affinity)
  const rows = ranked.map(({ show, score }, i) => ({
    show: show.name,
    entity: show.entity!,
    rank: i + 1,
    band: band(i, ranked.length),
    leadingComp: leadingComp(anchors, score.explainability),
    finalist: i < FINALISTS,
    sharedTags: null
  }))
  const reason = (s: Show) => {
    if (s.excluded) return 'Excluded: never proposed for a launch'
    if (s.resolution === 'pending') return 'Still being looked up in Qloo'
    if (s.resolution === 'ambiguous') return 'Ambiguous in Qloo search: pick its match in the roster'
    if (s.resolution === 'missed') return 'Not in Qloo: map a comp or leave it out'
    if (s.resolution === 'failed') return `Its Qloo lookup failed: ${s.error}`
    if (isAnchor(s))
      return s.entity?.id === launch
        ? 'The launch: not ranked against itself'
        : 'A comp for the launch: not ranked against it'
    if (!result.ok) return 'Not scored: the ranking failed'
    return 'Qloo returned no score for it against this launch'
  }
  const notScored = roster
    .filter((s) => !rows.some((r) => r.show === s.name))
    .map((s) => ({ show: s.name, reason: reason(s) }))
  return { call, anchors, error: result.ok ? null : result.error, rows, notScored }
}

const bands: Band[] = ['top', 'middle', 'bottom']
const band = (i: number, n: number) => bands[Math.floor((i * 3) / n)]

// A pitch a ranking can score: read, with a public work matched to one Qloo entity. A pitch set aside
// with no public work, unreadable, or failed never is.
export const rankable = (p: Pitch): p is Pitch & { work: Work; match: WorkMatch & { entity: WorkCandidate } } =>
  p.status === 'read' && p.work !== null && p.match?.resolution === 'resolved' && p.match.entity !== null

// Builds one type's list from `pitches`, the read pitches of that type, and the outcome of its last
// ranking call: the scored results, or why there's no ranking. Ties keep inbox order.
export function listPitches(
  type: WorkType,
  pitches: Pitch[],
  { path, anchors, calls }: Pick<PitchList, 'path' | 'anchors' | 'calls'>,
  outcome: Ranked['scored'] | string
): PitchList {
  const isAnchor = (p: Pitch) => anchors.some((a) => a.id === p.match?.entity?.id)
  const scores = new Map(typeof outcome === 'string' ? [] : outcome.map((s) => [s.id, s.affinity]))
  const ranked = pitches
    .filter(rankable)
    .filter((p) => !isAnchor(p) && scores.has(p.match.entity.id))
    .sort((a, b) => scores.get(b.match.entity.id)! - scores.get(a.match.entity.id)!)
  const rows = ranked.map((p, i) => ({
    pitch: p.id,
    entity: p.match.entity,
    rank: i + 1,
    band: band(i, ranked.length)
  }))
  const reason = (p: Pitch) => {
    if (p.match?.resolution === 'ambiguous') return 'Ambiguous in Qloo search: confirm its match in the inbox'
    if (p.match?.resolution === 'missed') return 'Not in Qloo'
    if (p.match?.resolution === 'failed') return `Its Qloo lookup failed: ${p.match.error}`
    if (isAnchor(p)) return "A past guest's work: not ranked against itself"
    if (typeof outcome === 'string') return 'Not ranked, with the rest of this list'
    return 'Qloo returned no score for it against these anchors'
  }
  const notScored = pitches
    .filter((p) => !rows.some((r) => r.pitch === p.id))
    .map((p) => ({ pitch: p.id, reason: reason(p) }))
  return { type, path, anchors, calls, error: typeof outcome === 'string' ? outcome : null, rows, notScored }
}

// Marks the top five by fit as finalists, after the shows the run left out in its exclusions answer.
export function markFinalists(ranking: Ranking, exclusions: string[]): Ranking {
  let picked = 0
  const rows = ranking.rows.map((r) => {
    const finalist = !exclusions.includes(r.show) && picked < FINALISTS
    if (finalist) picked++
    return { ...r, finalist }
  })
  return { ...ranking, rows }
}

// The anchor whose explainability share beats the next one's by LEAD or more on this result. An
// anchor a result doesn't list contributed nothing to it.
function leadingComp(anchors: Anchor[], shares: { id: string; score: number }[]): Anchor | null {
  if (anchors.length < 2) return null
  const [top, next] = anchors
    .map((anchor) => ({ anchor, share: shares.find((s) => s.id === anchor.id)?.score ?? 0 }))
    .sort((a, b) => b.share - a.share)
  return top.share - next.share >= LEAD ? top.anchor : null
}
