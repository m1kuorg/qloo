// Wiping agents once the directory or their network has let go of them: a launch's, when it's deleted,
// and a network's with all of its launches' and its own Qloo gateway instance, when the network is, or
// when the daily cron clears the guest network; a deleted member's name from their networks' launches;
// and the daily cron's retry of a wipe that failed. The directory notes each wipe before it starts and crosses it off once it succeeds.
import { getAgentByName } from 'agents'
import {
  deleteMember,
  dropNetwork,
  GUEST_NETWORK,
  networkName,
  noteWipe,
  pastNetworks,
  wipeDone,
  wipesDue,
  type Instance
} from './directory'
import { GUEST_NETWORK_RESET, kickMember, launchAgentName, NETWORK_DELETED, ownGatewayName } from './network-agent'

// The bindings a wipe is noted under, and how each wipes its instance (an agent's `destroy`, a gateway's
// `wipe`), saying `reason` to the pages it closes, if it closes any; and how a network forgets a deleted
// member, noted the same way.
const LAUNCH = 'LaunchAgent'
const NETWORK = 'NetworkAgent'
const GATEWAY = 'QlooGateway'
// A deleted member's name in a network's launches, and their ID on its own agent, named
// `<networkId>:<memberId>`. A network that's gone was wiped with its launches, so it has nothing left
// to forget, and isn't woken to say so.
const FORGET = 'NetworkAgent.forgetMember'
const WIPERS: Record<string, (env: Env, name: string, reason?: string) => Promise<void>> = {
  [LAUNCH]: async (env, name, reason) => (await getAgentByName(env.LaunchAgent, name)).destroy(reason),
  [NETWORK]: async (env, name) => (await getAgentByName(env.NetworkAgent, name)).destroy(),
  [GATEWAY]: (env, name) => env.QlooGateway.getByName(name).wipe(),
  [FORGET]: async (env, name) => {
    const [networkId, memberId] = name.split(':')
    if ((await networkName(env.DB, networkId)) === null) return
    await (await getAgentByName(env.NetworkAgent, networkId)).forgetMember(memberId)
  }
}

// A wipe the cron retries only once it's this old, so it never races a deletion still under way.
const RETRY_AFTER_MS = 60_000

// Deletes a launch the network lists: noted for the wipe first, then let go of by the network's list,
// so its page and agent answer 404 from then on, then wiped. A wipe that fails is logged and left for
// the cron, since the launch is gone from the network either way.
export async function deleteLaunch(env: Env, networkId: string, launchId: string) {
  const launch = { binding: LAUNCH, name: launchAgentName(networkId, launchId) }
  await noteWipe(env.DB, launch.binding, launch.name)
  await (await getAgentByName(env.NetworkAgent, networkId)).dropLaunch(launchId)
  await wipe(env, launch).catch((e) => wipeFailed(launch, e))
}

// Every instance network `networkId` has, from the launches it lists: each launch's agent, then its own,
// then its own Qloo gateway instance, last, since its agents' calls reach it until they're wiped (ADR
// 0004). The one place a network's instances are listed, so its deletion wipes them all.
const networkInstances = (networkId: string, launches: string[]): Instance[] => [
  ...launches.map((id) => ({ binding: LAUNCH, name: launchAgentName(networkId, id) })),
  { binding: NETWORK, name: networkId },
  { binding: GATEWAY, name: ownGatewayName(networkId) }
]

// Deletes network `networkId` for good, once owner `by` has typed its name: its directory rows go first,
// with a wipe noted for each of its instances in the same batch, so its pages, agents, and API answer
// 404 from then on. Then its agent lets go, closing its open pages, and any launch planned on one since
// its list was read is noted too; then each instance is wiped, its launches' before its own, closing
// their pages. A wipe that fails is logged and left for the cron. False when `by` isn't one of its
// owners, and nothing changed.
export async function deleteNetwork(env: Env, networkId: string, by: string) {
  const agent = await getAgentByName(env.NetworkAgent, networkId)
  const instances = networkInstances(
    networkId,
    ((await agent.state).launches ?? []).map((l) => l.id)
  )
  if (!(await dropNetwork(env.DB, networkId, by, instances))) return false
  for (const late of networkInstances(networkId, await agent.letGo()))
    if (!instances.some((i) => i.name === late.name)) {
      await noteWipe(env.DB, late.binding, late.name)
      instances.unshift(late)
    }
  for (const instance of instances) await wipe(env, instance, NETWORK_DELETED).catch((e) => wipeFailed(instance, e))
  return true
}

