---
version: 1
slug: 'apps-src-client-roster-tsx'
primary_target: 'apps/src/client/Roster.tsx'
# prettier-ignore
related_targets: ["apps/src/client/RosterModules.tsx", "apps/src/client/Frame.tsx", "apps/src/client/controls.tsx", "apps/src/client/App.tsx", "apps/src/style.css"]
---

# Network roster

- **Scope and mode:** a signed-in network's roster page, `/app/<id>/roster`, and the import it shares with the demo's roster section (paste names, upload a `.csv` or `.txt`, or drop a file anywhere on the page). Operate.
- **Audience:** a network's head of programming and its bookers, at a desk in daylight, keeping the roster every launch ranks; often two members at once.
- **Job:** answer "Is my roster ready to rank?": import the roster; settle ambiguous shows, map misses to comps, edit figures, leave shows out; re-import a fresh download without losing what's settled; read the CPM an owner set.
- **Proof and content:** the network's own shows and their Qloo matches, each citing its search call; the sample roster's public show names with every made-up figure labelled sample. No invented figures.
- **Constraints:** DESIGN.md's system unchanged. No launch title row, fit chart, plan or guide here: the network's agent refuses launch actions. The CPM changes only in settings, by an owner. A dropped file never navigates the page away.
- **Chosen direction:** the run pages' canvas and inspector, holding the roster table in the fit chart's row anatomy, with the inspector's Show and Evidence tabs. Memorable moment: dragging a file anywhere over the page rings the window in ink, with an ink line along its foot saying what a drop imports; the rows then fill in from Qloo.
- **Unresolved:** nothing recorded.

## Direction contract

THESIS: The roster is the standing list every launch ranks, kept once for the network: one ranked-list table on the canvas, its shows opening in the inspector. It refuses an uploads dashboard: file cards, progress bars, upload history and filter chips.

OWN-WORLD: The achromatic app: the roster as a real table, its rules bleeding 8px past the text, names at 15px 600 over their caption line, figures right-aligned; match chips (Resolved and Mapped tone-filled, Ambiguous and Missed outlined, Lookup failed in crimson with its square ✕, Slow Qloo with its clock), call numbers in mono, the inspector on the card, ink focus rings.

STORY: The member drops the network's CSV, watches each show find its Qloo match, settles the ambiguous ones in the inspector while a teammate sees it happen, and next week drops the new download knowing the settled shows stay.

FIRST VIEWPORT: The rail with Roster current and the top bar. Title row: "Roster" at title size, "Every launch on <network> ranks this roster, as it stands when its run starts.", the counts and readiness line, the CPM line, and "Import shows" (primary, opening a sheet) at the right. Then any lookup failures and the roster table, with no sample notice; from 1360px the 360px inspector beside it on Show. Empty: the import form as the page's body.

FORM: design-taste-frontend's app style "Achromatic ledger" with its "Icon rail" shell, dealt by that skill for every app screen (its own seed 823806018), with the redesign brief's palette and type kept in place of the style's; no impeccable roll ran, so there's no list position. seed: none (unavailable)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
