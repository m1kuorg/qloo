/** @jsxImportSource hono/jsx */
import type { Child } from 'hono/jsx'
import { jsxRenderer, useRequestContext } from 'hono/jsx-renderer'
import { Link, Script, ViteClient } from 'vite-ssr-components/hono'
import type { Member, Network } from './directory'

// @vitejs/plugin-react's Fast Refresh preamble, which Vite injects only into HTML it serves itself.
const reactRefresh = `import RefreshRuntime from '/@react-refresh'
RefreshRuntime.injectIntoGlobalHook(window)
window.$RefreshReg$ = () => {}
window.$RefreshSig$ = () => (type) => type
window.__vite_plugin_react_preamble_installed__ = true`

// The head every shell shares: the page's title, Vite's client in development, and the stylesheet.
// A shell adds what else its pages load, such as the island's script.
const Head = ({ title, children }: { title: string; children?: Child }) => (
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    {/* The page follows the system's light or dark setting (style.css), form controls included. */}
    <meta name="color-scheme" content="light dark" />
    <title>{title}</title>
    <ViteClient />
    <Link href="/src/style.css" rel="stylesheet" />
    {children}
  </head>
)

// The client build's manifest, by source path, with each chunk's file and the chunks it imports.
// vite-ssr-components writes it into the Worker's build in place of this string, as it does for its
// Script: an object of manifest files, each its `default`, which this merges as its Script does. In
// development the string stays, as the dev server serves each source module itself. Its plugin
// matches the string in double quotes, so they stay.
// prettier-ignore
const inlinedManifest: unknown = "__VITE_MANIFEST_CONTENT__"
type ManifestChunk = { file: string; imports?: string[] }
const manifest: Record<string, ManifestChunk> =
  typeof inlinedManifest === 'object' && inlinedManifest !== null
    ? Object.assign({}, ...Object.values(inlinedManifest).map((file: { default?: object }) => file.default))
    : {}

// The module that renders each island page, by its root's data-page, as main.tsx's pages import it;
// any other page, "roster", is the demo's roster. A new page goes in both.
const pageModules = {
  'sign-in': 'Account',
  invite: 'Account',
  account: 'AccountPage',
  'new-network': 'NewNetwork',
  dashboard: 'Dashboard',
  launch: 'Launch',
  'network-roster': 'Roster',
  'network-inbox': 'NetworkInbox',
  settings: 'Settings',
  inbox: 'DemoInbox'
}
type Page = keyof typeof pageModules | 'roster'
// The island's script, which IslandHead loads.
const ENTRY = 'src/client/main.tsx'

// The code a page's module needs: in the Worker's build, its chunk and the chunks it imports, and
// theirs in turn, but main.js, which the island's script loads; in development, the module itself. A
// module the build has no chunk for, as when pageModules names one main.tsx doesn't import, is logged
// and preloads nothing: the page still loads it from main.js.
function pageCode(page: Page) {
  const module = `src/client/${page === 'roster' ? 'App' : pageModules[page]}.tsx`
  if (import.meta.env.DEV) return [`/${module}`]
  if (!manifest[module]) {
    console.error(JSON.stringify({ event: 'preload_missing', page, module }))
    return []
  }
  const files: string[] = []
  const add = (key: string) => {
    const chunk = manifest[key]
    if (!chunk || key === ENTRY || files.includes(`/${chunk.file}`)) return
    files.push(`/${chunk.file}`)
    chunk.imports?.forEach(add)
  }
  add(module)
  return files
}

// The React island's root, which main.tsx renders `page` into from its data attributes, and links
// that preload the page's code, which Hono moves into the head after the island's script. main.js
// would ask for that code only once it has run; preloaded, it downloads alongside main.js instead
// (#218). At low priority, so the stylesheet and fonts the first paint waits on go first: at the
// default high priority Lighthouse counted it as blocking that paint, and /sign-in's first
// contentful paint came later.
export const Island = ({ page, ...data }: { page: Page; [attribute: `data-${string}`]: unknown }) => (
  <>
    {pageCode(page).map((href) => (
      <link rel="modulepreload" href={href} fetchpriority="low" />
    ))}
    <div id="root" data-page={page} {...data} />
  </>
)

// The head of a page with the React island: the shared head, React's refresh preamble in
// development, under the policy's nonce (index.tsx), and the island's script.
const IslandHead = () => {
  const nonce = useRequestContext().get('secureHeadersNonce')
  return (
    <Head title="Crossfeed">
      {import.meta.env.DEV && <script type="module" nonce={nonce} dangerouslySetInnerHTML={{ __html: reactRefresh }} />}
      {/* A literal: vite-ssr-components finds the client build's entries by reading these. */}
      <Script src="/src/client/main.tsx" />
    </Head>
  )
}

