# Vouch

An agent that keeps your five-star log across media and, when a friend asks what to read or watch, picks the three from your own shelf they'll love, for you to send with your own line. A curator can publish the shelf as a link that ranks it for each visitor. Ranked 11 of 15 finalists in the [idea ranking](0000-ranking.md), at 17 out of 25.

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

The friend with taste gets asked every week, and answers with their most famous favorite rather than the one this friend would love. The asker's loves are often in another category: "I like Arcane and Mitski, what should I read?" Critics, newsletter writers, and booksellers publish lists, but a list doesn't rank itself for the reader.

- **User:** the person friends ask for recommendations; critics, newsletter writers, and booksellers in curator mode.
- **Buyer:** free for individuals; curators pay for the link and earn affiliate revenue. None of this is validated.
- **Cost today:** misfired recs and forgotten favorites. Nothing here is priced.
- **On X:** a reader "forgets the names, plots, authors, and every 5 star read i've ever read" ([mariaoarchive][x-forgets]). A short list of favorites works as a trust signal ("If you've played even one of these, I trust your taste in games", [gameunlocked26][x-trust]).

[x-forgets]: https://x.com/mariaoarchive/status/2085444057115816368
[x-trust]: https://x.com/gameunlocked26/status/2081439409870663867

## Agent loop

1.  **Build the shelf.** The user imports Letterboxd, Goodreads, or StoryGraph exports, or types their five-stars. The agent resolves them, and titles that don't resolve stay on the shelf as "unscored".
2.  **Take the ask.** The user enters the friend's three favorites in any category and any bans, or sends the friend a link to type them.
3.  **Rank the shelf.** The agent scores the shelf of the requested type against the friend's favorites as a closed list, excluding bans and anything the friend has seen.
4.  **Pick.** **The user picks three** of the top five; each shows which of the friend's favorites it leans on.
5.  **Write.** **The user writes or edits a one-line note** for each pick; the agent never fakes the user's voice.
6.  **Send.** The card goes to the chat where the ask came. In curator mode, the shelf is a public link, and each visitor's three favorites rank it for them.

## Qloo calls

| Step       | Call                                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shelf      | `/search`; `/entities` by ISBN, IMDb, or Spotify ID                                                                                                                 |
| Rank       | `/v2/insights`, `filter.type=urn:entity:<type>`, `signal.interests.entities=<the friend's favorites>`, `filter.results.entities=<shelf>`, `filter.exclude.entities` |
| Leans on   | The same call with one of the friend's favorites at a time                                                                                                          |
| Shared tag | `/v2/analysis/compare` with the pick against the friend's favorites, for a "you both like" line                                                                     |

Live checks on 2026-10-17 found that favorites from other categories reorder a pool, and that scores reflect co-engagement, not content: with Gone Girl, the book, as the signal, Lady Bird scored 0.87 and the Gone Girl film 0.76. Some books score null against films, so those picks show as "no evidence".

## Why Qloo is load-bearing

An LLM ranks your shelf by fame, so the friend gets your most famous five-star, not the one they'd love. It guesses when the friend's favorites sit in another category. Qloo scores your actual shelf against the friend's favorites across categories.

## Demo

1.  **0:00** A text arrives: "I loved Arcane and Mitski's last album. What should I read?"
2.  **0:20** The agent ranks the user's 140 five-star books against those two.
3.  **0:40** The top five show which favorite each leans on; the user picks three and writes a line for each.
4.  **1:20** The card lands in the chat.
5.  **1:50** Curator mode: a newsletter's 60-book list becomes a link, and three visitors with different favorites get different top threes.
6.  **2:30** The evidence panel shows each call.

## Scorecard

Scores run from 1 to 5 against the [matrix](0000-ranking.md#scoring-matrix), including Pull; the mean of the orchestrator and the [round 20](0000-ranking.md#round-20-blind-review-and-final-ranking) blind reviewer is the score.

| Criterion                    | Orchestrator | Blind reviewer | Mean | Why                                                                                  |
| ---------------------------- | ------------ | -------------- | ---- | ------------------------------------------------------------------------------------ |
| Technological implementation | 3            | 3              | 3    | One closed-list scoring call plus lookups                                            |
| Design                       | 4            | 4              | 4    | Pick three, write a line, send the card; simple and finished                         |
| Potential impact             | 3            | 2              | 2.5  | Free and unpriced; the curator link is an unvalidated business                       |
| Quality of the idea          | 4            | 3              | 3.5  | Your own shelf ranked for a friend; mirrors Sieve, with shelfwise and kindred nearby |
| Pull                         | 4            | 4              | 4    | The friend with taste is asked weekly, and the card is always sent                   |
| **Official, out of 20**      | 14           | 12             | 13   |                                                                                      |
| **Total, out of 25**         | 18           | 16             | 17   |                                                                                      |

Related criteria:

- **Field collisions:** shelfwise, kindred, and present-company sit nearby in 2026; none ranks a person's own shelf for a friend's ask.
- **Safe use:** the friend is three titles and some bans; no name reaches Qloo.
- **Build risk:** low.
- **Bonus fit:** weak alone. As the reply mode of [Sieve](0012-sieve.md), it strengthens Sieve.
- **Panel fit:** thin for Diolosa, with one call per ask.

## Risks and open questions

- **Shallow chain:** one scoring call per ask, plus lookups, which caps Technological implementation.
- **Shared engine:** it ranks a closed list exactly as [Sieve](0012-sieve.md) does, from the other side of the exchange.
- **Shelf import:** export formats vary, and non-Western titles may not resolve.
- **Neighbors:** shelfwise does readers' advisory for libraries, and kindred plans a gift and an outing for one friend. Vouch ranks the user's own shelf for a friend's ask.
- **Name:** free in both fields, but mitchellh/vouch, a well-known open-source project, uses it.

## See also

- [Idea ranking](0000-ranking.md)
- [Brief](/docs/BRIEF.md) and [context](/docs/CONTEXT.md)
