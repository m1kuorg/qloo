/** @jsxImportSource hono/jsx */
// The app: a signed-in member's pages under /app. A signed-out request is sent to sign in and back.
// Each network's pages answer only its members; to anyone else, a network that exists and one that
// doesn't are the same 404.
import { getAgentByName } from 'agents'
import { Hono, type Context } from 'hono'
import {
  accountsOn,
  endSession,
  fromAppOrigin,
  guestRefused,
  jsonBody,
  jsonLimit,
  sameOrigin,
  session,
  signedIn,
  stepUpRefused
} from '../auth'
import {
  accountNetworks,
  apiKeys,
  createApiKey,
  createInvite,
  createNetwork,
  isGuestMember,
  lastNetwork,
  memberNetworks,
  memberPasskeys,
  memberRole,
  networkMembers,
  networkName,
  networksPerMember,
  newRecoveryCode,
  openInvites,
  openNetwork,
  openSessions,
  removeMember,
  removePasskey,
  renameMember,
  renameNetwork,
  restoreGuestOwner,
  revokeApiKey,
  revokeInvite,
  setRole,
  setupProgress,
  signOutEverywhere,
  takeSampleReset,
  type Member,
  type Network
} from '../directory'
import { globalGateway } from '../gateway'
import {
  kickMember,
  launchAgentName,
  MEMBER_HEADER,
  MEMBER_NAME_HEADER,
  networkLimitKey,
  onGuestBudget,
  ownGateway,
  SAMPLE_DATA_RESET,
  sampleLookups
} from '../network-agent'
import { getUsage } from '../operations'
import { cpmProblem, csvDownload } from '../order'
import { isQlooHost } from '../qloo-hosts'
import { appShell, Island, networkLinks, type AppVariables } from '../shell'
import { GUEST_MEMBER, GUEST_NETWORK, listOf, readName } from '../text'
import {
  deleteAccount,
  deleteLaunch,
  deleteNetwork,
  GUEST_LAUNCH_WIPES,
  nextRetry,
  resetGuestNetwork,
  WipesFailed
} from '../wipe'

type AppEnv = { Bindings: Env; Variables: AppVariables & { member: Member } }

export const appPages = new Hono<AppEnv>()

appPages.use(
  '/app/*',
  accountsOn,
  sameOrigin,
  async (c, next) => {
    const member = await signedIn(c)
    if (!member) {
      const { pathname, search } = new URL(c.req.url)
      // `next` keeps its slashes, so the address reads as the page it leads back to.
      return c.redirect(`/sign-in?next=${encodeURIComponent(pathname + search).replace(/%2F/g, '/')}`, 302)
    }
    c.set('member', member)
    await next()
    c.header('Cache-Control', 'no-store')
  },
  // A signed-in member's body is read only up to the limit.
  jsonLimit
)
appPages.use('/app/*', appShell)

// /app opens the network the member opened last, or asks them to create their first. A guest opens the
// guest network, since the network the guest member opened last is any guest's, and always has it to open:
// the guest member is an owner of it again if anyone demoted or removed it, or deleted it (ADR 0008). It
// asks by the ID, not the guest mark, so a temporary guest member ADR 0006 made, left until the 12:00
// clearing, still opens the network it opened last, as its own.
appPages.get('/app', async (c) => {
  if (c.var.member.id === GUEST_MEMBER) {
    await restoreGuestOwner(c.env.DB)
    return c.redirect(`/app/${GUEST_NETWORK}`, 302)
  }
  const last = await lastNetwork(c.env.DB, c.var.member.id)
  return c.redirect(last ? `/app/${last}` : '/app/new', 302)
})

// Naming a new network. The landing page's "Create your network" leads here.
appPages.get('/app/new', async (c) => {
  c.set('networks', await memberNetworks(c.env.DB, c.var.member.id))
  return c.render(<Island page="new-network" data-cap={networksPerMember(c.env)} />)
})

// Creates the network, with the member as its owner, unless they've created NETWORKS_PER_MEMBER.
appPages.post('/app/new', async (c) => {
  const read = readName((await jsonBody(c)).name, 'Name the network.')
  if ('error' in read) return c.json({ error: read.error }, 400)
  const cap = networksPerMember(c.env)
  const id = await createNetwork(c.env.DB, c.var.member, read.name, cap)
  if (!id)
    return c.json(
      {
        error: `You’ve created ${cap} networks, the most one member can create in the beta. Open one of them instead.`
      },
      429
    )
  return c.json({ id })
})

