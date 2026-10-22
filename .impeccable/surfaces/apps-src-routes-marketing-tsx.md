---
version: 1
slug: 'apps-src-routes-marketing-tsx'
primary_target: 'apps/src/routes/marketing.tsx'
related_targets: ['apps/src/shell.tsx', 'apps/src/style.css']
---

# Landing page

- **Scope and mode:** the landing page at `/`, with the privacy page and beta terms beside it on the marketing shell. Persuade (the privacy and terms pages read as Read).
- **Audience:** a podcast network's head of programming deciding in one screen whether Crossfeed is for them; hackathon judges who need the sample network one click from the URL; developers looking for how it's built.
- **Action:** open the sample network at `/demo` (first and most prominent); create a network or sign in only while `ACCOUNTS` is on.
- **Proof and content:** an illustrative chart excerpt with made-up shows and ranks, labelled as an illustration; PRODUCT.md's capabilities, constraints, and principles. No Qloo data, customers, quotes, figures, or prices.
- **Constraints:** server-rendered Hono JSX, no React island; DESIGN.md's tokens and rules (One Bullet, Black Shell, Numerals Speak, Flat Chart); one column at 375px with no sideways scroll.
- **Chosen direction:** the chart, annotated. Memorable moment: a history show climbing past the network's true-crime shows on a true-crime launch's chart, its red bullet landing beside the position.
- **Unresolved:** the privacy page names no contact, because none is on record. The developers band links the developer docs (#173), whose own brief is `apps-src-routes-docs-tsx.md`.

## Direction contract

THESIS: The landing page is the chart's key. One illustrative chart of a made-up true-crime launch, with a key that says what each piece of notation decides. It refuses the category default: a headline over a screenshot, then a row of feature cards.

OWN-WORLD: The Weekly Chart, unchanged: white ground, Press Black ink and top bar, Chart Red only on climbers' bullets and their legend, Last-Week Grey figures, Panel Grey for the selected climber and its why line, hairlines under a solid black header rule, Barlow Condensed only for rank numerals and the wordmark, Libre Franklin for everything else, call numbers in mono.

STORY: The visitor sees a topic plan's order (last week) against listener overlap (this week), sees a history show climb past the true-crime shows, reads the key, and opens the sample network. Below: a run in three steps, the inbox, evidence, what it never does, developers, and the way in again.

FIRST VIEWPORT: Black bar with the wordmark, Developers, Sample network, and Sign in while accounts are on. A header band: the hook as the page's one large Franklin headline, one sentence, the black "Open the sample network" button, and its no-sign-in line. Below it the app's own grid: the illustrative chart at hero scale (56px position numerals) in the wide column, with an Illustration label where the app puts its Qloo data label; the key down the rail beside it, each entry led by its real glyph.

FORM: The chart, annotated: position 3 on my ordered list, dealt as the lead. seed:685a3f08c7aa14e0

SIGNATURE: Chart movement on load: last week's figures and moves fade in, then each climber's bullet lands beside its position, and the selected climber's why line fades in. Reduced motion fades only.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
