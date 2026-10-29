// Wiping agents once the directory or their network has let go of them: a launch's, when it's deleted,
// and a network's with all of its launches' and its own Qloo gateway instance, when the network is; the
// guest network's launches', its own, and its gateway instance, when the daily cron clears it and when an
// owner resets its sample data from its settings; the networks only the guest member, or only temporary
// guest members, own, as the daily cron clears what guests made; a deleted member's name from their
// networks' launches; and the hourly cron's retry of a wipe that failed. The directory notes each wipe
// before it starts and crosses it off once it succeeds.
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
  wipeReason,
  wipesDue,
  type Instance
} from './directory'
import { WIPED } from './gateway'
import {
  CLEARING,
  GUEST_NETWORK_RESET,
  kickMember,
  LAUNCH_DELETED,
  launchAgentName,
  NETWORK_DELETED,
  ownGatewayName,
  readLaunchAgentName
} from './network-agent'
import { GUEST_MEMBER, GUEST_NETWORK } from './text'

// Awaits `wipe`, a call that wipes an instance, counting the instance's own reset after it as the wipe
// done. Once a wipe has deleted its instance's storage, the instance resets itself: an agent's `destroy`
// says "destroyed" (DESTROYED), and a gateway's `wipe` says WIPED. On Cloudflare that reset reaches the
// caller before the wipe's answer does (#297), as an error whose message is the reset's reason, which
// workerd marks `durableObjectReset`. In the Workers vitest pool and on the dev server the answer comes
// first. Any other error fails the wipe, including a reset for another reason, such as a deploy's. So does
// an error the instance's code throws, such as a gateway's call once its wipe has begun: it has no mark,
// even when its message is the same.
const DESTROYED = 'destroyed'
async function awaitWipe(wipe: Promise<void>, reset: string) {
  try {
    await wipe
  } catch (e) {
    const isReset = e instanceof Error && 'durableObjectReset' in e && e.durableObjectReset === true
    if (!isReset || e.message !== reset) throw e
  }
}

// The bindings a wipe is noted under, and how each wipes its instance (an agent's `destroy`, a gateway's
// `wipe`), saying the reason it was noted with to the pages it closes, if it closes any; and how a network
// forgets a deleted member, noted the same way.
const LAUNCH = 'LaunchAgent'
const NETWORK = 'NetworkAgent'
const GATEWAY = 'QlooGateway'
// A deleted member's name in a network's launches, and their ID on its own agent, named
// `<networkId>:<memberId>`. A network that's gone was wiped with its launches, so it has nothing left
// to forget, and isn't woken to say so.
const FORGET = 'NetworkAgent.forgetMember'
const WIPERS: Record<string, (env: Env, name: string, reason?: string) => Promise<void>> = {
  [LAUNCH]: async (env, name, reason) =>
    awaitWipe((await getAgentByName(env.LaunchAgent, name)).destroy(reason), DESTROYED),
  [NETWORK]: async (env, name) => awaitWipe((await networkToWipe(env, name)).destroy(), DESTROYED),
  [GATEWAY]: (env, name) => awaitWipe(env.QlooGateway.getByName(name).wipe(), WIPED),
  [FORGET]: async (env, name) => {
    const [networkId, memberId] = name.split(':')
    if ((await networkName(env.DB, networkId)) === null) return
    await (await getAgentByName(env.NetworkAgent, networkId)).forgetMember(memberId)
  }
}

// Wipes network `networkId`'s own Qloo gateway instance, as removing its key does.
export const wipeOwnGateway = (env: Env, networkId: string) => WIPERS[GATEWAY](env, ownGatewayName(networkId))

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

// Deletes a launch the network lists: noted for the wipe first, with why, then let go of by the network's
// list, so its page and agent answer 404 from then on, then wiped. A wipe that fails is logged and left for
// the cron, since the launch is gone from the network either way.
export async function deleteLaunch(env: Env, networkId: string, launchId: string) {
  const launch = { binding: LAUNCH, name: launchAgentName(networkId, launchId), reason: LAUNCH_DELETED }
  await noteWipe(env.DB, launch)
  await (await getAgentByName(env.NetworkAgent, networkId)).dropLaunch(launchId)
  await wipe(env, launch).catch((e) => wipeFailed(launch, e))
}

