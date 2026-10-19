// The REST API under /api/v1, for programs: one network per path, reached with one of the network's
// API keys or a member's session. Its zod schemas are the one source of its request validation and of
// its OpenAPI 3.1 document at /api/v1/openapi.json. Each route is a thin adapter over the operations
// module, and every refusal answers `{ error: { code, message } }` with its code's status
// (refusal.ts). There's no approve route (ADR 0002).
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import type { Context, MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { accountsOn, fromAppPage, signedIn } from '../auth'
import { apiKeyFor, memberRole } from '../directory'
import {
  getNetwork,
  getRoster,
  getUsage,
  importRoster,
  searchComps,
  updateNetwork,
  updateShow,
  type Caller,
  type OperationContext
} from '../operations'
import { REFUSALS, Refusal, refusalCode, type RefusalCode } from '../refusal'
import { readRosterUpload, type Upload } from '../upload'

type ApiEnv = { Bindings: Env; Variables: { caller: Caller } }

// Answers a refusal as JSON, with its code's status.
const refuse = (c: Context, code: RefusalCode, message: string) => c.json({ error: { code, message } }, REFUSALS[code])

export const api = new OpenAPIHono<ApiEnv>({
  // A request that doesn't match its route's schema says which field, and why.
  defaultHook: (result, c) => {
    if (result.success) return
    const issue = result.error.issues[0]
    const where = issue?.path.length ? `${issue.path.join('.')}: ` : ''
    return refuse(c, 'invalid', `${where}${issue?.message ?? 'The request is invalid.'}`)
  }
})

api.use('/api/v1/*', accountsOn, async (c, next) => {
  await next()
  // Answers hold a network's data: no cache keeps them.
  c.header('Cache-Control', 'no-store')
})

api.onError((err, c) => {
  const code = refusalCode(err)
  if (code) {
    if (code === 'rate_limited') c.header('Retry-After', '60')
    return refuse(c, code, err.message)
  }
  // The JSON validator's own refusals: a body that isn't JSON, or isn't declared as JSON.
  if (err instanceof HTTPException && err.status === 400)
    return refuse(c, 'invalid', "The body isn't valid JSON. Send it as application/json.")
  if (err instanceof HTTPException && err.status === 415)
    return refuse(c, 'invalid', 'Send this body as application/json, with a matching Content-Type.')
  console.error(JSON.stringify({ event: 'api_error', path: c.req.path, error: String(err) }))
  return c.json(
    { error: { code: 'internal', message: 'Something went wrong in Crossfeed. Try again in a moment.' } },
    500
  )
})

const NOT_FOUND = "There's no such network, or this API key or member can't reach it."

// Who's asking, for every route under a network: one of its API keys, in `Authorization: Bearer`,
// or else a member's session cookie, which must come from one of the app's pages to write. A key
// reaches its own network alone; to it, as to anyone outside, every other network is the same 404.
const caller: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const network = c.req.param('networkId')!
  const authorization = c.req.header('Authorization')
  if (authorization !== undefined) {
    const secret = /^Bearer\s+(cf_live_\S+)\s*$/i.exec(authorization)?.[1]
    const key = secret ? await apiKeyFor(c.env.DB, secret) : null
    if (!key)
      throw new Refusal(
        'unauthorized',
        'This API key is unknown or was revoked. Send a key from the network\'s settings as "Authorization: Bearer cf_live_…".'
      )
    if (!(await c.env.API_LIMITER.limit({ key: key.id })).success)
      throw new Refusal(
        'rate_limited',
        'This API key made too many requests in the last minute. Wait a minute, then try again.'
      )
    if (key.networkId !== network) throw new Refusal('not_found', NOT_FOUND)
    c.set('caller', { keyId: key.id })
  } else {
    const member = await signedIn(c)
    if (!member)
      throw new Refusal(
        'unauthorized',
        'Send one of the network\'s API keys as "Authorization: Bearer cf_live_…", or sign in to Crossfeed.'
      )
    const role = await memberRole(c.env.DB, network, member.id)
    if (!role) throw new Refusal('not_found', NOT_FOUND)
    if (!fromAppPage(c))
      throw new Refusal(
        'forbidden',
        'A write signed in with a session must come from a Crossfeed page. Programs use an API key.'
      )
    c.set('caller', { member, role })
  }
  await next()
}
// Hono's `/*` matches the network's own path too.
api.use('/api/v1/networks/:networkId/*', caller)

// What an operation runs with, from a route under a network.
const context = (c: Context<ApiEnv>): OperationContext => ({
  env: c.env,
  network: c.req.param('networkId')!,
  caller: c.var.caller
})