// The member's account: their name, passkeys, recovery code, sessions, networks, and deleting it. It's
// the member's own, so it comes before the network pages, whose IDs it would otherwise look like. A
// guest's page says only why no guest can change the account every guest shares, and offers signing out
// (ADR 0008), so it reads none of it.
appPages.get('/app/account', async (c) => {
  const { id, name } = c.var.member
  if (isGuestMember(c.var.member)) {
    c.set('networks', await memberNetworks(c.env.DB, id))
    return c.render(<Island page="account" data-guest-member="true" />)
  }
  const networks = await accountNetworks(c.env.DB, id)
  c.set('networks', networks)
  return c.render(
    <Island
      page="account"
      data-member-name={name}
      data-passkeys={JSON.stringify(await memberPasskeys(c.env.DB, id))}
      data-sessions={await openSessions(c.env.DB, id)}
      data-networks={JSON.stringify(networks)}
      // Signing in with a recovery code lands here, to add a passkey.
      data-recovered={String(c.req.query('recovered') !== undefined)}
    />
  )
})

// Renames the member, as their teammates see them from then on. A guest is refused, here and in the
// directory (ADR 0008).
appPages.post('/app/account/name', async (c) => {
  const guest = guestRefused(c, c.var.member)
  if (guest) return guest
  const read = readName((await jsonBody(c)).name, 'Enter your name.')
  if ('error' in read) return c.json({ error: read.error }, 400)
  await renameMember(c.env.DB, c.var.member.id, read.name)
  return c.json({ name: read.name })
})

// Removes one of the member's passkeys, never the last, so they can always sign in. Adding one is a
// passkey ceremony, under /auth/passkeys.
appPages.post('/app/account/passkeys/:credentialId/remove', async (c) => {
  const id = c.var.member.id
  const removed = await removePasskey(c.env.DB, id, c.req.param('credentialId'))
  if (removed === 'missing') return c.json({ error: 'You have no such passkey. Reload to see the ones you have.' }, 404)
  if (removed === 'last')
    return c.json(
      { error: 'This is your only passkey. Add another before you remove it, so you can still sign in.' },
      409
    )
  return c.json({ passkeys: await memberPasskeys(c.env.DB, id) })
})

// A new recovery code, shown this once, in place of the member's last one, once they've proved it's them
// in the last five minutes. A guest is refused, by the step-up and in the directory (ADR 0008).
appPages.post('/app/account/recovery-code', async (c) => {
  const unproved = await stepUpRefused(c, c.var.member)
  if (unproved) return unproved
  return c.json({ recoveryCode: await newRecoveryCode(c.env.DB, c.var.member.id) })
})

// Signs the member out on every browser, as when a device is lost: every session ends, this one's
// cookie goes, and their open pages close on every network and launch. A guest, whose sessions are every
// guest's, is refused, here and in the directory (ADR 0008).
appPages.post('/app/account/sign-out-everywhere', async (c) => {
  const guest = guestRefused(c, c.var.member)
  if (guest) return guest
  const { id } = c.var.member
  await signOutEverywhere(c.env.DB, id)
  endSession(c)
  const networks = await memberNetworks(c.env.DB, id)
  await Promise.all(
    networks.map((n) => kickMember(c.env, n.id, id, 'You signed out everywhere. Sign in again to keep working.'))
  )
  return c.json({})
})

// Deletes the member's account: them, their passkeys, sessions, and memberships, unless they're any
// network's only owner, which would leave it with no one to run it, once they've proved it's them in
// the last five minutes. A guest is refused, by the step-up and in the directory (ADR 0008). What they
// made in each network stays with it, but each launch forgets their name (wipe.ts). Their open pages close.
appPages.post('/app/account/delete', async (c) => {
  const unproved = await stepUpRefused(c, c.var.member)
  if (unproved) return unproved
  const { id } = c.var.member
  const networks = await accountNetworks(c.env.DB, id)
  if (
    !(await deleteAccount(
      c.env,
      id,
      networks.map((n) => n.id)
    ))
  ) {
    const only = networks.filter((n) => n.onlyOwner).map((n) => n.name)
    return c.json(
      {
        error: only.length
          ? `You’re the only owner of ${listOf(only)}. Make someone else an owner, or delete the network, before you delete your account.`
          : 'Your networks changed while your account was being deleted. Reload, and try again.'
      },
      409
    )
  }
  endSession(c)
  return c.json({})
})

