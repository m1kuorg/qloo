---
name: Crossfeed
description: A network's own shows ranked by who listens, set as the biggest thing on the screen; ink on a cool grey ground, one signal orange, light or dark as the system sets it.
colors:
  background: '#f8f8fa'
  card: '#ffffff'
  popover: '#ffffff'
  muted: '#efeff3'
  accent: '#efeff3'
  foreground: '#121318'
  muted-foreground: '#5f626d'
  border: '#e3e4ea'
  input: '#868995'
  primary: '#121318'
  primary-foreground: '#ffffff'
  secondary: '#e8e9ee'
  secondary-foreground: '#121318'
  signal: '#e4630c'
  signal-foreground: '#121318'
  signal-ink: '#a24a00'
  signal-tint: '#fdeee2'
  destructive: '#c8153e'
  destructive-foreground: '#ffffff'
  ring: '#121318'
  scrim: 'rgb(18 19 24 / 0.4)'
  background-dark: '#0e0f12'
  card-dark: '#16171c'
  popover-dark: '#16171c'
  muted-dark: '#1d1f25'
  accent-dark: '#1d1f25'
  foreground-dark: '#ececf1'
  muted-foreground-dark: '#9a9daa'
  border-dark: '#26282f'
  input-dark: '#6c6f7c'
  primary-dark: '#ececf1'
  primary-foreground-dark: '#0e0f12'
  secondary-dark: '#24262d'
  secondary-foreground-dark: '#ececf1'
  signal-dark: '#ff8a3d'
  signal-foreground-dark: '#0e0f12'
  signal-ink-dark: '#ffa266'
  signal-tint-dark: '#2a1a0e'
  destructive-dark: '#ff5c7a'
  destructive-foreground-dark: '#0e0f12'
  ring-dark: '#ececf1'
  scrim-dark: 'rgb(0 0 0 / 0.6)'
typography:
  caption:
    fontFamily: 'Schibsted Grotesk Variable, Schibsted Grotesk Fallback, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.75rem'
    lineHeight: 1.45
    letterSpacing: '0'
  ui:
    fontFamily: 'Schibsted Grotesk Variable, Schibsted Grotesk Fallback, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.875rem'
    lineHeight: 1.45
    letterSpacing: '0'
  body:
    fontFamily: 'Schibsted Grotesk Variable, Schibsted Grotesk Fallback, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1rem'
    lineHeight: 1.55
    letterSpacing: '0'
  title:
    fontFamily: 'Schibsted Grotesk Variable, Schibsted Grotesk Fallback, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.5rem'
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: '-0.01em'
  display:
    fontFamily: 'Schibsted Grotesk Variable, Schibsted Grotesk Fallback, ui-sans-serif, system-ui, sans-serif'
    fontSize: 'clamp(36px, 2rem + 2vw, 56px)'
    fontWeight: 600
    lineHeight: 1.04
    letterSpacing: '-0.025em'
  poster:
    fontFamily: 'Schibsted Grotesk Variable, Schibsted Grotesk Fallback, ui-sans-serif, system-ui, sans-serif'
    fontSize: 'clamp(96px, 12.5vw, 200px)'
    fontWeight: 600
    lineHeight: 0.86
    letterSpacing: '-0.05em'
  index:
    fontFamily: 'Schibsted Grotesk Variable, Schibsted Grotesk Fallback, ui-sans-serif, system-ui, sans-serif'
    fontSize: 'clamp(28px, 1rem + 3.6vw, 72px)'
    fontWeight: 500
    lineHeight: 1
    letterSpacing: '-0.03em'
  show-name:
    fontFamily: 'Schibsted Grotesk Variable, Schibsted Grotesk Fallback, ui-sans-serif, system-ui, sans-serif'
    fontSize: '15px'
    fontWeight: 600
    lineHeight: 1.375
  mono:
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'
rounded:
  sm: '4px'
  md: '4px'
  lg: '6px'
  xl: '8px'
  full: 'calc(infinity * 1px)'
spacing:
  unit: '4px'
  gutter-narrow: '16px'
  gutter: '24px'
  block: '24px'
  panel: '16px'
  margin-marketing-phone: '24px'
  margin-marketing: '40px'
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
    typography: '{typography.ui}'
    rounded: '{rounded.lg}'
    height: '32px'
    padding: '0 12px'
  button-secondary:
    backgroundColor: '{colors.secondary}'
    textColor: '{colors.secondary-foreground}'
    typography: '{typography.ui}'
    rounded: '{rounded.lg}'
    height: '32px'
    padding: '0 12px'
  button-ghost:
    textColor: '{colors.foreground}'
    typography: '{typography.ui}'
    rounded: '{rounded.lg}'
    height: '32px'
    padding: '0 12px'
  button-ghost-hover:
    backgroundColor: '{colors.muted}'
  button-link:
    textColor: '{colors.foreground}'
    typography: '{typography.ui}'
  button-destructive:
    textColor: '{colors.destructive}'
    typography: '{typography.ui}'
    rounded: '{rounded.lg}'
    height: '32px'
    padding: '0 12px'
  button-destructive-solid:
    backgroundColor: '{colors.destructive}'
    textColor: '{colors.destructive-foreground}'
    typography: '{typography.ui}'
    rounded: '{rounded.lg}'
    height: '32px'
    padding: '0 12px'
  button-sm:
    height: '28px'
    padding: '0 10px'
  button-lg:
    typography: '{typography.body}'
    height: '44px'
    padding: '0 20px'
  input:
    backgroundColor: '{colors.card}'
    textColor: '{colors.foreground}'
    typography: '{typography.ui}'
    rounded: '{rounded.lg}'
    height: '32px'
    padding: '4px 10px'
  chip:
    backgroundColor: '{colors.muted}'
    textColor: '{colors.foreground}'
    typography: '{typography.caption}'
    rounded: '{rounded.lg}'
    height: '20px'
    padding: '0 6px'
  chip-outline:
    textColor: '{colors.foreground}'
    typography: '{typography.caption}'
    rounded: '{rounded.lg}'
    height: '20px'
    padding: '0 6px'
  chip-destructive:
    textColor: '{colors.destructive}'
    typography: '{typography.caption}'
    rounded: '{rounded.lg}'
    height: '20px'
    padding: '0 6px'
  segmented-track:
    backgroundColor: '{colors.muted}'
    rounded: '{rounded.lg}'
    height: '32px'
    padding: '2px'
  segmented-item:
    textColor: '{colors.muted-foreground}'
    rounded: '{rounded.md}'
    height: '28px'
    padding: '0 10px'
  segmented-item-active:
    backgroundColor: '{colors.card}'
    textColor: '{colors.foreground}'
  call-number:
    textColor: '{colors.muted-foreground}'
    typography: '{typography.mono}'
    rounded: '{rounded.lg}'
    height: '20px'
    padding: '0 4px'
  call-number-open:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
  readout:
    backgroundColor: '{colors.muted}'
    rounded: '{rounded.lg}'
    height: '40px'
    padding: '8px 12px'
  on-air-dot:
    backgroundColor: '{colors.signal}'
    rounded: '{rounded.full}'
    size: '8px'
  on-air-dot-ended:
    backgroundColor: '{colors.foreground}'
  panel:
    backgroundColor: '{colors.card}'
    rounded: '{rounded.xl}'
    padding: '16px'
  menu:
    backgroundColor: '{colors.popover}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.xl}'
  rail:
    backgroundColor: '{colors.background}'
    width: '56px'
  rail-item-current:
    backgroundColor: '{colors.muted}'
    rounded: '{rounded.lg}'
    size: '40px'
  top-bar:
    backgroundColor: '{colors.background}'
    height: '48px'
    padding: '0 24px'
  inspector:
    backgroundColor: '{colors.card}'
    width: '360px'
    padding: '16px'
---

# Design

Crossfeed's design system as it ships: the idea behind the look, the tokens, the shells, the components and the recipes they share, the patterns each screen is built from, the rules the Content-Security-Policy sets for UI work, and how a change is checked. [PRODUCT.md](/docs/PRODUCT.md) owns what the product does; this file owns how it looks and behaves. The code it describes is in `apps/src/`: `style.css` holds the tokens, `components/ui/` the components, and `client/` the island's screens.

Contents:

