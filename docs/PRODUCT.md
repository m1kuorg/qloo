# Product

<!-- impeccable:product-schema 1 -->

Crossfeed is an agent that tells a podcast network which of its own shows should promote a launch, and which pitched guests its listeners actually want, by scoring the network's own lists in Qloo. This is the durable product record that design and build work start from. The [PRD](PRD.md) says what ships for the Qloo Agentic Hackathon, and the [TRD](TRD.md) says how.

Facts marked _(unconfirmed default)_ were inferred from [IDEA.md](IDEA.md), [BRIEF.md](BRIEF.md), and [CONTEXT.md](CONTEXT.md), because the grilling round of 2026-10-17 went unanswered. Each one is listed under [Decisions to confirm](#decisions-to-confirm).

Contents:

1.  [Platform](#platform)
1.  [Stack](#stack)
1.  [Users](#users)
1.  [Product Purpose](#product-purpose)
1.  [Positioning](#positioning)
1.  [Operating Context](#operating-context)
1.  [Capabilities and Constraints](#capabilities-and-constraints)
    1.  [Capabilities](#capabilities)
    1.  [Constraints](#constraints)
    1.  [Terminology](#terminology)
1.  [Brand Commitments](#brand-commitments)
1.  [Evidence on Hand](#evidence-on-hand)
1.  [Product Principles](#product-principles)
1.  [Decisions to confirm](#decisions-to-confirm)
1.  [See also](#see-also)

## Platform

web

## Stack

Delegated _(unconfirmed default)_: the existing Hono and Vite scaffold in [`apps/`](/apps/) on Cloudflare Workers, the Cloudflare Agents SDK as the agent framework, Claude as the model, and direct REST calls to Qloo. The [TRD](TRD.md#architecture) gives the reasons.

## Users

- **Head of programming or audience** at a podcast network. Before each launch, they decide which roster shows carry the launch's host-read promos and how many slots each gets. Today they plan it in a spreadsheet, by topic.
- **Bookers** at the same network. Every day they triage an inbox of guest pitches, each written by a publicist to sound on-topic, and decide whom to book, decline, or hold for later.
- **Buyer:** the network, per seat. Independent shows doing feed swaps are a wider second tier, not a v1 user.
- **Evaluators:** hackathon judges, who may score from the written description alone or open the live demo without an account ([BRIEF](BRIEF.md#submission-checklist)).

## Product Purpose

Every promo slot on a roster show displaces ad inventory the network could sell, so a launch plan spends real money. Crossfeed makes that spend evidence-based: it ranks the network's own roster by how much each show's listeners overlap the launch's, flags demographic mismatches, drafts a host-read angle per finalist, and ends in an insertion order that prices each slot as inventory. The same engine ranks a batch of pitched guests against a show.

Success means a programmer approves an insertion order they wouldn't have drawn up by topic, because the evidence shows a cross-genre show outranks the obvious same-genre one, and they can see which Qloo call and which entities said so.

## Positioning

Co-listening beats topic. An LLM alone pairs a true-crime launch with the network's other true-crime shows and judges a guest by the keywords a publicist wrote. Crossfeed scores the network's closed list (its own roster, its own inbox) against the launch in Qloo, so it can find the cross-genre show, or the unexpected guest, whose listeners overlap most. Neighbors in the 2026 field scout listener overlap for outside partnerships or triage creators' sponsorship inboxes; none allocates a network's own promo inventory ([IDEA](IDEA.md#standing-in-the-ranking)).

## Operating Context

- **Launch planning:** happens once per launch. Inputs are the roster, each show's downloads per episode, the network's CPM, the slot budget, and exclusions such as shows mid-sale. The output is an insertion order the programmer edits and approves.
- **Unreleased launches:** have no listeners yet, so the programmer names up to three comparable released shows (comps) that stand in for the launch.
- **Booking:** happens daily. Pitches arrive as email text; each names a guest and the public work they're promoting, such as a book, show, film, or podcast.
- **Demo:** judges open a hosted URL with no login and see a sample network, built from The Ringer's public show names, that answers from a warm cache ([BRIEF](BRIEF.md#implications-for-our-entry)). Its downloads and CPM are labelled sample inputs, not The Ringer's figures _(unconfirmed default)_.

## Capabilities and Constraints

### Capabilities

- Resolve a roster from show names to Qloo entities, asking the human about ambiguous matches and letting them map misses to comps. Qloo doesn't find podcasts by Spotify ID, so names are the input ([TRD](TRD.md#qloo-integration)).
- Rank a roster against a launch, or its comps, with Qloo explainability.
- Flag demographic mismatches between the launch and its top roster shows.
- Draft a host-read angle per finalist from the tags it shares with the launch.
- Write an insertion order that prices each slot from the network's own downloads and CPM.
- Read a booking inbox, resolve each guest through their public work, rank the pitched works against the show and its best past guests, and draft book, decline, or later replies. This ships second, after launch promos _(unconfirmed default)_.
- Show the evidence behind every claim: the Qloo call, its entities and tags, and the affinities it returned, kept apart from the model's interpretation.

### Constraints

- **The human decides at each fork.** The agent asks about comps, ambiguous matches, the slot budget, and exclusions. Nothing leaves Crossfeed until the human approves the insertion order or each reply.
- **Only public shows and works reach Qloo.** A guest without a public work is skipped, so private individuals, email addresses, and sender details never reach Qloo ([kit safe use][kit-safe]).
- **Results describe listeners, not people.** Affinity is never shown as a probability about an individual, and nothing infers a person's politics, health, or eligibility for anything.
- **Rank over raw score.** Affinity is normalized per query and guest scores bunch, so the UI leads with rank and a band and keeps the raw score in the evidence ([BRIEF](BRIEF.md#reading-results)).
- **Money comes from the network.** Slot value uses the CPM and downloads the network enters. Crossfeed ships no default CPM for real networks, because the $18 to $25 range in the idea is unsourced; the demo's sample CPM is labelled arbitrary.
- **Qloo data stays private.** Responses may be cached server-side but never committed or published ([BRIEF](BRIEF.md#implications-for-our-entry)).

[kit-safe]: https://github.com/qloo/qloo-hackathon-kit/blob/0db91b8d9c5aae2160d53596e57ea6c9da251cde/docs/SAFE_USE.md

### Terminology

Crossfeed uses Qloo's own words (entity, tag, signal, filter, affinity) as defined in the [brief](BRIEF.md#qloo-in-brief), plus these:

- **Network:** a company that owns a roster of podcasts and sells ads on them.
- **Roster:** the network's own shows, the closed list Crossfeed scores.
- **Launch:** the new show a network is promoting, released or not.
- **Comp:** a released show that stands in for an unreleased launch; up to three per launch.
- **Listeners:** the people who hear a show. Crossfeed says listeners, not audience, because Audience is a Qloo term for a group defined by signals.
- **Fit:** how a roster show or pitched work ranks against the launch or show in Qloo, shown as a rank and a band.
- **Finalist:** a roster show the insertion order can use: one of the top five by fit after exclusions.
- **Promo slot:** one host-read promo for the launch on one episode of a roster show.
- **Slot value:** the ad revenue a promo slot displaces: downloads per episode times CPM, divided by 1,000.
- **Insertion order:** the approved launch plan: which shows, how many slots, each slot's angle, and the total slot value.
- **Host-read angle:** a drafted line for a host, built from the tags the show and the launch share.
- **Pitch:** an email in the booking inbox proposing a guest.
- **Public work:** the book, show, film, or podcast a pitched guest is promoting; the only thing about a guest that reaches Qloo.
- **Verdict:** a booker's decision on a pitch: book, decline, or later.
- **Evidence:** the Qloo calls, entities, tags, and affinities behind a claim.

## Brand Commitments

- **Name:** Crossfeed. It was free in the 2025 gallery and the 2026 repos at [round 9](/docs/ideas/0000-ranking.md#round-9-build-and-demo-test), and avoids the crowded "Cultur…" and "Taste…" names ([CONTEXT](CONTEXT.md#strategy-for-our-entry)).
- **Voice:** a programmer's tool. Plain, numerate, and specific about where each number came from.

## Evidence on Hand

- **Spread:** on 2026-10-16, a five-show roster scored against one business podcast spread from 0.70 to 0.92, in an order a programmer would recognize ([Crossfeed idea](/docs/ideas/0004-crossfeed.md#qloo-calls)).
- **Coverage and spread:** on 2026-10-17, `/search` resolved 16 of 19 shows from The Ringer, 11 of 15 from Exactly Right, and 8 of 16 from Pushkin. Scoring 16 candidate shows from The Ringer's roster against The Big Picture spread them from 0.798 to 0.953; the top two were film and TV shows, the same genre as the launch ([TRD](TRD.md#demo-data)).
- **API behavior:** the live checks in the [brief](BRIEF.md#live-api-checks) cover POST bodies, type names, location signals, and the affinity scale.
- **Absent, and not to be fabricated:** customers, testimonials, pricing, a sourced CPM, a sourced count of podcast networks, and any measured time saving.

## Product Principles

1.  **Qloo is the evidence, the model is the narrator.** Every ranking comes from a Qloo call the user can inspect; the model explains it and drafts from it, but never invents a score.
1.  **Closed lists, not open discovery.** Crossfeed ranks what the network already has, its roster and its inbox, which is the decision the user actually owns.
1.  **Ask, don't guess.** When an entity match or a comp choice would change the result, the agent stops and asks.
1.  **Price the decision.** A launch plan is shown in the inventory dollars it spends, from the network's own numbers.
1.  **Nothing ships without a human.** The agent proposes; the human approves.

## Decisions to confirm

Inferred from the docs because the 2026-10-17 grilling round went unanswered. Each is the recommended answer from that round:

1.  **Prize and entries:** Crossfeed is the only entry. It is built for the four scored criteria, and its description also pitches Crossfeed as a company for the Calacanis bonus.
1.  **Scope:** launch promos ship first. Guest pitches ship second, with a cut date in the [PRD](PRD.md#release-plan). Swap partners outside the roster are out of scope.
1.  **Stack:** Workers, the Agents SDK, and Claude, as in [Stack](#stack).
1.  **Demo inbox:** synthetic pitches about real public works, from fictional publicists at `example.com` addresses, labelled as sample data.
1.  **Demo network:** The Ringer, from public show names, with sample downloads and CPM and a not-affiliated notice, per the [TRD](TRD.md#demo-data). Calacanis has two shows, This Week in Startups and All-In, not a roster, so his network can't be the demo.

## See also

- [PRD](PRD.md) and [TRD](TRD.md)
- [Idea](IDEA.md) and the [Crossfeed idea doc](/docs/ideas/0004-crossfeed.md)
- [Brief](BRIEF.md) and [context](CONTEXT.md)