// A network's page for one of its members, marked as the network they opened last; null, for a 404,
// when they aren't one of its members or there's no such network.
async function networkPage(c: Context<AppEnv>, id: string) {
  const network = await openNetwork(c.env.DB, id, c.var.member.id)
  if (!network) return null
  c.set('network', network)
  c.set('networks', await memberNetworks(c.env.DB, c.var.member.id))
  return network
}

// The network's dashboard: its launches, a line each for its roster and inbox, and the setup checklist.
// The guest network's, as a reset of its sample data opens it while part of the reset is left to the
// hourly retry (`?reset=pending`), says so.
appPages.get('/app/:networkId', async (c) => {
  const network = await networkPage(c, c.req.param('networkId'))
  if (!network) return c.notFound()
  const { invited, apiKey } = await setupProgress(c.env.DB, network.id)
  const pending = network.id === GUEST_NETWORK && c.req.query('reset') === 'pending'
  return c.render(
    <Island
      page="dashboard"
      data-member-id={c.var.member.id}
      data-invited={String(invited)}
      data-api-key={String(apiKey)}
      data-notice={pending ? RESET_PENDING : undefined}
      {...island(c, network)}
    />
  )
})

// The network's roster, which every launch ranks: imported, settled, and edited over the network's
// agent by any of its members.
appPages.get('/app/:networkId/roster', async (c) => {
  const network = await networkPage(c, c.req.param('networkId'))
  if (!network) return c.notFound()
  return c.render(<Island page="network-roster" {...island(c, network)} />)
})

// The network's booking inbox: pitches loaded, ranked against a roster show, and answered over the
// network's agent by any of its members. It exists only while GUEST_PITCHES is on.
appPages.get('/app/:networkId/inbox', async (c) => {
  if (c.env.GUEST_PITCHES !== 'on') return c.notFound()
  const network = await networkPage(c, c.req.param('networkId'))
  if (!network) return c.notFound()
  return c.render(<Island page="network-inbox" {...island(c, network)} />)
})

// A launch of the network, planned in its own workspace: its runs, their charts and questions, and the
// insertion order, ranked against the network's roster. Only a launch on the network's list opens.
// Its approved orders export under its own address.
appPages.get('/app/:networkId/launches/:launchId', async (c) => {
  const { networkId, launchId } = c.req.param()
  const network = await networkPage(c, networkId)
  if (!network || !(await listsLaunch(c.env, network.id, launchId))) return c.notFound()
  return c.render(
    <Island
      page="launch"
      {...island(c, network)}
      data-agent-path={`/agents/launch/${network.id}/${launchId}`}
      data-orders-link={`${networkLinks(c.env, network.id).launches}/${launchId}/insertion-orders`}
    />
  )
})

// An approved insertion order of the launch, as a CSV download for any of the network's members; a draft
// is refused with 409.
appPages.get('/app/:networkId/launches/:launchId/insertion-orders/:file{.+\\.csv}', async (c) => {
  const { networkId, launchId, file } = c.req.param()
  if (!(await membersLaunch(c, networkId, launchId))) return c.notFound()
  const id = file.slice(0, -'.csv'.length)
  const launch = await getAgentByName(c.env.LaunchAgent, launchAgentName(networkId, launchId))
  return csvDownload(id, await launch.exportInsertionOrder(id))
})

// Deletes a launch for every member, once the dashboard has asked: its row leaves every dashboard at
// once, its address and agent answer 404, and its agent's storage is wiped (wipe.ts).
appPages.post('/app/:networkId/launches/:launchId/delete', async (c) => {
  const { networkId, launchId } = c.req.param()
  if (!(await membersLaunch(c, networkId, launchId))) return c.notFound()
  await deleteLaunch(c.env, networkId, launchId)
  return c.json({})
})

