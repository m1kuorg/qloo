// The marketing pages: the landing page at /, the privacy page, the beta terms, and the developer
// docs, all server-rendered with no React island, and /llms.txt.
import { env, exports } from 'cloudflare:workers'
import { afterEach, describe, expect, it } from 'vitest'
import inbox from '../src/sample-inbox.json'
import network from '../src/sample-network.json'
import { REFUSALS } from '../src/refusal'
import { networkWithKey } from './session'

const origin = 'https://crossfeed.test'
const get = (path: string) => exports.default.fetch(`${origin}${path}`)
const page = async (path: string) => {
  const res = await get(path)
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toMatch(/^text\/html/)
  return res.text()
}
// The page's main landmark, where its calls to action are.
const main = (html: string) => html.match(/<main[^>]*>([\s\S]*)<\/main>/)?.[1] ?? ''
// Every link's href, in document order.
const hrefs = (html: string) => [...html.matchAll(/<a [^>]*href="([^"]*)"/g)].map((m) => m[1])
// The page's text, without its markup.
const words = (html: string) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')

const vars = {
  ACCOUNTS: env.ACCOUNTS,
  NETWORKS_PER_MEMBER: env.NETWORKS_PER_MEMBER,
  LAUNCHES_PER_NETWORK: env.LAUNCHES_PER_NETWORK,
  GUEST_PITCHES: env.GUEST_PITCHES,
  RUN_VISITOR_DAILY_CAP: env.RUN_VISITOR_DAILY_CAP
}
afterEach(() => Object.assign(env, vars))

const pages = ['/', '/privacy', '/terms', '/docs', '/docs/api', '/docs/sdk', '/docs/mcp', '/docs/agents']
// Every name the demo looks up in Qloo, and every work its sample inbox pitches: a marketing page
// that showed one would be showing what Qloo returned for it.
const looked = [
  ...network.shows.map((s) => s.name),
  network.launch.name,
  ...inbox.pitches.flatMap((p) => (p.expected.work ? [p.expected.work.title] : [])),
  ...inbox.show.pastGuests.map((g) => g.work.title)
]

describe('the landing page', () => {
  it('serves / with no React island, and its first call to action opens the sample network', async () => {
    const html = await page('/')
    expect(html).not.toContain('id="root"')
    expect(html).not.toContain('client/main.tsx')
    expect(hrefs(main(html))[0]).toBe('/demo')
    expect(main(html)).toMatch(/<a [^>]*href="\/demo"[^>]*>Open the sample network<\/a>/)
  })

  it('labels its chart an illustration of made-up shows, and no marketing page shows Qloo data', async () => {
    const html = await page('/')
    expect(words(html)).toMatch(/Illustration: a made-up network, launch, shows, ranks, and tags\. Not Qloo data\./)
    expect(words(html)).toContain('Dead Air Archive')
    for (const path of pages) {
      const text = words(await page(path))
      for (const name of looked) expect(text, `${path} names ${name}`).not.toContain(name)
      // Qloo's affinities are decimals; the chart shows ranks and bands only.
      expect(text, path).not.toMatch(/\b0?\.\d{2,}\b/)
    }
  })

  it('links nowhere behind accounts while they are off', async () => {
    env.ACCOUNTS = 'off'
    for (const path of pages) {
      const html = await page(path)
      for (const href of hrefs(html)) expect(href, path).not.toMatch(/^\/(app|sign-in|invite|api|mcp)\b/)
      expect(html).not.toContain('Create your network')
      expect(html).not.toContain('Sign in')
    }
  })

  it('offers to create a network and to sign in while accounts are on', async () => {
    env.ACCOUNTS = 'on'
    const html = await page('/')
    expect(main(html)).toMatch(/<a [^>]*href="\/app\/new"[^>]*>Create your network<\/a>/)
    expect(html).toMatch(/<a [^>]*href="\/sign-in"[^>]*>Sign in<\/a>/)
    expect(hrefs(main(html))[0]).toBe('/demo')
  })

  it('says how a run works, what Crossfeed never does, and where developers start', async () => {
    const text = words(await page('/'))
    for (const heading of ['How a run works', 'Evidence on every line', 'What Crossfeed never does', 'For developers'])
      expect(text).toContain(heading)
    expect(text).toContain("Sends a guest's name or a pitch to Qloo.")
    expect(text).toContain('Approves anything for you.')
    expect(hrefs(await page('/'))).toContain('/docs')
  })

  it('shows the booking inbox only while guest pitches are on', async () => {
    env.GUEST_PITCHES = 'off'
    expect(words(await page('/'))).not.toContain('The booking inbox')
    env.GUEST_PITCHES = 'on'
    expect(words(await page('/'))).toContain('The booking inbox')
  })
})

