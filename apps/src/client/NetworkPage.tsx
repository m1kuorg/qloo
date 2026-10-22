import { useAgent } from 'agents/react'
import type { State } from '../agent'
import type { Role } from '../directory'
import type { NetworkAgent } from '../network-agent'
import { StateLine } from './states'

// A network's page, as the server describes it: the network, the member's role in it, and where its
// other pages are. `inbox` is null while GUEST_PITCHES is off; a launch's page is under `launches`.
export type NetworkPage = {
  id: string
  name: string
  role: Role
  links: { roster: string; inbox: string | null; settings: string; launches: string }
}

// The network's agent, at the path the server gives, which checks the member's session and membership.
export const useNetwork = (path: string) =>
  useAgent<NetworkAgent, State>({ agent: 'NetworkAgent', basePath: path.replace(/^\//, '') })
export type NetworkConnection = ReturnType<typeof useNetwork>

// A network's page once its agent has closed the connection for good, as when the member is removed
// or leaves: what it showed goes, and the page says why. A reload answers 404.
export function LostAccess({ network, reason }: { network: NetworkPage; reason: string }) {
  return (
    <>
      <section className="hd" aria-label="Network">
        <h1>{network.name}</h1>
      </section>
      <main className="lost">
        <StateLine kind="error" role="alert">
          {reason || 'This page lost its connection to the network. Reload to try again.'}
        </StateLine>
        <p>
          <a className="lnk" href="/app">
            Open your networks
          </a>
        </p>
      </main>
    </>
  )
}
