// The REST API's network and roster endpoints, driven as a program drives them: with an API key over
// HTTP, polling a resource while its work settles, and branching on the error codes.
import { env, exports } from 'cloudflare:workers'
import { afterEach, describe, expect, it } from 'vitest'
import type { Show } from '../src/agent'
import { api as routes } from '../src/routes/api'
import sampleInbox from '../src/sample-inbox.json'
import sampleNetwork from '../src/sample-network.json'
import { fakeQloo, requests } from './fake'
import { api, networkWithKey, openMember } from './session'

// Synthetic shows: two exact matches, one name shared by two feeds, and one Qloo doesn't have.
const search = {
  'Deep Cuts': [{ entity_id: 'p-0001', name: 'Deep Cuts', popularity: 0.5 }],
  'Signal Boost': [{ entity_id: 'p-0002', name: 'Signal Boost', popularity: 0.4 }],
  'Field Notes': [
    { entity_id: 'p-0101', name: 'Field Notes: Film', popularity: 0.6 },
    { entity_id: 'p-0102', name: 'Field Notes: Books', popularity: 0.3 }
  ],
  'Paper Trail': [],
  'The Paper Trail Show': [{ entity_id: 'p-0201', name: 'The Paper Trail Show', popularity: 0.2 }]
}

type Roster = { status: 'pending' | 'settled'; shows: Show[]; sample: { network: string; notice: string } | null }

const saved = { QLOO_VISITOR_DAILY_CALL_CAP: env.QLOO_VISITOR_DAILY_CALL_CAP }
afterEach(() => Object.assign(env, saved))

type Call = ReturnType<typeof api>

// Posts a roster file's body, as `curl --data-binary @roster.csv -H 'Content-Type: text/csv'` does.
const importRoster = (call: Call, network: string, body: BodyInit, type = 'text/csv', query = '') =>
  call(`/api/v1/networks/${network}/roster${query}`, { method: 'POST', headers: { 'Content-Type': type }, body })

