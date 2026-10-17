// Chooses the demo launch (#29). Runs every resolved show of the sample network as a leave-one-out launch,
// plus a few three-comp launches, and compares each show's Qloo fit rank with a topic-only ranking that
// Claude makes from show names and descriptions alone. A show whose fit rank beats its topic rank by three
// or more places is a mover; compare's shared tags say why it moved.
//
// Everything it writes is Qloo data or derived from it, so it writes outside the repo, never into it.
// Usage: QLOO_API_KEY=... ANTHROPIC_API_KEY=... bun scripts/choose-demo-launch.ts [outDir]

import Anthropic from '@anthropic-ai/sdk'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const QLOO = 'https://hackathon.api.qloo.com'
const MODEL = 'claude-haiku-5-5'
const TOPIC_SAMPLES = 3
const MIN_MOVE = 3
const COMP_LAUNCHES = [
  {
    name: 'Unreleased film show',
    description: 'A new show about film history, filmmakers, and the movies worth revisiting.',
    comps: ['Blank Check with Griffin & David', 'Filmspotting', 'You Must Remember This']
  },
  {
    name: 'Unreleased music show',
    description: 'A new show about how hit songs are written and why they work.',
    comps: ['Song Exploder', 'Switched on Pop', 'Popcast']
  },
  {
    name: 'Unreleased football show',
    description: 'A new show about the NFL, its players, and the week in football.',
    comps: ['Pardon My Take', 'New Heights with Jason & Travis Kelce', 'The Herd with Colin Cowherd']
  }
]

const outDir = process.argv[2] ?? join(homedir(), '.cache/crossfeed/out/29')
const cacheDir = join(outDir, 'cache')
mkdirSync(cacheDir, { recursive: true })
const qlooKey = process.env.QLOO_API_KEY ?? ''
if (!qlooKey) throw new Error('QLOO_API_KEY is not set')
const anthropic = new Anthropic()

type Show = { name: string; description: string; id: string; genres: string[] }
type Launch = { name: string; description: string; comps?: string[]; anchors: Show[]; candidates: Show[] }

const network = JSON.parse(readFileSync(new URL('../apps/src/sample-network.json', import.meta.url), 'utf8')) as {
  shows: { name: string; description: { value: string } }[]
}

function limiter(size: number) {
  let active = 0
  const waiting: (() => void)[] = []
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active < size) active++
    else await new Promise<void>((resolve) => waiting.push(resolve))
    try {
      return await fn()
    } finally {
      const next = waiting.shift()
      if (next) next()
      else active--
    }
  }
}
const qlooSlot = limiter(3)
const claudeSlot = limiter(4)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
let qlooCalls = 0

// Disk-cached so reruns don't spend Qloo calls or re-sample the topic baseline.
function cached<T>(parts: unknown, fetcher: () => Promise<T>): Promise<T> {
  const file = join(cacheDir, createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24) + '.json')
  if (existsSync(file)) return Promise.resolve(JSON.parse(readFileSync(file, 'utf8')) as T)
  return fetcher().then((value) => {
    writeFileSync(file, JSON.stringify(value))
    return value
  })
}

