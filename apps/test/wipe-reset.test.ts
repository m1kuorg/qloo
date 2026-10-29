// Wipes as Cloudflare answers them (#297): a wiped instance resets itself a moment after its wipe, and
// that reset reaches the wipe's caller before the wipe's answer does. Each test has every wipe wait for
// its instance's own reset before it answers, then drives the Worker's routes and its scheduled handler,
// and reads the wipes left from the hourly retry's log.
import { getAgentByName } from 'agents'
import { createExecutionContext, createScheduledController, waitOnExecutionContext } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QlooGateway, WIPED } from '../src/gateway'
import worker from '../src/index'
import { LaunchAgent } from '../src/launch-agent'
import { NetworkAgent } from '../src/network-agent'
import { fakeQloo, requests } from './fake'
import { openGuest, openMember, readAfterReset, type Member, type Session } from './session'

const OWN = 'qk-made-up-7f3a'
const HACKATHON = 'https://hackathon.api.qloo.com'
const search = {
  'Corner Booth': [{ entity_id: 'e-0501', name: 'Corner Booth', popularity: 0.6 }],
  // The daily cron's health check searches Qloo too.
  'The Rewatchables': [{ entity_id: 'e-0701', name: 'The Rewatchables', popularity: 0.7 }]
}

const open: Omit<Session, 'cookie'>[] = []
afterEach(() => {
  open.splice(0).forEach((agent) => agent.close())
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// A write from one of the member's, or a guest's, pages, as `send` in the island makes it.
const post = (member: Pick<Member, 'fetch'>, path: string, body: object = {}) =>
  member.fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

// A network with its own Qloo key and a launch, so deleting it wipes a launch's agent, its own, and its
// gateway instance: a member's, or the guest network as a guest sets it up.
async function network(who: Pick<Member, 'fetch' | 'connect'>, network?: string) {
  fakeQloo({ search, keys: [OWN, env.QLOO_API_KEY] })
  const name = 'Night Shift Audio'
  const id = network ?? (await (await post(who, '/app/new', { name })).json<{ id: string }>()).id
  expect((await post(who, `/app/${id}/settings/qloo-key`, { host: HACKATHON, key: OWN })).status).toBe(200)
  const dashboard = await who.connect(`/agents/network/${id}`)
  open.push(dashboard)
  const launch = (await dashboard.call<{ id: string }>('createLaunch', { name: 'Night Shift Cinema' })).id
  return { id, name, launch, dashboard }
}

// The network's Qloo key as its settings page shows it, and where each Qloo request since went, with which key.
const qlooKey = async (member: Pick<Member, 'fetch'>, id: string) =>
  JSON.parse(
    (await (await member.fetch(`/app/${id}/settings`)).text())
      .match(/data-qloo-key="([^"]*)"/)![1]
      .replace(/&quot;/g, '"')
  )
const sent = () => requests.map((r) => [r.url.origin, r.headers.get('X-Api-Key')])

// The real wipes, before any test's stand-in.
const { destroy: destroyLaunch } = LaunchAgent.prototype
const { destroy: destroyNetwork } = NetworkAgent.prototype
const { wipe: wipeGateway } = QlooGateway.prototype
const resetting = () => new Promise<never>(() => {})

// Has every wipe answer as Cloudflare does: it does its work, then waits for the reset its instance makes
// after it, which reaches the caller in place of its answer. An agent resets once its storage is deleted,
// and a gateway whether or not its wipe worked.
function resetFirst() {
  vi.spyOn(LaunchAgent.prototype, 'destroy').mockImplementation(async function (this: LaunchAgent, reason) {
    await destroyLaunch.call(this, reason)
    return resetting()
  })
  vi.spyOn(NetworkAgent.prototype, 'destroy').mockImplementation(async function (this: NetworkAgent) {
    await destroyNetwork.call(this)
    return resetting()
  })
  vi.spyOn(QlooGateway.prototype, 'wipe').mockImplementation(wipeThenReset)
}
async function wipeThenReset(this: QlooGateway) {
  try {
    await wipeGateway.call(this)
  } finally {
    await resetting()
  }
}

// An instance's own state, which its class keeps to itself.
const stateOf = (instance: object) => (instance as unknown as { ctx: DurableObjectState }).ctx
// A reset for another reason than a wipe, as Cloudflare resets every instance as a deploy starts.
const DEPLOYED = 'Durable Object reset because its code was updated.'
async function deployReset(this: object) {
  stateOf(this).abort(DEPLOYED)
}
// A gateway's wipe whose storage deletion fails, resetting first all the same.
async function failedDeletion(this: QlooGateway) {
  vi.spyOn(stateOf(this).storage, 'deleteAll').mockRejectedValueOnce(new Error('Storage is overloaded.'))
  return wipeThenReset.call(this)
}

// Runs the Worker's scheduled handler at a cron in wrangler.jsonc: the daily one, or the hourly one two
// minutes on, so the wipes noted before it are due.
async function runCron(cron: string) {
  const ctx = createExecutionContext()
  await (worker as ExportedHandler<Env>).scheduled!(createScheduledController({ cron }), env, ctx)
  await waitOnExecutionContext(ctx)
}
const runDailyCron = () => runCron('0 12 * * *')
async function runHourlyCron() {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(Date.now() + 2 * 60_000)
  await runCron('0 0-11,13-23 * * *')
}

const lines = (spy: { mock: { calls: unknown[][] } }, event: string) =>
  spy.mock.calls.flat().filter((line) => String(line).startsWith(`{"event":"${event}"`))
const retried = (wiped: number, failed = 0) => JSON.stringify({ event: 'wipes_retried', wiped, kept: 0, failed })

describe('a wipe whose instance resets before it answers, as on Cloudflare', () => {
  it('is crossed off by the hourly retry: a launch’s, a network’s, and its gateway instance’s', async () => {
    const ada = await openMember()
    const { id, name } = await network(ada)
    for (const prototype of [LaunchAgent.prototype, NetworkAgent.prototype])
      vi.spyOn(prototype, 'destroy').mockRejectedValueOnce(new Error('The agent is overloaded.'))
    vi.spyOn(QlooGateway.prototype, 'wipe').mockRejectedValueOnce(new Error('The gateway is overloaded.'))
    const failed = vi.spyOn(console, 'error')
    expect((await post(ada, `/app/${id}/settings/delete`, { name })).status).toBe(200)
    expect(lines(failed, 'wipe_failed')).toHaveLength(3)
    vi.restoreAllMocks()

    resetFirst()
    const failing = vi.spyOn(console, 'error')
    const logged = vi.spyOn(console, 'log')
    await runHourlyCron()
    expect(lines(logged, 'wipes_retried')).toEqual([retried(3)])
    expect(lines(failing, 'wipe_failed')).toEqual([])
    // The network's wipe notes the launch it still listed again, which the next run wipes; then none is left.
    await runHourlyCron()
    await runHourlyCron()
    expect(lines(logged, 'wipes_retried')).toEqual([retried(3), retried(1), retried(0)])
    expect(lines(failing, 'wipe_failed')).toEqual([])
  })

  it('leaves nothing noted as a launch is deleted, then its network', async () => {
    const ada = await openMember()
    const { id, name, launch, dashboard } = await network(ada)
    resetFirst()
    const failed = vi.spyOn(console, 'error')
    const logged = vi.spyOn(console, 'log')

    const deleted = await post(ada, `/app/${id}/launches/${launch}/delete`)
    expect([deleted.status, await deleted.json()]).toEqual([200, {}])
    const planned = (await dashboard.call<{ id: string }>('createLaunch', { name: 'The Long Take' })).id
    const removed = await post(ada, `/app/${id}/settings/delete`, { name })
    expect([removed.status, await removed.json()]).toEqual([200, {}])
    expect(lines(failed, 'wipe_failed')).toEqual([])
    // Each instance was wiped: the launch's agents and the network's hold nothing, nor its gateway instance.
    for (const l of [launch, planned])
      expect(
        await readAfterReset(async () => (await getAgentByName(env.LaunchAgent, `${id}:${l}`)).state)
      ).toMatchObject({ launch: null })
    expect(await readAfterReset(async () => (await getAgentByName(env.NetworkAgent, id)).state)).toMatchObject({
      launches: []
    })
    expect(await readAfterReset(() => env.QlooGateway.getByName(`network:${id}`).ownKey())).toEqual({ set: false })

    await runHourlyCron()
    expect(lines(logged, 'wipes_retried')).toEqual([retried(0)])
  })

  it('leaves the daily clearing of the guest network green, and only its launches for the hourly retry', async () => {
    const guest = await openGuest()
    await network(guest, 'guest-network')
    resetFirst()
    const failed = vi.spyOn(console, 'error')
    const logged = vi.spyOn(console, 'log')

    await runDailyCron()
    expect(lines(logged, 'guest_network_reset')).toEqual([
      JSON.stringify({ event: 'guest_network_reset', launches: 1, failed: 0 })
    ])
    await runHourlyCron()
    await runHourlyCron()
    expect(lines(logged, 'wipes_retried')).toEqual([retried(1), retried(0)])
    expect(lines(failed, 'wipe_failed')).toEqual([])
    expect(await readAfterReset(() => env.QlooGateway.getByName('network:guest-network').ownKey())).toEqual({
      set: false
    })
  })

  it('resets the sample data, answering that it’s done', async () => {
    const guest = await openGuest()
    await network(guest, 'guest-network')
    resetFirst()
    const failed = vi.spyOn(console, 'error')
    const logged = vi.spyOn(console, 'log')

    const res = await post(guest, '/app/guest-network/settings/sample-data/reset')
    expect([res.status, await res.json()]).toEqual([200, {}])
    expect(lines(logged, 'guest_network_reset')).toEqual([
      JSON.stringify({ event: 'guest_network_reset', launches: 1, failed: 0 })
    ])
    expect(lines(failed, 'wipe_failed')).toEqual([])
  })

  it('removes a network’s own Qloo key, so the settings show none and its calls go with Crossfeed’s key', async () => {
    const ada = await openMember()
    const { id, dashboard } = await network(ada)
    resetFirst()

    const res = await post(ada, `/app/${id}/settings/qloo-key/remove`)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ key: { set: false }, usage: { qlooCalls: { used: 0 } } })
    expect(await qlooKey(ada, id)).toEqual({ set: false })
    requests.length = 0
    await dashboard.importRoster('Corner Booth')
    expect(sent()).toEqual([[env.QLOO_BASE_URL, env.QLOO_API_KEY]])
  })
})

