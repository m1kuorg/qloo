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
    1.  [Demo shell](#demo-shell)
    1.  [Marketing shell](#marketing-shell)
    1.  [Menus and the skip link](#menus-and-the-skip-link)
1.  [Components and recipes](#components-and-recipes)
    1.  [Where things live](#where-things-live)
    1.  [Recipes in variants.ts](#recipes-in-variantsts)
    1.  [The shadcn components](#the-shadcn-components)
    1.  [Shared client modules](#shared-client-modules)
1.  [Patterns](#patterns)
    1.  [Canvas and inspector](#canvas-and-inspector)
    1.  [Question card](#question-card)
    1.  [Fit chart](#fit-chart)
    1.  [The plan](#the-plan)
    1.  [Ranked lists](#ranked-lists)
    1.  [Launches dashboard](#launches-dashboard)
    1.  [Settings grammar](#settings-grammar)
    1.  [Forms](#forms)
    1.  [Confirmations](#confirmations)
    1.  [States](#states)
    1.  [Connection states](#connection-states)
    1.  [Source labels and call numbers](#source-labels-and-call-numbers)
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

Every run (a launch run or a pitch run) has an on-air readout, read like a studio's on-air light: a strip on the tone step with a dot, the run's word (Running, Waiting on you, Completed, Stopped at a limit, Failed), the current step ("Scoring 15 shows against The Watch · step 2"), and while it runs the time since it started. The dot is signal orange and breathes while the run is running or waiting on a person, ink once it has ended, an empty ring before the first run; a failure shows the square ✕ and its word instead.

The identity carries past the launch page: the dashboard's rows carry the on-air dot and a finalist meter, and the roster and the inbox's ranked lists use the fit chart's row anatomy.

### House rules

- No gradients, glows, glass, backdrop blur, emoji, decorative icons, icons in tinted squares, eyebrows, tiny uppercase letter-spaced labels, KPI tiles or rows of identical icon cards. Only what floats (menus, popovers, selects, dialogs, sheets) casts a shadow.
- Mono only for real code and codes: code blocks, API keys and their prefixes, call numbers (`C-21`), insertion order IDs (`IO-0001`), entity IDs, recovery codes. Ranks, scores, money and counts are in the text face, with `tabular-nums` only on bare integers that align in a column (ranks, counts, slots). The face's tabular comma and full stop are a digit wide, so money, downloads and percentiles stay proportional, right-aligned in a column.
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
| Focus ring                                          | `--ring`                                     | `#121318`             | `#ececf1`             |

`--accent` is shadcn's hover wash, the same value as `--muted`, not the signal. Text pairs hold 4.5:1 and large text and control outlines 3:1; `--input` holds 3:1 on the tone step too. A failure never relies on colour: it leads with its word, and its glyph is a square ✕ where the live dot is a circle. The landing page's closing band (`data-band='signal'`) is signal orange with the light scheme's ink, secondary and ring in both schemes.

### Type

One family, Schibsted Grotesk (variable, OFL), self-hosted through `@fontsource-variable/schibsted-grotesk`, so it's served from the app's own origin. A size-adjusted Arial fallback (`Schibsted Grotesk Fallback`) keeps text from re-wrapping as the face swaps in, and marketing pages preload its Latin file, so the poster type is set in it from the first paint. Mono is the platform stack: `ui-monospace, SFMono-Regular, Menlo, monospace`.

The scale is a set of `type-*` utilities in `style.css` rather than `text-*` theme keys, which class merging would read as colours. Caption, ui and body take their weight from the element.

| Utility        | Size                                      | Leading | Tracking | Weight | Use                                             |
| -------------- | ----------------------------------------- | ------- | -------- | ------ | ----------------------------------------------- |
| `type-caption` | 12px                                      | 1.45    | 0        | any    | table meta lines, field help, timestamps, chips |
| `type-ui`      | 14px                                      | 1.45    | 0        | any    | app text, controls, table cells, nav            |
| `type-body`    | 16px                                      | 1.55    | 0        | any    | marketing and docs text                         |
| `type-title`   | 24px                                      | 1.2     | -0.01em  | 600    | the question's legend, fit chart ranks, docs h2 |
| `type-display` | clamp(36px, 2rem + 2vw, 56px)             | 1.04    | -0.025em | 600    | marketing headings, auth and docs h1            |
| `type-poster`  | clamp(96px, 12.5vw, 200px); 17vw on phone | 0.86    | -0.05em  | 600    | the landing h1 only                             |
| `type-index`   | clamp(28px, 1rem + 3.6vw, 72px)           | 1.0     | -0.03em  | 500    | the landing re-rank's show names only           |

The app's body is `type-ui`; a show's name in a ranked list is 15px at 600 (`text-[15px] leading-snug font-semibold`); a page's h1 in the app is `type-title`.

### Shape and space

- Radius: `--radius` is 6px. `rounded-lg` (6px) is for controls: buttons, inputs, chips, segmented controls. `rounded-xl` (8px) is for panels, menus, popovers, dialogs and sheets. `rounded-sm` and `rounded-md` (4px) are for items inside a menu and inline code. Only the live dot and avatars are `rounded-full`. Edit a component's recipe rather than overriding a radius per use.
- Space: a 4px base. In the app, 24px gutters from 1024px and 16px below, and blocks 24px apart. Marketing pages: 24px margins on phones, 40px from 768px, content up to 1376px (`marketingFrame`).
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
| Menus and dialogs | fade and scale from 0.95 to 0.98, 100 to 200ms                                                                                                              |

A running step shows a small spinner, never shimmering text, and a skeleton is a still block with no pulse.

### Breakpoints

- Under 768px (`max-md`): the phone layout. The rail is a bottom bar, controls are 44px tall, wide tables scroll inside themselves.
- 1024px (`lg`): 24px gutters; two-column auth, new-network and settings layouts; the docs' nav beside the article.
- 1360px (`85rem`): the inspector sits beside the canvas instead of in a sheet.
- 1440px (`90rem`): the docs' "On this page" column.

## Shells

`apps/src/shell.tsx` renders every shell on the server with Hono JSX: the app shell, the demo shell, the marketing shell, and the auth pages' shell. The React island renders into `#root`, chosen by its `data-page` (`pageModules` in `shell.tsx`, in step with `client/main.tsx`).

### App shell

Every `/app` page: a 56px icon rail beside a column of a 48px top bar over the page.

- **Rail:** on the page ground with nothing dividing it, sticky full height. The mark at the top links `/app`, then Launches (the dashboard), Roster, Inbox (while `GUEST_PITCHES` is on), and Settings at the rail's foot. Each is an 18px outline icon on a 40px square, its name a tooltip from 768px and its accessible name; the current one sits on a tone-step square with `aria-current="page"` (`"true"` for a launch page under Launches).
- **Top bar:** the network switcher (a native `<details>` showing the network's name after a visually hidden "Network: "; its menu lists `Your networks`, the current one checked, then "New network"), and at the right the account menu (the member's initials and name after a visually hidden "Account: "; its menu: "Signed in as", "Your account", "Sign out").
- **Pages outside a network** (`/app/new`, `/app/account`) have the mark alone in the rail and "Your networks" in the switcher.
- **Phones:** one nav at every width. Under 768px the same `<nav>` restyles as a bottom bar, each icon over its name, so there's one nav landmark and one current item, and the mark moves to the top bar.

### Demo shell

`/demo` and `/demo/inbox` share the app's rail and top bar, so a visitor previews the product. The rail has Launch and Inbox (while `GUEST_PITCHES` is on), and the mark links `/`. The top bar's left holds two slots the island fills while the sample network is loaded, `#shell-network` ("The Ringer · sample network") and `#shell-notice` ("Sample data · not affiliated with The Ringer"), rendered empty with their height reserved so the late fill doesn't move the page. Its right holds "Sign in" (ghost) and "Create your network" (primary) while `ACCOUNTS` is on.

### Marketing shell

The landing page, privacy, terms, the docs and the 404 page (`MarketingPage`). No bar: the mark and the wordmark "Crossfeed" top left, and top right one `<nav aria-label="Site">`: "Sample network", "Developers" (current on docs pages), and while `ACCOUNTS` is on "Sign in" and "Create your network" (secondary, so the page's own primary stays the only one). Under 768px the links fold into a `<details>` "Menu"; from 768px its summary hides and the same links sit in a row (`::details-content` in `style.css`), so it's one nav at every width. The footer opens with the name set across the full content width, then Privacy, Beta terms, Developers, and "Made for the Qloo Agentic Hackathon.", on the tone step.

Sign-in and invite use the marketing shell's top-left mark with no links; the invite page shows the account menu when the visitor is signed in. The 404 page is the marketing shell around "Not on the roster.", for `GET` requests that accept HTML outside `/api`, `/agents`, `/mcp`, `/auth` and `.csv` downloads; everything else keeps the plain `404 Not Found`.

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

| Recipe                                            | What it draws                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `buttonVariants`                                  | flat, one fill, 6px. Variants: `default` (ink), `secondary` (tone), `ghost`, `link`, `destructive` (crimson outline), `destructive-solid` (only inside its confirm). Sizes: `default` 32px, `sm` 28px for row actions, `lg` 44px for marketing pages, `icon`, `icon-sm`, `icon-lg`. There's no `outline` variant: where shadcn asks for one, use `secondary` or `ghost` |
| `inputVariants`                                   | a text field: on the card, outlined at `--input`, 32px, 16px text on phones so iOS doesn't zoom, crimson once `aria-invalid`                                                                                                                                                                                                                                            |
| `linkVariants`                                    | a link in a line of text: underlined at 1px, 2px on hover. Default `tone: 'ink'` (500, ink) stands out of a muted caption; `tone: 'text'` keeps the line's colour and weight, as on the reading pages. The button's `link` variant wears it                                                                                                                             |
| `badgeVariants`                                   | 20px chips: `default` (tone), `outline` (3:1), `destructive`; `mark` adds a CSS glyph: `square` (Qloo data), `circle` (Agent), `signal` (finalist, live)                                                                                                                                                                                                                |
| `segmentedTrackVariants`, `segmentedItemVariants` | a segmented control: options on a tone-step track, the chosen one raised onto the card with the 3:1 outline. It marks its choice built as Base UI tabs (`data-active`), Base UI radios (`data-checked`) or a server page's label around a native radio (`has-checked`)                                                                                                  |
| `callVariants`                                    | a call number such as `C-21`: mono, dotted underline, ink fill while its evidence is open (`aria-pressed`)                                                                                                                                                                                                                                                              |
| `marketingFrame`                                  | the marketing pages' measure, which the sign-in and invite pages share so they line up with the wordmark                                                                                                                                                                                                                                                                |

**The phone target is in the recipes.** Under 768px every button size, the input, the input group and the select trigger are 44px tall, and a segmented track is 44px with 40px items. A `link` button keeps its line's height and reaches 44px with padding it gives back as negative margin. Don't add `max-md:h-11` per use; change the recipe.

### The shadcn components

`components/ui/` holds shadcn's base-nova components on Base UI, each forked onto the tokens and trimmed to what the app uses: alert-dialog, badge, button, checkbox, dialog, dropdown-menu, field, input, input-group, label, radio-group (plus `RadioGroupSegment`, a radio that's a segmented item), select, sheet, skeleton, spinner, tabs, textarea. Each file's header says what was changed. Don't re-add one with `shadcn add <name> --overwrite`: edit the fork, or its recipe in `variants.ts`. Read [the shadcn rules](https://ui.shadcn.com/docs) for a component before adding one, add only what a surface needs, and set a floating one's radius to 8px when you do.

Forks worth knowing:

- Floating components (dialog, alert-dialog, sheet, select, dropdown-menu) are 8px, on `shadow-float`, with no ring; modal ones have the scrim and make the page inert.
- Field is trimmed to `FieldSet`, `FieldLegend`, `FieldGroup`, `Field`, `FieldContent`, `FieldLabel` and `FieldDescription`; errors stay the app's own `Alert`.
- Input sets no `type` unless given one (the agent tests count the question card's text boxes so) and turns autofill off unless a field asks.
- Tabs are the segmented control, with no indicator. Skeleton doesn't pulse. Spinner is hidden from screen readers, as every state leads with its word.

### Shared client modules

| Module                                | What it holds                                                                                                                                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client/controls.tsx`                 | `send` and `Refused` for the Worker's routes, `useAction`, `useLeaveGuard`, `Alert`, `FitBand`, `NotScored`, `PickOne`, `KeyValues`, `Code`, `ScrollTable`, `ShownOnce`, `DropCue` and `useFileDrop` |
| `client/states.tsx`                   | `StateLine` and its words, `SlowCalls`, `isLive` and `endedBadly` (a run's status), and the connection's state                                                                                       |
| `client/Frame.tsx`                    | the run pages' frame: `canvas`, `frame`, `useInspector`, `Inspector`, `Readout`, `RunState`, `OnAir`, `Connecting`                                                                                   |
| `client/Run.tsx`                      | a run's status words, `RunLog`, `RunList` and `OpenQuestion`, the question card                                                                                                                      |
| `client/FitChart.tsx`                 | the fit chart                                                                                                                                                                                        |
| `client/InsertionOrder.tsx`           | the plan                                                                                                                                                                                             |
| `client/RosterModules.tsx`            | the roster's import, counts, table, show editor, roster check and CPM                                                                                                                                |
| `client/Evidence.tsx`                 | `CallButton`, `EvidencePanel` and `useEvidence`                                                                                                                                                      |
| `client/Confirm.tsx`                  | `useConfirm`, the one confirm for a destructive action                                                                                                                                               |
| `client/Source.tsx`                   | the "Qloo data" and "Agent" chips                                                                                                                                                                    |
| `client/settings/Module.tsx`          | the settings grammar, which the account page shares                                                                                                                                                  |
| `client/menus.ts`, `client/reveal.ts` | the shells' menus, and the landing page's section entrances                                                                                                                                          |

## Patterns

### Canvas and inspector

The launch workspace (`App.tsx`, on `/demo` and each launch page), the inbox (`Inbox.tsx`) and the network's roster page share one frame: a canvas beside an inspector.

- From 1360px the inspector is a 360px column on the card, sticky under the top bar for the window's height. At 1440 that's 56 (rail) + 24 + 976 (canvas) + 24 + 360 = 1440.
- Under 1360px it's a right sheet, non-modal and kept mounted: opening a call number, selecting a roster row or a pitch, or "Run log" in the readout opens it on that tab, and the canvas stays usable beside it. Tab moving focus onto something the sheet covers closes it.
- It's a Base UI Tabs panel: Run (the trace, the agent's closing line, the run record, then Runs), Evidence (the open call's request and what Qloo returned), and Show on the demo or Pitch in the inbox while one is selected. The roster page's inspector has Show and Evidence. Every panel stays mounted, so `aria-controls="evidence"` on a call number always finds its panel; nothing has `aria-modal`.
- The canvas, in reading order on a launch: the title row (the launch's name, its Qloo match with its call, the primary action), the on-air readout, the guide (the demo's sample network, until dismissed), the launch form or the question card, the fit chart, the plan, and the roster.

### Question card

`OpenQuestion` in `Run.tsx`, shown only while a run waits on its question, before the fit chart in DOM order, as a card on `--card` named "Agent asks". The "Agent" chip and "Waiting on you" sit over the question, which is the fieldset's legend at `type-title`. Its options are full-width rows whose whole width picks them: radio rows for a choice or a launch, a segmented "Promo slots" or "A dollar budget" beside one text field for the budget, a checkbox row per scorable show in fit order for exclusions (each with its band, and "Leaving it out brings X into the finalists" where ticking it changes the finalists, computed with `markFinalists`), three fields for comps, and a radio group per comp to confirm. One primary "Answer".

### Fit chart

`FitChart.tsx`: "Who shares The Watch's listeners", then the finding, a sentence from the ranking and the topic moves ("5 finalists. The Bill Simmons Podcast climbs 5 places over a topic-only plan, and 6 more shows climb 3 or more.", worded by `topicFinding` in `topic.ts`, which the landing page shares) with the ranking's call.

- **The lens:** a radio group styled as a segmented control, "By who listens" and "By topic", once the topic column is in. Switching re-orders the rows with a FLIP and collapses any open "Why it moved".
- **Rows** are a div grid with table roles (`role="table"`, `row`, `cell`, `columnheader`), so they can travel. Columns: Rank (`type-title`, the lens's rank, both ranks in words for screen readers), Move (▲3 in `--signal-ink` and 600 for a climber, ▼2 or = muted), Show (15px 600; under it the shared tags with their call, "Mapped to", "Led by", the demographics reason; chips Finalist, Left out, Listeners differ), Topic ("#6", headed with the Agent chip; under "By topic" it's the listener rank instead, headed Listeners with the Qloo data chip), Fit (a three-step meter, signal for finalists, its word on hover and for screen readers), Slot value (right-aligned money over its downloads, "sample" while a sample figure prices it). Finalist rows carry `--signal-tint`.
- **What it shows by default:** the finalists, the topic-only plan's top five, the climbers and any shows left out, with "Show all N" for the rest. A climber's name is a button that opens "Why it moved": "Topic alone ranks it 9." (Agent) and "Listener overlap with The Watch ranks it 4." (Qloo data) with the call, the leading comp and the shared tags.
- **Under it:** the bands and slot value footnotes, the demographics line, a partial ranking's line, and "Not scored · n" as a real table.
- **Loading:** skeleton rows in the chart's shape with "Working: the fit chart appears once the agent ranks the roster."

### The plan

`InsertionOrder.tsx`: "The plan", then "Insertion order IO-0001" with a Draft or Approved badge, as a document on `--card`. Each line is the show with the signal mark, its slots and value, and under it the host-read angle with its tags' call and the slot price; then the total and the budget check. While the run is live there are no actions; once it ends, "Approve" (primary) with "Nothing is final until you approve it. Editing returns it to draft." and "Edit lines" (ghost), and once approved, "Export CSV" (an `<a download>` styled secondary). Edit mode turns the cells into fields in place, each in a `Field` with `data-invalid`, with live totals and checks and Save off until every line is valid. An earlier run's order is read-only, still exportable once approved.

### Ranked lists

The roster table (`RosterTable`), the inbox's pitch lists and the launches table use the fit chart's row anatomy as real tables: rules bleeding 8px past the text, the name at 15px 600 with its caption line, figures right-aligned. Narrower than the table, they scroll sideways in a named region (`ScrollTable`) with the name column held at the left.

### Launches dashboard

`Dashboard.tsx`: h1 "Launches" with counts ("2 need you · 1 running · 4 launches") and "New launch", which opens a dialog. Launches are grouped by who's blocked, groups shown only when they have rows: Needs you (waiting, order drafted, failed, stopped), Running, Ranked, Not run yet, Approved; latest run first within a group. Status shows the on-air dot for running and waiting, an ink check for an approved order, the square ✕ and the word in crimson for failed and stopped. Each row has a finalist meter and a row menu with Delete. Beside it, the Network panel (roster, inbox and CPM lines) and Setup ("Setup · 2 of 5 done", a real `<ol>`, until this member dismisses it).

### Settings grammar

`settings/Module.tsx`, shared by settings and the account page: a centred column about 1152px wide; each module a row of its heading and what it's for, beside its panel on the tone step, side by side at 2:3 from 1024px and stacked below. Owner-only modules show members read-only text, never nothing. One-time secrets (an API key, an invite link) show once in a read-only mono field with "Copy".

### Forms

Forms are built from `FieldGroup` and `Field`, per shadcn's forms rule: `FieldLabel` tied to its control by `htmlFor`, `FieldDescription` for help, `FieldSet` and `FieldLegend` for a group of radios, checkboxes or related fields, `data-invalid` on the `Field` beside `aria-invalid` on the control, and `InputGroup` with an `InputGroupAddon` for a prefix such as "$". Errors are the app's `Alert` (`role="alert"`) under the form that failed; a field an error is about points at it with `aria-describedby` and takes focus back.

### Confirmations

Every destructive action (delete a launch, remove a member, leave, revoke an invite or API key, remove the Qloo key or a passkey, sign out everywhere, delete the account) confirms through `useConfirm` in one AlertDialog: the consequence spelled out, the verb on the destructive button, "Keep" on the other. A step-up prompt never stacks on a confirm: the AlertDialog closes, then the step-up dialog opens. Deleting a network keeps typing its name.

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

A run's status words are `runLabel`'s; `isLive` and `endedBadly` say which glyph a run gets. Loading uses a Skeleton in the block's real shape beside its state line.

### Connection states

The demo, launch, inbox and network pages show a connecting skeleton (`Connecting`) until the agent's first state arrives. A transient drop shows "Reconnecting…" in the readout while the socket reconnects by itself. Only a forced close (4403, 4410) shows the terminal lost-access view; a page whose code didn't load says so with a reload hint.

### Source labels and call numbers

Every figure says where it came from, and the two never look alike: "Qloo data" is an outlined chip with an ink square, "Agent" a tone-filled chip with a circle (`Source.tsx`). Every Qloo figure cites its call number, a mono button (`callVariants`) with `aria-pressed`, `aria-controls="evidence"` and an `aria-label` naming what it evidences, which opens the inspector's Evidence tab. Sample figures carry a "sample" chip until edited.

### Phones

At 390px: the rail is the bottom bar, the inspector a sheet, every control 44px tall, wide tables scroll inside their own region, and the fit chart's rows fold to two lines (rank, show and fit; then move, topic and slot value). Pages leave room for the bottom bar and scroll focused elements clear of it.

### Accessibility

- One focus ring for every control: 2px of `--ring`, 2px off, unlayered so it wins over a component's `outline-none`; an input group rings the group.
- Landmarks, unique region names, `role="status"` on the readout (the elapsed time sits outside it, `aria-hidden`), `role="alert"` on errors, `aria-current`, `aria-expanded`, `aria-busy`, `aria-invalid`, and the visually hidden prefixes ("Network: ", "Account: ") with the `vh` utility.
- The question comes before the chart in DOM order; focus moves to what follows an action that removes its own button (Approve goes to Export CSV).
- Every animation has a reduced-motion state, and nothing is hidden without JavaScript.

### Marketing and reading pages

- **Landing page** (`routes/marketing.tsx`): a type-led page. The hero's two-line statement at `type-poster` with the masked headline, one sentence, and "Open the sample network", the first link in `<main>`. The re-rank is CSS only: `:has()` on the checked radio sets each row's offset from its two ranks (`data-l`, `data-t`), rows share one height so they move by whole rows, and both ranks are in each row's text. Its pictures are true-size fragments of the app (`data-ui`) built from the same recipes, with made-up shows and no decimals. The closing band is the page's one colour field.
- **Privacy and terms:** each section a row of heading and text on a 1fr/2fr grid, alternate rows on the tone step, text in `prose-doc`.
- **Developer docs:** the nav (220px from 1024px, a `<details>` above the article below), the article at 72ch, "On this page" from 1440px. `prose-doc` sets inline links, lists, bold and code; `table-doc` sets real tables, and `table-fold` folds a reference table into blocks under 640px.

## CSP rules for UI work

Every page is served under a Content-Security-Policy of the app's own origin alone (`apps/src/index.tsx`): no inline script, no inline style, no other origin. The dev server allows inline styles and a nonce'd refresh script, so it hides failures; only the production build shows them. So:

- The island renders inside Base UI's `<CSPProvider disableStyleElements>` (`client/main.tsx`), and `style.css` carries the one rule Base UI would inject, `.base-ui-disable-scrollbar`.
- No sonner, which injects a `<style>`; use Base UI's toast if a toast is ever needed. Don't turn on Base UI's `renderBeforeHydration`.
- No `style="…"` in server HTML. The island may set styles through React's `style` prop, which the browser applies through the DOM, not as an inline attribute.
- Marketing pages' scripts are same-origin module scripts (`menus.ts`, `reveal.ts`), never inline.
- Any floating component (menu, popover, dialog, sheet, select, tooltip, toast) is checked under the production policy before it ships.

## How to verify

1.  In `apps/`: `bun run typecheck`, the tests with `bunx vitest run --maxWorkers=2`, and `bun run build`; at the repo root, `bun run lint` (Prettier).
1.  The design-taste skill's linter on the source you touched, from the repo root, with `--app` for app screens: `node <skill>/scripts/lint.mjs --app apps/src/client`, and without it for the server pages. `<skill>` is the `design-taste-frontend` skill's directory, which isn't committed: it's installed in the main checkout's `.agents/skills/`. Fix every FAIL; fix or defend every WARN. A line that must keep a flagged pattern for a real reason carries `taste-skill-ignore`, with a comment saying what the pragma is the first time a file uses one. `inspect.mjs <url>` renders a page at 1440, 768 and 390 and photographs it.
1.  Look at every surface you touched in a real browser at 1440 and 390, light and dark (`prefers-color-scheme`), on the production build, as [apps/README.md](/apps/README.md#production-csp-check) shows: build, serve `dist/crossfeed/wrangler.json` with `wrangler dev`, and open each page with the console open. No page may report a CSP violation or a console error.
1.  Exercise the flows you changed: start a demo run, answer its questions, approve and export; import a roster; load and rank the inbox. Signed-in pages need a passkey: drive Chrome with a CDP virtual authenticator, as [apps/README.md](/apps/README.md#live-check) shows.

## See also

- [PRODUCT.md](/docs/PRODUCT.md), what the product does, and [TRD.md](/docs/TRD.md), how it's built
- [apps/README.md](/apps/README.md): where the code goes, and the live check
- [shadcn/ui](https://ui.shadcn.com/docs), [Base UI](https://base-ui.com/react/overview/quick-start) and [Tailwind CSS v4](https://tailwindcss.com/docs)
