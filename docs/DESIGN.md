---
name: Crossfeed
description: A podcast network's roster ranked like this week's chart, by how much each show's listeners overlap a launch's.
colors:
  primary: '#111111'
  chart-red: '#e3262e'
  chart-white: '#ffffff'
  ink-hover: '#333333'
  column-grey: '#555555'
  caption-grey: '#6b6b6b'
  last-week-grey: '#8a8a8a'
  panel-grey: '#f2f2f2'
  hairline: '#e6e6e6'
  control-edge: '#d4d4d4'
  empty-segment: '#dcdcdc'
  top-bar-nav: '#a3a3a3'
  top-bar-meta: '#b5b5b5'
  slow-amber: '#8a6100'
  fault-rust: '#a34700'
  missed-slate: '#2f5d8a'
typography:
  hero-position:
    fontFamily: 'Barlow Condensed, sans-serif'
    fontSize: 56px
    fontWeight: 800
    lineHeight: 1
  hero-last-week:
    fontFamily: 'Barlow Condensed, sans-serif'
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1
  position:
    fontFamily: 'Barlow Condensed, sans-serif'
    fontSize: 40px
    fontWeight: 800
    lineHeight: 1
  last-week:
    fontFamily: 'Barlow Condensed, sans-serif'
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1
  wordmark:
    fontFamily: 'Barlow Condensed, sans-serif'
    fontSize: 22px
    fontWeight: 800
    lineHeight: 1
    letterSpacing: 0.02em
  display:
    fontFamily: 'Libre Franklin, sans-serif'
    fontSize: clamp(34px, 3.8vw, 52px)
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: -0.03em
  page-title:
    fontFamily: 'Libre Franklin, sans-serif'
    fontSize: clamp(32px, 4vw, 44px)
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: -0.03em
  section-heading:
    fontFamily: 'Libre Franklin, sans-serif'
    fontSize: 28px
    fontWeight: 700
    lineHeight: 34px
    letterSpacing: -0.015em
  headline:
    fontFamily: 'Libre Franklin, sans-serif'
    fontSize: 22px
    fontWeight: 700
    lineHeight: 28px
    letterSpacing: -0.01em
  lede:
    fontFamily: 'Libre Franklin, sans-serif'
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.5
  reading:
    fontFamily: 'Libre Franklin, sans-serif'
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.6
  title:
    fontFamily: 'Libre Franklin, sans-serif'
    fontSize: 15px
    fontWeight: 600
    lineHeight: 20px
  row-name:
    fontFamily: 'Libre Franklin, sans-serif'
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: 'Libre Franklin, sans-serif'
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.4
  caption:
    fontFamily: 'Libre Franklin, sans-serif'
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
  column-heading:
    fontFamily: 'Libre Franklin, sans-serif'
    fontSize: 11px
    fontWeight: 600
    letterSpacing: 0.06em
  label:
    fontFamily: 'Libre Franklin, sans-serif'
    fontSize: 11px
    fontWeight: 600
    letterSpacing: 0.08em
  call-number:
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'
    fontSize: 12px
    fontWeight: 500
  code:
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.6
  recovery-code:
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0.06em
rounded:
  control: 4px
  chip: 3px
  full: 50%
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
  section: 48px
  page-top: 56px
  section-gap: 72px
  gutter-phone: 16px
  rail: 448px
  rail-min: 320px
  docs-nav: 240px
  reading-measure: 680px
  form-column: 944px
components:
  top-bar:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.chart-white}'
    height: 48px
  nav-link:
    textColor: '{colors.top-bar-nav}'
  nav-link-active:
    textColor: '{colors.chart-white}'
  top-bar-meta:
    textColor: '{colors.top-bar-meta}'
  menu-panel:
    backgroundColor: '{colors.chart-white}'
    textColor: '{colors.primary}'
    padding: 8px 0
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.chart-white}'
    rounded: '{rounded.control}'
    padding: 0 12px
    height: 32px
  button-primary-hover:
    backgroundColor: '{colors.ink-hover}'
  button-secondary:
    backgroundColor: '{colors.chart-white}'
    textColor: '{colors.primary}'
    rounded: '{rounded.control}'
    padding: 0 12px
    height: 32px
  button-marketing:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.chart-white}'
    rounded: '{rounded.control}'
    padding: 0 16px
    height: 40px
  chip:
    backgroundColor: '{colors.chart-white}'
    textColor: '{colors.column-grey}'
    typography: '{typography.label}'
    rounded: '{rounded.chip}'
    padding: 2px 6px
  chip-flag:
    textColor: '{colors.primary}'
  input:
    backgroundColor: '{colors.chart-white}'
    textColor: '{colors.primary}'
    rounded: '{rounded.control}'
    height: 32px
  position-numeral:
    textColor: '{colors.primary}'
    typography: '{typography.position}'
  last-week-numeral:
    textColor: '{colors.last-week-grey}'
    typography: '{typography.last-week}'
  gainer-bullet:
    backgroundColor: '{colors.chart-red}'
    size: 9px
    rounded: '{rounded.full}'
  band-segment:
    backgroundColor: '{colors.primary}'
    width: 5px
    height: 12px
  band-segment-empty:
    backgroundColor: '{colors.empty-segment}'
  chart-row:
    height: 64px
  table-row:
    height: 44px
  selected-row:
    backgroundColor: '{colors.panel-grey}'
  open-question:
    backgroundColor: '{colors.panel-grey}'
    typography: '{typography.title}'
  shown-once:
    backgroundColor: '{colors.panel-grey}'
    padding: 12px 16px 16px
  recovery-code:
    backgroundColor: '{colors.panel-grey}'
    textColor: '{colors.primary}'
    typography: '{typography.recovery-code}'
    padding: 16px 24px
  code-block:
    backgroundColor: '{colors.panel-grey}'
    textColor: '{colors.primary}'
    typography: '{typography.code}'
    rounded: '{rounded.control}'
    padding: 14px 16px
  column-heading:
    textColor: '{colors.column-grey}'
    typography: '{typography.column-heading}'
  caption:
    textColor: '{colors.caption-grey}'
    typography: '{typography.caption}'
  state-slow:
    textColor: '{colors.slow-amber}'
    typography: '{typography.label}'
  state-failed:
    textColor: '{colors.fault-rust}'
    typography: '{typography.label}'
  state-missed:
    textColor: '{colors.missed-slate}'
    typography: '{typography.label}'
