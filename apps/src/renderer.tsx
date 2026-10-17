/** @jsxImportSource hono/jsx */
import { jsxRenderer } from 'hono/jsx-renderer'
import { Link, Script, ViteClient } from 'vite-ssr-components/hono'

// @vitejs/plugin-react's Fast Refresh preamble, which Vite injects only into HTML it serves itself.
const reactRefresh = `import RefreshRuntime from '/@react-refresh'
RefreshRuntime.injectIntoGlobalHook(window)
window.$RefreshReg$ = () => {}
window.$RefreshSig$ = () => (type) => type
window.__vite_plugin_react_preamble_installed__ = true`

// The server-rendered shell: the black top bar, then the React island in #root.
export const renderer = jsxRenderer(({ children }) => {
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
          <nav class="nav" aria-label="Sections">
            <a class="on" href="/" aria-current="page">
              Roster
            </a>
          </nav>
        </header>
        {children}
      </body>
    </html>
  )
})
