<a id="readme-top"></a>

<!-- PROJECT LOGO -->

<br />
<div align="center">
  <a href="https://github.com/m1kuorg/qloo">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="/docs/readme/banner-dark.png">
      <source media="(prefers-color-scheme: light)" srcset="/docs/readme/banner-light.png">
      <img src="/docs/readme/banner-light.png" alt="Crossfeed banner: the claim “Rank by who listens” beside a made-up podcast roster re-ranked from its order by topic to its order by who listens, the two shows that climb drawn in orange.">
    </picture>
  </a>

  <h3>Crossfeed</h3>

  <p>
    An agent that tells a podcast network which of its own shows should promote a launch, and which pitched guests its listeners want, by ranking the network's own lists in Qloo.
    <br />
    <a href="https://crossfeed.m1kuorg.workers.dev"><strong>Live Demo &rarr;</strong></a>
    &middot;
    <a href="https://devpost.com/software/crossfeed">Devpost</a>
    &middot;
    <a href="https://github.com/m1kuorg/qloo/issues/new?labels=bug">Report a Bug</a>
    <br />
  </p>

[![TypeScript][typescript-badge]][typescript-url]
[![React][react-badge]][react-url]
[![Tailwind CSS][tailwindcss-badge]][tailwindcss-url]
[![shadcn/ui][shadcnui-badge]][shadcnui-url]
[![Hono][hono-badge]][hono-url]
[![Vite][vite-badge]][vite-url]
[![Cloudflare Workers][cloudflareworkers-badge]][cloudflareworkers-url]
[![Cloudflare D1][cloudflared1-badge]][cloudflared1-url]
[![Qloo][qloo-badge]][qloo-url]
[![Claude][claude-badge]][claude-url]
[![Model Context Protocol][modelcontextprotocol-badge]][modelcontextprotocol-url]
[![Vitest][vitest-badge]][vitest-url]
[![Bun][bun-badge]][bun-url]

</div>

<!-- TABLE OF CONTENTS -->

## Table of Contents

<details>
  <summary>Expand</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#screenshots">Screenshots</a></li>
        <li><a href="#how-it-works">How It Works</a></li>
        <li><a href="#features">Features</a></li>
        <li><a href="#architecture">Architecture</a></li>
        <li><a href="#tech-stack">Tech Stack</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#team">Team</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

<!-- ABOUT THE PROJECT -->

## About The Project

Every host-read promo a podcast network runs for its new show is an ad slot it didn't sell, yet launch plans are drawn up by topic: the new true-crime show goes on the other true-crime shows. Crossfeed plans by who listens instead. It looks the launch and the network's shows up in Qloo, ranks the roster by how much each show's listeners overlap the launch's, asks a person at each fork, and drafts an insertion order that code prices from the network's own downloads and CPM. A member approves it; the agent never can.

The same engine works the booking inbox. Crossfeed reads the pitches publicists send, looks up the public work each guest is promoting, a book, film, TV show, or podcast, ranks those works against a show's listeners, and drafts a reply to every pitch for the booker to approve, edit, or discard.

Beside every Qloo ranking sits the plan an agent without Qloo would make: Claude's ranking from show names and descriptions, or from a pitch's own words, with no Qloo data. So what Qloo adds is on the screen, not asserted.

