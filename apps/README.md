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
printf 'QLOO_API_KEY=%s\nANTHROPIC_API_KEY=%s\nGUEST_PITCHES=on\n' "$QLOO_API_KEY" "$ANTHROPIC_API_KEY" > .dev.vars
```

`.dev.vars` is git-ignored. Never commit it, a key, or a Qloo response. `GUEST_PITCHES=on` shows the guest pitch flow locally; `wrangler.jsonc` keeps it `off` in production until #57 switches it on. Tests run with it off, and a test of the flow sets `env.GUEST_PITCHES = 'on'` itself.

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
- `fakeInsights(answer)` serves `POST /v2/insights` rankings: a list of `{ entity_id, name, affinity, explainability }`, an HTTP status, or a function of the request's flat-key body that returns either. Left out, `explainability` splits each score evenly across the request's anchors; `null` leaves it off the result.
- `fakeQlooDown(status)` answers every Qloo request, on any endpoint, with that status, as when Qloo is down. Registered after the other Qloo fakes, it overrides them; register them again to bring Qloo back.
- `fakeCompare(answer)` serves `GET /v2/analysis/compare` from shared tags keyed by side `b`'s entity ID: a list of `{ tag_id, name, score }` in Qloo's order, or an HTTP status. A side `b` with no entry shares no tags, and `{ latencyMs }` delays every answer.
- `fakeDemographics(answer)` serves `POST /v2/insights` demographics requests, those with `filter.type=urn:demographics`: the entries of a list of `{ entity_id, age, gender }` whose entity the request names, in the list's order as Qloo answers in no set order, or an HTTP status. `fakeInsights` leaves those requests to it, so the two can be registered in either order.
- `requests` records every request a fake served, in order, with the time it arrived (`at`) and how many Qloo requests were in flight (`inFlight`). `test/setup.ts` clears it after each test.
- `test/session.ts` wipes every Durable Object after each test, so the gateway's shared cache and daily count start empty. Keep `cloudflare:test` out of `test/setup.ts`: imported there, it crashes the next test file's worker when files share one, as on CI.
- Tests run with a 1-second Qloo timeout, retry delays of 10 and 30 ms, and no pacing (`vitest.config.ts`). A test that needs another value assigns it to `env` from `cloudflare:workers` and restores it afterwards, as `configure()` in `test/gateway.test.ts` does.
- Tests run with `SAMPLE_NETWORK` off, so a new session starts with an empty roster and makes no Qloo calls of its own. `test/sample.test.ts` turns it on to test the sample network.
- `fakeClaude(script)` is the scripted model. Each Messages API request gets the next turn, streamed as the API streams it, after an empty thinking block like Haiku 5.5's. Build turns with `turn(toolUse(name, input), text(...))`, which ends in tool calls if it has any, or `refusal(category)`. Tool use IDs are `toolu_<turn>_<block>`. A script entry can be an async function of the request, to hold a turn while the test looks at a running run. A request past the end of the script gets a 400.
- `modelRequests()` returns the body of every request the scripted model got, to check model settings and history.
- A run's topic baseline request doesn't take a scripted turn, and `modelRequests()` leaves it out. `fakeClaude` answers it from `fakeTopic(answer)`: show names in topic order, a scripted turn such as `refusal(...)`, an HTTP status, or a function of the request, which can hold its answer. By default it ranks the shows in the order the request lists them, `topicNames(request)`. `topicRequests()` returns each baseline request's body.
- Add a fake for a new endpoint or API to `test/fake.ts` the same way.

Fixtures are synthetic: made-up names, IDs, and scores. Never paste a real Qloo response into a test.

[msw-cf]: https://developers.cloudflare.com/workers/testing/vitest-integration/mock-outbound-requests/

### Driving a session

`openSession()` in `test/session.ts` is a visitor. It loads `/` for a session cookie, then opens the agent's WebSocket the way `useAgent` does:

- `call(method, ...args)` calls a `@callable` action and resolves with its result, after the state it set has arrived.
- `importRoster(text, format?)` imports a roster and resolves once every show's search has settled. `call('importRoster', ...)` resolves as soon as the shows are pending, before any search returns.
- `searchComps(name, query)` searches for a comp and resolves once the search has settled; `call('searchComps', ...)` resolves while it's still pending.
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

1.  Open the app in a fresh browser session. It opens on the sample network from `src/sample-network.json`: the top bar says "The Ringer · sample network" and "Sample data · not affiliated with The Ringer", every downloads, status, description, and CPM figure has a sample label beside it, and the launch field holds "The Watch", labelled "Sample launch". Every row says "Looking it up in Qloo…", then fills in as its search returns, within a few seconds when the gateway's cache is warm.
1.  Expect 16 resolved, Binge Mode ambiguous with its candidates, and The Zach Lowe Show and The Press Box missed. A "Lookup failed" row means Qloo still failed after the gateway's retries, or the daily cap was reached; its reason is in the row.
1.  Select Binge Mode and pick one of its candidates. Select The Zach Lowe Show, search for a comp such as The Lowe Post, and map it. Leave out The Press Box. Change a show's downloads: that figure loses its sample label.
1.  Reload: the roster and the edits stay. A private window opens on a fresh sample network.
1.  Type "The Big Picture" as the released launch and start a run. The header shows "Running" and "Resolving The Big Picture", then the Qloo match with its call number, and "Completed". The rail's Run module lists the progress notes as done.
1.  The fit chart ranks the other scorable shows by position and band, with the top five marked Finalist. Under "Not scored" it lists The Big Picture as the launch, The Press Box as excluded, and any show still unsettled. Open the chart's call number: the evidence holds the anchor and candidates in its parameters and each show's raw affinity, which the chart never shows.
1.  The run stops at "Waiting on you", and the rail's "Agent asks" module asks for the slot budget. Reload: the question stays. Answer with a slot count or a dollar amount. The next question asks which shows to leave out of this launch, in fit order: tick a finalist and answer. The chart drops its Finalist mark and gives it to the next show by fit, the header shows "Completed", and the Run module lists the budget and the shows left out.
1.  Run the sample launch, The Watch, the same way, leaving no show out. The Run module lists "Checking demographics of 5 finalists against The Watch". Above the chart, the Demographics line cites its call, says The Watch's listeners over-index at ages 35 to 44 and skew male, and says how many finalists' listeners differ, or that there are no mismatches. The Bill Simmons Podcast is marked "Listeners differ", with the reason under its name, and stays a finalist; in a run that leaves it out, The Town with Matthew Belloni is marked instead. Open the call: the evidence lists each show's raw value per age bucket and gender, which the chart never shows.
1.  Under each finalist's name, the tags it shares with the launch follow as words, with that compare's call number, and Podcasts never shows. Open one: its parameters are the launch on side `a` and the finalist on side `b`, and its tags list every tag Qloo returned, with scores the chart never shows.
1.  The Run module ends with Claude's closing line, labelled Agent: at most three sentences on what the plan covers and what's missing. Each call number in it opens that call's evidence. A failed or stopped run has no closing line, only its reason.
1.  Beside fit rank, "Last week" is each show's topic rank and "Move" its move. A show up three or more places has a red bullet, and the bullet's legend shows. Select one: its "why it moved" line opens with the ranking's call number, and a finalist's shared tags with theirs. The sample launch, The Watch, shows the demo's climbers, such as The Bill Simmons Podcast up from topic rank 9 or 10 to fit rank 4.
1.  Before it completes, the agent drafts the insertion order: the rail's "Insertion order draft" module lists finalists only, with slots, the agent's angle, each line's value, and its slot value, labelled sample while the sample downloads or CPM price it. The total stays within the budget; with a dollar budget, a "Failed" draft in the Run module was over it, and the next one fixed it. A show without downloads shows the gap and an incomplete total.
1.  Select "Edit lines": change a slot count and drop a show, and the total recomputes as you type. Save, then select the black "Approve": the chip says Approved. "Export CSV" downloads `IO-0001.csv`, with show, slots, angle, slot value, line value, and the total, which opens in a spreadsheet. Edit it again and it returns to draft; its CSV URL answers 409 until it's approved again.
1.  Choose "Unreleased, from comps", enter Blank Check, Filmspotting, and You Must Remember This, and start a run. The header shows "Unreleased, from comps" and lists the comps, each with its search's call number. The agent asks to confirm them in one question: Blank Check is ambiguous, so pick Blank Check with Griffin & David; the other two start picked. The header then shows the confirmed matches, and the fit chart ranks the roster against all three, its call's `signal.interests.entities` holding the three IDs, with "Led by" or "Comps contributed evenly" under each show. The Demographics line checks against the comps' listeners on average, at 35 to 44 and skewing male, with no disagreement noted. Run again from Pop Culture Happy Hour, Still Watching, and Culture Gabfest: the line says the comps disagree, as only Still Watching's listeners over-index at 35 to 44 and the comps skew opposite ways, and it checks only 55 and older. Starting from a released name Qloo doesn't have, such as "Sequel Season with Dana Whitfield", leads the agent to ask for comps instead.
1.  Include The Press Box again and select "Run again". The topic column keeps its ranks, and the log's `topic_baseline` line says `"cacheHit":true`: settling or excluding shows doesn't change its request. The rail's Runs module lists both runs and today's count out of 10. "View" on the first run shows what it ended with, read-only, with The Press Box still left out and its insertion order as you left it, an approved one still exportable; "Back to the latest run" returns.
1.  Start a run for "Binge Mode", which is ambiguous in Qloo. The agent asks which show the launch is, listing its candidates. Pick the one you picked for it in the roster: the header shows it with its search's call number instead of "Ambiguous", and the fit chart lists Binge Mode under "Not scored" as the launch.
1.  Clear the sample network: the roster empties, and the sample labels and notice go. Paste the 19 show names and import them: every log line says `"cacheHit":true`, and no new Qloo call is made.
1.  Replay: in a fresh session, start the sample launch, The Watch, and answer 20 slots and no exclusions. When it completes, a `"event":"sample_run"` log line says it's stored. Set `QLOO_DAILY_CALL_CAP=0` (locally in `.dev.vars` with a restart, or on the Worker as below) and start The Watch in another fresh session: the header says "Completed" and "Replayed" with the cap's reason, the chart, tags, budget, and exclusions are the stored run's, every cited call's evidence says "Replayed", and no `qloo_call` or `model_call` line follows. A run on an imported roster, or any other launch, stops at once with the cap message. `QLOO_TIMEOUT_MS=1` instead, plus one comp search that fails, replays the same way for five minutes. Put the cap back afterwards.

In a fresh browser session, check the guide through the sample launch:

1.  The rail's Guide, under any open question, is at step 1 of 5. Follow only its steps: start the sample launch, select the climber it names for why it moved, select the call it names in that line, answer the agent with its sample answers, and approve the order. Each step's own control moves it on, every other control still works, and it ends Done. Answer before opening the why line and the steps you passed say Skipped.
1.  Dismiss it, reload, and open a second tab: it stays hidden for the session. A private window shows it again.

With `GUEST_PITCHES=on`, check the inbox too:

1.  Open Inbox in the top bar and load the sample inbox. Within about 30 seconds every pitch shows its guest and work: 30 matched, Digger ambiguous, 5 not in Qloo (Hollywood, Ending; One Helluva Ride; Look at Me; Katabasis; New Heights), and 4 set aside with no public work. Claude's reading varies a little from run to run.
1.  Select Digger, pick the 2026 film, and reload: the match stays.
1.  Open a pitch's call: its parameters are only the work's title, type, and `take`.
1.  With the roster imported, "Rank against a show" has The Big Picture and its three past guests' films filled in from the sample. Select "Rank pitches": the rail's Run module looks up the three films and ranks the pitches, and within about 20 seconds four lists appear, 10 books, 8 films, 5 TV shows, and 3 podcasts, each by rank and band with no decimals and its own call. Atmosphere, Hamnet, The Bride!, and Pluribus are not scored, nor are the misses and Digger until it's confirmed.
1.  Open a list's call: its parameters are entity IDs only, and its affinities hold the raw scores the list leaves out.
1.  The run goes on to find the tags 10 top pitches share with The Big Picture, one compare call each, then drafts 40 replies in two calls. Under each top pitch in the lists, its tags follow as words with the compare's call; open one: side `a` is the show alone and side `b` the work, entity IDs only.
1.  "Replies" lists every pitch under Book, Later, or Decline: about 10, 19, and 11. Each Book reply shows its episode angle, the tags it's built from with their call, the sender it goes to, and a draft that names no guest and gives no reason. Copy is disabled on every draft.
1.  Approve one reply: only it shows Approved, and Copy puts its exact text on the clipboard. Edit another, discard a third, and reload: the edit and the discard stay, and Restore brings the discarded one back as a draft.
1.  With `GUEST_PITCHES` off, as deployed, there's no Inbox link and `/inbox` is a 404.

To cap the deployed Worker without a code change, deploy from up-to-date `main` with `bunx wrangler deploy --var QLOO_DAILY_CALL_CAP:0` (after `bun run build`), check, then `bun run deploy` again to restore `wrangler.jsonc`'s cap.

Gateway log lines (`"event":"qloo_call"`) show each Qloo call's endpoint, status, latency, retries, and cache hit, in the dev server's output, in Workers Logs, and live with `bunx wrangler tail --format json`. To see failures in the running app, add `QLOO_TIMEOUT_MS=1` or a low `QLOO_DAILY_CALL_CAP` to `.dev.vars` and restart the dev server. To see a slow call named, add a low `QLOO_SLOW_MS`, such as `500`, so a normal call passes it.

Agent log lines show each model call's tokens and cache reads (`"event":"model_call"`), each run's topic baseline with its status and whether it came from the cache (`"event":"topic_baseline"`), and one summary per run with its outcome (`"event":"run_summary"`). To see a run stopped at a limit, lower a limit in `src/limits.ts` while the dev server runs, and put it back afterwards.

## Where things go

- `src/index.tsx`: the Worker's routes, the session cookie, and the cron handler.
- `src/agent.ts`: `CrossfeedAgent`. Its synced `State` type and its `@callable` actions are the client protocol. `startLaunch` returns at once and runs the Claude tool loop in the background, writing a progress note per tool call. When a run ends, the agent keeps the state it ended with, which `getRun` returns. A completed sample launch run answered with the sample answers is also kept in the gateway, and while Qloo can't be called, `startLaunch` replays it instead of running, or stops any other run. The replay copies whatever state the stored run holds, except the session's own `inbox` and `runs`; a new session-level field that a launch run doesn't own joins `inbox` in `keepSampleRun`.
- `src/limits.ts`: the run limits, shared by the agent and the UI.
- `src/claude.ts`: the model settings for every agent turn. Change them only with the TRD's model settings.
- `src/prompt.ts`: the frozen system prompt. Its launch steps are in the PRD's order; a tool ticket fills its own step's `instruction`, and an empty step stays out of the prompt.
- `src/tools/`: one file per tool, registered in `src/tools/index.ts`. A tool has a strict definition, the progress note it shows, and `run`, which reaches Qloo through `context.qloo` and returns an error that says what to do next.
- `src/gateway.ts`: `QlooGateway`, the only code that calls Qloo. It also keeps the stored sample run, and `health()` says whether Qloo can be called: not once the day's cap is reached, nor for five minutes after a request fails after its retries, unless one succeeds since. Each method returns its data or error together with an evidence record. Every request goes through `request`, which sends GET parameters in the query string and POST ones as a JSON body of flat dotted keys, serves the shared cache, enforces the daily cap, paces and limits requests to 3 in flight, and retries; a new endpoint goes through it too.
- `src/evidence.ts`: the evidence record's shape. Fill its fields; don't reshape it.
- `src/resolve.ts`: deciding whether a search result is the named entity: a roster show by name, a pitched work by title, then its author or year.
- `src/demographics.ts`: the demographic check's derived values and its thresholds, built from one demographics call: the launch profile and each finalist's mismatches in words. Read `state.demographics`.
- `src/order.ts`: the insertion order's pricing, shared by the agent and the UI's live totals: slot values from downloads and CPM, the gaps a missing figure leaves, the line checks, and the CSV export. The `draft_insertion_order` tool stores the run's draft; the `editInsertionOrder` and `approveInsertionOrder` actions are the programmer's alone, and `GET /api/insertion-orders/:id.csv` calls the agent's `exportInsertionOrder`.
- `src/fit.ts`: the fit ranking's derived values, built from one ranking call: which roster shows are scorable, fit rank, band, leading comp, finalists, and each other show's reason for not being scored. Later tickets read `state.ranking` for finalists and leading comps. It also builds each pitch list, one per work type, which `rank_pitches` puts in `state.booking.lists`.
- `src/roster.ts`: reading an imported roster, pasted names or a CSV, into rows.
- `src/sample.ts`: the sample network a new session opens on, read from `src/sample-network.json`, with its suggested answers to the run's questions.
- `src/inbox.ts`: the inbox's types, reading the sample inbox or pasted pitches into rows, and reading the past guests a pitch run ranks against. `loadInbox` returns at once and reads the pitches in the background, five at a time.
- `src/extract.ts`: the pitch reader, one structured-output call per pitch. Single model calls beside the agent loop, such as the topic baseline, use `structured` from `src/claude.ts`.
- `src/topic.ts`: the topic baseline, one structured-output call per run that `startLaunch` starts beside the agent loop, cached in the agent by a hash of its request, and the topic moves `withMoves` works out from it and the fit chart, whichever lands last.
- `src/client/`: the React island. `main.tsx` passes the server's `data-page` to `App.tsx`, which renders the roster page or `Inbox.tsx`. `controls.tsx` holds the shared form pieces, such as `useAction` and `PickOne`. `App.tsx` lays out the chart column and the rail; add rail modules as `<section className="mod">` inside `.rail`. It renders from `shown`, the latest state or an earlier run's while one is viewed; render a run's results from `shown` so an earlier run shows its own, and hide editing controls while `viewing` is set. `InsertionOrder.tsx` is the rail's insertion order module. `Guide.tsx` is the rail's guide through the sample launch: a step the page alone sees, such as opening a why-it-moved line, calls `markGuide`. `states.tsx` holds the empty, loading, slow, failed, missed, and error states: put a state's words in a `StateLine` rather than styling your own, and name slow calls with `SlowCalls`. `Evidence.tsx` is the rail's evidence module: a cited call number is a `button.call` that opens its record, fetched with `getEvidence`. Label Qloo data with `<Source of="qloo" />` and agent text with `<Source of="agent" />` from `Source.tsx`, wherever they appear.
- `src/style.css`: the tokens and components from [DESIGN.md](/docs/DESIGN.md).

## See also

- [TRD](/docs/TRD.md), [PRD](/docs/PRD.md), and [DESIGN.md](/docs/DESIGN.md)
- [Workers Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/) and the [Agents SDK](https://github.com/cloudflare/agents)
