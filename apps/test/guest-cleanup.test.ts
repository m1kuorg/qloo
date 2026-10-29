// What the daily clearing (ADR 0008) clears of what guests made beyond the guest network: at 12:00 UTC the
// cron deletes the networks only the guest member owns, closing their pages, takes the guest member out of
// the networks it shares with members who have accounts, and deletes the API keys and invite links it
// made. The networks' agents are wiped over the hourly runs after. Each test drives the Worker's routes,
// the agents' connections, and the cron's scheduled handler, as the clock moves.
import { getAgentByName } from 'agents'
import { createExecutionContext, createScheduledController, waitOnExecutionContext } from 'cloudflare:test'
import { env, exports } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index'
import { fakeQloo } from './fake'
import { api, guestSignIn, openGuest, openMember, readAfterReset, rootData, type Guest, type Session } from './session'

const HOUR = 60 * 60_000

const open: Omit<Session, 'cookie'>[] = []
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  open.splice(0).forEach((agent) => agent.close())
})
const connect = async (who: Pick<Guest, 'connect'>, path: string) => {
  const agent = await who.connect(path)
  open.push(agent)
  return agent
}

// Runs the Worker's scheduled handler as Cloudflare does at the daily cron in wrangler.jsonc, or with
// `hourly`, at the hourly one.
async function runCron(hourly = false) {
  const ctx = createExecutionContext()
  const cron = hourly ? '0 0-11,13-23 * * *' : '0 12 * * *'
  await (worker as ExportedHandler<Env>).scheduled!(createScheduledController({ cron }), env, ctx)
  await waitOnExecutionContext(ctx)
}

// The daily cron, with a Qloo for its health check to search, which fails the run without one.
async function clearing() {
  fakeQloo({ search: { 'The Rewatchables': [{ entity_id: 'e-0701', name: 'The Rewatchables', popularity: 0.7 }] } })
  await runCron()
}

// Moves the clock `ms` on, for the Worker and its agents.
function later(ms: number) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(Date.now() + ms)
}

// A write from a page, as its islands send them.
const post = (who: Pick<Guest, 'fetch'>, path: string, body: object = {}) =>
  who.fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

// A network `who` creates, as /app/new does, with its agent started, as setting its CPM starts it.
async function created(who: Pick<Guest, 'fetch'>, name: string) {
  const { id } = await (await post(who, '/app/new', { name })).json<{ id: string }>()
  expect((await post(who, `/app/${id}/settings/network`, { name, cpm: 25 })).status).toBe(200)
  return id
}

// A network's members by name, as its settings page gives them to its island.
async function membersOf(who: Pick<Guest, 'fetch'>, network: string) {
  const html = await (await who.fetch(`/app/${network}/settings`)).text()
  const members = JSON.parse(html.match(/data-members="([^"]*)"/)![1].replace(/&quot;/g, '"')) as { name: string }[]
  return members.map((m) => m.name).sort()
}

// An invite link, as owner `who` makes it in network `network`'s settings.
const invite = async (who: Pick<Guest, 'fetch'>, network: string) =>
  (await (await post(who, `/app/${network}/settings/members/invites`)).json<{ link: string }>()).link

// Owner `who` makes member `memberId` an owner of network `network` too.
async function makeOwner(who: Pick<Guest, 'fetch'>, network: string, memberId: string) {
  expect((await post(who, `/app/${network}/settings/members/${memberId}/role`, { role: 'owner' })).status).toBe(200)
}

// The last count of wipes the cron's retry logged.
const lastRetry = (logged: { mock: { calls: unknown[][] } }) =>
  logged.mock.calls
    .flat()
    .filter((line) => String(line).startsWith('{"event":"wipes_retried"'))
    .at(-1)

