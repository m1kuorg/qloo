# mkdir.directory design research

Primary-source capture of the design system behind [mkdir.directory](https://mkdir.directory), plus a pass over the 31 inspiration galleries it lists, as input for Crossfeed's `docs/DESIGN.md`. Captured 2026-10-17 with `curl` from the live HTML, `/_astro/Web.BeNnPsrT.css`, and the `/_astro/*.js` component modules. Observed facts and interpretation are kept in separate sections.

Contents:

1.  [Method and limits](#method-and-limits)
1.  [Observed design tokens](#observed-design-tokens)
    1.  [Color tokens](#color-tokens)
    1.  [Typography tokens](#typography-tokens)
    1.  [Spacing, radius, border, and shadow tokens](#spacing-radius-border-and-shadow-tokens)
    1.  [Layout grid and breakpoints](#layout-grid-and-breakpoints)
    1.  [Motion tokens](#motion-tokens)
1.  [Observed component patterns](#observed-component-patterns)
    1.  [Numbered cd list rows](#numbered-cd-list-rows)
    1.  [Hover plate](#hover-plate)
    1.  [Vote button and odometer](#vote-button-and-odometer)
    1.  [Theme toggle](#theme-toggle)
    1.  [Animated text](#animated-text)
    1.  [Buttons, inputs, popover, and links](#buttons-inputs-popover-and-links)
    1.  [Focus and accessibility handling](#focus-and-accessibility-handling)
    1.  [Decorative extras](#decorative-extras)
1.  [The 31 listed directories](#the-31-listed-directories)
1.  [Galleries relevant to an Operate-mode tool](#galleries-relevant-to-an-operate-mode-tool)
    1.  [Inspora product category](#inspora-product-category)
    1.  [SaaS Landing Page tags](#saas-landing-page-tags)
    1.  [Unsection feature sections](#unsection-feature-sections)
    1.  [Movin and Dark Mode Design](#movin-and-dark-mode-design)
1.  [Interpretation for Crossfeed](#interpretation-for-crossfeed)
    1.  [What to borrow](#what-to-borrow)
    1.  [What to avoid](#what-to-avoid)
    1.  [Gap in the gallery list](#gap-in-the-gallery-list)
1.  [Could not fetch or verify](#could-not-fetch-or-verify)
1.  [See also](#see-also)

## Method and limits

- Sources fetched: `https://mkdir.directory` (HTML), `https://mkdir.directory/index.md` (the page's `text/markdown` alternate), `/_astro/Web.BeNnPsrT.css`, and the modules `AnimatedText`, `DirectoryList`, `ThemeToggle`, `Odometer`, `MarblingBand`, `CreditChip`, `Lenis`, `curves.D4rajd8i.js`, `media.CHrYOET-.js`, `theme.BTn11Wmr.js`.
- The site is built with Astro and Tailwind CSS v4. Tokens live in `@layer theme{:root,:host{...}}`; dark overrides live in `:root[data-theme=dark]`. Class names quoted below are the Tailwind utilities on the live markup, and values are the compiled CSS for those utilities.
- `--spacing` is `.0625rem` (1px at a 16px root), so every numeric utility on this site is a pixel value: `gap-16` is 16px, `h-36` is 36px.
- Rendering was not inspected in a browser. Hover, motion, and theme behavior are read from CSS and JS, not watched.

## Observed design tokens

### Color tokens

Light values come from `@layer theme{:root,:host}`; dark values from `:root[data-theme=dark]`.

| Token                | Light     | Dark      |
| -------------------- | --------- | --------- |
| `--color-page`       | `#fafafc` | `#0d0e13` |
| `--color-surface`    | `#fff`    | `#16181f` |
| `--color-plate`      | `#ebecf4` | `#20222c` |
| `--color-plate-soft` | `#f3f3f8` | `#181a22` |
| `--color-rule`       | `#e2e3ea` | `#24262f` |
| `--color-ink`        | `#16181f` | `#ecedf3` |
| `--color-ink-soft`   | `#3b3e49` | `#c5c7d1` |
| `--color-muted`      | `#6b6f7b` | `#8b8f9c` |
| `--color-accent`     | `#5b3fd6` | `#9a86ff` |
| `--color-success`    | not set   | `#45c27a` |

- Neutrals carry a slight blue-violet cast; the only chromatic color in use is `--color-accent`, applied to the voted state (`group-aria-pressed/vote:fill-accent`, `stroke-accent`).
- Light ink `#16181f` equals dark surface `#16181f`, so the two themes mirror each other.
- `::selection{background-color:var(--color-ink);color:var(--color-surface)}`.
- `<meta name="theme-color" content="#fafafc">`, which `theme.BTn11Wmr.js` rewrites to the computed `--color-page` on theme change.
- `--color-success` appears only in the dark block; no light value was found in the CSS.

### Typography tokens

- Families, from `@layer theme`: `--font-sans:"Geist Variable", ui-sans-serif, system-ui, sans-serif` and `--font-mono:"Geist Mono Variable", ui-monospace, monospace`.
- `@font-face` blocks declare both as variable fonts: `font-weight:100 900`, `font-display:swap`, `format("woff2-variations")`, split by unicode range (latin, latin-ext, cyrillic, cyrillic-ext, vietnamese, plus a Geist Mono `symbols2` file for box-drawing `U+2500-259F`). The two latin files are `<link rel="preload">` in the head.
- Only one weight token: `--font-weight-medium:500`. Body text uses the font's default 400.
- `body{font-size:var(--text-body);color:var(--color-ink);-webkit-font-smoothing:antialiased}`.

| Token            | Size               | Line height | Tracking | Weight |
| ---------------- | ------------------ | ----------- | -------- | ------ |
| `--text-micro`   | 11px               | 1.5         | .06em    | -      |
| `--text-caption` | 12px               | 1.5         | -        | -      |
| `--text-label`   | 13px               | 1.6         | -        | -      |
| `--text-ui`      | 14px               | 1.5         | -        | -      |
| `--text-body`    | fluid 14px to 16px | 1.5         | -        | -      |
| `--text-field`   | 16px               | 1.5         | -        | -      |
| `--text-display` | fluid 28px to 48px | 1.1         | -.02em   | 500    |
| `--text-title`   | fluid 34px to 44px | 1.05        | -.02em   | 500    |

- Fluid sizes use `--fluid-slope:calc((100vw - calc(var(--spacing) * var(--layout-min-w))) / (var(--layout-max-w) - var(--layout-min-w)))` with `--layout-min-w:375` and `--layout-max-w:1440`, for example `--text-body:clamp(14px, 14px + (16 - 14) * var(--fluid-slope), 16px)` (written with `calc(var(--spacing) * n)` in source).
- Usage on the page: `h1` uses `text-title` with `max-w-[22ch] text-balance`; the intro `p` uses `max-w-[56ch] text-pretty text-muted`; each directory name uses `text-display`; rank numbers and vote counts use `font-mono text-caption` and `font-mono text-ui` with `tabular-nums`.

### Spacing, radius, border, and shadow tokens

- Spacing: `--spacing:.0625rem` (1px). Values seen on the page: 2, 4, 6, 8, 9, 10, 12, 14, 16, 24, 32, 48, 56, 64, 80, 160.
- Radius: `--radius-8:8px`, `--radius-12:12px`, `--radius-full:9999px`. Buttons and inputs use `rounded-8`; the hover plate and popover use `rounded-12`; the theme toggle and credit chip use `rounded-full`.
- Borders: `*{border:0 solid}` in `@layer base`; rows use `.border-t{border-top-width:1px}` with `.border-rule{border-color:var(--color-rule)}`. Inputs use a ring instead of a border: `ring-1 ring-ink/8` (`#16181f14`, ink at 8%).
- `--shadow-ring:0 0 0 1px color-mix(in srgb, var(--color-ink) 6%, transparent), 0 1px 2px -1px #0000000f, 0 2px 4px 0 #0000000a`.
- `.shadow-panel{--tw-shadow:var(--shadow-ring), 0 8px 24px -8px #00000029}`, used on the suggest popover.
- `--blur-xs:4px`, used in hover and reveal transitions.

### Layout grid and breakpoints

- `:root{--page-width:calc(var(--spacing) * 1376);--page-gutter:calc(var(--spacing) * 16)}` and `@media (width>=48rem){:root{--page-gutter:calc(var(--spacing) * 32)}}`. Page width is 1376px with a 16px gutter, rising to 32px at 768px.
- Page shell: `<div class="isolate mx-auto flex min-h-svh w-full max-w-(--page-width) flex-col px-(--page-gutter)">`.
- Header: `flex min-h-64 items-center justify-between`. Hero: `<hgroup class="grid gap-16 py-32 md:pt-56 md:pb-48">`. Main: `grid flex-1 grid-cols-1 content-start gap-16`. Footer: `flex flex-wrap items-center justify-between gap-x-24 gap-y-8 py-24 text-body text-muted`.
- The layout is one column. There is no multi-column grid on the page.
- Breakpoints: `--breakpoint-sm:40rem` is the only declared token. Media queries in the CSS are `width>=40rem`, `width>=48rem` (four uses, the `md:` prefix), `width>=64rem`, `width>=80rem` (the last two only in the generated `.container` utility), plus `hover:hover`, `pointer:fine`, `pointer:coarse`, `prefers-reduced-motion:no-preference`, and `forced-colors:active`.

### Motion tokens

Easings from `:root,:host` in the CSS:

| Token          | Value                              |
| -------------- | ---------------------------------- |
| `--ease-out`   | `ease-out`                         |
| `--ease-in`    | `cubic-bezier(.4, 0, 1, 1)`        |
| `--ease-morph` | `cubic-bezier(.65, 0, .35, 1)`     |
| `--ease-plate` | `cubic-bezier(.215, .61, .355, 1)` |
| `--ease-swap`  | `cubic-bezier(.2, 0, 0, 1)`        |
| `--ease-lift`  | `cubic-bezier(.23, 1, .32, 1)`     |

- Defaults: `--default-transition-duration:.15s`, `--default-transition-timing-function:cubic-bezier(.4, 0, .2, 1)`.
- Durations used in classes: 150ms (color changes, popover close), 180ms, 200ms (hover swaps, popover open), 260ms, 300ms, 360ms, 480ms (letter morph in the credit chip).
- `.plate-travel{transition-property:opacity,translate;transition-duration:.2s,.45s;transition-timing-function:var(--ease-out), var(--ease-plate)}`.
- `curves.D4rajd8i.js` exports the JS easings: `cubic-bezier(0.25, 0.1, 0.25, 1)`, `cubic-bezier(0.23, 1, 0.32, 1)` (lift), `cubic-bezier(0.2, 0, 0, 1)` (swap).
- Every decorative transition is prefixed `motion-safe:`, and `media.CHrYOET-.js` checks `(prefers-reduced-motion: reduce)` and `(hover: hover) and (pointer: fine)` before running JS animations.
- The only `@keyframes` in the CSS is `spin` (`--animate-spin:spin 1s linear infinite`), used for the submit spinner.

## Observed component patterns

### Numbered cd list rows

- Markup: `<ol role="list">` with 31 `<li data-row class="relative border-rule border-t py-4 first:border-t-0">`. Rows are separated by 1px rules, not cards.
- Each row is a `div data-field` (`-mx-16 flex items-center gap-8 px-16`) holding a full-width link and a vote button. The link is `flex min-w-0 flex-1 items-baseline gap-16 py-12`, and its `after:absolute after:-inset-x-16` extends the hit area across the row.
- Rank cell: `<span class="grid w-[3ch] shrink-0 font-mono text-caption text-muted tabular-nums">` stacks two spans in `[grid-area:1/1]`. On `group-hover` or `group-focus-visible`, the rank (`01`) goes to `opacity-0 blur-xs` and the word `cd` (`text-ink`) goes from `opacity-0 blur-xs` to `opacity-100 blur-none`, over 200ms `ease-swap`. The `cd` span is `aria-hidden`.
- Name cell: `min-w-0 flex-1 text-display [overflow-wrap:anywhere]`.
- Accessible name: `aria-label="Awwwards, rank 1, opens in a new tab"`. Outbound links carry `?ref=mkdir.directory`.
- Ranking: `index.md` says the list is ranked by visitor votes, one vote per directory, and "the number before each entry is its rank."

### Hover plate

- `<span data-hover-plate aria-hidden="true" class="pointer-events-none absolute top-0 left-0 -z-1 hidden rounded-12 bg-plate-soft opacity-0 transition-opacity duration-200 ease-out data-active:opacity-100 data-travel:plate-travel md:pointer-fine:block">`.
- `DirectoryList` JS moves one shared plate to the hovered row by setting `style.translate` to the row offset and toggling `data-active` and `data-travel`, so the plate glides 450ms with `--ease-plate` between rows. It is shown only on `md` and fine pointers.

### Vote button and odometer

- `<button data-vote aria-pressed="false" aria-label="Vote for Awwwards, 407 votes" class="group/vote relative inline-flex h-44 min-w-64 shrink-0 items-center justify-end gap-8 font-medium font-mono text-muted text-ui tabular-nums ... hover:text-ink focus-visible:text-ink aria-pressed:text-ink motion-safe:active:scale-96">`.
- Arrow: a 10px outlined triangle that lifts 2px on hover (`group-hover/vote:-translate-y-2`) and fills with `--color-accent` when pressed, with a `forced-colors` fallback to `CanvasText`.
- `<vote-odometer>`: each digit is a column `h-[1lh] w-[1ch] overflow-clip mask-y-from-75%` holding a 0-9 strip moved with `translate`. A 1px underline appears only on keyboard focus (`group-focus-visible/vote:after:opacity-100`).

### Theme toggle

- Header button: `h-36 rounded-full hover:bg-plate-soft`, with `[view-transition-name:theme-toggle]`.
- On hover the caption column opens from `grid-cols-[0fr]` to `grid-cols-[1fr]` (300ms `ease-lift`), revealing the next theme's name (`dark` or `light`) in `font-mono text-caption text-ink-soft`, which slides in from `translate-x-6 opacity-0 blur-xs` (200ms `ease-swap`).
- The 20px glyph is a sun or moon made with an SVG mask circle that translates `7.5px -7.5px` between themes.
- `ThemeToggle` JS uses `document.startViewTransition` with up to 8 registered `--theme-reveal-n` length properties to grow circular reveals over 640ms. Other constants: 420ms, 180ms, `cubic-bezier(0.34, 1.56, 0.64, 1)` (overshoot) and `cubic-bezier(0.4, 0, 1, 1)`.
- Persistence (`theme.BTn11Wmr.js`): the theme is written to `document.documentElement.dataset.theme`; `localStorage.theme` is set only when the choice differs from `prefers-color-scheme` and removed when it matches, so the site follows the OS until the user overrides it. A `themechange` event is dispatched. A `<noscript>` style hides `theme-toggle`.

### Animated text

- `<animated-text style="opacity: 0.001">` wraps the h1, intro, and each directory name, with `data-delay` (0, 0.15, 0.3 seconds) and `data-viewport-disabled` on list rows.
- `AnimatedText` JS splits text into lines, words, or chars, clips each with a mask, and animates `[{translate:"0 100%",opacity:0},{translate:"0 0",opacity:1}]` with `cubic-bezier(0.23, 1, 0.32, 1)`.
- Default duration 1000ms (`data-duration` times 1000); default stagger 100ms per line, 30ms per word, 15ms per char; hide fades over 180ms.
- It waits for `document.fonts.ready` and an `IntersectionObserver` with `rootMargin:"0px 0px -10% 0px"`. With reduced motion, durations are 0. `<noscript>` forces `animated-text{opacity:1!important}`.

### Buttons, inputs, popover, and links

- Primary button: `inline-flex h-36 items-center justify-center rounded-8 px-10 font-medium text-label bg-ink text-surface transition-colors duration-150 ease-out hover:bg-ink-soft focus-visible:bg-ink-soft`, plus `motion-safe:active:scale-96`. Busy state: `aria-busy:cursor-progress aria-busy:bg-ink-soft`; the label scales to 90% and fades while a 14px spinner scales in.
- Input: `rounded-8 bg-surface px-9 font-mono text-field text-ink ring-1 ring-ink/8 focus:outline-none focus:ring-2 focus:ring-ink placeholder:text-muted`, sized `h-[calc(100%/0.875)] w-[calc(100%/0.875)] origin-top-left scale-[0.875]` inside a 36px box. It renders 16px text scaled to 14px; the likely reason, not stated in source, is avoiding iOS zoom on focus.
- Popover: `popover="auto" role="dialog"`, `w-320 max-w-[calc(100vw-24px)] rounded-12 bg-surface p-8 shadow-panel`, entering from `scale-96 opacity-0` to `scale-100 opacity-100` (200ms `ease-lift` in, 150ms `ease-out` out). Hint text is `text-caption text-muted`; errors use a `role="status"` paragraph.
- Text links: `underline decoration-rule underline-offset-3 hover:text-ink hover:decoration-current`, `min-h-24`.
- Credit chip: a `rounded-full bg-plate-soft ring-1 ring-rule ring-inset` pill whose name morphs from "Edoardo Lunardi" to "edoardolunardi.dev" letter by letter on hover, with per-glyph `--go` delays from 0ms to 230ms.

### Focus and accessibility handling

- `:where(a[href],button,input,summary,[tabindex]:not([tabindex="-1"])):focus-visible{outline-style:none}`, restored only under `@media (forced-colors:active)` as `outline:2px solid highlight; outline-offset:2px`.
- Focus is signaled by the same change as hover: a `bg-plate-soft` fill, a `text-ink` color shift, the rank-to-`cd` swap, or an underline.
- Status updates use `role="status"` live regions (`data-vote-status`, `data-theme-status`). There is a hidden `<h2 class="sr-only">31 directories</h2>`.
- Coarse pointers get larger hit areas: `pointer-coarse:after:-inset-4` on the toggle.

### Decorative extras

- `<lenis-scroll>` loads Lenis smooth scrolling (`html.lenis` rules at the top of the CSS).
- `<marbling-band aria-hidden="true" class="... mt-80 md:mt-160 aspect-[3.5216/1] ...">` is a WebGL canvas band that reacts to the pointer.
- Analytics: Umami (`cloud.umami.is/script.js`) with `data-umami-event="open-directory"` on each row link.

## The 31 listed directories

Order and vote counts come from `https://mkdir.directory/index.md`. Descriptions come from each site's `<title>` and `<meta name="description">` fetched on 2026-10-17, except where marked unverified.

1.  [Awwwards](https://www.awwwards.com) (407 votes): awards that rank sites by design and development.
1.  [Best Designs on X](https://bestdesignsonx.com) (109): returned a 2,980-byte JS shell with only a title; from the name, design posts collected from X. Unverified.
1.  [Inspora](https://www.inspora.design) (95): "a curated archive of recent visual design and creative work", filtered by 3D, Branding, Illustration, Motion, Print, Product, and Web.
1.  [404s](https://www.404s.design) (81): creative error page designs.
1.  [Recent](https://recent.design) (61): "the best design inspiration on the Internet"; scope not stated further.
1.  [CollectUI](https://collectui.com) (58): daily UI design inspiration and portfolios.
1.  [A1 Gallery](https://www.a1.gallery) (55): hand-picked websites, updated nearly every day.
1.  [Daily Delights](https://delights.design) (38): links about art, design, and development picked by Félix Péault.
1.  [CSS Design Awards](https://www.cssdesignawards.com) (31): connection failed; website awards from general knowledge. Unverified.
1.  [Maxibestof](https://maxibestof.one) (27): blocked by a Cloudflare challenge (403); a website gallery from general knowledge. Unverified.
1.  [Minimal Gallery](https://minimal.gallery) (26): hand-picked minimal websites, plus Framer and Webflow templates.
1.  [One Page Love](https://onepagelove.com) (24): one-page websites, templates, and resources.
1.  [Brutal Web](https://brutalweb.com) (23): neo-brutalist websites.
1.  [SaaS Landing Page](https://saaslandingpage.com) (22): landing pages of SaaS companies, tagged `ai`, `b2b`, `dark`, `devtools`, `finance`, `fintech`, and `productivity`.
1.  [Siteinspire](https://www.siteinspire.com) (20): blocked by a Vercel checkpoint (429); a website showcase from general knowledge. Unverified.
1.  [The FWA](https://thefwa.com) (20): title "Awards - The FWA"; awards for digital and interactive work. Unverified beyond the title.
1.  [Footer.design](https://www.footer.design) (19): website footers, sortable by type and style.
1.  [Okay Dev Gallery](https://okaydev.co/gallery) (19): web projects from developers, designers, and studios.
1.  [Save.design](https://save.design/explore) (18): websites with tech-stack detection, filterable by framework, animation library, category, and industry.
1.  [GSAP Showcase](https://gsap.com/showcase/) (17): sites built with the GSAP animation library.
1.  [Land-book](https://land-book.com) (17): blocked by Cloudflare (403); a landing page gallery from general knowledge. Unverified.
1.  [Lenis Showcase](https://lenis.dev/showcase) (17): smooth-scroll sites built with Lenis.
1.  [Unsection](https://www.unsection.com) (17): website sections by type: hero, feature, pricing, CTA, FAQ, testimonial, team, logo, blog, contact, portfolio, footer, navbar.
1.  [Brutalist Websites](https://brutalistwebsites.com) (16): title only; brutalist websites. Unverified beyond the title.
1.  [Codrops Creative Hub](https://tympanus.net/codrops/hub/) (16): blocked by Cloudflare (403); creative front-end links from Codrops. Unverified.
1.  [Dark Mode Design](https://www.darkmodedesign.com) (16): hand-picked dark mode websites.
1.  [Movin](https://movin.design) (16): motion design clips from X, updated daily.
1.  [Navbar Gallery](https://www.navbar.gallery) (16): website navigation bars.
1.  [Saaspo](https://saaspo.com) (16): blocked by Cloudflare (403); SaaS website inspiration from general knowledge. Unverified.
1.  [Klikkenthéke](https://klikkentheke.com) (14): title only; purpose not verified.
1.  [mesh3d](https://mesh3d.gallery) (5): Three.js, WebGL, and AI-powered interactive 3D websites.

## Galleries relevant to an Operate-mode tool

Selection: the galleries whose fetched pages surfaced product UI (agent dashboards, B2B and devtools products, data-heavy sections) rather than marketing aesthetics alone. Each page was scanned for terms like dashboard, analytics, B2B, devtools, and AI agent; Inspora, SaaS Landing Page, Movin, and Unsection had the most relevant hits. Saaspo would have been a candidate but was blocked.

### Inspora product category

`https://www.inspora.design/?category=Product` lists these post titles (from the page's embedded JSON):

- "agent dashboard" by Jessy Barret: `https://www.inspora.design/posts/agent-dashboard`
- "AI agent dashboard" by Bence Redmond: `https://www.inspora.design/posts/ai-agent-dashboard`
- "Agent cards", "Model router", "Usage meter component", "AI scheduler", "downloading an invoice", "Project card component", "a calendar booking page", "Soft glass workspace picker."

The two agent dashboard post pages returned a Vercel security checkpoint, so their images and source links were not seen.

### SaaS Landing Page tags

Entries listed under each tag page (`https://saaslandingpage.com/tag/<tag>/`), each at `https://saaslandingpage.com/<slug>/`:

- `devtools`: Hex, Retool, Equals, Sanity, Doss, Relace, Prime UI, Interfere, LocalCan, ToDesktop, Typesafe AI.
- `b2b`: Dovetail, Fibery, Granola, Oxide, Agiloft, Rulebase, Slite, Amperos, Contra Labs, Offloop, Stivio, Glide.
- `ai`: Tines, Gamma, Giga, Heron AI, Lovable, Granola, Dovetail, Rulebase.

Individual entries were not opened, so it is unverified which ones show in-product screens such as tables or dashboards.

### Unsection feature sections

The home page lists feature sections from AI-agent and operations products, for example:

- Composio: `/section/composio-agent-workflows-feature-section`, `/section/composio-access-control-feature-section`, `/section/composio-agent-tools-feature-section`, `/section/composio-customer-results-testimonial-section`.
- Arrakis: `/section/arrakis-ai-operations-hero-section`, `/section/arrakis-workflow-evolution-feature-section`, `/section/arrakis-security-governance-feature-section`.
- FirstIndex: `/section/firstindex-growth-results-feature-section`, `/section/firstindex-monthly-plan-pricing-section`.

All paths are relative to `https://www.unsection.com`. Unsection has no dashboard, table, or app-screen category; its 13 categories are all marketing sections.

### Movin and Dark Mode Design

- Movin's home page includes a clip titled "Edge traffic dashboard loading in" (`https://movin.design`). It is a reference for how a data panel loads, not for its layout.
- Dark Mode Design (`https://www.darkmodedesign.com`) is a source for dark-theme surfaces. No individual entries were opened.

## Interpretation for Crossfeed

These are my readings of the observed facts above, not claims from the sources.

### What to borrow

- The token set is small and already suited to a dense tool: eight neutrals plus one accent per theme, three radii, two shadows, and a type scale where four of eight steps are fixed at 11px to 14px. It maps to Crossfeed's surfaces as page, surface (panels), plate (selected row), rule (table lines), ink, muted, and accent (for the agent's pick or an approved state).
- Ranked rows split by 1px rules, with a mono `tabular-nums` rank column, fit Crossfeed's ranked show list. The rank-to-`cd` swap shows how a rank cell can turn into an action ("open evidence") on hover and focus without adding a column.
- `font-mono tabular-nums` for every number (ranks, counts) is the right default for overlap scores, impressions, CPMs, and insertion-order dollars.
- The shared hover plate gives a row highlight without borders or layout shift; in Crossfeed it could mark the row whose evidence panel is open.
- The odometer suits numbers that change after an approval (insertion-order total), used once per screen, not across a table.
- The theme handling (follow OS, store only overrides, `color-scheme:dark`, `theme-color` sync) can be reused as is.
- `role="status"` live regions for vote results map to announcing agent step results and approvals.

### What to avoid

- `text-display` (28px to 48px) per row is built for a 31-item showcase. Crossfeed rows should use `text-ui` or `text-body` so more shows fit on screen.
- `animated-text` reveals (1000ms, staggered) delay reading data. Operate-mode content should render at once; keep motion to state changes of 150ms to 200ms.
- Lenis smooth scrolling and the WebGL marbling band add load and fight native scrolling in long tables.
- Removing `:focus-visible` outlines and relying on a subtle background change is weak for a keyboard-heavy approve-each-step flow. Crossfeed should keep a visible focus ring, for example `ring-2` in ink or accent, as the input already does.
- `--color-success` exists only in dark mode. Crossfeed needs paired light and dark status colors (success, warning, error) for approval and validation states.

### Gap in the gallery list

From titles, metas, and category lists, the mkdir list is weighted toward marketing sites, awards, and motion. None of the fetched galleries is a library of in-app screens or flows. References for tables, evidence panels, approval steps, and dense dashboards appear only inside marketing pages (SaaS Landing Page `devtools` and `b2b` entries) or as single shots (Inspora "agent dashboard"). DESIGN.md will need app-UI sources beyond this list for those patterns.

## Could not fetch or verify

- Blocked: CSS Design Awards (connection failed), Maxibestof, Land-book, Codrops Creative Hub, and Saaspo (Cloudflare 403), Siteinspire (Vercel 429), and both Inspora post pages (Vercel checkpoint).
- Title only, no description: Best Designs on X, The FWA, Brutalist Websites, Klikkenthéke.
- Not opened: individual SaaS Landing Page, Unsection, Dark Mode Design, and CollectUI entries. CollectUI's category list did not appear in the fetched HTML.
- Not observed live: hover, theme transitions, odometer, and text reveal behavior were read from CSS and minified JS, not watched in a browser.
- `Lenis`, `CreditChip`, and `MarblingBand` JS were skimmed only for constants; shader code was not read.

## See also

- [mkdir.directory](https://mkdir.directory) and its [Markdown alternate](https://mkdir.directory/index.md)
- [Compiled stylesheet](https://mkdir.directory/_astro/Web.BeNnPsrT.css)
- [Crossfeed product doc](/docs/PRODUCT.md)
