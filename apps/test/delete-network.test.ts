// Deleting a network, from its settings' danger zone: an owner types its name, its directory rows go
// first, then its launches' agents and its own are wiped, and the daily cron retries any wipe that
// failed. Each test drives the Worker's routes and the agents' client protocol, and reads what an
// agent holds over RPC, as the Worker would.
import { getAgentByName } from 'agents'
import { createExecutionContext, createScheduledController, waitOnExecutionContext } from 'cloudflare:test'
import { env, exports } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index'
import { LaunchAgent } from '../src/launch-agent'
import { NetworkAgent } from '../src/network-agent'
import { fakeQloo } from './fake'
import { readAfterReset, openMember, type Member, type Session } from './session'

const origin = 'https://crossfeed.test'

// A write from one of the member's pages, as `send` in the island makes it.
const post = (member: Member, path: string, body: object = {}) =>
  member.fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

const open: Omit<Session, 'cookie'>[] = []
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  open.splice(0).forEach((agent) => agent.close())
})
const connect = async (member: Member, path: string) => {
  const agent = await member.connect(path)
  open.push(agent)
  return agent
}

// A network with a roster looked up in Qloo, a CPM, an API key, and two launches: something in every
// kind of storage it has.
async function network(ada: Member) {
  fakeQloo({ search: { 'Corner Booth': [{ entity_id: 'e-0501', name: 'Corner Booth', popularity: 0.6 }] } })
  const { id } = await (await post(ada, '/app/new', { name: 'Night Shift Audio' })).json<{ id: string }>()
  await post(ada, `/app/${id}/settings/network`, { name: 'Night Shift Audio', cpm: 25 })
  const { secret } = await (
    await post(ada, `/app/${id}/settings/api-keys`, { name: 'Nightly sync' })
  ).json<{
    secret: string
  }>()
  const dashboard = await connect(ada, `/agents/network/${id}`)
  await dashboard.importRoster('Corner Booth')
  const launches: string[] = []
  for (const name of ['Night Shift Cinema', 'The Long Take'])
    launches.push((await dashboard.call<{ id: string }>('createLaunch', { name })).id)
  dashboard.close()
  return { id, secret, launches }
}

// What a network's agent and its launches' agents hold, read over RPC.
async function held(id: string, launches: string[]) {
  const agent = await getAgentByName(env.NetworkAgent, id)
  const state = await agent.state
  return {
    network: { shows: state.roster.length, cpm: state.cpm, launches: (state.launches ?? []).length },
    evidence: (await agent.getEvidence()).length,
    launches: await Promise.all(
      launches.map(
        async (l) => (await (await getAgentByName(env.LaunchAgent, `${id}:${l}`)).state).launch?.name ?? null
      )
    )
  }
}
// A wiped agent's instance is reset a moment after its wipe: the next call meets a new, empty one.
const EMPTY = { network: { shows: 0, cpm: null, launches: 0 }, evidence: 0 }
const wipedOut = async (id: string, launches: string[]) =>
  expect(await readAfterReset(() => held(id, launches))).toEqual({ ...EMPTY, launches: launches.map(() => null) })

// Runs the Worker's scheduled handler as Cloudflare does at the cron in wrangler.jsonc.
async function runCron() {
  const handler: ExportedHandler<Env> = worker
  const ctx = createExecutionContext()
  await handler.scheduled!(createScheduledController({ cron: '0 12 * * *' }), env, ctx)
  await waitOnExecutionContext(ctx)
}

const remove = (member: Member, id: string, name: string) => post(member, `/app/${id}/settings/delete`, { name })
const DELETED = { code: 4410, reason: 'This network was deleted.' }

