import { DurableObject } from 'cloudflare:workers'
import type { CallEvidence } from './evidence'

export type QlooEntity = { id: string; name: string; type: string; popularity: number | null }

// What every gateway method returns. A failure comes back as a value, not a throw, so its
// evidence survives the RPC hop and the session can log it.
export type QlooResult<T> = { evidence: CallEvidence } & ({ ok: true; data: T } | { ok: false; error: string })

type Params = Record<string, string | number>

// The only code that calls Qloo: one global instance, reached over Durable Object RPC.
export class QlooGateway extends DurableObject<Env> {
  // Finds entities by name. Qloo's search is fuzzy, so deciding whether a result is the show is
  // the caller's job (see resolve.ts).
  async search(query: string, type: string, take = 3): Promise<QlooResult<QlooEntity[]>> {
    const result = await this.get('/search', { query, types: type, take })
    if (!result.ok) return result
    const raw = (result.data as { results?: SearchResult[] } | null)?.results ?? []
    const entities = raw.map((r) => ({
      id: r.entity_id,
      name: r.name,
      type: r.types?.[0] ?? type,
      popularity: r.popularity ?? null
    }))
    return { ok: true, data: entities, evidence: { ...result.evidence, entities } }
  }

  private async get(endpoint: string, params: Params): Promise<QlooResult<unknown>> {
    const url = new URL(endpoint, this.env.QLOO_BASE_URL)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
    const evidence: CallEvidence = {
      at: new Date().toISOString(),
      method: 'GET',
      endpoint,
      params,
      status: null,
      latencyMs: 0,
      retries: 0,
      cacheHit: false,
      error: null,
      entities: [],
      tags: [],
      affinities: []
    }
    const started = Date.now()
    try {
      const response = await fetch(url, { headers: { 'X-Api-Key': this.env.QLOO_API_KEY } })
      evidence.status = response.status
      const body = await response.text()
      evidence.latencyMs = Date.now() - started
      // Qloo documents 404 as "No results" for search; live it answers 200 with an empty list.
      if (response.status === 404) return { ok: true, data: null, evidence }
      if (!response.ok) return this.fail(evidence, `Qloo returned ${response.status}: ${errorMessage(body)}`)
      return { ok: true, data: JSON.parse(body), evidence }
    } catch (e) {
      evidence.latencyMs = Date.now() - started
      return this.fail(evidence, `Qloo request failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      const { endpoint: e, status, latencyMs, retries, cacheHit } = evidence
      console.log(JSON.stringify({ event: 'qloo_call', endpoint: e, status, latencyMs, retries, cacheHit }))
    }
  }

  private fail(evidence: CallEvidence, error: string): QlooResult<never> {
    evidence.error = error
    return { ok: false, error, evidence }
  }
}

type SearchResult = { entity_id: string; name: string; types?: string[]; popularity?: number }

// Qloo errors look like {"error": {"message": "..."}}, or {"error_msg": "..."} for a 429; else raw text.
function errorMessage(body: string) {
  try {
    const json = JSON.parse(body)
    return json?.error?.message ?? json?.error_msg ?? json?.message ?? body.slice(0, 200)
  } catch {
    return body.slice(0, 200)
  }
}
