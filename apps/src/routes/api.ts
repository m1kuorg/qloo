// The REST API under /api/v1, for programs: one network per path, reached with one of the network's
// API keys or a member's session. Its zod schemas are the one source of its request validation and of
// its OpenAPI 3.1 document at /api/v1/openapi.json. Each route is a thin adapter over the operations
// module, and every refusal answers `{ error: { code, message } }` with its code's status
// (refusal.ts). There's no approve route (ADR 0002).
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import type { Context, MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { HTTPException } from 'hono/http-exception'
import { accountsOn, fromAppPage, keyFor, signedIn } from '../auth'
import { memberRole } from '../directory'
import { workTypes, type PitchInput } from '../inbox'
import { MAX_ANGLE, MAX_ANSWER, MAX_PAST_GUESTS, MAX_TITLE } from '../limits'
import {
  answerLaunchRun,
  answerPitchRun,
  confirmWork,
  createLaunch,
  deleteLaunch,
  discardReply,
  editOrder,
  editReply,
  exportOrder,
  getInbox,
  getLaunch,
  getLaunchEvidence,
  getLaunchRun,
  getNetwork,
  getPitchRun,
  listPitchRuns,
  getRoster,
  getUsage,
  importRoster,
  listLaunches,
  loadInbox,
  searchComps,
  startLaunchRun,
  startPitchRun,
  updateNetwork,
  updateShow,
  type Caller,
  type OperationContext
} from '../operations'
import { csvDownload } from '../order'
import { REFUSALS, Refusal, refusalCode, type RefusalCode } from '../refusal'
import { MAX_UPLOAD_BYTES, megabytes, readPitchUpload, readRosterUpload, tooBig, type Upload } from '../upload'

type ApiEnv = { Bindings: Env; Variables: { caller: Caller } }

// Answers a refusal as JSON, with its code's status.
const refuse = (c: Context, code: RefusalCode, message: string) => c.json({ error: { code, message } }, REFUSALS[code])

// Which field of a request doesn't match its schema, and why.
const invalidField = (error: z.ZodError) => {
  const issue = error.issues[0]
  const where = issue?.path.length ? `${issue.path.join('.')}: ` : ''
  return `${where}${issue?.message ?? 'The request is invalid.'}`
}

export const api = new OpenAPIHono<ApiEnv>({
  // A request that doesn't match its route's schema says which field, and why.
  defaultHook: (result, c) => {
    if (!result.success) return refuse(c, 'invalid', invalidField(result.error))
  }
})

api.use('/api/v1/*', accountsOn, async (c, next) => {
  await next()
  // Answers hold a network's data: no cache keeps them.
  c.header('Cache-Control', 'no-store')
})

// Answers an error that's a refusal with its code's status, and how long to wait when rate limited;
// null for any other error. The MCP server answers its key check's refusals with it too.
export function refusal(c: Context, err: unknown) {
  const code = refusalCode(err)
  if (!code) return null
  if (code === 'rate_limited') c.header('Retry-After', '60')
  return refuse(c, code, (err as Error).message)
}

api.onError((err, c) => {
  const refused = refusal(c, err)
  if (refused) return refused
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

// A body to the API or the MCP server holds at most an upload, and room for a JSON envelope around
// one: past it, as its Content-Length says or as it streams in with none, it's refused before it's
// read further. An upload a little over the limit is refused by the upload module, naming its file.
export const uploadLimit = bodyLimit({
  maxSize: MAX_UPLOAD_BYTES + 64 * 1024,
  onError: (c) =>
    refuse(c, 'too_large', `This request is over the ${megabytes(MAX_UPLOAD_BYTES, 0)} limit for an upload.`)
})

// Who's asking, for every route under a network: one of its API keys, in `Authorization: Bearer`,
// or else a member's session cookie, which must come from one of the app's pages to write. A key
// reaches its own network alone; to it, as to anyone outside, every other network is the same 404.
const caller: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const network = c.req.param('networkId')!
  const authorization = c.req.header('Authorization')
  if (authorization !== undefined) {
    const key = await keyFor(c.env, authorization)
    if (key.networkId !== network) throw new Refusal('not_found', NOT_FOUND)
    c.set('caller', { keyId: key.id, keyName: key.name })
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
// The inbox and its pitch runs exist only while guest pitches are on, as in the app. The document
// describes them either way, so the contract doesn't change with the deployment's switch.
const guestPitches: MiddlewareHandler<ApiEnv> = async (c, next) => {
  if (c.env.GUEST_PITCHES !== 'on') throw new Refusal('not_found', "Guest pitches aren't switched on.")
  await next()
}
// Hono's `/*` matches the path itself too.
for (const path of ['inbox', 'pitch-runs']) api.use(`/api/v1/networks/:networkId/${path}/*`, guestPitches)
api.use('/api/v1/networks/:networkId/*', caller)
api.use('/api/v1/*', uploadLimit)

// What an operation runs with, from a route under a network.
const context = (c: Context<ApiEnv>): OperationContext => ({
  env: c.env,
  network: c.req.param('networkId')!,
  caller: c.var.caller
})

// One of the document's named schemas, or null. `.nullable()` on a named schema would make the
// schema itself nullable in the document, and so every other use of it, such as a run a read
// answers with, in the types generated from it.
const orNull = <T extends z.ZodType>(schema: T) => z.union([schema, z.null()])

// Text of at most `max` characters (limits.ts), refused past it before anything reads it.
const capped = (max: number) => z.string().max(max, { error: `Use at most ${max.toLocaleString('en-US')} characters.` })

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
  429: 'A cap (`limit`), such as a daily cap or the launches a network keeps, or the per-minute rate limit (`rate_limited`) refuses this.'
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
    entity: orNull(Candidate).openapi({ description: 'The matched Qloo entity, or the comp it was mapped to.' }),
    candidates: z.array(Candidate).openapi({ description: 'Up to three candidates for an ambiguous name.' }),
    evidence: z.string().openapi({ description: 'The call number of the search behind its resolution.' }),
    error: z.string().nullable(),
    compSearch: orNull(CompSearch),
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

// A request body's media type, lowercased, without its parameters.
const mediaType = (c: Context) => c.req.header('Content-Type')?.split(';')[0].trim().toLowerCase() ?? ''

// The request's body as the upload module reads a file named `name`, sized from Content-Length, so a
// body that says it's over the limit is refused before it's read.
const bodyFile = async (c: Context, name: string): Promise<Upload> => {
  const length = Number(c.req.header('Content-Length'))
  return Number.isFinite(length)
    ? { name, size: length, text: () => c.req.text(), arrayBuffer: () => c.req.arrayBuffer() }
    : new File([await c.req.arrayBuffer()], name)
}

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
    const name = ROSTER_BODIES[mediaType(c)]
    if (!name)
      throw new Refusal(
        'invalid',
        'Send the roster as text/csv, with a name column, or as text/plain, with one show name per line.'
      )
    const { text, format } = await readRosterUpload([await bodyFile(c, name)])
    const replace = c.req.valid('query').replace === 'true'
    return c.json(await importRoster(context(c), { text, format, replace }), 202)
  }
)

// A show on the roster, by its name as imported.
const ShowParams = NetworkParams.extend({
  name: z.string().openapi({ description: "The show's name as on the roster, URL-encoded.", example: 'Field Notes' })
})

// How a show is settled or edited.
export const ShowChange = z
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
        content: { 'application/json': { schema: ShowChange } }
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

export const CompQuery = z
  .object({ query: capped(MAX_TITLE).openapi({ example: 'Paper Trail Weekly' }) })
  .openapi('CompQuery')

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
        content: { 'application/json': { schema: CompQuery } }
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

// What a ranking ranked against, such as a launch or a show, and a row's third of its ranking.
const Anchor = z.object({ id: z.string(), name: z.string() })
const Band = z.enum(['top', 'middle', 'bottom'])

const Work = z
  .object({ title: z.string(), type: z.enum(workTypes), year: z.number().int().nullable() })
  .openapi('Work', { description: "A guest's public work. Only its title and type reach Qloo." })

const WorkCandidate = z
  .object({
    id: z.string(),
    name: z.string(),
    popularity: z.number().nullable(),
    disambiguation: z
      .string()
      .nullable()
      .openapi({ description: "Its year, and a book's author, to tell same-title works apart." }),
    description: z.string().nullable().openapi({ description: "Qloo's line on what it is." })
  })
  .openapi('WorkCandidate')

const WorkMatch = z
  .object({
    resolution: z.enum(['resolved', 'ambiguous', 'missed', 'failed']).openapi({
      description:
        '`resolved` to its match, `ambiguous` among same-title candidates until a work is confirmed, `missed` when Qloo has no such work, or `failed` with the error.'
    }),
    entity: orNull(WorkCandidate),
    candidates: z.array(WorkCandidate),
    evidence: z.string().openapi({ description: "The search's call number in the network's evidence." }),
    error: z.string().nullable()
  })
  .openapi('WorkMatch', { description: "How the work's search in Qloo resolved." })

const Pitch = z
  .object({
    id: z.string().openapi({ example: 'pitch-01' }),
    from: z
      .string()
      .nullable()
      .openapi({ description: "The sender's name and address. It stays in Crossfeed: it never reaches Qloo." }),
    subject: z.string().nullable(),
    body: z.string(),
    status: z.enum(['reading', 'looking_up', 'read', 'no_work', 'unreadable', 'failed']).openapi({
      description:
        "`reading` while the agent reads it, `looking_up` while its work is searched in Qloo, then `read`. A pitch with no public work (`no_work`) or that the agent can't read (`unreadable`) is set aside and never reaches Qloo; `failed` says why in `error`."
    }),
    guest: z
      .string()
      .nullable()
      .openapi({ description: "The pitched guest's name, as the agent read it. It never reaches Qloo." }),
    work: orNull(Work),
    match: orNull(WorkMatch).openapi({ description: 'Null until its work has been searched.' }),
    error: z.string().nullable()
  })
  .openapi('Pitch')

const Inbox = z
  .object({
    status: z.enum(['empty', 'reading', 'done']).openapi({
      description: '`empty` until pitches are loaded, `reading` while any is still being read; poll until `done`.'
    }),
    sample: z
      .object({ notice: z.string() })
      .nullable()
      .openapi({ description: "The sample inbox's notice, while the sample inbox is loaded." }),
    pitches: z.array(Pitch),
    skipped: z
      .array(z.object({ pitch: z.string(), why: z.string() }))
      .openapi({ description: 'Emails left out of the last upload, each named by its subject or sender, and why.' })
  })
  .openapi('Inbox', {
    example: {
      status: 'reading',
      sample: null,
      pitches: [
        {
          id: 'pitch-01',
          from: 'Pat Lindqvist <pat@example.com>',
          subject: 'Ada Quill on Night Ferry',
          body: "Ada Quill's novel Night Ferry is about a projectionist on a car ferry.",
          status: 'reading',
          guest: null,
          work: null,
          match: null,
          error: null
        }
      ],
      skipped: [{ pitch: 'Weekly Digest <digest@example.com>', why: 'is over the 10,000-character limit' }]
    }
  })

api.openapi(
  createRoute({
    method: 'get',
    path: '/api/v1/networks/{networkId}/inbox',
    tags: ['Inbox'],
    summary: 'Read the inbox',
    request: { params: NetworkParams },
    responses: {
      200: { description: 'The inbox.', content: { 'application/json': { schema: Inbox } } },
      ...errors(...AUTH_ERRORS)
    }
  }),
  async (c) => c.json(await getInbox(context(c)), 200)
)

// Pitches given one by one, rather than as email files.
export const PitchBatch = z
  .object({
    pitches: z.array(
      z.object({
        from: z.string().nullable().optional().openapi({ description: "The sender's name and address." }),
        subject: z.string().nullable().optional(),
        body: z.string()
      })
    )
  })
  .openapi('PitchBatch', {
    example: {
      pitches: [
        {
          from: 'Pat Lindqvist <pat@example.com>',
          subject: 'Ada Quill on Night Ferry',
          body: "Ada Quill's novel Night Ferry is about a projectionist on a car ferry."
        }
      ]
    }
  })
api.openAPIRegistry.register('PitchBatch', PitchBatch)

// A batch's pitches as the agent reads them: a sender or subject left out is none.
export const batchPitches = ({ pitches }: z.infer<typeof PitchBatch>): PitchInput[] =>
  pitches.map(({ from, subject, body }) => ({ from: from ?? null, subject: subject ?? null, body }))

// What a pitch file body's type says it is, as the upload module reads files by their extension.
const PITCH_BODIES: Record<string, string> = {
  'message/rfc822': 'pitch.eml',
  'application/mbox': 'pitches.mbox',
  'text/plain': 'pitches.txt'
}

api.openapi(
  createRoute({
    method: 'post',
    path: '/api/v1/networks/{networkId}/inbox',
    tags: ['Inbox'],
    summary: 'Load the inbox',
    description:
      "Send the pitches as the body: one email as `message/rfc822` (an .eml file), an mbox export as `application/mbox`, plain text with a line of three dashes between pitches as `text/plain` (a pitch's first lines may give its `From:` and `Subject:`), or JSON pitches, at most 50 pitches and 5 MB. Of each email, only its sender, subject, and text are kept, never its attachments or other headers, and only its work's title and type reach Qloo. An email with no text, or over 10,000 characters, is skipped and named. It answers 202 at once with the pitches reading; poll the inbox until it's done. Reading the pitches counts as one of the network's model runs. Over an inbox that has pitches, it needs `replace=true`: they go, with the last pitch run's lists and replies.",
    request: {
      params: NetworkParams,
      query: z.object({
        replace: z
          .enum(['true', 'false'])
          .optional()
          .openapi({ description: 'Load over an inbox that has pitches.', example: 'true' })
      }),
      body: {
        required: true,
        content: {
          'message/rfc822': { schema: z.string().openapi({ format: 'binary' }) },
          'application/mbox': { schema: z.string().openapi({ format: 'binary' }) },
          'text/plain': {
            schema: z.string().openapi({
              example:
                "From: Pat Lindqvist <pat@example.com>\nSubject: Ada Quill on Night Ferry\n\nAda Quill's novel Night Ferry is about a projectionist on a car ferry.\n---\nCy Lund on making Low Tide on a shoestring.\n"
            })
          },
          // Validated in the handler, which tells the JSON apart from the files.
          'application/json': { schema: { $ref: '#/components/schemas/PitchBatch' } }
        }
      }
    },
    responses: {
      202: {
        description: 'The inbox, with its new pitches reading.',
        content: { 'application/json': { schema: Inbox } }
      },
      ...errors(400, 401, 403, 404, 409, 413, 422, 429)
    }
  }),
  async (c) => {
    const type = mediaType(c)
    const name = PITCH_BODIES[type]
    let pitches: PitchInput[]
    if (name) pitches = await readPitchUpload([await bodyFile(c, name)])
    else if (type === 'application/json') {
      const file = await bodyFile(c, 'pitches.json')
      tooBig(file)
      let json: unknown
      try {
        json = JSON.parse(await file.text())
      } catch {
        throw new Refusal('invalid', "The body isn't valid JSON. Send it as application/json.")
      }
      const batch = PitchBatch.safeParse(json)
      if (!batch.success) throw new Refusal('invalid', invalidField(batch.error))
      pitches = batchPitches(batch.data)
    } else
      throw new Refusal(
        'invalid',
        'Send the pitches as message/rfc822 (an .eml file), application/mbox, text/plain with a line of three dashes between pitches, or application/json.'
      )
    const replace = c.req.valid('query').replace === 'true'
    return c.json(await loadInbox(context(c), { pitches, replace }), 202)
  }
)

export const WorkConfirmation = z
  .object({ entityId: z.string().openapi({ description: "One of its work's candidates." }) })
  .openapi('WorkConfirmation', { example: { entityId: 'f-0002' } })

api.openapi(
  createRoute({
    method: 'patch',
    path: '/api/v1/networks/{networkId}/inbox/pitches/{pitchId}',
    tags: ['Inbox'],
    summary: "Confirm a pitch's work",
    description:
      "Confirm which of an ambiguous work's same-title candidates the pitch is about (`entityId`). Only a work matched in Qloo is ranked.",
    request: {
      params: NetworkParams.extend({ pitchId: z.string().openapi({ example: 'pitch-03' }) }),
      body: {
        required: true,
        content: { 'application/json': { schema: WorkConfirmation } }
      }
    },
    responses: {
      200: { description: 'The pitch, its work confirmed.', content: { 'application/json': { schema: Pitch } } },
      ...errors(400, 401, 403, 404, 429)
    }
  }),
  async (c) => {
    const { pitchId } = c.req.valid('param')
    return c.json(await confirmWork(context(c), { pitchId, entityId: c.req.valid('json').entityId }), 200)
  }
)

const Question = z
  .object({
    id: z.string().openapi({ description: 'Answer with this ID, so an answer meant for another question is refused.' }),
    kind: z.enum(['choice', 'launch', 'budget', 'exclusions', 'comps', 'confirm_comps']).openapi({
      description:
        "A `choice` question is answered with one of its `options` as `choice`, or your own words as `text`; each other kind, a launch run's, with the Answer fields named for it. Code builds a `launch` question's options from the launch's candidates in Qloo, an `exclusions` question's from the charted shows, and a `confirm_comps` question's from the comps' names."
    }),
    question: z.string(),
    options: z.array(z.string())
  })
  .openapi('Question', { description: 'The question the run is waiting on.' })

const Note = z
  .object({ text: z.string(), status: z.enum(['running', 'done', 'failed']) })
  .openapi('Note', { description: 'One step of the run, such as a ranking call, as the app shows it.' })

const SharedTags = z
  .object({
    call: z.string(),
    tags: z.array(z.string()).openapi({ description: "The tags in Qloo's order, as words, never scores." }),
    error: z.string().nullable()
  })
  .openapi('SharedTags', { description: "The tags a work's listeners share with the show's, from one compare call." })

const PitchList = z
  .object({
    type: z.enum(workTypes),
    path: z.enum(['show', 'same_type', 'unranked']).openapi({
      description:
        "`show`: ranked against the show and the past guests' works; `same_type`: against only the past guests' works of this type, as Qloo scored none against the show; `unranked`, with the reason in `error`."
    }),
    anchors: z.array(Anchor),
    calls: z.array(z.string()).openapi({ description: "Its ranking calls' numbers in the network's evidence." }),
    error: z.string().nullable(),
    rows: z
      .array(
        z.object({
          pitch: z.string(),
          entity: WorkCandidate,
          rank: z.number().int().openapi({ description: 'From 1, within this list only.' }),
          band: Band,
          sharedTags: SharedTags.optional()
        })
      )
      .openapi({ description: 'In fit order.' }),
    notScored: z.array(z.object({ pitch: z.string(), reason: z.string() }))
  })
  .openapi('PitchList', {
    description:
      "The pitched works of one type, ranked against the show by one Qloo call. Another type's list comes from another call, so ranks from two lists can't be compared."
  })

const Reply = z
  .object({
    pitch: z.string(),
    verdict: z.enum(['book', 'decline', 'later']),
    angle: z.string().nullable().openapi({ description: "A top pitch's episode angle, built from its shared tags." }),
    sharedTags: orNull(SharedTags),
    draft: z.string().openapi({ description: "The reply to the pitch's sender." }),
    status: z.enum(['draft', 'approved', 'discarded']).openapi({
      description:
        'Only a member approves a reply, in the app; editing an approved reply returns it to `draft`, and so does editing a discarded one.'
    }),
    approvedBy: z.string().optional().openapi({ description: 'The ID of the member who approved it.' })
  })
  .openapi('Reply')

const PitchRunFields = z.object({
  id: z.string(),
  status: z.enum(['running', 'waiting', 'completed', 'stopped', 'failed']).openapi({
    description:
      '`running`, or `waiting` on its `question`; then `completed`, or `stopped` or `failed` with the reason in `error`.'
  }),
  show: z.string().openapi({ description: 'The roster show the pitches are ranked against.' }),
  startedAt: z.string()
})
const PitchRunSummary = PitchRunFields.openapi('PitchRunSummary')
const PitchRun = PitchRunFields.extend({
  question: orNull(Question),
  notes: z.array(Note),
  error: z.string().nullable(),
  closing: z.string().nullable().openapi({
    description:
      "The agent's closing line, once the run completes, as it wrote it then. Once `repliesEdited`, the replies have changed since, so read their counts from `replies`."
  }),
  pastGuests: z.array(
    z.object({
      guest: z.string(),
      work: Work,
      match: orNull(WorkMatch).openapi({ description: 'Null until its work has been searched.' })
    })
  ),
  lists: z.array(PitchList).nullable().openapi({ description: 'One per work type, once the pitches are ranked.' }),
  replies: z.array(Reply).nullable().openapi({ description: 'One per pitch, in inbox order, once drafted.' }),
  repliesEdited: z.boolean().openapi({
    description:
      'An edit or a discard has changed a reply since the agent drafted them, so `closing` may give counts the replies no longer have: `replies` are the current ones.'
  })
}).openapi('PitchRun', {
  example: {
    id: '5f0c2a8e-1b7d-4c3e-9a64-0d2e8f1b3c57',
    status: 'waiting',
    show: 'Deep Cuts',
    startedAt: '2026-10-19T14:02:11.000Z',
    question: {
      id: 'toolu_01',
      kind: 'choice',
      question: 'Hold the film pitches for next season?',
      options: ['Yes', 'No']
    },
    notes: [{ text: 'Ranking 3 pitched works against Deep Cuts', status: 'done' }],
    error: null,
    closing: null,
    pastGuests: [],
    lists: null,
    replies: null,
    repliesEdited: false
  }
})

// An answer to a run's question, by the question's ID. Which fields it takes follows the question's
// kind; the agent refuses any other.
export const Answer = z
  .object({
    questionId: z.string(),
    choice: z
      .string()
      .optional()
      .openapi({ description: "One of a `choice` question's options, or of a `launch` question's candidates." }),
    text: capped(MAX_ANSWER).optional().openapi({
      description:
        'Your own words, for a `choice` question; for a `launch` or `comps` question, the name Qloo lists the launch under.'
    }),
    slots: z.number().optional().openapi({ description: 'A `budget` in promo slots.' }),
    dollars: z.number().optional().openapi({ description: 'A `budget` in dollars.' }),
    exclude: z.array(z.string()).optional().openapi({ description: 'The `exclusions`: shows to leave out.' }),
    comps: z.array(capped(MAX_TITLE)).optional().openapi({ description: 'For `comps`, up to three released shows.' }),
    picks: z.array(z.string().nullable()).optional().openapi({
      description:
        "For `confirm_comps`, each comp's entity ID in the question's order, from its `candidates` in the run's plan, or null for none of them."
    })
  })
  .openapi('Answer', { example: { questionId: 'toolu_01', choice: 'Yes' } })

// A pitch run of the network's, by its ID.
const RunParams = NetworkParams.extend({
  runId: z.string().openapi({ description: 'The ID the run answered with when it started.' })
})

export const PitchRunStart = z
  .object({
    show: z.string().openapi({ description: 'The show, named as on the roster.' }),
    pastGuests: z
      .array(
        z.object({
          guest: capped(MAX_TITLE),
          work: z.object({
            title: capped(MAX_TITLE),
            type: z.enum(workTypes),
            year: z.number().int().nullable().optional()
          })
        })
      )
      .optional()
      .openapi({
        description: `Up to ${MAX_PAST_GUESTS} of the show's best past guests and their public works. A guest's name is used to match a book by its author, and never reaches Qloo.`
      })
  })
  .openapi('PitchRunStart', {
    example: {
      show: 'Deep Cuts',
      pastGuests: [{ guest: 'Mo Reyes', work: { title: 'Talking with Ghosts', type: 'book', year: 2022 } }]
    }
  })

// A pitch run's start as the agent takes it: a work's year left out is unknown.
export const pitchRunInput = ({ show, pastGuests = [] }: z.infer<typeof PitchRunStart>) => ({
  show,
  pastGuests: pastGuests.map(({ guest, work }) => ({ guest, work: { ...work, year: work.year ?? null } }))
})

api.openapi(
  createRoute({
    method: 'post',
    path: '/api/v1/networks/{networkId}/pitch-runs',
    tags: ['Pitch runs'],
    summary: 'Start a pitch run',
    description:
      "Rank the inbox's pitched works against a roster show matched in Qloo, and against its best past guests' works too, then draft a reply to every pitch. Only each work's title and type reach Qloo, never a guest's name or a sender. It answers 202 at once with the run running; poll it until it's done or waiting on a question. It counts as one of the network's model runs, and a new run ends one left waiting.",
    request: {
      params: NetworkParams,
      body: {
        required: true,
        content: { 'application/json': { schema: PitchRunStart } }
      }
    },
    responses: {
      202: { description: 'The run, running.', content: { 'application/json': { schema: PitchRun } } },
      ...errors(400, 401, 403, 404, 409, 429)
    }
  }),
  async (c) => c.json(await startPitchRun(context(c), pitchRunInput(c.req.valid('json'))), 202)
)

api.openapi(
  createRoute({
    method: 'get',
    path: '/api/v1/networks/{networkId}/pitch-runs',
    tags: ['Pitch runs'],
    summary: 'List pitch runs',
    description:
      "The network's pitch runs, newest first: the first is the latest, whose replies the inbox holds until another run or a new inbox replaces them. Read one in full by its ID.",
    request: { params: NetworkParams },
    responses: {
      200: {
        description: 'The pitch runs.',
        content: { 'application/json': { schema: z.object({ pitchRuns: z.array(PitchRunSummary) }) } }
      },
      ...errors(...AUTH_ERRORS)
    }
  }),
  async (c) => c.json({ pitchRuns: await listPitchRuns(context(c)) }, 200)
)

api.openapi(
  createRoute({
    method: 'get',
    path: '/api/v1/networks/{networkId}/pitch-runs/{runId}',
    tags: ['Pitch runs'],
    summary: 'Read a pitch run',
    description:
      'Its status, any question it waits on, and as they arrive, its ranked lists and drafted replies. An earlier run reads as it ended.',
    request: { params: RunParams },
    responses: {
      200: { description: 'The run.', content: { 'application/json': { schema: PitchRun } } },
      ...errors(...AUTH_ERRORS)
    }
  }),
  async (c) => c.json(await getPitchRun(context(c), c.req.valid('param')), 200)
)

api.openapi(
  createRoute({
    method: 'post',
    path: '/api/v1/networks/{networkId}/pitch-runs/{runId}/answer',
    tags: ['Pitch runs'],
    summary: "Answer a pitch run's question",
    description:
      'Answer the question the run is waiting on, by its ID: with one of its options as `choice`, or your own words as `text`. The run resumes, answering 202; poll it again. A run started later, or loading the inbox, ends a run left waiting.',
    request: {
      params: RunParams,
      body: {
        required: true,
        content: {
          'application/json': {
            schema: Answer
          }
        }
      }
    },
    responses: {
      202: { description: 'The run, resumed.', content: { 'application/json': { schema: PitchRun } } },
      ...errors(400, 401, 403, 404, 409, 429)
    }
  }),
  async (c) => {
    const { questionId, ...answer } = c.req.valid('json')
    return c.json(await answerPitchRun(context(c), { ...c.req.valid('param'), questionId, answer }), 202)
  }
)

// One of a pitch run's replies, by its pitch.
const ReplyParams = RunParams.extend({ pitchId: z.string().openapi({ example: 'pitch-01' }) })

api.openapi(
  createRoute({
    method: 'patch',
    path: '/api/v1/networks/{networkId}/pitch-runs/{runId}/replies/{pitchId}',
    tags: ['Replies'],
    summary: 'Edit a reply',
    description:
      "Reword one of the latest pitch run's drafted replies, once the run has ended. Editing an approved reply returns it to draft, and editing a discarded one restores it. Only a member approves a reply, in the app.",
    request: {
      params: ReplyParams,
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z
              .strictObject(
                { draft: z.string().openapi({ description: 'At most 5,000 characters.' }) },
                {
                  error: (issue) =>
                    issue.code === 'unrecognized_keys'
                      ? "Only a reply's draft can be changed through the API. A member approves a reply, in the app."
                      : undefined
                }
              )
              .openapi('ReplyChange', {
                example: { draft: "Thanks for thinking of us. We'd love to book Night Ferry." }
              })
          }
        }
      }
    },
    responses: {
      200: { description: 'The reply as edited.', content: { 'application/json': { schema: Reply } } },
      ...errors(400, 401, 403, 404, 409, 429)
    }
  }),
  async (c) => c.json(await editReply(context(c), { ...c.req.valid('param'), draft: c.req.valid('json').draft }), 200)
)

