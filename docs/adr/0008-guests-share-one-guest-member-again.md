# Guests share one guest member again

Superseding [ADR 0006](/docs/adr/0006-each-guest-is-a-member.md)'s guest member per sign-in, and keeping the rest of it. "Sign in as a guest" signs everyone in as the one guest member, "Guest", an owner of the guest network, the shared guest workspace, with a session of its own for a day. As an owner, a guest can do everything in a network: change its settings and CPM, invite people, manage members, API keys, and a Qloo key, plan and run launches, approve, delete the guest network, and create networks, which every guest shares and which count against the guest budget. What a guest can't do is change the one account every guest is signed in as: add a passkey or a recovery code, rename it, sign out everywhere, delete it, join another network by invite, or leave a network, remove itself, or change its own role, any of which would act for every guest at once. Signing in, and opening the app, make the guest member an owner of the guest network again if anyone demoted or removed it.

The guest budget, the log of guest sign-ins with its minute's and day's limits, a live session going where it was headed rather than signing in again, the guest network's sample, and the daily clearing stay as ADRs 0006 and [0007](/docs/adr/0007-the-sample-network-is-the-guest-networks-data.md) set them. The daily clearing now also deletes the networks only the guest member owns besides the guest network, takes it out of the networks it shares with real members, and deletes the API keys and invite links it made, so each day starts from the sample alone. With no temporary members left, there's nothing for an hourly cleanup to remove; the hourly cron keeps clearing expired rows and retrying wipes.

We went back to one shared member because the user wants one shared guest workspace, with no guest of their own. A guest member per sign-in gave each guest a name, an account to keep, and networks of their own, which made the guest experience a set of private accounts beside the shared one.

## Consequences

- A guest can't keep what they made: a network of their own needs an account, through "Sign out and create an account".
- Every guest sees and changes everything any guest made, the networks a guest creates too, until the daily clearing.
- One guest can delete the guest network, invite real members into it, or revoke a key another guest made; the next guest sign-in makes the guest network again, and the daily clearing starts it over.
- The temporary members ADR 0006 made are removed by the daily clearing, with the networks only they own, so a deploy needs no migration that deletes anything.
