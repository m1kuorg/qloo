import { useState } from 'react'
import type { State } from '../agent'
import type { ApiKey, Invite, NetworkMember } from '../directory'
import type { OwnKey, Usage } from '../gateway'
import { NetworkGate, useNetwork, type NetworkPage } from './NetworkPage'
import { ApiKeysModule } from './settings/ApiKeys'
import { DangerZoneModule } from './settings/DangerZone'
import { MembersModule } from './settings/Members'
import { settingsColumn } from './settings/Module'
import { NetworkModule } from './settings/Network'
import { QlooKeyModule } from './settings/QlooKey'
import { UsageModule } from './settings/Usage'
import { connectionOf, ConnectionState, StateLine, type Connection } from './states'

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
// itself read-only to the rest. The title row says how the agent's connection stands.
export function SettingsPage({
  agentPath,
  network,
  ...membersProps
}: { agentPath: string; network: NetworkPage } & MembersProps) {
  const agent = useNetwork(agentPath)
  return (
    <NetworkGate agent={agent} network={network}>
      <Settings state={agent.state} connection={connectionOf(agent)} network={network} {...membersProps} />
    </NetworkGate>
  )
}

// Tests render it from a network agent's synced state; `state` is undefined until it arrives. The
// page answers "How is this network set up, and who can do what?": the title row says the viewer's
// role, then the modules stand in the settings' two columns on a centred 1152px measure.
export function Settings({
  state,
  connection = { lost: null, reconnecting: false },
  network,
  memberId,
  members,
  invites,
  apiKeys,
  usage: loaded,
  qlooKey: loadedKey
}: { state: State | undefined; connection?: Connection; network: NetworkPage } & MembersProps) {
  // Adding or removing the Qloo key moves where the network's Qloo calls count, so usage follows it.
  const [{ key: qlooKey, usage }, setKeyAndUsage] = useState({ key: loadedKey, usage: loaded })
  // A rename saved here reaches every module at once: the danger zone asks for the new name, as the
  // server does, and the help lines say it.
  const [name, setName] = useState(network.name)
  const named = { ...network, name }
  return (
    <main className={settingsColumn}>
      <div className="flex flex-col gap-1.5">
        <h1 className="type-title">Settings</h1>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 type-caption text-muted-foreground">
          <span>
            {network.role === 'owner'
              ? 'You’re an owner of this network.'
              : 'You’re a member of this network: you see what only an owner can change, read-only.'}
          </span>
          {/* Always there, so a screen reader hears the line as it appears. */}
          <span role="status">
            {state ? (
              <ConnectionState connection={connection} />
            ) : (
              <StateLine kind="loading">Connecting to the network…</StateLine>
            )}
          </span>
        </p>
      </div>
      <div className="flex flex-col gap-12">
        <NetworkModule
          network={named}
          cpm={state ? state.cpm : undefined}
          sampleCpm={state?.sample?.cpm ?? false}
          onRenamed={setName}
        />
        <MembersModule network={named} memberId={memberId} members={members} invites={invites} />
        <ApiKeysModule network={named} keys={apiKeys} />
        <QlooKeyModule network={named} qlooKey={qlooKey} onChange={setKeyAndUsage} />
        <UsageModule network={named} usage={usage} hasOwnKey={qlooKey.set} />
        <DangerZoneModule network={named} />
      </div>
    </main>
  )
}
