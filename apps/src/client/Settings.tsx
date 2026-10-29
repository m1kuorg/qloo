import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import type { State } from '../agent'
import type { ApiKey, Invite, NetworkMember } from '../directory'
import type { OwnKey, Usage } from '../gateway'
import { GUEST_MEMBER, GUEST_NETWORK } from '../text'
import { NetworkGate, useNetwork, type NetworkPage } from './NetworkPage'
import { PageTabs } from './PageHeader'
import { ApiKeysModule } from './settings/ApiKeys'
import { DangerZoneModule } from './settings/DangerZone'
import { MembersModule } from './settings/Members'
import { settingsColumn } from './settings/Module'
import { NetworkModule } from './settings/Network'
import { QlooKeyModule } from './settings/QlooKey'
import { SampleDataModule } from './settings/SampleData'
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
// itself read-only to the rest. The title row says how the agent's connection stands. A reset of the
// sample data closes the page's connection as it leaves for the dashboard, so the page stays as it is
// meanwhile (`leaving`).
export function SettingsPage({
  agentPath,
  network,
  ...membersProps
}: { agentPath: string; network: NetworkPage } & MembersProps) {
  const agent = useNetwork(agentPath)
  const [leaving, setLeaving] = useState(false)
  return (
    <NetworkGate agent={agent} network={network} leaving={leaving}>
      <Settings
        state={agent.state}
        connection={connectionOf(agent)}
        network={network}
        onLeaving={setLeaving}
        {...membersProps}
      />
    </NetworkGate>
  )
}

// Tests render it from a network agent's synced state; `state` is undefined until it arrives. The
// page answers "How is this network set up, and who can do what?": the title row says the viewer's
// role, its title badged sample while the network holds the sample data (ADR 0007), then a tab for each module, in the centred column, each tab's hash its name (#network,
// #members, #api-keys, #qloo-key, #usage, #sample-data, #danger-zone), which the links into settings
// open. The guest network's alone has the sample data module (ADR 0007).
export function Settings({
  state,
  connection = { lost: null, reconnecting: false },
  network,
  onLeaving = () => {},
  memberId,
  members,
  invites,
  apiKeys,
  usage: loaded,
  qlooKey: loadedKey
}: {
  state: State | undefined
  connection?: Connection
  network: NetworkPage
  onLeaving?: (leaving: boolean) => void
} & MembersProps) {
  // Adding or removing the Qloo key moves where the network's Qloo calls count, so usage follows it.
  const [{ key: qlooKey, usage }, setKeyAndUsage] = useState({ key: loadedKey, usage: loaded })
  // A rename saved here reaches every module at once: the danger zone asks for the new name, as the
  // server does, and the help lines say it.
  const [name, setName] = useState(network.name)
  const named = { ...network, name }
  return (
    <main className={settingsColumn}>
      <div className="flex flex-col gap-1.5">
        {/* Badged as the page header's title is, while the network holds the sample data. */}
        <h1 className="flex items-center gap-2 type-title">
          Settings
          {state?.sample && <Badge>sample</Badge>}
        </h1>
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
      <PageTabs
        label="Settings sections"
        tabs={[
          {
            id: 'network',
            title: 'Network',
            content: (
              <NetworkModule
                network={named}
                cpm={state ? state.cpm : undefined}
                sampleCpm={state?.sample?.cpm ?? false}
                onRenamed={setName}
              />
            )
          },
          {
            id: 'members',
            title: 'Members',
            content: <MembersModule network={named} memberId={memberId} members={members} invites={invites} />
          },
          { id: 'api-keys', title: 'API keys', content: <ApiKeysModule network={named} keys={apiKeys} /> },
          {
            id: 'qloo-key',
            title: 'Qloo key',
            content: (
              <QlooKeyModule
                network={named}
                qlooKey={qlooKey}
                guest={memberId === GUEST_MEMBER}
                onChange={setKeyAndUsage}
              />
            )
          },
          {
            id: 'usage',
            title: 'Usage',
            content: <UsageModule network={named} usage={usage} hasOwnKey={qlooKey.set} />
          },
          ...(network.id === GUEST_NETWORK
            ? [
                {
                  id: 'sample-data',
                  title: 'Sample data',
                  content: <SampleDataModule network={named} onLeaving={onLeaving} />
                }
              ]
            : []),
          { id: 'danger-zone', title: 'Danger zone', content: <DangerZoneModule network={named} /> }
        ]}
      />
    </main>
  )
}
