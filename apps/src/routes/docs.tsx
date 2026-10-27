/** @jsxImportSource hono/jsx */
// The developer docs under /docs, and /llms.txt: marketing pages, server-rendered with no island. What
// could drift from the code is read from it: the API's reference from its OpenAPI document, the MCP
// tools from what the server lists, the error codes from refusal.ts, the limits from env and the
// modules that hold them, and the skills and the plugin's MCP config from plugins/crossfeed, whose
// SKILL.md files the app serves as they are. Every example uses made-up shows and IDs. While ACCOUNTS
// is off the pages still describe the API and the MCP server, and link neither.
import { cn } from 'cn'
import { Hono, type Context } from 'hono'
import type { Child } from 'hono/jsx'
import mcpConfig from '../../../plugins/crossfeed/.mcp.json?raw'
import planLaunchPromos from '../../../plugins/crossfeed/skills/plan-launch-promos/SKILL.md?raw'
import triageGuestPitches from '../../../plugins/crossfeed/skills/triage-guest-pitches/SKILL.md?raw'
import { MAX_SHOWS } from '../agent'
import { badgeVariants } from '../components/ui/variants'
import { ChevronDown } from '../icons'
import { MAX_PITCH_CHARS, MAX_PITCHES } from '../inbox'
import { MAX_QLOO_CALLS, MAX_TURNS } from '../limits'
import { REFUSALS, type RefusalCode } from '../refusal'
import { marketingFrame, marketingShell } from '../shell'
import { MAX_UPLOAD_BYTES, megabytes } from '../upload'
import { apiDocument } from './api'
import { cap, Code, TableScroll } from './marketing'
import { RELAY, listedTools } from './mcp'

export const docs = new Hono<{ Bindings: Env }>()

// The docs' pages, in reading order, each with what /llms.txt says it holds.
const PAGES = [
  { path: '/docs', title: 'Overview', holds: "what a program can and can't do, API keys, limits, and errors" },
  { path: '/docs/api', title: 'REST API', holds: 'every route under /api/v1, generated from the OpenAPI document' },
  {
    path: '/docs/sdk',
    title: 'TypeScript SDK',
    holds: '@crossfeed/sdk: installing it from the repo, the client, wait helpers, and errors'
  },
  { path: '/docs/mcp', title: 'MCP server', holds: 'the tools at /mcp, and the claude mcp add command' },
  {
    path: '/docs/agents',
    title: 'Skills and plugin',
    holds: 'two Agent Skills, and the Claude Code plugin that installs them with the MCP server'
  }
] as const
type Path = (typeof PAGES)[number]['path']

// The skills, by the directory each lives in, which is also its name and its URL's.
const SKILLS = { 'plan-launch-promos': planLaunchPromos, 'triage-guest-pitches': triageGuestPitches }
const skillUrl = (name: string) => `/docs/agents/${name}/SKILL.md`
// A skill's frontmatter fields, each written on one line.
const frontmatter = (text: string) =>
  Object.fromEntries(
    [...(text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '').matchAll(/^([a-z-]+): (.*)$/gm)].map((m) => [m[1], m[2]])
  ) as Record<string, string>

// A made-up network ID, as the OpenAPI document's examples use.
const NETWORK_ID = '0b6e8d2a-4c1f-4e8a-9d3b-2f5a7c9e1d40'
// Where every route of a network is.
const NETWORK_PATH = '/api/v1/networks/{networkId}'
// API_LIMITER's limit in wrangler.jsonc, which the binding doesn't expose to read.
const REQUESTS_A_MINUTE = 120

// What each refusal code means, beside the status refusal.ts gives it.
const MEANS: Record<RefusalCode | 'internal', string> = {
  invalid: "The request, or a value in it, can't be used as it is. The message names the field.",
  unauthorized: 'No API key, or one that is unknown or revoked.',
  forbidden: "The caller can't do this, such as an API key deleting a launch.",
  not_found: "No such resource, or one the key can't reach, such as another network.",
  conflict: "The resource's state refuses it, such as an import over a roster without `replace=true`.",
  too_large: `An upload over ${megabytes(MAX_UPLOAD_BYTES, 0)}.`,
  unreadable: "An upload that can't be read, such as a CSV with no `name` column.",
  limit: "A daily cap, the network's or all of Crossfeed's. Counts reset at 00:00 UTC.",
  rate_limited: 'Too many requests a minute with one key. Wait a minute: it answers `Retry-After: 60`.',
  internal: 'Something went wrong in Crossfeed. Try again in a moment.'
}
const STATUSES = { ...REFUSALS, internal: 500 }
// The codes each status answers with.
const CODES: Record<number, string[]> = {}
for (const [code, status] of Object.entries(STATUSES)) (CODES[status] ??= []).push(code)

// Text with Markdown's code spans, as the OpenAPI document and the tools write them, set as code.
const Prose = ({ text }: { text: string }) => (
  <>{text.split('`').map((part, i) => (i % 2 ? <code>{part}</code> : part))}</>
)

// A URL path, which may break after any of its slashes on a narrow screen.
const UrlPath = ({ path }: { path: string }) => (
  <>
    {path.split('/').map((part, i) =>
      i === 0 ? (
        part
      ) : (
        <>
          /<wbr />
          {part}
        </>
      )
    )}
  </>
)

// A link outside the article's text, underlined as the article's are.
const link = 'underline decoration-1 underline-offset-4 hover:decoration-2'

// The OpenAPI document's URL: a link while accounts are on, as the API serves it then.
const OpenApi = ({ accounts }: { accounts: boolean }) =>
  accounts ? (
    <a href="/api/v1/openapi.json" class={link}>
      <code>
        <UrlPath path="/api/v1/openapi.json" />
      </code>
    </a>
  ) : (
    <code>
      <UrlPath path="/api/v1/openapi.json" />
    </code>
  )

// What `claude mcp list` prints for a server it reached, its own check mark included.
const CONNECTED = '✔ Connected' // taste-skill-ignore: the CLI's output, quoted in a code sample, not an icon

