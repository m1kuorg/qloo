# Hold Slip

An agent for independent record, game, comic, and video shops that scores each box of incoming used stock against the favorites the shop's regulars wrote down, and drafts who to call about it. At the counter, it ranks what's in stock for a customer's favorites. Ranked 6 of 15 finalists in the [idea ranking](0000-ranking.md), at 19 out of 25.

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

Independent shops live on the hand-sell: the clerk who knows a regular would love the LP that just came in. Used and one-off stock has no purchase history, so a customer database can't match it, and a clerk remembers only so many regulars. At the counter, a chatbot answers from everything ever made, not from what's on the shelf.

- **User:** the owner or a clerk at an owner-run shop with 100 to 500 regulars. Buy-ins and deliveries come weekly, and new comics on Wednesdays.
- **Buyer:** the shop, on a monthly plan; point-of-sale vendors could bundle it.
- **Cost today:** used stock that sits, and hand-sells missed. No number is sourced yet.
- **On X:** record-shop clerks are taste judges ("believing the record store employee isn't judging your purchase", [thewhostellout][x-judge]), and their approval travels ("ooh nice one", [p_lyons_][x-nice]). A sommelier's customers now "refute her (qualified) knowledge on wine recs because a chatbot tells them otherwise" ([glyphclutter][x-chatbot]).

[x-judge]: https://x.com/thewhostellout/status/2098495822313017437
[x-nice]: https://x.com/p_lyons_/status/2103811896839450807
[x-chatbot]: https://x.com/glyphclutter/status/2098763714216570895

## Agent loop

1.  **Capture.** A card at the register or a QR code on the receipt asks a regular for four favorites in any category. The agent resolves them and **the owner confirms** ambiguous ones. Names stay in the shop's own sheet.
2.  **Intake.** The owner photographs or lists the box, or imports a Discogs or ISBN list, and **confirms** the resolutions.
3.  **Reverse score.** For each arrival, the item is the signal and the regulars' favorites are the closed list, one call per favorite type. The agent maps the top favorites back to the regulars who named them and abstains when Qloo returns null.
4.  **Draft.** The top three regulars per item get a hold slip and a text draft with a one-line why from the compare tags. **The owner picks who to contact and edits the text**; nothing sends on its own.
5.  **Learn.** The owner logs held, bought, or passed, and the agent down-weights favorites that over-predict.
6.  **Counter.** A customer names three loves, and the agent ranks only what's in stock, with "for fans of A and B" shelf talkers drawn from the shop's own pool.

## Qloo calls

| Step          | Call                                                                                                                                                 |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resolve       | `/entities` by ISBN or Spotify ID, then `/search`; records map to the artist, since `album` is a `/search` type only                                 |
| Reverse score | `/v2/insights`, `filter.type=<favorite's type>`, `signal.interests.entities=<arrival>`, `filter.results.entities=<regulars' favorites of that type>` |
| Why line      | `/v2/analysis/compare` with the arrival against a regular's favorites                                                                                |
| Counter       | `/v2/insights`, `signal.interests.entities=<customer's loves>`, `filter.results.entities=<in-stock items of a type>`                                 |

Live checks on 2026-10-17:

- Spirited Away scored ten videogames in a sensible order: Hades 0.84, Celeste 0.80, Hollow Knight 0.78.
- Some pairs return null: Normal People, the book, against nine movies scored nothing, so the tool says "no evidence" instead of padding.
- Release-week titles resolve but mostly score null; used and backlist stock fits best.
- Small acts resolve: Deer Scout did at a popularity of 0.21.

## Why Qloo is load-bearing

A new arrival is in nobody's purchase history, so segments built on past purchases can't place it. An LLM can't say that a regular whose favorites are Hades and Celeste is the one to call about a used Joe Hisaishi soundtrack, and it can't rank 300 regulars' favorites against 40 arrivals. Qloo scores the arrival against each regular's own favorites across categories, and abstains when it has no evidence.

## Demo

1.  **0:00** A box of 40 used LPs and games is photographed at the counter.
2.  **0:20** Each item resolves, and the owner confirms two ambiguous pressings.
3.  **0:40** For each item, the three regulars to call appear, with "ranked by overlap with Hades and Celeste".
4.  **1:10** The owner edits and sends three texts and prints hold slips.
5.  **1:40** A walk-in names Arcane, Mitski, and Persona 5; the counter view ranks the in-stock bins.
6.  **2:10** The week's board shows held, bought, and passed.
7.  **2:30** The evidence panel shows each call.

## Scorecard

Scores run from 1 to 5 against the [matrix](0000-ranking.md#scoring-matrix), including Pull; the mean of the orchestrator and the [round 20](0000-ranking.md#round-20-blind-review-and-final-ranking) blind reviewer is the score.

| Criterion                    | Orchestrator | Blind reviewer | Mean | Why                                                                                             |
| ---------------------------- | ------------ | -------------- | ---- | ----------------------------------------------------------------------------------------------- |
| Technological implementation | 4            | 4              | 4    | Reverse scoring, with arrivals as signals and regulars' favorites as the list; abstains on null |
| Design                       | 4            | 4              | 4    | Hold slips and drafted texts are finished artifacts; photo intake adds scope                    |
| Potential impact             | 3            | 3              | 3    | Weekly buy-ins at many shops, but small money per shop and no number                            |
| Quality of the idea          | 4            | 4              | 4    | Arrivals to people inverts "you may also like"; the hand-sell is the trade rule                 |
| Pull                         | 4            | 4              | 4    | Every box triggers it, and slips and texts travel; seeding takes weeks                          |
| **Official, out of 20**      | 15           | 15             | 15   |                                                                                                 |
| **Total, out of 25**         | 19           | 19             | 19   |                                                                                                 |

Related criteria:

- **Field collisions:** afterglow, shelfwise, and counterpoint sit nearby in 2026; none works from arrivals to people.
- **Safe use:** the shop holds regulars' names and favorites, so consent and deletion are product features; Qloo gets entity IDs only.
- **Build risk:** medium to low. A box of 40 items is about six calls, one per type. Seeding favorites is the weakest link, so the demo ships a seeded shop.
- **Bonus fit:** weak. Small-business software, not a consumer agent.
- **Panel fit:** good for Diolosa, with reverse closed-list scoring, and for Seligman, with a clear data boundary.

## Risks and open questions

- **Capture friction:** the shop must collect favorites from regulars, which takes weeks to seed.
- **Coverage:** null scores are common for books against films and for new releases.
- **Records are artists:** an LP scores as its artist, so a regular who loves one album gets every pressing.
- **Privacy:** regulars' names and favorites are personal data held by the shop; consent and deletion must be in the product, and Qloo gets entity IDs only.
- **Market:** the number of shops and what they'd pay are unsourced, and each shop is small money.
- **Neighbors:** shelfwise does readers' advisory for libraries and bookshops, afterglow learns from what shoppers couldn't find, and counterpoint balances bookshop slates. None works from arrivals to people.

## See also

- [Idea ranking](0000-ranking.md)
- [Brief](/docs/BRIEF.md) and [context](/docs/CONTEXT.md)
