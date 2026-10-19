// Wiping a launch's agent once its network has let go of it, and the daily cron's retry of a wipe that
// failed. The directory notes each wipe before it starts and crosses it off once it succeeds.
import { getAgentByName } from 'agents'
import { noteWipe, wipeDone, wipesDue } from './directory'
import { launchAgentName } from './network-agent'

// The binding a launch's wipe is noted under: launch agents are the only instances wiped so far.
const LAUNCH = 'LaunchAgent'

// A wipe the cron retries only once it's this old, so it never races a deletion still under way.
const RETRY_AFTER_MS = 60_000

// Deletes a launch the network lists: noted for the wipe first, then let go of by the network's list,
// so its page and agent answer 404 from then on, then wiped. A wipe that fails is logged and left for
// the cron, since the launch is gone from the network either way.
export async function deleteLaunch(env: Env, networkId: string, launchId: string) {
  const name = launchAgentName(networkId, launchId)
  await noteWipe(env.DB, LAUNCH, name)
  await (await getAgentByName(env.NetworkAgent, networkId)).dropLaunch(launchId)
  await wipe(env, name).catch((e) => wipeFailed(LAUNCH, name, e))
}

// The daily cron's retry of each wipe noted over a minute ago and not done. A launch its network still
// lists was never let go of, as when its deletion stopped before the list let go, so it's kept and its
// wipe crossed off. Every wipe is tried, and then any that failed, or that names a binding nothing here
// wipes, fails the cron's run; they stay noted for the next.
export async function retryWipes(env: Env) {
  let failed = 0
  for (const { binding, name } of await wipesDue(env.DB, Date.now() - RETRY_AFTER_MS)) {
    try {
      if (binding !== LAUNCH) throw new Error(`Nothing wipes a ${binding} yet.`)
      const [networkId, launchId] = name.split(':') // as launchAgentName names it
      if (await (await getAgentByName(env.NetworkAgent, networkId)).listsLaunch(launchId))
        await wipeDone(env.DB, binding, name)
      else await wipe(env, name)
    } catch (e) {
      failed++
      wipeFailed(binding, name, e)
    }
  }
  if (failed > 0)
    throw new Error(`${failed} agent ${failed === 1 ? 'wipe' : 'wipes'} failed; the next daily run tries again.`)
}

// Wipes launch agent `name`, then crosses its wipe off.
async function wipe(env: Env, name: string) {
  await (await getAgentByName(env.LaunchAgent, name)).destroy()
  await wipeDone(env.DB, LAUNCH, name)
}

const wipeFailed = (binding: string, name: string, error: unknown) =>
  console.error(JSON.stringify({ event: 'wipe_failed', binding, name, error: String(error) }))
