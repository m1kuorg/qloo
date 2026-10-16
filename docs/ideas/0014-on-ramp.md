# On-Ramp

An agent that plans a four-week path from what someone already loves to a film, show, or band you want them to love, moving each step closer with Qloo's weighted signals and replanning after each one. Ranked 7 of 15 finalists in the [idea ranking](0000-ranking.md), at 18 out of 25.

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

People try to win partners, kids, and friends over to their favorites, and it usually fails at the first pick. Gateway lists are the same for everyone and ignore what this person already loves.

- **User:** the evangelist: a partner converting a boyfriend to anime, a parent handing older films to a teen, a friend pushing a band. It runs on the weekly movie night or listening session.
- **Buyer:** consumers; fan communities and streaming services could embed it. None of this is validated.
- **Cost today:** failed first picks and lost movie nights. Nothing here is priced.
- **On X:** a post about showing a girlfriend The Prestige drew 71,074 likes ([_onthewayjay][x-prestige]), and #conversion posts follow the same arc ([paniniboy7][x-conversion]). People want a guide: "i would rather start watching it with somebody who's already passionate about it" ([\_brittanymonae\_][x-guide]). Watching things "too old for you" is pitched as how taste gets built ([regularaugust][x-old]).

[x-prestige]: https://x.com/_onthewayjay/status/2104324932834385989
[x-conversion]: https://x.com/paniniboy7/status/2040788363158970801
[x-guide]: https://x.com/_brittanymonae_/status/2025254470565712111
[x-old]: https://x.com/regularaugust/status/2039686505120043176

## Agent loop

1.  **Set the target.** The user names the target as two or three works or a tag, and three things the other person loves in any category. **The user confirms** the resolutions.
2.  **Build the rungs.** Each rung is one scoring call. The weight slides from the other person's anchors to the target, past rungs and anything seen are excluded, and the popularity window eases from mainstream to deeper.
3.  **Ground the rungs.** An LLM may propose bridge candidates; Qloo decides where each sits between the two sides, and each rung shows a split bar between them.
4.  **Approve.** **The user approves or swaps** each rung before it's scheduled.
5.  **Replan.** After each movie night, **the user reports** loved, meh, or bailed. On meh, the ladder steps back toward the other person's side and rebuilds the remaining rungs.
6.  **Finish.** When the last rung lands, it makes a "converted" card.

## Qloo calls

| Step         | Call                                                                                                                                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resolve      | `/search` for the anchors and the target                                                                                                                                                                 |
| Rung scoring | POST `/v2/insights`, `filter.type=<target's type>`, `signal.interests.entities=[{id, weight}]` with the weights shifting per rung, `filter.results.entities=<candidate pool>`, `filter.exclude.entities` |
| Open search  | The same call without the closed list, with `filter.popularity.min` and `max` per rung                                                                                                                   |
| Side check   | The rung scored against each side alone, to confirm it sits between them                                                                                                                                 |

A live check on 2026-10-17 scored a 17-film pool against three heist films and Spirited Away at four weightings:

| Weighting, heist to Ghibli | Top of the pool                                                |
| -------------------------- | -------------------------------------------------------------- |
| 10 to 1                    | Inception, The Italian Job, Mad Max: Fury Road                 |
| 4 to 1                     | Inception, The Italian Job, Mad Max, Your Name. in fifth       |
| 1 to 1                     | Howl's Moving Castle, Princess Mononoke, Castle in the Sky     |
| 1 to 4                     | Howl's Moving Castle, My Neighbor Totoro; The Italian Job last |

The pool moved smoothly. Your Name. rose from 7th to 5th as the weight shifted, which suggests a ladder of Inception, then Your Name., then Howl's Moving Castle, then Spirited Away.

A person would pick Lupin III: The Castle of Cagliostro, a heist film directed by Miyazaki, as the bridge, but it never ranked above 11th of 17. Qloo scores co-engagement, not content. So an LLM should propose bridges like Lupin III, and Qloo should place them on the ladder.

## Why Qloo is load-bearing

An LLM hands everyone the same gateway list, such as Spirited Away, Totoro, and Mononoke, even when this person loves heist films and Mad Max. It can't measure how far each step sits from them and from the target. Qloo's weighted signals put a number on that distance and move it rung by rung.

## Demo

1.  **0:00** "I want him to love Ghibli. He loves Heat, Ocean's Eleven, and Baby Driver."
2.  **0:20** The agent confirms the films and builds four rungs, each with a split bar between his side and Ghibli.
3.  **0:50** The user swaps rung two for a film he's seen.
4.  **1:20** Week one: "loved". Week two: "meh", so the ladder steps back and rebuilds.
5.  **2:00** The final rung lands, and the converted card is ready to post.
6.  **2:30** The evidence panel shows the weights per rung.

## Scorecard

Scores run from 1 to 5 against the [matrix](0000-ranking.md#scoring-matrix), including Pull; the mean of the orchestrator and the [round 20](0000-ranking.md#round-20-blind-review-and-final-ranking) blind reviewer is the score.

| Criterion                    | Orchestrator | Blind reviewer | Mean | Why                                                                                         |
| ---------------------------- | ------------ | -------------- | ---- | ------------------------------------------------------------------------------------------- |
| Technological implementation | 5            | 4              | 4.5  | Weights slide per rung, verified live, with exclusions, popularity windows, and side checks |
| Design                       | 4            | 4              | 4    | A ladder with split bars and a converted card; the weeks must be simulated in the demo      |
| Potential impact             | 2            | 2              | 2    | A consumer delight with no buyer and no number                                              |
| Quality of the idea          | 4            | 4              | 4    | A directed path to a named target, for someone else; weights measure the distance           |
| Pull                         | 4            | 3              | 3.5  | Weekly for four weeks, then it needs a new target                                           |
| **Official, out of 20**      | 15           | 14             | 14.5 |                                                                                             |
| **Total, out of 25**         | 19           | 17             | 18   |                                                                                             |

Related criteria:

- **Field collisions:** northbridge-taste finds household bridge picks, and the common-ground repos find overlap; none builds a directed path.
- **Safe use:** it works from anchors only and infers nothing about the other person.
- **Build risk:** low. Four rungs are a few calls each, and demo ladders can be pre-warmed.
- **Bonus fit:** weak. The converted card travels, but there's no business yet.
- **Panel fit:** good for Diolosa, since weighted signals are a parameter few entries use.

## Risks and open questions

- **Impact:** a consumer delight with no buyer and no number, which caps Potential impact.
- **Co-engagement:** the live check showed content bridges don't rank, so the LLM-proposes, Qloo-places split must hold up in the demo.
- **Retention:** a ladder ends after four weeks; Pull depends on users starting new targets.
- **Neighbors:** northbridge-taste finds household bridge picks, and the first ideation's Whetstone, cut in [round 3](0000-ranking.md#round-3-gates), stretched a person's own taste weekly. On-Ramp's directed path toward a named target, for someone else, is new.

## See also

- [Idea ranking](0000-ranking.md)
- [Brief](/docs/BRIEF.md) and [context](/docs/CONTEXT.md)
