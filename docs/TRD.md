# TRD

How Crossfeed is built: its architecture, its Qloo calls, the agent, storage, limits, deployment, and tests. The [PRD](PRD.md) says what ships and why, and [PRODUCT.md](PRODUCT.md#terminology) defines the terms used here. Facts marked _(unconfirmed default)_ follow the recommended answers to the unanswered 2026-10-17 grilling round; those marked _(verify)_ were not checked against a primary source or a live call.

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

_(unconfirmed default)_

- **Cloudflare Workers** is already scaffolded in [`apps/`](/apps/) with Hono and Vite. Time spent waiting on `fetch()` doesn't count toward CPU time, and HTTP-triggered Workers have no hard duration limit, which suits slow Qloo calls ([Workers limits][cf-limits]).
- **The Cloudflare Agents SDK** (`agents` 0.28.1) is the agent framework the rules ask for ([BRIEF](BRIEF.md#challenge)). Its `Agent` class runs on a Durable Object and gives per-session state synced to clients, embedded SQLite, WebSockets, and schedules ([Agents API][cf-agent]).
- **Claude through the official Anthropic SDK** (`@anthropic-ai/sdk`, which supports Cloudflare Workers). We use the base `Agent` class, not `AIChatAgent`, because `AIChatAgent` runs on the Vercel AI SDK, and the official SDK exposes the Claude features below (effort, server-side fallbacks, strict tools) directly.
- **Direct REST to Qloo**, not the hackathon kit's `qloo mcp` harness, which can't run serverless ([CONTEXT](CONTEXT.md#hackathon-kit)).
- **The Workers Paid plan is required.** Free allows 50 subrequests and 10 ms of CPU per invocation; a cold guest run needs about 50 Qloo calls plus model calls. Paid allows 10,000 subrequests and 30 s of CPU by default, for $5 a month ([Workers limits][cf-limits]).

[cf-limits]: https://developers.cloudflare.com/workers/platform/limits/
[cf-agent]: https://developers.cloudflare.com/agents/runtime/agents-api/

### Components

- **Worker:** a Hono app that serves the server-rendered shell, routes `/agents/*` to agents through `hono-agents`' `agentsMiddleware` ([routing][cf-routing]), serves CSV export, and runs the cron health check.
- **`CrossfeedAgent`:** one instance per visitor session, named by a random session ID kept in a cookie. It owns the Claude loop, the session's roster, launches, runs, insertion orders, pitches, replies, and evidence log.
- **`QlooGateway`:** one global instance, the only code that calls Qloo. Session agents reach it over Durable Object RPC. It owns the key, the request shape, retries, the concurrency limit, the response cache, the daily caps, and evidence records.
- **UI:** a server-rendered Hono JSX shell with a React client island that connects through `useAgent` from `agents/react`, the Agents SDK's documented client path.

[cf-routing]: https://developers.cloudflare.com/agents/runtime/communication/routing/

## Qloo integration

Base URL `https://hackathon.api.qloo.com`, header `X-Api-Key`. The calls below were checked live on 2026-10-17 unless marked _(verify)_; every call returned 200 in 1 to 4 seconds at a concurrency of 3.

### Calls

- **Resolve a show:** `GET /search?query=<name>&types=urn:entity:podcast&take=3`.
- **Resolve a work:** the same, with `types` set to `urn:entity:book`, `urn:entity:movie`, `urn:entity:tv_show`, or `urn:entity:podcast` _(verify for book, movie, and tv_show)_.
- **Rank a closed list:** `POST /v2/insights` with `filter.type=urn:entity:podcast`, `signal.interests.entities=<anchor IDs>`, `filter.results.entities=<candidate IDs>`, `feature.explainability=true`, and `take=50`. With comps, all of them go in as one comma-separated signal.
- **Rank pitched works:** the same, once per work type, with `filter.type` set to that type and the show plus past guests' works as anchors _(verify: no cross-category closed-list call has run)_.
- **Demographics:** `POST /v2/insights` with `filter.type=urn:demographics` and `signal.interests.entities=<launch or comp IDs, and finalist IDs>`. It returns one entry per entity.
- **Shared tags:** `GET /v2/analysis/compare?a.signal.interests.entities=<launch or comps>&b.signal.interests.entities=<finalist>&take=50` _(verify: several comps on side `a`)_.
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
- **Timeout and retries:** a 20-second timeout per call. Retry 429, 502, 503, 504, and timeouts at most twice, after about 1 and 3 seconds with jitter. A 400 is never retried; Qloo's message goes back to the caller.
- **Concurrency:** at most 3 Qloo calls in flight across all sessions. The idea's bets report that about 5 concurrent calls trip the rate limit ([IDEA](IDEA.md#bets-to-test)) _(verify)_, and Workers allow six connections per invocation waiting on headers.
- **Unscored signal:** a ranking whose affinities are all null means the anchors didn't resolve, so the gateway returns an error, not a result ([BRIEF](BRIEF.md#gotchas-beyond-the-developer-guide)).
- **Silently ignored parameters:** a ranking that returns an entity outside the candidate list, or no explainability when it was requested, is an error.
- **Size:** at most 50 candidates per ranking, since `take` maxes out at 50 and scores from separate calls aren't comparable.
- **Evidence:** every call, cached or not, appends a record to the calling session's evidence log.

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

- **Model:** `claude-opus-5-5`, streamed through `client.beta.messages.stream`.
- **Thinking:** adaptive, which is always on for this model.
- **Effort:** `output_config.effort` set explicitly to `medium`, this model's default.
- **Refusals:** `fallbacks: "default"` with beta `server-side-fallback-2026-07-01`. Check `stop_reason` before reading content.
- **Tools:** `strict: true` and `additionalProperties: false` on every tool, and `tool_choice` `auto`, because this model rejects forced tool choice.
- **Parallel calls:** execute every `tool_use` block in a turn concurrently, and return all results in one user message. A failed tool returns `is_error: true` with a message that says what to do next.
- **History is append-only.** Never edit or delete earlier turns; a resumed run appends the human's answer as a tool result. This model ties thinking blocks to an unedited history.
- **Prompt caching:** a frozen system prompt and a fixed, sorted tool list sit before a `cache_control` breakpoint; session data goes after it.
- **Later, if time allows:** streaming the model's own progress notes with `thinking.display: "updates"`, an effort sweep on the demo scenarios, and checking cache reads.

### Tools

Each tool returns names alongside IDs, and errors the model can act on ([Writing effective tools for agents][anthropic-tools]):

- **`resolve_entities(names, type)`:** each name comes back resolved, ambiguous with up to three candidates, or missed.
- **`rank_candidates(anchor_ids, candidate_ids, type)`:** ranks, bands, raw affinities, comp shares, and the evidence ID.
- **`check_demographics(anchor_ids, candidate_ids)`:** age-band and gender deltas and mismatch flags per candidate.
- **`shared_tags(anchor_ids, candidate_ids)`:** the top non-generic shared tags per candidate, from parallel compare calls.
- **`ask_human(question, options)`:** pauses the run until the human answers in the UI.
- **`draft_insertion_order(lines)`:** takes finalists, slot counts, and angles, computes slot values in code, rejects a draft over the slot budget, and stores the rest as a draft for the UI.
- **`rank_pitches(show_id, past_guest_work_ids, pitch_ids)`:** groups pitched works by type and returns one ranked list per type.
- **`draft_replies(replies)`:** stores a draft reply per pitch with its verdict.

[anthropic-tools]: https://www.anthropic.com/engineering/writing-tools-for-agents

### Questions and approvals

- **Questions:** when the model calls `ask_human`, the agent stores the open question in its state and ends the loop. The UI renders the question card; the human's answer becomes that call's tool result, and the loop resumes. The system prompt requires a question for every ambiguous match, every miss, comps for an unreleased launch, the slot budget, and exclusions.
- **Approvals:** approving or editing an insertion order and approving, editing, or discarding a reply are client actions handled in code, and no tool can perform them. Export refuses any insertion order that isn't approved.
- Runs are short and the human gates sit between turns, so the agent's own SQLite state is enough; the Agents SDK's Workflow approval pattern isn't needed ([human in the loop][cf-hitl]).

[cf-hitl]: https://github.com/cloudflare/agents/blob/main/docs/agents/human-in-the-loop.md

### Other model calls

Single calls with structured outputs (`output_config.format`), on the same model at `low` effort, so all calls share one cache namespace:

- **Topic baseline:** ranks the roster by topic from show names and the network's own one-line descriptions. It gets no Qloo data, because it is the without-Qloo counterfactual.
- **Pitch extraction:** turns each pitch email into a guest name, a work title, a work type, and whether there is a public work. The guest name stays in the session's storage and is never passed to a Qloo tool.

### Agent limits

- At most 12 model turns and 60 Qloo calls per run. Past either limit, the run stops and says what is missing.
- At most 10 runs per session per day.

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
- **Actions:** `@callable` methods on the agent: `importRoster`, `updateShow`, `setCpm`, `startLaunch`, `answer`, `editInsertionOrder`, `approveInsertionOrder`, `loadInbox`, `startPitches` (with the show and its past guests' works), `editReply`, `approveReply`, `discardReply`, and `getEvidence`. `@callable` needs the `agents/vite` plugin ([configuration][cf-config]).
- **HTTP:** `GET /` serves the shell, and `GET /api/insertion-orders/:id.csv` exports an approved order, returning 409 for a draft.

## Caching, caps, and replay

- **Cache:** Qloo responses are cached privately with no expiry, which the hackathon allows ([BRIEF](BRIEF.md#implications-for-our-entry)). The sample network, its launch, and the sample inbox are warmed before submission.
- **Caps:** a daily cap on Qloo calls (`QLOO_DAILY_CALL_CAP`, default 1,000, counted in UTC days), plus the per-run and per-session limits under [Agent limits](#agent-limits). The default is a guess, because the Qloo quota is unknown ([CONTEXT](CONTEXT.md#unverified)). Model spend is bounded by a spend limit on the Anthropic account _(verify the Console setting)_, not by code.
- **Replay:** the sample launch's completed run is stored server-side. When a cap is hit or Qloo keeps failing, sample runs replay from storage with a visible "replayed" label, and runs on visitors' own data stop with a clear message.
- **Health check:** a daily cron makes the health-check call and one cached sample ranking and logs a failure loudly.

## Security, privacy, and safe use

- **Secrets:** `QLOO_API_KEY` and `ANTHROPIC_API_KEY` are set with `wrangler secret put`, and locally in `.dev.vars`, which [`apps/.gitignore`](/apps/.gitignore) already ignores ([secrets][cf-secrets]). Keys are never logged or sent to the client.
- **Qloo data:** never committed, exported, or sent to the browser beyond what the UI shows. Evidence shows parameters, names, tags, and scores, not raw response bodies. Test fixtures are synthetic.
- **No personal data to Qloo:** gateway calls take entity IDs, show names, and work titles, never pitch text. Tests check every recorded Qloo request against the sample inbox's guest names and email addresses.
- **Pitch text goes to Anthropic** for extraction and drafting. The sample inbox is synthetic; real use would need the network's consent.
- **Safe-use wording:** fit describes listener overlap, never a probability about a person, and nothing infers politics, health, or eligibility ([kit safe use][kit-safe]).
- **Public demo:** no accounts, so the session limits, the Qloo cap, and the Anthropic spend limit bound what visitors can spend.
- **Trademarks:** the sample network uses public show names, with a notice that Crossfeed isn't affiliated with The Ringer _(unconfirmed default)_.

[cf-secrets]: https://developers.cloudflare.com/workers/configuration/secrets/
[kit-safe]: https://github.com/qloo/qloo-hackathon-kit/blob/0db91b8d9c5aae2160d53596e57ea6c9da251cde/docs/SAFE_USE.md

## Deployment and configuration

Changes to the [`apps/`](/apps/) scaffold:

- **Dependencies:** `agents`, `hono-agents`, `@anthropic-ai/sdk`, `react`, `react-dom`, and `@vitejs/plugin-react`.
- **`wrangler.jsonc`:** add `"compatibility_flags": ["nodejs_compat"]`, which the Agents SDK requires. Add Durable Object bindings for `CrossfeedAgent` and `QlooGateway`, a migration with `"new_sqlite_classes": ["CrossfeedAgent", "QlooGateway"]`, and a daily cron under `triggers.crons` ([configuration][cf-config], [cron triggers][cf-cron]). Rename the Worker from `apps` to `crossfeed`, and move `compatibility_date` forward.
- **`vite.config.ts`:** add the `agents/vite` and React plugins.
- **Plan:** upgrade the Cloudflare account to Workers Paid before the first deploy that runs a full launch.
- **Deploy:** `bun run deploy` from `apps/` builds and runs `wrangler deploy`, serving on the `workers.dev` URL unless a custom domain is added.

[cf-cron]: https://developers.cloudflare.com/workers/configuration/cron-triggers/

## Observability

- One structured log line per Qloo call with the endpoint, status, latency, retries, and cache hit, and one per model call with tokens and cache reads, in Workers Logs.
- One summary line per run: turns, Qloo calls, cache hits, wall time, and outcome (completed, paused on a question, stopped at a limit, or failed).

## Testing

Per the [PRD](PRD.md#testing-decisions), tests drive the public interface with Qloo and Anthropic replaced at the network boundary:

- **Seam:** `QLOO_BASE_URL` and `ANTHROPIC_BASE_URL` are configuration, and the Anthropic SDK takes a `baseURL`. Tests point both at an in-process fake HTTP server that serves synthetic Qloo responses, replays scripted model turns, and records every request.
- **Runner:** Vitest with Cloudflare's Workers pool (`@cloudflare/vitest-pool-workers`), which runs Durable Objects locally _(verify: how the pool reaches a fake server outside the Workers runtime)_.
- **Through the interface:** tests connect to the agent as the UI does, call its actions, and assert on synced state and HTTP responses.
- **Live check:** each feature is done only after it runs on the deployed Worker against the real Qloo API, checked by hand.

## Demo data

- **Sample network:** The Ringer, from public show names. On 2026-10-17, `/search` resolved 16 of 19 Ringer shows, against 11 of 15 for Exactly Right and 8 of 16 for Pushkin. Of The Ringer's 19, The Zach Lowe Show and The Press Box missed, and Binge Mode was ambiguous with a "Binge Mode: Marvel" feed. The misses and the ambiguous match demonstrate the mapping and disambiguation questions.
- **Sample inputs:** downloads per episode, CPM, and one-line show descriptions are ours, chosen at build time, labelled as arbitrary sample figures the visitor can edit, and not The Ringer's.
- **Choosing the launch:** before 2026-10-20, a private script runs every roster show as a leave-one-out launch, plus three-comp launches such as Blank Check, Filmspotting, and You Must Remember This, against the topic baseline. It picks the launch with the clearest topic move that shared tags explain. Its output stays out of the repo. The Big Picture alone ranked two same-genre shows first, from 0.798 to 0.953 across 16 candidate shows; its three comps put the two music shows above Bill Simmons, from 0.731 to 0.874.
- **Sample show for pitches:** one roster show with the public works of three of its past guests, picked at build time from its public episode list.
- **Sample inbox:** about 40 synthetic pitches about real public works, from fictional publicists at `example.com` addresses, including a few with no public work, labelled as sample data _(unconfirmed default)_.

## Open technical questions

- Does a closed-list ranking work across categories, with a podcast anchor and book or film candidates? The guest flow depends on it.
- Which search `types` resolve guests' works reliably, and how often a recent book is missing.
- Whether a roster with misses mapped to comps ranks sensibly next to resolved shows.
- How the Workers Vitest pool reaches a fake server, or whether the fake should run as an auxiliary Worker.

## See also

- [PRD](PRD.md), [PRODUCT.md](PRODUCT.md), and [IDEA.md](IDEA.md)
- [Brief](BRIEF.md#api-essentials) for the Qloo API, and [context](CONTEXT.md#agent-design-practices) for agent practices
- [Cloudflare Agents SDK](https://github.com/cloudflare/agents)

[cf-config]: https://github.com/cloudflare/agents/blob/main/docs/agents/configuration.md
