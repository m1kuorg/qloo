import { useState, type ReactNode } from 'react'
import type { Show, SlowCall } from '../agent'
import type { PitchList, SharedTags } from '../fit'
import {
  workTypes,
  type Booking,
  type Inbox,
  type InboxSource,
  type PastGuest,
  type Pitch,
  type PitchReply,
  type Verdict,
  type WorkType
} from '../inbox'
import { MAX_PAST_GUESTS } from '../limits'
import { sameName } from '../resolve'
import { Alert, bandMeter, listOf, percentile, PickOne, useAction } from './controls'
import { CallButton, EvidencePanel, type Opened } from './Evidence'
import { Source } from './Source'
import { SlowCalls, StateLine } from './states'

type Actions = {
  loadInbox: (source: InboxSource) => Promise<unknown>
  confirmWork: (pitchId: string, entityId: string) => Promise<unknown>
  startPitches: (input: { show: string; pastGuests: Omit<PastGuest, 'match'>[] }) => Promise<unknown>
  editReply: (pitchId: string, draft: string) => Promise<unknown>
  approveReply: (pitchId: string) => Promise<unknown>
  discardReply: (pitchId: string) => Promise<unknown>
  openCall: (call: string) => void
  opened: Opened | null
}

type Page = {
  inbox: Inbox | null
  roster: Show[]
  booking: Booking | null
  ranking: boolean // a pitch run is running
  runLog: ReactNode // the latest run, when it's a pitch run
  slowCalls: SlowCall[] // Qloo calls still waiting past the slow mark
}

