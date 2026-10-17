# PRD

What Crossfeed ships for the Qloo Agentic Hackathon by 2026-10-30, written from the user's side. [PRODUCT.md](PRODUCT.md) holds the durable product record and its terminology, and [TRD.md](TRD.md) holds the technical design. Facts marked _(unconfirmed default)_ were inferred because the 2026-10-17 grilling round went unanswered; [PRODUCT.md](PRODUCT.md#decisions-to-confirm) lists them.

Contents:

1.  [Problem Statement](#problem-statement)
1.  [Solution](#solution)
    1.  [Launch promos](#launch-promos)
    1.  [Guest pitches](#guest-pitches)
    1.  [Evidence and approval](#evidence-and-approval)
    1.  [Success criteria](#success-criteria)
1.  [User Stories](#user-stories)
    1.  [Roster setup stories](#roster-setup-stories)
    1.  [Launch promo stories](#launch-promo-stories)
    1.  [Guest pitch stories](#guest-pitch-stories)
    1.  [Evidence and trust stories](#evidence-and-trust-stories)
    1.  [Demo and operation stories](#demo-and-operation-stories)
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

## Solution

Crossfeed is an agent that scores the network's own lists, its roster and its booking inbox, against a show in Qloo, asks the human at each fork, and hands back a plan to approve.

### Launch promos

The programmer names the launch, or up to three comps if it's unreleased. Crossfeed ranks the roster by fit, next to the ranking a topic-only planner would produce, so the moves Qloo caused are visible. It asks for the slot budget and exclusions, takes the top five shows by fit as finalists, flags demographic mismatches among them, drafts a host-read angle per finalist from shared tags, and writes an insertion order that spreads the budget across the finalists, priced from the network's own downloads and CPM. The programmer edits and approves it, then exports it.

### Guest pitches

The booker picks the show, names the public works of its best past guests, and loads the inbox. Crossfeed extracts each guest's public work, resolves the work in Qloo, and sets aside any pitch without one. It ranks the pitched works against the show and those past guests in one list per work type, because Qloo scores from separate calls can't be compared, then proposes an episode angle, and drafts book, decline, or later replies for the booker to approve one by one. This flow ships second and is cut if it isn't working end to end by 2026-10-26 _(unconfirmed default)_.

### Evidence and approval

Every ranking opens to its evidence: the Qloo call, the entities and tags it used, and the affinities it returned, shown apart from the agent's interpretation. Nothing is exported or copied out until the human approves it.

### Success criteria

- A judge who never opens the app can tell from the description what breaks without Qloo, which endpoints run, and what the product decides.
- A judge who opens the demo sees a ranked roster within 30 seconds of starting the sample launch, without an account.
- The sample launch shows at least one roster show whose fit rank differs from its topic-only rank by three or more places, with shared tags that explain the move. The [bets](#bets-after-the-2026-10-17-checks) say why this isn't yet guaranteed.
- No Qloo request ever carries a guest's name, an email address, or sender details.
- The demo keeps answering through the end of judging on 2026-11-16, including when Qloo is slow or a daily cap is hit.

## User Stories

The programmer is the head of programming or audience; the booker, the network's guest booker; the judge, a hackathon evaluator; and the operator, the team running the demo.

### Roster setup stories

1.  As a programmer, I want to paste my roster as a list of show names, so that I can start without an integration.
2.  As a programmer, I want to upload a CSV with each show's name, downloads per episode, status, and an optional one-line description, so that slot values use my numbers.
3.  As a programmer, I want to see which shows resolved, which are ambiguous, and which missed, so that I know what Crossfeed can score before I rely on it.
4.  As a programmer, I want to pick the right match for an ambiguous show from candidates with their names and popularity, so that the wrong show isn't scored in its place.
5.  As a programmer, I want to map a show Qloo missed to a comparable show, or leave it out, so that small shows still get a fair place.
6.  As a programmer, I want my resolved roster remembered for my session, so that I resolve it once and not on every launch.
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
22. As a programmer, I want a drafted host-read angle per finalist that cites the shared tags, so that hosts get a starting script that fits their show.
23. As a programmer, I want an insertion order that spreads my slot budget across the finalists without exceeding it, listing shows, slots, angles, slot value per show, and the total, so that I know what inventory the launch spends.
24. As a programmer, I want to edit slot counts, drop shows, and reword angles in the insertion order, so that the final plan is mine.
25. As a programmer, I want the totals to recompute as I edit, so that I always see what the edited plan costs.
26. As a programmer, I want to approve the insertion order explicitly, so that nothing is final until I say so.
27. As a programmer, I want to export an approved insertion order as CSV, so that I can hand it to ad operations.
28. As a programmer, I want to re-run a launch after changing comps, budget, or exclusions, so that I can compare plans.
29. As a programmer, I want to see what the agent is doing while it works, such as resolving, scoring, or checking demographics, so that a slow run doesn't look stuck.

### Guest pitch stories

30. As a booker, I want to load my booking inbox, either the sample inbox or pitches I paste, so that every pitch is in one place.
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
51. As the operator, I want a daily cap on Qloo calls and a spend limit on the model account, so that a public demo can't exhaust the quota or the budget.
52. As the operator, I want the sample run replayed from storage when a cap is hit or Qloo fails, so that judges still see a working product.
53. As the operator, I want a daily health check against Qloo, so that I learn a key has stopped working before a judge does.

## Implementation Decisions

The [TRD](TRD.md) gives call parameters, storage, limits, and configuration. The decisions:

- **One engine, two flows.** A fit engine scores a closed list of candidates against one or more anchors in a single Qloo comparison and returns ranks, bands, comp shares, and evidence references. Launch promos call it with the launch or its comps as anchors and the roster as candidates; guest pitches call it once per work type, with the show and past guests' works as anchors and that type's pitched works as candidates.
- **One door to Qloo.** A Qloo gateway is the only module that calls Qloo. It owns the key, request shape, retries, concurrency, caching, daily budget, and the evidence record, and it reports an unresolved signal as an error instead of a result.
- **Roster module.** Holds the network's shows with their resolution state (resolved, ambiguous, missed, mapped, excluded), downloads, and status, plus the network's CPM.
- **Demographic check.** Pulls demographics for the launch and its top shows in one call and flags a show whose age bands or gender skew run against the launch's strongest ones.
- **Topic baseline.** One model call ranks the roster by topic from show names and the network's own descriptions, with no Qloo input. It is the without-Qloo counterfactual the UI shows beside the fit ranking.
- **Insertion order.** Lines of show, slot count, and angle for the finalists. The model proposes slot counts; code, not the model, computes slot value and totals and rejects a draft that exceeds the slot budget. It has two states, draft and approved, and only an approved order exports.
- **Pitch reader and reply drafter.** The model extracts the guest and public work from each pitch and drafts replies. The guest's name and the sender's details stay inside Crossfeed; only the work's title and type reach the gateway.
- **The agent.** Claude runs a tool loop over these modules in a per-session agent. It asks questions through a question tool that pauses the run until the human answers. Approving and exporting are UI actions the model has no tool for, so it can propose but never commit.
- **Evidence log.** An append-only record of every Qloo call per run, with its parameters, status, latency, cache hit, and the entities, tags, and affinities used. The evidence panel reads it.
- **Bands, not decimals.** A result's band comes from its rank within the list (top, middle, or bottom third), because Qloo normalizes affinity per query and live scores sit in a narrow range. Raw affinity appears only in the evidence.
- **Comp shares only when they mean something.** Qloo explainability scores every result 1 when there's one anchor, so the UI names a leading comp only when there are two or more anchors and one clearly leads.
- **Roster cap.** One comparison scores at most 50 candidates, Qloo's maximum page size, because scores from separate calls aren't comparable.
- **Agent framework and model** _(unconfirmed default)_: the Cloudflare Agents SDK on Workers, with Claude through the official Anthropic SDK. The [TRD](TRD.md#architecture) gives the reasons.

## Testing Decisions

- **What a good test is:** it drives Crossfeed through its public interface, the Worker's HTTP routes and the agent's client protocol, and asserts what a user would see: the ranked list, the questions asked, the insertion order's totals, and what's blocked before approval. It never asserts which internal function ran.
- **One seam:** outbound HTTP. Tests replace Qloo and Anthropic at the network boundary and run everything inside Crossfeed for real. The Anthropic fake replays scripted tool calls, so agent runs are deterministic.
- **Behaviors to cover:**
  - The gateway bounds its retries, serves cache hits, stops at the daily cap, and reports an unscored signal as an error.
  - The topic baseline and fit ranking render side by side, with moves.
  - Insertion order math, that a draft over the slot budget is rejected, and that export fails before approval.
  - A question pauses the run, and the answer resumes it.
  - No recorded Qloo request contains a guest name or an email address, checked across the whole sample inbox.
  - A pitch without a public work is set aside, not sent.
- **Fixtures are synthetic.** Hand-written responses in Qloo's shape with made-up IDs and scores. Recorded Qloo responses are never committed, because publishing them breaks the key's terms ([BRIEF](BRIEF.md#implications-for-our-entry)).
- **Prior art:** none yet; the repo has no tests. The [TRD](TRD.md#testing) names the runner.
- **Done means live.** Each behavior counts as done only once it works in the deployed app against the real Qloo API, per the [project conventions](/docs/references/project-conventions.md).

## Out of Scope

- Swap partners: recommending podcasts outside the roster for feed swaps _(unconfirmed default)_. It overlaps 2026 neighbors that scout partnerships and dilutes the closed-list pitch.
- Sending email, or connecting a real inbox such as Gmail. Approved replies are copied out by hand.
- Accounts, seats, billing, and isolating one network's data from another's beyond the visitor session.
- Spotify, RSS, or podcast-analytics integrations. Qloo doesn't resolve podcasts by Spotify ID, and downloads are typed in or uploaded.
- Scheduling flights, booking dates, or pushing orders into ad servers.
- Measuring a launch's results after the promos run.
- Wiring Qloo into OpenClaw or another existing agent, and a second hackathon entry _(unconfirmed default)_.
- Native mobile apps.

## Further Notes

### Release plan

Today is 2026-10-17, and submissions close 2026-10-30 at 11:45 pm ET:

1.  **By 2026-10-20, engine:** the gateway, roster resolution, and fit ranking run on the deployed Worker for the sample network, and the demo launch is chosen ([TRD](TRD.md#demo-data)).
2.  **By 2026-10-24, launch promos:** the agent, questions, topic baseline, demographic check, shared tags, angles, insertion order, and evidence panel work end to end.
3.  **By 2026-10-26, guest pitches:** the inbox flow works end to end, or it's cut and hidden that day.
4.  **By 2026-10-28, polish:** design pass, warm cache, sample-run replay, caps, health check, license file, and the public repo.
5.  **By 2026-10-29, submission:** description, screenshots, and a video under 3 minutes. 2026-10-30 is buffer.

### Submission deliverables

From the [brief](BRIEF.md#submission-checklist), plus our own choices:

- The live demo URL, with free, unrestricted access through 2026-11-16.
- A public repository. It is private today and must be made public before submitting.
- An open-source license file, detected in the repository's About section. There is none yet; MIT is the default _(unconfirmed default)_.
- A description with one heading per judging criterion that leads with what breaks without Qloo, names the endpoints, walks one request through to its result, states known limitations, and pitches Crossfeed as a company for the Calacanis bonus ([CONTEXT](CONTEXT.md#strategy-for-our-entry)).
- Screenshots and a demo video, optional but read first by judges.

### Bets after the 2026-10-17 checks

The [IDEA](IDEA.md#bets-to-test) bets, updated with the live checks the [TRD](TRD.md#qloo-integration) records:

- **Coverage:** holds for The Ringer, at 16 of 19 shows. The two misses and one ambiguous match give the demo its natural mapping and disambiguation questions. Smaller networks resolve worse, so the miss-mapping flow is required, not optional.
- **Spread:** holds, at 0.798 to 0.953 across 16 shows. The headline moment is unproven: the top two results for The Big Picture were same-genre. The demo launch has to be chosen by running every roster show, and a three-comp launch, against the topic baseline, and picking the clearest move.
- **Explainability:** weaker than the idea assumed. With one anchor every result scores 1; with three comps the shares were near-even. Shared tags from compare carry the "why" instead.
- **Throughput:** better than feared. Calls took 1 to 4 seconds on 2026-10-17, not 5 to 8, but the design still assumes the slower figure and occasional 504s.
- **Guest scoring:** untested. Scoring books or films against a podcast anchor is a cross-category comparison that no live check has run yet.
- **Value:** the CPM and network counts are still unsourced. Crossfeed sidesteps them in the product by using the network's own numbers, but the pitch needs sources before it quotes either.
- **Bonus fit:** weaker than the ranking assumed. Calacanis has two shows, not a network roster, so the demo can't use one he knows.

## See also

- [PRODUCT.md](PRODUCT.md) and [TRD.md](TRD.md)
- [IDEA.md](IDEA.md) and the [Crossfeed idea doc](/docs/ideas/0004-crossfeed.md)
- [Brief](BRIEF.md) and [context](CONTEXT.md)
