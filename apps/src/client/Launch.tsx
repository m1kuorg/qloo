import { useAgent } from 'agents/react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { RunSnapshot, State } from '../agent'
import type { LaunchAgent } from '../launch-agent'
import { Workspace, type Session } from './App'
import { launchTitle } from './LaunchFields'
import { NetworkGate, type NetworkPage } from './NetworkPage'

// A launch's agent, at the path the server gives, which checks the member's session and membership
// and that the network lists the launch. Its report's page connects to it too (Report.tsx).
export const useLaunch = (path: string) =>
  useAgent<LaunchAgent, State>({ agent: 'LaunchAgent', basePath: path.replace(/^\//, '') })

// A launch's page, connected to its own agent. `orders` is where its approved orders export, and
// `reports` where its runs' reports open.
export function LaunchPage({
  agentPath,
  network,
  orders,
  reports
}: {
  agentPath: string
  network: NetworkPage
  orders: string
  reports: string
}) {
  const agent = useLaunch(agentPath)
  // Its readout says when the connection drops.
  return (
    <NetworkGate agent={agent} network={network}>
      <LaunchWorkspace agent={agent} network={network} orders={orders} reports={reports} />
    </NetworkGate>
  )
}

// The launch workspace for one of the network's launches: its runs, chart, questions, and order, ranked
// against the network's roster, which this page shows read-only and links to. Tests render it from a
// launch agent's synced state, and with `earlier`, the earlier runs its Changes tab compares, as getRun
// returns them. The tab's title names the launch and its network once the agent's state names the
// launch, as the invite page names its network; until then the server's names the page, Launches.
export function LaunchWorkspace({
  agent,
  network,
  orders,
  reports,
  earlier
}: {
  agent: Session
  network: NetworkPage
  orders: string
  reports?: string
  earlier?: Record<string, RunSnapshot>
}) {
  const launch = agent.state?.launch
  const title = launch
    ? launchTitle(
        launch.name,
        launch.comps.map((c) => c.name)
      )
    : null
  useEffect(() => {
    if (title) document.title = `${title} · ${network.name} · Crossfeed`
  }, [title, network.name])
  return (
    <>
      <LaunchCrumb title={title} />
      <Workspace agent={agent} network={network} orders={orders} reports={reports} earlier={earlier} />
    </>
  )
}

// The launch's name, last in the top bar's breadcrumb after Launches; or on its report's page, the
// launch's name as a link back to `launch`, its page, then Report. The server knows only the launch's
// ID, so it renders an empty slot (#shell-launch, shell.tsx) that this fills once the agent's state
// names the launch.
export function LaunchCrumb({ title, launch }: { title: string | null; launch?: string }) {
  const slot = typeof document === 'undefined' ? null : document.getElementById('shell-launch')
  if (!slot || !title) return null
  const slash = (
    <span aria-hidden="true" className="text-muted-foreground">
      /
    </span>
  )
  return createPortal(
    launch ? (
      <>
        {slash}
        <a
          href={launch}
          className="truncate text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {title}
        </a>
        {slash}
        <span className="shrink-0" aria-current="page">
          Report
        </span>
      </>
    ) : (
      <>
        {slash}
        <span className="truncate" aria-current="page">
          {title}
        </span>
      </>
    ),
    slot
  )
}
