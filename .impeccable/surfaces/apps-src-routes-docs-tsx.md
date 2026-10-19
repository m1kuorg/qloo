---
version: 1
slug: 'apps-src-routes-docs-tsx'
primary_target: 'apps/src/routes/docs.tsx'
related_targets: ['apps/src/style.css', 'apps/src/shell.tsx']
---

# Developer docs

- **Scope and mode:** the developer docs at `/docs`, `/docs/api`, `/docs/sdk`, `/docs/mcp`, and `/docs/agents`, on the marketing shell, with `/llms.txt` and each skill's `SKILL.md` served beside them. Read.
- **Reader's question:** how do I script or connect an assistant to my network's Crossfeed, and what can't it do? Readers are a network's developers and their AI assistants.
- **Source material:** the API's OpenAPI document (generated), the MCP server's tool list (generated), refusal codes, limits from env and code, the SDK's README, the plugin's files. No Qloo data: examples use made-up shows and IDs.
- **Structure and wayfinding:** the docs' five pages in a left rail with the page on view as the selected row and its sections under it, then a record of the API's base, OpenAPI, MCP, auth, and llms.txt; the reading column; "Next" at the foot.
- **Constraints:** server-rendered Hono JSX, no island; DESIGN.md's tokens and rules (Black Shell, Flat Chart, Numerals Speak, One Bullet: no bullet here, as nothing ranks); one column at 375px with no sideways scroll; while ACCOUNTS is off, no link to `/api`, `/mcp`, `/app`, or `/sign-in`, and a note that the API and MCP server answer 404 on that deployment.
- **Chosen structure:** the chart index, dealt as the lead. No user was reachable to choose among the dealt three (the chart index, a single continuous manual, a reference-first timetable), so the lead was built, with the timetable's route index on the API page.

## Direction contract

THESIS: Developer docs that read as documentation, framed by the Weekly Chart: the overview opens on a chart-ruled index of the four ways in, and every reference (routes, tools, errors, limits) is set as the app sets its tables and records.

OWN-WORLD: The Weekly Chart, unchanged: the black bar with Developers current; white ground and Press Black ink; tables under a Press Black header rule with hairline rows; the app's evidence record (`rec kv`) for a route's parameters and answers and for the rail's facts; Label chips for HTTP methods and the Illustration chip; Panel Grey for the page on view and for code, which is data to copy, as a key shown once is; Libre Franklin for every word and the monospace stack for code.

STORY: The reader lands on the overview, sees the four ways in as one ruled index and what a program can't do (approve), then goes to the reference for their way in, finds the route or tool in its index, and reads its entry; "Next" carries them on through the five pages.

FORM: The chart index: position 4 on my ordered list, dealt as the lead. seed:439ec4370ed9a0a7

FIRST VIEWPORT: Black bar; the docs rail at the left with "Developer docs", the five pages, the page on view in Panel Grey with its sections beneath, then the record of the API's base, OpenAPI, MCP, auth, and llms.txt; the reading column with the page's h1, a one-paragraph lede, and its first section under a hairline (on `/docs`, the four ways in).

READING: a 68ch measure at 15px/1.6; sections divided by hairlines with 48px above; h2 22/28 700, h3 16/22 600; code on Panel Grey under a Label naming its language or a mono file name.

FINISH: reviewed at 1440 and 375; DESIGN.md's docs section is the docs ticket's (#174).
