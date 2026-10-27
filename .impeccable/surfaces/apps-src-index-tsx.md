---
version: 1
slug: 'apps-src-index-tsx'
primary_target: 'apps/src/index.tsx'
# prettier-ignore
related_targets: ["apps/src/client/App.tsx", "apps/src/client/Frame.tsx", "apps/src/client/FitChart.tsx", "apps/src/client/Run.tsx", "apps/src/client/InsertionOrder.tsx", "apps/src/client/Evidence.tsx"]
---

# Launch workspace

- **Scope and mode:** the workspace for one launch, on `/demo` (the sample network, its editable roster and the guide) and on each launch page: the title row, the on-air readout, the launch form or the agent's question, the fit chart, the plan (the insertion order draft) and the roster, beside the inspector (Run, Evidence, Show). Operate.
- **Audience:** a podcast network's head of programming, at a desk in daylight, planning one launch; hackathon judges replaying the sample launch without an account.
- **Job:** see which roster shows share the launch's listeners and what a topic-only plan would have missed, answer the agent's forks, and approve an insertion order priced in inventory dollars.
- **Proof and content:** the ranked roster with fit rank beside topic rank, Qloo evidence per call, and the drafted insertion order; every sample figure labelled.
- **Constraints:** rank and band before raw score; Qloo data kept apart from agent text; nothing final until a member approves. Must not read as a generic AI chat app, a BI dashboard, or a spreadsheet clone (user, 2026-10-17).
- **Chosen direction:** the roster ranked by who listens as the canvas's biggest block, the run's state in the on-air readout, and what a person checks in the inspector. Memorable moment: switching the fit chart's lens to "By topic" sends the rows travelling to their topic places, and a climber's "Why it moved" cites its Qloo call.
- **Unresolved:** nothing recorded.

## Direction contract

THESIS: The fit chart, the roster ranked by who listens, is the biggest thing on the page; the agent, its question and the plan serve it. It refuses the category default: an agent chat panel, a KPI tile row, and a sidebar of settings.

OWN-WORLD: The achromatic app: ink on the cool grey ground, the canvas's blocks 24px apart on white panels with no border or shadow, the on-air readout on the tone step with its breathing signal dot, finalist rows washed in signal tint with signal meters, climbers' ▲ in signal ink, Qloo data and Agent chips that never look alike, and mono call numbers that open the inspector's Evidence tab.

STORY: The programmer names the launch, follows the readout as the agent ranks, answers its question in the card above the chart, sees which shows climb over a topic-only plan and why, and approves a priced insertion order.

FIRST VIEWPORT: The rail and the top bar. The canvas: the title row (the launch's name at title size, its Qloo match with its call, "Start run" or "Run again" at the right), the on-air readout (the dot, "Running", "Scoring 15 shows against The Watch · step 2", the elapsed time), the guide on the demo, the "Agent asks" card while the run waits, then "Who shares The Watch's listeners" with its finding line, the lens ("By who listens", "By topic") and the ranked rows. From 1360px the 360px inspector beside it, on Run.

FORM: design-taste-frontend's app style "Achromatic ledger" with its "Icon rail" shell, dealt by that skill for every app screen (its own seed 823806018), with the redesign brief's palette and type kept in place of the style's; no impeccable roll ran, so there's no list position. seed: none (unavailable)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