// The booker's inbox page, shown only while GUEST_PITCHES is on: load pitches, see what Claude read
// from each and how Qloo matched its work, confirm ambiguous matches, and rank the pitched works
// against a roster show and its past guests, then clear the inbox reply by reply.
export function InboxPage({ inbox, roster, booking, ranking, runLog, slowCalls, ...actions }: Page & Actions) {
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
              <SlowCalls calls={slowCalls} />
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
          {inbox && (
            <PitchSetup
              key={inbox.id}
              inbox={inbox}
              roster={roster}
              booking={booking}
              ranking={ranking}
              startPitches={actions.startPitches}
            />
          )}
          {booking?.lists && (
            <PitchLists
              booking={booking}
              lists={booking.lists}
              pitches={inbox?.pitches ?? []}
              select={setSelected}
              openCall={actions.openCall}
              opened={actions.opened?.call ?? null}
            />
          )}
          {booking?.replies && (
            <Replies
              show={booking.show.name}
              replies={booking.replies}
              pitches={inbox?.pitches ?? []}
              locked={ranking}
              actions={actions}
              opened={actions.opened?.call ?? null}
            />
          )}
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
          {runLog}
          {pitch && (
            <PitchDetail
              key={pitch.id}
              pitch={pitch}
              confirmWork={actions.confirmWork}
              close={() => setSelected(null)}
            />
          )}
          {booking && <Anchors booking={booking} openCall={actions.openCall} opened={actions.opened?.call ?? null} />}
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

// One past guest as the booker types them: the year stays text until the run starts.
type GuestRow = { guest: string; title: string; type: WorkType; year: string }

const rowsOf = (guests: Omit<PastGuest, 'match'>[]): GuestRow[] =>
  guests.map(({ guest, work }) => ({ guest, title: work.title, type: work.type, year: work.year?.toString() ?? '' }))

// The show the pitches are for and its best past guests' works, which anchor the rankings with it.
// The sample inbox comes with its show's past guests filled in; otherwise the last run's are kept.
function PitchSetup({
  inbox,
  roster,
  booking,
  ranking,
  startPitches
}: Pick<Page, 'roster' | 'booking' | 'ranking'> & { inbox: Inbox; startPitches: Actions['startPitches'] }) {
  const shows = roster.filter((s) => s.entity && (s.resolution === 'resolved' || s.resolution === 'mapped'))
  const suggested = inbox.show ? shows.find((s) => sameName(s.name, inbox.show!.name))?.name : undefined
  // The sample's show while its Qloo lookup is still out: a fresh session's roster can still be resolving
  // when the sample inbox loads, and a run started now would go to another show.
  const awaited = inbox.show
    ? roster.find((s) => s.resolution === 'pending' && sameName(s.name, inbox.show!.name))?.name
    : undefined
  // The booker's own pick, seeded with the last run's show. Until they pick, the default follows the
  // roster as it resolves, so it's never fixed before the sample's show is matched.
  const [show, setShow] = useState<string | null>(booking?.show.name ?? null)
  const [rows, setRows] = useState<GuestRow[]>(() =>
    booking
      ? rowsOf(booking.pastGuests)
      : inbox.show
        ? rowsOf(inbox.show.pastGuests)
        : [{ guest: '', title: '', type: 'book', year: '' }]
  )
  const [invalid, setInvalid] = useState<string | null>(null)
  const { busy, error, run } = useAction()
  const chosen = show !== null && shows.some((s) => s.name === show) ? show : (suggested ?? shows[0]?.name ?? '')
  const edit = (i: number, change: Partial<GuestRow>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...change } : r)))
  const locked = busy || ranking || inbox.status === 'reading'
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const year = rows.findIndex((r) => r.year.trim() && !/^\d{4}$/.test(r.year.trim()))
    if (year >= 0) return setInvalid(`Past guest ${year + 1}'s year must be four digits, such as 2024, or left empty.`)
    setInvalid(null)
    const pastGuests = rows.map((r) => ({
      guest: r.guest,
      work: { title: r.title, type: r.type, year: r.year.trim() ? Number(r.year) : null }
    }))
    void run(() => startPitches({ show: chosen, pastGuests }))
  }
  return (
    <section className="sec" aria-labelledby="setup-h">
      <div className="mh">
        <h2 className="lbl" id="setup-h">
          Rank against a show
        </h2>
      </div>
      <p className="help sec-help">
        Pick the roster show the pitches are for, and name its best past guests&apos; public works. Each type of pitched
        work is ranked against the show and those works in its own Qloo call. Only titles and types reach Qloo.
      </p>
      {shows.length === 0 ? (
        <p className="empty">
          No roster show is matched in Qloo yet. <a href="/">Import the roster</a> first: the pitches are ranked against
          one of its shows.
        </p>
      ) : (
        <form className="setup" onSubmit={submit}>
          <label className="field show-pick">
            <span className="lbl">Show</span>
            <select value={chosen} onChange={(e) => setShow(e.target.value)} disabled={locked}>
              {shows.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend className="lbl">Past guests&apos; public works</legend>
            <div className="pg pg-head" aria-hidden="true">
              <span>Guest</span>
              <span>Work title</span>
              <span>Type</span>
              <span>Year</span>
              <span />
            </div>
            {rows.map((r, i) => (
              <div className="pg" key={i}>
                <span className="in">
                  <input
                    aria-label={`Past guest ${i + 1}`}
                    value={r.guest}
                    onChange={(e) => edit(i, { guest: e.target.value })}
                    disabled={locked}
                  />
                </span>
                <span className="in">
                  <input
                    aria-label={`Past guest ${i + 1}'s work title`}
                    value={r.title}
                    onChange={(e) => edit(i, { title: e.target.value })}
                    disabled={locked}
                  />
                </span>
                <select
                  aria-label={`Past guest ${i + 1}'s work type`}
                  value={r.type}
                  onChange={(e) => edit(i, { type: e.target.value as WorkType })}
                  disabled={locked}
                >
                  {workTypes.map((t) => (
                    <option key={t} value={t}>
                      {typeLabel[t]}
                    </option>
                  ))}
                </select>
                <span className="in">
                  <input
                    aria-label={`Past guest ${i + 1}'s work year`}
                    inputMode="numeric"
                    value={r.year}
                    onChange={(e) => edit(i, { year: e.target.value })}
                    disabled={locked}
                  />
                </span>
                <button
                  type="button"
                  className="lnk"
                  onClick={() => setRows(rows.filter((_, j) => j !== i))}
                  disabled={locked}
                >
                  Remove
                </button>
              </div>
            ))}
            {rows.length < MAX_PAST_GUESTS && (
              <button
                type="button"
                className="lnk"
                onClick={() => setRows([...rows, { guest: '', title: '', type: 'book', year: '' }])}
                disabled={locked}
              >
                Add a past guest
              </button>
            )}
          </fieldset>
          <div className="acts">
            <button className="btn pri" type="submit" disabled={locked || !chosen || Boolean(awaited)}>
              Rank pitches
            </button>
            <small>
              {ranking
                ? 'Ranking the pitches…'
                : awaited
                  ? `Waiting for ${awaited}'s Qloo lookup…`
                  : inbox.show
                    ? "Filled in from the sample show's episode feed."
                    : 'A new run: earlier runs stay in Runs.'}
            </small>
          </div>
          <Alert error={invalid ?? error} />
        </form>
      )}
    </section>
  )
}