function qloo(method: 'GET' | 'POST', path: string, params: Record<string, string | number | boolean>): Promise<any> {
  const sorted = Object.fromEntries(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)))
  return cached(['qloo', method, path, sorted], async () => {
    for (let attempt = 0; ; attempt++) {
      let status = 0
      let detail = ''
      try {
        const res = await qlooSlot(() => {
          qlooCalls++
          const query = method === 'GET' ? '?' + new URLSearchParams(sorted as Record<string, string>) : ''
          return fetch(QLOO + path + query, {
            method,
            headers: { 'X-Api-Key': qlooKey, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
            body: method === 'POST' ? JSON.stringify(sorted) : undefined,
            signal: AbortSignal.timeout(20_000)
          })
        })
        if (res.ok) return await res.json()
        status = res.status
        detail = await res.text()
      } catch (error) {
        detail = String(error)
      }
      const retryable = status === 0 || [429, 502, 503, 504].includes(status)
      if (!retryable || attempt === 2) throw new Error(`${method} ${path} failed (${status || 'timeout'}): ${detail}`)
      await sleep((attempt === 0 ? 1000 : 3000) + Math.random() * 500)
    }
  })
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

async function resolve(name: string) {
  const body = await qloo('GET', '/search', { query: name, types: 'urn:entity:podcast', take: 3 })
  const results: any[] = body.results ?? []
  const exact = results.find((r) => norm(r.name) === norm(name))
  const genres = (r: any): string[] =>
    (r.tags ?? []).filter((t: any) => t.type === 'urn:tag:genre:media' && t.name !== 'Podcasts').map((t: any) => t.name)
  const state = exact
    ? 'resolved'
    : results.some((r) => norm(r.name).startsWith(norm(name) + ' '))
      ? 'ambiguous'
      : 'missed'
  return {
    name,
    state,
    id: exact?.entity_id as string | undefined,
    genres: exact ? genres(exact) : [],
    seen: results.map((r) => r.name)
  }
}

async function fitRanking(launch: Launch) {
  const ids = new Set(launch.candidates.map((c) => c.id))
  const body = await qloo('POST', '/v2/insights', {
    'filter.type': 'urn:entity:podcast',
    'signal.interests.entities': launch.anchors.map((a) => a.id).join(','),
    'filter.results.entities': [...ids].join(','),
    'feature.explainability': true,
    take: 50
  })
  const entities: any[] = body.results?.entities ?? []
  const outside = entities.filter((e) => !ids.has(e.entity_id))
  if (outside.length)
    throw new Error(`${launch.name}: Qloo ranked shows outside the roster: ${outside.map((e) => e.name)}`)
  const affinity = new Map<string, number | null>(entities.map((e) => [e.entity_id, e.query?.affinity ?? null]))
  if (![...affinity.values()].some((a) => a !== null)) throw new Error(`${launch.name}: unscored signal`)
  const order = [...launch.candidates].sort((a, b) => (affinity.get(b.id) ?? -1) - (affinity.get(a.id) ?? -1))
  return order.map((c) => ({ name: c.name, affinity: affinity.get(c.id) ?? null }))
}

const TOPIC_SYSTEM =
  "You plan a podcast network's launch promos by topic alone. Rank the roster shows by how closely each one's topic matches the launch's topic, most similar first. Use only the show names and descriptions given. Include every roster show exactly once."

async function topicRanking(launch: Launch, sample: number): Promise<string[]> {
  const names = launch.candidates.map((c) => c.name)
  const comps = launch.comps ? ` (unreleased; comparable shows: ${launch.comps.join(', ')})` : ''
  const prompt = `Launch: ${launch.name}${comps}. ${launch.description}\n\nRank all ${names.length} roster shows:\n${launch.candidates.map((c) => `- ${c.name}: ${c.description}`).join('\n')}`
  const schema = {
    type: 'object',
    properties: { ranking: { type: 'array', items: { type: 'string', enum: names } } },
    required: ['ranking'],
    additionalProperties: false
  }
  return cached(['topic', MODEL, TOPIC_SYSTEM, prompt, sample], async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const message = await claudeSlot(() =>
        anthropic.messages.create({
          model: MODEL,
          max_tokens: 16_000,
          output_config: { effort: 'low', format: { type: 'json_schema', schema } },
          system: TOPIC_SYSTEM,
          messages: [{ role: 'user', content: prompt }]
        })
      )
      if (message.stop_reason === 'refusal' || message.stop_reason === 'max_tokens')
        throw new Error(`${launch.name}: topic ranking stopped with ${message.stop_reason}`)
      const text = message.content.find((b) => b.type === 'text')
      const ranking: string[] = text ? JSON.parse(text.text).ranking : []
      if (ranking.length === names.length && new Set(ranking).size === names.length) return ranking
      console.warn(`${launch.name}: topic sample ${sample} ranked ${ranking.length} of ${names.length} shows, retrying`)
    }
    throw new Error(`${launch.name}: no valid topic ranking in 3 attempts`)
  })
}

async function sharedTags(anchors: Show[], show: Show) {
  const body = await qloo('GET', '/v2/analysis/compare', {
    'a.signal.interests.entities': anchors.map((a) => a.id).join(','),
    'b.signal.interests.entities': show.id,
    take: 50
  })
  return ((body.results?.tags ?? []) as any[])
    .filter((t) => t.name !== 'Podcasts')
    .map((t) => `${t.name} (${t.tag_id.split(':')[2]})`)
}

async function runLaunch(launch: Launch) {
  const [fit, ...topics] = await Promise.all([
    fitRanking(launch),
    ...Array.from({ length: TOPIC_SAMPLES }, (_, i) => topicRanking(launch, i))
  ])
  const launchGenres = new Set(launch.anchors.flatMap((a) => a.genres))
  const rows = await Promise.all(
    fit.map(async ({ name, affinity }, i) => {
      const show = launch.candidates.find((c) => c.name === name)!
      const topicRanks = topics.map((t) => t.indexOf(name) + 1)
      const moves = topicRanks.map((t) => t - (i + 1))
      const minMove = affinity === null ? -Infinity : Math.min(...moves)
      const crossGenre = !show.genres.some((g) => launchGenres.has(g))
      const tags = minMove >= MIN_MOVE ? await sharedTags(launch.anchors, show) : undefined
      return { fitRank: i + 1, name, affinity, topicRanks, minMove, crossGenre, genres: show.genres, tags }
    })
  )
  return { launch: launch.name, comps: launch.comps, anchorGenres: [...launchGenres], rows }
}