// Every instance network `networkId` has, from the launches it lists: each launch's agent, then its own,
// then its own Qloo gateway instance, last, since its agents' calls reach it until they're wiped (ADR
// 0004), each going for `reason`. The one place a network's instances are listed, so its deletion wipes
// them all.
const networkInstances = (networkId: string, launches: string[], reason: string): Instance[] => [
  ...launches.map((id) => ({ binding: LAUNCH, name: launchAgentName(networkId, id), reason })),
  { binding: NETWORK, name: networkId, reason },
  { binding: GATEWAY, name: ownGatewayName(networkId), reason }
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
    ((await agent.state).launches ?? []).map((l) => l.id),
    NETWORK_DELETED
  )
  if (!(await dropNetwork(env.DB, networkId, by, instances))) return false
  for (const late of networkInstances(networkId, await agent.letGo(), NETWORK_DELETED))
    if (!instances.some((i) => i.name === late.name)) {
      await noteWipe(env.DB, late)
      instances.unshift(late)
    }
  for (const instance of instances) await wipe(env, instance).catch((e) => wipeFailed(instance, e))
  return true
}

// The daily cron's clearing of the guest network (ADR 0006), so each day's guests start afresh, keeping
// their sessions and the guest network's directory rows. Its agent lets go first, closing every guest's
// open pages of it with why, and names the launches it lists; then one batch restores its name and notes
// a wipe of each of those launches, of its agent, and of its own Qloo gateway instance; then its agent is
// wiped, which takes the launches off its list, so their pages and agents answer 404, then its gateway
// instance, with any key a guest added. The launches' own agents are left to the hourly retry, so the
// clearing's subrequests stay the same however many launches it lists (#275); until then each takes no
// more work, saying the guest network was cleared, as its wipe was noted (LaunchAgent.gone). The agent's
// next start loads the sample network again (ADR 0007). It's started, if it isn't running, to be wiped,
// so it loads none now (networkToWipe). Logs how many launches it noted and how many wipes failed; one
// that failed stays noted for the next hour's retry, and fails this run. An owner's reset of the sample
// data, from the guest network's settings, clears it the same way, telling its pages `reason`.
export async function resetGuestNetwork(env: Env, reason = GUEST_NETWORK_RESET) {
  const launches = await letGoOfGuestNetwork(env, reason)
  const instances = networkInstances(GUEST_NETWORK, launches, reason)
  await clearGuestNetwork(env.DB, instances)
  let failed = 0
  for (const instance of instances.filter((i) => i.binding !== LAUNCH))
    await wipe(env, instance).catch((e) => {
      failed++
      wipeFailed(instance, e)
    })
  console.log(JSON.stringify({ event: 'guest_network_reset', launches: launches.length, failed }))
  if (failed > 0)
    throw new WipesFailed(
      `Clearing the guest network, ${failed} agent ${failed === 1 ? 'wipe' : 'wipes'} failed; the next hourly run tries again.`
    )
}

// What clearing the guest network throws once every wipe is noted and some failed, which the hourly retry
// makes, so a reset of the sample data can say it's still finishing rather than that it failed.
export class WipesFailed extends Error {}

