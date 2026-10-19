---
version: 1
slug: 'apps-src-client-roster-tsx'
primary_target: 'apps/src/client/Roster.tsx'
related_targets: ['apps/src/client/App.tsx', 'apps/src/style.css']
---

# Network roster

- **Scope and mode:** a signed-in network's roster page, `/app/:networkId/roster`, and the import form it shares with the demo's roster section (drop or pick a `.csv` or `.txt` file, paste names). Operate.
- **Audience:** a network's head of programming and its bookers, at a desk in daylight, keeping the roster every launch ranks; often two members at once.
- **Job:** import the roster from the network's own file or pasted names, or start from the sample roster; settle ambiguous shows, map misses to comps, edit figures, leave shows out; re-import a fresh download without losing what's settled; read the CPM an owner set.
- **Proof and content:** the network's own shows and their Qloo matches, each citing its search call; the sample roster's public show names with every made-up figure labelled sample. No invented figures.
- **Constraints:** DESIGN.md's Weekly Chart world unchanged. No launch header, fit chart, run log, or guide here: the network's agent refuses launch actions. The CPM changes only in settings, by an owner. A dropped file never navigates the page away.
- **Chosen direction:** an extension of the launch workspace: its roster section and rail, relocated to the network, with the dashboard's header. Memorable moment: dragging a file anywhere over the page rules the window in ink, with a line along its foot saying what a drop imports, wherever the page is scrolled; the rows then fill in from Qloo as on the demo.
- **Unresolved:** the inbox page (#164) adds its own pitch upload; the launch workspace (#162) links here for edits.

## Direction contract

THESIS: The roster is the chart's standing list, kept once for every launch: the workspace's roster table and rail on a page of their own. It refuses an uploads dashboard: no file cards, progress bars, or upload history.

OWN-WORLD: The Weekly Chart's white ground, Press Black bar and header rule, the roster table's 44px hairline rows, Label headings, Column Grey help, chips with state markers, Panel Grey for the open show, ink focus rings, tabular figures.

STORY: The member drops the network's CSV, watches each show find its Qloo match, settles the ambiguous ones beside the table while a teammate sees it happen, and next week drops the new download knowing the settled shows stay.

FIRST VIEWPORT: Black bar with Roster current. Header: "Roster" as the 22px headline, one Column Grey line saying every launch ranks it. Left: the import form (names field, black Import roster, secondary Upload a file, the note on what a re-import keeps), then the roster table or its empty state with "Start from the sample roster". Rail from the top: the open show's editor, its evidence, Roster check, Network CPM.

FORM: The workspace's chart column and rail, position 1 on my ordered list. This page relocates an established surface's roster section and rail, so new-work §3 "Extend an existing surface" governs it: "Inherit its world and composition. Resolve only the new purpose, content, hierarchy, states, interaction, and how the addition joins the surrounding experience. No concept tournament"; and of the roll, "Never run the script for a local extension or a precisely specified narrow request; shape those directly." seed: none (extension, no roll)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