// The network's settings, one module per job. Its members see every module; only its owners change
// what the network module holds.
appPages.get('/app/:networkId/settings', async (c) => {
  const network = await networkPage(c, c.req.param('networkId'))
  if (!network) return c.notFound()
  // Every member sees who's in the network; only an owner sees its invites and API keys.
  const members = JSON.stringify(await networkMembers(c.env.DB, network.id))
  const owner = network.role === 'owner'
  const invites = owner ? JSON.stringify(await openInvites(c.env.DB, network.id)) : undefined
  const keys = owner ? JSON.stringify(await apiKeys(c.env.DB, network.id)) : undefined
  // Today's usage, as the API reads it (operations.ts).
  const usage = await getUsage({
    env: c.env,
    network: network.id,
    caller: { member: c.var.member, role: network.role }
  })
  // Whether the network has its own Qloo key, as its agent knows; only an owner learns its host and last
  // four characters, from the gateway instance that keeps it, which a network without a key never has.
  const set = await (await getAgentByName(c.env.NetworkAgent, network.id)).hasOwnKey()
  const qlooKey = JSON.stringify(owner && set ? await ownGateway(c.env, network.id).ownKey() : { set })
  return c.render(
    <Island
      page="settings"
      data-member-id={c.var.member.id}
      data-members={members}
      data-invites={invites}
      data-api-keys={keys}
      data-usage={JSON.stringify(usage)}
      data-qloo-key={qlooKey}
      {...island(c, network)}
    />
  )
})

// The settings' network module: the network's name, which the directory keeps, and its CPM, which
// its agent keeps. An owner changes both; the rename checks they own it in the statement that makes it.
appPages.post('/app/:networkId/settings/network', async (c) => {
  const id = c.req.param('networkId')
  const role = await memberRole(c.env.DB, id, c.var.member.id)
  if (!role) return c.notFound()
  const notOwner = () => c.json({ error: 'Only an owner can change the network’s name and CPM.' }, 403)
  if (role !== 'owner') return notOwner()
  const { name, cpm } = await jsonBody(c)
  const read = readName(name, 'Name the network.')
  if ('error' in read) return c.json({ error: read.error }, 400)
  const problem = cpm == null ? null : cpmProblem(cpm)
  if (problem) return c.json({ error: problem }, 400)
  if (!(await renameNetwork(c.env.DB, id, c.var.member.id, read.name))) return notOwner()
  if (cpm != null) await (await getAgentByName(c.env.NetworkAgent, id)).setCpm(cpm as number)
  return c.json({ name: read.name, cpm: cpm ?? null })
})

// The settings' members module. Every route answers 404 to anyone who isn't the network's member, and
// one an owner alone may use answers 403 to a member; the directory checks the owner again in the
// statement that makes the change.
const OWNERS_ONLY = 'Only an owner can invite and manage members.'

// The answer to give a member who isn't one of network `id`'s owners: 404 outside the network, 403 to
// a member, saying `ownersOnly`. Null for an owner.
async function refuseNonOwner(c: Context<AppEnv>, id: string, ownersOnly = OWNERS_ONLY) {
  const role = await memberRole(c.env.DB, id, c.var.member.id)
  return role === 'owner' ? null : role ? c.json({ error: ownersOnly }, 403) : c.notFound()
}

// The answer to a change to member `:memberId`'s membership of network `id`, as refuseNonOwner gives it,
// but for a guest's own, which is every guest's: in a network it's in, whatever its role there, as once a
// co-owner has made it a member, the 403 that says why (guestRefused).
async function refuseMembershipChange(c: Context<AppEnv>, id: string) {
  if (c.req.param('memberId') !== c.var.member.id || !isGuestMember(c.var.member)) return refuseNonOwner(c, id)
  return (await memberRole(c.env.DB, id, c.var.member.id)) ? guestRefused(c, c.var.member) : c.notFound()
}

// The answer to a change that would leave the network with no owner.
const refuseLastOwner = (c: Context<AppEnv>) =>
  c.json({ error: 'A network needs an owner. Make someone else an owner first.' }, 409)

