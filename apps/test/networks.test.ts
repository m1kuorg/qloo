// Networks: creating one, opening the last one, switching between them, and each network's pages and
// agent open to its members alone, through the Worker's routes and the agent's client protocol.
import { env, exports } from 'cloudflare:workers'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NewNetworkPage } from '../src/client/NewNetwork'
import { MEMBER_HEADER } from '../src/network-agent'
import { requests } from './fake'
import { openMember, type Member, type Session } from './session'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// Creates a network the way /app/new does, and returns the answer.
const create = (member: Member, name: unknown) =>
  member.fetch('/app/new', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  })
// The new network's ID.
const created = async (member: Member, name: string) => {
  const res = await create(member, name)
  if (res.status !== 200) throw new Error(`Creating ${name} returned ${res.status}: ${await res.text()}`)
  return (await res.json<{ id: string }>()).id
}

// Where a page sends the member, or its status when it doesn't redirect.
const where = async (member: Member, path: string) => {
  const res = await member.fetch(path, { redirect: 'manual' })
  return res.status === 302 ? res.headers.get('location') : res.status
}
const page = async (member: Member, path: string) => (await member.fetch(path)).text()

// The networks the top bar's switcher lists on a page, as [name, path, current] in its order: its
// list named "Your networks", each link's words, address, and whether it's marked current.
const switcher = (html: string) =>
  [
    ...(html.match(/<ul\b[^>]*\saria-label="Your networks"[^>]*>(.*?)<\/ul>/)?.[1] ?? '').matchAll(
      /<a\b([^>]*)>(.*?)<\/a>/g
    )
  ].map(([, attributes, inner]) => [
    inner.replace(/<[^>]+>/g, '').trim(),
    attributes.match(/\shref="([^"]+)"/)?.[1],
    attributes.includes('aria-current="true"')
  ])

// Saves the settings' Network module as its page does.
const saveNetwork = (member: Member, network: string, body: object) =>
  member.fetch(`/app/${network}/settings/network`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

const origin = 'https://crossfeed.test'
const saved = { SAMPLE_NETWORK: env.SAMPLE_NETWORK, GUEST_PITCHES: env.GUEST_PITCHES, ACCOUNTS: env.ACCOUNTS }
const open: Omit<Session, 'cookie'>[] = []
afterEach(() => {
  vi.useRealTimers()
  Object.assign(env, saved)
  open.splice(0).forEach((agent) => agent.close())
})
// Opens the network's agent as the member's dashboard does.
const connect = async (member: Member, network: string, headers?: Record<string, string>) => {
  const agent = await member.connect(`/agents/network/${network}`, headers)
  open.push(agent)
  return agent
}

describe('creating a network', () => {
  it('names a network, makes its creator a member, and lands them on its dashboard', async () => {
    const ada = await openMember()
    expect(await where(ada, '/app')).toBe('/app/new')
    const first = await page(ada, '/app/new')
    expect(first).toContain('data-page="new-network"')
    // With no network yet, the top bar's switcher still reads "Your networks", and offers a new one.
    expect(first).toMatch(/<span class="vh">Network: <\/span>\s*<span[^>]*>Your networks<\/span>/)
    expect(first).toContain('No networks yet.')
    expect(first).toMatch(/<a href="\/app\/new"[^>]*>\s*New network\s*<\/a>/)

    const res = await create(ada, '  Night Shift Audio ')
    expect(res.status).toBe(200)
    const { id } = await res.json<{ id: string }>()
    expect(id).toMatch(UUID)

    expect(await where(ada, '/app')).toBe(`/app/${id}`)
    const dashboard = await page(ada, `/app/${id}`)
    expect(dashboard).toContain('data-page="dashboard"')
    expect(dashboard).toContain(`data-agent-path="/agents/network/${id}"`)
    expect(dashboard).toContain('data-network-name="Night Shift Audio"')
  })

  it('asks for the name in one labelled field, focused, and says how many networks a member can own', async () => {
    const ada = await openMember()
    const cap = (await page(ada, '/app/new')).match(/<div id="root"[^>]*\sdata-cap="(\d+)"/)![1]
    const html = renderToStaticMarkup(createElement(NewNetworkPage, { cap: Number(cap) }))
    const read = html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    expect(read).toBe(
      'Create a network A network holds your roster, its launches, and your booking inbox, for you and the teammates you invite. You own the networks you create, up to 3. Network name, as its members will see it Create network'
    )
    expect(html).toMatch(/<label\b[^>]*\sfor="network-name"/)
    expect(html).toMatch(/<input\b(?=[^>]*\sid="network-name")(?=[^>]*\sautofocus="")(?=[^>]*\srequired="")/)
    // The shell's top bar is the page's one banner.
    expect(html).not.toContain('<header')
  })

  it('refuses a name that is empty, too long, or has control characters', async () => {
    const ada = await openMember()
    for (const [name, error] of [
      ['  ', 'Name the network.'],
      [undefined, 'Name the network.'],
      ['N'.repeat(65), 'Use a name of at most 64 characters.'],
      ['Night\u0007Shift', 'Use a name without control characters.']
    ]) {
      const res = await create(ada, name)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error })
    }
    expect(await where(ada, '/app')).toBe('/app/new')
  })

  it('lets at most three of four networks created at once through', async () => {
    const ada = await openMember()
    const answers = await Promise.all(['One', 'Two', 'Three', 'Four'].map((name) => create(ada, name)))
    expect(answers.map((res) => res.status).sort()).toEqual([200, 200, 200, 429])
    expect(switcher(await page(ada, '/app/new'))).toHaveLength(3)
  })

  it("refuses the fourth network a member creates, with a message, but not another member's", async () => {
    const ada = await openMember()
    for (const name of ['One', 'Two', 'Three']) await created(ada, name)
    const fourth = await create(ada, 'Four')
    expect(fourth.status).toBe(429)
    expect(await fourth.json()).toEqual({
      error: 'You’ve created 3 networks, the most one member can create in the beta. Open one of them instead.'
    })
    expect(switcher(await page(ada, '/app/new')).map(([name]) => name)).toEqual(['One', 'Three', 'Two'])

    const grace = await openMember({ name: 'Grace Booker' })
    expect((await create(grace, 'Four')).status).toBe(200)
  })
})

