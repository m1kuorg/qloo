// The one test seam: outbound HTTP. MSW intercepts fetch inside the Workers runtime, where the
// Worker and its Durable Objects share the tests' isolate, so the fakes below see every request
// the gateway makes. Fixtures are hand-written with made-up IDs and scores, never Qloo data.
import { setupNetwork } from '@msw/cloudflare'
import { env } from 'cloudflare:workers'
import { http, HttpResponse } from 'msw'

export const network = setupNetwork()

export type RecordedRequest = { method: string; url: URL; headers: Headers; body: string }

// Every request a fake served, in order. Cleared after each test by setup.ts.
export const requests: RecordedRequest[] = []

// Typed structurally, because MSW's DOM Request and the Workers Request types differ.
const record = async (request: {
  method: string
  url: string
  headers: Headers
  clone(): { text(): Promise<string> }
}) =>
  requests.push({
    method: request.method,
    url: new URL(request.url),
    headers: request.headers,
    body: await request.clone().text()
  })

// `properties` stands in for the fields Qloo returns that the app doesn't use.
export type QlooEntity = {
  entity_id: string
  name: string
  popularity: number
  types?: string[]
  properties?: Record<string, unknown>
}

// A response with a raw text body, such as an HTML error page from a proxy in front of Qloo.
export type RawResponse = { status: number; body: string }

// Serves `/search` from `search`, keyed by the exact query string. A number answers with that
// HTTP status and an error body in Qloo's shape, a `RawResponse` answers as written, and a query
// with no fixture finds nothing.
export function fakeQloo({ search }: { search: Record<string, QlooEntity[] | number | RawResponse> }) {
  network.use(
    http.get(`${env.QLOO_BASE_URL}/search`, async ({ request }) => {
      await record(request)
      const url = new URL(request.url)
      const take = Number(url.searchParams.get('take') ?? 20)
      const results = search[url.searchParams.get('query') ?? '']
      if (!results) return HttpResponse.json({ results: [] })
      if (typeof results === 'number')
        return HttpResponse.json({ error: { message: 'fake failure', code: results } }, { status: results })
      if (!Array.isArray(results)) return HttpResponse.text(results.body, { status: results.status })
      const types = [url.searchParams.get('types') ?? 'urn:entity:podcast']
      return HttpResponse.json({ results: results.slice(0, take).map((r) => ({ types, ...r })) })
    })
  )
}
