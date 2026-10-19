import { useAgent } from 'agents/react'
import type { State } from '../agent'
import type { LaunchAgent } from '../launch-agent'
import { Workspace, type Session } from './App'
import { LostAccess, type NetworkPage } from './Dashboard'

// A launch's agent, at the path the server gives, which checks the member's session and membership
// and that the network lists the launch.
const useLaunch = (path: string) =>
  useAgent<LaunchAgent, State>({ agent: 'LaunchAgent', basePath: path.replace(/^\//, '') })

// A launch's page, connected to its own agent.
export function LaunchPage({ agentPath, network }: { agentPath: string; network: NetworkPage }) {
  const agent = useLaunch(agentPath)
  if (agent.connectionError) return <LostAccess network={network} reason={agent.connectionError.reason} />
  return <LaunchWorkspace agent={agent} network={network} />
}

// The demo's launch workspace for one of the network's launches: its runs, chart, questions, and order,
// ranked against the network's roster, which this page shows read-only and links to. Tests render it
// from a launch agent's synced state.
export function LaunchWorkspace({ agent, network }: { agent: Session; network: NetworkPage }) {
  return <Workspace page="launch" agent={agent} links={{ roster: network.links.roster }} network={network} />
}