describe('opening a network', () => {
  it('opens the network the member opened last', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-19T12:00:00Z'))
    const ada = await openMember()
    const first = await created(ada, 'Night Shift Audio')
    vi.advanceTimersByTime(1000)
    const second = await created(ada, 'Deep Cuts Media')
    expect(await where(ada, '/app')).toBe(`/app/${second}`)

    vi.advanceTimersByTime(1000)
    expect((await ada.fetch(`/app/${first}`)).status).toBe(200)
    expect(await where(ada, '/app')).toBe(`/app/${first}`)
  })

  it("lists the member's networks in the top bar, by name, and switches between them", async () => {
    const ada = await openMember()
    const night = await created(ada, 'Night Shift Audio')
    const deep = await created(ada, 'Deep Cuts Media')
    const grace = await openMember({ name: 'Grace Booker' })
    await created(grace, 'Paper Trail Pods')

    expect(switcher(await page(ada, `/app/${night}`))).toEqual([
      ['Deep Cuts Media', `/app/${deep}`, false],
      ['Night Shift Audio', `/app/${night}`, true]
    ])
    expect(switcher(await page(ada, `/app/${deep}`))).toEqual([
      ['Deep Cuts Media', `/app/${deep}`, true],
      ['Night Shift Audio', `/app/${night}`, false]
    ])
  })
})

describe("a network's agent", () => {
  it('opens on an empty network: no roster, CPM, inbox, or launches, and no sample network or sample inbox', async () => {
    env.SAMPLE_NETWORK = 'on'
    env.GUEST_PITCHES = 'on'
    const ada = await openMember()
    const network = await created(ada, 'Night Shift Audio')
    const state = (await connect(ada, network)).state()!
    expect(state).toMatchObject({ roster: [], cpm: null, inbox: null, sample: null, launches: [] })
    expect(requests).toEqual([])
  })

  it("answers 404 to a signed-out request, another network's member, a bad Origin, and a network that doesn't exist alike", async () => {
    const ada = await openMember()
    const network = await created(ada, 'Night Shift Audio')
    const grace = await openMember({ name: 'Grace Booker' })
    await created(grace, 'Paper Trail Pods')
    const upgrade = async (path: string, headers: Record<string, string>) => {
      const res = await exports.default.fetch(`${origin}${path}`, { headers: { Upgrade: 'websocket', ...headers } })
      return [res.status, await res.text(), res.webSocket]
    }
    const unknown = await upgrade(`/agents/network/${crypto.randomUUID()}`, { Cookie: ada.cookie, Origin: origin })
    expect(unknown).toEqual([404, '404 Not Found', null])
    for (const [path, headers] of [
      [network, { Origin: origin }],
      [network, { Cookie: grace.cookie, Origin: origin }],
      [network, { Cookie: ada.cookie, Origin: 'https://crossfeed.example' }],
      [network, { Cookie: ada.cookie, Origin: 'null' }],
      [network, { Cookie: ada.cookie }],
      ['not-a-network', { Cookie: ada.cookie, Origin: origin }]
    ] as const)
      expect(await upgrade(`/agents/network/${path}`, headers)).toEqual(unknown)

    env.ACCOUNTS = 'off'
    expect((await upgrade(`/agents/network/${network}`, { Cookie: ada.cookie, Origin: origin }))[0]).toBe(404)
  })

  it('connects a member whose session is extended as they connect', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const ada = await openMember()
    const network = await created(ada, 'Night Shift Audio')
    vi.advanceTimersByTime(2 * 60_000)
    expect((await connect(ada, network)).state()).toBeDefined()
  })

  it("tags each connection with its member from the Worker's header, whatever the browser sends", async () => {
    const ada = await openMember()
    const network = await created(ada, 'Night Shift Audio')
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(network) })
    const agent = await connect(ada, network, { [MEMBER_HEADER]: grace.id })
    await agent.call('dismissChecklist')
    expect(agent.state()!.checklistDismissed).toEqual([ada.id])
  })
})

