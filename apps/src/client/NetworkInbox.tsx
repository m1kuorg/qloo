import { InboxWorkspace } from './App'
import { useNetwork, type NetworkPage } from './Dashboard'

// The network's booking inbox, connected to the network's agent: the demo's inbox page, whose pitches,
// rankings, and replies every member sees and works on together.
export function NetworkInboxPage({ agentPath, network }: { agentPath: string; network: NetworkPage }) {
  return <InboxWorkspace agent={useNetwork(agentPath)} links={{ roster: network.links.roster }} />
}