api.openapi(
  createRoute({
    method: 'post',
    path: '/api/v1/networks/{networkId}/pitch-runs/{runId}/replies/{pitchId}/discard',
    tags: ['Replies'],
    summary: 'Discard a reply',
    description:
      "Leave one of the latest pitch run's drafted replies out, once the run has ended. Editing it restores it.",
    request: { params: ReplyParams },
    responses: {
      200: { description: 'The reply, discarded.', content: { 'application/json': { schema: Reply } } },
      ...errors(401, 403, 404, 409, 429)
    }
  }),
  async (c) => c.json(await discardReply(context(c), c.req.valid('param')), 200)
)

const LAUNCH_STATUSES = [
  'new',
  'running',
  'waiting',
  'ranked',
  'order_drafted',
  'order_approved',
  'failed',
  'stopped'
] as const
const LaunchFields = z.object({
  id: z.string(),
  name: z.string().nullable().openapi({ description: "The launch's name; null for one planned from comps alone." }),
  comps: z.array(z.string()).openapi({
    description:
      "The released shows standing in for an unreleased launch, from its plan or a run's answers; empty for a released one."
  }),
  status: z.enum(LAUNCH_STATUSES).openapi({
    description:
      "`new` until its first run; then its latest run's `running`, `waiting` on a question, `failed`, or `stopped`; once that run completed, `ranked`, `order_drafted`, or `order_approved`."
  }),
  finalists: z.number().int(),
  slots: z.number().int().nullable().openapi({ description: "Its insertion order's promo slots." }),
  slotValue: z.number().nullable().openapi({ description: "Its insertion order's total value, in dollars." }),
  startedBy: z.string().nullable().openapi({
    description:
      'Who started its latest run: a member, by name, or an API key, as `API key “<its name>”`; null before its first run, or when no one was recorded.'
  }),
  lastRun: z.string().nullable().openapi({ description: 'When its latest run started.' })
})
const EXAMPLE_LAUNCH = {
  id: '3d1f6b2e-8a4c-4f7d-b5e9-6c0a2d8f1e73',
  name: 'Night Shift Cinema',
  comps: [],
  status: 'order_drafted',
  finalists: 5,
  slots: 20,
  slotValue: 19076,
  startedBy: 'Ada Programmer',
  lastRun: '2026-10-19T14:02:11.000Z'
} as const
const LaunchSummary = LaunchFields.openapi('LaunchSummary', { example: EXAMPLE_LAUNCH })

