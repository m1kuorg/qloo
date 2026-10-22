// The Content-Security-Policy every page is served under: everything from the app's own origin, and
// nothing framing it, read from each page as a browser loads it, and checked against what the page
// itself loads. The browser check, in apps/README.md, confirms no page reports a violation.
import { env, exports } from 'cloudflare:workers'
import { afterEach, describe, expect, it } from 'vitest'
import { fakeQloo } from './fake'
import { openMember } from './session'

const origin = 'https://crossfeed.test'

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

// What a page loads that its policy must allow, as a browser would refuse it: each inline script, which
// needs the policy's nonce, and each script and stylesheet by its address, which must be the app's own.
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
  return refused
}

// The style attributes a page is rendered with: production's policy takes none, whatever development
// allows for Vite's own stylesheets, so no page may have one.
const styleAttributes = (html: string) => [...html.matchAll(/<[a-z][^>]*\sstyle="[^"]*"/g)].map(([a]) => a.slice(0, 80))

describe('every page', () => {
  it("is served under a policy of the app's own origin, nothing framing it, which allows what it loads", async () => {
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
    const pages = [...signedOut, '/sign-in', '/invite', '/demo', '/demo/inbox']
    const app = ['/app/new', '/app/account', `/app/${id}`, `/app/${id}/roster`, `/app/${id}/inbox`]
    app.push(`/app/${id}/settings`, `/app/${id}/launches/${launch.id}`)
    for (const [path, res] of [
      ...(await Promise.all(pages.map(async (p) => [p, await exports.default.fetch(`${origin}${p}`)] as const))),
      ...(await Promise.all(app.map(async (p) => [p, await ada.fetch(p)] as const)))
    ]) {
      expect(res.status, path).toBe(200)
      const policy = policyOf(res)
      expect(policy['default-src'], path).toEqual(["'self'"])
      expect(policy['script-src'], path).not.toContain("'unsafe-inline'")
      expect(policy['script-src'], path).not.toContain("'unsafe-eval'")
      expect([policy['object-src'], policy['base-uri'], policy['frame-ancestors']], path).toEqual([
        ["'none'"],
        ["'none'"],
        ["'none'"]
      ])
      const html = await res.text()
      expect(refusedBy(policy, html), path).toEqual([])
      expect(styleAttributes(html), path).toEqual([])
    }
  })
})
