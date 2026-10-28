import { InboxWorkspace } from './Inbox'
import { NetworkGate, useNetwork, type NetworkPage } from './NetworkPage'

// The network's booking inbox, connected to the network's agent: the inbox page, whose pitches,
// rankings, and replies every member sees and works on together, until the member loses access. Its
// readout says when the connection drops.
export function NetworkInboxPage({ agentPath, network }: { agentPath: string; network: NetworkPage }) {
  const agent = useNetwork(agentPath)
  return (
    <NetworkGate agent={agent} network={network}>
      <InboxWorkspace agent={agent} links={{ roster: network.links.roster }} network={network} />
    </NetworkGate>
  )
}