1.  [The idea](#the-idea)
    1.  [The re-rank](#the-re-rank)
    1.  [The on-air readout](#the-on-air-readout)
    1.  [House rules](#house-rules)
1.  [Tokens](#tokens)
    1.  [Colour](#colour)
    1.  [Type](#type)
    1.  [Shape and space](#shape-and-space)
    1.  [Elevation](#elevation)
    1.  [Motion](#motion)
    1.  [Breakpoints](#breakpoints)
1.  [Shells](#shells)
    1.  [App shell](#app-shell)
    1.  [Marketing shell](#marketing-shell)
    1.  [Menus and the skip link](#menus-and-the-skip-link)
1.  [Components and recipes](#components-and-recipes)
    1.  [Where things live](#where-things-live)
    1.  [Recipes in variants.ts](#recipes-in-variantsts)
    1.  [The shadcn components](#the-shadcn-components)
    1.  [Shared client modules](#shared-client-modules)
1.  [Patterns](#patterns)
    1.  [Page header and empty state](#page-header-and-empty-state)
    1.  [Sections and tabs](#sections-and-tabs)
    1.  [Canvas and inspector](#canvas-and-inspector)
    1.  [Launch page](#launch-page)
    1.  [Inbox page](#inbox-page)
    1.  [Question card](#question-card)
    1.  [Fit chart](#fit-chart)
    1.  [The plan](#the-plan)
    1.  [Ranked lists](#ranked-lists)
    1.  [Launches dashboard](#launches-dashboard)
    1.  [Settings and account](#settings-and-account)
    1.  [Forms](#forms)
    1.  [Confirmations](#confirmations)
    1.  [States](#states)
    1.  [Connection states](#connection-states)
    1.  [Source labels and call numbers](#source-labels-and-call-numbers)
    1.  [Figures](#figures)
    1.  [Phones](#phones)
    1.  [Accessibility](#accessibility)
    1.  [Marketing and reading pages](#marketing-and-reading-pages)
1.  [CSP rules for UI work](#csp-rules-for-ui-work)
1.  [How to verify](#how-to-verify)
1.  [See also](#see-also)

## The idea

Crossfeed's output is a ranked list: a network's own shows, ranked by who listens instead of by topic. So on each screen the biggest block answers the screen's one question, and on the screens about a launch that answer is the roster ranked by listener overlap. The agent, its questions and the plan serve that ranking. The data is the design, after mkdir.directory's ranked index, where the names are set larger than the headline.

### The re-rank

The signature is the re-rank: one list switching between "By topic", what a topic-only plan picks (Claude ranks it from names and descriptions, with no Qloo data), and "By who listens", Qloo's listener overlap, with the rows travelling to their new places and the climbers marked ▲ in the Move column. It's the landing page's one live thing, a made-up roster labelled an illustration, and the fit chart's lens in the app, on the real ranking.

### The on-air readout

Every run (a launch run or a pitch run) has an on-air readout, read like a studio's on-air light: a strip on the tone step with a dot, the run's word (Running, Waiting on you, Completed, Stopped at a limit, Failed), the current step ("Scoring 15 shows against The Watch · step 2"), and while it runs the time since it started. The dot is signal orange and breathes while the run is running or waiting on a person, ink once it has ended, an empty ring before the first run; a failure shows the square ✕ and its word instead. It speaks only while it has something to say: a launch's readout gives way once its run has completed, unless the run was replayed, a call is still slow, or the connection drops, and the inbox's at rest; "Details" in the header still opens the run's log.

The identity carries past the launch page: the dashboard's rows carry the on-air dot and a finalist meter, and the roster and the inbox's ranked lists use the fit chart's row anatomy.

### House rules

- No gradients, glows, glass, backdrop blur, emoji, decorative icons, icons in tinted squares, eyebrows, tiny uppercase letter-spaced labels, KPI tiles or rows of identical icon cards. Only what floats (menus, popovers, selects, dialogs, sheets) casts a shadow.
- Mono only for real code and codes: code blocks, API keys and their prefixes, call numbers (`C-21`), insertion order IDs (`IO-0001`), entity IDs, recovery codes. Ranks, scores, money and counts are in the text face, with `tabular-nums` only on bare integers that align in a column (ranks, counts, slots). The face's tabular comma and full stop are a digit wide, so money, downloads and percentiles stay proportional, right-aligned in a column.
- One sanctioned exception, on the landing page alone: the ASCII field behind it, mono glyphs on a canvas, is the one exception to the mono rule and to the landing page's type-led direction with no imagery. It's a picture of the subject, sound ripples crossing, drawn on a canvas: not text, not ornament, and never in the DOM. Nothing else is set in mono for its look, and no other page gets a field.
- Rank numbers are data, so ranked lists show them; nothing else is numbered ("Step 2 of 5" only beside a real `<ol>`).
- 1px rules only inside real tables, forms and their control outlines, and the landing page's interface fragments (`data-ui`). Elsewhere blocks are separated by space or a tone step.
- Sentence case everywhere, one h1 a page, headlines at most two lines.
- Running text is in full ink: 16px on marketing and docs pages, 14px in the app, nothing under 12px.
- Icons only where they carry function: chevrons, close, copy, upload, check, a state's glyph, and one 18px icon for each rail destination.

## Tokens

The tokens are shadcn's CSS variables in `apps/src/style.css`, light in `:root` and dark in `@media (prefers-color-scheme: dark)`, mapped to Tailwind colours in `@theme inline`. The app follows the system's light or dark setting; there's no `.dark` class and no toggle. `@custom-variant dark` makes Tailwind's `dark:` follow the same media query, though no component needs it, since the tokens carry dark mode. Every shell sends `<meta name="color-scheme" content="light dark">`.

### Colour

Signal orange means "what the agent puts forward, and that it's live": finalist marks and meters, the plan's lines, climbers' moves, the on-air dot while a run is live. It's never on chrome, never a whole button in the app, and never success or approval, which is an ink check and the word. The landing page's closing band is the one colour field.

| Role                                                | Variable                                     | Light                 | Dark                  |
| --------------------------------------------------- | -------------------------------------------- | --------------------- | --------------------- |
| Page ground                                         | `--background`                               | `#f8f8fa`             | `#0e0f12`             |
| Raised surface: panels, inspector, question card    | `--card`, `--popover`                        | `#ffffff`             | `#16171c`             |
| Tone step: hover, group headers, code, readout      | `--muted`, `--accent`                        | `#efeff3`             | `#1d1f25`             |
| Ink                                                 | `--foreground` and the `*-foreground`s       | `#121318`             | `#ececf1`             |
| Secondary text                                      | `--muted-foreground`                         | `#5f626d`             | `#9a9daa`             |
| Rules in tables                                     | `--border`                                   | `#e3e4ea`             | `#26282f`             |
| Control outlines: inputs, checkboxes, radios, chips | `--input`                                    | `#868995`             | `#6c6f7c`             |
| Primary action                                      | `--primary` / `--primary-foreground`         | `#121318` / `#ffffff` | `#ececf1` / `#0e0f12` |
| Secondary action                                    | `--secondary` / `--secondary-foreground`     | `#e8e9ee` / `#121318` | `#24262d` / `#ececf1` |
| Signal: marks, meters, the live dot                 | `--signal` / `--signal-foreground`           | `#e4630c` / `#121318` | `#ff8a3d` / `#0e0f12` |
| Signal as text: a climber's ▲                       | `--signal-ink`                               | `#a24a00`             | `#ffa266`             |
| Signal tint: a finalist row's wash                  | `--signal-tint`                              | `#fdeee2`             | `#2a1a0e`             |
| Destructive: crimson                                | `--destructive` / `--destructive-foreground` | `#c8153e` / `#ffffff` | `#ff5c7a` / `#0e0f12` |
| The landing page's ASCII field: its densest glyph   | `--ascii`                                    | `#dfdfe1`             | `#343538`             |
| Focus ring                                          | `--ring`                                     | `#121318`             | `#ececf1`             |

`--accent` is shadcn's hover wash, the same value as `--muted`, not the signal. Text pairs hold 4.5:1 and large text and control outlines 3:1; `--input` holds 3:1 on the tone step too. `--ascii` is ink over the ground, as dark as it can be while `--muted-foreground` holds 4.5:1 against it (4.57:1 light, 4.54:1 dark), so every word on the landing page keeps 4.5:1 wherever it sits over the field. A failure never relies on colour: it leads with its word, and its glyph is a square ✕ where the live dot is a circle. The landing page's closing band (`data-band='signal'`) is signal orange with the light scheme's ink, secondary and ring in both schemes.

### Type

One family, Schibsted Grotesk (variable, OFL), self-hosted through `@fontsource-variable/schibsted-grotesk`, so it's served from the app's own origin. A size-adjusted Arial fallback (`Schibsted Grotesk Fallback`) keeps text from re-wrapping as the face swaps in, and marketing pages preload its Latin file, so the poster type is set in it from the first paint. Mono is the platform stack: `ui-monospace, SFMono-Regular, Menlo, monospace`.

The scale is a set of `type-*` utilities in `style.css` rather than `text-*` theme keys, which class merging would read as colours. Caption, ui and body take their weight from the element.

| Utility        | Size                                      | Leading | Tracking | Weight | Use                                                               |
| -------------- | ----------------------------------------- | ------- | -------- | ------ | ----------------------------------------------------------------- |
| `type-caption` | 12px                                      | 1.45    | 0        | any    | table meta lines, field help, timestamps, chips                   |
| `type-ui`      | 14px                                      | 1.45    | 0        | any    | app text, controls, table cells, nav                              |
| `type-body`    | 16px                                      | 1.55    | 0        | any    | marketing and docs text                                           |
| `type-title`   | 24px                                      | 1.2     | -0.01em  | 600    | the question's legend, fit chart ranks, docs h2                   |
| `type-display` | clamp(36px, 2rem + 2vw, 56px)             | 1.04    | -0.025em | 600    | marketing headings, auth and docs h1                              |
| `type-poster`  | clamp(96px, 12.5vw, 200px); 17vw on phone | 0.86    | -0.05em  | 600    | the landing h1 only                                               |
| `type-index`   | clamp(28px, 1rem + 3.6vw, 72px)           | 1.0     | -0.03em  | 500    | the landing re-rank's show names and the marketing footer's index |

The app's body is `type-ui`; a show's name in a ranked list is 15px at 600 (`text-[15px] leading-snug font-semibold`); a page's h1 in the app is `type-title`.

A heading or sentence that holds a name someone typed, such as a network's (up to 64 characters, no space required), breaks a word too long for its line, so no page scrolls sideways; a name with spaces wraps between its words as any text does. Where the box's width is set by what holds it, `break-words` is enough. Where the box sizes to its content, so an unbroken word would widen it, use `wrap-anywhere`. Put the wrap on the shared component the name passes through, not on one global rule, so tables that scroll sideways keep their names whole. A one-line control cuts the name short with an ellipsis instead, as the network switcher does, and keeps the whole name as its accessible name.

### Shape and space

- Radius: `--radius` is 6px. `rounded-lg` (6px) is for controls: buttons, inputs, chips, segmented controls. `rounded-xl` (8px) is for panels, menus, popovers, dialogs and sheets. `rounded-sm` and `rounded-md` (4px) are for items inside a menu and inline code. Only the live dot and avatars are `rounded-full`. Edit a component's recipe rather than overriding a radius per use.
- Space: a 4px base. In the app, 24px gutters from 1024px and 16px below, and blocks 24px apart; the run pages' canvas has no cap, so its tables take the width beside the rail (see [Canvas and inspector](#canvas-and-inspector)). Marketing pages: 24px margins on phones, 40px from 768px, content up to 1376px (`marketingFrame`).
- Panels are `--card` on `--background`, or the tone step on the card, with no border and no shadow.

### Elevation

Nothing at rest casts a shadow: Tailwind's `shadow-xs` and `shadow-sm` are zeroed, and `shadow-md` up to `shadow-2xl` are all the one floating shadow, `shadow-float`. What floats gets it:

| Token            | Light                                                               | Dark                                                                   |
| ---------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `--float-shadow` | `0 0 0 1px rgb(18 19 24 / 0.06), 0 8px 24px -8px rgb(0 0 0 / 0.16)` | `0 0 0 1px rgb(255 255 255 / 0.1), 0 16px 40px -8px rgb(0 0 0 / 0.72)` |
| `--scrim`        | `rgb(18 19 24 / 0.4)`                                               | `rgb(0 0 0 / 0.6)`                                                     |

A modal dialog, alert dialog or modal sheet has the scrim under it, and while it's open the rest of the page is inert (`components/ui/modal-layer.ts`). The inspector's sheet is non-modal and has none.

### Motion

The app moves only as feedback: a press, a hover, a menu or sheet opening, a row arriving. Marketing pages add a masked headline and section entrances. With `prefers-reduced-motion: reduce`, every animation and transition ends at once on its final state, and every piece of content is visible without JavaScript.

| Token or motion   | Value                                                                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--ease-swap`     | `cubic-bezier(0.2, 0, 0, 1)`, the default, at 150ms                                                                                                         |
| `--ease-lift`     | `cubic-bezier(0.23, 1, 0.32, 1)`: entrances                                                                                                                 |
| `--ease-plate`    | `cubic-bezier(0.215, 0.61, 0.355, 1)`: the re-rank                                                                                                          |
| The re-rank       | 450ms on `--ease-plate`, staggered 20ms by new place: a FLIP on the fit chart's rows, CSS `translate` on the landing page                                   |
| The live dot      | opacity 1 to 0.35 and back over 1.6s (`animate-live`), never its size                                                                                       |
| Masked headline   | each line rises from behind its baseline over 900ms on `--ease-lift` (`animate-line-up`); what follows rises in over 500ms, 480ms after (`animate-rise-in`) |
| Section entrances | `client/reveal.ts` holds a part 32px down until it's in view, then it rises over 700 to 900ms, a second part 80ms behind                                    |
| The ASCII field   | ripples at 15 to 26px a second, 40 from the pointer, at most 24fps; slows 2.5s after the last move or scroll; still when hidden or with reduced motion      |
| Menus and dialogs | fade and scale from 0.95 to 0.98, 100 to 200ms                                                                                                              |

A running step shows a small spinner, never shimmering text, and a skeleton is a still block with no pulse.

### Breakpoints

- Under 768px (`max-md`): the phone layout. The rail is a bottom bar, controls are 44px tall, wide tables scroll inside themselves.
- 1024px (`lg`): 24px gutters; two-column auth and new-network layouts; the docs' nav beside the article.
- 1360px (`85rem`): the inspector, open, sits beside the canvas instead of in a sheet.
- 1440px (`90rem`): the docs' "On this page" column.

## Shells

`apps/src/shell.tsx` renders every shell on the server with Hono JSX: the app shell, the marketing shell, and the auth pages' shell. The React island renders into `#root`, chosen by its `data-page` (`pageModules` in `shell.tsx`, in step with `client/main.tsx`).

### App shell

Every `/app` page: a 56px icon rail beside a column of a 48px top bar over the page.

- **Rail:** on the page ground with nothing dividing it, sticky full height. The mark at the top links `/app`, then Launches (the dashboard), Roster, Inbox (while `GUEST_PITCHES` is on), and Settings at the rail's foot. Each is an 18px outline icon on a 40px square, its name a tooltip from 768px and its accessible name; the current one sits on a tone-step square with `aria-current="page"` (`"true"` for a launch page under Launches).
- **Top bar:** the network switcher (a native `<details>` showing the network's name after a visually hidden "Network: "; its menu lists `Your networks`, the current one checked, then "New network"), and at the right the account menu (the member's initials and name after a visually hidden "Account: "; its menu: "Signed in as", "Your account", "Sign out").
- **A guest's account menu:** for a guest ([ADR 0008](/docs/adr/0008-guests-share-one-guest-member-again.md)) the account menu says, under "Signed in as Guest" and in the same muted caption, that it's the one account every guest shares, that guests' networks are cleared every day at 12:00 UTC, so put nothing private in them, and that all guests share one set of daily limits; its Sign out reads "Sign out and create an account" and opens the sign-in page all the same. Its panel is 288px wide, so the lines keep a measure. There's no notice under the top bar. A guest's account page has one module, "Shared guest account", saying what no guest can change and why, with "Sign out and create an account" its primary; the invite page tells a guest to sign out and create an account to join, with the same button; and the members module offers nothing on the guest member's own row, and says why.
- **Pages outside a network** (`/app/new`, `/app/account`) have the mark alone in the rail and "Your networks" in the switcher.
- **Phones:** one nav at every width. Under 768px the same `<nav>` restyles as a bottom bar, each icon over its name, so there's one nav landmark and one current item, and the mark moves to the top bar.

### Marketing shell

The landing page, privacy, terms, the docs and the 404 page (`MarketingPage`). No bar: the mark and the wordmark "Crossfeed" top left, and top right one `<nav aria-label="Site">`: "Developers" (current on docs pages), and while `ACCOUNTS` is on "Sign in" and "Create your network" (secondary, so the page's own primary stays the only one). Under 768px the links fold into a `<details>` "Menu"; from 768px its summary hides and the same links sit in a row (`::details-content` in `style.css`), so it's one nav at every width. The footer is a screen at least (`min-h-svh`) on the tone step, filled with its content, never with blank space. One `<nav aria-label="Footer">` holds an index of where to go next, set as the re-rank sets its show names: each name at `type-index`, with a line in muted body text on what's there, beside it from the eighth of twelve columns from 1024px and under it below. While `ACCOUNTS` is on the rows are "Sign in as a guest" (a guest button, its row's line saying it goes to the sample, in the network every guest shares, cleared daily), "Create your network", "Sign in" and "Developers"; while it's off, what exists: "Developers", then a row for each page of the docs, "REST API", "TypeScript SDK", "MCP server" and "Skills and plugin", so the index still fills the screen. Each row is its link or button (whose `::after` covers the row), and hover and `aria-current` (Developers on docs pages, or with `ACCOUNTS` off each docs page's own row) take the 2px underline. Under the index, Privacy and Beta terms at body size, with "Made for the Qloo Agentic Hackathon." at the row's right from 768px, then the name across the full content width along the foot. The index sits in the middle of the height the screen leaves, so a taller window adds room around it rather than a gap in one place.

**Guest buttons:** every way to the sample on a marketing page, the hero's and the closing band's "Open the sample network", the 404 page's "Sample network", and the footer's "Sign in as a guest", is a `<button type="submit" form="guest-sign-in">` naming the one hidden, empty `<form method="post" action="/auth/guest">` the page carries while `ACCOUNTS` is on ([ADR 0007](/docs/adr/0007-the-sample-network-is-the-guest-networks-data.md)). So each sits where a link would, with the same classes and `cursor-pointer`, reads as what it is, an action, and signs in as a guest and opens the guest network with no script. With `ACCOUNTS` off there's none, and no closing band. The sign-in page's guest panel (`#guest`) is where `/demo` and a refused guest button land, its refusal under its button.

Sign-in and invite use the marketing shell's top-left mark with no links; the invite page shows the account menu when the visitor is signed in. Each page's title and what it's for stand at display size on the left, and from 1024px its ways in stack on the right, each a `Section` in its own panel on the card: a heading, one sentence, then its form or button. On the sign-in page they're "Sign in" (or "Sign in with a recovery code" in its place), "New here? Create an account" and "Look around as a guest"; on the invite page, "Create an account" and "Sign in", each joining in the same step, or for a signed-in visitor one "Join <network>", its sentence who they're signed in as. The guest's sentence says what it's for; its terms, the one account every guest shares, its network cleared every day at 12:00 UTC so nothing private goes in it, and the one set of daily limits all guests share, stand in a muted caption between that sentence and "Sign in as a guest", which they describe (`aria-describedby`), so they're read before anyone signs in as a guest. The 404 page is the marketing shell around "Not on the roster.", for `GET` requests that accept HTML outside `/api`, `/agents`, `/mcp`, `/auth` and `.csv` downloads; everything else keeps the plain `404 Not Found`.

### Menus and the skip link

The shells' menus are native `<details data-menu>`, styled like shadcn's dropdown menu, so they open without JavaScript. `client/menus.ts` keeps one open at a time (a menu inside another leaves the outer one open), and closes them on a click outside or Escape, returning focus to the summary. The island loads it through `main.tsx`; marketing pages load it as their own module script.

"Skip to content" is first in every shell: off the screen until focused, it targets `#content`, an empty element at the head of the page that takes focus.

## Components and recipes

### Where things live

| Path                                   | What                                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `apps/src/style.css`                   | Tailwind v4's entry: the tokens, the type scale, the focus ring, the reading pages' prose, the re-rank's CSS |
| `apps/src/components/ui/variants.ts`   | the class recipes the island and the server pages share, with no React in it                                 |
| `apps/src/components/ui/*.tsx`         | the shadcn components (Base UI primitives), forked onto the tokens                                           |
| `apps/src/client/`                     | the island: one module per page, and the shared modules below                                                |
| `apps/src/shell.tsx`                   | the server-rendered shells                                                                                   |
| `apps/src/mark.tsx`, `client/Mark.tsx` | the mark, twice: Hono JSX can't render the island's React, so each has its own; keep them alike              |
| `apps/src/icons.tsx`                   | the lucide icons the server pages use, as Hono JSX                                                           |
| `apps/components.json`                 | shadcn's config: `base-nova`, aliases under `@/`, utils pointing at the `cn` package                         |

### Recipes in variants.ts

Hono JSX can't render React components, so a server page sets a recipe's classes on its own elements; importing `variants.ts` keeps the island's React out of the Worker's routes. The shadcn components import their variants from it too, so the two can't drift. Each recipe returns merged classes (the `cn` package, a drop-in for clsx and tailwind-merge).

| Recipe                                            | What it draws                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `buttonVariants`                                  | flat, one fill, 6px. Variants: `default` (ink), `secondary` (tone), `ghost`, `link`, `destructive` (crimson outline), `destructive-solid` (only inside its confirm). Sizes: `default` 32px, `sm` 28px for row actions, `lg` 44px for marketing pages, `icon`, `icon-sm`, `icon-lg`. There's no `outline` variant: where shadcn asks for one, use `secondary` or `ghost`                                                                                                                                                                                                      |
| `inputVariants`                                   | a text field: on the card, outlined at `--input`, 32px, 16px text on phones so iOS doesn't zoom, crimson once `aria-invalid`                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `linkVariants`                                    | a link in a line of text: underlined at 1px, 2px on hover. Default `tone: 'ink'` (500, ink) stands out of a muted caption; `tone: 'text'` keeps the line's colour and weight, as on the reading pages. The button's `link` variant wears it                                                                                                                                                                                                                                                                                                                                  |
| `badgeVariants`                                   | 20px chips: `default` (tone), `outline` (3:1), `destructive`; `mark` adds a CSS glyph: `square` (Qloo data), `circle` (Agent), `signal` (finalist, live). No one height centres both capitals and the x-height, so `--badge-lift` (0.6px) sets the words between the two, on a whole device pixel so it rounds alike in every chip: a baseline 14px from the chip's top on a 1x screen and, in Chrome, 13.5px on a 2x one, with the marks and icons on the chip's middle. The docs' mono method chips trim their line to their capitals (`text-box`) and centre that instead |
| `segmentedTrackVariants`, `segmentedItemVariants` | a segmented control: options on a tone-step track, the chosen one raised onto the card with the 3:1 outline. It marks its choice built as Base UI tabs (`data-active`), Base UI radios (`data-checked`) or a server page's label around a native radio (`has-checked`)                                                                                                                                                                                                                                                                                                       |
| `callVariants`                                    | a call number such as `C-21`: mono, dotted underline, ink fill while its evidence is open (`aria-pressed`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `marketingFrame`                                  | the marketing pages' measure, which the sign-in and invite pages share so they line up with the wordmark                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

**The phone target is in the recipes.** Under 768px every button size, the input, the input group and the select trigger are 44px tall, and a segmented track is 44px with 40px items. A `link` button keeps its line's height and reaches 44px with padding it gives back as negative margin. Don't add `max-md:h-11` per use; change the recipe.

### The shadcn components

`components/ui/` holds shadcn's base-nova components on Base UI, each forked onto the tokens and trimmed to what the app uses: alert-dialog, badge, button, checkbox, dialog, dropdown-menu, field, input, input-group, label, radio-group (plus `RadioGroupSegment`, a radio that's a segmented item), select, sheet, skeleton, spinner, tabs, textarea. Each file's header says what was changed. Don't re-add one with `shadcn add <name> --overwrite`: edit the fork, or its recipe in `variants.ts`. Read [the shadcn rules](https://ui.shadcn.com/docs) for a component before adding one, add only what a surface needs, and set a floating one's radius to 8px when you do.

Forks worth knowing:

- Floating components (dialog, alert-dialog, sheet, select, dropdown-menu) are 8px, on `shadow-float`, with no ring; modal ones have the scrim and make the page inert.
- Field is trimmed to `FieldSet`, `FieldLegend`, `FieldGroup`, `Field`, `FieldContent`, `FieldLabel` and `FieldDescription`; errors stay the app's own `Alert`.
- Input sets no `type` unless given one (the agent tests count the question card's text boxes so) and turns autofill off unless a field asks.
- Tabs are the segmented control, with no indicator. Skeleton doesn't pulse. Spinner is hidden from screen readers, as every state leads with its word.

### Shared client modules

| Module                                | What it holds                                                                                                                                                                                                                                                                                                         |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client/controls.tsx`                 | `send` and `Refused` for the Worker's routes, `useAction`, `useLeaveGuard`, `Alert`, `SignOut`, `FitBand`, `NotScored`, `PickOne` and `twinIds`, `KeyValues`, `Code`, `ScrollTable`, `ShownOnce`, `DropCue` and `useFileDrop`, and each metric's format ([Figures](#figures))                                         |
| `client/states.tsx`                   | `StateLine` and its words, `SlowCalls`, `isLive` and `endedBadly` (a run's status), a pitch's state word and `pitchTally`, and the connection's state                                                                                                                                                                 |
| `client/PageHeader.tsx`               | `PageHeader`, `PageEmpty`, `FormDialog` and `useFormDialog`, and `summaryLine`, `listCounts` and `count`: the header, the empty state and the form dialog the Launches dashboard, the roster and the inbox share; `Section` and `PageTabs`, the section every page's blocks are and the tabs a long page puts them in |
| `client/Frame.tsx`                    | the run pages' frame: `canvas`, `frame`, `useInspector`, `Inspector`, `InspectorToggle`, `Readout`, `RunState`, `OnAir`, `Connecting` (with a title, the page header saying it, as on the inbox)                                                                                                                      |
| `client/Run.tsx`                      | a run's status words, `RunLog`, `RunList` and `OpenQuestion`, the question card                                                                                                                                                                                                                                       |
| `client/FitChart.tsx`                 | the fit chart                                                                                                                                                                                                                                                                                                         |
| `client/InsertionOrder.tsx`           | the plan                                                                                                                                                                                                                                                                                                              |
| `client/RosterModules.tsx`            | the roster's import, counts, table, show editor, roster check and CPM                                                                                                                                                                                                                                                 |
| `client/Evidence.tsx`                 | `CallButton`, `EvidencePanel`, `namesOf` and `useEvidence`                                                                                                                                                                                                                                                            |
| `client/Confirm.tsx`                  | `useConfirm`, the one confirm for a destructive action                                                                                                                                                                                                                                                                |
| `client/Source.tsx`                   | the "Qloo data" and "Agent" chips                                                                                                                                                                                                                                                                                     |
| `client/settings/Module.tsx`          | `Module`, a `Section` over its panel, and the column settings and the account page stack modules in                                                                                                                                                                                                                   |
| `client/menus.ts`, `client/reveal.ts` | the shells' menus, and the landing page's section entrances                                                                                                                                                                                                                                                           |
| `client/ascii.ts`                     | the landing page's ASCII field                                                                                                                                                                                                                                                                                        |

## Patterns

### Page header and empty state

`PageHeader` (`client/PageHeader.tsx`) is the header the network's pages share: the Launches dashboard, the roster and the inbox. A launch's page keeps its own title row, with its Qloo match and its run's actions.

- **Anatomy:** the title, the page's one h1 at `type-title`, with the page's actions at its right on the title's line. While the page's data is the sample data's, one "sample" badge (`badge`) stands 8px after the title, in the h1: the page's one sample label ([Source labels and call numbers](#source-labels-and-call-numbers)). Like the summary, it goes while the page is empty. That line is as tall as a control, 32px and 44px on a phone, so an action arriving with the agent's state moves nothing. Under it, 6px down, one summary line in muted 14px text, then the connection's state in a live region that's always there: "Working Connecting to the network…", "Reconnecting…", or the lost connection's error. It's the one place each of the three pages says it, the inbox beside its readout included.
- **The summary:** what the page holds, counted in one form (`summaryLine`): the total, " · ", then the counts that aren't 0, separated by commas, in the page's own words: "7 launches · 4 need you, 1 running", "19 shows · 16 resolved, 1 ambiguous, 2 missed", "40 pitches for The Big Picture · 31 matched, 1 ambiguous, 4 not in Qloo, 4 set aside". While an earlier pitch run is viewed, it says that instead, in the same muted form: "Run 1 · earlier, read-only". The header holds the counts, and the inbox's readout only its state and progress ("Reading · 3 of 40 pitches read"), so a pitch still being read or looked up is counted by the readout, not the summary. At rest, read and with no pitch run, the inbox has no readout.
- **Actions:** the page's primary action: "New launch", "Import shows", or the inbox's "Load pitches", which is secondary because ranking the pitches is the inbox's primary once it has some. While an earlier run is viewed, "Back to the latest run". Whatever else acts on the page as a whole goes beside them: on the roster and the inbox, the inspector's "Details" toggle leads them.
- **What stays out:** explanations, secondary facts, notices and the CPM. Each sits with what it's about. What the roster still needs settled is in its rows' match chips and the summary's counts, with no line of its own. The inbox's privacy promise, that only a work's title and type are looked up in Qloo, is the sentence of its Pitches section, and sits in its load form and its empty state. The CPM is on the dashboard and in settings.
- **Phones:** the same, the actions on the title's line and the summary wrapping under it.

`PageEmpty`, in the same module, is what each of those pages shows in place of its body while it has nothing yet. It's one short line in the `empty` state's muted words ("No launches yet.", "No shows yet.", "No pitches yet."), and under it the page's one primary action. The inbox's adds its privacy promise under the line, in muted caption text, since what reaches Qloo is what a booker asks before loading pitches. The header then has no summary and no action (`PageHeader`'s `empty`), so nothing is said twice; there's no box around it, and no readout beside it. A form the action needs, New launch's, the roster's import or the inbox's load, opens in the page's `FormDialog`, the same from the header and from the empty state, whose action `useFormDialog` labels once. It's the centred dialog: the action's name as its title, one sentence of what the form takes, the form's fields, each limit or format under what it's about as a `FieldDescription` tied with `aria-describedby`, an upload as a secondary button under the text field it fills, then a footer with Cancel and the primary submit. The submit sits outside the form and sends it with `form=`, and while it's busy its label says what the form or the page is doing ("Creating…", "Looked up 3 of 19…", "Reading the inbox…"). Accepted, the dialog closes and the page shows what follows: the new launch's page, the roster's rows as each show is looked up, the inbox's readout as the pitches are read. A refusal stays in it, under the fields, and the inbox's wipe confirmation asks over it. It's kept mounted while closed, so a file dropped anywhere on the roster or the inbox opens it and reaches its form. Closing it returns focus to what opened it while that's still there, or else to the page's action as it is then, the header's once the first import or load has filled the page.

### Sections and tabs

A section of a page is a heading, one sentence, then its content. Build it as `Section` (`client/PageHeader.tsx`), which renders `<section aria-labelledby>` and draws no panel:

- **Its props:** `id`, the heading's id, which names the section; `title`; `description`, one sentence, which only an h3 whose section's sentence already says what it holds leaves out, as the plan's insertion order does; `level`, `2` (the default) or `3` for a section inside another; `badge`, its chips (Beta, a status), which follow the title's last word in the heading; `actions`, at the right of the heading's line; `heading`, a ref to the heading, which then takes focus (`tabIndex={-1}`) once what had it is gone, as a removed row's button; `children`, the content; and any `data-*` attribute, which reaches the `<section>` (`data-io`, `data-run-log` and `data-roster` are what tests find sections by).
- **Its anatomy:** the h2 at 16px semibold (`type-body`), the h3 at the body's 14px semibold. The heading flows as text: its chips stand 8px after the title's last word, so a long title, such as a show's name or a pitch's subject, wraps at the column's width and the chips follow its last line rather than squeezing it, and chips that don't fit there start the next line at the title's left edge. The description sits 4px under it in muted text, on a 72ch measure. It says what the section is for or what it holds, never how to use the page ("this page shows…", "select a row to…"); where a live state is what the section most needs to say, such as Setup's count ("3 of 5 done"), that state is the sentence. Actions sit on the heading's line as the page header's do, on a phone too, and the content is 16px under the description, its children 16px apart.
- **What a description doesn't hold:** a limit or a format is a `FieldDescription` beside its field, tied with `aria-describedby`, as what deleting a network wipes is under the field that confirms it; a consequence is in the confirm that asks for it; a promise in [PRODUCT.md](/docs/PRODUCT.md) stays on the page; a sentence that repeats what the content shows goes.
- **Where it sits:** on a card on the dashboard (Network, Setup), in a panel on the card for each way in on the sign-in and invite pages, over the tone-step panel in settings (`Module`), or straight on the canvas. A page whose body is one table, the Launches dashboard or the roster, has no `Section` around it: the page header is its heading.

A long page puts its sections in tabs with `PageTabs` (same module), on the segmented track the inspector's tabs use. Settings, a launch after its first run and the inbox have them; every other page is one column of sections.

- **Its props:** `label`, the tab list's accessible name, which names the page ("Settings sections"), and `tabs`, each `{ id, title, content }`: `id` is the tab's hash (`members` for `#members`), `title` its words, and `content` its sections, which stand 48px apart in the panel.
- **Kept mounted:** every panel is in the page whichever tab shows, Base UI hiding and inerting the rest, so a draft, a lens or an edit in one survives a switch to another, and a page rendered on the server (as the tests render it) holds every panel's words.
- **The hash:** a hash that names a tab, as the page opens or as it changes (a link to `#plan` on the same page), opens that tab and scrolls the tab list into view, clear of the sticky top bar, only when it's out of view. When the hash is also the id of an element in that tab's panel, as `#plan` is the plan's, it scrolls to that element instead once the panel shows, the jump the browser couldn't make while the panel was hidden. Choosing a tab writes its hash with `history.replaceState`, so tabs add no history entries. A hash that names no tab is left alone and doesn't move the tabs, so the inspector's `#evidence` and the sign-in page's `#guest` keep working. The first tab shows when no hash names one, and when the chosen tab goes away, as one that needs data not there yet; it comes back with the tab. A link into a tabbed page carries its tab's hash, as every link into settings does.
- **Keys:** Base UI's manual activation: arrow keys move focus along the tabs, and Enter or Space opens one.
- **Phones:** wider than the page, the list scrolls sideways inside the page's margin, as a wide table does, the open tab scrolled into view; the page never scrolls sideways. It's a class on `PageTabs`'s list, not a change to the segmented recipe.

### Canvas and inspector

The launch workspace (`App.tsx`, on each launch page), the inbox (`Inbox.tsx`) and the network's roster page share one frame: a canvas beside an inspector.

- **By default:** every page opens with the inspector closed, at every width, so the canvas takes the width. Whether it's open isn't kept past the page.
- **The canvas's width:** no cap. Its header and content together take the width beside the rail, and beside the inspector while it's open, so the header's actions stay over the content's right edge, and its tables and the fit chart's rows run the canvas's width.
- **How it opens:** on the tab for what was picked: a call number on Evidence, a roster row on Show, a pitch on Pitch, and, once there's a run, "Run log" in the readout on Run. "Details", a ghost toggle in the page's header (`InspectorToggle`, with `aria-expanded` and `aria-controls="inspector"`), opens it on the tab it last showed, or the first, and closes it again. It's the first of the header's actions on the roster and the inbox, and of the title row's on a launch's page, where on a phone the primary still leads on a line of its own. A page with nothing in it yet, the empty roster or inbox, has no toggle.
- **How it closes:** its close button, the one close control at every width, as the show or pitch it shows has no Close of its own (selecting another changes it); Escape while focus is in it, never from the canvas, the sheet's included; or the toggle. Focus goes back to the control that opened it, which passes itself, since Safari and Firefox on a Mac don't focus a clicked button, or to the toggle once that's gone, or when the toggle closed it; focus that Tab moved onto what the sheet covers stays there. Closing it keeps the page's selection, the row or pitch selected and the call opened, so it opens on the same again.
- **From 1360px:** open, it's a 360px column on the card, sticky under the top bar for the window's height, with its close button at the end of its tabs. It's at rest, so it casts no shadow. At 1440 that's 56 (rail) + 24 + 976 (canvas) + 24 + 360 = 1440.
- **Under 1360px:** it's a right sheet, non-modal and kept mounted, titled "Details" with its close button by the title; it floats, so it has the floating shadow, and no scrim. The canvas stays usable beside it, and Tab moving focus onto something the sheet covers closes it.
- **Its tabs:** it's a Base UI Tabs panel: Run (the trace, the agent's closing line, the run record, then Runs), Evidence (the open call's request and what Qloo returned), and Pitch in the inbox while one is selected. The roster page's inspector has Show and Evidence. Every panel stays mounted, so `aria-controls="evidence"` on a call number always finds its panel; nothing has `aria-modal`.
- **Its anatomy:** every tab opens with one `Section` about its object, its heading naming the object: "Run log", the show's name, the pitch's subject, "Evidence · C-12". The object's chips sit beside the heading (`badge`), status first, then source. Its sentence says the object's state in words, never what the interface does. Then come its facts as `KeyValues`, their labels in sentence case, a missing value `–` and a real zero `0`, leaving out a fact a form below already edits; then whatever acts on it. A tab's sections stand 32px apart, and inside a section its parts 16px apart, as `Section` sets. An empty tab is one muted sentence with no heading, saying what will appear there and how: Run before a run, Show before a selection, and Evidence before a call. The inbox's Run tab keeps Inbox check under its sentence. Pitch has no empty state, as the tab shows only while a pitch is open.
- **The Evidence record:** a `Section` headed "Evidence · C-12", its chips beside the heading, Qloo data then Replayed or "From the roster", and its sentence what Qloo did, by outcome: "Qloo scored 16 of 16 candidates.", "Qloo’s search returned 3 podcasts.", "The search failed.". Its facts follow: Request, in mono; Status, or "No response"; Called, the local date and time, the latency, "from the cache" and any retries; Run, as Runs numbers it, when the page knows the run; Answer, where it came from, the replay, the sample data or the network's call it copies, that number in plain mono text, not a call button, since it numbers a call in the network's log; and Error, its entity IDs as names. Then "What was sent", one row per parameter in words on the facts' value edge: an entity by the name a record in the session's log gives it (`namesOf`), or by a short mono code with the whole ID in its tooltip, and a list of more than three folded behind its count, "16 podcasts". Then what Qloo returned, each list captioned with its count and with no ID or URN in it: a search's entities by name and popularity percentile, their type in the caption ("Podcasts · 3"), or under each name when the call mixed types; a compare's tags by name, each with its kind under it, the URN's third part as a word ("Genre"), and score; a ranking's affinities by name and affinity, with "Led by" and the anchor under a row whose top share beats the next by `fit.ts`'s `LEAD`, only with two or more anchors, as the fit chart says it; and a demographics call's entities, each its name over its scores two pairs to a row, ages youngest first in `ageWords`, then Male and Female. Rows in one list whose words are the same, such as two "Music" tags of the kind Genre, each show their Qloo ID, as `PickOne`'s candidates do (`twinIds`); a figure doesn't tell them apart, as it measures a row rather than naming it. A call that returned nothing says "Qloo returned no results.". Then "Stored record", closed: the record as kept, with its IDs, URNs and full figures, as JSON in its own scrolling region, with "Copy record". With no call open, the tab is one muted sentence with no heading. Loading, it's the heading over a skeleton in the record's shape; a call that didn't load says why and to select it again; a call the session doesn't have says so.
- **The Show tab:** the show's name, its match chip and Excluded beside it. Its sentence is its state, saying what's next when it needs something: "Matched in Qloo, so a launch can propose it.", "Mapped to a comparable show in Qloo.", "Qloo found more than one show by this name. Pick the match.", "No show by this name in Qloo. Map a comparable show or leave it out.", a failed lookup's reason then "Not scored.", "Looking it up in Qloo.", and once it's left out, whatever its match, "Left out, so it's never proposed.". Its facts: Qloo match, the entity's name and the call that found it, the comp's search once it's mapped, or "None" and the search that found nothing, `–` while it's looked up; Popularity percentile; and About, the show's description clamped to three lines, with a More link button (`aria-expanded`) after it once they cut it short, which shows the whole of it and turns to Less. Then the candidates to pick, the comp search, the figures' form, whose downloads per episode and status aren't facts too, and Leave out or Include again.
- **The Pitch tab:** the pitch's subject, its chip beside it, the heading taking focus as the tab opens. Its sentence is its state, one for each of its chip's: "Claude is reading it for its guest and public work.", "Looking its work up in Qloo.", "Its work matched in Qloo, so a run can rank it.", "Qloo found more than one film with this title. Pick the match.", or for an earlier run's pitch, which can't be confirmed, "Qloo found more than one film with this title, so it wasn't ranked."; "No book with this title by this guest in Qloo, so a run can't rank it."; a failed lookup's or reading's reason, then "Not scored."; "No public work, so it never reaches Qloo."; and an unreadable pitch's reason. Its facts: From, when there's a sender; Guest; Public work; Qloo match, the work's entity and the call that found it, or "None" and the search that found nothing, `–` while it's looked up; and, except in the sample inbox, Read by: the Agent chip once Claude's reading is kept, even if its work's lookup then failed, and `–` until then: while Claude reads it, and when reading failed or the pitch is unreadable. Then the candidates to confirm, unless it's an earlier run's, and the pitch's text.
- **The canvas, in reading order on a launch:** the title row (the launch's name, its Qloo match with its call, the primary action), the on-air readout, the launch form or the question card, then the run's sections, in tabs from the first run on ([Launch page](#launch-page)). In the inbox: the page header, the readout, the question card while a pitch run waits on one, then the inbox's sections, in tabs once there are pitches ([Inbox page](#inbox-page)).

### Launch page

`App.tsx`'s `Workspace`. Under the title row, the readout while it has something to say (never for a completed run alone), and the launch form or the question card, a launch's sections stand in `PageTabs`, "Launch sections", from its first run on. Before it there are no tabs, only the Roster section. While the page shows the sample data, the title carries the page's one "sample" badge after its last word, as the page header's does: on the guest network's sample launch, on a run one of the sample launches was seeded with, and on a roster that still holds sample figures, as another launch of the guest network ranks. Nothing else on the page carries one: the readout, the run log, the evidence, the slot values and the plan's lines don't.

- **Ranking `#ranking`:** the fit chart, then Not scored, a section of its own. Before a run has ranked the roster, the chart's section says it appears once one does, over skeleton rows while a run is ranking.
- **Plan `#plan`:** once there's an insertion order, the plan, with the insertion order as its h3 section. "Review the plan" in the title row links to `#plan`, which opens this tab and scrolls to the plan.
- **Roster `#roster`:** the roster the run ranked, its sentence saying as of when, or, once a teammate has changed it since, that it has changed and a run again ranks it as it is, with "Edit the roster" (the roster page) as its action; then Network CPM, its sentence how a run takes it and what it prices, with an owner's "Change it in settings" (`#network`) as its action, or a member's line that an owner sets it.
- **An earlier run viewed:** the tabs are the ones that run has, so Plan goes with an order it doesn't have, and the first tab shows until it comes back.
- **The inspector's panels:** Run log (its Replayed and status badges beside its heading), Runs and Evidence are `Section`s, as the inbox's are, with one sentence each. The daily limits on model runs stay under the list of runs. Roster check, its Qloo data chip beside its heading, is one too.

### Inbox page

`Inbox.tsx`'s `InboxPage`. Under the page header, the readout and, while a pitch run waits on one, the question card, the inbox's sections stand in `PageTabs`, "Inbox sections", once there are pitches; with none, the empty state stands there instead.

- **Pitches `#pitches`:** the pitch table, under a "Skipped" line when an upload left pitches out. The section's sentence is [PRODUCT.md](/docs/PRODUCT.md)'s privacy promise, that only a work's title and type are looked up in Qloo; the table's caption says where each pitch's guest and work come from, Claude's reading (none for the sample inbox, whose title's badge says they're the sample's), and its match.
- **Rank `#rank`:** "Rank against a show" and its form, the past guests' legend saying only titles and types reach Qloo. Under it, once a run has ranked them, "Pitches for The Big Picture", its Qloo data chip beside its heading, holds one h3 section per type of work, 32px apart, each one's sentence what it was ranked against, or why it wasn't, with its calls; under the lists, a caption says bands are thirds of their own list and how many set-aside pitches never reached Qloo.
- **Replies `#replies`:** once there are replies, the drafts in their verdict groups, its Agent chip beside its heading. Its sentence says what Claude drafted, or, while the run is still drafting, that it is, or, for an earlier run, that its replies are read-only.
- **An earlier run viewed:** it has nothing to rank, so there's no Rank tab, and its lists stand over its pitches in Pitches, whose caption says which run's they are. The first tab shows until Rank comes back.
- **The inspector's panels:** Run log, Ranked against (its Qloo data chip beside its heading), Runs, Inbox check (with a chip while pitches are still read or looked up) and Pitch are `Section`s with one sentence each, as the roster page's Show is. Pitch's heading, the pitch's subject, takes focus as it opens.

### Question card

`OpenQuestion` in `Run.tsx`, shown only while a run waits on its question, before the fit chart in DOM order, as a card on `--card` named "Agent asks". The "Agent" chip and "Waiting on you" sit over the question, which is the fieldset's legend at `type-title`. Its options are full-width rows whose whole width picks them: radio rows for a choice or a launch, a segmented "Promo slots" or "A dollar budget" beside one text field for the budget, a checkbox row per scorable show in fit order for exclusions (each with its band, and "Leaving it out brings X into the finalists" where ticking it changes the finalists, computed with `markFinalists`), three fields for comps, and a radio group per comp to confirm. One primary "Answer".

### Fit chart

`FitChart.tsx`: a `Section` headed "Who shares The Watch's listeners", its sentence the finding, a sentence from the ranking and the topic moves ("5 finalists. The Bill Simmons Podcast climbs 5 places over a topic-only plan, and 6 more shows climb 3 or more.", worded by `topicFinding` in `topic.ts`, which the landing page shares) with the ranking's call.

- **The lens:** a radio group styled as a segmented control, "By who listens" and "By topic", once the topic column is in. Switching re-orders the rows with a FLIP and collapses any open "Why it moved".
- **Rows** are a div grid with table roles (`role="table"`, `row`, `cell`, `columnheader`), so they can travel. Columns: Rank (`type-title`, the lens's rank, both ranks in words for screen readers), Move (▲3 in `--signal-ink` and 600 for a climber, ▼2 or = muted), Show (15px 600; under it the shared tags with their call, "Mapped to", "Led by", the demographics reason; chips Finalist, Left out, Listeners differ), Topic ("#6", headed with the Agent chip; under "By topic" it's the listener rank instead, headed Listeners with the Qloo data chip), Fit (a three-step meter, signal for finalists, its word on hover and for screen readers), Slot value (right-aligned money over its downloads). Finalist rows carry `--signal-tint`.
- **What it shows by default:** the finalists, the topic-only plan's top five, the climbers and any shows left out, with "Show all N" for the rest. A climber's name is a button that opens "Why it moved": "Topic alone ranks it 9." (Agent) and "Listener overlap with The Watch ranks it 4." (Qloo data) with the call, the leading comp and the shared tags.
- **Under it:** the bands and slot value footnotes, the demographics line and a partial ranking's line. Then "Not scored · n", a section of its own whose sentence says what it holds, over a real table its heading names.
- **Loading:** skeleton rows in the chart's shape with "Working: the fit chart appears once the agent ranks the roster."

### The plan

`InsertionOrder.tsx`: "The plan", a `Section` whose sentence, with its Agent chip, says the Agent drafted the slots and angles and how code prices each slot, then on `--card`, as a document, its h3 section "Insertion order IO-0001" with a Draft or Approved badge and no sentence of its own. Each line is the show with the signal mark, its slots and value, and under it the host-read angle with its tags' call and the slot price; then the total and the budget check. While the run is live there are no actions; once it ends, "Approve" (primary) with "Nothing is final until you approve it. Editing returns it to draft." and "Edit lines" (ghost), and once approved, "Export CSV" (an `<a download>` styled secondary). Edit mode turns the cells into fields in place, each in a `Field` with `data-invalid`, with live totals and checks and Save off until every line is valid. An earlier run's order is read-only, still exportable once approved.

### Ranked lists

The roster table (`RosterTable`), the inbox's pitch lists and the launches table use the fit chart's row anatomy as real tables: rules bleeding 8px past the text, the name at 15px 600 with its caption line, figures right-aligned. Narrower than the table, they scroll sideways in a named region (`ScrollTable`) with the name column held at the left. In the launches table and the inbox's pitch table, a cell with nothing to show yet, such as an unrun launch's finalists, slots, slot value and last run, or a set-aside pitch's guest and work, is left empty rather than holding a dash, with visually hidden text, "None" or "Not run yet", so a screen reader doesn't say "blank".

### Launches dashboard

`Dashboard.tsx`: the page header, "Launches" with its counts ("7 launches · 4 need you, 1 running") and "New launch", which opens a dialog; with no launches, the empty state, "No launches yet." with "New launch", where the launches will be. Launches are grouped by who's blocked, groups shown only when they have rows: Needs you (waiting, order drafted, failed, stopped), Running, Ranked, Not run yet, Approved; latest run first within a group. Status shows the on-air dot for running and waiting, an ink check for an approved order, the square ✕ and the word in crimson for failed and stopped. Each row has a finalist meter and a row menu with Delete. Under the header, a notice the server gives the page, only as a reset of the guest network's sample data that's still finishing opens it: one line on a 72ch measure, the `slow` state's clock and the sentence, "The reset may take a moment to finish: part of it failed, and Crossfeed tries it again within the hour.", with no word of its own. Beside the launches, two `Section`s on cards: Network, "The roster and inbox your runs rank, and the CPM that prices a launch's slots." over the roster, inbox and CPM lines (the CPM's Set, Change or View opening the settings' `#network` tab), and Setup, its count its sentence ("2 of 5 done") and Dismiss its action, over a real `<ol>`, until this member dismisses it. Its steps that are done in settings open their tab: "Set the CPM" `#network`, "Invite a teammate" `#members`, "Create an API key" `#api-keys`.

### Settings and account

`settings/Module.tsx`'s `Module`, shared by settings and the account page, is a `Section` over its panel on the tone step: its heading, one sentence of what it's for, then the panel, the column's width. Modules stack in a centred column 768px wide (`settingsColumn`), so from 1024px a panel is 720px. Settings puts one module in each tab of its `PageTabs`, "Settings sections", in the order a new owner needs them: Network `#network`, Members `#members` (two modules, Members and, for an owner, Invite links), API keys `#api-keys`, Qloo key `#qloo-key`, Usage `#usage`, Sample data `#sample-data` (the guest network's alone) and Danger zone `#danger-zone`. The account page has no tabs: it stacks a member's six modules, 48px apart, and a guest's one, and a member signed in with a recovery code finds the prompt to add a passkey at the top of the Passkeys panel. The title row's "Settings" carries the page's one "sample" badge while the network holds the sample data, as the page header's title does; the network module's CPM field then says it's an arbitrary sample figure until an owner sets the network's own. Owner-only modules show members read-only text, never nothing. One-time secrets (an API key, an invite link) show once in a read-only mono field with "Copy". The guest network's settings alone add Sample data (`settings/SampleData.tsx`), just before the Danger zone, so the two modules that undo the network's state are the last tabs: its sentence says what the guest network starts from each day, and its panel holds "Reset the sample data", the `destructive` outline button, over a muted line saying it closes every guest's open pages, and that every guest shares a few resets a day, the next after one waiting up to an hour. Its confirm names what goes and what stays; a refusal shows in the dialog, saying why and when to try again: inside the minute, past the day's resets, while the guest budget can't load the sample again, or while the last resets' launches still wait to be wiped. The page that resets keeps what it shows while the reset closes its own connection, then opens the dashboard, even when part of the reset is left to the hourly retry, which the dashboard then says; every other open page of the guest network closes on the reset's reason.

### Forms

Forms are built from `FieldGroup` and `Field`, per shadcn's forms rule: `FieldLabel` tied to its control by `htmlFor`, `FieldDescription` for help, `FieldSet` and `FieldLegend` for a group of radios, checkboxes or related fields, `data-invalid` on the `Field` beside `aria-invalid` on the control, and `InputGroup` with an `InputGroupAddon` for a prefix such as "$". Errors are the app's `Alert` (`role="alert"`) under the form that failed; a field an error is about points at it with `aria-describedby` and takes focus back.

### Confirmations

Every destructive action (delete a launch, remove a member, leave, revoke an invite or API key, remove the Qloo key or a passkey, reset the sample data, sign out everywhere, delete the account) confirms through `useConfirm` in one AlertDialog: the consequence spelled out, the verb on the destructive button, "Keep" on the other. A step-up prompt never stacks on a confirm: the AlertDialog closes, then the step-up dialog opens. Deleting a network keeps typing its name.

### States

Every block has its loading, empty, error, pending and disabled states. `StateLine` (`states.tsx`) words and marks them the same everywhere: a glyph, the state's word in bold, then what it's about, with a `data-state` hook.

| State     | Word      | Glyph                                                                    |
| --------- | --------- | ------------------------------------------------------------------------ |
| `loading` | Working   | the spinner                                                              |
| `slow`    | Slow Qloo | a clock                                                                  |
| `failed`  | Failed    | a square ✕, crimson (Qloo failed after its retries, or at the daily cap) |
| `missed`  | Missed    | a dashed circle, muted                                                   |
| `error`   | Error     | a square ✕, crimson (anything else)                                      |
| `empty`   | none      | none, in muted text                                                      |

A run's status words are `runLabel`'s; `isLive` and `endedBadly` say which glyph a run gets. Loading uses a Skeleton in the block's real shape beside its state line. A page with nothing yet shows its empty state ([Page header and empty state](#page-header-and-empty-state)), an `empty` state line with the page's one action.

### Connection states

The launch, inbox and network pages show a connecting skeleton (`Connecting`) until the agent's first state arrives, the network's pages, the inbox included, with their page header saying it under the title. A transient drop shows "Reconnecting…" while the socket reconnects by itself: in the page header on the network's pages, and in the readout on a launch's. Only a forced close (4403, 4410) shows the terminal lost-access view; a page whose code didn't load says so with a reload hint.

### Source labels and call numbers

Every figure says where it came from, and the two never look alike: "Qloo data" is an outlined chip with an ink square, "Agent" a tone-filled chip with a circle (`Source.tsx`). Every Qloo figure cites its call number, a mono button (`callVariants`) with `aria-pressed`, `aria-controls="evidence"` and an `aria-label` naming what it evidences, which opens the inspector's Evidence tab. Sample data carries one label a page, a "sample" badge beside the page's title, in its h1, so a screen reader hears it with the title: the dashboard, the roster and settings while the network holds the sample data, the inbox while it's the sample inbox, and a launch's page while it shows the sample data ([Launch page](#launch-page)). Nothing on the page carries another: no row, figure, slot value, order line, run log, evidence record or pitch. Words in a sentence or a caption still say it where they explain a figure: the fit chart's footnote ("$20 sample CPM", "sample figures"), the order total's "sample figures", and the settings' CPM field. The sample inbox's guests and works, which come already read, carry no Agent chip where Claude's reading carries one, and the pitch table's caption no legend for them.

### Figures

Each metric has one format wherever its figure shows, from `client/controls.tsx`, beside `percentile`. A missing figure is `–`, and a real zero prints as one.

| Metric                     | Helper                     | Format                                                                                                                                                   | Example        |
| -------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Downloads per episode      | `downloads`                | Thousands separators                                                                                                                                     | 700,000        |
| A count in words           | `count` (`PageHeader.tsx`) | Thousands separators, then its noun                                                                                                                      | 1,204 shows    |
| Popularity                 | `percentile`               | A percentile to one decimal, named as one where it shows, as `PickOne`'s note does ("with each one's popularity percentile")                             | 99.7           |
| An affinity, a tag's score | `score`                    | Three decimals                                                                                                                                           | 0.978          |
| A demographic score        | `demographic`              | Three decimals, as Qloo sends them and the mismatch check rounds them (`demographics.ts`), signed with a true minus sign; no lean, −0 included, is 0.000 | −0.248, +0.420 |

The house rule on figures stands: `tabular-nums` only on bare integers that align in a column, such as ranks and counts; decimals stay proportional, right-aligned in a column. The Show tab's downloads per episode field opens on the figure as the roster's row shows it, 700,000, and saves it unchanged, its commas dropped. The evidence a call keeps, which `getEvidence`, the API and the MCP server answer, holds each figure exactly as Qloo wrote it; the inspector shows it in its format, and its closed Stored record shows it as kept.

### Phones

At 390px: the rail is the bottom bar, the inspector a sheet, every control 44px tall, wide tables scroll inside their own region, and the fit chart's rows fold to two lines (rank, show and fit; then move, topic and slot value). Pages leave room for the bottom bar and scroll focused elements clear of it.

### Accessibility

- One focus ring for every control: 2px of `--ring`, 2px off, unlayered so it wins over a component's `outline-none`; an input group rings the group.
- Landmarks, unique region names, `role="status"` on the readout (the elapsed time sits outside it, `aria-hidden`), `role="alert"` on errors, `aria-current`, `aria-expanded`, `aria-busy`, `aria-invalid`, and the visually hidden prefixes ("Network: ", "Account: ") with the `vh` utility.
- The question comes before the chart in DOM order; focus moves to what follows an action that removes its own button (Approve goes to Export CSV).
- Every animation has a reduced-motion state, and nothing is hidden without JavaScript.

### Marketing and reading pages

- **Landing page** (`routes/marketing.tsx`): a type-led page. The hero's two-line statement at `type-poster` with the masked headline, one sentence, and "Open the sample network", the first action in `<main>`, a guest button with a line of fine print under it on signing in as a guest and The Ringer. The re-rank is CSS only: `:has()` on the checked radio sets each row's offset from its two ranks (`data-l`, `data-t`), rows share one height so they move by whole rows, and both ranks are in each row's text. Its pictures are true-size fragments of the app (`data-ui`) built from the same recipes, with made-up shows and no decimals beyond each metric's format: the Evidence tab's affinities to three, as the app sets them. The closing band is the page's one colour field. Behind the page is the ASCII field, its one picture of the subject (`client/ascii.ts`, which the marketing shell's `ascii` loads with its canvas): ripples spread from five fixed sources, the roster's shows, and from the pointer, the launch, each a thin crest every 120px; where they cross they add up, and each 14px cell (12px under 768px) takes the character for its sum from the ramp `" .:-=+*#%@"`, sparse to dense, in `--ascii`. The canvas is fixed to the window under everything, `aria-hidden` and deaf to the pointer, and the glyphs are copied from an atlas drawn once per size and scheme, at no more than twice the CSS pixel; the re-rank's rows, the fragments, the closing band and the footer sit on it as opaque grounds. It moves on arrival and while the visitor moves the pointer, touches or scrolls, then settles to a still frame within five seconds of the last, so nothing moves on its own for longer (WCAG 2.2.2) and an idle page draws nothing. Without JavaScript the canvas is empty and the page is the flat ground. Each section is a screen at least: the hero is `100svh` less the header, so the two fill the first screen, and every section after it is `min-h-svh`, taller only where its content needs it, as on phones, and never clipped. A section fills its screen with its own content, set larger or placed (the run's bar at `40svh`, the never-claims at `type-title`, the close's question at its top and foot with the ways in between), never with blank space. Sections meet with no margin between them: their own padding (48px, 80px from 768px, 96px from 1024px) keeps their content 96, 160 or 192px apart, and any height left over centres it. In-page links land on their target below the header.
- **Privacy and terms:** each section a row of heading and text on a 1fr/2fr grid, alternate rows on the tone step, text in `prose-doc`.
- **Developer docs:** the nav (220px from 1024px, a `<details>` above the article below), the article at 72ch, "On this page" from 1440px. `prose-doc` sets inline links, lists, bold and code; `table-doc` sets real tables, and `table-fold` folds a reference table into blocks under 640px.

## CSP rules for UI work

Every page is served under a Content-Security-Policy of the app's own origin alone (`apps/src/index.tsx`): no inline script, no inline style, no other origin. The dev server allows inline styles and a nonce'd refresh script, so it hides failures; only the production build shows them. So:

- The island renders inside Base UI's `<CSPProvider disableStyleElements>` (`client/main.tsx`), and `style.css` carries the one rule Base UI would inject, `.base-ui-disable-scrollbar`.
- No sonner, which injects a `<style>`; use Base UI's toast if a toast is ever needed. Don't turn on Base UI's `renderBeforeHydration`.
- No `style="…"` in server HTML. The island may set styles through React's `style` prop, which the browser applies through the DOM, not as an inline attribute.
- Marketing pages' scripts are same-origin module scripts (`menus.ts`, `reveal.ts`, `ascii.ts`), never inline. The field's canvas takes its size from its classes and its own `width` and `height`, which the script sets; a script may set `el.style`, which the policy allows, but server HTML has no `style` attribute.
- Any floating component (menu, popover, dialog, sheet, select, tooltip, toast) is checked under the production policy before it ships.

## How to verify

1.  In `apps/`: `bun run typecheck`, the tests with `bunx vitest run --maxWorkers=2`, and `bun run build`; at the repo root, `bun run lint` (Prettier).
1.  The design-taste skill's linter on the source you touched, from the repo root, with `--app` for app screens: `node <skill>/scripts/lint.mjs --app apps/src/client`, and without it for the server pages. `<skill>` is the `design-taste-frontend` skill's directory, which isn't committed: it's installed in the main checkout's `.agents/skills/`. Fix every FAIL; fix or defend every WARN. A line that must keep a flagged pattern for a real reason carries `taste-skill-ignore`, with a comment saying what the pragma is the first time a file uses one. `inspect.mjs <url>` renders a page at 1440, 768 and 390 and photographs it.
1.  Look at every surface you touched in a real browser at 1440 and 390, light and dark (`prefers-color-scheme`), on the production build, as [apps/README.md](/apps/README.md#production-csp-check) shows: build, serve `dist/crossfeed/wrangler.json` with `wrangler dev`, and open each page with the console open. No page may report a CSP violation or a console error.
1.  Exercise the flows you changed: start a run of the guest network's sample launch, answer its questions, approve and export; import a roster; load and rank the inbox. Signed-in pages need a passkey: drive Chrome with a CDP virtual authenticator, as [apps/README.md](/apps/README.md#live-check) shows.

## See also

- [PRODUCT.md](/docs/PRODUCT.md), what the product does, and [TRD.md](/docs/TRD.md), how it's built
- [apps/README.md](/apps/README.md): where the code goes, and the live check
- [shadcn/ui](https://ui.shadcn.com/docs), [Base UI](https://base-ui.com/react/overview/quick-start) and [Tailwind CSS v4](https://tailwindcss.com/docs)
