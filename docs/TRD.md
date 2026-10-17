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
- **Rank pitched works:** the same, once per work type, with `filter.type` set to that type and the show plus past guests' works as anchors. Rankings across categories return scores and explainability, as for books ranked against a podcast ([demo data](#demo-data)). If Qloo scores none of a type's works against those anchors, that type is ranked again against only the past guests' works of the same type; with none of that type, it stays unranked with the reason. Each list records which path ran, the anchors it used, and both calls, and each call's evidence holds its anchors.
- **Demographics:** `POST /v2/insights` with `filter.type=urn:demographics` and `signal.interests.entities=<launch or comp IDs, and finalist IDs>`. It returns one entry per entity, by ID only, in no set order.
- **Shared tags:** `GET /v2/analysis/compare?a.signal.interests.entities=<launch or comps>&b.signal.interests.entities=<finalist>&take=50`, once per finalist. Several comps on side `a` go in as one comma-separated signal: on 2026-10-17, three shows on side `a` gave a shared set that was the union of each show's own shared tags, and side `a`'s own tags counted up to 3, so no per-comp call and merge is needed.
- **Find a comp for a roster show:** `GET /search?query=<what the programmer typed>&types=urn:entity:podcast&take=5`.
- **Health check:** `GET /search?query=The%20Rewatchables&types=urn:entity:podcast&take=1`.

