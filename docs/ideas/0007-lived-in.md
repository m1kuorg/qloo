# Lived-In

An agent that dresses a fictional character's room for a set decorator: shelves, walls, and fridge filled with books, records, brands, and games that cohere with the character's taste in Qloo, and flags the script's out-of-character items. Ranked 7 of 10 finalists in the [idea ranking](0000-ranking.md), at 13.5 out of 20.

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

Set decorators and prop masters research each character's surroundings by hand, and generic picks read as fake: every indie character owns the same famous record. Game environment artists and novelists face the same problem with whole towns of characters.

- **User:** set decorators, prop masters, and production designers on film, TV, and commercials; game environment artists; novelists.
- **Buyer:** the production's art department, or the studio, per project.
- **Cost today:** research hours per set; not sourced.

## Agent loop

1.  The agent ingests the script and character breakdown. These are fictional people.
2.  It extracts the script's explicit taste mentions, resolves them, and **asks** the decorator for three to five anchors per character.
3.  It fills each surface across types inside a popularity band, recognizable but not on-the-nose, with a release-year cap for the story's year.
4.  It scores the script's own mentions against each character and flags outliers, then **asks** whether each is an intended contrast.
5.  For roommates, it compares their anchors to decide whose things go where.
6.  It outputs a dressing list by surface, with clearance flags and an uncleared generic alternative per branded item.

## Qloo calls

| Step       | Call                                                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fill       | `/v2/insights` per `filter.type` (book, artist, movie, tv_show, brand, podcast, videogame), `signal.interests.entities=<anchors>`, popularity band, year cap, `feature.explainability=true` |
| Coherence  | The same with `filter.results.entities=<script mentions>`                                                                                                                                   |
| Roommates  | `/v2/analysis/compare` between two characters' anchors                                                                                                                                      |
| Mood words | `/v2/insights`, `filter.type=urn:tag`, `signal.interests.entities=<anchors>`                                                                                                                |

## Why Qloo is load-bearing

An LLM gives the most famous, most stereotyped item in each category. It can't tell "coherent but surprising" from random, and it has no co-preference data to flag an out-of-character mention.

## Demo

1.  **0:00** Two roommates from a script.
2.  **0:30** A shared bookshelf fills, split left and right by the compare result.
3.  **1:10** One item from the script is flagged red as out of character, with the question to the writer.
4.  **2:00** The dressing list exports with clearance flags.

## Scorecard

Scores run from 1 to 5 against the [matrix](0000-ranking.md#scoring-matrix); the mean is the score.

| Criterion                    | Orchestrator | Blind reviewer | Mean | Why                                                                                             |
| ---------------------------- | ------------ | -------------- | ---- | ----------------------------------------------------------------------------------------------- |
| Technological implementation | 4            | 4              | 4    | Six types in bands with a year cap, closed-list coherence flags, and compare for roommates      |
| Design                       | 4            | 4              | 4    | A dressed shelf per character with clearance flags; image rights are unclear                    |
| Potential impact             | 2            | 2              | 2    | A small trade with weak willingness to pay, and period work is out of reach                     |
| Quality of the idea          | 4            | 3              | 3.5  | Out-of-character flags are new; cross-domain persona fill is Qloo's own demo and a 2025 project |
| **Total**                    | 14           | 13             | 13.5 |                                                                                                 |

Related criteria:

- **Field collisions:** a 2025 project built cross-domain personas, and a 2026 repo casts AI characters for brands.
- **Safe use:** fictional characters only.
- **Build risk:** low to medium. Seven types per character means many calls; cache by anchor set.
- **Bonus fit:** weak.
- **Panel fit:** entertainment production for Abrams and Cedric.

## Risks and open questions

- **Willingness to pay:** the weakest buyer case of the ten.
- **Period pieces:** Qloo popularity is present-day, so the agent must say it can't dress a period set rather than fill one.
- **Qloo's pitch:** cross-domain persona fill is on Qloo's capabilities page, so the out-of-character flags must lead.
- **Long-tail noise:** popularity bands return noisy items in some types.
- **Images:** entity image rights are unclear, so the demo stays text or generated art.

## See also

- [Idea ranking](0000-ranking.md)
- [Brief](/docs/BRIEF.md) and [context](/docs/CONTEXT.md)
