// The retired demo (ADR 0007): its old addresses, which lead to signing in as a guest, and the
// per-session agent route the engine's tests drive CrossfeedAgent through.
import { getAgentByName } from 'agents'
import { Hono, type Context } from 'hono'
import { getCookie } from 'hono/cookie'
import { accountsOn } from '../auth'
import { visitorTag } from '../visitor'

export const demo = new Hono<{ Bindings: Env }>()

// The demo's pages, and its inbox's old path, lead to the sign-in page's guest panel: signing in as a
// guest opens the guest network, with the sample in it. There's no way in while ACCOUNTS is off.
for (const path of ['/demo', '/demo/inbox', '/inbox'])
  demo.get(path, accountsOn, (c) => c.redirect('/sign-in#guest', 302))

// A session of the engine: a random ID in a cookie names its CrossfeedAgent. A value that isn't a UUID,
// as `crypto.randomUUID` makes, names no agent.
const SESSION_COOKIE = 'crossfeed_session'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The session's agent, for the engine's tests (test/session.ts), which make their own cookie. It answers
// only while TEST_SESSIONS is on, as vitest.config.ts sets it and wrangler.jsonc never does, so a
// deployed Worker has no anonymous per-visitor agents outside the guest budget (ADR 0007). The visitor
// goes with it, so a session's calls count among the visitor's.
demo.all('/agents/session', async (c: Context<{ Bindings: Env }>) => {
  if ((c.env as { TEST_SESSIONS?: string }).TEST_SESSIONS !== 'on') return c.notFound()
  const session = getCookie(c, SESSION_COOKIE)
  if (!session || !UUID.test(session)) return c.text('No session; send a crossfeed_session cookie.', 401)
  const agent = await getAgentByName(c.env.CrossfeedAgent, session, {
    props: { visitor: await visitorTag(c.req.raw, c.env.VISITOR_SALT) }
  })
  return agent.fetch(c.req.raw)
})
