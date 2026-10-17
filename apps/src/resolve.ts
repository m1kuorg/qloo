import type { QlooEntity, QlooResult } from './gateway'
import type { Work, WorkCandidate, WorkMatch } from './inbox'

export type Candidate = { id: string; name: string; popularity: number | null }

export type Resolution<C extends Candidate = Candidate> =
  | { resolution: 'resolved'; entity: C; candidates: [] }
  | { resolution: 'ambiguous'; entity: null; candidates: C[] }
  | { resolution: 'missed'; entity: null; candidates: [] }

// Qloo's search is fuzzy and always returns its nearest names, so a name resolves only to a
// result with the same name. Results that extend the name, such as spin-off feeds, or several
// results with the same name make it ambiguous; anything else is a miss.
export function resolveName(name: string, results: QlooEntity[]): Resolution {
  const wanted = words(name)
  const candidates = results.slice(0, 3).map(({ id, name, popularity }) => ({ id, name, popularity }))
  const exact = candidates.filter((c) => words(c.name).join(' ') === wanted.join(' '))
  if (exact.length === 1) return { resolution: 'resolved', entity: exact[0], candidates: [] }
  const related = candidates.some((c) => {
    const found = words(c.name)
    return startsWith(found, wanted) || startsWith(wanted, found)
  })
  if (related) return { resolution: 'ambiguous', entity: null, candidates }
  return { resolution: 'missed', entity: null, candidates: [] }
}

// How a name's search resolved, citing the search's call number. A failed search is "failed", with
// Qloo's reason, so the name is never mistaken for a miss.
export type Lookup = (Resolution | { resolution: 'failed'; entity: null; candidates: [] }) & {
  evidence: string
  error: string | null
}

export function lookup(name: string, call: string, result: QlooResult<QlooEntity[]>): Lookup {
  if (!result.ok) return { resolution: 'failed', entity: null, candidates: [], evidence: call, error: result.error }
  return { ...resolveName(name, result.data), evidence: call, error: null }
}

// The entities a lookup offers the programmer to confirm: its one match, or its candidates.
export const offeredBy = (lookup: Lookup | null): Candidate[] =>
  lookup?.entity ? [lookup.entity] : (lookup?.candidates ?? [])

// A pitched work resolves to the one search result with its title. A book is the guest's own: a
// same-title book credited to someone else isn't it, and among the guest's, a year only tells
// editions apart. Other works are told apart by the year Claude gave, if any: the same year first,
// then a year either side (a TV show's run counts as a span), then results with no year. Among the
// guest's books or same-year results, one with no popularity has never been in insights and can't
// be ranked, so it gives way to one that has (#31); otherwise popularity decides nothing, since a
// recent work often has none. Several left make the work ambiguous; none, a miss. The guest's name
// is only compared here, in the session; it never reaches Qloo.
export function resolveWork(
  { title, type, year }: Work,
  guest: string,
  results: QlooEntity[]
): Resolution<WorkCandidate> {
  const named = results
    .filter((r) => sameTitle(r.name, title) || (type === 'podcast' && hostedBy(r.name, title, guest)))
    .map(({ id, name, popularity, disambiguation }) => ({ id, name, popularity, disambiguation }))
  const own = type === 'book' ? named.filter((c) => byGuest(c.disambiguation, guest)) : []
  let pool: WorkCandidate[]
  if (own.length > 0) {
    const edition = year === null ? [] : own.filter((c) => fitsYear(c.disambiguation, year, 1))
    pool = ranked(edition.length > 0 ? edition : own)
  } else {
    const open = type === 'book' ? named.filter((c) => !author(c.disambiguation)) : named
    pool = year === null ? open : byYear(open, year)
  }
  if (pool.length === 1) return { resolution: 'resolved', entity: pool[0], candidates: [] }
  if (pool.length > 1) return { resolution: 'ambiguous', entity: null, candidates: pool }
  return { resolution: 'missed', entity: null, candidates: [] }
}

function byYear(named: WorkCandidate[], year: number) {
  const near = (slack: number) => named.filter((c) => fitsYear(c.disambiguation, year, slack))
  const dated = [near(0), near(1)].find((p) => p.length > 0)
  return dated ? ranked(dated) : named.filter((c) => years(c.disambiguation).length === 0)
}

