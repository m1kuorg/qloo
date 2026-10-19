// Wiping a launch's agent once its network has let go of it, and the daily cron's retry of a wipe that
// failed. The directory notes each wipe before it starts and crosses it off once it succeeds.
import { getAgentByName } from 'agents'
import { noteWipe, wipeDone, wipesDue } from './directory'
import { launchAgentName } from './network-agent'

// A wipe the cron retries only once it's this old, so it never races a deletion still under way.
const RETRY_AFTER_MS = 60_000

// Deletes a launch the network lists: noted for the wipe first, then let go of by the network's list,
// so its page and agent answer 404 from then on, then wiped. A wipe that fails is logged and left for
// the cron, since the launch is gone from the network either way.
export async function deleteLaunch(env: Env, networkId: string, launchId: string) {
  const name = launchAgentName(networkId, launchId)
  await noteWipe(env.DB, 'LaunchAgent', name)
  await (await getAgentByName(env.NetworkAgent, networkId)).dropLaunch(launchId)
  await wipe(env, name)
}

// Wipes launch agent `name` and crosses its wipe off, or logs why it couldn't, keeping it noted.
async function wipe(env: Env, name: string) {
  try {
    await (await getAgentByName(env.LaunchAgent, name)).destroy()
    await wipeDone(env.DB, 'LaunchAgent', name)
  } catch (e) {
    console.error(JSON.stringify({ event: 'wipe_failed', binding: 'LaunchAgent', name, error: String(e) }))
  }
}

// The daily cron's retry of each wipe noted over a minute ago and not done. A launch its network still
// lists was never let go of, as when its deletion stopped before the list let go, so it's kept and its
// wipe crossed off. Launch agents are the only instances wiped so far.
export async function retryWipes(env: Env) {
  for (const { binding, name } of await wipesDue(env.DB, Date.now() - RETRY_AFTER_MS)) {
    if (binding !== 'LaunchAgent') continue
    const [networkId, launchId] = name.split(':')
    if (await (await getAgentByName(env.NetworkAgent, networkId)).listsLaunch(launchId))
      await wipeDone(env.DB, binding, name)
    else await wipe(env, name)
  }
}