const RunFields = z.object({
  id: z.string(),
  status: z.enum(['running', 'waiting', 'completed', 'stopped', 'failed']).openapi({
    description:
      '`running`, or `waiting` on its `question`; then `completed`, or `stopped` or `failed` with the reason in `error`.'
  }),
  startedAt: z.string(),
  startedBy: z.string().nullable().openapi({
    description:
      'Who started it: a member, in the app or with their session, by name, or an API key, as `API key “<its name>”`; null when no one was recorded.'
  })
})
const LaunchRunSummary = RunFields.openapi('LaunchRunSummary')

const Chart = z
  .object({
    call: z.string().openapi({ description: "The ranking's call number in the launch's evidence." }),
    anchors: z.array(Anchor).openapi({ description: 'What the roster was ranked against: the launch, or its comps.' }),
    error: z.string().nullable().openapi({ description: 'Why Qloo gave no ranking; then `rows` is empty.' }),
    rows: z
      .array(
        z.object({
          rank: z.number().int().openapi({ description: 'Fit rank, from 1.' }),
          show: z.string(),
          entity: Candidate.openapi({ description: 'What Qloo scored for it: its match, or the comp it maps to.' }),
          band: Band.openapi({ description: 'Its third of the chart by fit rank.' }),
          finalist: z.boolean().openapi({ description: 'One of the top five by fit, not left out of this run.' }),
          leadingComp: Anchor.nullable().openapi({
            description: 'The comp that clearly drove its fit; null with one anchor, or when none did.'
          }),
          sharedTags: orNull(SharedTags).openapi({ description: "A finalist's, once they're compared." }),
          topicRank: z.number().int().nullable().openapi({
            description: 'Its rank by topic alone among the charted shows; null until the baseline is in.'
          }),
          move: z
            .number()
            .int()
            .nullable()
            .openapi({ description: 'Topic rank minus fit rank, so a show Qloo lifts climbs.' }),
          climber: z.boolean().openapi({ description: 'It climbed three places or more over its topic rank.' })
        })
      )
      .openapi({ description: 'In fit order.' }),
    notScored: z.array(z.object({ show: z.string(), reason: z.string() }))
  })
  .openapi('Chart', {
    description:
      "The roster ranked by fit with the launch's listeners, from one Qloo call. It shows ranks, never scores; the scores stay in the evidence."
  })

