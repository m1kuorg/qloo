/** @jsxImportSource hono/jsx */
import { getAgentByName } from 'agents'
import { Hono, type Context } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { checkHealth } from './health'
import { renderer } from './renderer'
import { visitorTag } from './visitor'

export { CrossfeedAgent } from './agent'
export { QlooGateway } from './gateway'

// The visitor session: a random ID in a cookie names the session's CrossfeedAgent.
const SESSION_COOKIE = 'crossfeed_session'

const app = new Hono<{ Bindings: Env }>()

app.use(renderer)

// A page of the React island; `page` tells the island which one.
const page = (c: Context<{ Bindings: Env }>, page: 'roster' | 'inbox') => {
  if (!getCookie(c, SESSION_COOKIE)) {
    setCookie(c, SESSION_COOKIE, crypto.randomUUID(), {
      httpOnly: true,
      secure: new URL(c.req.url).protocol === 'https:',
      sameSite: 'Lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30
    })
  }
  return c.render(<div id="root" data-page={page} />)
}

app.get('/', (c) => page(c, 'roster'))
// Guest pitches ship dark: the inbox exists only while GUEST_PITCHES is on.
app.get('/inbox', (c) => (c.env.GUEST_PITCHES === 'on' ? page(c, 'inbox') : c.notFound()))

// The session's agent. The visitor goes with it, so a new session's look-up of the sample network
// counts among the visitor's Qloo calls, whichever request starts it.
const sessionAgent = async (c: Context<{ Bindings: Env }>, session: string) =>
  getAgentByName(c.env.CrossfeedAgent, session, {
    props: { visitor: await visitorTag(c.req.raw, c.env.VISITOR_SALT) }
  })

// The client connects here (`useAgent` with `basePath`), and the server picks the instance from
// the cookie, so a visitor can only ever reach their own session.
app.all('/agents/session', async (c) => {
  const session = getCookie(c, SESSION_COOKIE)
  if (!session) return c.text('No session; load / first.', 401)
  const agent = await sessionAgent(c, session)
  return agent.fetch(c.req.raw)
})

// An approved insertion order as a CSV download. The cookie picks the session, so a visitor only
// ever exports their own orders; a draft is refused with 409.
app.get('/api/insertion-orders/:file{.+\\.csv}', async (c) => {
  const session = getCookie(c, SESSION_COOKIE)
  if (!session) return c.text('No session; load / first.', 401)
  const id = c.req.param('file').slice(0, -'.csv'.length)
  const agent = await sessionAgent(c, session)
  const exported = await agent.exportInsertionOrder(id)
  if (exported.status !== 200) return c.text(exported.error, exported.status)
  return c.body(exported.csv, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${id}.csv"`
  })
})

export default {
  fetch: app.fetch,
  // The daily cron in wrangler.jsonc: the Qloo health check.
  async scheduled(_controller, env) {
    await checkHealth(env)
  }
} satisfies ExportedHandler<Env>
