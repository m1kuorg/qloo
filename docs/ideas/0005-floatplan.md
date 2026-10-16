# Floatplan

An agent that tells a multi-branch public library where each genre's copies should live, using Qloo heatmaps as a taste prior that doesn't depend on what each branch already holds. Ranked 5 of 10 finalists in the [idea ranking](0000-ranking.md), at 15.5 out of 20.

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

Library systems allocate copies to branches from circulation history, but that history is censored: a branch with no romance shelf can't show romance demand. Floating collections, where an item stays at whichever branch it's returned to, make it worse, piling up at some branches and emptying others.

- **User:** collection-development and materials-management librarians at multi-branch public library systems.
- **Buyer:** the library system, from its collection or operations budget.
- **Cost today:** copies sitting where they don't circulate. The org-decisions generator put US public library collection spending at about $1.5 billion a year, as an order of magnitude from the IMLS survey; the figure needs checking.

## Agent loop

1.  The librarian uploads branch locations and an aggregate holdings and circulation table by genre. No patron data is involved.
2.  The agent maps the library's genre codes to Qloo tags and **asks** the librarian to confirm or fix each mapping.
3.  It pulls one heatmap per genre over the service area and assigns cells to branch catchments.
4.  It normalizes each cell across genres, turning "where people are" into "where this genre over-indexes".
5.  It blends that latent demand with circulation as a prior, shrinking toward circulation where circulation is strong, and shows the gaps. The librarian **overrides** any branch.
6.  For the biggest gaps, it suggests titles with local signal.
7.  The librarian **sets** the order budget, and the agent emits an allocation file and float rules, such as "romance returned at Branch A floats to Branch C".

## Qloo calls

| Step           | Call                                                                                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Genre mapping  | `/v2/tags` with genre search terms, for `urn:tag:genre:media:*` IDs                                                                             |
| Latent demand  | `/v2/insights`, `filter.type=urn:heatmap`, `filter.location=<service-area polygon>` or `filter.location.query`, `signal.interests.tags=<genre>` |
| Branch profile | `/v2/insights`, `filter.type=urn:tag`, `signal.location=<branch point>`, `filter.parents.types=urn:entity:book`                                 |
| Purchase list  | `/v2/insights`, `filter.type=urn:entity:book`, `signal.location=<branch point>`, `signal.interests.tags=<gap genre>`                            |

On 2026-10-16, two genre heatmaps for one city returned thousands of fine geohash cells each, but correlated about 0.86, which is why step 4 exists. The docs' `neighborhood` boundary returned 400; `urn:geohash` works.

## Why Qloo is load-bearing

An LLM can only echo circulation or allocate by census stereotypes, which is both inaccurate and ethically fraught. It has no neighborhood-level taste signal. Qloo's heatmap is a demand prior that doesn't depend on current stock, which is the one thing circulation data can't supply.

## Demo

1.  **0:00** A city map with branch catchments drawn.
2.  **0:20** The agent maps genre codes to tags and asks the librarian to confirm two.
3.  **0:50** Toggle "true crime": one branch glows, with latent share at twice its holdings share.
4.  **1:30** Click it: ten titles to buy, and the float rule that sends returns there.
5.  **2:10** The budget slider re-plans every branch's cart.
6.  **2:40** The evidence panel shows the heatmap calls, the normalization, and the circulation blend.

## Scorecard

Scores run from 1 to 5 against the [matrix](0000-ranking.md#scoring-matrix); the mean is the score.

| Criterion                    | Orchestrator | Blind reviewer | Mean | Why                                                                                                        |
| ---------------------------- | ------------ | -------------- | ---- | ---------------------------------------------------------------------------------------------------------- |
| Technological implementation | 4            | 4              | 4    | Tag mapping, one heatmap per genre, and cross-genre normalization; one insight type carries it             |
| Design                       | 5            | 4              | 4.5  | A map where one branch glows; it needs more decision points than one confirmation                          |
| Potential impact             | 4            | 3              | 3.5  | A public good with an order budget, but quarterly decisions and slow buyers                                |
| Quality of the idea          | 4            | 3              | 3.5  | The censored-circulation insight is real; a collection-development repo and GeoTaste's shape are neighbors |
| **Total**                    | 17           | 14             | 15.5 |                                                                                                            |

Related criteria:

- **Field collisions:** a 2026 MIT-licensed repo already pitches readers' advisory and collection development to libraries, so the description must say this is geographic allocation.
- **Safe use:** no patron data, and demographics stay out of allocation. Live checks showed location signals partly track a place's racial makeup, so the product must present demand by genre, never by population, and let librarians override.
- **Build risk:** medium to high. Geo work, normalization, and a map UI, with about 10 heatmap calls per city to cache.
- **Bonus fit:** weak. A public-sector buyer isn't a startup Calacanis funds.
- **Panel fit:** heatmaps, the least-used insight type, for Diolosa; a public good for the impact case; a GeoTaste-style map for Design.

## Risks and open questions

- **Validity:** heatmaps may track signal density more than preference, and normalization may leave noise. A backtest against a city's published circulation data would settle it, if branch-level data exists.
- **Stereotyping:** genre maps can mirror a neighborhood's demographics; the UI must frame them as demand, and librarians decide.
- **Spend figure:** the spending number is the generator's estimate and needs a source.
- **Buyer adoption:** library procurement is slow, so the pitch should be a pilot, not a sale.

## See also

- [Idea ranking](0000-ranking.md)
- [Brief](/docs/BRIEF.md) and [context](/docs/CONTEXT.md)
