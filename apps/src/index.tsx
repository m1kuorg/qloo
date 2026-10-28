// The Worker: one Hono app with a route module per surface in src/routes/, its Durable Objects,
// and its cron handler.
import { Hono } from 'hono'
import { NONCE, secureHeaders } from 'hono/secure-headers'
import { purgeExpired } from './directory'
import { checkHealth } from './health'
import { api } from './routes/api'
import { appPages } from './routes/app'
import { auth } from './routes/auth'
import { demo } from './routes/demo'
import { docs } from './routes/docs'
import { marketing, notFound } from './routes/marketing'
import { mcp } from './routes/mcp'
import { clearGuests, removeTemporaryGuests, resetGuestNetwork, retryWipes } from './wipe'

export { CrossfeedAgent } from './agent'
export { QlooGateway } from './gateway'
export { LaunchAgent } from './launch-agent'
export { NetworkAgent } from './network-agent'

const app = new Hono<{ Bindings: Env }>()

// Every page gets Hono's secure headers, sends no referrer, and runs under a Content-Security-Policy of
// the app's own origin alone, its agents' WebSockets included, with no inline script, inline style,
// plugin, or other site's frame around it. Vite's dev server needs two allowances, in development
// only: the React refresh preamble, an inline script, runs under the request's nonce (shell.tsx), and
// Vite injects stylesheets as <style> elements. Agent connections are left as their agent answers
// them: a Durable Object's response can't take new headers.
const dev = import.meta.env.DEV
const secure = secureHeaders({
  referrerPolicy: 'no-referrer',
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: dev ? ["'self'", NONCE] : ["'self'"],
    styleSrc: dev ? ["'self'", "'unsafe-inline'"] : ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'none'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"]
  }
})
app.use((c, next) => (c.req.path.startsWith('/agents/') ? next() : secure(c, next)))

app.route('/', marketing)
app.route('/', docs)
app.route('/', demo)
app.route('/', auth)
app.route('/', appPages)
app.route('/', api)
app.route('/', mcp)
// A page that isn't there, for every route above and none.
app.notFound(notFound)

// The hourly cron in wrangler.jsonc: every hour but 12:00 UTC, when the daily cron runs in its place.
const HOURLY = '0 0-11,13-23 * * *'

export default {
  fetch: app.fetch,
  // The crons in wrangler.jsonc. Every hour: the directory's expired sessions, challenges, and invites
  // cleared, and any agent wipe that failed tried again. At 12:00 UTC, the daily cron's, and any other
  // schedule's, also the Qloo health check, the guest network's clearing, after the retry so the two never
  // wipe one instance at once, and the clearing of what guests made beyond it: the temporary guest members
  // removed, and what the guest member made cleared (ADR 0008), each in a batch of its own. Each logs what
  // it did, and runs to its end whether or not the others fail, and then a failure fails the run.
  async scheduled(controller, env) {
    const purged = purgeExpired(env.DB).then((counts) =>
      console.log(JSON.stringify({ event: 'directory_purged', ...counts }))
    )
    const retried = retryWipes(env)
    const tasks = [purged, retried]
    if (controller.cron !== HOURLY)
      tasks.push(
        checkHealth(env),
        retried.catch(() => {}).then(() => resetGuestNetwork(env)),
        removeTemporaryGuests(env).then((counts) =>
          console.log(JSON.stringify({ event: 'guests_removed', ...counts }))
        ),
        clearGuests(env)
      )
    for (const result of await Promise.allSettled(tasks)) if (result.status === 'rejected') throw result.reason
  }
} satisfies ExportedHandler<Env>
