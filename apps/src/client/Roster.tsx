import { cn } from 'cn'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { TabsContent } from '@/components/ui/tabs'
import type { Show } from '../agent'
import { EvidencePanel, useEvidence } from './Evidence'
import { canvas, frame, Inspector, useInspector } from './Frame'
import { NetworkGate, useNetwork, type NetworkConnection, type NetworkPage } from './NetworkPage'
import { PageEmpty, PageHeader } from './PageHeader'
import { RosterFailures, RosterImport, rosterSummary, RosterTable, ShowEditor } from './RosterModules'
import { connectionOf, ConnectionState, StateLine, type Connection } from './states'

// The network's roster page, connected to the network's agent.
export function RosterPage({ agentPath, network }: { agentPath: string; network: NetworkPage }) {
  const agent = useNetwork(agentPath)
  return (
    <NetworkGate agent={agent} network={network}>
      <NetworkRoster agent={agent} connection={connectionOf(agent)} />
    </NetworkGate>
  )
}

// A page without the inspector beside it takes its gutter on both sides.
const alone = cn(canvas, 'min-[85rem]:pr-6')

// The roster every launch on the network ranks, kept by its agent, which answers "Is my roster ready
// to rank?": the header with the roster's counts and Import shows, the shows Qloo failed on, whether
// it's ready to rank, and the roster table, whose shows open in the inspector's Show tab beside it (a
// sheet under 1360px) and whose calls open in its Evidence tab. An empty roster has the empty state
// instead, with Import shows; either opens the import in a sheet. Every member's edits reach the
// others through synced state. Tests render it from a network agent's synced state.
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
  // The import's sheet, which stays open after an import so a refusal shows where it was asked, and
  // stays open as the first import takes the page from its empty state to the table.
  const [importing, setImporting] = useState(false)
  const importDraft = useRef('')
  const openImport = () => setImporting(true)
  const head = (
    <PageHeader
      title="Roster"
      summary={roster.length > 0 && rosterSummary(roster)}
      status={
        state ? (
          <ConnectionState connection={connection} />
        ) : (
          <StateLine kind="loading">Connecting to the network…</StateLine>
        )
      }
      actions={roster.length > 0 && <Button onClick={openImport}>Import shows</Button>}
    />
  )

  if (!state)
    return (
      <main className={alone} aria-busy="true">
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
        <main className={alone}>
          {head}
          <PageEmpty action={<Button onClick={openImport}>Import shows</Button>}>No shows yet.</PageEmpty>
        </main>
      ) : (
        <div className={frame}>
          <main className={canvas}>
            {head}
            <RosterFailures roster={roster} />
            <Readiness roster={roster} />
            <RosterTable
              roster={roster}
              selected={show?.name ?? null}
              select={(name) => {
                setSelected(name)
                inspector.inspect('show')
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
                  close={() => setSelected(null)}
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
              <EvidencePanel opened={evidence.opened} />
            </TabsContent>
          </Inspector>
        </div>
      )}
      {/* Kept mounted while closed, so a file dropped anywhere on the page imports, opening it. */}
      <Sheet open={importing} onOpenChange={setImporting}>
        <SheetContent keepMounted className="gap-0">
          <SheetHeader className="pr-14">
            <SheetTitle>Import shows</SheetTitle>
            <SheetDescription>
              Paste show names or upload the roster’s file. Crossfeed looks each new one up in Qloo.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
            <RosterImport
              roster={roster}
              draft={importDraft}
              importRoster={(text, format) => agent.stub.importRoster(text, format)}
              keepsSettledShows
              dropped={openImport}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

// Whether a run can score every show yet, by the table, which settles them: shows still looked up,
// ambiguous, missed or failed in Qloo are listed as not scored until they're settled or left out.
function Readiness({ roster }: { roster: Show[] }) {
  if (roster.some((s) => s.resolution === 'pending')) return null
  const unsettled = roster.filter(
    (s) => !s.excluded && (s.resolution === 'ambiguous' || s.resolution === 'missed' || s.resolution === 'failed')
  ).length
  const scorable = roster.filter((s) => !s.excluded && (s.resolution === 'resolved' || s.resolution === 'mapped'))
  return (
    <p className="max-w-[72ch]">
      {unsettled > 0
        ? `${unsettled} ${unsettled === 1 ? 'show isn’t' : 'shows aren’t'} scored until you settle or leave ${unsettled === 1 ? 'it' : 'them'} out.`
        : scorable.length > 0
          ? 'Ready to rank: every show can be scored.'
          : 'Every show is left out, so a run has nothing to rank.'}
    </p>
  )
}
