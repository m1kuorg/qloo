/** @jsxImportSource hono/jsx */
// The app: a signed-in member's pages under /app. A signed-out request is sent to sign in and back.
// Each network's pages answer only its members; to anyone else, a network that exists and one that
// doesn't are the same 404.
import { getAgentByName } from 'agents'
import { Hono, type Context } from 'hono'
import { accountsOn, appOrigins, jsonBody, sameOrigin, session, signedIn } from '../auth'
import {
  createInvite,
  createNetwork,
  lastNetwork,
  memberNetworks,
  memberRole,
  networkMembers,
  openInvites,
  openNetwork,
  removeMember,
  renameNetwork,
  revokeInvite,
  setRole,
  setupProgress,
  type Member,
  type Network
} from '../directory'
import { MEMBER_HEADER } from '../network-agent'
import { cpmProblem } from '../order'
import { appShell, networkLinks, type AppVariables } from '../shell'
import { readName } from '../text'

type AppEnv = { Bindings: Env; Variables: AppVariables & { member: Member } }

export const appPages = new Hono<AppEnv>()

appPages.use('/app/*', accountsOn, sameOrigin, async (c, next) => {
  const member = await signedIn(c)
  if (!member) {
    const { pathname, search } = new URL(c.req.url)
    // `next` keeps its slashes, so the address reads as the page it leads back to.
    return c.redirect(`/sign-in?next=${encodeURIComponent(pathname + search).replace(/%2F/g, '/')}`, 302)
  }
  c.set('member', member)
  await next()
  c.header('Cache-Control', 'no-store')
})
appPages.use('/app/*', appShell)

// /app opens the network the member opened last, or asks them to create their first.
appPages.get('/app', async (c) => {
  const last = await lastNetwork(c.env.DB, c.var.member.id)
  return c.redirect(last ? `/app/${last}` : '/app/new', 302)
})

// Naming a new network. The demo's and the landing page's "Create your network" lead here.
appPages.get('/app/new', async (c) => {
  c.set('networks', await memberNetworks(c.env.DB, c.var.member.id))
  return c.render(<div id="root" data-page="new-network" data-cap={c.env.NETWORKS_PER_MEMBER} />)
})

