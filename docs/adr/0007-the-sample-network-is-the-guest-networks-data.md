# The sample network is the guest network's data

The sample network stops being a demo of its own and becomes data: The Ringer's public show names with their labelled sample figures, the sample CPM, the sample launch, The Watch, and the sample inbox are loaded into the guest network when its agent first starts, each day after the daily cron clears it. Anyone who wants to try Crossfeed signs in as a guest, in one click, and lands in the guest network with the sample already there. The standalone demo's pages go; `/demo` sends people to guest sign-in, so links to it keep working. No other network starts from the sample: a member's network starts from its own roster and pitches.

The guest network's sample launch keeps the demo's safety net ([ADR 0004](/docs/adr/0004-qloo-key-per-network.md)): while its roster and launch are still the sample's, a run of it that Qloo or a daily cap refuses replays the stored sample run, as the demo did. Since every guest owns the one guest network, any guest's change to its roster or launch turns that off for everyone until the daily clearing; the sample isn't loaded into a network of each guest's own, which would have kept the replay for each, because the guest network is the one shared place guests try the product together.

We chose this over keeping the demo beside guest sign-in because two ways to try the product split the people trying it between a session no one else sees and the shared network everyone does, and the demo couldn't do what the product does: invite, keep a launch, or approve for a team.

## Consequences

- `CrossfeedAgent` stays as the engine the network and launch agents extend, and its per-session route stays for its own tests, answering only while a test-only variable is on, so production keeps no anonymous per-visitor agents outside the guest budget.
- Trying Crossfeed needs accounts on; with `ACCOUNTS` off, the public pages offer no way in.
- All guests share 10 model runs a day; past that, only the unchanged sample launch runs, by replaying.
- The sample inbox is pre-loaded too, its pitches already read from their answer key, so loading it calls no model and counts no model run: only its 36 works' searches, reserved on the guest budget. No inbox offers to load it, and the engine refuses to.
