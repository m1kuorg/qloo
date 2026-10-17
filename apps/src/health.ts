// The daily health check the cron runs (TRD caching, caps, and replay), so the operator learns that
// the Qloo key has stopped working, or that the sample launch has gone cold, before a judge does.
// Each check logs one line naming it, at error level when it fails.
import type { QlooGateway } from './gateway'
import { resolveName } from './resolve'
import { sample, sampleRoster } from './sample'

const PODCAST = 'urn:entity:podcast'

export async function checkHealth(env: Env) {
  const gateway = env.QlooGateway.getByName('global')
  // The TRD's health-check call, past the cache, so it's Qloo answering today.
  const search = await gateway.search('The Rewatchables', PODCAST, 1, 'bypass')
  report('qloo_search', search.ok ? null : search.error)
  report('sample_ranking_cached', await sampleRankingUncached(gateway))
}

// Why a judge starting the sample launch wouldn't be answered from the cache, or null when they
// would. A new session ranks it with nothing settled (TRD demo data): the launch's match as the
// anchor, against every other sample show its search resolves, in roster order. Every answer here
// comes from the cache alone, so the check never warms the cache itself.
async function sampleRankingUncached(gateway: DurableObjectStub<QlooGateway>): Promise<string | null> {
  // The sample launch is a released show; one run from comps would rank against its comps instead.
  if (!('name' in sample.launch)) return 'The sample launch runs from comps, which this check does not rank'
  const launchName = sample.launch.name
  const names = [launchName, ...sampleRoster.map((s) => s.name)]
  // The same searches a session makes, at the gateway's default `take`.
  const searches = await Promise.all(names.map((name) => gateway.search(name, PODCAST, undefined, 'only')))
  const uncached = [...new Set(names.filter((_, i) => !searches[i].ok))]
  if (uncached.length > 0) return `The sample network's searches aren't cached for: ${uncached.join(', ')}`
  const [launch, ...shows] = searches.map((r, i) => resolveName(names[i], r.ok ? r.data : []))
  if (launch.resolution !== 'resolved')
    return `The sample launch, ${launchName}, doesn't resolve from its cached search`
  const candidates = shows.flatMap((s) =>
    s.resolution === 'resolved' && s.entity.id !== launch.entity.id ? [s.entity.id] : []
  )
  const ranking = await gateway.rank([launch.entity.id], candidates, PODCAST, 'only')
  if (ranking.ok) return null
  return `The sample launch's ranking (${launch.entity.name} against ${candidates.length} shows): ${ranking.error}`
}

// One line per check in Workers Logs: `ok`, or the reason it failed.
function report(check: 'qloo_search' | 'sample_ranking_cached', error: string | null) {
  if (error === null) console.log(JSON.stringify({ event: 'health_check', check, ok: true }))
  else console.error(JSON.stringify({ event: 'health_check', check, ok: false, error }))
}