// The results that have popularity, if any do.
function ranked(pool: WorkCandidate[]) {
  const scored = pool.filter((c) => c.popularity !== null)
  return scored.length > 0 ? scored : pool
}

export function lookupWork(work: Work, guest: string, call: string, result: QlooResult<QlooEntity[]>): WorkMatch {
  if (!result.ok) return { resolution: 'failed', entity: null, candidates: [], evidence: call, error: result.error }
  return { ...resolveWork(work, guest, result.data), evidence: call, error: null }
}

// A book's author is what its disambiguation names besides the year, as in "2022, Quentin Tarantino".
const author = (disambiguation: string | null) =>
  (disambiguation ?? '').replace(/\b(1[89]|20)\d{2}\b/g, '').replace(/^[\s,]+|[\s,]+$/g, '')

// Whether a book's author is one of the guests, such as "Seth Rogen and Evan Goldberg", by surname.
function byGuest(disambiguation: string | null, guest: string) {
  const credited = words(author(disambiguation))
  return surnames(guest).some((surname) => credited.includes(surname))
}

// A podcast's name can add its hosts, as in "New Heights with Jason & Travis Kelce". That counts only
// when a host is one of the guests, so "Dinner with Friends" isn't "Dinner". A lone first name in
// the guest, like Jason's, counts as a surname too; the title has to match first.
function hostedBy(found: string, title: string, guest: string) {
  const name = words(found)
  const wanted = titleWords(title).full.split(' ')
  if (!startsWith(name, wanted) || name[wanted.length] !== 'with') return false
  const hosts = name.slice(wanted.length + 1)
  return surnames(guest).some((surname) => hosts.includes(surname))
}

// The last word of each guest's name: "Jason and Travis Kelce" gives jason and kelce.
const surnames = (guest: string) => guest.split(/,|&|\band\b/).flatMap((name) => words(name).slice(-1))

// Qloo's work names can drop or add a subtitle ("Wake Up Dead Man"), carry a series suffix ("Onyx
// Storm (The Empyrean, #3)"), or end in "Podcast" ("Scriptnotes Podcast"); none of those count
// against a match.
function sameTitle(found: string, title: string) {
  const [a, b] = [titleWords(found), titleWords(title)]
  return a.full === b.full || a.main === b.full || a.full === b.main
}

function titleWords(title: string) {
  const t = title.replace(/\s*\([^)]*#\d[^)]*\)\s*$/, '')
  const join = (s: string) => {
    const w = words(s)
    return (w.at(-1) === 'podcast' ? w.slice(0, -1) : w).join(' ')
  }
  return { full: join(t), main: join(t.split(':')[0]) }
}

// The years in a result's disambiguation, such as "2025", "2022, Quentin Tarantino", or a TV run
// "2006,2013".
const years = (disambiguation: string | null) => (disambiguation?.match(/\b(1[89]|20)\d{2}\b/g) ?? []).map(Number)

function fitsYear(disambiguation: string | null, year: number, slack: number) {
  const span = years(disambiguation)
  return span.length > 0 && year >= Math.min(...span) - slack && year <= Math.max(...span) + slack
}

// Whether two names name the same thing, ignoring case, accents, punctuation, and a leading "the".
export const sameName = (a: string, b: string) => words(a).join(' ') === words(b).join(' ')

// Lowercase words without accents, punctuation, or a leading "the"; "&" reads as "and".
function words(name: string) {
  const w = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
  return w[0] === 'the' ? w.slice(1) : w
}

const startsWith = (a: string[], prefix: string[]) => prefix.length > 0 && prefix.every((w, i) => a[i] === w)

// How the programmer tells candidates apart: name and popularity percentile, plus the Qloo ID only
// when two would otherwise read the same.
export function candidateLabels(candidates: Candidate[]) {
  const label = (c: Candidate) =>
    `${c.name}, ${c.popularity === null ? 'no popularity' : `popularity ${(c.popularity * 100).toFixed(1)}`}`
  return candidates.map((c) =>
    candidates.filter((o) => label(o) === label(c)).length > 1 ? `${label(c)} (${c.id})` : label(c)
  )
}