// Roster and comps
const roster = await Promise.all(network.shows.map((s) => resolve(s.name)))
console.log('Roster resolution:')
for (const r of roster)
  console.log(`  ${r.state.padEnd(9)} ${r.name}${r.state === 'resolved' ? '' : `  (saw: ${r.seen.join(' | ')})`}`)
const resolved: Show[] = roster
  .filter((r) => r.state === 'resolved')
  .map((r) => ({
    name: r.name,
    id: r.id!,
    genres: r.genres,
    description: network.shows.find((s) => s.name === r.name)!.description.value
  }))
console.log(`  ${resolved.length} of ${roster.length} resolved\n`)

const launches: Launch[] = resolved.map((show) => ({
  name: show.name,
  description: show.description,
  anchors: [show],
  candidates: resolved.filter((c) => c !== show)
}))
for (const set of COMP_LAUNCHES) {
  const comps = await Promise.all(set.comps.map(resolve))
  const missing = comps.filter((c) => c.state !== 'resolved')
  if (missing.length) {
    console.log(
      `Skipping ${set.name}: ${missing.map((m) => `${m.name} ${m.state} (saw: ${m.seen.join(' | ')})`).join('; ')}`
    )
    continue
  }
  const anchors = comps.map((c) => ({ name: c.name, id: c.id!, genres: c.genres, description: '' }))
  launches.push({ ...set, anchors, candidates: resolved })
}

const results = []
for (const launch of launches) {
  try {
    results.push(await runLaunch(launch))
  } catch (error) {
    console.error(`FAILED ${launch.name}: ${error}`)
    results.push({ launch: launch.name, comps: launch.comps, error: String(error), rows: [] })
  }
}

// Report
const lines: string[] = ['# Demo launch candidates', '']
const shortlist: { key: number[]; text: string }[] = []
for (const r of results) {
  lines.push(`## ${r.launch}${r.comps ? ` (comps: ${r.comps.join(', ')})` : ''}`, '')
  if ('error' in r) {
    lines.push(`FAILED: ${r.error}`, '')
    continue
  }
  lines.push(
    `Launch genres: ${r.anchorGenres.join(', ') || 'none'}`,
    '',
    '| Fit | Show | Affinity | Topic ranks | Min move | Genres |',
    '| --- | --- | --- | --- | --- | --- |'
  )
  for (const row of r.rows)
    lines.push(
      `| ${row.fitRank} | ${row.name} | ${row.affinity?.toFixed(3) ?? 'unscored'} | ${row.topicRanks.join(', ')} | ${row.minMove} | ${row.genres.join(', ')}${row.crossGenre ? ' (cross-genre)' : ''} |`
    )
  lines.push('')
  for (const row of r.rows.filter((x) => x.tags)) {
    lines.push(
      `- Mover: ${row.name}, fit ${row.fitRank}, topic ${row.topicRanks.join('/')}, up ${row.minMove}+. Shared tags: ${row.tags!.join(', ') || 'none'}`
    )
    const key = [r.comps ? 1 : 0, row.fitRank <= 5 ? 0 : 1, row.crossGenre ? 0 : 1, -row.minMove]
    const where = `${r.comps ? 'comps' : 'released'} | fit ${row.fitRank} | ${row.crossGenre ? 'cross-genre' : 'same-genre'}`
    shortlist.push({
      key,
      text: `${where} | up ${row.minMove} | ${row.name} <- ${r.launch} | [${row.tags!.slice(0, 8).join(', ')}]`
    })
  }
  lines.push('')
}
shortlist.sort((a, b) => a.key.reduce((d, v, i) => d || v - b.key[i], 0))
lines.push('## Shortlist', '', ...shortlist.map((s) => `- ${s.text}`), '')
writeFileSync(join(outDir, 'report.md'), lines.join('\n'))
writeFileSync(join(outDir, 'run.json'), JSON.stringify({ roster, results }, null, 2))
console.log(`Shortlist (move of ${MIN_MOVE}+ in all ${TOPIC_SAMPLES} topic samples):`)
for (const s of shortlist) console.log('  ' + s.text)
console.log(`\n${qlooCalls} Qloo calls this run (cache hits not counted). Report: ${join(outDir, 'report.md')}`)
