/** @jsxImportSource hono/jsx */
import { jsxRenderer } from 'hono/jsx-renderer'
import { Link, Script, ViteClient } from 'vite-ssr-components/hono'

// @vitejs/plugin-react's Fast Refresh preamble, which Vite injects only into HTML it serves itself.
const reactRefresh = `import RefreshRuntime from '/@react-refresh'
RefreshRuntime.injectIntoGlobalHook(window)
window.$RefreshReg$ = () => {}
window.$RefreshSig$ = () => (type) => type
window.__vite_plugin_react_preamble_installed__ = true`

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
