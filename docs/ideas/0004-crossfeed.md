# Crossfeed

An agent that tells a podcast network which of its shows should promote a launch, and which pitched guests its listeners actually want, by scoring the network's own lists against each show's audience in Qloo. Ranked 2 of 15 finalists in the [idea ranking](0000-ranking.md), at 20 out of 25.

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

A podcast network grows new shows mostly on its own roster: host-read promos on sister shows, and feed swaps with other networks. Every promo slot displaces sellable ad inventory, so a launch plan spends real money, yet it's planned in a spreadsheet by topic similarity. The same network's bookers face a daily inbox of guest pitches, each written by a publicist to sound on-topic, with no way to see whether the guest's audience overlaps the show's.

- **User:** the head of programming or audience at a podcast network, and the network's bookers.
- **Buyer:** the network, per seat. Independent shows doing feed swaps are a wider second tier.
- **Cost today:** at the generator's order-of-magnitude estimate of $18 to $25 CPM, one 30-second slot on a 500,000-download episode is about $9,000 to $12,000 of foregone revenue, so a 20-slot launch commits around $200,000 of inventory. The CPM range is unsourced; see [risks](#risks-and-open-questions).

## Agent loop

Two jobs share one engine: score a closed list against a show's audience. Launch promos ship first; guest pitches follow if time allows.

Launch promos:

1.  The agent resolves the new show, or, if it's unreleased, **asks** for three comparable shows and resolves those.
2.  It resolves the roster from Spotify IDs, falling back to search, and **asks** about ambiguous matches.
3.  It scores the roster against the new show's audience with explainability, and **asks** for the slot budget and exclusions, such as shows mid-sale.
4.  It pulls demographics for the new show and the top roster shows and flags mismatches.
5.  For the top five, it compares each with the new show and drafts the host-read angle from the shared tags.
6.  It writes an insertion order with the inventory each slot consumes. The human edits and **approves**.

Guest pitches:

1.  The agent reads the booking inbox and extracts each guest and the public work they're promoting.
2.  It resolves each guest only through that work, such as a book, show, or podcast, and skips anyone without one, so no third-party personal data reaches Qloo.
3.  It scores the batch against the show and its best past guests, then proposes an episode angle from shared tags.
4.  It drafts book, decline, or later replies, and the booker **approves** each before it's sent.

## Qloo calls

| Step          | Call                                                                                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resolve       | `/search` with `types=urn:entity:podcast`, `book`, or `tv_show`; `/entities` by Spotify ID                                                                           |
| Score roster  | `/v2/insights`, `filter.type=urn:entity:podcast`, `signal.interests.entities=<new show or comps>`, `filter.results.entities=<roster>`, `feature.explainability=true` |
| Score guests  | Same with `filter.type` set to each guest's work: `book`, `tv_show`, or `podcast`                                                                                    |
| Audience fit  | `/v2/insights`, `filter.type=urn:demographics`, several shows in one call                                                                                            |
| Angle         | `/v2/analysis/compare` between the show and each finalist                                                                                                            |
| Swap partners | `/v2/insights`, `filter.type=urn:entity:podcast`, `filter.exclude.entities=<roster>`                                                                                 |

On 2026-10-16, a five-show roster scored against one business podcast spread from 0.70 to 0.92, in an order a programmer would recognize. Open podcast recommendations from the same show were plausible peers.

## Why Qloo is load-bearing

An LLM pairs a true-crime launch with the network's other true-crime shows, and judges a guest by the keywords a publicist wrote. It can't score the network's own roster or a batch of pitched guests against an audience, and it has no age or gender deltas. Qloo's co-listening signal finds the cross-genre show, or the unexpected guest, whose audience overlaps most.

## Demo

1.  **0:00** A grid of 20 roster tiles for a real network, built from public show names.
2.  **0:20** The agent scores the roster against a new launch. The obvious same-genre show ranks below a show from another genre, and the explainability panel says which comp drove it.
3.  **1:00** The insertion order appears with the dollars of inventory it uses.
4.  **1:30** The inbox tab: 40 pitches collapse into five "book" cards, one of them a guest the booker had skipped.
5.  **2:30** The evidence panel shows each call and entity, and the approval gate before any email is sent.

## Scorecard

Scores run from 1 to 5 against the [matrix](0000-ranking.md#scoring-matrix), including Pull; the mean of the orchestrator and the [round 20](0000-ranking.md#round-20-blind-review-and-final-ranking) blind reviewer is the score. The orchestrator's official scores date from the first ranking; the blind reviewer re-scored all fifteen finalists.

| Criterion                    | Orchestrator | Blind reviewer | Mean | Why                                                                                                          |
| ---------------------------- | ------------ | -------------- | ---- | ------------------------------------------------------------------------------------------------------------ |
| Technological implementation | 5            | 4              | 4.5  | Spotify-ID resolution, closed-list roster scoring with a live 0.70 to 0.92 spread, demographics, and compare |
| Design                       | 4            | 4              | 4    | Two flows to polish in 14 days, so cross-promo ships first                                                   |
| Potential impact             | 4            | 4              | 4    | A named buyer, slots priced as foregone inventory, and a job that recurs with every launch                   |
| Quality of the idea          | 4            | 4              | 4    | The inventory framing is fresh; audience-overlap scoring has 2026 neighbors                                  |
| Pull                         | 4            | 3              | 3.5  | Launch promos are per show; the daily guest inbox is the habit                                               |
| **Official, out of 20**      | 17           | 16             | 16.5 |                                                                                                              |
| **Total, out of 25**         | 21           | 19             | 20   |                                                                                                              |

Related criteria:

- **Field collisions:** none for promo allocation. 2026 repos triage creators' sponsorship inboxes and scout audience overlap for partnerships, so the description must lead with the network's own roster and guests.
- **Safe use:** only public shows and works go to Qloo. Guests are resolved through their public work, and private individuals, email addresses, and sender details never reach Qloo. Results describe audiences, not people.
- **Build risk:** medium. Two flows share one engine, so launch promos ship first; roster resolution is cached once per network.
- **Bonus fit:** strong. Calacanis runs a podcast network, so the demo can use a roster he knows.
- **Panel fit:** commercial use for Boehly and Cedric, and media for Abrams.

## Risks and open questions

- **Coverage:** small roster shows and guests' works may not resolve, or may be sparse. Show unresolved items and let the human map them to comps.
- **Bunching:** guest scores bunch, so present rank and confidence, not precise numbers.
- **Buyer count:** podcast networks number in the hundreds, not the thousands; independent shows doing feed swaps widen it.
- **Unsourced numbers:** the CPM range and slot value are estimates and need sources before the pitch uses them.
- **Relationships:** bookers may weigh relationships over audience fit; the product ranks, and the human decides.

## See also

- [Idea ranking](0000-ranking.md)
- [Brief](/docs/BRIEF.md) and [context](/docs/CONTEXT.md)
