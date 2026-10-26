/** @jsxImportSource hono/jsx */
import { cn } from 'cn'
import type { Child } from 'hono/jsx'
import { jsxRenderer, useRequestContext } from 'hono/jsx-renderer'
import { Link, Script, ViteClient } from 'vite-ssr-components/hono'
import { buttonVariants } from './components/ui/variants'
import type { Member, Network } from './directory'
import { Check, ChevronDown, ChevronsUpDown, Inbox, Podcast, Rocket, Settings } from './icons'
import { Mark } from './mark'
import { initials } from './text'

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

// The face's Latin woff2, which style.css's @import of @fontsource-variable/schibsted-grotesk serves:
// in the Worker's build its hashed file, from the manifest; in development its source path, which the
// dev server serves. Missing from the manifest, it's logged once and nothing is preloaded.
const LATIN_FONT = 'node_modules/@fontsource-variable/schibsted-grotesk/files/schibsted-grotesk-latin-wght-normal.woff2'
const latinFont = (() => {
  if (import.meta.env.DEV) return `/${LATIN_FONT}`
  const file = manifest[LATIN_FONT]?.file
  if (!file) console.error(JSON.stringify({ event: 'preload_missing', font: LATIN_FONT }))
  return file ? `/${file}` : null
})()

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

// The width every marketing page sets its blocks in: 24px margins, 40px from 768px, and content up to
// 1376px wide.
export const marketingFrame = 'mx-auto w-full max-w-[1456px] px-6 md:px-10'

// "Skip to content", first in every shell: off the screen until it's focused, it jumps past the shell's
// links to the page, in #content.
const SkipLink = () => (
  <a
    href="#content"
    class="fixed top-2 left-2 z-50 -translate-y-16 rounded-lg bg-primary px-3 py-1.5 font-medium text-primary-foreground focus:translate-y-0"
  >
    Skip to content
  </a>
)

// The mark, as a link home. Its name is Crossfeed.
const MarkLink = ({ href, class: className }: { href: string; class?: string }) => (
  <a href={href} class={cn('flex size-11 items-center justify-center rounded-lg', className)}>
    <Mark />
    <span class="vh">Crossfeed</span>
  </a>
)

// The marketing pages' mark and wordmark, top left, linking home.
const Wordmark = () => (
  <a href="/" class="-ml-1 flex items-center gap-2 rounded-sm px-1 py-2 font-semibold">
    <Mark />
    Crossfeed
  </a>
)

// The shells' menus: native <details data-menu>, so they open without JavaScript; menus.ts closes them
// one at a time, on a click outside, and on Escape. Styled as shadcn's dropdown menu: an 8px panel on
// the floating shadow while it's open, with 4px items.
const menu = 'group/menu relative'
const menuButton =
  'flex cursor-default list-none items-center gap-1.5 rounded-lg transition-colors select-none hover:bg-muted group-open/menu:bg-muted [&::-webkit-details-marker]:hidden'
const menuPanel =
  'absolute top-full z-50 mt-1 flex min-w-56 flex-col rounded-xl bg-popover p-1 text-popover-foreground animate-in duration-100 fade-in-0 zoom-in-95 group-open/menu:shadow-float'
const menuItem =
  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent focus-visible:bg-accent aria-[current]:font-medium max-md:min-h-11'

// The account menu: the member's initials and name, then who's signed in, their account page, and Sign
// out, which main.tsx wires. The visually hidden "Account: " comes right before the name, so the button
// reads "Account: <name>"; under 768px only the initials show. Renaming yourself on the account page
// changes the name and the initials in place (data-signed-in, data-initials).
const AccountMenu = ({ member, path }: { member: Member; path: string }) => (
  <details data-menu class={menu}>
    <summary class={cn(menuButton, 'h-8 px-1.5 max-md:size-11 max-md:justify-center max-md:px-0')}>
      <span
        aria-hidden="true"
        data-initials
        class="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary type-caption font-semibold"
      >
        {initials(member.name)}
      </span>
      <span class="vh">Account: </span>
      <span class="acct-name max-w-48 truncate max-md:sr-only" data-signed-in>
        {member.name}
      </span>
      <ChevronDown class="size-4 shrink-0 text-muted-foreground max-md:hidden" />
    </summary>
    <div class={cn(menuPanel, 'right-0 origin-top-right')}>
      <p class="px-2 pt-1.5 pb-1 type-caption text-muted-foreground">
        Signed in as{' '}
        <b class="font-medium break-words text-foreground" data-signed-in>
          {member.name}
        </b>
      </p>
      <a class={menuItem} href="/app/account" aria-current={path === '/app/account' ? 'page' : undefined}>
        Your account
      </a>
      <button type="button" class={menuItem} data-sign-out>
        Sign out
      </button>
    </div>
  </details>
)