const OrderLine = z.object({
  show: z.string(),
  slots: z.number().int(),
  angle: z.string().openapi({ description: 'The host-read angle.' }),
  slotValue: z
    .number()
    .nullable()
    .openapi({ description: 'Dollars per slot; null when a figure it needs is missing.' }),
  value: z.number().nullable().openapi({ description: 'Slots × slot value.' }),
  gap: z.string().nullable().openapi({ description: 'Why the line has no value, such as no downloads per episode.' })
})
const InsertionOrder = z
  .object({
    id: z.string().openapi({ example: 'IO-0001' }),
    run: z.string().openapi({ description: 'The run that drafted it.' }),
    status: z.enum(['draft', 'approved']).openapi({
      description: 'Only a member approves an order, in the app; editing an approved order returns it to `draft`.'
    }),
    lines: z.array(OrderLine),
    cpm: z.number().nullable().openapi({ description: 'The CPM in dollars it was priced at.' }),
    slots: z.number().int(),
    total: z.number().openapi({ description: 'Dollars, over the lines that have a value.' }),
    complete: z.boolean().openapi({ description: "Every line has a value, so `total` is the order's whole cost." }),
    edited: z.boolean().openapi({
      description:
        "An edit has changed it since the agent drafted it, so its run's `closing` may quote figures it no longer has: its own lines and totals are the current ones."
    }),
    approvedBy: z.string().optional().openapi({ description: 'The member who approved it, by name.' }),
    approvedAt: z.string().optional()
  })
  .openapi('InsertionOrder', {
    description:
      'The launch plan priced as the inventory it spends: a slot is worth downloads per episode × CPM ÷ 1,000.'
  })

