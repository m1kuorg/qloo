import { useAgent } from 'agents/react'
import { createPortal } from 'react-dom'
import type { Launch, State } from '../agent'
import type { LaunchAgent } from '../launch-agent'
import { Workspace, type Session } from './App'
import { launchTitle } from './LaunchFields'
import { LostAccess, type NetworkPage } from './NetworkPage'

// A launch's agent, at the path the server gives, which checks the member's session and membership
// and that the network lists the launch.
const useLaunch = (path: string) =>
  useAgent<LaunchAgent, State>({ agent: 'LaunchAgent', basePath: path.replace(/^\//, '') })

// The close codes the agents shut a page out with for good: 4403 when the member is removed, leaves,
// or signs out everywhere; 4410 when the launch or its network is deleted. Any other drop is the
// connection's own, which reconnects by itself while the workspace says so.
const FORCED = [4403, 4410]

// A launch's page, connected to its own agent. `orders` is where its approved orders export.
export function LaunchPage({
  agentPath,
  network,
  orders
}: {
  agentPath: string
  network: NetworkPage
  orders: string
}) {
  const agent = useLaunch(agentPath)
  if (agent.connectionError && FORCED.includes(agent.connectionError.code))
    return <LostAccess network={network} reason={agent.connectionError.reason} />
  return <LaunchWorkspace agent={agent} network={network} orders={orders} />
}

// The demo's launch workspace for one of the network's launches: its runs, chart, questions, and order,
// ranked against the network's roster, which this page shows read-only and links to. Tests render it
// from a launch agent's synced state.
export function LaunchWorkspace({ agent, network, orders }: { agent: Session; network: NetworkPage; orders: string }) {
  return (
    <>
      <LaunchCrumb launch={agent.state?.launch ?? null} />
      <Workspace agent={agent} links={{ roster: network.links.roster, orders }} network={network} />
    </>
  )
}

// The launch's name, last in the top bar's breadcrumb after Launches. The server knows only the
// launch's ID, so it renders an empty slot (#shell-launch, shell.tsx) that this fills once the
// agent's state names the launch.
function LaunchCrumb({ launch }: { launch: Launch | null }) {
  const slot = typeof document === 'undefined' ? null : document.getElementById('shell-launch')
  if (!slot || !launch) return null
  return createPortal(
    <>
      <span aria-hidden="true" className="text-muted-foreground">
        /
      </span>
      <span className="truncate" aria-current="page">
        {launchTitle(
          launch.name,
          launch.comps.map((c) => c.name)
        )}
      </span>
    </>,
    slot
  )
}
