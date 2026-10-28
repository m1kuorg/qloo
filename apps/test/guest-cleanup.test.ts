// Removing expired guest members (ADR 0006): every hour the cron removes each guest member whose day has
// ended, with every network only expiring guest members own, and revokes the API keys and invite links
// they made. Each test drives the Worker's routes, the agents' connections, and the cron's scheduled
// handler, a day on, as the clock moves.
import { getAgentByName } from 'agents'
import { createExecutionContext, createScheduledController, waitOnExecutionContext } from 'cloudflare:test'
import { env, exports } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index'
import { softwareAuthenticator } from './authenticator'
import { api, guestSignIn, openGuest, openMember, readAfterReset, type Guest, type Session } from './session'

const HOUR = 60 * 60_000
const DAY = 24 * HOUR

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

// Runs the Worker's scheduled handler as Cloudflare does at the hourly cron in wrangler.jsonc.
async function runCron() {
  const ctx = createExecutionContext()
  await (worker as ExportedHandler<Env>).scheduled!(createScheduledController({ cron: '0 0-11,13-23 * * *' }), env, ctx)
  await waitOnExecutionContext(ctx)
}

// Moves the clock `ms` on, for the Worker and its agents.
function later(ms: number) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(Date.now() + ms)
}

// A write from a page, as its islands send them.
const post = (who: Pick<Guest, 'fetch'>, path: string, body: object = {}) =>
  who.fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

// A network `who` creates, as /app/new does.
const created = async (who: Pick<Guest, 'fetch'>, name: string) =>
  (await (await post(who, '/app/new', { name })).json<{ id: string }>()).id

// A network's members by name, as its settings page gives them to its island.
async function membersOf(who: Pick<Guest, 'fetch'>, network: string) {
  const html = await (await who.fetch(`/app/${network}/settings`)).text()
  const members = JSON.parse(html.match(/data-members="([^"]*)"/)![1].replace(/&quot;/g, '"')) as { name: string }[]
  return members.map((m) => m.name).sort()
}

// The guest's ID and name, as the guest network's dashboard and their account page give them.
async function whoIs(guest: Guest) {
  const id = (await (await guest.fetch('/app/guest-network')).text()).match(/data-member-id="([^"]*)"/)![1]
  const name = (await (await guest.fetch('/app/account')).text()).match(/data-member-name="([^"]*)"/)![1]
  return { id, name }
}

// An invite link's token, as owner `who` makes the link in network `network`'s settings.
const invite = async (who: Pick<Guest, 'fetch'>, network: string) =>
  new URL(
    (await (await post(who, `/app/${network}/settings/members/invites`)).json<{ link: string }>()).link
  ).hash.slice(1)

// `who` joins a network through invite token `token`, as a member.
async function join(who: Pick<Guest, 'fetch'>, token: string) {
  expect((await post(who, '/auth/join', { token })).status).toBe(200)
}

// Owner `who` makes member `memberId` an owner of network `network` too.
async function makeOwner(who: Pick<Guest, 'fetch'>, network: string, memberId: string) {
  expect((await post(who, `/app/${network}/settings/members/${memberId}/role`, { role: 'owner' })).status).toBe(200)
}

