// A network's own Qloo key (ADR 0004): an owner adds it in settings, tested with one search through the
// network's own gateway instance before it's saved, and shown only by its last four characters. With it,
// the network's and its launches' Qloo calls go with that key to its host, with a cache and Qloo counts
// of their own, while model runs still count in the global gateway. Removing it, or deleting the
// network, wipes the instance. Each test drives the Worker's routes and the agents' client protocol,
// and reads what Qloo was sent from the fake seam; two read the gateway instance itself, as storage
// tests do.
import {
  createExecutionContext,
  createScheduledController,
  evictDurableObject,
  listDurableObjectIds,
  runInDurableObject,
  waitOnExecutionContext
} from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QlooGateway } from '../src/gateway'
import { LaunchAgent } from '../src/launch-agent'
import worker from '../src/index'
import { fakeClaude, fakeInsights, fakeQloo, requests, text, toolUse, turn } from './fake'
import { readAfterReset, api, openMember, openSession, type Member, type Session } from './session'

const HACKATHON = 'https://hackathon.api.qloo.com'
const PRODUCTION = 'https://api.qloo.com'
// Made-up keys: the network's own, which the fake Qloo takes, and one it doesn't know.
const OWN = 'qk-made-up-7f3a'
const UNKNOWN = 'qk-made-up-0000'

// A made-up roster and launch, and made-up scores.
const show = (entity_id: string, name: string) => [{ entity_id, name, popularity: 0.6 }]
const search = {
  'Night Shift Cinema': show('e-0001', 'Night Shift Cinema'),
  'Corner Booth': show('e-0501', 'Corner Booth'),
  'Slow Burn': show('e-0502', 'Slow Burn')
}
const fit = [
  { entity_id: 'e-0501', name: 'Corner Booth', affinity: 0.913 },
  { entity_id: 'e-0502', name: 'Slow Burn', affinity: 0.902 }
]
// A launch run the way the agent plans one: resolve the launch, and a roster show, rank the roster, end.
const run = () =>
  fakeClaude([
    turn(toolUse('resolve_entities', { names: ['Night Shift Cinema', 'Corner Booth'], type: 'urn:entity:podcast' })),
    turn(
      toolUse('rank_candidates', {
        anchor_ids: ['e-0001'],
        candidate_ids: ['e-0501', 'e-0502'],
        type: 'urn:entity:podcast'
      })
    ),
    turn(text('Corner Booth fits best.'))
  ])

