# Submission

This is Crossfeed's entry text for the Qloo Agentic Hackathon on Devpost. The owner submits it in [#63](https://github.com/m1kuorg/qloo/issues/63):

- Copy the [Devpost fields](#devpost-fields) into the form's short fields.
- Paste everything from [What breaks without Qloo](#what-breaks-without-qloo) to the end of this file into the project description.

Every figure links the live check, code, or doc it comes from. The links are full URLs, so they keep working on Devpost once the repository is public.

Contents:

1.  [Devpost fields](#devpost-fields)
1.  [What breaks without Qloo](#what-breaks-without-qloo)
1.  [Technological implementation](#technological-implementation)
    1.  [Qloo endpoints](#qloo-endpoints)
    1.  [One run, from the click to an approved insertion order](#one-run-from-the-click-to-an-approved-insertion-order)
    1.  [Engineering around Qloo](#engineering-around-qloo)
1.  [Design](#design)
1.  [Potential impact](#potential-impact)
1.  [Quality of the idea](#quality-of-the-idea)
1.  [Crossfeed as a company](#crossfeed-as-a-company)
1.  [Known limitations](#known-limitations)

## Devpost fields

- **Project name:** Crossfeed
- **Elevator pitch:** An agent that tells a podcast network which of its own shows should promote a launch, and which pitched guests its listeners want, by ranking the network's own lists in Qloo.
- **Try it out:** <https://crossfeed.m1kuorg.workers.dev>, whose first button opens the sample network at <https://crossfeed.m1kuorg.workers.dev/demo>, and <https://github.com/m1kuorg/qloo>
- **Built with:** qloo, claude, anthropic, cloudflare-workers, durable-objects, cloudflare-agents, cloudflare-d1, hono, react, typescript, vite, vitest, webauthn, openapi, mcp
- **Video and images:** the video is `crossfeed-demo.mp4`, 2 minutes 50 seconds with captions and no voice, on the draft release `submission`, which waits for approval in [#63](https://github.com/m1kuorg/qloo/issues/63). The screenshots are from the same run on the live demo, on sample data:
  - [The chart, with a climber and its "why it moved" line](https://github.com/m1kuorg/qloo/blob/main/docs/images/chart.png)
  - [The agent's open question](https://github.com/m1kuorg/qloo/blob/main/docs/images/question.png)
  - [The evidence for the ranking call](https://github.com/m1kuorg/qloo/blob/main/docs/images/evidence.png)
  - [The approved insertion order](https://github.com/m1kuorg/qloo/blob/main/docs/images/insertion-order.png)
  - [The inbox's TV shows ranked against The Big Picture](https://github.com/m1kuorg/qloo/blob/main/docs/images/inbox-ranked.png)
  - [The inbox's drafted replies, one approved](https://github.com/m1kuorg/qloo/blob/main/docs/images/inbox-replies.png)

## What breaks without Qloo

Crossfeed is an agent for a podcast network, with two jobs:

- It tells the head of programming which of the network's own shows should carry a launch's host-read promos.
- It tells the bookers which pitched guests their listeners actually want.

Every promo slot is an ad the network didn't sell, yet launch plans are drawn up by topic: the new true-crime show goes on the other true-crime shows.

Without Qloo, an agent can only plan by topic, so Crossfeed runs that plan as its control. Claude Haiku 5.5 ranks the roster from show names and descriptions alone, with no Qloo input. The fit chart shows that rank as "last week" beside Qloo's as "this week".

The live demo opens on a sample network built from The Ringer's public show names. Its sample launch is The Watch, whose description covers the week's TV, movies, and music. Across three fresh sessions ([live check]):

- **The music shows fall.** The topic plan put the network's two music shows, Every Single Album and 60 Songs That Explain the '90s, between 3rd and 8th of 15. By how much their listeners overlap The Watch's, they rank 14th and 13th.
- **A sports show climbs.** The topic plan put The Bill Simmons Podcast 9th or 10th. Qloo ranks it 4th, a finalist. Qloo's compare names what the two shows' listeners share: Conversational, Insightful, and Pop Culture.

The topic ranks shifted by up to four places between sessions; Qloo's didn't change. It's one network and one launch: an example, not a study.

A booker without Qloo has only the publicist's words to go on. Crossfeed never scores a pitch's text. It pulls out the public work the guest is promoting and ranks that work against the show's listeners. In the sample inbox, The Rehearsal is pitched as a show about aviation safety, which reads as off-topic for a movie podcast. Qloo still ranks it 2nd of 5 TV shows against The Big Picture, in the top band ([live check]).

## Technological implementation

Crossfeed is built with an agent framework, the Cloudflare Agents SDK, and calls Qloo's REST API directly from a Cloudflare Worker. Each part has one job:

- **Qloo:** every fit ranking, demographic flag, and shared tag.
- **Claude Haiku 5.5:** runs the steps, asks the human, and drafts text from what Qloo returned.
- **Code:** prices the plan and enforces the budget.

### Qloo endpoints

- **`GET /search`:** resolves each roster show and the launch by name, with `types=urn:entity:podcast`. It also resolves each pitched work by title and type: `urn:entity:book`, `movie`, `tv_show`, or `podcast`.
  - An ambiguous match goes to the human with its candidates and their popularity.
  - A missed show can be mapped to a comparable one.
  - Qloo found no podcast by its Spotify ID, so names are the input ([TRD calls]).
- **`POST /v2/insights` with `filter.results.entities`:** ranks the network's closed list in one comparison.
  - The launch is the signal, `signal.interests.entities`. For an unreleased launch, up to three comparable shows (comps) stand in.
  - The roster is the candidates, with `feature.explainability=true` and `take=50`.
  - With comps, explainability says which comp led a show's fit.
- **The same call, once per work type:** ranks pitched books, films, TV shows, and podcasts against the show and its best past guests' works. Each type gets its own list, because scores from separate calls aren't comparable.
- **`POST /v2/insights` with `filter.type=urn:demographics`:** checks the launch and its five finalists in one call. It flags age bands and gender skew that run against the launch's.
- **`GET /v2/analysis/compare`:** one call per finalist and per top pitch returns the tags the two sides' listeners share. Those tags become the "why it moved" line, the host-read angle, and the episode angle.

### One run, from the click to an approved insertion order

This run is from the [live check], with Qloo entity IDs left out:

1.  **Roster:** a new session opens on the sample network's 19 shows. Each is looked up with `GET /search?query=<show>&types=urn:entity:podcast&take=3`, as calls C-01 to C-19. Of these, 16 resolve, Binge Mode is ambiguous, and The Zach Lowe Show and The Press Box miss.
2.  **Ranking:** select Start run on The Watch. The agent looks it up (C-20) and calls its `rank_candidates` tool, which sends one ranking (C-21):

    ```json
    {
      "filter.type": "urn:entity:podcast",
      "signal.interests.entities": "<The Watch>",
      "filter.results.entities": "<the 15 other resolved shows>",
      "feature.explainability": true,
      "take": 50
    }
    ```

    Code turns the affinities into fit ranks and bands, marks the top five as finalists, and sets each show's move against its topic rank. The chart showed 5.4 seconds after the click, with Qloo's responses already cached. Cold, on a local server, it took 6.9 seconds ([#53]).

3.  **Questions:** the agent asks for the slot budget, then for shows to leave out. It asks through an `ask_human` tool, which pauses the run until the human answers. The answers were 20 slots and no exclusions.
4.  **Demographics (C-22):** The Watch's listeners over-index at ages 35 to 44 and skew male. The Bill Simmons Podcast has fewer listeners aged 35 to 44 than average. It's marked "Listeners differ" and stays a finalist, for the human to judge.
5.  **Shared tags (C-23 to C-27):** one compare per finalist, with The Watch on side `a`. The Bill Simmons Podcast shares Conversational, Insightful, and Pop Culture.
6.  **Insertion order:** Haiku proposes slots and a host-read angle per finalist from those tags; code refuses an angle for a finalist Qloo returned no shared tags for. Code prices each slot at downloads per episode × CPM ÷ 1,000 and rejects a draft over the budget. IO-0001 put 20 slots on the five finalists for $167,200, at the sample $20 CPM. That includes 4 slots on The Bill Simmons Podcast at $14,000 each.
7.  **Approval:** the programmer edits or approves the order. The CSV export answered 409 until the order was approved, then downloaded it.

The run made 27 Qloo calls. Every ranking, tag, and flag on screen cites its call number. Selecting a call number opens its evidence: its parameters, status, latency, and cache hit, plus the raw scores the chart leaves out.

The guest flow runs the same way ([live check]):

- **Reading:** the 40-pitch sample inbox was read in 11.5 seconds.
- **Ranking:** the pitch run made 18 Qloo calls: 3 searches for past guests' works, 4 rankings, and 11 compares ([pitch run check]).
- **Replies:** it drafted 40 replies, and the run completed in 30.8 seconds.

### Engineering around Qloo

- **One door to Qloo:** a gateway Durable Object is the only code that calls Qloo: one shared instance, plus one for each signed-in network that brings its own Qloo key ([TRD gateway rules], [wrangler.jsonc]). It:
  - caches responses privately;
  - keeps at most 3 calls in flight, and starts each at least 400 ms after the last, because bursts drew 429s in a live check;
  - times out at 20 seconds, and retries 429, 502, 503, 504, and timeouts up to twice;
  - stops at 1,000 calls a day;
  - returns an error, not a result, for a ranking whose scores are all null, as when a signal didn't resolve, and lists any candidate Qloo leaves out as not scored.
- **An agent that can't commit:** each visitor session is an Agents SDK Durable Object, with its state synced to the browser.
  - Haiku runs a tool loop with strict tool schemas.
  - A run takes at most 12 model turns and 60 Qloo calls ([limits.ts]). A visitor starts at most 10 model runs a day across browsers, and all visitors together 200, which bounds model spend in code ([TRD agent limits]).
  - Approving and exporting are UI actions with no tool, so the model proposes and the human commits.
- **Still answering when Qloo isn't:** the sample launch's last completed run is stored. When the daily cap is reached, or Qloo keeps failing, the sample launch replays it, labelled "Replayed" ([TRD replay]). A daily cron checks the key, and that the sample ranking is still cached.
- **Tests at the network boundary:** Vitest runs the Worker in the Workers runtime, D1 included. Qloo and Anthropic are replaced by hand-written responses and scripted model turns, and passkeys by a software authenticator that signs as a browser does. Tests drive the Worker's routes, the agents' client protocol, the REST API, the SDK, and the MCP server, as the UI, a program, and an assistant do. CI runs formatting, types, the SDK's types, tests, commit titles, and a secrets scan on every pull request.

[TRD calls]: https://github.com/m1kuorg/qloo/blob/main/docs/TRD.md#calls
[TRD gateway rules]: https://github.com/m1kuorg/qloo/blob/main/docs/TRD.md#gateway-rules
[TRD replay]: https://github.com/m1kuorg/qloo/blob/main/docs/TRD.md#caching-caps-and-replay
[TRD agent limits]: https://github.com/m1kuorg/qloo/blob/main/docs/TRD.md#agent-limits
[limits.ts]: https://github.com/m1kuorg/qloo/blob/main/apps/src/limits.ts

## Design

A judge opens the URL on a one-screen landing page: an illustrative chart of made-up shows, labelled as an illustration, with what Crossfeed never does and the ways in. Its first button opens the sample network with no sign-in, on a working screen, not a chat:

- **Sample data, labelled:** the network opens ready, with a notice that Crossfeed isn't affiliated with The Ringer. Every download, status, description, and CPM figure is labelled "sample" until the visitor edits it.
- **A weekly chart:** the fit chart reads like a music chart:
  - "This week" is the fit rank, and "last week" is the topic rank.
  - A red bullet marks a show that climbed three or more places.
  - Selecting a climber opens its "why it moved" line, which cites the ranking and the compare.
- **Rank and band, not decimals:** Qloo normalizes affinity per query, so the chart shows Strong, Good, or Fair by thirds of the ranking. Raw scores stay in the evidence.
- **Data and agent kept apart:** Qloo results are labelled "Qloo data", and the agent's text "Agent", wherever they appear.
- **Slot value beside fit:** each charted show's slot value, its downloads per episode × CPM ÷ 1,000, has its own column, labelled "sample" while its figures are. It comes from the same formula that prices the insertion order, so the two never disagree. On a narrow chart, it moves into the show's cell.
- **A rail beside the chart:** the agent's open question sits at its top, as a form. Under it come the guide through the sample launch, the selected show, the evidence for any call, the insertion order with its totals, and the progress notes with the agent's closing line. In one column, the question comes before the chart, and the roster follows the rail.
- **Honest states:** loading, slow, failed, missed, not scored, and replayed each have their own wording. A Qloo call still waiting after 8 seconds is named as slow ([wrangler.jsonc]).
- **The booker's inbox:** each pitch shows its guest, the public work, and the work's Qloo match. Pitched works are ranked in one list per type. Every pitch gets a drafted reply under Book, Later, or Decline. The booker approves, edits, or discards each reply, then copies it to send.
- **The same world, signed in:** the product's dashboard, roster, settings, and account pages keep the chart's tables under a black rule and its hairline modules, with no KPI tiles, cards, or shadows, and one black button for each page's decision ([DESIGN.md]).

[DESIGN.md]: https://github.com/m1kuorg/qloo/blob/main/docs/DESIGN.md

## Potential impact

- **A named user with a costly, recurring job:** the head of programming plans promos with every launch, and every slot a promo takes is an ad not sold. The bookers triage pitches every day.
- **The plan priced as inventory:** the insertion order prices each slot from the network's own downloads and CPM. Crossfeed ships no default CPM for real networks. The demo's $20 CPM and its downloads are labelled arbitrary sample figures ([sample network]).
- **A decision the user can defend:** the approved order shows which call and which shared tags put each show there. It also shows where a finalist's listeners differ from the launch's.
- **Safe with other people's inboxes:** only public works reach Qloo.
  - On the live demo, two sessions' full logs held 81 and 73 Qloo calls. None held a guest name, sender name, or email address from the sample inbox ([live check]).
  - Pitch text does go to Anthropic, to extract the work and draft replies. The sample inbox is synthetic: its publicists are fictional, at `example.com` addresses.

[sample network]: https://github.com/m1kuorg/qloo/blob/main/apps/src/sample-network.json

## Quality of the idea

- **Closed lists, not discovery:** most taste apps ask Qloo what to recommend next. Crossfeed asks it to rank lists the network already owns, its roster and its inbox, because that's the decision the user actually makes. `filter.results.entities` scores exactly those candidates in one comparison.
- **The counterfactual on screen:** the topic-only plan sits beside Qloo's ranking in every run, so what Qloo adds is shown, not asserted.
- **Across categories:** a guest's book, film, or TV show is ranked against a podcast's listeners and its past guests' films. That takes a taste graph that spans media.
- **Built around how networks work:**
  - Comps stand in for a show that hasn't launched.
  - Shows mid-sale can be left out.
  - A missed show can be mapped to a comparable one.
  - Fit is described as listener overlap, never as a probability about a person ([Qloo safe use]).

[Qloo safe use]: https://github.com/qloo/qloo-hackathon-kit/blob/0db91b8d9c5aae2160d53596e57ea6c9da251cde/docs/SAFE_USE.md

## Crossfeed as a company

- **Customer:** podcast networks, for the programmers and bookers who plan launches and triage pitches. Independent shows that trade feed swaps are a wider second tier.
- **Wedge and habit:** the launch plan is a high-stakes decision made with every launch. The booking inbox is daily work, which keeps the product open between launches.
- **One engine:** both jobs are the same call, a closed list ranked against a show in Qloo. Each new list a network owns, such as candidate swap partners, is another product on that engine.
- **The product a network signs in to, built:** the demo is one browser's session; the company is a network's members working in Crossfeed together. That product is built in this repository, on the same Worker, behind one switch (`ACCOUNTS`) that production turns on only once the whole product passes on a preview deployment ([product spec]):
  - members sign up with a passkey, with no password or email, and invite teammates with a link that works once;
  - a network's dashboard lists every launch with its status, finalists, slots, and slot value, and each launch keeps its own runs, so two programmers can plan two launches at once;
  - members upload the roster as the CSV they already keep, and pitches as the `.eml` or `.mbox` their email client exports;
  - owners manage members and API keys, see usage against the beta's daily caps, and can bring the network's own Qloo key;
  - a REST API, a TypeScript SDK, an MCP server, two Agent Skills, and a Claude Code plugin let a network's scripts and assistants import, run, and draft, but never approve: only a member, in the app, approves an insertion order or a reply.
- **What a paid version needs:** the launch plan and the daily inbox are work a network's programmers and bookers already do, and the API and MCP server put Crossfeed inside the tools they use. The beta is free and runs on our hackathon Qloo key, which Qloo's terms don't let us resell, so a paid Crossfeed needs a commercial Qloo agreement, or each network's own Qloo key, which an owner can already add.
- **Next, not built yet:**
  - downloads read from the network's hosting analytics;
  - the booking inbox read from email;
  - approved orders pushed to the ad server;
  - swap partners from outside the roster;
  - a launch's results measured after its promos run.
- **What we don't claim:** Crossfeed has no customers or pricing yet. This entry quotes no market size or time saving, because we have no source for one.

[product spec]: https://github.com/m1kuorg/qloo/issues/155

## Known limitations

- **The topic plan is a stand-in.** It's Haiku's ranking from names and descriptions, not a measurement of how any network plans, and it varies between runs.
- **Fit isn't a forecast.** It's listener overlap in Qloo's graph, not a prediction of downloads or conversions. Crossfeed doesn't measure a launch's results.
- **Sample figures are arbitrary.** The downloads, statuses, descriptions, and CPM are ours, not The Ringer's.
- **Smaller networks resolve worse.** `/search` found 16 of 19 Ringer shows, 11 of 15 from Exactly Right, and 8 of 16 from Pushkin ([TRD demo data]). A missed show can be mapped to a comparable show, whose listeners then set its place.
- **Recent works often go unscored.** Qloo left out most works released since about May 2025 ([TRD demo data]). In the sample inbox, Atmosphere, Hamnet, The Bride!, and Pluribus are listed as not scored. Digger waits for the booker to pick the right match.
- **Shared tags between podcasts are mostly style.** Host and style tags such as Conversational and Insightful dominate, topical tags are rare, and some compares share no distinctive tags.
- **Explainability rarely names a leading comp.** In a three-comp run, a comp clearly led on 2 of 16 shows, and the others were even ([#53]).
- **One comparison holds at most 50 shows,** Qloo's page limit ([TRD gateway rules]). A larger roster is refused, rather than split into scores that can't be compared.
- **Agent text varies.** Haiku's reading of pitches and its drafts change a little between runs.
- **Insertion order totals vary by run.** Haiku spreads the 20 slots across the finalists differently each time, so the same sample launch came to $167,200 in one live check ([live check]) and $162,800 in another ([#126 check]).
- **A podcast named after its guest is set aside.** A work title holding the guest's or sender's whole name never reaches Qloo, so a pitch for "Conan O'Brien Needs a Friend" is set aside as unreadable rather than ranked ([#117 check]).
- **Guest pitches are live.** They were switched on in production after their live check ([#57]). Drafted replies name no guest, because the model never sees names; the booker adds them before sending.
- **No integrations.** Nothing is emailed or pushed to an ad server. Downloads are typed in or uploaded as CSV, and pitches are pasted, uploaded as `.eml`, `.mbox`, or text files, or loaded from the sample.
- **No sign-in on the demo.** A session is one browser's cookie. A visitor, known only by a salted hash of their address, starts at most 10 model runs a day, and all visitors together 200. Past either, or if Qloo can't be called, only the sample launch replays; other runs stop and say why. A signed-in network counts as a visitor of its own, against the same limits.
- **The signed-in product is a beta.** It runs on our hackathon Qloo key within each network's daily caps, which Qloo's terms don't let us resell; selling it needs a commercial Qloo agreement or each network's own key, which an owner can already add. It has no payments, no email, and passkey sign-in only, and its SDK and plugin aren't published to npm or a public marketplace.

[TRD demo data]: https://github.com/m1kuorg/qloo/blob/main/docs/TRD.md#demo-data
[pitch run check]: https://github.com/m1kuorg/qloo/issues/133#issuecomment-6233620198
[#126 check]: https://github.com/m1kuorg/qloo/issues/126#issuecomment-6233324338
[#117 check]: https://github.com/m1kuorg/qloo/issues/117#issuecomment-6233255471
[#57]: https://github.com/m1kuorg/qloo/issues/57#issuecomment-6232519697
[live check]: https://github.com/m1kuorg/qloo/issues/60#issuecomment-6232713502
[#53]: https://github.com/m1kuorg/qloo/issues/53#issuecomment-6232531399
[wrangler.jsonc]: https://github.com/m1kuorg/qloo/blob/main/apps/wrangler.jsonc