const typePlural: Record<WorkType, string> = { book: 'Books', film: 'Films', tv_show: 'TV shows', podcast: 'Podcasts' }

// The pitched works ranked against the show, one list per work type, by position and band. Raw
// scores stay in each ranking call's evidence, and lists from separate calls aren't compared.
function PitchLists({
  booking,
  lists,
  pitches,
  select,
  openCall,
  opened
}: {
  booking: Booking
  lists: PitchList[]
  pitches: Pitch[]
  select: (id: string) => void
  openCall: (call: string) => void
  opened: string | null
}) {
  const setAside = pitches.filter((p) => p.status === 'no_work' || p.status === 'unreadable' || p.status === 'failed')
  return (
    <section className="sec fit" aria-labelledby="lists-h">
      <div className="mh">
        <h2 className="lbl" id="lists-h">
          Pitches for {booking.show.name}
        </h2>
        <Source of="qloo" />
      </div>
      <p className="help sec-help">
        One list per type of work, each from its own Qloo call, so a rank in one list can&apos;t be compared with a rank
        in another. Bands are thirds of their own list.
        {setAside.length > 0 && ` ${setAside.length} set-aside pitches were never sent to Qloo.`}
      </p>
      {lists.map((list) => (
        <RankedPitches
          key={list.type}
          list={list}
          pitches={pitches}
          select={select}
          openCall={openCall}
          opened={opened}
        />
      ))}
    </section>
  )
}

