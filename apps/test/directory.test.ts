// The D1 directory's schema, as every test sees it: test/session.ts wipes D1 after each test with
// the rest of storage, then applies the migrations again before the next.
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import './session'

const tables = async () =>
  (
    await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"
    ).all<{ name: string }>()
  ).results.map((row) => row.name)

describe('the directory', () => {
  it('holds a member', async () => {
    await env.DB.prepare('INSERT INTO members (id, name, recovery_code_hash, created) VALUES (?, ?, ?, ?)')
      .bind('member-1', 'Ada Programmer', 'hash-1', Date.now())
      .run()
    const member = await env.DB.prepare('SELECT name FROM members WHERE id = ?').bind('member-1').first()
    expect(member).toEqual({ name: 'Ada Programmer' })
  })

  it('starts each test with every table and no rows', async () => {
    expect(await tables()).toEqual([
      'api_keys',
      'challenges',
      'd1_migrations',
      'invites',
      'members',
      'memberships',
      'networks',
      'passkeys',
      'sessions'
    ])
    expect(await env.DB.prepare('SELECT count(*) AS n FROM members').first('n')).toBe(0)
  })
})