POST bodies use flat dotted keys, such as `{"filter.type": "urn:entity:podcast", "take": 50}`; a nested body returns 400 ([BRIEF](BRIEF.md#live-api-checks)).

Not used: `/entities?external.spotify.ids=` is accepted but found no podcast by its Spotify show ID, and only 1 of 200 podcast search results carried a Spotify ID. iTunes IDs are stored on most podcasts but `external.itunes.ids` found none.

### Response fields used

- **Search:** each result's entity ID, name, and popularity, shown as candidates for ambiguous matches.
- **Ranking:** each result's `query.affinity` and its `query.explainability["signal.interests.entities"]`, a list of `{entity_id, score}` per anchor. The top-level `effect_on_top3_recs` through `effect_on_all_recs` summaries are logged but not shown. `query.measurements.audience_growth` was always 0 and is ignored.
- **Demographics:** `results.demographics[]`, one entry per entity, with `query.age` over the buckets `24_and_younger`, `25_to_29`, `30_to_34`, `35_to_44`, `45_to_54`, and `55_and_older`, and `query.gender.male` and `female`. Values are relative to average and ran from −0.95 to +0.95. In every entry seen, `female` was the negative of `male`, so `male` alone gives the gender skew.
- **Compare:** `results.tags[]`, each with `tag_id`, `name`, and `query.score`. Scores sat between 0.700 and 0.731, so tags are used as words, not ranked by score, and generic tags such as "Podcasts" are dropped through a stoplist. A name Qloo lists under two subtypes, such as Engaging as a host and a content tag, is kept once, and a finalist shows its first five remaining tags in Qloo's order. Host and style descriptors such as Insightful and Conversational stay: between podcasts they are most of the shared tags, and dropping them would leave some finalists with none.

### Gateway rules

- **Request shape:** GET for `/search` and compare, POST with flat keys for `/v2/insights`.
- **Timeout and retries:** a 20-second timeout per request. Retry 429, 502, 503, 504, and timeouts at most twice, after about 1 and 3 seconds with jitter. A 400 is never retried; Qloo's message goes back to the caller. A call that fails after retries says how many, such as "Qloo returned 429: Rate limit exceeded, after 2 retries". Its latency runs from its first request, so time spent queued behind other calls isn't blamed on Qloo.
- **Concurrency:** at most 3 Qloo calls in flight across all sessions. The idea's bets report that about 5 concurrent calls trip the rate limit ([IDEA](IDEA.md#bets-to-test)) _(verify)_, and Workers allow six connections per invocation waiting on headers.
- **Unscored signal:** a ranking whose affinities are all null means the anchors didn't resolve, or, for pitched works, that every candidate is too recent to score, so the gateway returns an error, not a result, marked unscored so a pitch ranking can try same-type anchors ([BRIEF](BRIEF.md#gotchas-beyond-the-developer-guide)). Live, Qloo answers it with 200 and no results.
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
- **Guest inbox of 40 pitches:** 40 searches when it loads, then a pitch run of up to 5 past guests' searches, at most 4 rankings (one per work type, or 8 if every type falls back to same-type anchors), and 5 compares, so about 52 calls and about 2.5 minutes cold. The sample inbox is served warm.

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
- **Closing message:** the system prompt caps the run's closing turn at three short sentences, under 60 words, on what the plan covers and what is missing, and forbids restating what the chart shows. On 2026-10-17, "one or two sentences" alone gave about 350 words with a heading per finalist, while the word cap gave 45 to 55 words in three live sample runs. The run keeps the closing text as `closing`, in synced state and its snapshot, and the Run module shows it as an agent line whose call numbers open their evidence. A refused, failed, or stopped run has none.
- **Later, if time allows:** an effort sweep on the demo scenarios, and checking cache reads.

### Tools

Each tool returns names alongside IDs, and errors the model can act on ([Writing effective tools for agents][anthropic-tools]):

- **`resolve_entities(names, type)`:** each name comes back resolved, ambiguous with up to three candidates, or missed.
- **`rank_candidates(anchor_ids, candidate_ids, type)`:** ranks, bands, raw affinities, comp shares, and the evidence ID. The run's first message lists every roster show: the scorable ones with their IDs, a mapped one with its comp's name, and the rest with the reason they can't be ranked, the same reason the chart's Not scored list gives. Listing only the scorable shows led Haiku 5.5 to call a missed show "not on the roster" in its closing message. The roster is the closed list, so the tool ranks every scorable show even when the model leaves one out, refuses an ID that isn't a roster show or an anchor the session never resolved, and leaves an anchor that is itself a roster show out of the candidates.
- **`check_demographics(anchor_ids, candidate_ids)`:** age-band and gender deltas and mismatch flags per finalist, from one demographics call covering the fit ranking's anchors and every finalist. Like the ranking, the lists are closed: it checks every finalist even when the model leaves one out, and refuses an ID that isn't one of the ranking's anchors or finalists. The chart gets each flag's reasons in words; the values stay in the call's evidence, where each entity's buckets are listed under `affinities` as `age.<bucket>` and `gender.<gender>` scores, because the evidence record has no demographics list.
- **`shared_tags(anchor_ids, candidate_ids)`:** the top non-generic shared tags per finalist, from parallel compare calls. The anchors must be the ranking's, and like the ranking it compares every finalist even when the model leaves one out, and refuses an ID that isn't a finalist. In a guest pitch run it compares each top pitch's work, the top band of each pitch list, with the show alone instead: the show's ID is the only anchor it accepts, the candidates are pitch IDs, because the run's messages never give the model a work's entity ID, and it compares every top pitch even when the model leaves one out. The tags go on the pitch's list row.
- **`ask_human(question, kind, options)`:** pauses the run until the human answers in the UI. `kind` is `choice` for a fork answered with one of `options` or free text, or `launch`, `comps`, `confirm_comps`, `budget`, or `exclusions`, whose answer forms code builds.
- **`draft_insertion_order(lines)`:** takes finalists, slot counts, and angles, computes slot values in code, rejects a draft over the slot budget, and stores the rest as a draft for the UI.
- **`rank_pitches(show_id, past_guest_work_ids, pitch_ids)`:** groups the inbox's pitched works by type and returns one ranked list per type, with each pitch's rank and band and the reason for each one not scored. The run's first message lists the show, the past guests' works that resolved, and the pitches that can be ranked, by ID, without guest names. Like `rank_candidates`, the inbox is the closed list: the tool ranks every pitch whose work matched even when the model leaves one out, refuses an ID the run doesn't list, and never sends a set-aside pitch. A type Qloo leaves unscored falls back to same-type anchors ([calls](#calls)).
- **`draft_replies(replies)`:** stores a draft reply per pitch with its verdict, book, decline, or later, and, for a top pitch, the episode angle with the compare it's built from. It refuses an angle for a pitch whose work `shared_tags` didn't compare. A call replaces the drafts for the pitches it names and keeps the rest, so 40 replies can go in calls of 20 that stay well inside one turn's output, and its result lists the pitches still without a reply. The pitch run's first message lists every pitch, the ones that can't be ranked with why, so every pitch gets a reply. The model never sees a guest's or sender's name, so drafts name only the work and the show, and the booker adds names when editing; this also keeps names out of `resolve_entities`, the one tool that sends free text to Qloo.

[anthropic-tools]: https://www.anthropic.com/engineering/writing-tools-for-agents

### Questions and approvals

- **Questions:** when the model calls `ask_human`, the agent stores the open question in its state and ends the loop. The UI renders the question card. When the human answers, the next user message holds that call's tool result, a neutral "asked the human" notice, followed by the answer as a separate text block, and the loop resumes. The answer never goes inside the tool result, because this model can treat user text there as untrusted and ignore it. The programmer answers one question at a time. When a turn asks more than one, the first is asked, and each other call gets a plain result, not an error, telling the model to ask it again after that answer; it shows no progress note until then. History stays append-only, at the cost of one more model turn per held question. The system prompt requires a question for every ambiguous match and every miss among the matches it makes during a run (the launch, its comps, and pitched works), comps for an unreleased launch, the slot budget, and exclusions.
- **Structured answers:** the launch, when its lookup came back ambiguous, is answered by picking one of its candidates, which code sets as the launch's match, citing the original search, or by giving the name Qloo lists it under, which renames the launch for the agent to look up. A launch whose lookup missed may be unreleased, so the agent asks for comps instead, and a name given in their place renames the launch the same way. Comps, up to three names from `startLaunch({ comps })` or that question, are stored on the launch; the run resolves them, then one `confirm_comps` question offers each comp's match, or an ambiguous comp's candidates, and "None of these". Only a comp the programmer confirmed joins `rank_candidates`' known anchors, so a ranking never anchors on an unconfirmed comp. The slot budget, a count of promo slots or a dollar amount, and the run's exclusions, chosen from the shows the run can score, are answered in forms code builds. Code stores them on the run, where the insertion order is checked against them; the model sees the answer but can't set either. A run's exclusions apply to that run only, apart from the roster's own excluded shows. A turn that asks waits in storage with its other tool results until the answer arrives, so the conversation never ends on an unanswered call, and a run waiting on a question survives a restart.
- **Past guests' works:** matched in code when a pitch run starts, like pitched works. One that doesn't resolve isn't an anchor; the inbox page shows it for the booker to correct before running again, and the agent doesn't ask about it.
- **Roster matches:** settled by the programmer in the roster view, not by the agent's questions. Through `updateShow`, they pick an ambiguous show's candidate, map a missed show to a comp found with `searchComps`, or leave the show out, which marks it excluded. A show still ambiguous, missed, or failed when a launch runs is never scored, and the ranking lists it as not scored, with the reason. Two shows can be mapped to the same comp, so a ranking sends each entity ID once.
- **Approvals:** approving or editing an insertion order and approving, editing, or discarding a reply are client actions handled in code, and no tool can perform them. Export refuses any insertion order that isn't approved.
  - An order can be edited or approved only once its run has ended, since until then the agent can redraft it. An edit, or a change to the downloads or CPM that changes a price, returns an approved order to draft, so nothing approved changes under the programmer.
  - Each run has its own order, kept with what the run ended with as the programmer leaves it, so an earlier run's approved order still exports after a re-run.
  - A reply can be approved, edited, or discarded only once its run has ended, since the agent can redraft it until then. Editing an approved reply returns it to draft, editing a discarded one restores it, and only an approved reply can be copied.
- Runs are short and the human gates sit between turns, so the agent's own SQLite state is enough; the Agents SDK's Workflow approval pattern isn't needed ([human in the loop][cf-hitl]).

[cf-hitl]: https://github.com/cloudflare/agents/blob/main/docs/agents/human-in-the-loop.md

### Other model calls

Single calls with structured outputs (`output_config.format`), on the same model at `low` effort:

- **Topic baseline:** ranks the roster by topic from show names and the network's own one-line descriptions. It gets no Qloo data, because it is the without-Qloo counterfactual. If it's refused, the fit ranking shows without the topic column.
  - It runs once per run, started beside the agent loop, and ranks every roster show but the launch, settled or not, so settling or excluding a show doesn't change its request. The prompt states the count ("Rank all N roster shows"), and code checks for a full permutation, because at `low` effort Haiku 5.5 sometimes returned only its top three. A partial list fails the baseline like a refusal does.
  - The agent caches each full ranking by a SHA-256 hash of its request, so the same launch and roster always rank the same way within a session. The cache is per session, not shared through the gateway, which only serves Qloo.
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
- **Slot allocation:** the model proposes slot counts for the finalists. Code rejects a draft whose slots exceed a count budget or whose total exceeds a dollar budget, and a line for a show that isn't a finalist. The budget bounds the agent's draft, not the programmer's edits: an edited order may go over it, and the insertion order shows by how much.
- **Launch profile:** the launch's demographics, or with comps, the mean of the comps' values per age bucket and gender, over the comps Qloo returned demographics for. With comps, a bucket or a skew counts only when more than half the comps share it: a bucket must be above 0 for most comps as well as on average, and a skew must reach 0.2 for most comps as well as on average. So one comp whose listeners differ can't set the profile alone. The Demographics line says where the comps disagree, in words about their listeners: a band the mean alone would have checked, or comps that skew opposite ways by 0.2 or more. A bucket most comps over-index on whose mean is still 0 or below isn't checked, as without comps. Checked on 2026-10-17 against the sample launch, The Watch, which over-indexes only at 35 to 44 (+0.21) and skews male (+0.81), and whose finalists' only flag is The Bill Simmons Podcast, at 35 to 44:
  - **Comps that share an audience:** the film comps Blank Check, Filmspotting, and You Must Remember This average +0.30 at 35 to 44, their only over-indexed bucket on average, where two of the three over-index, and +0.39 male, with two of the three at 0.2 or more. Their profile flags exactly what The Watch's own profile flags, and the line notes no disagreement.
  - **Comps that don't:** Pop Culture Happy Hour, Still Watching, and Culture Gabfest are topical comps for The Watch, but their audiences disagree. Pop Culture Happy Hour skews female (−0.38) and Still Watching male (+0.37), and Still Watching alone over-indexes at 35 to 44 (+0.60). Pop Culture Happy Hour (+0.63) and Culture Gabfest (+0.27) both over-index at 55 and older. The plain mean skews male by only 0.03, and its top buckets are 55 and older (+0.21) and 35 to 44 (+0.09). With the majority rule (#89), only 55 and older counts, and the line says the comps disagree on 35 to 44 and on gender. A comps run on the sample network still flags 3 of its 5 finalists at 55 and older, where two of the three comps' listeners do over-index.
  - So the mean reads sensibly when comps share an audience. When they don't, only what most of them share is checked, and the line says what they disagree on. The evidence shows each comp's own values.
- **Demographic mismatch:** take the launch profile's two most over-indexed age buckets. Flag a candidate that under-indexes, with a value below 0, on either of them, or whose gender skew has the opposite sign to the launch profile's, when both magnitudes are 0.2 or more. Only a bucket above 0 is over-indexed, so a launch like The Watch has one, and no finalist is flagged for being below average where the launch is too. Values are compared at Qloo's three decimal places, past float noise such as 0.20600000000000004. The thresholds, the comps' majority included, are starting values to tune on the demo network, set in one place in [`apps/src/demographics.ts`](/apps/src/demographics.ts).
- **Slot value:** downloads per episode × CPM ÷ 1,000, rounded to whole dollars. The insertion order total is the sum of slot count × slot value. A show without downloads, or a network without a CPM, leaves its lines without a value and the total marked incomplete, never filled with a guess.
- **Topic move:** a show's topic-baseline rank minus its fit rank. A move of three or more places is highlighted. The topic rank counts only the shows on the fit chart, so shows that weren't scored can't inflate a move.

## Storage

All storage is Durable Object SQLite: strongly consistent, private to each instance, and up to 10 GB per object ([Durable Object limits][cf-do-limits]).

- **`CrossfeedAgent`:** tables for networks, shows (name, Qloo ID, resolution state, downloads, status, description), launches and comps, runs, ranked results, insertion orders and their lines, pitches, replies, the evidence log, and the conversation's messages.
- **`QlooGateway`:** the response cache, keyed by a hash of the method, path, and sorted parameters, the daily Qloo call counter, the latest failure after retries, and the stored sample run.

KV is a poor fit because writes take 60 seconds or more to propagate, and the Cache API doesn't replicate beyond its data center ([KV][cf-kv], [Cache API][cf-cache]).

[cf-do-limits]: https://developers.cloudflare.com/durable-objects/platform/limits/
[cf-kv]: https://developers.cloudflare.com/kv/concepts/how-kv-works/
[cf-cache]: https://developers.cloudflare.com/workers/runtime-apis/cache/

## Client protocol

- **State:** the agent's synced state carries what the UI renders: the roster with resolution states, the current run's status and the progress notes code writes for each tool call, such as "Scoring 16 shows against The Big Picture", the session's Qloo calls still waiting past `QLOO_SLOW_MS`, the open question, rankings with the topic baseline, the insertion order draft, the inbox, draft replies, and the guide's progress. The evidence log is fetched on demand, not synced.
- **Actions:** `@callable` methods on the agent: `importRoster` (pasted names, or a CSV with `name` and optional `downloads`, `status`, and `description` columns), `clearSample`, `updateShow`, `searchComps`, `setCpm`, `startLaunch`, `answer`, `editInsertionOrder`, `approveInsertionOrder`, `loadInbox` (the sample inbox, or pasted pitches separated by lines of `---`, up to 50), `confirmWork` (one of an ambiguous work's candidates), `startPitches` (a roster show matched in Qloo and up to five past guests, each with a public work), `editReply`, `approveReply`, `discardReply`, `getEvidence`, `getRun` (what an earlier run ended with), `markGuide`, and `dismissGuide`. `@callable` needs the `agents/vite` plugin ([configuration][cf-config]).
- **Call timeout:** `useAgent` rejects a call after 30 seconds, but one Qloo call can take about 64 seconds when Qloo hangs (three 20-second attempts plus backoff). An action that waits on Qloo returns early and reports progress in synced state instead. `importRoster` sets every show to `pending`, citing the call it waits on, and returns; each show fills in as its search settles. A second import is refused until the first has settled, and a show still pending when the agent restarts is marked failed as interrupted. `loadInbox` works the same way: each pitch fills in as Claude reads it and its work's search settles. `startPitches` starts a run and returns at once; the run looks up the past guests' works before its first model turn. `searchComps` sets the show's comp search to `pending` the same way, then fills in its results, or its failure with the reason; only the show's latest comp search lands.
- **Guide:** the guide through the sample launch shows while the session is on the sample network. Its steps follow the run in synced state, except the two that happen only in the page, opening a climber's "why it moved" line and a call it cites, which the page marks with `markGuide`. `dismissGuide` hides it for the session, which is the cookie's agent, so a reload or a second tab keeps it hidden. It stays out of run snapshots, so viewing or replaying a run never changes it.
- **HTTP:** `GET /` serves the shell, and `GET /api/insertion-orders/:id.csv` exports an approved order, returning 409 for a draft.

## Caching, caps, and replay

- **Cache:** Qloo responses are cached privately with no expiry, which the hackathon allows ([BRIEF](BRIEF.md#implications-for-our-entry)). The sample network, its launch, and the sample inbox are warmed before submission.
- **Caps:** a daily cap on Qloo calls (`QLOO_DAILY_CALL_CAP`, default 1,000, counted in UTC days, retries included and cache hits not), plus the per-run and per-session limits under [Agent limits](#agent-limits). The default is a guess, because the Qloo quota is unknown ([CONTEXT](CONTEXT.md#unverified)). Model spend is bounded by a spend limit on the Anthropic account _(verify the Console setting)_, not by code.
- **Replay:** the sample launch's completed run is stored server-side. When a cap is hit or Qloo keeps failing, sample runs replay from storage with a visible "replayed" label, and runs on visitors' own data stop with a clear message.
  - **What's stored:** the latest completed run of the sample launch on the unchanged sample network, answered with the sample answers, whose every cited Qloo call was answered: its synced state, less the visitor's inbox, and the evidence records it cites. The latest replaces the last, so the stored run keeps up with what later code adds to a run.
  - **When it replays:** decided when the run starts, so a replay makes no Qloo or model call. Qloo can't be called once the day's cap is reached, or for five minutes after a request fails after its retries (any failure but a 400), unless a request succeeds since. Cache hits don't count either way.
  - **How:** the stored evidence is copied into the session's log under new call numbers, labelled replayed, and the stored state, renumbered to match, replaces the session's, roster included. A run that starts while Qloo can't be called, on anything but the unchanged sample launch, ends at once: stopped at the cap, or failed while Qloo fails.
- **Health check:** a daily cron at 12:00 UTC makes the health-check call past the cache, then checks from the cache alone, without calling Qloo, that the sample launch's ranking is cached: The Watch against the other 15 resolved shows with nothing settled, as a new session ranks it from the sample network's cached searches. Each check logs one `health_check` line, at error level naming the check when it fails. A session that settles Binge Mode or maps a miss before starting sends a different ranking, so the warm-up starts the sample launch before settling anything.

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
- **`wrangler.jsonc`:** add `"compatibility_flags": ["nodejs_compat"]`, which the Agents SDK requires. Add Durable Object bindings for `CrossfeedAgent` and `QlooGateway`, a migration with `"new_sqlite_classes": ["CrossfeedAgent", "QlooGateway"]`, and a daily cron under `triggers.crons` ([configuration][cf-config], [cron triggers][cf-cron]). Rename the Worker from `apps` to `crossfeed`, and move `compatibility_date` forward. The gateway's limits are `vars`: `QLOO_DAILY_CALL_CAP` (1000), `QLOO_TIMEOUT_MS` (20000), `QLOO_RETRY_DELAYS_MS` (`1000,3000`, one delay per retry), and `QLOO_MIN_INTERVAL_MS` (400, the pacing). `QLOO_SLOW_MS` (8000, the worst case per call) is when the UI calls a Qloo call slow and names it. The session times only its 3 oldest waiting calls, as many as the gateway sends at once, so a call queued behind the session's own isn't called slow. `GUEST_PITCHES` (`on` since #57's live check) switches the guest pitch flow: only `on` serves `/inbox`, links it, and allows the inbox actions, and `off` cuts it.
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
- **Opening on the sample network:** a session's first start opens it on the sample network when the `SAMPLE_NETWORK` Worker variable is `on`, as it is deployed; tests turn it off. The 19 shows are looked up as an import is, through the gateway, so they resolve from the shared cache once any visitor has opened the demo. The CPM is set, and the launch field is prefilled with the sample launch, which the visitor starts. Nothing is settled for the visitor: Binge Mode stays ambiguous and the misses stay missed. State flags which sample figures each show still holds and whether the CPM is still the sample's, so each keeps its sample label until the visitor changes it. Clearing the sample network, or importing a roster, leaves it: the roster is replaced, and the sample CPM goes too, because a real network's CPM has no default.
- **Sample answers:** a slot budget of 20 slots and no run exclusions, in `sample-network.json` and in synced state while the session is on the sample network. The guide, the replay, and the warm-up reuse them. They are suggested, never filled in: the programmer still answers.
- **Sample launch:** The Watch, a released show, ranked against the other 15 resolved roster shows. When the launch is a roster show, the fit ranking and topic baseline leave it out of its own candidates. The Ryen Russillo Podcast moves most among the finalists, up six places from topic rank 11 to fit rank 5, but shares only host and style tags with The Watch. The demo leads with The Bill Simmons Podcast, up five or six places from topic rank 9 or 10 to fit rank 4, because its shared tags explain the move: Pop Culture, plus Conversational and Insightful. Meanwhile the topic ranking's two music shows, Every Single Album and 60 Songs That Explain the '90s, fall from topic ranks 3 to 7 to fit ranks 14 and 13. Below the finalists, The Ringer NFL Show climbs five to seven places, to fit rank 7. A second run with three fresh topic samples gave the same ranks within one place.
- **Mapped shows:** a show Qloo missed, mapped to a comp, is scored by the comp's listeners, and ranks sensibly beside resolved shows when the comp shares the show's audience. On 2026-10-17, on the deployed Worker, The Watch's ranking with The Zach Lowe Show mapped to The Lowe Post and The Press Box mapped to Sports Media with Richard Deitsch kept the 15 resolved shows in the order they took without the two, with the same raw affinities for the 13 compared. The Lowe Post, Zach Lowe's earlier show, came 8th of 17, among the network's sports shows. Sports Media with Richard Deitsch, from outside the network, came last, so a comp's own audience sets the mapped show's place, which is why the chart says "Mapped to" beside it.
- **Sample show for pitches:** The Big Picture, with three past guests from its public episode feed: Paul Thomas Anderson for One Battle After Another (episode of 2025-09-26), Rian Johnson for Wake Up Dead Man: A Knives Out Mystery (2025-12-16), and Josh Safdie for Marty Supreme (2025-12-24). All three films resolve. They're too recent to score as candidates, but they still work as anchors: each book, TV, and podcast result's explainability lists all four anchors, while film results list only the show and Wake Up Dead Man.
- **Sample inbox:** [`apps/src/sample-inbox.json`](/apps/src/sample-inbox.json), flagged `sample`, holds the show, its past guests, and 40 synthetic pitches from fictional publicists at `example.com` addresses: 15 books, 11 films, 6 TV shows, 4 podcasts, and 4 from fictional people with no public work. Five pitches word a fitting work as off-topic, such as The Rehearsal pitched as aviation safety and Stanley Tucci's Taste pitched as home cooking. Each pitch's `expected` field records the guest, work, type, and year as an answer key for extraction, not an input to it. Most works came out before May 2025 so that they score; 10 of the 36 miss in search or go unscored, to show those paths.
- **Checking the inbox:** on 2026-10-17, [`scripts/check-sample-inbox.ts`](/scripts/check-sample-inbox.ts) searched each work by type with `take=5`, searched again without `types` on a miss, and ran the rankings below. Its output stays out of the repo. A first pass on an earlier draft of the inbox, with more recent works, is included where noted.
  - **Search types:** the type's own `types` value resolved all 11 films, all 6 TV shows, 3 of 4 podcasts, and 11 of 15 books, and a search without `types` never found a missed work under another type. Frankenstein came third and Digger second, after older same-name films, and in the first pass Task (2025) came fourth after Taskmaster. Qloo's names can drop a subtitle (Wake Up Dead Man), add a series suffix to a book (Onyx Storm (The Empyrean, #3)), or end in "Podcast" (Scriptnotes Podcast). New Heights isn't in Qloo as a podcast.
  - **Recent books:** all 5 books published September to November 2026 missed, 3 in the inbox and 2 in the first pass. Of 4 from 2025, Katabasis and Future Boy missed, Atmosphere resolved but went unscored, and Onyx Storm scored. Of 11 from before 2025, two 2023 nonfiction books missed: Every Man for Himself and God Against All, and Oscar Wars.
  - **Across categories:** 11 books ranked against the podcast alone returned 200, with scores and explainability for 10, from 0.491 for Onyx Storm to 0.780 for Cinema Speculation, and Taste tied for second. With the show and the past guests' works as anchors, one call per type scored 10 of 11 books, 8 of 11 films (0.820 to 0.859), 5 of 6 TV shows (0.865 to 0.911, with The Rehearsal second), and all 3 podcasts. No result fell outside its candidate list.
  - **In the app:** on 2026-10-17, a pitch run against The Big Picture with the three past guests' films ranked all four types against the show and past guests, so cross-category ranking held and no type fell back: 10 books, 8 films, 5 TV shows, and 3 podcasts, the same works scored as above. The Rehearsal, pitched as aviation safety, ranked second of five TV shows. A pasted Pluribus pitch with Hacks as the only past guest ran the fallback: unscored against the show and Hacks, then unscored against Hacks alone, so its list stayed unranked.
  - **Unscored candidates:** the left-out works were Atmosphere, Hamnet, The Bride!, Digger, and Pluribus. Of everything tried, only Frankenstein scored among works released since May 2025. In the first pass, 10 of 11 films from mid-2025 to 2026 were left out; the same 11 with no signal came back with null affinity for 9, so they're in the catalog without a score. The other two, Digger and The Social Reckoning, have no popularity in search. A control of 12 well-known films scored the 8 released before May 2025 and left out Weapons, One Battle After Another, Marty Supreme, and Hamnet.

## Open technical questions

None open. Whether a roster with misses mapped to comps ranks sensibly next to resolved shows is answered under [Demo data](#demo-data).

## See also

- [PRD](PRD.md), [PRODUCT.md](PRODUCT.md), and [IDEA.md](IDEA.md)
- [Brief](BRIEF.md#api-essentials) for the Qloo API, and [context](CONTEXT.md#agent-design-practices) for agent practices
- [Cloudflare Agents SDK](https://github.com/cloudflare/agents)

[cf-config]: https://github.com/cloudflare/agents/blob/main/docs/agents/configuration.md