// The documented answer to each refusal a route can give.
const ErrorBody = z
  .object({
    error: z.object({
      code: z.enum([...(Object.keys(REFUSALS) as RefusalCode[]), 'internal']),
      message: z.string().openapi({ description: 'What went wrong, and what to do about it, for a person to read.' })
    })
  })
  .openapi('Error', {
    example: { error: { code: 'not_found', message: NOT_FOUND } }
  })
const DESCRIBED: Partial<Record<number, string>> = {
  400: 'The request, or a value in it, is invalid (`invalid`).',
  401: 'No API key or session, or one that is unknown or revoked (`unauthorized`).',
  403: "The caller can't do this, such as a member's session changing what only an owner does, or writing without an `Origin` of one of Crossfeed's pages (`forbidden`).",
  404: 'No such resource, or one the caller cannot reach (`not_found`).',
  409: "The resource's state refuses this (`conflict`).",
  413: 'The upload is over the size limit (`too_large`).',
  422: "The upload can't be read (`unreadable`).",
  429: 'A daily cap (`limit`) or the per-minute rate limit (`rate_limited`) refuses this.'
}
const errors = (...statuses: (keyof typeof DESCRIBED & number)[]) =>
  Object.fromEntries(
    statuses.map((s) => [s, { description: DESCRIBED[s]!, content: { 'application/json': { schema: ErrorBody } } }])
  ) as Record<number, { description: string; content: { 'application/json': { schema: typeof ErrorBody } } }>

// A made-up network ID, for the document's examples.
const EXAMPLE_NETWORK = '0b6e8d2a-4c1f-4e8a-9d3b-2f5a7c9e1d40'

// Every route under a network takes its ID and answers these.
const NetworkParams = z.object({
  networkId: z.string().openapi({ description: "The network's ID, from its settings.", example: EXAMPLE_NETWORK })
})
const AUTH_ERRORS = [401, 404, 429] as const

const Network = z
  .object({
    id: z.string(),
    name: z.string(),
    cpm: z
      .number()
      .nullable()
      .openapi({ description: 'The CPM in dollars that prices every promo slot; null until set.' })
  })
  .openapi('Network', { example: { id: EXAMPLE_NETWORK, name: 'Night Shift Audio', cpm: 25 } })

api.openapi(
  createRoute({
    method: 'get',
    path: '/api/v1/networks/{networkId}',
    tags: ['Network'],
    summary: 'Read the network',
    request: { params: NetworkParams },
    responses: {
      200: { description: 'The network.', content: { 'application/json': { schema: Network } } },
      ...errors(...AUTH_ERRORS)
    }
  }),
  async (c) => c.json(await getNetwork(context(c)), 200)
)

api.openapi(
  createRoute({
    method: 'patch',
    path: '/api/v1/networks/{networkId}',
    tags: ['Network'],
    summary: 'Rename the network or set its CPM',
    description:
      "A field left out stays as it is. A member's session must be an owner's; an API key, which an owner made, may.",
    request: {
      params: NetworkParams,
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z
              .object({
                name: z.string().optional().openapi({ example: 'Night Shift Audio' }),
                cpm: z.number().optional().openapi({ description: 'Dollars, above 0.', example: 25 })
              })
              .openapi('NetworkChange')
          }
        }
      }
    },
    responses: {
      200: { description: 'The network as changed.', content: { 'application/json': { schema: Network } } },
      ...errors(400, 401, 403, 404, 429)
    }
  }),
  async (c) => c.json(await updateNetwork(context(c), c.req.valid('json')), 200)
)

const Count = z.object({ used: z.number().int(), limit: z.number().int() })
const Usage = z
  .object({
    qlooCalls: Count.openapi({ description: 'Qloo calls today, cache hits included.' }),
    modelRuns: Count.openapi({ description: 'Model runs started today: launch runs, inbox loads, and pitch runs.' }),
    resets: z.string().openapi({ description: 'When the counts reset: the next 00:00 UTC.' })
  })
  .openapi('Usage', {
    example: {
      qlooCalls: { used: 41, limit: 2000 },
      modelRuns: { used: 2, limit: 10 },
      resets: '2026-10-20T00:00:00.000Z'
    }
  })

api.openapi(
  createRoute({
    method: 'get',
    path: '/api/v1/networks/{networkId}/usage',
    tags: ['Network'],
    summary: "Read today's usage",
    description:
      "The network's Qloo calls and model runs today against its own daily caps, whichever member or key made them. Crossfeed's caps across all networks apply too.",
    request: { params: NetworkParams },
    responses: {
      200: { description: "Today's usage.", content: { 'application/json': { schema: Usage } } },
      ...errors(...AUTH_ERRORS)
    }
  }),
  async (c) => c.json(await getUsage(context(c)), 200)
)

// A Qloo entity a show matched, or could be.
const Candidate = z
  .object({ id: z.string(), name: z.string(), popularity: z.number().nullable() })
  .openapi('Candidate', { example: { id: 'p-0001', name: 'Deep Cuts', popularity: 0.5 } })