// Has the guest network's agent let go (NetworkAgent.letGo), and returns the launches it lists, once any
// wipe of it still under way has finished, as when a guest has just deleted it: a wiped agent's calls throw
// "destroyed" until its instance starts again, a moment later, so this asks again, a little later each
// time, a few times. Its pages close saying `reason`.
async function letGoOfGuestNetwork(env: Env, reason: string) {
  for (let tries = 1; ; tries++)
    try {
      return await (await networkToWipe(env, GUEST_NETWORK)).letGo(reason)
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
    deleting.push({
      id,
      instances: networkInstances(id, await (await networkToWipe(env, id)).letGo(), NETWORK_DELETED)
    })
  const { networks, left } = await clearGuestMember(env.DB, deleting)
  await Promise.all(left.map((id) => kickMember(env, id, GUEST_MEMBER)))
  console.log(JSON.stringify({ event: 'guest_member_cleared', networks, left: left.length }))
}

// The hourly cron's retry of the oldest wipes noted over a minute ago and not done, at most
// WIPES_PER_RUN, logging how many it wiped, kept, and failed: the wipes that failed, and those the daily
// clearing left to it, each closing its pages with the reason it was noted with. A launch its network still
// lists, while the network is still in the directory, was never let go of, as when its deletion stopped
// before the list let go, so it's kept and its wipe crossed off. A network's agent is wiped as wipeNetwork
// says. Every wipe is tried, and then any that failed, or that names a binding nothing here wipes, fails
// the cron's run; they stay noted for the next.
export async function retryWipes(env: Env) {
  const done = { wiped: 0, kept: 0, failed: 0 }
  for (const instance of await wipesDue(env.DB, Date.now() - RETRY_AFTER_MS, WIPES_PER_RUN)) {
    try {
      if (await keptLaunch(env, instance)) {
        await wipeDone(env.DB, instance.binding, instance.name)
        done.kept++
      } else {
        await (instance.binding === NETWORK ? wipeNetwork(env, instance) : wipe(env, instance))
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

// The guest network's launches' wipes, as its clearing and its resets note them for the hourly retry
// (resetGuestNetwork), and the most one run wipes, past which a reset of its sample data waits for the run
// (takeSampleReset), so resets can't pile them up.
export const GUEST_LAUNCH_WIPES = { binding: LAUNCH, prefix: launchAgentName(GUEST_NETWORK, ''), most: WIPES_PER_RUN }

// When the hourly cron next retries wipes, after `now`: the next hour's start, but for 12:00 UTC, whose
// daily cron leaves them to 13:00 (src/index.tsx).
export function nextRetry(now: number) {
  const next = new Date(now)
  next.setUTCHours(next.getUTCHours() + 1, 0, 0, 0)
  if (next.getUTCHours() === 12) next.setUTCHours(13)
  return next
}

// Wipes a network's agent, as the cron's retry does, when its launches' wipes may never have been noted, as
// when removing temporary guests deleted it: the agent lets go first, closing its open pages with the
// reason its wipe was noted with, or that it was deleted, and names the launches it lists, whose wipes, and
// its own Qloo gateway instance's, are noted for the next runs with that reason, in one batch; then it's
// wiped. A launch already wiped is wiped again, which finds it empty.
async function wipeNetwork(env: Env, { name: networkId, reason }: Instance) {
  const why = reason ?? NETWORK_DELETED
  const agent = await networkToWipe(env, networkId)
  const launches = await agent.letGo(why)
  await noteWipe(env.DB, ...networkInstances(networkId, launches, why).filter((i) => i.binding !== NETWORK))
  await awaitWipe(agent.destroy(), DESTROYED)
  await wipeDone(env.DB, NETWORK, networkId)
}

// The reason launch agent `name`'s pages are told as they close, and its calls once its network no longer
// lists it (LaunchAgent.gone): the one its wipe was noted with, such as the guest network's clearing, or
// that it was deleted.
export const launchCloseReason = async (env: Env, name: string) =>
  (await wipeReason(env.DB, LAUNCH, name)) ?? LAUNCH_DELETED

// Whether `instance` is a launch its network, still in the directory, still lists.
async function keptLaunch(env: Env, { binding, name }: Instance) {
  if (binding !== LAUNCH) return false
  const { networkId, launchId } = readLaunchAgentName(name)
  if ((await networkName(env.DB, networkId)) === null) return false
  return (await getAgentByName(env.NetworkAgent, networkId)).listsLaunch(launchId)
}

// Wipes `instance`, its pages told the reason it was noted with, then crosses its wipe off.
async function wipe(env: Env, { binding, name, reason }: Instance) {
  const wiper = WIPERS[binding]
  if (!wiper) throw new Error(`Nothing wipes a ${binding} yet.`)
  await wiper(env, name, reason ?? undefined)
  await wipeDone(env.DB, binding, name)
}

const wipeFailed = ({ binding, name }: Instance, error: unknown) =>
  console.error(JSON.stringify({ event: 'wipe_failed', binding, name, error: String(error) }))
