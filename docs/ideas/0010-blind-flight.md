# Blind Flight

A taste benchmark for teams shipping shopping and concierge agents: it runs their agent and baselines on fictional personas and measures, with Qloo, whether the agent's picks are real, varied, and fitted to each persona. Ranked last of 10 finalists in the [idea ranking](0000-ranking.md): it scored 13 out of 20, but as described it fails the agent gate.

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

Teams shipping recommendation, shopping, or concierge agents have no taste tests. They eyeball outputs, and "would this work the same without Qloo?", Devpost's own test, goes unmeasured.

- **User:** engineers and product teams shipping taste-dependent agents.
- **Buyer:** those teams, per seat or per CI run; Qloo itself is an interested party.
- **Cost today:** manual review of outputs; not sourced.

## Agent loop

1.  An evaluator agent builds fictional personas, each with four to six anchors drawn from entity neighborhoods in different popularity bands.
2.  It runs each target on every persona: a plain LLM, an LLM with web search, the official Qloo kit agent, and the team's own endpoint.
3.  It scores resolvability, concentration, persona sensitivity, and fit.
4.  It diagnoses failure modes and proposes a fix, then re-runs to confirm.
5.  A CI job fails the build on regression.

## Qloo calls

| Metric              | Call                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Personas            | `/search` and `/v2/insights` neighbors with `filter.popularity.min` and `max` bands           |
| Resolvability       | `/search` on every recommended title; an unresolved title is a likely hallucination           |
| Concentration       | `popularity` of the picks                                                                     |
| Persona sensitivity | `/v2/analysis/compare` of two personas' pick sets                                             |
| Fit                 | `/v2/insights` with `filter.results.entities=<picks>`, ranked among popularity-matched decoys |

## Why Qloo is load-bearing

Without an independent taste graph there's nothing to measure against, and taste stays a matter of opinion.

## Demo

1.  **0:00** A heatmap of 50 personas against five agents.
2.  **0:30** The plain LLM shows a few bright columns: everyone gets the same canon.
3.  **1:10** The Qloo-grounded arm spreads across personas.
4.  **2:00** A shareable "which model has taste?" leaderboard card.

## Scorecard

Scores run from 1 to 5 against the [matrix](0000-ranking.md#scoring-matrix); the mean is the score.

| Criterion                    | Orchestrator | Blind reviewer | Mean | Why                                                                          |
| ---------------------------- | ------------ | -------------- | ---- | ---------------------------------------------------------------------------- |
| Technological implementation | 5            | 4              | 4.5  | Careful metrics, but grading with Qloo to show Qloo helps is circular        |
| Design                       | 3            | 3              | 3    | A leaderboard and a heatmap: a developer harness, not a product flow         |
| Potential impact             | 3            | 3              | 3    | Evals are frequent, but nobody has asked for a taste metric                  |
| Quality of the idea          | 3            | 2              | 2.5  | Qloo's own claim as a benchmark; 2026 repos already compare Qloo with an LLM |
| **Total**                    | 14           | 12             | 13   |                                                                              |

Related criteria:

- **Field collisions:** several 2026 repos already compare Qloo with a plain LLM as a feature.
- **Safe use:** fictional personas only.
- **Build risk:** medium. Personas times targets times calls at 5 to 8 seconds each needs a cached, fixed benchmark.
- **Bonus fit:** weak to moderate.
- **Panel fit:** strong for Diolosa, whose company is the subject.

## Risks and open questions

- **Agent gate:** as described, it's a CI harness with no human decision point, which fails the gate. Reframed as an agent that probes a target adaptively and asks the owner which failures to chase, it would pass.
- **Circularity:** grading with Qloo to show Qloo helps invites the obvious objection; resolvability and concentration don't depend on Qloo affinity, and a held-out public dataset would help.
- **Design:** a benchmark is a developer tool, which scores lower on product experience.
- **Cost:** the benchmark must be cached and fixed to fit the quota.

## See also

- [Idea ranking](0000-ranking.md)
- [Brief](/docs/BRIEF.md) and [context](/docs/CONTEXT.md)
