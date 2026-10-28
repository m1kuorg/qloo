---
version: 1
slug: 'apps-src-routes-docs-tsx'
primary_target: 'apps/src/routes/docs.tsx'
# prettier-ignore
related_targets: ["apps/src/style.css", "apps/src/shell.tsx"]
---

# Developer docs

- **Scope and mode:** the developer docs at `/docs`, `/docs/api`, `/docs/sdk`, `/docs/mcp` and `/docs/agents`, on the marketing shell, with `/llms.txt` and each skill's `SKILL.md` served beside them. Read.
- **Reader's question:** how do I script or connect an assistant to my network's Crossfeed, and what can't it do? Readers are a network's developers and their AI assistants.
- **Source material:** the API's OpenAPI document (generated), the MCP server's tool list (generated), refusal codes, limits from env and code, the SDK's README, the plugin's files. No Qloo data: examples use made-up shows and IDs.
- **Structure and wayfinding:** the five pages (Overview, REST API, TypeScript SDK, MCP server, Skills and plugin) in a nav with the page on view current, then the spec list (API, OpenAPI, MCP, Auth, For agents); the article; "On this page" from 1440px; "Next" at the foot.
- **Constraints:** server-rendered Hono JSX, no island; DESIGN.md's system (one family, mono only for code and codes, 1px rules only in real tables, sentence case); one column at 390px with no sideways scroll outside code panels, and reference tables fold into blocks under 640px; while `ACCOUNTS` is off, no link to `/api`, `/mcp`, `/app` or `/sign-in`, and a note that the API and MCP server answer 404 on that deployment.
- **Chosen structure:** a reference layout of nav, 72ch article and "On this page", in the landing page's type and palette.
- **Unresolved:** nothing recorded.

## Direction contract

THESIS: Developer docs that read as documentation: a 72ch article in the text face at 16px, with every route, tool, error and limit set as a compact real table. It refuses a docs-site template: a hero banner, a card grid of the ways in, and copy buttons.

OWN-WORLD: The marketing shell's world: ink on the cool grey ground, the wordmark top left with Developers current, the nav's current page on the tone step, code in 14px mono on 8px tone-step panels, captioned above by its language or file, methods in mono chips, reference tables with a rule under each row and their heads in secondary text, inline code on the secondary tone, links underlined at 1px.

STORY: The reader lands on the overview, sees the four ways in and what a program can't do (approve), goes to the reference for their way in, finds the route or tool, and reads its entry; "Next" carries them through the five pages.

FIRST VIEWPORT: The marketing header (the mark and wordmark; Developers, and while accounts are on Sign in and Create your network). From 1024px the 220px nav at the left (the five pages, the current one on the tone step, then the spec list) beside the article: its h1 at display size ("Developer docs" on the overview), a one-paragraph lede, its first section 64px below at title size; from 1440px "On this page" at the right. Under 1024px the nav is a disclosure on the tone step above the article.

FORM: the redesign brief's reading layout for the docs on the marketing shell, under design-taste-frontend's page rules and the landing direction "Type and nothing else" it shares the shell with, in the redesign's one family and palette; the design-taste skill dealt no direction of its own for the docs, and no impeccable roll ran. seed: none (unavailable)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
