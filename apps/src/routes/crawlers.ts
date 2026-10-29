// What search engines read: /robots.txt and /sitemap.xml, and the X-Robots-Tag on what they mustn't
// index. Only a Worker with SEARCH_INDEXING on, production's alone, may be indexed, and then only its
// public pages; anywhere else, as on the preview and in tests, nothing is.
import { Hono, type MiddlewareHandler } from 'hono'
import { appOrigins } from '../auth'
import { PAGES as DOCS } from './docs'

export const crawlers = new Hono<{ Bindings: Env }>()

// Whether search engines may index the Worker's public pages.
const indexed = (env: Env) => env.SEARCH_INDEXING === 'on'

// What no crawler should fetch: a member's pages, the API, the MCP server, the agents' connections, the
// auth routes, and the invite page. Each is a prefix, so /app takes the apple-touch icon with it, which
// the longer Allow gives back, as a search engine may take it for the favicon.
const PRIVATE = ['/app', '/api', '/mcp', '/agents', '/auth', '/invite']

// Cloudflare puts its managed content-signals text before what the Worker answers (TRD crawlers). Where
// nothing may be indexed, nothing is disallowed, so a crawler can still fetch each page and read its
// noindex.
crawlers.get('/robots.txt', (c) => {
  if (!indexed(c.env)) return c.text('User-agent: *\nDisallow:\n')
  const lines = [
    'User-agent: *',
    'Allow: /',
    'Allow: /apple-touch-icon.png',
    ...PRIVATE.map((path) => `Disallow: ${path}`),
    '',
    `Sitemap: ${appOrigins(c.env)[0]}/sitemap.xml`
  ]
  return c.text(`${lines.join('\n')}\n`)
})

// The public pages, on APP_ORIGINS' first origin as their canonical addresses are: the landing page,
// privacy, the beta terms, each docs page, and while ACCOUNTS is on, signing in.
crawlers.get('/sitemap.xml', (c) => {
  if (!indexed(c.env)) return c.notFound()
  const origin = appOrigins(c.env)[0]
  const paths = [
    '/',
    '/privacy',
    '/terms',
    ...DOCS.map((p) => p.path),
    ...(c.env.ACCOUNTS === 'on' ? ['/sign-in'] : [])
  ]
  const urls = paths.map((path) => `  <url><loc>${origin}${path}</loc></url>`)
  return c.body(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
    200,
    { 'Content-Type': 'application/xml; charset=utf-8' }
  )
})

// Marks an answer noindex: where nothing may be indexed, every one; otherwise a member's pages and the
// invite page, which robots.txt asks crawlers to skip as well, for a crawler that fetches one anyway.
export const noindex: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  await next()
  if (!indexed(c.env) || /^\/(app|invite)(\/|$)/.test(c.req.path)) c.header('X-Robots-Tag', 'noindex')
}
