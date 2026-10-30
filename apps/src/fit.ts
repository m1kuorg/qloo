// The fit ranking as the chart shows it: the TRD's derived values, worked out from one Qloo
// closed-list ranking of the roster, and the pitch lists, one per work type. Raw affinities stay in
// the evidence; the charts get ranks.
import type { Show } from './agent'
import type { Affinity, QlooResult, Ranked } from './gateway'
import type { Booking, Pitch, Work, WorkCandidate, WorkMatch, WorkType } from './inbox'
import type { Candidate } from './resolve'
import { listOf } from './text'

export type Anchor = { id: string; name: string }

// Top, middle, or bottom third by rank within one ranking.
export type Band = 'top' | 'middle' | 'bottom'

// Fit bands as the charts word them: a meter of three bars filled from the left, then the word.
export const bandMeter: Record<Band, { bars: number; word: string }> = {
  top: { bars: 3, word: 'Strong' },
  middle: { bars: 2, word: 'Good' },
  bottom: { bars: 1, word: 'Fair' }
}

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

// Whether Qloo returned shared tags to build an angle from. A finalist's host-read angle and a top
// pitch's episode angle are drafted only from them, so one without any has no angle (#216).
export const tagged = (shared: SharedTags | null | undefined) => (shared?.tags.length ?? 0) > 0

// Why a finalist or top pitch has no angle, as every surface says it: its compare found no shared
// tags, or failed.
export const NO_ANGLE = 'No angle: Qloo returned no shared tags.'

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
  sharedTags?: SharedTags // a top pitch's tags in common with the show, once shared_tags has run
  // Once the pitch ranking is in (pitch-ranking.ts): its rank by what it says among this list's rows,
  // and that minus its work's listener rank, so a pitch who listens lifts climbs.
  pitchRank?: number
  move?: number
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

export const FINALISTS = 5
// Places a show must climb over its topic rank, or a pitch over its pitch rank, to be highlighted.
export const CLIMB = 3
const LEAD = 0.05 // how far the top anchor's share must beat the next one's to name it

// A show matched in Qloo, directly or through a comp, whether or not it's left out of launches.
export const matched = (show: Show): show is Show & { entity: Candidate } =>
  (show.resolution === 'resolved' || show.resolution === 'mapped') && show.entity !== null

// A show the ranking can score: matched in Qloo, directly or through a comp, and not left out.
export const scorable = (show: Show): show is Show & { entity: Candidate } => matched(show) && !show.excluded

// Why the roster state keeps a show from being scored, or null when it can be. The chart's Not
// scored list and the run's first message both give these reasons, so they never disagree.
export function notScorable(show: Show): string | null {
  if (show.excluded) return 'Excluded: never proposed for a launch'
  if (show.resolution === 'pending') return 'Still being looked up in Qloo'
  if (show.resolution === 'ambiguous') return 'Ambiguous in Qloo search: pick its match in the roster'
  if (show.resolution === 'missed') return 'Not in Qloo: map a comp or leave it out'
  if (show.resolution === 'failed') return `Its Qloo lookup failed: ${show.error}`
  return null
}

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
    const unscorable = notScorable(s)
    if (unscorable) return unscorable
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

// The band of the `i`th of `n` ranked results, from 0: the third of the ranking it falls in.
const bands: Band[] = ['top', 'middle', 'bottom']
export const band = (i: number, n: number) => bands[Math.floor((i * 3) / n)]

// A ranking's scored candidates, best first: those Qloo gave an affinity, highest first, ties in the
// order Qloo returned them. The gateway ranks every closed list so, and the roster's overlap reads an
// anchor's whole ranking back from its call's evidence so (overlap.ts), so the two never disagree.
export const scoredOf = (affinities: Affinity[]): Ranked['scored'] =>
  affinities.filter((a): a is Ranked['scored'][number] => a.affinity !== null).sort((a, b) => b.affinity - a.affinity)

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

// The ranking's finalists, in fit order: the one place they're read from.
export const finalistsOf = (ranking: Ranking | null) => ranking?.rows.filter((r) => r.finalist) ?? []

// The anchor whose explainability share beats the next one's by LEAD or more on this result. An
// anchor a result doesn't list contributed nothing to it. The evidence's affinities say it too.
export function leadingComp(anchors: Anchor[], shares: { id: string; score: number }[]): Anchor | null {
  if (anchors.length < 2) return null
  const [top, next] = anchors
    .map((anchor) => ({ anchor, share: shares.find((s) => s.id === anchor.id)?.score ?? 0 }))
    .sort((a, b) => b.share - a.share)
  return top.share - next.share >= LEAD ? top.anchor : null
}

// The booking with each list row's pitch rank and move, worked out from the lists and the pitch ranking
// (pitch-ranking.ts), whichever arrived last. A pitch rank counts only its list's rows, so both ranks are
// over the same pitches. A row's listener rank is its work's, the rank of the work's first row, so
// pitches of one work share it and never move apart on a tie. The move is pitch rank minus listener
// rank, so a climb is positive.
export function withPitchMoves<B extends Pick<Booking, 'lists' | 'pitchRanking'>>(booking: B): B {
  const { lists, pitchRanking } = booking
  if (!lists || pitchRanking?.status !== 'ranked') return booking
  return {
    ...booking,
    lists: lists.map((list) => {
      const listed = new Set(list.rows.map((r) => r.pitch))
      const order = pitchRanking.order.filter((id) => listed.has(id))
      const workRank = (r: PitchRow) => list.rows.find((w) => w.entity.id === r.entity.id)!.rank
      return {
        ...list,
        rows: list.rows.map((r) => {
          const pitchRank = order.indexOf(r.pitch) + 1
          return pitchRank === 0 ? r : { ...r, pitchRank, move: pitchRank - workRank(r) }
        })
      }
    })
  }
}

// A list's finding once its pitch ranks are in: how many pitches climb by who listens, led by the
// highest-placed, then the pitches that read most on-topic, the top band by pitch rank, but whose work
// falls out of the top band by who listens, judged by its first row as its move is. Each pitch is named by
// its work, as the list names it. A list too short for a climb says nothing of climbs, and one with
// nothing to say has no finding.
export function pitchFinding(rows: PitchRow[]): string | null {
  const ranked = rows.filter((r) => r.pitchRank !== undefined)
  const workBand = (r: PitchRow) => rows.find((w) => w.entity.id === r.entity.id)!.band
  const [top, ...more] = ranked.filter((r) => r.move! >= CLIMB)
  const others = more.length
    ? `, and ${more.length} more ${more.length === 1 ? 'pitch climbs' : 'pitches climb'} ${CLIMB} or more`
    : ''
  const climbs =
    ranked.length <= CLIMB
      ? null
      : top
        ? `${top.entity.name} climbs ${top.move} places from its pitch rank by who listens${others}.`
        : `No pitch climbs ${CLIMB} or more places from its pitch rank by who listens.`
  const onTopic = [
    ...new Set(
      ranked
        .filter((r) => band(r.pitchRank! - 1, ranked.length) === 'top' && workBand(r) !== 'top')
        .toSorted((a, b) => a.pitchRank! - b.pitchRank!)
        .map((r) => r.entity.name)
    )
  ]
  const one = onTopic.length === 1
  const falls =
    onTopic.length > 0 &&
    `${listOf(onTopic)} ${one ? 'reads' : 'read'} most on-topic but ${one ? 'falls' : 'fall'} out of the top band by who listens.`
  return [climbs, falls].filter(Boolean).join(' ') || null
}