// The marketing shell: server-rendered pages with no island, under the black top bar with the
// wordmark, the developer docs, the sample network, and, while ACCOUNTS is on, Sign in. The footer
// links the privacy page and the beta terms. `title` names the page before the product.
export const marketingShell = (title: string | null, description?: string) =>
  jsxRenderer(({ children }, c) => (
    <html lang="en">
      <Head title={title ? `${title} · Crossfeed` : 'Crossfeed'}>
        {description && <meta name="description" content={description} />}
      </Head>
      <body>
        <header class="top mk-top">
          <a class="wm" href="/">
            Crossfeed
          </a>
          <nav class="nav" aria-label="Site">
            <a
              class={c.req.path.startsWith('/docs') ? 'on' : undefined}
              href="/docs"
              aria-current={c.req.path.startsWith('/docs') ? 'page' : undefined}
            >
              Developers
            </a>
            <a href="/demo">Sample network</a>
          </nav>
          {c.env.ACCOUNTS === 'on' && (
            <span class="shell-create mk-sign">
              <a class="lnk" href="/sign-in">
                Sign in
              </a>
            </span>
          )}
        </header>
        {children}
        <footer class="mk-foot">
          <p>Crossfeed, made for the Qloo Agentic Hackathon.</p>
          <nav aria-label="Legal">
            <a class="lnk" href="/privacy">
              Privacy
            </a>
            <a class="lnk" href="/terms">
              Beta terms
            </a>
          </nav>
        </footer>
      </body>
    </html>
  ))

// The demo shell: the black top bar with the demo's sections and, while ACCOUNTS is on, a way to
// create a network of one's own, then the React island in #root.
export const demoShell = jsxRenderer(({ children }, c) => {
  const sections = [{ href: '/demo', label: 'Roster' }]
  if (c.env.GUEST_PITCHES === 'on') sections.push({ href: '/demo/inbox', label: 'Inbox' })
  return (
    <html lang="en">
      <IslandHead />
      <body>
        <header class="top">
          <span class="wm">Crossfeed</span>
          {/* The React island fills these while the session is on the sample network. */}
          <span id="shell-network" />
          <nav class="nav" aria-label="Sections">
            {sections.map(({ href, label }) => {
              const current = c.req.path === href
              return (
                <a class={current ? 'on' : undefined} href={href} aria-current={current ? 'page' : undefined}>
                  {label}
                </a>
              )
            })}
          </nav>
          <span id="shell-notice" class="shell-notice" />
          {c.env.ACCOUNTS === 'on' && (
            <span class="shell-create">
              <a class="lnk" href="/app/new">
                Create your network
              </a>
            </span>
          )}
        </header>
        {children}
      </body>
    </html>
  )
})

// What the app shell shows besides the wordmark, as a page's handler sets it: the signed-in member,
// with their account menu; their networks, in the switcher; and the network the page belongs to,
// with its sections. The sign-in page sets none of them.
export type AppVariables = { member?: Member; networks?: Network[]; network?: Network }

// Where a network's pages are. The inbox has none while GUEST_PITCHES is off.
export const networkLinks = (env: Env, id: string) => ({
  dashboard: `/app/${id}`,
  roster: `/app/${id}/roster`,
  inbox: env.GUEST_PITCHES === 'on' ? `/app/${id}/inbox` : null,
  settings: `/app/${id}/settings`,
  launches: `/app/${id}/launches` // each launch's page is under it, by the launch's ID
})

// The app shell, for signing in and for a signed-in member's pages: the black top bar with the
// wordmark, the network switcher, the network's sections, and the account menu, then the React
// island in #root.
export const appShell = jsxRenderer(({ children }, c) => {
  const { member, networks, network } = c.var as AppVariables
  const links = network && networkLinks(c.env, network.id)
  const sections = links && [
    { href: links.dashboard, label: 'Dashboard' },
    { href: links.roster, label: 'Roster' },
    ...(links.inbox ? [{ href: links.inbox, label: 'Inbox' }] : []),
    { href: links.settings, label: 'Settings' }
  ]
  return (
    <html lang="en">
      <IslandHead />
      <body>
        <header class="top app-top">
          <a class="wm" href={member ? '/app' : '/'}>
            Crossfeed
          </a>
          {networks && networks.length > 0 && (
            <details class="menu switch">
              <summary>
                <span class="vh">Network: </span>
                {network ? <span data-current-network>{network.name}</span> : 'Your networks'}
              </summary>
              <div class="menu-panel">
                <ul aria-label="Your networks">
                  {networks.map((n) => (
                    <li>
                      {n.id === network?.id ? (
                        <a href={`/app/${n.id}`} aria-current="true" data-current-network>
                          {n.name}
                        </a>
                      ) : (
                        <a href={`/app/${n.id}`}>{n.name}</a>
                      )}
                    </li>
                  ))}
                </ul>
                <a class="menu-new" href="/app/new">
                  New network
                </a>
              </div>
            </details>
          )}
          {sections && (
            <nav class="nav" aria-label="Network">
              {sections.map(({ href, label }) => {
                // A launch's page belongs to the dashboard, which lists it.
                const current =
                  c.req.path === href
                    ? 'page'
                    : href === links.dashboard && c.req.path.startsWith(`${links.launches}/`)
                      ? 'true'
                      : undefined
                return (
                  <a class={current ? 'on' : undefined} href={href} aria-current={current}>
                    {label}
                  </a>
                )
              })}
            </nav>
          )}
          {member && (
            <details class="menu acct-menu">
              <summary>
                <span class="vh">Account: </span>
                <span class="acct-name" data-signed-in>
                  {member.name}
                </span>
                <span class="acct-short" aria-hidden="true">
                  Account
                </span>
              </summary>
              <div class="menu-panel">
                <p>
                  Signed in as <b data-signed-in>{member.name}</b>
                </p>
                <a
                  class="menu-acct"
                  href="/app/account"
                  aria-current={c.req.path === '/app/account' ? 'page' : undefined}
                >
                  Your account
                </a>
                <button type="button" class="btn" data-sign-out>
                  Sign out
                </button>
              </div>
            </details>
          )}
        </header>
        {children}
      </body>
    </html>
  )
})
