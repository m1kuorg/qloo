/** @jsxImportSource hono/jsx */
import { jsxRenderer } from 'hono/jsx-renderer'
import { Link, Script, ViteClient } from 'vite-ssr-components/hono'

// @vitejs/plugin-react's Fast Refresh preamble, which Vite injects only into HTML it serves itself.
const reactRefresh = `import RefreshRuntime from '/@react-refresh'
RefreshRuntime.injectIntoGlobalHook(window)
window.$RefreshReg$ = () => {}
window.$RefreshSig$ = () => (type) => type
window.__vite_plugin_react_preamble_installed__ = true`

// The marketing shell: server-rendered pages with no island, under the black top bar with the
// wordmark, the developers band, the sample network, and, while ACCOUNTS is on, Sign in. The footer
// links the privacy page and the beta terms. `title` names the page before the product.
export const marketingShell = (title: string | null, description?: string) =>
  jsxRenderer(({ children }, c) => (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title ? `${title} · Crossfeed` : 'Crossfeed'}</title>
        {description && <meta name="description" content={description} />}
        <ViteClient />
        <Link href="/src/style.css" rel="stylesheet" />
      </head>
      <body>
        <header class="top mk-top">
          <a class="wm" href="/">
            Crossfeed
          </a>
          <nav class="nav" aria-label="Site">
            <a href="/#developers">Developers</a>
            <a href="/demo">Sample network</a>
          </nav>
          {c.env.ACCOUNTS === 'on' && (
            <span class="mk-sign">
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
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Crossfeed</title>
        <ViteClient />
        {import.meta.env.DEV && <script type="module" dangerouslySetInnerHTML={{ __html: reactRefresh }} />}
        <Link href="/src/style.css" rel="stylesheet" />
        <Script src="/src/client/main.tsx" />
      </head>
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
