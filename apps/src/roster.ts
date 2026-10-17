// Turns an imported roster, pasted names or a CSV, into one row per show. Anything it can't read
// is refused with a message for the programmer, so a roster is never imported in part.

export type RosterFormat = 'lines' | 'csv'

export type RosterRow = {
  name: string
  downloads: number | null // per episode
  status: string | null // the network's own word, such as "active" or "hiatus"
  description: string | null // one line, for the topic baseline
}

export function parseRoster(text: string, format: RosterFormat): RosterRow[] {
  if (format === 'csv') return csvRows(text)
  if (format !== 'lines') throw new Error(`Unknown roster format "${format}".`)
  // One show per name, ignoring case; a pasted name carries nothing for a repeat to disagree on.
  return [...new Map(lines(text).map((name) => [name.toLowerCase(), row(name)])).values()]
}

const row = (name: string, fields: Partial<RosterRow> = {}): RosterRow => ({
  name,
  downloads: null,
  status: null,
  description: null,
  ...fields
})

const lines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

const COLUMNS = ['name', 'downloads', 'status', 'description'] as const

// The header names the columns, in any order and case; only `name` is required, and other
// columns are ignored.
function csvRows(text: string): RosterRow[] {
  const [header, ...records] = parseCsv(text)
  const index = Object.fromEntries(
    COLUMNS.map((c) => [c, (header ?? []).findIndex((h) => h.trim().toLowerCase() === c)])
  )
  if (index.name < 0)
    throw new Error(
      `The CSV needs a "name" column. Its first row has ${header?.length ? header.map((h) => `"${h.trim()}"`).join(', ') : 'nothing'}.`
    )
  const cell = (record: string[], column: (typeof COLUMNS)[number]) => (record[index[column]] ?? '').trim() || null
  const seen = new Map<string, number>()
  return records.flatMap((record, i) => {
    if (record.every((f) => !f.trim())) return []
    const line = i + 2
    const name = cell(record, 'name')
    if (!name) throw new Error(`Row ${line} of the CSV has no name.`)
    const first = seen.get(name.toLowerCase())
    if (first) throw new Error(`Rows ${first} and ${line} of the CSV both name "${name}".`)
    seen.set(name.toLowerCase(), line)
    const fields = {
      downloads: downloads(cell(record, 'downloads'), line),
      status: cell(record, 'status'),
      description: cell(record, 'description')
    }
    return [row(name, fields)]
  })
}

function downloads(value: string | null, line: number) {
  if (value === null) return null
  const digits = value.replace(/[,_\s]/g, '')
  if (!/^\d+$/.test(digits)) throw new Error(`Row ${line} of the CSV: downloads "${value}" isn't a whole number.`)
  return Number(digits)
}

// RFC 4180: comma-separated fields, double quotes around a field that holds commas, quotes, or
// line breaks, and "" for a quote inside one.
function parseCsv(text: string): string[][] {
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let quoted = false
  const endField = () => {
    record.push(field)
    field = ''
  }
  const endRecord = () => {
    endField()
    records.push(record)
    record = []
  }
  const src = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c !== '"') field += c
      else if (src[i + 1] === '"') field += src[++i]
      else quoted = false
    } else if (c === '"') quoted = true
    else if (c === ',') endField()
    else if (c === '\n') endRecord()
    else if (c !== '\r') field += c
  }
  if (field || record.length) endRecord()
  return records
}
