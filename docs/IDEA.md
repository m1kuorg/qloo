# Idea

Our entry is Crossfeed, an agent that tells a podcast network which of its own shows should promote a launch, and which pitched guests its listeners actually want, by scoring the network's lists against each show's audience in Qloo. It was chosen from the fifteen finalists in the [idea ranking](/docs/ideas/0000-ranking.md). This doc states the bet and what's still open, as the starting point for `/grill-with-docs`; the [Crossfeed idea doc](/docs/ideas/0004-crossfeed.md) keeps the step-by-step agent loop, the Qloo call table, the demo storyboard, and the scorecard.

Contents:

1.  [Pitch](#pitch)
1.  [How it works](#how-it-works)
1.  [Standing in the ranking](#standing-in-the-ranking)
1.  [Bets to test](#bets-to-test)
1.  [Open questions](#open-questions)
1.  [See also](#see-also)

## Pitch

- **For:** the head of programming or audience at a podcast network, and the network's bookers. The network buys per seat.
- **Job:** decide which roster shows carry a launch's promos, and which pitched guests to book. Each promo slot displaces sellable inventory, about $9,000 to $12,500 on a 500,000-download episode at an unsourced $18 to $25 CPM, yet the launch plan is drawn up in a spreadsheet by topic ([problem](/docs/ideas/0004-crossfeed.md#problem)).
- **Bet:** co-listening beats topic. Without Qloo, an LLM pairs a true-crime launch with the network's other true-crime shows and judges a guest by the keywords a publicist wrote. With Qloo, the agent scores the network's own roster and its pitched guests against the show's audience, and finds the cross-genre show, or the unexpected guest, whose audience overlaps most.
- **Proof so far:** a live check on 2026-10-16 spread a five-show roster from 0.70 to 0.92 against a business podcast, in an order a programmer would recognize.
- **Demo moment:** the obvious same-genre show ranks below a show from another genre, and explainability says which comp drove it ([storyboard](/docs/ideas/0004-crossfeed.md#demo)).

## How it works

One engine runs both jobs: score a closed list against a show's audience. Launch promos ship first; guest pitches follow if time allows.

- **Launch promos:** the agent resolves the new show, or three comparable shows if it's unreleased, and the network's roster. It scores the roster against the new show's audience, flags demographic mismatches, and drafts a host-read angle for each finalist from the tags they share. It ends in an insertion order that prices each slot as inventory.
- **Guest pitches:** the agent reads the booking inbox, resolves each guest through the public work they're promoting, scores the batch against the show and its best past guests, and drafts book, decline, or later replies.

The human decides at each fork. The agent asks about comps, ambiguous matches, the slot budget, and exclusions such as shows mid-sale, and nothing goes out until the human approves the insertion order or each reply.

Only public shows and works reach Qloo. A guest without a public work is skipped, so private individuals, email addresses, and sender details never do. The [call table](/docs/ideas/0004-crossfeed.md#qloo-calls) maps each step to its Qloo request.

## Standing in the ranking

- **Rank:** 2nd of 15, at 20 out of 25. It tied Claim Check on every criterion, and a cross-vendor check broke the tie for Crossfeed, though that came from Gemini 3.5 Flash-Lite, a lightweight model that scored nearly everything 4 or 5.
- **Bonus:** the judges split. The blind reviewer named Crossfeed for the Calacanis bonus, since Calacanis runs a podcast network; the cross-vendor check named Dance Card.
- **Pre-screen:** the first ranking predicted it as one of three likely AI pre-screen favorites from descriptions alone, since it names its endpoints, quotes a number, and answers "what breaks without Qloo". How the pre-screen works is unverified.
- **Field:** no neighbor allocates promos, and the name was free in both fields at [round 9](/docs/ideas/0000-ranking.md#round-9-build-and-demo-test). The nearest 2026 repos triage creators' sponsorship inboxes or scout audience overlap for partnerships, so the description must lead with the network's own roster and guests.
- **Recommendation:** the ranking recommended building Dance Card, plus Sieve for Pull and a consumer pitch for the bonus. Choosing Crossfeed departs from it.

## Bets to test

What has to be true for Crossfeed to work, and how to find out:

- **Coverage:** Qloo resolves a real network's roster, small shows included, and the works guests promote. Check: resolve the demo network's roster and count the misses, which fall back to the human mapping them to comps.
- **Spread:** roster scores spread enough to rank, as they did in one five-show check, including when an unreleased launch stands in as three comps. Check: score the demo roster against the chosen launch, and against three comps. Guest scores bunch, so rank and confidence have to be enough for a booker to act on.
- **Throughput:** calls take 5 to 8 seconds, about 5 concurrent calls trip the rate limit, and the quota is unknown, so a 20-show roster plus 40 pitches may not run live in a demo. Check: time one full run.
- **Value:** the CPM range, the slot value, and the claim that networks number in the hundreds all need sources before the pitch uses them.
- **Trust:** bookers may weigh relationships over audience fit. The product ranks, and the human decides.

## Open questions

Decisions to settle in `/grill-with-docs`:

1.  Why Crossfeed over the ranking's recommendation, and is it our only entry or one of several substantially different entries, as the [rules allow](/docs/BRIEF.md#submission-checklist)?
2.  Which prize is it aimed at: the cash prizes, scored on the four criteria, or the Calacanis bonus, where he invests in a startup? That decides whether to pitch a company, and whether to wire Qloo into an existing agent such as OpenClaw.
3.  Do guest pitches ship by 2026-10-30? Launch promos ship first, but the demo's inbox beat and the Pull score rest on the daily guest inbox, so cutting it costs both.
4.  Does the launch flow also suggest swap partners outside the roster, as the call table allows?
5.  Which real network's roster and launch does the demo use? If it's Calacanis's own network, does that read as insight or as flattery?
6.  Where does the demo's booking inbox come from, without real people's emails?

## See also

- [Crossfeed idea doc](/docs/ideas/0004-crossfeed.md)
- [Idea ranking](/docs/ideas/0000-ranking.md)
- [Brief](/docs/BRIEF.md) and [context](/docs/CONTEXT.md)