describe('the daily clearing', () => {
  it('deletes a network only the guest member owns, closing its open pages, and the next runs wipe its agents', async () => {
    const guest = await openGuest()
    const made = await created(guest, 'Night Shift Audio')
    const lin = await openMember({ name: 'Lin Editor', invite: await invite(guest, made) })
    const dashboard = await connect(lin, `/agents/network/${made}`)
    const { id: launch } = await dashboard.call<{ id: string }>('createLaunch', { name: 'The Night Watch' })
    const page = await connect(guest, `/agents/launch/${made}/${launch}`)
    const logged = vi.spyOn(console, 'log')

    await clearing()
    expect(await dashboard.closed()).toEqual({ code: 4410, reason: 'This network was deleted.' })
    expect(logged).toHaveBeenCalledWith(JSON.stringify({ event: 'guest_member_cleared', networks: 1, left: 0 }))
    for (const who of [guest, lin])
      for (const path of [`/app/${made}`, `/app/${made}/settings`, `/app/${made}/launches/${launch}`])
        expect((await who.fetch(path)).status, path).toBe(404)
    await expect(lin.connect(`/agents/network/${made}`)).rejects.toThrow('did not upgrade: 404')
    expect((await lin.fetch('/app', { redirect: 'manual' })).headers.get('location')).toBe('/app/new')

    // The next run wipes its launch's agent, closing its page, its own, and its own Qloo gateway instance.
    later(HOUR)
    await runCron(true)
    expect((await page.closed()).code).toBe(4410)
    expect(await readAfterReset(async () => (await getAgentByName(env.NetworkAgent, made)).state)).toMatchObject({
      cpm: null,
      launches: []
    })
    expect(
      await readAfterReset(
        async () => (await (await getAgentByName(env.LaunchAgent, `${made}:${launch}`)).state).launch?.name ?? null
      )
    ).toBeNull()
    // Wiping the network's agent noted its launch's again, which the run after finds empty.
    expect(lastRetry(logged)).toBe(JSON.stringify({ event: 'wipes_retried', wiped: 3, kept: 0, failed: 0 }))
    later(HOUR)
    await runCron(true)
    expect(lastRetry(logged)).toBe(JSON.stringify({ event: 'wipes_retried', wiped: 1, kept: 0, failed: 0 }))
    later(HOUR)
    await runCron(true)
    expect(lastRetry(logged)).toBe(JSON.stringify({ event: 'wipes_retried', wiped: 0, kept: 0, failed: 0 }))
  })

  it('keeps a network a member with an account co-owns, taking the guest member out of it and closing guests’ pages of it', async () => {
    const guest = await openGuest()
    const made = await created(guest, 'Night Shift Audio')
    const lin = await openMember({ name: 'Lin Editor', invite: await invite(guest, made) })
    await makeOwner(guest, made, lin.id)
    const guests = await connect(guest, `/agents/network/${made}`)
    const theirs = await connect(lin, `/agents/network/${made}`)
    const logged = vi.spyOn(console, 'log')

    await clearing()
    expect(logged).toHaveBeenCalledWith(JSON.stringify({ event: 'guest_member_cleared', networks: 0, left: 1 }))
    expect(await guests.closed()).toEqual({ code: 4403, reason: "You're no longer a member of this network." })
    expect((await guest.fetch(`/app/${made}`)).status).toBe(404)
    expect((await lin.fetch(`/app/${made}`)).status).toBe(200)
    expect(await membersOf(lin, made)).toEqual(['Lin Editor'])
    expect(theirs.state()).toMatchObject({ cpm: 25 })
  })

  it('deletes the API keys and invite links the guest member made, so the guest network’s setup starts over', async () => {
    const guest = await openGuest()
    // A network a member with an account co-owns, which stays, and a member of the guest network.
    const shared = await created(guest, 'Night Shift Audio')
    const lin = await openMember({ name: 'Lin Editor', invite: await invite(guest, shared) })
    await makeOwner(guest, shared, lin.id)
    const dot = await openMember({ name: 'Dot Pruitt', invite: await invite(guest, 'guest-network') })
    const made = await Promise.all(
      ['guest-network', shared].map(async (network) => {
        const { secret } = await (
          await post(guest, `/app/${network}/settings/api-keys`, { name: 'Nightly sync' })
        ).json<{ secret: string }>()
        return { network, call: api(secret), token: new URL(await invite(guest, network)).hash.slice(1) }
      })
    )
    const opened = (token: string) =>
      exports.default.fetch('https://crossfeed.test/auth/invite', {
        method: 'POST',
        headers: { Origin: 'https://crossfeed.test', 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      })
    for (const { network, call, token } of made) {
      expect((await call(`/api/v1/networks/${network}`)).status).toBe(200)
      expect((await opened(token)).status).toBe(200)
    }
    // Whether the guest network's setup has a teammate invited, and a key used ("Connect your AI").
    const setup = async () => {
      const { invited, keys } = await rootData(guest, '/app/guest-network')
      return [invited, String(JSON.parse(keys).last !== null)]
    }
    expect(await setup()).toEqual(['true', 'true'])

    await clearing()
    for (const { network, call, token } of made) {
      expect((await call(`/api/v1/networks/${network}`)).status, network).toBe(401)
      expect((await opened(token)).status, network).toBe(404)
    }
    // Dot, who joined it, is still a member of the guest network, so a teammate has joined.
    expect(await membersOf(dot, 'guest-network')).toEqual(['Dot Pruitt', 'Guest'])
    expect(await setup()).toEqual(['true', 'false'])
    // Lin's own still work.
    const { secret } = await (
      await post(lin, `/app/${shared}/settings/api-keys`, { name: 'Lin’s sync' })
    ).json<{ secret: string }>()
    expect((await api(secret)(`/api/v1/networks/${shared}`)).status).toBe(200)
  })

  it('keeps counting the day’s sign-ups through guests’ invite links once it has deleted the links', async () => {
    const cap = env.INVITED_SIGNUP_DAILY_CAP
    env.INVITED_SIGNUP_DAILY_CAP = '1'
    try {
      const guest = await openGuest()
      await openMember({ name: 'Dot Pruitt', invite: await invite(guest, 'guest-network') })
      await clearing()
      const signUp = await exports.default.fetch('https://crossfeed.test/auth/sign-up/options', {
        method: 'POST',
        headers: { Origin: 'https://crossfeed.test', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Eve Booker',
          invite: new URL(await invite(guest, 'guest-network')).hash.slice(1)
        })
      })
      expect(signUp.status).toBe(429)
    } finally {
      env.INVITED_SIGNUP_DAILY_CAP = cap
    }
  })

  it('frees the networks the guest member may create, so guests can create the day’s again', async () => {
    const guest = await openGuest()
    // NETWORKS_PER_MEMBER, as wrangler.jsonc sets it; one of them co-owned by a member with an account.
    const kept = await created(guest, 'Night Shift Audio')
    const lin = await openMember({ name: 'Lin Editor', invite: await invite(guest, kept) })
    await makeOwner(guest, kept, lin.id)
    await created(guest, 'Paper Route')
    await created(guest, 'Corner Booth')
    expect((await post(guest, '/app/new', { name: 'Late Edition' })).status).toBe(429)

    await clearing()
    for (const name of ['Late Edition', 'Second Run', 'Third Act'])
      expect((await post(guest, '/app/new', { name })).status, name).toBe(200)
    expect((await post(guest, '/app/new', { name: 'Fourth Wall' })).status).toBe(429)
    expect((await lin.fetch(`/app/${kept}`)).status).toBe(200)
  })

  it('deletes up to NETWORKS_PER_MEMBER networks only the guest member owns, however many it shares', async () => {
    const guest = await openGuest()
    const shared = await created(guest, 'Night Shift Audio')
    const lin = await openMember({ name: 'Lin Editor', invite: await invite(guest, shared) })
    await makeOwner(guest, shared, lin.id)
    const only = [await created(guest, 'Paper Route'), await created(guest, 'Corner Booth')]
    const cap = env.NETWORKS_PER_MEMBER
    env.NETWORKS_PER_MEMBER = '2'
    try {
      const logged = vi.spyOn(console, 'log')
      await clearing()
      expect(logged).toHaveBeenCalledWith(JSON.stringify({ event: 'guest_member_cleared', networks: 2, left: 1 }))
      for (const id of [...only, shared]) expect((await guest.fetch(`/app/${id}`)).status, id).toBe(404)
      expect((await lin.fetch(`/app/${shared}`)).status).toBe(200)
    } finally {
      env.NETWORKS_PER_MEMBER = cap
    }
  })

  it('leaves the guest network’s members as they are, the guest member its owner', async () => {
    const guest = await openGuest()
    const dot = await openMember({ name: 'Dot Pruitt', invite: await invite(guest, 'guest-network') })
    await clearing()
    expect(await membersOf(dot, 'guest-network')).toEqual(['Dot Pruitt', 'Guest'])
    expect((await (await guest.fetch('/app/guest-network')).text()).match(/data-role="([^"]*)"/)?.[1]).toBe('owner')
  })

  it('stays green with more wipes due than a run makes, and the next runs make the rest', async () => {
    // NETWORKS_PER_MEMBER networks, each with a launch, every agent started.
    const guest = await openGuest()
    const networks: string[] = []
    for (const name of ['Night Shift Audio', 'Paper Route', 'Corner Booth']) {
      const id = await created(guest, name)
      await (await connect(guest, `/agents/network/${id}`)).call('createLaunch', { name: 'The Night Watch' })
      networks.push(id)
    }
    const logged = vi.spyOn(console, 'log')

    // The clearing deletes the networks and notes their nine instances' wipes; each later run makes at
    // most seven, each network's agent noting its launch's again as it's wiped.
    await clearing()
    const wiped: number[] = []
    for (let run = 0; run < 3; run++) {
      later(HOUR)
      await runCron(true)
      const counts = JSON.parse(String(lastRetry(logged))) as { wiped: number; kept: number; failed: number }
      expect(counts).toMatchObject({ kept: 0, failed: 0 })
      wiped.push(counts.wiped)
    }
    expect(wiped).toEqual([7, 5, 0])
    for (const id of networks)
      expect(await readAfterReset(async () => (await getAgentByName(env.NetworkAgent, id)).state)).toMatchObject({
        cpm: null
      })
  })
})

