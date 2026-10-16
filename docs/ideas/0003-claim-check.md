# Claim Check

An agent that checks the audience claims in AI-written marketing briefs and startup pitch decks against Qloo, and rewrites each claim to say only what the data supports. Ranked 3 of 15 finalists in the [idea ranking](0000-ranking.md), at 20 out of 25.

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

Briefs, personas, and decks are now often drafted by LLMs, and they state audience facts with confidence: "our core is Gen Z women who love X", "fans of A will love B", "big in Austin". Nobody checks them, or one LLM checks another, sharing its stereotypes. A wrong persona sends a campaign, a launch city, or an investment the wrong way.

- **Users:** agency strategists and brand marketers checking a brief, and angels, accelerator screeners, and consumer-VC analysts checking a deck.
- **Buyer:** the agency or fund, per seat. Agents that write audience-facing content can call it as an API gate before they send.
- **Cost today:** a commissioned survey or panel, or no check at all. The cost isn't sourced yet.

## Agent loop

1.  The user pastes a brief or uploads a deck. The agent extracts atomic, testable claims and sorts them by type: audience skew, "fans of A like B", "A is like B", "niche" or "mainstream", and "popular in a place".
2.  It resolves the named entities and **asks** on ambiguity, such as which film of that name.
3.  It routes each claim to a Qloo check with a visible threshold.
4.  It returns supported, mixed, contradicted, or unverifiable for each claim, with the numbers. Verdicts say what Qloo's engagement data shows, such as "engagement skews older", never who a product's customers are.
5.  It offers a rewrite that says only what the data supports, and the user **accepts** or rejects each one.
6.  It exports an evidence appendix that keeps Qloo's results apart from the agent's interpretation.

It refuses claims about politics, health, religion, sexuality, or any protected trait, and says why.

## Qloo calls

| Claim type              | Call                                                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audience skew           | `/v2/insights`, `filter.type=urn:demographics`, `signal.interests.entities=<ids>`; several entities fit in one call                                 |
| "Fans of A like B"      | `/v2/insights`, `filter.type=urn:entity:<type of B>`, `signal.interests.entities=<A>`, `filter.results.entities=<B plus popularity-matched decoys>` |
| "A is like B"           | `/v2/analysis/compare`, shared and per-side tags                                                                                                    |
| "Niche" or "mainstream" | `popularity` from `/search`                                                                                                                         |
| "Popular in a place"    | `/v2/insights`, `filter.type=urn:heatmap`, `filter.location.query=<city>`                                                                           |
| Several brands at once  | `feature.explainability=true`                                                                                                                       |

The verdict for "fans of A like B" is B's rank among the decoys, not its raw score, because open scores bunch and carry a popularity prior.

## Why Qloo is load-bearing

The whole product is an independent check. An LLM checker shares the author's priors and agrees with itself. In a live check on 2026-10-16, a prestige drama an LLM would call a Gen Z hit had an audience that skewed older than average and under-indexed in the late twenties. That kind of reversal is exactly what the tool catches.

## Demo

1.  **0:00** A strategist pastes an AI-written audience brief.
2.  **0:15** Sentences turn green, amber, or red as checks stream in.
3.  **0:45** Click the red "Gen Z" sentence: age bars, the call behind them, and a one-click correction.
4.  **1:30** Switch to deck mode: a slide claiming "35–44 moms who love Lululemon and Stranger Things" gets three badges, and the agent drafts the founder question.
5.  **2:30** The evidence appendix exports, with Qloo results and interpretation in separate columns.

## Scorecard

Scores run from 1 to 5 against the [matrix](0000-ranking.md#scoring-matrix), including Pull; the mean of the orchestrator and the [round 20](0000-ranking.md#round-20-blind-review-and-final-ranking) blind reviewer is the score. The orchestrator's official scores date from the first ranking; the blind reviewer re-scored all fifteen finalists.

| Criterion                    | Orchestrator | Blind reviewer | Mean | Why                                                                                                       |
| ---------------------------- | ------------ | -------------- | ---- | --------------------------------------------------------------------------------------------------------- |
| Technological implementation | 5            | 4              | 4.5  | Routes each claim to demographics, decoy-matched closed lists, heatmaps, or compare                       |
| Design                       | 4            | 4              | 4    | An annotated brief with verdict badges and rewrites; claim extraction must be reliable                    |
| Potential impact             | 4            | 4              | 4    | Real users in agencies and funds, but campaign waste is hard to attribute and unquantified                |
| Quality of the idea          | 4            | 4              | 4    | Verifying instead of generating is the inversion; Alloy and 2026 market-fit and audit repos are neighbors |
| Pull                         | 3            | 4              | 3.5  | Briefs and decks arrive weekly, and the appendix travels with them                                        |
| **Official, out of 20**      | 17           | 16             | 16.5 |                                                                                                           |
| **Total, out of 25**         | 20           | 20             | 20   |                                                                                                           |

Related criteria:

- **Field collisions:** the 2025 honorable mention Alloy did cultural due diligence for M&A, and 2026 repos give market-fit verdicts and audit AI recommendations. Claim-level verification of any text is the distinct part.
- **Safe use:** demographics describe an entity's audience relative to the average, never a person; protected-trait claims are refused. It's the clearest Seligman fit of the first ten.
- **Build risk:** medium. About 15 calls per document, streamed; claim extraction and thresholds need care.
- **Bonus fit:** strong in deck mode, since Calacanis reads consumer decks for a living.
- **Panel fit:** strong for Diolosa, since Qloo serves as ground truth.

## Risks and open questions

- **Thresholds:** "skews young" needs explicit, defensible cut-offs on relative demographics, and those cut-offs are our interpretation.
- **Engagement, not customers:** demographics show who engages with an entity now, relative to the average, so no verdict can say who a product's customers are.
- **Coverage:** entities missing from the graph are unverifiable, and the UI must say so rather than guess.
- **Coarse demographics:** six age buckets and two genders bound what can be checked.
- **Comparison:** judges may read deck mode as "Alloy for seed decks"; leading with brief mode avoids that.
- **Founders:** results are evidence about a market, never a judgment of the founder.

## See also

- [Idea ranking](0000-ranking.md)
- [Brief](/docs/BRIEF.md) and [context](/docs/CONTEXT.md)