const EXAMPLE_RUN = {
  id: '9a2c4e6b-0d1f-4a3b-8c5d-7e9f1a2b3c4d',
  status: 'waiting',
  startedAt: '2026-10-19T14:02:11.000Z',
  startedBy: 'Ada Programmer',
  plan: {
    name: 'Night Shift Cinema',
    entity: { id: 'p-0301', name: 'Night Shift Cinema', popularity: 0.6 },
    comps: []
  },
  question: { id: 'toolu_03', kind: 'budget', question: 'What is the slot budget?', options: [] },
  notes: [{ text: 'Ranking 5 shows against Night Shift Cinema', status: 'done' }],
  error: null,
  closing: null,
  budget: null,
  exclusions: null,
  chart: null,
  topic: { status: 'ranked', order: ['Field Notes', 'Deep Cuts'], error: null },
  demographics: null,
  insertionOrder: null
} as const
const LaunchRun = RunFields.extend({
  plan: z
    .object({
      name: z.string().nullable(),
      entity: orNull(Candidate).openapi({ description: "The launch's match in Qloo, once the run has one." }),
      comps: z.array(
        z.object({
          name: z.string(),
          status: z.enum(['unconfirmed', 'confirmed', 'rejected']).openapi({
            description: 'Only a comp confirmed in an answer is scored; `rejected` when none of its matches is it.'
          }),
          entity: orNull(Candidate),
          candidates: z.array(Candidate).openapi({
            description:
              "What a `confirm_comps` answer picks from, by ID: the comp's match, or its candidates when two feeds share its name."
          })
        })
      )
    })
    .openapi({
      description:
        "The launch as this run plans it: its name, its match in Qloo once found, and any comps, each confirmed or not in the run's answers."
    }),
  question: orNull(Question),
  notes: z.array(Note),
  error: z.string().nullable().openapi({ description: 'Why the run failed or stopped.' }),
  closing: z.string().nullable().openapi({
    description:
      "The agent's closing line, once the run completes, as it wrote it then. Once `insertionOrder.edited`, the order has changed since, so read its figures from the order."
  }),
  budget: z
    .union([z.object({ slots: z.number().int() }), z.object({ dollars: z.number() })])
    .nullable()
    .openapi({ description: 'The slot budget, once answered.' }),
  exclusions: z.array(z.string()).nullable().openapi({ description: 'The shows left out of this run, once answered.' }),
  chart: orNull(Chart),
  topic: z
    .object({
      status: z.enum(['ranking', 'ranked', 'refused', 'failed']),
      order: z.array(z.string()).openapi({ description: 'The roster by topic alone, most on-topic first.' }),
      error: z.string().nullable()
    })
    .nullable()
    .openapi({
      description: 'The topic baseline: what planning by topic alone would rank, from show names and descriptions.'
    }),
  demographics: z
    .object({
      call: z.string(),
      error: z.string().nullable(),
      profile: z
        .object({
          from: z.array(z.string()),
          ages: z.array(z.string()),
          skew: z.enum(['male', 'female']).nullable(),
          disagree: z.array(z.string())
        })
        .nullable()
        .openapi({
          description: "The launch's listeners in words: their leading age groups, any skew, and where comps disagree."
        }),
      rows: z.array(z.object({ show: z.string(), reasons: z.array(z.string()).nullable() })).openapi({
        description:
          "Each finalist, in fit order, flagged with why its listeners differ from the launch's; empty reasons when they don't, null when Qloo had none."
      })
    })
    .nullable()
    .openapi({ description: "The finalists' listeners checked against the launch's." }),
  insertionOrder: orNull(InsertionOrder)
}).openapi('LaunchRun', { example: EXAMPLE_RUN })