// Creates the network, with the member as its owner, unless they've created NETWORKS_PER_MEMBER.
appPages.post('/app/new', async (c) => {
  const read = readName((await jsonBody(c)).name, 'Name the network.')
  if ('error' in read) return c.json({ error: read.error }, 400)
  const cap = Number(c.env.NETWORKS_PER_MEMBER) || 0
  const id = await createNetwork(c.env.DB, c.var.member.id, read.name, cap)
  if (!id)
    return c.json(
      {
        error: `You've created ${cap} networks, the most one member can create in the beta. Open one of them instead.`
      },
      429
    )
  return c.json({ id })
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
appPages.get('/app/:networkId', async (c) => {
  const network = await networkPage(c, c.req.param('networkId'))
  if (!network) return c.notFound()
  const { invited, apiKey } = await setupProgress(c.env.DB, network.id)
  return c.render(
    <div
      id="root"
      data-page="dashboard"
      data-member-id={c.var.member.id}
      data-invited={String(invited)}
      data-api-key={String(apiKey)}
      {...island(c, network)}
    />
  )
})

// The network's roster, which every launch ranks: imported, settled, and edited over the network's
// agent by any of its members.
appPages.get('/app/:networkId/roster', async (c) => {
  const network = await networkPage(c, c.req.param('networkId'))
  if (!network) return c.notFound()
  return c.render(<div id="root" data-page="network-roster" {...island(c, network)} />)
})

// The network's booking inbox: pitches loaded, ranked against a roster show, and answered over the
// network's agent by any of its members. Like the demo's, it exists only while GUEST_PITCHES is on.
appPages.get('/app/:networkId/inbox', async (c) => {
  if (c.env.GUEST_PITCHES !== 'on') return c.notFound()
  const network = await networkPage(c, c.req.param('networkId'))
  if (!network) return c.notFound()
  return c.render(<div id="root" data-page="network-inbox" {...island(c, network)} />)
})

// The network's settings, one module per job. Its members see every module; only its owners change
// what the network module holds.
appPages.get('/app/:networkId/settings', async (c) => {
  const network = await networkPage(c, c.req.param('networkId'))
  if (!network) return c.notFound()
  // Every member sees who's in the network; only an owner sees its invites.
  const members = JSON.stringify(await networkMembers(c.env.DB, network.id))
  const invites = network.role === 'owner' ? JSON.stringify(await openInvites(c.env.DB, network.id)) : undefined
  return c.render(
    <div
      id="root"
      data-page="settings"
      data-member-id={c.var.member.id}
      data-members={members}
      data-invites={invites}
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
  const notOwner = () => c.json({ error: "Only an owner can change the network's name and CPM." }, 403)
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
// a member. Null for an owner.
async function refuseNonOwner(c: Context<AppEnv>, id: string) {
  const role = await memberRole(c.env.DB, id, c.var.member.id)
  return role === 'owner' ? null : role ? c.json({ error: OWNERS_ONLY }, 403) : c.notFound()
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
  const invite = await createInvite(c.env.DB, id, c.var.member.id)
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
      { error: "This invite can't be revoked: it was used, or it expired. Reload to see who has joined." },
      409
    )
  return c.json({ invites: await openInvites(c.env.DB, id) })
})

// Makes a member an owner, or an owner a member, unless that would leave the network with no owner.
appPages.post('/app/:networkId/settings/members/:memberId/role', async (c) => {
  const id = c.req.param('networkId')
  const refused = await refuseNonOwner(c, id)
  if (refused) return refused
  const { role: to } = await jsonBody(c)
  if (to !== 'owner' && to !== 'member') return c.json({ error: 'A member is an owner or a member.' }, 400)
  const memberId = c.req.param('memberId')
  if (!(await memberRole(c.env.DB, id, memberId))) return c.notFound()
  if (!(await setRole(c.env.DB, id, memberId, to, c.var.member.id))) return refuseLastOwner(c)
  return c.json({ members: await networkMembers(c.env.DB, id) })
})

// Removes a member, unless they're the last owner. Their open pages close at once, and every request
// they make after answers 404, as for a network that doesn't exist.
appPages.post('/app/:networkId/settings/members/:memberId/remove', async (c) => {
  const id = c.req.param('networkId')
  const refused = await refuseNonOwner(c, id)
  if (refused) return refused
  const memberId = c.req.param('memberId')
  if (!(await memberRole(c.env.DB, id, memberId))) return c.notFound()
  if (!(await removeMember(c.env.DB, id, memberId, c.var.member.id))) return refuseLastOwner(c)
  await kick(c.env, id, memberId)
  return c.json({ members: await networkMembers(c.env.DB, id) })
})

// Leaves the network, unless the member is its last owner. Their other open pages close too.
appPages.post('/app/:networkId/settings/members/leave', async (c) => {
  const id = c.req.param('networkId')
  if (!(await memberRole(c.env.DB, id, c.var.member.id))) return c.notFound()
  if (!(await removeMember(c.env.DB, id, c.var.member.id, c.var.member.id)))
    return c.json({ error: "You're this network's last owner. Make someone else an owner before you leave." }, 409)
  await kick(c.env, id, c.var.member.id)
  return c.json({})
})

// Closes a member's open connections to the network's agent, once the directory has let them go.
const kick = async (env: Env, networkId: string, memberId: string) =>
  (await getAgentByName(env.NetworkAgent, networkId)).kick(memberId)

// What every network page tells the island: where the network's agent connects, the network and the
// member's role in it, and where its pages are.
const island = (c: Context<AppEnv>, network: Network) => {
  const links = networkLinks(c.env, network.id)
  return {
    'data-agent-path': `/agents/network/${network.id}`,
    'data-network-id': network.id,
    'data-network-name': network.name,
    'data-role': network.role,
    'data-roster-link': links.roster,
    'data-inbox-link': links.inbox ?? undefined,
    'data-settings-link': links.settings
  }
}

// A network's agent, where its pages connect (`useAgent` with `basePath`). The Worker lets through only
// a WebSocket upgrade from one of the app's pages, signed in by one of the network's members, and
// names that member to the agent in a header only it writes. Anything else gets the same 404, so no
// one learns whether a network exists. The agent's answer goes back as it is: an upgrade's headers
// can't change, so the session's cookie isn't extended here.
appPages.get('/agents/network/:networkId', accountsOn, async (c) => {
  const id = c.req.param('networkId')
  const member = await session(c)
  if (
    !member ||
    c.req.header('Upgrade')?.toLowerCase() !== 'websocket' ||
    !appOrigins(c.env).includes(c.req.header('Origin') ?? '') ||
    !(await memberRole(c.env.DB, id, member.id))
  )
    return c.notFound()
  const headers = new Headers(c.req.raw.headers)
  headers.set(MEMBER_HEADER, member.id)
  const agent = await getAgentByName(c.env.NetworkAgent, id)
  return agent.fetch(new Request(c.req.raw, { headers }))
})
