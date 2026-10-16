# Cuesheet

An agent that ranks the artists pitched to a music supervisor by how well their listeners overlap the production's audience, and turns the result into a cue sheet the supervisor can forward. Ranked 6 of 10 finalists in the [idea ranking](0000-ranking.md), at 15 out of 20.

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

For each cue, a music supervisor on a film, series, or game fields dozens to hundreds of label pitches and spends days listening before sending a shortlist to the director. Sync fees and season music budgets are large, so the shortlist is a spending decision as well as a creative one.

- **User:** music supervisors, and studio or game music departments.
- **Buyer:** the production or the supervisor's firm, per project.
- **Cost today:** days of listening per cue. The org-decisions generator's fee and budget ranges are order-of-magnitude estimates and need sources.

## Agent loop

1.  The supervisor pastes the scene brief, three comparable titles, the budget tier, and the pitch list.
2.  The agent resolves comps and artists and **asks** about name collisions, which are common for artists.
3.  It scores the pitch list against the comps' audience as a closed list.
4.  For the top 20, it adds demographics and a "why it fits" line from a compare with the comps.
5.  It uses popularity percentile as a cost proxy: a high-fit artist in a low percentile is the find.
6.  It outputs a cue sheet: rank, fit, audience, cost proxy, rationale. The supervisor **reorders** and approves.

## Qloo calls

| Step          | Call                                                                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resolve       | `/search` with `types=urn:entity:movie,urn:entity:tv_show,urn:entity:videogame` for comps, and `urn:entity:artist`; `/entities` by Spotify ID                    |
| Score pitches | `/v2/insights`, `filter.type=urn:entity:artist`, `signal.interests.entities=<comps>`, `filter.results.entities=<pitched artists>`, `feature.explainability=true` |
| Audience      | `/v2/insights`, `filter.type=urn:demographics`, several artists per call                                                                                         |
| Why it fits   | `/v2/analysis/compare` between the comps and each finalist                                                                                                       |

On 2026-10-16, scoring four pitched artists against three different shows put a different artist first each time, but within a narrow band. Open discovery inside a popularity window returned noisy long-tail artists, so the product scores pitches rather than discovering new ones.

## Why Qloo is load-bearing

An LLM picks sonic matches and famous names. It can't say whether a show's audience over-indexes on an artist, give the age skew, or surface the cheaper artist whose listeners are exactly the show's viewers.

## Demo

1.  **0:00** Paste 30 pitched artists and three comps.
2.  **0:30** The agent asks which of two same-named artists was meant.
3.  **1:00** The ranked cue sheet streams in; first is a mid-popularity artist with high fit and a low cost proxy.
4.  **2:00** Swap one comp and watch the order change.
5.  **2:30** Export the director-ready sheet.

## Scorecard

Scores run from 1 to 5 against the [matrix](0000-ranking.md#scoring-matrix); the mean is the score.

| Criterion                    | Orchestrator | Blind reviewer | Mean | Why                                                                              |
| ---------------------------- | ------------ | -------------- | ---- | -------------------------------------------------------------------------------- |
| Technological implementation | 4            | 4              | 4    | A full chain, but live scores re-ordered only within a narrow band               |
| Design                       | 4            | 4              | 4    | The trade's own artifact in one flow; show ranks, not flat scores                |
| Potential impact             | 3            | 3              | 3    | A frequent job for a small, relationship-driven trade, with no saving quantified |
| Quality of the idea          | 4            | 4              | 4    | Popularity as a clearance-cost proxy encodes a trade rule; one neighbor          |
| **Total**                    | 15           | 15             | 15   |                                                                                  |

Related criteria:

- **Field collisions:** one 2026 repo picks music for a 15-second brand film. Music is next to the crowded tour-routing niche, so the description must lead with the supervisor.
- **Safe use:** public artist and title names only.
- **Build risk:** low to medium.
- **Bonus fit:** moderate.
- **Panel fit:** strong for Abrams and Cedric, who work in entertainment.

## Risks and open questions

- **Narrow spreads:** pitched artists score close together, so rank and confidence matter more than numbers.
- **Creative fit:** supervisors choose for the scene first; audience fit is a second opinion.
- **Rights:** Qloo can't know availability or clearance cost; popularity is only a proxy.
- **Unsourced numbers:** fees and budgets need sources.

## See also

- [Idea ranking](0000-ranking.md)
- [Brief](/docs/BRIEF.md) and [context](/docs/CONTEXT.md)
