# Brief

What the Qloo Agentic Hackathon asks for, how entries are judged, and what the Qloo API gives an agent. It is distilled from the [`docs/sources/`](/docs/sources/) crawls of 2026-10-16. Submissions close **2026-10-30 at 11:45 pm ET**.

Each claim links to its source, and the source wins wherever this brief disagrees with it, except for facts marked as a live check. Those come from calls to the hackathon API, which win over the docs. Where Devpost pages disagree with each other, the [official rules][rules-11] prevail.

Contents:

1.  [Challenge](#challenge)
1.  [Submission checklist](#submission-checklist)
1.  [Judging and prizes](#judging-and-prizes)
1.  [Dates](#dates)
1.  [Qloo in brief](#qloo-in-brief)
1.  [Implications for our entry](#implications-for-our-entry)
1.  [API essentials](#api-essentials)
    1.  [API access](#api-access)
    1.  [Request flow](#request-flow)
    1.  [Insight types](#insight-types)
    1.  [Reading results](#reading-results)
    1.  [Gotchas beyond the developer guide](#gotchas-beyond-the-developer-guide)
    1.  [Live API checks](#live-api-checks)
1.  [See also](#see-also)

## Challenge

"Agents, but with taste." Build a working software application that integrates the Qloo API. It must do one of three things: work as an agentic tool, be built with an agent framework, or wire Qloo into an existing agent ([project requirements][rules-4]).

Qloo must be the differentiator. The agent should beat LLM-only approaches because it knows what people like. In Devpost's words, "If your submission would work the same without Qloo, you're building the wrong thing" ([what to build][build]). Devpost's lateral examples are lighting styles for an electrician's customers, dining for seniors with health constraints, and rare-disease journeys.

Eligibility essentials ([rules §3][rules-3], [project requirements][rules-4]):

- Individuals at the age of majority, teams, and organizations may enter. A team appoints one Representative.
- No one may enter from a place where US or local law bars it, including Brazil, Quebec, Russia, Crimea, Cuba, Iran, North Korea, and other OFAC-sanctioned places.
- A project that existed before the submission period must have been significantly updated during it, and the entry should explain how. The crawled sentence is garbled ("must have Qloo 4after the start").
- Projects developed with funding, a contract, or a commercial license from Qloo are excluded. Qloo may also disqualify any project that would create a conflict of interest ([financial support][rules-support]).

[build]: /docs/sources/qloo.devpost.com/qloo-agentic-hackathon.md#what-to-build
[rules-3]: /docs/sources/qloo.devpost.com/official-rules.md#3-eligibility
[rules-support]: /docs/sources/qloo.devpost.com/official-rules.md#financial-or-preferential-support

## Submission checklist

Every entry needs all of these ([what to submit][submit], [submission requirements][rules-submit]):

1.  **Live demo link.** The demo must be hosted and published externally, such as a website, web app, hosted APK, or TestFlight build. Local-only demos don't qualify. Devpost also rules out demos that "rely on private access," but the rules accept a private site if the testing instructions include login credentials, and the rules govern. Access must stay free and unrestricted until judging ends ([testing][rules-testing]).
2.  **Public repository** on GitHub, GitLab, or Bitbucket. It must hold all the source, assets, and instructions needed to run the project.
3.  **Open-source license file**, detected and shown in the repository's About section.
4.  **Text description**, in English or with an English translation ([language requirements][rules-language]). It covers what the agent does, its key features, and what makes it "Qloo-powered."

A demo video isn't required. Judges may still score on the description, images, and video alone, without testing the app ([testing][rules-testing]).

An entrant may submit several entries if each is substantially different ([multiple submissions][rules-multiple]). Each project can win only one prize ([rules §8][rules-8]).

[submit]: /docs/sources/qloo.devpost.com/qloo-agentic-hackathon.md#what-to-submit
[rules-submit]: /docs/sources/qloo.devpost.com/official-rules.md#submission-requirements
[rules-language]: /docs/sources/qloo.devpost.com/official-rules.md#language-requirements
[rules-multiple]: /docs/sources/qloo.devpost.com/official-rules.md#multiple-submissions

## Judging and prizes

Judging has two stages ([rules §6][rules-6]):

1.  **Pass/fail:** the project reasonably fits the theme and reasonably applies the Qloo API.
2.  **Scoring:** four equally weighted criteria. Ties go to the higher score on the first criterion, then the next ([tie breaking][rules-tie]).
    1.  **Technological implementation:** how thoroughly and skillfully the project uses Qloo, in working, non-trivial code.
    1.  **Design:** a complete, coherent product experience, not a technical proof of concept.
    1.  **Potential impact:** a credible, specific case for a real problem and a real audience, which the demo actually addresses.
    1.  **Quality of the idea:** a creative, non-obvious use of Qloo that shows genuine understanding of the problem space.

Judging may use expert panels, peer review, or automated AI-driven analysis.

The [judges][judges] are:

- Jason Calacanis
- Mike Diolosa, Qloo CTO
- Nicole Seligman, OpenAI board
- Todd Boehly, Eldridge Industries
- Cedric the Entertainer, an early Qloo backer per a 2013 article listed in [press]
- Michael Abrams, Live Nation Entertainment

Cash prizes are $15,000, $6,000, and $4,000 ([rules §8][rules-8]). In a [bonus challenge][bonus], Jason Calacanis will personally invest $25,000 in his favorite entry.

[rules-tie]: /docs/sources/qloo.devpost.com/official-rules.md#tie-breaking
[judges]: /docs/sources/qloo.devpost.com/qloo-agentic-hackathon.md#judges
[press]: /docs/sources/qloo.com/press.md
[bonus]: /docs/sources/qloo.devpost.com/qloo-agentic-hackathon.md#bonus-challenge

## Dates

All times are Eastern, per [rules §1][rules-1]:

| Period            | Begins              | Ends                      |
| ----------------- | ------------------- | ------------------------- |
| Submissions       | 2026-09-30 9:00 am  | 2026-10-30 11:45 pm       |
| Judging           | 2026-11-02 12:00 pm | 2026-11-16 11:45 pm       |
| Winners announced |                     | Around 2026-11-23 3:00 pm |

Devpost's [schedule](/docs/sources/qloo.devpost.com/schedule.md) says submissions open at 9:30 am, but the rules govern. Drafts can be saved until the deadline. After it, the submission can't change, except for edits Qloo and Devpost allow, such as removing infringing material ([rules §5][rules-5]).

[rules-1]: /docs/sources/qloo.devpost.com/official-rules.md#1-dates-and-timing
[rules-5]: /docs/sources/qloo.devpost.com/official-rules.md#5-submission-modifications

## Qloo in brief

Qloo sells "cultural AI": a cultural graph of entities plus "Taste AI," which predicts what someone will like in one domain from their tastes in others ([about Qloo][about], [overview][qloo-overview]). It claims zero personally identifiable information (PII). It also needs no user data to answer, so an agent works from a cold start ([data foundation][data], [FAQs][faqs]).

Sources disagree on graph size: 250M+ entities ([Devpost][about-challenge]), half a billion+ ([data foundation][data]), and 600M+ ([qloo.com][qloo-overview]). Cite the source next to any figure used in a pitch.

Use Qloo's own [glossary] words in our UI, code, and description:

- **Entity:** a notable person, place, thing, or interest; a node in the graph.
- **Tag:** an entity that labels other entities to make them easier to search and filter.
- **Signal:** a weighted interaction with an entity, positive (like) or negative (dislike).
- **Filter:** narrows results by attributes, inclusively by default.
- **Affinity:** how closely a result matches the input, from 0 to 1.
- **Audience:** a group defined by aggregated positive signals ([audiences]).

[about]: /docs/sources/qloo.com/about-qloo.md
[qloo-overview]: /docs/sources/qloo.com/qloo-overview.md
[data]: /docs/sources/docs.qloo.com/data-foundation.md
[about-challenge]: /docs/sources/qloo.devpost.com/qloo-agentic-hackathon.md#about-the-challenge
[glossary]: /docs/sources/docs.qloo.com/glossary.md
[audiences]: /docs/sources/docs.qloo.com/audiences.md

## Implications for our entry

This section is our reading of the sources, not source text:

- **Make Qloo load-bearing and visible.** The pass/fail stage checks that the project applies the API, and the first tie-breaker scores how it uses Qloo. If the agent's answers would be the same without Qloo, it fails Devpost's own test.
- **Go past Qloo's own pitch.** An entry that only redoes something Qloo already sells or demos will struggle on quality of the idea. Qloo already offers:
  - "you may also like" recommendations ([solutions][solutions]) and cross-category picks from a single interest ([capabilities])
  - an illustrative agent flow that books dinner from a taste profile ([capabilities])
  - hotel and travel personalization ([Michelin][michelin])
  - interest-based dating profiles ([Match Group][match])
  - picking merchandise partners ([Netflix][netflix])
  - out-of-home ad targeting ([JCDecaux][jcdecaux])
  - persuading a retailer to lease a site ([Clarion][clarion])
- **Check the last hackathon's entries.** The [Qloo LLM Hackathon][events] of Jul–Aug 2025 is prior art, but its project gallery isn't in the sources.
- **Write for a judge who never opens the app.** The description and images must make the case on their own.
- **Keep the demo working through 2026-11-16.** Hackathon keys stay active through the judging period. They are deactivated after the hackathon closes ([quotas][guide-quotas]).
- **Keep Qloo data and the key out of the public repo.** Private server-side caching is allowed with no time limit. Committing response data would publish it outside the key's terms ([caching][guide-cache]).
- **Assume Qloo learns from our requests.** Qloo reserves the right to train on the anonymized entity arrays sent to its recommendation route ([terms]).

[solutions]: /docs/sources/docs.qloo.com/solutions-overview.md
[capabilities]: /docs/sources/qloo.com/capabilities.md
[michelin]: /docs/sources/qloo.com/michelin-personalized-travel.md
[match]: /docs/sources/qloo.com/match-group-cultural-ai.md
[netflix]: /docs/sources/qloo.com/netflix-merchandising.md
[jcdecaux]: /docs/sources/qloo.com/jcdecaux-out-of-home-targeting.md
[clarion]: /docs/sources/qloo.com/clarion-magnificent-mile.md
[events]: /docs/sources/qloo.com/events.md
[guide-cache]: /docs/sources/docs.qloo.com/qloo-agentic-hackathon-developer-guide.md#can-i-cache-qloo-api-responses-in-my-app
[terms]: /docs/sources/docs.qloo.com/terms-and-policies.md

## API essentials

The [developer guide][guide] is the hackathon's own API reference, covering keys, base URL, entity types, common errors, and FAQs. Read it before the general docs, whose examples target other environments. This section covers what a builder needs first and what the guide leaves out.

### API access

- **Key:** request one with the [developer guide's form][guide-key]. The [Devpost resources][resources] page links a different form, at a Google Forms `/edit` URL. The idea field may be left blank. Keys are issued by hand, in batches, from hackathon@qloo.com, so check spam. Early-October forum posts report waits of several days ([forum]).
- **Base URL:** `https://hackathon.api.qloo.com`. Only the developer guide uses it. Other docs examples call production or staging URLs, where hackathon keys return 401.
- **Auth:** send the key in the `X-Api-Key` header.
- **Quotas:** rate and monthly limits suit typical projects. Qloo raises them per user on request in Discord `#api-help` ([quotas][guide-quotas]).
- **Help:** [Discord](https://discord.gg/rF9PKsD5Q7) `#api-help`, the [qloo/qloo-hackathon-kit](https://github.com/qloo/qloo-hackathon-kit) repository, and the hackathon manager at ian@qloo.com.

[guide-key]: /docs/sources/docs.qloo.com/qloo-agentic-hackathon-developer-guide.md#getting-your-api-key
[resources]: /docs/sources/qloo.devpost.com/resources.md
[forum]: /docs/sources/qloo.devpost.com/discussion-forum.md

### Request flow

`/v2/insights` takes a GET with parameters in the query string, or a POST whose JSON body uses the same flat dotted keys, such as `{"filter.type": "urn:entity:movie", "signal.interests.tags": "urn:tag:genre:media:horror", "take": 5}` ([live check](#live-api-checks)). The [quick start][guide-start] flow:

1.  Resolve names to IDs with the lookup endpoints:
    - [`/search`][search] finds entities by name.
    - [`/entities`][entities] finds them by Qloo ID or an external ID, such as Spotify, IMDb, or ISBN.
    - [`/v2/tags`][tags] and [`/v2/audiences`][aud] return the IDs that tag and audience parameters require in place of free text.
2.  Call `/v2/insights` with `filter.type` and at least one valid signal or filter.

```shell
curl -H "X-Api-Key: $QLOO_API_KEY" \
  "https://hackathon.api.qloo.com/v2/insights?filter.type=urn:entity:movie&signal.interests.entities=<entity_id>"
```

[`/v2/trending`][trending] and [`/v2/analysis/compare`][compare] round out the [API overview][api-overview]. The legacy `/recs` and `/recommendations` endpoints are unsupported ([available endpoints][guide-endpoints]).

[guide-start]: /docs/sources/docs.qloo.com/qloo-agentic-hackathon-developer-guide.md#insights--recommendations-quick-start
[guide-get]: /docs/sources/docs.qloo.com/qloo-agentic-hackathon-developer-guide.md#wrong-http-method
[guide-endpoints]: /docs/sources/docs.qloo.com/qloo-agentic-hackathon-developer-guide.md#available-endpoints
[api-overview]: /docs/sources/docs.qloo.com/api-overview.md
[search]: /docs/sources/docs.qloo.com/search-entities.md
[entities]: /docs/sources/docs.qloo.com/search-entities-by-id.md
[tags]: /docs/sources/docs.qloo.com/search-tags.md
[aud]: /docs/sources/docs.qloo.com/get-audiences.md
[trending]: /docs/sources/docs.qloo.com/get-trending-data.md
[compare]: /docs/sources/docs.qloo.com/analysis-compare.md

### Insight types

Every insight comes from `/v2/insights`, and `filter.type` picks the kind ([key use cases][use-cases]):

| Insight                    | `filter.type`              | Also needs                                               |
| -------------------------- | -------------------------- | -------------------------------------------------------- |
| [Recommendations][recs]    | `urn:entity:<type>`        | At least one signal or filter                            |
| [Cross-category][cross]    | A type unlike the signal's | A signal entity of another type ([recipe][cross-recipe]) |
| [Location-based][location] | `urn:entity:<type>`        | A location signal or `filter.location` bound             |
| [Demographics][demo]       | `urn:demographics`         | An entity or tag signal                                  |
| [Heatmap][heatmap]         | `urn:heatmap`              | A location and a signal                                  |
| [Taste analysis][taste]    | `urn:tag`                  | A signal or filter; returns tags                         |

The hackathon key accepts these entity types in `filter.type`, each prefixed `urn:entity:`: `artist`, `book`, `brand`, `destination`, `locality`, `movie`, `person`, `place`, `podcast`, `tv_show`, and `videogame` ([live check](#live-api-checks)). The [developer guide][guide-types] spells the last one `video_game`, which returns 400.

- Music is `artist`. Restaurants are `place` or `brand`.
- Sports teams are brands tagged `urn:tag:genre:brand:sports_organization`, and athletes are persons ([schema and taxonomy][schema]).

Which parameters apply depends on `filter.type`, per the [entity type parameter guide][type-guide]. Beyond the basics, the [Insights deep dive][insights] documents three parameters that suit an agent:

- `feature.explainability=true` reports which inputs drove each result.
- `filter.results.entities` scores candidates the agent already has.
- `diversify.by` spreads results.

[use-cases]: /docs/sources/docs.qloo.com/key-use-cases.md
[recs]: /docs/sources/docs.qloo.com/recommendation-insights.md
[cross-recipe]: /docs/sources/docs.qloo.com/recipe-get-recommendations-based-on-multiple-past-destinations.md#scope-to-a-result-type
[cross]: /docs/sources/docs.qloo.com/cross-category-insights.md
[location]: /docs/sources/docs.qloo.com/location-based-insights.md
[demo]: /docs/sources/docs.qloo.com/demographic-insights.md
[heatmap]: /docs/sources/docs.qloo.com/heatmap-insights-use-case.md
[taste]: /docs/sources/docs.qloo.com/taste-analysis.md
[guide-types]: /docs/sources/docs.qloo.com/qloo-agentic-hackathon-developer-guide.md#insights-api
[schema]: /docs/sources/docs.qloo.com/schema-and-taxonomy.md

### Reading results

- **Affinity** runs from 0 to 1. Above 0.8 is very high, 0.6–0.8 is high, and below 0.5 is low ([interpreting affinity scores][affinity]).
  - Scores are normalized per query, so compare positions, not just raw scores.
  - Scores may fall as inputs are added, and a gap like 0.91 versus 0.92 usually means similar relevance.
  - Affinity is null when the request has only filters and no signal ([recipe][null-recipe], [live check](#live-api-checks)).
- **Popularity** is a percentile within the entity's category ([glossary]).
- **Demographics** are relative to the average and can be negative ([demographic insights][demo]).

[affinity]: /docs/sources/docs.qloo.com/interpreting-affinity-scores.md
[null-recipe]: /docs/sources/docs.qloo.com/recipe-find-italian-restaurants-in-nyc-excluding-fast-food.md

### Gotchas beyond the developer guide

The [developer guide's common issues][guide-errors] cover 401, 403, 404, and empty results, though an unknown `filter.type`, such as `urn:entity:video_game`, returned 400, not 403 ([live check](#live-api-checks)). Remember the guide's worst trap: parameters that aren't valid for the `filter.type` are silently ignored. The general docs and live checks add:

- **Pagination:** `take` defaults to 20 and maxes out at 50, and `page` maxes out at 100 ([deep dive][insights]).
- **Unmatched place:** a `signal.location.query` that matches no locality returns 400 ([parameter reference][params]).
- **Coordinate order:** WKT puts longitude first, as in `POINT(-73.99 40.72)` ([deep dive][insights]).
- **Radius units:** miles on `/search` ([search][search]) but meters on `/v2/insights` ([deep dive][insights]).
- **Audiences:** pass the URN, not the UUID ([audience recipe][audience-recipe]).
- **Demographics alone:** `signal.demographics.*` with no other signal returns 400, "at least one valid signal or filter is required." Adding `signal.location.query` made the same request work ([live check](#live-api-checks)).
- **Location signals don't restrict:** neither `signal.location` nor `signal.location.query` keeps results inside the place. For a hard bound, use `filter.location` or `filter.location.query` ([live check](#live-api-checks)).
- **Unresolved names:** a name in `signal.interests.entities.query` that doesn't resolve is dropped silently, returning the same results as no signal, with affinity null. Check that affinity is set before trusting the signal ([live check](#live-api-checks)).
- **Latency:** a repeated insights call took 8.1 and 8.5 seconds. Three calls returned 504 Gateway Time-out, and the two we retried later succeeded ([live check](#live-api-checks)).

[guide-errors]: /docs/sources/docs.qloo.com/qloo-agentic-hackathon-developer-guide.md#common-issues-and-how-to-fix-them
[params]: /docs/sources/docs.qloo.com/parameter-reference.md
[audience-recipe]: /docs/sources/docs.qloo.com/recipe-recommend-places-using-an-audience-segment-as-signal.md

### Live API checks

The API docs contradict each other on the points below. Each was checked against `https://hackathon.api.qloo.com` on 2026-10-16 ([#11](https://github.com/m1kuorg/qloo/issues/11)), with control calls wherever a 200 alone could have meant a silently ignored parameter:

- **GET and POST both work.**
  - A POST with flat dotted keys in its JSON body returned the same results as the matching GET, for two different tags.
  - A nested body, such as `{"filter": {"type": ...}}`, returns 400. So does a POST that leaves its parameters in the URL. The developer guide's failing example is the nested form ([wrong HTTP method][guide-get]).
  - POST-only parameters, such as `signal.interests.entities.query` ([recipe][recipe-post]), return 400 on GET: "the entities.query parameter can only be used in a POST request."
- **Entity type names:**
  - `videogame` works; the developer guide's `video_game` returns 400, "not supported for filter.type."
  - `destination` works. `locality` works with `filter.location.query`, but rejected a brand entity signal as invalid.
  - A `/search` 400 error lists the `types` it allows, which add `actor`, `album`, `author`, `director`, `urn:demographics`, and `urn:tag`.
- **Heatmap type:** `urn:heatmap` returns `results.heatmap`. The deep dive's `urn:entity:heatmap` returns 400.
- **Location signals** are accepted, though the [parameter guide][type-guide] lists them for no type. They behave differently. For 10 `place` results with a brand signal:
  - No location put 2 of the 10 in Tokyo.
  - `signal.location=POINT(139.70 35.69)`, a WKT point in Tokyo, put 9 there.
  - `signal.location.query=Tokyo` changed the results and their scores but still put only 2 there.
  - `filter.location.query=Tokyo` put all 10 there.
  - A made-up `signal.location.query` returns 400. On `artist`, `signal.location.query` also changed the results.
- **Affinity scale:** every non-null live score fell between 0.83 and 1, so the [FAQs][faqs]' 0–100 is wrong. A single horror or romance tag signal scored every top result exactly 1.

[recipe-post]: /docs/sources/docs.qloo.com/recipe-get-restaurant-recommendations-from-transaction-history.md

## See also

- [Qloo Agentic Hackathon](/docs/sources/qloo.devpost.com/qloo-agentic-hackathon.md) and [official rules][rules] on Devpost
- The hackathon [developer guide][guide]
- 22 worked API calls in the `recipe-*.md` files of [`docs/sources/docs.qloo.com/`](/docs/sources/docs.qloo.com/)
- The [Qloo overview][qloo-overview] and case studies in [`docs/sources/qloo.com/`](/docs/sources/qloo.com/)

[rules]: /docs/sources/qloo.devpost.com/official-rules.md
[rules-4]: /docs/sources/qloo.devpost.com/official-rules.md#project-requirements
[rules-6]: /docs/sources/qloo.devpost.com/official-rules.md#6-judges-and-criteria
[rules-8]: /docs/sources/qloo.devpost.com/official-rules.md#8-prizes
[rules-11]: /docs/sources/qloo.devpost.com/official-rules.md#11-general-conditions
[rules-testing]: /docs/sources/qloo.devpost.com/official-rules.md#testing
[guide]: /docs/sources/docs.qloo.com/qloo-agentic-hackathon-developer-guide.md
[guide-quotas]: /docs/sources/docs.qloo.com/qloo-agentic-hackathon-developer-guide.md#quotas-limits--key-expiration
[faqs]: /docs/sources/docs.qloo.com/faqs.md
[insights]: /docs/sources/docs.qloo.com/insights-api-deep-dive.md
[type-guide]: /docs/sources/docs.qloo.com/entity-type-parameter-guide.md
