// The Developers page's playground: the operations it lists from the API's own OpenAPI document, with the
// inbox on and off, read from the props the server gives its island and rendered as the island renders
// it; /app/playground, which leads to it; the curl command it copies; and the REST API docs' link to it.
import { env, exports } from 'cloudflare:workers'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Developers } from '../src/client/Developers'
import { curl, type OpenApi } from '../src/client/Playground'
import { hooked, openGuest, openMember, rootData, tabsOf, type Member } from './session'

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

// The API's OpenAPI document, as the playground reads it from the same origin.
const openapi = async (member: Pick<Member, 'fetch'>) => (await member.fetch('/api/v1/openapi.json')).json<OpenApi>()

// The Developers page as the island renders it from the props the server gave its #root, as main.tsx
// reads them, with the playground given the document its tab loads once it opens.
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
      openapi={await openapi(member)}
    />
  )
}

// What a reader hears of some HTML.
const words = (html: string) =>
  html
    .replace(/<wbr\s*\/?>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

// The playground's operations as it lists them: each group's heading, and in it each operation's key
// (its method and path, as the API names it) and its words: what it does, its method, its path under
// the network's, and its cost.
const listed = (html: string) =>
  hooked(hooked(html, 'data-operations')[0], 'data-group').map((group) => ({
    group: words(group.match(/<h3\b[^>]*>(.*?)<\/h3>/)![1]),
    operations: hooked(group, 'data-operation').map((button) => [
      button.match(/data-operation="([^"]+)"/)![1],
      words(button)
    ])
  }))

// The document's operations, in its order, each path's methods as /docs/api orders them, as [key, words]
// the way the playground's list should say each, and their groups, each operation's first tag.
const METHODS = ['get', 'post', 'patch', 'put', 'delete']
function described(doc: OpenApi, inbox: boolean) {
  const ops = Object.entries(doc.paths).flatMap(([path, item]) =>
    Object.entries(item)
      .sort(([a], [b]) => METHODS.indexOf(a) - METHODS.indexOf(b))
      .filter(() => inbox || !/\/networks\/\{networkId\}\/(inbox|pitch-runs)/.test(path))
      .map(([method, op]) => {
        const relative = path.replace('/api/v1/networks/{networkId}', '') || '/'
        const cost = `${op['x-crossfeed-cost']}${op['x-crossfeed-session-only'] ? ' Session only' : ''}`
        return {
          tag: op.tags![0],
          key: `${method.toUpperCase()} ${path}`,
          said: `${op.summary} ${method.toUpperCase()} ${relative} ${cost}`
        }
      })
  )
  return [...new Set(ops.map((o) => o.tag))].map((group) => ({
    group,
    operations: ops.filter((o) => o.tag === group).map((o) => [o.key, o.said])
  }))
}

describe('the playground', () => {
  it('stands in its own tab beside Connect your AI, and lists every operation by group with its method, path and cost, leaving out the inbox’s while it’s off', async () => {
    const ada = await openMember()
    const id = await created(ada)
    const html = await page(ada, id)
    expect(tabsOf(html)).toEqual({
      label: 'Developers sections',
      tabs: ['Connect your AI', 'Playground'],
      panels: ['shown', 'hidden']
    })
    const doc = await openapi(ada)
    const shown = listed(html)
    expect(shown).toEqual(described(doc, false))
    expect(shown.map((g) => g.group)).toEqual(['Network', 'Roster', 'Launches', 'Evidence', 'Runs', 'Insertion orders'])
    // Deleting a launch says up front that only a session sends it.
    expect(shown.flatMap((g) => g.operations)).toContainEqual([
      'DELETE /api/v1/networks/{networkId}/launches/{launchId}',
      'Delete a launch DELETE /launches/{launchId} Deletes Session only'
    ])

    // The request opens on the first operation, the network's ID filled in, to send as the member's
    // own session.
    const request = hooked(html, 'data-request')[0]
    expect(words(request)).toMatch(/^Read the network Reads GET \/api\/v1\/networks\/\{networkId\} Path networkId /)
    expect(request).toMatch(new RegExp(`<input\\b[^>]*id="pg-param-networkId"[^>]*value="${id}"`))
    expect(words(request)).toContain(
      'Send as Your session An API key As you, signed in, from this page. Send Copy as curl'
    )
    expect(request).not.toContain('type="password"')
    expect(words(hooked(html, 'data-answer')[0])).toBe('Answer Nothing sent yet.')
  })

  it('lists the inbox’s, pitch runs’ and replies’ operations too while the inbox is on', async () => {
    env.GUEST_PITCHES = 'on'
    const guest = await openGuest()
    const doc = await openapi(guest)
    const shown = listed(await page(guest, 'guest-network'))
    expect(shown).toEqual(described(doc, true))
    expect(shown.map((g) => g.group)).toContain('Inbox')
    expect(shown.flatMap((g) => g.operations).length).toBe(
      Object.values(doc.paths).flatMap((item) => Object.keys(item)).length
    )
  })
})