// Polls the roster, as a program waiting on an import does, until its work settles.
async function settled(call: Call, network: string): Promise<Roster> {
  for (;;) {
    const res = await call(`/api/v1/networks/${network}/roster`)
    if (res.status !== 200) throw new Error(`Reading the roster returned ${res.status}: ${await res.text()}`)
    const roster = await res.json<Roster>()
    if (roster.status === 'settled') return roster
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe('importing a roster', () => {
  it('takes a CSV body, answers 202 with the shows pending, and settles as Qloo answers', async () => {
    // Qloo answers a little later, so the import's answer finds its shows still out.
    fakeQloo({ search, latencyMs: 50 })
    const { network, call } = await networkWithKey()
    expect(await (await call(`/api/v1/networks/${network}/roster`)).json()).toEqual({
      status: 'settled',
      shows: [],
      sample: null
    })

    const res = await importRoster(call, network, 'name,downloads\nDeep Cuts,12000\nField Notes,\nPaper Trail,900\n')
    expect(res.status).toBe(202)
    const pending = await res.json<Roster>()
    expect(pending.status).toBe('pending')
    expect(pending.shows.map((s) => [s.name, s.resolution, s.downloads])).toEqual([
      ['Deep Cuts', 'pending', 12000],
      ['Field Notes', 'pending', null],
      ['Paper Trail', 'pending', 900]
    ])

    const roster = await settled(call, network)
    expect(roster.shows.map((s) => [s.name, s.resolution, s.entity?.id ?? null, s.candidates.length])).toEqual([
      ['Deep Cuts', 'resolved', 'p-0001', 0],
      ['Field Notes', 'ambiguous', null, 2],
      ['Paper Trail', 'missed', null, 0]
    ])
    expect(roster.shows.map((s) => s.evidence)).toEqual(['C-01', 'C-02', 'C-03'])
    expect(requests).toHaveLength(3)
  })

  it('takes pasted names as text/plain', async () => {
    fakeQloo({ search })
    const { network, call } = await networkWithKey()
    expect((await importRoster(call, network, 'Deep Cuts\nSignal Boost\n', 'text/plain; charset=utf-8')).status).toBe(
      202
    )
    const roster = await settled(call, network)
    expect(roster.shows.map((s) => [s.name, s.resolution])).toEqual([
      ['Deep Cuts', 'resolved'],
      ['Signal Boost', 'resolved']
    ])
  })

  it('answers 409 over a roster that has shows, unless replace=true, which keeps the settled shows', async () => {
    fakeQloo({ search })
    const { network, call } = await networkWithKey()
    await importRoster(call, network, 'name,downloads\nDeep Cuts,12000\nField Notes,8000\n')
    await settled(call, network)
    await call(`/api/v1/networks/${network}/roster/shows/Field%20Notes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId: 'p-0102' })
    })

    const refused = await importRoster(call, network, 'name\nSignal Boost\n')
    expect(refused.status).toBe(409)
    expect(await refused.json()).toEqual({
      error: {
        code: 'conflict',
        message:
          'The roster already has shows. Import with replace=true to import over it: shows already on it keep their matches.'
      }
    })
    for (const query of ['', '?replace=false'])
      expect((await importRoster(call, network, 'name\nSignal Boost\n', 'text/csv', query)).status).toBe(409)
    expect(requests).toHaveLength(2)

    const res = await importRoster(
      call,
      network,
      'name,downloads\nDeep Cuts,15000\nField Notes,8000\nSignal Boost,\n',
      'text/csv',
      '?replace=true'
    )
    expect(res.status).toBe(202)
    const roster = await settled(call, network)
    expect(roster.shows.map((s) => [s.name, s.resolution, s.entity?.id ?? null, s.downloads])).toEqual([
      ['Deep Cuts', 'resolved', 'p-0001', 15000],
      ['Field Notes', 'resolved', 'p-0102', 8000],
      ['Signal Boost', 'resolved', 'p-0002', null]
    ])
    // Only the new show was looked up.
    expect(requests).toHaveLength(3)
  })

  it("refuses a body it can't read with 422, one over 5 MB with 413, and another type with 400", async () => {
    fakeQloo({ search })
    const { network, call } = await networkWithKey()
    const fifty = Array.from({ length: 51 }, (_, i) => `Show ${i + 1}`).join('\n')
    for (const [body, type, status, code, message] of [
      [
        'title\nDeep Cuts\n',
        'text/csv',
        422,
        'unreadable',
        'The CSV needs a "name" column. Its first row has "title".'
      ],
      [
        'name,downloads\nDeep Cuts,lots\n',
        'text/csv',
        422,
        'unreadable',
        'Row 2 of the CSV: downloads "lots" isn\'t a whole number.'
      ],
      ['name\n', 'text/csv', 422, 'unreadable', 'The CSV has no show rows.'],
      ['  \n', 'text/plain', 422, 'unreadable', '"roster.txt" is empty.'],
      [fifty, 'text/plain', 422, 'unreadable', '51 shows is over the 50-show limit'],
      [
        'x'.repeat(5 * 1024 * 1024 + 1),
        'text/csv',
        413,
        'too_large',
        '"roster.csv" is 5.0 MB, over the 5 MB limit for an upload.'
      ],
      [
        JSON.stringify({ shows: ['Deep Cuts'] }),
        'application/json',
        400,
        'invalid',
        'Send the roster as text/csv, with a name column, or as text/plain, with one show name per line.'
      ]
    ] as const) {
      const res = await importRoster(call, network, body, type)
      expect(res.status, message).toBe(status)
      const { error } = await res.json<{ error: { code: string; message: string } }>()
      expect(error.code).toBe(code)
      expect(error.message).toContain(message)
    }
    expect((await (await call(`/api/v1/networks/${network}/roster`)).json<Roster>()).shows).toEqual([])
    expect(requests).toEqual([])
  })

  it("answers 409 while the last import's shows are still out, and 429 past the network's Qloo calls", async () => {
    fakeQloo({ search, latencyMs: 100 })
    const { network, call } = await networkWithKey()
    await importRoster(call, network, 'Deep Cuts\n', 'text/plain')
    const busy = await importRoster(call, network, 'Signal Boost\n', 'text/plain', '?replace=true')
    expect(busy.status).toBe(409)
    expect(await busy.json()).toEqual({
      error: { code: 'conflict', message: 'The last import is still looking up its shows. Wait for it to finish.' }
    })
    await settled(call, network)

    env.QLOO_VISITOR_DAILY_CALL_CAP = '2'
    const capped = await importRoster(
      call,
      network,
      'Deep Cuts\nSignal Boost\nField Notes\n',
      'text/plain',
      '?replace=true'
    )
    expect(capped.status).toBe(429)
    expect(await capped.json()).toEqual({
      error: {
        code: 'limit',
        message:
          'This would take you past 2 Qloo calls today, the most one network can make in a UTC day, cache hits included; they reset at 00:00 UTC.'
      }
    })
  })
})

describe("a roster's shows", () => {
  const patch = (call: Call, network: string, name: string, body: object) =>
    call(`/api/v1/networks/${network}/roster/shows/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  const compSearch = (call: Call, network: string, name: string, query: string) =>
    call(`/api/v1/networks/${network}/roster/shows/${encodeURIComponent(name)}/comp-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    })
  const error = async (res: Response) => [res.status, (await res.json<{ error: object }>()).error]

  it('settle an ambiguous show, map a miss to a comp it searched for, and change figures', async () => {
    fakeQloo({ search })
    const { network, call } = await networkWithKey()
    await importRoster(call, network, 'name,downloads\nField Notes,8000\nPaper Trail,900\n')
    await settled(call, network)

    const picked = await patch(call, network, 'Field Notes', { entityId: 'p-0102', excluded: true })
    expect(picked.status).toBe(200)
    expect(await picked.json()).toMatchObject({
      name: 'Field Notes',
      resolution: 'resolved',
      entity: { id: 'p-0102', name: 'Field Notes: Books' },
      excluded: true
    })

    const searching = await compSearch(call, network, 'Paper Trail', 'The Paper Trail Show')
    expect(searching.status).toBe(202)
    expect((await searching.json<Show>()).compSearch).toMatchObject({ query: 'The Paper Trail Show', call: 'C-03' })
    const roster = await settled(call, network)
    expect(roster.shows[1].compSearch).toMatchObject({ status: 'done', results: [{ id: 'p-0201' }] })

    const mapped = await patch(call, network, 'Paper Trail', { compId: 'p-0201', downloads: 1200 })
    expect(await mapped.json()).toMatchObject({
      resolution: 'mapped',
      entity: { id: 'p-0201' },
      evidence: 'C-03',
      downloads: 1200
    })
  })

  it("refuse what the show can't take with 400, a show not on the roster with 404, and one still being looked up with 409", async () => {
    fakeQloo({ search, latencyMs: 100 })
    const { network, call } = await networkWithKey()
    await importRoster(call, network, 'Field Notes\nPaper Trail\n', 'text/plain')
    expect(await error(await compSearch(call, network, 'Paper Trail', 'The Paper Trail Show'))).toEqual([
      409,
      { code: 'conflict', message: 'Paper Trail is still being looked up in Qloo.' }
    ])
    await settled(call, network)

    for (const [name, body, refused] of [
      [
        'Field Notes',
        { entityId: 'p-9999' },
        [400, { code: 'invalid', message: "That isn't one of the candidates for Field Notes." }]
      ],
      [
        'Field Notes',
        { compId: 'p-0201' },
        [400, { code: 'invalid', message: "That isn't one of the search results for Field Notes." }]
      ],
      [
        'Field Notes',
        { downloads: -1 },
        [400, { code: 'invalid', message: 'downloads: Downloads per episode must be a whole number, 0 or more.' }]
      ],
      ['Field Notes', { name: 'Renamed' }, [400, { code: 'invalid', message: expect.stringContaining('name') }]],
      [
        'Deep Cuts',
        { excluded: true },
        [404, { code: 'not_found', message: 'No show named "Deep Cuts" in the roster.' }]
      ]
    ] as const)
      expect(await error(await patch(call, network, name, body))).toEqual(refused)
    expect(await error(await compSearch(call, network, 'Paper Trail', '  '))).toEqual([
      400,
      { code: 'invalid', message: 'Type the name of a comparable show.' }
    ])
    expect(await error(await compSearch(call, network, 'Deep Cuts', 'Deep Cuts Weekly'))).toEqual([
      404,
      { code: 'not_found', message: 'No show named "Deep Cuts" in the roster.' }
    ])
    // Nothing changed.
    const { shows } = await settled(call, network)
    expect(shows.map((s) => [s.name, s.resolution, s.compSearch])).toEqual([
      ['Field Notes', 'ambiguous', null],
      ['Paper Trail', 'missed', null]
    ])
  })
})

describe('the network', () => {
  it("is renamed and priced with an owner's API key, and the app follows", async () => {
    const { ada, network, call } = await networkWithKey()
    const res = await call(`/api/v1/networks/${network}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: ' Static Hours ', cpm: 32.5 })
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: network, name: 'Static Hours', cpm: 32.5 })
    expect(await (await call(`/api/v1/networks/${network}`)).json()).toEqual({
      id: network,
      name: 'Static Hours',
      cpm: 32.5
    })
    expect(await (await ada.fetch(`/app/${network}`)).text()).toContain('data-network-name="Static Hours"')

    // A field left out stays as it is.
    const priced = await call(`/api/v1/networks/${network}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpm: 20 })
    })
    expect(await priced.json()).toEqual({ id: network, name: 'Static Hours', cpm: 20 })
  })

  it("refuses a bad name or CPM with 400, and a member's session that isn't an owner's with 403", async () => {
    const { ada, network, call } = await networkWithKey()
    const change = (body: unknown, by: (path: string, init: RequestInit) => Promise<Response> = call) =>
      by(`/api/v1/networks/${network}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body)
      })
    for (const [body, message] of [
      ['{"name": "Night Shift', "The body isn't valid JSON. Send it as application/json."],
      [{ name: '  ' }, 'Name the network.'],
      [{ name: 'x'.repeat(65) }, 'Use a name of at most 64 characters.'],
      [{ cpm: 0 }, 'The CPM must be a dollar amount above 0.'],
      [{ cpm: '25' }, expect.stringContaining('cpm')]
    ] as const) {
      const res = await change(body)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: { code: 'invalid', message } })
    }
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(network) })
    const refused = await change({ cpm: 30 }, grace.fetch)
    expect(refused.status).toBe(403)
    expect(await refused.json()).toEqual({
      error: {
        code: 'forbidden',
        message: "Only an owner, or an API key an owner made, can change the network's name and CPM."
      }
    })
    // Reading is any member's.
    expect(await (await grace.fetch(`/api/v1/networks/${network}`)).json()).toEqual({
      id: network,
      name: 'Night Shift Audio',
      cpm: null
    })
  })

  it("reports today's usage against the network's daily caps, and when they reset", async () => {
    fakeQloo({ search })
    const { network, call } = await networkWithKey()
    await importRoster(call, network, 'Deep Cuts\nSignal Boost\n', 'text/plain')
    await settled(call, network)
    const res = await call(`/api/v1/networks/${network}/usage`)
    expect(res.status).toBe(200)
    const tomorrow = new Date()
    tomorrow.setUTCHours(24, 0, 0, 0)
    expect(await res.json()).toEqual({
      qlooCalls: { used: 2, limit: 2000 },
      modelRuns: { used: 0, limit: 10 },
      resets: tomorrow.toISOString()
    })
  })
})

