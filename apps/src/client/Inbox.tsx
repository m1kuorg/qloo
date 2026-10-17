import { useState } from 'react'
import type { Inbox, InboxSource, Pitch, WorkType } from '../inbox'
import { Alert, percentile, PickOne, useAction } from './controls'
import { EvidencePanel, type Opened } from './Evidence'
import { Source } from './Source'

type Actions = {
  loadInbox: (source: InboxSource) => Promise<unknown>
  confirmWork: (pitchId: string, entityId: string) => Promise<unknown>
  openCall: (call: string) => void
  opened: Opened | null
}

// The booker's inbox page, shown only while GUEST_PITCHES is on: load pitches, see what Claude read
// from each and how Qloo matched its work, and confirm ambiguous matches.
export function InboxPage({ inbox, ...actions }: { inbox: Inbox | null } & Actions) {
  const [selected, setSelected] = useState<string | null>(null)
  const pitch = inbox?.pitches.find((p) => p.id === selected)
  const reading = inbox?.status === 'reading'
  const done = inbox?.pitches.filter((p) => p.status !== 'reading' && p.status !== 'looking_up').length ?? 0
  return (
    <>
      <section className="hd" aria-label="Inbox">
        <div className="hd-row">
          <div>
            <h1>
              <span>Inbox ·</span> {inbox ? (inbox.sample ? 'Sample inbox' : 'Pasted pitches') : 'None yet'}
            </h1>
            <p className="sub-line">
              Claude reads each pitch for its guest and public work. Only the work's title and type are looked up in
              Qloo; names, addresses, and pitch text never are.
            </p>
          </div>
          {inbox && (
            <div className="status" role="status">
              <b>{reading ? 'Reading' : 'Read'}</b>
              <p>{reading ? `${done} of ${inbox.pitches.length} pitches read` : `${inbox.pitches.length} pitches`}</p>
            </div>
          )}
        </div>
        {inbox?.sample && (
          <p className="help notice">
            <span className="chip">Sample data</span> {inbox.notice}
          </p>
        )}
      </section>
      <main className="main">
        <section className="chart-col" aria-label="Pitches">
          <InboxLoad loadInbox={actions.loadInbox} reading={reading} />
          <PitchTable
            pitches={inbox?.pitches ?? []}
            selected={pitch?.id ?? null}
            select={setSelected}
            openCall={actions.openCall}
            opened={actions.opened?.call ?? null}
          />
        </section>
        <aside className="rail" aria-label="Details">
          {pitch && (
            <PitchDetail
              key={pitch.id}
              pitch={pitch}
              confirmWork={actions.confirmWork}
              close={() => setSelected(null)}
            />
          )}
          <InboxCheck pitches={inbox?.pitches ?? []} />
          <EvidencePanel opened={actions.opened} />
        </aside>
      </main>
    </>
  )
}

function InboxLoad({ loadInbox, reading }: { loadInbox: Actions['loadInbox']; reading: boolean }) {
  const [text, setText] = useState('')
  const { busy, error, run } = useAction()
  const locked = busy || reading
  const paste = async (e: React.FormEvent) => {
    e.preventDefault()
    if (await run(() => loadInbox({ text }))) setText('')
  }
  return (
    <form className="import" onSubmit={paste}>
      <label className="lbl" htmlFor="pitches">
        Pitches
      </label>
      <textarea
        id="pitches"
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'Paste one or more pitch emails.\n---\nPut a line of three dashes between pitches.'}
        disabled={locked}
      />
      <div className="acts">
        <button className="btn pri" type="submit" disabled={locked || !text.trim()}>
          Read pitches
        </button>
        <button
          className="btn"
          type="button"
          disabled={locked}
          onClick={() => void run(() => loadInbox({ sample: true }))}
        >
          Load sample inbox
        </button>
        <small>{reading ? 'Reading the inbox…' : 'Replaces the current inbox, up to 50 pitches.'}</small>
      </div>
      <Alert error={error} />
    </form>
  )
}

