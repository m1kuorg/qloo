// Checks the sample inbox against the live Qloo API (ticket #31):
// which /search `types` resolve each work type, how often recent books miss,
// and whether closed-list rankings across categories return scores.
// Usage: QLOO_API_KEY=... bun scripts/check-sample-inbox.ts [out-dir]
// Output is Qloo data: it goes to out-dir (default ~/.cache/crossfeed/out/31), never into the repo.
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { qlooType, workTypes, type WorkType } from '../apps/src/inbox'
import inbox from '../apps/src/sample-inbox.json'

const BASE = 'https://hackathon.api.qloo.com'
const KEY = process.env.QLOO_API_KEY ?? ''
if (!KEY) throw new Error('QLOO_API_KEY is not set')
const OUT = process.argv[2] ?? join(homedir(), '.cache/crossfeed/out/31')
mkdirSync(join(OUT, 'raw'), { recursive: true })

type Work = { title: string; type: string; year: number }

// At most 3 calls in flight; retry 429, 502-504, and timeouts twice, per the TRD's gateway rules.
let inFlight = 0
const waiting: (() => void)[] = []
async function qloo(label: string, path: string, body?: object) {
  while (inFlight >= 3) await new Promise<void>((r) => waiting.push(r))
  inFlight++
  try {
    for (let attempt = 0; ; attempt++) {
      let status = 0
      let json: any = null
      let error: string | undefined
      try {
        const res = await fetch(BASE + path, {
          method: body ? 'POST' : 'GET',
          headers: { 'X-Api-Key': KEY, 'Content-Type': 'application/json' },
          body: body && JSON.stringify(body),
          signal: AbortSignal.timeout(20_000)
        })
        status = res.status
        json = await res.json().catch(() => null)
      } catch (e) {
        status = 0 // timeout or network error
        error = e instanceof Error ? e.message : String(e)
      }
      if ([0, 429, 502, 503, 504].includes(status) && attempt < 2) {
        await Bun.sleep([1000, 3000][attempt] + Math.random() * 500)
        continue
      }
      writeFileSync(join(OUT, 'raw', `${label}.json`), JSON.stringify({ path, body, status, error, json }, null, 2))
      return { status, json, error }
    }
  } finally {
    inFlight--
    waiting.shift()?.()
  }
}

// Qloo names can add or drop a subtitle ("Wake Up Dead Man"), carry a series suffix
// ("Onyx Storm (The Empyrean, #3)"), or end in "Podcast" ("Scriptnotes Podcast").
const norm = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s*\([^)]*#\d+\)$/, '')
    .replace(/\s+podcast$/, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9: ]/g, '')
    .replace(/^the /, '')
    .trim()
const sameName = (result: string, title: string) => {
  const r = norm(result),
    t = norm(title)
  return r.replace(/:/g, '') === t.replace(/:/g, '') || r.startsWith(t + ':') || t.startsWith(r + ':')
}
const yearOf = (e: any): number | undefined => e.properties?.release_year ?? e.properties?.publication_year

// Returns the 1-based rank of the right entity among 5 results (name match, year within 1 when Qloo has one).
async function resolve(label: string, work: Work) {
  const q = `query=${encodeURIComponent(work.title)}&take=5`
  const { status, json, error } = await qloo(label, `/search?${q}&types=${qlooType[work.type as WorkType]}`)
  const results: any[] = json?.results ?? []
  const rank = results.findIndex((e) => {
    const y = yearOf(e)
    return sameName(e.name, work.title) && (y === undefined || Math.abs(y - work.year) <= 1)
  })
  const nameOnly = results.filter((e) => sameName(e.name, work.title)).map((e) => `${e.name} (${yearOf(e) ?? '?'})`)
  const hit = rank >= 0 ? results[rank] : undefined
  // On a miss, search without `types` to see where the work lives, if anywhere.
  let untyped: string[] = []
  if (!hit) {
    const u = await qloo(`${label}-untyped`, `/search?${q}`)
    untyped =
      u.status === 200
        ? u.json.results
            .filter((e: any) => sameName(e.name, work.title))
            .map((e: any) => `${e.name} (${e.types.join('/')}, ${yearOf(e) ?? '?'})`)
        : [`untyped search failed with status ${u.status}${u.error ? ` (${u.error})` : ''}`]
  }
  return {
    ...work,
    status,
    error,
    rank: rank + 1,
    id: hit?.entity_id as string | undefined,
    found: hit && `${hit.name} (${yearOf(hit) ?? '?'})`,
    top: results.slice(0, 3).map((e) => `${e.name} (${yearOf(e) ?? '?'})`),
    nameOnly,
    untyped
  }
}

