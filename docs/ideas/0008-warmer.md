# Warmer

Two agents negotiate a gift: the giver's agent proposes, and the recipient's agent answers only "hot", "warm", or "cold" from favourites the giver never sees, scored in Qloo. Ranked 8 of 10 finalists in the [idea ranking](0000-ranking.md), at 13.5 out of 20.

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

A good gift needs the recipient's taste, but asking spoils the surprise, and guessing ends in a return or a gift card. Gift finders exist, but each one needs the giver to know the recipient's taste already.

- **User:** a gift-giver and a recipient, through their personal agents.
- **Buyer:** the giver, with a free tier, then a small per-gift fee or an affiliate cut.
- **Cost today:** returns and unwanted gifts; not sourced.

## Agent loop

It ships as an OpenClaw skill on a messaging app, with a two-pane web fallback for judges.

1.  The giver says "gift for my sister, $60, nine days". The giver's agent asks for budget, deadline, and off-limits categories, never taste.
2.  The recipient gets a link: "Sam wants to get you something. Name five to eight things you love. Sam never sees them." Their agent resolves each one, **asks** them to disambiguate, and seals the list for the session.
3.  The giver's agent proposes about 30 candidates a round: books, games, brands, artists, places.
4.  The recipient's agent answers one bucket per candidate, hot, warm, or cold, never a score or an anchor.
5.  The giver's agent expands around warm candidates for at most three rounds. The recipient sees the count of questions asked.
6.  The recipient **consents** and can veto categories; the giver **approves** the pick and the purchase.

## Qloo calls

| Step              | Call                                                                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Resolve           | `/search` with `types=urn:entity:<type>`                                                                                                        |
| Recipient scoring | `/v2/insights`, `filter.type=urn:entity:<type>`, `signal.interests.entities=<sealed anchors>`, `filter.results.entities=<candidates>`, per type |
| Baseline          | The same candidates scored against a neutral anchor set; the bucket is lift over that baseline                                                  |
| Giver expansion   | `/v2/insights`, `signal.interests.entities=<warm candidates>`, `filter.exclude.entities=<tried>`, `filter.popularity.max`                       |

The agent-native generator verified on 2026-10-16 that scoring a closed candidate list spreads far wider than open recommendations, which is what makes buckets possible.

## Why Qloo is load-bearing

An LLM acting as the recipient's oracle says "she'd like that" to most candidates and can't separate 30 long-tail items. Qloo scores them against the sealed favourites and against a baseline, so the buckets carry information. A day-one test: have an LLM bucket the same 30 candidates and count how many it calls warm.

## Demo

1.  **0:00** Two phones side by side.
2.  **0:20** The recipient names six favourites; their phone says "sealed".
3.  **0:40** The giver's phone steps through cold, cold, warm, hot, while the recipient's shows only "14 questions asked".
4.  **1:40** The reveal: one specific book, and a "why" in two shared tags, shown only if the recipient opts in.

## Scorecard

Scores run from 1 to 5 against the [matrix](0000-ranking.md#scoring-matrix); the mean is the score.

| Criterion                    | Orchestrator | Blind reviewer | Mean | Why                                                                                                |
| ---------------------------- | ------------ | -------------- | ---- | -------------------------------------------------------------------------------------------------- |
| Technological implementation | 4            | 3              | 3.5  | One closed-list call per round plus a baseline; the protocol, not Qloo, carries the sophistication |
| Design                       | 4            | 4              | 4    | The clearest demo of the ten, but two parties and an OpenClaw skill are a lot to ship              |
| Potential impact             | 3            | 2              | 2.5  | A huge audience, but both people must run an agent, and gift finders rarely become companies       |
| Quality of the idea          | 4            | 3              | 3.5  | A genuine privacy inversion inside a saturated theme                                               |
| **Total**                    | 15           | 12             | 13.5 |                                                                                                    |

Related criteria:

- **Field collisions:** four 2026 gift-finder repos. The sealed two-agent protocol is new, but the category is crowded.
- **Safe use:** only entity IDs go to Qloo, never names or handles. "Sealed" means sealed from the giver: Qloo still receives the anchors as entity signals and may train on them under its terms, so the consent screen says so. Probing could reconstruct the sealed favourites, so buckets stay coarse and each session has a hard query cap.
- **Build risk:** high. A two-party flow, sessions, and an OpenClaw skill are hard to polish by 2026-10-30.
- **Bonus fit:** strong. A consumer product with a viral loop, on OpenClaw, which Calacanis is backing.
- **Panel fit:** privacy by protocol for Seligman; less API depth for Diolosa.

## Risks and open questions

- **Honest wording:** the product must never say the favourites are hidden from everyone, only from the giver.
- **Reconstruction:** repeated probing leaks anchors; coarse buckets and a cap are the mitigation, and the cap needs testing.
- **Popularity prior:** popular items can look hot everywhere, which is why buckets are lift over a baseline.
- **Two parties:** both people must take part; the demo needs a "sealed sample sister" mode.
- **Crowd:** gift finders are common in 2026, so the protocol must lead the description.

## See also

- [Idea ranking](0000-ranking.md)
- [Brief](/docs/BRIEF.md) and [context](/docs/CONTEXT.md)
