// The demographic check as the chart shows it: the TRD's derived values, worked out from one Qloo
// demographics call covering the launch, or its comps, and the finalists. The values stay in the
// call's evidence; the chart gets each finalist's mismatches in words about its listeners.
import type { Ranking } from './fit'
import type { Demographics, Profile, QlooResult } from './gateway'

// The mismatch rule's thresholds: starting values, to tune on the demo network.
export const MISMATCH = {
  topAges: 2, // how many of the launch profile's most over-indexed age buckets each finalist is checked on
  under: 0, // a finalist below this on one of those buckets is flagged
  skew: 0.2 // an opposite gender skew is flagged when both the launch's and the finalist's are at least this
}

// Qloo's age buckets, youngest first.
export const AGE_BUCKETS = ['24_and_younger', '25_to_29', '30_to_34', '35_to_44', '45_to_54', '55_and_older']

export type Skew = 'male' | 'female'

export type DemographicCheck = {
  call: string // the demographics call's evidence
  error: string | null // why there's no check; then `profile` is null and `rows` is empty
  // The launch profile in words: the anchors it's the mean of, its most over-indexed age buckets,
  // youngest first, and its gender skew when that's strong enough to flag against.
  profile: { from: string[]; ages: string[]; skew: Skew | null } | null
  // Every finalist, in fit order. `reasons` is empty when its listeners don't differ from the
  // launch's, and null when Qloo returned no demographics for it.
  rows: { show: string; reasons: string[] | null }[]
}

// A finalist as the model gets it: the flag, and how far its listeners sit from the launch profile.
export type FinalistCheck = {
  show: string
  id: string
  mismatch: boolean
  reasons: string[]
  ageDeltas: Record<string, number> // finalist minus launch profile, per age bucket
  maleDelta: number // finalist minus launch profile, in skew towards male listeners
}

// Qloo's values carry float noise, such as 0.20600000000000004; three places is its own precision.
const round = (x: number) => Math.round(x * 1000) / 1000

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

export const ageWords = (bucket: string) => bucket.replaceAll('_', ' ')

const skewOf = (male: number): Skew | null => (Math.abs(male) < MISMATCH.skew ? null : male > 0 ? 'male' : 'female')

const listOf = (items: string[]) =>
  items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`

// Checks the ranking's finalists against the launch profile: the mean, per bucket, of the anchors
// Qloo returned demographics for. Only a bucket above 0 is over-indexed, so a launch can have fewer
// than MISMATCH.topAges of them.
export function checkFinalists(
  ranking: Ranking,
  call: string,
  result: QlooResult<Demographics>
): { check: DemographicCheck; finalists: FinalistCheck[] } {
  const failed = (error: string) => ({ check: { call, error, profile: null, rows: [] }, finalists: [] })
  if (!result.ok) return failed(result.error)
  const byId = new Map(result.data.profiles.map((p) => [p.id, p]))
  const anchors = ranking.anchors.filter((a) => byId.has(a.id))
  if (anchors.length === 0)
    return failed(`Qloo returned no demographics for ${listOf(ranking.anchors.map((a) => a.name))}`)
  const profiles = anchors.map((a) => byId.get(a.id)!)
  const launch: Profile = {
    id: 'launch',
    age: Object.fromEntries(AGE_BUCKETS.map((b) => [b, round(mean(profiles.map((p) => p.age[b] ?? 0)))])),
    male: round(mean(profiles.map((p) => p.male)))
  }
  const ages = AGE_BUCKETS.filter((b) => launch.age[b] > 0)
    .sort((a, b) => launch.age[b] - launch.age[a])
    .slice(0, MISMATCH.topAges)
    .sort((a, b) => AGE_BUCKETS.indexOf(a) - AGE_BUCKETS.indexOf(b))
  const skew = skewOf(launch.male)

  const finalists: FinalistCheck[] = []
  const rows = ranking.rows
    .filter((r) => r.finalist)
    .map((r) => {
      const p = byId.get(r.entity.id)
      if (!p) return { show: r.show, reasons: null }
      const under = ages.filter((b) => round(p.age[b] ?? 0) < MISMATCH.under)
      const theirs = skewOf(round(p.male))
      const reasons = [
        under.length > 0 &&
          `Fewer listeners aged ${listOf(under.map(ageWords))} than average, where the launch's listeners over-index`,
        skew && theirs && theirs !== skew && `Listeners skew ${theirs}, where the launch's skew ${skew}`
      ].filter((x): x is string => typeof x === 'string')
      finalists.push({
        show: r.show,
        id: r.entity.id,
        mismatch: reasons.length > 0,
        reasons,
        ageDeltas: Object.fromEntries(AGE_BUCKETS.map((b) => [b, round((p.age[b] ?? 0) - launch.age[b])])),
        maleDelta: round(p.male - launch.male)
      })
      return { show: r.show, reasons }
    })
  return {
    check: { call, error: null, profile: { from: anchors.map((a) => a.name), ages, skew }, rows },
    finalists
  }
}
