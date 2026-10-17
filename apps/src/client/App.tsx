import { useAgent } from 'agents/react'
import { useRef, useState } from 'react'
import type { CrossfeedAgent, Show, State } from '../agent'
import { EvidencePanel, type Opened } from './Evidence'
import { Source } from './Source'

// The session's agent; the server picks the instance from the session cookie.
const useSession = () => useAgent<CrossfeedAgent, State>({ agent: 'CrossfeedAgent', basePath: 'agents/session' })

export function App() {
  const agent = useSession()
  const roster = agent.state?.roster ?? []
  const [opened, setOpened] = useState<Opened | null>(null)
  const latest = useRef<string | null>(null)
  // Opens a call's evidence, or closes it when it's already open. Only the latest click's answer lands.
  const openCall = async (call: string) => {
    const closing = opened?.call === call
    latest.current = closing ? null : call
    if (closing) return setOpened(null)
    setOpened({ call, status: 'loading' })
    try {
      const log = await agent.stub.getEvidence()
      if (latest.current === call) setOpened({ call, status: 'loaded', record: log.find((e) => e.call === call) })
    } catch (err) {
      if (latest.current === call)
        setOpened({ call, status: 'failed', error: err instanceof Error ? err.message : String(err) })
    }
  }
  return (
    <>
      <section className="hd">
        <h1>Roster</h1>
        <p className="help">Paste your network's show names, one per line. Crossfeed looks each one up in Qloo.</p>
      </section>
      <main className="main">
        <section className="chart-col" aria-label="Roster">
          <RosterImport importRoster={(text) => agent.stub.importRoster(text)} />
          <RosterTable roster={roster} openCall={openCall} opened={opened?.call ?? null} />
        </section>
        <aside className="rail" aria-label="Details">
          <RosterCheck roster={roster} />
          <EvidencePanel opened={opened} />
        </aside>
      </main>
    </>
  )
}

function RosterImport({ importRoster }: { importRoster: (text: string) => Promise<void> }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const count = text.split('\n').filter((l) => l.trim()).length
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await importRoster(text)
      setText('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="import" onSubmit={submit}>
      <label className="lbl" htmlFor="roster-names">
        Show names
      </label>
      <textarea
        id="roster-names"
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'The Rewatchables\nThe Big Picture\nBinge Mode'}
        disabled={busy}
      />
      <div className="acts">
        <button className="btn pri" type="submit" disabled={busy || count === 0}>
          {busy ? `Looking up ${count} shows…` : 'Import roster'}
        </button>
        <small>Replaces the current roster.</small>
      </div>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}

const resolutionLabel: Record<Show['resolution'], string> = {
  resolved: 'Resolved',
  ambiguous: 'Ambiguous',
  missed: 'Missed',
  failed: 'Lookup failed'
}

function RosterTable({
  roster,
  openCall,
  opened
}: {
  roster: Show[]
  openCall: (call: string) => void
  opened: string | null
}) {
  if (roster.length === 0) return <p className="empty">No roster yet. Paste show names above to import one.</p>
  return (
    <table className="chart roster">
      <caption>
        <Source of="qloo" /> Matches from Qloo search, one call per show. Open a call for its evidence.
      </caption>
      <colgroup>
        <col style={{ width: '32%' }} />
        <col style={{ width: 136 }} />
        <col />
        <col style={{ width: 72 }} />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">Show</th>
          <th scope="col">Match</th>
          <th scope="col">
            Qloo entity<small>popularity percentile</small>
          </th>
          <th scope="col" className="r">
            Call
          </th>
        </tr>
      </thead>
      <tbody>
        {roster.map((show) => (
          <tr key={show.name} data-resolution={show.resolution} className={show.evidence === opened ? 'on' : undefined}>
            <td>
              <div className="nm">{show.name}</div>
            </td>
            <td>
              <span className="chip">{resolutionLabel[show.resolution]}</span>
            </td>
            <td>
              <Match show={show} />
            </td>
            <td className="r">
              <button
                type="button"
                className="call"
                aria-pressed={show.evidence === opened}
                aria-controls="evidence"
                aria-label={`Evidence for ${show.name}: call ${show.evidence}`}
                onClick={() => openCall(show.evidence)}
              >
                {show.evidence}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const percentile = (p: number | null) => (p === null ? '–' : (p * 100).toFixed(1))

function Match({ show }: { show: Show }) {
  if (show.resolution === 'resolved' && show.entity)
    return (
      <span className="ent">
        {show.entity.name} <span className="pop">{percentile(show.entity.popularity)}</span>
      </span>
    )
  if (show.resolution === 'ambiguous')
    return (
      <ul className="cands" aria-label={`Candidates for ${show.name}`}>
        {show.candidates.map((c) => (
          <li key={c.id}>
            {c.name} <span className="pop">{percentile(c.popularity)}</span>
          </li>
        ))}
      </ul>
    )
  if (show.resolution === 'failed') return <span className="tg">{show.error}</span>
  return <span className="tg">No show by this name in Qloo.</span>
}

function RosterCheck({ roster }: { roster: Show[] }) {
  const count = (r: Show['resolution']) => roster.filter((s) => s.resolution === r).length
  const rows: [string, number][] = [
    ['Resolved', count('resolved')],
    ['Ambiguous', count('ambiguous')],
    ['Missed', count('missed')],
    ['Lookup failed', count('failed')]
  ]
  return (
    <section className="mod" aria-labelledby="roster-check">
      <div className="mh">
        <span className="lbl" id="roster-check">
          Roster check
        </span>
        <Source of="qloo" />
      </div>
      <p className="help">Only resolved shows can be scored.</p>
      <dl className="rec">
        {rows.map(([label, n]) => (
          <div key={label} className="rec-row">
            <dt>{label}</dt>
            <dd>{n}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
