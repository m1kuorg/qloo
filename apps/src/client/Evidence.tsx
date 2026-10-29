import { CheckIcon, ChevronDownIcon, CopyIcon } from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { callVariants } from '@/components/ui/variants'
import type { RunSummary } from '../agent'
import type { Evidence } from '../evidence'
import { qlooType, workNoun, workTypes } from '../inbox'
import type { Session } from './App'
import { day, demographic, KeyValue, KeyValues, listParts, percentile, score, ScrollTable, useCopy } from './controls'
import { count, Section } from './PageHeader'
import { runNumber } from './Run'
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

// The inspector's Evidence tab: the Qloo request behind a call number, in words, then what Qloo
// returned, then the record as the gateway stored it. `names` names the entities its IDs stand for,
// from the session's log (`namesOf`), and `runs` numbers its run as the Runs list does. Its id is what
// every call number's aria-controls names, so it's always mounted.
export function EvidencePanel({ opened, names, runs }: { opened: Opened | null; names: Names; runs: RunSummary[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const status = opened?.status
  // Bring the record into view once it's there, such as below the chart at narrow widths.
  useEffect(() => {
    if (status && status !== 'loading') ref.current?.scrollIntoView({ block: 'nearest' })
  }, [opened?.call, status])
  const record = opened?.status === 'loaded' ? opened.record : undefined
  // The open record's own names first.
  const named = record ? namesOf([record], names) : names
  return (
    // Scrolled to, it stops clear of the inspector's sticky tabs.
    <div className="min-w-0 scroll-mt-16" id="evidence" ref={ref}>
      {!opened ? (
        <p className="text-muted-foreground">
          Every Qloo figure cites its call, such as <code className="font-mono text-xs">C-01</code>. Select one to see
          what was asked and what Qloo returned.
        </p>
      ) : (
        <Section
          id="evidence-h"
          title={
            <span>
              Evidence ·{' '}
              <code className="font-mono font-medium" translate="no">
                {opened.call}
              </code>
            </span>
          }
          badge={
            record && (
              <>
                <Source of="qloo" />
                {record.replayed ? (
                  <Badge variant="outline">Replayed</Badge>
                ) : (
                  record.copiedFrom && <Badge variant="outline">From the roster</Badge>
                )}
              </>
            )
          }
          description={record && outcome(record, named)}
        >
          {opened.status === 'loading' && (
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
          {opened.status === 'failed' && (
            <StateLine kind="error" role="alert">
              Couldn’t load {opened.call}: {sentence(opened.error)} Select the call again to try again.
            </StateLine>
          )}
          {opened.status === 'loaded' &&
            (record ? (
              <EvidenceRecord record={record} names={named} run={record.run ? runNumber(runs, record.run) : 0} />
            ) : (
              <p className="text-muted-foreground">This session has no call {opened.call}.</p>
            ))}
        </Section>
      )}
    </div>
  )
}

// What each entity ID in a session's log stands for: its name, and its Qloo type where a search gave
// one, from the records' entities and affinities, a later record's over an earlier's, and over `names`.
export type Names = Map<string, { name: string; type: string | null }>
export function namesOf(log: Evidence[], names: Names = new Map()): Names {
  const named: Names = new Map(names)
  for (const record of log) {
    for (const e of record.entities) named.set(e.id, { name: e.name, type: e.type })
    for (const a of record.affinities) named.set(a.id, { name: a.name, type: named.get(a.id)?.type ?? null })
  }
  return named
}

// A thing's word and its plural, as a count takes them.
type Noun = [one: string, many: string]

// A Qloo type as the app words it in a sentence: a work's (workNoun), such as "podcast" or "TV show",
// or for any other, the URN's last part, such as "artist"; with none, an entity.
const nounOf = (type: string | number | boolean | null | undefined): Noun => {
  const work = workTypes.find((w) => qlooType[w] === type)
  if (work) return [workNoun[work], `${workNoun[work]}s`]
  if (typeof type !== 'string' || !type) return ['entity', 'entities']
  const word = type === 'urn:demographics' ? 'demographics' : type.split(':').at(-1)!.replace(/_/g, ' ')
  return [word, `${word}s`]
}

// What a list of IDs are: their one type, where every one has the same.
const nounOfIds = (ids: string[], names: Names) => {
  const types = new Set(ids.map((id) => names.get(id)?.type))
  return nounOf(types.size === 1 ? [...types][0] : null)
}

const upper = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)

// A count in a sentence, none as "no".
const some = (n: number, [one, many]: Noun) => (n === 0 ? `no ${many}` : count(n, one, many))

const idsOf = (value: string | number | boolean | undefined) =>
  value === undefined ? [] : String(value).split(',').filter(Boolean)

// Which Qloo request a record is, from its endpoint and, for insights, its filter; none for a record
// with no parameters, kept when the gateway threw before it built them, as ranking and demographics
// share an endpoint.
const kindOf = ({ endpoint, params }: Evidence) =>
  Object.keys(params).length === 0
    ? null
    : endpoint === '/search'
      ? 'search'
      : endpoint === '/v2/analysis/compare'
        ? 'compare'
        : params['filter.type'] === 'urn:demographics'
          ? 'demographics'
          : 'ranking'

const failed = {
  search: 'The search failed.',
  ranking: 'The ranking failed.',
  compare: 'The compare failed.',
  demographics: 'The demographic check failed.'
}

// What Qloo did, by outcome, so it doesn't repeat what was sent.
function outcome(record: Evidence, names: Names) {
  const kind = kindOf(record)
  if (!kind) return 'The Qloo request behind a call, and what Qloo returned.'
  if (record.error) return failed[kind]
  const { params, entities, tags, affinities } = record
  if (kind === 'search') return `Qloo’s search returned ${some(entities.length, nounOf(params.types))}.`
  if (kind === 'compare') return `Qloo returned ${some(tags.length, ['tag', 'tags'])} the two sides’ listeners share.`
  if (kind === 'demographics') {
    const noun = nounOfIds(
      affinities.map((a) => a.id),
      names
    )
    return `Qloo returned listener age and gender for ${some(affinities.length, noun)}.`
  }
  const candidates = idsOf(params['filter.results.entities']).length
  return `Qloo scored ${affinities.filter((a) => a.affinity !== null).length} of ${count(candidates, 'candidate')}.`
}

// When the call started, as the reader's clock has it, such as "Oct 28, 00:54:39", then how long it
// took, whether the gateway's cache answered it, and how many times it was retried.
const called = ({ at, latencyMs, cacheHit, retries }: Evidence) =>
  [
    `${day(at)}, ${new Date(at).toLocaleTimeString('en-US', { hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
    `${latencyMs.toLocaleString('en-US')}\u00a0ms`,
    ...(cacheHit ? ['from the cache'] : []),
    ...(retries > 0 ? [count(retries, 'retry', 'retries')] : [])
  ].join(' · ')

// A ranking's share of an affinity for one of its signals, as Qloo returned it: the number's shortest
// round trip, which is the figure Qloo's JSON wrote.
const raw = (n: number) => String(n)

// A code, such as an entity's Qloo ID, on one line: cut short with an ellipsis where it doesn't fit,
// whole in its tooltip and to screen readers, and never translated.
const Code = ({ children }: { children: string }) => (
  <code className="block truncate font-mono text-xs" title={children} translate="no">
    {children}
  </code>
)

function EvidenceRecord({ record, names, run }: { record: Evidence; names: Names; run: number }) {
  const { entities, tags, affinities } = record
  // A demographics call keeps each entity's buckets as its explainability, each a demographic score.
  const demographics = record.params['filter.type'] === 'urn:demographics'
  return (
    <>
      <KeyValues>
        <KeyValue label="Request">
          <code className="font-mono text-xs break-all" translate="no">
            {record.method} {record.endpoint}
          </code>
        </KeyValue>
        <KeyValue label="Status">{record.status ?? 'No response'}</KeyValue>
        <KeyValue label="Called">{called(record)}</KeyValue>
        {run > 0 && <KeyValue label="Run">Run {run}</KeyValue>}
        {record.replayed ? (
          <KeyValue label="Answer">From the stored sample run, as Qloo answered it then; no new request</KeyValue>
        ) : record.fromSample ? (
          <KeyValue label="Answer">
            From the sample data, as Qloo answered it when it was captured; no new request
          </KeyValue>
        ) : (
          record.copiedFrom && (
            // The network's call, not this log's, which may have a call by the same number.
            <KeyValue label="Answer">
              From the network’s roster, its call{' '}
              <code className="font-mono text-xs" translate="no">
                {record.copiedFrom}
              </code>
              , as Qloo answered it then; the run made no new request
            </KeyValue>
          )
        )}
        {record.error && (
          <KeyValue label="Error">
            <Named text={record.error} names={names} />
          </KeyValue>
        )}
      </KeyValues>
      {Object.keys(record.params).length > 0 && <WhatWasSent record={record} names={names} />}
      {entities.length > 0 && (
        <ValueTable
          title={`Entities · ${entities.length}`}
          value="Popularity percentile"
          rows={entities.map((e) => ({
            key: e.id,
            name: e.name,
            id: e.id,
            notes: <Code>{e.type}</Code>,
            figure: percentile(e.popularity)
          }))}
        />
      )}
      {tags.length > 0 && (
        <ValueTable
          title={`Tags · ${tags.length}`}
          value="Score"
          rows={tags.map((t) => ({ key: t.id, name: t.name, id: t.id, notes: null, figure: score(t.score) }))}
        />
      )}
      {affinities.length > 0 && (
        <ValueTable
          title={`Affinities · ${affinities.length}`}
          value="Affinity"
          rows={affinities.map((a) => ({
            key: a.id,
            name: a.name,
            id: a.id,
            // Its explainability: each signal's ID and its share of the affinity, the share never cut, or
            // in a demographics call each bucket and its score.
            notes: a.explainability.map((x) => (
              <span key={x.id} className="flex min-w-0 items-baseline gap-2">
                <span className="min-w-0">
                  <Code>{x.id}</Code>
                </span>
                <span className="shrink-0 type-caption">{demographics ? demographic(x.score) : raw(x.score)}</span>
              </span>
            )),
            figure: score(a.affinity)
          }))}
        />
      )}
      {!record.error && entities.length + tags.length + affinities.length === 0 && (
        <p className="text-muted-foreground">Qloo returned no results.</p>
      )}
      <StoredRecord key={record.call} record={record} />
    </>
  )
}

// Each parameter the gateway sends, in words; any other keeps its key.
const sentAs: Record<string, string> = {
  query: 'Search',
  types: 'Type',
  'filter.type': 'Type',
  'signal.interests.entities': 'Ranked against',
  'filter.results.entities': 'Candidates',
  'a.signal.interests.entities': 'Compared',
  'b.signal.interests.entities': 'With',
  'feature.explainability': 'Explainability',
  take: 'Results'
}

// What was sent, one parameter to a row, in words: an entity by its name, a type by its word.
function WhatWasSent({ record, names }: { record: Evidence; names: Names }) {
  const { params } = record
  const label = (key: string) =>
    key === 'signal.interests.entities' && kindOf(record) === 'demographics' ? 'For' : (sentAs[key] ?? key)
  const shown = (key: string, value: string | number | boolean) => {
    if (key === 'query') return `“${value}”`
    if (key === 'types' || key === 'filter.type') return upper(nounOf(value)[0])
    if (key === 'feature.explainability') return String(value) === 'true' ? 'On' : 'Off'
    if (key === 'take') return `Up to ${value}`
    if (!key.endsWith('entities')) return String(value)
    const ids = idsOf(value)
    // Candidates are the type the ranking filters to.
    const noun = key === 'filter.results.entities' ? nounOf(params['filter.type']) : nounOfIds(ids, names)
    return <EntityNames ids={ids} noun={noun} names={names} />
  }
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="font-semibold">What was sent</h3>
      <KeyValues>
        {Object.entries(params).map(([key, value]) => (
          <KeyValue key={key} label={label(key)}>
            {shown(key, value)}
          </KeyValue>
        ))}
      </KeyValues>
    </div>
  )
}

// An entity by its name, or, when no record in the log names it, its ID cut to a short code, whole
// in its tooltip.
function EntityName({ id, names }: { id: string; names: Names }) {
  const name = names.get(id)?.name
  if (name) return name
  return (
    <code className="font-mono text-xs" title={id} translate="no">
      {id.slice(0, 8)}
    </code>
  )
}

// A list of entities as a sentence lists them, or, longer than three, folded behind its count, such
// as "16 podcasts", one to a line.
function EntityNames({ ids, noun, names }: { ids: string[]; noun: Noun; names: Names }) {
  if (ids.length <= 3)
    return listParts(ids.map((id) => <EntityName id={id} names={names} />)).map((part, i) => (
      <Fragment key={i}>{part}</Fragment>
    ))
  return (
    <Fold summary={count(ids.length, ...noun)}>
      <ul className="flex flex-col">
        {ids.map((id, i) => (
          <li key={i}>
            <EntityName id={id} names={names} />
          </li>
        ))}
      </ul>
    </Fold>
  )
}

// A disclosure, closed, its summary underlined with a chevron, 44px tall on a phone.
function Fold({ summary, children, ...data }: { summary: string; children: ReactNode } & DataAttributes) {
  return (
    <details className="group/fold" {...data}>
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-sm underline decoration-muted-foreground decoration-1 underline-offset-4 hover:decoration-foreground max-md:min-h-11 [&::-webkit-details-marker]:hidden">
        {summary}
        <ChevronDownIcon
          aria-hidden="true"
          className="size-4 text-muted-foreground transition-transform group-open/fold:rotate-180"
        />
      </summary>
      {children}
    </details>
  )
}
type DataAttributes = { [attribute: `data-${string}`]: string | boolean | undefined }

// An error in words: each entity ID in it as the entity's name, dropping the ID the gateway writes
// after a name, as in "Deep Cuts (e-0002)".
function Named({ text, names }: { text: string; names: Names }) {
  let words = text
  for (const [id, { name }] of names) words = words.replaceAll(`${name} (${id})`, name)
  const ids = [...names.keys()]
    .filter((id) => words.includes(id))
    .map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`(${[...ids, UUID].join('|')})`, 'gi')
  return words.split(pattern).map((part, i) => (i % 2 ? <EntityName key={i} id={part} names={names} /> : part))
}
// A Qloo entity ID, which no record in the log may name.
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

// The record as the gateway stored it, closed until opened: its parameters and results with their IDs,
// URNs and every figure in full, as JSON, with a button that copies it. Stored, not Qloo's response,
// as the gateway keeps only these fields. Key it by the call, so a new one starts uncopied.
function StoredRecord({ record }: { record: Evidence }) {
  const json = JSON.stringify(record, null, 2)
  const { copied, copy } = useCopy(json)
  return (
    <Fold summary="Stored record" data-stored>
      <div className="mt-2 flex flex-col items-start gap-2">
        <Button variant="secondary" size="sm" onClick={() => void copy()}>
          {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        {/* The button's "Copied", told to screen readers too. */}
        <span role="status" className="vh">
          {copied ? 'Copied' : ''}
        </span>
        {copied === false && (
          <StateLine kind="error" role="alert">
            This browser didn’t let Crossfeed copy it. Select the record and copy it yourself.
          </StateLine>
        )}
        <ScrollTable label="Stored record" className="w-full">
          <pre className="font-mono text-xs">{json}</pre>
        </ScrollTable>
      </div>
    </Fold>
  )
}

type ValueRow = { key: string; name: string; id: string; notes: React.ReactNode; figure: string }

// What Qloo returned: the name, the Qloo ID and the figure, in its metric's format, which the chart
// shows as a rank and band. The record getEvidence answers keeps each figure as Qloo wrote it.
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
            <td className="py-1.5 pl-3 text-right type-caption break-all">{r.figure}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// The evidence on show: `openCall` opens a call's record, or closes it when it's already open.
// Only the latest click's answer lands, with the log it came in, whose records name the entities
// every record's IDs stand for (`names`).
export function useEvidence(agent: Session) {
  const [opened, setOpened] = useState<Opened | null>(null)
  const [log, setLog] = useState<Evidence[]>([])
  const names = useMemo(() => namesOf(log), [log])
  const latest = useRef<string | null>(null)
  const openCall = async (call: string) => {
    const closing = opened?.call === call
    latest.current = closing ? null : call
    if (closing) return setOpened(null)
    setOpened({ call, status: 'loading' })
    try {
      const log = await agent.stub.getEvidence()
      if (latest.current !== call) return
      setLog(log)
      setOpened({ call, status: 'loaded', record: log.find((e) => e.call === call) })
    } catch (err) {
      if (latest.current === call)
        setOpened({ call, status: 'failed', error: err instanceof Error ? err.message : String(err) })
    }
  }
  return { opened, openCall, names }
}
