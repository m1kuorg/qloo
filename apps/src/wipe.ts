// Wiping agents once the directory or their network has let go of them: a launch's, when it's deleted,
// and a network's with all of its launches' and its own Qloo gateway instance, when the network is; the
// guest network's launches', its own, and its gateway instance, when the daily cron clears it; the
// networks only the guest member, or only temporary guest members, own, as the daily cron clears what
// guests made; a deleted member's name from their networks' launches; and the hourly cron's retry of a wipe
// that failed. The directory notes each wipe before it starts and crosses it off once it succeeds.
import { getAgentByName } from 'agents'
import {
  clearGuestMember,
  clearGuestNetwork,
  deleteMember,
  dropNetwork,
  dropTemporaryGuests,
  guestOwnedNetworks,
  networkName,
  networksPerMember,
  noteWipe,
  pastNetworks,
  wipeDone,
  wipesDue,
  type Instance
} from './directory'
import {
  CLEARING,
  GUEST_NETWORK_RESET,
  kickMember,
  launchAgentName,
  NETWORK_DELETED,
  ownGatewayName
} from './network-agent'
import { GUEST_MEMBER, GUEST_NETWORK } from './text'

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
  [NETWORK]: async (env, name) => (await networkToWipe(env, name)).destroy(),
  [GATEWAY]: (env, name) => env.QlooGateway.getByName(name).wipe(),
  [FORGET]: async (env, name) => {
    const [networkId, memberId] = name.split(':')
    if ((await networkName(env.DB, networkId)) === null) return
    await (await getAgentByName(env.NetworkAgent, networkId)).forgetMember(memberId)
  }
}

// A wipe the cron retries only once it's this old, so it never races a deletion still under way.
const RETRY_AFTER_MS = 60_000

// The most wipes one run of the cron's retry makes, so an hourly run stays within the Workers Free plan's
// 50 subrequests, D1 queries and Durable Object calls alike (TRD): each takes at most six, a launch's
// whose network is still in the directory, and the run's own two directory batches take two more. The
// rest stay noted for the next hour's run.
const WIPES_PER_RUN = 7

// Network `networkId`'s agent, to be wiped: started, if it isn't running, knowing it's about to be thrown
// away, so the guest network's loads no sample (CLEARING).
const networkToWipe = (env: Env, networkId: string) => getAgentByName(env.NetworkAgent, networkId, { props: CLEARING })

// Deletes a launch the network lists: noted for the wipe first, then let go of by the network's list,
// so its page and agent answer 404 from then on, then wiped, its open pages closing with `reason` if
// given. A wipe that fails is logged and left for the cron, since the launch is gone from the network
// either way, and the answer is false.
export async function deleteLaunch(env: Env, networkId: string, launchId: string, reason?: string) {
  const launch = { binding: LAUNCH, name: launchAgentName(networkId, launchId) }
  await noteWipe(env.DB, launch)
  await (await getAgentByName(env.NetworkAgent, networkId)).dropLaunch(launchId)
  return wipe(env, launch, reason).then(
    () => true,
    (e) => {
      wipeFailed(launch, e)
      return false
    }
  )
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
  const agent = await networkToWipe(env, networkId)
  const instances = networkInstances(
    networkId,
    ((await agent.state).launches ?? []).map((l) => l.id)
  )
  if (!(await dropNetwork(env.DB, networkId, by, instances))) return false
  for (const late of networkInstances(networkId, await agent.letGo()))
    if (!instances.some((i) => i.name === late.name)) {
      await noteWipe(env.DB, late)
      instances.unshift(late)
    }
  for (const instance of instances) await wipe(env, instance, NETWORK_DELETED).catch((e) => wipeFailed(instance, e))
  return true
}

// The daily cron's clearing of the guest network (ADR 0006), so each day's guests start afresh, keeping
// their sessions and the guest network's directory rows. Its agent lets go first, closing every guest's open
// pages of it with why, and names the launches it lists; then one batch restores its name and notes a wipe
// of each of those launches, of its agent, and of its own Qloo gateway instance; then its agent is wiped,
// which takes the launches off its list, so their pages and agents answer 404, then its gateway instance,
// with any key a guest added. The launches' own agents are left to the hourly retry, so the clearing's
// subrequests stay the same however many launches it lists (#275); until then a page of one still open
// can't start a run (NetworkAgent.rosterForLaunch). The agent's next start loads the sample network again
// (ADR 0007). It's started, if it isn't running, to be wiped, so it loads none now (networkToWipe). Logs how
// many launches it noted and how many wipes failed; one that failed stays noted for the next hour's retry,
// and fails this run.
export async function resetGuestNetwork(env: Env) {
  const launches = await letGoOfGuestNetwork(env)
  const instances = networkInstances(GUEST_NETWORK, launches)
  await clearGuestNetwork(env.DB, instances)
  let failed = 0
  for (const instance of instances.filter((i) => i.binding !== LAUNCH))
    await wipe(env, instance).catch((e) => {
      failed++
      wipeFailed(instance, e)
    })
  console.log(JSON.stringify({ event: 'guest_network_reset', launches: launches.length, failed }))
  if (failed > 0)
    throw new Error(
      `Clearing the guest network, ${failed} agent ${failed === 1 ? 'wipe' : 'wipes'} failed; the next hourly run tries again.`
    )
}

