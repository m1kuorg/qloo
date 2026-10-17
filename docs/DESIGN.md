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
  headline:
    fontFamily: 'Libre Franklin, sans-serif'
    fontSize: 22px
    fontWeight: 700
    lineHeight: 28px
    letterSpacing: -0.01em
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
rounded:
  control: 4px
  chip: 3px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
  gutter-phone: 16px
  rail: 448px
  rail-min: 320px
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

This is Crossfeed's visual system, derived on 2026-10-17 from the shipped build. It records the world, its tokens, its components, and its guardrails so agents extending the launch workspace and the inbox stay on-brand; [PRODUCT.md](PRODUCT.md) owns what the product does. The frontmatter tokens are normative, and `apps/src/style.css` holds them as custom properties on `:root`.

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
1.  [Elevation & Depth](#elevation--depth)
1.  [Shapes](#shapes)
1.  [Components](#components)
    1.  [Buttons](#buttons)
    1.  [Chips and source labels](#chips-and-source-labels)
    1.  [Call numbers](#call-numbers)
    1.  [Inputs and fields](#inputs-and-fields)
    1.  [Top bar and navigation](#top-bar-and-navigation)
    1.  [Weekly Chart row](#weekly-chart-row)
    1.  [Other tables](#other-tables)
    1.  [Open question module](#open-question-module)
    1.  [State lines](#state-lines)
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

**Key Characteristics:**

- Heavy condensed position numerals carry the hierarchy; everything else is one plain grotesque.
- White ground, near-black ink, a black top bar, and one red with one job.
- Rank and band before raw score; raw affinity lives only in the evidence record.
- Hairline row rules under a solid black header rule; no cards, tiles, or shadows.
- Every agent line and every Qloo figure says which it is, and cites a call number such as `C-07`.

## Colors

A restrained palette: neutrals on white, the black top bar as the one committed field, and chart red reserved for the bullet. Each color below names its custom property in `apps/src/style.css`; colors with none are written as literals there.

### Primary colors

- **Press Black** (#111111, `--ink`): body ink, the top bar, primary buttons, the table's header rule, filled band segments, totals, the keyboard focus ring, and text selection. 18.88:1 on white. The `primary` token is Press Black, and Chart Red is never a primary-action color.
- **Chart Red** (#e3262e, `--red`): the gainer bullet, a 9px dot beside the position numeral of a show that climbed three or more places over topic rank, and its legend. 4.58:1 on white.

### Neutral colors

- **Chart White** (#ffffff): page ground, table rows, controls, chips, and text on Press Black.
- **Ink Hover** (#333333): Press Black's hover, on a primary button's fill and border, and the top bar's divider before the network's name. White on it is 12.63:1.
- **Column Grey** (#555555, `--mid`): secondary text such as comps, help lines, tags under a show name, chip text, the why line, and column headings. 7.46:1 on white.
- **Caption Grey** (#6b6b6b, `--grey`): captions, field labels, placeholders, sample labels, the ▼ and = move glyphs, and the agent chip's dashed border. 5.33:1 on white and 4.76:1 on Panel Grey.
- **Last-Week Grey** (#8a8a8a, `--topic`): last-week (topic rank) numerals only, at 24px or larger. 3.45:1 on white and 3.08:1 on Panel Grey in a selected row, so it passes as large text only.
- **Panel Grey** (#f2f2f2, `--panel`): the selected chart row with its "why it moved" line, the agent's open question, the show editor, and the run on view. A table has one selected row at a time: in the roster, the show open in the show editor or, with none open, the show whose evidence is open; in the inbox, the pitch open in the rail.
- **Hairline** (#e6e6e6, `--line`): row rules and section dividers.
- **Control Edge** (#d4d4d4, `--edge`): input, button, and chip borders, a call number's underline, and the rule over a module's form fields.
- **Empty Segment** (#dcdcdc, `--empty`): unfilled band-meter segments; decorative, so the band's word label is always shown.
- **Top Bar Nav** (#a3a3a3): inactive nav links on Press Black, 7.49:1.
- **Top Bar Meta** (#b5b5b5): the network's name and the sample tag on Press Black, 9.21:1.

### State colors

Each colors only a state's 8px square marker and its word, such as "Slow Qloo", set in Label type before the sentence that explains it, or a roster row's match chip. The sentence stays in ink. Loading ("Working") and empty states stay neutral, in Column Grey.

- **Slow Amber** (#8a6100, `--slow`): a Qloo call still waiting past 8 seconds, the TRD's worst case. 5.54:1 on white and 4.95:1 on Panel Grey.
- **Fault Rust** (#a34700, `--fault`): a Qloo call that failed after its retries or at the daily cap, and any other error. 6.07:1 on white and 5.42:1 on Panel Grey.
- **Missed Slate** (#2f5d8a, `--missed`): a match Qloo doesn't have. 6.88:1 on white and 6.14:1 on Panel Grey.

### Color rules

**The One Bullet Rule.** Chart Red marks a climb of three or more places, and the legend that explains it, and nothing else: not errors, links, buttons, falls, or emphasis. If a screen has no climbers, it shows neither the bullet nor its legend.

**The Word First Rule.** A state always shows its word, so no state is told by color alone, and no state color is Chart Red or a red.

**The Black Shell Rule.** Press Black fills only the top bar and primary action buttons, such as answering the agent and approving the order. No other region is filled black, so the bar reads as the shell and a black button reads as a decision.

## Typography

**Display Font:** Barlow Condensed (with sans-serif)\
**Body Font:** Libre Franklin (with sans-serif)\
**Label/Mono Font:** the system monospace stack (`ui-monospace, SFMono-Regular, Menlo, monospace`), for call numbers such as `C-21` and request strings in evidence only

**Character:** Condensed chart numerals against a sober news grotesque, the pairing of a printed chart page. All figures use tabular numerals (`font-variant-numeric: tabular-nums`) so ranks, downloads, and dollars line up in columns and don't jitter when values change.

### Type hierarchy

- **Position** (Barlow Condensed 800, 40px, line-height 1): fit rank in the chart's first column.
- **Last week** (Barlow Condensed 600, 24px, line-height 1, Last-Week Grey): topic rank in the second column.
- **Wordmark** (Barlow Condensed 800, 22px, uppercase, 0.02em): "Crossfeed" in the top bar.
- **Headline** (Libre Franklin 700, 22px/28px, -0.01em): the launch title.
- **Title** (Libre Franklin 600, 15px/20px): the agent's open question.
- **Row name** (Libre Franklin 600, 14px): show names in the chart.
- **Body** (Libre Franklin 400, 13px/1.4): default text and table cells.
- **Caption** (Libre Franklin 400, 12px): tags under show names, evidence values, help lines, and table captions.
- **Column heading** (Libre Franklin 600, 11px, 0.06em, uppercase): table column headings.
- **Label** (Libre Franklin 600, 11px, 0.08em, uppercase): module headings, chips, and state words.
- **Call number** (monospace 500, 12px): a cited Qloo call, 600 when it's a button.

Nothing functional is set below 11px.

### Type rules

**The Numerals Speak Rule.** Barlow Condensed sets rank numerals and the wordmark only. Headings, names, and buttons stay in Libre Franklin, so big type always means a position on the chart.

## Layout

The spatial grammar is a black top bar over a light work area split in two: the chart is the wide primary column, and a narrower rail beside it holds the agent's open question, the evidence for the selected row, and the draft. The chart's rows are tall so position numerals can be big; everything around them is compact. Modules divide by hairlines, never by boxes, with more space above a heading than below it.

The shipped measurements: 32px page gutters, a 48px top bar, and a rail `clamp(320px, 32vw, 448px)` wide that begins after a 24px gap, a hairline, and 24px of inner padding, so at 1440px the chart column is 904px and the rail 448px. Fit chart rows are at least 64px, roster and inbox rows 44px (taller with two-line content), secondary tables (the evidence record, the run log, and what Qloo returned) about 28px from 5px row padding, and insertion order rows use 6px padding. Toolbar controls are 32px high. Spacing keeps to 4, 8, 12, 16, 24, and 32px steps.

Responsive behavior keeps one guardrail: at every width the position, move, and show name stay visible, and the agent's open question stays reachable without scrolling past the whole chart. So the open question comes before the chart in reading order, and the grid sets it atop the rail. The rail is 448px wide from a 1400px window and narrows to 320px below that, so the chart keeps room for show names. Below 960px the page is one column: the open question, the fit chart, the rail, then the roster, so the evidence and the order to approve follow the chart; the question's fields keep to 560px. Below 600px the gutters drop to 16px, the top bar wraps its sample notice under the nav and drops the network's name, which the notice repeats, the launch header stacks, the chart's topic columns tighten and its names wrap, and the roster and the inbox's pitch table each scroll sideways at a 640px minimum in their own frame, so the page itself never does; the inbox's past-guest rows fold into two columns. The fit chart's last column, slot value, needs about 680px of chart (a container query on the chart column, so it holds in both layouts); narrower, each show's slot value moves under its name as one line, such as "$8,000 a slot · sample".

## Elevation & Depth

Flat. No shadows anywhere. Depth comes from three layers only: the black top bar, Panel Grey for the selected row and the open question, and hairlines between rows and modules. A solid Press Black rule under the table header is the strongest line on the page.

**The Flat Chart Rule.** Nothing floats. A thing that needs attention gets Panel Grey or the black primary button, never a shadow, glow, or raised card.

## Shapes

Nearly square. Inputs and buttons use a 4px radius; chips and tags use 3px. The only circle is the 9px gainer bullet. A state's marker is an 8px square, never a dot. The fit band is a meter of three 5×12px bars, filled from the left (three for Strong, two for Good, one for Fair), always followed by the band's word. Movement uses the glyphs ▲, ▼, and =.

## Components

Standard web controls, set small and square in the chart's palette; the chart row is the one signature component.

### Buttons

Plain, square-cornered, and quiet until one is the decision.

- **Shape:** 32px high, 12px side padding, a 4px radius, and a 1px border.
- **Primary:** Press Black fill and border with white 600 text, for the decision on a module, such as Answer or Approve. Hover turns fill and border to Ink Hover over 120ms.
- **Secondary:** white with a Control Edge border and ink 500 text; hover darkens the border to Caption Grey.
- **Link-style:** a 12px 500 ink text button, underlined, for small inline actions such as going back, closing, or dismissing.
- **Link as button:** a link that acts as a button, such as a download, takes the secondary button's shape with no underline.
- **States:** disabled buttons drop to 0.6 opacity and stop responding to hover. Keyboard focus is a 2px solid Press Black outline at a 2px offset.

### Chips and source labels

Small uppercase tags that say what a thing is or where it came from.

- **Shape:** Label type (11px 600 uppercase, 0.08em) in Column Grey, a 1px Control Edge border, a 3px radius, 2px 6px padding, on white.
- **Source labels:** a Qloo data chip is solid; an Agent chip has a dashed Caption Grey border, so the two never read alike.
- **Flags:** a mark that qualifies a finalist, such as "Listeners differ", and an approved reply's chip, take ink text and an ink border.
- **States:** a chip carrying a state, such as a roster row's match, takes the state's 8px square marker and color.

### Call numbers

Every cited Qloo call is set as its number, such as `C-21`, in the monospace stack at 12px 500. As a button that opens its evidence in the rail, it turns 600 and is underlined in Control Edge; the underline turns ink on hover and while its evidence is open. Mid-sentence it keeps the line's height so it reads like a word.

### Inputs and fields

Bordered white fields at button height, so a field and its action sit on one line.

- **Text inputs and selects:** 32px high, a 1px Control Edge border, a 4px radius, white, ink text with an ink caret, and Caption Grey placeholders.
- **Textareas:** the same border and radius with 8px 10px padding, resizing vertically.
- **Radios and checkboxes:** native controls at 14px with an ink accent color; in the open question, each sits in a label row at least 26px high.
- **Prefixed fields:** a field with a fixed prefix, such as a currency sign, draws the border on a wrapper with the prefix in Caption Grey, and the focus ring goes on the wrapper.
- **Invalid:** an insertion-order field that won't parse gets a 2px ink border, never red.

### Top bar and navigation

The black shell: 48px of Press Black across the page with 32px gutters, the wordmark, then nav links filling the bar's height. Inactive links are Top Bar Nav at 500; hover and the current page turn white, and the current page also gets a 2px white underline. The network's name follows a 1px Ink Hover divider in Top Bar Meta at 12px, and the sample notice sits at the right in an 11px tag. Focus on the bar is a white ring drawn 6px inside the link. Below 600px the bar wraps: the nav moves right, the notice drops under it, and the network's name is hidden.

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

- **Roster and inbox pitches:** 44px rows in Body type under the Press Black header rule; the selected row is Panel Grey, and a show set aside or a pitch with no work keeps its row with its name in Column Grey.
- **What Qloo returned:** a 12px secondary table under a 13px 600 caption, with a hairline under its headings, 5px row padding, and figures right-aligned.
- **Evidence record:** key-value rows, an 88px Caption Grey label beside its value, each row with 5px padding under a hairline, with request strings in the monospace stack.
- **Run log:** one 12px row per progress note, with 5px padding under a hairline, a failed note's text in 600; the run on view in the session's list is Panel Grey.
- **Insertion order:** rows with 6px padding under a Press Black header rule, quantities and amounts right-aligned, and the total in 13px 700 ink under a solid ink rule.
- **Replies:** one per pitch, divided by hairlines with 12px padding, never boxed.

### Open question module

The agent's one voice on the page: a Panel Grey block atop the rail, on the rail's hairline and bled to the window's edge, with 16px vertical and 24px leading padding. The question is in Title type, then a help line, any options as radios, the answer field, and the primary Answer button. Below 960px it spans the page, bled to both edges, before the chart, with its contents kept to 560px.

### State lines

A state reads as one line: its 8px square marker and word in Label type and the state's color, then the sentence in ink, at 12px. Slow is Slow Amber, failed and error are Fault Rust, and missed is Missed Slate. Loading shows "Working" in Column Grey; an empty state is a 13px Column Grey sentence with no word.

## Do's and Don'ts

### Do

- **Do** lead every ranking with its position and band, and keep raw affinity in the evidence record ([PRODUCT.md](PRODUCT.md#constraints)).
- **Do** mark agent text and Qloo data with a small Label-style tag where they appear, and set the cited Qloo call number beside any claim.
- **Do** label sample figures in place, in Caption type beside the figure.
- **Do** set every number in tabular figures, right-aligned in money and download columns.
- **Do** use standard controls: tabs, sortable table headers, radios, text inputs, and buttons, with visible keyboard focus.

### Don't

- **Don't** build a generic AI chat app: no transcript-and-sidebar layout. The agent speaks through the open-question module and short labelled lines.
- **Don't** build a BI dashboard: no KPI tile row, donut charts, or chart cards.
- **Don't** clone a spreadsheet: no gridlines on every cell and no cell-editing look.
- **Don't** use Chart Red for anything but the gainer bullet.
- **Don't** show a bare affinity decimal in the chart or rail.
- **Don't** use purple gradients, frosted glass, emoji icons, cards inside cards, or pill buttons.
- **Don't** remove focus outlines.

## Sources

- **Shipped build:** the tokens were derived on 2026-10-17 from `apps/src/style.css` and `apps/src/client`, and checked against the deployed Worker's computed styles at 1440, 900, and 375px.
- **Direction round:** on 2026-10-17 the user chose The Weekly Chart over the rolled Traffic Copy Set, the Gate Board challenger, and the category standard. The chosen first viewport is the [sketch](/.impeccable/mocks/decision/model-pick.html), and its direction contract is in the [surface brief](/.impeccable/surfaces/apps-src-index-tsx.md).
- **User constraints:** the same day, the user ruled out a generic AI chat app, a BI dashboard, and a spreadsheet clone, and asked that mkdir.directory serve as a source of references rather than a look to copy.
- **[mkdir.directory research](/docs/sources/mkdir.directory/design-research.md):** its rule-separated ranked list with a tabular rank cell supports the chart rows. Its removed focus outlines are the reason for the last Don't. Inspora's agent dashboards and SaaS Landing Page's devtools and B2B tags are the galleries to mine next. None of the galleries it could fetch collects in-app screens.
- **[X research](/docs/sources/x.com/design-research.md):** tabular figures for stacked numbers, quiet type and spacing in dense B2B tools, numbers bound to data and never to the model's narration, evidence grouped under each item, questions only at real forks, and the list of AI-slop tells in the Don'ts.

## See also

- [PRODUCT.md](PRODUCT.md), [PRD](PRD.md), and [TRD](TRD.md)
- [DESIGN.md format spec](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md)
