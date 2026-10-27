---
version: 1
slug: 'apps-src-routes-marketing-tsx'
primary_target: 'apps/src/routes/marketing.tsx'
# prettier-ignore
related_targets: ["apps/src/shell.tsx", "apps/src/style.css", "apps/src/client/reveal.ts"]
---

# Landing page

- **Scope and mode:** the landing page at `/`, with the privacy page, the beta terms and the 404 page on the marketing shell. Persuade (the privacy and terms pages read as Read).
- **Audience:** a podcast network's head of programming deciding whether Crossfeed is for them; hackathon judges who need the sample network one click from the URL; developers looking for how to build on it.
- **Action:** open the sample network at `/demo` (first and most prominent); create a network only while `ACCOUNTS` is on.
- **Proof and content:** a made-up network, Kiln Street Audio, its eight shows and a made-up true-crime launch, Low Tide, labelled an illustration, with true-size fragments of the app built from the same recipes; PRODUCT.md's capabilities, constraints and principles. No Qloo data, customers, quotes, figures or prices, and no decimals.
- **Constraints:** server-rendered Hono JSX, no React island; DESIGN.md's system (poster and index type only here, the closing band the one colour field, 1px rules only in real tables and `data-ui` fragments); one column at 390px with no sideways scroll; motion only with motion allowed, and every part in place without JavaScript.
- **Chosen direction:** a type-led page: the two-line statement, then the re-rank as the page's one live thing. Memorable moment: choosing "By topic" sends Kiln Street Audio's rows to their topic places, and "By who listens" brings the climbers back up, marked ▲ in signal ink.
- **Unresolved:** the privacy page names no contact, because none is on record.

## Direction contract

THESIS: Type and nothing else: the first screen is one statement, "Rank by / who listens", across the page, and the proof is the re-rank right under it, in CSS alone. It refuses the category default: a headline over a screenshot, then a row of feature cards.

OWN-WORLD: Ink on the cool grey ground in one family: the poster h1 up to 200px, the re-rank's show names at index size, display headings, 16px body; true-size app fragments (the on-air readout, the question card, the plan, the evidence, the replies) as the only pictures; signal orange for marks and moves, and the closing band as the one colour field; no imagery, no shadow at rest.

STORY: The visitor reads the statement and the sentence and opens the sample network, or scrolls to see a topic plan miss the shows a true-crime launch's listeners share; then a run as one bar, what Crossfeed does with its fragments, what it never does, the developers' four ways in, and the closing question, "Try the sample, or your roster?".

FIRST VIEWPORT: No bar: the mark and wordmark top left; Sample network, Developers, and while accounts are on Sign in and Create your network (secondary) top right, folding into a Menu under 768px. The poster h1 in two lines, the first flush left and the second right-aligned from 768px, each rising from behind its baseline; at the foot from 1024px, the sentence at title size on the left and "Open the sample network" (the 44px primary) on its baseline at the right, the no-sign-in fine print under it.

FORM: design-taste-frontend's landing direction "Type and nothing else" (its own seed 2079320711) with the hero "Two-line statement, full width", the redesign brief's palette and type kept; the sheet's "Headline you can type" section is redrawn as the re-rank, since it would need live Qloo answers. No impeccable roll ran, so there's no list position. seed: none (unavailable)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
