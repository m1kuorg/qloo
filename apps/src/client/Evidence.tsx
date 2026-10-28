import { ChevronDownIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { callVariants } from '@/components/ui/variants'
import type { Evidence } from '../evidence'
import type { Session } from './App'
import { KeyValue, KeyValues } from './controls'
import { Source } from './Source'
import { sentence, StateLine } from './states'

// The call whose evidence the inspector shows, fetched on demand with getEvidence.
export type Opened =
  | { call: string; status: 'loading' }
  | { call: string; status: 'loaded'; record: Evidence | undefined }
  | { call: string; status: 'failed'; error: string }

// Opens a call's evidence in the inspector, from the control that asked (`from`), where focus goes back
// to as the inspector closes.
export type OpenCall = (call: string, from: HTMLElement) => void

// A cited call number: opens that call's evidence in the inspector, or closes it when it's open, passing
// itself as what opened it. `label` says what it's evidence for, and screen readers hear it before the
// number. Codes aren't translated.
export function CallButton({
  call,
  label,
  opened,
  openCall
}: {
  call: string
  label: string
  opened: string | null
  openCall: OpenCall
}) {
  return (
    <button
      type="button"
      className={callVariants()}
      aria-pressed={call === opened}
      aria-controls="evidence"
      aria-label={`${label}: call ${call}`}
      translate="no"
      onClick={(e) => openCall(call, e.currentTarget)}
    >
      {call}
    </button>
  )
}

// The inspector's Evidence tab: the Qloo request behind a call number, as a record, and what Qloo
// returned, as raw tables. Its id is what every call number's aria-controls names, so it's always
// mounted.
export function EvidencePanel({ opened }: { opened: Opened | null }) {
  const ref = useRef<HTMLElement>(null)
  const status = opened?.status
  // Bring the record into view once it's there, such as below the chart at narrow widths.
  useEffect(() => {
    if (status && status !== 'loading') ref.current?.scrollIntoView({ block: 'nearest' })
  }, [opened?.call, status])
  const record = opened?.status === 'loaded' ? opened.record : undefined
  return (
    // Scrolled to, it stops clear of the inspector's sticky tabs.
    <section className="flex min-w-0 scroll-mt-16 flex-col gap-4" id="evidence" ref={ref} aria-labelledby="evidence-h">
      <div className="flex flex-col gap-1.5">
        <h2 className="font-semibold" id="evidence-h">
          {opened ? (
            <>
              Evidence · <code className="font-mono font-medium">{opened.call}</code>
            </>
          ) : (
            'Evidence'
          )}
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <Source of="qloo" />
          {record?.replayed && <Badge variant="outline">Replayed</Badge>}
          {record?.fromSample && <Badge variant="outline">Sample data</Badge>}
          {record?.copiedFrom && <Badge variant="outline">From the roster</Badge>}
        </div>
      </div>
      {!opened && (
        <p className="text-muted-foreground">
          Every Qloo figure cites its call, such as <code className="font-mono text-xs">C-01</code>. Select one to see
          the request and what Qloo returned.
        </p>
      )}
      {opened?.status === 'loading' && (
        <>
          <p role="status">
            <StateLine kind="loading" word={null}>
              Loading {opened.call}…
            </StateLine>
          </p>
          {/* The record's rows in their shape, still. */}
          <div className="flex flex-col gap-2.5" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        </>
      )}
      {opened?.status === 'failed' && (
        <StateLine kind="error" role="alert">
          Couldn’t load {opened.call}: {sentence(opened.error)} Select the call again to try again.
        </StateLine>
      )}
      {opened?.status === 'loaded' &&
        (record ? (
          <EvidenceRecord record={record} />
        ) : (
          <p className="text-muted-foreground">This session has no call {opened.call}.</p>
        ))}
    </section>
  )
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour12: false })

// A raw figure as Qloo returned it: the number's shortest round trip, which is the figure Qloo's JSON
// wrote. Qloo's own answers carry binary-float noise, such as a demographics bucket of
// -0.11400000000000002, and that stays, since rounding it would no longer be what Qloo sent.
const raw = (n: number | null) => (n === null ? '–' : String(n))

// A code, such as an entity's Qloo ID, on one line: cut short with an ellipsis where it doesn't fit,
// whole in its tooltip and to screen readers, and never translated.
const Code = ({ children }: { children: string }) => (
  <code className="block truncate font-mono text-xs" title={children} translate="no">
    {children}
  </code>
)

