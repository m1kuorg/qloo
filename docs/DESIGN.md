---
name: Crossfeed
description: A podcast network's roster ranked like this week's chart, by how much each show's listeners overlap a launch's.
---

<!-- SEED: established with the user before implementation; re-run $impeccable document once there's code to capture the actual tokens and components. -->

# Design system: Crossfeed

This is Crossfeed's visual system, chosen on 2026-10-17 before any UI exists. It records the world, its values, and its guardrails so agents building the launch workspace stay on-brand; [PRODUCT.md](PRODUCT.md) owns what the product does. It is a seed: re-run `$impeccable document` once the workspace is built, to replace the values below with the shipped tokens and add components.

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
1.  [Do's and Don'ts](#dos-and-donts)
    1.  [Do](#do)
    1.  [Don't](#dont)
1.  [Sources](#sources)
1.  [See also](#see-also)

## Overview

**Creative North Star: "The Weekly Chart"**

Crossfeed sets a network's roster as this week's chart. Fit rank is the new position, the rank a topic-only planner would give is last week's, and the moves Qloo caused are the news. A programmer reads the chart the way the music and podcast industries already read Billboard and the podcast rankers: position first, then movement, then why. The world lends four things only: type, palette, density, and one signature move. Layout, navigation, and controls stay standard web components, because this is a working screen and the programmer should know where everything is before they notice the world.

The screen is light, because its scene is a head of programming at a desk in a daylit office, planning one launch between meetings, so there is no dark theme: the screen is light only, and tells the browser so with `color-scheme: light`. It is dense but not cramped: tall chart rows give the position numerals room, while everything around them stays small, quiet, and set in tabular figures. Agent text and Qloo data never blend; each is labelled where it appears, and every claim cites the Qloo call behind it.

The signature move is **chart movement**: a show that climbs three or more places over its topic rank gets a red bullet beside its position, and the selected climber opens an inline "why it moved" line that cites its Qloo call. This is the demo's decisive moment drawn as chart notation, not as a tile or a chat message. In motion, the move lands like a mark made on the printed chart: when the topic column arrives, last week's figures and the moves fade in over 200ms, then each climber's bullet lands beside its position, shrinking from 2.4 times its size as it fades in, over 320ms and 60ms after the climber above it. The why line fades in over 200ms. Everything else moves only to acknowledge: 120ms color changes on hover and press, and 200ms for a row taking Panel Grey. Every curve eases out, the bullet's on `cubic-bezier(0.16, 1, 0.3, 1)`; nothing bounces or loops. With reduced motion, the bullets fade in with the figures, with no scale and no stagger.

**Key Characteristics:**

- Heavy condensed position numerals carry the hierarchy; everything else is one plain grotesque.
- White ground, near-black ink, a black top bar, and one red with one job.
- Rank and band before raw score; raw affinity lives only in the evidence record.
- Hairline row rules under a solid black header rule; no cards, tiles, or shadows.
- Every agent line and every Qloo figure says which it is, and cites a call number such as `C-07`.

## Colors

A restrained palette: neutrals on white, the black top bar as the one committed field, and chart red reserved for the bullet. Values come from the chosen direction sketch and are provisional until the build confirms them.

### Primary colors

- **Chart Red** (#e3262e): the gainer bullet, a 9px dot beside the position numeral of a show that climbed three or more places over topic rank, and its legend. 4.58:1 on white.

### Neutral colors

- **Chart White** (#ffffff): page ground, table rows, and controls.
- **Press Black** (#111111): body ink, the top bar, the table's header rule, primary buttons, filled band segments, and totals. 18.88:1 on white.
- **Column Grey** (#555555): secondary text such as comps, help lines, and column headings. 7.46:1 on white.
- **Caption Grey** (#6b6b6b): captions, tags under a show name, field labels, and placeholders. 5.33:1 on white and 4.76:1 on Panel Grey.
- **Last-Week Grey** (#8a8a8a): last-week (topic rank) numerals only, at 24px or larger. 3.45:1 passes as large text only.
- **Panel Grey** (#f2f2f2): the selected chart row with its "why it moved" line, and the agent's open question. A table has one selected row at a time: in the roster, the show open in the show editor or, with none open, the show whose evidence is open.
- **Hairline** (#e6e6e6): row rules and section dividers.
- **Control Edge** (#d4d4d4): input, button, and chip borders.
- **Empty Segment** (#dcdcdc): unfilled band-meter segments; decorative, so the band's word label is always shown.
- **Top Bar Text** (#a3a3a3 inactive nav, #b5b5b5 meta): text on Press Black, 7.49:1 and 9.21:1.

### State colors

Provisional, from #42. Each colors only a state's 8px square marker and its word, such as "Slow Qloo", set in Label type before the sentence that explains it, or a roster row's match chip. The sentence stays in ink. Loading ("Working") and empty states stay neutral, in Column Grey.

- **Slow Amber** (#8a6100): a Qloo call still waiting past 8 seconds, the TRD's worst case. 5.54:1 on white and 4.95:1 on Panel Grey.
- **Fault Rust** (#a34700): a Qloo call that failed after its retries or at the daily cap, and any other error. 6.07:1 on white and 5.42:1 on Panel Grey.
- **Missed Slate** (#2f5d8a): a match Qloo doesn't have. 6.88:1 on white and 6.14:1 on Panel Grey.

### Color rules

**The One Bullet Rule.** Chart Red marks a climb of three or more places, and the legend that explains it, and nothing else: not errors, links, buttons, falls, or emphasis. If a screen has no climbers, it shows neither the bullet nor its legend.

**The Word First Rule.** A state always shows its word, so no state is told by color alone, and no state color is Chart Red or a red.

**The Black Shell Rule.** Press Black fills only the top bar and primary action buttons, such as answering the agent and approving the order. No other region is filled black, so the bar reads as the shell and a black button reads as a decision.

## Typography

**Display Font:** Barlow Condensed (with sans-serif)\
**Body Font:** Libre Franklin (with sans-serif)\
**Label/Mono Font:** the system monospace stack (`ui-monospace, SFMono-Regular, Menlo, monospace`), for request strings in evidence and keyboard hints only

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
- **Label** (Libre Franklin 600, 11px, 0.08em, uppercase): module headings and chips.

Nothing functional is set below 11px.

### Type rules

**The Numerals Speak Rule.** Barlow Condensed sets rank numerals and the wordmark only. Headings, names, and buttons stay in Libre Franklin, so big type always means a position on the chart.

## Layout

The spatial grammar is a black top bar over a light work area split in two: the chart is the wide primary column, and a narrower rail beside it holds the agent's open question, the evidence for the selected row, and the draft. The chart's rows are tall so position numerals can be big; everything around them is compact. Modules divide by hairlines, never by boxes, with more space above a heading than below it.

Exact measurements are [to be resolved during implementation]. The chosen sketch, at 1440px, used these provisional values: 32px page gutters, a 48px top bar, a 448px rail that begins after a 24px gap, a hairline, and 24px of inner padding, 64px chart rows, 28px rows in secondary tables, and 32px toolbar controls, on mostly 4, 8, 12, 16, 24, and 32px steps.

Responsive behavior keeps one guardrail: at every width the position, move, and show name stay visible, and the agent's open question stays reachable without scrolling past the whole chart. So the open question comes before the chart in reading order, and the grid sets it atop the rail. The rail is 448px wide from a 1400px window and narrows to 320px below that (`clamp(320px, 32vw, 448px)`), so the chart keeps room for show names. Below 960px the page is one column: the open question, the chart, then the rest of the rail, with the question's fields kept to 560px. Below 600px the gutters drop to 16px, the top bar wraps its sample notice under the nav and drops the network's name, which the notice repeats, the launch header stacks, the chart's topic columns tighten and its names wrap, and the roster table scrolls sideways in its own frame, so the page itself never does.

## Elevation & Depth

Flat. No shadows anywhere. Depth comes from three layers only: the black top bar, Panel Grey for the selected row and the open question, and hairlines between rows and modules. A solid Press Black rule under the table header is the strongest line on the page.

**The Flat Chart Rule.** Nothing floats. A thing that needs attention gets Panel Grey or the black primary button, never a shadow, glow, or raised card.

## Shapes

Nearly square. Inputs and buttons use a 4px radius; chips, tags, and keyboard hints use 3px. The only circle is the 9px gainer bullet. The fit band is a meter of three 5×12px bars, filled from the left (three for Strong, two for Good, one for Fair), always followed by the band's word. Movement uses the glyphs ▲, ▼, and =.

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

- **Direction round:** on 2026-10-17 the user chose The Weekly Chart over the rolled Traffic Copy Set, the Gate Board challenger, and the category standard. The chosen first viewport is the [sketch](/.impeccable/mocks/decision/model-pick.html), and its direction contract is in the [surface brief](/.impeccable/surfaces/apps-src-index-tsx.md).
- **User constraints:** the same day, the user ruled out a generic AI chat app, a BI dashboard, and a spreadsheet clone, and asked that mkdir.directory serve as a source of references rather than a look to copy.
- **[mkdir.directory research](/docs/sources/mkdir.directory/design-research.md):** its rule-separated ranked list with a tabular rank cell supports the chart rows. Its removed focus outlines are the reason for the last Don't. Inspora's agent dashboards and SaaS Landing Page's devtools and B2B tags are the galleries to mine next. None of the galleries it could fetch collects in-app screens.
- **[X research](/docs/sources/x.com/design-research.md):** tabular figures for stacked numbers, quiet type and spacing in dense B2B tools, numbers bound to data and never to the model's narration, evidence grouped under each item, questions only at real forks, and the list of AI-slop tells in the Don'ts.

## See also

- [PRODUCT.md](PRODUCT.md), [PRD](PRD.md), and [TRD](TRD.md)
- [DESIGN.md format spec](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md)
