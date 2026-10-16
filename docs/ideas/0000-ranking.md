# Idea ranking

Ten finalist product ideas for our Qloo Agentic Hackathon entry, ranked on 2026-10-16 after ten rounds of ideation against the judging criteria. It builds on the [brief](/docs/BRIEF.md) and the [context](/docs/CONTEXT.md), and everything here is our reading, not source text. Each finalist has its own doc; file numbers are IDs fixed at this ranking, so a later re-rank changes this table, not the file names.

Contents:

1.  [Ranking](#ranking)
1.  [Recommendation](#recommendation)
1.  [Scoring matrix](#scoring-matrix)
    1.  [Criteria](#criteria)
    1.  [Related criteria](#related-criteria)
1.  [Ideation rounds](#ideation-rounds)
    1.  [Round 1: diverge](#round-1-diverge)
    1.  [Round 2: cluster](#round-2-cluster)
    1.  [Round 3: gates](#round-3-gates)
    1.  [Round 4: field collisions](#round-4-field-collisions)
    1.  [Round 5: live API checks](#round-5-live-api-checks)
    1.  [Round 6: first scoring](#round-6-first-scoring)
    1.  [Round 7: mutate and merge](#round-7-mutate-and-merge)
    1.  [Round 8: judge-panel stress test](#round-8-judge-panel-stress-test)
    1.  [Round 9: build and demo test](#round-9-build-and-demo-test)
    1.  [Round 10: blind review and final ranking](#round-10-blind-review-and-final-ranking)
1.  [Unverified](#unverified)
1.  [See also](#see-also)

## Ranking

Each score is the mean of two judges, out of 20; the criteria columns are out of 5.

| Rank | Product        | For                                    | Tech | Design | Impact | Idea | Score |
| ---- | -------------- | -------------------------------------- | ---- | ------ | ------ | ---- | ----- |
| 1    | [X Meets Y]    | Authors pitching agents and buying ads | 5    | 4.5    | 3.5    | 4.5  | 17.5  |
| 2    | [Seatback]     | Airline in-flight content managers     | 4    | 4      | 3.5    | 5    | 16.5  |
| 3    | [Claim Check]  | Strategists and investors              | 5    | 4      | 3.5    | 3.5  | 16    |
| 4    | [Crossfeed]    | Podcast networks                       | 5    | 3.5    | 4      | 3.5  | 16    |
| 5    | [Floatplan]    | Multi-branch public libraries          | 4    | 4.5    | 3.5    | 3.5  | 15.5  |
| 6    | [Cuesheet]     | Music supervisors                      | 4    | 4      | 3      | 4    | 15    |
| 7    | [Lived-In]     | Set decorators and prop masters        | 4    | 4      | 2      | 3.5  | 13.5  |
| 8    | [Warmer]       | Gift-givers and recipients             | 3.5  | 4      | 2.5    | 3.5  | 13.5  |
| 9    | [Next Beat]    | Local newsletter chains                | 4    | 3.5    | 3      | 2.5  | 13    |
| 10   | [Blind Flight] | Teams shipping taste-dependent agents  | 4.5  | 3      | 3      | 2.5  | 13    |

Claim Check beats Crossfeed on Design, and Lived-In beats Warmer on Technological implementation. Blind Flight ranks last because it fails the agent gate.

[X Meets Y]: 0001-x-meets-y.md
[Seatback]: 0002-seatback.md
[Claim Check]: 0003-claim-check.md
[Crossfeed]: 0004-crossfeed.md
[Floatplan]: 0005-floatplan.md
[Cuesheet]: 0006-cuesheet.md
[Lived-In]: 0007-lived-in.md
[Warmer]: 0008-warmer.md
[Next Beat]: 0009-next-beat.md
[Blind Flight]: 0010-blind-flight.md

## Recommendation

- **Build X Meets Y.** It has the highest mean, both judges ranked it in their top two, its core calls were verified live, and it has the lowest build risk. Its weak spot is Potential impact, so source the comp-title conventions and the number of querying authors, and lead the business case with the ad-target export.
- **The judges split on the runner-up.** The blind reviewer would build Seatback for the cash prizes, as the only idea with no neighbor in either field and a Quality of the idea of 5 from both judges. Its passenger-mix prior and confidence gate must work before it's safe to demo.
- **For the Calacanis bonus, Crossfeed.** Both judges named it, cut to launch promos and demoed on a podcast roster he knows. The rules allow several substantially different entries, each eligible for one prize ([brief](/docs/BRIEF.md#submission-checklist)), so a second entry is an option.

Take the chosen idea into `/grill-with-docs` before building.

## Scoring matrix

### Criteria

The four official criteria, equally weighted, each scored 1 to 5 for a total out of 20. Ties go to Technological implementation, then Design, then Potential impact, then Quality of the idea, as in the [tie-breaking rule][tie].

| Criterion                    | 5 means                                                                                                                                            | 3 means                                                          | 1 means                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------- |
| Technological implementation | Qloo answers the core decision through a chain: resolve, confirm, insights, then scoring with `filter.results.entities`, demographics, or heatmaps | One core insights call plus lookups; Qloo matters but is shallow | Qloo decorates the LLM's answer       |
| Design                       | One end-to-end flow ends in a finished artifact a judge grasps from screenshots, and it can be polished by 2026-10-30                              | A usable flow whose output is a raw list or needs explaining     | A chat wrapper or a back end          |
| Potential impact             | A named buyer with a costly, frequent job, a credible number on the saving, and a demo that does the job                                           | A real audience, but a vague cost or a rare job                  | A novelty                             |
| Quality of the idea          | Non-obvious, no neighbor in either field, beyond Qloo's own pitch, and a Qloo feature encodes a rule of the trade                                  | Sound, but a known pattern or one or two field neighbors         | A saturated theme or Qloo's own pitch |

[tie]: /docs/sources/qloo.devpost.com/official-rules.md#tie-breaking

### Related criteria

Gates eliminate an idea outright:

1. **Agent:** it acts in steps with tools and asks the human at decision points; a dashboard fails.
2. **Qloo load-bearing:** the output changes materially without Qloo, per Devpost's test.
3. **Safe use:** it infers no person's politics, health, or eligibility for housing, employment, credit, or insurance, and sends Qloo no personal data.
4. **Not Qloo's pitch:** it doesn't redo a product Qloo already sells or demos.

Flags don't add points, but they move the anchors above and are reported for every finalist:

- **Field collisions:** neighbors in the 2025 gallery and the 2026 repos.
- **Build risk:** what can ship by 2026-10-30 given 5 to 8 second calls and 504s.
- **Bonus fit:** Calacanis's startup, demo, and OpenClaw tests.
- **Panel fit:** API depth for Diolosa, safety for Seligman, live entertainment for Abrams, commercial use for Boehly and Cedric.
- **Name:** distinct from both fields.

## Ideation rounds

### Round 1: diverge

Four generators each wrote ten seeds through a different lens, without seeing each other's work:

- **Organizational decisions** (Fable 5.1): a named buyer decides something and Qloo output becomes the score.
- **Agent-native** (Sonnet 5.5): what agents lack that Qloo supplies, including OpenClaw skills and agent-to-agent protocols.
- **Lateral and inverted** (Opus 5.5): practitioners who serve other people's taste, Devpost's electrician pattern, and inversions like Zesty.
- **Rules of the trade** (Opus 5.5, the orchestrator): jobs with an industry rule that a Qloo filter can enforce.

All four were told to avoid the crowded niches in [CONTEXT](/docs/CONTEXT.md#the-2026-field), Qloo's own pitch, and the safe-use limits. That gave 40 seeds. The lateral generator had already dropped home staging for fair-housing risk.

### Round 2: cluster

Merging seeds that described the same product left 31 concepts. Convergence counted as a signal, not a vote:

- Comp titles for authors came from three of the four lenses. The orchestrator's screenwriter variant merged into it.
- Set dressing from a character's taste came from three lenses.
- Two lenses each produced library allocation, pitch-deck claim audits, in-flight catalogs, and local-news verticals.
- The two podcast-network seeds stayed apart until [round 7](#round-7-mutate-and-merge), since they do different jobs.

### Round 3: gates

The four gates in [related criteria](#related-criteria) cut 4 concepts, leaving 27:

- **Fitting**, a client intake for designers and tattoo artists, failed the Qloo test: an LLM maps a client's favorites to an aesthetic well enough, as its own generator conceded.
- **Relist**, a resale listing writer, failed the Qloo test: keyword writing is LLM work, and its timing feature needed trending data.
- **Whetstone**, a weekly taste-stretching pick, redid Qloo's cross-category recommendations and the 2025 winner Zesty.
- **Sift**, a Steam backlog and sale picker, is "you may also like" for games.

### Round 4: field collisions

Checking each concept against the 2025 gallery's 343 projects and the 210 distinct descriptions among the 241 Qloo repos created since 2026-09-01 cut 7 more, leaving 20:

- **Homestand**, sports theme nights: two 2026 repos plan minor- and major-league theme nights.
- **Allusion**, references that land with an audience: a 2026 repo scores a script's references against its audience.
- **Fair Game**, trivia pitched to the room: the same repo, plus a classroom-hooks repo.
- **Cold Read**, a simulated reader panel: a 2026 audience simulator and a "focus group in a box".
- **Stand-In**, transcreating references: two 2026 cultural-translation repos.
- **Session Zero**, tabletop campaign tuning: its engine finds a group's shared core, the most crowded 2026 pattern.
- **Rising**, trend scouting: 2025 had at least six trend projects.

### Round 5: live API checks

Live calls to the hackathon API on 2026-10-16, by two generators and the orchestrator, tested what the surviving concepts assumed. No response data is in this repo. The results:

- **Scoring a closed list works best.** `filter.results.entities` spread a five-show podcast roster from 0.70 to 0.92, while open recommendations bunch near the top and carry a popularity prior. Rank beats raw score.
- **Book comps work.** `filter.publication_year.min` and a `filter.popularity.min`/`max` window returned recent mid-list titles. A popularity cap alone returned obscure self-published series entries, so a window is needed.
- **Explainability splits a result across its inputs,** as percentages per input entity. With one input it's trivially 100%.
- **Trending can't carry a product.** `/v2/trending` rejects books, returned no data for June to October 2026, and showed flat ranks over 20 weeks. This cut **Longlead** (theme-park IP momentum) and **Repress** (vinyl reissue momentum), leaving 18.
- **Location signals reshape movie results, and partly track race.** Lagos and Tokyo returned local cinema, but one US city returned mostly films with Black leads. Any location-led idea must say it ranks titles for a place, not for a people.
- **Per-city scoring of a fixed list works.** A six-film offer scored with a location signal put a different film first in each of three cities, though some films came back unscored for some cities.
- **Genre heatmaps share a density base.** Two genres' heatmaps in one city correlated about 0.86, so genre maps need normalizing across genres. The docs' `neighborhood` boundary returns 400.
- **Demographics measure who engages now,** not who recognizes something, relative to the average.
- **Some results stay generic.** Brands didn't localize to London, and a book's TV results were the obvious genre matches.
- **Throughput:** calls take 5 to 8 seconds, and about 5 concurrent calls trip "Rate limit exceeded".

### Round 6: first scoring

All 18 survivors were scored on the matrix. Five were cut, leaving 13: anything under 14, and 14s with a Technological implementation of 3, since that criterion breaks ties first.

- **Audience Case**, grant-application audience evidence for arts groups, scored 12: a prose section with thin Qloo use.
- **Wallspace**, touring-exhibition booking for museums, scored 13: an exhibition isn't an entity, and venue programming is crowded.
- **House Mix**, in-store music for independent shops, scored 13: one call type, and playlist generators were common in 2025.
- **Optioned**, book-to-screen option memos, scored 14: book-to-TV results were genre-obvious, so an LLM gets most of the way.
- **Dead Stock**, donation triage for secondhand media shops, scored 14: price and condition, not taste, drive resale.

### Round 7: mutate and merge

Each survivor was pushed to its strongest form, and two pairs merged into single products, leaving 11:

- **Crossfeed** absorbed **Green Room**: one audience-overlap engine for a podcast network, running both the costly job (promo slots) and the daily one (guest pitches).
- **Claim Check** absorbed **Citation Needed**: one claim-verification engine with two entry points, an AI-written marketing brief and a startup deck.
- **X Meets Y** gained the explainability-split pair builder, cross-media comps, and an ad-target export for self-published authors.
- **Floatplan** gained cross-genre normalization and a circulation prior, both answers to round 5.

### Round 8: judge-panel stress test

Each survivor was read as each judge would read it, and as an AI pre-screen reading only the description:

- **Calacanis** wants a startup and a demo that wows.
- **Diolosa**, Qloo's CTO, wants deep, correct API use.
- **Seligman**, of OpenAI's safety committee, wants safe data handling.
- **Abrams**, of Live Nation, knows live entertainment.
- **Boehly** and **Cedric**, Qloo investors, want commercial use.

**Format Flip**, radio format white space, was cut, leaving 10. Its buyer is small and declining, a flip is rare, and format-by-location invites the ethnic proxy found in round 5. No judge's interest offsets that.

### Round 9: build and demo test

Each finalist was sized against 14 days, the existing Hono-on-Cloudflare-Workers scaffold in `apps/`, 5 to 8 second calls, and 5 concurrent calls. Each got a demo storyboard and a name check. All ten names are free in both fields. No idea was cut, but Warmer lost a Design point: a two-party protocol plus an OpenClaw skill is hard to polish by 2026-10-30.

### Round 10: blind review and final ranking

A second model (Fable 5.1) scored the ten finalists blind, in random order, from the same rubric, the brief, the context, and a neutral description of each idea. The orchestrator's scores were recorded before the review ran. The final score is the mean of the two, with ties broken in the official order. The results:

- **The judges agreed on shape.** No criterion differed by more than one point; the reviewer graded harder, averaging 14.1 against the orchestrator's 15.8.
- **Blind Flight fails the agent gate.** The reviewer read it as a CI harness with no human decision point, and the orchestrator agrees, so it ranks last whatever its score.
- **Gate risks were fixed in the idea docs.** Seatback, Floatplan, and Next Beat gained visible decision points. Crossfeed now resolves guests only through their public works, so no third-party names reach Qloo. Claim Check's verdicts describe engagement, not customers. Warmer says "sealed" only of the giver, since Qloo still sees the anchors. Seatback gained a passenger-mix prior and a confidence gate against the location proxy.
- **The likely AI pre-screen favorites** from descriptions alone are Claim Check, Crossfeed, and X Meets Y. Each names its endpoints, quotes a number, and answers "what breaks without Qloo".

## Unverified

- **Market numbers:** sizes, prices, and costs in the idea docs are the generators' order-of-magnitude estimates, without sources. They cover comp-title conventions and the number of querying authors, podcast CPMs, in-flight content spend, library collection spend, and sync fees.
- **Coverage:** whether Qloo resolves 2025 and 2026 books, small-press titles, small podcasts, and pitched artists.
- **Heatmaps:** whether genre heatmaps, once normalized, carry preference rather than signal density.
- **Pre-screen:** whether Devpost's automated analysis rewards what the reviewer predicted; [CONTEXT](/docs/CONTEXT.md#devpost-guidance) found no write-up of how it works.
- **Live checks:** a few calls per question on 2026-10-16; results may shift as Qloo's data changes, and under load.
- **Judges:** both scorers are models from one vendor, and neither is a hackathon judge.

## See also

- [Brief](/docs/BRIEF.md) and [context](/docs/CONTEXT.md)
- [Official rules: judges and criteria](/docs/sources/qloo.devpost.com/official-rules.md#6-judges-and-criteria)
- [2025 project gallery](/docs/sources/qloo-hackathon.devpost.com/project-gallery.md)
- [Qloo repositories on GitHub](https://github.com/search?q=qloo&type=repositories&s=updated), the 2026 field
