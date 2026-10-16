# Sieve

An agent that keeps every recommendation you're given, from a reply thread that blew up, a friend's text, a shop shelf, or a festival lineup, and ranks that pile against your favorites with Qloo when you ask what's next. Ranked 4 of 15 finalists in the [idea ranking](0000-ranking.md), at 20 out of 25.

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

Recommendations arrive in piles that nobody ranks for you. A "recommend me" post on X draws hundreds of replies: bare titles, cover images, self-promotion, and the canon the asker wanted to escape. A friend's "you HAVE to watch this" text sinks in the chat. In a bookshop or in front of a festival poster, the list is right there, and nothing ranks it for your taste.

- **User:** anyone who asks for or gets recommendations: thread askers and the people who read those threads, friends who text each other recs, browsers in shops, festival-goers.
- **Buyer:** consumers, free with a paid tier, plus affiliate links on picks for books and tickets; communities such as Discord servers, subreddits, and newsletters could embed the bot. None of this is validated.
- **Cost today:** scrolling hundreds of replies, the 40-minute streaming scroll, and recs forgotten before they're tried.
- **On X:** an ask for "American comic books that aren't Superheroes" drew 8,488 likes, and its top replies are mostly images ([GothTransFem][x-goth]). The top reply to "a movie that will absolutely destroy me in the most beautiful way possible" is a single title, with hundreds more below it ([Mr_Husky1][x-husky], [OverTheTopSVC][x-top]). Askers dread the canon: "you give me a drake j cole or kendrick album im reporting your account" ([Space2021122][x-space]). Others ask why they pay monthly "to scroll for 40 minutes & still find nothing to watch" ([Atuhairecarol10][x-scroll]).

[x-goth]: https://x.com/GothTransFem/status/2110538392249287058
[x-husky]: https://x.com/Mr_Husky1/status/2104954624826544180
[x-top]: https://x.com/OverTheTopSVC/status/2105113267794551284
[x-space]: https://x.com/Space2021122/status/2088448990421360925
[x-scroll]: https://x.com/Atuhairecarol10/status/2106405711466959227

## Agent loop

1.  **Capture.** The user pastes a thread link or its text, shares a photo of a shelf or a lineup poster, screenshots a streaming row, or forwards a friend's rec from a chat. The agent extracts titles from text and images, drops self-promotion where the reply's author is the title's creator, and dedupes. Each item keeps who suggested it and when.
2.  **Resolve.** It resolves each title to a Qloo entity of the right type and **asks** about ambiguous matches, such as "Dune the novel or the 2021 film?". Comics need this step most.
3.  **Anchor.** The user names three to five favorites from any category once, plus bans and a seen list. Anchors refresh from what they finish and rate.
4.  **Rank.** It scores the pile per type as a closed list against the anchors, excludes what's seen, and marks titles Qloo can't score as "no evidence" instead of guessing.
5.  **Explain.** One scoring call per anchor gives each pick its "leans on your Past Lives" line, and popularity marks canon versus deep cut.
6.  **Act.** The user **picks** from the top five. The agent renders the card and offers to post it back into the thread. When the user finishes a friend's rec, it drafts a "you were right" text that **the user edits and sends**.

Friends' names and reply authors stay in the app; only titles reach Qloo.

## Qloo calls

| Step           | Call                                                                                                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resolve        | `/search` with `types=urn:entity:<book, movie, tv_show, artist, videogame, or podcast>`; `/entities` by ISBN, IMDb, or Spotify ID                                             |
| Rank the pile  | POST `/v2/insights`, `filter.type=urn:entity:<type>`, `signal.interests.entities=[{id, weight}]` for the anchors, `filter.results.entities=<pile>`, `filter.exclude.entities` |
| Reasons        | The same call with one anchor at a time                                                                                                                                       |
| Friend overlap | `/v2/analysis/compare` with `a.signal.interests.entities=<a friend's recs>` and `b.signal.interests.entities=<the user's anchors>`, for the tags a friend's recs share        |

Live checks on 2026-10-17 support the core call:

- A 100-title closed list scored in two pages of 50, in 4.2 and 2.4 seconds.
- Anchors from other categories (Phoebe Bridgers, Stardew Valley, and Normal People) reordered a 20-film pool: Memento fell from 2nd to 12th and Good Will Hunting rose from 9th to 2nd.
- Films resolved 4 of 4 and games 8 of 8, but comics searched as books resolved 3 of 6 to the wrong entity.
- Explainability split three anchors almost evenly for every candidate, so reasons need one call per anchor.
- Weighted anchors take `{"id": ..., "weight": ...}`; `{"entity": ...}` returns 400.

