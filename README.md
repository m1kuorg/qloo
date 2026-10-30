# Crossfeed

Crossfeed is an agent that tells a podcast network which of its own shows should promote a launch, and which pitched guests its listeners actually want. It ranks the network's own lists, its roster and its booking inbox, by listener overlap in [Qloo](https://www.qloo.com/), asks the human at each fork, and ends in a plan a person approves. It's our entry to the [Qloo Agentic Hackathon](https://qloo.devpost.com/), and a signed-in product a network's members can run together.

**Live: <https://crossfeed.m1kuorg.workers.dev>.** The landing page's first button, "Open the sample network", signs you in as a guest, in one click, and opens the guest network, which holds a sample network built from The Ringer's public show names, with labelled sample figures. Crossfeed isn't affiliated with The Ringer. The retired demo's address, [`/demo`](https://crossfeed.m1kuorg.workers.dev/demo), now leads to the sign-in page's guest option.

## Try it as a guest

1. On `/`, select **Open the sample network**. It signs you in as a guest, for a day, and opens the guest network's dashboard. The guest network holds The Ringer's 19 public show names on its roster, with labelled sample figures and a sample CPM, and the sample launch, The Watch, planned. Every guest shares the guest network, which is cleared every day at 12:00 UTC.
2. Select **Launches** in the rail, open **The Watch**, and select **Start run**. The fit chart ranks the roster by listener overlap in Qloo, with each show's rank in a topic-only plan in the Topic column, and the on-air readout at the top of the page says what the agent is doing.
3. Select a show marked ▲ in the Move column, such as The Bill Simmons Podcast, for why it moved, then the call number in that line, such as `C-21`: the inspector's Evidence tab shows the Qloo request behind the ranking and the raw scores the chart leaves out. Switch the chart to **By topic** to watch the shows move to the topic-only plan's order.
4. Answer the agent's questions in the card above the chart: a slot budget, such as 20 promo slots, then which shows to leave out.
5. When the run completes, read **The plan**, the insertion order the agent drafted and code priced, then select **Approve** and **Export CSV**, or **Open the report** for a page to print or save as PDF.
6. Select **Inbox** in the rail: it opens on the sample inbox, 40 pitches already read. Select **Rank pitches**. It ranks the guests' public works against The Big Picture, one list per type of work, and drafts a reply to every pitch for you to approve, edit, or discard. You can also drop your own `.eml`, `.mbox`, or text pitches on it.

All guests share one set of daily limits. While no guest has changed the guest network's roster or The Watch, a run of The Watch that Qloo or a daily limit refuses replays its stored run. Every guest signs in as the one guest member, Guest, and can do anything an owner can in a network, but not change the account every guest shares; what guests make, the networks they create too, is cleared every day at 12:00 UTC, and "Sign out and create an account" leads to a network of one's own. [docs/SUBMISSION.md](docs/SUBMISSION.md) explains what Qloo does at each step, the endpoints it calls, and the known limitations.

## The product

Open at <https://crossfeed.m1kuorg.workers.dev> as a free beta, behind the `ACCOUNTS` switch that can turn it all off at once:

- **Sign-in:** sign up with your name and a passkey, keep the one-time recovery code, and sign in with the passkey alone. No password and no email.
- **Networks:** create a network, invite teammates with a link that works once, and work on one roster, one inbox, and every launch together, seeing each other's changes live.
- **Launches:** the dashboard, each network's home, lists what needs you, the latest runs, today's usage of the daily limits, and how the network's API keys are used, beside a setup checklist, and the Launches page lists each launch with its status, finalists, slots, and slot value, and its Inventory tab totals the promo inventory they commit: each show's finalists, and its slots approved apart from drafted. Each launch has its own page and keeps every run; a run ranks the network's roster as it stands when it starts, and once its insertion order is approved, it has a report to print or save as PDF.
- **Your files:** drop a roster CSV on the roster page, or pitch emails (`.eml`, `.mbox`, or text) on the inbox.
- **Settings:** the network's name and CPM, members and invite links, API keys, its own Qloo key, today's usage against the beta's daily caps, and deleting the network; your account page holds your passkeys, recovery code, sessions, and networks.
- **For developers:** a REST API under `/api/v1` with an OpenAPI document, the TypeScript SDK in [`packages/sdk`](packages/sdk/), an MCP server at `/mcp`, two Agent Skills and a Claude Code plugin in [`plugins/crossfeed`](plugins/crossfeed/), and developer docs at `/docs` and `/llms.txt`. None of them can approve anything: only a member, in the app, approves an insertion order or a reply.

## Run it locally

You need [Bun](https://bun.sh/), a [Qloo hackathon API key](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide#getting-your-api-key), and an [Anthropic API key](https://console.anthropic.com/). With both keys in your environment as `QLOO_API_KEY` and `ANTHROPIC_API_KEY`:

```sh
git clone https://github.com/m1kuorg/qloo.git
cd qloo && bun install
cd apps && bun install
printf 'QLOO_API_KEY=%s\nANTHROPIC_API_KEY=%s\nVISITOR_SALT=%s\nQLOO_KEY_SECRET=%s\nACCOUNTS=on\nRP_ID=localhost\nAPP_ORIGINS=http://localhost:5173\n' \
  "$QLOO_API_KEY" "$ANTHROPIC_API_KEY" "$(openssl rand -hex 16)" "$(openssl rand -base64 32)" > .dev.vars
bunx wrangler d1 migrations apply DB --local
bun run dev -- --port 5173 --strictPort
```

Open <http://localhost:5173/>, then **Open the sample network** to sign in as a guest, or **Create your network** to sign up with a passkey (checked in Chrome). The app calls the real Qloo and Anthropic APIs with your keys. `VISITOR_SALT` salts the visitor hash behind the daily limits, and `QLOO_KEY_SECRET` seals each network's own Qloo key; any random values work locally. Every way in needs `ACCOUNTS=on`, as production sets it: without it the public pages offer none. `.dev.vars` is git-ignored: never commit it.

Run the tests, which fake Qloo and Anthropic at the network boundary and need no keys:

```sh
bun run test
```

The [apps README](apps/README.md) is the full how-to: tests and their helpers, type checks, CI, deploying production and the preview (with the `QLOO_KEY_SECRET` secret on each Worker), and the live checks.

## Repository

- [`apps/`](apps/): the Cloudflare Worker, with the landing page and docs, accounts and the app, the REST API and the MCP server, the agents, the Qloo gateway, the D1 directory's migrations, and the React UI.
- [`packages/sdk/`](packages/sdk/): `@crossfeed/sdk`, the TypeScript client of the REST API, typed from its OpenAPI document.
- [`plugins/crossfeed/`](plugins/crossfeed/): the Claude Code plugin, with the MCP server's config and two Agent Skills, listed by [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json).
- [`docs/SUBMISSION.md`](docs/SUBMISSION.md): the hackathon submission.
- [`docs/PRD.md`](docs/PRD.md), [`docs/TRD.md`](docs/TRD.md), [`docs/PRODUCT.md`](docs/PRODUCT.md), and [`docs/DESIGN.md`](docs/DESIGN.md): what Crossfeed does, how it's built, its record, and its look. [`GLOSSARY.md`](GLOSSARY.md) holds its terms and [`docs/adr/`](docs/adr/) its decisions.

## License

[MIT](LICENSE).