describe("a network's pages", () => {
  it("answer 404 to anyone who isn't one of its members, as for a network that doesn't exist", async () => {
    const ada = await openMember()
    const network = await created(ada, 'Night Shift Audio')
    const grace = await openMember({ name: 'Grace Booker' })
    await created(grace, 'Paper Trail Pods')
    for (const id of [network, crypto.randomUUID(), 'not-a-network']) {
      for (const path of ['', '/settings', '/roster', '/inbox'])
        expect([id, path, (await grace.fetch(`/app/${id}${path}`)).status]).toEqual([id, path, 404])
      expect((await saveNetwork(grace, id, { name: 'Taken Over', cpm: 1 })).status).toBe(404)
    }
    expect(await page(ada, `/app/${network}`)).toContain('data-network-name="Night Shift Audio"')
  })
})

describe('settings', () => {
  it('let an owner rename the network and set its CPM, which its agent keeps', async () => {
    const ada = await openMember()
    const network = await created(ada, 'Night Shift Audio')
    const agent = await connect(ada, network)
    expect(await page(ada, `/app/${network}/settings`)).toContain('data-page="settings"')
    expect(await page(ada, `/app/${network}/settings`)).toContain('data-role="owner"')

    const saved = await saveNetwork(ada, network, { name: ' Night Shift Media ', cpm: 22.5 })
    expect(saved.status).toBe(200)
    expect(await saved.json()).toEqual({ name: 'Night Shift Media', cpm: 22.5 })
    expect((await agent.until((s) => s.cpm === 22.5)).cpm).toBe(22.5)
    expect(switcher(await page(ada, `/app/${network}/settings`))).toEqual([
      ['Night Shift Media', `/app/${network}`, true]
    ])
  })

  it('refuses a name or CPM that would be wrong, and changes neither', async () => {
    const ada = await openMember()
    const network = await created(ada, 'Night Shift Audio')
    const agent = await connect(ada, network)
    for (const [body, error] of [
      [{ name: '', cpm: 20 }, 'Name the network.'],
      [{ name: 'Night Shift Media', cpm: 0 }, 'The CPM must be a dollar amount above 0.'],
      [{ name: 'Night Shift Media', cpm: '20' }, 'The CPM must be a dollar amount above 0.']
    ] as const) {
      const res = await saveNetwork(ada, network, body)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error })
    }
    expect(await page(ada, `/app/${network}`)).toContain('data-network-name="Night Shift Audio"')
    expect(agent.state()!.cpm).toBeNull()
  })

  it("keep the CPM out of reach of a page's own connection, an owner's too: it changes in settings", async () => {
    const ada = await openMember()
    const network = await created(ada, 'Night Shift Audio')
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(network) })
    for (const member of [grace, ada]) {
      const agent = await connect(member, network)
      await expect(agent.call('setCpm', 30)).rejects.toThrow(
        "The CPM is changed in the network's settings, by an owner."
      )
      expect(agent.state()!.cpm).toBeNull()
    }
  })

  it("show a member the network's settings read-only, and refuse their changes", async () => {
    const ada = await openMember()
    const network = await created(ada, 'Night Shift Audio')
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(network) })
    expect(await page(grace, `/app/${network}/settings`)).toContain('data-role="member"')

    const res = await saveNetwork(grace, network, { name: 'Grace Audio', cpm: 30 })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Only an owner can change the network’s name and CPM.' })
    expect(await page(grace, `/app/${network}`)).toContain('data-network-name="Night Shift Audio"')
    expect((await connect(grace, network)).state()!.cpm).toBeNull()
  })
})
