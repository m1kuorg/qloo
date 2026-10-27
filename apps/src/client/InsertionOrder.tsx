import { cn } from 'cn'
import { CheckIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { buttonVariants } from '@/components/ui/variants'
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
import { Alert, day, useAction, useLeaveGuard } from './controls'
import { CallButton } from './Evidence'
import { Source } from './Source'
import { StateLine } from './states'

// The plan: the run's insertion order as a document on the card, priced as the inventory it spends.
// The agent drafts the slots and angles and code prices them; only the programmer edits, approves,
// and exports. Its lines carry the signal mark, since they're what the agent puts forward. Editing
// turns the lines' cells into fields in place, with the totals and checks following what's typed.
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
  const [editing, setEditing] = useState(false)
  const { busy, error, run } = useAction()
  // Leaving the editor removes its fields, so focus goes back to the button that opened it.
  const leavingEdit = useRef(false)
  const editButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (editing || !leavingEdit.current) return
    leavingEdit.current = false
    editButton.current?.focus()
  }, [editing])
  const stopEditing = () => {
    leavingEdit.current = true
    setEditing(false)
  }
  const approved = order.status === 'approved'
  // Approve goes once the order is approved, so focus moves on to what follows it: Export CSV, or the
  // line saying who approved it.
  const approving = useRef(false)
  const exportLink = useRef<HTMLAnchorElement>(null)
  const approvedLine = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (!approved || !approving.current) return
    approving.current = false
    ;(exportLink.current ?? approvedLine.current)?.focus()
  }, [approved])
  const approve = async () => {
    approving.current = true
    if (!(await run(actions!.approve))) approving.current = false
  }
  const sample = (line: OrderLine) =>
    sampleCpm || !!roster.find((s) => s.name === line.show)?.sample?.includes('downloads')
  const exported = approved && exportHref && (
    <a ref={exportLink} className={buttonVariants({ variant: 'secondary' })} href={exportHref} download>
      Export CSV
    </a>
  )
  return (
    <section className="flex flex-col gap-3" aria-labelledby="plan-h" data-io>
      <h2 className="text-base font-semibold" id="plan-h">
        The plan
      </h2>
      <div className="flex flex-col gap-4 rounded-xl bg-card p-4 lg:p-5">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="font-semibold" id="io-h">
              Insertion order{' '}
              <code className="font-mono font-medium" translate="no">
                {order.id}
              </code>
            </h3>
            {approved ? (
              <Badge variant="outline">
                <CheckIcon aria-hidden="true" />
                Approved
              </Badge>
            ) : (
              <Badge>Draft</Badge>
            )}
          </div>
          <p className="type-caption text-muted-foreground">
            <Source of="agent" /> drafted the slots and angles. Code prices each slot at downloads per episode × CPM ÷
            1,000.
          </p>
        </div>
        {editing && actions ? (
          <EditLines
            order={order}
            roster={roster}
            cpm={cpm}
            budget={budget}
            sample={sample}
            sharedTags={sharedTags}
            save={async (lines) => {
              if (await run(() => actions.edit(lines))) stopEditing()
            }}
            cancel={stopEditing}
            busy={busy}
          />
        ) : (
          <>
            <Lines priced={order} sample={sample}>
              {(line) => ({
                angle: (
                  <p className="max-w-[72ch]" data-angle>
                    <span className={line.angle ? undefined : 'text-muted-foreground'}>{line.angle ?? NO_ANGLE}</span>
                    {sharedTags[line.show] && (
                      <>
                        {' '}
                        <CallButton
                          call={sharedTags[line.show].call}
                          label={`Evidence for the tags ${line.show} shares`}
                          opened={opened}
                          openCall={openCall}
                        />
                      </>
                    )}
                  </p>
                ),
                slots: line.slots,
                value: <Value line={line} />,
                price: <SlotPrice line={line} sample={sample(line)} />
              })}
            </Lines>
            <Checks priced={order} budget={budget} />
            {approved && order.approvedBy && order.approvedAt && (
              <p className="flex items-start gap-1.5" ref={approvedLine} tabIndex={-1}>
                <CheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>
                  Approved by {order.approvedBy} on {day(order.approvedAt)} at{' '}
                  {new Date(order.approvedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.
                </span>
              </p>
            )}
            {actions ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                {approved ? (
                  exported
                ) : (
                  <Button disabled={busy} onClick={() => void approve()}>
                    {busy && <Spinner data-icon="inline-start" />}
                    Approve
                  </Button>
                )}
                <Button ref={editButton} variant="ghost" disabled={busy} onClick={() => setEditing(true)}>
                  Edit lines
                </Button>
                <p className="type-caption text-muted-foreground">
                  {approved
                    ? 'Editing returns it to draft.'
                    : 'Nothing is final until you approve it. Editing returns it to draft.'}
                </p>
              </div>
            ) : (
              (exported || readOnly) && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  {exported}
                  {readOnly && <p className="type-caption text-muted-foreground">{readOnly}</p>}
                </div>
              )
            )}
          </>
        )}
        <Alert error={error} />
      </div>
    </section>
  )
}