// The daily cron's clearing of the guest network (ADR 0005), so the next guest starts afresh: its
// instances are wiped as a deleted network's are, its launches' before its own, but its directory rows
// stay, so every guest keeps their session and the guest network. Its agent lets go first, closing
// every guest's open pages with why, and any launch planned since its list was read is noted too. Its
// next start sets the sample's CPM again. A wipe that fails is logged and left for the cron.
export async function resetGuestNetwork(env: Env) {
  const agent = await getAgentByName(env.NetworkAgent, GUEST_NETWORK)
  const instances = networkInstances(
    GUEST_NETWORK,
    ((await agent.state).launches ?? []).map((l) => l.id)
  )
  for (const instance of instances) await noteWipe(env.DB, instance.binding, instance.name)
  for (const late of networkInstances(GUEST_NETWORK, await agent.letGo(GUEST_NETWORK_RESET)))
    if (!instances.some((i) => i.name === late.name)) {
      await noteWipe(env.DB, late.binding, late.name)
      instances.unshift(late)
    }
  for (const instance of instances) await wipe(env, instance, GUEST_NETWORK_RESET).catch((e) => wipeFailed(instance, e))
  const launches = instances.filter((i) => i.binding === LAUNCH).length
  console.log(JSON.stringify({ event: 'guest_network_reset', launches }))
}

// Deletes member `memberId`'s account, unless they're any network's only owner, and has each of
// `networks`, theirs, and each network they left or were removed from before, forget them. The forgets
// are noted in the batch that deletes the account; then their open pages close, so they start no run
// and approve no order after; then each network forgets them. A run started or an order approved just
// before its page closed can land the name after that, so each forget stays noted for the daily cron
// to make again and cross off; one that fails now is logged. False when it's refused, and nothing
// changed.
export async function deleteAccount(env: Env, memberId: string, networks: string[]) {
  const past = (await pastNetworks(env.DB, memberId)).filter((id) => !networks.includes(id))
  const forgets = [...networks, ...past].map((id) => ({ binding: FORGET, name: `${id}:${memberId}` }))
  if (!(await deleteMember(env.DB, memberId, forgets))) return false
  await Promise.all(networks.map((id) => kickMember(env, id, memberId, 'Your account was deleted.')))
  for (const forget of forgets) await WIPERS[FORGET](env, forget.name).catch((e) => wipeFailed(forget, e))
  return true
}

// The daily cron's retry of each wipe noted over a minute ago and not done, logging how many it wiped,
// kept, and failed. A launch its network still lists, while the network is still in the directory, was
// never let go of, as when its deletion stopped before the list let go, so it's kept and its wipe
// crossed off. Every wipe is tried, and then any that failed, or that names a binding nothing here
// wipes, fails the cron's run; they stay noted for the next.
export async function retryWipes(env: Env) {
  const done = { wiped: 0, kept: 0, failed: 0 }
  for (const instance of await wipesDue(env.DB, Date.now() - RETRY_AFTER_MS)) {
    try {
      if (await keptLaunch(env, instance)) {
        await wipeDone(env.DB, instance.binding, instance.name)
        done.kept++
      } else {
        await wipe(env, instance)
        done.wiped++
      }
    } catch (e) {
      done.failed++
      wipeFailed(instance, e)
    }
  }
  console.log(JSON.stringify({ event: 'wipes_retried', ...done }))
  if (done.failed > 0)
    throw new Error(
      `${done.failed} agent ${done.failed === 1 ? 'wipe' : 'wipes'} failed; the next daily run tries again.`
    )
}

// Whether `instance` is a launch its network, still in the directory, still lists.
async function keptLaunch(env: Env, { binding, name }: Instance) {
  if (binding !== LAUNCH) return false
  const [networkId, launchId] = name.split(':') // as launchAgentName names it
  if ((await networkName(env.DB, networkId)) === null) return false
  return (await getAgentByName(env.NetworkAgent, networkId)).listsLaunch(launchId)
}

// Wipes `instance`, then crosses its wipe off.
async function wipe(env: Env, { binding, name }: Instance, reason?: string) {
  const wiper = WIPERS[binding]
  if (!wiper) throw new Error(`Nothing wipes a ${binding} yet.`)
  await wiper(env, name, reason)
  await wipeDone(env.DB, binding, name)
}

const wipeFailed = ({ binding, name }: Instance, error: unknown) =>
  console.error(JSON.stringify({ event: 'wipe_failed', binding, name, error: String(error) }))
