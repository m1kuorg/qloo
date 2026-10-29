// API keys: an owner's keys in the network's settings, shown once and then listed, revoked at once,
// and the API's auth, an API key for its own network or a member's session, through the Worker's
// routes.
import { env, exports } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiKey } from '../src/directory'
import { sha256 } from '../src/text'
import { api, openMember, untilRefused, type Member } from './session'

// A network the member creates the way /app/new does.
async function created(member: Member, name = 'Night Shift Audio') {
  const res = await member.fetch('/app/new', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  })
  if (res.status !== 200) throw new Error(`Creating ${name} returned ${res.status}: ${await res.text()}`)
  return (await res.json<{ id: string }>()).id
}

// A write from one of the member's pages, as `send` in the island makes it.
const post = (member: Member, path: string, body: object = {}) =>
  member.fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

// An API key the owner creates in the network's settings: its ID and its secret, shown this once.
async function key(member: Member, network: string, name = 'Nightly sync') {
  const res = await post(member, `/app/${network}/settings/api-keys`, { name })
  if (res.status !== 200) throw new Error(`Creating key ${name} returned ${res.status}: ${await res.text()}`)
  return res.json<{ id: string; secret: string }>()
}

// An HTML attribute's value as the page's script reads it.
const he = (value: string) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

// The keys in use the settings page lists, as the API keys module reads them.
async function listed(member: Member, network: string) {
  const page = await (await member.fetch(`/app/${network}/settings`)).text()
  return JSON.parse(he(/data-api-keys="([^"]*)"/.exec(page)![1])) as ApiKey[]
}

const origin = 'https://crossfeed.test'

afterEach(() => vi.useRealTimers())

const NOW = Date.parse('2026-10-19T12:00:00Z')

// Requests a minute, as wrangler.jsonc's rate limits allow: per API key, and per visitor on the auth
// routes that write before anyone signs in.
const API_LIMIT = 120
const AUTH_LIMIT = 20

describe('API keys in settings', () => {
  it('let an owner create one, its secret shown once, then listed by prefix, creator, and dates', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    const ada = await openMember()
    const network = await created(ada)

    const res = await post(ada, `/app/${network}/settings/api-keys`, { name: '  Nightly sync ' })
    expect(res.status).toBe(200)
    const { id, secret, keys } = await res.json<{ id: string; secret: string; keys: ApiKey[] }>()
    expect(secret).toMatch(/^cf_live_[A-Za-z0-9_-]{40,}$/)
    expect(keys).toEqual([
      { id, name: 'Nightly sync', prefix: secret.slice(0, 12), by: 'Ada Programmer', created: NOW, lastUsed: null }
    ])

    // The settings page lists it the same way, and never holds the secret again.
    const page = await (await ada.fetch(`/app/${network}/settings`)).text()
    expect(page).toContain(secret.slice(0, 12))
    expect(page).not.toContain(secret)

    // The secret reads the network through the API.
    const read = await api(secret)(`/api/v1/networks/${network}`)
    expect(read.status).toBe(200)
    expect(read.headers.get('Cache-Control')).toBe('no-store')
    expect(await read.json()).toEqual({ id: network, name: 'Night Shift Audio', cpm: null })
  })

  it('revokes a key at once: its next request answers 401, and the list drops it', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const first = await key(ada, network, 'Nightly sync')
    const second = await key(ada, network, 'Dashboard export')
    expect((await api(first.secret)(`/api/v1/networks/${network}`)).status).toBe(200)

    const res = await post(ada, `/app/${network}/settings/api-keys/${first.id}/revoke`)
    expect(res.status).toBe(200)
    expect((await res.json<{ keys: ApiKey[] }>()).keys.map((k) => k.name)).toEqual(['Dashboard export'])

    const refused = await api(first.secret)(`/api/v1/networks/${network}`)
    expect(refused.status).toBe(401)
    expect(await refused.json()).toEqual({
      error: {
        code: 'unauthorized',
        message:
          'This API key is unknown or was revoked. Send a key from the network\'s settings as "Authorization: Bearer cf_live_…".'
      }
    })
    expect((await api(second.secret)(`/api/v1/networks/${network}`)).status).toBe(200)

    // A key revoked already stays revoked.
    expect((await post(ada, `/app/${network}/settings/api-keys/${first.id}/revoke`)).status).toBe(409)
  })

  it("are an owner's alone: a member can't see, create, or revoke them, and anyone else gets a 404", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const made = await key(ada, network, 'Nightly sync')
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(network) })

    const page = await (await grace.fetch(`/app/${network}/settings`)).text()
    expect(page).toContain('data-page="settings"')
    expect(page).not.toContain('data-api-keys')
    const OWNERS = { error: 'Only an owner can create and revoke API keys.' }
    const create = await post(grace, `/app/${network}/settings/api-keys`, { name: 'Mine' })
    expect(create.status).toBe(403)
    expect(await create.json()).toEqual(OWNERS)
    const revoke = await post(grace, `/app/${network}/settings/api-keys/${made.id}/revoke`)
    expect(revoke.status).toBe(403)
    expect((await api(made.secret)(`/api/v1/networks/${network}`)).status).toBe(200)

    const outsider = await openMember({ name: 'Mallory Outsider' })
    expect((await post(outsider, `/app/${network}/settings/api-keys`, { name: 'Mine' })).status).toBe(404)
    expect((await post(outsider, `/app/${network}/settings/api-keys/${made.id}/revoke`)).status).toBe(404)
  })

  it('stop at 10 in use in a network, until one is revoked', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const make = () => post(ada, `/app/${network}/settings/api-keys`, { name: 'Nightly sync' })
    const made: { id: string; keys: ApiKey[] }[] = []
    for (let i = 0; i < 10; i++) made.push(await (await make()).json())

    const capped = await make()
    expect([capped.status, await capped.json()]).toEqual([
      429,
      {
        error:
          'Night Shift Audio has 10 API keys in use, the most a network can keep at once. Revoke one to create another.'
      }
    ])
    expect(await listed(ada, network)).toHaveLength(10)

    await post(ada, `/app/${network}/settings/api-keys/${made[0].id}/revoke`)
    expect((await make()).status).toBe(200)
    expect((await make()).status).toBe(429)
    expect(await listed(ada, network)).toHaveLength(10)
  })

  it("don't count the keys revoked as their maker stops being an owner", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(network) })
    const role = (role: string) => post(ada, `/app/${network}/settings/members/${grace.id}/role`, { role })
    expect((await role('owner')).status).toBe(200)
    for (let i = 0; i < 10; i++) await key(grace, network)
    expect((await post(ada, `/app/${network}/settings/api-keys`, { name: 'Mine' })).status).toBe(429)

    expect((await role('member')).status).toBe(200)
    expect(await listed(ada, network)).toEqual([])
    expect((await post(ada, `/app/${network}/settings/api-keys`, { name: 'Mine' })).status).toBe(200)
  })

  it('let only one of two made at once take the last place', async () => {
    const ada = await openMember()
    const network = await created(ada)
    for (let i = 0; i < 9; i++) await key(ada, network)

    const answers = await Promise.all(
      [1, 2].map(() => post(ada, `/app/${network}/settings/api-keys`, { name: 'Mine' }))
    )
    expect(answers.map((a) => a.status).sort()).toEqual([200, 429])
    expect(await listed(ada, network)).toHaveLength(10)
  })

  it('need a name', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const res = await post(ada, `/app/${network}/settings/api-keys`, { name: '  ' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Name the key, such as the script or assistant that will use it.' })
  })
})