// A new invite link: the token rides in its fragment, which no browser sends, so it never reaches a
// log or a referrer. It's shown this once; the list shows the invite by its dates.
appPages.post('/app/:networkId/settings/members/invites', async (c) => {
  const id = c.req.param('networkId')
  const refused = await refuseNonOwner(c, id)
  if (refused) return refused
  const cap = Number(c.env.INVITES_PER_NETWORK) || 0
  const invite = await createInvite(c.env.DB, id, c.var.member.id, cap)
  if (invite === 'capped')
    return c.json(
      {
        error: `${await networkName(c.env.DB, id)} has ${cap} open invite links, the most a network can keep at once. Revoke one, or wait for one to be used or to expire.`
      },
      429
    )
  if (!invite) return c.json({ error: OWNERS_ONLY }, 403)
  return c.json({
    id: invite.id,
    link: `${new URL(c.req.url).origin}/invite#${invite.token}`,
    invites: await openInvites(c.env.DB, id)
  })
})

// Revokes an invite still open, so its link is refused from then on.
appPages.post('/app/:networkId/settings/members/invites/:inviteId/revoke', async (c) => {
  const id = c.req.param('networkId')
  const refused = await refuseNonOwner(c, id)
  if (refused) return refused
  if (!(await revokeInvite(c.env.DB, id, c.req.param('inviteId'), c.var.member.id)))
    return c.json(
      { error: 'This invite can’t be revoked: it was used, or it expired. Reload to see who has joined.' },
      409
    )
  return c.json({ invites: await openInvites(c.env.DB, id) })
})

// Makes a member an owner, or an owner a member, unless that would leave the network with no owner. A
// guest can't change its own role, which is every guest's (ADR 0008).
appPages.post('/app/:networkId/settings/members/:memberId/role', async (c) => {
  const id = c.req.param('networkId')
  const refused = await refuseMembershipChange(c, id)
  if (refused) return refused
  const { role: to } = await jsonBody(c)
  if (to !== 'owner' && to !== 'member') return c.json({ error: 'A member is an owner or a member.' }, 400)
  const memberId = c.req.param('memberId')
  if (!(await memberRole(c.env.DB, id, memberId))) return c.notFound()
  if (!(await setRole(c.env.DB, id, memberId, to, c.var.member.id))) return refuseLastOwner(c)
  return c.json({ members: await networkMembers(c.env.DB, id) })
})

// Removes a member, unless they're the last owner. Their open pages close at once, and every request
// they make after answers 404, as for a network that doesn't exist. A guest can't remove itself, which
// would remove every guest (ADR 0008).
appPages.post('/app/:networkId/settings/members/:memberId/remove', async (c) => {
  const id = c.req.param('networkId')
  const refused = await refuseMembershipChange(c, id)
  if (refused) return refused
  const memberId = c.req.param('memberId')
  if (!(await memberRole(c.env.DB, id, memberId))) return c.notFound()
  if (!(await removeMember(c.env.DB, id, memberId, c.var.member.id))) return refuseLastOwner(c)
  await kickMember(c.env, id, memberId)
  return c.json({ members: await networkMembers(c.env.DB, id) })
})

// Leaves the network, unless the member is its last owner. Their other open pages close too. A guest
// can't, as it would take every guest out (ADR 0008).
appPages.post('/app/:networkId/settings/members/leave', async (c) => {
  const id = c.req.param('networkId')
  if (!(await memberRole(c.env.DB, id, c.var.member.id))) return c.notFound()
  const guest = guestRefused(c, c.var.member)
  if (guest) return guest
  if (!(await removeMember(c.env.DB, id, c.var.member.id, c.var.member.id)))
    return c.json({ error: 'You’re this network’s last owner. Make someone else an owner before you leave.' }, 409)
  await kickMember(c.env, id, c.var.member.id)
  return c.json({})
})

// The settings' API keys module, for owners alone: a program acts for the network with a key, short of
// approving anything (ADR 0002). A new key's secret is shown this once; the list shows each key by its
// prefix and dates.
const KEYS_OWNERS_ONLY = 'Only an owner can create and revoke API keys.'

