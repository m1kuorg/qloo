import type { State } from '../agent'
import { useNetwork, type NetworkPage } from './Dashboard'
import { NetworkModule } from './settings/Network'

// The network's settings page: one module per job, each in its own file under settings/, in the order
// a new owner needs them. Every member sees every module; a module an owner alone can change shows
// itself read-only to the rest.
export function SettingsPage({ agentPath, network }: { agentPath: string; network: NetworkPage & { id: string } }) {
  const agent = useNetwork(agentPath)
  return <Settings state={agent.state} network={network} />
}

// Tests render it from a network agent's synced state; `state` is undefined until it arrives.
export function Settings({ state, network }: { state: State | undefined; network: NetworkPage & { id: string } }) {
  return (
    <>
      <header className="hd">
        <h1>Settings</h1>
      </header>
      <main className="set">
        <NetworkModule network={network} cpm={state ? state.cpm : undefined} />
      </main>
    </>
  )
}