function EvidenceRecord({ record }: { record: Evidence }) {
  const { entities, tags, affinities } = record
  return (
    <>
      <KeyValues>
        {record.replayed && (
          <KeyValue label="Replayed">From the stored sample run, as Qloo answered it then; no new request</KeyValue>
        )}
        {record.fromSample && (
          <KeyValue label="Sample">
            From the sample data, as Qloo answered it when it was captured; no new request
          </KeyValue>
        )}
        {record.copiedFrom && (
          <KeyValue label="Copied">
            From the network’s roster, its call <code className="font-mono text-xs">{record.copiedFrom}</code>, as Qloo
            answered it then; the run made no new request
          </KeyValue>
        )}
        <KeyValue label="Request">
          <code className="font-mono text-xs break-all">
            {record.method} {record.endpoint}
          </code>
        </KeyValue>
        <KeyValue label="Parameters">
          <Parameters params={record.params} />
        </KeyValue>
        <KeyValue label="Status">{record.status ?? 'No response'}</KeyValue>
        <KeyValue label="Latency">{`${record.latencyMs}\u00a0ms`}</KeyValue>
        <KeyValue label="Retries">{record.retries}</KeyValue>
        <KeyValue label="Cache">{record.cacheHit ? 'Hit, no new request' : 'Miss, called Qloo'}</KeyValue>
        <KeyValue label="Called at">{time(record.at)}</KeyValue>
        {record.run && (
          <KeyValue label="Run">
            <Code>{record.run}</Code>
          </KeyValue>
        )}
        {record.error && <KeyValue label="Error">{record.error}</KeyValue>}
      </KeyValues>
      {entities.length > 0 && (
        <ValueTable
          title={`Entities · ${entities.length}`}
          value="Popularity, raw"
          rows={entities.map((e) => ({
            key: e.id,
            name: e.name,
            id: e.id,
            notes: <Code>{e.type}</Code>,
            value: e.popularity
          }))}
        />
      )}
      {tags.length > 0 && (
        <ValueTable
          title={`Tags · ${tags.length}`}
          value="Score, raw"
          rows={tags.map((t) => ({ key: t.id, name: t.name, id: t.id, notes: null, value: t.score }))}
        />
      )}
      {affinities.length > 0 && (
        <ValueTable
          title={`Affinities · ${affinities.length}`}
          value="Affinity, raw"
          rows={affinities.map((a) => ({
            key: a.id,
            name: a.name,
            id: a.id,
            // Its explainability: each signal's ID and its share of the affinity, the share never cut.
            notes: a.explainability.map((x) => (
              <span key={x.id} className="flex min-w-0 items-baseline gap-2">
                <span className="min-w-0">
                  <Code>{x.id}</Code>
                </span>
                <span className="shrink-0 type-caption">{raw(x.score)}</span>
              </span>
            )),
            value: a.affinity
          }))}
        />
      )}
      {!record.error && entities.length + tags.length + affinities.length === 0 && (
        <p className="text-muted-foreground">Qloo returned no results.</p>
      )}
    </>
  )
}

// What was sent, one parameter to a line: its key, as the request names it, then its value. A list of
// entity IDs says how many it holds and gives each its own line; a long one folds behind its count.
function Parameters({ params }: { params: Evidence['params'] }) {
  return (
    <ul className="flex flex-col gap-2">
      {Object.entries(params).map(([key, value]) => {
        const ids = key.endsWith('entities') ? String(value).split(',').filter(Boolean) : null
        return (
          <li key={key} className="flex min-w-0 flex-col" data-param={key}>
            <code className="font-mono text-xs break-all text-muted-foreground">{key}</code>
            {ids ? <EntityIds ids={ids} /> : <span className="break-words">{String(value)}</span>}
          </li>
        )
      })}
    </ul>
  )
}

function EntityIds({ ids }: { ids: string[] }) {
  const count = `${ids.length} entity ${ids.length === 1 ? 'ID' : 'IDs'}`
  const list = (
    <ul className="flex flex-col">
      {ids.map((id, i) => (
        <li key={i}>
          <Code>{id}</Code>
        </li>
      ))}
    </ul>
  )
  if (ids.length <= 3)
    return (
      <>
        <span>{count}</span>
        {list}
      </>
    )
  return (
    <details className="group/ids">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-sm underline decoration-muted-foreground decoration-1 underline-offset-4 hover:decoration-foreground max-md:min-h-11 [&::-webkit-details-marker]:hidden">
        {count}
        <ChevronDownIcon
          aria-hidden="true"
          className="size-4 text-muted-foreground transition-transform group-open/ids:rotate-180"
        />
      </summary>
      {list}
    </details>
  )
}

type ValueRow = { key: string; name: string; id: string; notes: React.ReactNode; value: number | null }

// What Qloo returned, as it returned it: the name, the Qloo ID and the raw figure, which the roster
// shows as a percentile and the chart as a rank and band.
function ValueTable({ title, value, rows }: { title: string; value: string; rows: ValueRow[] }) {
  return (
    <table className="w-full table-fixed">
      <caption className="pb-1.5 text-left font-semibold">{title}</caption>
      <thead className="type-caption text-muted-foreground">
        <tr className="border-b">
          <th scope="col" className="pb-1.5 text-left font-normal">
            Name
          </th>
          <th scope="col" className="w-36 pb-1.5 pl-3 text-right font-normal">
            {value}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-b align-baseline">
            <td className="py-1.5">
              <span className="block break-words">{r.name}</span>
              <span className="block text-muted-foreground">
                <Code>{r.id}</Code>
                {r.notes}
              </span>
            </td>
            <td className="py-1.5 pl-3 text-right type-caption break-all">{raw(r.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// The evidence on show: `openCall` opens a call's record, or closes it when it's already open.
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
