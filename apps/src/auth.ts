// A member's session in the browser, and the guards every accounts route shares: the ACCOUNTS
// switch, the same-origin check on writes, a recent proof that it's the member, where `?next` may
// lead, and a program's API key.
import { generateAuthenticationOptions } from '@simplewebauthn/server'
import type { Context, MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import {
  SESSION_MS,
  STEP_UP_MS,
  apiKeyFor,
  isGuestMember,
  memberPasskeys,
  saveChallenge,
  sessionMember,
  sessionProof,
  type Member
} from './directory'
import { Refusal } from './refusal'

// The session cookie, `__Host-crossfeed_member`: the session's token, sent only to this host over
// HTTPS, never to scripts, and on top-level navigations from other sites but not their requests.
const COOKIE = 'crossfeed_member'

// Sets the session cookie for as long as its session lasts, `ms`: a member's 30 days, or a guest's day.
export function setSession(c: Context, token: string, ms = SESSION_MS) {
  setCookie(c, COOKIE, token, {
    prefix: 'host',
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: ms / 1000
  })
}

// The signed-in member, or null. A session in use is extended, and so is its cookie.
export async function signedIn<E extends { Bindings: Env }>(c: Context<E>): Promise<Member | null> {
  const member = await session(c)
  if (!member) return null
  if (member.extended) setSession(c, sessionToken(c)!)
  return { id: member.id, name: member.name, guest: member.guest }
}

// The signed-in member, or null, leaving the cookie as it is: for an answer that can't take a header,
// such as an agent's WebSocket upgrade. The session is still extended; the next page extends the cookie.
export async function session<E extends { Bindings: Env }>(c: Context<E>) {
  const token = sessionToken(c)
  return token ? sessionMember(c.env.DB, token) : null
}

// The session's token, as the cookie holds it, for the directory to look it up; undefined without one.
export const sessionToken = (c: Context) => getCookie(c, COOKIE, 'host')

// Why a guest (ADR 0008), whom every guest is signed in as, can't change the one guest account they share:
// its passkeys, recovery code, name, sessions, and the account itself, joining a network by invite, and its
// own leaving, removal, or role in a network, any of which would act for every guest at once. And the 403
// that says so, for a guest; null for any other member.
export const GUEST_ACCOUNT =
  'Everyone who signs in as a guest shares one guest account, so no guest can change it for the others. Sign out and create an account to do this.'
export const guestRefused = (c: Context, member: Member) =>
  isGuestMember(member) ? c.json({ error: GUEST_ACCOUNT }, 403) : null

// Null when the signed-in `member`'s session proved it's them in the last five minutes (STEP_UP_MS), as
// adding a passkey, a new recovery code, and deleting the account need. Otherwise the 403 that asks
// them to, so the page asks at once: for a passkey of theirs, user-verified, with the ceremony's
// challenge and options, or, in a browser signed in with the recovery code, for that code (`/auth/verify`).
// A guest, who has neither, is refused first (guestRefused), before any challenge is written.
export async function stepUpRefused<E extends { Bindings: Env }>(
  c: Context<E>,
  member: Member
): Promise<Response | null> {
  const guest = guestRefused(c, member)
  if (guest) return guest
  const token = sessionToken(c)
  const proof = token ? await sessionProof(c.env.DB, token) : null
  if (proof?.verified && Date.now() - proof.verified < STEP_UP_MS) return null
  if (proof?.recovered)
    return c.json(
      { error: "Confirm it's you with your recovery code first: this browser signed in with it.", stepUp: 'code' },
      403
    )
  const options = await generateAuthenticationOptions({
    rpID: c.env.RP_ID,
    userVerification: 'required',
    allowCredentials: (await memberPasskeys(c.env.DB, member.id)).map(({ id }) => ({ id }))
  })
  const challenge = await saveChallenge(c.env.DB, 'step-up', options.challenge, { memberId: member.id })
  return c.json({ error: "Confirm it's you with your passkey first.", stepUp: 'passkey', challenge, options }, 403)
}

// Clears the session cookie, and returns the token it held, for the directory to end its session.
export const endSession = (c: Context) => deleteCookie(c, COOKIE, { prefix: 'host', path: '/', secure: true })

// Every route behind accounts answers 404 while ACCOUNTS is off.
export const accountsOn: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  if (c.env.ACCOUNTS !== 'on') return c.notFound()
  await next()
}