const CompSearch = z
  .object({
    query: z.string(),
    call: z.string().openapi({ description: "The search's call number in the network's evidence." }),
    status: z.enum(['pending', 'done', 'failed']),
    results: z.array(Candidate),
    error: z.string().nullable()
  })
  .openapi('CompSearch', {
    description: 'The latest search for a comparable show to stand in for one Qloo has no match for.'
  })

const RESOLUTIONS = ['pending', 'resolved', 'mapped', 'ambiguous', 'missed', 'failed'] as const
const Show = z
  .object({
    name: z.string(),
    resolution: z.enum(RESOLUTIONS).openapi({
      description:
        '`pending` until its search settles; `resolved` to its match, `mapped` to a comp, `ambiguous` among its candidates, `missed` when Qloo has no match, or `failed` with the error. Only resolved and mapped shows are scored.'
    }),
    entity: Candidate.nullable().openapi({ description: 'The matched Qloo entity, or the comp it was mapped to.' }),
    candidates: z.array(Candidate).openapi({ description: 'Up to three candidates for an ambiguous name.' }),
    evidence: z.string().openapi({ description: 'The call number of the search behind its resolution.' }),
    error: z.string().nullable(),
    compSearch: CompSearch.nullable(),
    downloads: z.number().int().nullable().openapi({ description: 'Downloads per episode.' }),
    status: z.string().nullable().openapi({ description: "The network's own word for it, such as `active`." }),
    description: z.string().nullable(),
    excluded: z.boolean().openapi({ description: 'Never proposed for a launch.' }),
    sample: z
      .array(z.enum(['downloads', 'status', 'description']))
      .optional()
      .openapi({ description: "The figures still the sample network's, on a roster started from it." })
  })
  .openapi('Show')

const EXAMPLE_SHOW = {
  name: 'Deep Cuts',
  resolution: 'resolved',
  entity: { id: 'p-0001', name: 'Deep Cuts', popularity: 0.5 },
  candidates: [],
  evidence: 'C-01',
  error: null,
  compSearch: null,
  downloads: 12000,
  status: 'active',
  description: null,
  excluded: false
} as const
const Roster = z
  .object({
    status: z.enum(['pending', 'settled']).openapi({
      description: '`pending` while any show or comp search is still being looked up in Qloo; poll until `settled`.'
    }),
    shows: z.array(Show),
    sample: z
      .object({ network: z.string(), notice: z.string() })
      .nullable()
      .openapi({ description: 'The sample network the roster started from, while any of its figures is sample.' })
  })
  .openapi('Roster', {
    example: {
      status: 'pending',
      shows: [
        EXAMPLE_SHOW,
        {
          ...EXAMPLE_SHOW,
          name: 'Field Notes',
          resolution: 'pending',
          entity: null,
          evidence: 'C-02',
          downloads: null
        }
      ],
      sample: null
    }
  })

api.openapi(
  createRoute({
    method: 'get',
    path: '/api/v1/networks/{networkId}/roster',
    tags: ['Roster'],
    summary: 'Read the roster',
    request: { params: NetworkParams },
    responses: {
      200: { description: 'The roster.', content: { 'application/json': { schema: Roster } } },
      ...errors(...AUTH_ERRORS)
    }
  }),
  async (c) => c.json(await getRoster(context(c)), 200)
)

// What a roster body's type says it is, as the upload module reads files by their extension.
const ROSTER_BODIES: Record<string, string> = { 'text/csv': 'roster.csv', 'text/plain': 'roster.txt' }

api.openapi(
  createRoute({
    method: 'post',
    path: '/api/v1/networks/{networkId}/roster',
    tags: ['Roster'],
    summary: 'Import a roster',
    description:
      'Send the roster file as the body: a CSV with a `name` column and optional `downloads`, `status`, and `description` columns, or plain text with one show name per line, at most 50 shows and 5 MB. It answers 202 at once with the new shows pending; poll the roster until it settles. Over a roster that has shows, it needs `replace=true`: shows already on it keep their matches, comps, and exclusions, the figures the file brings change, and only new shows are looked up.',
    request: {
      params: NetworkParams,
      query: z.object({
        replace: z
          .enum(['true', 'false'])
          .optional()
          .openapi({ description: 'Import over a roster that has shows.', example: 'true' })
      }),
      body: {
        required: true,
        content: {
          'text/csv': {
            schema: z.string().openapi({ example: 'name,downloads\nDeep Cuts,12000\nField Notes,8000\n' })
          },
          'text/plain': { schema: z.string().openapi({ example: 'Deep Cuts\nField Notes\n' }) }
        }
      }
    },
    responses: {
      202: {
        description: "The roster, with the import's shows pending.",
        content: { 'application/json': { schema: Roster } }
      },
      ...errors(400, 401, 403, 404, 409, 413, 422, 429)
    }
  }),
  async (c) => {
    const type = c.req.header('Content-Type')?.split(';')[0].trim().toLowerCase() ?? ''
    const name = ROSTER_BODIES[type]
    if (!name)
      throw new Refusal(
        'invalid',
        'Send the roster as text/csv, with a name column, or as text/plain, with one show name per line.'
      )
    // A body that says it's over the limit is refused before it's read.
    const length = Number(c.req.header('Content-Length'))
    const file: Upload = Number.isFinite(length)
      ? { name, size: length, text: () => c.req.text(), arrayBuffer: () => c.req.arrayBuffer() }
      : new File([await c.req.arrayBuffer()], name)
    const { text, format } = await readRosterUpload([file])
    const replace = c.req.valid('query').replace === 'true'
    return c.json(await importRoster(context(c), { text, format, replace }), 202)
  }
)

