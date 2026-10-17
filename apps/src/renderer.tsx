/** @jsxImportSource hono/jsx */
import { jsxRenderer } from 'hono/jsx-renderer'
import { Link, Script, ViteClient } from 'vite-ssr-components/hono'

// @vitejs/plugin-react's Fast Refresh preamble, which Vite injects only into HTML it serves itself.
const reactRefresh = `import RefreshRuntime from '/@react-refresh'
RefreshRuntime.injectIntoGlobalHook(window)
window.$RefreshReg$ = () => {}
window.$RefreshSig$ = () => (type) => type
window.__vite_plugin_react_preamble_installed__ = true`

// The server-rendered shell: the black top bar with the app's sections, then the React island in #root.
export const renderer = jsxRenderer(({ children }, c) => {
  const sections = [{ href: '/', label: 'Roster' }]
  if (c.env.GUEST_PITCHES === 'on') sections.push({ href: '/inbox', label: 'Inbox' })
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Crossfeed</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;800&family=Libre+Franklin:wght@400;500;600;700&display=swap"
        />
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
        </header>
        {children}
      </body>
    </html>
  )
})
