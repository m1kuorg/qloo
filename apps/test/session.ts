// A session of the engine driven the way the UI drives an agent: a session cookie of its own, then the
// session's agent over the same WebSocket and JSON protocol `useAgent` uses. And a member, signed up
// the way the sign-in page does it, with the software authenticator.
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import { applyD1Migrations, reset, type D1Migration } from 'cloudflare:test'
import { env, exports } from 'cloudflare:workers'
import { afterEach, beforeEach, onTestFailed } from 'vitest'
import type { State } from '../src/agent'
import type { Links } from '../src/client/App'
import type { NetworkPage } from '../src/client/NetworkPage'
import { WIPED } from '../src/gateway'
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

// A launch's page as the server describes it to the island, for tests that render a launch's workspace
// from an engine session's synced state: its network, and where its approved orders export. And the
// links a network's inbox page gets.
export const launchPage: { network: NetworkPage; orders: string } = {
  network: {
    id: 'n-1',
    name: 'Night Shift Audio',
    role: 'owner',
    links: {
      roster: '/app/n-1/roster',
      inbox: '/app/n-1/inbox',
      settings: '/app/n-1/settings',
      launches: '/app/n-1/launches'
    }
  },
  orders: '/app/n-1/launches/l-1/insertion-orders'
}
export const links: Links = { roster: launchPage.network.links.roster }

// The name of each region a screen reader lists on a rendered page: its label, or its heading's
// words. The shell's top bar is the page's one banner, so a page renders no <header> of its own.
export const regions = (html: string) =>
  [...html.matchAll(/<section\b[^>]*>|<div\b[^>]*role="region"[^>]*>/g)].flatMap(([tag]) => {
    const label = tag.match(/aria-label="([^"]+)"/)?.[1]
    const by = tag.match(/aria-labelledby="([^"]+)"/)?.[1]
    const heading = by && html.match(new RegExp(`id="${by}"[^>]*>(.*?)</h\\d>`))?.[1]
    return label ? [label] : heading ? [heading.replace(/<[^>]+>/g, '').trim()] : []
  })

// A rendered page's words, as a reader hears them.
const said = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

// Each section's heading and the one sentence under it, in the page's order, as a reader meets them;
// the heading alone for an h3 with no sentence of its own.
export const sections = (html: string) =>
  [...html.matchAll(/<section\b[^>]*\saria-labelledby="([^"]+)"/g)].map(([, by]) => {
    const [, heading, after] = html.match(new RegExp(`id="${by}"[^>]*>(.*?)</h\\d>(.*)`))!
    const sentence = after.match(/^\s*<p\b[^>]*>(.*?)<\/p>/)?.[1]
    return sentence === undefined ? [said(heading)] : [said(heading), said(sentence)]
  })

// Each fact of a rendered `KeyValues` list, as its label and its value, in order, as a reader meets them.
export const facts = (html: string) =>
  [...html.matchAll(/<dt\b[^>]*>(.*?)<\/dt>\s*<dd\b[^>]*>(.*?)<\/dd>/g)].map(([, label, value]) =>
    [label, value].map((part) => said(part).replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
  )

// Each label on a rendered page saying something is the sample data's, a badge such as "sample" or
// "Sample data", or a word standing in for one ("sample" for screen readers, "Sample:"), as a reader
// meets it: in the page's h1, as the title's words, or elsewhere, as the words leading up to it. A page
// whose data is the sample's has one, in its h1 beside its title (#311): ['h1: Roster'].
export const sampleLabels = (html: string) =>
  [...html.matchAll(/<span\b[^>]*\sdata-slot="badge"[^>]*>[^<]*[Ss]ample[^<]*<|>\s*(?:sample|Sample:)\s*</g)].map(
    ({ index }) => {
      const before = html.slice(0, index).replace(/<[^>]*$/, '')
      const h1 = before.lastIndexOf('<h1')
      return h1 >= 0 && h1 > before.lastIndexOf('</h1>')
        ? `h1: ${said(before.slice(h1))}`
        : `after: ${said(before).slice(-60)}`
    }
  )

// A page's tabs: its tab list's name, each tab's words, and whether each panel shows, every panel
// being in the page whichever tab is chosen.
export const tabsOf = (html: string) => ({
  label: html.match(/<div\b(?=[^>]*\srole="tablist")[^>]*\saria-label="([^"]+)"/)?.[1],
  tabs: [...html.matchAll(/<button\b[^>]*\srole="tab"[^>]*>(.*?)<\/button>/g)].map(([, tab]) => said(tab)),
  panels: [...html.matchAll(/<div\b[^>]*\srole="tabpanel"[^>]*>/g)].map(([tag]) =>
    /\shidden=""/.test(tag) ? 'hidden' : 'shown'
  )
})

