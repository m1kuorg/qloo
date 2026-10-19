import { useRef, useState } from 'react'
import { dollars } from '../order'
import { sample as sampleNetwork, sampleRoster, type Sample } from '../sample'
import { RosterCheck, RosterFailures, RosterImport, RosterTable, ShowEditor, useEvidence } from './App'
import { Alert, useAction } from './controls'
import { LostAccess, useNetwork, type NetworkConnection, type NetworkPage } from './Dashboard'
import { EvidencePanel } from './Evidence'
import { StateLine } from './states'

// The network's roster page, connected to the network's agent.
export function RosterPage({ agentPath, network }: { agentPath: string; network: NetworkPage }) {
  const agent = useNetwork(agentPath)
  if (agent.connectionError) return <LostAccess network={network} reason={agent.connectionError.reason} />
  return <NetworkRoster agent={agent} network={network} />
}

// The roster every launch on the network ranks, kept by its agent: the demo's roster table and show
// editor, with an import that keeps the shows already settled. Every member's edits reach the others
// through synced state. Tests render it from a network agent's synced state.
export function NetworkRoster({ agent, network }: { agent: NetworkConnection; network: NetworkPage }) {
  const state = agent.state
  const roster = state?.roster ?? []
  const [selected, setSelected] = useState<string | null>(null)
  const show = roster.find((s) => s.name === selected)
  const { opened, openCall } = useEvidence(agent)
  const importDraft = useRef('')
  return (
    <>
      <header className="hd">
        <h1>Roster</h1>
        <p className="sub-line">Every launch on {network.name} ranks this roster, as it stands when its run starts.</p>
      </header>
      <main className="main net-roster">
        <div className="chart-col">
          {state ? (
            <>
              {state.sample && <SampleRoster sample={state.sample} />}
              <RosterFailures roster={roster} />
              <RosterImport
                roster={roster}
                draft={importDraft}
                importRoster={(text, format) => agent.stub.importRoster(text, format)}
                keepsSettledShows
              />
              {roster.length > 0 ? (
                <RosterTable
                  roster={roster}
                  selected={show?.name ?? null}
                  select={setSelected}
                  slowCalls={state.slowCalls ?? []}
                  openCall={openCall}
                  opened={opened?.call ?? null}
                />
              ) : (
                <EmptyRoster start={() => agent.stub.startFromSample()} />
              )}
            </>
          ) : (
            <StateLine kind="loading">Connecting to the network…</StateLine>
          )}
        </div>
        <aside className="rail" aria-label="Details">
          {show && <ShowEditor key={show.name} show={show} agent={agent} close={() => setSelected(null)} />}
          {/* An empty roster cites no call and has nothing to count. */}
          {roster.length > 0 && (
            <>
              <EvidencePanel opened={opened} />
              <RosterCheck roster={roster} />
            </>
          )}
          <CpmRecord cpm={state ? state.cpm : undefined} network={network} />
        </aside>
      </main>
    </>
  )
}

// An empty roster: the import form above takes the network's own file or names, or the sample roster
// can stand in to try first.
function EmptyRoster({ start }: { start: () => Promise<unknown> }) {
  const { busy, error, run } = useAction()
  return (
    <div className="empty">
      <p>
        <StateLine kind="empty">No roster yet.</StateLine>
      </p>
      <div className="acts">
        <button type="button" className="btn" disabled={busy} onClick={() => void run(start)}>
          Start from the sample roster
        </button>
        <small>
          {sampleNetwork.network}&apos;s {sampleRoster.length} public show names, with made-up figures labelled sample,
          to try Crossfeed before your own.
        </small>
      </div>
      <Alert error={error} />
    </div>
  )
}

// What a roster started from the sample is, where its notice would be on the demo. Its CPM isn't the
// sample's, so the notice leaves it out.
function SampleRoster({ sample }: { sample: Sample }) {
  return (
    <p className="help sample-notice">
      <b>Sample roster.</b> {sample.network}&apos;s public show names, with downloads, statuses, and descriptions
      Crossfeed chose, each labelled sample until you change it. Crossfeed isn&apos;t affiliated with {sample.network}.
      Import your own roster over it; shows on both keep their matches.
    </p>
  )
}

// The CPM that prices every launch's slots, which an owner changes in settings. `cpm` is undefined
// until the agent is connected.
function CpmRecord({ cpm, network }: { cpm: number | null | undefined; network: NetworkPage }) {
  return (
    <section className="mod" aria-labelledby="cpm-h">
      <div className="mh">
        <h2 className="lbl" id="cpm-h">
          Network CPM
        </h2>
        {cpm === null && <span className="chip">Not set</span>}
      </div>
      {cpm != null && (
        <dl className="rec kv">
          <div className="rec-row">
            <dt>CPM</dt>
            <dd>{dollars(cpm)} per 1,000 downloads</dd>
          </div>
        </dl>
      )}
      <p className="help">
        Prices each promo slot: downloads per episode × CPM ÷ 1,000.{' '}
        {network.role === 'owner' ? (
          <a className="lnk" href={network.links.settings}>
            {cpm === null ? 'Set it in settings' : 'Change it in settings'}
          </a>
        ) : (
          'An owner sets it in settings.'
        )}
      </p>
    </section>
  )
}
