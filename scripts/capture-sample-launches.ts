// Captures the guest network's sample launches (#289, ADR 0007) from a dev server's guest network, where
// they were run for real as apps/README.md's "Sample launches" steps say: one launch each with its order
// approved, with its order drafted, ranked with no order, and stopped or failed. It signs in as a guest,
// reads each launch's state and evidence log through its page's agent connection, as the app does, trims
// them as the stored sample run is trimmed (apps/src/sample-launch.ts), and writes the SQL that loads them
// into D1's sample_launches, for `wrangler d1 execute DB --file`.
//
// Everything it writes is Qloo data, so it writes outside the repo, never into it, and prints nothing of
// it. Each launch is the newest the guest network lists in its status, but The Watch, the sample launch.
// A stopped or failed run's text is reworded as the sample's, with the day it was captured.
// Usage: bun scripts/capture-sample-launches.ts [origin] [outDir]
// The origin defaults to http://localhost:5128, apps/README.md's dev server; outDir to
// ~/.cache/crossfeed/out/289.

import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { LaunchSummary, State } from '../apps/src/agent'
import type { Evidence } from '../apps/src/evidence'
import { sampleLaunchesSql, sampleLaunchOf, type SampleLaunch } from '../apps/src/sample-launch'

const origin = process.argv[2] ?? 'http://localhost:5128'
const outDir = process.argv[3] ?? join(homedir(), '.cache/crossfeed/out/289')

// The sample launches by key, and the statuses each is taken from.
const KEYS: Record<string, LaunchSummary['status'][]> = {
  approved: ['order approved'],
  drafted: ['order drafted'],
  ranked: ['ranked'],
  stopped: ['stopped', 'failed']
}

// Signs in as a guest, as the sign-in page's button does, and returns the session cookie.
async function signIn() {
  const res = await fetch(`${origin}/auth/guest`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: '{}'
  })
  const cookie = res.headers.get('set-cookie')?.split(';')[0]
  if (res.status !== 200 || !cookie) throw new Error(`Guest sign-in answered ${res.status}: ${await res.text()}`)
  return cookie
}

// An agent's connection from one of the app's pages, as useAgent opens it: its first state, and calls.
async function connect(path: string, cookie: string) {
  const ws = new WebSocket(`${origin.replace(/^http/, 'ws')}${path}`, {
    headers: { Cookie: cookie, Origin: origin }
  } as unknown as string[])
  const calls = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  const state = Promise.withResolvers<State>()
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data))
    if (message.type === 'cf_agent_state') state.resolve(message.state)
    if (message.type === 'rpc' && calls.has(message.id)) {
      const call = calls.get(message.id)!
      calls.delete(message.id)
      if (message.success) call.resolve(message.result)
      else call.reject(new Error(message.error))
    }
  })
  ws.addEventListener('close', (event) => state.reject(new Error(`${path} closed: ${event.code} ${event.reason}`)))
  return {
    state: await state.promise,
    call: <T>(method: string, ...args: unknown[]) =>
      new Promise<T>((resolve, reject) => {
        const id = crypto.randomUUID()
        calls.set(id, { resolve: resolve as (v: unknown) => void, reject })
        ws.send(JSON.stringify({ type: 'rpc', id, method, args }))
      }),
    close: () => ws.close()
  }
}

// A stopped or failed run's text as the sample's: what stopped it then, said as of the day it was
// captured, since the sample is loaded on later days. A start the daily model runs stopped says so plainly.
function asTheSample(launch: SampleLaunch): SampleLaunch {
  const run = launch.state.run!
  if (run.status !== 'stopped' && run.status !== 'failed') return launch
  // The UTC day, as the guest budget counts its days.
  const day = new Date(launch.captured).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  })
  const error = /model runs? today/.test(run.error ?? '')
    ? `Stopped at once on ${day}, as this sample was captured: guests had used that day's model runs, so it never called Claude. Run it again to plan it.`
    : `As this sample was captured, on ${day}: ${run.error}`
  return { ...launch, state: { ...launch.state, run: { ...run, error } } }
}

const cookie = await signIn()
const network = await connect('/agents/network/guest-network', cookie)
const listed = network.state.launches ?? []
network.close()
const captured = new Date().toISOString()
const launches: { key: string; launch: SampleLaunch }[] = []
for (const [key, statuses] of Object.entries(KEYS)) {
  for (const row of listed.filter((l) => statuses.includes(l.status))) {
    const agent = await connect(`/agents/launch/guest-network/${row.id}`, cookie)
    const log = await agent.call<Evidence[]>('getEvidence')
    agent.close()
    // The sample launch carries the sample; no other launch does.
    if (agent.state.sample) continue
    launches.push({ key, launch: asTheSample(sampleLaunchOf(agent.state, log, captured)) })
    console.log(`${key}: ${row.name ?? row.comps.join(', ')}, ${row.status}, ${log.length} records in its log`)
    break
  }
}
const missing = Object.keys(KEYS).filter((key) => !launches.some((l) => l.key === key))
if (missing.length > 0) throw new Error(`The guest network lists no launch to capture as: ${missing.join(', ')}.`)

const sql = sampleLaunchesSql(launches)
mkdirSync(outDir, { recursive: true })
const file = join(outDir, 'sample-launches.sql')
writeFileSync(file, sql)
for (const { key, launch } of launches)
  console.log(`${key}: ${launch.evidence.length} cited records, ${JSON.stringify(launch).length} characters`)
console.log(`Wrote ${file} (${sql.length} bytes). Load it with: bunx wrangler d1 execute DB --local --file ${file}`)
