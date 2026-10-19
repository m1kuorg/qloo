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

  it('offers to create a network only while accounts are on', async () => {
    expect(await (await get('/demo')).text()).toMatch(/<a [^>]*href="\/app\/new"[^>]*>Create your network<\/a>/)
    env.ACCOUNTS = 'off'
    expect(await (await get('/demo')).text()).not.toContain('Create your network')
  })

  it('takes an old /inbox link to the sample inbox for good, and / to the demo for now', async () => {
    const inbox = await get('/inbox', { redirect: 'manual' })
    expect(inbox.status).toBe(301)
    expect(inbox.headers.get('location')).toBe('/demo/inbox')
    const root = await get('/', { redirect: 'manual' })
    expect(root.status).toBe(302)
    expect(root.headers.get('location')).toBe('/demo')
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
