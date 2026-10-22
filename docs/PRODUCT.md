# Product

<!-- impeccable:product-schema 1 -->

Crossfeed is an agent that tells a podcast network which of its own shows should promote a launch, and which pitched guests its listeners actually want, by scoring the network's own lists in Qloo. It runs as an open demo on a sample network and as a signed-in product a network's members share. This is the durable product record that design and build work start from. The [PRD](PRD.md) says what ships, the [TRD](TRD.md) says how, and [GLOSSARY.md](/GLOSSARY.md) defines the terms.

The choices it rests on were confirmed on 2026-10-17 for the hackathon entry and taken as the spec's defaults on 2026-10-19 for the product, and are listed under [Decisions](#decisions).

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
1.  [Decisions](#decisions)
    1.  [Hackathon decisions](#hackathon-decisions)
    1.  [Product decisions](#product-decisions)
1.  [See also](#see-also)

## Platform

web

## Stack

The Hono and Vite app in [`apps/`](/apps/) on one Cloudflare Worker, the Cloudflare Agents SDK as the agent framework, with a Durable Object per demo session, per network, and per launch, a D1 database as the directory of members and networks, passkeys verified in-house, Claude Haiku 5.5 as the model, and direct REST calls to Qloo. A TypeScript SDK, an MCP server, Agent Skills, and a Claude Code plugin sit over the app's REST API. The [TRD](TRD.md#architecture) gives the reasons.

## Users

- **Members** of a podcast network, each signed in with a passkey:
  - **Head of programming or audience.** Before each launch, they decide which roster shows carry the launch's host-read promos and how many slots each gets. Today they plan it in a spreadsheet, by topic.
  - **Bookers.** Every day they triage an inbox of guest pitches, each written by a publicist to sound on-topic, and decide whom to book, decline, or hold for later.
- **Owners:** the members who also manage who's in the network, its invite links, its API keys, its own Qloo key, and deleting it. The member who creates a network owns it, and owners can make others owners.
- **Developers and assistants** acting for a network through an API key: scripts on the REST API or the SDK, and AI assistants such as Claude Code over the MCP server. They work on the roster, launches, and inbox as members do, short of approving, and can't manage the network's members, invite links, API keys, or Qloo key, or delete a launch or the network.
- **Visitors:** anyone opening the sample network at `/demo` without signing in, including hackathon judges, who may score from the written description alone or open the live demo ([BRIEF](BRIEF.md#submission-checklist)).
- **Buyer:** the network. Independent shows doing feed swaps are a wider second tier, not a user yet. The beta is free and names no price.

## Product Purpose

Every promo slot on a roster show displaces ad inventory the network could sell, so a launch plan spends real money. Crossfeed makes that spend evidence-based: it ranks the network's own roster by how much each show's listeners overlap the launch's, flags demographic mismatches, drafts a host-read angle per finalist, and ends in an insertion order that prices each slot as inventory. The same engine ranks a batch of pitched guests against a show.

Success means a programmer approves an insertion order they wouldn't have drawn up by topic, because the evidence shows a cross-genre show outranks the obvious same-genre one, and they can see which Qloo call and which entities said so. As a product, it means a network keeps its roster, its launches, and its inbox in Crossfeed, works on them as a team, and lets its scripts and assistants do the legwork while its members keep every approval.

## Positioning

Co-listening beats topic. An LLM alone pairs a true-crime launch with the network's other true-crime shows and judges a guest by the keywords a publicist wrote. Crossfeed scores the network's closed list (its own roster, its own inbox) against the launch in Qloo, so it can find the cross-genre show, or the unexpected guest, whose listeners overlap most. Neighbors in the 2026 field scout listener overlap for outside partnerships or triage creators' sponsorship inboxes; none allocates a network's own promo inventory ([IDEA](IDEA.md#standing-in-the-ranking)).

## Operating Context

- **Launch planning:** happens once per launch, and a network often plans several at once. Inputs are the roster, each show's downloads per episode, the network's CPM, the slot budget, and exclusions such as shows mid-sale. The output is an insertion order the programmer edits, a member approves, and ad operations receives as CSV.
- **Unreleased launches:** have no listeners yet, so the programmer names up to three comparable released shows (comps) that stand in for the launch.
- **Booking:** happens daily. Pitches arrive as email; each names a guest and the public work they're promoting, such as a book, show, film, or podcast. A booker loads them as the email client exports them, as `.eml` files, an `.mbox`, or text.
- **Members together:** a network's head of programming and its bookers share one roster, one inbox, and every launch, and see each other's changes as they're made. A person can belong to several networks.
- **Automation:** a network's developers script imports and runs through the API or the SDK, and a programmer can plan a launch with an assistant over MCP, which relays the agent's questions and never approves.
- **Demo:** judges open the landing page at `/`, whose first button opens a sample network at `/demo` with no sign-in, built from The Ringer's public show names, that answers from a warm cache ([BRIEF](BRIEF.md#implications-for-our-entry)). Its downloads and CPM are labelled sample inputs, not The Ringer's figures.

## Capabilities and Constraints

### Capabilities

- Resolve a roster from show names to Qloo entities, asking the human about ambiguous matches and letting them map misses to comps. Qloo doesn't find podcasts by Spotify ID, so names are the input ([TRD](TRD.md#qloo-integration)).
- Rank a roster against a launch, or its comps, with Qloo explainability.
- Flag demographic mismatches between the launch and its top roster shows.
- Draft a host-read angle per finalist from the tags it shares with the launch, and none where Qloo returned no shared tags.
- Write an insertion order that prices each slot from the network's own downloads and CPM.
- Read a booking inbox, resolve each guest through their public work, rank the pitched works against the show and its best past guests, and draft book, decline, or later replies.
- Show the evidence behind every claim: the Qloo call, its entities and tags, and the affinities it returned, kept apart from the model's interpretation.
- Keep a network's roster, inbox, and launches for its members: passkey sign-in with a recovery code, networks with owners and members, invite links, a dashboard of launches with a setup checklist, each launch planned on its own with every run kept, and teammates' changes shown live.
- Take the network's own files: a roster CSV or a text file of names, and pitch emails as `.eml`, `.mbox`, or text, re-importing a roster without undoing what was settled.
- Let owners set the network's name and CPM, manage members, invite links, and API keys, bring the network's own Qloo key, see today's usage against the daily caps, and delete the network; let every member manage their own account, and delete it so that Crossfeed forgets them in every network they were in, now or before.
- Serve programs and assistants: a REST API with an OpenAPI document, a typed TypeScript SDK, an MCP server, two Agent Skills, a Claude Code plugin, and developer docs at `/docs` and `/llms.txt`.

### Constraints

- **The human decides at each fork.** The agent asks about comps, ambiguous matches, the slot budget, and exclusions. Nothing leaves Crossfeed until the human approves the insertion order or each reply.
- **Only a member approves, in the app.** The API, the SDK, the MCP server, and the skills can import, run, answer the agent's questions with a person's words, and edit drafts, but never approve, and they export an order only once a member has approved it ([ADR 0002](/docs/adr/0002-approval-stays-in-the-app.md)).
- **Only public shows and works reach Qloo.** A guest without a public work is skipped, so private individuals, email addresses, and sender details never reach Qloo, whether a pitch is pasted, uploaded, or sent through the API ([kit safe use][kit-safe]).
- **Results describe listeners, not people.** Affinity is never shown as a probability about an individual, and nothing infers a person's politics, health, or eligibility for anything.
- **Rank over raw score.** Affinity is normalized per query and guest scores bunch, so the UI leads with rank and a band and keeps the raw score in the evidence ([BRIEF](BRIEF.md#reading-results)).
- **Money comes from the network.** Slot value uses the CPM and downloads the network enters. Crossfeed ships no default CPM for real networks, because the $18 to $25 range in the idea is unsourced; the demo's sample CPM is labelled arbitrary.
- **Qloo data stays private.** Responses may be cached server-side but never committed or published ([BRIEF](BRIEF.md#implications-for-our-entry)). The shared cache serves every visitor and every network without its own Qloo key, so a cache hit can show that another looked up the same name.
- **A network's data is its own.** Only its members and its own API keys can reach its roster, launches, pitches, and keys; to anyone else it doesn't exist.
- **The beta runs on Crossfeed's hackathon Qloo key.** That key can't be resold or shared, so every network runs within daily caps of its own, and an owner can bring the network's own Qloo key; selling Crossfeed or opening it past the beta needs a commercial Qloo agreement or each network's own key ([ADR 0004](/docs/adr/0004-qloo-key-per-network.md)).
- **No email and no passwords.** Members sign in with passkeys only and recover with a one-time code; Crossfeed asks for a name and nothing else ([ADR 0003](/docs/adr/0003-passkeys-built-in-house.md)).
- **Free, with limits.** No payments or prices. Limits per visitor and per network, on accounts, networks, launches, invite links, and text lengths, are listed on the beta terms and say what they refused.
- **The agent's words are a record.** A run's closing line stays as Claude wrote it; once the order or a reply is edited, the product says so beside it rather than rewriting it.

[kit-safe]: https://github.com/qloo/qloo-hackathon-kit/blob/0db91b8d9c5aae2160d53596e57ea6c9da251cde/docs/SAFE_USE.md

### Terminology

Crossfeed uses Qloo's own words (entity, tag, signal, filter, affinity) as defined in the [brief](BRIEF.md#qloo-in-brief), plus the terms in [GLOSSARY.md](/GLOSSARY.md), such as network, member, owner, invite, passkey, recovery code, API key, visitor, sample network, roster, launch, comp, fit, finalist, slot value, insertion order, pitch, public work, verdict, evidence, and approval.

## Brand Commitments

- **Name:** Crossfeed. It was free in the 2025 gallery and the 2026 repos at [round 9](/docs/ideas/0000-ranking.md#round-9-build-and-demo-test), and avoids the crowded "Cultur…" and "Taste…" names ([CONTEXT](CONTEXT.md#strategy-for-our-entry)).
- **Voice:** a programmer's tool. Plain, numerate, and specific about where each number came from.

## Evidence on Hand

- **Spread:** on 2026-10-16, a five-show roster scored against one business podcast spread from 0.70 to 0.92, in an order a programmer would recognize ([Crossfeed idea](/docs/ideas/0004-crossfeed.md#qloo-calls)).
- **Coverage and spread:** on 2026-10-17, `/search` resolved 16 of 19 shows from The Ringer, 11 of 15 from Exactly Right, and 8 of 16 from Pushkin. Scoring 16 candidate shows from The Ringer's roster against The Big Picture spread them from 0.798 to 0.953; the top two were film and TV shows, the same genre as the launch ([TRD](TRD.md#demo-data)).
- **The sample launch:** The Watch's chart moves The Bill Simmons Podcast from topic rank 9 or 10 to fit rank 4, a finalist, and drops the network's two music shows to 13th and 14th ([SUBMISSION](SUBMISSION.md#what-breaks-without-qloo)).
- **API behavior:** the live checks in the [brief](BRIEF.md#live-api-checks) cover POST bodies, type names, location signals, and the affinity scale.
- **Absent, and not to be fabricated:** customers, testimonials, pricing, a sourced CPM, a sourced count of podcast networks, a count of networks or members using the beta, and any measured time saving.

## Product Principles

1.  **Qloo is the evidence, the model is the narrator.** Every ranking comes from a Qloo call the user can inspect; the model explains it and drafts from it, but never invents a score.
1.  **Closed lists, not open discovery.** Crossfeed ranks what the network already has, its roster and its inbox, which is the decision the user actually owns.
1.  **Ask, don't guess.** When an entity match or a comp choice would change the result, the agent stops and asks, and an assistant relays the question to a person rather than answering it.
1.  **Price the decision.** A launch plan is shown in the inventory dollars it spends, from the network's own numbers.
1.  **Nothing ships without a human.** The agent proposes, programs and assistants prepare, and a member approves.

## Decisions

### Hackathon decisions

Confirmed on 2026-10-17 in [#20](https://github.com/m1kuorg/qloo/issues/20). Each is the grilling round's recommended answer, except the model, which is Claude Haiku 5.5:

1.  **Prize and entries:** Crossfeed is the only entry. It is built for the four scored criteria, and its description also pitches Crossfeed as a company for the Calacanis bonus.
1.  **Scope:** launch promos shipped first, and guest pitches second, switched on in production after their live check ([#57](https://github.com/m1kuorg/qloo/issues/57)). Swap partners outside the roster are out of scope.
1.  **Stack:** Workers, the Agents SDK, and Claude Haiku 5.5, as in [Stack](#stack).
1.  **Demo inbox:** synthetic pitches about real public works, from fictional publicists at `example.com` addresses, labelled as sample data.
1.  **Demo network:** The Ringer, from public show names, with sample downloads and CPM and a not-affiliated notice, per the [TRD](TRD.md#demo-data). Calacanis has two shows, This Week in Startups and All-In, not a roster, so his network can't be the demo.
1.  **License:** MIT.

### Product decisions

Taken on 2026-10-19 in the product spec, [#155](https://github.com/m1kuorg/qloo/issues/155), each the recommended answer of a grilling round that went unanswered, with four recorded as ADRs:

1.  **Agents per network and launch, with a D1 directory** ([ADR 0001](/docs/adr/0001-agents-per-network-and-launch.md)): a `NetworkAgent` per network and a `LaunchAgent` per launch, beside the demo's per-session agent; D1 holds only the directory: members, passkeys, sessions, sign-in challenges, networks, memberships, invites, API keys, and the agent wipes still due.
1.  **Approval stays in the app** ([ADR 0002](/docs/adr/0002-approval-stays-in-the-app.md)): API keys reach everything but approval.
1.  **Passkeys, built in-house** ([ADR 0003](/docs/adr/0003-passkeys-built-in-house.md)): no password, email, or OAuth; a recovery code instead of email recovery.
1.  **A network can bring its own Qloo key** ([ADR 0004](/docs/adr/0004-qloo-key-per-network.md)): the beta runs on the hackathon key within per-network caps.
1.  **Release:** the same Worker; `/` is the landing page, the sample network moves to `/demo` with no sign-in, and signed-in networks live under `/app`, behind the `ACCOUNTS` switch until the product passes on the preview, by 2026-10-29 or after judging ends on 2026-11-16 ([PRD](PRD.md#release-plan)).
1.  **Networks and members:** a network has owners and members; a person can belong to several networks and joins through an invite link.
1.  **Launches:** the spec's "projects" are launches. The dashboard lists them; the roster and the inbox belong to the network.
1.  **Billing:** none. No payments and no invented prices; settings show usage against the daily caps under a "Beta" label.
1.  **Publishing:** the SDK, the MCP server, the skills, and the plugin are built in the repo and served by the live app; publishing to npm or a public marketplace waits for approval in [#63](https://github.com/m1kuorg/qloo/issues/63), like the repository itself.

## See also

- [PRD](PRD.md), [TRD](TRD.md), and [DESIGN.md](DESIGN.md)
- [GLOSSARY.md](/GLOSSARY.md) and the ADRs in [docs/adr/](/docs/adr/)
- [Idea](IDEA.md) and the [Crossfeed idea doc](/docs/ideas/0004-crossfeed.md)
- [Brief](BRIEF.md) and [context](CONTEXT.md)
