// A visitor session driven the way the UI drives it: load the page for a session cookie, then
// talk to the session's agent over the same WebSocket and JSON protocol `useAgent` uses. And a
// member, signed up the way the sign-in page does it, with the software authenticator.
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import { applyD1Migrations, reset, type D1Migration } from 'cloudflare:test'
import { env, exports } from 'cloudflare:workers'
import { afterEach, beforeEach } from 'vitest'
import type { State } from '../src/agent'
import type { Links } from '../src/client/App'
import type { RosterFormat } from '../src/roster'
import { softwareAuthenticator, type Authenticator } from './authenticator'

// After each test of every file that drives sessions, wipe every Durable Object's storage and
// memory, so the gateway's shared cache, daily count, and slots start fresh. It's here, not in
// setup.ts, because a reset registered from a setup file crashes the next file's worker with
// "Message is too large" when files share a worker, as on CI.
afterEach(() => reset())
// The reset wipes the D1 directory too, so each test gets its schema again from the migrations
// vitest.config.ts read into TEST_MIGRATIONS, a binding only tests have, so Env doesn't list it.
// applyD1Migrations skips those already applied.
beforeEach(() => {
  const { TEST_MIGRATIONS } = env as unknown as { TEST_MIGRATIONS: D1Migration[] }
  return applyD1Migrations(env.DB, TEST_MIGRATIONS)
})

const origin = 'https://crossfeed.test'

// The links the demo gives its island pages, for tests that render a page from a session's state.
export const links: Links = { roster: '/demo' }

export type Session = {
  cookie: string
  state: () => State | undefined
  // Every frame the server sent, raw, in order: everything this visitor's browser would receive.
  frames: () => string[]
  call: <T = unknown>(method: string, ...args: unknown[]) => Promise<T>
  // Imports a roster the way the UI does and resolves once every show's search has settled. The
  // call itself returns while the searches are still out.
  importRoster: (text: string, format?: RosterFormat) => Promise<State>
  // Searches for a comp the way the show editor does and resolves once the search has settled.
  searchComps: (name: string, query: string) => Promise<State>
  // Resolves with the synced state once it satisfies `ready`, such as a run that has finished.
  until: (ready: (state: State) => boolean) => Promise<State>
  // Sends a raw protocol frame and resolves with the next frame of type `reply`.
  send: (frame: object, reply: string) => Promise<Record<string, unknown>>
  close: () => void
  // Resolves with the close code and reason once the server closes the connection.
  closed: () => Promise<{ code: number; reason: string }>
}

// Opens a session. Without a cookie it loads `/demo` first, like a new browser would. `ip` is the
// visitor's address, as Cloudflare's edge sends it in CF-Connecting-IP; without it there's none.
export async function openSession(cookie?: string, ip?: string): Promise<Session> {
  if (!cookie) {
    const page = await exports.default.fetch(`${origin}/demo`)
    if (page.status !== 200) throw new Error(`GET /demo returned ${page.status}`)
    cookie = page.headers.get('set-cookie')?.split(';')[0]
    if (!cookie) throw new Error('GET /demo set no session cookie')
  }
  return { cookie, ...(await connect('/agents/session', { Cookie: cookie, ...(ip && { 'CF-Connecting-IP': ip }) })) }
}

// An agent's connection, opened at `path` with `headers` the way `useAgent` opens it, once its
// first state has arrived. The upgrade goes to the Worker, unless `via` sends it elsewhere, such as
// straight to an agent's stub, as a Worker route that let it through unchecked would.
export async function connect(
  path: string,
  headers: Record<string, string>,
  via: (request: Request) => Promise<Response> = (request) => exports.default.fetch(request)
): Promise<Omit<Session, 'cookie'>> {
  const upgrade = await via(new Request(`${origin}${path}`, { headers: { Upgrade: 'websocket', ...headers } }))
  const ws = upgrade.webSocket
  if (!ws) throw new Error(`${path} did not upgrade: ${upgrade.status} ${await upgrade.text()}`)
  ws.accept()

  let state: State | undefined
  const frames: string[] = []
  const seenState = Promise.withResolvers<void>()
  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  const waiting: { type: string; resolve: (frame: Record<string, unknown>) => void }[] = []
  const watchers = new Set<() => void>()
  const closed = Promise.withResolvers<{ code: number; reason: string }>()
  ws.addEventListener('close', (event) => closed.resolve({ code: event.code, reason: event.reason }))
  ws.addEventListener('message', (event) => {
    frames.push(String(event.data))
    const message = JSON.parse(String(event.data))
    const waiter = waiting.findIndex((w) => w.type === message.type)
    if (waiter >= 0) waiting.splice(waiter, 1)[0].resolve(message)
    if (message.type === 'cf_agent_state') {
      state = message.state
      seenState.resolve()
      watchers.forEach((check) => check())
    } else if (message.type === 'rpc' && pending.has(message.id)) {
      const call = pending.get(message.id)!
      pending.delete(message.id)
      if (message.success) call.resolve(message.result)
      else call.reject(new Error(message.error))
    }
  })
  await seenState.promise

  const call: Session['call'] = (method, ...args) =>
    new Promise((resolve, reject) => {
      const id = crypto.randomUUID()
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      ws.send(JSON.stringify({ type: 'rpc', id, method, args }))
    })
  const until: Session['until'] = (ready) =>
    new Promise((resolve) => {
      const check = () => {
        if (state && ready(state)) {
          watchers.delete(check)
          resolve(state)
        }
      }
      watchers.add(check)
      check()
    })

  return {
    state: () => state,
    frames: () => frames,
    call,
    importRoster: async (text, format = 'lines') => {
      await call('importRoster', text, format)
      return until((s) => s.roster.every((show) => show.resolution !== 'pending'))
    },
    searchComps: async (name, query) => {
      await call('searchComps', name, query)
      return until((s) => s.roster.find((show) => show.name === name)?.compSearch?.status !== 'pending')
    },
    until,
    send: (frame, type) =>
      new Promise((resolve) => {
        waiting.push({ type, resolve })
        ws.send(JSON.stringify(frame))
      }),
    close: () => ws.close(),
    closed: () => closed.promise
  }
}

