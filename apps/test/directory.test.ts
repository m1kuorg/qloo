// The D1 directory's schema, as every test sees it: test/session.ts wipes D1 after each test with
// the rest of storage, then applies the migrations again before the next. This file reads D1
// directly, since it tests the schema the directory module will own, and a migration's own changes
// to rows already there.
import type { D1Migration } from 'cloudflare:test'
import { env, exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { api, networkWithKey, openMember, type Member } from './session'

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

  it('starts the next test with every table, and no rows but the guest member, the guest network, and its membership', async () => {
    expect(await tables()).toEqual([
      'api_keys',
      'challenges',
      'd1_migrations',
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
    expect(await all('SELECT id, name FROM members')).toEqual([{ id: 'guest-member', name: 'Guest' }])
    expect(await all('SELECT id, name, created_by FROM networks')).toEqual([
      { id: 'guest-network', name: 'Guest network', created_by: null }
    ])
    expect(await all('SELECT network_id, member_id, role FROM memberships')).toEqual([
      { network_id: 'guest-network', member_id: 'guest-member', role: 'member' }
    ])
    for (const table of ['passkeys', 'sessions', 'invites', 'api_keys'])
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