function RankedPitches({
  list,
  pitches,
  select,
  openCall,
  opened
}: {
  list: PitchList
  pitches: Pitch[]
  select: (id: string) => void
  openCall: (call: string) => void
  opened: string | null
}) {
  const id = `list-${list.type}`
  const pitch = (id: string) => pitches.find((p) => p.id === id)
  const names = listOf(list.anchors.map((a) => a.name))
  const noun = typeLabel[list.type].toLowerCase()
  const against =
    list.path === 'same_type'
      ? `Ranked against the past guests' ${noun}s alone: ${names}. Qloo scored no ${noun} against the show and every past guest (${list.calls[0]}).`
      : list.path === 'show'
        ? `Ranked against ${names}.`
        : null
  return (
    <div className="plist" role="group" aria-labelledby={id}>
      <div className="mh">
        <h3 className="lbl" id={id}>
          {typePlural[list.type]} · {list.rows.length} ranked
        </h3>
        <span className="chips">
          {list.calls.map((call) => (
            <CallButton
              key={call}
              call={call}
              label={`Evidence for the ${noun} ranking`}
              opened={opened}
              openCall={openCall}
            />
          ))}
        </span>
      </div>
      {against && <p className="help">{against}</p>}
      {list.error ? (
        <StateLine kind="failed" role="alert">
          Not ranked: {list.error}.
        </StateLine>
      ) : (
        <table className="chart fit-chart" aria-labelledby={id}>
          <colgroup>
            <col className="c-pos" />
            <col />
            <col className="c-band" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">
                Rank<small>in this list</small>
              </th>
              <th scope="col">
                Public work<small>Qloo match · guest</small>
              </th>
              <th scope="col">
                Fit band<small>confidence</small>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.rows.map((r) => {
              const { bars, word } = bandMeter[r.band]
              const p = pitch(r.pitch)
              return (
                <tr key={r.pitch}>
                  <td className="pos">{r.rank}</td>
                  <td>
                    <button type="button" className="row-open" onClick={() => select(r.pitch)}>
                      <span className="nm">{r.entity.name}</span>
                    </button>
                    {p?.guest && <div className="tg">{p.guest}</div>}
                    {r.sharedTags && (
                      <TagLine
                        tags={r.sharedTags}
                        label={`Evidence for the tags ${r.entity.name} shares`}
                        openCall={openCall}
                        opened={opened}
                      />
                    )}
                  </td>
                  <td>
                    <span className={`band b${bars}`}>
                      <i aria-hidden="true" />
                      <i aria-hidden="true" />
                      <i aria-hidden="true" />
                      {word}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {list.notScored.length > 0 && (
        <table className="ev not-scored">
          <caption>Not scored · {list.notScored.length}</caption>
          <thead>
            <tr>
              <th scope="col">Pitch</th>
              <th scope="col">Reason</th>
            </tr>
          </thead>
          <tbody>
            {list.notScored.map((n) => {
              const p = pitch(n.pitch)
              return (
                <tr key={n.pitch}>
                  <td>{p?.work?.title ?? n.pitch}</td>
                  <td>{n.reason}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

// A work's tags in common with the show, as words, with the compare that returned them.
function TagLine({
  tags,
  label,
  openCall,
  opened
}: {
  tags: SharedTags
  label: string
  openCall: (call: string) => void
  opened: string | null
}) {
  return (
    <div className="tg">
      {tags.error
        ? `Shared tags failed: ${tags.error}`
        : tags.tags.length > 0
          ? tags.tags.join('\u00a0· ') // a separator never starts a line
          : 'No distinctive shared tags'}{' '}
      <CallButton call={tags.call} label={label} opened={opened} openCall={openCall} />
    </div>
  )
}

const verdictLabel: Record<Verdict, string> = { book: 'Book', later: 'Later', decline: 'Decline' }
const verdicts: Verdict[] = ['book', 'later', 'decline']

// The drafted replies, one per pitch, grouped by the agent's verdict. The booker approves, edits, or
// discards each one on its own, and only an approved reply can be copied, to send from their own email.
function Replies({
  show,
  replies,
  pitches,
  locked,
  actions,
  opened
}: {
  show: string
  replies: PitchReply[]
  pitches: Pitch[]
  locked: boolean // the run is still drafting
  actions: Pick<Actions, 'editReply' | 'approveReply' | 'discardReply' | 'openCall'>
  opened: string | null
}) {
  const kept = replies.filter((r) => r.status !== 'discarded')
  const approved = kept.filter((r) => r.status === 'approved').length
  return (
    <section className="sec" aria-labelledby="replies-h">
      <div className="mh">
        <h2 className="lbl" id="replies-h">
          Replies · {approved} of {kept.length} approved
        </h2>
        <Source of="agent" />
      </div>
      <p className="help sec-help">
        Claude drafted a reply to each pitch with a verdict, and an episode angle for each top pitch from the tags its
        work shares with {show} in Qloo. Approve, edit, or discard each one. Only an approved reply can be copied, to
        send from your own email.{locked && ' Claude is still drafting: approve once the run has ended.'}
      </p>
      {verdicts.map((v) => {
        const group = replies.filter((r) => r.verdict === v)
        if (group.length === 0) return null
        return (
          <div className="replies" role="group" aria-labelledby={`replies-${v}`} key={v}>
            <h3 className="lbl" id={`replies-${v}`}>
              {verdictLabel[v]} · {group.length}
            </h3>
            <ol>
              {group.map((r) => (
                <ReplyItem
                  key={r.pitch}
                  reply={r}
                  pitch={pitches.find((p) => p.id === r.pitch)}
                  show={show}
                  locked={locked}
                  actions={actions}
                  opened={opened}
                />
              ))}
            </ol>
          </div>
        )
      })}
    </section>
  )
}

function ReplyItem({
  reply,
  pitch,
  show,
  locked,
  actions,
  opened
}: {
  reply: PitchReply
  pitch: Pitch | undefined
  show: string
  locked: boolean
  actions: Pick<Actions, 'editReply' | 'approveReply' | 'discardReply' | 'openCall'>
  opened: string | null
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null) // the text last copied
  const { busy, error, run } = useAction()
  const name = pitch?.work?.title ?? (pitch ? title(pitch) : reply.pitch)
  const head = (
    <div className="reply-hd">
      <span>
        <span className="nm">{name}</span>
        {pitch?.guest && <span className="tg"> · {pitch.guest}</span>}
      </span>
      <span className="chip" data-state={reply.status}>
        {reply.status === 'approved' ? 'Approved' : reply.status === 'discarded' ? 'Discarded' : 'Draft'}
      </span>
    </div>
  )
  if (reply.status === 'discarded')
    return (
      <li className="reply" data-pitch={reply.pitch} data-status="discarded">
        {head}
        <div className="acts">
          <button
            type="button"
            className="lnk"
            disabled={busy || locked}
            onClick={() => void run(() => actions.editReply(reply.pitch, reply.draft))}
          >
            Restore
          </button>
        </div>
        <Alert error={error} />
      </li>
    )
  const approved = reply.status === 'approved'
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (await run(() => actions.editReply(reply.pitch, editing!))) setEditing(null)
  }
  const copy = () =>
    void run(async () => {
      await navigator.clipboard.writeText(reply.draft)
      setCopied(reply.draft)
    })
  return (
    <li className="reply" data-pitch={reply.pitch} data-status={reply.status}>
      {head}
      {pitch?.from && <p className="tg">To {pitch.from}</p>}
      {reply.angle && (
        <p className="angle">
          <span className="lbl">Episode angle</span> {reply.angle}
        </p>
      )}
      {reply.sharedTags && (
        <div className="angle-tags">
          <span className="tg">Shares with {show}:</span> <Source of="qloo" />{' '}
          <TagLine
            tags={reply.sharedTags}
            label={`Evidence for the tags ${name} shares`}
            openCall={actions.openCall}
            opened={opened}
          />
        </div>
      )}
      {editing === null ? (
        <>
          <p className="draft">{reply.draft}</p>
          <div className="acts">
            {!approved && (
              <button
                type="button"
                className="btn pri"
                disabled={busy || locked}
                onClick={() => void run(() => actions.approveReply(reply.pitch))}
              >
                Approve
              </button>
            )}
            <button type="button" className="btn" disabled={!approved || busy} onClick={copy}>
              {approved && copied === reply.draft ? 'Copied' : 'Copy'}
            </button>
            <button type="button" className="btn" disabled={busy || locked} onClick={() => setEditing(reply.draft)}>
              Edit
            </button>
            <button
              type="button"
              className="lnk"
              disabled={busy || locked}
              onClick={() => void run(() => actions.discardReply(reply.pitch))}
            >
              Discard
            </button>
            <small>{approved ? 'Copy it into your own email to send.' : 'Copy unlocks once you approve.'}</small>
          </div>
        </>
      ) : (
        <form className="reply-edit" onSubmit={save}>
          <label className="lbl" htmlFor={`reply-${reply.pitch}`}>
            Reply about {name}
          </label>
          <textarea
            id={`reply-${reply.pitch}`}
            rows={5}
            value={editing}
            onChange={(e) => setEditing(e.target.value)}
            disabled={busy}
          />
          <div className="acts">
            <button className="btn pri" type="submit" disabled={busy || !editing.trim()}>
              Save
            </button>
            <button className="btn" type="button" disabled={busy} onClick={() => setEditing(null)}>
              Cancel
            </button>
            <small>{approved ? 'Saving returns it to draft, to approve again.' : 'Saved as a draft.'}</small>
          </div>
        </form>
      )}
      <Alert error={error} />
    </li>
  )
}

const pastMatch = { resolved: 'Matched', ambiguous: 'Ambiguous', missed: 'Not in Qloo', failed: 'Lookup failed' }

// What the latest pitch run ranked against: the show, and how each past guest's work resolved.
function Anchors({
  booking,
  openCall,
  opened
}: {
  booking: Booking
  openCall: (call: string) => void
  opened: string | null
}) {
  return (
    <section className="mod" aria-labelledby="anchors-h">
      <div className="mh">
        <span className="lbl" id="anchors-h">
          Ranked against
        </span>
        <Source of="qloo" />
      </div>
      <dl className="rec kv">
        <div className="rec-row">
          <dt>Show</dt>
          <dd>{booking.show.entity.name}</dd>
        </div>
        {booking.pastGuests.map((g, i) => (
          <div className="rec-row" key={i}>
            <dt>{g.guest}</dt>
            <dd>
              {g.work.title} <span className="tg">· {g.match ? pastMatch[g.match.resolution] : 'Looking up…'}</span>{' '}
              {g.match && (
                <CallButton
                  call={g.match.evidence}
                  label={`Evidence for ${g.work.title}`}
                  opened={opened}
                  openCall={openCall}
                />
              )}
            </dd>
          </div>
        ))}
      </dl>
      {booking.pastGuests.some((g) => g.match && g.match.resolution !== 'resolved') && (
        <p className="help">
          A past guest&apos;s work that didn&apos;t match isn&apos;t an anchor. Edit it and rank again.
        </p>
      )}
    </section>
  )
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
                <CallButton
                  call={p.match.evidence}
                  label={`Evidence for ${p.work?.title ?? p.id}`}
                  opened={opened}
                  openCall={openCall}
                />
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
