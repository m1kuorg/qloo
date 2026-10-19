---
version: 1
slug: 'apps-src-client-dashboard-tsx'
primary_target: 'apps/src/client/Dashboard.tsx'
related_targets:
  [
    'apps/src/client/Settings.tsx',
    'apps/src/client/settings/Network.tsx',
    'apps/src/shell.tsx',
    'apps/src/client/Account.tsx'
  ]
---

# Network dashboard and settings

- **Scope and mode:** a signed-in network's app shell (wordmark, network switcher, Dashboard, Roster, Inbox, Settings, account menu), its dashboard, its settings page with the Network module, and `/app/new`. Operate.
- **Audience:** a network's head of programming and its bookers, at a desk in daylight, opening the network between launches; a new owner setting the network up.
- **Job:** see every launch's state at once, see whether the roster and inbox need attention, work through setup, switch networks, and change the network's name and CPM.
- **Proof and content:** the network's own launches (none yet in #160), its roster's match counts, its inbox's pitch counts, its CPM, and setup ticked from real state. No invented figures.
- **Constraints:** DESIGN.md's Weekly Chart world unchanged: tables under the Press Black rule, hairline modules, Panel Grey for the selected row, black only for the bar and the page's decision; no KPI tiles, cards, or shadows (spec #155). Owners edit settings; members read them.
- **Chosen direction:** the launch workspace's own grammar, applied to the network: header, a wide launches column, and the rail. Memorable moment: the setup checklist reads like the guide, ticking itself off as the roster, CPM, launches, invites, and keys arrive.
- **Unresolved:** the launches table's rows and the new-launch form arrive with #162; the roster and inbox pages with #161 and #164.

## Direction contract

THESIS: The dashboard is the chart page's front matter: the network's launches set as a table under the black rule, with the roster and inbox reported in the rail as record rows. It refuses the SaaS home: KPI tiles, welcome cards, and a sidebar.

OWN-WORLD: The Weekly Chart's white ground, Press Black bar and header rule, hairline modules, Label headings, Column Grey help lines, chips, Panel Grey selection, and tabular figures; the switcher and account menu open as flat white panels ruled in ink, never shadowed.

STORY: The member lands on their last network, reads which launches are where, sees at a glance that the roster needs settling or the CPM is missing, works the checklist, and switches to another network from the bar.

FIRST VIEWPORT: Black bar: wordmark, divider, network switcher, then Dashboard, Roster, Inbox, Settings, and the member's name at the end. Header: the network's name as the 22px headline over a hairline. Left column: Launches table headings over the Press Black rule, then its one empty sentence. Rail, 448px: Network record rows (Roster, Inbox, CPM) with links, then the Setup module with its count chip, Dismiss, and five items.

FORM: The launch workspace's header, chart column, and rail, position 1 on my ordered list. The roll, taken after the build, dealt positions 7, 5, and 3 (an inbox-first view, three stacked tables, and a checklist-led first page); no one was reachable to lock a card, so the build kept position 1, the structure the ticket and DESIGN.md's layout describe. seed:4b72f3dd01d4f53b

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
