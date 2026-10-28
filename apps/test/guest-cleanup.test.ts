// Removing expired guest members (ADR 0006): every hour the cron removes each guest member whose day has
// ended, with every network only expiring guest members own, and revokes the API keys and invite links
// they made. Each test drives the Worker's routes, the agents' connections, and the cron's scheduled
// handler, a day on, as the clock moves.
import { getAgentByName } from 'agents'
import { createExecutionContext, createScheduledController, waitOnExecutionContext } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index'
import { openGuest, openMember, readAfterReset, type Guest, type Member, type Session } from './session'

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

// The guest's name, as their account page shows it.
async function nameOf(guest: Guest) {
  return (await (await guest.fetch('/app/account')).text()).match(/data-member-name="([^"]*)"/)![1]
}

// Guest `guest` joins network `network` through an invite link `owner` makes, as a member.
async function join(guest: Guest, owner: Member, network: string) {
  const token = new URL(await owner.invite(network)).hash.slice(1)
  expect((await post(guest, '/auth/join', { token })).status).toBe(200)
}

describe('the hourly cron', () => {
  it('removes a guest member once their day is over, with their memberships of other networks', async () => {
    const lin = await openMember({ name: 'Lin Editor' })
    const theirs = await created(lin, 'Paper Route')
    const ada = await openGuest()
    const name = await nameOf(ada)
    await join(ada, lin, theirs)
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
})
