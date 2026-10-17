# Crossfeed

Crossfeed is an agent that tells a podcast network which of its own shows should promote a launch, and which pitched guests its listeners actually want. It ranks the network's own lists, its roster and its booking inbox, by listener overlap in [Qloo](https://www.qloo.com/), asks the human at each fork, and ends in a plan to approve. It's our entry to the [Qloo Agentic Hackathon](https://qloo.devpost.com/).

**Live demo: <https://crossfeed.m1kuorg.workers.dev>.** It needs no login, and opens on a sample network built from The Ringer's public show names, with labelled sample figures. Crossfeed isn't affiliated with The Ringer.

## Try the demo

1. Select **Start run** on the sample launch, The Watch. The fit chart ranks the roster by listener overlap ("this week") beside a topic-only ranking ("last week").
2. Select a show with a red bullet for why it moved, then a call number such as `C-21` for the Qloo request behind it.
3. Answer the agent's questions: a slot budget, such as 20 slots, and which shows to leave out.
4. Approve the insertion order and export it as CSV.
5. Open **Inbox**, load the 40-pitch sample inbox, and select **Rank pitches**. It ranks the guests' public works against The Big Picture and drafts a reply to every pitch.

The guide in the rail walks steps 1 to 4. [docs/SUBMISSION.md](docs/SUBMISSION.md) explains what Qloo does at each step, the endpoints it calls, and the known limitations.

## Run it locally

You need [Bun](https://bun.sh/), a [Qloo hackathon API key](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide#getting-your-api-key), and an [Anthropic API key](https://console.anthropic.com/). With both keys in your environment as `QLOO_API_KEY` and `ANTHROPIC_API_KEY`:

```sh
git clone https://github.com/m1kuorg/qloo.git
cd qloo/apps
bun install
printf 'QLOO_API_KEY=%s\nANTHROPIC_API_KEY=%s\n' "$QLOO_API_KEY" "$ANTHROPIC_API_KEY" > .dev.vars
bun run dev
```

Open the URL Vite prints, usually <http://localhost:5173>. The app calls the real Qloo and Anthropic APIs with your keys. `.dev.vars` is git-ignored: never commit it.

Run the tests, which fake Qloo and Anthropic at the network boundary and need no keys:

```sh
bun run test
```

The [apps README](apps/README.md) is the full how-to: tests, type checks, CI, deploying to Cloudflare Workers, and the live checks.

## Repository

- [`apps/`](apps/): the Cloudflare Worker, with the agent, the Qloo gateway, and the React UI.
- [`docs/SUBMISSION.md`](docs/SUBMISSION.md): the hackathon submission.
- [`docs/PRD.md`](docs/PRD.md), [`docs/TRD.md`](docs/TRD.md), [`docs/PRODUCT.md`](docs/PRODUCT.md), and [`docs/DESIGN.md`](docs/DESIGN.md): what Crossfeed does, how it's built, its terms, and its look.

## License

[MIT](LICENSE).