describe('deleting a network', () => {
  it('takes an owner typing its name, then its pages, agents, and API answer 404 and its storage is wiped', async () => {
    const ada = await openMember()
    const { id, secret, launches } = await network(ada)
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(id) })
    const link = await ada.invite(id)
    expect(await held(id, launches)).toEqual({
      network: { shows: 1, cpm: 25, launches: 2 },
      evidence: 1,
      launches: ['Night Shift Cinema', 'The Long Take']
    })
    const pages = [
      await connect(grace, `/agents/network/${id}`),
      await connect(grace, `/agents/launch/${id}/${launches[0]}`)
    ]
    const failed = vi.spyOn(console, 'error')

    const mistyped = await remove(ada, id, 'night shift audio')
    expect([mistyped.status, await mistyped.json()]).toEqual([
      400,
      { error: 'Type the network’s name, Night Shift Audio, exactly as it’s shown, to delete it.' }
    ])
    const byMember = await remove(grace, id, 'Night Shift Audio')
    expect([byMember.status, await byMember.json()]).toEqual([403, { error: 'Only an owner can delete the network.' }])
    expect((await remove(await openMember({ name: 'Mal Stranger' }), id, 'Night Shift Audio')).status).toBe(404)
    expect((await ada.fetch(`/app/${id}`)).status).toBe(200)

    const res = await remove(ada, id, ' Night Shift Audio ')
    expect([res.status, await res.json()]).toEqual([200, {}])
    for (const page of pages) expect(await page.closed()).toEqual(DELETED)
    await wipedOut(id, launches)
    expect(failed.mock.calls.flat().filter((line) => String(line).includes('"event":"wipe_failed"'))).toEqual([])

    for (const member of [ada, grace]) {
      for (const path of [
        `/app/${id}`,
        `/app/${id}/roster`,
        `/app/${id}/settings`,
        `/app/${id}/launches/${launches[0]}`
      ])
        expect((await member.fetch(path)).status, path).toBe(404)
      await expect(member.connect(`/agents/network/${id}`)).rejects.toThrow('did not upgrade: 404')
      await expect(member.connect(`/agents/launch/${id}/${launches[1]}`)).rejects.toThrow('did not upgrade: 404')
      expect((await member.fetch(`/api/v1/networks/${id}/roster`)).status).toBe(404)
      expect((await member.fetch('/app', { redirect: 'manual' })).headers.get('location')).toBe('/app/new')
    }
    // Its keys and invites went with it.
    const keyed = await exports.default.fetch(`${origin}/api/v1/networks/${id}`, {
      headers: { Authorization: `Bearer ${secret}` }
    })
    expect(keyed.status).toBe(401)
    const invite = await exports.default.fetch(`${origin}/auth/invite`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: new URL(link).hash.slice(1) })
    })
    expect(invite.status).toBe(404)
  })

  it('wipes at the daily cron what failed to wipe, the network and its launches alike', async () => {
    const ada = await openMember()
    const { id, launches } = await network(ada)
    vi.spyOn(NetworkAgent.prototype, 'destroy').mockRejectedValueOnce(new Error('The agent is overloaded.'))
    vi.spyOn(LaunchAgent.prototype, 'destroy').mockRejectedValueOnce(new Error('The agent is overloaded.'))
    const failed = vi.spyOn(console, 'error')
    const logged = vi.spyOn(console, 'log')

    expect((await remove(ada, id, 'Night Shift Audio')).status).toBe(200)
    expect((await ada.fetch(`/app/${id}`)).status).toBe(404)
    expect(failed.mock.calls.flat().filter((line) => String(line).includes('"event":"wipe_failed"'))).toHaveLength(2)
    // Its agent still lists the launch whose wipe failed, but the network is gone: the cron wipes both.
    const left = await held(id, launches)
    expect(left.network).toEqual({ shows: 1, cpm: 25, launches: 2 })
    expect(left.launches.filter((l) => l !== null)).toHaveLength(1)

    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 2 * 60_000)
    fakeQloo({ search: { 'The Rewatchables': [] } }) // the cron's health check
    await runCron()
    await wipedOut(id, launches)
    expect(logged.mock.calls.flat().map(String)).toContain(
      JSON.stringify({ event: 'wipes_retried', wiped: 2, kept: 0, failed: 0 })
    )
    await runCron()
    expect(logged.mock.calls.flat().map(String)).toContain(
      JSON.stringify({ event: 'wipes_retried', wiped: 0, kept: 0, failed: 0 })
    )
  })

  it('wipes a launch planned on an open page while the network was being deleted', async () => {
    const ada = await openMember()
    const { id, launches } = await network(ada)
    const page = await connect(ada, `/agents/network/${id}`)
    // A launch is planned on the network's agent, as an open page's call would, after the deletion read
    // the network's list and before the agent let go.
    let late = ''
    const letGo = NetworkAgent.prototype.letGo
    // Its RPC caller awaits it, so the stand-in may take a moment.
    const planThenLetGo = async function (this: NetworkAgent) {
      late = (await this.createLaunch({ name: 'Paper Route' })).id
      return letGo.call(this)
    }
    vi.spyOn(NetworkAgent.prototype, 'letGo').mockImplementationOnce(planThenLetGo as never)

    expect((await remove(ada, id, 'Night Shift Audio')).status).toBe(200)
    expect(await page.closed()).toEqual(DELETED)
    await wipedOut(id, [...launches, late])
  })
})
