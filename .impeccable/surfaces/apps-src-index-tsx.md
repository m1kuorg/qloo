---
version: 1
slug: 'apps-src-index-tsx'
primary_target: 'apps/src/index.tsx'
related_targets: []
---

# Launch workspace

- **Scope and mode:** the launch promo workspace for one launch (fit chart, agent questions, evidence, insertion order draft). Operate.
- **Audience:** a podcast network's head of programming, at a desk in daylight, planning one launch; hackathon judges replaying the sample launch without an account.
- **Job:** see which roster shows share the launch's listeners, answer the agent's forks, and approve an insertion order priced in inventory dollars.
- **Proof and content:** the sample network's ranked roster with fit rank beside topic rank, Qloo evidence per call, and the drafted insertion order; every sample figure labelled.
- **Constraints:** rank and band before raw score; Qloo record kept apart from agent text; nothing final until the human approves. Must not read as a generic AI chat app, a BI dashboard, or a spreadsheet clone (user, 2026-10-17).
- **Chosen direction:** The Weekly Chart. Memorable moment: a cross-genre show climbing the chart with a red bullet, its "why it moved" line citing a Qloo call.
- **Unresolved:** dark theme; the narrow-width layout; motion timings. The empty, loading, slow, failing, missed, and error states are settled in DESIGN.md's state colors (#42).

## Direction contract

THESIS: The roster is this week's chart. Fit rank is the new position, topic rank is last week, and the moves Qloo caused are the news. It refuses the category default: a sidebar, a KPI tile row, and an agent chat panel.

OWN-WORLD: White ground, near-black ink, black top bar, one chart red used only for the gainer bullet, grey for last-week figures. Heavy condensed position numerals, a plain grotesque for everything else, tabular figures, hairline row rules under a solid black header rule.

STORY: The programmer sees which shows the launch's listeners share, sees what topic planning would have missed, answers the agent's question, and approves a priced insertion order.

FIRST VIEWPORT: Black top bar with nav; the launch title, comps, and step progress; sub-tabs. The chart fills about two-thirds on the left: big position numerals, last-week column, move, show with shared tags, fit band, slot value. A 448px right rail stacks the agent's open question (the primary action, "Answer"), the evidence record for the selected show, and the insertion order draft with "Approve".

FORM: The Weekly Chart, position 1 on my ordered list, chosen by the user as the pick over the rolled direction. seed:5101c300602d6235

SIGNATURE: Chart movement. A climber of three or more places gets the red bullet, and the selected climber opens an inline "why it moved" line that cites its Qloo call.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