// The order's lines as a table, each line a body of two rows: the show with its slots and value, then
// its angle under the show and the slots, beside the line's slot price under its value. Each first
// row stays one line, so the angle reads straight under its show. `cells` fills a line's cells, read-only or as fields.
function Lines({
  priced,
  sample,
  children: cells
}: {
  priced: Priced
  sample: (line: OrderLine) => boolean
  children: (
    line: OrderLine,
    i: number
  ) => { angle: React.ReactNode; slots: React.ReactNode; value: React.ReactNode; price: React.ReactNode }
}) {
  return (
    <table className="w-full">
      <thead className="type-caption text-muted-foreground">
        <tr className="border-b">
          <th scope="col" className="pb-2 text-left font-normal">
            Show · angle
          </th>
          <th scope="col" className="w-14 pb-2 pl-3 text-right font-normal md:w-20">
            Slots
          </th>
          <th scope="col" className="w-24 pb-2 pl-3 text-right font-normal md:w-40">
            Value
          </th>
        </tr>
      </thead>
      {priced.lines.map((line, i) => {
        const { angle, slots, value, price } = cells(line, i)
        return (
          <tbody key={line.show} className="border-b" data-line={line.show}>
            <tr className="align-baseline">
              <th scope="row" className="pt-3 text-left font-normal">
                <span className="inline-flex items-center gap-2 text-[15px] leading-snug font-semibold">
                  {/* The signal mark: a line the agent put forward. */}
                  <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-signal" />
                  {line.show}
                </span>
              </th>
              <td className="pt-3 pl-3 text-right tabular-nums">{slots}</td>
              <td className="pt-3 pl-3 text-right">{value}</td>
            </tr>
            <tr className="align-top">
              <td colSpan={2} className="pt-1 pb-3 pl-4">
                {angle}
              </td>
              <td className="pt-0.5 pb-3 pl-3 text-right">{price}</td>
            </tr>
          </tbody>
        )
      })}
      <tfoot>
        <tr className="align-baseline">
          <th scope="row" className="pt-3 text-left font-semibold">
            Total
          </th>
          <td className="pt-3 pl-3 text-right font-semibold tabular-nums">{priced.slots}</td>
          <td className="pt-3 pl-3 text-right">
            <span className="flex flex-wrap items-center justify-end gap-x-1.5">
              <span className="font-semibold">{dollars(priced.total)}</span>
              {!priced.complete ? (
                <span className="basis-full type-caption text-muted-foreground">incomplete</span>
              ) : (
                priced.lines.some(sample) && (
                  <span className="basis-full type-caption text-muted-foreground">sample figures</span>
                )
              )}
            </span>
          </td>
        </tr>
      </tfoot>
    </table>
  )
}

// A line's value, or the figure it's missing.
function Value({ line }: { line: Pick<OrderLine, 'value' | 'slotValue' | 'gap'> }) {
  if (line.value === null || line.slotValue === null)
    return <span className="type-caption text-muted-foreground">{line.gap ?? '–'}</span>
  return <span className="font-medium">{dollars(line.value)}</span>
}

