# Next Beat

An agent that tells a local newsletter chain which culture vertical to launch in which metro, from how each metro's taste differs from the rest of the chain's footprint in Qloo. Ranked 9 of 10 finalists in the [idea ranking](0000-ranking.md), at 13 out of 20.

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

Local newsletter chains and metro newsrooms grow by launching verticals: food, music, film, gaming, outdoors. Each launch costs a reporter's salary and about six months to learn whether it works, and the choice rests on stereotypes about each city.

- **User:** the editor or expansion lead at a local newsletter chain or metro daily.
- **Buyer:** the chain, per study or per seat.
- **Cost today:** a reporter's salary per failed vertical; the generators' figures are estimates.

## Agent loop

1.  The editor lists metros, candidate verticals, and what's already covered.
2.  For each metro, the agent runs taste analysis and computes the differential against the chain's other metros.
3.  It pulls demographics for each metro's top tags and heatmaps the winner to set the newsletter's geographic focus.
4.  It ranks verticals per metro. The editor **cuts** the shortlist, and the agent drafts a launch brief for each vertical left.

## Qloo calls

| Step          | Call                                                                                                                               |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Metro profile | `/v2/insights`, `filter.type=urn:tag`, `signal.location.query=<metro>`, `filter.tag.types=urn:tag:genre:media,urn:tag:genre:music` |
| Audience      | `/v2/insights`, `filter.type=urn:demographics`, `signal.interests.tags=<tag>`                                                      |
| Focus         | `/v2/insights`, `filter.type=urn:heatmap`, `filter.location.query=<metro>`, `signal.interests.tags=<tag>`                          |

The differential is computed locally over the tag lists, because `/v2/analysis/compare` documents only entity signals as its inputs.

## Why Qloo is load-bearing

An LLM answers with stereotypes, such as country for one city and live music for another. It can't produce a measured differential between two metros.

## Demo

1.  **0:00** Pick two metros from the chain's footprint.
2.  **0:20** A diverging bar chart of their differential tags.
3.  **1:00** The heatmap of the winning tag, with the newsletter's focus neighborhoods outlined.
4.  **1:40** The launch brief.

## Scorecard

Scores run from 1 to 5 against the [matrix](0000-ranking.md#scoring-matrix); the mean is the score.

| Criterion                    | Orchestrator | Blind reviewer | Mean | Why                                                                             |
| ---------------------------- | ------------ | -------------- | ---- | ------------------------------------------------------------------------------- |
| Technological implementation | 4            | 4              | 4    | Three insight types in sequence, but no closed-list scoring and no confirm step |
| Design                       | 4            | 3              | 3.5  | A ranked table and a brief, which reads as a report generator                   |
| Potential impact             | 3            | 3              | 3    | A credible cost per vertical, but a yearly decision and poor buyers             |
| Quality of the idea          | 3            | 2              | 2.5  | GeoTaste's shape and Qloo's Clarion pitch with a newsroom buyer                 |
| **Total**                    | 14           | 12             | 13   |                                                                                 |

Related criteria:

- **Field collisions:** none for newsrooms, but the shape, market analysis on a map, resembles the 2025 grand prize GeoTaste.
- **Safe use:** metro-level taste only; location signals partly track a place's makeup, so verticals must be chosen by taste, not population.
- **Build risk:** medium. Heatmaps need cross-genre normalization.
- **Bonus fit:** weak to moderate.
- **Panel fit:** media for Abrams.

## Risks and open questions

- **Frequency:** a chain decides on a vertical a few times a year, so usage is rare.
- **Proof:** readership impact can't be shown in 14 days.
- **Resemblance:** judges may see GeoTaste for newsrooms, or Qloo's own Clarion case with a newsroom buyer.

## See also

- [Idea ranking](0000-ranking.md)
- [Brief](/docs/BRIEF.md) and [context](/docs/CONTEXT.md)
