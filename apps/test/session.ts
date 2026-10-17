// A visitor session driven the way the UI drives it: load the page for a session cookie, then
// talk to the session's agent over the same WebSocket and JSON protocol `useAgent` uses.
import { exports } from 'cloudflare:workers'
import type { State } from '../src/agent'

const origin = 'https://crossfeed.test'

export type Session = {
  cookie: string
  state: () => State | undefined
  // Every frame the server sent, raw, in order: everything this visitor's browser would receive.
  frames: () => string[]
  call: <T = unknown>(method: string, ...args: unknown[]) => Promise<T>
  // Resolves with the synced state once it satisfies `ready`, such as a run that has finished.
  until: (ready: (state: State) => boolean) => Promise<State>
  // Sends a raw protocol frame and resolves with the next frame of type `reply`.
  send: (frame: object, reply: string) => Promise<Record<string, unknown>>
  close: () => void
}

// Opens a session. Without a cookie it loads `/` first, like a new browser would.
export async function openSession(cookie?: string): Promise<Session> {
  if (!cookie) {
    const page = await exports.default.fetch(`${origin}/`)
    if (page.status !== 200) throw new Error(`GET / returned ${page.status}`)
    cookie = page.headers.get('set-cookie')?.split(';')[0]
    if (!cookie) throw new Error('GET / set no session cookie')
  }
  const upgrade = await exports.default.fetch(`${origin}/agents/session`, {
    headers: { Upgrade: 'websocket', Cookie: cookie }
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

  return {
    cookie,
    state: () => state,
    frames: () => frames,
    call: (method, ...args) =>
      new Promise((resolve, reject) => {
        const id = crypto.randomUUID()
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
        ws.send(JSON.stringify({ type: 'rpc', id, method, args }))
      }),
    until: (ready) =>
      new Promise((resolve) => {
        const check = () => {
          if (state && ready(state)) {
            watchers.delete(check)
            resolve(state)
          }
        }
        watchers.add(check)
        check()
      }),
    send: (frame, type) =>
      new Promise((resolve) => {
        waiting.push({ type, resolve })
        ws.send(JSON.stringify(frame))
      }),
    close: () => ws.close()
  }
}