// A show on the roster, by its name as imported.
const ShowParams = NetworkParams.extend({
  name: z.string().openapi({ description: "The show's name as on the roster, URL-encoded.", example: 'Field Notes' })
})

api.openapi(
  createRoute({
    method: 'patch',
    path: '/api/v1/networks/{networkId}/roster/shows/{name}',
    tags: ['Roster'],
    summary: 'Settle or edit a show',
    description:
      "Pick one of an ambiguous show's candidates (`entityId`), map a show to one of its comp search's results (`compId`), or change its figures or exclusion. A field left out stays as it is.",
    request: {
      params: ShowParams,
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z
              .strictObject({
                entityId: z.string().optional().openapi({ description: 'One of its candidates.' }),
                compId: z.string().optional().openapi({ description: "One of its comp search's results." }),
                downloads: z
                  .number()
                  .int({ error: 'Downloads per episode must be a whole number, 0 or more.' })
                  .min(0, { error: 'Downloads per episode must be a whole number, 0 or more.' })
                  .nullable()
                  .optional(),
                status: z.string().nullable().optional(),
                excluded: z.boolean().optional()
              })
              .openapi('ShowChange', { example: { entityId: 'p-0101' } })
          }
        }
      }
    },
    responses: {
      200: { description: 'The show as changed.', content: { 'application/json': { schema: Show } } },
      ...errors(400, 401, 403, 404, 429)
    }
  }),
  async (c) => {
    const { name } = c.req.valid('param')
    return c.json(await updateShow(context(c), { name, patch: c.req.valid('json') }), 200)
  }
)

api.openapi(
  createRoute({
    method: 'post',
    path: '/api/v1/networks/{networkId}/roster/shows/{name}/comp-search',
    tags: ['Roster'],
    summary: 'Search for a comp',
    description:
      "Search Qloo for a comparable show to stand in for one it has no match for. It answers 202 with the show's comp search pending; poll the roster until it's done, then map the show to a result with `compId`.",
    request: {
      params: ShowParams,
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z.object({ query: z.string().openapi({ example: 'Paper Trail Weekly' }) }).openapi('CompQuery')
          }
        }
      }
    },
    responses: {
      202: {
        description: 'The show, with its comp search pending.',
        content: { 'application/json': { schema: Show } }
      },
      ...errors(400, 401, 403, 404, 409, 429)
    }
  }),
  async (c) => {
    const { name } = c.req.valid('param')
    return c.json(await searchComps(context(c), { name, query: c.req.valid('json').query }), 202)
  }
)

// The API's contract, generated from the routes' schemas.
api.doc31('/api/v1/openapi.json', (c) => ({
  openapi: '3.1.0',
  info: {
    title: 'Crossfeed API',
    version: '1',
    description:
      "Act for one network: its roster, launches, and inbox. Authenticate with one of the network's API keys, made by an owner in its settings, as `Authorization: Bearer cf_live_…`. Nothing here approves an insertion order or a reply: only a member does, in the app. Long work, such as an import, answers 202 with the resource's current status; poll the resource until it settles. Examples use made-up shows and figures."
  },
  servers: [{ url: new URL(c.req.url).origin }],
  // Either one: an API key, or a member's session.
  security: [{ apiKey: [] }, { session: [] }] as Record<string, string[]>[]
}))
api.openAPIRegistry.registerComponent('securitySchemes', 'apiKey', {
  type: 'http',
  scheme: 'bearer',
  description: "One of the network's API keys, `cf_live_…`."
})
api.openAPIRegistry.registerComponent('securitySchemes', 'session', {
  type: 'apiKey',
  in: 'cookie',
  name: '__Host-crossfeed_member',
  description: "A member's session in the app. A write must also carry an `Origin` of one of Crossfeed's pages."
})

// Anything else under /api/v1 is the API's own 404.
api.all('/api/v1/*', (c) => refuse(c, 'not_found', 'The API has no such route. See /api/v1/openapi.json.'))