async function rank(label: string, type: string, anchors: string[], candidates: { id?: string; title: string }[]) {
  const ids = candidates.flatMap((c) => (c.id ? [c.id] : []))
  const {
    status,
    json,
    error: failure
  } = await qloo(label, '/v2/insights', {
    'filter.type': type,
    'signal.interests.entities': anchors.join(','),
    'filter.results.entities': ids.join(','),
    'feature.explainability': true,
    take: 50
  })
  const entities: any[] = json?.results?.entities ?? []
  return {
    label,
    type,
    status,
    error: status === 200 ? undefined : (failure ?? JSON.stringify(json)?.slice(0, 300)),
    candidates: ids.length,
    returned: entities.length,
    scored: entities.filter((e) => typeof e.query?.affinity === 'number').length,
    // Candidates the ranking left out without saying so.
    dropped: candidates.filter((c) => c.id && !entities.some((e) => e.entity_id === c.id)).map((c) => c.title),
    outsideList: entities.filter((e) => !ids.includes(e.entity_id)).map((e) => e.name),
    withExplainability: entities.filter((e) => e.query?.explainability?.['signal.interests.entities']).length,
    ranked: entities.map((e) => `${e.name}: ${e.query?.affinity?.toFixed(3) ?? 'null'}`)
  }
}

const show = await resolve('show', { title: inbox.show.name, type: 'podcast', year: 2017 })
if (!show.id) throw new Error(`show did not resolve: ${JSON.stringify(show)}`)
const guests = await Promise.all(inbox.show.pastGuests.map((g, i) => resolve(`guest-${i + 1}`, g.work)))
const pitched = await Promise.all(
  inbox.pitches.flatMap((p) =>
    p.expected.work ? [resolve(p.id, p.expected.work as Work).then((r) => ({ pitch: p.id, ...r }))] : []
  )
)

const byType = workTypes.map((type) => {
  const rows = pitched.filter((r) => r.type === type)
  return {
    type,
    searchType: qlooType[type],
    works: rows.length,
    top1: rows.filter((r) => r.rank === 1).length,
    top3: rows.filter((r) => r.rank >= 1 && r.rank <= 3).length,
    top5: rows.filter((r) => r.rank >= 1).length,
    missed: rows
      .filter((r) => !r.id)
      .map(
        (r) =>
          `${r.title} (${r.year}); typed name matches: ${r.nameOnly.join('; ') || 'none'}; untyped: ${r.untyped.join('; ') || 'none'}`
      ),
    belowTop1: rows
      .filter((r) => r.rank > 1)
      .map((r) => `${r.title} (${r.year}) at rank ${r.rank}, after ${r.top.slice(0, r.rank - 1).join('; ')}`)
  }
})
const books = pitched.filter((r) => r.type === 'book')
const bookMisses = [2026, 2025, 0].map((year) => {
  const rows = books.filter((r) => (year ? r.year === year : r.year < 2025))
  return { published: year || 'before 2025', books: rows.length, missed: rows.filter((r) => !r.id).map((r) => r.title) }
})

const pastIds = guests.flatMap((g) => (g.id ? [g.id] : []))
const rankings = await Promise.all([
  // The ticket's check: the podcast alone as the anchor, books as candidates.
  rank('rank-book-show-only', 'urn:entity:book', [show.id], books),
  // The TRD's rank_pitches design: the show plus past guests' works as anchors, one call per work type.
  ...Object.entries(qlooType).map(([type, urn]) =>
    rank(
      `rank-${type}-show-and-guests`,
      urn,
      [show.id, ...pastIds],
      pitched.filter((r) => r.type === type)
    )
  )
])

// A failed search would otherwise read as a miss, so list every non-200 call.
const failed = [...guests, ...pitched]
  .filter((r) => r.status !== 200)
  .map((r) => `${r.title}: ${r.status}${r.error ? ` (${r.error})` : ''}`)
const summary = { checkedAt: new Date().toISOString(), failed, show, guests, byType, bookMisses, rankings, pitched }
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2))
console.log(
  JSON.stringify(
    {
      failed,
      show: show.found,
      guests: guests.map((g) => g.found ?? `MISSED ${g.title}`),
      byType,
      bookMisses,
      rankings
    },
    null,
    2
  )
)
console.log(`\nRaw responses and summary.json written to ${OUT}`)
