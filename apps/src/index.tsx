// The Worker: one Hono app with a route module per surface in src/routes/, its Durable Objects,
// and its cron handler.
import { Hono } from 'hono'
import { checkHealth } from './health'
import { demo } from './routes/demo'
import { marketing } from './routes/marketing'

export { CrossfeedAgent } from './agent'
export { QlooGateway } from './gateway'

const app = new Hono<{ Bindings: Env }>()

app.route('/', marketing)
app.route('/', demo)

export default {
  fetch: app.fetch,
  // The daily cron in wrangler.jsonc: the Qloo health check.
  async scheduled(_controller, env) {
    await checkHealth(env)
  }
} satisfies ExportedHandler<Env>