describe('a wipe that fails, its instance resetting before it answers', () => {
  it('stays noted and fails the hourly run when its instance resets for another reason, as for a deploy', async () => {
    const ada = await openMember()
    const { id, name } = await network(ada)
    resetFirst()
    vi.spyOn(NetworkAgent.prototype, 'destroy').mockImplementationOnce(deployReset)
    const failed = vi.spyOn(console, 'error')
    const logged = vi.spyOn(console, 'log')
    const failure = JSON.stringify({
      event: 'wipe_failed',
      binding: 'NetworkAgent',
      name: id,
      error: `Error: ${DEPLOYED}`
    })

    expect((await post(ada, `/app/${id}/settings/delete`, { name })).status).toBe(200)
    expect(lines(failed, 'wipe_failed')).toEqual([failure])
    vi.spyOn(NetworkAgent.prototype, 'destroy').mockImplementationOnce(deployReset)
    await expect(runHourlyCron()).rejects.toThrow('1 agent wipe failed; the next hourly run tries again.')
    expect(lines(failed, 'wipe_failed')).toEqual([failure, failure])

    // Its agent still listed the launch, whose wipe, and its gateway instance's, it noted again.
    await runHourlyCron()
    expect(lines(logged, 'wipes_retried')).toEqual([retried(0, 1), retried(3)])
    expect(await readAfterReset(async () => (await getAgentByName(env.NetworkAgent, id)).state)).toMatchObject({
      launches: []
    })
  })

  it('leaves the sample data reset pending when the guest network’s agent resets for another reason', async () => {
    const guest = await openGuest()
    await network(guest, 'guest-network')
    resetFirst()
    vi.spyOn(NetworkAgent.prototype, 'destroy').mockImplementationOnce(deployReset)
    const failed = vi.spyOn(console, 'error')

    const res = await post(guest, '/app/guest-network/settings/sample-data/reset')
    expect([res.status, await res.json()]).toEqual([202, { pending: true }])
    expect(lines(failed, 'wipe_failed')).toHaveLength(1)
  })

  it('keeps the network’s own Qloo key when its gateway resets for another reason, or throws saying it was wiped', async () => {
    const ada = await openMember()
    const { id } = await network(ada)
    const key = { set: true, host: HACKATHON, last4: '7f3a' }
    resetFirst()

    vi.spyOn(QlooGateway.prototype, 'wipe').mockImplementationOnce(deployReset)
    expect((await post(ada, `/app/${id}/settings/qloo-key/remove`)).status).toBe(500)
    expect(await qlooKey(ada, id)).toEqual(key)
    // An error the gateway's code throws once its wipe has begun says the same as its reset, unmarked.
    vi.spyOn(QlooGateway.prototype, 'wipe').mockRejectedValueOnce(new Error(WIPED))
    expect((await post(ada, `/app/${id}/settings/qloo-key/remove`)).status).toBe(500)
    expect(await qlooKey(ada, id)).toEqual(key)
  })

  it('keeps the key, and the wipe noted, when its gateway can’t delete its storage', async () => {
    const ada = await openMember()
    const { id, name, dashboard } = await network(ada)
    resetFirst()
    vi.spyOn(QlooGateway.prototype, 'wipe').mockImplementationOnce(failedDeletion)

    expect((await post(ada, `/app/${id}/settings/qloo-key/remove`)).status).toBe(500)
    expect(await qlooKey(ada, id)).toEqual({ set: true, host: HACKATHON, last4: '7f3a' })
    requests.length = 0
    await dashboard.importRoster('Corner Booth')
    expect(sent()).toEqual([[HACKATHON, OWN]])

    vi.spyOn(QlooGateway.prototype, 'wipe').mockImplementationOnce(failedDeletion)
    const failed = vi.spyOn(console, 'error')
    const logged = vi.spyOn(console, 'log')
    expect((await post(ada, `/app/${id}/settings/delete`, { name })).status).toBe(200)
    expect(lines(failed, 'wipe_failed').map((line) => JSON.parse(String(line)).binding)).toEqual(['QlooGateway'])
    expect(await readAfterReset(() => env.QlooGateway.getByName(`network:${id}`).ownKey())).toMatchObject({
      set: true
    })
    await runHourlyCron()
    expect(lines(logged, 'wipes_retried')).toEqual([retried(1)])
    expect(await readAfterReset(() => env.QlooGateway.getByName(`network:${id}`).ownKey())).toEqual({ set: false })
  })
})
