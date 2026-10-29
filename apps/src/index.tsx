// The Worker: one Hono app with a route module per surface in src/routes/, its Durable Objects,
// and its cron handler.
import { Hono } from 'hono'
import { NONCE, secureHeaders } from 'hono/secure-headers'
import { purgeExpired } from './directory'
import { checkHealth } from './health'
import { api } from './routes/api'
import { appPages } from './routes/app'
import { auth } from './routes/auth'
import { crawlers, noindex } from './routes/crawlers'
import { demo } from './routes/demo'
import { docs } from './routes/docs'
import { marketing, notFound, serverError } from './routes/marketing'
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
// Each answer search engines mustn't index says so in its X-Robots-Tag (routes/crawlers.ts), but an
// agent's connection, for the same reason.
app.use((c, next) => (c.req.path.startsWith('/agents/') ? next() : noindex(c, next)))

app.route('/', crawlers)
app.route('/', marketing)
app.route('/', docs)
app.route('/', demo)
app.route('/', auth)
app.route('/', appPages)
app.route('/', api)
app.route('/', mcp)
// A page that isn't there, for every route above and none; and one that failed, for every route but
// the API's, which answers its own errors.
app.notFound(notFound)
app.onError(serverError)

// The hourly cron in wrangler.jsonc: every hour but 12:00 UTC, when the daily cron runs in its place.
const HOURLY = '0 0-11,13-23 * * *'

export default {
  fetch: app.fetch,
  // The crons in wrangler.jsonc. Every hour: the directory's expired sessions, challenges, and invites
  // cleared, and any agent wipe that failed or was left for it tried again. At 12:00 UTC, the daily cron's,
  // and any other schedule's, the directory's clearing too, the Qloo health check, the guest network's
  // clearing, and the clearing of what guests made beyond it: the temporary guest members removed, and
  // what the guest member made cleared (ADR 0008), each in a batch of its own. That run leaves the wipes
  // to the next hour's retry, so it stays within the Free plan's 50 subrequests (TRD crons, #275). Each
  // logs what it did, and runs to its end whether or not the others fail, and then a failure fails the run.
  async scheduled(controller, env) {
    const purged = purgeExpired(env.DB).then((counts) =>
      console.log(JSON.stringify({ event: 'directory_purged', ...counts }))
    )
    const tasks =
      controller.cron === HOURLY
        ? [purged, retryWipes(env)]
        : [purged, checkHealth(env), resetGuestNetwork(env), removeTemporaryGuests(env), clearGuests(env)]
    for (const result of await Promise.allSettled(tasks)) if (result.status === 'rejected') throw result.reason
  }
} satisfies ExportedHandler<Env>
