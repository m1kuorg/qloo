import { useState } from 'react'
import type { Budget, Show } from '../agent'
import { NO_ANGLE, type SharedTags } from '../fit'
import { MAX_ANGLE } from '../text'
import {
  angleOptional,
  dollars,
  priceLines,
  type InsertionOrder,
  type LineInput,
  type OrderLine,
  type Priced
} from '../order'
import { Alert, day, useAction } from './controls'
import { Source } from './Source'

// The rail's insertion order: the run's plan priced as the inventory it spends. The agent drafts
// the slots and angles and code prices them; only the programmer edits, approves, and exports.
export function InsertionOrderPanel({
  order,
  roster,
  cpm,
  sampleCpm,
  budget,
  actions,
  readOnly,
  exportHref,
  sharedTags,
  openCall,
  opened
}: {
  order: InsertionOrder
  roster: Show[] // for the live totals while editing, and the sample labels
  cpm: number | null
  sampleCpm: boolean // the CPM is still the sample network's
  budget: Budget | null
  actions: { edit: (lines: LineInput[]) => Promise<void>; approve: () => Promise<void> } | null
  readOnly: string | null // why there are no actions, such as an earlier run being viewed
  exportHref: string | null // where an approved order's CSV downloads, if it has an export here
  sharedTags: Record<string, SharedTags> // by show, the compare its angle draws on, or that returned no tags
  openCall: (call: string) => void
  opened: string | null
}) {
  const cites: Record<string, string> = Object.fromEntries(
    Object.entries(sharedTags).map(([show, shared]) => [show, shared.call])
  )
  const [editing, setEditing] = useState(false)
  const { busy, error, run } = useAction()
  const approved = order.status === 'approved'
  const sample = (line: OrderLine) =>
    sampleCpm || !!roster.find((s) => s.name === line.show)?.sample?.includes('downloads')
  return (
    <section className="mod io-mod" aria-labelledby="io-h">
      <div className="mh">
        <span className="lbl" id="io-h">
          {approved ? 'Insertion order' : 'Insertion order draft'} · {order.id}
        </span>
        <span className="chip">{approved ? 'Approved' : 'Draft'}</span>
      </div>
      <p className="help">
        <Source of="agent" /> drafted the slots and angles. Code prices each slot at downloads per episode × CPM ÷
        1,000.
      </p>
      {editing && actions ? (
        <EditLines
          order={order}
          roster={roster}
          cpm={cpm}
          budget={budget}
          sample={sample}
          sharedTags={sharedTags}
          save={async (lines) => {
            if (await run(() => actions.edit(lines))) setEditing(false)
          }}
          cancel={() => setEditing(false)}
          busy={busy}
        />
      ) : (
        <>
          <table className="io">
            <thead>
              <tr>
                <th scope="col">Show · angle</th>
                <th scope="col">Slots</th>
                <th scope="col">Value</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line) => (
                <tr key={line.show}>
                  <td>
                    <div className="nm">{line.show}</div>
                    <div className="tg angle">
                      {line.angle ?? NO_ANGLE}
                      {cites[line.show] && (
                        <>
                          {' '}
                          <button
                            type="button"
                            className="call"
                            aria-pressed={cites[line.show] === opened}
                            aria-controls="evidence"
                            aria-label={`Evidence for the tags ${line.show} shares: call ${cites[line.show]}`}
                            onClick={() => openCall(cites[line.show])}
                          >
                            {cites[line.show]}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                  <td>{line.slots}</td>
                  <td>
                    <Value line={line} sample={sample(line)} />
                  </td>
                </tr>
              ))}
            </tbody>
            <Totals priced={order} sample={order.lines.some(sample)} />
          </table>
          <Checks priced={order} budget={budget} />
          {approved && order.approvedBy && order.approvedAt && (
            <p className="help io-note">
              Approved by {order.approvedBy} on {day(order.approvedAt)} at{' '}
              {new Date(order.approvedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
            </p>
          )}
          {actions ? (
            <div className="acts">
              {approved ? (
                exportHref && (
                  <a className="btn" href={exportHref} download>
                    Export CSV
                  </a>
                )
              ) : (
                <button className="btn pri" type="button" disabled={busy} onClick={() => void run(actions.approve)}>
                  Approve
                </button>
              )}
              <button className="btn" type="button" disabled={busy} onClick={() => setEditing(true)}>
                Edit lines
              </button>
              <small>{approved ? 'Editing returns it to draft.' : 'Nothing is final until you approve it.'}</small>
            </div>
          ) : (
            <div className="acts">
              {approved && exportHref && (
                <a className="btn" href={exportHref} download>
                  Export CSV
                </a>
              )}
              {readOnly && <small>{readOnly}</small>}
            </div>
          )}
        </>
      )}
      <Alert error={error} />
    </section>
  )
}

// A line's value, or the figure it's missing, with its slot value underneath.
function Value({ line, sample }: { line: Pick<OrderLine, 'value' | 'slotValue' | 'gap'>; sample: boolean }) {
  if (line.value === null || line.slotValue === null) return <span className="tg gap">{line.gap ?? '–'}</span>
  return (
    <>
      {dollars(line.value)}
      <small>{dollars(line.slotValue)} a slot</small>
      {sample && <small className="smp">sample</small>}
    </>
  )
}

function Totals({ priced, sample }: { priced: Priced; sample: boolean }) {
  return (
    <tfoot>
      <tr className="tot">
        <th scope="row">Total</th>
        <td>{priced.slots}</td>
        <td>
          {dollars(priced.total)}
          {!priced.complete && <small>incomplete</small>}
          {priced.complete && sample && <small className="smp">sample figures</small>}
        </td>
      </tr>
    </tfoot>
  )
}

// The order against the run's budget, and what an incomplete total is missing.
function Checks({ priced, budget }: { priced: Priced; budget: Budget | null }) {
  const gaps = priced.lines.filter((l) => l.gap)
  const over = !budget
    ? null
    : 'slots' in budget
      ? priced.slots > budget.slots && `${priced.slots - budget.slots} slots over the ${budget.slots}-slot budget.`
      : priced.total > budget.dollars &&
        `${dollars(priced.total - budget.dollars)} over the ${dollars(budget.dollars)} budget${priced.complete ? '' : ', before the shows without a value'}.`
  const left =
    budget && !over && ('slots' in budget ? `${budget.slots - priced.slots} of ${budget.slots} slots left.` : null)
  return (
    <>
      {over ? <p className="io-note">{over}</p> : left && <p className="help io-note">Budget: {left}</p>}
      {gaps.length > 0 && (
        <p className="io-note">
          Incomplete total: {gaps.map((l) => `${l.show} (${l.gap?.toLowerCase()})`).join(', ')}. Add the figure in the
          roster or the network CPM, and the order is priced again.
        </p>
      )}
    </>
  )
}

// The lines as the programmer edits them, with the totals recomputed as they type.
function EditLines({
  order,
  roster,
  cpm,
  budget,
  sample,
  sharedTags,
  save,
  cancel,
  busy
}: {
  order: InsertionOrder
  roster: Show[]
  cpm: number | null
  budget: Budget | null
  sample: (line: OrderLine) => boolean
  sharedTags: Record<string, SharedTags>
  save: (lines: LineInput[]) => Promise<void>
  cancel: () => void
  busy: boolean
}) {
  const [lines, setLines] = useState(
    order.lines.map((l) => ({ show: l.show, slots: String(l.slots), angle: l.angle ?? '' }))
  )
  const whole = (slots: string) => (/^\d+$/.test(slots.trim()) && Number(slots) >= 1 ? Number(slots) : null)
  const typed = lines.map((l) => ({ ...l, slots: whole(l.slots) ?? 0 }))
  const priced = priceLines(typed, roster, cpm)
  const change = (i: number, field: 'slots' | 'angle', value: string) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [field]: value } : l)))
  const lacksAngle = (l: { show: string; angle: string }) => !l.angle.trim() && !angleOptional(sharedTags[l.show])
  const invalid = lines.some((l) => whole(l.slots) === null || lacksAngle(l)) || lines.length === 0
  return (
    <form
      aria-label="Edit the insertion order's lines"
      onSubmit={(e) => {
        e.preventDefault()
        void save(typed)
      }}
    >
      <fieldset disabled={busy}>
        <table className="io editing">
          <thead>
            <tr>
              <th scope="col">Show · angle</th>
              <th scope="col">Slots</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={line.show}>
                <td>
                  <div className="nm">{line.show}</div>
                  <textarea
                    aria-label={`Angle for ${line.show}`}
                    aria-invalid={lacksAngle(line) || undefined}
                    rows={3}
                    value={line.angle}
                    onChange={(e) => change(i, 'angle', e.target.value)}
                    maxLength={MAX_ANGLE}
                    placeholder={
                      angleOptional(sharedTags[line.show])
                        ? 'Qloo returned no shared tags. Type your own angle, or leave it empty.'
                        : undefined
                    }
                  />
                </td>
                <td>
                  <input
                    aria-label={`Slots on ${line.show}`}
                    aria-invalid={whole(line.slots) === null || undefined}
                    inputMode="numeric"
                    value={line.slots}
                    onChange={(e) => change(i, 'slots', e.target.value)}
                  />
                </td>
                <td>
                  <Value line={priced.lines[i]} sample={sample(priced.lines[i])} />
                  <button
                    type="button"
                    className="lnk"
                    aria-label={`Drop ${line.show}`}
                    onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                  >
                    Drop
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <Totals priced={priced} sample={priced.lines.some(sample)} />
        </table>
        <Checks priced={priced} budget={budget} />
        <div className="acts">
          <button className="btn" type="submit" disabled={invalid}>
            Save
          </button>
          <button className="btn" type="button" onClick={cancel}>
            Cancel
          </button>
          <small>
            {lines.length === 0
              ? 'Keep at least one show.'
              : invalid
                ? 'Each show needs whole slots, 1 or more, and an angle, unless Qloo returned no shared tags for it.'
                : 'Totals update as you type.'}
          </small>
        </div>
      </fieldset>
    </form>
  )
}
