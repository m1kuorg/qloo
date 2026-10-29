import { useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { TabsContent } from '@/components/ui/tabs'
import { EvidencePanel, useEvidence } from './Evidence'
import { canvas, frame, Inspector, InspectorToggle, useInspector } from './Frame'
import { NetworkGate, useNetwork, type NetworkConnection, type NetworkPage } from './NetworkPage'
import { PageEmpty, PageHeader, useFormDialog } from './PageHeader'
import { RosterFailures, RosterImport, rosterSummary, RosterTable, ShowEditor } from './RosterModules'
import { connectionOf, type Connection } from './states'

// The network's roster page, connected to the network's agent.
export function RosterPage({ agentPath, network }: { agentPath: string; network: NetworkPage }) {
  const agent = useNetwork(agentPath)
  return (
    <NetworkGate agent={agent} network={network}>
      <NetworkRoster agent={agent} connection={connectionOf(agent)} />
    </NetworkGate>
  )
}

// The roster every launch on the network ranks, kept by its agent, which answers "Is my roster ready
// to rank?": the header with the roster's counts, the inspector's toggle and Import shows, its title
// badged sample while the network holds the sample data, the page's one sample label (ADR 0007); the
// shows Qloo failed on; and the roster table, whose rows' match chips say what's left to settle, and
// whose shows open in the inspector's Show tab beside it (a sheet under 1360px), closed until then,
// and whose calls open in its Evidence tab. An empty roster has the empty state instead, with Import shows and
// no inspector; either opens the import in its dialog. Every member's edits reach the others through
// synced state. Tests render it from a network agent's synced state.
export function NetworkRoster({
  agent,
  connection = { lost: null, reconnecting: false }
}: {
  agent: NetworkConnection
  connection?: Connection
}) {
  const state = agent.state
  const roster = state?.roster ?? []
  const [selected, setSelected] = useState<string | null>(null)
  const show = roster.find((s) => s.name === selected)
  const evidence = useEvidence(agent)
  // The Show tab is there with no show selected too, saying how to open one.
  const inspector = useInspector(['show', 'evidence'], evidence)
  // Import shows, in the header or the empty state, and the dialog it opens the import in.
  const importing = useFormDialog('Import shows')
  const importDraft = useRef('')
  const head = (
    <PageHeader
      title="Roster"
      connection={state ? connection : null}
      empty={roster.length === 0}
      summary={rosterSummary(roster)}
      badge={state?.sample && <Badge>sample</Badge>}
      actions={
        <>
          <InspectorToggle open={inspector.open} toggle={inspector.toggle} ref={inspector.toggleButton} />
          {importing.button()}
        </>
      }
    />
  )

  if (!state)
    return (
      <main className={canvas} aria-busy="true">
        {head}
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-11 rounded-lg" />
          ))}
        </div>
      </main>
    )

  return (
    <>
      {roster.length === 0 ? (
        <main className={canvas}>
          {head}
          <PageEmpty action={importing.button()}>No shows yet.</PageEmpty>
        </main>
      ) : (
        <div className={frame}>
          <main className={canvas}>
            {head}
            <RosterFailures roster={roster} />
            <RosterTable
              roster={roster}
              selected={show?.name ?? null}
              select={(name, from) => {
                setSelected(name)
                inspector.inspect('show', from)
              }}
              slowCalls={state.slowCalls ?? []}
              openCall={inspector.showCall}
              opened={evidence.opened?.call ?? null}
            />
          </main>
          <Inspector inspector={inspector}>
            {/* Every panel stays mounted, so the ids calls point at (aria-controls="evidence") are always
                there; Base UI hides and inerts the panels not shown, and nothing else. */}
            <TabsContent value="show" keepMounted>
              {show ? (
                <ShowEditor
                  key={show.name}
                  show={show}
                  agent={agent}
                  openCall={inspector.showCall}
                  opened={evidence.opened?.call ?? null}
                />
              ) : (
                <p className="text-muted-foreground">
                  Select a show in the roster to settle its match or edit its figures.
                </p>
              )}
            </TabsContent>
            <TabsContent value="evidence" keepMounted>
              <EvidencePanel opened={evidence.opened} names={evidence.names} runs={state.runs ?? []} />
            </TabsContent>
          </Inspector>
        </div>
      )}
      <RosterImport
        dialog={importing}
        roster={roster}
        draft={importDraft}
        importRoster={(text, format) => agent.stub.importRoster(text, format)}
      />
    </>
  )
}
