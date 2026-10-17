# TRD

How Crossfeed is built: its architecture, its Qloo calls, the agent, storage, limits, deployment, and tests. The [PRD](PRD.md) says what ships and why, and [PRODUCT.md](PRODUCT.md#terminology) defines the terms used here. Facts marked _(verify)_ were not checked against a primary source or a live call.

Contents:

1.  [Architecture](#architecture)
    1.  [Why this stack](#why-this-stack)
    1.  [Components](#components)
1.  [Qloo integration](#qloo-integration)
    1.  [Calls](#calls)
    1.  [Response fields used](#response-fields-used)
    1.  [Gateway rules](#gateway-rules)
    1.  [Call budget per run](#call-budget-per-run)
1.  [Agent design](#agent-design)
    1.  [Model settings](#model-settings)
    1.  [Tools](#tools)
    1.  [Questions and approvals](#questions-and-approvals)
    1.  [Other model calls](#other-model-calls)
    1.  [Agent limits](#agent-limits)
1.  [Derived values](#derived-values)
1.  [Storage](#storage)
1.  [Client protocol](#client-protocol)
1.  [Caching, caps, and replay](#caching-caps-and-replay)
1.  [Security, privacy, and safe use](#security-privacy-and-safe-use)
1.  [Deployment and configuration](#deployment-and-configuration)
1.  [Observability](#observability)
1.  [Testing](#testing)
1.  [Demo data](#demo-data)
1.  [Open technical questions](#open-technical-questions)
1.  [See also](#see-also)

## Architecture

```text
Browser (judge, programmer, booker)
  │  HTTPS: pages, CSV export        WebSocket: state sync, actions
  ▼                                  ▼
Worker (Hono) ──── routes /agents/* ──► CrossfeedAgent  (Durable Object, one per visitor session)
  │                                       │  Claude tool loop, roster, runs, insertion orders,
  │                                       │  pitches, replies, evidence log (SQLite)
  │                                       ├──► Anthropic Messages API (official SDK)
  │                                       ▼
  └── cron: daily health check ────► QlooGateway  (Durable Object, one global instance)
                                          │  key, retries, concurrency, cache, daily caps (SQLite)
                                          ▼
                                     https://hackathon.api.qloo.com
```

### Why this stack

- **Cloudflare Workers** is already scaffolded in [`apps/`](/apps/) with Hono and Vite. Time spent waiting on `fetch()` doesn't count toward CPU time, and HTTP-triggered Workers have no hard duration limit, which suits slow Qloo calls ([Workers limits][cf-limits]).
- **The Cloudflare Agents SDK** (`agents` 0.28.1) is the agent framework the rules ask for ([BRIEF](BRIEF.md#challenge)). Its `Agent` class runs on a Durable Object and gives per-session state synced to clients, embedded SQLite, WebSockets, and schedules ([Agents API][cf-agent]).
- **Claude through the official Anthropic SDK** (`@anthropic-ai/sdk`, which supports Cloudflare Workers). We use the base `Agent` class, not `AIChatAgent`, because `AIChatAgent` runs on the Vercel AI SDK, and the official SDK exposes the Claude features below (effort, adaptive thinking, strict tools) directly.
- **Direct REST to Qloo**, not the hackathon kit's `qloo mcp` harness, which can't run serverless ([CONTEXT](CONTEXT.md#hackathon-kit)).
- **The Workers Paid plan is required.** Free allows 50 subrequests and 10 ms of CPU per invocation; a cold guest run needs about 50 Qloo calls plus model calls. Paid allows 10,000 subrequests and 30 s of CPU by default, for $5 a month ([Workers limits][cf-limits]).

[cf-limits]: https://developers.cloudflare.com/workers/platform/limits/
[cf-agent]: https://developers.cloudflare.com/agents/runtime/agents-api/

### Components

- **Worker:** a Hono app that serves the server-rendered shell, routes `/agents/session` to the visitor's agent, serves CSV export, and runs the cron health check. `GET /` sets the session cookie, and `/agents/session` picks the `CrossfeedAgent` instance from it, which the client reaches with `useAgent`'s `basePath` ([custom routing][cf-routing]). The Worker doesn't use `hono-agents`' `agentsMiddleware`, because its `/agents/<binding>/<name>` routes would let a client open any session or reach `QlooGateway`.
- **`CrossfeedAgent`:** one instance per visitor session, named by a random session ID kept in an HttpOnly cookie. It owns the Claude loop, the session's roster, launches, runs, insertion orders, pitches, replies, and evidence log. Clients can't write its state; it changes only through actions.
- **`QlooGateway`:** one global instance, the only code that calls Qloo. Session agents reach it over Durable Object RPC. It owns the key, the request shape, retries, the concurrency limit, the response cache, the daily caps, and evidence records. Each method returns its data or its error as a value, together with the call's evidence record, so a failure's evidence survives the RPC hop.
- **UI:** a server-rendered Hono JSX shell with a React client island that connects through `useAgent` from `agents/react`, the Agents SDK's documented client path.

[cf-routing]: https://developers.cloudflare.com/agents/runtime/communication/routing/

## Qloo integration

Base URL `https://hackathon.api.qloo.com`, header `X-Api-Key`. The calls below were checked live on 2026-10-17 unless marked _(verify)_; every call returned 200 in 1 to 4 seconds at a concurrency of 3.

### Calls

- **Resolve a show:** `GET /search?query=<name>&types=urn:entity:podcast&take=3`.
- **Resolve a work:** the same, with `take=5` and `types` set by work type: `urn:entity:book`, `urn:entity:movie` for films, `urn:entity:tv_show`, or `urn:entity:podcast`. Each result's `disambiguation` gives its year, plus the author for books. An older work with the same title can come first, such as the 1931 Frankenstein above the 2025 film, so the year decides between same-name results ([demo data](#demo-data)). A book is matched by its author instead: a same-title book credited to someone other than the guest isn't the guest's, because Haiku's recalled years were wrong for 6 of 36 sample works, mostly books, while its film and TV years were right. The guest's name is compared in the session and never sent. Among the guest's books or same-year results, one with no popularity gives way to one that has; without a year, popularity decides nothing. Several matches left go to the booker to confirm with `confirmWork`.
- **Rank a closed list:** `POST /v2/insights` with `filter.type=urn:entity:podcast`, `signal.interests.entities=<anchor IDs>`, `filter.results.entities=<candidate IDs>`, `feature.explainability=true`, and `take=50`. With comps, all of them go in as one comma-separated signal.
- **Rank pitched works:** the same, once per work type, with `filter.type` set to that type and the show plus past guests' works as anchors. Rankings across categories return scores and explainability, as for books ranked against a podcast ([demo data](#demo-data)).
- **Demographics:** `POST /v2/insights` with `filter.type=urn:demographics` and `signal.interests.entities=<launch or comp IDs, and finalist IDs>`. It returns one entry per entity.
- **Shared tags:** `GET /v2/analysis/compare?a.signal.interests.entities=<launch or comps>&b.signal.interests.entities=<finalist>&take=50` _(verify: several comps on side `a`)_.
- **Find a comp for a roster show:** `GET /search?query=<what the programmer typed>&types=urn:entity:podcast&take=5`.
- **Health check:** `GET /search?query=The%20Rewatchables&types=urn:entity:podcast&take=1`.

POST bodies use flat dotted keys, such as `{"filter.type": "urn:entity:podcast", "take": 50}`; a nested body returns 400 ([BRIEF](BRIEF.md#live-api-checks)).

Not used: `/entities?external.spotify.ids=` is accepted but found no podcast by its Spotify show ID, and only 1 of 200 podcast search results carried a Spotify ID. iTunes IDs are stored on most podcasts but `external.itunes.ids` found none.

### Response fields used

- **Search:** each result's entity ID, name, and popularity, shown as candidates for ambiguous matches.
- **Ranking:** each result's `query.affinity` and its `query.explainability["signal.interests.entities"]`, a list of `{entity_id, score}` per anchor. The top-level `effect_on_top3_recs` through `effect_on_all_recs` summaries are logged but not shown. `query.measurements.audience_growth` was always 0 and is ignored.
- **Demographics:** `results.demographics[]`, one entry per entity, with `query.age` over the buckets `24_and_younger`, `25_to_29`, `30_to_34`, `35_to_44`, `45_to_54`, and `55_and_older`, and `query.gender.male` and `female`. Values are relative to average and ran from −0.9 to +0.69.
- **Compare:** `results.tags[]`, each with `tag_id`, `name`, and `query.score`. Scores sat between 0.700 and 0.731, so tags are used as words, not ranked by score, and generic tags such as "Podcasts" are dropped through a stoplist.

### Gateway rules

- **Request shape:** GET for `/search` and compare, POST with flat keys for `/v2/insights`.
- **Timeout and retries:** a 20-second timeout per request. Retry 429, 502, 503, 504, and timeouts at most twice, after about 1 and 3 seconds with jitter. A 400 is never retried; Qloo's message goes back to the caller. A call that fails after retries says how many, such as "Qloo returned 429: Rate limit exceeded, after 2 retries". Its latency runs from its first request, so time spent queued behind other calls isn't blamed on Qloo.
- **Concurrency:** at most 3 Qloo calls in flight across all sessions. The idea's bets report that about 5 concurrent calls trip the rate limit ([IDEA](IDEA.md#bets-to-test)) _(verify)_, and Workers allow six connections per invocation waiting on headers.
- **Unscored signal:** a ranking whose affinities are all null means the anchors didn't resolve, so the gateway returns an error, not a result ([BRIEF](BRIEF.md#gotchas-beyond-the-developer-guide)).
- **Silently ignored parameters:** a ranking that returns an entity outside the candidate list, or no explainability when it was requested, is an error.
- **Unscored candidates:** a ranking silently leaves out any candidate the signal gave no score, which happened to most works released since about May 2025 ([demo data](#demo-data)). The gateway reports each one as unscored.
- **Size:** at most 50 candidates per ranking, since `take` maxes out at 50 and scores from separate calls aren't comparable.
- **Evidence:** every call, cached or not, appends a record to the calling session's evidence log. The gateway builds the record, and the session's one path to the gateway numbers it (`C-01`, in the order calls start) and appends it, success or failure. Its shape is fixed in [`apps/src/evidence.ts`](/apps/src/evidence.ts): call number, run, time, method, endpoint, parameters, status, latency, retries, cache hit, error, and lists of entities, tags, and affinities, which each endpoint fills.
- **Rate:** on 2026-10-17 Qloo answered 429 "Rate limit exceeded" to bursts of three searches that each took about 300 ms, with other clients sharing the key, while three calls in flight of about 1 second each passed. The limit is on request rate, not only concurrency, so the gateway paces calls as well as capping them: each request starts at least 400 ms after the last, about 2.5 a second, between the sequential import's 2 a second and the 3 a second that passed. The roster import searches all its shows at once and leaves the pacing to the gateway; on 2026-10-17 the 19 Ringer shows took about 8 seconds with no 429.

### Call budget per run

With a 20-show roster already resolved and an assumed worst case of 8 seconds per call. The ranking runs first, because it picks the finalists; demographics and compares then run together:

- **Launch, released:** 1 ranking, then 1 demographics and 5 compares, so 7 calls in three rounds at a concurrency of 3, about 24 seconds.
- **Launch, three comps:** 3 searches plus the 7 above, so 10 calls.
- **Cold roster:** add 20 searches.
- **Guest inbox of 40 pitches:** 40 searches, at most 4 rankings (one per work type), and 5 compares, so about 49 calls and about 2.5 minutes cold. The sample inbox is served warm.

## Agent design

The launch and guest flows follow fixed steps, so the agent works from a short system prompt that lays them out, and from tools that bundle Qloo call chains ([Building effective agents][anthropic-agents]). A launch run takes about five model turns.

[anthropic-agents]: https://www.anthropic.com/engineering/building-effective-agents

### Model settings

- **Model:** `claude-haiku-5-5`, streamed through `client.messages.stream`.
- **Thinking:** adaptive, on by default. A response can start with `thinking` blocks whose text is omitted, and thinking counts toward `max_tokens`, so code reads content blocks by type and passes thinking blocks back unchanged with tool results.
- **Effort:** `output_config.effort` set explicitly to `medium`, this model's default.
- **Output room:** `max_tokens` of 16,000 on every call, so thinking can't use up the answer's budget.
- **Sampling and prefill:** send no sampling parameters and no assistant prefill. A non-default `temperature` or `top_p`, any `top_k`, and any prefill return a 400.
- **Refusals:** safety classifiers can decline with `stop_reason: "refusal"`, and this model has no server-side fallback. Check `stop_reason` before reading content on every call. A refused agent turn stops the run with the refusal shown as a failed step.
- **Tools:** `strict: true` and `additionalProperties: false` on every tool, and `tool_choice` `auto`, because a forced tool choice skips thinking on this model.
- **Parallel calls:** execute every `tool_use` block in a turn concurrently, and return all results in one user message. A failed tool returns `is_error: true` with a message that says what to do next.
- **History is append-only.** Never edit or delete earlier turns, and keep `system` and the tool list fixed for a session. On this model, sending a thinking block back after a change to `system`, `tools`, or earlier messages returns a 400. Stored history keeps every thinking block as returned, including blocks with empty text and only a `signature`.
- **Prompt caching:** a frozen system prompt and a fixed, sorted tool list sit before a `cache_control` breakpoint, above this model's 512-token minimum _(verify)_; session data goes in `messages`, never in `system`.
- **Later, if time allows:** an effort sweep on the demo scenarios, and checking cache reads.

### Tools

Each tool returns names alongside IDs, and errors the model can act on ([Writing effective tools for agents][anthropic-tools]):

- **`resolve_entities(names, type)`:** each name comes back resolved, ambiguous with up to three candidates, or missed.
- **`rank_candidates(anchor_ids, candidate_ids, type)`:** ranks, bands, raw affinities, comp shares, and the evidence ID. The run's first message lists the roster's scorable shows with their IDs. The roster is the closed list, so the tool ranks every scorable show even when the model leaves one out, refuses an ID that isn't a roster show or an anchor the session never resolved, and leaves an anchor that is itself a roster show out of the candidates.
- **`check_demographics(anchor_ids, candidate_ids)`:** age-band and gender deltas and mismatch flags per candidate.
- **`shared_tags(anchor_ids, candidate_ids)`:** the top non-generic shared tags per candidate, from parallel compare calls.
- **`ask_human(question, kind, options)`:** pauses the run until the human answers in the UI. `kind` is `choice` for a fork answered with one of `options` or free text, or `budget` or `exclusions`, whose answer forms code builds.
- **`draft_insertion_order(lines)`:** takes finalists, slot counts, and angles, computes slot values in code, rejects a draft over the slot budget, and stores the rest as a draft for the UI.
- **`rank_pitches(show_id, past_guest_work_ids, pitch_ids)`:** groups pitched works by type and returns one ranked list per type.
- **`draft_replies(replies)`:** stores a draft reply per pitch with its verdict.

[anthropic-tools]: https://www.anthropic.com/engineering/writing-tools-for-agents

### Questions and approvals

- **Questions:** when the model calls `ask_human`, the agent stores the open question in its state and ends the loop. The UI renders the question card. When the human answers, the next user message holds that call's tool result, a neutral "asked the human" notice, followed by the answer as a separate text block, and the loop resumes. The answer never goes inside the tool result, because this model can treat user text there as untrusted and ignore it. The system prompt requires a question for every ambiguous match and every miss among the matches it makes during a run (the launch, its comps, and pitched works), comps for an unreleased launch, the slot budget, and exclusions.
- **Structured answers:** the slot budget, a count of promo slots or a dollar amount, and the run's exclusions, chosen from the shows the run can score, are answered in forms code builds. Code stores them on the run, where the insertion order is checked against them; the model sees the answer but can't set either. A run's exclusions apply to that run only, apart from the roster's own excluded shows. A turn that asks waits in storage with its other tool results until the answer arrives, so the conversation never ends on an unanswered call, and a run waiting on a question survives a restart.
- **Roster matches:** settled by the programmer in the roster view, not by the agent's questions. Through `updateShow`, they pick an ambiguous show's candidate, map a missed show to a comp found with `searchComps`, or leave the show out, which marks it excluded. A show still ambiguous, missed, or failed when a launch runs is never scored, and the ranking lists it as not scored, with the reason. Two shows can be mapped to the same comp, so a ranking sends each entity ID once.
- **Approvals:** approving or editing an insertion order and approving, editing, or discarding a reply are client actions handled in code, and no tool can perform them. Export refuses any insertion order that isn't approved.
- Runs are short and the human gates sit between turns, so the agent's own SQLite state is enough; the Agents SDK's Workflow approval pattern isn't needed ([human in the loop][cf-hitl]).

[cf-hitl]: https://github.com/cloudflare/agents/blob/main/docs/agents/human-in-the-loop.md

### Other model calls

Single calls with structured outputs (`output_config.format`), on the same model at `low` effort:

- **Topic baseline:** ranks the roster by topic from show names and the network's own one-line descriptions. It gets no Qloo data, because it is the without-Qloo counterfactual. If it's refused, the fit ranking shows without the topic column.
- **Pitch extraction:** turns each pitch email into a guest name, a work title, a work type, the work's year when the pitch or the model's knowledge gives it, and whether there is a public work. The guest name stays in the session's storage and is never passed to a Qloo tool. A refused extraction sets that pitch aside as unreadable.

### Agent limits

- At most 12 model turns and 60 Qloo calls per run. Past either limit, the run stops as "stopped at a limit", never as completed, and says what it hadn't done.
  - **Turns:** the 12th model call is the last. If it asks for tools, they aren't run, because their results would need a 13th turn, and the run names them as not run.
  - **Qloo calls:** every call the run makes counts, cache hits included, so a warm run and a cold one are bounded the same. The 61st is refused before it reaches the gateway or the evidence log, the tool call that made it is cut off, and the run stops once that turn's other calls finish.
  - The limits live in [`apps/src/limits.ts`](/apps/src/limits.ts), and each run's counts in the agent's `runs` table, so a run paused on a question keeps its count.
- At most 10 runs per session per UTC day, counting every run started. The 11th is refused with a message.
- **Re-runs:** starting a run again, after changing comps, the budget, or exclusions, starts a new run with its own conversation. When a run ends, the agent keeps the synced state it ended with, roster included, and `getRun` returns it, so every earlier run stays viewable read-only. Later per-run results in the synced state are kept the same way.

## Derived values

- **Band:** top, middle, or bottom third by rank within one ranking. A null affinity is "unscored".
- **Leading comp:** named only when there are two or more anchors and the top comp's explainability score beats the next one by 0.05 or more on that result. Below that, the UI says the comps contributed evenly.
- **Finalists:** the top five shows by fit after exclusions. A demographic mismatch flags a finalist but doesn't remove it.
- **Slot allocation:** the model proposes slot counts for the finalists. Code rejects a draft whose slots exceed a count budget or whose total exceeds a dollar budget.
- **Launch profile:** the launch's demographics, or with comps, the mean of the comps' values per age bucket and gender _(verify that the mean reads sensibly)_.
- **Demographic mismatch:** take the launch profile's two most over-indexed age buckets. Flag a candidate that under-indexes, with a value below 0, on either of them, or whose gender skew has the opposite sign to the launch profile's, when both magnitudes are 0.2 or more. The thresholds are starting values to tune on the demo network.
- **Slot value:** downloads per episode × CPM ÷ 1,000, rounded to whole dollars. The insertion order total is the sum of slot count × slot value.
- **Topic move:** a show's topic-baseline rank minus its fit rank. A move of three or more places is highlighted.

## Storage

All storage is Durable Object SQLite: strongly consistent, private to each instance, and up to 10 GB per object ([Durable Object limits][cf-do-limits]).

- **`CrossfeedAgent`:** tables for networks, shows (name, Qloo ID, resolution state, downloads, status, description), launches and comps, runs, ranked results, insertion orders and their lines, pitches, replies, the evidence log, and the conversation's messages.
- **`QlooGateway`:** the response cache, keyed by a hash of the method, path, and sorted parameters, and the daily Qloo call counter.

KV is a poor fit because writes take 60 seconds or more to propagate, and the Cache API doesn't replicate beyond its data center ([KV][cf-kv], [Cache API][cf-cache]).

[cf-do-limits]: https://developers.cloudflare.com/durable-objects/platform/limits/
[cf-kv]: https://developers.cloudflare.com/kv/concepts/how-kv-works/
[cf-cache]: https://developers.cloudflare.com/workers/runtime-apis/cache/

## Client protocol

- **State:** the agent's synced state carries what the UI renders: the roster with resolution states, the current run's status and the progress notes code writes for each tool call, such as "Scoring 16 shows against The Big Picture", the open question, rankings with the topic baseline, the insertion order draft, the inbox, and draft replies. The evidence log is fetched on demand, not synced.
- **Actions:** `@callable` methods on the agent: `importRoster` (pasted names, or a CSV with `name` and optional `downloads`, `status`, and `description` columns), `updateShow`, `searchComps`, `setCpm`, `startLaunch`, `answer`, `editInsertionOrder`, `approveInsertionOrder`, `loadInbox` (the sample inbox, or pasted pitches separated by lines of `---`, up to 50), `confirmWork` (one of an ambiguous work's candidates), `startPitches` (with the show and its past guests' works), `editReply`, `approveReply`, `discardReply`, `getEvidence`, and `getRun` (what an earlier run ended with). `@callable` needs the `agents/vite` plugin ([configuration][cf-config]).
- **Call timeout:** `useAgent` rejects a call after 30 seconds, but one Qloo call can take about 64 seconds when Qloo hangs (three 20-second attempts plus backoff). An action that waits on Qloo returns early and reports progress in synced state instead. `importRoster` sets every show to `pending`, citing the call it waits on, and returns; each show fills in as its search settles. A second import is refused until the first has settled, and a show still pending when the agent restarts is marked failed as interrupted. `loadInbox` works the same way: each pitch fills in as Claude reads it and its work's search settles. `searchComps` sets the show's comp search to `pending` the same way, then fills in its results, or its failure with the reason; only the show's latest comp search lands.
- **HTTP:** `GET /` serves the shell, and `GET /api/insertion-orders/:id.csv` exports an approved order, returning 409 for a draft.

## Caching, caps, and replay

- **Cache:** Qloo responses are cached privately with no expiry, which the hackathon allows ([BRIEF](BRIEF.md#implications-for-our-entry)). The sample network, its launch, and the sample inbox are warmed before submission.
- **Caps:** a daily cap on Qloo calls (`QLOO_DAILY_CALL_CAP`, default 1,000, counted in UTC days, retries included and cache hits not), plus the per-run and per-session limits under [Agent limits](#agent-limits). The default is a guess, because the Qloo quota is unknown ([CONTEXT](CONTEXT.md#unverified)). Model spend is bounded by a spend limit on the Anthropic account _(verify the Console setting)_, not by code.
- **Replay:** the sample launch's completed run is stored server-side. When a cap is hit or Qloo keeps failing, sample runs replay from storage with a visible "replayed" label, and runs on visitors' own data stop with a clear message.
- **Health check:** a daily cron makes the health-check call and one cached sample ranking and logs a failure loudly.

## Security, privacy, and safe use

- **Secrets:** `QLOO_API_KEY` and `ANTHROPIC_API_KEY` are set with `wrangler secret put`, and locally in `.dev.vars`, which [`apps/.gitignore`](/apps/.gitignore) already ignores ([secrets][cf-secrets]). Keys are never logged or sent to the client.
- **Qloo data:** never committed, exported, or sent to the browser beyond what the UI shows. Evidence shows parameters, names, tags, and scores, not raw response bodies. Test fixtures are synthetic.
- **No personal data to Qloo:** gateway calls take entity IDs, show names, and work titles, never pitch text. Tests check every recorded Qloo request against the sample inbox's guest names and email addresses.
- **Pitch text goes to Anthropic** for extraction and drafting. The sample inbox is synthetic; real use would need the network's consent.
- **Safe-use wording:** fit describes listener overlap, never a probability about a person, and nothing infers politics, health, or eligibility ([kit safe use][kit-safe]).
- **Public demo:** no accounts, so the session limits, the Qloo cap, and the Anthropic spend limit bound what visitors can spend.
- **Trademarks:** the sample network uses public show names, with a notice that Crossfeed isn't affiliated with The Ringer.

[cf-secrets]: https://developers.cloudflare.com/workers/configuration/secrets/
[kit-safe]: https://github.com/qloo/qloo-hackathon-kit/blob/0db91b8d9c5aae2160d53596e57ea6c9da251cde/docs/SAFE_USE.md

## Deployment and configuration

Changes to the [`apps/`](/apps/) scaffold:

- **Dependencies:** `agents` (pinned, since it ships minor releases every few days), `@anthropic-ai/sdk`, `react`, `react-dom`, and `@vitejs/plugin-react`; for tests, `vitest`, `@cloudflare/vitest-plugin`, `msw`, and `@msw/cloudflare`.
- **`wrangler.jsonc`:** add `"compatibility_flags": ["nodejs_compat"]`, which the Agents SDK requires. Add Durable Object bindings for `CrossfeedAgent` and `QlooGateway`, a migration with `"new_sqlite_classes": ["CrossfeedAgent", "QlooGateway"]`, and a daily cron under `triggers.crons` ([configuration][cf-config], [cron triggers][cf-cron]). Rename the Worker from `apps` to `crossfeed`, and move `compatibility_date` forward. The gateway's limits are `vars`: `QLOO_DAILY_CALL_CAP` (1000), `QLOO_TIMEOUT_MS` (20000), `QLOO_RETRY_DELAYS_MS` (`1000,3000`, one delay per retry), and `QLOO_MIN_INTERVAL_MS` (400, the pacing). `GUEST_PITCHES` (`off`) ships the guest pitch flow dark: only `on` serves `/inbox`, links it, and allows the inbox actions.
- **`vite.config.ts`:** add the `agents/vite` and React plugins.
- **Plan:** upgrade the Cloudflare account to Workers Paid before the first deploy that runs a full launch.
- **Deploy:** `bun run deploy` from `apps/` builds and runs `wrangler deploy` to the `qloo` Cloudflare account, serving on <https://crossfeed.m1kuorg.workers.dev> unless a custom domain is added. The [apps README](/apps/README.md) is the how-to.

[cf-cron]: https://developers.cloudflare.com/workers/configuration/cron-triggers/

## Observability

- One structured log line per Qloo call with the endpoint, status, latency, retries, and cache hit (`"event":"qloo_call"`), and one per model call with the run, turn, stop reason, input and output tokens, cache reads and writes, and latency (`"event":"model_call"`), in Workers Logs.
- One summary line per run (`"event":"run_summary"`): turns, Qloo calls, cache hits, wall time, and outcome (completed, paused on a question, stopped at a limit, or failed). It's written when the run ends; a run paused on a question writes it with outcome `paused`.

## Testing

Per the [PRD](PRD.md#testing-decisions), tests drive the public interface with Qloo and Anthropic replaced at the network boundary:

- **Seam:** `QLOO_BASE_URL` and `ANTHROPIC_BASE_URL` are configuration, and the Anthropic SDK takes a `baseURL`. Tests point both at fake hosts served by an in-process fake that serves synthetic Qloo responses, replays scripted model turns, and records every request.
- **Runner:** Vitest with Cloudflare's Workers integration, `@cloudflare/vitest-plugin` (the renamed `@cloudflare/vitest-pool-workers`). The Worker and its Durable Objects run in the same isolate as the tests ([test APIs][cf-test-apis]).
- **How the fake is reached:** settled on 2026-10-17. The fake runs inside the Workers runtime as [`@msw/cloudflare`][cf-msw] handlers, Cloudflare's documented way to mock outbound requests with the plugin. It patches `fetch` in the tests' isolate, so it sees every call the gateway makes, and each test file gets its own fake and request log. A request no handler serves fails the test. Two alternatives lost: a Node HTTP server started in Vitest's `globalSetup` and passed by port, whose one shared memory would need every request keyed to a test, though a Qloo request carries no session or test ID; and an auxiliary Worker, which must be prebuilt JavaScript and can't share the tests' fixtures. The Anthropic SDK captures `fetch` when its client is built, so build it with `fetch: (...args) => fetch(...args)` to let the patched `fetch` reach it. [`apps/README.md`](/apps/README.md#test) says how to use the harness.
- **Through the interface:** tests connect to the agent as the UI does, call its actions, and assert on synced state and HTTP responses.
- **Live check:** each feature is done only after it runs on the deployed Worker against the real Qloo API, checked by hand.

[cf-test-apis]: https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/
[cf-msw]: https://developers.cloudflare.com/workers/testing/vitest-integration/mock-outbound-requests/

## Demo data

- **Sample network:** The Ringer, from public show names. On 2026-10-17, `/search` resolved 16 of 19 Ringer shows, against 11 of 15 for Exactly Right and 8 of 16 for Pushkin. Of The Ringer's 19, The Zach Lowe Show and The Press Box missed, and Binge Mode was ambiguous with a "Binge Mode: Marvel" feed. The misses and the ambiguous match demonstrate the mapping and disambiguation questions.
- **Sample inputs:** [`apps/src/sample-network.json`](/apps/src/sample-network.json) holds the 19 shows with downloads per episode, status, and a one-line description paraphrased from each show's public description, plus a $20 CPM and the sample launch. These are ours, chosen at build time, flagged `sample` in the file, labelled as arbitrary sample figures the visitor can edit, and not The Ringer's.
- **Choosing the launch:** on 2026-10-17, [`scripts/choose-demo-launch.ts`](/scripts/choose-demo-launch.ts) ran each of the 16 resolved shows as a leave-one-out launch against the other 15, plus three-comp film, music, and football launches against all 16, and compared Qloo fit with three samples of a topic-only Haiku ranking made from show names and descriptions. Its output stays out of the repo. Across launches, shows that climbed three or more places shared mostly host and style tags with the launch, such as Insightful and Conversational, and topical tags were rare. The three-comp launches gave no move into the top five: the film comps (Blank Check, Filmspotting, and You Must Remember This) and the music comps moved no show three places, because their fit order nearly matched topic order.
- **Sample launch:** The Watch, a released show, ranked against the other 15 resolved roster shows. When the launch is a roster show, the fit ranking and topic baseline leave it out of its own candidates. The Ryen Russillo Podcast moves most among the finalists, up six places from topic rank 11 to fit rank 5, but shares only host and style tags with The Watch. The demo leads with The Bill Simmons Podcast, up five or six places from topic rank 9 or 10 to fit rank 4, because its shared tags explain the move: Pop Culture, plus Conversational and Insightful. Meanwhile the topic ranking's two music shows, Every Single Album and 60 Songs That Explain the '90s, fall from topic ranks 3 to 7 to fit ranks 14 and 13. Below the finalists, The Ringer NFL Show climbs five to seven places, to fit rank 7. A second run with three fresh topic samples gave the same ranks within one place.
- **Sample show for pitches:** The Big Picture, with three past guests from its public episode feed: Paul Thomas Anderson for One Battle After Another (episode of 2025-09-26), Rian Johnson for Wake Up Dead Man: A Knives Out Mystery (2025-12-16), and Josh Safdie for Marty Supreme (2025-12-24). All three films resolve. They're too recent to score as candidates, but they still work as anchors: each book, TV, and podcast result's explainability lists all four anchors, while film results list only the show and Wake Up Dead Man.
- **Sample inbox:** [`apps/src/sample-inbox.json`](/apps/src/sample-inbox.json), flagged `sample`, holds the show, its past guests, and 40 synthetic pitches from fictional publicists at `example.com` addresses: 15 books, 11 films, 6 TV shows, 4 podcasts, and 4 from fictional people with no public work. Five pitches word a fitting work as off-topic, such as The Rehearsal pitched as aviation safety and Stanley Tucci's Taste pitched as home cooking. Each pitch's `expected` field records the guest, work, type, and year as an answer key for extraction, not an input to it. Most works came out before May 2025 so that they score; 10 of the 36 miss in search or go unscored, to show those paths.
- **Checking the inbox:** on 2026-10-17, [`scripts/check-sample-inbox.ts`](/scripts/check-sample-inbox.ts) searched each work by type with `take=5`, searched again without `types` on a miss, and ran the rankings below. Its output stays out of the repo. A first pass on an earlier draft of the inbox, with more recent works, is included where noted.
  - **Search types:** the type's own `types` value resolved all 11 films, all 6 TV shows, 3 of 4 podcasts, and 11 of 15 books, and a search without `types` never found a missed work under another type. Frankenstein came third and Digger second, after older same-name films, and in the first pass Task (2025) came fourth after Taskmaster. Qloo's names can drop a subtitle (Wake Up Dead Man), add a series suffix to a book (Onyx Storm (The Empyrean, #3)), or end in "Podcast" (Scriptnotes Podcast). New Heights isn't in Qloo as a podcast.
  - **Recent books:** all 5 books published September to November 2026 missed, 3 in the inbox and 2 in the first pass. Of 4 from 2025, Katabasis and Future Boy missed, Atmosphere resolved but went unscored, and Onyx Storm scored. Of 11 from before 2025, two 2023 nonfiction books missed: Every Man for Himself and God Against All, and Oscar Wars.
  - **Across categories:** 11 books ranked against the podcast alone returned 200, with scores and explainability for 10, from 0.491 for Onyx Storm to 0.780 for Cinema Speculation, and Taste tied for second. With the show and the past guests' works as anchors, one call per type scored 10 of 11 books, 8 of 11 films (0.820 to 0.859), 5 of 6 TV shows (0.865 to 0.911, with The Rehearsal second), and all 3 podcasts. No result fell outside its candidate list.
  - **Unscored candidates:** the left-out works were Atmosphere, Hamnet, The Bride!, Digger, and Pluribus. Of everything tried, only Frankenstein scored among works released since May 2025. In the first pass, 10 of 11 films from mid-2025 to 2026 were left out; the same 11 with no signal came back with null affinity for 9, so they're in the catalog without a score. The other two, Digger and The Social Reckoning, have no popularity in search. A control of 12 well-known films scored the 8 released before May 2025 and left out Weapons, One Battle After Another, Marty Supreme, and Hamnet.

## Open technical questions

- Whether a roster with misses mapped to comps ranks sensibly next to resolved shows.

## See also

- [PRD](PRD.md), [PRODUCT.md](PRODUCT.md), and [IDEA.md](IDEA.md)
- [Brief](BRIEF.md#api-essentials) for the Qloo API, and [context](CONTEXT.md#agent-design-practices) for agent practices
- [Cloudflare Agents SDK](https://github.com/cloudflare/agents)

[cf-config]: https://github.com/cloudflare/agents/blob/main/docs/agents/configuration.md