export const typeLabel: Record<WorkType, string> = {
  book: 'Book',
  film: 'Film',
  tv_show: 'TV show',
  podcast: 'Podcast'
}

// A pitch's state in one word: still being read, its work's match, or why it was set aside.
const stateLabel = (p: Pitch) =>
  ({
    reading: 'Reading',
    looking_up: 'Looking up',
    no_work: 'Set aside',
    unreadable: 'Unreadable',
    failed: 'Failed',
    read: p.match ? matchLabel[p.match.resolution] : 'Looking up'
  })[p.status]

const matchLabel = { resolved: 'Matched', ambiguous: 'Ambiguous', missed: 'Not in Qloo', failed: 'Lookup failed' }

// A pitch's subject, or the first line of a pasted one.
const title = (p: Pitch) => p.subject ?? p.body.split('\n').find((l) => l.trim()) ?? p.id

function PitchTable({
  pitches,
  selected,
  select,
  openCall,
  opened
}: {
  pitches: Pitch[]
  selected: string | null
  select: (id: string) => void
  openCall: (call: string) => void
  opened: string | null
}) {
  if (pitches.length === 0)
    return <p className="empty">No pitches yet. Load the sample inbox, or paste pitches above.</p>
  return (
    <table className="chart pitches">
      <caption>
        <Source of="agent" /> Guest and work as Claude read them from each pitch. <Source of="qloo" /> Matches from Qloo
        search, one call per work. Select a pitch to read it or confirm its match.
      </caption>
      <colgroup>
        <col style={{ width: '27%' }} />
        <col style={{ width: '17%' }} />
        <col style={{ width: '22%' }} />
        <col />
        <col style={{ width: 64 }} />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">Pitch</th>
          <th scope="col">Guest</th>
          <th scope="col">
            Public work<small>type · year</small>
          </th>
          <th scope="col">
            Qloo match<small>popularity percentile</small>
          </th>
          <th scope="col" className="r">
            Call
          </th>
        </tr>
      </thead>
      <tbody>
        {pitches.map((p) => (
          <tr
            key={p.id}
            data-status={p.status}
            className={p.match && p.match.evidence === opened ? 'on' : undefined}
            data-selected={p.id === selected || undefined}
          >
            <td>
              <button
                type="button"
                className="row-open"
                aria-current={p.id === selected || undefined}
                onClick={() => select(p.id)}
              >
                <span className="nm">{title(p)}</span>
              </button>
              {p.from && (
                <div className="tg desc" title={p.from}>
                  {p.from}
                </div>
              )}
            </td>
            <td>{p.guest ?? '–'}</td>
            <td>
              <WorkCell pitch={p} />
            </td>
            <td>
              <MatchCell pitch={p} settle={() => select(p.id)} />
            </td>
            <td className="r">
              {p.match && (
                <button
                  type="button"
                  className="call"
                  aria-pressed={p.match.evidence === opened}
                  aria-controls="evidence"
                  aria-label={`Evidence for ${p.work?.title ?? p.id}: call ${p.match.evidence}`}
                  onClick={() => openCall(p.match!.evidence)}
                >
                  {p.match.evidence}
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function WorkCell({ pitch: { work, status } }: { pitch: Pitch }) {
  if (status === 'reading') return <span className="tg">Reading…</span>
  if (!work) return <span className="tg">–</span>
  return (
    <>
      <span className="wk">{work.title}</span>
      <div className="tg">
        {typeLabel[work.type]}
        {work.year !== null && ` · ${work.year}`}
      </div>
    </>
  )
}

function MatchCell({ pitch: p, settle }: { pitch: Pitch; settle: () => void }) {
  const chip = <span className="chip">{stateLabel(p)}</span>
  const why = (text: string) => (
    <>
      {chip} <span className="tg">{text}</span>
    </>
  )
  if (p.status === 'no_work') return why('No public work: never sent to Qloo.')
  if (p.status === 'unreadable' || p.status === 'failed') return why(p.error ?? '')
  const match = p.match
  if (!match) return chip
  if (match.resolution === 'resolved' && match.entity)
    return (
      <span className="ent">
        {match.entity.name}
        {match.entity.disambiguation && <span className="tg"> ({match.entity.disambiguation})</span>}{' '}
        <span className="pop">{percentile(match.entity.popularity)}</span>
      </span>
    )
  if (match.resolution === 'ambiguous')
    return (
      <>
        {chip}{' '}
        <button type="button" className="lnk" onClick={settle}>
          Confirm the match
        </button>
        <span className="tg"> · {match.candidates.length} with this title</span>
      </>
    )
  if (match.resolution === 'failed') return why(match.error ?? '')
  const work = p.work
  // A book is matched by its author, other works by year (resolve.ts), so a miss says which.
  const by = !work ? '' : work.type === 'book' ? ' by this guest' : work.year ? ` from ${work.year}` : ''
  return why(`No ${work ? typeLabel[work.type].toLowerCase() : 'work'} with this title${by} in Qloo.`)
}

// The selected pitch: its text, what Claude read from it, and its work's candidates to confirm.
function PitchDetail({
  pitch: p,
  confirmWork,
  close
}: {
  pitch: Pitch
  confirmWork: Actions['confirmWork']
  close: () => void
}) {
  const { busy, error, run } = useAction()
  const match = p.match
  return (
    <section className="mod ed" aria-labelledby="pitch-ed">
      <div className="mh">
        <span className="lbl" id="pitch-ed">
          Pitch
        </span>
        <span className="chips">
          <span className="chip">{stateLabel(p)}</span>
          <button type="button" className="lnk" onClick={close}>
            Close
          </button>
        </span>
      </div>
      <p className="q">{title(p)}</p>
      {p.from && <p className="help">From {p.from}</p>}
      <dl className="rec kv">
        <div className="rec-row">
          <dt>Guest</dt>
          <dd>{p.guest ?? '–'}</dd>
        </div>
        <div className="rec-row">
          <dt>Public work</dt>
          <dd>
            {p.work ? `${p.work.title} · ${typeLabel[p.work.type]}${p.work.year ? ` · ${p.work.year}` : ''}` : '–'}
          </dd>
        </div>
        <div className="rec-row">
          <dt>Read by</dt>
          <dd>
            <Source of="agent" />
          </dd>
        </div>
      </dl>
      {match && match.candidates.length > 0 && p.work && (
        <PickOne
          legend={`Which Qloo ${typeLabel[p.work.type].toLowerCase()} is ${p.work.title}?`}
          options={match.candidates}
          current={match.resolution === 'resolved' ? match.entity?.id : undefined}
          note={`Same-title results from Qloo search ${match.evidence}`}
          submit="Use this match"
          busy={busy}
          pick={(id) => run(() => confirmWork(p.id, id))}
        />
      )}
      <Alert error={error} />
      <div className="letter" tabIndex={0} aria-label="Pitch text">
        {p.body}
      </div>
    </section>
  )
}

function InboxCheck({ pitches }: { pitches: Pitch[] }) {
  const count = (label: string) => pitches.filter((p) => stateLabel(p) === label).length
  const rows = ['Matched', 'Ambiguous', 'Not in Qloo', 'Lookup failed', 'Set aside', 'Unreadable', 'Failed']
  const pending = count('Reading') + count('Looking up')
  return (
    <section className="mod" aria-labelledby="inbox-check">
      <div className="mh">
        <span className="lbl" id="inbox-check">
          Inbox check
        </span>
        {pending > 0 && <span className="chip">{pending} still reading</span>}
      </div>
      <p className="help">
        Matched works are the ones that can be ranked against the show. Ambiguous works wait for you to confirm a match.
        Set-aside and unreadable pitches never reach Qloo.
      </p>
      <dl className="rec">
        {rows.map((label) => (
          <div key={label} className="rec-row">
            <dt>{label === 'Set aside' ? 'Set aside: no public work' : label}</dt>
            <dd>{count(label)}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