describe('the hourly cron', () => {
  it('prunes the guest sign-in log to the UTC day and the last minute, and the log of sign-ups through guests’ links to the day', async () => {
    const perMinute = env.GUEST_SIGNINS_PER_MINUTE
    env.GUEST_SIGNINS_PER_MINUTE = '2'
    try {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-10-28T23:59:30Z'))
      const ada = await openGuest()
      await openMember({ name: 'Dot Pruitt', invite: await invite(ada, 'guest-network') })
      vi.setSystemTime(new Date('2026-10-29T00:00:10Z'))
      await openGuest()
      const logged = vi.spyOn(console, 'log')
      // What's left is the storage itself, so this reads the tables.
      const count = (table: string) => env.DB.prepare(`SELECT count(*) AS n FROM ${table}`).first('n')

      await runCron(true)
      expect(logged).toHaveBeenCalledWith(
        JSON.stringify({
          event: 'directory_purged',
          sessions: 0,
          challenges: 0,
          invites: 0,
          guestSignIns: 0,
          guestInvitedSignUps: 1
        })
      )
      expect(await count('guest_invited_signups')).toBe(0)
      // Yesterday's last sign-in still counts toward this minute's.
      expect((await guestSignIn()).status).toBe(429)

      vi.setSystemTime(new Date('2026-10-29T00:01:00Z'))
      await runCron(true)
      expect(await count('guest_signins')).toBe(1)
      // The hourly cron clears nothing of what guests made.
      expect(
        logged.mock.calls.flat().filter((line) => /"event":"(guests_removed|guest_member_cleared)"/.test(String(line)))
      ).toEqual([])
    } finally {
      env.GUEST_SIGNINS_PER_MINUTE = perMinute
    }
  })
})