// A program's requests to the REST API with an API key, as `curl -H "Authorization: Bearer …"` sends
// them: no cookie, and no Origin.
export const api =
  (secret: string) =>
  (path: string, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${secret}`)
    return exports.default.fetch(`${origin}${path}`, { ...init, headers })
  }

// A network the member creates the way /app/new does, and an API key its owner makes in settings.
export async function networkWithKey(member?: Member) {
  const ada = member ?? (await openMember())
  const created = await ada.fetch('/app/new', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Night Shift Audio' })
  })
  const { id } = await created.json<{ id: string }>()
  const made = await ada.fetch(`/app/${id}/settings/api-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Nightly sync' })
  })
  const { secret } = await made.json<{ secret: string }>()
  return { ada, network: id, call: api(secret) }
}

// Reads `path` with `call` until its JSON passes `ready`, as a program waiting on long work polls the
// resource, and returns it.
export async function poll<T>(
  call: (path: string) => Promise<Response>,
  path: string,
  ready: (body: T) => boolean
): Promise<T> {
  for (;;) {
    const res = await call(path)
    if (res.status !== 200) throw new Error(`GET ${path} returned ${res.status}: ${await res.text()}`)
    const body = await res.json<T>()
    if (ready(body)) return body
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

export type Member = {
  id: string
  name: string
  // The session cookie, as the member's browser sends it back.
  cookie: string
  // The recovery code shown at sign-up.
  recoveryCode: string
  // The network they joined as they signed up, through an invite; null without one.
  network: string | null
  // Holds the member's passkey, to sign in with again.
  authenticator: Authenticator
  // A request from the member's browser on the app's origin: it carries their cookie, and an
  // Origin header as a page's write does.
  fetch: (path: string, init?: RequestInit) => Promise<Response>
  // Opens an agent's connection from one of the app's pages, such as a network's at
  // `/agents/network/<id>`: it carries their cookie and the page's Origin, plus any `headers`.
  connect: (path: string, headers?: Record<string, string>) => Promise<Omit<Session, 'cookie'>>
  // Makes an invite link to network `network`, as an owner does in its settings.
  invite: (network: string) => Promise<string>
}

// Signs a new member up through both steps of the passkey ceremony, as the sign-in page does. `ip`
// is their address, as Cloudflare's edge sends it; without it, the sign-up cap doesn't apply. With an
// invite link, they sign up on its invite page, joining its network in the same step.
export async function openMember({
  name = 'Ada Programmer',
  ip,
  invite
}: { name?: string; ip?: string; invite?: string } = {}): Promise<Member> {
  const authenticator = softwareAuthenticator()
  const post = (path: string, body: unknown) =>
    exports.default.fetch(`${origin}${path}`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', ...(ip && { 'CF-Connecting-IP': ip }) },
      body: JSON.stringify(body)
    })
  // The invite page reads the token from the link's fragment.
  const token = invite && new URL(invite).hash.slice(1)
  const started = await post('/auth/sign-up/options', { name, invite: token })
  if (started.status !== 200) throw new Error(`Sign-up options returned ${started.status}: ${await started.text()}`)
  const { challenge, options } = await started.json<{ challenge: string; options: { user: { id: string } } }>()
  const response = await authenticator.register(options as never)
  const done = await post('/auth/sign-up', { challenge, response, invite: token })
  if (done.status !== 200) throw new Error(`Sign-up returned ${done.status}: ${await done.text()}`)
  const { recoveryCode, network = null } = await done.json<{ recoveryCode: string; network?: string }>()
  const cookie = done.headers.get('set-cookie')?.split(';')[0]
  if (!cookie) throw new Error('Sign-up set no session cookie')
  const fetch: Member['fetch'] = (path, init = {}) => {
    const headers = new Headers(init.headers)
    headers.set('Cookie', cookie)
    if (init.method && !['GET', 'HEAD'].includes(init.method)) headers.set('Origin', origin)
    return exports.default.fetch(`${origin}${path}`, { ...init, headers })
  }
  return {
    // The member's ID, the passkey's user handle.
    id: new TextDecoder().decode(isoBase64URL.toBuffer(options.user.id)),
    name,
    cookie,
    recoveryCode,
    network,
    authenticator,
    fetch,
    connect: (path, headers = {}) => connect(path, { Cookie: cookie, Origin: origin, ...headers }),
    invite: async (network) => {
      const res = await fetch(`/app/${network}/settings/members/invites`, { method: 'POST' })
      if (res.status !== 200) throw new Error(`Inviting to ${network} returned ${res.status}: ${await res.text()}`)
      return (await res.json<{ link: string }>()).link
    }
  }
}
