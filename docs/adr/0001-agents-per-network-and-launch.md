# One agent per network and one per launch, with a D1 directory

A signed-in network keeps the per-session `CrossfeedAgent` design rather than moving its data to a shared database: each network gets one agent instance for its roster, CPM, and inbox, and each launch gets its own instance for its runs, rankings, and insertion orders. A launch instance copies the network's roster, with the evidence behind each match, when one of its runs starts, so a run ranks the roster as it stood then. A D1 database holds what has to be looked up across instances: members, passkeys, sessions, networks, memberships, invites, API keys, and an index of each network's launches for the dashboard.

We chose this over one instance per network because an instance holds one launch in focus and one run at a time, so two members planning two launches would overwrite each other's view, and an older launch's order could no longer be edited. We chose it over splitting the agent's state into tables because the agent, its replay, and its 15,000 lines of tests already work per instance. The anonymous sample network keeps one instance per visitor session, unchanged.

## Consequences

- Editing the roster or CPM doesn't change a launch until its next run starts.
- Deleting a network has to wipe each of its instances as well as its D1 rows.
