# Crossfeed app

The Crossfeed Worker: a Hono app with a React island, a `CrossfeedAgent` per visitor session, and a global `QlooGateway`, on Cloudflare Workers. It's deployed at <https://crossfeed.m1kuorg.workers.dev>. This is the how-to every ticket follows; [TRD.md](/docs/TRD.md) holds the design.

Contents:

1.  [Set up](#set-up)
1.  [Run locally](#run-locally)
1.  [Test](#test)
    1.  [The fake HTTP seam](#the-fake-http-seam)
    1.  [Driving a session](#driving-a-session)
1.  [Check types](#check-types)
1.  [CI](#ci)
1.  [Deploy](#deploy)
1.  [Live check](#live-check)
1.  [Where things go](#where-things-go)
1.  [See also](#see-also)

## Set up

Run these in `apps/`, with `QLOO_API_KEY` and `ANTHROPIC_API_KEY` in your environment:

```sh
bun install
printf 'QLOO_API_KEY=%s\nANTHROPIC_API_KEY=%s\n' "$QLOO_API_KEY" "$ANTHROPIC_API_KEY" > .dev.vars
```

`.dev.vars` is git-ignored. Never commit it, a key, or a Qloo response.

After changing `wrangler.jsonc`, run `bun run cf-typegen` to regenerate `Env` in `worker-configuration.d.ts`.

## Run locally

```sh
bun run dev -- --port 5128 --strictPort
```

Ticket `#n` uses port `5100 + n`, so parallel worktrees don't collide. The dev server calls the real Qloo API with the key in `.dev.vars`. Stop the server when you're done.

## Test

```sh
bun run test
```

Tests run in the Workers runtime through `@cloudflare/vitest-plugin`, configured in `vitest.config.ts`. The Worker and its Durable Objects run in the tests' isolate. Tests drive the public interface only: the Worker's HTTP routes and the agent's client protocol, asserting on synced state and responses.

### The fake HTTP seam

Outbound HTTP is the one seam. `test/fake.ts` holds the fakes, which [`@msw/cloudflare`][msw-cf] serves by intercepting `fetch` inside the runtime. `QLOO_BASE_URL` points at `https://qloo.test` and `ANTHROPIC_BASE_URL` at `https://anthropic.test` in tests, and a request no fake serves fails the test.

- `fakeQloo({ search })` serves `/search` from hand-written results keyed by query. A number in place of results answers with that HTTP status, `{ status, body }` answers with that raw body, such as a proxy's HTML error page, and `'hang'` never answers, so the gateway times out.
- `fakeQloo({ search, first: { 'Deep Cuts': [503, 503] } })` answers a query's first requests from `first`, in order, then from `search`. `latencyMs` delays every answer.
- `requests` records every request a fake served, in order, with the time it arrived (`at`) and how many Qloo requests were in flight (`inFlight`). `test/setup.ts` clears it after each test.
- `test/setup.ts` also wipes every Durable Object after each test, so the gateway's shared cache and daily count start empty.
- Tests run with a 1-second Qloo timeout, retry delays of 10 and 30 ms, and no pacing (`vitest.config.ts`). A test that needs another value assigns it to `env` from `cloudflare:workers` and restores it afterwards, as `configure()` in `test/gateway.test.ts` does.
- `fakeClaude(script)` is the scripted model. Each Messages API request gets the next turn, streamed as the API streams it, after an empty thinking block like Haiku 5.5's. Build turns with `turn(toolUse(name, input), text(...))`, which ends in tool calls if it has any, or `refusal(category)`. Tool use IDs are `toolu_<turn>_<block>`. A script entry can be an async function of the request, to hold a turn while the test looks at a running run. A request past the end of the script gets a 400.
- `modelRequests()` returns the body of every request the scripted model got, to check model settings and history.
- Add a fake for a new endpoint or API to `test/fake.ts` the same way.

Fixtures are synthetic: made-up names, IDs, and scores. Never paste a real Qloo response into a test.

[msw-cf]: https://developers.cloudflare.com/workers/testing/vitest-integration/mock-outbound-requests/

### Driving a session

`openSession()` in `test/session.ts` is a visitor. It loads `/` for a session cookie, then opens the agent's WebSocket the way `useAgent` does:

- `call(method, ...args)` calls a `@callable` action and resolves with its result, after the state it set has arrived.
- `state()` is the latest synced state, and `until(ready)` waits for synced state that passes `ready`, such as a finished run.
- `frames()` is every raw frame the server sent, which is everything the visitor's browser receives.
- `openSession(cookie)` reconnects as the same visitor, like a reload; `openSession()` is a new visitor.

## Check types

```sh
bun run typecheck
```

Client files under `src/client/` use React JSX. Server files that render the HTML shell use Hono JSX and start with `/** @jsxImportSource hono/jsx */`.

## CI

[`.github/workflows/ci.yml`](/.github/workflows/ci.yml) runs on every pull request, including a retitle, and on every push to `main`. One job installs both packages with `bun install --frozen-lockfile`, then runs these steps. Each step runs even when an earlier one fails, so one run reports every failure:

1.  **Format:** `bun run lint` at the repo root, Prettier's check.
1.  **Typecheck:** `bun run typecheck` in `apps/`.
1.  **Test:** `bun run test` in `apps/`.
1.  **PR title:** the title through `bunx commitlint`, on pull requests only.
1.  **Secrets:** `gitleaks git` on the commits the pull request or push adds.

Before merging, wait for green with `gh pr checks <pr> --watch`. Locally, run the listed commands where they're listed, check a title with `echo '<title>' | bunx commitlint` at the repo root, and check your commits with `gitleaks git --log-opts="origin/main..HEAD"`.

## Deploy

Deploy only from an up-to-date `main`, and only one deploy at a time:

```sh
git fetch origin main && git checkout --detach origin/main
cd apps && bun install && bun run deploy
```

Secrets live on the `crossfeed` Worker in the `qloo` Cloudflare account, and are set once with `bunx wrangler secret put QLOO_API_KEY` and `ANTHROPIC_API_KEY`. List them with `bunx wrangler secret list`.

## Live check

Done means the behaviour works against the real APIs, first locally and then on <https://crossfeed.m1kuorg.workers.dev>, checked by hand or with `playwright-cli`:

1.  Open the app in a fresh browser session.
1.  Paste The Ringer's 19 show names from `src/sample-network.json` and import them.
1.  Expect 16 resolved, Binge Mode ambiguous with its candidates, and The Zach Lowe Show and The Press Box missed. A "Lookup failed" row means Qloo still failed after the gateway's retries, or the daily cap was reached; its reason is in the row.
1.  Select Binge Mode and pick one of its candidates. Select The Zach Lowe Show, search for a comp such as The Lowe Post, and map it. Leave out The Press Box.
1.  Reload: the roster stays. A private window starts empty.
1.  Type "The Big Picture" as the released launch and start a run. The header shows "Running" and "Resolving The Big Picture", then the Qloo match with its call number, and "Completed". The rail's Run module lists the progress note as done.
1.  Import the same names again: every log line says `"cacheHit":true`, and no new Qloo call is made.

Gateway log lines (`"event":"qloo_call"`) show each Qloo call's endpoint, status, latency, retries, and cache hit, in the dev server's output, in Workers Logs, and live with `bunx wrangler tail --format json`. To see failures in the running app, add `QLOO_TIMEOUT_MS=1` or a low `QLOO_DAILY_CALL_CAP` to `.dev.vars` and restart the dev server.

## Where things go

- `src/index.tsx`: the Worker's routes, the session cookie, and the cron handler.
- `src/agent.ts`: `CrossfeedAgent`. Its synced `State` type and its `@callable` actions are the client protocol. `startLaunch` returns at once and runs the Claude tool loop in the background, writing a progress note per tool call.
- `src/claude.ts`: the model settings for every agent turn. Change them only with the TRD's model settings.
- `src/prompt.ts`: the frozen system prompt. Its launch steps are in the PRD's order; a tool ticket fills its own step's `instruction`, and an empty step stays out of the prompt.
- `src/tools/`: one file per tool, registered in `src/tools/index.ts`. A tool has a strict definition, the progress note it shows, and `run`, which reaches Qloo through `context.qloo` and returns an error that says what to do next.
- `src/gateway.ts`: `QlooGateway`, the only code that calls Qloo. Each method returns its data or error together with an evidence record. Every request goes through `get`, which serves the shared cache, enforces the daily cap, paces and limits requests to 3 in flight, and retries; a new endpoint goes through it too.
- `src/evidence.ts`: the evidence record's shape. Fill its fields; don't reshape it.
- `src/resolve.ts`: deciding whether a search result is the named entity.
- `src/roster.ts`: reading an imported roster, pasted names or a CSV, into rows.
- `src/client/`: the React island. `App.tsx` lays out the chart column and the rail; add rail modules as `<section className="mod">` inside `.rail`. `Evidence.tsx` is the rail's evidence module: a cited call number is a `button.call` that opens its record, fetched with `getEvidence`. Label Qloo data with `<Source of="qloo" />` and agent text with `<Source of="agent" />` from `Source.tsx`, wherever they appear.
- `src/style.css`: the tokens and components from [DESIGN.md](/docs/DESIGN.md).

## See also

- [TRD](/docs/TRD.md), [PRD](/docs/PRD.md), and [DESIGN.md](/docs/DESIGN.md)
- [Workers Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/) and the [Agents SDK](https://github.com/cloudflare/agents)