describe('the privacy page and the beta terms', () => {
  it('are linked from every marketing page', async () => {
    for (const path of pages) {
      const footer = (await page(path)).match(/<footer[\s\S]*<\/footer>/)?.[0] ?? ''
      expect(hrefs(footer), path).toEqual(expect.arrayContaining(['/privacy', '/terms']))
    }
  })

  it('says what reaches Qloo and Anthropic, what Crossfeed keeps, and how deletion works', async () => {
    const text = words(await page('/privacy'))
    for (const heading of ['What reaches Qloo', 'What reaches Anthropic', 'What Crossfeed keeps', 'How deletion works'])
      expect(text).toContain(heading)
    expect(text).toContain("Never a pitch's text, a guest's name, an email address, or a sender's details.")
    expect(text).toContain('Crossfeed never stores your IP address or writes it to its own logs.')
    expect(text).toContain("Crossfeed can't delete a session yet")
    expect(text).toContain(
      "Uploads: a file you upload is read in your browser, or by Crossfeed when a program sends it to the API. A roster file's text is sent and imported like pasted names; of pitch emails, only each one's sender, subject, and text are sent, never its attachments or other headers. The files themselves aren't kept."
    )
  })

  it('says the beta is free, without warranty, and limited as the Worker is configured', async () => {
    env.RUN_VISITOR_DAILY_CAP = '7'
    const text = words(await page('/terms'))
    for (const heading of ['Free', 'No warranty', 'Daily limits', 'Acceptable use']) expect(text).toContain(heading)
    expect(text).toContain('Model runs a launch run, an inbox load, or a pitch run 7 200')
    expect(text).toContain('Qloo calls cache hits count for a visitor, not for everyone 2,000 1,000')
    expect(text).toContain('A run makes at most 12 model turns and 60 Qloo calls')
  })

  it('say what an account keeps, how many networks a member can create and launches a network can keep, and the per-minute limits, only while accounts are on', async () => {
    env.NETWORKS_PER_MEMBER = '2'
    env.LAUNCHES_PER_NETWORK = '40'
    const kept = 'With an account: your name'
    const approvals = 'with the member who approved each reply'
    const counts = "each visitor's and each network's counts for the day"
    const cap = 'A member can create at most 2 networks, and a network can keep at most 40 launches at once.'
    const network =
      "A network counts as one visitor of its own, whichever of its members makes the network's calls and runs."
    const keys = "A network's API keys are kept only as hashes"
    const signOff =
      'the name of the member or API key that started each run, and of the member who approved each insertion order, and when'
    const launchGone =
      "Deleting a launch, which any of the network's members can do, wipes its storage: its runs, insertion orders, the roster copies, and their Qloo records."
    const networkGone =
      "Deleting a network, which only an owner can do, deletes its memberships, invite links, and API keys at once, then wipes its own storage, each of its launches', and its Qloo storage. A wipe that fails is tried again by the next day's cleanup, which also deletes expired sessions, sign-in challenges, and invite links."
    const accountGone =
      "Deleting your account, on your account page, deletes your account with its name, passkeys, recovery code, sessions, and memberships at once. What you did in a network stays with it: its launches keep your name on the runs you started and the orders you approved, and its API keys and invite links you made stay, made by no one. It's refused while you're a network's only owner. “Sign out everywhere” deletes every session of yours."
    const perMinute = "Each API key, and each visitor's sign-in requests, are also limited per minute"
    const ownKey =
      "A network's own Qloo key, if an owner adds one, is kept encrypted in the network's own Qloo storage, with the host it's for and its last four characters, the only part of it anyone is shown."
    const ownKeySent =
      'A network that adds its own Qloo key sends its requests with that key instead, to the Qloo host it chose.'
    const keyGone =
      "Removing a network's own Qloo key, which only an owner can do, wipes its Qloo storage at once: the key, its cached answers, and its counts."
    const ownKeyTerms =
      "A network's owner can add the network's own Qloo key in its settings; its Qloo calls then run on that key, under the owner's own agreement with Qloo."
    const ownKeyLimits =
      "A network with its own Qloo key counts its Qloo calls on that key, apart from everyone else's, against the same limits; its model runs count with everyone's."
    expect(words(await page('/privacy'))).toContain(kept)
    expect(words(await page('/privacy'))).toContain(approvals)
    expect(words(await page('/privacy'))).toContain(counts)
    expect(words(await page('/privacy'))).toContain(keys)
    expect(words(await page('/privacy'))).toContain(signOff)
    expect(words(await page('/privacy'))).toContain(launchGone)
    expect(words(await page('/privacy'))).toContain(networkGone)
    expect(words(await page('/privacy'))).toContain(accountGone)
    for (const line of [ownKey, ownKeySent, keyGone]) expect(words(await page('/privacy'))).toContain(line)
    for (const line of [ownKeyTerms, ownKeyLimits]) expect(words(await page('/terms'))).toContain(line)
    expect(words(await page('/terms'))).toContain(cap)
    expect(words(await page('/terms'))).toContain(network)
    expect(words(await page('/terms'))).toContain(perMinute)
    env.ACCOUNTS = 'off'
    expect(words(await page('/privacy'))).not.toContain(kept)
    expect(words(await page('/privacy'))).not.toContain(keys)
    expect(words(await page('/privacy'))).not.toContain(approvals)
    expect(words(await page('/privacy'))).not.toContain(launchGone)
    expect(words(await page('/privacy'))).not.toContain(accountGone)
    for (const line of [ownKey, ownKeySent, keyGone]) expect(words(await page('/privacy'))).not.toContain(line)
    for (const line of [ownKeyTerms, ownKeyLimits]) expect(words(await page('/terms'))).not.toContain(line)
    expect(words(await page('/privacy'))).toContain("each visitor's counts for the day")
    expect(words(await page('/terms'))).not.toContain(cap)
    expect(words(await page('/terms'))).not.toContain(network)
    expect(words(await page('/terms'))).not.toContain(perMinute)
  })
})