const open: Omit<Session, 'cookie'>[] = []
const saved = { QLOO_KEY_SECRET: env.QLOO_KEY_SECRET, RUN_DAILY_CAP: env.RUN_DAILY_CAP }
afterEach(() => {
  open.splice(0).forEach((agent) => agent.close())
  Object.assign(env, saved)
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// A write from one of the member's pages, as `send` in the island makes it.
const post = (member: Member, path: string, body: object = {}) =>
  member.fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

// A network the member creates, as /app/new does.
async function created(member: Member, name = 'Night Shift Audio') {
  const res = await post(member, '/app/new', { name })
  if (res.status !== 200) throw new Error(`Creating ${name} returned ${res.status}: ${await res.text()}`)
  return (await res.json<{ id: string }>()).id
}

// The settings page's data attributes, as main.tsx reads them, and the page as the server sent it.
async function settings(member: Member, network: string) {
  const html = await (await member.fetch(`/app/${network}/settings`)).text()
  const root = html.match(/<div id="root"([^>]*)>/)![1]
  const attribute = (name: string) =>
    JSON.parse(
      root
        .match(new RegExp(`data-${name}="([^"]*)"`))![1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
    )
  return { html, qlooKey: attribute('qloo-key'), usage: attribute('usage') }
}

// An agent opened from one of the network's pages, such as its own at `/agents/network/<id>`.
async function connect(member: Member, path: string) {
  const agent = await member.connect(path)
  open.push(agent)
  return agent
}

const addKey = (member: Member, network: string, host: string, key: string) =>
  post(member, `/app/${network}/settings/qloo-key`, { host, key })

// Each Qloo request, in order: where it went, and with which key. And what each search asked for.
const sent = () => qloo().map((r) => [`${r.url.origin}${r.url.pathname}`, r.headers.get('X-Api-Key')])
const searched = () => qloo().flatMap((r) => r.url.searchParams.get('query') ?? [])
const qloo = () => requests.filter((r) => r.url.origin !== new URL(env.ANTHROPIC_BASE_URL).origin)

// Whether gateway instance `name` has ever stored anything, as a storage test reads it. A wiped one stays
// listed, as do earlier tests' instances, since the local runtime keeps each emptied database.
const stored = async (name: string) =>
  (await listDurableObjectIds(env.QlooGateway)).some((id) => id.equals(env.QlooGateway.idFromName(name)))

describe("a network's own Qloo key", () => {
  it('is saved only once a search through it works, then shown to owners by its last four characters', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(network) })
    fakeQloo({ search: {}, keys: [OWN] })

    const refused = await addKey(ada, network, HACKATHON, UNKNOWN)
    expect([refused.status, await refused.json()]).toEqual([
      400,
      {
        error:
          "The key's test search on hackathon.api.qloo.com failed: Qloo returned 401: Invalid authentication credentials. The key isn't saved: check it, and that it's for that host, then try again."
      }
    ])
    expect(sent()).toEqual([[`${HACKATHON}/search`, UNKNOWN]])
    expect((await settings(ada, network)).qlooKey).toEqual({ set: false })

    const res = await addKey(ada, network, HACKATHON, ` ${OWN} `)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(JSON.parse(body).key).toEqual({ set: true, host: HACKATHON, last4: '7f3a' })
    // The saved key's test search was a call on the network's key, so its usage counts it; the
    // refused key's, which saved nothing, it doesn't.
    expect(JSON.parse(body).usage.qlooCalls.used).toBe(1)
    expect(body).not.toContain(OWN)
    expect(sent()).toEqual([
      [`${HACKATHON}/search`, UNKNOWN],
      [`${HACKATHON}/search`, OWN]
    ])

    const owners = await settings(ada, network)
    expect(owners.qlooKey).toEqual({ set: true, host: HACKATHON, last4: '7f3a' })
    expect(owners.html).not.toContain(OWN)
    // A member sees that a key is set, not which.
    const members = await settings(grace, network)
    expect(members.qlooKey).toEqual({ set: true })
    expect(members.html).not.toContain('7f3a')
  })

  it("is an owner's to add or remove, for one of Qloo's hosts, and a refusal sends Qloo nothing", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(network) })
    const mal = await openMember({ name: 'Mal Stranger' })
    fakeQloo({ search: {}, keys: [OWN] })
    const refusal = async (res: Response) => [res.status, res.status === 404 ? null : await res.json()]

    expect(await refusal(await addKey(grace, network, HACKATHON, OWN))).toEqual([
      403,
      { error: "Only an owner can add or remove the network's Qloo key." }
    ])
    expect(await refusal(await addKey(mal, network, HACKATHON, OWN))).toEqual([404, null])
    expect(await refusal(await addKey(ada, network, 'https://qloo.example', OWN))).toEqual([
      400,
      { error: 'Choose the host the key is for: Qloo’s production API, or the hackathon’s.' }
    ])
    expect(await refusal(await addKey(ada, network, PRODUCTION, '  '))).toEqual([
      400,
      { error: 'Paste the network’s Qloo API key.' }
    ])
    expect(await refusal(await addKey(ada, network, PRODUCTION, `X-Api-Key: ${OWN}`))).toEqual([
      400,
      { error: 'That isn’t a Qloo API key: paste the key alone, as Qloo sent it.' }
    ])
    const remove = (member: Member) => post(member, `/app/${network}/settings/qloo-key/remove`)
    expect(await refusal(await remove(ada))).toEqual([
      409,
      { error: 'The network has no Qloo key of its own: its calls go through Crossfeed’s shared key.' }
    ])
    expect(sent()).toEqual([])

    expect((await addKey(ada, network, PRODUCTION, OWN)).status).toBe(200)
    expect(await refusal(await addKey(ada, network, HACKATHON, OWN))).toEqual([
      409,
      { error: 'The network has its own Qloo key already. Remove it, then add the new one.' }
    ])
    expect(await refusal(await remove(grace))).toEqual([
      403,
      { error: "Only an owner can add or remove the network's Qloo key." }
    ])
    expect(await refusal(await remove(mal))).toEqual([404, null])
    expect((await settings(ada, network)).qlooKey).toEqual({ set: true, host: PRODUCTION, last4: '7f3a' })
  })

  it("carries the network's and its launches' Qloo calls to its host with its key, with a cache of its own", async () => {
    const ada = await openMember()
    const own = await created(ada)
    const shared = await created(ada, 'Paper Route Media')
    fakeQloo({ search, keys: [OWN, env.QLOO_API_KEY] })
    fakeInsights(fit)
    expect((await addKey(ada, own, PRODUCTION, OWN)).status).toBe(200)
    requests.length = 0
    // The agents know the network has its key, so no call asks its gateway first (#197).
    const asked = vi.spyOn(QlooGateway.prototype, 'ownKey')

    const network = await connect(ada, `/agents/network/${own}`)
    await network.importRoster('Corner Booth\nSlow Burn')
    expect(network.state()!.roster.map((s) => s.resolution)).toEqual(['resolved', 'resolved'])
    expect(sent()).toEqual([
      [`${PRODUCTION}/search`, OWN],
      [`${PRODUCTION}/search`, OWN]
    ])

    // A network without a key of its own shares the global gateway, whose cache never saw that lookup.
    requests.length = 0
    await (await connect(ada, `/agents/network/${shared}`)).importRoster('Corner Booth')
    expect(sent()).toEqual([[`${env.QLOO_BASE_URL}/search`, env.QLOO_API_KEY]])

    // A launch's run goes through the network's instance too: its search for a show the roster looked up
    // is answered from the network's own cache.
    requests.length = 0
    run()
    const { id } = await network.call<{ id: string }>('createLaunch', { name: 'Night Shift Cinema' })
    const launch = await connect(ada, `/agents/launch/${own}/${id}`)
    await launch.call('startLaunch', { name: 'Night Shift Cinema' })
    const done = await launch.until((s) => s.run?.status !== 'running')
    expect([done.run?.status, done.ranking?.rows.map((r) => r.show)]).toEqual([
      'completed',
      ['Corner Booth', 'Slow Burn']
    ])
    expect(sent()).toEqual([
      [`${PRODUCTION}/search`, OWN],
      [`${PRODUCTION}/v2/insights`, OWN]
    ])
    expect(searched()).toEqual(['Night Shift Cinema'])
    expect(asked).not.toHaveBeenCalled()
  })

  it("reaches a launch's run under way as it's removed, so the run's next call goes with Crossfeed's key", async () => {
    const ada = await openMember()
    const own = await created(ada)
    fakeQloo({ search, keys: [OWN, env.QLOO_API_KEY] })
    fakeInsights(fit)
    expect((await addKey(ada, own, PRODUCTION, OWN)).status).toBe(200)
    const network = await connect(ada, `/agents/network/${own}`)
    await network.importRoster('Corner Booth\nSlow Burn')
    fakeClaude([
      turn(toolUse('resolve_entities', { names: ['Night Shift Cinema'], type: 'urn:entity:podcast' })),
      turn(toolUse('ask_human', { question: 'Rank the roster now?', kind: 'choice', options: ['Yes', 'No'] })),
      turn(
        toolUse('rank_candidates', {
          anchor_ids: ['e-0001'],
          candidate_ids: ['e-0501', 'e-0502'],
          type: 'urn:entity:podcast'
        })
      ),
      turn(text('Corner Booth fits best.'))
    ])
    const { id } = await network.call<{ id: string }>('createLaunch', { name: 'Night Shift Cinema' })
    const launch = await connect(ada, `/agents/launch/${own}/${id}`)
    requests.length = 0
    await launch.call('startLaunch', { name: 'Night Shift Cinema' })
    const { run: waiting } = await launch.until((s) => s.run?.status === 'waiting')

    expect((await post(ada, `/app/${own}/settings/qloo-key/remove`)).status).toBe(200)
    await launch.call('answer', waiting!.question!.id, { choice: 'Yes' })
    const { run: done } = await launch.until((s) => s.run?.status === 'completed' || s.run?.status === 'failed')
    expect([done?.status, done?.error]).toEqual(['completed', null])
    expect(sent()).toEqual([
      [`${PRODUCTION}/search`, OWN],
      [`${env.QLOO_BASE_URL}/v2/insights`, env.QLOO_API_KEY]
    ])
  })

  it("reaches a launch's next run with its copy of the roster, when the notice of it failed", async () => {
    const ada = await openMember()
    const own = await created(ada)
    fakeQloo({ search, keys: [OWN, env.QLOO_API_KEY] })
    fakeInsights(fit)
    const network = await connect(ada, `/agents/network/${own}`)
    await network.importRoster('Corner Booth\nSlow Burn')
    const { id } = await network.call<{ id: string }>('createLaunch', { name: 'Night Shift Cinema' })
    const launch = await connect(ada, `/agents/launch/${own}/${id}`)
    const failed = vi.spyOn(console, 'error')
    vi.spyOn(LaunchAgent.prototype, 'noteOwnKey').mockRejectedValueOnce(new Error('The launch is overloaded.'))
    expect((await addKey(ada, own, PRODUCTION, OWN)).status).toBe(200)
    expect(failed).toHaveBeenCalledWith(
      JSON.stringify({ event: 'own_key_notice', launch: id, error: 'Error: The launch is overloaded.' })
    )

    requests.length = 0
    run()
    await launch.call('startLaunch', { name: 'Night Shift Cinema' })
    expect((await launch.until((s) => s.run?.status !== 'running')).run?.status).toBe('completed')
    // The roster's lookup was Crossfeed's, so the network's own cache has none of it yet.
    expect(sent()).toEqual([
      [`${PRODUCTION}/search`, OWN],
      [`${PRODUCTION}/search`, OWN],
      [`${PRODUCTION}/v2/insights`, OWN]
    ])
  })

  it("counts the network's Qloo calls on its own instance, and its model runs in the global gateway", async () => {
    env.RUN_DAILY_CAP = '1'
    const ada = await openMember()
    const own = await created(ada)
    fakeQloo({ search, keys: [OWN] })
    fakeInsights(fit)
    expect((await addKey(ada, own, HACKATHON, OWN)).status).toBe(200)
    const network = await connect(ada, `/agents/network/${own}`)
    await network.importRoster('Corner Booth\nSlow Burn')
    run()
    const { id } = await network.call<{ id: string }>('createLaunch', { name: 'Night Shift Cinema' })
    const launch = await connect(ada, `/agents/launch/${own}/${id}`)
    await launch.call('startLaunch', { name: 'Night Shift Cinema' })
    expect((await launch.until((s) => s.run?.status !== 'running')).run?.status).toBe('completed')

    // The key's test search, two lookups, and the run's three calls, its cache hit too.
    const usage = (await settings(ada, own)).usage
    expect([usage.qlooCalls, usage.modelRuns]).toEqual([
      { used: 6, limit: 2000 },
      { used: 1, limit: 10 }
    ])
    const { secret } = await (
      await post(ada, `/app/${own}/settings/api-keys`, { name: 'Nightly sync' })
    ).json<{
      secret: string
    }>()
    expect(await (await api(secret)(`/api/v1/networks/${own}/usage`)).json()).toEqual(usage)

    // The run counted among every visitor's and network's model runs: the demo's visitors are at
    // Crossfeed's cap now.
    const visitor = await openSession()
    open.push(visitor)
    await visitor.call('startLaunch', { name: 'Night Shift Cinema' })
    const stopped = (await visitor.until((s) => s.run?.status !== 'running')).run
    expect([stopped?.status, stopped?.error]).toEqual([
      'stopped',
      "Crossfeed's cap of 1 model run a day across all visitors is reached; it resets at 00:00 UTC, so runs on your own data wait until then. Only the sample launch, on the unchanged sample network, replays its stored run."
    ])
  })

  it('leaves a network without one with no gateway instance, whatever its pages, agents, and API do', async () => {
    const ada = await openMember()
    const own = await created(ada)
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(own) })
    fakeQloo({ search })
    fakeInsights(fit)
    expect([(await settings(ada, own)).qlooKey, (await settings(grace, own)).qlooKey]).toEqual([
      { set: false },
      { set: false }
    ])
    const network = await connect(ada, `/agents/network/${own}`)
    await network.importRoster('Corner Booth\nSlow Burn')
    await network.searchComps('Corner Booth', 'Slow Burn')
    run()
    const { id } = await network.call<{ id: string }>('createLaunch', { name: 'Night Shift Cinema' })
    const launch = await connect(ada, `/agents/launch/${own}/${id}`)
    await launch.call('startLaunch', { name: 'Night Shift Cinema' })
    expect((await launch.until((s) => s.run?.status !== 'running')).run?.status).toBe('completed')
    const { secret } = await (
      await post(ada, `/app/${own}/settings/api-keys`, { name: 'Nightly sync' })
    ).json<{
      secret: string
    }>()
    const usage = await (await api(secret)(`/api/v1/networks/${own}/usage`)).json<{ qlooCalls: { used: number } }>()

    // Every call went with Crossfeed's key and counted in the global gateway; the network has no other.
    expect(new Set(sent().map(([, key]) => key))).toEqual(new Set([env.QLOO_API_KEY]))
    expect(usage.qlooCalls.used).toBe(6)
    expect([await stored('global'), await stored(`network:${own}`)]).toEqual([true, false])
  })

  it('is removed by wiping its instance, and the network goes back to the shared key', async () => {
    const ada = await openMember()
    const own = await created(ada)
    fakeQloo({ search, keys: [OWN, env.QLOO_API_KEY] })
    expect((await addKey(ada, own, PRODUCTION, OWN)).status).toBe(200)
    const network = await connect(ada, `/agents/network/${own}`)
    await network.importRoster('Corner Booth')
    await network.searchComps('Corner Booth', 'Slow Burn')
    await network.searchComps('Corner Booth', 'Slow Burn')
    expect(searched().slice(1)).toEqual(['Corner Booth', 'Slow Burn']) // the second search, from its cache
    // The key's test search, then the three.
    expect((await settings(ada, own)).usage.qlooCalls.used).toBe(4)

    requests.length = 0
    const res = await post(ada, `/app/${own}/settings/qloo-key/remove`)
    expect(res.status).toBe(200)
    // Its calls never counted in the global gateway.
    const removed = await res.json<{ key: object; usage: { qlooCalls: { used: number } } }>()
    expect([removed.key, removed.usage.qlooCalls.used]).toEqual([{ set: false }, 0])
    expect(sent()).toEqual([])
    // The removal told the agent before the wipe, so the settings no longer ask the instance.
    expect((await settings(ada, own)).qlooKey).toEqual({ set: false })
    await network.importRoster('Corner Booth\nSlow Burn')
    expect(sent()).toEqual([[`${env.QLOO_BASE_URL}/search`, env.QLOO_API_KEY]])

    // Its instance kept nothing: added again, the key starts with an empty cache, and only its new test
    // search counted before the comp search.
    requests.length = 0
    expect((await addKey(ada, own, PRODUCTION, OWN)).status).toBe(200)
    await network.searchComps('Corner Booth', 'Slow Burn')
    expect(sent().slice(1)).toEqual([[`${PRODUCTION}/search`, OWN]])
    expect((await settings(ada, own)).usage.qlooCalls.used).toBe(2)
  })

  it("stays the network's when it was saved before its agent kept whether it has one (#197)", async () => {
    const ada = await openMember()
    const own = await created(ada)
    fakeQloo({ search, keys: [OWN] })
    expect((await addKey(ada, own, HACKATHON, OWN)).status).toBe(200)
    // An agent from before #197 never kept it: drop what it keeps, then restart it, as a deploy does.
    const agent = env.NetworkAgent.get(env.NetworkAgent.idFromName(own))
    await runInDurableObject(agent, (_, state) => state.storage.kv.delete('crossfeed_own_qloo_key'))
    await evictDurableObject(agent)

    requests.length = 0
    await (await connect(ada, `/agents/network/${own}`)).importRoster('Corner Booth')
    expect(sent()).toEqual([[`${HACKATHON}/search`, OWN]])
    expect((await settings(ada, own)).qlooKey).toEqual({ set: true, host: HACKATHON, last4: '7f3a' })
  })

  it('stays, carrying the calls still, when wiping it fails, so the owner can remove it again', async () => {
    const ada = await openMember()
    const own = await created(ada)
    fakeQloo({ search, keys: [OWN] })
    expect((await addKey(ada, own, HACKATHON, OWN)).status).toBe(200)
    vi.spyOn(QlooGateway.prototype, 'wipe').mockRejectedValueOnce(new Error('The gateway is overloaded.'))
    expect((await post(ada, `/app/${own}/settings/qloo-key/remove`)).status).toBe(500)
    expect((await settings(ada, own)).qlooKey).toEqual({ set: true, host: HACKATHON, last4: '7f3a' })
    requests.length = 0
    await (await connect(ada, `/agents/network/${own}`)).importRoster('Corner Booth')
    expect(sent()).toEqual([[`${HACKATHON}/search`, OWN]])

    expect((await post(ada, `/app/${own}/settings/qloo-key/remove`)).status).toBe(200)
    expect((await settings(ada, own)).qlooKey).toEqual({ set: false })
  })

  it('can be added again when a removal emptied its instance but its answer was lost', async () => {
    const ada = await openMember()
    const own = await created(ada)
    fakeQloo({ search, keys: [OWN] })
    expect((await addKey(ada, own, HACKATHON, OWN)).status).toBe(200)
    const wipe = QlooGateway.prototype.wipe
    vi.spyOn(QlooGateway.prototype, 'wipe').mockImplementationOnce(async function (this: QlooGateway) {
      await wipe.call(this)
      throw new Error('The answer was lost.')
    })
    expect((await post(ada, `/app/${own}/settings/qloo-key/remove`)).status).toBe(500)
    // The wipe ran, so the instance holds no key, but its answer was lost, so the agent still says the
    // network has one and the settings ask the instance: read it once it has reset, then the page.
    expect(await readAfterReset(() => env.QlooGateway.getByName(`network:${own}`).ownKey())).toEqual({ set: false })
    expect((await settings(ada, own)).qlooKey).toEqual({ set: false })

    expect((await addKey(ada, own, HACKATHON, OWN)).status).toBe(200)
    expect((await settings(ada, own)).qlooKey).toEqual({ set: true, host: HACKATHON, last4: '7f3a' })
  })

  it('fails a call its removal cuts off with why, rather than a storage error', async () => {
    const ada = await openMember()
    const own = await created(ada)
    fakeQloo({ search, keys: [OWN] })
    expect((await addKey(ada, own, PRODUCTION, OWN)).status).toBe(200)
    const network = await connect(ada, `/agents/network/${own}`)
    // The import's searches reach Qloo, which answers only once the key is removed.
    const answers = Promise.withResolvers<void>()
    fakeQloo({ search, keys: [OWN], held: answers.promise })
    requests.length = 0
    await network.call('importRoster', 'Corner Booth\nSlow Burn')
    await vi.waitFor(() => expect(sent()).toHaveLength(2))

    // The wiped instance resets a moment after its wipe. Holding that moment, so the answers land in it,
    // means it never resets: the test's own reset clears it afterwards.
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    expect((await post(ada, `/app/${own}/settings/qloo-key/remove`)).status).toBe(200)
    answers.resolve()
    const { roster } = await network.until((s) => s.roster.every((show) => show.resolution !== 'pending'))
    vi.useRealTimers()
    const cutOff =
      "The Qloo gateway failed: The network's own Qloo key was removed, or the network deleted, while this call was out, so it was cut off. Calls made from now on go through Crossfeed's shared key"
    expect(roster.map((show) => [show.resolution, show.error])).toEqual([
      ['failed', cutOff],
      ['failed', cutOff]
    ])
  })

  it('is kept sealed with QLOO_KEY_SECRET, so no other secret opens it, and no run spends a model run on it', async () => {
    const ada = await openMember()
    const own = await created(ada)
    fakeQloo({ search, keys: [OWN] })
    expect((await addKey(ada, own, HACKATHON, OWN)).status).toBe(200)
    // What the network's gateway instance stores, read as a storage test reads D1: nothing in it is the key.
    const stored = await runInDurableObject(env.QlooGateway.getByName(`network:${own}`), (_, state) =>
      JSON.stringify(
        state.storage.sql
          .exec("SELECT name FROM sqlite_master WHERE type = 'table'")
          .toArray()
          .map(({ name }) => state.storage.sql.exec(`SELECT * FROM "${name}"`).toArray())
      )
    )
    expect(stored).toContain('7f3a')
    expect(stored).not.toContain(OWN)

    env.QLOO_KEY_SECRET = 'another-secret'
    const network = await connect(ada, `/agents/network/${own}`)
    const { roster } = await network.importRoster('Corner Booth')
    expect([roster[0].resolution, roster[0].error]).toEqual([
      'failed',
      "The network's own Qloo key can't be read, since Crossfeed's secret for it has changed. An owner adds the key again in settings"
    ])
    // A launch's run that couldn't call Qloo stops at once, as while Qloo is failing, spending no model run.
    const { id } = await network.call<{ id: string }>('createLaunch', { name: 'Night Shift Cinema' })
    const launch = await connect(ada, `/agents/launch/${own}/${id}`)
    await launch.call('startLaunch', { name: 'Night Shift Cinema' })
    const { run } = await launch.until((s) => s.run !== null && s.run.status !== 'running')
    expect([run?.status, run?.error]).toEqual([
      'failed',
      "The network's own Qloo key can't be read, since Crossfeed's secret for it has changed. An owner adds the key again in settings, so runs on your own data wait until Qloo answers again. Only the sample launch, on the unchanged sample network, replays its stored run."
    ])
    expect((await settings(ada, own)).usage.modelRuns.used).toBe(0)
  })

  it('is wiped with its network, and by the daily cron when that wipe failed', async () => {
    const ada = await openMember()
    fakeQloo({ search, keys: [OWN] })
    // What the network's own instance holds, read over RPC as the Worker would. A wiped instance resets,
    // which breaks every stub to it, so each read takes a new one.
    const held = async (id: string) => {
      const gateway = env.QlooGateway.getByName(`network:${id}`)
      return [await gateway.ownKey(), (await gateway.usage(`network:${id}`)).qlooCalls.used]
    }
    const networks: { id: string; name: string }[] = []
    for (const name of ['Night Shift Audio', 'Paper Route Media']) {
      const id = await created(ada, name)
      expect((await addKey(ada, id, HACKATHON, OWN)).status).toBe(200)
      await (await connect(ada, `/agents/network/${id}`)).importRoster('Corner Booth')
      // The key's test search and the lookup.
      expect(await held(id)).toEqual([{ set: true, host: HACKATHON, last4: '7f3a' }, 2])
      networks.push({ id, name })
    }
    const wiped = async (id: string) => expect(await readAfterReset(() => held(id))).toEqual([{ set: false }, 0])
    const remove = ({ id, name }: (typeof networks)[number]) =>
      post(ada, `/app/${id}/settings/delete`, { name }).then((res) => res.status)

    const [first, second] = networks
    expect(await remove(first)).toBe(200)
    await wiped(first.id)

    vi.spyOn(QlooGateway.prototype, 'wipe').mockRejectedValueOnce(new Error('The gateway is overloaded.'))
    expect(await remove(second)).toBe(200)
    expect((await held(second.id))[0]).toEqual({ set: true, host: HACKATHON, last4: '7f3a' })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 2 * 60_000)
    fakeQloo({ search: { 'The Rewatchables': [] } }) // the cron's health check
    const ctx = createExecutionContext()
    await (worker as ExportedHandler<Env>).scheduled!(createScheduledController({ cron: '0 12 * * *' }), env, ctx)
    await waitOnExecutionContext(ctx)
    await wiped(second.id)
  })
})
