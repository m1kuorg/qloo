// The insertion order: the launch plan priced as the inventory it spends (TRD derived values). Code,
// never the model, prices it: a slot is worth downloads per episode × CPM ÷ 1,000, rounded to whole
// dollars, and a line is worth its slots times that. Shared by the agent and the UI's live totals.
import type { Show } from './agent'
import { NO_ANGLE, tagged, type FitRow, type SharedTags } from './fit'
import { MAX_ANGLE } from './text'

// What the model drafts and the programmer edits: a finalist, its promo slots, and the host-read
// angle, null for a finalist Qloo returned no shared tags for (#216), unless the programmer typed one.
export type LineInput = { show: string; slots: number; angle: string | null }

export type OrderLine = LineInput & {
  slotValue: number | null // dollars per slot; null when a figure it needs is missing
  value: number | null // slots × slot value
  gap: string | null // why the line has no value, such as "No downloads per episode"
}

// The lines with their values and totals, as code priced them.
export type Priced = {
  lines: OrderLine[]
  cpm: number | null // the CPM the lines were priced at
  slots: number
  total: number // dollars, over the lines that have a value
  complete: boolean // every line has a value, so `total` is the order's whole cost
}

export type InsertionOrder = Priced & {
  id: string // such as IO-0003, after the run that drafted it
  run: string
  status: 'draft' | 'approved'
  // An edit, or a new figure it's priced from, changed it since the agent drafted it, so the run's
  // closing line, Claude's words as the run completed, may quote figures it no longer has (#202).
  edited?: true
  // The member who approved it, by name and ID, and when (ISO time), on a launch's agent; absent on
  // the demo's, and on any draft. The ID is kept so the name can be forgotten with their account
  // (forgetMember), and never leaves through the API.
  approvedBy?: string
  approvedById?: string
  approvedAt?: string
}

// Why `cpm` can't be the network's CPM in dollars, or null when it can.
export const cpmProblem = (cpm: unknown) =>
  typeof cpm === 'number' && Number.isFinite(cpm) && cpm > 0 ? null : 'The CPM must be a dollar amount above 0.'

// One promo slot's value on a show, or the figure it's missing: the insertion order prices its lines
// with it, and the fit chart shows it per show.
export function slotPrice(downloads: number | null, cpm: number | null): Pick<OrderLine, 'slotValue' | 'gap'> {
  if (cpm === null) return { slotValue: null, gap: 'No network CPM' }
  if (downloads === null) return { slotValue: null, gap: 'No downloads per episode' }
  return { slotValue: Math.round((downloads * cpm) / 1000), gap: null }
}

// Prices each line from its show's downloads and the CPM. A missing figure leaves a gap, never a guess.
export function priceLines(lines: LineInput[], roster: Show[], cpm: number | null): Priced {
  const priced = lines.map((line): OrderLine => {
    const { slotValue, gap } = slotPrice(roster.find((s) => s.name === line.show)?.downloads ?? null, cpm)
    return { ...line, slotValue, value: slotValue === null ? null : slotValue * line.slots, gap }
  })
  return {
    lines: priced,
    cpm,
    slots: priced.reduce((n, l) => n + l.slots, 0),
    total: priced.reduce((n, l) => n + (l.value ?? 0), 0),
    complete: priced.every((l) => l.value !== null)
  }
}

// What's wrong with a set of lines, or null when each is a finalist with whole slots and an angle, or
// no angle when Qloo returned it no shared tags. The lines may arrive as untrusted JSON.
export function lineProblem(lines: unknown, finalists: FitRow[]): string | null {
  if (!Array.isArray(lines) || lines.length === 0) return 'The order has no lines.'
  const seen = new Set<string>()
  for (const line of lines as Partial<LineInput>[]) {
    const show = typeof line?.show === 'string' ? line.show : ''
    const row = finalists.find((r) => r.show === show)
    if (!row)
      return `"${show}" isn't one of this run's finalists, which are ${finalists.map((r) => r.show).join(', ')}.`
    if (seen.has(show)) return `${show} has more than one line; give each show one line.`
    seen.add(show)
    if (!Number.isSafeInteger(line.slots) || line.slots! < 1) return `${show} needs a whole number of slots, 1 or more.`
    if (line.angle != null && typeof line.angle !== 'string') return `${show} needs a host-read angle.`
    const angle = line.angle?.trim() ?? ''
    if (!angle && !angleOptional(row.sharedTags)) return `${show} needs a host-read angle.`
    if (angle.length > MAX_ANGLE) return `${show}'s angle is over ${MAX_ANGLE} characters. Shorten it.`
  }
  return null
}

// A line's angle as stored: trimmed, and null for none.
export const angleOf = (line: LineInput) => line.angle?.trim() || null

// Whether a finalist's line may go without an angle: only once its compare returned no shared tags,
// as there's nothing to build one from. One never compared needs the programmer's own.
export const angleOptional = (shared: SharedTags | null | undefined) => !!shared && !tagged(shared)

// The order as a CSV for ad operations: a row per line, then the total. Money is whole dollars with
// no symbol, so a spreadsheet reads numbers; a missing value is an empty cell, and the total's row
// says it's incomplete. The byte-order mark makes spreadsheets read it as UTF-8.
export const CSV_HEADER = ['Show', 'Slots', 'Angle', 'Slot value (USD)', 'Line value (USD)']

export function toCsv(order: InsertionOrder) {
  const gaps = order.lines.filter((l) => l.gap).map((l) => `${l.show} (${l.gap})`)
  const rows = [
    CSV_HEADER,
    ...order.lines.map((l) => [l.show, l.slots, l.angle ?? NO_ANGLE, l.slotValue, l.value]),
    ['Total', order.slots, gaps.length ? `Incomplete: no value for ${gaps.join(', ')}` : null, null, order.total]
  ]
  return `\uFEFF${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`
}

// An order's export, as an agent answers it (`exportInsertionOrder`): the CSV, or why not.
export type OrderExport = { status: 200; csv: string } | { status: 404 | 409; error: string }

// An order's export as a browser downloads it: the CSV as a file named for the order, or the agent's
// refusal, such as a draft's 409, as text. The demo's export route and a launch's answer with it.
export const csvDownload = (id: string, exported: OrderExport) =>
  exported.status === 200
    ? new Response(exported.csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${id}.csv"`
        }
      })
    : new Response(exported.error, {
        status: exported.status,
        headers: { 'Content-Type': 'text/plain; charset=UTF-8' }
      })

// One CSV field, quoted when it holds a comma, quote, or line break. Text a spreadsheet would run
// as a formula gets a leading apostrophe, so an angle or a show name can't be one (CSV injection).
function cell(value: string | number | null) {
  if (value === null) return ''
  const text = typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export const dollars = (n: number) => `$${n.toLocaleString('en-US')}`
