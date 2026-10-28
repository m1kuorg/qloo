// The retired demo (ADR 0007): its old addresses lead to signing in as a guest, which opens the guest
// network with the sample in it, and its pages, export, and per-visitor agents are gone, but for the
// engine's tests.
import { env, exports } from 'cloudflare:workers'
import { afterEach, describe, expect, it } from 'vitest'
import { openSession } from './session'

const origin = 'https://crossfeed.test'
const get = (path: string, init?: RequestInit) => exports.default.fetch(`${origin}${path}`, init)
const browser = { headers: { Accept: 'text/html' }, redirect: 'manual' } as const
// The test-only switch vitest.config.ts turns on, which Env doesn't list.
const testEnv = env as unknown as { TEST_SESSIONS: string }

const saved = { ACCOUNTS: env.ACCOUNTS, GUEST_PITCHES: env.GUEST_PITCHES, TEST_SESSIONS: testEnv.TEST_SESSIONS }
afterEach(() => Object.assign(env, saved))

describe('the retired demo', () => {
  it('sends its old addresses, the inbox’s too, to the sign-in page’s guest panel', async () => {
    for (const pitches of ['on', 'off']) {
      env.GUEST_PITCHES = pitches
      for (const path of ['/demo', '/demo/inbox', '/inbox']) {
        const res = await get(path, browser)
        expect([res.status, res.headers.get('location')], `${path} ${pitches}`).toEqual([302, '/sign-in#guest'])
      }
    }
    const page = await (await get('/sign-in#guest')).text()
    expect(page).toContain('data-page="sign-in"')
  })

  it('has no address while accounts are off, as there is no way in', async () => {
    env.ACCOUNTS = 'off'
    for (const path of ['/demo', '/demo/inbox', '/inbox']) {
      const res = await get(path, browser)
      expect(res.status, path).toBe(404)
      expect(await res.text(), path).toContain('Not on the roster.')
    }
  })

  it('exports no order from a visitor’s session', async () => {
    const { cookie } = await openSession()
    expect((await get('/api/insertion-orders/IO-0001.csv', { headers: { Cookie: cookie } })).status).toBe(404)
  })

  it('keeps a session’s agent for the engine’s tests alone: only its own cookie reaches it, and only while they run', async () => {
    const session = await openSession()
    expect(session.state()).toMatchObject({ roster: [] })
    session.close()
    const upgrade = (cookie?: string) =>
      get('/agents/session', { headers: { Upgrade: 'websocket', ...(cookie && { Cookie: cookie }) } })
    // A cookie that isn't a UUID, as the Worker never gave, or none, names no agent.
    for (const cookie of ['crossfeed_session=someone-else', undefined]) {
      const refused = await upgrade(cookie)
      expect(refused.status, cookie).toBe(401)
      expect(refused.webSocket, cookie).toBeNull()
    }
    testEnv.TEST_SESSIONS = 'off'
    const off = await upgrade(session.cookie)
    expect(off.status).toBe(404)
    expect(off.webSocket).toBeNull()
  })
})
