# Dance Card

An agent for wedding and event DJs that asks each guest for one film, show, game, or restaurant they love, then ranks the DJ's own crate for that room with Qloo and flags look-alikes of the couple's do-not-play list. Ranked 1 of 15 finalists in the [idea ranking](0000-ranking.md), at 21 out of 25.

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

A wedding DJ works from the couple's must-play and do-not-play lists, guesses the rest of the room, and takes requests all night. Reading the crowd is the scarce skill, and the DJ is blamed when the couple's picks misfire. Most guests can't name the artists they'd dance to, but every guest can name a show they love.

- **User:** wedding and private-event DJs and wedding bands, often with two or three gigs a weekend in season.
- **Buyer:** the DJ, on a monthly plan; DJ planning tools and booking platforms could license it.
- **Cost today:** planning calls, empty floors, and complaints. No number is sourced yet.
- **On X:** "imagine the 'do not play' list that taylor swift is giving her DJ" drew 51,657 likes ([Tom_Smyth_][x-dnp]), and one couple's list had a single artist, Ed Sheeran ([MaggieMaeFish][x-sheeran]). Guests stack requests ("my 5th request in 20 minutes", [tarullotweets][x-request]). When a couple's pick clashed with the moment, replies pointed out "the DJ isn't the one who chooses the songs" ([makulapictures][x-moment], [tryyagainmf][x-blame]).

[x-dnp]: https://x.com/Tom_Smyth_/status/2072051265744294018
[x-sheeran]: https://x.com/MaggieMaeFish/status/2099903455943094463
[x-request]: https://x.com/tarullotweets/status/2107290126263210355
[x-moment]: https://x.com/makulapictures/status/2068670844897788270
[x-blame]: https://x.com/tryyagainmf/status/2068836582891651559

## Agent loop

1.  **Crate.** The DJ imports a playlist or crate export. The agent maps each primary artist to a Qloo entity, and **the DJ fixes mismatches** and sees what didn't resolve.
2.  **Room.** A link on the invite or a QR code on the table cards asks one question: "Name one film, show, game, or restaurant you love." There are no names and no accounts. The couple can tag answers by family, side A or side B.
3.  **Rank.** The agent scores the crate as a closed list against the room's answers, one call per answer type, merges by rank, and shows which answers drive each artist.
4.  **Lint.** For each must-play and do-not-play artist, it finds that artist's nearest neighbors inside the crate. **The DJ decides** which look-alikes to hold back and raises the list with the couple.
5.  **Block.** Era tags and age skews order arrival, dinner, the floor, and the last hour; for a two-sided room, compare finds the bridge tags. **The DJ approves the gig sheet.**
6.  **Gig.** A shouted request returns its rank for this room, the nearest bridge artist in the crate, and a hold flag. Afterward **the DJ marks each block** full, flat, or empty, so the next gig starts calibrated.

## Qloo calls

| Step            | Call                                                                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resolve         | `/entities` by Spotify ID, then `/search` with `types=urn:entity:artist`; guest answers with `types` for movie, TV show, videogame, or place                                |
| Rank the crate  | `/v2/insights`, `filter.type=urn:entity:artist`, `signal.interests.entities=<guest answers>`, `filter.results.entities=<crate, 50 per page>`, `feature.explainability=true` |
| Look-alikes     | The same call with one must-play or do-not-play artist as the only signal                                                                                                   |
| Age blocks      | The rank call plus `signal.demographics.age=<band>`; `filter.type=urn:demographics` per artist                                                                              |
| Two-sided rooms | `/v2/analysis/compare` with side A's answers against side B's                                                                                                               |
| Occasion filter | `filter.tags=urn:tag:genre:music:wedding` and era tags                                                                                                                      |

Live checks on 2026-10-17:

- **Cross-domain ranking works.** Against a nine-artist crate, Mamma Mia alone put ABBA first. Succession alone put Dua Lipa, Fleetwood Mac, and Kendrick Lamar on top and Frank Sinatra last. With both, explainability split ABBA 58% Mamma Mia, 42% Succession.
- **Look-alikes come from one call.** Ed Sheeran as the only signal ranked Sam Smith, Shawn Mendes, and Taylor Swift first in a 13-artist crate.
- **Age reorders a crate.** In a seven-artist crate, ABBA rose from 6th to 1st for 45 to 54. Affinities moved only 0.05 to 0.15, so the sheet shows rank, not percentages.
- **A full crate fits.** 100 candidates scored in two pages of 50 with continuous affinities, and the wedding genre tag exists.

