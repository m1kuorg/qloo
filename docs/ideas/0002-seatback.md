# Seatback

An agent that picks which films and shows an airline licenses and features on each route, by scoring a distributor's offer against the taste of each route's origin and destination in Qloo. Ranked 9 of 15 finalists in the [idea ranking](0000-ranking.md), at 18 out of 25.

Contents:

1.  [Problem](#problem)
1.  [Agent loop](#agent-loop)
1.  [Qloo calls](#qloo-calls)
1.  [Why Qloo is load-bearing](#why-qloo-is-load-bearing)
1.  [Demo](#demo)
1.  [Scorecard](#scorecard)
1.  [Risks and open questions](#risks-and-open-questions)
1.  [See also](#see-also)

## Problem

An airline's in-flight entertainment catalog runs to hundreds of titles, licensed per title per month. Most carriers license one global catalog with a regional tweak, curated by hand by the airline or a content service provider. The decision each cycle is which titles to license and which to feature on which routes.

- **User:** an airline's in-flight entertainment content manager, or the content service provider curating for several airlines.
- **Buyer:** the airline or the provider. FAST channel programmers face the same per-region choice, which widens the market.
- **Cost today:** large carriers spend tens of millions a year on content, per the org-decisions generator's order-of-magnitude estimate, which needs a source.

## Agent loop

1.  The manager uploads the route list and the distributor's offer as IMDb IDs.
2.  The agent resolves the titles, validates each city, and **asks** about anything that doesn't resolve.
3.  It **asks** for each route's passenger mix: origin, destination, and connecting shares.
4.  It scores the offer against the origin and the destination in separate calls and blends them by that mix.
5.  Where a city's signal barely re-orders the list, it falls back to demographics and the distributor's own categories, and says so on the rail.
6.  It pulls demographics for the top titles per route.
7.  It solves for the licensing list that maximizes summed route scores under the budget, and builds featured rails per route.
8.  The manager **edits** for language and content rating, and approves.

## Qloo calls

| Step          | Call                                                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resolve       | `/entities` with `external.imdb.ids`, falling back to `/search`                                                                                               |
| Route scoring | `/v2/insights`, `filter.type=urn:entity:movie` or `tv_show`, `signal.location.query=<city>`, `filter.results.entities=<offer>`, `feature.explainability=true` |
| City profile  | `/v2/insights`, `filter.type=urn:tag`, `signal.location.query=<city>`, `filter.tag.types=urn:tag:genre:media`                                                 |
| Audience fit  | `/v2/insights`, `filter.type=urn:demographics`, several titles per call                                                                                       |

On 2026-10-16, `signal.location.query` changed open movie results sharply: Lagos returned Nollywood titles and Tokyo returned Japanese film. Scoring a six-title offer per city also worked: each of three cities put a different title first. Some titles came back unscored for some cities, so the agent must list what it couldn't score.

## Why Qloo is load-bearing

An LLM returns global box office. It can't tell one route from another, and when pressed it stereotypes. Qloo scores the same offer differently for each city from observed taste.

## Demo

1.  **0:00** A route map and a 200-title offer.
2.  **0:20** Click London–Lagos: the top ten re-sorts.
3.  **0:40** Click London–San Francisco: it flips. Same catalog, same month.
4.  **1:10** The budget solver builds the licensing list and shows what each route gains.
5.  **2:00** The evidence panel shows the calls per route.

## Scorecard

Scores run from 1 to 5 against the [matrix](0000-ranking.md#scoring-matrix), including Pull; the mean of the orchestrator and the [round 20](0000-ranking.md#round-20-blind-review-and-final-ranking) blind reviewer is the score. The orchestrator's official scores date from the first ranking; the blind reviewer re-scored all fifteen finalists.

| Criterion                    | Orchestrator | Blind reviewer | Mean | Why                                                                                                                  |
| ---------------------------- | ------------ | -------------- | ---- | -------------------------------------------------------------------------------------------------------------------- |
| Technological implementation | 4            | 4              | 4    | Per-city closed-list scoring, demographics, and a budget solve; the location signal partly measures the wrong people |
| Design                       | 4            | 3              | 3.5  | A route click re-sorts the slate; it needs visible decision points to stay an agent                                  |
| Potential impact             | 3            | 3              | 3    | A costly, recurring licensing cycle, but a few dozen buyers and synthetic fees                                       |
| Quality of the idea          | 5            | 4              | 4.5  | No neighbor in either field, and route fit is the trade's own rule                                                   |
| Pull                         | 3            | 3              | 3    | A monthly licensing cycle for a handful of content managers                                                          |
| **Official, out of 20**      | 16           | 14             | 15   |                                                                                                                      |
| **Total, out of 25**         | 19           | 17             | 18   |                                                                                                                      |

Related criteria:

- **Field collisions:** none in either field.
- **Safe use:** the riskiest of the first ten. For one US city, the location signal returned mostly films with Black leads, so it partly tracks a place's racial makeup. The product must rank titles for a place, say that scores describe markets, never passengers, and let the manager override.
- **Build risk:** medium. License fees and offers are synthetic in a demo.
- **Bonus fit:** weak. Few buyers, and enterprise sales.
- **Panel fit:** location signals for Diolosa; media licensing for Abrams.

## Risks and open questions

- **Passengers aren't residents:** a route carries origin and destination residents, connecting travelers, and business flyers, so the passenger mix is the manager's call, not Qloo's.
- **Buyer count:** a few dozen airlines and a handful of providers, so impact rests on dollars per carrier.
- **Unscored titles:** a closed list can come back short for a city, so the slate must show the gaps.
- **Synthetic data:** license fees and offers in the demo aren't real.
- **Proxy risk:** as in safe use above.

## See also

- [Idea ranking](0000-ranking.md)
- [Brief](/docs/BRIEF.md) and [context](/docs/CONTEXT.md)