const Launch = LaunchFields.extend({
  rosterChanged: z.boolean().openapi({
    description: "The network's roster has changed since the latest run copied it: run again to rank it as it is."
  }),
  runs: z.array(LaunchRunSummary).openapi({ description: 'Every run, oldest first.' }),
  latestRun: orNull(LaunchRun)
}).openapi('Launch', {
  example: {
    ...EXAMPLE_LAUNCH,
    status: 'waiting',
    slots: null,
    slotValue: null,
    rosterChanged: false,
    runs: [{ id: EXAMPLE_RUN.id, status: 'waiting', startedAt: EXAMPLE_RUN.startedAt, startedBy: 'Ada Programmer' }],
    latestRun: EXAMPLE_RUN
  }
})

// What a launch is planned from, by name or comps.
export const LaunchPlan = z
  .strictObject({
    name: capped(MAX_TITLE).optional().openapi({ description: "A released launch's name, as Qloo lists it." }),
    comps: z
      .array(capped(MAX_TITLE))
      .optional()
      .openapi({ description: 'Up to three released shows to stand in for an unreleased launch.' })
  })
  .openapi('LaunchPlan', { example: { name: 'Night Shift Cinema' } })

const LaunchParams = NetworkParams.extend({
  launchId: z.string().openapi({ description: 'The ID the launch answered with when it was created.' })
})

