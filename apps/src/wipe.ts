// Wiping agents once the directory or their network has let go of them: a launch's, when it's deleted,
// and a network's with all of its launches' and its own Qloo gateway instance, when the network is; and
// the daily cron's retry of a wipe that failed. The directory notes each wipe before it starts and crosses it off once it succeeds.
import { getAgentByName } from 'agents'
import { dropNetwork, networkName, noteWipe, wipeDone, wipesDue, type Instance } from './directory'
import { launchAgentName, NETWORK_DELETED, networkLimitKey } from './network-agent'

// The bindings a wipe is noted under, and how each wipes its instance (`destroy`), saying `reason` to
// the pages it closes, if it closes any.
const LAUNCH = 'LaunchAgent'
const NETWORK = 'NetworkAgent'
const GATEWAY = 'QlooGateway'
const WIPERS: Record<string, (env: Env, name: string, reason?: string) => Promise<void>> = {
  [LAUNCH]: async (env, name, reason) => (await getAgentByName(env.LaunchAgent, name)).destroy(reason),
  [NETWORK]: async (env, name) => (await getAgentByName(env.NetworkAgent, name)).destroy(),
  [GATEWAY]: (env, name) => env.QlooGateway.getByName(name).wipe()
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
  { binding: GATEWAY, name: networkLimitKey(networkId) }
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