// Has the guest network's agent let go (NetworkAgent.letGo), and returns the launches it lists, once any
// wipe of it still under way has finished, as when a guest has just deleted it: a wiped agent's calls throw
// "destroyed" until its instance starts again, a moment later, so this asks again, a little later each
// time, a few times.
async function letGoOfGuestNetwork(env: Env) {
  for (let tries = 1; ; tries++)
    try {
      return await (await networkToWipe(env, GUEST_NETWORK)).letGo(GUEST_NETWORK_RESET)
    } catch (e) {
      if ((e as Error).message !== 'destroyed' || tries === 5) throw e
      await new Promise((resolve) => setTimeout(resolve, 100 * tries))
    }
}

// Deletes member `memberId`'s account, unless they're any network's only owner, and has each of
// `networks`, theirs, and each network they left or were removed from before, forget them. The forgets
// are noted in the batch that deletes the account; then their open pages close, so they start no run
// and approve no order after; then each network forgets them. A run started or an order approved just
// before its page closed can land the name after that, so each forget stays noted for the hourly cron
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

// The daily cron's removal of the temporary guest members ADR 0006 made, a member per guest sign-in (ADR
// 0008): the directory deletes them and the networks only they own, noting a wipe of each network's agent,
// which a later run's retry makes. Logs how many members and networks it removed.
export async function removeTemporaryGuests(env: Env) {
  const removed = await dropTemporaryGuests(env.DB, NETWORK)
  console.log(JSON.stringify({ event: 'guests_removed', ...removed }))
}

// The daily cron's clearing of what the guest member made beyond the guest network (ADR 0008), so each day
// starts from the sample alone. Each network only it owns, at most NETWORKS_PER_MEMBER of them, lets go
// first, closing its open pages, and names the launches it lists; then, in a batch of its own, the
// directory deletes them, noting a wipe of each of their instances, which the next runs' retry makes, takes
// the guest member out of the networks it shares with others, and deletes the API keys and invite links it
// made. Then guests' open pages of the networks it left close. Logs how many networks it deleted and left.
export async function clearGuests(env: Env) {
  const deleting: { id: string; instances: Instance[] }[] = []
  for (const id of await guestOwnedNetworks(env.DB, networksPerMember(env)))
    deleting.push({ id, instances: networkInstances(id, await (await networkToWipe(env, id)).letGo()) })
  const { networks, left } = await clearGuestMember(env.DB, deleting)
  await Promise.all(left.map((id) => kickMember(env, id, GUEST_MEMBER)))
  console.log(JSON.stringify({ event: 'guest_member_cleared', networks, left: left.length }))
}

// The hourly cron's retry of the oldest wipes noted over a minute ago and not done, at most WIPES_PER_RUN,
// logging how many it wiped, kept, and failed: the wipes that failed, and those the daily clearing left to
// it. A launch its network still lists, while the network is still in the directory, was never let go of,
// as when its deletion stopped before the list let go, so it's kept and its wipe crossed off. A network's agent is wiped as wipeNetwork says. Every wipe is
// tried, and then any that failed, or that names a binding nothing here wipes, fails the cron's run;
// they stay noted for the next.
export async function retryWipes(env: Env) {
  const done = { wiped: 0, kept: 0, failed: 0 }
  for (const instance of await wipesDue(env.DB, Date.now() - RETRY_AFTER_MS, WIPES_PER_RUN)) {
    try {
      if (await keptLaunch(env, instance)) {
        await wipeDone(env.DB, instance.binding, instance.name)
        done.kept++
      } else {
        await (instance.binding === NETWORK ? wipeNetwork(env, instance.name) : wipe(env, instance, closing(instance)))
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
      `${done.failed} agent ${done.failed === 1 ? 'wipe' : 'wipes'} failed; the next hourly run tries again.`
    )
}

// Wipes network `networkId`'s agent, as the cron's retry does, when its launches' wipes may never have been
// noted, as when removing temporary guests deleted it: the agent lets go first, closing its open pages, and
// names the launches it lists, whose wipes, and its own Qloo gateway instance's, are noted for the next runs,
// in one batch; then it's wiped. A launch already wiped is wiped again, which finds it empty.
async function wipeNetwork(env: Env, networkId: string) {
  const agent = await networkToWipe(env, networkId)
  const launches = await agent.letGo(networkId === GUEST_NETWORK ? GUEST_NETWORK_RESET : NETWORK_DELETED)
  await noteWipe(env.DB, ...networkInstances(networkId, launches).filter((i) => i.binding !== NETWORK))
  await agent.destroy()
  await wipeDone(env.DB, NETWORK, networkId)
}

// What the open pages of a launch the retry wipes say as they close: for the guest network's, which the
// daily clearing left to the retry (resetGuestNetwork), that it was cleared.
const closing = ({ binding, name }: Instance) =>
  binding === LAUNCH && name.startsWith(`${GUEST_NETWORK}:`) ? GUEST_NETWORK_RESET : undefined

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