describe('the developer docs', () => {
  const docs = ['/docs', '/docs/api', '/docs/sdk', '/docs/mcp', '/docs/agents']

  it('open on what programs can and cannot do, API keys, limits, and every error code', async () => {
    const html = await page('/docs')
    expect(html).not.toContain('id="root"')
    const text = words(main(html))
    expect(text).toContain('Approving stays with the members, in the app.')
    expect(text).toContain('No route or tool approves either (ADR 0002, approval stays in the app)')
    expect(text).toContain('Authorization: Bearer cf_live_…')
    expect(text).toContain('120 requests a minute')
    expect(text).toContain(`${env.RUN_VISITOR_DAILY_CAP} a day per network`)
    for (const [code, status] of Object.entries(REFUSALS)) expect(text).toMatch(new RegExp(`\\b${code} ${status}\\b`))
    expect(text).toMatch(/\binternal 500\b/)
    for (const path of docs) expect(hrefs(main(html)), path).toContain(path)
  })

  it('describe every route of the API from its OpenAPI document, and link the document', async () => {
    const doc = await (
      await get('/api/v1/openapi.json')
    ).json<{
      paths: Record<string, Record<string, { summary: string }>>
    }>()
    const html = await page('/docs/api')
    const text = words(main(html))
    const routes = Object.entries(doc.paths).flatMap(([path, item]) =>
      Object.entries(item).map(([m, op]) => ({ path, method: m.toUpperCase(), op }))
    )
    expect(routes.length).toBeGreaterThan(20)
    for (const { path, method, op } of routes) {
      expect(text).toContain(`${method} ${path}`)
      expect(text).toContain(op.summary)
    }
    expect(hrefs(main(html))).toContain('/api/v1/openapi.json')
  })

  it.each(['off', 'on'])(
    'list every tool the MCP server lists with guest pitches %s, and how to connect it',
    async (pitches) => {
      env.GUEST_PITCHES = pitches
      const { secret } = await networkWithKey()
      const res = await exports.default.fetch(`${origin}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${secret}`
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
      })
      const listed = JSON.parse((await res.text()).replace(/^[\s\S]*?data:/, '')).result.tools as { name: string }[]
      expect(listed.length).toBe(pitches === 'on' ? 18 : 12)
      const html = await page('/docs/mcp')
      const tools = [...main(html).matchAll(/<th scope="row"><code>([a-z_]+)<\/code>/g)].map((m) => m[1])
      expect(tools).toEqual(listed.map((t) => t.name))
      const text = words(main(html))
      expect(text).toContain(`The ${listed.length} tools the server lists today.`)
      expect(text).toContain(
        'claude mcp add --transport http crossfeed https://crossfeed.test/mcp \\ --header "Authorization: Bearer $CROSSFEED_API_KEY"'
      )
      expect(text).not.toMatch(/approve_/)
    }
  )

  it('say how to install the SDK from the repo, make a client, wait for long work, and handle errors', async () => {
    const text = words(main(await page('/docs/sdk')))
    expect(text).toContain('git clone https://github.com/m1kuorg/qloo.git')
    expect(text).toContain('bun add <path to qloo>/packages/sdk')
    expect(text).toContain("baseUrl: 'https://crossfeed.test'")
    for (const helper of [
      'waitForRoster()',
      'waitForInbox()',
      'waitForRun({ launchId, runId })',
      'waitForRun({ pitchRunId })'
    ])
      expect(text).toContain(helper)
    for (const code of ['CrossfeedError', 'run_failed', 'run_stopped', 'timeout', 'unexpected_response'])
      expect(text).toContain(code)
  })

  it("serve each skill's text at a stable URL, with only the Agent Skills spec's fields, and say how to install the plugin", async () => {
    const html = await page('/docs/agents')
    const text = words(main(html))
    const skills = [...new Set(hrefs(main(html)).filter((href) => href.endsWith('/SKILL.md')))]
    expect(skills).toEqual(['/docs/agents/plan-launch-promos/SKILL.md', '/docs/agents/triage-guest-pitches/SKILL.md'])
    for (const url of skills) {
      const res = await get(url)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toMatch(/^text\/markdown/)
      const skill = await res.text()
      const fields = Object.fromEntries(
        [...skill.match(/^---\n([\s\S]*?)\n---\n/)![1].matchAll(/^(\S+): (.+)$/gm)].map((m) => [m[1], m[2]])
      )
      expect(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']).toEqual(
        expect.arrayContaining(Object.keys(fields))
      )
      expect(fields.name).toBe(url.split('/')[3])
      expect(fields.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(fields.name.length).toBeLessThanOrEqual(64)
      expect(fields.description.length).toBeGreaterThan(0)
      expect(fields.description.length).toBeLessThanOrEqual(1024)
      expect(fields.compatibility.length).toBeLessThanOrEqual(500)
      expect(text).toContain(fields.description)
      // Each one relays the agent's questions as they are, and leaves approval to the app.
      expect(skill).toContain('put the question to the human exactly as the tool gives it')
      expect(skill).toContain('Never invent an answer')
      expect(skill).toContain('you never approve one')
    }
    expect(text).toContain('claude plugin marketplace add ./qloo claude plugin install crossfeed@crossfeed')
    expect(text).toContain('"Authorization": "Bearer ${CROSSFEED_API_KEY}"')
    expect(text).toContain('"url": "${CROSSFEED_URL:-https://crossfeed.m1kuorg.workers.dev}/mcp"')
    expect((await get('/docs/agents/approve-orders/SKILL.md')).status).toBe(404)
  })

  it('describe the API, the SDK, and the MCP server in /llms.txt, linking every docs page', async () => {
    const res = await get('/llms.txt')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/^text\/plain/)
    const text = await res.text()
    expect(text).toMatch(/^# Crossfeed\n\n> \S/)
    for (const path of docs) expect(text).toContain(`](${origin}${path})`)
    for (const surface of ['REST API', 'TypeScript SDK', 'MCP server']) expect(text).toContain(surface)
    expect(text).toContain(`](${origin}/api/v1/openapi.json)`)
    expect(text).toContain(`](${origin}/docs/agents/plan-launch-promos/SKILL.md)`)
    env.ACCOUNTS = 'off'
    const closed = await (await get('/llms.txt')).text()
    expect(closed).not.toMatch(/\]\(https:\/\/crossfeed\.test\/(api|mcp|app|sign-in)\b/)
    expect(closed).toContain(`](${origin}/docs/mcp)`)
  })

  it("are linked from the landing page's developers band and the top bar's Developers", async () => {
    const html = await page('/')
    const band = html.match(/<section id="developers"[\s\S]*?<\/section>/)?.[0] ?? ''
    for (const path of docs) expect(hrefs(band), path).toContain(path)
    for (const path of ['/', ...docs]) {
      const top = (await page(path)).match(/<header[\s\S]*?<\/header>/)?.[0] ?? ''
      expect(top).toMatch(
        path.startsWith('/docs')
          ? /<a [^>]*href="\/docs" aria-current="page">Developers<\/a>/
          : /<a [^>]*href="\/docs">Developers<\/a>/
      )
    }
  })
})
