# Crossfeed

Crossfeed tells a podcast network which of its own shows should promote a launch, and which pitched guests its listeners actually want, by scoring the network's own lists in Qloo. It also uses Qloo's own words (entity, tag, signal, filter, affinity) as the [brief](/docs/BRIEF.md#qloo-in-brief) defines them.

## People and access

**Network**:
A company that owns a roster of podcasts and sells ads on them, and the workspace its members sign in to.
_Avoid_: Workspace, organization, account, team, tenant

**Member**:
A person who signs in to Crossfeed and belongs to one or more networks.
_Avoid_: User, account, seat

**Owner**:
A member who can invite and remove members, manage API keys, and delete the network.
_Avoid_: Admin

**Invite**:
A link an owner shares that lets one person join the network as a member.

**Passkey**:
The credential a member signs in with, kept by their device or password manager.
_Avoid_: Password, login

**Recovery code**:
A one-time code a member keeps to sign in after losing every passkey.
_Avoid_: Backup code, reset link

**API key**:
A secret that lets a program act for one network through the API, the SDK, or the MCP server, short of approving anything.
_Avoid_: Token, access token

**Visitor**:
Someone using the sample network without signing in.
_Avoid_: Guest, which means a pitched guest, or someone signed in to the guest network

**Guest network**:
The one network anyone can open with "Sign in as a guest", without a passkey: everyone who does shares it, everything in it, and its daily caps.
_Avoid_: Guest workspace, demo account

**Guest member**:
The one member everyone who signs in as a guest is signed in as; it belongs to the guest network, owns nothing, and has no passkey or recovery code.
_Avoid_: Guest user, guest account

**Sample network**:
The demo network built from The Ringer's public show names with labelled sample figures, open to any visitor.
_Avoid_: Demo account

## Launch promos

**Roster**:
The network's own shows, the closed list Crossfeed scores.

**Launch**:
The new show a network is promoting, released or not, with the runs and insertion orders that plan its promos.
_Avoid_: Project, campaign

**Comp**:
A released show that stands in for an unreleased launch; up to three per launch.

**Run**:
One pass of the agent: ranking the roster against a launch, or pitched works against a show, through to its closing line.

**Listeners**:
The people who hear a show.
_Avoid_: Audience, which is a Qloo term for a group defined by signals

**Fit**:
How a roster show or pitched work ranks against the launch or show in Qloo, shown as a rank and a band.

**Finalist**:
A roster show the insertion order can use: one of the top five by fit after exclusions.

**Promo slot**:
One host-read promo for the launch on one episode of a roster show.

**Slot value**:
The ad revenue a promo slot displaces: downloads per episode times CPM, divided by 1,000.

**Insertion order**:
The approved launch plan: which shows, how many slots, each slot's angle, and the total slot value.

**Host-read angle**:
A drafted line for a host, built from the tags the show and the launch share.

## Guest pitches

**Inbox**:
The network's guest pitches, loaded for a booker to rank and answer.

**Pitch**:
An email in the inbox proposing a guest.

**Public work**:
The book, show, film, or podcast a pitched guest is promoting; the only thing about a guest that reaches Qloo.

**Verdict**:
A booker's decision on a pitch: book, decline, or later.

## Trust

**Evidence**:
The Qloo calls, entities, tags, and affinities behind a claim.

**Approval**:
A member's explicit sign-off that makes an insertion order or a reply final; only a member in the app can give it.
