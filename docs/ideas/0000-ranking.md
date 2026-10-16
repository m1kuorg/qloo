# Idea ranking

Fifteen finalist product ideas for our Qloo Agentic Hackathon entry, from two ideations of ten rounds each, ranked on 2026-10-17 against the judging criteria and Pull, our measure of whether people will actually use a product. It builds on the [brief](/docs/BRIEF.md) and the [context](/docs/CONTEXT.md), and everything here is our reading, not source text. Each finalist has its own doc; file numbers are IDs fixed when the finalist was chosen, so a re-rank changes this table, not the file names.

Contents:

1.  [Ranking](#ranking)
1.  [Recommendation](#recommendation)
1.  [Scoring matrix](#scoring-matrix)
    1.  [Criteria](#criteria)
    1.  [Pull](#pull)
    1.  [Related criteria](#related-criteria)
1.  [First ideation](#first-ideation)
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
1.  [Second ideation](#second-ideation)
    1.  [Round 11: X research](#round-11-x-research)
    1.  [Round 12: diverge](#round-12-diverge)
    1.  [Round 13: cluster](#round-13-cluster)
    1.  [Round 14: gates](#round-14-gates)
    1.  [Round 15: field collisions](#round-15-field-collisions)
    1.  [Round 16: live API checks](#round-16-live-api-checks)
    1.  [Round 17: first scoring](#round-17-first-scoring)
    1.  [Round 18: mutate and merge](#round-18-mutate-and-merge)
    1.  [Round 19: judge-panel and Pull stress test](#round-19-judge-panel-and-pull-stress-test)
    1.  [Round 20: blind review and final ranking](#round-20-blind-review-and-final-ranking)
1.  [Unverified](#unverified)
1.  [See also](#see-also)

## Ranking

Each score is the mean of two judges, the orchestrator and a blind reviewer; the criteria columns are out of 5. Official is the four judging criteria, out of 20, and Total adds Pull, out of 25.

| Rank | Product        | For                                    | Tech | Design | Impact | Idea | Pull | Official | Total |
| ---- | -------------- | -------------------------------------- | ---- | ------ | ------ | ---- | ---- | -------- | ----- |
| 1    | [Dance Card]   | Wedding and event DJs                  | 5    | 4      | 3.5    | 4.5  | 4    | 17       | 21    |
| 2    | [Crossfeed]    | Podcast networks                       | 4.5  | 4      | 4      | 4    | 3.5  | 16.5     | 20    |
| 3    | [Claim Check]  | Strategists and investors              | 4.5  | 4      | 4      | 4    | 3.5  | 16.5     | 20    |
| 4    | [Sieve]        | Anyone handed a pile of recs           | 4    | 4.5    | 3      | 4    | 4.5  | 15.5     | 20    |
| 5    | [X Meets Y]    | Authors pitching agents and buying ads | 4.5  | 4.5    | 3.5    | 4.5  | 2.5  | 17       | 19.5  |
| 6    | [Hold Slip]    | Independent record, game, comic shops  | 4    | 4      | 3      | 4    | 4    | 15       | 19    |
| 7    | [On-Ramp]      | Fans converting a partner or a friend  | 4.5  | 4      | 2      | 4    | 3.5  | 14.5     | 18    |
| 8    | [Floatplan]    | Multi-branch public libraries          | 4    | 4      | 3.5    | 4    | 2.5  | 15.5     | 18    |
| 9    | [Seatback]     | Airline in-flight content managers     | 4    | 3.5    | 3      | 4.5  | 3    | 15       | 18    |
| 10   | [Cuesheet]     | Music supervisors                      | 4    | 4      | 3      | 3.5  | 3    | 14.5     | 17.5  |
| 11   | [Vouch]        | The friend everyone asks, and curators | 3    | 4      | 2.5    | 3.5  | 4    | 13       | 17    |
| 12   | [Warmer]       | Gift-givers and recipients             | 3.5  | 4      | 2.5    | 4    | 2    | 14       | 16    |
| 13   | [Next Beat]    | Local newsletter chains                | 3.5  | 3.5    | 3      | 3    | 2.5  | 13       | 15.5  |
| 14   | [Lived-In]     | Set decorators and prop masters        | 3.5  | 3.5    | 2      | 4    | 2    | 13       | 15    |
| 15   | [Blind Flight] | Teams shipping taste-dependent agents  | 4    | 2.5    | 2.5    | 3    | 2    | 12       | 14    |

Rows are ordered by Total. Ties go to Technological implementation, then Design, Potential impact, Quality of the idea, and Pull:

- Crossfeed and Claim Check tie on every criterion, and the cross-vendor check in [round 20](#round-20-blind-review-and-final-ranking) breaks the tie for Crossfeed.
- Sieve ties them at 20 but loses on Technological implementation, 4 to 4.5.
- On-Ramp, Floatplan, and Seatback tie at 18. On-Ramp leads on Technological implementation, 4.5 to 4, and Floatplan beats Seatback on Design, 4 to 3.5.
- Blind Flight ranks last because it fails the agent gate.

[Dance Card]: 0011-dance-card.md
[Crossfeed]: 0004-crossfeed.md
[Claim Check]: 0003-claim-check.md
[Sieve]: 0012-sieve.md
[X Meets Y]: 0001-x-meets-y.md
[Hold Slip]: 0013-hold-slip.md
[On-Ramp]: 0014-on-ramp.md
[Floatplan]: 0005-floatplan.md
[Seatback]: 0002-seatback.md
[Cuesheet]: 0006-cuesheet.md
[Vouch]: 0015-vouch.md
[Warmer]: 0008-warmer.md
[Next Beat]: 0009-next-beat.md
[Lived-In]: 0007-lived-in.md
[Blind Flight]: 0010-blind-flight.md

## Recommendation

- **Build Dance Card.** It ranks first on the total, ties X Meets Y on the official score and wins that tie on Technological implementation. Both judges gave it a 5 for Technological implementation, and it's the blind reviewer's pick for the cash prizes. Of the five new finalists, it pairs a paying user and weekly use with the deepest Qloo chain. No DJ tool exists in either field, and it fits the CTO and the Live Nation judge. Its weak spot is Potential impact. Source the number of working wedding DJs and what they pay for planning tools. Cut scope to a CSV crate import, the guest form, the ranked crate, the hold-back list, and the gig sheet; build the mid-gig lookup last.
- **For "people will actually use it", Sieve.** It has the highest Pull of the fifteen, and the cross-vendor check ranked it first. The blind reviewer marked down its Quality of the idea because it shares an engine with Vouch, so fold Vouch in as Sieve's reply mode rather than entering both. Sieve is consumer-facing, substantially different from Dance Card, and close to what Calacanis says he wants: an agent normal people use by pasting or snapping a photo, shared as a bot link.
- **The judges split on the Calacanis bonus.** The blind reviewer named Crossfeed, since Calacanis runs a podcast network, and the cross-vendor check named Dance Card. The rules allow several substantially different entries, each eligible for one prize ([brief](/docs/BRIEF.md#submission-checklist)), so Dance Card plus Sieve covers both the cash prizes and a consumer pitch for the bonus.

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

### Pull

Pull asks whether people will actually use the product, beyond whether judges will score it. It isn't an official criterion. The second ideation added it with equal weight for a total out of 25, and scored all fifteen finalists on it:

| Score | Pull means                                                                                                         |
| ----- | ------------------------------------------------------------------------------------------------------------------ |
| 5     | A named person hits the trigger weekly or more, opens it unprompted, and the output travels (shared, sent, posted) |
| 3     | A real need, but monthly or per project, or it needs a nudge to come back                                          |
| 1     | A once-a-year novelty or a demo toy                                                                                |

Pull overlaps Potential impact, which also rewards a frequent job. They part where the user and the buyer differ: a consumer habit with no buyer scores high on Pull and low on impact.

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

## First ideation

The first ideation ran on 2026-10-16 and chose finalists 1 to 10. Its scores were superseded in [round 20](#round-20-blind-review-and-final-ranking), which re-scored every finalist with Pull added.

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

- **The judges agreed on shape.** No criterion differed by more than one point; the reviewer graded harder, averaging 14.1 out of 20 against the orchestrator's 15.8.
- **Blind Flight fails the agent gate.** The reviewer read it as a CI harness with no human decision point, and the orchestrator agrees, so it ranks last whatever its score.
- **Gate risks were fixed in the idea docs.** Seatback, Floatplan, and Next Beat gained visible decision points. Crossfeed now resolves guests only through their public works, so no third-party names reach Qloo. Claim Check's verdicts describe engagement, not customers. Warmer says "sealed" only of the giver, since Qloo still sees the anchors. Seatback gained a passenger-mix prior and a confidence gate against the location proxy.
- **The likely AI pre-screen favorites** from descriptions alone are Claim Check, Crossfeed, and X Meets Y. Each names its endpoints, quotes a number, and answers "what breaks without Qloo".

## Second ideation

The second ideation ran on 2026-10-17 to push past the first. Most of the first finalists are tools for niche professionals who need them once per project, so this round also looked for something people will actually use. It started from what people say on X, added [Pull](#pull) to the matrix, and chose finalists 11 to 15.

### Round 11: X research

Three research agents searched x.com with the `bird` CLI under a logged-in session: about 160 searches with like-count floors, and about 37 reads of posts, reply threads, and timelines. X rate-limited two agents for about 13 minutes and one for about 7. No raw posts are in this repo; the posts below and in the idea docs are links. The agents found:

- **Feeds loop:** "it shows you the same five things then devolves into irrelevant content", 8,130 likes ([Techno_Coloured][x-loop]).
- **Rec threads are piles nobody ranks:** an ask for comics that "aren't Superheroes" drew 8,488 likes and mostly image replies ([GothTransFem][x-thread]).
- **People want overlap, not clones:** "different music taste but a compatible philosophy", 15,946 likes ([polypocketknife][x-overlap]).
- **Taste rituals repeat weekly and monthly:** #LetterboxdFriday runs every week ([letterboxd][x-friday]), and monthly "media wrapped" posts draw template requests ([gabbieorleaveit][x-wrapped], [thefateofrey][x-template]).
- **Taste games come back:** "mention a movie and we guess your age" is reposted every few months ([Ugochukwu96_][x-age]).
- **Practitioners serve other people's taste:** a post about Taylor Swift's do-not-play list drew 51,657 likes ([Tom_Smyth_][x-dnp]), and a sommelier's customers trust a chatbot over her ([glyphclutter][x-somm]).
- **Agents need taste but must leave the personal part to people:** the most-liked agent wish was one that "remembers there's a birthday party Saturday" ([SoniaBaschez][x-notice]), a Muse ad drew "I always wanted to be a shittier friend" ([coopercooperco][x-shittier]), and restaurant recs "have a 50% hit rate" ([andruyeung][x-hitrate]).
- **Calacanis wants agents normal people can use:** he called Grok Bot "the ultimate agent onboarding tool for non-technical people" ([Jason][x-normies]) and called AI relationships "abhorrent" ([Jason][x-abhorrent]).
- **Few entrants post on X:** only three 2026 entries turned up: [CulturePilot][x-culturepilot], [Together][x-together], and [Rekindle][x-rekindle].

[x-loop]: https://x.com/Techno_Coloured/status/2106389999554089105
[x-thread]: https://x.com/GothTransFem/status/2110538392249287058
[x-overlap]: https://x.com/polypocketknife/status/2050109280066683309
[x-friday]: https://x.com/letterboxd/status/2108546342519783882
[x-wrapped]: https://x.com/gabbieorleaveit/status/2092154149777572334
[x-template]: https://x.com/thefateofrey/status/2092417068557574292
[x-age]: https://x.com/Ugochukwu96_/status/2022320535690953102
[x-dnp]: https://x.com/Tom_Smyth_/status/2072051265744294018
[x-somm]: https://x.com/glyphclutter/status/2098763714216570895
[x-notice]: https://x.com/SoniaBaschez/status/2107267198091997211
[x-shittier]: https://x.com/coopercooperco/status/2105062878701310345
[x-hitrate]: https://x.com/andruyeung/status/2103129968247017683
[x-normies]: https://x.com/Jason/status/2092038690595864844
[x-abhorrent]: https://x.com/Jason/status/2110938884066685376
[x-culturepilot]: https://x.com/JimmyOgb12/status/2109880083548610839
[x-together]: https://x.com/noboru59631/status/2109264388079464695
[x-rekindle]: https://x.com/edycutjong/status/2108728699898224759

### Round 12: diverge

Five generators each wrote ten seeds from the X digests through a different lens:

- **Demand-mined** (Fable 5.1): each seed answers a need people voiced on X.
- **Habit loops** (Sonnet 5.5): rituals people already repeat weekly or more.
- **Agent-native** (Opus 5.5): Qloo inside the personal agents people already run.
- **Taste servers** (Sonnet 5.5): practitioners who serve other people's taste at the counter or on the gig.
- **Odd mechanics and inversions** (Fable 5.1): products only an under-used Qloo feature enables.

All five were told the 31 concepts of the first ideation were already covered, the crowded niches, and the gates. Each seed named its trigger and how often it recurs, its X evidence, its decision points, its Qloo calls, what breaks without Qloo, and its nearest neighbor. That gave 50 seeds.

### Round 13: cluster

Merging seeds that described the same product left 23 concepts. Four ideas came from four of the five lenses:

- Ranking a pile of recommendations other people gave you: Sieve twice, Combed, and Winnow, with Circled's photos.
- Scoring a DJ's crate against the room: Dance Card, Crate Read, Floorfill, and Crate Check, absorbing modes for fitness classes, parties, and venues.
- A path to win someone over to a favorite: On-Ramp twice, Convert, and Gateway.
- Taste-age and top-four cards: Tell twice, Odd One Out, Fourth, and Friday Four.

Vouch came from three lenses and absorbed Rec Desk. Shows-this-month triage came from three lenses as Doors.

### Round 14: gates

The gates cut 5 concepts, leaving 18:

- **Off Loop**, an anti-feed, is "you may also like" with exclusions, Qloo's own pitch.
- **Spec**, answering mood-spec requests, fails the Qloo test: an LLM maps moods to titles well, and 2025 had several mood recommenders.
- **Changelog**, a reviewable TASTE.md diff for agents, doesn't need Qloo.
- **Tell**, a taste-age card, has no agent loop, and it reads a person's age from their taste.
- **Rack Pull**, ranking a stylist's labels, fails the Qloo test: raw brand scores followed popularity for two very different profiles, as Fitting did in [round 3](#round-3-gates).

### Round 15: field collisions

Checking against the 241 Qloo repos created since 2026-09-01, the 2025 gallery, and the X field cut 5 more, leaving 13:

- **Venn**, two people's shared taste: at least eight common-ground and taste-overlap repos.
- **Regulars**, third places for a newcomer: nine relocation repos.
- **Turn Order**, fair book-club picks: chapterweave, crowd-pleaser, and common-table.
- **Next Stream**, a streamer's game poll: tastecontent plans short-form video from audience taste.
- **Submission Desk**, ranking playlist submissions: the first ideation's Green Room with a different inbox.

No 2026 repo serves DJs, rec threads, record shops, or conversion paths, and none of the five eventual finalists' names appears in either field.

### Round 16: live API checks

About 135 calls by two generators and about 45 by the orchestrator, on 2026-10-17, tested what the survivors assumed. No response data is in this repo. The results:

- **Closed lists scale:** 100 candidates scored in two pages of 50, in 4.2 and 2.4 seconds, with continuous affinities across the page break.
- **Anchors cross categories:** Mamma Mia alone put ABBA first in a DJ crate and Succession alone put Frank Sinatra last; an artist, a game, and Normal People reordered a pool of films.
- **The age signal reorders a closed list but doesn't translate an open one:** ABBA rose from 6th to 1st of seven for 45 to 54. Frank Sinatra for under-25s still returned Peggy Lee and Mel Tormé, and Casablanca's theme tags gave scattered modern films. This cut **Dubbed**, a translator of favorites between generations, leaving 12.
- **Weighted signals interpolate:** a film pool slid smoothly from heist films to Ghibli as the weights moved, but a heist film by Miyazaki, the bridge a person would pick, never ranked above 11th of 17. Qloo scores co-engagement, not content.
- **Explainability is nearly flat:** with three anchors, every candidate split about 40, 32, and 28 percent, so per-pick reasons need one call per anchor.
- **Weighted anchors need `{"id": ..., "weight": ...}`;** the documented `entity` key returns 400.
- **`urn:tag` needs `filter.parents.types`;** without it, the entity signal is silently ignored and place tags come back.
- **`theme:qloo` tags cross categories:** Phoebe Bridgers and Past Lives both returned Grief and Loneliness.
- **Nulls are common:** a book against films can score nothing, and release-week titles resolve but mostly score null.
- **Brands follow popularity:** two unlike profiles gave the same top fashion labels, and only lift over a baseline separated them. Wine brands and most board games don't resolve.
- **Resolution varies:** films 4 of 4 and games 8 of 8 resolved cleanly, comics 3 of 6 resolved to the wrong entity, and acts as small as 0.21 popularity resolved.
- **Compare is quick:** 1.3 to 1.8 seconds, with shared tags and each side's own.

### Round 17: first scoring

The orchestrator scored all 12 on the five criteria. Cutting anything under 15 on the official criteria, or with a Pull of 2, left 7:

- **Doors**, shows this month for a fan, scored 14: local discovery is saturated, and listings need a ticketing API key we don't have.
- **Bins**, a record-shop counter ranking stock for a customer, scored 14 as a standalone; [round 18](#round-18-mutate-and-merge) folds it into Hold Slip.
- **Ledger**, a monthly cross-media wrap, scored 14: tag noise is high and nobody pays.
- **First Piece**, ranking a music teacher's shelf for a student, scored 14: its own generator called it the weakest Qloo case.
- **Pickrate**, measuring how often other agents pick an independent shop, had a Pull of 2, and Qloo only defines its personas.

### Round 18: mutate and merge

Each survivor was pushed to its strongest form, and two merges left 5:

- **Sieve** absorbed **Told You**, friends' texted recs, and **Clash**, festival lineups. It keeps one pile from threads, chats, shelves, and lineups and ranks it when asked. The photo card it gained raised its Design from 4 to 5.
- **Hold Slip** gained Bins' counter mode.
- **Dance Card** gained age-band blocks and the do-not-play look-alike lint.
- **On-Ramp** gained the verified weight schedule, with an LLM proposing bridges and Qloo placing them.
- **Vouch** gained a curator link for critics, newsletters, and booksellers.

### Round 19: judge-panel and Pull stress test

Each finalist was read as each judge would read it, checked against its X evidence for whether people would come back, and sized against 13 days and the existing scaffold. No idea was cut:

- **Calacanis:** Sieve is the new finalist he could share as a bot link and normal people could use; Dance Card and Hold Slip are vertical tools.
- **Diolosa:** Dance Card has the deepest chain: closed lists, cross-category anchors, demographics, compare, and tags.
- **Seligman:** Hold Slip holds customers' names and favorites, so consent and deletion became product features.
- **Abrams:** Dance Card, and Sieve's lineup entry point.
- **Pull:** On-Ramp ends after four weeks, and Hold Slip needs weeks to seed its regulars' favorites.
- **Build:** Sieve's risk is thread access, since X's API is paid, so pasted text, screenshots, Bluesky, and Reddit come first.
- **Scores:** Vouch's Technological implementation fell from 4 to 3, since each ask is one scoring call.

### Round 20: blind review and final ranking

All fifteen finalists were re-scored in one blind sitting, so old and new share one calibration:

- **Packet:** each finalist's doc with its scores, rank, and links to other finalists stripped, labeled A to O in seeded random order.
- **Reviewer:** Fable 5.1, the first ranking's blind reviewer, scored all five criteria and the gates from the rubric, the brief, the context, and the packet. Its scores replace the first review's.
- **Orchestrator:** its scores were recorded before the review. The first ten keep the first ranking's official scores, with Pull added.
- **Cross-vendor check:** OpenAI and xAI keys had no credit, the OpenRouter key had a $0 limit, and Gemini's Pro and Flash models refused for quota or demand. Gemini 3.5 Flash-Lite scored the packet, but it's a lightweight model that scored nearly everything 4 or 5, so it only breaks the one full tie.

The results:

- **The judges agreed on shape.** No criterion differed by more than two points, and only three differed by two: Sieve's Quality of the idea, Floatplan's Design, and Blind Flight's Technological implementation. The reviewer graded harder, averaging 16.9 out of 25 against the orchestrator's 18.9.
- **New finalists took 1st, 4th, 6th, 7th, and 11th.** Pull moved X Meets Y from 1st to 5th, since authors need comps about once per book.
- **One engine runs through the field.** The reviewer noted that 13 of 15 rely on closed-list scoring, so what sets each apart is the trade rule it encodes and the artifact it ends in. Sieve and Vouch are one engine with two front doors, so enter at most one.
- **Location ideas are fragile.** Next Beat, Seatback, and Floatplan depend on location signals the brief shows behave inconsistently.
- **Blind Flight fails the agent gate** again, for all three scorers.
- **Picks:** the reviewer's pick for the cash prizes is Dance Card, and for the bonus, Crossfeed. The cross-vendor check picked Sieve for the cash prizes and Dance Card for the bonus, and put Sieve, Dance Card, Hold Slip, and Crossfeed in its top four.

## Unverified

- **Market numbers:** sizes, prices, and costs in the idea docs are the generators' order-of-magnitude estimates, without sources. They cover comp-title conventions and querying authors, podcast CPMs, in-flight content spend, library collection spend, sync fees, working wedding DJs, and independent shops.
- **Pull:** it's our own criterion, scored by models from the docs and X posts, not from usage. X like counts are a snapshot of 2026-10-16 and 2026-10-17 and favor viral posts.
- **Coverage:** whether Qloo resolves 2025 and 2026 books, small-press and non-Western titles, comics, small podcasts, and pitched artists.
- **Heatmaps:** whether genre heatmaps, once normalized, carry preference rather than signal density.
- **Thread access:** X's API pricing for reading replies, which Sieve's thread entry point needs.
- **Pre-screen:** whether Devpost's automated analysis rewards what the reviewer predicted; [CONTEXT](/docs/CONTEXT.md#devpost-guidance) found no write-up of how it works.
- **Live checks:** a few calls per question on 2026-10-16 and 2026-10-17; results may shift as Qloo's data changes, and under load.
- **Judges:** both scorers are models from one vendor, and the only cross-vendor check came from a lightweight model; none is a hackathon judge.

## See also

- [Brief](/docs/BRIEF.md) and [context](/docs/CONTEXT.md)
- [Official rules: judges and criteria](/docs/sources/qloo.devpost.com/official-rules.md#6-judges-and-criteria)
- [2025 project gallery](/docs/sources/qloo-hackathon.devpost.com/project-gallery.md)
- [Qloo repositories on GitHub](https://github.com/search?q=qloo&type=repositories&s=updated), the 2026 field
