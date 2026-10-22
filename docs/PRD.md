# PRD

What Crossfeed ships, written from the side of the people who use it: the open demo entered in the Qloo Agentic Hackathon, and the signed-in product built on it for a network to run for real ([spec #155](https://github.com/m1kuorg/qloo/issues/155)). [PRODUCT.md](PRODUCT.md) holds the durable product record, [GLOSSARY.md](/GLOSSARY.md) the terms, [TRD.md](TRD.md) the technical design, and [docs/adr/](/docs/adr/) the decisions the product rests on.

Contents:

1.  [Problem Statement](#problem-statement)
1.  [Solution](#solution)
    1.  [Launch promos](#launch-promos)
    1.  [Guest pitches](#guest-pitches)
    1.  [Evidence and approval](#evidence-and-approval)
    1.  [The sample network](#the-sample-network)
    1.  [Networks and members](#networks-and-members)
    1.  [Launches, each planned on its own](#launches-each-planned-on-its-own)
    1.  [The roster and the inbox, with uploads](#the-roster-and-the-inbox-with-uploads)
    1.  [Settings and the account page](#settings-and-the-account-page)
    1.  [The API, the SDK, MCP, and skills](#the-api-the-sdk-mcp-and-skills)
    1.  [Success criteria](#success-criteria)
1.  [User Stories](#user-stories)
    1.  [Roster setup stories](#roster-setup-stories)
    1.  [Launch promo stories](#launch-promo-stories)
    1.  [Guest pitch stories](#guest-pitch-stories)
    1.  [Evidence and trust stories](#evidence-and-trust-stories)
    1.  [Demo and operation stories](#demo-and-operation-stories)
    1.  [Product stories](#product-stories)
1.  [Implementation Decisions](#implementation-decisions)
1.  [Testing Decisions](#testing-decisions)
1.  [Out of Scope](#out-of-scope)
1.  [Further Notes](#further-notes)
    1.  [Release plan](#release-plan)
    1.  [Submission deliverables](#submission-deliverables)
    1.  [Bets after the 2026-10-17 checks](#bets-after-the-2026-10-17-checks)
1.  [See also](#see-also)

## Problem Statement

I run programming at a podcast network. When we launch a show, I promote it on our own roster with host-read promos, and every promo slot is an ad I didn't sell. A 20-slot launch gives away 20 ads on our biggest shows, but I plan it in a spreadsheet by topic: the new true-crime show goes on our other true-crime shows. I have no way to see whether a show from another genre shares more of the launch's listeners, or whether the obvious pick has the wrong age or gender mix. My bookers have the same blind spot every day: each guest pitch is written to sound on-topic, and nothing tells them whether the guest's work draws the same listeners as our show.

The demo shows me which of my shows share a launch's listeners, priced as the inventory each promo slot gives away. To use it for real, I need more than one browser's session: my network kept in Crossfeed, my teammates in it, every launch I'm planning kept on its own, my roster file and my inbox export loaded as they are, settings I control, and a way for our scripts and AI assistants to run it without ever approving something on my behalf.

## Solution

Crossfeed is an agent that scores the network's own lists, its roster and its booking inbox, against a show in Qloo, asks the human at each fork, and hands back a plan to approve. It runs in two places on one Worker: the sample network at `/demo`, open to any visitor, and signed-in networks under `/app`, which the `ACCOUNTS` switch turns on.

### Launch promos

The programmer names the launch, or up to three comps if it's unreleased. Crossfeed ranks the roster by fit, next to the ranking a topic-only planner would produce, so the moves Qloo caused are visible. It asks for the slot budget and exclusions, takes the top five shows by fit as finalists, flags demographic mismatches among them, finds the tags each finalist shares with the launch, and writes an insertion order that spreads the budget across the finalists, priced from the network's own downloads and CPM. A finalist gets a host-read angle drafted only from the tags Qloo returned; one Qloo returned none for has no angle, and the order says "No angle: Qloo returned no shared tags." The programmer edits and approves the order, then exports it as CSV.

### Guest pitches

The booker picks the show, names the public works of its best past guests, and loads the inbox. Crossfeed extracts each guest's public work, resolves the work in Qloo, and sets aside any pitch without one. It ranks the pitched works against the show and those past guests in one list per work type, because Qloo scores from separate calls can't be compared, proposes an episode angle for each top pitch from the tags it shares with the show, and drafts book, decline, or later replies for the booker to approve one by one. The flow shipped second and has been on in production since its live check ([#57](https://github.com/m1kuorg/qloo/issues/57)).

### Evidence and approval

Every ranking opens to its evidence: the Qloo call, the entities and tags it used, and the affinities it returned, shown apart from the agent's interpretation. Nothing is exported or copied out until a person approves it, in the app. A run ends with the agent's closing line, kept as Claude wrote it; once a member edits the insertion order or a reply, the app, the API, and the MCP server say so beside the line, and the order's and replies' own figures are the ones to trust.

### The sample network

The landing page at `/` explains Crossfeed in one screen, with an illustrative chart of made-up shows, and its first button opens the sample network at `/demo` with no sign-in. The sample network opens on The Ringer's public show names with labelled sample figures, a guide through the sample launch, a stored run that replays when Qloo can't be called, and daily limits per visitor. An old `/inbox` link opens the sample inbox at `/demo/inbox`. While `ACCOUNTS` is on, the landing page and the demo also offer "Create your network".

### Networks and members

A member signs up with a name and a passkey, keeps a one-time recovery code, and signs in with the passkey alone (no password and no email). They create a network, which they own, and invite teammates with a link that works once and expires after seven days. A network has owners and members: owners manage members, invite links, API keys, the network's own Qloo key, and deleting the network; everyone in the network works on its roster, launches, and inbox, and sees teammates' changes as they're made. A member can belong to several networks and switches between them from the top bar; `/app` opens the one they used last.

### Launches, each planned on its own

The dashboard lists the network's launches with each one's status, finalists, slots, total slot value, and its last run, beside one line each for the roster, the inbox, and the CPM, and a setup checklist for a new network. A member starts a launch from the dashboard by naming it, or up to three comps. Each launch has its own page, with the fit chart, the agent's questions, the insertion order, the run log, and the evidence, as the demo shows them, and keeps every run. A run ranks the network's roster as it stands when the run starts, and the launch says when the roster has changed since. Members can plan several launches at once; each run and approval names who made it.

### The roster and the inbox, with uploads

The roster and the booking inbox belong to the network, each on its own page. Members drop or pick a roster CSV, or a text file of names, paste names, or start from the sample roster; re-importing keeps every show already settled and looks up only new ones. Members drop or pick pitch emails as `.eml` files, an `.mbox` export, or a text file of pitches separated by lines of `---`; each pitch keeps its sender and subject inside Crossfeed. An upload that can't be read is refused with why; an email too long to read is skipped and named.

### Settings and the account page

Settings hold the network's name and CPM, its members and invite links, its API keys, its own Qloo key, today's usage against its daily caps (marked Beta), and deleting the network. Owners change them; members see them read-only. The account page holds the member's name, their passkeys, a new recovery code, signing out everywhere, their networks, and deleting their account. Adding a passkey, a new recovery code, and deleting the account first ask the member to confirm it's them, unless they did in the last five minutes.

### The API, the SDK, MCP, and skills

A versioned REST API under `/api/v1`, described by an OpenAPI document at `/api/v1/openapi.json`, takes an owner's API key or a member's session; a typed TypeScript SDK wraps it. A remote MCP server at `/mcp` exposes the same operations as tools for an assistant such as Claude Code. Two Agent Skills teach an assistant to plan launch promos and triage guest pitches through it, and a Claude Code plugin bundles both with the server. Developer docs at `/docs` and `/llms.txt` describe the whole surface. None of them can approve anything ([ADR 0002](/docs/adr/0002-approval-stays-in-the-app.md)): a program can import, run, answer the agent's questions with a person's words, and edit drafts, and it can export an order only once a member has approved it in the app.

### Success criteria

- A judge who never opens the app can tell from the description what breaks without Qloo, which endpoints run, and what the product decides.
- A judge who opens the demo sees a ranked roster within 30 seconds of starting the sample launch, without an account.
- The sample launch shows at least one roster show whose fit rank differs from its topic-only rank by three or more places, with shared tags that explain the move. On the sample launch, The Watch, The Bill Simmons Podcast climbs from topic rank 9 or 10 to fit rank 4 and shares Conversational, Insightful, and Pop Culture ([SUBMISSION](SUBMISSION.md#what-breaks-without-qloo)).
- No Qloo request ever carries a guest's name, an email address, or sender details, whether pitches are pasted, uploaded, or sent through the API.
- The demo keeps answering through the end of judging on 2026-11-16, including when Qloo is slow or a daily cap is hit.
- A network's roster, launches, pitches, and keys are visible only to its members and its own API keys; every page and API answer says nothing about another network, not even that it exists.
- Nothing is approved by a program: only a member, in the app, approves an insertion order or a reply.

## User Stories

The programmer is the head of programming or audience; the booker, the network's guest booker; the judge, a hackathon evaluator; the member and the owner, a person signed in to a network; the developer, someone scripting Crossfeed; the assistant, an AI client connected over MCP; and the operator, the team running Crossfeed. Stories 1 to 53 are the hackathon's and hold on the sample network and on signed-in networks alike, where a session's roster is the network's.

### Roster setup stories

1.  As a programmer, I want to paste my roster as a list of show names, so that I can start without an integration.
2.  As a programmer, I want to upload a CSV with each show's name, downloads per episode, status, and an optional one-line description, so that slot values use my numbers.
3.  As a programmer, I want to see which shows resolved, which are ambiguous, and which missed, so that I know what Crossfeed can score before I rely on it.
4.  As a programmer, I want to pick the right match for an ambiguous show from candidates with their names and popularity, so that the wrong show isn't scored in its place.
5.  As a programmer, I want to map a show Qloo missed to a comparable show, or leave it out, so that small shows still get a fair place.
6.  As a programmer, I want my resolved roster remembered, for my session on the sample network or for my network once signed in, so that I resolve it once and not on every launch.
7.  As a programmer, I want to enter my network's CPM, so that slot values reflect what I actually sell.
8.  As a programmer, I want to mark shows as excluded, such as shows mid-sale or on hiatus, so that they're never proposed.
9.  As a programmer, I want to edit a show's downloads or status later, so that the next plan uses current numbers.
10. As a programmer, I want Crossfeed to refuse a roster larger than it can score in one comparison, and say why, so that I never get rankings that can't be compared.

### Launch promo stories

11. As a programmer, I want to name a released launch and have Crossfeed resolve it, so that its listeners become the signal.
12. As a programmer, I want to be asked for up to three comps when the launch is unreleased, so that it can still be scored.
13. As a programmer, I want to confirm each resolved comp before scoring, so that a wrong match doesn't skew the plan.
14. As a programmer, I want to see my roster ranked by fit to the launch, so that I see which shows' listeners overlap most.
15. As a programmer, I want each show's rank and band rather than a bare decimal, so that I don't over-read a 0.91 versus 0.92 gap.
16. As a programmer, I want the topic-only ranking shown beside the fit ranking, with moves highlighted, so that I see what topic planning would have missed.
17. As a programmer, I want to see which comp most drove a show's fit when comps stand in, so that I can tell whether one comp is skewing the plan.
18. As a programmer, I want to be asked for my slot budget, as a count or in dollars, before the plan is drawn, so that the plan fits what I can spend.
19. As a programmer, I want to be asked for exclusions before the plan is drawn, so that I don't have to strike shows afterwards.
20. As a programmer, I want demographic mismatches flagged for the top shows, by age band and gender skew against the launch, so that I don't promote where listeners differ.
21. As a programmer, I want to see the tags each finalist shares with the launch, so that I understand where the overlap lies.
22. As a programmer, I want a drafted host-read angle per finalist that cites the shared tags, and none where Qloo returned no shared tags, so that hosts get a starting script that fits their show and nothing is drafted from thin air.
23. As a programmer, I want an insertion order that spreads my slot budget across the finalists without exceeding it, listing shows, slots, angles, slot value per show, and the total, so that I know what inventory the launch spends.
24. As a programmer, I want to edit slot counts, drop shows, and reword angles in the insertion order, so that the final plan is mine.
25. As a programmer, I want the totals to recompute as I edit, so that I always see what the edited plan costs.
26. As a programmer, I want to approve the insertion order explicitly, so that nothing is final until I say so.
27. As a programmer, I want to export an approved insertion order as CSV, so that I can hand it to ad operations.
28. As a programmer, I want to re-run a launch after changing comps, budget, or exclusions, so that I can compare plans.
29. As a programmer, I want to see what the agent is doing while it works, such as resolving, scoring, or checking demographics, so that a slow run doesn't look stuck.

### Guest pitch stories

30. As a booker, I want to load my booking inbox, the sample inbox, pitches I paste, or the emails I upload, so that every pitch is in one place.
31. As a booker, I want to pick which roster show the pitches are for, so that they're ranked against the right listeners.
32. As a booker, I want to name the public works of my show's best past guests, so that the ranking reflects what has worked before.
33. As a booker, I want each pitch's guest and public work extracted for me, so that I don't retype them.
34. As a booker, I want to see each extracted work with its matched Qloo entity, and confirm ambiguous matches, so that the right work is scored.
35. As a booker, I want pitches without a public work set aside and labelled, not scored, so that private individuals never reach Qloo.
36. As a booker, I want the pitched works ranked by fit to my show in one list per work type, such as books and films, with rank and confidence rather than precise scores, so that bunched scores and incomparable lists don't mislead me.
37. As a booker, I want a strong guest surfaced even when the pitch wording sounded off-topic, so that I don't skip a fit a publicist undersold.
38. As a booker, I want a proposed episode angle per top pitch, from the tags the work shares with my show, so that I can judge the pitch fast.
39. As a booker, I want drafted book, decline, or later replies, so that I can clear the inbox quickly.
40. As a booker, I want to approve, edit, or discard each reply on its own, so that nothing goes out without me.
41. As a booker, I want to copy an approved reply, so that I can send it from my own email.

### Evidence and trust stories

42. As a programmer, I want to open the evidence behind any ranking, including the Qloo call, its entities and tags, and the affinities, so that I can check the claim myself.
43. As a programmer, I want Qloo's results visually separated from the agent's interpretation and drafts, so that I know which is data.
44. As a programmer, I want to be told when a signal didn't resolve and came back unscored, rather than shown a ranking built on nothing, so that I'm never misled.
45. As a programmer, I want to be told when Qloo was slow or failing, what was retried, and what's missing, so that a partial result is never presented as complete.
46. As a programmer, I want results described as listener overlap, never as a probability about a person, so that I read them for what they are.

### Demo and operation stories

47. As a judge, I want to open the live demo without an account and find a sample network ready, so that I can evaluate it in minutes.
48. As a judge, I want the sample launch to answer quickly from a warm cache, so that the demo works even when Qloo is slow.
49. As a judge, I want sample data, such as the synthetic inbox and sample downloads, labelled as sample data, so that I know no real person's email or real network's figures are shown.
50. As a judge, I want a short guided path through the sample launch, so that I see the decisive moment without knowing the product.
51. As the operator, I want a daily cap on Qloo calls and daily limits on model runs, per visitor and overall, so that a public demo can't exhaust the quota or the budget.
52. As the operator, I want the sample run replayed from storage when a cap is hit or Qloo fails, so that judges still see a working product.
53. As the operator, I want a daily health check against Qloo, so that I learn a key has stopped working before a judge does.

### Product stories

The spec, [#155](https://github.com/m1kuorg/qloo/issues/155), lists 98 stories for the signed-in product, under its User Stories heading, and the sub-issues that built them are closed. These are the ones that shape it, worded as what shipped where it went further than the spec asked:

54. As a judge, I want the landing page's first button to open the sample network, so that the demo is one click from the URL I was given.
55. As a programmer, I want the landing page to show how a ranking looks, labelled as an illustration, and to say what Crossfeed never does, so that I can trust it without the page publishing Qloo data.
56. As a programmer, I want to sign up with my name and a passkey, keep a recovery code shown once, and sign in with the passkey alone, so that I have an account without a password or an inbox to confirm.
57. As a member, I want to add a passkey from another device, remove one I no longer use but never my last, and sign out of every session at once, so that losing a device never locks me out or leaves me signed in.
58. As a member, I want adding a passkey, a new recovery code, and deleting my account to ask me to confirm it's me, with my passkey or, in a browser I signed in to with my recovery code, that code, unless I did in the last five minutes, so that a borrowed browser can't take over my account.
59. As an owner, I want to create an invite link that works once and expires after seven days, see who made each, and revoke one, so that I can bring in a teammate without email.
60. As an owner, I want to change a member's role, or remove them, so that someone who left loses access at once, including any page they still have open, and the API keys and invite links they made as an owner.
61. As a member, I want every network's data visible only to its members, so that one network never sees another's roster, launches, or pitches.
62. As a member, I want the dashboard to list the network's launches with each one's status, finalists, slots, slot value, and last run, live, beside the roster, the inbox, and a setup checklist that ticks itself off, so that I see the state of every plan at once.
63. As two programmers, we want to plan two launches at once, each with its own runs, rankings, insertion orders, and evidence, so that one person's run never replaces the other's.
64. As a programmer, I want a launch's run to rank the network's roster as it stands when the run starts, and the launch to say when the roster has changed since, so that I edit shows in one place and know when to run again.
65. As a programmer, I want to see who started each run and who approved the order, a program's runs named by their API key, and a deleted member named "Former member", so that everyone in the network knows whose plan it is.
66. As a programmer, I want to delete a launch I no longer need after being asked, so that the list stays useful.
67. As a programmer, I want to drop my roster's CSV on the roster page, and re-import next week's file without losing the matches I settled, so that I import my spreadsheet as it is.
68. As a booker, I want to drop `.eml` files, an `.mbox` export, or a text file of pitches on the inbox, with each sender's details kept inside Crossfeed and an email too long to read skipped and named, so that I load pitches straight from my email client.
69. As a member, I want to see today's usage against the network's daily limits and when they reset, so that a refused run is never a surprise.
70. As an owner, I want to add the network's own Qloo key, tested before it's saved and shown only by its last four characters, and remove it, so that my calls run on my own Qloo agreement.
71. As an owner, I want to delete the network after typing its name, so that its roster, launches, pitches, evidence, and keys are wiped.
72. As a member, I want to delete my account, and be stopped while I'm a network's only owner, so that Crossfeed keeps nothing of mine and no network is orphaned. My name becomes "Former member" in the launches of the networks I'm in; forgetting me in networks I left earlier is still to do ([#205](https://github.com/m1kuorg/qloo/issues/205)).
73. As an owner, I want to create an API key with a name, see its secret once, and revoke it at once, so that I control what has access.
74. As a developer, I want a REST API under `/api/v1`, described by an OpenAPI document, with long work answered at once with a status to poll and errors as JSON with a stable code, so that I can script Crossfeed.
75. As a developer, I want a TypeScript SDK with typed methods for every route, typed errors, and helpers that wait for an import, an inbox, or a run to settle, using nothing but `fetch`, so that I don't hand-write polling.
76. As a programmer using an assistant, I want an MCP server and Agent Skills that plan a launch and triage pitches with me, relaying each of the agent's questions to me as it is, so that the plan is still mine.
77. As a developer, I want `/docs` and `/llms.txt` to describe the API, the SDK, the MCP server, the skills, and the plugin from the live app, so that people and assistants learn the surface where it runs.
78. As a programmer, I want no program, script, or assistant to approve an insertion order or a reply, so that nothing ships without a member.
79. As the operator, I want each network counted against daily limits of its own, as a visitor is, with caps on networks per member, launches per network, open invite links, sign-ups per visitor, and invited sign-ups per inviter, so that the free beta can't be used to multiply limits.
80. As the operator, I want one switch, `ACCOUNTS`, that turns sign-in and everything behind it off, so that `main` stays deployable and sign-ups can stop at once.

## Implementation Decisions

The [TRD](TRD.md) gives call parameters, storage, routes, limits, and configuration. The decisions:

- **One engine, two flows.** A fit engine scores a closed list of candidates against one or more anchors in a single Qloo comparison and returns ranks, bands, comp shares, and evidence references. Launch promos call it with the launch or its comps as anchors and the roster as candidates; guest pitches call it once per work type, with the show and past guests' works as anchors and that type's pitched works as candidates.
- **One door to Qloo.** A Qloo gateway is the only module that calls Qloo. It owns the key, request shape, retries, concurrency, caching, daily budget, and the evidence record, and it reports an unresolved signal as an error instead of a result. A network that brings its own Qloo key gets a gateway instance of its own ([ADR 0004](/docs/adr/0004-qloo-key-per-network.md)).
- **Roster module.** Holds the network's shows with their resolution state (resolved, ambiguous, missed, mapped, excluded), downloads, and status, plus the network's CPM.
- **Demographic check.** Pulls demographics for the launch and its top shows in one call and flags a show whose age bands or gender skew run against the launch's strongest ones.
- **Topic baseline.** One model call ranks the roster by topic from show names and the network's own descriptions, with no Qloo input. It is the without-Qloo counterfactual the UI shows beside the fit ranking.
- **Insertion order.** Lines of show, slot count, and angle for the finalists. The model proposes slot counts; code, not the model, computes slot value and totals and rejects a draft that exceeds the slot budget, or one drafted before every finalist's shared tags are in, or one with an angle Qloo's tags don't back. It has two states, draft and approved, and only an approved order exports.
- **Pitch reader and reply drafter.** The model extracts the guest and public work from each pitch and drafts replies. The guest's name and the sender's details stay inside Crossfeed; only the work's title and type reach the gateway.
- **The agent.** Claude runs a tool loop over these modules in an agent: one per visitor session on the sample network, one per signed-in network for its roster and inbox, and one per launch for its runs ([ADR 0001](/docs/adr/0001-agents-per-network-and-launch.md)). It asks questions through a question tool that pauses the run until the human answers. Approving and exporting are actions in the app the model has no tool for, so it can propose but never commit.
- **A directory beside the agents.** A D1 database holds only what has to be looked up across agents: members, passkeys, sessions, networks, memberships, invite links, and API keys, each secret kept as a hash.
- **Passkeys only, built in-house.** No password, email, or OAuth; a one-time recovery code stands in for email recovery ([ADR 0003](/docs/adr/0003-passkeys-built-in-house.md)).
- **Approval stays in the app.** The API, the SDK, and the MCP server act through an API key and have no approve action ([ADR 0002](/docs/adr/0002-approval-stays-in-the-app.md)).
- **One operations module.** The REST API and the MCP server are thin adapters over the same operations, and the SDK's types are generated from the API's OpenAPI document, so the three can't drift apart.
- **One upload module.** The browser and the API read roster files and pitch emails with the same code, and the files themselves are never kept.
- **Evidence log.** An append-only record of every Qloo call per run, with its parameters, status, latency, cache hit, and the entities, tags, and affinities used. The evidence panel reads it.
- **Bands, not decimals.** A result's band comes from its rank within the list (top, middle, or bottom third), because Qloo normalizes affinity per query and live scores sit in a narrow range. Raw affinity appears only in the evidence.
- **Comp shares only when they mean something.** Qloo explainability scores every result 1 when there's one anchor, so the UI names a leading comp only when there are two or more anchors and one clearly leads.
- **Roster cap.** One comparison scores at most 50 candidates, Qloo's maximum page size, because scores from separate calls aren't comparable.
- **Agent framework and model:** the Cloudflare Agents SDK on Workers, with Claude Haiku 5.5 through the official Anthropic SDK. The [TRD](TRD.md#architecture) gives the reasons.

## Testing Decisions

- **What a good test is:** it drives Crossfeed through a public interface, the Worker's HTTP routes, the agent's client protocol, the REST API, the SDK, or the MCP endpoint, and asserts what a programmer, a program, or an assistant would see: the ranked list, the questions asked, the insertion order's totals, what's refused, and what's blocked before approval. It never asserts which internal function ran.
- **One seam:** outbound HTTP. Tests replace Qloo and Anthropic at the network boundary and run everything inside Crossfeed for real, D1 included, with its migrations applied before each test. The Anthropic fake replays scripted tool calls, so agent runs are deterministic, and passkey ceremonies run against a software authenticator that signs as a browser's would.
- **Behaviors to cover:**
  - The gateway bounds its retries, serves cache hits, stops at the daily cap, and reports an unscored signal as an error.
  - The topic baseline and fit ranking render side by side, with moves.
  - Insertion order math, that a draft over the slot budget is rejected, and that export fails before approval.
  - A question pauses the run, and the answer resumes it.
  - No recorded Qloo request contains a guest name or an email address, checked across the whole sample inbox and across uploaded emails.
  - A pitch without a public work is set aside, not sent.
  - Sign-up, sign-in, recovery, step-up, and sign-out; invites; membership isolation across pages, agents, and the API; two members seeing each other's edits; two launches running at once; uploads and their refusals; API keys scoped to their network; approval refused over RPC; the SDK and the MCP server driving a launch to a draft order; deleting a network or an account.
- **Fixtures are synthetic.** Hand-written responses in Qloo's shape with made-up IDs and scores. Recorded Qloo responses are never committed, because publishing them breaks the key's terms ([BRIEF](BRIEF.md#implications-for-our-entry)).
- **Prior art:** `openSession` drives a visitor and `openMember` a member, `api` a program with an API key, the SDK's tests a client through the Worker's `fetch`, and `assistant` an MCP client; the [apps README](/apps/README.md#test) says how to use each, and the [TRD](TRD.md#testing) names the runner.
- **Done means live.** Each behavior counts as done only once it works in the running app against the real Qloo and Anthropic APIs, per the [project conventions](/docs/references/project-conventions.md): locally first, then on the preview deployment for the signed-in product, and on production for the demo.

## Out of Scope

- Payments, plans, invoices, and prices. The beta is free, and settings show usage against daily caps under a "Beta" label.
- Email of any kind: collecting an address, verification, magic links, invite emails, and sending replies. Approved replies are copied out by hand.
- Google, GitHub, or SAML sign-in, and passwords.
- Fine-grained roles beyond owner and member, and permissions per show or per launch.
- A command-line interface, and SDKs in other languages.
- Publishing the SDK to npm, the plugin to a public marketplace, or the repository publicly, which wait for approval in [#63](https://github.com/m1kuorg/qloo/issues/63).
- Spotify, RSS, or podcast-analytics integrations, XLSX upload, and connecting a live mailbox such as Gmail. Qloo doesn't resolve podcasts by Spotify ID, and downloads are typed in or uploaded.
- Rosters over 50 shows, which one Qloo comparison can't score.
- Swap partners: recommending podcasts outside the roster for feed swaps. It overlaps 2026 neighbors that scout partnerships and dilutes the closed-list pitch.
- Scheduling flights, booking dates, or pushing orders into ad servers.
- Measuring a launch's results after the promos run.
- Wiring Qloo into OpenClaw or another existing agent, and a second hackathon entry.
- Native mobile apps.

## Further Notes

### Release plan

The hackathon build ran on a dated plan from 2026-10-17: the engine, launch promos, guest pitches (switched on in production after [#57](https://github.com/m1kuorg/qloo/issues/57)), then polish and the submission. The product followed as the tickets of [#155](https://github.com/m1kuorg/qloo/issues/155), each merged to `main` through its own pull request and CI, with `ACCOUNTS` off in production so `main` stayed deployable:

1.  **Preview, to 2026-10-22:** the preview deployment, `crossfeed-preview`, ran `main` with `ACCOUNTS` on, its own D1 database, and its own Durable Objects, and every merged ticket was checked there. On 2026-10-22 the whole product passed there: the judge path on `/demo`, and a member's path from sign-up through an approved order, the API, and MCP.
2.  **Deploy window, by 2026-10-29:** submissions close 2026-10-30 at 11:45 pm ET. Production got the product, `ACCOUNTS` on, from `main` in [#223](https://github.com/m1kuorg/qloo/issues/223): the landing page at `/`, the demo at `/demo`, where the submission links, and old `/inbox` links redirected. Deploys stay manual, one at a time, from an up-to-date `main`.
3.  **Freeze, 2026-10-30 to 2026-11-16:** the official rules keep a submission "substantively the same" after the submission period ([rules](/docs/sources/qloo.devpost.com/official-rules.md#modifications-after-the-submission-period)). If the product misses the window, it waits until judging ends on 2026-11-16, and production stays as submitted. A fix to the demo in that time ships from `main` with `ACCOUNTS` still as submitted.

### Submission deliverables

From the [brief](BRIEF.md#submission-checklist), plus our own choices:

- The live demo URL, with free, unrestricted access through 2026-11-16. The landing page at `/` opens the sample network at `/demo` in one click.
- A public repository. It is private today and is made public before submitting, with the owner's approval in [#63](https://github.com/m1kuorg/qloo/issues/63).
- An open-source license file, detected in the repository's About section: MIT, in [LICENSE](/LICENSE).
- A description with one heading per judging criterion that leads with what breaks without Qloo, names the endpoints, walks one request through to its result, states known limitations, and pitches Crossfeed as a company for the Calacanis bonus ([SUBMISSION](SUBMISSION.md), [CONTEXT](CONTEXT.md#strategy-for-our-entry)).
- Screenshots and a demo video, optional but read first by judges.

### Bets after the 2026-10-17 checks

The [IDEA](IDEA.md#bets-to-test) bets, updated with the live checks the [TRD](TRD.md#qloo-integration) records:

- **Coverage:** holds for The Ringer, at 16 of 19 shows. The two misses and one ambiguous match give the demo its natural mapping and disambiguation questions. Smaller networks resolve worse, so the miss-mapping flow is required, not optional.
- **Spread:** holds, at 0.798 to 0.953 across 16 shows. The headline moment needed choosing: the top two results for The Big Picture were same-genre, so every roster show and three-comp launches were run against the topic baseline, and The Watch, where The Bill Simmons Podcast climbs into the finalists, became the sample launch ([TRD](TRD.md#demo-data)).
- **Explainability:** weaker than the idea assumed. With one anchor every result scores 1; with three comps the shares were near-even. Shared tags from compare carry the "why" instead.
- **Throughput:** better than feared. Calls took 1 to 4 seconds on 2026-10-17, not 5 to 8, but the design still assumes the slower figure and occasional 504s.
- **Guest scoring:** holds. Books, films, TV shows, and podcasts ranked against a podcast and its past guests' films in one call per type, though works released since about May 2025 often go unscored ([TRD](TRD.md#demo-data)).
- **Value:** the CPM and network counts are still unsourced. Crossfeed sidesteps them in the product by using the network's own numbers, and the pitch quotes neither.
- **Bonus fit:** weaker than the ranking assumed. Calacanis has two shows, not a network roster, so the demo can't use one he knows.

## See also

- [PRODUCT.md](PRODUCT.md), [TRD.md](TRD.md), [DESIGN.md](DESIGN.md), and [SUBMISSION.md](SUBMISSION.md)
- The product spec, [#155](https://github.com/m1kuorg/qloo/issues/155), and the ADRs in [docs/adr/](/docs/adr/)
- [IDEA.md](IDEA.md) and the [Crossfeed idea doc](/docs/ideas/0004-crossfeed.md)
- [Brief](BRIEF.md) and [context](CONTEXT.md)
