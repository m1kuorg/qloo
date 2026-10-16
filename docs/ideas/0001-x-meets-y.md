# X Meets Y

An agent that grades and rebuilds the comp titles in an author's query letter, using Qloo to keep them recent, selling but not blockbusters, and in the author's readership. Ranked 1 of 10 finalists in the [idea ranking](0000-ranking.md), at 17.5 out of 20.

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

An author querying literary agents names two or three comparable titles, or comps, in the letter. Common agent advice is that comps should be from the last few years, should have sold, but shouldn't be blockbusters: "Harry Potter meets Gone Girl" reads as naive. Authors spend hours guessing, and a wrong comp gets a query skipped. Self-published authors face the same choice when they buy Amazon and BookBub ads by author name, where a wrong comp wastes ad spend.

- **User:** authors querying agents, and self-published authors buying ads.
- **Buyer:** the author, on a per-pitch or monthly plan, or a writing platform that licenses it.
- **Cost today:** hours of research per letter, and skipped queries. Neither number is sourced yet; see [risks](#risks-and-open-questions).

## Agent loop

1.  The author pastes the query letter, the comps they planned to use, and three to six influences across books, films, and shows.
2.  The agent resolves every title and **asks** the author to confirm editions and ambiguous matches.
3.  It grades the planned comps on publication year, popularity percentile, and fit, scoring them as a closed list against the influences so an off-lane comp shows as an outlier.
4.  It searches for replacements in a constrained space: recent, inside a popularity window, near the influences. It drops later entries in a series.
5.  It builds a complementary pair: two comps whose explainability splits lean on different influences, checked with a compare so the pair isn't redundant. It also offers one cross-media pair, a book and a show.
6.  The author **picks**. The agent rewrites the comp sentence and exports an ad-target list of authors, ranked by affinity, mid-popularity first.

Every claim in the output shows the call, the entities, and the filters behind it, apart from the agent's wording.

## Qloo calls

| Step                | Call                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Resolve             | `/search` with `types=urn:entity:book` (and `movie`, `tv_show`); `/entities` by ISBN when the author has one                         |
| Grade planned comps | `/v2/insights`, `filter.type=urn:entity:book`, `signal.interests.entities=<influences>`, `filter.results.entities=<planned comps>`   |
| Find replacements   | Same, with `filter.publication_year.min`, `filter.popularity.min`, `filter.popularity.max`, `feature.explainability=true`, `take=50` |
| Pair check          | `/v2/analysis/compare` with `a.signal.interests.entities=<comp 1>` and `b.signal.interests.entities=<comp 2>`                        |
| Cross-media comp    | `/v2/insights`, `filter.type=urn:entity:tv_show` or `movie`, `filter.release_year.min`                                               |
| Genre fingerprint   | `/v2/insights`, `filter.type=urn:tag`, `filter.parents.types=urn:entity:book`                                                        |

The replacement search and the grading call were verified live on 2026-10-16. A popularity cap alone returned obscure self-published series entries; a window returned recent mid-list titles.

## Why Qloo is load-bearing

An LLM invents plausible titles and authors, drifts to famous, older comps, and can't place a title at a popularity percentile. It can't show that a comp's readers overlap the author's influences. Qloo returns real, dated entities with popularity, and its explainability splits each result across the influences as percentages: a literal "X meets Y" ratio.

A day-one benchmark makes this checkable: ask a plain LLM for comps for ten sample synopses, then count how many resolve in Qloo and how many fall inside the window.

## Demo

1.  **0:00** The author pastes a letter pitched as "The Martian meets Gone Girl".
2.  **0:20** Both comps turn red: more than ten years old and in the top popularity percentile.
3.  **0:40** The agent asks which of two matching editions the author meant.
4.  **1:00** Three replacements stream in, each with its year, popularity band, and a bar split by influence.
5.  **1:40** The pair builder picks two that cover different influences and adds a book-and-show option.
6.  **2:10** The rewritten comp sentence and the ad-target export appear.
7.  **2:40** The evidence panel shows each call, entity, and filter.

## Scorecard

Scores run from 1 to 5 against the [matrix](0000-ranking.md#scoring-matrix); the mean is the score.

| Criterion                    | Orchestrator | Blind reviewer | Mean | Why                                                                                                            |
| ---------------------------- | ------------ | -------------- | ---- | -------------------------------------------------------------------------------------------------------------- |
| Technological implementation | 5            | 5              | 5    | Year filter, popularity window, closed-list grading, explainability split, and compare chain into one decision |
| Design                       | 5            | 4              | 4.5  | One flow ends in a graded comp card and a rewritten sentence; the payoff is text, so Qloo's part must show     |
| Potential impact             | 4            | 3              | 3.5  | A large, motivated audience, but the job comes once per book and the cost of a bad comp is vague               |
| Quality of the idea          | 5            | 4              | 4.5  | The popularity window encodes the trade's "not a blockbuster" rule; one neighbor does game comps               |
| **Total**                    | 19           | 16             | 17.5 |                                                                                                                |

Related criteria:

- **Field collisions:** none for books. One 2026 repo does comps for video games.
- **Safe use:** the manuscript never goes to Qloo, only resolved entity IDs. All entities are published works.
- **Build risk:** low. A run is about ten calls, mostly parallel; demo letters can be pre-warmed.
- **Bonus fit:** moderate. A prosumer subscription with a clear "before and after", but not a Calacanis vertical.
- **Panel fit:** strong for Diolosa, since popularity windows, year filters, explainability, and closed-list grading are all in play.

## Risks and open questions

- **Coverage:** whether titles from 2025 and 2026 and small-press literary titles resolve is unverified.
- **Long-tail noise:** the window needs tuning per genre, and series entries and self-published titles must be filtered.
- **Perception:** it can read as "a book recommender with filters", so the grading and pair-building must lead the demo.
- **Market:** the comp-title conventions and the number of querying authors come from general industry knowledge and need sources before the pitch uses them.
- **Reception:** some agents dislike AI-assisted queries; the product drafts one sentence and shows its evidence, which keeps the author in charge.
- **Frequency:** an author needs comps about once per book, so the ad-target export, a recurring spend for self-published authors, carries the business case.
- **Name:** "X Meets Y" is a trade phrase and hard to search for; fine for the entry, worth revisiting for a company.

## See also

- [Idea ranking](0000-ranking.md)
- [Brief](/docs/BRIEF.md) and [context](/docs/CONTEXT.md)
