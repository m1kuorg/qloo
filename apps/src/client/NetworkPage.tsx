import { useAgent } from 'agents/react'
import type { ReactNode } from 'react'
import { buttonVariants } from '@/components/ui/variants'
import type { State } from '../agent'
import type { Role } from '../directory'
import type { NetworkAgent } from '../network-agent'
import { StateLine } from './states'

// A network's page, as the server describes it: the network, the member's role in it, whether it's the
// guest network (ADR 0005), and where its other pages are. `inbox` is null while GUEST_PITCHES is off; a
// launch's page is under `launches`.
export type NetworkPage = {
  id: string
  name: string
  role: Role
  guest?: boolean
  links: { roster: string; inbox: string | null; settings: string; launches: string }
}

// What a member is told of a change only an owner can make: `owners`, or in the guest network, which has
// no owner, that no one can `what`.
export const ownersOnly = (network: NetworkPage, owners: string, what: string) =>
  network.guest ? `The guest network has no owner, so no one can ${what}.` : owners

// The network's agent, at the path the server gives, which checks the member's session and membership.
export const useNetwork = (path: string) =>
  useAgent<NetworkAgent, State>({ agent: 'NetworkAgent', basePath: path.replace(/^\//, '') })
export type NetworkConnection = ReturnType<typeof useNetwork>

// The close codes the agents shut a page out with for good: 4403 when the member is removed, leaves,
// or signs out everywhere; 4410 when the launch or its network is deleted.
const FORCED = [4403, 4410]

// A network's page (the dashboard, the roster, the inbox, settings, a launch) on its agent's socket.
// Shut out for good by a forced close, the page gives way to LostAccess. Any other drop is the
// connection's own, which reconnects by itself while the page keeps what it showed, and says so in its
// on-air readout or its title row.
export function NetworkGate({
  agent,
  network,
  children
}: {
  agent: { state: unknown; identified: boolean; connectionError: { code: number; reason: string } | null }
  network: NetworkPage
  children: ReactNode
}) {
  const closed = agent.connectionError
  if (closed && FORCED.includes(closed.code)) return <LostAccess network={network} reason={closed.reason} />
  return children
}

// A network's page once its agent has closed the connection for good, as when the member is removed
// or leaves: what it showed goes, and the page says why. A reload answers 404.
export function LostAccess({ network, reason }: { network: NetworkPage; reason: string }) {
  return (
    <div className="flex flex-col gap-4 px-4 pt-6 pb-10 lg:px-6">
      <section aria-label="Network">
        <h1 className="type-title text-balance">{network.name}</h1>
      </section>
      <main className="flex max-w-[72ch] flex-col items-start gap-3">
        <p>
          <StateLine kind="error" role="alert">
            {reason || 'This page lost its connection to the network. Reload to try again.'}
          </StateLine>
        </p>
        <a className={buttonVariants({ variant: 'link' })} href="/app">
          Open your networks
        </a>
      </main>
    </div>
  )
}
