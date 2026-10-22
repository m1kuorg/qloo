import { useEffect, useRef, useState } from 'react'
import type { Evidence } from '../evidence'
import type { Session } from './App'
import { Source } from './Source'
import { StateLine } from './states'

// The call whose evidence the rail shows, fetched on demand with getEvidence.
export type Opened =
  | { call: string; status: 'loading' }
  | { call: string; status: 'loaded'; record: Evidence | undefined }
  | { call: string; status: 'failed'; error: string }

// A cited call number: opens that call's evidence in the rail, or closes it when it's open. `label`
// says what it's evidence for, and screen readers hear it before the number.
export function CallButton({
  call,
  label,
  opened,
  openCall
}: {
  call: string
  label: string
  opened: string | null
  openCall: (call: string) => void
}) {
  return (
    <button
      type="button"
      className="call"
      aria-pressed={call === opened}
      aria-controls="evidence"
      aria-label={`${label}: call ${call}`}
      onClick={() => openCall(call)}
    >
      {call}
    </button>
  )
}

// The rail's evidence module: the Qloo request behind a call number, and what Qloo returned.
export function EvidencePanel({ opened }: { opened: Opened | null }) {
  const ref = useRef<HTMLElement>(null)
  const status = opened?.status
  // Bring the record into view once it's there, such as below the chart at narrow widths.
  useEffect(() => {
    if (status && status !== 'loading') ref.current?.scrollIntoView({ block: 'nearest' })
  }, [opened?.call, status])
  return (
    <section className="mod" id="evidence" ref={ref} aria-labelledby="evidence-h">
      <div className="mh">
        <span className="lbl" id="evidence-h">
          {opened ? `Evidence · ${opened.call}` : 'Evidence'}
        </span>
        <span className="chips">
          {opened?.status === 'loaded' && opened.record?.replayed && <span className="chip">Replayed</span>}
          {opened?.status === 'loaded' && opened.record?.copiedFrom && <span className="chip">From the roster</span>}
          <Source of="qloo" />
        </span>
      </div>
      {!opened && (
        <p className="help">
          Every Qloo figure cites its call, such as <code className="call">C-01</code>. Open one to see what was asked
          and what Qloo returned.
        </p>
      )}
      {opened?.status === 'loading' && (
        <p className="help" role="status">
          Loading {opened.call}…
        </p>
      )}
      {opened?.status === 'failed' && (
        <StateLine kind="error" role="alert">
          Couldn't load {opened.call}: {opened.error}
        </StateLine>
      )}
      {opened?.status === 'loaded' &&
        (opened.record ? (
          <EvidenceRecord record={opened.record} />
        ) : (
          <p className="help">This session has no call {opened.call}.</p>
        ))}
    </section>
  )
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour12: false })

function EvidenceRecord({ record }: { record: Evidence }) {
  const { entities, tags, affinities } = record
  return (
    <>
      <dl className="rec kv">
        {record.replayed && (
          <Row label="Replayed">From the stored sample run, as Qloo answered it then; no new request</Row>
        )}
        {record.copiedFrom && (
          <Row label="Copied">
            From the network&apos;s roster, its call {record.copiedFrom}, as Qloo answered it then; the run made no new
            request
          </Row>
        )}
        <Row label="Request">
          <code>
            {record.method} {record.endpoint}
          </code>
        </Row>
        <Row label="Parameters">
          {Object.entries(record.params).map(([k, v]) => (
            <code key={k} className="param">
              {k}={String(v)}
            </code>
          ))}
        </Row>
        <Row label="Status">{record.status ?? 'No response'}</Row>
        <Row label="Latency">{record.latencyMs} ms</Row>
        <Row label="Retries">{record.retries}</Row>
        <Row label="Cache">{record.cacheHit ? 'Hit, no new request' : 'Miss, called Qloo'}</Row>
        <Row label="Called at">{time(record.at)}</Row>
        {record.run && <Row label="Run">{record.run}</Row>}
        {record.error && <Row label="Error">{record.error}</Row>}
      </dl>
      {entities.length > 0 && (
        <ValueTable
          title={`Entities · ${entities.length}`}
          value="Popularity, raw"
          rows={entities.map((e) => ({ key: e.id, name: e.name, note: `${e.type} · ${e.id}`, value: e.popularity }))}
        />
      )}
      {tags.length > 0 && (
        <ValueTable
          title={`Tags · ${tags.length}`}
          value="Score, raw"
          rows={tags.map((t) => ({ key: t.id, name: t.name, note: t.id, value: t.score }))}
        />
      )}
      {affinities.length > 0 && (
        <ValueTable
          title={`Affinities · ${affinities.length}`}
          value="Affinity, raw"
          rows={affinities.map((a) => ({
            key: a.id,
            name: a.name,
            note: [a.id, ...a.explainability.map((x) => `${x.id} ${x.score}`)].join(' · '),
            value: a.affinity
          }))}
        />
      )}
      {!record.error && entities.length + tags.length + affinities.length === 0 && (
        <p className="help ev-none">Qloo returned no results.</p>
      )}
    </>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rec-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

type ValueRow = { key: string; name: string; note: string; value: number | null }

// What Qloo returned, as it returned it: the roster shows popularity as a percentile, this the raw value.
function ValueTable({ title, value, rows }: { title: string; value: string; rows: ValueRow[] }) {
  return (
    <table className="ev">
      <caption>{title}</caption>
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col" className="r">
            {value}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td>
              {r.name}
              <small>{r.note}</small>
            </td>
            <td className="r">{r.value ?? '–'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// The rail's evidence module: `openCall` opens a call's record, or closes it when it's already open.
// Only the latest click's answer lands.
export function useEvidence(agent: Session) {
  const [opened, setOpened] = useState<Opened | null>(null)
  const latest = useRef<string | null>(null)
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
  return { opened, openCall }
}
