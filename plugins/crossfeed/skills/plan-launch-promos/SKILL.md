---
name: plan-launch-promos
description: Plan a podcast launch's promos across a network's own shows with Crossfeed's MCP tools, which rank the roster by listener overlap in Qloo and draft an insertion order that a member approves in the app. Use when the user wants to plan, run, or rerun a Crossfeed launch, pick which roster shows promote a new show and how many slots each gets, settle the roster for a launch, change a draft insertion order, understand why a show ranks where it does on a launch's chart, see which of the network's own shows share listeners with each other, or who the network's shows reach by age and gender.
license: MIT
compatibility: Needs Crossfeed's MCP server (tools such as create_launch and get_launch), connected with one of the network's API keys.
---

# Plan launch promos

Crossfeed ranks a podcast network's own shows by how much their listeners overlap a launch's, in Qloo, and drafts an insertion order that prices each promo slot from the network's downloads and CPM. Its agent stops to ask a person at each fork, such as the slot budget. You drive it through the Crossfeed MCP tools and carry each question to the human you're working with; a member of the network approves the order in the app.

## Rules

Hold every rule through every step.

- **Relay, word for word.** When a run waits on a question, put the question to the human exactly as the tool gives it, with its options, and wait for their reply. Send their answer in their own words, through the tool, IDs, and fields the result names. Never invent an answer: no guess, no default, no option picked because it looks likely. Until the human answers, the run waits.
- **Approval is a member's, in the app.** No tool approves an insertion order, and you never approve one. When the draft is ready, give the human the launch's page from `get_launch` and say a member of the network approves the order there; it exports as CSV only after that.
- **Send public names and the human's answers.** The tools need show names, the launch or its comps, and the human's answers. Keep guest names, email addresses, and sender details out of every tool call, and out of anything you send or write outside this conversation.
- **Evidence before why.** Before any sentence about why a show ranks where it does, a climber's climb included, read the Qloo call behind it with `get_evidence` and the call number the chart cites (the chart's `call`, a finalist's `sharedTags.call`), and cite that number. Lead with rank and band, as the app does; a raw score stays with its call. Fit rank and band come from Qloo; topic rank is Claude's estimate from show names and descriptions, not Qloo data. Fit describes shared listeners, never a fact about a person.
- **Read `summary` first.** Every result carries a `summary` that says where things stand and which tool to call next. A refusal carries `error.code` and a message for a person: give the human that message as it is.

## Steps

1.  **Settle the roster.** Call `get_network` for the network and its CPM, and `get_roster`.
    - No shows: ask the human for the roster, a CSV with a `name` column and any of `downloads`, `status`, and `description`, or one show name per line, then call `import_roster`. Importing over a roster that has shows takes `replace`, so set it only with the human's yes.
    - `pending`: call `get_roster` again every few seconds until it's `settled`.
    - An `ambiguous` show: give the human its candidates and send their pick with `update_show` and `entityId`.
    - A show with no match: ask whether to stand a comparable show in for it. Search for the human's comp with `search_comps`, read the roster until the search settles, and map their pick with `update_show` and `compId`.
    - No CPM: slot values need one, and no tool here sets it: an owner sets it in the network's settings in the app. Tell the human, and carry on without values if they want to.

    Done when the roster is `settled` and every ambiguous or unmatched show is settled or left as the human chose.

1.  **Name the launch.** Ask the human which launch to plan: a released show, by the name Qloo lists it under, or up to three released shows as comps for one not out yet. Call `create_launch`, or use the launch from `list_launches` when the human names one that exists. Done when you hold the launch's ID.
1.  **Start the run.** Call `start_launch_run` with the launch's ID, when the human asks for a plan or a rerun: a run counts as one of the network's model runs for the day, and starting one ends any run left waiting. Read the launch with `get_launch` every few seconds while its run is `running`.
1.  **Relay each question.** When `get_launch` shows the run `waiting`, relay its question by the rules, then send the human's answer with `answer_launch_question` and the `launchId`, `runId`, `questionId`, and fields its summary names: `slots` or `dollars` for a budget, `exclude` for exclusions, `comps` for comps, `picks` for confirming comps, `choice` or `text` for the rest. Read the launch again as in step 3. Done when the run is `completed`, `stopped`, or `failed`.
1.  **Present the plan.** From the latest run, show the chart (rank, show, band, finalists, and the climbers a topic plan would have missed), any finalist whose listeners differ from the launch's, and the draft insertion order (each show's slots, value, and host-read angle, then the total). For a run that stopped or failed, give its reason. When `get_launch` says the network's roster has changed since the run, say so and offer a rerun. Done when the human has seen the chart and the draft.
1.  **Edit on request.** Change the draft only as the human asks, with `edit_order` and every line the order keeps, each with its `show`, `slots`, and `angle`; leaving a line out drops that show. Read the new totals back. Editing an approved order returns it to draft.
1.  **Hand off approval.** Give the human the launch's page and say a member of the network approves the order there, then exports it. Done when the human has the draft as they want it and that link.

## Which shows share listeners

When the human asks which of the network's own shows share listeners, or which pair would trade promos well, read the roster's overlap with `get_overlap`.

- **Not measured, or stale:** measuring it with `measure_overlap` spends one Qloo call per show matched in Qloo, so ask the human first. It needs at least four such shows and a settled roster. Read it with `get_overlap` every few seconds while it's `measuring`.
- **Present it** as the summary does: each show's closest shows by rank and band within its own ranking, then the close pairs in the tool's words. A rank compares shows within one show's ranking only, never across shows, and it describes shared listeners, never a fact about a person.
- **A failed show** keeps its reason; measuring again asks only for the shows missing or failed.

## Who the shows reach

When the human asks who the network's shows reach, or which shows' listeners skew younger, older, male or female, read the roster's listener profile with `get_listeners`.

- **Not profiled, or stale:** profiling it with `profile_listeners` spends one Qloo call, so ask the human first. It needs at least four shows matched in Qloo and a settled roster. Read it with `get_listeners` every few seconds while it's `profiling`.
- **Present it** as the summary does: the finding, then each show's leans in the tool's words. A lean is relative to the average in Qloo and describes a show's listeners, never a fact about a person, and a gender lean under 0.2 either way doesn't count.
- **A show with no profile** in Qloo says so; profiling again doesn't change that.