// The origins a member's browser may send from (APP_ORIGINS, comma-separated), blank entries left out.
export const appOrigins = (env: Env) =>
  env.APP_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean)

// Whether a request says it comes from one of the app's own pages: one that names no Origin doesn't,
// whatever APP_ORIGINS holds.
export const fromAppOrigin = <E extends { Bindings: Env }>(c: Context<E>) => {
  const origin = c.req.header('Origin')
  return Boolean(origin) && appOrigins(c.env).includes(origin!)
}

// Whether a request may act for the member whose cookie it carries: a read, or a write from one of the
// app's own pages.
export const fromAppPage = <E extends { Bindings: Env }>(c: Context<E>) =>
  ['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) || fromAppOrigin(c)

// A write must come from one of the app's own pages: another site's form or script can't sign a
// member in, out, or up, or act as them.
export const sameOrigin: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  if (!fromAppPage(c)) return c.text('This request must come from a Crossfeed page.', 403)
  await next()
}

// Whether a request is a plain HTML form's post, which no script sent, as the public pages' guest buttons
// send it.
export const formPost = (c: Context) =>
  c.req.header('Content-Type')?.split(';')[0].trim().toLowerCase() === 'application/x-www-form-urlencoded'

// Whether a plain form's post comes from one of the app's own pages. Under the app's `Referrer-Policy:
// no-referrer` (index.tsx), a browser sends such a post's Origin as `null`, which a sandboxed frame or a
// file on another site sends too, so a `null` is never taken alone: the browser's Sec-Fetch-Site, which
// no page can set, must say the post comes from this origin.
export const fromAppForm = (c: Context) => formPost(c) && c.req.header('Sec-Fetch-Site') === 'same-origin'

// A JSON body to an accounts route holds at most a few names and a passkey's answer: one past 64 KB,
// as its Content-Length says or as it streams in with none, is refused before it's read further.
export const jsonLimit = bodyLimit({
  maxSize: 64 * 1024,
  onError: (c) => c.json({ error: 'This request is too large. Send at most 64 KB.' }, 413)
})

// A request's JSON body, or an empty object when it has none.
export const jsonBody = async (c: Context) => ((await c.req.json().catch(() => null)) ?? {}) as Record<string, unknown>

// Where `?next` may lead: a path on this origin, or else /app. The path is checked once parsed, since dot
// segments and escapes, as in `/.//host`, can parse to one that starts with `//`, which a browser reads
// as another host's address.
export function nextPath(c: Context, next: string | undefined) {
  if (!next?.startsWith('/')) return '/app'
  const here = new URL(c.req.url).origin
  const url = new URL(next, here)
  return url.origin === here && !url.pathname.startsWith('//') ? `${url.pathname}${url.search}${url.hash}` : '/app'
}

// The API key an `Authorization: Bearer` header sends, while it's in use and under its requests a
// minute. The REST API and the MCP server both take keys through it.
export async function keyFor(env: Env, authorization: string) {
  const secret = /^Bearer\s+(cf_live_\S+)\s*$/i.exec(authorization)?.[1]
  const key = secret ? await apiKeyFor(env.DB, secret) : null
  if (!key)
    throw new Refusal(
      'unauthorized',
      'This API key is unknown or was revoked. Send a key from the network\'s settings as "Authorization: Bearer cf_live_…".'
    )
  if (!(await env.API_LIMITER.limit({ key: key.id })).success)
    throw new Refusal(
      'rate_limited',
      'This API key made too many requests in the last minute. Wait a minute, then try again.'
    )
  return key
}
