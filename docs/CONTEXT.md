# Context

The field around the Qloo Agentic Hackathon: what Qloo's previous hackathon rewarded, who we are competing against, what the judges value, what wins comparable Devpost hackathons, and what Qloo gives builders. [BRIEF.md](BRIEF.md) covers the rules and the API; read it first. This doc was researched on 2026-10-16.

Each claim links to its source. Sections and bullets marked as our reading are inference, not source text.

Contents:

1.  [Previous Qloo hackathon](#previous-qloo-hackathon)
    1.  [How 2025 differs from 2026](#how-2025-differs-from-2026)
    1.  [2025 winners](#2025-winners)
    1.  [Lessons from the 2025 winners](#lessons-from-the-2025-winners)
    1.  [Saturated 2025 themes](#saturated-2025-themes)
1.  [The 2026 field](#the-2026-field)
1.  [Judges](#judges)
    1.  [Jason Calacanis and the bonus](#jason-calacanis-and-the-bonus)
    1.  [Other judges](#other-judges)
1.  [What wins Devpost hackathons](#what-wins-devpost-hackathons)
    1.  [Devpost guidance](#devpost-guidance)
    1.  [Comparable winners](#comparable-winners)
1.  [Qloo builder materials](#qloo-builder-materials)
    1.  [Hackathon kit](#hackathon-kit)
    1.  [Open-source prior art](#open-source-prior-art)
1.  [Agent design practices](#agent-design-practices)
1.  [Strategy for our entry](#strategy-for-our-entry)
1.  [Unverified](#unverified)
1.  [See also](#see-also)

## Previous Qloo hackathon

The [Qloo LLM Hackathon][llm] ran Jul 1 – Aug 1, 2025, with the same $25,000 pool, split differently: a $10,000 Grand Prize and three $5,000 Honorable Mentions. Qloo counted 2,893 participants, and the public [gallery] lists 343 projects.

### How 2025 differs from 2026

- **Judges:** five of the six 2026 judges also judged in 2025. Mike Diolosa, Qloo's CTO, is the only new one ([2025 judges][llm-judges], [2026 judges][judges-2026]).
- **Theme:** 2025 asked for an LLM combined with Qloo; 2026 asks for an agent ([2025 build][llm-build], [BRIEF](BRIEF.md#challenge)).
- **Criteria:** 2025 had five, including a whole criterion for "Integration with Qloo's API" and one for LLM use ([2025 criteria][llm-criteria]). 2026 has four: Qloo use sits inside Technological implementation, and Design is new ([BRIEF](BRIEF.md#judging-and-prizes)).
- **Demo:** both years required a hosted demo. 2025 also required a demo video under 3 minutes ([2025 submit][llm-submit]); in 2026 video is optional ([BRIEF](BRIEF.md#submission-checklist)).
- **Screening:** in 2025, Qloo's team "narrowed down the final list to be sent to the ultimate judges" ([updates][llm-updates]). The 2026 rules add that judging may use "automated AI-driven analysis" ([BRIEF](BRIEF.md#judging-and-prizes)).
- **Timing:** 2025 winners were due around Aug 18. The date slipped to Aug 25, and Qloo announced them on X on Sep 8 ([dates][llm-dates]).

[llm-judges]: /docs/sources/qloo-hackathon.devpost.com/qloo-llm-hackathon.md#judges
[llm-build]: /docs/sources/qloo-hackathon.devpost.com/qloo-llm-hackathon.md#what-to-build
[llm-criteria]: /docs/sources/qloo-hackathon.devpost.com/qloo-llm-hackathon.md#judging-criteria
[llm-submit]: /docs/sources/qloo-hackathon.devpost.com/qloo-llm-hackathon.md#what-to-submit
[llm-updates]: /docs/sources/qloo-hackathon.devpost.com/qloo-llm-hackathon.md#updates
[llm-dates]: /docs/sources/qloo-hackathon.devpost.com/qloo-llm-hackathon.md#dates

### 2025 winners

Neither Qloo nor the judges said why these won ([announcement][winners-announce]).

| Project        | Prize             | What it does                                                              | Qloo use                                                               |
| -------------- | ----------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [GeoTaste]     | Grand Prize       | Location to market analysis: map, 13+ chart types, GPT-4 consultant chat  | Two filter-only `/v2/insights` calls, for brands and places in a city  |
| [Alloy]        | Honorable Mention | M&A cultural due diligence with a "Cultural Compatibility Score"          | ReAct agent: `/search` for proxy brands, then `urn:tag` taste analysis |
| [Resonance AI] | Honorable Mention | Political campaign targeting and generated campaign content on Google ADK | Heatmaps, audiences, tags, and insights across five entity types       |
| [Zesty]        | Honorable Mention | "Unrecommendation engine" that suggests the opposite of your taste        | `/search` and `/v2/insights`                                           |

[winners-announce]: /docs/sources/qloo-hackathon.devpost.com/winners.md#announcement
[GeoTaste]: /docs/sources/qloo-hackathon.devpost.com/winners.md#geotaste-your-business-consultant-agent
[Alloy]: /docs/sources/qloo-hackathon.devpost.com/winners.md#alloy
[Resonance AI]: /docs/sources/qloo-hackathon.devpost.com/winners.md#resonance-ai

### Lessons from the 2025 winners

Our reading of the [winners] and the [gallery] tally; with four winners, treat these as hints, not rules:

- **Organizational decisions won.** Three of four winners help an organization decide something: where to open, what to acquire, or whom to campaign to. Business, marketing, and audience tools were only 54 of the 282 on-theme entries (19%); consumer recommenders were 142 (50%) and won once, with an inversion of the usual idea.
- **Qloo depth didn't decide it.** GeoTaste won with the shallowest Qloo calls of the four; its map and 13+ chart types are the likeliest reason, though no one said so. 2026 scores Design directly and puts Qloo use first, so an entry needs both.
- **Quantified value.** Alloy pitched "~6 minutes" against consulting's "4-6 Weeks" and turned Qloo output into a score a buyer could act on.
- **Safe-use rules have tightened.** Resonance AI targeted voters through political-preference audiences. The 2026 kit says Qloo results shouldn't be used to infer a person's political views, health, or eligibility for housing, employment, credit, or insurance ([safe use][kit-safe]).

### Saturated 2025 themes

From the [gallery] tally of all 343 projects, classified by title and tagline:

- Cross-domain "cultural DNA" recommenders and concierges (58) and travel and local discovery (48) made up 106 of the 282 on-theme entries. Their only winner was Zesty, which inverts the idea.
- 61 titles contain "Cultur…" and 41 contain "Taste"; five names were used twice ([recurring names][gallery-names]).
- 61 entries (18%) were off-theme or placeholders.

[gallery-names]: /docs/sources/qloo-hackathon.devpost.com/project-gallery.md#recurring-names

## The 2026 field

- **Size:** 1,580 participants were registered on 2026-10-16, against 2,893 in 2025, and the gallery isn't published yet ([Devpost](https://qloo.devpost.com/)).
- **Public repos:** a [GitHub search][gh-search] on 2026-10-16 found 436 repositories matching "qloo", 241 of them created since 2026-09-01. Of those, 210 have unique descriptions. Keyword matches over those descriptions overlap, so the counts below are approximate:
  - About 28 are tour-routing, booking, or venue-programming agents for independent artists, comedians, and promoters.
  - About 30 are group or two-person planners for outings, dinners, movies, and seating.
  - About 15 are care, reminiscence, senior, or patient companions, close to Devpost's own examples of seniors' dining and rare-disease journeys ([what to build][build]).
  - Many others are brand, sponsorship, market-fit, and restaurant-strategy agents, plus relocation, education, travel, and MCP "taste layer" tools.
- **Shared vocabulary:** many descriptions already say "evidence-first", "receipt-cited", or "decision receipts", echoing the kit's provenance guidance ([submission guide][kit-submit]). Our reading: provenance is now table stakes, not a differentiator.
- **Forum mood:** besides the key delays in the [brief](BRIEF.md#api-access), one entrant argued that three prizes leave most strong projects with nothing ([forum]).

[gh-search]: https://github.com/search?q=qloo&type=repositories&s=updated
[forum]: /docs/sources/qloo.devpost.com/discussion-forum.md

## Judges

### Jason Calacanis and the bonus

Calacanis personally invests $25,000 in his favorite entry ([BRIEF](BRIEF.md#judging-and-prizes)). In his own words:

- He writes that "the wow-factor of the demo drives who wins -- not who solved the hardest technical challenge" and "The best demo wins -- almost always!" He advises using "the latest, most buzzworthy technology", and his goal is "to create startups that I can be the first investor in" ([How to win any hackathon][jcal-hack], 2015).
- In February 2026 he offered "$25k to start an openclaw-based startup… We want to be your first investor" ([X post][jcal-x]).
- Qloo's CEO Alex Elias was a guest on episode 1 of his This Week in AI, which discussed the rise of OpenClaw, an open-source agent platform, and listed "Democratizing Luxury: Scaling the 'chauffeur and concierge' experience to everyone through taste-based AI" ([episode][twiai]).

The 2025 hackathon had no such bonus ([2025 prizes][llm-prizes]).

[llm-prizes]: /docs/sources/qloo-hackathon.devpost.com/qloo-llm-hackathon.md#prizes
[jcal-hack]: https://www.linkedin.com/pulse/how-win-any-hackathon-why-theyre-important-jason-calacanis
[jcal-x]: https://x.com/Jason/status/2021273316905058421
[twiai]: https://podcasts.apple.com/us/podcast/what-is-holding-openclaw-back-this-week-in-ai-episode-1/id1874648722?i=1000750242735

### Other judges

- **Mike Diolosa**, Qloo CTO: argues that models need data spanning domains to "connect… a movie preference to a dining choice", and that first-party data alone ends up "reinforcing what the user already knows and likes" ([The AI Innovator][diolosa], 2024). No 2025–2026 statements found.
- **Todd Boehly**: Eldridge invested in Qloo's Series B and C ([Series C coverage][boehly]).
- **Cedric the Entertainer**: an early Qloo backer, per the [brief](BRIEF.md#judging-and-prizes).
- **Nicole Seligman**: joined OpenAI's board safety and security committee in 2024 ([CNBC][seligman]).
- **Michael Abrams**: Live Nation Entertainment ([2026 judges][judges-2026]); earlier led Disney's strategic business initiatives ([Disney][abrams]).

Our reading: half the panel has a stake in Qloo (Diolosa, Boehly, Cedric), so commercial use of Qloo should be visible. Seligman's role favors responsible data handling. A Live Nation judge doesn't make live music a safe pick: it is the most crowded niche in [the 2026 field](#the-2026-field).

[diolosa]: https://theaiinnovator.com/ai-models-need-more-than-just-first-party-data-to-excel/
[boehly]: https://finance.yahoo.com/news/qloo-raises-25m-predict-favorite-140004540.html
[seligman]: https://www.cnbc.com/2024/09/16/openai-announces-new-independent-board-oversight-committee-for-safety.html
[abrams]: https://thewaltdisneycompany.com/press-releases/michael-abrams-named-senior-vice-president-for-new-strategic-business-initiatives-at-the-walt-disney-company/

## What wins Devpost hackathons

### Devpost guidance

From five sponsor judges in Devpost's [How to win a hackathon][devpost-tips]:

- Standouts are "clearly considering the judging criteria" and "balance across all" of them.
- Points are lost for being "extremely back-end heavy" with "no UI", or for a slick video on a project "a lot lighter on code."
- Judges look for "a startup mindset": "Do they see the problem behind the solution?"
- "If it doesn't really nail the prompt, it's going to be hard to give it full points."

The demo video is "one of the first things that judges will look at": keep it under about 3 minutes and show the product working, not slides ([video tips][devpost-video]). We found no Devpost write-up on how its "automated AI-driven analysis" works.

[devpost-tips]: https://info.devpost.com/blog/hackathon-judging-tips
[devpost-video]: https://info.devpost.com/blog/6-tips-for-making-a-hackathon-demo-video

### Comparable winners

- **Bolt's World's Largest Hackathon 2025** used near-identical criteria: Technological implementation, Design and user experience, Potential impact, and Quality of the idea ([criteria][bolt]). Its grand prize, Tailored Labs, is an AI video editor for creators that "handles 8 hours of editing work in just 4 minutes" ([winners][bolt-win]).
- **AWS AI Agent Global Hackathon 2025:** EcoLafaek tackles waste management in Timor-Leste. Second place, AegisAgent, turns manual insurance claim reviews into "an automated, explainable process" ([winners][aws]).
- **Google ADK Hackathon 2025:** SalesShortcut, a multi-agent sales development representative ([winners][adk]).

The common pattern, in our reading: a named user with a costly job and a product that does the whole job, with a number on the saving where one exists, as Tailored Labs has.

[bolt]: https://worldslargesthackathon.devpost.com/
[bolt-win]: https://bolt.new/blog/2025-bolt-hackathon-winners
[aws]: https://aws-agent-hackathon.devpost.com/updates/38140-congratulations-to-the-winners-of-the-aws-ai-agent-global-hackathon
[adk]: https://cloud.google.com/blog/products/ai-machine-learning/adk-hackathon-results-winners-and-highlights

## Qloo builder materials

### Hackathon kit

The official [qloo/qloo-hackathon-kit][kit] wraps one npm package, `@qloo/qloo-harness` 0.1.26 or newer, which offers a chat agent (`qloo explore`), a CLI (`qloo exec`, `qloo api`), and a local MCP server (`qloo mcp`). The kit's last commit is 2026-09-23, and it has no license file; the kit links below are pinned to that commit.

- **MCP tools:** the canonical chain is `qloo_find_tags` or `qloo_describe`, then confirm with the user, then `qloo_recommend`, `qloo_rank`, or `qloo_where_popular` ([MCP starter][kit-mcp]).
- **Result envelope:** every result has one of six statuses: `ok`, `empty`, `needs_input`, `partial`, `degraded`, or `error`. "Retry only when `error.retryable` is `true`. Show resolved matches to your user before you rely on them" ([MCP starter][kit-mcp]).
- **Hosting:** "There is no hosted URL." "A browser cannot start `qloo mcp`. Serverless functions are not a supported route" ([MCP starter][kit-mcp]). Using the harness means hosting on a VM or container.
- **Submission guide:** asks for a problem statement, the Qloo tools used and why, "a redacted request-to-result explanation, including any entity/tag choices", clean-environment setup, and known limitations. "Projects are stronger when they use Qloo results as evidence in a clear product flow rather than showing an isolated API response" ([submission guide][kit-submit]). This is the kit's advice; the [official rules][rules-6] still set the scoring.
- **Safe use:** send Qloo no personal data, distinguish a Qloo result from our interpretation, never present affinity "as a causal claim or a probability about an individual", and ask for clarification when an entity or tag choice would change the result ([safe use][kit-safe]).
- **Builder reports:** MCP `qloo_recommend` takes no release-year range, `qloo_rank` returns `needs_input` for ambiguous titles, dishes are tags rather than entities, and image rights for `images.qloo.com` are unclear ([discussion #4][kit-d4]). Questions about quota and key expiry are unanswered ([#1][kit-d1], [#2][kit-d2]).

[kit-mcp]: https://github.com/qloo/qloo-hackathon-kit/blob/0db91b8d9c5aae2160d53596e57ea6c9da251cde/starter/mcp-client/README.md
[rules-6]: /docs/sources/qloo.devpost.com/official-rules.md#6-judges-and-criteria
[kit-d2]: https://github.com/qloo/qloo-hackathon-kit/discussions/2
[kit-d4]: https://github.com/qloo/qloo-hackathon-kit/discussions/4

### Open-source prior art

All of these are MIT-licensed:

- [Bowen1314/shelfwise](https://github.com/Bowen1314/shelfwise), a 2026 readers'-advisory agent for libraries, shows the bar for robustness on the official `qloo mcp`. It handles all six statuses, pauses on `needs_input`, retries only when retryable, caches on normalized inputs, caps daily calls and concurrency, and streams tool calls over server-sent events (SSE).
- [Ankith-m1006/tastemenu](https://github.com/Ankith-m1006/tastemenu) reports a 30–50 second cold run and pre-warms its sample restaurants.
- [NoBanks/qloo-mcp](https://github.com/NoBanks/qloo-mcp) is a Python MCP server over `/search`, `/v2/tags`, `/v2/audiences`, and `/v2/insights` that fans out parallel insights calls.
- [manasseh-zw/qloo-ts-sdk](https://github.com/manasseh-zw/qloo-ts-sdk) is a 2025 TypeScript SDK that defaults to the hackathon base URL.
- [MR-GREEN1337/alloy](https://github.com/MR-GREEN1337/alloy) is the source of the 2025 winner Alloy.

## Agent design practices

Practices from primary sources that apply to an agent built on slow (~8 s) Qloo calls that usually need ID lookups first ([BRIEF](BRIEF.md#gotchas-beyond-the-developer-guide)):

- **Start simple.** Use fixed workflows where the steps are predictable, add autonomy only where it pays, show the agent's planning, and run independent calls in parallel ([Building effective agents][anthropic-agents]).
- **Design tools for the model, not the endpoints.** Consolidate common call chains into fewer tools, return names alongside IDs, make errors actionable, and evaluate on realistic multi-call tasks that track tool calls, runtime, and errors ([Writing effective tools for agents][anthropic-tools]).
- **Bound the agent.** Set a performance baseline with evals, cap retries and actions, and hand off to a human past failure thresholds ([A practical guide to building agents][openai-guide]).
- **Speak MCP properly.** Return tool errors as results with `isError` so the model can self-correct, pair `structuredContent` with an `outputSchema`, and time out calls ([MCP tools][mcp-tools]). Report long calls with progress notifications ([MCP progress][mcp-progress]).

[anthropic-agents]: https://www.anthropic.com/engineering/building-effective-agents
[anthropic-tools]: https://www.anthropic.com/engineering/writing-tools-for-agents
[openai-guide]: https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf
[mcp-tools]: https://modelcontextprotocol.io/specification/latest/server/tools
[mcp-progress]: https://modelcontextprotocol.io/specification/2026-07-28/basic/utilities/progress

## Strategy for our entry

Our reading of everything above. It adds to [Implications for our entry](BRIEF.md#implications-for-our-entry) in the brief, which still applies:

1.  **Pick an empty niche.** Organizational decision tools won in 2025, but the 2026 field has already crowded into tour routing, group planning, care and reminiscence, and brand or sponsorship scouting. Avoid those and the 2025 saturated themes. Devpost's three [examples][build] signal what Qloo wants, but care and health entries already crowd them, so take one only with a clearly different angle.
1.  **Make Qloo the evidence in a decision.** Turn Qloo output into a score, a ranking, or a go/no-go that a named buyer acts on, as Alloy did. Show which call, entities, tags, and affinities produced each claim, and keep them apart from the LLM's interpretation.
1.  **Ship a complete, polished product.** Design is scored, GeoTaste won despite thin Qloo use, and Calacanis says the best demo wins. A back end with a thin UI loses points.
1.  **Use Qloo deeply anyway.** Technological implementation breaks ties, the CTO now judges, and in 2025 Qloo's team screened entries before the panel saw them. Go past one insights call: resolve and confirm, combine insight types such as demographics, heatmaps, taste analysis, and audience comparison, and use `feature.explainability`.
1.  **Engineer for latency.** Cache, pre-warm the demo paths, parallelize, stream progress, bound retries, and keep a daily call budget, because the quota is unknown. Cache enough to keep the demo answering if judging runs late: 2025's results came three weeks after the planned date.
1.  **Write the description as the scorecard.** Use one heading per criterion. Lead with what breaks without Qloo, give a quantified before and after, name the endpoints, and include the kit's request-to-result walkthrough and known limitations. Every claim must work as text, for judges who never open the app and for any AI pre-screen.
1.  **Add a short video and screenshots.** They're optional, but Devpost says judges look at the video first, and judges may score on the description, images, and video alone ([BRIEF](BRIEF.md#submission-checklist)).
1.  **Pitch a company for the bonus.** Calacanis invests in startups, not projects, and in 2026 he's backing OpenClaw agents. Wiring Qloo into an existing agent such as OpenClaw is one of the three allowed entry forms ([BRIEF](BRIEF.md#challenge)), and it may appeal to him.
1.  **Pick a distinct name.** Avoid "Cultur…" and "Taste…" names, the 2025 gallery's repeats, and names already repeated across 2026 repos, such as Encore, Common Ground, and Memory Lane.

## Unverified

- Why each 2025 winner won.
- Hackathon key quotas and rate limits; [kit discussions #1 and #2][kit-d1] are unanswered.
- How the "automated AI-driven analysis" in the rules is used.
- Whether GitHub repos reflect the 2026 submissions; many entrants won't publish until the deadline, and some repos may never be submitted.
- Whether the hackathon API supports the "antitheses" calls that Zesty's code makes ([Zesty][Zesty]).

## See also

- [Brief](BRIEF.md)
- [Qloo LLM Hackathon][llm], its [winners], and its [project gallery][gallery]
- [Qloo hackathon kit][kit]

[llm]: /docs/sources/qloo-hackathon.devpost.com/qloo-llm-hackathon.md
[gallery]: /docs/sources/qloo-hackathon.devpost.com/project-gallery.md
[winners]: /docs/sources/qloo-hackathon.devpost.com/winners.md
[Zesty]: /docs/sources/qloo-hackathon.devpost.com/winners.md#zesty
[judges-2026]: /docs/sources/qloo.devpost.com/qloo-agentic-hackathon.md#judges
[build]: /docs/sources/qloo.devpost.com/qloo-agentic-hackathon.md#what-to-build
[kit]: https://github.com/qloo/qloo-hackathon-kit
[kit-submit]: https://github.com/qloo/qloo-hackathon-kit/blob/0db91b8d9c5aae2160d53596e57ea6c9da251cde/docs/SUBMISSION.md
[kit-safe]: https://github.com/qloo/qloo-hackathon-kit/blob/0db91b8d9c5aae2160d53596e57ea6c9da251cde/docs/SAFE_USE.md
[kit-d1]: https://github.com/qloo/qloo-hackathon-kit/discussions/1
