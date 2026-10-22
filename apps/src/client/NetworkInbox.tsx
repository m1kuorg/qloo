import { InboxWorkspace } from './Inbox'
import { LostAccess, useNetwork, type NetworkPage } from './NetworkPage'

// The network's booking inbox, connected to the network's agent: the demo's inbox page, whose pitches,
// rankings, and replies every member sees and works on together, until the member loses access.
export function NetworkInboxPage({ agentPath, network }: { agentPath: string; network: NetworkPage }) {
  const agent = useNetwork(agentPath)
  if (agent.connectionError) return <LostAccess network={network} reason={agent.connectionError.reason} />
  return <InboxWorkspace agent={agent} links={{ roster: network.links.roster }} />
}
