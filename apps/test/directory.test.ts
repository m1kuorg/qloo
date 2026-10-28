// The D1 directory's schema, as every test sees it: test/session.ts wipes D1 after each test with
// the rest of storage, then applies the migrations again before the next. This file reads D1
// directly, since it tests the schema the directory module will own, and a migration's own changes
// to rows already there.
import {
  createExecutionContext,
  createScheduledController,
  waitOnExecutionContext,
  type D1Migration
} from 'cloudflare:test'
import { env, exports } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index'
import { sha256 } from '../src/text'
import { fakeQloo } from './fake'
import { api, networkWithKey, openGuest, openMember, type Member } from './session'

afterEach(() => vi.useRealTimers())

// Runs migration `number`'s statements again, as on a database from before it.
async function migrate(number: string) {
  const { TEST_MIGRATIONS } = env as unknown as { TEST_MIGRATIONS: D1Migration[] }
  const migration = TEST_MIGRATIONS.find((m) => m.name.startsWith(`${number}_`))!
  for (const query of migration.queries) await env.DB.prepare(query).run()
}

const tables = async () =>
  (
    await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"
    ).all<{ name: string }>()
  ).results.map((row) => row.name)

// The tests run in order: the first leaves a member behind for the reset to wipe before the second.
describe('the directory', () => {
  it('holds a member', async () => {
    await env.DB.prepare('INSERT INTO members (id, name, recovery_code_hash, created) VALUES (?, ?, ?, ?)')
      .bind('member-1', 'Ada Programmer', 'hash-1', Date.now())
      .run()
    const member = await env.DB.prepare('SELECT name FROM members WHERE id = ?').bind('member-1').first()
    expect(member).toEqual({ name: 'Ada Programmer' })
  })

  it('starts the next test with every table, and no rows but the guest network and the guest member, its owner', async () => {
    expect(await tables()).toEqual([
      'api_keys',
      'challenges',
      'd1_migrations',
      'guest_invited_signups',
      'guest_signins',
      'invites',
      'members',
      'memberships',
      'networks',
      'passkeys',
      'past_memberships',
      'sample_launches',
      'sessions',
      'wipes'
    ])
    const all = async (query: string) => (await env.DB.prepare(query).all()).results
    expect(await all('SELECT id, name, created_by FROM networks')).toEqual([
      { id: 'guest-network', name: 'Guest network', created_by: null }
    ])
    expect(await all('SELECT id, name, recovery_code_hash, guest FROM members')).toEqual([
      { id: 'guest-member', name: 'Guest', recovery_code_hash: 'none: the guest member has no recovery code', guest: 1 }
    ])
    expect(await all('SELECT network_id, member_id, role FROM memberships')).toEqual([
      { network_id: 'guest-network', member_id: 'guest-member', role: 'owner' }
    ])
    // The guest network's sample launches are loaded into each environment's database by hand.
    for (const table of [
      'guest_signins',
      'guest_invited_signups',
      'passkeys',
      'sessions',
      'invites',
      'api_keys',
      'sample_launches'
    ])
      expect(await env.DB.prepare(`SELECT count(*) AS n FROM ${table}`).first('n'), table).toBe(0)
  })
})

describe('migration 0003', () => {
  it('revokes the API keys and open invite links of whoever is no longer the network owner who made them', async () => {
    const { ada, network } = await networkWithKey()
    const owner = (m: Member) =>
      ada.fetch(`/app/${network}/settings/members/${m.id}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'owner' })
      })
    const made = async (m: Member) => {
      const res = await m.fetch(`/app/${network}/settings/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: m.name })
      })
      return { secret: (await res.json<{ secret: string }>()).secret, link: await m.invite(network) }
    }
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(network) })
    const lin = await openMember({ name: 'Lin Editor', invite: await ada.invite(network) })
    await owner(grace)
    await owner(lin)
    const keys = { ada: await made(ada), grace: await made(grace), lin: await made(lin) }
    // Grace is removed and Lin deletes their account; then their keys and links stand as they did when
    // neither was revoked, before #217.
    await ada.fetch(`/app/${network}/settings/members/${grace.id}/remove`, { method: 'POST' })
    await lin.fetch('/app/account/delete', { method: 'POST' })
    await env.DB.batch([
      env.DB.prepare('UPDATE api_keys SET revoked = NULL'),
      env.DB.prepare('UPDATE invites SET revoked = NULL')
    ])

    await migrate('0003')

    const reach = async ({ secret, link }: { secret: string; link: string }) => [
      (await api(secret)(`/api/v1/networks/${network}`)).status,
      (
        await exports.default.fetch('https://crossfeed.test/auth/invite', {
          method: 'POST',
          headers: { Origin: 'https://crossfeed.test', 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: new URL(link).hash.slice(1) })
        })
      ).status
    ]
    expect([await reach(keys.ada), await reach(keys.grace), await reach(keys.lin)]).toEqual([
      [200, 200],
      [401, 410],
      [401, 410]
    ])
  })
})