describe('/app/playground', () => {
  it("leads to the playground of the network /app opens: the one the member opened last, a guest's guest network, or for a member with none, naming their first", async () => {
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
      (await who.fetch('/app/playground', { redirect: 'manual' })).headers.get('location')
    expect(await to(ada)).toBe(`/app/${first}/developers#playground`)
    expect(await to(await openGuest())).toBe('/app/guest-network/developers#playground')
    expect(await to(await openMember({ name: 'Lin Rivera' }))).toBe('/app/new')

    // Signed out, it's kept through sign-in, which keeps a path and search alone.
    const signedOut = await exports.default.fetch(`${origin}/app/playground`, { redirect: 'manual' })
    expect(signedOut.headers.get('location')).toBe('/sign-in?next=/app/playground')
  })

  it('is where the REST API docs send a reader to try a route, while accounts are on', async () => {
    const docs = async () =>
      (await exports.default.fetch(`${origin}/docs/api`, { headers: { Accept: 'text/html' } })).text()
    const on = await docs()
    expect(on).toMatch(/<a\b[^>]*href="\/app\/playground"[^>]*>playground<\/a>/)
    expect(words(on)).toContain('Signed in, you can send any route to your own network from the playground')
    env.ACCOUNTS = 'off'
    try {
      expect(await docs()).not.toContain('/app/playground')
    } finally {
      env.ACCOUNTS = 'on'
    }
  })
})

// The words a POSIX shell, bash or zsh, makes of a command as it's pasted, filling in `vars`: a
// backslash before a newline joins the lines, single quotes keep everything to the next one, double
// quotes fill in $NAME, and a backslash outside them keeps the next character. Anything else the shell
// would act on, unquoted (a comment, a glob, a substitution, a pipe or a newline ending the command),
// fails, so a command that leans on one doesn't pass for a plain one. It's the test's own reading, not
// the playground's, so it can catch the quoting going wrong.
function shellWords(command: string, vars: Record<string, string>) {
  const out: string[] = []
  let word: string | null = null
  let i = 0
  const add = (text: string) => (word = (word ?? '') + text)
  while (i < command.length) {
    const c = command[i]
    if (c === '\\' && command[i + 1] === '\n') i += 2
    else if (c === ' ' || c === '\t') {
      if (word !== null) out.push(word)
      word = null
      i++
    } else if (c === "'") {
      const end = command.indexOf("'", i + 1)
      if (end < 0) throw new Error('A single quote is never closed.')
      add(command.slice(i + 1, end))
      i = end + 1
    } else if (c === '"') {
      let text = ''
      for (i++; command[i] !== '"';) {
        if (i >= command.length) throw new Error('A double quote is never closed.')
        if (command[i] === '\\' && '"\\$`\n'.includes(command[i + 1])) {
          text += command[i + 1]
          i += 2
        } else if (command[i] === '$') {
          const name = /^\$(\w+)/.exec(command.slice(i))![1]
          text += vars[name] ?? ''
          i += name.length + 1
        } else if (command[i] === '`' || command[i] === '!') throw new Error(`A ${command[i]} in double quotes.`)
        else text += command[i++]
      }
      add(text)
      i++
    } else if (c === '\\') {
      add(command[i + 1])
      i += 2
    } else if ('\n#$`;&|<>()*?[]~!{}'.includes(c)) throw new Error(`An unquoted ${JSON.stringify(c)}.`)
    else {
      add(c)
      i++
    }
  }
  if (word !== null) out.push(word)
  return out
}

// How the curl command could fail, listed before it was written, each caught below: a ' in the body
// closing its quote early, so the body is cut or the rest runs as words; $, a backtick, \ or ! in it
// expanded or escaped by the shell; a newline in it ending the command; a body starting with @, which
// --data-binary reads as a file's name; the key written in the command, or single-quoted so the shell
// never fills it in; the URL's ? or & unquoted, a glob or a background job in zsh; a line's backslash
// not right before its newline, which splits the command in two; a # comment, which interactive zsh runs
// as words; no -X for a PATCH; a missing or wrong Content-Type; and an empty body still sent.
describe('Copy as curl', () => {
  const key = 'cf_live_from_the_shell'
  const url = `${origin}/api/v1/networks/net-1/pitch-runs/run-1/replies/p-1?replace=true&x=1`

  it("quotes a body with ' in it, the API's own example, so the shell passes it as it is, with the key from CROSSFEED_API_KEY", async () => {
    const doc = await openapi(await openMember())
    const example = (doc.components!.schemas!.ReplyChange as { example: unknown }).example
    const body = JSON.stringify(example, null, 2)
    expect(body).toContain("We'd")
    const command = curl({ method: 'PATCH', url, type: 'application/json', body })
    expect(command).not.toContain(key)
    expect(shellWords(command, { CROSSFEED_API_KEY: key })).toEqual([
      'curl',
      '-X',
      'PATCH',
      url,
      '-H',
      `Authorization: Bearer ${key}`,
      '-H',
      'Content-Type: application/json',
      '--data-binary',
      body
    ])
  })

  it('passes a text body byte for byte, whatever the shell would otherwise act on, and one starting with @ as data, not a file', () => {
    const body = "@Pat's pitch: $HOME `date` \\n !! 100% — Ada’s\nnext line\n"
    const command = curl({ method: 'POST', url, type: 'text/plain', body })
    expect(shellWords(command, { CROSSFEED_API_KEY: key, HOME: '/home/me' })).toEqual([
      'curl',
      '-X',
      'POST',
      url,
      '-H',
      `Authorization: Bearer ${key}`,
      '-H',
      'Content-Type: text/plain',
      '--data-raw',
      body
    ])
  })

  it('sends a read, and a request with no body, with the key alone', () => {
    expect(shellWords(curl({ method: 'GET', url, type: null, body: null }), { CROSSFEED_API_KEY: key })).toEqual([
      'curl',
      url,
      '-H',
      `Authorization: Bearer ${key}`
    ])
    expect(
      shellWords(curl({ method: 'POST', url, type: 'application/json', body: null }), { CROSSFEED_API_KEY: key })
    ).toEqual(['curl', '-X', 'POST', url, '-H', `Authorization: Bearer ${key}`])
  })
})
