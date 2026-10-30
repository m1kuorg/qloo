# Crossfeed

Crossfeed is an agent that tells a podcast network which of its own shows should promote a launch, and which pitched guests its listeners actually want. It ranks the network's own lists, its roster and its booking inbox, by listener overlap in [Qloo](https://www.qloo.com/), asks the human at each fork, and ends in a plan a person approves. It's our entry to the [Qloo Agentic Hackathon](https://qloo.devpost.com/), and a signed-in product a network's members can run together.

**Live: <https://crossfeed.m1kuorg.workers.dev>.** The landing page's first button, "Open the sample network", signs you in as a guest, in one click, and opens the guest network, which holds a sample network built from The Ringer's public show names, with labelled sample figures. Crossfeed isn't affiliated with The Ringer. The retired demo's address, [`/demo`](https://crossfeed.m1kuorg.workers.dev/demo), now leads to the sign-in page's guest option.

## Try it as a guest

1. On `/`, select **Open the sample network**. It signs you in as a guest, for a day, and opens the guest network's dashboard. The guest network holds The Ringer's 19 public show names on its roster, with labelled sample figures and a sample CPM, and the sample launch, The Watch, planned. Every guest shares the guest network, which is cleared every day at 12:00 UTC.
2. Select **Roster** in the rail, then its **Overlap** tab: each show's closest shows by listener overlap in Qloo, with the close pairs marked ⇄, and **Show all** for a show's whole ranking. Its **Listeners** tab shows who each show reaches, its lean by age band and gender. The guest network measures the overlap and profiles the listeners after each daily clearing, so both are usually measured when you arrive, and a tab still measuring fills in as its calls land. A guest's roster edit leaves both stale for every guest until someone measures again.
3. Select **Launches** in the rail, open **The Watch**, and select **Start run**. The fit chart ranks the roster by listener overlap in Qloo, with each show's rank in a topic-only plan in the Topic column, and the on-air readout at the top of the page says what the agent is doing.
4. Select a show marked ▲ in the Move column, such as The Bill Simmons Podcast, for why it moved, then the call number in that line, such as `C-21`: the inspector's Evidence tab shows the Qloo request behind the ranking and the raw scores the chart leaves out. Switch the chart to **By topic** to watch the shows move to the topic-only plan's order.
5. Answer the agent's questions in the card above the chart: a slot budget, such as 20 promo slots, then which shows to leave out.
6. When the run completes, read **The plan**, the insertion order the agent drafted and code priced. Under its budget check, it names each close pair among its shows, or says there's none. If a guest has changed the roster's matched shows since the overlap was measured, it says so instead and names no pair. Then select **Approve** and **Export CSV**, or **Open the report** for a page to print or save as PDF.
7. Select **Run again** and answer differently, such as 12 slots. Once the second run completes, the launch's **Changes** tab says what changed since the first. Close pairs and Changes show only on live runs a guest starts: the sample launches hold one captured run each, and neither those nor The Watch's stored run carries the roster's overlap. Each live run takes one of the 10 model runs all guests share a day. Once those are spent, The Watch replays its stored run, which names no close pair and doesn't reflect your answers, or stops if a guest has changed the roster or The Watch.
8. Select **Launches** in the rail, then its **Inventory** tab: the promo inventory the network's insertion orders commit, show by show, approved apart from drafted, and how many launches made each show a finalist. One of the sample launches is listed under **Approved**, and its plan's **Open the report** opens its launch report.
9. Select **Inbox** in the rail: it opens on the sample inbox, 40 pitches already read. Select **Rank pitches**. It ranks the guests' public works against The Big Picture, one list per type of work, and drafts a reply to every pitch for you to approve, edit, or discard. Each list's sentence names any pitches that read most on-topic but fall out of the top band by who listens, and **By the pitch** re-orders the list to what the pitches' own words would pick, Claude's reading with no Qloo data. You can also drop your own `.eml`, `.mbox`, or text pitches on it.

All guests share one set of daily limits. While no guest has changed the guest network's roster or The Watch, a run of The Watch that Qloo or a daily limit refuses replays its stored run. Every guest signs in as the one guest member, Guest, and can do anything an owner can in a network, but not change the account every guest shares; what guests make, the networks they create too, is cleared every day at 12:00 UTC, and "Sign out and create an account" leads to a network of one's own. [docs/SUBMISSION.md](docs/SUBMISSION.md) explains what Qloo does at each step, the endpoints it calls, and the known limitations.

## The product

Open at <https://crossfeed.m1kuorg.workers.dev> as a free beta, behind the `ACCOUNTS` switch that can turn it all off at once:

- **Sign-in:** sign up with your name and a passkey, keep the one-time recovery code, and sign in with the passkey alone. No password and no email.
- **Networks:** create a network, invite teammates with a link that works once, and work on one roster, one inbox, and every launch together, seeing each other's changes live.
- **Launches:** the dashboard, each network's home, lists what needs you, the latest runs, today's usage of the daily limits, and how the network's API keys are used, beside a setup checklist, and the Launches page lists each launch with its status, finalists, slots, and slot value. Each launch has its own page and keeps every run; a run ranks the network's roster as it stands when it starts.
- **Analysis:** each answer is on the page it's about, and comes from the Qloo call named here or from stored runs:
  - **Roster overlap:** the roster page's Overlap tab names each show's closest shows by listener overlap, and marks the close pairs, two shows that each rank among the other's closest. Measuring it makes one closed-list ranking per show matched in Qloo, `POST /v2/insights` with `filter.results.entities`, that show the signal and the rest of the roster the candidates.
  - **Listener profile:** the roster page's Listeners tab shows each show's lean by age band and gender, relative to the average in Qloo, with a finding in words, from one `POST /v2/insights` call with `filter.type=urn:demographics` for every show matched in Qloo. A lean describes a show's listeners, never a person.
  - **Close pairs in the plan:** a launch's run copies the roster's last measured overlap as it starts, and its plan names each close pair among its shows, citing both rankings, with no Qloo call of its own.
  - **Changes:** from a launch's second completed run, its Changes tab compares a run with an earlier one, reading both stored runs: the inputs that changed, the finalists that joined or left, each show's move, and the plan's slots and value.
  - **Promo inventory:** the Launches page's Inventory tab totals, from the launches' stored runs, how many launches made each show a finalist and the slots their insertion orders commit to it, approved apart from drafted.
  - **Launch report:** a run whose insertion order is approved has a report to print or save as PDF, read from its stored run: the finding, the finalists, the demographics, the close pairs, and the priced plan, with an index of every Qloo call it cites.
  - **By the pitch:** each of the inbox's ranked lists switches between "By who listens", Qloo's ranking, and "By the pitch", the pitch ranking: Claude's ranking of the pitches by what each one says, from its subject and opening, never its sender, with no Qloo data.
  - **Programs:** the REST API, the SDK, and the MCP server read and start the overlap and the listener profile too.
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
