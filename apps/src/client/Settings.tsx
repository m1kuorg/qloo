import type { State } from '../agent'
import type { Invite, NetworkMember } from '../directory'
import { LostAccess, useNetwork, type NetworkPage } from './Dashboard'
import { MembersModule } from './settings/Members'
import { NetworkModule } from './settings/Network'

// What the settings page is told besides its network: who's looking, who's in the network, and, for an
// owner, its open invites (null for a member).
type MembersProps = { memberId: string; members: NetworkMember[]; invites: Invite[] | null }

// The network's settings page: one module per job, each in its own file under settings/, in the order
// a new owner needs them. Every member sees every module; a module an owner alone can change shows
// itself read-only to the rest.
export function SettingsPage({
  agentPath,
  network,
  ...membersProps
}: { agentPath: string; network: NetworkPage } & MembersProps) {
  const agent = useNetwork(agentPath)
  if (agent.connectionError) return <LostAccess network={network} reason={agent.connectionError.reason} />
  return <Settings state={agent.state} network={network} {...membersProps} />
}

// Tests render it from a network agent's synced state; `state` is undefined until it arrives.
export function Settings({
  state,
  network,
  memberId,
  members,
  invites
}: { state: State | undefined; network: NetworkPage } & MembersProps) {
  return (
    <>
      <header className="hd">
        <h1>Settings</h1>
      </header>
      <main className="set">
        <NetworkModule network={network} cpm={state ? state.cpm : undefined} />
        <MembersModule network={network} memberId={memberId} members={members} invites={invites} />
      </main>
    </>
  )
}
