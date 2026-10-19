// A visitor session driven the way the UI drives it: load the page for a session cookie, then
// talk to the session's agent over the same WebSocket and JSON protocol `useAgent` uses. And a
// member, signed up the way the sign-in page does it, with the software authenticator.
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
  const upgrade = await exports.default.fetch(`${origin}/agents/session`, {
    headers: { Upgrade: 'websocket', Cookie: cookie, ...(ip && { 'CF-Connecting-IP': ip }) }
  })
  const ws = upgrade.webSocket
  if (!ws) throw new Error(`/agents/session did not upgrade: ${upgrade.status} ${await upgrade.text()}`)
  ws.accept()

  let state: State | undefined
  const frames: string[] = []
  const seenState = Promise.withResolvers<void>()
  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  const waiting: { type: string; resolve: (frame: Record<string, unknown>) => void }[] = []
  const watchers = new Set<() => void>()
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
    cookie,
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
    close: () => ws.close()
  }
}

export type Member = {
  name: string
  // The session cookie, as the member's browser sends it back.
  cookie: string
  // The recovery code shown at sign-up.
  recoveryCode: string
  // Holds the member's passkey, to sign in with again.
  authenticator: Authenticator
  // A request from the member's browser on the app's origin: it carries their cookie, and an
  // Origin header as a page's write does.
  fetch: (path: string, init?: RequestInit) => Promise<Response>
}

// Signs a new member up through both steps of the passkey ceremony, as the sign-in page does. `ip`
// is their address, as Cloudflare's edge sends it; without it, the sign-up cap doesn't apply.
export async function openMember({
  name = 'Ada Programmer',
  ip
}: { name?: string; ip?: string } = {}): Promise<Member> {
  const authenticator = softwareAuthenticator()
  const post = (path: string, body: unknown) =>
    exports.default.fetch(`${origin}${path}`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', ...(ip && { 'CF-Connecting-IP': ip }) },
      body: JSON.stringify(body)
    })
  const started = await post('/auth/sign-up/options', { name })
  if (started.status !== 200) throw new Error(`Sign-up options returned ${started.status}: ${await started.text()}`)
  const { challenge, options } = await started.json<{ challenge: string; options: never }>()
  const done = await post('/auth/sign-up', { challenge, response: await authenticator.register(options) })
  if (done.status !== 200) throw new Error(`Sign-up returned ${done.status}: ${await done.text()}`)
  const { recoveryCode } = await done.json<{ recoveryCode: string }>()
  const cookie = done.headers.get('set-cookie')?.split(';')[0]
  if (!cookie) throw new Error('Sign-up set no session cookie')
  return {
    name,
    cookie,
    recoveryCode,
    authenticator,
    fetch: (path, init = {}) => {
      const headers = new Headers(init.headers)
      headers.set('Cookie', cookie)
      if (init.method && !['GET', 'HEAD'].includes(init.method)) headers.set('Origin', origin)
      return exports.default.fetch(`${origin}${path}`, { ...init, headers })
    }
  }
}
