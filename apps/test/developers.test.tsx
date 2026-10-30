// The Developers page, where a member connects an assistant to their network: what it shows an owner,
// a member and a guest, read from the props the server gives its island and rendered as the island
// renders it; the owner-only route its connection check reads; and /app/developers, which leads to it.
import { env, exports } from 'cloudflare:workers'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Developers } from '../src/client/Developers'
import { expectLinks, parsed, setups } from './assistants'
import { facts, hooked, openGuest, openMember, rootData, sections, type Guest, type Member } from './session'

const origin = 'https://crossfeed.test'
afterEach(() => {
  vi.useRealTimers()
  env.GUEST_PITCHES = 'off'
})

// A network the member creates the way /app/new does.
async function created(member: Member, name = 'Night Shift Audio') {
  const res = await member.fetch('/app/new', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  })
  return (await res.json<{ id: string }>()).id
}

// An API key the owner creates, as the page's form does, through the settings' route: its ID and its
// secret, shown this once.
async function key(member: Pick<Member, 'fetch'>, network: string, name = 'Claude Code') {
  const res = await member.fetch(`/app/${network}/settings/api-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  })
  if (res.status !== 200) throw new Error(`Creating ${name} returned ${res.status}: ${await res.text()}`)
  return res.json<{ id: string; secret: string }>()
}

// The page as the island renders it from the props the server gave its #root, as main.tsx reads them.
async function page(member: Pick<Member, 'fetch'>, network: string) {
  const d = await rootData(member, `/app/${network}/developers`)
  return renderToStaticMarkup(
    <Developers
      network={{
        id: d.networkId,
        name: d.networkName,
        role: d.role as 'owner' | 'member',
        guestBudget: d.guestBudget === 'true',
        links: {
          roster: d.rosterLink,
          inbox: d.inboxLink ?? null,
          settings: d.settingsLink,
          launches: d.launchesLink,
          developers: d.developersLink
        }
      }}
      mcp={d.mcpUrl}
      api={d.apiUrl}
      keys={d.keys ? JSON.parse(d.keys) : null}
      owners={d.owners ? JSON.parse(d.owners) : []}
      tools={d.tools ? JSON.parse(d.tools) : null}
    />
  )
}

// The page's words, as a reader hears them.
const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

// Markup's text, its entities as the characters they stand for.
const unescaped = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

// The assistants' picker, as a reader meets it: its tabs' names, the chosen one's, and each tab's panel
// as its code blocks, each its caption, what its Copy names (null for none) and its code, and its
// links, each its words and where it goes.
const picker = (html: string) => {
  const list = hooked(html, 'role="tablist"')[0]
  const tabs = [...list.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
  return {
    tabs: tabs.map(([, , name]) => words(name)),
    chosen: tabs.filter(([, attrs]) => attrs.includes('aria-selected="true"')).map(([, , name]) => words(name)),
    panels: hooked(html, 'data-assistant').map((panel) => ({
      blocks: hooked(panel, 'data-snippet').map((figure) => {
        const caption = figure.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/)![1]
        const button = caption.match(/<button\b[\s\S]*?<\/button>/)?.[0]
        return parsed([
          words(caption.replace(/<span class="flex[\s\S]*$/, '')),
          button ? words(button).replace(/^Copy /, '') : null,
          unescaped(figure.match(/<pre\b[^>]*>([\s\S]*?)<\/pre>/)![1])
        ])
      }),
      links: [...panel.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map(
        ([, href, label]) => [words(label), unescaped(href)] as [string, string]
      )
    }))
  }
}

// A JSON-RPC request to the MCP server with an API key, as an MCP client sends it.
const mcp = (secret: string, method: string, params?: object) =>
  exports.default.fetch(`${origin}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${secret}`
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  })

// An MCP client's first request, as `claude mcp list` makes it.
const initialize = (secret: string) =>
  mcp(secret, 'initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'claude-code', version: '2.0.0' }
  })

describe('the Developers page', () => {
  it("gives each assistant's steps behind a picker, with the network's own MCP address, and no key in any of them", async () => {
    const ada = await openMember()
    const id = await created(ada)
    const { secret } = await key(ada, id)
    const res = await ada.fetch(`/app/${id}/developers`)
    expect(res.status).toBe(200)
    const served = await res.text()
    expect(served).toContain('data-page="developers"')
    const html = await page(ada, id)
    // Its sections, in order, each a heading and one sentence.
    expect(sections(html)).toEqual([
      ['Addresses', 'Where an assistant or a script reaches Night Shift Audio, and the ID it names it by.'],
      ['API key', 'Each assistant acts for Night Shift Audio with an API key of its own.'],
      [
        'Your assistant',
        'How each assistant connects to the MCP server, with the key in no command, configuration or link you copy.'
      ],
      ['Check the connection', 'When each of Night Shift Audio’s API keys last reached it, to the minute.'],
      [
        'What an assistant can do',
        'With a key, an assistant reads, adds to and changes what Night Shift Audio has through these tools, but only a signed-in member, in the app, approves an insertion order.'
      ]
    ])
    expect(words(html)).toMatch(/^Developers /)
    expect(words(hooked(html, 'data-addresses')[0])).toContain(
      `MCP server ${origin}/mcp Copy MCP server address REST API ${origin}/api/v1 Copy REST API address Network ID ${id} Copy network ID`
    )
    // A tab for each assistant, Claude Code's open, and every panel on the page, each with its blocks:
    // each command runs as it's pasted, with no comment and no placeholder, and the key only as the
    // variable, and a block with the docs' placeholder for the key has no Copy.
    const { tabs, chosen, panels } = picker(html)
    const expected = setups(`${origin}/mcp`)
    expect(tabs).toEqual(expected.map(([name]) => name))
    expect(chosen).toEqual(['Claude Code'])
    expect(panels.map((p) => p.blocks)).toEqual(expected.map(([, blocks]) => blocks))
    for (const { blocks } of panels)
      for (const [caption, copy, code] of blocks)
        if (copy && caption === 'Shell') expect(code).not.toMatch(/(^|\s)#|…|<[^>]*>/)
    expectLinks(
      panels.flatMap((p) => p.links).filter(([label]) => label !== 'Skills and plugin'),
      `${origin}/mcp`
    )
    // Claude's links open in a tab of their own, so the page keeps a key it showed; the apps' links say
    // they open the app if it's there, and how to start it with the variable.
    expect(html).toMatch(
      /<a\b[^>]*href="https:\/\/claude\.ai\/customize\/[^"]*"[^>]*target="_blank"[^>]*rel="noreferrer"/
    )
    const text = words(html)
    for (const app of ['Cursor', 'VS Code'])
      expect(text).toContain(
        `Add to ${app} Opens ${app} if it’s installed. Start ${app} from the terminal where you set the variable first, or it has no key to send.`
      )
    expect(text).toContain(
      'On Windows, in PowerShell, the first line asks for the key and sets it for that window, and the second keeps it for apps you start afterwards.'
    )
    expect(text).toContain('Request headers are a beta that only some organizations have')
    expect(text).toContain(
      'ChatGPT can’t connect yet: its custom MCP servers sign in with OAuth or not at all, and Crossfeed’s MCP server takes an API key.'
    )
    expect(html).toMatch(/<a\b[^>]*href="\/docs\/agents"[^>]*>Skills and plugin<\/a>/)
    // Only the one-time reveal shows a key, and the page holds none, nor any key's prefix.
    for (const shown of [served, html]) {
      expect(shown).not.toContain(secret)
      expect(shown).not.toContain(secret.slice(0, 12))
    }
  })

  it("lets an owner create a key, and tells a member that only an owner can, naming the network's owners, with every setup step", async () => {
    const ada = await openMember()
    const id = await created(ada)
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(id) })
    const owners = words(await page(ada, id))
    expect(owners).toContain('API key Each assistant acts for Night Shift Audio with an API key of its own. Key name')
    expect(owners).toContain('Create API key')
    expect(owners).not.toContain('Only an owner')

    const members = words(await page(grace, id))
    expect(members).toContain(
      'API key Each assistant acts for Night Shift Audio with an API key of its own. Only an owner can create API keys. Night Shift Audio’s owner is Ada Programmer.'
    )
    expect(members).not.toContain('Create API key')
    expect(members).toContain('claude mcp add --transport http crossfeed')
    // A member doesn't see the network's keys, so the check says who does.
    expect(members).toContain(
      'Check the connection When each of Night Shift Audio’s API keys last reached it, to the minute. Only an owner sees when each key was last used.'
    )

    // A second owner is named too.
    expect(
      (
        await ada.fetch(`/app/${id}/settings/members/${grace.id}/role`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'owner' })
        })
      ).status
    ).toBe(200)
    const lin = await openMember({ name: 'Lin Rivera', invite: await ada.invite(id) })
    expect(words(await page(lin, id))).toContain(
      'Only an owner can create API keys. Night Shift Audio’s owners are Ada Programmer and Grace Booker.'
    )
  })

  it('says in the guest network that every guest shares its keys and they are cleared daily, and lets a guest create one', async () => {
    const guest: Guest = await openGuest()
    const html = words(await page(guest, 'guest-network'))
    expect(html).toContain(
      'Every guest shares this network’s API keys, as they share its runs and one set of daily limits, and the keys are cleared every day at 12:00 UTC, so add nothing private with one.'
    )
    expect(html).toContain('Create API key')
    const ada = await openMember()
    expect(words(await page(ada, await created(ada)))).not.toContain('Every guest shares')
  })

  it("lists every key in use with its last use, with no claim that it's connected", async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-19T14:30:00Z'))
    const ada = await openMember()
    const id = await created(ada)
    const { secret } = await key(ada, id, 'Claude Code')
    vi.setSystemTime(new Date('2026-10-19T14:31:00Z'))
    await key(ada, id, 'Nightly sync')
    vi.setSystemTime(new Date('2026-10-19T15:02:00Z'))
    expect((await initialize(secret)).status).toBe(200)
    const check = words(hooked(await page(ada, id), 'data-check')[0])
    expect(check).toContain('Nightly sync Never used Claude Code Last used Oct 19, 3:02 PM')
    expect(check).not.toContain('Connected')
  })

  it('lists what an assistant can do with a key, by kind, as the MCP server lists its tools', async () => {
    env.GUEST_PITCHES = 'on'
    const ada = await openMember()
    const id = await created(ada)
    const html = await page(ada, id)
    expect(sections(html).at(-1)).toEqual([
      'What an assistant can do',
      'With a key, an assistant reads, adds to and changes what Night Shift Audio has through these tools, but only a signed-in member, in the app, approves an insertion order or a reply.'
    ])
    // The tools an assistant lists with a key, by what each says it does: a read changes nothing, a
    // destructive tool replaces or edits, and the rest add.
    const { secret } = await key(ada, id)
    const res = await mcp(secret, 'tools/list')
    const listed = JSON.parse((await res.text()).replace(/^[\s\S]*?data:/, '')).result.tools as {
      name: string
      annotations: { readOnlyHint: boolean; destructiveHint: boolean }
    }[]
    // The inbox's tools are among them, as guest pitches are on.
    expect(listed.map((t) => t.name)).toContain('load_pitches')
    const of = (kind: (t: (typeof listed)[number]) => boolean) =>
      listed
        .filter(kind)
        .map((t) => t.name)
        .join(' ')
    expect(facts(hooked(html, 'data-tools')[0])).toEqual([
      ['Reads', of((t) => t.annotations.readOnlyHint)],
      ['Adds', of((t) => !t.annotations.readOnlyHint && !t.annotations.destructiveHint)],
      ['Changes', of((t) => t.annotations.destructiveHint)]
    ])
  })
})

describe('the keys route the connection check reads', () => {
  it("answers a network's owners with each key's name and its times, with no secret or prefix, marks a key used after its first MCP request, and refuses everyone else", async () => {
    const ada = await openMember()
    const id = await created(ada)
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(id) })
    const lin = await openMember({ name: 'Lin Rivera' })
    const { id: keyId, secret } = await key(ada, id)
    const read = async (member: Pick<Member, 'fetch'>) => {
      const res = await member.fetch(`/app/${id}/developers/keys`)
      return {
        status: res.status,
        cache: res.headers.get('Cache-Control'),
        body: await res.json<Record<string, unknown>>()
      }
    }

    const before = await read(ada)
    expect(before.status).toBe(200)
    // Kept by no cache, as every page under /app is.
    expect(before.cache).toBe('no-store')
    expect(before.body).toEqual({
      keys: [{ id: keyId, name: 'Claude Code', created: expect.any(Number), lastUsed: null }]
    })
    expect(JSON.stringify(before.body)).not.toContain(secret.slice(0, 12))

    expect((await initialize(secret)).status).toBe(200)
    const after = await read(ada)
    expect(after.body).toEqual({
      keys: [{ id: keyId, name: 'Claude Code', created: expect.any(Number), lastUsed: expect.any(Number) }]
    })

    // A member is told only owners see the keys; anyone outside the network gets the 404 a network that
    // doesn't exist gets.
    expect(await read(grace)).toEqual({
      status: 403,
      cache: 'no-store',
      body: { error: 'Only an owner can see the network’s API keys.' }
    })
    expect((await lin.fetch(`/app/${id}/developers/keys`)).status).toBe(404)
  })
})

describe('/app/developers', () => {
  it("leads to the Developers page of the network /app opens: the one the member opened last, a guest's guest network, or for a member with none, naming their first", async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-19T14:30:00Z'))
    const ada = await openMember()
    const first = await created(ada)
    vi.setSystemTime(new Date('2026-10-19T14:31:00Z'))
    await created(ada, 'Paper Trail Pods')
    // The member opened the first network last, a minute after creating the second.
    vi.setSystemTime(new Date('2026-10-19T14:32:00Z'))
    expect((await ada.fetch(`/app/${first}`)).status).toBe(200)
    const to = async (who: Pick<Member, 'fetch'>) =>
      (await who.fetch('/app/developers', { redirect: 'manual' })).headers.get('location')
    expect(await to(ada)).toBe(`/app/${first}/developers`)
    expect(await to(await openGuest())).toBe('/app/guest-network/developers')
    expect(await to(await openMember({ name: 'Lin Rivera' }))).toBe('/app/new')

    // Signed out, it's kept through sign-in.
    const signedOut = await exports.default.fetch(`${origin}/app/developers`, { redirect: 'manual' })
    expect(signedOut.headers.get('location')).toBe('/sign-in?next=/app/developers')
  })
})
