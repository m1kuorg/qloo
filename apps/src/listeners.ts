// The roster's listener profile: who each of a network's own shows reaches, by age band and gender, from
// one Qloo demographics call with every distinct entity the roster's shows are matched or mapped to as its
// signal. Qloo gives each entity's figures whatever else is asked (live-check.md), so one call covers the
// roster, and it leaves out an entity it has no demographics for. Each lean is relative to the average in
// Qloo, read by the demographic check's own rules (demographics.ts), and describes listeners, never people;
// the call's evidence keeps the figures as Qloo returned them.
import type { Show } from './agent'
import { AGE_BUCKETS, ageWords, demographic, MISMATCH, round, skewOf } from './demographics'
import type { Demographics } from './gateway'
import { entityKey, entityShows, rosterEntities, tooFew, type Entity } from './overlap'
import { listOf } from './text'

// One show's leans, each rounded to Qloo's three places: by age bucket, as AGE_BUCKETS names them, and
// toward male listeners, which is the negative of the lean toward female ones.
export type Lean = { age: Record<string, number>; male: number }

// One Qloo show's row in the profile: its leans, or null when Qloo has no listener profile for it.
export type ListenerRow = { entity: Entity; lean: Lean | null }

// The network's listener profile, in its synced state. Like the overlap, it never says who made it.
export type ListenerProfile = {
  // profiling: its call is out; profiled: its call answered; failed: the call failed, or a restart
  // interrupted it, as `error` says.
  status: 'profiling' | 'profiled' | 'failed'
  error: string | null
  key: string // the entities it was made from (entityKey), so it can tell when it's stale
  call: string | null // its demographics call in the network's evidence, once that has answered
  profiledAt: string | null // when it was made (ISO time); null until its call has landed
  rows: ListenerRow[] // one per entity it asked about that's still on the roster, in entity ID order
}

// Why a profile is refused while one runs, and what a profile a restart interrupted says.
export const LISTENERS_PROFILING = 'The listeners are already being profiled. Wait for it to finish.'
export const PROFILE_INTERRUPTED = 'The profile was interrupted. Profile the listeners again.'

// Why a roster of `n` distinct entities can't be profiled, and what it needs, as the overlap says it.
export const tooFewToProfile = (n: number) => tooFew(n, 'Profiling the listeners')

// What profiling the roster asks Qloo: one call with its distinct entities, sorted by ID as the overlap's
// are, so the gateway's cache key doesn't depend on roster order; or none, when those are the entities the
// latest profile answered for.
export function toProfile(roster: Show[], profile: ListenerProfile | undefined) {
  const entities = rosterEntities(roster)
  const key = entityKey(entities)
  return { entities, key, calls: profile?.key === key && profile.status === 'profiled' ? 0 : 1 }
}

// Each entity's row from Qloo's answer, in the order of `entities`: its leans, or none.
export function rowsOf(entities: Entity[], { profiles }: Demographics): ListenerRow[] {
  const byId = new Map(profiles.map((p) => [p.id, p]))
  return entities.map((entity) => {
    const p = byId.get(entity.id)
    const lean = p && {
      age: Object.fromEntries(AGE_BUCKETS.map((b) => [b, round(p.age[b] ?? 0)])),
      male: round(p.male)
    }
    return { entity, lean: lean ?? null }
  })
}

// What a show's leans count for, by the demographic check's rules: the age bands it leans toward, those
// above 0, youngest first; and the gender it leans toward, once that lean reaches the check's skew threshold.
export const counted = ({ age, male }: Lean) => ({ ages: AGE_BUCKETS.filter((b) => age[b] > 0), skew: skewOf(male) })

// What the profile has for a show: its leans (profiled), none from Qloo (missing), its call still out
// (profiling), or nothing, as for a show the latest profile didn't ask or one that failed (unprofiled).
export type ListenerStatus = 'unprofiled' | 'profiling' | 'profiled' | 'missing'

// The roster's matched shows as the profile reads them, in roster order: each Qloo show once, with its
// shows on the roster, its first naming it (entityShows), and what the profile has for it. A row the
// profile kept for a show that has left the roster isn't among them. The Listeners tab and programs read
// the profile through this, so the two always agree.
export function rosterRows(roster: Show[], profile: ListenerProfile | undefined) {
  const rows = new Map(profile?.rows.map((r) => [r.entity.id, r]))
  const asked = new Set(profile?.key.split(','))
  return [...entityShows(roster).values()].map(({ entity, shows }) => {
    const row = rows.get(entity.id)
    const status: ListenerStatus = row
      ? row.lean
        ? 'profiled'
        : 'missing'
      : profile?.status === 'profiling' && asked.has(entity.id)
        ? 'profiling'
        : 'unprofiled'
    return { entity, shows, status, lean: row?.lean ?? null }
  })
}