describe("the API's auth", () => {
  it('lets a key reach its own network alone: every other network answers 404, as one that does not exist', async () => {
    const ada = await openMember()
    const mine = await created(ada)
    const theirs = await created(await openMember({ name: 'Grace Booker' }), 'Static Hours')
    const { secret } = await key(ada, mine)

    const NOT_FOUND = {
      error: { code: 'not_found', message: "There's no such network, or this API key or member can't reach it." }
    }
    for (const network of [theirs, crypto.randomUUID(), 'not-a-network']) {
      const res = await api(secret)(`/api/v1/networks/${network}`)
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual(NOT_FOUND)
    }
    // The owner's own session doesn't reach the other network either, nor writes to it from anywhere.
    expect((await ada.fetch(`/api/v1/networks/${theirs}`)).status).toBe(404)
    const write = await exports.default.fetch(`${origin}/api/v1/networks/${theirs}`, {
      method: 'PATCH',
      headers: { Cookie: ada.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Mine now' })
    })
    expect(write.status).toBe(404)
  })

  it('refuses a request with no key or session, or with a key Crossfeed never made, with 401', async () => {
    const network = await created(await openMember())
    const anonymous = await exports.default.fetch(`${origin}/api/v1/networks/${network}`)
    expect(anonymous.status).toBe(401)
    // No cache keeps an answer, refusals included.
    expect(anonymous.headers.get('Cache-Control')).toBe('no-store')
    expect((await anonymous.json<{ error: { code: string } }>()).error.code).toBe('unauthorized')
    for (const authorization of ['Bearer cf_live_madeup', 'Basic YWRhOnNlY3JldA==', 'Bearer ', ''])
      expect(
        (
          await exports.default.fetch(`${origin}/api/v1/networks/${network}`, {
            headers: { Authorization: authorization }
          })
        ).status
      ).toBe(401)
  })

  it("lets a member's session reach their networks, and refuses a write it sends without an app Origin", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const read = await ada.fetch(`/api/v1/networks/${network}`)
    expect(read.status).toBe(200)
    expect(await read.json()).toEqual({ id: network, name: 'Night Shift Audio', cpm: null })

    const rename = (origin?: string) =>
      exports.default.fetch(`${origin ?? 'https://crossfeed.test'}/api/v1/networks/${network}`, {
        method: 'PATCH',
        headers: { Cookie: ada.cookie, 'Content-Type': 'application/json', ...(origin && { Origin: origin }) },
        body: JSON.stringify({ name: 'Night Shift' })
      })
    for (const res of [await rename(), await rename('https://crossfeed.example')]) {
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({
        error: {
          code: 'forbidden',
          message: 'A write signed in with a session must come from a Crossfeed page. Programs use an API key.'
        }
      })
    }
    // From one of the app's pages, the owner's write goes through.
    const saved = await ada.fetch(`/api/v1/networks/${network}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Night Shift' })
    })
    expect(saved.status).toBe(200)
    expect((await saved.json<{ name: string }>()).name).toBe('Night Shift')
  })

  it("keeps only a hash of each secret, and notes a key's last use at most once a minute", async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    const ada = await openMember()
    const network = await created(ada)
    const { id, secret } = await key(ada, network)
    // A storage test, on purpose: the directory keeps the secret's SHA-256 and its prefix, and nothing
    // it could be read back from.
    const row = await env.DB.prepare('SELECT * FROM api_keys WHERE id = ?').bind(id).first<Record<string, unknown>>()
    expect(row!.secret_hash).toBe(await sha256(secret))
    expect(Object.values(row!)).not.toContain(secret)

    const lastUsed = async () => {
      const page = await (await ada.fetch(`/app/${network}/settings`)).text()
      const keys = JSON.parse(he(/data-api-keys="([^"]*)"/.exec(page)![1])) as ApiKey[]
      return keys[0].lastUsed
    }
    expect(await lastUsed()).toBeNull()
    await api(secret)(`/api/v1/networks/${network}`)
    expect(await lastUsed()).toBe(NOW)
    vi.setSystemTime(NOW + 30_000)
    await api(secret)(`/api/v1/networks/${network}`)
    expect(await lastUsed()).toBe(NOW)
    vi.setSystemTime(NOW + 61_000)
    await api(secret)(`/api/v1/networks/${network}`)
    expect(await lastUsed()).toBe(NOW + 61_000)
  })

  it('answers 404 to everything under /api/v1 while ACCOUNTS is off', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const { secret } = await key(ada, network)
    env.ACCOUNTS = 'off'
    try {
      for (const path of [`/api/v1/networks/${network}`, '/api/v1/openapi.json'])
        expect((await api(secret)(path)).status).toBe(404)
    } finally {
      env.ACCOUNTS = 'on'
    }
  })
})

describe('rate limits', () => {
  it("refuse a key past its requests a minute with 429, and leave the network's other keys alone", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const busy = await key(ada, network, 'Busy script')
    const quiet = await key(ada, network, 'Quiet script')

    const { sent, res } = await untilRefused(() => api(busy.secret)(`/api/v1/networks/${network}`), API_LIMIT)
    expect(sent).toBeGreaterThan(API_LIMIT)
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('60')
    expect(await res.json()).toEqual({
      error: {
        code: 'rate_limited',
        message: 'This API key made too many requests in the last minute. Wait a minute, then try again.'
      }
    })
    expect((await api(quiet.secret)(`/api/v1/networks/${network}`)).status).toBe(200)
    // A member's own session, from the app, isn't a program's.
    expect((await ada.fetch(`/api/v1/networks/${network}`)).status).toBe(200)
  })

  it('refuse a visitor past its auth requests a minute that write before anyone signs in', async () => {
    const from =
      (ip: string) =>
      (path: string, body: object = {}) =>
        exports.default.fetch(`${origin}${path}`, {
          method: 'POST',
          headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
          body: JSON.stringify(body)
        })
    const ada = from('192.0.2.41')
    const { res } = await untilRefused(() => ada('/auth/sign-in/options'), AUTH_LIMIT)
    const LIMITED = {
      error: 'Too many sign-in requests from your address in the last minute. Wait a minute, then try again.'
    }
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual(LIMITED)
    for (const [path, body] of [
      ['/auth/sign-up/options', { name: 'Ada Programmer' }],
      ['/auth/sign-up', {}],
      ['/auth/recover', { code: 'AAAA-BBBB-CCCC-DDDD-EEEE' }]
    ] as const) {
      const refused = await ada(path, body)
      expect(refused.status, path).toBe(429)
      expect(await refused.json()).toEqual(LIMITED)
    }
    // Another address isn't counted with it.
    expect((await from('192.0.2.42')('/auth/sign-in/options')).status).toBe(200)
  })
})
