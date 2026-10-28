// The D1 directory's schema, as every test sees it: test/session.ts wipes D1 after each test with
// the rest of storage, then applies the migrations again before the next. This file reads D1
// directly, since it tests the schema the directory module will own, and a migration's own changes
// to rows already there.
import type { D1Migration } from 'cloudflare:test'
import { env, exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { api, networkWithKey, openGuest, openMember, type Member } from './session'

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

  it('starts the next test with every table, and no rows but the guest network', async () => {
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
      'sessions',
      'wipes'
    ])
    const all = async (query: string) => (await env.DB.prepare(query).all()).results
    expect(await all('SELECT id, name, created_by FROM networks')).toEqual([
      { id: 'guest-network', name: 'Guest network', created_by: null }
    ])
    for (const table of [
      'members',
      'memberships',
      'guest_signins',
      'guest_invited_signups',
      'passkeys',
      'sessions',
      'invites',
      'api_keys'
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

    const { TEST_MIGRATIONS } = env as unknown as { TEST_MIGRATIONS: D1Migration[] }
    const migration = TEST_MIGRATIONS.find((m) => m.name.startsWith('0003_'))!
    for (const query of migration.queries) await env.DB.prepare(query).run()

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
      // As before the migration, with no log of that sign-up.
      await env.DB.batch([
        env.DB.prepare('DROP TABLE guest_invited_signups'),
        env.DB.prepare('DROP INDEX members_guest_created')
      ])

      const { TEST_MIGRATIONS } = env as unknown as { TEST_MIGRATIONS: D1Migration[] }
      const migration = TEST_MIGRATIONS.find((m) => m.name.startsWith('0008_'))!
      for (const query of migration.queries) await env.DB.prepare(query).run()
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