// What one of the line's slots is worth, under its value, labelled sample while a sample figure prices
// it.
const SlotPrice = ({ line, sample }: { line: Pick<OrderLine, 'slotValue'>; sample: boolean }) =>
  line.slotValue !== null && (
    <span className="flex flex-wrap items-center justify-end gap-x-1.5 gap-y-1">
      {sample && <Badge>sample</Badge>}
      <span className="type-caption text-muted-foreground">{dollars(line.slotValue)} a slot</span>
    </span>
  )

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
  if (!over && !left && gaps.length === 0) return null
  return (
    <div className="flex flex-col gap-1" data-checks>
      {over ? (
        <p>
          <StateLine kind="error" word="Over budget">
            {over}
          </StateLine>
        </p>
      ) : (
        left && <p className="text-muted-foreground">Budget: {left}</p>
      )}
      {gaps.length > 0 && (
        <p>
          <StateLine kind="missed" word="Incomplete total">
            {gaps.map((l) => `${l.show} (${l.gap?.toLowerCase()})`).join(', ')}. Add the figure in the roster or the
            network CPM, and the order is priced again.
          </StateLine>
        </p>
      )}
    </div>
  )
}

// The lines as the programmer edits them, in place: the angle, the slots and a way to drop each line,
// with the totals and checks recomputed as they type.
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
  // Opening the editor replaces the button that opened it, so focus starts on the first angle.
  const firstAngle = useRef<HTMLTextAreaElement>(null)
  useEffect(() => firstAngle.current?.focus(), [])
  // Typed and not saved: leaving the page asks first.
  useLeaveGuard(
    lines.length !== order.lines.length ||
      lines.some(
        (l, i) =>
          l.show !== order.lines[i].show ||
          l.slots !== String(order.lines[i].slots) ||
          l.angle !== (order.lines[i].angle ?? '')
      )
  )
  return (
    <form
      aria-label="Edit the insertion order’s lines"
      onSubmit={(e) => {
        e.preventDefault()
        void save(typed)
      }}
    >
      <FieldSet disabled={busy} className="gap-4">
        <Lines priced={priced} sample={sample}>
          {(line, i) => ({
            angle: (
              <Field data-invalid={lacksAngle(lines[i]) || undefined}>
                <Textarea
                  ref={i === 0 ? firstAngle : undefined}
                  aria-label={`Angle for ${line.show}`}
                  aria-invalid={lacksAngle(lines[i]) || undefined}
                  aria-describedby={lacksAngle(lines[i]) ? 'io-edit-hint' : undefined}
                  rows={2}
                  value={lines[i].angle}
                  onChange={(e) => change(i, 'angle', e.target.value)}
                  maxLength={MAX_ANGLE}
                  placeholder={
                    angleOptional(sharedTags[line.show])
                      ? 'Qloo returned no shared tags. Type your own angle, or leave it empty.'
                      : undefined
                  }
                  className="min-h-14 max-w-[72ch]"
                />
              </Field>
            ),
            slots: (
              <Field
                orientation="horizontal"
                data-invalid={whole(lines[i].slots) === null || undefined}
                className="justify-end"
              >
                <Input
                  aria-label={`Slots on ${line.show}`}
                  aria-invalid={whole(lines[i].slots) === null || undefined}
                  aria-describedby={whole(lines[i].slots) === null ? 'io-edit-hint' : undefined}
                  inputMode="numeric"
                  value={lines[i].slots}
                  onChange={(e) => change(i, 'slots', e.target.value)}
                  className="w-14 text-right normal-nums"
                />
              </Field>
            ),
            value: <Value line={line} />,
            price: (
              <span className="flex flex-col items-end gap-1">
                <SlotPrice line={line} sample={sample(line)} />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Drop ${line.show}`}
                  onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                  className="-mr-2.5"
                >
                  Drop
                </Button>
              </span>
            )
          })}
        </Lines>
        <Checks priced={priced} budget={budget} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button type="submit" disabled={invalid}>
            {busy && <Spinner data-icon="inline-start" />}
            Save
          </Button>
          <Button type="button" variant="ghost" onClick={cancel}>
            Cancel
          </Button>
          {/* Why Save is off, told as it changes; the fields it's about point here. */}
          <p
            id="io-edit-hint"
            role="status"
            className={cn('type-caption', invalid ? 'text-foreground' : 'text-muted-foreground')}
          >
            {lines.length === 0
              ? 'Keep at least one show.'
              : invalid
                ? 'Each show needs whole slots, 1 or more, and an angle, unless Qloo returned no shared tags for it.'
                : 'Totals update as you type.'}
          </p>
        </div>
      </FieldSet>
    </form>
  )
}