## Why Qloo is load-bearing

An LLM asked to rank 400 titles against four favorites ranks the ones it recognizes, which is exactly the canon the asker is trying to escape, and it invents reasons for titles it barely knows. Qloo scores every title in the pile against this user's anchors, across categories, including titles the model never read, and returns popularity so deep cuts show.

A day-one benchmark makes this checkable: on ten real threads, compare the median popularity percentile of an LLM's top five with Sieve's, and how many of each the asker would actually try.

## Demo

1.  **0:00** A rec thread with 8,000 likes and 600 replies, mostly bare titles and posters.
2.  **0:15** Paste the link: 214 titles stream in from text and images, with 31 duplicates merged and 9 self-promotions dropped.
3.  **0:35** The agent asks whether "Paprika" means the 2006 anime or the 1991 film.
4.  **0:50** The top five card: each pick shows who suggested it and which favorite it leans on.
5.  **1:20** A photo of a bookshop table: three spines circled.
6.  **1:50** A friend's "you HAVE to watch Severance" text is saved. On Friday, "what tonight?" ranks the whole pile, and after the finale the agent drafts "you were right".
7.  **2:30** The evidence panel shows each call and anchor.

## Scorecard

Scores run from 1 to 5 against the [matrix](0000-ranking.md#scoring-matrix), including Pull; the mean of the orchestrator and the [round 20](0000-ranking.md#round-20-blind-review-and-final-ranking) blind reviewer is the score.

| Criterion                    | Orchestrator | Blind reviewer | Mean | Why                                                                                      |
| ---------------------------- | ------------ | -------------- | ---- | ---------------------------------------------------------------------------------------- |
| Technological implementation | 4            | 4              | 4    | Resolve, confirm, weighted closed-list scoring, and per-anchor reasons; five live checks |
| Design                       | 5            | 4              | 4.5  | One paste or photo ends in a ranked card that posts itself; image extraction adds scope  |
| Potential impact             | 3            | 3              | 3    | A huge audience with a frequent job, but no buyer and no priced cost                     |
| Quality of the idea          | 5            | 3              | 4    | Ranks what people suggested instead of recommending; shares an engine with Vouch         |
| Pull                         | 5            | 4              | 4.5  | Rec threads daily and friends' texts weekly; the card goes back into the thread          |
| **Official, out of 20**      | 17           | 14             | 15.5 |                                                                                          |
| **Total, out of 25**         | 22           | 18             | 20   |                                                                                          |

Related criteria:

- **Field collisions:** none found for threads, chats, shelves, or lineups in either field. TasteGate audits AI-generated recommendations, and shelfwise ranks a library's shelf for a patron.
- **Safe use:** only titles reach Qloo; reply authors and friends' names stay in the app.
- **Build risk:** medium. Thread access is the risk, since X's API is paid, so pasted text, screenshots, Bluesky, and Reddit come first. A 400-title pile is eight to ten paged calls.
- **Bonus fit:** strong on what Calacanis says he wants: a consumer agent people use by pasting or snapping a photo, shareable as a bot link, and light on tokens because Qloo does the ranking. The cross-vendor check in round 20 made it its cash pick.
- **Panel fit:** moderate for Diolosa, one mechanic done well; clean for Seligman; lineups for Abrams.

## Risks and open questions

- **Thread access:** X's API is paid, and cookie scraping breaks its terms. Start with pasted text and screenshots, Bluesky's open API, and Reddit; add X when the cost is known.
- **Extraction:** reading titles from cover images and slang needs a vision model and a confirm step; misreads must show, not vanish.
- **Coverage:** comics resolve poorly, and small-press and non-Western titles are unverified. Null scores must read as "no evidence".
- **Mixed piles:** a thread that mixes books and films needs one ranking per type, merged by rank.
- **Shared engine:** Sieve and [Vouch](0015-vouch.md) rank a closed list the same way; entered together, they'd look like one engine with two front doors.
- **Market:** the buyer and the affiliate model are unvalidated, so Potential impact rests on frequency, not on a priced saving.
- **Name:** free in both fields, though several unrelated GitHub tools use "sieve".

## See also

- [Idea ranking](0000-ranking.md)
- [Brief](/docs/BRIEF.md) and [context](/docs/CONTEXT.md)