describe('the OpenAPI document', () => {
  const doc = async () => {
    const res = await exports.default.fetch('https://crossfeed.test/api/v1/openapi.json')
    expect(res.status).toBe(200)
    return res.json<{
      openapi: string
      paths: Record<string, Record<string, unknown>>
      servers: { url: string }[]
      components: { schemas: Record<string, { type?: string | string[] }> }
    }>()
  }

  it('describes every route the API serves, from their schemas, with no key needed to read it', async () => {
    const { openapi, paths, servers } = await doc()
    expect(openapi).toBe('3.1.0')
    expect(servers).toEqual([{ url: 'https://crossfeed.test' }])
    // Every route but the document itself and the middleware and 404 for all, as Hono routes them,
    // once for each of a route's handlers.
    const served = [
      ...new Set(
        routes.routes
          .filter((r) => r.method !== 'ALL' && r.path !== '/api/v1/openapi.json')
          .map((r) => `${r.method} ${r.path.replace(/:(\w+)/g, '{$1}')}`)
      )
    ]
    const documented = Object.entries(paths).flatMap(([path, methods]) =>
      Object.keys(methods).map((m) => `${m.toUpperCase()} ${path}`)
    )
    expect(served.length).toBeGreaterThan(0)
    expect(documented.toSorted()).toEqual(served.toSorted())
  })

  // A schema made nullable in the document would type every use of it as possibly null, such as a
  // run that a read answers with, in the SDK's generated types.
  it('makes a field nullable where it is, never a named schema every use of it shares', async () => {
    const { components } = await doc()
    const nullable = Object.entries(components.schemas).filter(([, schema]) => [schema.type].flat().includes('null'))
    expect(nullable.map(([name]) => name)).toEqual([])
  })

  it('has no route that approves anything', async () => {
    const { paths } = await doc()
    expect(JSON.stringify(Object.keys(paths))).not.toMatch(/approv/i)
    const { network, call } = await networkWithKey()
    expect(
      (await call(`/api/v1/networks/${network}/insertion-orders/IO-0001/approve`, { method: 'POST' })).status
    ).toBe(404)
  })

  it('uses made-up examples, never a name the demo looks up in Qloo', async () => {
    const text = JSON.stringify(await doc())
    const looked = [
      ...sampleNetwork.shows.map((s) => s.name),
      sampleNetwork.launch.name,
      ...sampleInbox.pitches.flatMap((p) => (p.expected.work ? [p.expected.work.title] : [])),
      ...sampleInbox.show.pastGuests.map((g) => g.work.title)
    ]
    for (const name of looked) expect(text, name).not.toContain(name)
  })
})