// The links a server-rendered page's navigation marks current, as [name, href, aria-current]: its
// <nav> elements' links with aria-current, each named by its words, as a screen reader names it.
export const currentLinks = (html: string) =>
  [...(html.match(/<nav\b[\s\S]*?<\/nav>/g) ?? []).join('').matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)]
    .map(([, attributes, inner]) => [
      inner.replace(/<[^>]+>/g, '').trim(),
      attributes.match(/\shref="([^"]*)"/)?.[1],
      attributes.match(/\saria-current="([^"]*)"/)?.[1]
    ])
    .filter(([, , current]) => current)

// A rendered run page's inspector, closed as every page opens it, its panels there for what opens it,
// and the header's Details toggle saying so.
export const inspectorClosed = /<aside\b(?=[^>]*\sid="inspector")(?=[^>]*\shidden="")/
export const detailsToggle =
  /<button\b(?=[^>]*\saria-expanded="false")(?=[^>]*\saria-controls="inspector")[^>]*>Details<\/button>/

// Each element on a rendered page that carries a `data-*` hook, such as `data-ask` or
// `data-line="Corner Booth"`, from its start tag through its matching end tag. Tests find a block by
// its hook, never by its classes, element type or attribute order, which a restyle changes.
export const hooked = (html: string, hook: string) =>
  [...html.matchAll(new RegExp(`<(\\w+)\\b[^>]*\\s${hook.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s=/>]`, 'g'))].map(
    ({ index, 1: tag }) => {
      const rest = html.slice(index)
      let depth = 0
      for (const t of rest.matchAll(new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g'))) {
        depth += t[1] ? -1 : 1
        if (depth === 0) return rest.slice(0, t.index + t[0].length)
      }
      throw new Error(`No end tag for the <${tag}> with ${hook}`)
    }
  )

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

// Opens a session of the engine, CrossfeedAgent, at /agents/session, the route tests alone reach
// (routes/demo.ts). Without a cookie it makes a new one, a random UUID, as the retired demo gave each
// new browser. `ip` is the visitor's address, as Cloudflare's edge sends it in CF-Connecting-IP; without
// it there's none.
export async function openSession(cookie = `crossfeed_session=${crypto.randomUUID()}`, ip?: string): Promise<Session> {
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

// A network the member creates the way /app/new does, and an API key its owner makes in settings:
// its secret, and `call`, a program's requests with it.
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
  return { ada, network: id, secret, call: api(secret) }
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

// Reads a wiped instance once the runtime has reset it, and returns what `read` gets. A wipe (an agent's
// `destroy`, a gateway's `wipe`) resets the instance a moment later, its next task, and until then each
// call to it throws, for longer the more loaded the machine is: so `read`, which takes a new stub each
// time, is tried again until it answers, as `poll` waits, bounded only by the test's timeout. Any other
// error fails at once, and a reset that never comes fails the test at its timeout saying what the read
// last met.
export async function readAfterReset<T>(read: () => Promise<T>): Promise<T> {
  let resetting: unknown = null
  onTestFailed(() => {
    if (resetting) console.error(`readAfterReset was still waiting for a reset: ${String(resetting)}`)
  })
  for (;;) {
    try {
      const answer = await read()
      resetting = null
      return answer
    } catch (e) {
      if (!RESETTING.includes((e as Error).message)) throw e
      resetting = e
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }
}

// What a call to a wiped instance throws until it resets: an agent's, which `destroy` aborts with
// "destroyed", and a gateway's, which fails every call from its wipe's start.
const RESETTING = ['destroyed', WIPED]

// Sends requests until one is refused, at most twice the limit and two more: a fixed minute's window
// may roll over once while they go, which starts the count again.
export async function untilRefused(send: () => Promise<Response>, limit: number) {
  for (let sent = 1; sent <= 2 * limit + 2; sent++) {
    const res = await send()
    if (res.status !== 200) return { sent, res }
  }
  throw new Error(`No request of ${2 * limit + 2} was refused`)
}

// A refusal as a program branches on it: the status, and the error's code and message.
export const refused = async (res: Response) => [res.status, (await res.json<{ error: object }>()).error]

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

// Sends a change from the member's browser, as `member.fetch` does. When it's refused until they confirm
// it's them (step-up), it confirms with their own passkey, as the account page asks for it, and sends
// the change again; a refusal that asks for their recovery code is answered as it is.
export async function confirmedFetch(member: Member, path: string, init: RequestInit = {}) {
  const res = await member.fetch(path, init)
  if (res.status !== 403) return res
  const { stepUp, challenge, options } = await res
    .clone()
    .json<{ stepUp?: string; challenge: string; options: never }>()
  if (stepUp !== 'passkey') return res
  const proved = await member.fetch('/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challenge, response: await member.authenticator.authenticate(options) })
  })
  if (proved.status !== 200)
    throw new Error(`Confirming it's the member returned ${proved.status}: ${await proved.text()}`)
  return member.fetch(path, init)
}

// Adds a passkey made by `device`, another device's authenticator, to the member's account through both
// steps of the ceremony, as the account page does from a browser with user agent `ua`, which names the
// passkey, confirming it's them first if it's asked. The answer is the second step's, or the first's
// when it refuses.
export async function addPasskey(member: Member, device: Authenticator, ua = '') {
  const started = await confirmedFetch(member, '/auth/passkeys/options', {
    method: 'POST',
    headers: { 'User-Agent': ua }
  })
  if (started.status !== 200) return started
  const { challenge, options } = await started.json<{ challenge: string; options: never }>()
  return member.fetch('/auth/passkeys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': ua },
    body: JSON.stringify({ challenge, response: await device.register(options) })
  })
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
  const fetch = browserFetch(cookie)
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

// Requests from the browser holding session cookie `cookie`: each carries it, and a write the app's
// Origin, as a page's write does.
const browserFetch =
  (cookie: string): Member['fetch'] =>
  (path, init = {}) => {
    const headers = new Headers(init.headers)
    headers.set('Cookie', cookie)
    if (init.method && !['GET', 'HEAD'].includes(init.method)) headers.set('Origin', origin)
    return exports.default.fetch(`${origin}${path}`, { ...init, headers })
  }

// "Sign in as a guest" on the sign-in page, as its one request: from address `ip`, as Cloudflare's edge
// sends it, if given, from a browser holding session cookie `cookie`, if given, with `?next` if given.
export const guestSignIn = ({ ip, cookie, next }: { ip?: string; cookie?: string; next?: string } = {}) =>
  exports.default.fetch(`${origin}/auth/guest${next === undefined ? '' : `?next=${encodeURIComponent(next)}`}`, {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      ...(ip && { 'CF-Connecting-IP': ip }),
      ...(cookie && { Cookie: cookie })
    },
    body: '{}'
  })