appPages.post('/app/:networkId/settings/api-keys', async (c) => {
  const id = c.req.param('networkId')
  const refused = await refuseNonOwner(c, id, KEYS_OWNERS_ONLY)
  if (refused) return refused
  const read = readName((await jsonBody(c)).name, 'Name the key, such as the script or assistant that will use it.')
  if ('error' in read) return c.json({ error: read.error }, 400)
  const cap = Number(c.env.API_KEYS_PER_NETWORK) || 0
  const key = await createApiKey(c.env.DB, id, c.var.member.id, read.name, cap)
  if (key === 'capped')
    return c.json(
      {
        error: `${await networkName(c.env.DB, id)} has ${cap} API keys in use, the most a network can keep at once. Revoke one to create another.`
      },
      429
    )
  if (!key) return c.json({ error: KEYS_OWNERS_ONLY }, 403)
  return c.json({ id: key.id, secret: key.secret, keys: await apiKeys(c.env.DB, id) })
})

// Revokes a key, effective at once: its next request answers 401.
appPages.post('/app/:networkId/settings/api-keys/:keyId/revoke', async (c) => {
  const id = c.req.param('networkId')
  const refused = await refuseNonOwner(c, id, KEYS_OWNERS_ONLY)
  if (refused) return refused
  if (!(await revokeApiKey(c.env.DB, id, c.req.param('keyId'), c.var.member.id)))
    return c.json({ error: 'This key was revoked already. Reload to see the keys in use.' }, 409)
  return c.json({ keys: await apiKeys(c.env.DB, id) })
})

// The settings' Qloo key module, for owners alone: the network's own Qloo key (ADR 0004), which its own
// gateway instance tests with one search, then keeps encrypted. No answer carries the key back: the
// settings show an owner its host and last four characters, and a member only whether one is set.
const QLOO_KEY_OWNERS_ONLY = 'Only an owner can add or remove the network’s Qloo key.'
// Longer than any Qloo key: what's pasted past it is something else.
const MAX_QLOO_KEY = 200

appPages.post('/app/:networkId/settings/qloo-key', async (c) => {
  const id = c.req.param('networkId')
  const refused = await refuseNonOwner(c, id, QLOO_KEY_OWNERS_ONLY)
  if (refused) return refused
  const { host, key } = await jsonBody(c)
  if (typeof host !== 'string' || !isQlooHost(host))
    return c.json({ error: 'Choose the host the key is for: Qloo’s production API, or the hackathon’s.' }, 400)
  const pasted = typeof key === 'string' ? key.trim() : ''
  if (!pasted) return c.json({ error: 'Paste the network’s Qloo API key.' }, 400)
  if (pasted.length > MAX_QLOO_KEY || /\s/.test(pasted))
    return c.json({ error: 'That isn’t a Qloo API key: paste the key alone, as Qloo sent it.' }, 400)
  const networkAgent = await getAgentByName(c.env.NetworkAgent, id)
  const gateway = ownGateway(c.env, id)
  // Another key would share the first one's cache and counts, so it takes the first one's removal. The
  // instance is asked only once the agent says it has a key, as after a wipe that failed once it had
  // emptied it, which leaves nothing to remove.
  if ((await networkAgent.hasOwnKey()) && (await gateway.ownKey()).set)
    return c.json({ error: 'The network has its own Qloo key already. Remove it, then add the new one.' }, 409)
  const failed = await gateway.setKey(host, pasted, networkLimitKey(id))
  if (failed) return c.json({ error: failed }, 400)
  // From here on the network's and its launches' calls go through its instance.
  await networkAgent.noteOwnKey(true)
  const usage = await getUsage({ env: c.env, network: id, caller: { member: c.var.member, role: 'owner' } })
  return c.json({ key: await gateway.ownKey(), usage })
})

// Removes the network's own key, wiping its gateway instance with its cache and counts: its Qloo calls
// go through the global gateway again. Its agents hear of it before the wipe, so none of their later
// calls reaches the wiped instance. If the wipe fails, they hear the key is back, so it stays shown and
// can be removed again.
appPages.post('/app/:networkId/settings/qloo-key/remove', async (c) => {
  const id = c.req.param('networkId')
  const refused = await refuseNonOwner(c, id, QLOO_KEY_OWNERS_ONLY)
  if (refused) return refused
  const networkAgent = await getAgentByName(c.env.NetworkAgent, id)
  if (!(await networkAgent.hasOwnKey()))
    return c.json(
      { error: 'The network has no Qloo key of its own: its calls go through Crossfeed’s shared key.' },
      409
    )
  await networkAgent.noteOwnKey(false)
  await ownGateway(c.env, id)
    .wipe()
    .catch(async (e) => {
      await networkAgent
        .noteOwnKey(true)
        .catch((again) =>
          console.error(JSON.stringify({ event: 'own_key_restore', network: id, error: String(again) }))
        )
      throw e
    })
  const usage = await getUsage({ env: c.env, network: id, caller: { member: c.var.member, role: 'owner' } })
  return c.json({ key: { set: false }, usage })
})

