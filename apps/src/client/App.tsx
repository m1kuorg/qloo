import { useAgent } from 'agents/react'
import { useState } from 'react'
import type { CrossfeedAgent, Show, State } from '../agent'

// The session's agent; the server picks the instance from the session cookie.
const useSession = () => useAgent<CrossfeedAgent, State>({ agent: 'CrossfeedAgent', basePath: 'agents/session' })

export function App() {
  const agent = useSession()
  const roster = agent.state?.roster ?? []
  return (
    <>
      <section className="hd">
        <h1>Roster</h1>
        <p className="help">Paste your network's show names, one per line. Crossfeed looks each one up in Qloo.</p>
      </section>
      <main className="main">
        <section className="chart-col" aria-label="Roster">
          <RosterImport importRoster={(text) => agent.stub.importRoster(text)} />
          <RosterTable roster={roster} />
        </section>
        <aside className="rail" aria-label="Details">
          <RosterCheck roster={roster} />
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

function RosterTable({ roster }: { roster: Show[] }) {
  if (roster.length === 0) return <p className="empty">No roster yet. Paste show names above to import one.</p>
  return (
    <table className="chart roster">
      <caption>
        <span className="lbl">Qloo data</span> Matches from Qloo search, one call per show.
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
          <tr key={show.name} data-resolution={show.resolution}>
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
              <code className="call">{show.evidence}</code>
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
        <span className="chip">Qloo data</span>
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
