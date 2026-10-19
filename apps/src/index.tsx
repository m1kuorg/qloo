// The Worker: one Hono app with a route module per surface in src/routes/, its Durable Objects,
// and its cron handler.
import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { purgeExpired } from './directory'
import { checkHealth } from './health'
import { appPages } from './routes/app'
import { auth } from './routes/auth'
import { demo } from './routes/demo'

export { CrossfeedAgent } from './agent'
export { QlooGateway } from './gateway'
export { LaunchAgent } from './launch-agent'
export { NetworkAgent } from './network-agent'

const app = new Hono<{ Bindings: Env }>()

// Every page gets Hono's secure headers, and sends no referrer. Agent connections are left as their
// agent answers them: a Durable Object's response can't take new headers.
const secure = secureHeaders({ referrerPolicy: 'no-referrer' })
app.use((c, next) => (c.req.path.startsWith('/agents/') ? next() : secure(c, next)))

app.route('/', demo)
app.route('/', auth)
app.route('/', appPages)

export default {
  fetch: app.fetch,
  // The daily cron in wrangler.jsonc: the Qloo health check, and the directory's expired sessions
  // and challenges cleared. Either runs whether or not the other fails.
  async scheduled(_controller, env) {
    await Promise.all([checkHealth(env), purgeExpired(env.DB)])
  }
} satisfies ExportedHandler<Env>
