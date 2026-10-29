---
version: 1
slug: 'apps-src-client-launches-tsx'
primary_target: 'apps/src/client/Launches.tsx'
# prettier-ignore
related_targets: ["apps/src/client/Dashboard.tsx", "apps/src/client/LaunchStatus.tsx", "apps/src/client/Settings.tsx", "apps/src/client/settings/Network.tsx", "apps/src/client/settings/Module.tsx", "apps/src/client/NewNetwork.tsx", "apps/src/shell.tsx"]
---

# Network launches and settings

- **Scope and mode:** a signed-in network's app shell (the icon rail with the mark, Dashboard, Launches, Roster, Inbox and Settings; the top bar with the network switcher and the account menu), its Launches page at `/app/<id>/launches`, its settings page and the settings grammar the account page shares, and `/app/new`. The Network panel and Setup, first drawn beside the launches, now stand on the dashboard at `/app/<id>` (#356), which isn't this note's surface. Operate.
- **Audience:** a network's head of programming and its bookers, at a desk in daylight, opening the network between launches; a new owner setting the network up.
- **Job:** see which launches need them and where every other one stands, plan and delete launches, switch networks, and change the network's settings.
- **Proof and content:** the network's own launches with each one's status, finalists, slots, slot value and last run. No invented figures.
- **Constraints:** DESIGN.md's system unchanged: its tokens, the recipes in `variants.ts`, and its house rules (no KPI tiles, no rows of icon cards, nothing at rest casts a shadow). Owners edit settings; members read them, never see nothing.
- **Chosen direction:** the launches table grouped by who's blocked, carrying the run pages' identity onto its rows: the on-air dot for running and waiting launches, and a finalist meter. Memorable moment: the Needs you group heads the table, so what waits on this person is the first thing read.
- **Unresolved:** nothing recorded.

## Direction contract

THESIS: The Launches page answers "Which launches need me?" with the launches table, grouped by who's blocked, as the page's one block. It refuses the SaaS home: KPI tiles, welcome cards and activity charts.

OWN-WORLD: The achromatic app: ink on the cool grey ground, white panels with no border or shadow, group header rows on the tone step, the on-air dot in signal orange only while a launch runs or waits, an ink check for an approved order, the crimson square ✕ and its word for failed and stopped, a finalist meter, 6px controls, 8px panels, one ink primary.

STORY: The member opens Launches from the rail, sees what needs them first, and opens a launch from its row or starts one from the New launch dialog.

FIRST VIEWPORT: The 56px rail at the left with Launches current; the 48px top bar with the network switcher, "/ Launches" and the account menu. Title row: "Launches" at title size over its counts caption ("7 launches · 4 need you, 1 running"), "New launch" (primary) at the right. Below, the launches table, as wide as the canvas (Launch, Status, Finalists, Slots, Slot value, Last run, a row menu), its groups' header rows on the tone step.

FORM: design-taste-frontend's app style "Achromatic ledger" with its "Icon rail" shell, dealt by that skill for every app screen (its own seed 823806018), with the redesign brief's palette and type kept in place of the style's; no impeccable roll ran, so there's no list position. seed: none (unavailable)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
