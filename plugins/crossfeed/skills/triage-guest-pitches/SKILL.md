---
name: triage-guest-pitches
description: Triage a podcast's guest pitches with Crossfeed's MCP tools, which read each pitch for the public work it promotes, rank those works against one of the network's shows by listener overlap in Qloo, and draft Book, Later, or Decline replies that a member approves in the app. Use when the user wants to sort, rank, or answer guest or booking pitches, load a day's pitches or an inbox export into Crossfeed, or decide which pitched guests a show should book.
license: Apache-2.0
compatibility: Needs Crossfeed's MCP server with guest pitches switched on (tools such as load_pitches and get_pitch_run), connected with one of the network's API keys.
---

# Triage guest pitches

Crossfeed reads each pitch for its guest and the public work they're promoting, a book, film, TV show, or podcast, and ranks those works by listener overlap in Qloo against one of the network's shows and the works of its best past guests. Then it drafts a reply to every pitch. Only each pitch's public work reaches Qloo. You drive it through the Crossfeed MCP tools and carry each of its questions to the human you're working with; a member of the network approves each reply in the app, and Crossfeed sends no email.

## Rules

Hold every rule through every step.

- **Relay, word for word.** When a pitch run waits on a question, put the question to the human exactly as the tool gives it, with its options, and wait for their reply. Send their answer in their own words, through the tool, IDs, and fields the result names. Never invent an answer: no guess, no default, no option picked because it looks likely. Until the human answers, the run waits.
- **Approval is a member's, in the app.** No tool approves, edits, or discards a reply, and you never approve one. Give the human the inbox page from `get_pitch_run`: a member approves, edits, or discards each reply there and copies the approved ones out by hand.
- **Private details stay where they came from.** Pitches carry senders' names and addresses and guests' names. Hand the pitches to `load_pitches` as they came: it's the one tool made for them. Everywhere else, name a pitch by its ID and its public work: in answers, in the show you rank against, and in anything you send or write outside this conversation, such as a message, an issue, or a file. The other field that takes a person's name is a past guest's `guest`, which Crossfeed uses only to match a book by its author and never sends to Qloo.
- **Evidence before why.** Explain a rank only from what `get_pitch_run` returned: the work's rank, band, and the tags it shares with the show, each from a Qloo call that the inbox page opens in full. Lead with rank and band, as the app does. Fit describes shared listeners: present a low rank as fewer listeners shared with this show, never as a judgment of the guest. A pitch rank is Claude's reading of the pitch's own words, not evidence: use it only to say where the wording and the listeners disagree, never as a reason a guest fits.
- **Read `summary` first.** Every result carries a `summary` that says where things stand and which tool to call next. A refusal carries `error.code` and a message for a person: give the human that message as it is.

## Steps

1.  **Check the inbox.** Call `get_inbox`. When it already holds pitches, ask whether to triage those or load new ones. Loading over pitches takes `replace`, which also drops the last pitch run's lists and replies, so set it only with the human's yes.
1.  **Load the pitches.** Up to 50, as the human gives them: their text as `text`, with a line of three dashes between pitches and any `From:` and `Subject:` lines at the top of each; or as `pitches`, each with its `body` and any `from` and `subject`. Reading them counts as one of the network's model runs for the day. Call `get_inbox` every few seconds until it's `done`. Done when the inbox is `done`.
1.  **Confirm ambiguous works.** For each pitch whose work is `ambiguous`, give the human its candidates, by title and whatever tells them apart, and send their choice with `confirm_work` and `entityId`. Say which pitches stay unranked: those with no public work, and works Qloo has no match for. Done when every ambiguous work is confirmed or left as the human chose.
1.  **Choose the show.** Ask which of the network's shows the pitches are for, named as on the roster (`get_roster` lists them; it must be matched in Qloo), and whether to weigh up to five of its best past guests, each with their public work's title, type, and year.
1.  **Start the run.** Call `start_pitch_run` with the `show` and any `pastGuests`. It counts as one of the network's model runs, and starting one ends any pitch run left waiting. Keep the run's ID for the rest of the conversation; in a later one, `list_pitch_runs` finds it, newest first. Read it with `get_pitch_run` every few seconds while it's `running`.
1.  **Relay each question.** When the run is `waiting`, relay its question by the rules, then send the human's answer with `answer_pitch_question`, the `runId` and `questionId`, and `choice` or `text`. Read the run again as in step 5. Done when the run is `completed`, `stopped`, or `failed`.
1.  **Present the triage.** For each work type, show the ranked works with their bands and shared tags and the works it couldn't score, with why; then each pitch's drafted reply with its verdict, Book, Later, or Decline. For a run that stopped or failed, give its reason. Done when the human has seen every list and reply.
1.  **Hand off approval.** Give the human the inbox page and say a member of the network approves, edits, or discards each reply there before anyone sends it. Done when the human has the drafted replies and that link.