// The command that connects Claude Code to the MCP server of the deployment at `origin`.
const McpAdd = ({ origin }: { origin: string }) => (
  <Code label="Shell">{`
claude mcp add --transport http crossfeed ${origin}/mcp \\
  --header "Authorization: Bearer $CROSSFEED_API_KEY"

claude mcp list   # crossfeed: ${origin}/mcp (HTTP) - ${CONNECTED}
`}</Code>
)

// The note every page carries while accounts are off, as in production until the product opens.
const Closed = () => (
  <p class="rounded-xl bg-muted px-4 py-3">
    Accounts aren&apos;t open on this deployment yet, so its API and MCP server answer 404 here. These pages describe
    them as they work once accounts are open.
  </p>
)

type Section = { id: string; title: string; body: Child }
type Page = { path: Path; lede: Child; sections: Section[] }

// The docs' nav: a link to each page, the one on view current, then the spec list, where each way in
// is. Under 1024px it's a disclosure at the top of the page, which opens in the page's flow; from 1024px
// it's open beside the article whatever its state (style.css, data-docs-nav), and stays in view.
const DocsNav = ({ path, accounts }: { path: Path; accounts: boolean }) => {
  const spec: [string, Child][] = [
    ['API', <code>/api/v1</code>],
    ['OpenAPI', <OpenApi accounts={accounts} />],
    ['MCP', <code>/mcp</code>],
    ['Auth', <code>Bearer cf_live_…</code>],
    [
      'For agents',
      <a href="/llms.txt" class={link}>
        <code>/llms.txt</code>
      </a>
    ]
  ]
  return (
    <nav aria-label="Developer docs" class="lg:sticky lg:top-8 lg:self-start">
      <details data-docs-nav class="group/docs">
        <summary class="flex h-11 list-none items-center gap-2 rounded-xl bg-muted px-4 transition-colors select-none hover:bg-secondary [&::-webkit-details-marker]:hidden">
          <span class="font-medium">
            Developer docs<span class="vh">: </span>
          </span>
          <span class="min-w-0 truncate text-muted-foreground">{PAGES.find((p) => p.path === path)?.title}</span>
          <ChevronDown class="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-open/docs:rotate-180" />
        </summary>
        <div class="max-lg:pt-3 max-lg:pb-4 lg:type-ui">
          <ol class="-mx-3 flex flex-col gap-0.5">
            {PAGES.map((p) => (
              <li>
                <a
                  href={p.path}
                  aria-current={p.path === path ? 'page' : undefined}
                  class="flex min-h-11 items-center rounded-lg px-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-[current]:bg-muted aria-[current]:font-medium aria-[current]:text-foreground lg:min-h-9"
                >
                  {p.title}
                </a>
              </li>
            ))}
          </ol>
          <dl class="mt-8 flex flex-col gap-3">
            {spec.map(([term, value]) => (
              <div>
                <dt class="type-caption text-muted-foreground">{term}</dt>
                <dd class="type-ui">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </details>
    </nav>
  )
}

// The page's sections, from 1440px, beside the article and in view while it scrolls.
const OnThisPage = ({ sections }: { sections: Section[] }) => (
  <nav
    aria-label="On this page"
    class="hidden type-ui min-[90rem]:sticky min-[90rem]:top-8 min-[90rem]:block min-[90rem]:self-start"
  >
    <p class="font-medium">On this page</p>
    <ol class="mt-3 flex flex-col gap-2">
      {sections.map((s) => (
        <li>
          <a href={`#${s.id}`} class="text-muted-foreground transition-colors hover:text-foreground">
            {s.title}
          </a>
        </li>
      ))}
    </ol>
  </nav>
)

// A docs page: the nav, then the article (its title, lede and sections at a reading measure, and the
// way on to the next page), and from 1440px the page's sections.
function Docs({ page, accounts }: { page: Page; accounts: boolean }) {
  const at = PAGES.findIndex((p) => p.path === page.path)
  const next = PAGES[at + 1]
  return (
    <main
      class={cn(
        marketingFrame,
        'pt-2 md:pt-6 lg:grid lg:grid-cols-[220px_minmax(0,72ch)] lg:gap-x-16 lg:pt-12 min-[90rem]:grid-cols-[220px_minmax(0,72ch)_200px] min-[90rem]:justify-between'
      )}
    >
      <DocsNav path={page.path} accounts={accounts} />
      <article aria-labelledby="dk-h1" class="prose-doc max-w-[72ch] min-w-0 max-lg:mt-10">
        <h1 id="dk-h1" class="type-display text-balance">
          {at === 0 ? 'Developer docs' : PAGES[at].title}
        </h1>
        <div class="mt-6 space-y-4">
          <p>{page.lede}</p>
          {!accounts && <Closed />}
        </div>
        {page.sections.map((s) => (
          <section aria-labelledby={s.id} class="mt-16 space-y-4">
            <h2 id={s.id} class="scroll-mt-8 type-title text-balance">
              {s.title}
            </h2>
            {s.body}
          </section>
        ))}
        {next && (
          <a
            href={next.path}
            class="mt-20 flex items-baseline gap-3 rounded-xl bg-muted px-5 py-4 no-underline transition-colors hover:bg-secondary"
          >
            <span class="text-muted-foreground">
              Next<span class="vh">:</span>
            </span>
            <span class="type-title">{next.title}</span>
          </a>
        )}
      </article>
      <OnThisPage sections={page.sections} />
    </main>
  )
}

const overview = (env: Env, origin: string, tools: number): Page => ({
  path: '/docs',
  lede: (
    <>
      Programs and assistants can do for a network what its members do in the app: import the roster, plan and run
      launches, answer the agent&apos;s questions, edit drafts, and triage pitches. Approving stays with the members, in
      the app.
    </>
  ),
  sections: [
    {
      id: 'ways-in',
      title: 'Four ways in',
      body: (
        <TableScroll label="Four ways in">
          <table role="table" class="table-doc table-fold sm:min-w-[36rem]">
            <thead role="rowgroup">
              <tr role="row">
                <th role="columnheader" scope="col">
                  Way in
                </th>
                <th role="columnheader" scope="col">
                  What it is
                </th>
                <th role="columnheader" scope="col">
                  Reached with
                </th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              <tr role="row">
                <th role="rowheader" scope="row">
                  <a href="/docs/api">REST API</a>
                </th>
                <td role="cell">
                  Every resource of a network under <code>/api/v1</code>, for scripts in any language, described by an
                  OpenAPI 3.1 document.
                </td>
                <td role="cell">An API key</td>
              </tr>
              <tr role="row">
                <th role="rowheader" scope="row">
                  <a href="/docs/sdk">TypeScript SDK</a>
                </th>
                <td role="cell">
                  A typed method for every route, and helpers that wait for long work, in Node, Bun, Deno, and Workers.
                </td>
                <td role="cell">An API key and the network&apos;s ID</td>
              </tr>
              <tr role="row">
                <th role="rowheader" scope="row">
                  <a href="/docs/mcp">MCP server</a>
                </th>
                <td role="cell">
                  {tools} tools for assistants such as Claude Code, over Streamable HTTP at <code>/mcp</code>.
                </td>
                <td role="cell">An API key</td>
              </tr>
              <tr role="row">
                <th role="rowheader" scope="row">
                  <a href="/docs/agents">Skills and plugin</a>
                </th>
                <td role="cell">
                  Two Agent Skills that plan launch promos and triage guest pitches, and a Claude Code plugin that
                  installs them with the MCP server.
                </td>
                <td role="cell">
                  An API key in <code>CROSSFEED_API_KEY</code>
                </td>
              </tr>
            </tbody>
          </table>
        </TableScroll>
      )
    },
    {
      id: 'can',
      title: 'What a program can and can’t do',
      body: (
        <>
          <p>
            An API key acts for its network. It reads the network and today&apos;s usage, renames the network and sets
            its CPM, imports the roster and settles its shows, plans launches and starts their runs, answers the
            agent&apos;s questions, edits draft insertion orders, exports approved ones as CSV, reads the evidence of
            every Qloo call, loads the inbox, starts pitch runs, and edits or discards drafted replies.
          </p>
          <p>
            Only a member of the network, signed in to the app, approves an insertion order or a reply. No route or tool
            approves either (ADR 0002, approval stays in the app): an API key is held by a program that may run
            unattended, and a plan or an email never ships without a person. An order exports only once a member has
            approved it; until then its export answers 409 <code>conflict</code>. Members, invites, API keys, the
            network&apos;s own Qloo key, deleting a launch, and deleting the network are the app&apos;s too.
          </p>
          <p>
            When a run needs a decision, such as the slot budget, it waits on a question for a person. A program relays
            the question and answers with that person&apos;s words.
          </p>
        </>
      )
    },
    {
      id: 'keys',
      title: 'API keys',
      body: (
        <>
          <p>
            An owner makes a key in the network&apos;s settings, under API keys, and sees its secret once. The settings
            show the network&apos;s ID under the keys. Send the key with every request:
          </p>
          <Code label="HTTP">Authorization: Bearer cf_live_…</Code>
          <p>
            A key reaches its own network alone: to it, every other network is the same 404 <code>not_found</code>. Keys
            don&apos;t expire. Revoking one stops it at once, and its next request answers 401 <code>unauthorized</code>
            . A member&apos;s session reaches the API too, from Crossfeed&apos;s own pages; programs use a key.
          </p>
        </>
      )
    },
    {
      id: 'long-work',
      title: 'Long work',
      body: (
        <>
          <p>
            An import, a comp search, an inbox load, and a run answer 202 at once with the resource as it stands; read
            the resource until the work settles. A run is <code>running</code>, or <code>waiting</code> on its question;
            then <code>completed</code>, or <code>stopped</code> or <code>failed</code> with the reason in{' '}
            <code>error</code>. With a made-up roster:
          </p>
          <Code label="Shell">{`
export CROSSFEED=${origin}
export CROSSFEED_API_KEY=cf_live_…   # from the network's settings
export NETWORK_ID=${NETWORK_ID}

curl -X POST "$CROSSFEED/api/v1/networks/$NETWORK_ID/roster" \\
  -H "Authorization: Bearer $CROSSFEED_API_KEY" \\
  -H 'Content-Type: text/csv' \\
  --data-binary $'name,downloads\\nDeep Cuts,12000\\nField Notes,8000\\n'

# 202, the new shows pending. Read the roster until its status is "settled":
curl "$CROSSFEED/api/v1/networks/$NETWORK_ID/roster" -H "Authorization: Bearer $CROSSFEED_API_KEY"
`}</Code>
        </>
      )
    },
    {
      id: 'limits',
      title: 'Limits',
      body: (
        <>
          <TableScroll label="Limits">
            <table role="table" class="table-doc table-fold sm:min-w-[30rem]">
              <thead role="rowgroup">
                <tr role="row">
                  <th role="columnheader" scope="col">
                    Limit
                  </th>
                  <th role="columnheader" scope="col">
                    How much
                  </th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                <tr role="row">
                  <th role="rowheader" scope="row">
                    Requests
                  </th>
                  <td role="cell">
                    {REQUESTS_A_MINUTE} requests a minute per API key, the MCP server&apos;s included; past it, 429{' '}
                    <code>rate_limited</code>
                  </td>
                </tr>
                <tr role="row">
                  <th role="rowheader" scope="row">
                    Model runs
                    <span class="block font-normal text-muted-foreground">
                      a launch run, an inbox load, or a pitch run
                    </span>
                  </th>
                  <td role="cell">
                    {cap(env.RUN_VISITOR_DAILY_CAP)} a day per network; past it, 429 <code>limit</code>
                  </td>
                </tr>
                <tr role="row">
                  <th role="rowheader" scope="row">
                    Qloo calls
                  </th>
                  <td role="cell">
                    {cap(env.QLOO_VISITOR_DAILY_CALL_CAP)} a day per network, counted on the network&apos;s own Qloo key
                    apart from everyone else&apos;s once an owner adds one
                  </td>
                </tr>
                <tr role="row">
                  <th role="rowheader" scope="row">
                    A run
                  </th>
                  <td role="cell">
                    At most {MAX_TURNS} model turns and {MAX_QLOO_CALLS} Qloo calls
                  </td>
                </tr>
                <tr role="row">
                  <th role="rowheader" scope="row">
                    Launches
                  </th>
                  <td role="cell">At most {cap(env.LAUNCHES_PER_NETWORK)} a network keeps at once</td>
                </tr>
                <tr role="row">
                  <th role="rowheader" scope="row">
                    Roster
                  </th>
                  <td role="cell">At most {MAX_SHOWS} shows</td>
                </tr>
                <tr role="row">
                  <th role="rowheader" scope="row">
                    Inbox
                  </th>
                  <td role="cell">
                    At most {MAX_PITCHES} pitches of up to {MAX_PITCH_CHARS.toLocaleString('en-US')} characters each
                  </td>
                </tr>
                <tr role="row">
                  <th role="rowheader" scope="row">
                    Uploads
                  </th>
                  <td role="cell">{`${MAX_UPLOAD_BYTES / 1024 / 1024}\u00a0MB a body`}</td>
                </tr>
              </tbody>
            </table>
          </TableScroll>
          <p>
            A day is a UTC day, and counts reset at 00:00 UTC. A network counts as one visitor of its own, so its
            members&apos; pages and its keys share its daily counts, beside the limits for everyone in the{' '}
            <a href="/terms">beta terms</a>. Settings shows the network&apos;s usage, and so does{' '}
            <code>GET /api/v1/networks/{'{networkId}'}/usage</code>.
          </p>
        </>
      )
    },
    {
      id: 'errors',
      title: 'Errors',
      body: (
        <>
          <p>Every refusal is JSON, with a stable code to branch on and a message for a person that says what to do:</p>
          <Code label="JSON">
            {JSON.stringify(
              {
                error: {
                  code: 'conflict',
                  message:
                    'The roster already has shows. Import with replace=true to import over it: shows already on it keep their matches.'
                }
              },
              null,
              2
            )}
          </Code>
          <TableScroll label="Error codes">
            <table role="table" class="table-doc table-fold sm:min-w-[32rem]">
              <thead role="rowgroup">
                <tr role="row">
                  <th role="columnheader" scope="col">
                    Code
                  </th>
                  <th role="columnheader" scope="col" class="sm:text-right">
                    Status
                  </th>
                  <th role="columnheader" scope="col">
                    When
                  </th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {(Object.keys(MEANS) as (keyof typeof MEANS)[]).map((code) => (
                  <tr role="row">
                    <th role="rowheader" scope="row">
                      <code>{code}</code>
                    </th>
                    <td role="cell" class="sm:text-right">
                      {STATUSES[code]}
                    </td>
                    <td role="cell">
                      <Prose text={MEANS[code]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </>
      )
    }
  ]
})

// The OpenAPI document's pieces the reference reads.
type Doc = ReturnType<typeof apiDocument>
type Operation = {
  tags?: string[]
  summary?: string
  description?: string
  parameters?: { name: string; in: string; required?: boolean; description?: string }[]
  requestBody?: { required?: boolean; content: Record<string, { schema?: { $ref?: string } }> }
  responses: Record<string, { description: string; content?: Record<string, { schema?: { $ref?: string } }> }>
}
const METHODS = ['get', 'post', 'patch', 'put', 'delete'] as const
const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
const schemaName = (schema?: { $ref?: string }) => schema?.$ref?.split('/').at(-1)

// Every route the document describes, in its order, with its method.
const routesOf = (doc: Doc) =>
  Object.entries(doc.paths ?? {}).flatMap(([path, item]) =>
    METHODS.flatMap((method) => {
      const op = (item as Record<string, Operation | undefined>)[method]
      return op ? [{ method: method.toUpperCase(), path, op, id: slug(op.summary ?? `${method} ${path}`) }] : []
    })
  )
type Route = ReturnType<typeof routesOf>[number]

// A route's method, as a mono chip as wide as the widest, so the paths after them line up.
const Method = ({ method }: { method: string }) => (
  <code class={badgeVariants({ className: 'min-w-14 justify-center align-top' })}>{method}</code>
)

// One route as the reference sets it: what it does, then a compact table of what it takes and what it
// answers, each parameter, the body, each answer, and the refusals with their codes.
function RouteEntry({ route }: { route: Route }) {
  const { op } = route
  const params = (op.parameters ?? []).filter((p) => p.name !== 'networkId')
  const answers = Object.entries(op.responses)
  const ok = answers.filter(([status]) => Number(status) < 400)
  const refusals = answers.filter(([status]) => Number(status) >= 400).map(([status]) => status)
  const body = op.requestBody && Object.entries(op.requestBody.content)
  return (
    <div class="space-y-3 pt-8 first-of-type:pt-0">
      <h3 id={route.id} class="scroll-mt-8 font-semibold">
        {op.summary}
      </h3>
      <p class="flex items-baseline gap-2">
        <Method method={route.method} />{' '}
        <code class="min-w-0 bg-transparent p-0">
          <UrlPath path={route.path} />
        </code>
      </p>
      {op.description && (
        <p>
          <Prose text={op.description} />
        </p>
      )}
      <table class="table-doc">
        <colgroup>
          <col class="w-32 sm:w-40" />
          <col />
        </colgroup>
        <tbody>
          {params.map((p) => (
            <tr>
              <th scope="row">
                <code>{p.name}</code>
              </th>
              <td>
                {p.in === 'query' ? 'In the query, optional. ' : ''}
                {p.description && <Prose text={p.description} />}
              </td>
            </tr>
          ))}
          {body && (
            <tr>
              <th scope="row">Body</th>
              <td>
                {body.map(([type, { schema }], i) => (
                  <>
                    {i > 0 && ', or '}
                    <code>{type}</code>
                    {schemaName(schema) && (
                      <>
                        {' '}
                        (<code>{schemaName(schema)}</code>)
                      </>
                    )}
                  </>
                ))}
                {!op.requestBody!.required && ', optional'}
              </td>
            </tr>
          )}
          {ok.map(([status, answer]) => {
            const shape = answer.content && Object.entries(answer.content)[0]
            return (
              <tr>
                <th scope="row">Answers {status}</th>
                <td>
                  <Prose text={answer.description} />
                  {shape && (
                    <>
                      {' '}
                      (<code>{schemaName(shape[1].schema) ?? shape[0]}</code>)
                    </>
                  )}
                </td>
              </tr>
            )
          })}
          {refusals.length > 0 && (
            <tr>
              <th scope="row">Refuses</th>
              <td>
                {refusals.map((status, i) => (
                  <>
                    {i > 0 && ', '}
                    {status}{' '}
                    {CODES[Number(status)]?.map((code, j) => (
                      <>
                        {j > 0 && ' or '}
                        <code>{code}</code>
                      </>
                    ))}
                  </>
                ))}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

const apiPage = (doc: Doc, origin: string, accounts: boolean): Page => {
  const routes = routesOf(doc)
  const tags = [...new Set(routes.flatMap((r) => r.op.tags ?? []))]
  return {
    path: '/docs/api',
    lede: (
      <>
        Every resource of a network, under{' '}
        <code>
          <UrlPath path={`${origin}${NETWORK_PATH}`} />
        </code>
        . This reference is generated from the API&apos;s OpenAPI 3.1 document, the contract its requests are validated
        against, served at <OpenApi accounts={accounts} />.
      </>
    ),
    sections: [
      {
        id: 'every-route',
        title: 'Every route',
        body: (
          <>
            <p>
              Each route takes the network&apos;s ID, from its settings, and one of its API keys as{' '}
              <code>Authorization: Bearer cf_live_…</code>. The paths below are under <code>{NETWORK_PATH}</code>.
              Bodies are JSON unless a route takes a file. The <a href="/docs#errors">errors</a> and{' '}
              <a href="/docs#limits">limits</a> are the same for every route. The inbox and pitch run routes answer 404
              while guest pitches are switched off.
            </p>
            <TableScroll label="Every route">
              <table role="table" class="table-doc table-fold sm:min-w-[36rem]">
                <thead role="rowgroup">
                  <tr role="row">
                    <th role="columnheader" scope="col">
                      Method
                    </th>
                    <th role="columnheader" scope="col">
                      Path
                    </th>
                    <th role="columnheader" scope="col">
                      What it does
                    </th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {routes.map((r) => (
                    <tr role="row">
                      <td role="cell" class="max-sm:mr-2 max-sm:inline-block">
                        <Method method={r.method} />
                      </td>
                      <td role="cell" class="max-sm:inline">
                        <code class="bg-transparent p-0">
                          <UrlPath path={r.path.replace(NETWORK_PATH, '') || '/'} />
                        </code>
                      </td>
                      <td role="cell">
                        <a href={`#${r.id}`}>{r.op.summary}</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </>
        )
      },
      ...tags.map((tag) => ({
        id: slug(tag),
        title: tag,
        body: (
          <>
            {routes
              .filter((r) => r.op.tags?.[0] === tag)
              .map((r) => (
                <RouteEntry route={r} />
              ))}
          </>
        )
      }))
    ]
  }
}

const sdkPage = (origin: string): Page => ({
  path: '/docs/sdk',
  lede: (
    <>
      <code>@crossfeed/sdk</code> is a typed client for the REST API: one network&apos;s roster, launches, and inbox,
      with one of its API keys. Its methods mirror the API&apos;s routes, typed from the OpenAPI document, and it needs
      nothing but <code>fetch</code>, so it runs in Node, Bun, Deno, and Workers.
    </>
  ),
  sections: [
    {
      id: 'install',
      title: 'Install from the repo',
      body: (
        <>
          <p>
            It isn&apos;t on npm yet. Clone the repo and build the package, then add it to your project by its path:
          </p>
          <Code label="Shell">{`
git clone https://github.com/m1kuorg/qloo.git
cd qloo/packages/sdk && bun install   # builds dist/

# then, in your project:
bun add <path to qloo>/packages/sdk   # or: npm install <path to qloo>/packages/sdk
`}</Code>
          <p>
            Bun and Deno can also import <code>packages/sdk/src/index.ts</code> as it is.
          </p>
        </>
      )
    },
    {
      id: 'client',
      title: 'Create a client',
      body: (
        <>
          <p>The client takes one of the network&apos;s API keys and its ID, both from its settings:</p>
          <Code label="TypeScript">{`
import { Crossfeed } from '@crossfeed/sdk'

const crossfeed = new Crossfeed({
  apiKey: process.env.CROSSFEED_API_KEY!, // cf_live_…
  networkId: process.env.CROSSFEED_NETWORK_ID!,
  baseUrl: '${origin}' // the default is https://crossfeed.m1kuorg.workers.dev
})
`}</Code>
          <p>
            <code>fetch</code> replaces the runtime&apos;s own, such as a service binding&apos;s in a Worker. Its
            namespaces follow the API: <code>network</code>, <code>roster</code>, <code>launches</code>,{' '}
            <code>runs</code>, <code>insertionOrders</code>, <code>evidence</code>, <code>inbox</code>,{' '}
            <code>pitchRuns</code>, and <code>replies</code>. None of them approves anything.
          </p>
        </>
      )
    },
    {
      id: 'plan',
      title: 'Plan a launch',
      body: (
        <>
          <p>
            Import the roster, settle what Qloo couldn&apos;t match on its own, then run the launch. A run asks the
            person planning it its questions, such as the slot budget: relay each one and answer with their words.
          </p>
          <Code label="TypeScript">{`
await crossfeed.roster.import('name,downloads\\nDeep Cuts,12000\\nField Notes,8000\\n')
await crossfeed.waitForRoster()
await crossfeed.roster.updateShow('Field Notes', { entityId: 'e-0102' }) // one of its candidates

const launch = await crossfeed.launches.create({ name: 'Night Shift Cinema' })
const { id: runId } = await crossfeed.runs.start(launch.id)

let run = await crossfeed.waitForRun({ launchId: launch.id, runId })
while (run.status === 'waiting') {
  const answer = await askThePerson(run.question!) // their words, such as { slots: 20 }
  await crossfeed.runs.answer(launch.id, runId, { questionId: run.question!.id, ...answer })
  run = await crossfeed.waitForRun({ launchId: launch.id, runId })
}

for (const row of run.chart!.rows) console.log(row.rank, row.show, row.band)
console.log(run.insertionOrder) // the draft, priced at the network's CPM
`}</Code>
          <p>
            <code>askThePerson</code> is yours: a prompt, a form, a message. Each question&apos;s <code>kind</code> says
            which answer fields it takes. A member approves the order on the launch&apos;s page in the app; until then{' '}
            <code>insertionOrders.exportCsv</code> rejects with <code>conflict</code>, and after, it resolves with the
            CSV the app exports.
          </p>
        </>
      )
    },
    {
      id: 'triage',
      title: 'Triage pitches',
      body: (
        <>
          <p>
            Load the day&apos;s pitches as an <code>.mbox</code> export, an <code>.eml</code>, text with a line of{' '}
            <code>---</code> between pitches, or one by one, then rank them against one of the network&apos;s shows:
          </p>
          <Code label="TypeScript">{`
await crossfeed.inbox.load({ pitches: [{ subject: 'A guest for Deep Cuts', body: '…' }] })
await crossfeed.waitForInbox()

const { id } = await crossfeed.pitchRuns.start({ show: 'Deep Cuts' })
const run = await crossfeed.waitForRun({ pitchRunId: id })
for (const reply of run.replies ?? []) console.log(reply.pitch, reply.verdict, reply.draft)
`}</Code>
          <p>A member approves each reply in the app before anyone sends it; Crossfeed sends no email.</p>
        </>
      )
    },
    {
      id: 'waits',
      title: 'Wait for long work',
      body: (
        <>
          <p>Each wait helper reads its resource until the work settles:</p>
          <ul>
            <li>
              <code>waitForRoster()</code> resolves once no show or comp search is pending.
            </li>
            <li>
              <code>waitForInbox()</code> resolves once no pitch is still being read.
            </li>
            <li>
              <code>waitForRun({'{ launchId, runId }'})</code> and <code>waitForRun({'{ pitchRunId }'})</code> resolve
              once the run is <code>completed</code>, or <code>waiting</code> on its question, and reject with{' '}
              <code>run_failed</code> or <code>run_stopped</code> when it failed or stopped.
            </li>
          </ul>
          <p>
            Each takes <code>{'{ interval, timeout, signal }'}</code>: it reads every <code>interval</code> milliseconds
            (1,000), rejects with <code>timeout</code> after <code>timeout</code> milliseconds (5 minutes), and stops at
            once when <code>signal</code> aborts.
          </p>
        </>
      )
    },
    {
      id: 'errors',
      title: 'Handle errors',
      body: (
        <>
          <p>
            Every refusal rejects with a <code>CrossfeedError</code>: the API&apos;s <code>code</code>, its{' '}
            <code>message</code> for a person, and the HTTP <code>status</code>.
          </p>
          <Code label="TypeScript">{`
import { CrossfeedError } from '@crossfeed/sdk'

try {
  await crossfeed.roster.import(csv)
} catch (error) {
  if (error instanceof CrossfeedError && error.code === 'conflict') await crossfeed.roster.import(csv, { replace: true })
  else throw error
}
`}</Code>
          <p>
            The codes are the API&apos;s, in the <a href="/docs#errors">errors table</a>. The wait helpers add{' '}
            <code>run_failed</code>, <code>run_stopped</code>, and <code>timeout</code>, with a null status, and{' '}
            <code>unexpected_response</code> is an answer that isn&apos;t one of Crossfeed&apos;s, as from a wrong{' '}
            <code>baseUrl</code>.
          </p>
        </>
      )
    }
  ]
})

type Tool = Awaited<ReturnType<typeof listedTools>>[number]

// What a tool's annotations say it does to the network.
const effect = (tool: Tool) =>
  tool.annotations?.readOnlyHint ? 'Reads' : tool.annotations?.destructiveHint ? 'Changes' : 'Adds'

const mcpPage = (tools: Tool[], origin: string): Page => ({
  path: '/docs/mcp',
  lede: (
    <>
      An MCP server at <code>{origin}/mcp</code> gives an assistant the same operations as the API, as tools, for the
      network its API key belongs to. It serves Streamable HTTP, statelessly, and takes the key as a bearer token, with
      no OAuth.
    </>
  ),
  sections: [
    {
      id: 'connect',
      title: 'Connect Claude Code',
      body: (
        <>
          <p>With one of the network&apos;s API keys in your environment:</p>
          <McpAdd origin={origin} />
          <p>
            Any MCP client that sends a header of your choice connects the same way. The{' '}
            <a href="/docs/agents">plugin</a> sets the server up with two skills that teach the assistant the flows.
          </p>
        </>
      )
    },
    {
      id: 'tools',
      title: 'Tools',
      body: (
        <>
          <p>
            The {tools.length} tools the server lists today. Each description ends with the same sentence: &ldquo;
            {RELAY}&rdquo;
          </p>
          <TableScroll label="Tools">
            <table role="table" class="table-doc table-fold sm:min-w-[36rem]">
              <thead role="rowgroup">
                <tr role="row">
                  <th role="columnheader" scope="col">
                    Tool
                  </th>
                  <th role="columnheader" scope="col">
                    What it does
                  </th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {tools.map((tool) => {
                  const shape = tool.inputSchema as { properties?: Record<string, unknown>; required?: string[] }
                  // What it takes, the fields it needs first.
                  const needs = (a: string) => (shape.required?.includes(a) ? 0 : 1)
                  const args = Object.keys(shape.properties ?? {}).sort((a, b) => needs(a) - needs(b))
                  return (
                    <tr role="row" data-tool={tool.name}>
                      <th role="rowheader" scope="row">
                        <code class="bg-transparent p-0">{tool.name}</code>
                        <span class={badgeVariants({ className: 'mt-1.5 flex' })}>{effect(tool)}</span>
                      </th>
                      <td role="cell">
                        <span class="block">
                          <Prose text={(tool.description ?? '').replace(RELAY, '').trim()} />
                        </span>
                        {args.length > 0 && (
                          <span class="mt-1.5 block text-muted-foreground">
                            Takes{' '}
                            {args.map((a, i) => (
                              <>
                                {i > 0 && ', '}
                                <code>{a}</code>
                                {shape.required?.includes(a) ? '' : ' (optional)'}
                              </>
                            ))}
                            .
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableScroll>
          <p>
            Reads change nothing; Adds create something new, such as a launch or an answer; Changes replace or edit what
            the network has. There&apos;s no approve tool, and no tool changes the network&apos;s CPM. The inbox and
            pitch run tools are listed only while guest pitches are switched on.
          </p>
        </>
      )
    },
    {
      id: 'results',
      title: 'What a tool answers',
      body: (
        <>
          <p>
            Each tool answers in short text for the assistant: where things stand and what to call next, such as the
            question a run waits on and the tool, IDs, and fields that answer it. Its structured content is the
            operation&apos;s result as the REST API answers it, with the same text again as <code>summary</code>, since
            Claude Code gives its model the structured content alone.
          </p>
          <p>
            A refusal is a tool result marked as an error, with <code>{'{ error: { code, message } }'}</code> and the
            API&apos;s codes. Only the checks before any tool runs answer with an HTTP status: 401 without a key or with
            an unknown or revoked one, 429 past {REQUESTS_A_MINUTE} requests a minute, 403 to a browser whose{' '}
            <code>Origin</code> is neither Crossfeed&apos;s nor a local one, and 404 while accounts aren&apos;t open.
          </p>
        </>
      )
    },
    {
      id: 'example',
      title: 'A launch, from the assistant’s side',
      body: (
        <>
          <p>
            Asked to plan promos for a launch, the assistant creates it, starts a run, and reads it until the run waits.
            Then it asks you the run&apos;s question as it is, and answers with your words:
          </p>
          <figure class="space-y-3">
            <figcaption class="flex flex-wrap items-center gap-2 type-ui text-muted-foreground">
              A launch through the MCP server
              <span class={badgeVariants()}>Illustration</span>
            </figcaption>
            <table class="table-doc">
              <colgroup>
                <col class="w-28" />
                <col />
              </colgroup>
              <tbody>
                {(
                  [
                    [
                      'Assistant',
                      <>
                        Calls <code>create_launch</code> with <code>{'{ "name": "Night Shift Cinema" }'}</code>, then{' '}
                        <code>start_launch_run</code>, then <code>get_launch</code> until the run waits.
                      </>
                    ],
                    [
                      'Crossfeed',
                      <>
                        Run 5f0c… is waiting on a question for the human (budget): What is the slot budget for Night
                        Shift Cinema&apos;s promos, as a slot count or a dollar amount? Ask the human this question as
                        it is, and answer with their words…
                      </>
                    ],
                    [
                      'Assistant',
                      <>
                        Crossfeed asks: what is the slot budget for Night Shift Cinema&apos;s promos, as a slot count or
                        a dollar amount?
                      </>
                    ],
                    ['You', <>20 slots.</>],
                    [
                      'Assistant',
                      <>
                        Calls <code>answer_launch_question</code> with the run&apos;s IDs and{' '}
                        <code>{'{ "slots": 20 }'}</code>, then reads the launch until the run is done.
                      </>
                    ]
                  ] as const
                ).map(([who, what]) => (
                  <tr>
                    <th scope="row">{who}</th>
                    <td>{what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </figure>
          <p>
            Once the run is done, <code>get_launch</code> has the chart and the draft insertion order, and the
            launch&apos;s page in the app, where a member approves the order.
          </p>
        </>
      )
    }
  ]
})

const agentsPage = (origin: string): Page => ({
  path: '/docs/agents',
  lede: (
    <>
      Two Agent Skills teach an assistant Crossfeed&apos;s flows through the MCP server: relaying the agent&apos;s
      questions to you word for word, and leaving approval to the app. A Claude Code plugin installs both with the
      server.
    </>
  ),
  sections: [
    {
      id: 'skills',
      title: 'The skills',
      body: (
        <>
          <TableScroll label="The skills">
            <table role="table" class="table-doc table-fold sm:min-w-[36rem]">
              <thead role="rowgroup">
                <tr role="row">
                  <th role="columnheader" scope="col">
                    Skill
                  </th>
                  <th role="columnheader" scope="col">
                    When an assistant uses it
                  </th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {Object.entries(SKILLS).map(([name, text]) => (
                  <tr role="row">
                    <th role="rowheader" scope="row">
                      <code class="bg-transparent p-0">{name}</code>
                      <a href={skillUrl(name)} class="mt-1 block w-fit font-normal">
                        SKILL.md
                      </a>
                    </th>
                    <td role="cell">{frontmatter(text).description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
          <p>
            Each is written to the <a href="https://agentskills.io/specification">Agent Skills specification</a>, with
            its fields only, so any client that reads skills can use it. Both hold the assistant to the same rules: put
            each of the agent&apos;s questions to you exactly as it&apos;s asked and answer with your words, never with
            its own; leave approval to a member, in the app, and give the page where it happens; keep guest names, email
            addresses, and sender details out of every field but the ones made for them, such as the pitches it loads;
            and explain a rank only from the Qloo evidence behind it.
          </p>
        </>
      )
    },
    {
      id: 'plugin',
      title: 'The Claude Code plugin',
      body: (
        <>
          <p>
            The plugin, <code>crossfeed</code>, sits in the repo&apos;s <code>plugins/crossfeed</code>, beside a
            marketplace file at the repo&apos;s root. It holds both skills and this MCP server config:
          </p>
          <Code file="plugins/crossfeed/.mcp.json">{mcpConfig}</Code>
          <p>
            <code>CROSSFEED_API_KEY</code> is one of the network&apos;s API keys. <code>CROSSFEED_URL</code> points it
            at another deployment, such as <code>{origin}</code>; without it, the plugin connects to{' '}
            <code>https://crossfeed.m1kuorg.workers.dev</code>. Set both in the environment Claude Code starts in.
          </p>
        </>
      )
    },
    {
      id: 'install',
      title: 'Install it',
      body: (
        <>
          <p>It isn&apos;t in a public marketplace yet. From a clone of the repo:</p>
          <Code label="Shell">{`
git clone https://github.com/m1kuorg/qloo.git
claude plugin marketplace add ./qloo
claude plugin install crossfeed@crossfeed

export CROSSFEED_API_KEY=cf_live_…   # from the network's settings
claude                                # then: "Plan promos for our launch"
`}</Code>
          <p>
            <code>claude plugin marketplace add m1kuorg/qloo</code> adds the same marketplace from GitHub for anyone who
            can read the repo.
          </p>
        </>
      )
    },
    {
      id: 'without',
      title: 'Without the plugin',
      body: (
        <>
          <p>Connect the MCP server with one of the network&apos;s API keys in your environment:</p>
          <McpAdd origin={origin} />
          <p>
            Then copy a skill&apos;s directory from <code>plugins/crossfeed/skills</code> into{' '}
            <code>~/.claude/skills</code>, or wherever your client reads skills from. Each skill&apos;s text is also
            served here, at a stable URL:{' '}
            {Object.keys(SKILLS).map((name, i) => (
              <>
                {i > 0 && ' and '}
                <a href={skillUrl(name)}>
                  <code>
                    <UrlPath path={skillUrl(name)} />
                  </code>
                </a>
              </>
            ))}
            .
          </p>
        </>
      )
    }
  ]
})

// The deployment the request reached, whose URLs the examples use.
const originOf = (c: Context) => new URL(c.req.url).origin
// A docs page on the marketing shell.
const renderPage = (c: Context<{ Bindings: Env }>, page: Page) =>
  c.render(<Docs page={page} accounts={c.env.ACCOUNTS === 'on'} />)
const shell = (title: string) => marketingShell(`${title} · Developer docs`)

docs.get('/docs', marketingShell('Developer docs'), async (c) =>
  renderPage(c, overview(c.env, originOf(c), (await listedTools()).length))
)
docs.get('/docs/api', shell('REST API'), (c) =>
  renderPage(c, apiPage(apiDocument(originOf(c)), originOf(c), c.env.ACCOUNTS === 'on'))
)
docs.get('/docs/sdk', shell('TypeScript SDK'), (c) => renderPage(c, sdkPage(originOf(c))))
docs.get('/docs/mcp', shell('MCP server'), async (c) => renderPage(c, mcpPage(await listedTools(), originOf(c))))
docs.get('/docs/agents', shell('Skills and plugin'), (c) => renderPage(c, agentsPage(originOf(c))))

// Each skill's text, as its SKILL.md holds it.
docs.get('/docs/agents/:name/SKILL.md', (c) => {
  const name = c.req.param('name')
  if (!Object.hasOwn(SKILLS, name)) return c.notFound()
  return c.body(SKILLS[name as keyof typeof SKILLS], 200, { 'Content-Type': 'text/markdown; charset=utf-8' })
})

// The docs for agents, as llms.txt (llmstxt.org) sets them out: what Crossfeed is and the rules a
// program works by, then links. While accounts are off it links nothing they'd hide.
docs.get('/llms.txt', (c) => {
  const origin = originOf(c)
  const accounts = c.env.ACCOUNTS === 'on'
  const link = (title: string, path: string, note: string) => `- [${title}](${origin}${path}): ${note}`
  const lines = [
    '# Crossfeed',
    '',
    "> Crossfeed ranks a podcast network's own shows by how much their listeners overlap a launch's, in Qloo, and drafts the promo plan as an insertion order that a member of the network approves. Programs and assistants drive it for one network through a REST API, a TypeScript SDK, and an MCP server, each reached with one of the network's API keys. None of them can approve.",
    '',
    "- Authenticate with `Authorization: Bearer cf_live_…`, a key an owner makes in the network's settings. A key reaches its own network alone.",
    '- No route or tool approves an insertion order or a reply: a member does, in the app. When a run waits on a question, put it to the person as it is and answer with their words.',
    '- Long work answers 202; read the resource until it settles. A refusal is `{ "error": { "code", "message" } }` with a stable code.',
    '- Examples in these docs use made-up shows and IDs.',
    ...(accounts ? [] : ["- Accounts aren't open on this deployment yet, so its API and MCP server answer 404 here."]),
    '',
    '## Docs',
    '',
    ...PAGES.map((p) => link(p.title, p.path, p.holds)),
    '',
    '## Reference',
    '',
    ...(accounts ? [link('OpenAPI document', '/api/v1/openapi.json', "the API's OpenAPI 3.1 contract")] : []),
    ...Object.entries(SKILLS).map(([name, text]) =>
      link(`The ${name} skill`, skillUrl(name), frontmatter(text).description)
    ),
    '',
    '## Optional',
    '',
    link('Privacy', '/privacy', 'what reaches Qloo and Anthropic, and what Crossfeed keeps'),
    link('Beta terms', '/terms', "the free beta's terms and daily limits")
  ]
  return c.text(`${lines.join('\n')}\n`)
})
