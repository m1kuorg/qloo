# One agent per network and one per launch, with a D1 directory

A signed-in network keeps the per-session agent design rather than moving its data to a shared database. Each network gets a `NetworkAgent` instance for its roster, CPM, inbox, and the list of its launches. Each launch gets a `LaunchAgent` instance for its runs, rankings, and insertion orders. Both extend `CrossfeedAgent`, which stays the demo's per-visitor session. A launch copies the network's roster, with the evidence behind each match, when one of its runs starts, so a run ranks the roster as it stood then. A D1 database holds only what has to be looked up across instances: members, passkeys, sessions, challenges, networks, memberships, invites, and API keys.

We chose this over one instance per network because an instance holds one launch in focus and one run at a time, so two members planning two launches would overwrite each other's view, and an older launch's order could no longer be edited. We chose it over splitting the agent's state into tables because the agent, its replay, and its 15,000 lines of tests already work per instance. The kinds are separate Durable Object classes, not name prefixes on one class, so a forged session cookie can never name a network's or a launch's instance.

## Consequences

- Editing the roster or CPM doesn't change a launch until its next run starts, and the launch says when its last run's roster differs from the network's.
- The dashboard reads the launch list from the network's synced state, so it updates live; each launch reports its summary to its network.
- Deleting a network removes its D1 rows first, then wipes each of its instances.
