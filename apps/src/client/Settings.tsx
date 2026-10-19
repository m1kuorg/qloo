import { useState } from 'react'
import type { State } from '../agent'
import type { ApiKey, Invite, NetworkMember } from '../directory'
import type { OwnKey, Usage } from '../gateway'
import { LostAccess, useNetwork, type NetworkPage } from './Dashboard'
import { ApiKeysModule } from './settings/ApiKeys'
import { DangerZoneModule } from './settings/DangerZone'
import { MembersModule } from './settings/Members'
import { NetworkModule } from './settings/Network'
import { QlooKeyModule } from './settings/QlooKey'
import { UsageModule } from './settings/Usage'

// What the settings page is told besides its network: who's looking, who's in the network, and, for an
// owner, its open invites and its API keys (null for a member); today's usage; and its own Qloo key as
// the viewer may see it.
type MembersProps = {
  memberId: string
  members: NetworkMember[]
  invites: Invite[] | null
  apiKeys: ApiKey[] | null
  usage: Usage
  qlooKey: OwnKey
}

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
  invites,
  apiKeys,
  usage: loaded,
  qlooKey: loadedKey
}: { state: State | undefined; network: NetworkPage } & MembersProps) {
  // Adding or removing the Qloo key moves where the network's Qloo calls count, so usage follows it.
  const [{ key: qlooKey, usage }, setKey] = useState({ key: loadedKey, usage: loaded })
  return (
    <>
      <header className="hd">
        <h1>Settings</h1>
      </header>
      <main className="set">
        <NetworkModule network={network} cpm={state ? state.cpm : undefined} />
        <MembersModule network={network} memberId={memberId} members={members} invites={invites} />
        <ApiKeysModule network={network} keys={apiKeys} />
        <QlooKeyModule network={network} qlooKey={qlooKey} onChange={setKey} />
        <UsageModule network={network} usage={usage} ownKey={qlooKey.set} />
        <DangerZoneModule network={network} />
      </main>
    </>
  )
}