// The network switcher, first in the app's top bar: the current network's name, or "Your networks" on
// a page outside one, after a visually hidden "Network: ". Its menu lists the member's networks, the
// current one checked, or says there are none yet, and "New network". Renaming the network in its
// settings changes its name in place (data-current-network).
const Switcher = ({ networks, network }: { networks: Network[]; network?: Network }) => (
  <details data-menu class={cn(menu, 'min-w-0')}>
    <summary class={cn(menuButton, 'h-8 min-w-0 px-2 font-medium max-md:h-11 md:-ml-2')}>
      <span class="vh">Network: </span>
      {network ? (
        <span class="truncate" data-current-network>
          {network.name}
        </span>
      ) : (
        <span class="truncate">Your networks</span>
      )}
      <ChevronsUpDown class="size-3.5 shrink-0 text-muted-foreground" />
    </summary>
    <div class={cn(menuPanel, 'left-0 max-w-[calc(100vw-2rem)] origin-top-left')}>
      {networks.length === 0 ? (
        <p class="px-2 pt-1.5 pb-1 type-caption text-muted-foreground">No networks yet.</p>
      ) : (
        <ul aria-label="Your networks" class="flex flex-col">
          {networks.map((n) => (
            <li>
              {n.id === network?.id ? (
                <a href={`/app/${n.id}`} class={menuItem} aria-current="true">
                  <span class="min-w-0 flex-1 truncate" data-current-network>
                    {n.name}
                  </span>
                  <Check class="size-4 shrink-0" />
                </a>
              ) : (
                <a href={`/app/${n.id}`} class={menuItem}>
                  <span class="min-w-0 flex-1 truncate">{n.name}</span>
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
      <a href="/app/new" class={cn(menuItem, networks.length > 0 && 'mt-1')}>
        New network
      </a>
    </div>
  </details>
)

// A page the rail leads to: its icon, and its name, the icon's tooltip and the link's accessible name.
// `current` is the page's own ("page"), or one that belongs to it ("true"); `utility` sits at the foot
// of the rail.
type Destination = {
  href: string
  label: string
  icon: typeof Rocket
  current?: 'page' | 'true'
  utility?: boolean
}

// The app's and the demo's rail: the mark, then the destinations, each an 18px icon on a 44px pitch,
// the current one on a tone-step square. Under 768px the same nav is the bottom bar, each icon over its
// name, and the mark moves to the top bar, so there's one nav and one current item at every width.
// Without destinations, as on the pages outside a network, it's the mark alone.
function Rail({ label, home, destinations }: { label: string; home: string; destinations: Destination[] }) {
  if (destinations.length === 0)
    return (
      <div class="max-md:hidden md:sticky md:top-0 md:h-svh">
        <MarkLink href={home} class="md:h-12 md:w-full" />
      </div>
    )
  return (
    <nav
      aria-label={label}
      class="fixed inset-x-0 bottom-0 z-40 bg-card pb-[env(safe-area-inset-bottom)] md:sticky md:top-0 md:flex md:h-svh md:flex-col md:items-center md:bg-transparent md:pb-3"
    >
      <MarkLink href={home} class="max-md:hidden md:h-12 md:w-full" />
      <ul class="flex md:mt-1 md:w-full md:flex-1 md:flex-col md:items-center md:gap-1">
        {destinations.map(({ href, label, icon: Icon, current, utility }) => (
          <li class={cn('flex-1 md:flex-none', utility && 'md:mt-auto')}>
            <a
              href={href}
              aria-current={current}
              class={cn(
                'group/rail relative flex h-14 flex-col items-center justify-center gap-1 md:size-10 md:rounded-lg',
                current ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <span
                class={cn(
                  'flex h-7 w-12 items-center justify-center rounded-lg transition-colors md:size-10',
                  current ? 'bg-muted' : 'group-hover/rail:bg-muted'
                )}
              >
                <Icon class="size-[18px]" />
              </span>
              {/* From 768px the name is the icon's tooltip. Until the link is hovered or focused it's clipped
                  to nothing, as a visually hidden label is, so it never lies over the page beside the
                  rail, and it stays the link's accessible name. */}
              <span class="type-caption font-medium md:pointer-events-none md:absolute md:top-1/2 md:left-full md:z-50 md:ml-2 md:-translate-y-1/2 md:rounded-md md:bg-foreground md:px-2.5 md:py-1 md:whitespace-nowrap md:text-background md:opacity-0 md:transition-opacity md:[clip-path:inset(50%)] md:group-hover/rail:opacity-100 md:group-hover/rail:[clip-path:none] md:group-focus-visible/rail:opacity-100 md:group-focus-visible/rail:[clip-path:none]">
                {label}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

// The app's and the demo's frame: the rail beside a column of the top bar over the page, the React
// island in #root. Under 768px the rail is a bottom bar, which the page leaves room for.
const AppFrame = ({
  rail,
  bar,
  bottomBar,
  children
}: {
  rail: Child
  bar: Child
  bottomBar: boolean
  children: Child
}) => (
  <html lang="en">
    <IslandHead />
    <body>
      <SkipLink />
      <div class="min-h-svh md:grid md:grid-cols-[3.5rem_minmax(0,1fr)]">
        {rail}
        <div class="min-w-0">
          {bar}
          <div id="content" class={bottomBar ? 'max-md:pb-[calc(3.5rem+env(safe-area-inset-bottom))]' : undefined}>
            {children}
          </div>
        </div>
      </div>
    </body>
  </html>
)

// The marketing pages' links, top right: the sample network, the developer docs, current on every docs
// page, and while ACCOUNTS is on, Sign in and "Create your network", secondary, so the page's own
// primary stays the only one. `inMenu` sets them as the items of the phone's Menu.
const SiteLinks = ({ path, accounts, inMenu }: { path: string; accounts: boolean; inMenu?: boolean }) => {
  const link = inMenu
    ? menuItem
    : 'rounded-sm decoration-1 underline-offset-[5px] hover:underline aria-[current]:underline'
  return (
    <>
      <a class={link} href="/demo">
        Sample network
      </a>
      <a class={link} href="/docs" aria-current={path.startsWith('/docs') ? 'page' : undefined}>
        Developers
      </a>
      {accounts && (
        <>
          <a class={link} href="/sign-in">
            Sign in
          </a>
          <a class={inMenu ? menuItem : buttonVariants({ variant: 'secondary', size: 'lg' })} href="/app/new">
            Create your network
          </a>
        </>
      )}
    </>
  )
}

// The marketing pages' head of the page, with no bar: the wordmark top left and the links top right,
// which fold into one Menu under 768px. The nav is written twice, for each width, and only one shows,
// so a page has one nav at a time.
const MarketingHeader = ({ path, accounts }: { path: string; accounts: boolean }) => (
  <header class={cn(marketingFrame, 'flex h-16 items-center justify-between gap-6 md:h-20')}>
    <Wordmark />
    <nav aria-label="Site" class="flex items-center gap-6 max-md:hidden">
      <SiteLinks path={path} accounts={accounts} />
    </nav>
    <details data-menu class={cn(menu, 'md:hidden')}>
      <summary class={cn(menuButton, '-mr-3 h-11 px-3')}>
        Menu
        <ChevronDown class="size-4 text-muted-foreground" />
      </summary>
      <nav aria-label="Site" class={cn(menuPanel, 'right-0 origin-top-right')}>
        <SiteLinks path={path} accounts={accounts} inMenu />
      </nav>
    </details>
  </header>
)

// The marketing pages' footer, per the page sheet's: the name set across the full content width
// first, then the legal pages and the docs, and what Crossfeed was made for, on a tone step from the
// page. The name is 4.48em wide in Schibsted Grotesk at 600, so the content's width over 4.5 sets it.
const footerLink =
  'inline-flex min-h-11 items-center underline decoration-1 underline-offset-4 hover:decoration-2 md:min-h-0'
const Footer = () => (
  <footer class="mt-24 overflow-hidden bg-muted md:mt-40">
    <div class={cn(marketingFrame, 'pt-8 pb-8 md:pt-12 md:pb-12')}>
      <p class="text-[length:calc((min(100vw,1456px)_-_3rem)_/_4.5)] leading-[0.8] font-semibold tracking-[-0.05em] whitespace-nowrap md:text-[length:calc((min(100vw,1456px)_-_5rem)_/_4.5)]">
        Crossfeed
      </p>
      <div class="mt-10 flex flex-col gap-2 md:mt-16 md:flex-row md:items-baseline md:justify-between">
        <ul class="flex flex-wrap gap-x-6">
          <li>
            <a class={footerLink} href="/privacy">
              Privacy
            </a>
          </li>
          <li>
            <a class={footerLink} href="/terms">
              Beta terms
            </a>
          </li>
          <li>
            <a class={footerLink} href="/docs">
              Developers
            </a>
          </li>
        </ul>
        <p>Made for the Qloo Agentic Hackathon.</p>
      </div>
    </div>
  </footer>
)

// A marketing page: server-rendered with no island, at 16px, under the marketing header and over the
// footer, which a short page keeps at the window's foot. `title` names the page before the product; the 404 handler renders it too (routes/marketing).
// menus.ts closes the phone's Menu on a click outside and on Escape; `reveal` adds reveal.ts, the
// landing page's section entrances. The face's Latin file is preloaded, so the landing page's poster
// type is set in it from the first paint rather than re-wrapping when it swaps in for the size-adjusted
// fallback (style.css).
export const MarketingPage = ({
  title,
  description,
  path,
  accounts,
  reveal = false,
  children
}: {
  title: string | null
  description?: string
  path: string
  accounts: boolean
  reveal?: boolean
  children: Child
}) => (
  <html lang="en">
    <Head title={title ? `${title} · Crossfeed` : 'Crossfeed'}>
      {latinFont && <link rel="preload" href={latinFont} as="font" type="font/woff2" crossorigin="" />}
      {description && <meta name="description" content={description} />}
      {/* A literal: vite-ssr-components finds the client build's entries by reading these. */}
      <Script src="/src/client/menus.ts" />
      {reveal && <Script src="/src/client/reveal.ts" />}
    </Head>
    <body class="flex min-h-svh flex-col type-body">
      <SkipLink />
      <MarketingHeader path={path} accounts={accounts} />
      <div id="content" class="flex-1">
        {children}
      </div>
      <Footer />
    </body>
  </html>
)

// The marketing shell, for a route group's pages: MarketingPage, with the request's path and flags.
export const marketingShell = (title: string | null, description?: string, { reveal = false } = {}) =>
  jsxRenderer(({ children }, c) => (
    <MarketingPage
      title={title}
      description={description}
      path={c.req.path}
      accounts={c.env.ACCOUNTS === 'on'}
      reveal={reveal}
    >
      {children}
    </MarketingPage>
  ))

// The demo shell: the app's rail, with the demo's pages, and a top bar whose left holds the sample
// network's name and its not-affiliated notice, which the island fills (Demo.tsx), and whose right
// holds, while ACCOUNTS is on, Sign in and "Create your network". The mark leads home.
export const demoShell = jsxRenderer(({ children }, c) => {
  const destinations: Destination[] = [{ href: '/demo', label: 'Launch', icon: Rocket }]
  if (c.env.GUEST_PITCHES === 'on') destinations.push({ href: '/demo/inbox', label: 'Inbox', icon: Inbox })
  for (const d of destinations) if (c.req.path === d.href) d.current = 'page'
  return (
    <AppFrame
      rail={<Rail label="Sample network" home="/" destinations={destinations} />}
      bottomBar
      bar={
        <header class="z-30 flex flex-wrap items-center gap-x-3 bg-background px-4 max-md:pb-2 md:sticky md:top-0 md:h-12 md:flex-nowrap lg:px-6">
          <MarkLink href="/" class="-ml-2.5 shrink-0 md:hidden" />
          {/* The island fills these while the session is on the sample network. They keep their height
              while they're empty, so the late fill doesn't move the page: the name over the notice, on a
              row of their own under 768px, and side by side from 1024px. */}
          <div class="flex h-[2.375rem] min-w-0 flex-1 flex-col justify-center max-md:order-last max-md:basis-full md:h-12 lg:flex-row lg:items-center lg:justify-start lg:gap-3">
            <span id="shell-network" class="truncate font-medium lg:shrink-0" />
            <span id="shell-notice" class="truncate type-caption text-muted-foreground" />
          </div>
          {c.env.ACCOUNTS === 'on' && (
            <div class="ml-auto flex h-12 shrink-0 items-center gap-1">
              <a class={buttonVariants({ variant: 'ghost', className: 'max-md:h-11' })} href="/sign-in">
                Sign in
              </a>
              <a class={buttonVariants({ className: 'max-md:h-11' })} href="/app/new">
                Create your network
              </a>
            </div>
          )}
        </header>
      }
    >
      {children}
    </AppFrame>
  )
})

// What the app shell shows besides the mark, as a page's handler sets it: the signed-in member, with
// their account menu; their networks, in the switcher; and the network the page belongs to, with its
// pages in the rail. The invite page's shell takes the member alone, when someone is signed in.
export type AppVariables = { member?: Member; networks?: Network[]; network?: Network }

// Where a network's pages are. The inbox has none while GUEST_PITCHES is off.
export const networkLinks = (env: Env, id: string) => ({
  dashboard: `/app/${id}`,
  roster: `/app/${id}/roster`,
  inbox: env.GUEST_PITCHES === 'on' ? `/app/${id}/inbox` : null,
  settings: `/app/${id}/settings`,
  launches: `/app/${id}/launches` // each launch's page is under it, by the launch's ID
})

// The app shell, for a signed-in member's pages: the rail with the network's pages (Launches, the
// dashboard, which lists them; Roster; Inbox while GUEST_PITCHES is on; Settings), and a 48px top bar
// with the network switcher, the page's name, and the account menu, then the React island in #root.
// A page outside a network, such as /app/new or /app/account, has the mark alone in its rail.
export const appShell = jsxRenderer(({ children }, c) => {
  const { member, networks = [], network } = c.var as AppVariables
  const path = c.req.path
  const links = network && networkLinks(c.env, network.id)
  const destinations: Destination[] = links
    ? [
        { href: links.dashboard, label: 'Launches', icon: Rocket },
        { href: links.roster, label: 'Roster', icon: Podcast },
        ...(links.inbox ? [{ href: links.inbox, label: 'Inbox', icon: Inbox }] : []),
        { href: links.settings, label: 'Settings', icon: Settings, utility: true }
      ]
    : []
  for (const d of destinations)
    // A launch's page belongs to the dashboard, which lists it.
    d.current =
      path === d.href
        ? 'page'
        : d.href === links?.dashboard && path.startsWith(`${links.launches}/`)
          ? 'true'
          : undefined
  // The page's name, after the switcher: on a launch's page, Launches, as a link back to the list.
  const here = destinations.find((d) => d.current)
  return (
    <AppFrame
      rail={<Rail label="Network" home="/app" destinations={destinations} />}
      bottomBar={destinations.length > 0}
      bar={
        <header class="sticky top-0 z-30 flex h-12 items-center gap-2 bg-background px-4 lg:px-6">
          <MarkLink href="/app" class="-ml-2.5 shrink-0 md:hidden" />
          {/* Every page here is a member's, so the switcher is always there: on a page outside a network
              with no networks yet, as on /app/new, it reads "Your networks" and offers New network. */}
          {(member || here) && (
            <ol class="flex min-w-0 items-center gap-2">
              {member && (
                <li class="min-w-0">
                  <Switcher networks={networks} network={network} />
                </li>
              )}
              {here && (
                <>
                  <li aria-hidden="true" class="text-muted-foreground max-md:hidden">
                    /
                  </li>
                  <li class="truncate max-md:hidden">
                    {here.current === 'true' ? (
                      <a
                        href={here.href}
                        class="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                      >
                        {here.label}
                      </a>
                    ) : (
                      here.label
                    )}
                  </li>
                </>
              )}
              {/* On a launch's page, the launch's name, which only its agent knows: the island fills
                  this (Launch.tsx). It's last on the bar's line, so the late fill moves nothing, and
                  hidden while it's empty. */}
              {here?.current === 'true' && (
                <li id="shell-launch" class="flex min-w-0 items-center gap-2 empty:hidden max-md:hidden" />
              )}
            </ol>
          )}
          {member && (
            <div class="ml-auto shrink-0">
              <AccountMenu member={member} path={path} />
            </div>
          )}
        </header>
      }
    >
      {children}
    </AppFrame>
  )
})

// The sign-in and invite pages' shell: the marketing pages' wordmark, with no links, over the React
// island in #root, and on the invite page, a signed-in visitor's account menu (the handler sets the
// member).
export const authShell = jsxRenderer(({ children }, c) => {
  const { member } = c.var as AppVariables
  return (
    <html lang="en">
      <IslandHead />
      <body>
        <SkipLink />
        <header class={cn(marketingFrame, 'flex h-16 items-center justify-between gap-6 md:h-20')}>
          <Wordmark />
          {member && <AccountMenu member={member} path={c.req.path} />}
        </header>
        <div id="content">{children}</div>
      </body>
    </html>
  )
})
