// What search engines read, robots.txt and the sitemap, and the noindex on what they mustn't index: with
// SEARCH_INDEXING on, as production has it, and with it off, as the preview, which leaves it out, and
// tests have it.
import { env, exports } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { publicPages as pages } from './pages'
import { openMember } from './session'

const origin = 'https://crossfeed.test'
// How a browser asks for a page.
const browser = { headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' } }
const get = (url: string, init?: RequestInit) => exports.default.fetch(new URL(url, origin), init)

// The public pages, which a search engine may index, and what it should skip: a member's pages, the
// API, the MCP server, the agents' connections, the auth routes, and the invite page.
const publicPages = Object.keys(pages)
const skipped = [
  '/app',
  '/app/new',
  '/app/n-1/settings',
  '/api/v1/openapi.json',
  '/mcp',
  '/agents/network/n-1',
  '/auth/guest',
  '/invite'
]
// What else a crawler may fetch: the docs for agents, a skill's file, and every file in public/, which
// Workers Assets serves before the Worker, so a new one under a path robots.txt disallows fails here.
const files = ['/llms.txt', '/docs/agents/plan-launch-promos/SKILL.md']
files.push(...Object.keys(import.meta.glob('../public/*')).map((file) => file.slice('../public'.length)))

// Whether robots.txt lets every crawler fetch `path`, as RFC 9309 reads it: of the rules of the group for
// `*` whose path starts `path`, the longest wins, an Allow over a Disallow as long; none, and it may.
function allows(robots: string, path: string) {
  const groups = robots.split(/\n(?=User-agent:)/i).filter((g) => /^User-agent:\s*\*\s*$/im.test(g))
  expect(groups).toHaveLength(1)
  const rules = [...groups[0].matchAll(/^(Allow|Disallow):[ \t]*(\S*)/gim)]
    .map(([, kind, prefix]) => ({ allow: kind.toLowerCase() === 'allow', prefix }))
    .filter((r) => r.prefix && path.startsWith(r.prefix))
    .sort((a, b) => b.prefix.length - a.prefix.length || Number(b.allow) - Number(a.allow))
  return rules[0]?.allow ?? true
}

const robots = async () => {
  const res = await get('/robots.txt')
  expect([res.status, res.headers.get('content-type')]).toEqual([200, expect.stringMatching(/^text\/plain/)])
  return res.text()
}

// The sitemap's addresses, in its order.
const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map(([, loc]) => loc)

afterEach(() => {
  env.SEARCH_INDEXING = 'off'
  env.ACCOUNTS = 'on'
})

describe('on production, where SEARCH_INDEXING is on', () => {
  beforeEach(() => {
    env.SEARCH_INDEXING = 'on'
  })

  it('lets crawlers fetch the public pages and files, asks them to skip the rest, and names the sitemap', async () => {
    const text = await robots()
    // The one public file a disallowed path covers, so the glob found public/.
    expect(files).toContain('/apple-touch-icon.png')
    for (const path of [...publicPages, ...files]) expect(allows(text, path), path).toBe(true)
    for (const path of skipped) expect(allows(text, path), path).toBe(false)
    expect(text.match(/^Sitemap:.*$/gm)).toEqual([`Sitemap: ${origin}/sitemap.xml`])
  })

  it('lists each public page in the sitemap at its canonical address, on APP_ORIGINS’ first origin', async () => {
    const saved = env.APP_ORIGINS
    env.APP_ORIGINS = `${origin},https://other.test`
    try {
      const res = await get('https://other.test/sitemap.xml')
      expect([res.status, res.headers.get('content-type')]).toEqual([200, 'application/xml; charset=utf-8'])
      const xml = await res.text()
      expect(xml).toMatch(
        /^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/
      )
      expect(locs(xml)).toEqual(publicPages.map((path) => `${origin}${path}`))
      for (const loc of locs(xml)) {
        const page = await get(loc, browser)
        expect(page.status, loc).toBe(200)
        expect(await page.text(), loc).toContain(`<link rel="canonical" href="${loc}"`)
      }
    } finally {
      env.APP_ORIGINS = saved
    }
  })

  it('leaves signing in out of the sitemap while accounts are off, as it is a 404 then', async () => {
    env.ACCOUNTS = 'off'
    const xml = await (await get('/sitemap.xml')).text()
    expect(locs(xml)).toEqual(publicPages.filter((p) => p !== '/sign-in').map((path) => `${origin}${path}`))
  })

  it('marks a member’s pages and the invite page noindex, and no public page', async () => {
    const ada = await openMember()
    const { id } = await (
      await ada.fetch('/app/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Night Shift Audio' })
      })
    ).json<{ id: string }>()
    const tag = (res: Response) => res.headers.get('X-Robots-Tag')
    for (const path of ['/app', '/app/new', '/app/account', `/app/${id}`, `/app/${id}/settings`])
      expect(tag(await ada.fetch(path)), path).toBe('noindex')
    // Signed out, a member's page sends the browser to sign in, and that answer is noindex too.
    const signedOut = await get(`/app/${id}`, { ...browser, redirect: 'manual' })
    expect([signedOut.status, tag(signedOut)]).toEqual([302, 'noindex'])
    expect(tag(await get('/invite', browser))).toBe('noindex')
    for (const path of [...publicPages, '/robots.txt', '/sitemap.xml'])
      expect(tag(await get(path, browser)), path).toBeNull()
  })
})

describe('on the preview, where SEARCH_INDEXING is left out', () => {
  beforeEach(() => {
    delete env.SEARCH_INDEXING
  })

  it('disallows nothing, so a crawler can read every noindex, and names no sitemap, which is a 404', async () => {
    const text = await robots()
    for (const path of [...publicPages, ...files, ...skipped]) expect(allows(text, path), path).toBe(true)
    expect(text).not.toMatch(/^Sitemap:/m)
    const sitemap = await get('/sitemap.xml')
    expect([sitemap.status, await sitemap.text()]).toEqual([404, '404 Not Found'])
  })

  it('marks every answer of the Worker noindex', async () => {
    const ada = await openMember()
    const paths = [...publicPages, '/no-such-page', '/llms.txt', '/robots.txt', '/sitemap.xml', '/invite']
    for (const path of paths) expect((await get(path, browser)).headers.get('X-Robots-Tag'), path).toBe('noindex')
    for (const path of ['/app/new', '/api/v1/openapi.json'])
      expect((await ada.fetch(path)).headers.get('X-Robots-Tag'), path).toBe('noindex')
  })
})