// A row the finding reads: what the profile has for a show, in roster order.
type Answered = { status: ListenerStatus; lean: Lean | null }

// What the profile finds over the rows its call answered, profiled or missing: the age bands and the
// gender that most of the shows Qloo has a profile for lean toward, as the demographic check takes most
// (MISMATCH.most), and, in roster order, the rows of the shows that lean differently, toward none of those
// bands or toward the other gender.
export function listenerShape<R extends Answered>(rows: R[]) {
  const answered = rows.filter((r) => r.status === 'profiled' || r.status === 'missing')
  const profiled = answered.flatMap((r) => (r.lean ? [{ row: r, ...counted(r.lean) }] : []))
  const most = (n: number) => n > profiled.length * MISMATCH.most
  const ages = AGE_BUCKETS.filter((b) => most(profiled.filter((p) => p.ages.includes(b)).length))
  const skew = (['male', 'female'] as const).find((s) => most(profiled.filter((p) => p.skew === s).length)) ?? null
  const apart = profiled
    .filter((p) => (ages.length > 0 && !ages.some((b) => p.ages.includes(b))) || (skew && p.skew && p.skew !== skew))
    .map((p) => p.row)
  return { answered: answered.length, profiled: profiled.map((p) => p.row), ages, skew, apart }
}

// The most shows the finding names as leaning differently; the rest it counts, and their rows say it.
export const NAMED_APART = 3

// The profile's finding in one sentence, over the rows its call answered (listenerShape), each show named by
// `name`: the age bands and the gender most of the shows Qloo has a profile for lean toward, and up to
// NAMED_APART of the shows that lean differently, in roster order, with how many more. Two shows lean
// "both", and one alone is named.
export function listenerFinding<R extends Answered>(rows: R[], name: (row: R) => string) {
  const { answered, profiled, ages, skew, apart } = listenerShape(rows)
  const aged = ages.length > 0 && `listeners aged ${listOf(ages.map(ageWords))}`
  if (profiled.length === 0) return 'Qloo has no listener profile for any of these shows.'
  if (profiled.length === 1) {
    const leans = [aged && `leans toward ${aged}`, skew && `leans ${skew}`].filter(Boolean)
    return `Qloo has a listener profile for ${name(profiled[0])} alone, which ${leans.length ? leans.join(' and ') : 'leans toward no age band or gender'}.`
  }
  const both = profiled.length === 2
  const partial = profiled.length < answered ? ' Qloo has a profile for' : ''
  const shows = both ? `both shows${partial}` : `most of the ${profiled.length} shows${partial}`
  if (!aged && !skew) return `No age band or gender is a lean ${shows} share.`
  const subject = shows[0].toUpperCase() + shows.slice(1)
  const which = both ? 'both' : 'most'
  const leans = [aged && `lean toward ${aged}`, skew && `${aged ? `${which} ` : ''}lean ${skew}`]
    .filter(Boolean)
    .join(', and ')
  // Two shows can't lean differently: whatever both lean toward, each does.
  if (both) return `${subject} ${leans}.`
  const named = apart.slice(0, NAMED_APART).map(name)
  const more = apart.length - named.length
  const differ = apart.length
    ? `${listOf([...named, ...(more > 0 ? [`${more} more`] : [])])} ${apart.length === 1 ? 'leans' : 'lean'} differently`
    : 'none leans differently'
  return `${subject} ${leans}; ${differ}.`
}

// One show's leans in words, with their figures, as the MCP server gives them: the age bands it leans
// toward, then its gender lean, or that it's too slight to count.
export function leanWords(lean: Lean) {
  const { ages, skew } = counted(lean)
  const aged = ages.length
    ? `leans toward listeners aged ${listOf(ages.map((b) => `${ageWords(b)} (${demographic(lean.age[b])})`))}`
    : 'leans toward no age band'
  const gender = skew
    ? `its listeners lean ${skew} (${demographic(lean.male)})`
    : `its gender lean, ${demographic(lean.male)}, is too slight to count`
  return `${aged}; ${gender}`
}