// The settings' danger zone, for owners alone: deleting the network once the owner has typed its name,
// for every member. Its directory rows go first, so its pages, agents, and API answer 404 at once; then
// its launches' agents and its own are wiped, closing their open pages (wipe.ts).
appPages.post('/app/:networkId/settings/delete', async (c) => {
  const id = c.req.param('networkId')
  const ownersOnly = 'Only an owner can delete the network.'
  const refused = await refuseNonOwner(c, id, ownersOnly)
  if (refused) return refused
  const name = await networkName(c.env.DB, id)
  const { name: typed } = await jsonBody(c)
  if (typeof typed !== 'string' || typed.trim() !== name)
    return c.json({ error: `Type the network’s name, ${name}, exactly as it’s shown, to delete it.` }, 400)
  if (!(await deleteNetwork(c.env, id, c.var.member.id))) return c.json({ error: ownersOnly }, 403)
  return c.json({})
})

// The settings' sample data module, in the guest network alone, where the sample lives (ADR 0007), for its
// owners, as every guest is (ADR 0008): resets the guest network to the sample data now, for every guest,
// as the daily clearing does (resetGuestNetwork in wipe.ts), its open pages told it was reset. It's refused
// with a 429 saying why, and Retry-After, closing nothing, for everyone, from any guest or address, by the
// limit that holds it longest: until 00:00 UTC while the guest budget has fewer Qloo calls left today than
// the sample's next load reserves, or past SAMPLE_RESETS_PER_DAY resets a UTC day; until the hourly retry
// next runs while more of the guest network's launches wait for its wipe than a run wipes; and inside a
// minute of the last reset. The last three are counted in the statement that takes it (takeSampleReset).
// A wipe that fails is left to the hourly retry, as the clearing leaves it, and the answer is a 202,
// `{ pending: true }`. Any other network has no sample data, so it's the same 404 as a page that doesn't
// exist.
const SAMPLE_DATA_OWNERS_ONLY = 'Only an owner can reset the sample data.'
// What the dashboard says once a reset whose wipe failed opens it (`{ pending: true }`).
const RESET_PENDING =
  'The reset may take a moment to finish: part of it failed, and Crossfeed tries it again within the hour.'

appPages.post('/app/:networkId/settings/sample-data/reset', async (c) => {
  const id = c.req.param('networkId')
  if (id !== GUEST_NETWORK) return c.notFound()
  const refused = await refuseNonOwner(c, id, SAMPLE_DATA_OWNERS_ONLY)
  if (refused) return refused
  const tooMany = (error: string, seconds: number) => {
    c.header('Retry-After', String(seconds))
    return c.json({ error }, 429)
  }
  const tomorrow = () => Math.ceil((new Date().setUTCHours(24, 0, 0, 0) - Date.now()) / 1000)
  // The sample loads again on the guest budget as the guest network next starts, through the global
  // gateway, since the reset wipes any Qloo key a guest added; refused there, it would open without it.
  const lookups = sampleLookups(c.env)
  const { qlooCalls } = await globalGateway(c.env).usage(networkLimitKey(GUEST_NETWORK))
  if (qlooCalls.used + lookups > qlooCalls.limit)
    return tooMany(
      `Loading the sample data again takes ${lookups} Qloo calls, and the guest network has ${Math.max(0, qlooCalls.limit - qlooCalls.used)} left today. Try again after 00:00 UTC, when they reset.`,
      tomorrow()
    )
  const perDay = Number(c.env.SAMPLE_RESETS_PER_DAY) || 0
  const taken = await takeSampleReset(c.env.DB, perDay, GUEST_LAUNCH_WIPES)
  if (taken !== 'taken') {
    if (taken.spent === 'day')
      return tooMany(
        `The sample data has been reset ${perDay === 1 ? 'once' : `${perDay} times`} today, the most it can be in a UTC day, for everyone. Try again after 00:00 UTC.`,
        tomorrow()
      )
    if (taken.spent === 'wipes') {
      const retry = nextRetry(Date.now())
      return tooMany(
        `The last resets left more of the guest network’s launches to wipe than Crossfeed wipes in an hour. Try again after ${String(retry.getUTCHours()).padStart(2, '0')}:00 UTC.`,
        Math.ceil((retry.getTime() - Date.now()) / 1000)
      )
    }
    const seconds = Math.ceil(taken.waitMs / 1000)
    return tooMany(
      `The sample data was just reset, and it resets at most once a minute for everyone. Try again in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`,
      seconds
    )
  }
  try {
    await resetGuestNetwork(c.env, SAMPLE_DATA_RESET)
  } catch (e) {
    if (!(e instanceof WipesFailed)) throw e
    return c.json({ pending: true }, 202)
  }
  return c.json({})
})

