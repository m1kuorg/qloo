// The Content-Security-Policy every page is served under: everything from the app's own origin, and
// nothing framing it, read from each page as a browser loads it, and checked against what the page
// itself loads. The browser check, in apps/README.md, confirms no page reports a violation. The head
// every page shares is checked for what else it loads, too: the island's code, the mark's icons and
// the manifest; and for what it says: each page's title, and a public page's description, link
// preview and canonical address.
import { env, exports } from 'cloudflare:workers'
import { afterEach, describe, expect, it } from 'vitest'
import { fakeQloo } from './fake'
import { publicPages } from './pages'
import { openMember } from './session'

const origin = 'https://crossfeed.test'
// An address with no page, which a browser is shown the 404 page for; and how a browser asks.
const missing = '/no-such-page'
// The error page, which the network's dashboard answers once it fails.
const failing = 'the error page'
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

// A page's head: its title, and each of its links and metas as its attributes.
async function headOf(res: Response) {
  const head = (await res.text()).match(/<head>[\s\S]*<\/head>/)?.[0] ?? ''
  const attributes = (tag: string) =>
    Object.fromEntries([...tag.matchAll(/\s([a-z-]+)="([^"]*)"/g)].map(([, n, v]) => [n, v]))
  return {
    title: head.match(/<title>([^<]*)<\/title>/)?.[1],
    tags: [...head.matchAll(/<(?:link|meta)\b[^>]*>/g)].map(([tag]) => attributes(tag))
  }
}
// What a head tells search results and link previews: its description, its Open Graph and X card
// properties, and its canonical address.
const previewOf = ({ tags }: Awaited<ReturnType<typeof headOf>>) =>
  Object.fromEntries(
    tags.flatMap((t) =>
      t.name === 'description' || t.name?.startsWith('twitter:')
        ? [[t.name, t.content]]
        : t.property?.startsWith('og:')
          ? [[t.property, t.content]]
          : t.rel === 'canonical'
            ? [['canonical', t.href]]
            : []
    )
  )

// The pages a link preview may show: the public pages, and the 404 page, which isn't indexed.
const previewed: Record<string, string> = { ...publicPages, [missing]: 'Not found' }

// Every page as a browser loads it, by path: the signed-out pages, the 404 page for an address that
// has none (`missing`), a member's pages of a network (`id`) with a launch (`launch`), and last, once
// the directory has lost a table as it would while D1 fails, the error page, as `failing`.
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

  const pages = [...Object.keys(previewed), '/invite']
  const app = ['/app/new', '/app/account', `/app/${id}`, `/app/${id}/launches`, `/app/${id}/roster`]
  app.push(`/app/${id}/inbox`, `/app/${id}/settings`, `/app/${id}/launches/${launch.id}`)
  const loaded = await Promise.all([
    ...pages.map(async (p) => [p, await exports.default.fetch(`${origin}${p}`, browser)] as const),
    ...app.map(async (p) => [p, await ada.fetch(p)] as const)
  ])
  await env.DB.prepare('DROP TABLE invites').run()
  loaded.push([failing, await ada.fetch(`/app/${id}`, browser)])
  return { id, launch: launch.id, loaded }
}

