// A member's session in the browser, and the guards every accounts route shares: the ACCOUNTS
// switch, the same-origin check on writes, and where `?next` may lead.
import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { SESSION_MS, sessionMember, type Member } from './directory'

// The session cookie, `__Host-crossfeed_member`: the session's token, sent only to this host over
// HTTPS, never to scripts, and on top-level navigations from other sites but not their requests.
const COOKIE = 'crossfeed_member'

export function setSession(c: Context, token: string) {
  setCookie(c, COOKIE, token, {
    prefix: 'host',
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: SESSION_MS / 1000
  })
}

// The signed-in member, or null. A session in use is extended, and so is its cookie.
export async function signedIn<E extends { Bindings: Env }>(c: Context<E>): Promise<Member | null> {
  const member = await session(c)
  if (!member) return null
  if (member.extended) setSession(c, getCookie(c, COOKIE, 'host')!)
  return { id: member.id, name: member.name }
}

// The signed-in member, or null, leaving the cookie as it is: for an answer that can't take a header,
// such as an agent's WebSocket upgrade. The session is still extended; the next page extends the cookie.
export async function session<E extends { Bindings: Env }>(c: Context<E>) {
  const token = getCookie(c, COOKIE, 'host')
  return token ? sessionMember(c.env.DB, token) : null
}

// Clears the session cookie, and returns the token it held, for the directory to end its session.
export const endSession = (c: Context) => deleteCookie(c, COOKIE, { prefix: 'host', path: '/', secure: true })

// Every route behind accounts answers 404 while ACCOUNTS is off.
export const accountsOn: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  if (c.env.ACCOUNTS !== 'on') return c.notFound()
  await next()
}

// The origins a member's browser may send from (APP_ORIGINS, comma-separated).
export const appOrigins = (env: Env) => env.APP_ORIGINS.split(',').map((o) => o.trim())

// A write must come from one of the app's own pages: another site's form or script can't sign a
// member in, out, or up, or act as them.
export const sameOrigin: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && !appOrigins(c.env).includes(c.req.header('Origin') ?? ''))
    return c.text('This request must come from a Crossfeed page.', 403)
  await next()
}

// A request's JSON body, or an empty object when it has none.
export const jsonBody = async (c: Context) => ((await c.req.json().catch(() => null)) ?? {}) as Record<string, unknown>

// Where `?next` may lead: a path on this origin, or else /app.
export function nextPath(c: Context, next: string | undefined) {
  if (!next?.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/app'
  const here = new URL(c.req.url).origin
  const url = new URL(next, here)
  return url.origin === here ? `${url.pathname}${url.search}${url.hash}` : '/app'
}