// What every network page tells the island: where the network's agent connects, the network and the
// member's role in it, whether it counts on the guest budget, and where its pages are.
const island = (c: Context<AppEnv>, network: Network) => {
  const links = networkLinks(c.env, network.id)
  return {
    'data-agent-path': `/agents/network/${network.id}`,
    'data-network-id': network.id,
    'data-network-name': network.name,
    'data-role': network.role,
    'data-guest-budget': onGuestBudget(network.id) ? 'true' : undefined,
    'data-roster-link': links.roster,
    'data-inbox-link': links.inbox ?? undefined,
    'data-settings-link': links.settings,
    'data-launches-link': links.launches
  }
}

// A network's agent, where its pages connect (`useAgent` with `basePath`). The Worker lets through only
// a WebSocket upgrade from one of the app's pages, signed in by one of the network's members, and
// names that member to the agent in headers only it writes. Anything else gets the same 404, so no
// one learns whether a network exists. The agent's answer goes back as it is: an upgrade's headers
// can't change, so the session's cookie isn't extended here.
appPages.get('/agents/network/:networkId', accountsOn, async (c) => {
  const id = c.req.param('networkId')
  const member = await upgradingMember(c, id)
  if (!member) return c.notFound()
  return forward(c, await getAgentByName(c.env.NetworkAgent, id), member)
})

// A launch's agent, where its page connects, checked as the network's is, and only while the network's
// list has the launch: a launch the network doesn't list is the same 404 as one that never existed.
appPages.get('/agents/launch/:networkId/:launchId', accountsOn, async (c) => {
  const { networkId, launchId } = c.req.param()
  const member = await upgradingMember(c, networkId)
  if (!member || !(await listsLaunch(c.env, networkId, launchId))) return c.notFound()
  return forward(c, await getAgentByName(c.env.LaunchAgent, launchAgentName(networkId, launchId)), member)
})

// The member asking to connect to one of network `networkId`'s agents: signed in, upgrading to a
// WebSocket from one of the app's pages, and one of its members; or null, for a 404.
async function upgradingMember(c: Context<AppEnv>, networkId: string) {
  const member = await session(c)
  if (
    !member ||
    c.req.header('Upgrade')?.toLowerCase() !== 'websocket' ||
    !fromAppOrigin(c) ||
    !(await memberRole(c.env.DB, networkId, member.id))
  )
    return null
  return member
}

// Hands the upgrade to the agent, naming its member in headers that replace any the browser sent. A
// header can't carry every character a name can, so the name goes URI-encoded.
function forward(c: Context<AppEnv>, agent: { fetch: (request: Request) => Promise<Response> }, member: Member) {
  const headers = new Headers(c.req.raw.headers)
  headers.set(MEMBER_HEADER, member.id)
  headers.set(MEMBER_NAME_HEADER, encodeURIComponent(member.name))
  return agent.fetch(new Request(c.req.raw, { headers }))
}

// Whether the member is in network `networkId` and its list has launch `launchId`, for the routes under a
// launch that aren't its page.
const membersLaunch = async (c: Context<AppEnv>, networkId: string, launchId: string) =>
  Boolean(await memberRole(c.env.DB, networkId, c.var.member.id)) && (await listsLaunch(c.env, networkId, launchId))

// Whether network `networkId`'s list of launches has launch `launchId`.
const listsLaunch = async (env: Env, networkId: string, launchId: string) =>
  (await getAgentByName(env.NetworkAgent, networkId)).listsLaunch(launchId)