## Why Qloo is load-bearing

Guests who can't name an artist give an LLM nothing to map, so it falls back on the wedding canon and on age stereotypes. It can't rank a 300-artist crate against 120 answers that mix films, shows, and restaurants, and it can only guess which crate artists sound like the one the couple banned. Qloo scores the DJ's own crate from the room's cross-domain taste and returns the look-alikes as graph neighbors.

## Demo

1.  **0:00** The DJ drops a 300-artist crate.
2.  **0:20** The guest form asks for one film or show; 120 answers arrive, from Mamma Mia to Succession to Bluey.
3.  **0:40** The crate re-sorts for this room, and the bars show which answers drive each artist.
4.  **1:10** The couple's do-not-play Ed Sheeran yields a hold-back list: Sam Smith and Shawn Mendes.
5.  **1:40** The gig sheet blocks the night: arrival, dinner, the floor, the last hour.
6.  **2:10** Mid-gig, a request comes back "212th of 300 for this room", with a bridge artist that's in the top 20.
7.  **2:40** The evidence panel shows each call.

## Scorecard

Scores run from 1 to 5 against the [matrix](0000-ranking.md#scoring-matrix), including Pull; the mean of the orchestrator and the [round 20](0000-ranking.md#round-20-blind-review-and-final-ranking) blind reviewer is the score.

| Criterion                    | Orchestrator | Blind reviewer | Mean | Why                                                                                                  |
| ---------------------------- | ------------ | -------------- | ---- | ---------------------------------------------------------------------------------------------------- |
| Technological implementation | 5            | 5              | 5    | Crate scoring from cross-domain answers, look-alikes, age bands, compare, and tags; four live checks |
| Design                       | 4            | 4              | 4    | The gig sheet and hold-back list are finished artifacts; six screens strain 13 days                  |
| Potential impact             | 4            | 3              | 3.5  | Paid DJs with weekend gigs, but no sourced number and a seasonal trade                               |
| Quality of the idea          | 4            | 5              | 4.5  | Guests name shows, not artists, and look-alikes encode the do-not-play rule; no neighbor             |
| Pull                         | 4            | 4              | 4    | Two or three gigs a weekend in season; guests answer once                                            |
| **Official, out of 20**      | 17           | 17             | 17   |                                                                                                      |
| **Total, out of 25**         | 21           | 21             | 21   |                                                                                                      |

Related criteria:

- **Field collisions:** none for DJs in either field. The nearest 2026 entries seat guests by taste (placecard) or read venue crowds (roomtone).
- **Safe use:** each guest sends one entity name, with no name or account; age skews attach to artists, not to people.
- **Build risk:** medium. A CSV import avoids streaming API terms, a full crate is six to eight paged calls, and demo rooms can be pre-warmed. The mid-gig lookup is the first cut if time runs short.
- **Bonus fit:** moderate. A vertical tool with a paying user and a live demo moment, the crate re-sorting, but not a consumer agent.
- **Panel fit:** the strongest of the fifteen for Diolosa, with closed lists, demographics, compare, tags, and explainability, and for Abrams, in live entertainment without the tour-routing crowd.

## Risks and open questions

- **Artists, not tracks:** Qloo scores artists, so the DJ still picks the song, and lyric-versus-moment clashes stay a human job.
- **Import:** playlist access depends on streaming APIs whose terms change; a CSV paste is the fallback.
- **Response rate:** the guest form needs enough answers; the couple's own answers seed a thin room.
- **Noisy demographics:** a live check showed ABBA at +0.53 for 45 to 54 and -0.72 for 35 to 44, so age blocks are soft cues.
- **Calibration:** whether room rank predicts a full floor is unproven until DJs log blocks.
- **Market:** the number of working wedding DJs and what they'd pay are unsourced, and the work is seasonal.
- **Neighbors:** [Cuesheet](0006-cuesheet.md), already a finalist, also ranks artists from a closed list, but for music supervisors placing songs in film and TV.

## See also

- [Idea ranking](0000-ranking.md)
- [Brief](/docs/BRIEF.md) and [context](/docs/CONTEXT.md)
