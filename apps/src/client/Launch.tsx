import { useAgent } from 'agents/react'
import { createPortal } from 'react-dom'
import type { Launch, State } from '../agent'
import type { LaunchAgent } from '../launch-agent'
import { Workspace, type Session } from './App'
import { launchTitle } from './LaunchFields'
import { NetworkGate, type NetworkPage } from './NetworkPage'

// A launch's agent, at the path the server gives, which checks the member's session and membership
// and that the network lists the launch.
const useLaunch = (path: string) =>
  useAgent<LaunchAgent, State>({ agent: 'LaunchAgent', basePath: path.replace(/^\//, '') })

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
  // Its readout says when the connection drops.
  return (
    <NetworkGate agent={agent} network={network}>
      <LaunchWorkspace agent={agent} network={network} orders={orders} />
    </NetworkGate>
  )
}

// The launch workspace for one of the network's launches: its runs, chart, questions, and order, ranked
// against the network's roster, which this page shows read-only and links to. Tests render it from a
// launch agent's synced state.
export function LaunchWorkspace({ agent, network, orders }: { agent: Session; network: NetworkPage; orders: string }) {
  return (
    <>
      <LaunchCrumb launch={agent.state?.launch ?? null} />
      <Workspace agent={agent} network={network} orders={orders} />
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