describe('every page', () => {
  it("is served under a policy of the app's own origin, nothing framing it, which allows what it loads", async () => {
    for (const [path, res] of (await everyPage()).loaded) {
      expect(res.status, path).toBe(path === missing ? 404 : path === failing ? 500 : 200)
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
      [`/app/${id}/launches`]: 'Launches',
      [`/app/${id}/roster`]: 'Roster',
      [`/app/${id}/inbox`]: 'NetworkInbox',
      [`/app/${id}/settings`]: 'Settings',
      [`/app/${id}/launches/${launch}`]: 'Launch'
    }
    for (const [path, res] of loaded)
      expect(await preloads(res), path).toEqual(modules[path] ? [`/src/client/${modules[path]}.tsx`] : [])
  })

  // The files are in public/, which Workers Assets serves before the Worker, so only the head that
  // links them is seen here; apps/README.md's production check fetches the files themselves.
  it("links the mark's icons and the web app manifest, and tints the browser to the page's ground in light and dark", async () => {
    for (const [path, res] of (await everyPage()).loaded) {
      const { tags } = await headOf(res)
      expect(
        tags.filter((t) => ['icon', 'apple-touch-icon', 'manifest'].includes(t.rel)),
        path
      ).toEqual([
        { rel: 'icon', href: '/favicon.ico', sizes: '32x32' },
        { rel: 'icon', href: '/icon.svg', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/manifest.webmanifest' }
      ])
      expect(
        tags.filter((t) => t.name === 'theme-color'),
        path
      ).toEqual([
        { name: 'theme-color', content: '#f8f8fa', media: '(prefers-color-scheme: light)' },
        { name: 'theme-color', content: '#0e0f12', media: '(prefers-color-scheme: dark)' }
      ])
    }
  })

  it('names each island page and its network in its title, and a page outside a network by itself', async () => {
    const { id, launch, loaded } = await everyPage()
    const network = 'Night Shift Audio'
    const titles: Record<string, string> = {
      '/sign-in': 'Sign in · Crossfeed',
      '/invite': 'Invite · Crossfeed',
      '/app/new': 'New network · Crossfeed',
      '/app/account': 'Your account · Crossfeed',
      [`/app/${id}`]: `Dashboard · ${network} · Crossfeed`,
      [`/app/${id}/launches`]: `Launches · ${network} · Crossfeed`,
      [`/app/${id}/roster`]: `Roster · ${network} · Crossfeed`,
      [`/app/${id}/inbox`]: `Inbox · ${network} · Crossfeed`,
      [`/app/${id}/settings`]: `Settings · ${network} · Crossfeed`,
      // The launch's own name is the island's to set, once its agent says it (Launch.tsx).
      [`/app/${id}/launches/${launch}`]: `Launches · ${network} · Crossfeed`
    }
    const islands: [string, string | undefined][] = []
    for (const [path, res] of loaded) if (titles[path]) islands.push([path, (await headOf(res)).title])
    expect(Object.fromEntries(islands)).toEqual(titles)
  })

  it('gives each public page its own description, a link preview with the banner, and a canonical address on the app’s own origin, and an app page and the error page none', async () => {
    const descriptions = new Set<string>()
    for (const [path, res] of (await everyPage()).loaded) {
      const head = await headOf(res)
      const preview = previewOf(head)
      const title = previewed[path]
      if (!title) {
        expect(preview, path).toEqual({})
        continue
      }
      // The tab's title keeps the product's name.
      expect(head.title, path).toBe(path === '/' ? 'Crossfeed' : `${title} · Crossfeed`)
      const url = `${origin}${path}`
      expect(preview, path).toEqual({
        // One sentence.
        description: expect.stringMatching(/^[A-Z](?:(?!\. ).)+\.$/),
        'og:type': 'website',
        'og:site_name': 'Crossfeed',
        'og:title': title,
        'og:description': preview.description,
        'og:url': url,
        'og:image': `${origin}/og-1.png`,
        'og:image:width': '1200',
        'og:image:height': '630',
        'og:image:alt':
          'Crossfeed. Rank by who listens. An illustration of made-up shows ranked by listener overlap: one climbs five places to first and is the pick.',
        'twitter:card': 'summary_large_image',
        canonical: url
      })
      descriptions.add(preview.description)
    }
    expect(descriptions.size).toBe(Object.keys(previewed).length)
  })

  it('takes its addresses from APP_ORIGINS’ first origin, never the request’s, and leaves sign-in’s next out', async () => {
    const saved = env.APP_ORIGINS
    env.APP_ORIGINS = `${origin},https://other.test`
    try {
      const preview = async (url: string) => previewOf(await headOf(await exports.default.fetch(url, browser)))
      const elsewhere = await preview('https://other.test/privacy')
      expect([elsewhere['og:url'], elsewhere.canonical, elsewhere['og:image']]).toEqual([
        `${origin}/privacy`,
        `${origin}/privacy`,
        `${origin}/og-1.png`
      ])
      const signIn = await preview(`${origin}/sign-in?next=${encodeURIComponent('/app/someone')}`)
      expect([signIn['og:url'], signIn.canonical]).toEqual([`${origin}/sign-in`, `${origin}/sign-in`])
    } finally {
      env.APP_ORIGINS = saved
    }
  })
})