describe('the hourly cron', () => {
  it('removes a guest member once their day is over, with their memberships of other networks', async () => {
    const lin = await openMember({ name: 'Lin Editor' })
    const theirs = await created(lin, 'Paper Route')
    const ada = await openGuest()
    const { name } = await whoIs(ada)
    await join(ada, await invite(lin, theirs))
    expect(await membersOf(lin, theirs)).toEqual([name, 'Lin Editor'])

    later(DAY - HOUR)
    await runCron()
    expect(await membersOf(lin, theirs)).toEqual([name, 'Lin Editor'])

    later(2 * HOUR)
    await runCron()
    expect(await membersOf(lin, theirs)).toEqual(['Lin Editor'])
  })

  it('deletes a network only they own, as a deleted network is: its pages answer 404, and the next runs wipe its agents', async () => {
    const ada = await openGuest()
    const hers = await created(ada, 'Night Shift Audio')
    expect((await post(ada, `/app/${hers}/settings/network`, { name: 'Night Shift Audio', cpm: 25 })).status).toBe(200)
    const { link } = await (await post(ada, `/app/${hers}/settings/members/invites`)).json<{ link: string }>()
    const lin = await openMember({ name: 'Lin Editor', invite: link })
    const dashboard = await connect(lin, `/agents/network/${hers}`)
    const { id: launch } = await dashboard.call<{ id: string }>('createLaunch', { name: 'The Night Watch' })
    const page = await connect(lin, `/agents/launch/${hers}/${launch}`)
    const logged = vi.spyOn(console, 'log')
    const retried = () =>
      logged.mock.calls
        .flat()
        .filter((line) => String(line).startsWith('{"event":"wipes_retried"'))
        .at(-1)

    later(DAY + HOUR)
    await runCron()
    expect(logged).toHaveBeenCalledWith(JSON.stringify({ event: 'guests_removed', members: 1, networks: 1 }))
    for (const path of [`/app/${hers}`, `/app/${hers}/settings`, `/app/${hers}/launches/${launch}`])
      expect((await lin.fetch(path)).status, path).toBe(404)
    await expect(lin.connect(`/agents/network/${hers}`)).rejects.toThrow('did not upgrade: 404')
    expect((await lin.fetch('/app', { redirect: 'manual' })).headers.get('location')).toBe('/app/new')

    // The next run wipes its agent, closing its pages, and notes its launches' wipes from its list.
    later(HOUR)
    await runCron()
    expect(await dashboard.closed()).toEqual({ code: 4410, reason: 'This network was deleted.' })
    expect(retried()).toBe(JSON.stringify({ event: 'wipes_retried', wiped: 1, kept: 0, failed: 0 }))
    expect(await readAfterReset(async () => (await getAgentByName(env.NetworkAgent, hers)).state)).toMatchObject({
      cpm: null,
      launches: []
    })

    // And the one after wipes its launches and its own Qloo gateway instance.
    later(HOUR)
    await runCron()
    expect((await page.closed()).code).toBe(4410)
    expect(retried()).toBe(JSON.stringify({ event: 'wipes_retried', wiped: 2, kept: 0, failed: 0 }))
    expect(
      await readAfterReset(
        async () => (await (await getAgentByName(env.LaunchAgent, `${hers}:${launch}`)).state).launch?.name ?? null
      )
    ).toBeNull()
    later(HOUR)
    await runCron()
    expect(retried()).toBe(JSON.stringify({ event: 'wipes_retried', wiped: 0, kept: 0, failed: 0 }))
  })

  it('revokes the API keys and invite links they made in the networks that stay', async () => {
    const lin = await openMember({ name: 'Lin Editor' })
    const theirs = await created(lin, 'Paper Route')
    const ada = await openGuest()
    await join(ada, await invite(lin, theirs))
    await makeOwner(lin, theirs, (await whoIs(ada)).id)
    const made = await Promise.all(
      ['guest-network', theirs].map(async (network) => {
        const { secret } = await (
          await post(ada, `/app/${network}/settings/api-keys`, { name: 'Nightly sync' })
        ).json<{
          secret: string
        }>()
        return { network, call: api(secret), token: await invite(ada, network) }
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

    later(DAY + HOUR)
    await runCron()
    for (const { network, call, token } of made) {
      expect((await call(`/api/v1/networks/${network}`)).status, network).toBe(401)
      expect((await opened(token)).status, network).toBe(410)
    }
    // Lin's own still work.
    const { secret } = await (
      await post(lin, `/app/${theirs}/settings/api-keys`, { name: 'Lin’s sync' })
    ).json<{
      secret: string
    }>()
    expect((await api(secret)(`/api/v1/networks/${theirs}`)).status).toBe(200)
  })

  it('keeps the guest network as its last guest owner left it', async () => {
    const ada = await openGuest()
    const renamed = await post(ada, '/app/guest-network/settings/network', { name: 'Night Shift Guests', cpm: 25 })
    expect(renamed.status).toBe(200)

    later(DAY + HOUR)
    await runCron()
    const grace = await openGuest()
    expect(await membersOf(grace, 'guest-network')).toEqual([(await whoIs(grace)).name])
    expect((await (await grace.fetch('/app/guest-network')).text()).match(/data-network-name="([^"]*)"/)?.[1]).toBe(
      'Night Shift Guests'
    )
    expect((await connect(grace, '/agents/network/guest-network')).state()).toMatchObject({ cpm: 25 })
  })

  it('deletes a network two guests own when both expire, and keeps one an owner who stays shares', async () => {
    const ada = await openGuest()
    const grace = await openGuest()
    const dot = await openMember({ name: 'Dot Pruitt' })
    const lin = await openMember({ name: 'Lin Editor' })
    const shared = await created(ada, 'Night Shift Audio')
    await join(grace, await invite(ada, shared))
    await makeOwner(ada, shared, (await whoIs(grace)).id)
    await join(dot, await invite(ada, shared))
    const kept = await created(ada, 'Paper Route')
    await join(lin, await invite(ada, kept))
    await makeOwner(ada, kept, lin.id)

    later(DAY + HOUR)
    await runCron()
    expect((await dot.fetch(`/app/${shared}`)).status).toBe(404)
    expect((await lin.fetch(`/app/${kept}`)).status).toBe(200)
    expect(await membersOf(lin, kept)).toEqual(['Lin Editor'])
  })

  it('keeps a guest member who kept their account, with their networks', async () => {
    const ada = await openGuest()
    const hers = await created(ada, 'Night Shift Audio')
    const started = await post(ada, '/auth/passkeys/options')
    const { challenge, options } = await started.json<{ challenge: string; options: never }>()
    const device = softwareAuthenticator()
    const kept = await post(ada, '/auth/passkeys', { challenge, response: await device.register(options) })
    expect(kept.status).toBe(200)
    const cookie = kept.headers.get('set-cookie')!.split(';')[0]
    const member = {
      fetch: (path: string) => exports.default.fetch(`https://crossfeed.test${path}`, { headers: { Cookie: cookie } })
    }

    later(DAY + HOUR)
    await runCron()
    expect((await member.fetch(`/app/${hers}`)).status).toBe(200)
    expect(await membersOf(member, 'guest-network')).toHaveLength(1)
  })

  it('stays green with more wipes due than a run makes, and the next runs make the rest', async () => {
    // Three guests' three networks each, every one with its agent started, as a CPM set in settings starts it.
    const networks: string[] = []
    for (const guest of [await openGuest(), await openGuest(), await openGuest()])
      for (const name of ['Night Shift Audio', 'Paper Route', 'Corner Booth']) {
        const id = await created(guest, name)
        expect((await post(guest, `/app/${id}/settings/network`, { name, cpm: 25 })).status).toBe(200)
        networks.push(id)
      }
    const logged = vi.spyOn(console, 'log')

    // The first run deletes the networks and notes their agents' wipes; each later run makes at most
    // seven wipes, each network's agent noting its Qloo gateway instance's as it's wiped.
    const wiped: number[] = []
    for (let run = 0; run < 5; run++) {
      later(run === 0 ? DAY + HOUR : HOUR)
      await runCron()
      const line = logged.mock.calls
        .flat()
        .filter((l) => String(l).startsWith('{"event":"wipes_retried"'))
        .at(-1)
      const counts = JSON.parse(String(line)) as { wiped: number; kept: number; failed: number }
      expect(counts).toMatchObject({ kept: 0, failed: 0 })
      wiped.push(counts.wiped)
    }
    expect(wiped).toEqual([0, 7, 7, 4, 0])
    for (const id of networks)
      expect(await readAfterReset(async () => (await getAgentByName(env.NetworkAgent, id)).state)).toMatchObject({
        cpm: null
      })
  })

  it('prunes the guest sign-in log to the UTC day and the last minute, and the log of sign-ups through guests’ links to the day', async () => {
    const perMinute = env.GUEST_SIGNINS_PER_MINUTE
    env.GUEST_SIGNINS_PER_MINUTE = '2'
    try {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-10-28T23:59:30Z'))
      const ada = await openGuest()
      await openMember({
        name: 'Dot Pruitt',
        invite: `https://crossfeed.test/invite#${await invite(ada, 'guest-network')}`
      })
      vi.setSystemTime(new Date('2026-10-29T00:00:10Z'))
      await openGuest()
      const logged = vi.spyOn(console, 'log')
      // What's left is the storage itself, so this reads the tables.
      const count = (table: string) => env.DB.prepare(`SELECT count(*) AS n FROM ${table}`).first('n')

      await runCron()
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
      await runCron()
      expect(await count('guest_signins')).toBe(1)
    } finally {
      env.GUEST_SIGNINS_PER_MINUTE = perMinute
    }
  })
})
