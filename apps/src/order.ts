// The insertion order: the launch plan priced as the inventory it spends (TRD derived values). Code,
// never the model, prices it: a slot is worth downloads per episode × CPM ÷ 1,000, rounded to whole
// dollars, and a line is worth its slots times that. Shared by the agent and the UI's live totals.
import type { Show } from './agent'

// What the model drafts and the programmer edits: a finalist, its promo slots, and the host-read angle.
export type LineInput = { show: string; slots: number; angle: string }

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
}

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

// What's wrong with a set of lines, or null when each is a finalist with whole slots and an angle.
// The lines may arrive as untrusted JSON.
export function lineProblem(lines: unknown, finalists: string[]): string | null {
  if (!Array.isArray(lines) || lines.length === 0) return 'The order has no lines.'
  const seen = new Set<string>()
  for (const line of lines as Partial<LineInput>[]) {
    const show = typeof line?.show === 'string' ? line.show : ''
    if (!finalists.includes(show))
      return `"${show}" isn't one of this run's finalists, which are ${finalists.join(', ')}.`
    if (seen.has(show)) return `${show} has more than one line; give each show one line.`
    seen.add(show)
    if (!Number.isSafeInteger(line.slots) || line.slots! < 1) return `${show} needs a whole number of slots, 1 or more.`
    if (typeof line.angle !== 'string' || !line.angle.trim()) return `${show} needs a host-read angle.`
  }
  return null
}

// The order as a CSV for ad operations: a row per line, then the total. Money is whole dollars with
// no symbol, so a spreadsheet reads numbers; a missing value is an empty cell, and the total's row
// says it's incomplete. The byte-order mark makes spreadsheets read it as UTF-8.
export const CSV_HEADER = ['Show', 'Slots', 'Angle', 'Slot value (USD)', 'Line value (USD)']

export function toCsv(order: InsertionOrder) {
  const gaps = order.lines.filter((l) => l.gap).map((l) => `${l.show} (${l.gap})`)
  const rows = [
    CSV_HEADER,
    ...order.lines.map((l) => [l.show, l.slots, l.angle, l.slotValue, l.value]),
    ['Total', order.slots, gaps.length ? `Incomplete: no value for ${gaps.join(', ')}` : null, null, order.total]
  ]
  return `\uFEFF${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`
}

// One CSV field, quoted when it holds a comma, quote, or line break. Text a spreadsheet would run
// as a formula gets a leading apostrophe, so an angle or a show name can't be one (CSV injection).
function cell(value: string | number | null) {
  if (value === null) return ''
  const text = typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export const dollars = (n: number) => `$${n.toLocaleString('en-US')}`