It's a product a network's members sign in to, with passkeys, shared networks, a REST API, a TypeScript SDK, an MCP server, and a Claude Code plugin. Anyone can try it as a guest, in one click, on a sample network built from The Ringer's public show names, with labelled sample figures. Crossfeed isn't affiliated with The Ringer.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/): the entry is on [Devpost](https://devpost.com/software/crossfeed), and [docs/SUBMISSION.md](/docs/SUBMISSION.md) is its full text.

<p align="right"><a href="#readme-top">&uarr;</a></p>

### Screenshots

The live app on October 30, 2026, signed in as a guest, on the guest network's sample data.

<table>
  <tr>
    <td width="50%" valign="top" align="left">
      <img src="/docs/readme/screenshots/landing.png" alt="Landing" width="100%">
      <br />
      <strong>Landing</strong> · "Rank by who listens", a made-up roster's re-rank labelled an illustration, and one button into the sample network.
    </td>
    <td width="50%" valign="top" align="left">
      <img src="/docs/readme/screenshots/dashboard.png" alt="Dashboard" width="100%">
      <br />
      <strong>Dashboard</strong> · What needs you, the latest runs, today's usage of the daily limits, and the setup checklist.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top" align="left">
      <img src="/docs/readme/screenshots/launches.png" alt="Launches" width="100%">
      <br />
      <strong>Launches</strong> · Every launch grouped by who's blocked, with its finalists, slots, and slot value.
    </td>
    <td width="50%" valign="top" align="left">
      <img src="/docs/readme/screenshots/inventory.png" alt="Inventory" width="100%">
      <br />
      <strong>Inventory</strong> · The promo slots the network's insertion orders commit, show by show, approved apart from drafted.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top" align="left">
      <img src="/docs/readme/screenshots/roster-overlap.png" alt="Roster overlap" width="100%">
      <br />
      <strong>Overlap</strong> · Each show's closest shows by listener overlap in Qloo, with close pairs marked ⇄.
    </td>
    <td width="50%" valign="top" align="left">
      <img src="/docs/readme/screenshots/roster-listeners.png" alt="Roster listeners" width="100%">
      <br />
      <strong>Listeners</strong> · Each show's lean by age band and gender against the average in Qloo, under a finding in words.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top" align="left">
      <img src="/docs/readme/screenshots/inbox.png" alt="Inbox" width="100%">
      <br />
      <strong>Inbox</strong> · 40 sample pitches, each guest's public work matched in Qloo. Names, addresses, and pitch text never reach Qloo.
    </td>
    <td width="50%" valign="top" align="left">
      <img src="/docs/readme/screenshots/developers.png" alt="Developers" width="100%">
      <br />
      <strong>Developers</strong> · The MCP server and REST API addresses, an API key, and the setup for each assistant.
    </td>
  </tr>
</table>

<p align="right"><a href="#readme-top">&uarr;</a></p>

### How It Works

1.  **Start a run.** Open a launch, such as the sample network's The Watch, and select **Start run**. The agent looks the launch up in Qloo, ranks the roster against its listeners in one call, and asks you for a slot budget, then which shows to leave out.

    <img src="/docs/readme/screenshots/launch-question.png" alt="The agent asks for the slot budget" width="100%">

2.  **See who shares its listeners.** The fit chart ranks the roster by listener overlap, with each show's rank in a topic-only plan beside it. A show that climbs three or more places is marked ▲: select it for why it moved, and select a call number, such as `C-53`, for the Qloo request and raw scores behind it.

    <img src="/docs/readme/screenshots/launch-evidence.png" alt="Why a show moved, and the evidence for the ranking call" width="100%">

3.  **Approve the plan.** The agent drafts slots and a host-read angle for each finalist from the tags its listeners share with the launch's in Qloo. Code prices each slot, holds the plan to the budget, and names any close pairs among its shows. Only a member approves it, and only then exports the CSV.

    <img src="/docs/readme/screenshots/launch-plan.png" alt="The approved insertion order with its close pairs" width="100%">

4.  **Hand it on.** An approved order has a launch report to print or save as PDF, with an index of every Qloo call it cites.

    <img src="/docs/readme/screenshots/report.png" alt="The launch report" width="100%">

5.  **Run it again.** Answer differently, and the launch's Changes tab says what changed since the earlier run: the inputs, the finalists, each show's move, and the plan's slots and value.

    <img src="/docs/readme/screenshots/launch-changes.png" alt="Changes since the earlier run" width="100%">

6.  **Work the inbox.** On the inbox's Rank tab, select **Rank pitches**. Each type of pitched work is ranked against the show by who listens, beside its rank by the pitch's own words, and every pitch gets a drafted reply under Book, Later, or Decline.

    <img src="/docs/readme/screenshots/inbox-rank.png" alt="Pitched books ranked against The Big Picture" width="100%">

    <img src="/docs/readme/screenshots/inbox-replies.png" alt="Drafted replies, one approved" width="100%">

<p align="right"><a href="#readme-top">&uarr;</a></p>

### Features

- **Ranked by who listens.** One Qloo insights call ranks the network's closed list, its own roster, against a launch, or against up to three comparable shows for a launch that hasn't aired.
- **The counterfactual on screen.** Claude's topic-only ranking sits beside Qloo's in every run, and the chart's lens moves the rows between the two.
- **An agent that asks.** It asks a person for the budget, the shows to leave out, and any ambiguous Qloo match, and it has no tool to approve or export.
- **Priced by code.** Each slot is worth downloads per episode × CPM ÷ 1,000, from the network's own figures, and code refuses a plan over the budget.
- **Evidence for every figure.** Each ranking, tag, and flag cites its Qloo call, which opens the request, its status, latency, and cache hit, and the raw scores.
- **Analysis where it belongs.** The roster's overlap and close pairs, its listeners by age band and gender, what changed between runs, the promo inventory, and a printable launch report.
- **The booking inbox.** Pitches as `.eml`, `.mbox`, or text. Only each work's title and type reach Qloo, never a name, an address, or the pitch's text.
- **A product to sign in to.** Passkeys with no password or email, networks shared with invited teammates who see each other's changes live, roster CSV import, each network's own Qloo key, and daily caps.
- **For scripts and assistants.** A REST API with an OpenAPI document, the `@crossfeed/sdk` TypeScript client, an MCP server at `/mcp`, two Agent Skills, and a Claude Code plugin. None of them can approve anything.
- **Honest limits.** Past the day's limits, or while Qloo fails, the sample launch replays its stored run, labelled "Replayed", and every other run stops and says why.

<p align="right"><a href="#readme-top">&uarr;</a></p>

### Architecture

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="/docs/readme/architecture-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="/docs/readme/architecture-light.svg">
  <img src="/docs/readme/architecture-light.svg" alt="Crossfeed architecture: browsers, scripts, and AI assistants reach one Cloudflare Worker, which routes to a NetworkAgent per network and a LaunchAgent per launch; both call Claude, and every Qloo call goes through the QlooGateway.">
</picture>

One Worker serves every surface. Each network and each launch is its own Agents SDK Durable Object, which runs Claude's tool loop, and every Qloo call goes through one gateway Durable Object that caches, paces, retries, and caps them. A D1 database holds only what has to be looked up across them: members, networks, sessions, invites, and API keys. [docs/TRD.md](/docs/TRD.md) has the whole design.

Made with [Archify](https://github.com/tt-a1i/archify) from [`architecture.json`](/docs/readme/architecture.json), in Crossfeed's colours by [`export-architecture.mjs`](/docs/readme/export-architecture.mjs).

<p align="right"><a href="#readme-top">&uarr;</a></p>

### Tech Stack

- **Languages:** TypeScript for the Worker, the client, the SDK, and the tests.
- **Frontend:** [React](https://react.dev/) 19 islands in server-rendered [Hono](https://hono.dev/) JSX shells, [Tailwind CSS](https://tailwindcss.com/) 4, and [shadcn/ui](https://ui.shadcn.com/) on [Base UI](https://base-ui.com/), with [Lucide](https://lucide.dev/) icons and Schibsted Grotesk, built by [Vite](https://vite.dev/).
- **Backend:** [Cloudflare Workers](https://developers.cloudflare.com/workers/), the [Cloudflare Agents SDK](https://developers.cloudflare.com/agents/) on [Durable Objects](https://developers.cloudflare.com/durable-objects/), [D1](https://developers.cloudflare.com/d1/), the Workers rate limiting binding, and cron triggers.
- **Taste data:** the [Qloo](https://docs.qloo.com/) REST API: search, insights, and compare.
- **AI:** Anthropic's [Claude](https://claude.com/product/overview) Haiku 5.5 (`claude-haiku-5-5`), through the Anthropic TypeScript SDK.
- **Accounts:** passkeys with [SimpleWebAuthn](https://simplewebauthn.dev/).
- **For programs:** an OpenAPI document from [Zod](https://zod.dev/) schemas, the [Model Context Protocol](https://modelcontextprotocol.io/) TypeScript SDK's server, and SDK types from openapi-typescript.
- **Tooling:** [Bun](https://bun.com/), Wrangler, [Vitest](https://vitest.dev/) in the Workers runtime, Prettier, commitlint, and [act](https://github.com/nektos/act) for CI.

<p align="right"><a href="#readme-top">&uarr;</a></p>

<!-- GETTING STARTED -->

## Getting Started

Crossfeed runs on your computer under Vite's dev server, which runs the Worker, its Durable Objects, and a local D1 database as Cloudflare would, with no Cloudflare account. It calls the real Qloo and Anthropic APIs, so it needs a key for each. The tests need neither.

<p align="right"><a href="#readme-top">&uarr;</a></p>

### Prerequisites

- [Bun](https://bun.com/).
- A [Qloo hackathon API key](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide#getting-your-api-key), exported as `QLOO_API_KEY`.
- An [Anthropic API key](https://platform.claude.com/), exported as `ANTHROPIC_API_KEY`.
- Chrome, to sign in with a passkey on `localhost`.

<p align="right"><a href="#readme-top">&uarr;</a></p>

### Installation

1.  **Clone and install.** The app is in `apps/`.

    ```sh
    git clone https://github.com/m1kuorg/qloo.git
    cd qloo/apps
    bun install
    ```

2.  **Add your keys.** Write them to `.dev.vars`, which is git-ignored, with two random values: `VISITOR_SALT` salts the visitor hash behind the daily limits, and `QLOO_KEY_SECRET` encrypts each network's own Qloo key.

    ```sh
    printf 'QLOO_API_KEY=%s\nANTHROPIC_API_KEY=%s\nVISITOR_SALT=%s\nQLOO_KEY_SECRET=%s\nGUEST_PITCHES=on\nRP_ID=localhost\nAPP_ORIGINS=http://localhost:5128\n' \
      "$QLOO_API_KEY" "$ANTHROPIC_API_KEY" "$(openssl rand -hex 16)" "$(openssl rand -base64 32)" > .dev.vars
    ```

3.  **Create the local database.** This applies the D1 migrations to a local copy under `.wrangler/state`.

    ```sh
    bunx wrangler d1 migrations apply DB --local
    ```

4.  **Start the app.** Open <http://localhost:5128>, then **Open the sample network** to sign in as a guest, or **Create your network** to sign up with a passkey. The local guest network holds the sample roster, inbox, and The Watch; the four sample launches are Qloo data, kept only in each deployment's database.

    ```sh
    bun run dev -- --port 5128 --strictPort
    ```

5.  **Run the checks.** The tests run the Worker in the Workers runtime, with Qloo and Anthropic faked at the network boundary, so they need no keys.

    ```sh
    bun run typecheck
    bun run test
    ```

6.  **Optionally, deploy to Cloudflare.** Replace `account_id` and the D1 `database_id` in `wrangler.jsonc` with your own, set the four secrets with `bunx wrangler secret put`, and run `bun run deploy`. The [apps README](/apps/README.md#deploy) has every step, the preview environment, and the live checks.

<p align="right"><a href="#readme-top">&uarr;</a></p>

<!-- ROADMAP -->

## Roadmap

See [open issues](https://github.com/m1kuorg/qloo/issues) for a full list of proposed features (and known issues).

<p align="right"><a href="#readme-top">&uarr;</a></p>

<!-- CONTRIBUTING -->

## Team

<a href="https://github.com/m1kuorg/qloo/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=m1kuorg/qloo" alt="Crossfeed team" />
</a>

Made with [contrib.rocks](https://contrib.rocks).

<p align="right"><a href="#readme-top">&uarr;</a></p>

<!-- LICENSE -->

## License

Apache 2.0. See [LICENSE](/LICENSE) for more information.

Third-party files keep their own licenses:

- Matt Pocock's [skills](https://github.com/mattpocock/skills), MIT, in `.agents/skills/` and linked from `.claude/skills/`, apart from `graphify` and `impeccable`.
- The [graphify](https://github.com/safishamsi/graphify) skill, Apache 2.0, in `.agents/skills/graphify/`.
- The [impeccable](https://impeccable.style/) skill and its agents, Apache 2.0, in `.agents/skills/impeccable/`, `.claude/skills/impeccable/`, and `.claude/agents/`.
- shadcn/ui's components, MIT, the starting point of `apps/src/components/ui/`.
- Lucide's icons, ISC, whose paths `apps/src/icons.tsx` draws.
- Schibsted Grotesk, SIL Open Font License 1.1, which the app serves from `@fontsource-variable/schibsted-grotesk`.
- [docs/references/markdown-style.md](/docs/references/markdown-style.md), adapted from Google's documentation guide, CC BY 3.0.

<p align="right"><a href="#readme-top">&uarr;</a></p>

<!-- ACKNOWLEDGMENTS -->

## Acknowledgments

- [Qloo](https://www.qloo.com/) and the [Qloo Agentic Hackathon](https://qloo.devpost.com/): the taste graph every ranking comes from.
- [Anthropic](https://www.anthropic.com/): Claude Haiku 5.5 runs the agent, and Claude Code helped build it.
- [Cloudflare](https://www.cloudflare.com/): Workers, the Agents SDK, Durable Objects, and D1 host the live app.
- [shadcn/ui](https://ui.shadcn.com/) and [Base UI](https://base-ui.com/): the app's components.
- [impeccable](https://impeccable.style/) and [taste-skill](https://github.com/leonxlnx/taste-skill): the design skills behind the interface, and [mkdir.directory](https://mkdir.directory/), whose ranked index the design follows.
- Matt Pocock's [skills](https://github.com/mattpocock/skills): the planning and engineering workflow.
- [Schibsted Grotesk](https://fonts.google.com/specimen/Schibsted+Grotesk): the type.
- [Archify](https://github.com/tt-a1i/archify)
- [contrib.rocks](https://contrib.rocks)
- [Shields.io](https://shields.io)

<p align="right"><a href="#readme-top">&uarr;</a></p>

<!-- MARKDOWN LINKS & IMAGES -->

[typescript-badge]: https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[typescript-url]: https://www.typescriptlang.org/
[react-badge]: https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black
[react-url]: https://react.dev/
[tailwindcss-badge]: https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white
[tailwindcss-url]: https://tailwindcss.com/
[shadcnui-badge]: https://img.shields.io/badge/shadcn%2Fui-000000?style=for-the-badge&logo=shadcnui&logoColor=white
[shadcnui-url]: https://ui.shadcn.com/
[hono-badge]: https://img.shields.io/badge/Hono-E36002?style=for-the-badge&logo=hono&logoColor=white
[hono-url]: https://hono.dev/
[vite-badge]: https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white
[vite-url]: https://vite.dev/
[cloudflareworkers-badge]: https://img.shields.io/badge/Cloudflare_Workers-F38020?style=for-the-badge&logo=cloudflareworkers&logoColor=white
[cloudflareworkers-url]: https://developers.cloudflare.com/workers/
[cloudflared1-badge]: https://img.shields.io/badge/Cloudflare_D1-F38020?style=for-the-badge&logo=cloudflare&logoColor=white
[cloudflared1-url]: https://developers.cloudflare.com/d1/
[qloo-badge]: https://img.shields.io/badge/Qloo-121318?style=for-the-badge
[qloo-url]: https://www.qloo.com/
[claude-badge]: https://img.shields.io/badge/Claude-D97757?style=for-the-badge&logo=claude&logoColor=white
[claude-url]: https://claude.com/product/overview
[modelcontextprotocol-badge]: https://img.shields.io/badge/Model_Context_Protocol-000000?style=for-the-badge&logo=modelcontextprotocol&logoColor=white
[modelcontextprotocol-url]: https://modelcontextprotocol.io/
[vitest-badge]: https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white
[vitest-url]: https://vitest.dev/
[bun-badge]: https://img.shields.io/badge/Bun-000000?style=for-the-badge&logo=bun&logoColor=white
[bun-url]: https://bun.com/
