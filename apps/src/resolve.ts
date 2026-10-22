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
    .map(({ id, name, popularity, disambiguation, description }) => ({
      id,
      name,
      popularity,
      disambiguation,
      description
    }))
  const own = type === 'book' ? named.filter((c) => byGuest(c.disambiguation, guest)) : []
  let pool: WorkCandidate[]
  if (own.length > 0) {
    const edition = year === null ? [] : own.filter((c) => fitsYear(c.disambiguation, year, 1))
    pool = withPopularity(edition.length > 0 ? edition : own)
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
  return dated ? withPopularity(dated) : named.filter((c) => years(c.disambiguation).length === 0)
}

// The results that have popularity, if any do.
function withPopularity(pool: WorkCandidate[]) {
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

// Each person a guest string names: "Jason and Travis Kelce" gives "Jason" and "Travis Kelce".
const people = (guest: string) => guest.split(/,|&|\band\b/)

// The last word of each guest's name: "Jason and Travis Kelce" gives jason and kelce.
const surnames = (guest: string) => people(guest).flatMap((name) => words(name).slice(-1))

// What keeps a work's title from being sent to Qloo, or null: only a title reaches Qloo, so one
// holding an email address, or the whole name of anyone in `names`, such as the guest or the
// sender ("Ada Quill <ada@example.com>"), is never sent. A name followed by "s", as in "Ada Quill's",
// still counts.
export function personalIn(title: string, names: (string | null)[]): 'email' | 'name' | null {
  if (holdsEmail(title)) return 'email'
  const found = ` ${words(title).join(' ')} `
  const named = names.flatMap((n) => (n ? wholeNames(n) : []))
  return named.some((n) => found.includes(` ${n} `) || found.includes(` ${n}s `)) ? 'name' : null
}

// Whether `text` holds what reads as an email address, as /\S+@\S+\.\S+/ finds one, in one pass rather
// than the pattern's backtracking: a run without spaces with something before an "@", and a "." after
// it with something on either side.
const holdsEmail = (text: string) =>
  text.split(/\s+/).some((run) => {
    const at = run.indexOf('@', 1)
    return at > 0 && run.lastIndexOf('.', run.length - 2) > at + 1
  })

// Words that come with a name without being it, as in "Dr. Ada Quill, PhD".
const notName = new Set([
  'dr',
  'mr',
  'mrs',
  'ms',
  'mx',
  'prof',
  'professor',
  'sir',
  'dame',
  'rev',
  'jr',
  'sr',
  'ii',
  'iii',
  'phd',
  'md'
])

// Each whole name a guest or sender string gives, two words or more: "Dr. Ada Quill" and "Quill, Ada"
// both give "ada quill", and "Jason and Travis Kelce" gives "jason kelce" and "travis kelce". A name
// left with one word, such as a first name alone, is dropped, so it never sets a title aside.
function wholeNames(given: string) {
  const text = given.replace(/<[^>]*>/g, '')
  const parts = text
    .split(/,|&|\band\b/i)
    .map((part) => words(part).filter((w) => !notName.has(w)))
    .filter((part) => part.length > 0)
  if (parts.length === 0) return []
  // A surname, a comma, then the given names, with no one else named.
  if (parts.length === 2 && parts[0].length === 1 && !/&|\band\b/i.test(text))
    return [[...parts[1], ...parts[0]].join(' ')]
  // A couple sharing the last-named person's surname.
  const last = parts.at(-1)!
  const shared = parts.length > 1 && last.length > 1 ? last.at(-1)! : null
  return parts.flatMap((part) => (part.length > 1 ? [part.join(' ')] : shared ? [[...part, shared].join(' ')] : []))
}

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
