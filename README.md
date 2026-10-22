# Crossfeed

Crossfeed is an agent that tells a podcast network which of its own shows should promote a launch, and which pitched guests its listeners actually want. It ranks the network's own lists, its roster and its booking inbox, by listener overlap in [Qloo](https://www.qloo.com/), asks the human at each fork, and ends in a plan a person approves. It's our entry to the [Qloo Agentic Hackathon](https://qloo.devpost.com/), and a signed-in product a network's team can run.

**Live: <https://crossfeed.m1kuorg.workers.dev>.** The landing page's first button, "Open the sample network", opens the demo at [`/demo`](https://crossfeed.m1kuorg.workers.dev/demo): no login, a sample network built from The Ringer's public show names, with labelled sample figures. Crossfeed isn't affiliated with The Ringer.

## Try the demo

1. On `/`, select **Open the sample network**.
2. Select **Start run** on the sample launch, The Watch. The fit chart ranks the roster by listener overlap ("this week") beside a topic-only ranking ("last week").
3. Select a show with a red bullet for why it moved, then a call number such as `C-21` for the Qloo request behind it.
4. Answer the agent's questions: a slot budget, such as 20 slots, and which shows to leave out.
5. Approve the insertion order and export it as CSV.
6. Open **Inbox**, load the 40-pitch sample inbox, and select **Rank pitches**. It ranks the guests' public works against The Big Picture and drafts a reply to every pitch. You can also drop your own `.eml`, `.mbox`, or text pitches on it.

The guide in the rail walks steps 2 to 5. [docs/SUBMISSION.md](docs/SUBMISSION.md) explains what Qloo does at each step, the endpoints it calls, and the known limitations.

## The product

Behind the `ACCOUNTS` switch, which is on at the preview deployment, <https://crossfeed-preview.m1kuorg.workers.dev>, and off in production until the product passes there:

- **Accounts:** sign up with your name and a passkey, keep the one-time recovery code, and sign in with the passkey alone. No password and no email.
- **Networks:** create a network, invite teammates with a link that works once, and work on one roster, one inbox, and every launch together, seeing each other's changes live.
- **Launches:** the dashboard lists each launch with its status, finalists, slots, and slot value, beside a setup checklist. Each launch has its own page and keeps every run; a run ranks the network's roster as it stands when it starts.
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

Open <http://localhost:5173/>, then **Open the sample network**, or **Create your network** to sign up with a passkey (checked in Chrome). The app calls the real Qloo and Anthropic APIs with your keys. `VISITOR_SALT` salts the visitor hash behind the daily limits, and `QLOO_KEY_SECRET` seals each network's own Qloo key; any random values work locally. Leave out `ACCOUNTS=on` to run the demo alone, as production does. `.dev.vars` is git-ignored: never commit it.

Run the tests, which fake Qloo and Anthropic at the network boundary and need no keys:

```sh
bun run test
```

The [apps README](apps/README.md) is the full how-to: tests and their helpers, type checks, CI, deploying production and the preview (with the `QLOO_KEY_SECRET` secret on each Worker), and the live checks.

## Repository

- [`apps/`](apps/): the Cloudflare Worker, with the landing page and docs, the demo, accounts and the app, the REST API and the MCP server, the agents, the Qloo gateway, the D1 directory's migrations, and the React UI.
- [`packages/sdk/`](packages/sdk/): `@crossfeed/sdk`, the TypeScript client of the REST API, typed from its OpenAPI document.
- [`plugins/crossfeed/`](plugins/crossfeed/): the Claude Code plugin, with the MCP server's config and two Agent Skills, listed by [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json).
- [`docs/SUBMISSION.md`](docs/SUBMISSION.md): the hackathon submission.
- [`docs/PRD.md`](docs/PRD.md), [`docs/TRD.md`](docs/TRD.md), [`docs/PRODUCT.md`](docs/PRODUCT.md), and [`docs/DESIGN.md`](docs/DESIGN.md): what Crossfeed does, how it's built, its record, and its look. [`GLOSSARY.md`](GLOSSARY.md) holds its terms and [`docs/adr/`](docs/adr/) its decisions.

## License

[MIT](LICENSE).