api.openapi(
  createRoute({
    method: 'get',
    path: '/api/v1/networks/{networkId}/launches',
    tags: ['Launches'],
    summary: 'List launches',
    description: "The network's launches, newest first, as its dashboard lists them.",
    request: { params: NetworkParams },
    responses: {
      200: {
        description: 'The launches.',
        content: { 'application/json': { schema: z.object({ launches: z.array(LaunchSummary) }) } }
      },
      ...errors(...AUTH_ERRORS)
    }
  }),
  async (c) => c.json({ launches: await listLaunches(context(c)) }, 200)
)

api.openapi(
  createRoute({
    method: 'post',
    path: '/api/v1/networks/{networkId}/launches',
    tags: ['Launches'],
    summary: 'Create a launch',
    description:
      "Plan a new launch by its name, as Qloo lists a released show, or by up to three released shows as comps for an unreleased one. It joins the network's list, and every member's dashboard, with status `new`; start a run to rank the roster for it. A network keeps a limited number of launches at once, as the terms say: past it, a new one is refused with `limit` until a member deletes one on the dashboard.",
    request: {
      params: NetworkParams,
      body: { required: true, content: { 'application/json': { schema: LaunchPlan } } }
    },
    responses: {
      201: { description: 'The launch.', content: { 'application/json': { schema: Launch } } },
      ...errors(400, 401, 403, 404, 429)
    }
  }),
  async (c) => c.json(await createLaunch(context(c), c.req.valid('json')), 201)
)

api.openapi(
  createRoute({
    method: 'get',
    path: '/api/v1/networks/{networkId}/launches/{launchId}',
    tags: ['Launches'],
    summary: 'Read a launch',
    description:
      'Its status and figures, its runs, and its latest run in full: any question it waits on, the chart, the topic baseline, the demographics check, and the insertion order, as they arrive.',
    request: { params: LaunchParams },
    responses: {
      200: { description: 'The launch.', content: { 'application/json': { schema: Launch } } },
      ...errors(...AUTH_ERRORS)
    }
  }),
  async (c) => c.json(await getLaunch(context(c), c.req.valid('param')), 200)
)

api.openapi(
  createRoute({
    method: 'delete',
    path: '/api/v1/networks/{networkId}/launches/{launchId}',
    tags: ['Launches'],
    summary: 'Delete a launch',
    description:
      "Delete the launch for every member, with its runs, their insertion orders, and their evidence, which can't be brought back. Only a member's session from one of Crossfeed's pages may, as the dashboard does; an API key answers 403.",
    request: { params: LaunchParams },
    responses: {
      204: { description: 'Deleted.' },
      ...errors(401, 403, 404, 429)
    }
  }),
  async (c) => {
    await deleteLaunch(context(c), c.req.valid('param'))
    return c.body(null, 204)
  }
)

const Evidence = z
  .object({
    call: z.string().openapi({ description: 'Its call number, which the chart and the run cite.' }),
    run: z.string().nullable().openapi({ description: 'The run that made the call; null for a roster lookup.' }),
    at: z.string(),
    method: z.enum(['GET', 'POST']),
    endpoint: z.string().openapi({ example: '/v2/insights' }),
    params: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .openapi({ description: 'What was sent to Qloo, never the key.' }),
    status: z.number().int().nullable().openapi({ description: "Qloo's HTTP status; null when none came back." }),
    latencyMs: z.number(),
    retries: z.number().int(),
    cacheHit: z.boolean(),
    error: z.string().nullable(),
    entities: z.array(
      z.object({ id: z.string(), name: z.string(), type: z.string(), popularity: z.number().nullable() })
    ),
    tags: z.array(z.object({ id: z.string(), name: z.string(), score: z.number().nullable() })),
    affinities: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        affinity: z.number().nullable(),
        explainability: z.array(z.object({ id: z.string(), score: z.number() }))
      })
    ),
    copiedFrom: z
      .string()
      .optional()
      .openapi({ description: "The network's call this copies, from the roster's lookup, as the run started." })
  })
  .openapi('Evidence', {
    description: 'One Qloo call: what was sent and what came back, scores included.',
    example: {
      call: 'C-07',
      run: '9a2c4e6b-0d1f-4a3b-8c5d-7e9f1a2b3c4d',
      at: '2026-10-19T14:02:13.000Z',
      method: 'POST',
      endpoint: '/v2/insights',
      params: { 'filter.type': 'urn:entity:podcast', 'signal.interests.entities': 'p-0301' },
      status: 200,
      latencyMs: 412,
      retries: 0,
      cacheHit: false,
      error: null,
      entities: [],
      tags: [],
      affinities: [{ id: 'p-0001', name: 'Deep Cuts', affinity: 0.71, explainability: [{ id: 'p-0301', score: 1 }] }]
    }
  })

api.openapi(
  createRoute({
    method: 'get',
    path: '/api/v1/networks/{networkId}/launches/{launchId}/evidence',
    tags: ['Evidence'],
    summary: "Read a launch's evidence",
    description:
      "The launch's evidence log, oldest first: one record per Qloo call its runs made, and the roster's lookups each run copied as it started. Every call number a run cites opens one of these.",
    request: { params: LaunchParams },
    responses: {
      200: {
        description: 'The evidence log.',
        content: { 'application/json': { schema: z.object({ evidence: z.array(Evidence) }) } }
      },
      ...errors(...AUTH_ERRORS)
    }
  }),
  async (c) => c.json({ evidence: await getLaunchEvidence(context(c), c.req.valid('param')) }, 200)
)

// A run of the launch, by its ID.
const LaunchRunParams = LaunchParams.extend({
  runId: z.string().openapi({ description: 'The ID the run answered with when it started.' })
})

