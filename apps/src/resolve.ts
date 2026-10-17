import type { QlooEntity } from './gateway'

export type Candidate = { id: string; name: string; popularity: number | null }

export type Resolution =
  | { resolution: 'resolved'; entity: Candidate; candidates: [] }
  | { resolution: 'ambiguous'; entity: null; candidates: Candidate[] }
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
