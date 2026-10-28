// The Content-Security-Policy every page is served under: everything from the app's own origin, and
// nothing framing it, read from each page as a browser loads it, and checked against what the page
// itself loads. The browser check, in apps/README.md, confirms no page reports a violation.
import { env, exports } from 'cloudflare:workers'
import { afterEach, describe, expect, it } from 'vitest'
import { fakeQloo } from './fake'
import { openMember } from './session'

const origin = 'https://crossfeed.test'
// An address with no page, which a browser is shown the 404 page for; and how a browser asks.
const missing = '/no-such-page'
const browser = { headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' } }

afterEach(() => {
  env.GUEST_PITCHES = 'off'
})

// The policy a page was served with, by directive.
const policyOf = (res: Response) =>
  Object.fromEntries(
    (res.headers.get('Content-Security-Policy') ?? '')
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .filter(([name]) => name)
      .map(([name, ...sources]) => [name, sources])
  ) as Record<string, string[]>

// What a page loads or sends that its policy must allow, as a browser would refuse it: each inline
// script, which needs the policy's nonce, each script and stylesheet by its address, and each form's
// action, such as the guest buttons' (shell.tsx), which must be the app's own.
function refusedBy(policy: Record<string, string[]>, html: string) {
  const scripts = policy['script-src'] ?? policy['default-src'] ?? []
  const refused: string[] = []
  for (const [tag, attributes, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const src = /\bsrc="([^"]*)"/.exec(attributes)?.[1]
    const nonce = /\bnonce="([^"]*)"/.exec(attributes)?.[1]
    if (src !== undefined) {
      if (new URL(src, origin).origin !== origin) refused.push(tag.slice(0, 80))
    } else if (body.trim() && !(nonce && scripts.includes(`'nonce-${nonce}'`))) refused.push(tag.slice(0, 80))
  }
  for (const [, href] of html.matchAll(/<link\b[^>]*\bhref="([^"]*)"/g))
    if (new URL(href, origin).origin !== origin) refused.push(href)
  for (const [, action] of html.matchAll(/<form\b[^>]*\baction="([^"]*)"/g))
    if (new URL(action, origin).origin !== origin) refused.push(action)
  return refused
}

// The style attributes a page is rendered with: production's policy takes none, whatever development
// allows for Vite's own stylesheets, so no page may have one.
const styleAttributes = (html: string) => [...html.matchAll(/<[a-z][^>]*\sstyle="[^"]*"/g)].map(([a]) => a.slice(0, 80))

// Every page as a browser loads it, by path: the signed-out pages, the 404 page for an address that
// has none (`missing`), and a member's pages of a network (`id`) with a launch (`launch`).
async function everyPage() {
  env.GUEST_PITCHES = 'on'
  fakeQloo({ search: {} })
  const ada = await openMember()
  const { id } = await (
    await ada.fetch('/app/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Night Shift Audio' })
    })
  ).json<{ id: string }>()
  const network = await ada.connect(`/agents/network/${id}`)
  const launch = await network.call<{ id: string }>('createLaunch', { name: 'Night Shift Cinema' })
  network.close()

  const signedOut = ['/', '/privacy', '/terms', '/docs', '/docs/api', '/docs/sdk', '/docs/mcp', '/docs/agents']
  const pages = [...signedOut, missing, '/sign-in', '/invite']
  const app = ['/app/new', '/app/account', `/app/${id}`, `/app/${id}/roster`, `/app/${id}/inbox`]
  app.push(`/app/${id}/settings`, `/app/${id}/launches/${launch.id}`)
  const loaded = await Promise.all([
    ...pages.map(async (p) => [p, await exports.default.fetch(`${origin}${p}`, browser)] as const),
    ...app.map(async (p) => [p, await ada.fetch(p)] as const)
  ])
  return { id, launch: launch.id, loaded }
}

describe('every page', () => {
  it("is served under a policy of the app's own origin, nothing framing it, which allows what it loads", async () => {
    for (const [path, res] of (await everyPage()).loaded) {
      expect(res.status, path).toBe(path === missing ? 404 : 200)
      const policy = policyOf(res)
      expect(policy['default-src'], path).toEqual(["'self'"])
      expect(policy['script-src'], path).not.toContain("'unsafe-inline'")
      expect(policy['script-src'], path).not.toContain("'unsafe-eval'")
      expect([policy['object-src'], policy['base-uri'], policy['frame-ancestors']], path).toEqual([
        ["'none'"],
        ["'none'"],
        ["'none'"]
      ])
      expect(policy['form-action'], path).toEqual(["'self'"])
      const html = await res.text()
      expect(refusedBy(policy, html), path).toEqual([])
      expect(styleAttributes(html), path).toEqual([])
    }
  })

  // Tests run the development build, whose links are the page's source module, as its script is
  // main.tsx's; the Worker's build links the module's chunk and each chunk it imports, read from the
  // client build's manifest.
  it('links the module that renders an island page for preloading, and a page without the island links none', async () => {
    const { id, launch, loaded } = await everyPage()
    const preloads = async (res: Response) =>
      [...(await res.text()).matchAll(/<link\b[^>]*\brel="modulepreload"[^>]*>/g)].map(
        ([tag]) => /\bhref="([^"]*)"/.exec(tag)?.[1]
      )
    const modules: Record<string, string> = {
      '/sign-in': 'Account',
      '/invite': 'Account',
      '/app/new': 'NewNetwork',
      '/app/account': 'AccountPage',
      [`/app/${id}`]: 'Dashboard',
      [`/app/${id}/roster`]: 'Roster',
      [`/app/${id}/inbox`]: 'NetworkInbox',
      [`/app/${id}/settings`]: 'Settings',
      [`/app/${id}/launches/${launch}`]: 'Launch'
    }
    for (const [path, res] of loaded)
      expect(await preloads(res), path).toEqual(modules[path] ? [`/src/client/${modules[path]}.tsx`] : [])
  })
})
