// The fit ranking as the chart shows it: the TRD's derived values, worked out from one Qloo
// closed-list ranking of the roster. Raw affinities stay in the evidence; the chart gets ranks.
import type { Show } from './agent'
import type { QlooResult, Ranked } from './gateway'
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
}

export type NotScored = { show: string; reason: string }

export type Ranking = {
  call: string // the ranking's evidence
  anchors: Anchor[] // the launch, or its comps
  error: string | null // why Qloo gave no ranking; then `rows` is empty
  rows: FitRow[] // in fit order
  notScored: NotScored[] // every other roster show, in roster order, with the reason
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
  const bands: Band[] = ['top', 'middle', 'bottom']
  const rows = ranked.map(({ show, score }, i) => ({
    show: show.name,
    entity: show.entity!,
    rank: i + 1,
    band: bands[Math.floor((i * 3) / ranked.length)],
    leadingComp: leadingComp(anchors, score.explainability),
    finalist: i < FINALISTS
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

// The anchor whose explainability share beats the next one's by LEAD or more on this result. An
// anchor a result doesn't list contributed nothing to it.
function leadingComp(anchors: Anchor[], shares: { id: string; score: number }[]): Anchor | null {
  if (anchors.length < 2) return null
  const [top, next] = anchors
    .map((anchor) => ({ anchor, share: shares.find((s) => s.id === anchor.id)?.score ?? 0 }))
    .sort((a, b) => b.share - a.share)
  return top.share - next.share >= LEAD ? top.anchor : null
}