---

# Design system: Crossfeed

This is Crossfeed's visual system, derived on 2026-10-17 from the shipped launch workspace and inbox, and extended on 2026-10-22 from the shipped product: the landing page, the developer docs, sign-in, and the signed-in network's pages. It records the world, its tokens, its components, and its guardrails so agents extending any of them stay on-brand; [PRODUCT.md](PRODUCT.md) owns what the product does. The frontmatter tokens are normative, and `apps/src/style.css` holds them as custom properties on `:root` or as the literal values the frontmatter gives.

Contents:

1.  [Overview](#overview)
1.  [Colors](#colors)
    1.  [Primary colors](#primary-colors)
    1.  [Neutral colors](#neutral-colors)
    1.  [State colors](#state-colors)
    1.  [Color rules](#color-rules)
1.  [Typography](#typography)
    1.  [Type hierarchy](#type-hierarchy)
    1.  [Type rules](#type-rules)
1.  [Layout](#layout)
    1.  [The workspace grid](#the-workspace-grid)
    1.  [The marketing and docs grids](#the-marketing-and-docs-grids)
    1.  [Forms and records](#forms-and-records)
    1.  [Narrow screens](#narrow-screens)
1.  [Elevation & Depth](#elevation--depth)
1.  [Shapes](#shapes)
1.  [Components](#components)
    1.  [Buttons](#buttons)
    1.  [Chips and source labels](#chips-and-source-labels)
    1.  [Call numbers](#call-numbers)
    1.  [Inputs and fields](#inputs-and-fields)
    1.  [Top bar and navigation](#top-bar-and-navigation)
    1.  [The three shells](#the-three-shells)
    1.  [Weekly Chart row](#weekly-chart-row)
    1.  [Other tables](#other-tables)
    1.  [Open question module](#open-question-module)
    1.  [Run module notes](#run-module-notes)
    1.  [State lines](#state-lines)
    1.  [Landing page sections](#landing-page-sections)
    1.  [Sign-in and the recovery code](#sign-in-and-the-recovery-code)
    1.  [Dashboard](#dashboard)
    1.  [Roster and inbox uploads](#roster-and-inbox-uploads)
    1.  [Settings and account modules](#settings-and-account-modules)
    1.  [Developer docs pages](#developer-docs-pages)
1.  [Do's and Don'ts](#dos-and-donts)
    1.  [Do](#do)
    1.  [Don't](#dont)
1.  [Sources](#sources)
1.  [See also](#see-also)

## Overview

**Creative North Star: "The Weekly Chart"**

Crossfeed sets a network's roster as this week's chart. Fit rank is the new position, the rank a topic-only planner would give is last week's, and the moves Qloo caused are the news. A programmer reads the chart the way the music and podcast industries already read Billboard and the podcast rankers: position first, then movement, then why. The world lends four things only: type, palette, density, and one signature move. Layout, navigation, and controls stay standard web components, because this is a working screen and the programmer should know where everything is before they notice the world.

The screen is light, because its scene is a head of programming at a desk in a daylit office, planning one launch between meetings, so there is no dark theme: the screen is light only, and tells the browser so with `color-scheme: light`. It is dense but not cramped: tall chart rows give the position numerals room, while everything around them stays small, quiet, and set in tabular figures. Agent text and Qloo data never blend; each is labelled where it appears, and every claim cites the Qloo call behind it.

The signature move is **chart movement**: a show that climbs three or more places over its topic rank gets a red bullet beside its position, and the selected climber opens an inline "why it moved" line that cites its Qloo call. This is the demo's decisive moment drawn as chart notation, not as a tile or a chat message. In motion, the move lands like a mark made on the printed chart: when the topic column arrives, last week's figures and the moves fade in over 200ms, then each climber's bullet lands beside its position, shrinking from 2.4 times its size as it fades in, over 320ms and 60ms after the climber above it, with the stagger capped at six steps. The why line fades in over 200ms. Everything else moves only to acknowledge: 120ms color changes on hover and press, and 200ms for a row taking Panel Grey. Every curve eases out, the bullet's on `cubic-bezier(0.16, 1, 0.3, 1)`; nothing bounces or loops. With reduced motion, the bullets fade in with the figures, with no scale and no stagger.

One world serves three kinds of page. The landing page persuades at a larger scale, with an illustrative chart as its hero and its climbers' bullets landing as it loads. The developer docs, the privacy page, and the beta terms are read, in one measured column. Every other page operates: the demo, sign-in, and a network's dashboard, roster, inbox, launches, settings, and account page all keep the launch workspace's grammar, tables under a black rule, hairline modules, Panel Grey for what's selected or waiting on a yes, and one black button for the page's decision.

**Key Characteristics:**

- Heavy condensed position numerals carry the hierarchy; everything else is one plain grotesque.
- White ground, near-black ink, a black top bar, and one red with one job.
- Rank and band before raw score; raw affinity lives only in the evidence record.
- Hairline row rules under a solid black header rule; no cards, tiles, or shadows.
- Every agent line and every Qloo figure says which it is, and cites a call number such as `C-07`.
- Something to keep or copy, a recovery code, a new key, a link, or code, sits on Panel Grey in the monospace stack where it's data.

## Colors

A restrained palette: neutrals on white, the black top bar as the one committed field, and chart red reserved for the bullet. Each color below names its custom property in `apps/src/style.css`; colors with none are written as literals there.

### Primary colors

- **Press Black** (#111111, `--ink`): body ink, the top bar, primary buttons, the table's header rule, filled band segments, totals, the keyboard focus ring, text selection, a drop cue's frame, and the menu sheets' edges. 18.88:1 on white. The `primary` token is Press Black, and Chart Red is never a primary-action color.
- **Chart Red** (#e3262e, `--red`): the gainer bullet, a 9px dot beside the position numeral of a show that climbed three or more places over topic rank (12px on the landing page's hero chart), and its legend. 4.58:1 on white.

### Neutral colors

- **Chart White** (#ffffff): page ground, table rows, controls, chips, menu sheets, and text on Press Black.
- **Ink Hover** (#333333, `--ink-hover`): Press Black's hover, on a primary button's fill and border, and the top bar's divider before the network's name or switcher. White on it is 12.63:1.
- **Column Grey** (#555555, `--mid`): secondary text such as comps, help lines, tags under a show name, chip text, the why line, column headings, a done setup step, and the account menu's line. 7.46:1 on white.
- **Caption Grey** (#6b6b6b, `--grey`): captions, field labels, placeholders, sample labels, the ▼ and = move glyphs, Label-type module headings, the agent chip's dashed border, and a link's underline on the marketing pages. 5.33:1 on white and 4.76:1 on Panel Grey.
- **Last-Week Grey** (#8a8a8a, `--topic`): last-week (topic rank) numerals only, at 24px or larger. 3.45:1 on white and 3.08:1 on Panel Grey in a selected row, so it passes as large text only.
- **Panel Grey** (#f2f2f2, `--panel`): the selected chart row with its "why it moved" line, the agent's open question, the show editor, the run on view, the network on view in the switcher, the docs page on view, something shown once to keep or copy (a recovery code, an invite link, an API key), code in the docs, and a row or module waiting on a yes. A table has one selected row at a time: in the roster, the show open in the show editor or, with none open, the show whose evidence is open; in the inbox, the pitch open in the rail.
- **Hairline** (#e6e6e6, `--line`): row rules, section and module dividers, and the rail's and docs column's edge.
- **Control Edge** (#d4d4d4, `--edge`): input, button, and chip borders, the underline of a call number or a launch's name, and the rule over a module's form fields.
- **Empty Segment** (#dcdcdc, `--empty`): unfilled band-meter segments; decorative, so the band's word label is always shown.
- **Top Bar Nav** (#a3a3a3): inactive nav links and the account menu on Press Black, 7.49:1.
- **Top Bar Meta** (#b5b5b5): the network's name, the switcher, and the sample tag on Press Black, 9.21:1.

### State colors

Each colors only a state's 8px square marker and its word, such as "Slow Qloo", set in Label type before the sentence that explains it, or a roster row's match chip. The sentence stays in ink. Loading ("Working") and empty states stay neutral, in Column Grey.

- **Slow Amber** (#8a6100, `--slow`): a Qloo call still waiting past 8 seconds, the TRD's worst case. 5.54:1 on white and 4.95:1 on Panel Grey.
- **Fault Rust** (#a34700, `--fault`): a Qloo call that failed after its retries or at the daily cap, a failed launch on the dashboard, and any other error. 6.07:1 on white and 5.42:1 on Panel Grey.
- **Missed Slate** (#2f5d8a, `--missed`): a match Qloo doesn't have. 6.88:1 on white and 6.14:1 on Panel Grey.

### Color rules

**The One Bullet Rule.** Chart Red marks a climb of three or more places, and the legend that explains it, and nothing else: not errors, links, buttons, falls, or emphasis. If a screen has no climbers, it shows neither the bullet nor its legend. The docs, settings, and account pages rank nothing, so they never show it.

**The Word First Rule.** A state always shows its word, so no state is told by color alone, and no state color is Chart Red or a red.

**The Black Shell Rule.** Press Black fills only the top bar and primary action buttons, such as answering the agent, approving the order, creating an account, or opening the sample network. No other region is filled black, so the bar reads as the shell and a black button reads as a decision.

## Typography

**Display Font:** Barlow Condensed (with sans-serif)\
**Body Font:** Libre Franklin (with sans-serif)\
**Label/Mono Font:** the system monospace stack (`ui-monospace, SFMono-Regular, Menlo, monospace`), for data only: call numbers such as `C-21`, request strings in evidence, a recovery code, an API key and its prefix, a Qloo key's last four characters, and code and paths in the docs

**Character:** Condensed chart numerals against a sober news grotesque, the pairing of a printed chart page. All figures use tabular numerals (`font-variant-numeric: tabular-nums`) so ranks, downloads, and dollars line up in columns and don't jitter when values change. Both faces are self-hosted.

### Type hierarchy

- **Hero position** (Barlow Condensed 800, 56px, line-height 1): fit rank in the landing page's illustrative chart, the page's largest type; 40px on a phone.
- **Hero last week** (Barlow Condensed 600, 32px): topic rank in that chart; 24px on a phone.
- **Position** (Barlow Condensed 800, 40px, line-height 1): fit rank in the chart's first column, and the glyphs of the landing page's key.
- **Last week** (Barlow Condensed 600, 24px, line-height 1, Last-Week Grey): topic rank in the second column.
- **Wordmark** (Barlow Condensed 800, 22px, uppercase, 0.02em): "Crossfeed" in the top bar.
- **Display** (Libre Franklin 700, clamp(34px, 3.8vw, 52px)/1.04, -0.03em, balanced): the landing page's one headline, kept to 16em; 30px on a phone. The hero chart's numerals stay larger.
- **Page title** (Libre Franklin 700, clamp(32px, 4vw, 44px)/1.04, -0.03em): the docs pages', the privacy page's, and the beta terms' h1.
- **Section heading** (Libre Franklin 700, 28px/34px, -0.015em): each landing section's h2; the inbox section's beside its list takes 24px/30px, and the closing "Try it on a real roster." clamp(28px, 3vw, 40px).
- **Headline** (Libre Franklin 700, 22px/28px, -0.01em): every app page's h1, such as the launch title, the network's name on the dashboard, Roster, Settings, and Account, and the docs' h2.
- **Lede** (Libre Franklin 400, 17px/1.5): the sentence under the landing headline (34em) and the close's; a step's name in "How a run works" takes 17px 600.
- **Reading** (Libre Franklin 400, 15px/1.6): prose in the docs, the privacy page, the terms, and the landing page's sections, kept to a measure. The privacy page's h2 is 20px/26px, the docs' h3 16px/22px 600.
- **Title** (Libre Franklin 600, 15px/20px): the agent's open question.
- **Row name** (Libre Franklin 600, 14px): show names in the chart and a launch's name in the dashboard's table; 16px in the hero chart.
- **Body** (Libre Franklin 400, 13px/1.4): default text and table cells.
- **Caption** (Libre Franklin 400, 12px): tags under show names, evidence values, help lines, the landing key's explanations, and table captions.
- **Column heading** (Libre Franklin 600, 11px, 0.06em, uppercase): table column headings.
- **Label** (Libre Franklin 600, 11px, 0.08em, uppercase): module headings, chips, and state words.
- **Call number** (monospace 500, 12px): a cited Qloo call, 600 when it's a button.
- **Code** (monospace 500, 13px, 1.6 in a block): code and paths in the docs and the privacy page; 12px in the API keys module and the docs' route records.
- **Recovery code** (monospace 600, 20px/1.3, 0.06em, uppercase): the code shown once at sign-up or recovery; 17px on a phone.

Nothing functional is set below 11px.

### Type rules

**The Numerals Speak Rule.** Barlow Condensed sets rank numerals and the wordmark only. Headings, names, buttons, and step numbers stay in Libre Franklin, so big type always means a position on the chart, on the landing page as in the app.

**The Data Is Mono Rule.** The monospace stack sets what a person copies or a machine reads: call numbers, request strings, codes, keys, and paths. Prose never takes it for effect.

## Layout

The spatial grammar is a black top bar over a light work area split in two: a wide primary column, and a narrower rail beside it for what qualifies it. Modules divide by hairlines, never by boxes, with more space above a heading than below it. Spacing keeps to 4, 8, 12, 16, 24, and 32px steps inside a page, and 48, 56, and 72px between the reading pages' and landing page's sections. Two breakpoints, 960px and 600px, change every page; the fit chart also fits its last column by a container query.

### The workspace grid

The launch page, the demo, the inbox, the dashboard, and the roster page share it: 32px page gutters, a 48px top bar, a header (`.hd`: the page's headline, with its form or status, over a hairline), and a rail `clamp(320px, 32vw, 448px)` wide that begins after a 24px gap, a hairline, and 24px of inner padding, so at 1440px the primary column is 904px and the rail 448px. The rail is 448px wide from a 1400px window and narrows to 320px below that, so the chart keeps room for show names.

- **Launch and demo:** the fit chart in the wide column; the rail stacks the agent's open question (atop it, in the grid itself), the guide, the evidence, the insertion order, the run log, and the runs.
- **Dashboard:** the launches table in the wide column; the rail holds the network's record rows (roster, inbox, CPM) and the setup checklist, from the top.
- **Roster page:** the import form and the roster table in the wide column; the rail holds the open show's editor, its evidence, the roster check, and the network's CPM.
- **Inbox:** the load form, the past guests' works, and the ranked lists in the wide column; the rail holds the evidence, the run, what the run ranked against, the inbox check, and the replies.

Fit chart rows are at least 64px, roster, inbox, and launches rows 44px (taller with two-line content), secondary tables (the evidence record, the run log, and what Qloo returned) about 28px from 5px row padding, and insertion order rows use 6px padding. Toolbar controls are 32px high.

### The marketing and docs grids

- **Landing page:** the header band (56px above, the headline, the lede, the ways in, and a 12px note), then the app's own grid at persuasion scale: the illustrative chart in the wide column with its key down the rail. Each later section sits 72px below the last, over a hairline, with 48px above its heading; "How a run works" sets its steps as rows of a 48px number, the step's words, and the piece of the app it shows in the rail's width; the inbox section puts its ranked list in the wide column and its words in the rail.
- **Privacy and terms:** one column of 720px with the page's gutters, 56px above and 72px below.
- **Developer docs:** a 240px contents rail, sticky as the page scrolls, beside a reading column up to 840px with a hairline down its left and 40px inside it; prose, ledes, and records keep to a 680px measure, and each section sits 48px below the last, over a hairline.

### Forms and records

- **Sign-in and invite:** one column up to 944px; the headline and its help over a Press Black rule, then the two ways in side by side ("Sign in" and "Create an account"), divided by a hairline, each with its one black button. Text fields keep to 320px.
- **Settings and account:** one column of modules up to 944px, each a row of a 280px "about" (Label heading and help, 40ch) beside its body: a form keeps to 400px, a module whose body is a table to 576px. Modules divide by hairlines.
- **Record rows:** a key-value grid, the key in Caption Grey (88px in the evidence record, 56px on the dashboard), each row on a hairline.

### Narrow screens

Responsive behavior keeps one guardrail: at every width the position, move, and show name stay visible, the agent's open question stays reachable without scrolling past the whole chart, and the page itself never scrolls sideways (checked at 375px and at 320px). So the open question comes before the chart in reading order, and the grid sets it atop the rail.

- **Below 960px** every grid is one column: on a launch, the open question, the fit chart, the rail, then the roster, so the evidence and the order to approve follow the chart; the question's fields keep to 560px. The landing page's rail follows its column under a hairline, and the docs' contents go atop the page, the pages as one row and the page's sections as a row under it.
- **Below 600px** the gutters drop to 16px. The top bar wraps: the demo's sample notice and "Create your network" drop under the nav and the network's name is hidden; the app shell keeps the wordmark, the switcher, and "Account" on its first row, puts the network's sections on the next, and hangs each menu's sheet across the page. The launch header stacks, the chart's topic columns tighten and its names wrap, and the roster, the inbox's pitch table, the dashboard's launches (760px), and the settings' and account's tables each scroll sideways in their own frame, never the page. The sign-in page's two ways in stack; settings modules put "about" over the body; the landing headline is 30px and the hero chart's numerals 40px; the never table stacks its rows.
- **The fit chart's** last column, slot value, needs about 680px of chart (a container query on the chart column, so it holds in both layouts); narrower, each show's slot value moves under its name as one line, such as "$8,000 a slot · sample".

## Elevation & Depth

Flat. No shadows anywhere. Depth comes from three layers only: the black top bar, Panel Grey for the selected row, the open question, and what waits to be kept or confirmed, and hairlines between rows and modules. A solid Press Black rule under the table header is the strongest line on the page. The top bar's menus open as flat white sheets hung from the bar, ruled in ink on three sides, and a dragged file rules the whole window in ink.

**The Flat Chart Rule.** Nothing floats. A thing that needs attention gets Panel Grey, an ink rule, or the black primary button, never a shadow, glow, or raised card.

## Shapes

Nearly square. Inputs, buttons, and code blocks use a 4px radius; chips and tags use 3px; a menu sheet rounds only its bottom corners, 4px. The only circle is the gainer bullet. A state's marker is an 8px square, never a dot. The fit band is a meter of three 5×12px bars, filled from the left (three for Strong, two for Good, one for Fair), always followed by the band's word. Movement uses the glyphs ▲, ▼, and =. A menu's chevron is two sides of a 5px square, turned down, and up while it's open.

## Components

Standard web controls, set small and square in the chart's palette; the chart row is the one signature component.

### Buttons

Plain, square-cornered, and quiet until one is the decision.

- **Shape:** 32px high, 12px side padding, a 4px radius, and a 1px border. On the landing page, 40px high with 16px padding at 14px.
- **Primary:** Press Black fill and border with white 600 text, for the decision on a module or page, such as Answer, Approve, Create account, Create invite link, or Open the sample network. Hover turns fill and border to Ink Hover over 120ms.
- **Secondary:** white with a Control Edge border and ink 500 text; hover darkens the border to Caption Grey.
- **Link-style:** a 12px 500 ink text button, underlined, for small inline actions such as going back, closing, dismissing, Revoke, Remove, Leave, or a table row's Delete.
- **Link as button:** a link that acts as a button, such as a download, takes the secondary button's shape with no underline.
- **States:** disabled buttons drop to 0.6 opacity and stop responding to hover; a button whose request is out says so, such as "Confirming…". Keyboard focus is a 2px solid Press Black outline at a 2px offset.

### Chips and source labels

Small uppercase tags that say what a thing is or where it came from.

- **Shape:** Label type (11px 600 uppercase, 0.08em) in Column Grey, a 1px Control Edge border, a 3px radius, 2px 6px padding, on white.
- **Source labels:** a Qloo data chip is solid; an Agent chip has a dashed Caption Grey border, so the two never read alike. The landing page's illustrations carry an Illustration chip where the app puts its Qloo data label.
- **Flags:** a mark that qualifies a finalist, such as "Listeners differ", an approved reply's chip, and an "Order approved" status take ink text and an ink border.
- **States:** a chip carrying a state, such as a roster row's match or a failed launch's status, takes the state's 8px square marker and color.
- **Counts and roles:** "You" beside the member's own name, "New" beside a link or key made this session, "Beta" on the usage module, and the setup checklist's "n of 5 done" are plain chips.

### Call numbers

Every cited Qloo call is set as its number, such as `C-21`, in the monospace stack at 12px 500. As a button that opens its evidence in the rail, it turns 600 and is underlined in Control Edge; the underline turns ink on hover and while its evidence is open. Mid-sentence it keeps the line's height so it reads like a word.

### Inputs and fields

Bordered white fields at button height, so a field and its action sit on one line.

- **Text inputs and selects:** 32px high, a 1px Control Edge border, a 4px radius, white, ink text with an ink caret, and Caption Grey placeholders. A field label sits above in 12px Caption Grey.
- **Textareas:** the same border and radius with 8px 10px padding, resizing vertically.
- **Radios and checkboxes:** native controls at 14px with an ink accent color; in the open question, each sits in a label row at least 26px high.
- **Prefixed fields:** a field with a fixed prefix, such as a currency sign, draws the border on a wrapper with the prefix in Caption Grey, and the focus ring goes on the wrapper.
- **Code fields:** a recovery code is typed in the monospace stack in capitals, as it was shown.
- **Invalid:** an insertion-order field that won't parse, or a tagged line's angle emptied, gets a 2px ink border, never red. An untagged line's empty angle takes a Caption Grey placeholder saying Qloo returned no shared tags.

### Top bar and navigation

The black shell: 48px of Press Black across the page with 32px gutters, the wordmark, then nav links filling the bar's height. Inactive links are Top Bar Nav at 500; hover and the current page turn white, and the current page also gets a 2px white underline. The network's name follows a 1px Ink Hover divider in Top Bar Meta at 12px. Focus on the bar is a white ring drawn 6px inside the link.

The app shell's two menus are `<details>` in the bar, each with a chevron:

- **The network switcher**, after the divider: the open network's name in Top Bar Meta (white while open or hovered), opening a sheet of the member's networks, the open one in Panel Grey and 600, then "New network" over a hairline.
- **The account menu**, at the bar's end: the member's name in Top Bar Nav, opening a sheet that says who's signed in, links "Your account", and holds Sign out.
- **The sheets:** white, at least 264px and at most 360px wide, ruled in ink on three sides with no top rule and a 4px radius at the bottom, items with 8px 16px padding that take Panel Grey on hover. On the sheet, focus takes the page's ink ring again. A click outside or Escape closes them.

### The three shells

Every page sits under one of three server-rendered shells, which share the bar:

- **Marketing:** the wordmark (a link home), then Developers (current on every docs page) and Sample network, and, while accounts are on, "Sign in" at the bar's end as a quiet white underlined link. A footer under a hairline says "Crossfeed, made for the Qloo Agentic Hackathon." with Privacy and Beta terms. No island.
- **Demo:** the wordmark, the network's name ("The Ringer · sample network"), the demo's sections (Roster, and Inbox while guest pitches are on), the sample notice in an 11px tag at the right, and, while accounts are on, "Create your network" at the bar's end in the same quiet link style.
- **App:** the wordmark, the network switcher, the network's sections (Dashboard, Roster, Inbox, Settings; a launch's page keeps Dashboard current), and the account menu. Sign-in and invite pages show only the wordmark.

A page whose code fails to load keeps its shell and says so in a failed state line ("This page didn't load (…). Reload to try again."), as a network page a member lost access to does, with its headline and a way out.

### Weekly Chart row

The signature: a printed chart's line, read left to right as position, last week, move, show, band, and value.

- **Position:** the fit rank in Position type, with a climber's 9px Chart Red bullet at its top right.
- **Last week:** the topic rank in Last week type and Last-Week Grey, or a dash when there's none.
- **Move:** ▲ and the places climbed in ink 700; ▼ and = in Caption Grey 600, with the move in words for screen readers.
- **Show:** the name in Row name type, wrapping rather than truncating, followed by chips such as Finalist; under it, the shared tags in Caption type and Column Grey with their call number. A climber's name is a button that opens its why line.
- **Band:** the three-segment meter followed by the band's word.
- **Slot value:** the dollars in 600 over the downloads they're priced from in 12px Caption Grey, right-aligned. Under about 680px of chart the column goes and the value moves under the name as one line.
- **Rows and header:** at least 64px with 8px cell padding (12px at the left edge), divided by hairlines, under 11px column headings on a Press Black rule. A show the run left out keeps its place with its name and position in Column Grey.
- **Why line:** the selected climber's row and the line under it share one Panel Grey block with no hairline between. The line is 12px Column Grey: "Why it moved" in ink Label type, then each claim behind its Agent or Qloo data chip, ending in the call number.

### Other tables

Every other table keeps the chart's rules at a working size.

- **Roster and inbox pitches:** 44px rows in Body type under the Press Black header rule; the selected row is Panel Grey, and a show set aside or a pitch with no work keeps its row with its name in Column Grey. An uploaded pitch lists its subject with its sender under it.
- **What Qloo returned:** a 12px secondary table under a 13px 600 caption, with a hairline under its headings, 5px row padding, and figures right-aligned.
- **Evidence record:** key-value rows, an 88px Caption Grey label beside its value, each row with 5px padding under a hairline, with request strings in the monospace stack. A record copied from the roster says "From the roster" and names the network's call.
- **Run log:** one 12px row per progress note, with 5px padding under a hairline, a failed note's text in 600; the run on view in the runs list is Panel Grey, and each run names who started it.
- **Insertion order:** rows with 6px padding under a Press Black header rule, quantities and amounts right-aligned, and the total in 13px 700 ink under a solid ink rule. An approved order says who approved it and when. A line Qloo returned no shared tags for shows "No angle: Qloo returned no shared tags." in Caption type and Column Grey in the angle's place, with its compare's call.
- **Replies:** one per pitch, divided by hairlines with 12px padding, never boxed. A reply with no angle shows the same no-angle line above its "Shares with" line.
- **Members, API keys, invite links, passkeys, and networks:** working-size tables under the black rule, each row's actions as link-style buttons at its end; a row whose action waits on a yes (Remove, Leave, Revoke, Delete) takes Panel Grey with the ask under it, the ask's words kept to 52ch, a black button, and a link-style way back.

### Open question module

The agent's one voice on the page: a Panel Grey block atop the rail, on the rail's hairline and bled to the window's edge, with 16px vertical and 24px leading padding. The question is in Title type, then a help line, any options as radios, the answer field, and the primary Answer button. Below 960px it spans the page, bled to both edges, before the chart, with its contents kept to 560px.

### Run module notes

The Run module ends with Claude's closing line behind its Agent chip, kept as written. When an edit has changed what it describes, a code-written help line follows it in 12px Column Grey: "The insertion order has changed since Claude drafted it: its lines and total are the current figures." on a launch, or "The replies have changed since Claude drafted them: each reply as listed is the current one." on the inbox.

### State lines

A state reads as one line: its 8px square marker and word in Label type and the state's color, then the sentence in ink, at 12px. Slow is Slow Amber, failed and error are Fault Rust, and missed is Missed Slate. Loading shows "Working" in Column Grey; an empty state is a 13px Column Grey sentence with no word, such as "No launches yet." on the dashboard or "No roster yet." on the roster page.

### Landing page sections

The landing page is the chart's key: one illustrative chart of a made-up true-crime launch, Lantern Hollow, with a key that says what each piece of notation decides. Every illustration uses made-up shows and carries the Illustration chip; no Qloo data, customer, quote, figure, or price appears.

1.  **Header:** the hook, "Rank your roster by who listens, not by topic.", in Display type, the lede, the black "Open the sample network" (first and most prominent), "Create your network" as a secondary button while accounts are on, and a 12px note that it needs no sign-in and isn't affiliated with The Ringer.
2.  **The chart and its key:** the hero chart at hero scale, a history show climbing to 2nd with its red bullet landing on load and its why line open in Panel Grey; the key down the rail, each entry led by its real glyph (a position, a last-week figure, a move, the bullet, the band meter, the Finalist chip, a call number).
3.  **How a run works:** three numbered steps under a black rule (name the launch, answer at each fork, approve the order), each beside the piece of the app it shows: the roster's matches, the agent's question, the insertion order draft.
4.  **The booking inbox** (while guest pitches are on): one ranked list of pitched works in the wide column and its words in the rail.
5.  **Evidence on every line:** the Qloo data and Agent chips with what each marks, beside an evidence record.
6.  **What Crossfeed never does:** a two-column table under the black rule, each "never" in 15px 600 beside what it does instead; it stacks on a phone.
7.  **For developers:** the four ways in (REST API, TypeScript SDK, MCP server, skills and plugin) as record rows, "Read the developer docs", and the stack as a record in the rail.
8.  **The way in again:** "Try it on a real roster." with the same buttons, then the footer.

### Sign-in and the recovery code

The sign-in page sets "Sign in" (one black "Sign in with a passkey", and "Use a recovery code" as a link-style button that swaps in the code field) and "Create an account" (a name, then the black "Create account") side by side under the page's headline and Press Black rule. When the browser can't make or use a passkey, or the prompt closes, a failed state line says what to do next. The recovery code is then shown once, in Recovery code type on Panel Grey with 16px 24px padding (12px 16px on a phone), selected whole by a click, with "Copy code" and the black "I've saved it"; the headline takes focus, so a screen reader starts there. The invite page uses the same column: "Join <network>", then either the two ways in or, when signed in, one black "Join <network>" with a way to sign out.

### Dashboard

The network's front matter, not a SaaS home: no tiles, welcome cards, or sidebar.

- **Header:** the network's name in Headline type, with the "New launch" form inline (Released, or Unreleased from comps, the name or comps, and the black New launch).
- **Launches table:** Launch, Status, Finalists, Slots, Slot value, Last run, and Actions, at least 760px wide and scrolling in its frame on a phone. A launch's name is its page's link, in 14px 600 underlined in Control Edge (ink on hover), and wraps; the status is a chip ("Order approved" flagged in ink, a failed one with its marker); Last run gives the day and who started it, wrapping to two lines; Delete asks first in a Panel Grey row naming an approved order. With no launches, the table's one row says so in a sentence.
- **Network lines:** record rows for the roster (its matches, such as "19 shows: 16 matched, 1 to settle, 2 not in Qloo"), the inbox, and the CPM, each with Open, Set, or Change (View, for a member, where only an owner changes it).
- **Setup checklist:** reads like the guide: a "Setup" Label with its "n of 5 done" chip and Dismiss, then five numbered steps (import the roster, set the CPM, plan a launch, invite a teammate, create an API key), each still to do in ink 600 with how under it and a link, each done in Column Grey with "Done". It ticks itself off as the network changes.

### Roster and inbox uploads

The import and load forms keep the paste field and the black Import or Load button, with a secondary "Upload a file" or "Upload files" beside them and a help line saying what each file needs. A file dragged anywhere over the page rules the whole window with a 2px ink frame, as keyboard focus is, with a white line along its foot, under a 1px ink rule, in 600, saying what a drop imports or loads; while an import runs, the frame goes and the line alone says to wait, and a drop does nothing. A refused upload says why in a failed state line under the form; an email skipped as too long is named on a "Skipped" line. The roster page has no launch header, chart, or guide, and starts an empty roster with "Start from the sample roster"; the sample roster's notice names The Ringer where the help line would be.

### Settings and account modules

One module per job down one column, each a Label heading and what it's for beside its fields, divided by hairlines: on settings, Network (name and CPM), Members (with Invite links under it), API keys, Qloo key, Usage (marked Beta), and Danger zone; on the account page, Name, Passkeys, Recovery code, Sessions, Networks, and Delete account. A member sees what only an owner changes read-only, with a line saying so.

- **Shown once:** a new invite link or API key sits on Panel Grey in a read-only field that selects itself, with Copy and a line on what to do with it; a key is set in the monospace stack.
- **Asks:** what needs a yes outside a table, such as signing out everywhere, sits on Panel Grey under its action with a black button and a link-style way back. A step-up asks for the passkey through the browser's own prompt, or, in a browser signed in with a recovery code, for the code in place on Panel Grey with Confirm and Cancel.
- **Usage:** today's model runs and Qloo calls as record rows, each count in 600 against its cap, then when they reset (00:00 UTC, how long from now, and the browser's own time).
- **Qloo key:** the host as two radios with each host's address under it, the key's field, and "Test and save key"; once saved, the host and its last four characters in the monospace stack, with Remove key asking first.
- **Danger zone:** the network's name typed exactly enables Delete network.

### Developer docs pages

Documentation framed by the Weekly Chart, in Read mode: the contents rail lists "Developer docs" and the five pages (Overview, REST API, TypeScript SDK, MCP server, Skills and plugin), the page on view in Panel Grey with its sections under it, then a record of the API's base, OpenAPI, MCP, auth, and llms.txt in the monospace stack. The reading column opens with the page's title and a lede, then sections under hairlines. References are set as the app sets its tables and records: the four ways in, routes, tools, error codes, and limits under the black rule; a route's parameters and answers as evidence records; HTTP methods as chips. Code sits on Panel Grey under a Label naming its language or file. "Next" at the foot carries the reader on. No bullet appears, since nothing ranks.

## Do's and Don'ts

### Do

- **Do** lead every ranking with its position and band, and keep raw affinity in the evidence record ([PRODUCT.md](PRODUCT.md#constraints)).
- **Do** mark agent text and Qloo data with a small Label-style tag where they appear, and set the cited Qloo call number beside any claim.
- **Do** label sample figures in place, in Caption type beside the figure, and illustrations with the Illustration chip.
- **Do** set every number in tabular figures, right-aligned in money and download columns.
- **Do** use standard controls: tabs, sortable table headers, radios, text inputs, buttons, and `<details>` menus, with visible keyboard focus.
- **Do** put what must be kept or copied on Panel Grey, in the monospace stack where it's data, shown once.
- **Do** let a wide table scroll in its own frame on a phone, never the page.

### Don't

- **Don't** build a generic AI chat app: no transcript-and-sidebar layout. The agent speaks through the open-question module and short labelled lines.
- **Don't** build a BI dashboard: no KPI tile row, donut charts, or chart cards, on the dashboard or anywhere else.
- **Don't** clone a spreadsheet: no gridlines on every cell and no cell-editing look.
- **Don't** use Chart Red for anything but the gainer bullet.
- **Don't** show a bare affinity decimal in the chart or rail.
- **Don't** put Qloo data, invented customers, quotes, figures, or prices on the marketing pages.
- **Don't** use purple gradients, frosted glass, emoji icons, cards inside cards, pill buttons, or shadowed menus.
- **Don't** remove focus outlines.

## Sources

- **Shipped build:** the tokens were derived on 2026-10-17 from `apps/src/style.css` and `apps/src/client`, and checked against the deployed Worker's computed styles at 1440, 900, and 375px. The product's surfaces were added on 2026-10-22 from the same file, `apps/src/shell.tsx`, `apps/src/routes/marketing.tsx`, and `apps/src/routes/docs.tsx`, and checked on the dev server at 1440, 720, 375, and 320px.
- **Direction round:** on 2026-10-17 the user chose The Weekly Chart over the rolled Traffic Copy Set, the Gate Board challenger, and the category standard. The chosen first viewport is the [sketch](/.impeccable/mocks/decision/model-pick.html), and its direction contract is in the [surface brief](/.impeccable/surfaces/apps-src-index-tsx.md).
- **Product surface briefs:** the [landing page](/.impeccable/surfaces/apps-src-routes-marketing-tsx.md) (the chart, annotated), the [dashboard and settings](/.impeccable/surfaces/apps-src-client-dashboard-tsx.md) (the workspace's grammar applied to the network), the [roster page](/.impeccable/surfaces/apps-src-client-roster-tsx.md) (an extension of the workspace), and the [developer docs](/.impeccable/surfaces/apps-src-routes-docs-tsx.md) (the chart index).
- **User constraints:** on 2026-10-17, the user ruled out a generic AI chat app, a BI dashboard, and a spreadsheet clone, and asked that mkdir.directory serve as a source of references rather than a look to copy. The product spec, [#155](https://github.com/m1kuorg/qloo/issues/155), kept the product in this world: tables under the Press Black rule, hairline modules, Panel Grey for the selected row, and black buttons only for the page's decision.
- **[mkdir.directory research](/docs/sources/mkdir.directory/design-research.md):** its rule-separated ranked list with a tabular rank cell supports the chart rows. Its removed focus outlines are the reason for the last Don't. Inspora's agent dashboards and SaaS Landing Page's devtools and B2B tags are the galleries to mine next. None of the galleries it could fetch collects in-app screens.
- **[X research](/docs/sources/x.com/design-research.md):** tabular figures for stacked numbers, quiet type and spacing in dense B2B tools, numbers bound to data and never to the model's narration, evidence grouped under each item, questions only at real forks, and the list of AI-slop tells in the Don'ts.

## See also

- [PRODUCT.md](PRODUCT.md), [PRD](PRD.md), and [TRD](TRD.md)
- [DESIGN.md format spec](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md)