api.openapi(
  createRoute({
    method: 'post',
    path: '/api/v1/networks/{networkId}/launches/{launchId}/runs',
    tags: ['Runs'],
    summary: 'Start a run',
    description:
      "Rank the network's roster, as it stands now, by fit with the launch's listeners in Qloo, then plan its promos to a draft insertion order priced at the network's CPM. With no body, the run plans the launch as it stands; a name or comps plan it anew. It answers 202 at once with the run running; poll it until it's done or waiting on a question. It counts as one of the network's model runs: past the network's daily model runs, it stops at once, saying why. A new run ends one left waiting.",
    request: {
      params: LaunchParams,
      body: { required: false, content: { 'application/json': { schema: LaunchPlan } } }
    },
    responses: {
      202: { description: 'The run, running.', content: { 'application/json': { schema: LaunchRun } } },
      ...errors(400, 401, 403, 404, 409, 429)
    }
  }),
  async (c) => c.json(await startLaunchRun(context(c), { ...c.req.valid('param'), plan: c.req.valid('json') }), 202)
)

api.openapi(
  createRoute({
    method: 'get',
    path: '/api/v1/networks/{networkId}/launches/{launchId}/runs/{runId}',
    tags: ['Runs'],
    summary: 'Read a run',
    description:
      'Its status, any question it waits on, and as they arrive, its chart, topic baseline, demographics check, and insertion order. An earlier run reads as it ended, with its order as it was left, to compare with a re-run.',
    request: { params: LaunchRunParams },
    responses: {
      200: { description: 'The run.', content: { 'application/json': { schema: LaunchRun } } },
      ...errors(...AUTH_ERRORS)
    }
  }),
  async (c) => c.json(await getLaunchRun(context(c), c.req.valid('param')), 200)
)

api.openapi(
  createRoute({
    method: 'post',
    path: '/api/v1/networks/{networkId}/launches/{launchId}/runs/{runId}/answer',
    tags: ['Runs'],
    summary: "Answer a run's question",
    description:
      'Answer the question the run is waiting on, by its ID, with the fields its kind takes: `choice` or `text` for a `choice` question; `choice` (one of its options) or `text` (the name Qloo lists the launch under) for `launch`; `slots` or `dollars` for `budget`; `exclude`, from its options, for `exclusions`; `comps` or `text` for `comps`; and `picks` for `confirm_comps`. Relay the question to the person planning the launch and answer with their words. The run resumes, answering 202; poll it again.',
    request: {
      params: LaunchRunParams,
      body: { required: true, content: { 'application/json': { schema: Answer } } }
    },
    responses: {
      202: { description: 'The run, resumed.', content: { 'application/json': { schema: LaunchRun } } },
      ...errors(400, 401, 403, 404, 409, 429)
    }
  }),
  async (c) => {
    const { questionId, ...answer } = c.req.valid('json')
    return c.json(await answerLaunchRun(context(c), { ...c.req.valid('param'), questionId, answer }), 202)
  }
)

// An insertion order of the launch, by its ID.
const OrderParams = LaunchParams.extend({ orderId: z.string().openapi({ example: 'IO-0001' }) })

export const OrderChange = z
  .strictObject(
    {
      lines: z
        .array(
          z.object({
            show: z.string().openapi({ description: "One of the run's finalists, named as on the roster." }),
            slots: z.number().openapi({ description: 'Whole promo slots, 1 or more.' }),
            angle: capped(MAX_ANGLE)
          })
        )
        .openapi({ description: 'Every line of the order as it should be, one per show.' })
    },
    {
      error: (issue) =>
        issue.code === 'unrecognized_keys' && issue.keys.includes('status')
          ? "Only an order's lines change through the API. A member approves an insertion order, in the app."
          : undefined
    }
  )
  .openapi('OrderChange', {
    example: {
      lines: [{ show: 'Deep Cuts', slots: 6, angle: 'Its listeners stay for the long interviews.' }]
    }
  })

api.openapi(
  createRoute({
    method: 'patch',
    path: '/api/v1/networks/{networkId}/launches/{launchId}/insertion-orders/{orderId}',
    tags: ['Insertion orders'],
    summary: 'Edit a draft insertion order',
    description:
      "Change the lines of the launch's current order, once its run has ended: each finalist's promo slots and host-read angle, or drop a show by leaving its line out. Code prices it again at the network's CPM. Editing an approved order returns it to draft. Only a member approves an order, in the app.",
    request: {
      params: OrderParams,
      body: {
        required: true,
        content: { 'application/json': { schema: OrderChange } }
      }
    },
    responses: {
      200: { description: 'The order as edited.', content: { 'application/json': { schema: InsertionOrder } } },
      ...errors(400, 401, 403, 404, 409, 429)
    }
  }),
  async (c) => c.json(await editOrder(context(c), { ...c.req.valid('param'), lines: c.req.valid('json').lines }), 200)
)

api.openapi(
  createRoute({
    method: 'get',
    path: '/api/v1/networks/{networkId}/launches/{launchId}/insertion-orders/{orderId}/csv',
    tags: ['Insertion orders'],
    summary: 'Export an approved insertion order',
    description:
      "The order as a CSV file for ad operations: a row per line, then the total, in whole dollars. Only an order a member approved in the app exports; a draft answers 409. An earlier run's order exports as it was left.",
    request: { params: OrderParams },
    responses: {
      200: {
        description: 'The order as CSV.',
        content: {
          'text/csv': {
            schema: z.string().openapi({
              example:
                '\uFEFFShow,Slots,Angle,Slot value (USD),Line value (USD)\r\nDeep Cuts,6,Its listeners stay for the long interviews.,300,1800\r\nTotal,6,,,1800\r\n'
            })
          }
        }
      },
      ...errors(401, 404, 409, 429)
    }
  }),
  async (c) => {
    const { orderId } = c.req.valid('param')
    return csvDownload(orderId, { status: 200, csv: await exportOrder(context(c), c.req.valid('param')) })
  }
)

// The API's contract, generated from the routes' schemas, for the deployment at `origin`: served
// below, and read by the developer docs.
const contract = (origin: string) => ({
  openapi: '3.1.0',
  info: {
    title: 'Crossfeed API',
    version: '1',
    description:
      "Act for one network: its roster, launches, and inbox. Authenticate with one of the network's API keys, made by an owner in its settings, as `Authorization: Bearer cf_live_…`. Nothing here approves an insertion order or a reply: only a member does, in the app. Long work, such as an import, answers 202 with the resource's current status; poll the resource until it settles. Examples use made-up shows and figures."
  },
  servers: [{ url: origin }],
  // Either one: an API key, or a member's session.
  security: [{ apiKey: [] }, { session: [] }] as Record<string, string[]>[]
})
export const apiDocument = (origin: string) => api.getOpenAPI31Document(contract(origin))
api.doc31('/api/v1/openapi.json', (c) => contract(new URL(c.req.url).origin))
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
