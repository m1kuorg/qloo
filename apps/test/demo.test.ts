// The demo's routes: the sample network any visitor opens at /demo, without signing in.
import { env, exports } from 'cloudflare:workers'
import { afterEach, describe, expect, it } from 'vitest'

const origin = 'https://crossfeed.test'
const get = (path: string, init?: RequestInit) => exports.default.fetch(`${origin}${path}`, init)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// The session cookie a response sets, by its value.
const sessionSet = (res: Response) => res.headers.get('set-cookie')?.match(/^crossfeed_session=([^;]*)/)?.[1]

const accounts = env.ACCOUNTS
afterEach(() => {
  env.ACCOUNTS = accounts
})

describe('the demo', () => {
  it('serves the roster page at /demo and gives a new visitor a session', async () => {
    const page = await get('/demo')
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('data-page="roster"')
    expect(sessionSet(page)).toMatch(UUID)
  })

  it('tells the island its agent path and its links', async () => {
    const page = await get('/demo')
    expect(await page.text()).toContain(
      '<div id="root" data-page="roster" data-agent-path="/agents/session" data-roster-link="/demo">'
    )
  })

  it('offers to sign in and to create a network only while accounts are on', async () => {
    const html = await (await get('/demo')).text()
    expect(html).toMatch(/<a [^>]*href="\/app\/new"[^>]*>Create your network<\/a>/)
    expect(html).toMatch(/<a [^>]*href="\/sign-in"[^>]*>Sign in<\/a>/)
    env.ACCOUNTS = 'off'
    const closed = await (await get('/demo')).text()
    expect(closed).not.toContain('Create your network')
    expect(closed).not.toContain('/sign-in')
  })

  it("keeps the island's slots for the sample network's name and notice, empty, in the top bar", async () => {
    const bar = (await (await get('/demo')).text()).match(/<header[\s\S]*?<\/header>/)?.[0] ?? ''
    expect(bar).toMatch(/<span\b[^>]*\sid="shell-network"[^>]*><\/span>/)
    expect(bar).toMatch(/<span\b[^>]*\sid="shell-notice"[^>]*><\/span>/)
  })

  it('takes an old /inbox link to the sample inbox for good', async () => {
    const inbox = await get('/inbox', { redirect: 'manual' })
    expect(inbox.status).toBe(301)
    expect(inbox.headers.get('location')).toBe('/demo/inbox')
  })

  it("replaces a session cookie that isn't a UUID, and reaches no agent with it", async () => {
    const forged = { Cookie: 'crossfeed_session=someone-else' }
    const page = await get('/demo', { headers: forged })
    expect(sessionSet(page)).toMatch(UUID)

    const upgrade = await get('/agents/session', { headers: { Upgrade: 'websocket', ...forged } })
    expect(upgrade.status).toBe(401)
    expect(upgrade.webSocket).toBeNull()
    expect((await get('/api/insertion-orders/IO-0001.csv', { headers: forged })).status).toBe(401)
  })

  it('keeps a session cookie it gave', async () => {
    const page = await get('/demo')
    const cookie = `crossfeed_session=${sessionSet(page)}`
    expect(sessionSet(await get('/demo', { headers: { Cookie: cookie } }))).toBeUndefined()
  })
})
