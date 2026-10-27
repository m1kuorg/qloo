# Guests share one member and one network

Anyone can sign in as a guest, without a passkey, and lands in the guest network, a real network they can import a roster into, plan launches in, and approve in. Every guest signs in as the same guest member, who belongs to the guest network as a member and owns nothing. Every daily cap a network has is counted for the guest network as a whole, so all guests together share one budget of model runs, free starts, and Qloo calls a UTC day, whoever they are and wherever they sign in from. Guest sign-ins have one limit a minute for everyone, counted exactly in the D1 directory, rather than one per visitor or a Cloudflare rate limit, whose counts are kept per location.

We chose one shared member over a new member for each guest because a member per guest would add rows on every click that nothing removes, and each would get the caps a member gets, such as networks of their own, so a guest could multiply them by signing in again. With one member and one network there is no per-guest count to multiply. We kept the guest network's caps at the values every network has.

This amends [ADR 0003](/docs/adr/0003-passkeys-built-in-house.md): the guest member is the one member who signs in without a passkey. The guest network is also the one network without an owner, against the rule that a network keeps one.

## Consequences

- No guest can rename or delete the guest network, set its CPM, invite people, remove members, or manage API keys or a Qloo key. Its CPM is the sample network's, set when its agent starts.
- The guest member holds no passkey or recovery code, so nothing that needs a step-up is open to a guest. No guest can rename the member, sign out everywhere, delete the account, create a network, join one by invite, or leave the guest network.
- A guest session lasts a day and isn't extended, so guest sessions don't pile up for 30 days.
- Everything in the guest network is seen and changed by every guest. An approval in it is the guest member's sign-off ([ADR 0002](/docs/adr/0002-approval-stays-in-the-app.md)). A launch holds one run at a time and the network one inbox ([ADR 0001](/docs/adr/0001-agents-per-network-and-launch.md)), so two guests working at once see each other's changes. The daily cron clears it at 12:00 UTC, closing every guest's open pages, so each day's guests start from an empty roster with the sample network's CPM; the day's caps are left as they are.
- One guest can spend the day's shared budget for every other guest. The guest network's runs also count toward the caps every run shares.
