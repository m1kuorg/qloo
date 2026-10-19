/** @jsxImportSource hono/jsx */
// The demo: the sample network any visitor opens at /demo without signing in, its agent
// connection, and its insertion order export.
import { getAgentByName } from 'agents'
import { Hono, type Context } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { demoShell } from '../shell'
import { visitorTag } from '../visitor'

// The visitor session: a random ID in a cookie names the session's CrossfeedAgent.
const SESSION_COOKIE = 'crossfeed_session'
// How long the cookie lasts; the privacy page says so.
export const SESSION_DAYS = 30
// Where the session's agent connects.
const AGENT_PATH = '/agents/session'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The request's session ID, or null without one. A value that isn't a UUID, as `crypto.randomUUID`
// makes, was never given by this Worker, so it names no agent.
const sessionId = (c: Context<{ Bindings: Env }>) => {
  const id = getCookie(c, SESSION_COOKIE)
  return id && UUID.test(id) ? id : null
}

export const demo = new Hono<{ Bindings: Env }>()

demo.use('/demo/*', demoShell)

// A page of the React island; `page` tells the island which one, `agent-path` where its agent
// connects, and `roster-link` where its roster page is.
const page = (c: Context<{ Bindings: Env }>, page: 'roster' | 'inbox') => {
  if (!sessionId(c)) {
    setCookie(c, SESSION_COOKIE, crypto.randomUUID(), {
      httpOnly: true,
      secure: new URL(c.req.url).protocol === 'https:',
      sameSite: 'Lax',
      path: '/',
      maxAge: 60 * 60 * 24 * SESSION_DAYS
    })
  }
  return c.render(<div id="root" data-page={page} data-agent-path={AGENT_PATH} data-roster-link="/demo" />)
}

demo.get('/demo', (c) => page(c, 'roster'))
// Guest pitches ship dark: the inbox exists only while GUEST_PITCHES is on.
demo.get('/demo/inbox', (c) => (c.env.GUEST_PITCHES === 'on' ? page(c, 'inbox') : c.notFound()))
// The demo's old inbox path, for good.
demo.get('/inbox', (c) => c.redirect('/demo/inbox', 301))

// The session's agent. The visitor goes with it, so a new session's look-up of the sample network
// counts among the visitor's Qloo calls, whichever request starts it.
const sessionAgent = async (c: Context<{ Bindings: Env }>, session: string) =>
  getAgentByName(c.env.CrossfeedAgent, session, {
    props: { visitor: await visitorTag(c.req.raw, c.env.VISITOR_SALT) }
  })

// The client connects here (`useAgent` with `basePath`), and the server picks the instance from
// the cookie, so a visitor can only ever reach their own session.
demo.all(AGENT_PATH, async (c) => {
  const session = sessionId(c)
  if (!session) return c.text('No session; load /demo first.', 401)
  const agent = await sessionAgent(c, session)
  return agent.fetch(c.req.raw)
})

// An approved insertion order as a CSV download. The cookie picks the session, so a visitor only
// ever exports their own orders; a draft is refused with 409.
demo.get('/api/insertion-orders/:file{.+\\.csv}', async (c) => {
  const session = sessionId(c)
  if (!session) return c.text('No session; load /demo first.', 401)
  const id = c.req.param('file').slice(0, -'.csv'.length)
  const agent = await sessionAgent(c, session)
  const exported = await agent.exportInsertionOrder(id)
  if (exported.status !== 200) return c.text(exported.error, exported.status)
  return c.body(exported.csv, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${id}.csv"`
  })
})