// A public page's guest button, such as "Open the sample network", as a browser posts its plain form with
// no script, from a browser holding session cookie `cookie`, if given, to `?next` if given. Under the app's
// `Referrer-Policy: no-referrer` the post's Origin is `null`, and its Sec-Fetch-Site says whose page sent
// it, `site`, or nothing when it's empty. The redirect it answers with isn't followed.
export const guestFormSignIn = ({
  cookie,
  next,
  site = 'same-origin'
}: { cookie?: string; next?: string; site?: string } = {}) =>
  exports.default.fetch(`${origin}/auth/guest${next === undefined ? '' : `?next=${encodeURIComponent(next)}`}`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      Origin: 'null',
      ...(site && { 'Sec-Fetch-Site': site }),
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(cookie && { Cookie: cookie })
    },
    body: ''
  })

export type Guest = Pick<Member, 'cookie' | 'fetch' | 'connect'> & {
  // Where the sign-in answered to go next.
  next: string
}

// Someone signed in as a guest, as the one guest member, an owner of the guest network, with a session of
// their own (ADR 0008), through guestSignIn's request, with the same `fetch` and `connect` as a member.
export async function openGuest(options: Parameters<typeof guestSignIn>[0] = {}): Promise<Guest> {
  const res = await guestSignIn(options)
  if (res.status !== 200) throw new Error(`Guest sign-in returned ${res.status}: ${await res.text()}`)
  const cookie = res.headers.get('set-cookie')?.split(';')[0]
  if (!cookie) throw new Error('Guest sign-in set no session cookie')
  return {
    cookie,
    next: (await res.json<{ next: string }>()).next,
    fetch: browserFetch(cookie),
    connect: (path, headers = {}) => connect(path, { Cookie: cookie, Origin: origin, ...headers })
  }
}