describe('migration 0008', () => {
  it('counts the sign-ups through guests’ links made before it, and deleting their network leaves the count', async () => {
    const cap = env.INVITED_SIGNUP_DAILY_CAP
    env.INVITED_SIGNUP_DAILY_CAP = '1'
    try {
      const guest = await openGuest()
      const post = (path: string, body: object = {}) =>
        guest.fetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
      const link = async (network: string) =>
        (await (await post(`/app/${network}/settings/members/invites`)).json<{ link: string }>()).link
      const { id } = await (await post('/app/new', { name: 'Night Shift Audio' })).json<{ id: string }>()
      await openMember({ name: 'Dot Pruitt', invite: await link(id) })
      const token = new URL(await link('guest-network')).hash.slice(1)
      // As before the migration, with no log of that sign-up. Its index is gone already, since 0009.
      await env.DB.prepare('DROP TABLE guest_invited_signups').run()

      await migrate('0008')
      expect((await post(`/app/${id}/settings/delete`, { name: 'Night Shift Audio' })).status).toBe(200)

      const signUp = await exports.default.fetch('https://crossfeed.test/auth/sign-up/options', {
        method: 'POST',
        headers: { Origin: 'https://crossfeed.test', 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Eve Booker', invite: token })
      })
      expect(signUp.status).toBe(429)
    } finally {
      env.INVITED_SIGNUP_DAILY_CAP = cap
    }
  })
})

describe('migration 0009', () => {
  const origin = 'https://crossfeed.test'
  // A temporary guest member, as ADR 0006's guest sign-in made one, signed in for a day, and its browser's
  // requests, as a page sends them.
  async function temporaryGuest() {
    const id = `guest-${crypto.randomUUID()}`
    const token = crypto.randomUUID()
    const now = Date.now()
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO members (id, name, recovery_code_hash, created, guest) VALUES (?1, 'Guest 4F2A9C', 'none: guest ' || ?1, ?2, 1)"
      ).bind(id, now),
      env.DB.prepare(
        'INSERT INTO sessions (token_hash, member_id, created, expires, last_seen) VALUES (?, ?, ?, ?, ?)'
      ).bind(await sha256(token), id, now, now + 24 * 60 * 60_000, now)
    ])
    return (path: string, body?: object) =>
      exports.default.fetch(`${origin}${path}`, {
        redirect: 'manual',
        headers: { Cookie: `__Host-crossfeed_member=${token}`, Origin: origin, 'Content-Type': 'application/json' },
        ...(body && { method: 'POST', body: JSON.stringify(body) })
      })
  }
  const opened = (link: string) =>
    exports.default.fetch(`${origin}/auth/invite`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: new URL(link).hash.slice(1) })
    })
  const runCron = async (cron: string) => {
    const ctx = createExecutionContext()
    await (worker as ExportedHandler<Env>).scheduled!(createScheduledController({ cron }), env, ctx)
    await waitOnExecutionContext(ctx)
  }

  it('adds the guest member, as the guest network’s owner, beside temporary guests, whom the next 12:00 clearing removes with what only they own', async () => {
    // As before it: no guest member, as 0006 left it, no guest network's row, 0008's index, and a temporary
    // guest who made a network, which a member joined, an API key, and an invite link.
    await env.DB.batch([
      env.DB.prepare("DELETE FROM members WHERE id = 'guest-member'"),
      env.DB.prepare("DELETE FROM networks WHERE id = 'guest-network'"),
      env.DB.prepare('CREATE INDEX members_guest_created ON members (created) WHERE guest = 1')
    ])
    const temporary = await temporaryGuest()
    const { id } = await (await temporary('/app/new', { name: 'Night Shift Audio' })).json<{ id: string }>()
    expect(id).toMatch(/^guest-/)
    const link = async () =>
      (await (await temporary(`/app/${id}/settings/members/invites`, {})).json<{ link: string }>()).link
    const lin = await openMember({ name: 'Lin Editor', invite: await link() })
    const { secret } = await (
      await temporary(`/app/${id}/settings/api-keys`, { name: 'Nightly sync' })
    ).json<{ secret: string }>()
    const open = await link()

    await migrate('0009')
    // Before any guest signs in, which would write them too: the guest network's row, the guest member,
    // marked a guest, and its owner membership of the guest network.
    const rows = async (query: string) => (await env.DB.prepare(query).all()).results
    expect(await rows("SELECT name, created_by FROM networks WHERE id = 'guest-network'")).toEqual([
      { name: 'Guest network', created_by: null }
    ])
    expect(await rows("SELECT name, guest FROM members WHERE id = 'guest-member'")).toEqual([
      { name: 'Guest', guest: 1 }
    ])
    expect(
      await rows("SELECT role FROM memberships WHERE network_id = 'guest-network' AND member_id = 'guest-member'")
    ).toEqual([{ role: 'owner' }])
    // The temporary guest and all it made are still there.
    expect((await temporary(`/app/${id}`)).status).toBe(200)
    expect((await api(secret)(`/api/v1/networks/${id}`)).status).toBe(200)
    expect((await opened(open)).status).toBe(200)
    // A guest signs in as the guest member, the owner of the guest network.
    const guest = await openGuest()
    const dashboard = await (await guest.fetch('/app/guest-network')).text()
    expect(dashboard).toContain('data-member-id="guest-member"')
    expect(dashboard).toContain('data-network-name="Guest network"')
    expect(dashboard).toContain('data-role="owner"')

    // A day on, the hourly cron leaves it all, to the daily clearing.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 25 * 60 * 60_000)
    await runCron('0 0-11,13-23 * * *')
    expect((await lin.fetch(`/app/${id}`)).status).toBe(200)

    const logged = vi.spyOn(console, 'log')
    fakeQloo({ search: { 'The Rewatchables': [{ entity_id: 'e-0701', name: 'The Rewatchables', popularity: 0.7 }] } })
    await runCron('0 12 * * *')
    expect(logged).toHaveBeenCalledWith(JSON.stringify({ event: 'guests_removed', members: 1, networks: 1 }))
    expect((await lin.fetch(`/app/${id}`)).status).toBe(404)
    expect((await api(secret)(`/api/v1/networks/${id}`)).status).toBe(401)
    expect((await opened(open)).status).toBe(404)
    // The guest member stays.
    expect((await guest.fetch('/app/guest-network')).status).toBe(200)
  })
})
