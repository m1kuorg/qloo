/** @jsxImportSource hono/jsx */
import { getAgentByName } from 'agents'
import { Hono, type Context } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { renderer } from './renderer'

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

// The client connects here (`useAgent` with `basePath`), and the server picks the instance from
// the cookie, so a visitor can only ever reach their own session.
app.all('/agents/session', async (c) => {
  const session = getCookie(c, SESSION_COOKIE)
  if (!session) return c.text('No session; load / first.', 401)
  const agent = await getAgentByName(c.env.CrossfeedAgent, session)
  return agent.fetch(c.req.raw)
})

export default {
  fetch: app.fetch,
  // Daily cron stub; the Qloo health check (#51) goes here.
  async scheduled(controller: ScheduledController) {
    console.log(JSON.stringify({ event: 'cron', cron: controller.cron }))
  }
} satisfies ExportedHandler<Env>
