import { cn } from 'cn'
import { useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { TabsContent } from '@/components/ui/tabs'
import { linkVariants } from '@/components/ui/variants'
import type { Show } from '../agent'
import { dollars } from '../order'
import { EvidencePanel, useEvidence } from './Evidence'
import { canvas, frame, Inspector, useInspector } from './Frame'
import { NetworkGate, useNetwork, type NetworkConnection, type NetworkPage } from './NetworkPage'
import { RosterCounts, RosterFailures, RosterImport, RosterTable, ShowEditor } from './RosterModules'
import { connectionOf, ConnectionState, StateLine, type Connection } from './states'

// The network's roster page, connected to the network's agent.
export function RosterPage({ agentPath, network }: { agentPath: string; network: NetworkPage }) {
  const agent = useNetwork(agentPath)
  return (
    <NetworkGate agent={agent} network={network}>
      <NetworkRoster agent={agent} network={network} connection={connectionOf(agent)} />
    </NetworkGate>
  )
}

// A page without the inspector beside it takes its gutter on both sides.
const alone = cn(canvas, 'min-[85rem]:pr-6')

// The roster every launch on the network ranks, kept by its agent, which answers "Is my roster ready
// to rank?": the title row with its counts and CPM, the shows Qloo failed on, and the roster table,
// whose shows open in the inspector's Show tab beside it (a sheet under 1360px) and whose calls open
// in its Evidence tab. "Import shows" opens the import in a sheet; an empty roster has the import as
// its body. Every member's edits reach the others through synced state. Tests render it from a network agent's synced state.
export function NetworkRoster({
  agent,
  network,
  connection = { lost: null, reconnecting: false }
}: {
  agent: NetworkConnection
  network: NetworkPage
  connection?: Connection
}) {
  const state = agent.state
  const roster = state?.roster ?? []
  const [selected, setSelected] = useState<string | null>(null)
  const show = roster.find((s) => s.name === selected)
  const evidence = useEvidence(agent)
  // The Show tab is there with no show selected too, saying how to open one.
  const inspector = useInspector(['show', 'evidence'], evidence)
  // The import's sheet, which stays open after an import so a refusal shows where it was asked.
  const [importing, setImporting] = useState(false)
  const importDraft = useRef('')
  const importer = (stacked: boolean) => (
    <RosterImport
      roster={roster}
      draft={importDraft}
      importRoster={(text, format) => agent.stub.importRoster(text, format)}
      keepsSettledShows
      stacked={stacked}
      dropped={stacked ? () => setImporting(true) : undefined}
    />
  )
  const head = (
    <RosterHead
      network={network}
      roster={state ? roster : null}
      cpm={state ? state.cpm : undefined}
      sampleCpm={state?.sample?.cpm ?? false}
      connection={connection}
      action={roster.length > 0 && <Button onClick={() => setImporting(true)}>Import shows</Button>}
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

  if (roster.length === 0)
    return (
      <main className={alone}>
        {head}
        <section className="flex flex-col gap-4 rounded-xl bg-card p-4 lg:p-6" aria-labelledby="import-h">
          <h2 className="text-base font-semibold" id="import-h">
            Import shows
          </h2>
          {importer(false)}
        </section>
      </main>
    )

  return (
    <div className={frame}>
      <main className={canvas}>
        {head}
        <RosterFailures roster={roster} />
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
      {/* Kept mounted while closed, so a file dropped anywhere on the page imports, opening it. */}
      <Sheet open={importing} onOpenChange={setImporting}>
        <SheetContent keepMounted className="gap-0">
          <SheetHeader className="pr-14">
            <SheetTitle>Import shows</SheetTitle>
            <SheetDescription>
              Paste show names or upload the roster’s file. Crossfeed looks each new one up in Qloo.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">{importer(true)}</div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

// The title row: what the roster is for; once connected, its counts and whether it's ready to rank,
// or that there's none yet; the CPM its slots are priced at; the connection's state; and `action`.
function RosterHead({
  network,
  roster,
  cpm,
  sampleCpm,
  connection,
  action
}: {
  network: NetworkPage
  roster: Show[] | null // null until the agent is connected
  cpm: number | null | undefined
  sampleCpm: boolean // the CPM is still the sample network's, as the guest network's starts (ADR 0007)
  connection: Connection
  action: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 flex-1 basis-md flex-col gap-1.5">
        <h1 className="type-title">Roster</h1>
        <p className="max-w-[72ch] text-muted-foreground">
          Every launch on {network.name} ranks this roster, as it stands when its run starts.
        </p>
        {roster &&
          (roster.length > 0 ? (
            <div className="flex flex-wrap gap-x-1.5 font-medium">
              <RosterCounts roster={roster} />
              <Readiness roster={roster} />
            </div>
          ) : (
            <p>
              <StateLine kind="empty">No roster yet.</StateLine>
            </p>
          ))}
        {cpm !== undefined && <CpmLine cpm={cpm} sample={sampleCpm} network={network} />}
        {/* Always there, so a screen reader hears the line as it appears. */}
        <span role="status" className="type-caption">
          {roster ? (
            <ConnectionState connection={connection} />
          ) : (
            <StateLine kind="loading">Connecting to the network…</StateLine>
          )}
        </span>
      </div>
      {action}
    </div>
  )
}

// Whether a run can score every show yet: shows still looked up, ambiguous, missed or failed in Qloo
// are listed as not scored until they're settled or left out.
function Readiness({ roster }: { roster: Show[] }) {
  if (roster.some((s) => s.resolution === 'pending')) return null
  const unsettled = roster.filter(
    (s) => !s.excluded && (s.resolution === 'ambiguous' || s.resolution === 'missed' || s.resolution === 'failed')
  ).length
  const scorable = roster.filter((s) => !s.excluded && (s.resolution === 'resolved' || s.resolution === 'mapped'))
  return (
    <p className="font-normal text-muted-foreground">
      {unsettled > 0
        ? `${unsettled} ${unsettled === 1 ? 'show isn’t' : 'shows aren’t'} scored until you settle or leave ${unsettled === 1 ? 'it' : 'them'} out.`
        : scorable.length > 0
          ? 'Ready to rank: every show can be scored.'
          : 'Every show is left out, so a run has nothing to rank.'}
    </p>
  )
}

// The CPM that prices every launch's slots, read-only here: an owner changes it in settings. Labelled
// sample while it's still the sample network's.
function CpmLine({ cpm, sample, network }: { cpm: number | null; sample: boolean; network: NetworkPage }) {
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 type-caption text-muted-foreground">
      <span>CPM</span>
      {cpm === null ? (
        <Badge>Not set</Badge>
      ) : (
        <span>
          <span className="text-foreground">{dollars(cpm)}</span> per 1,000 downloads
        </span>
      )}
      {sample && <Badge>sample</Badge>}
      <span aria-hidden="true">·</span>
      {network.role === 'owner' ? (
        <a className={linkVariants()} href={network.links.settings}>
          {cpm === null ? 'Set it in settings' : 'Change it in settings'}
        </a>
      ) : (
        <span>An owner sets it in settings.</span>
      )}
    </p>
  )
}
