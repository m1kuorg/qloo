// Turns uploaded files into what the agent already takes, for the browser, which reads dropped or
// picked files and sends the result over the agent's connection, and the API alike. A roster file
// becomes roster text and its format; pitch files become pitches of sender, subject, and plain-text
// body. Files are never kept, and anything that can't be read is refused with a message that says
// why, before the agent sees it.
import PostalMime from 'postal-mime'
import { splitPitches, type PitchInput } from './inbox'
import type { RosterFormat } from './roster'

// The most one file can hold, checked before it's read.
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

// A file as the browser and the Workers runtime both give it.
export type Upload = Pick<File, 'name' | 'size' | 'text'>

// A roster file's format, by its extension: a CSV, or a text file with one show name per line.
const ROSTER_FORMATS: Record<string, RosterFormat> = { csv: 'csv', txt: 'lines' }

// The one file of a roster upload, as roster text and its format.
export async function readRosterUpload(files: readonly Upload[]): Promise<{ text: string; format: RosterFormat }> {
  if (files.length !== 1) throw new Error('Upload one roster file: a .csv, or a .txt with one show name per line.')
  const [file] = files
  const format = ROSTER_FORMATS[extension(file.name)]
  if (!format)
    throw new Error(
      `"${file.name}" isn't a CSV or text file. Upload the roster as .csv, or as .txt with one show name per line; a spreadsheet can save or export it as CSV.`
    )
  return { text: await read(file), format }
}

// Pitch files, as a booker exports them from their email client: emails as `.eml` files, an `.mbox`
// export of many, or a text file of pitches separated by lines of dashes, in the order given. Every
// file's type is checked before any is read, and a file with no pitch in it is refused.
export async function readPitchUpload(files: readonly Upload[]): Promise<PitchInput[]> {
  const other = files.find((f) => !PITCH_TYPES.includes(extension(f.name)))
  if (other)
    throw new Error(
      `"${other.name}" isn't a pitch file. Upload emails as .eml files or an .mbox export, or pitches as a .txt with a line of three dashes between them.`
    )
  const pitches: PitchInput[] = []
  for (const file of files) {
    const type = extension(file.name)
    const text = await read(file)
    if (type === 'eml') pitches.push(await email(text))
    else if (type === 'mbox') {
      const emails = messages(text)
      if (emails.length === 0)
        throw new Error(`"${file.name}" isn't an mbox export: none of its lines starts an email with "From ".`)
      for (const raw of emails) pitches.push(await email(raw))
    } else {
      const texts = splitPitches(text.replace(/\r\n?/g, '\n'))
      if (texts.length === 0) throw new Error(`"${file.name}" has no pitch in it.`)
      pitches.push(...texts.map(headed))
    }
  }
  return pitches
}

const PITCH_TYPES = ['eml', 'mbox', 'txt']

// A pitch from a text file, whose first lines may give its sender and subject as an email's would.
function headed(text: string): PitchInput {
  const pitch: PitchInput = { from: null, subject: null, body: text }
  for (let header; (header = /^(from|subject):[ \t]*(.*)(?:\n|$)/i.exec(pitch.body));) {
    const key = header[1].toLowerCase() as 'from' | 'subject'
    if (pitch[key] !== null) break
    pitch[key] = header[2].trim() || null
    pitch.body = pitch.body.slice(header[0].length)
  }
  return { ...pitch, body: pitch.body.trim() }
}

// The emails of an mbox export: each starts with a "From " line at the top of the file or after a
// blank line, and a body line starting with "From " was written with a ">" before it (mboxrd).
function messages(mbox: string) {
  const emails: string[][] = []
  const lines = mbox.split(/\r?\n/)
  lines.forEach((line, i) => {
    if (line.startsWith('From ') && (i === 0 || lines[i - 1] === '')) emails.push([])
    else emails.at(-1)?.push(line.replace(/^>(>*From )/, '$1'))
  })
  return emails.map((lines) => lines.join('\n'))
}

// One email as a pitch: its sender and subject, and its plain text, or its HTML's text when it has
// no plain part. Attachments are left out.
async function email(raw: string): Promise<PitchInput> {
  const parsed = await PostalMime.parse(raw)
  const from = parsed.from
  const sender = !from ? null : from.address ? (from.name ? `${from.name} <${from.address}>` : from.address) : from.name
  const body = parsed.text ?? (parsed.html ? htmlText(parsed.html) : '')
  return { from: sender || null, subject: parsed.subject?.trim() || null, body: body.trim() }
}

// The words of an HTML email, which postal-mime gives only as HTML when the email has no plain part:
// its head, styles, scripts, and comments dropped, a line break after each block, and the entities
// mail commonly uses decoded. Claude reads it, so the layout only needs to keep paragraphs apart.
function htmlText(html: string) {
  return html
    .replace(/<(head|style|script|title)\b[\s\S]*?<\/\1\s*>|<!--[\s\S]*?-->/gi, '')
    .replace(/<br\b[^>]*>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote|table)\s*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
      const code = name[0] !== '#' ? null : Number(name[1].toLowerCase() === 'x' ? `0${name.slice(1)}` : name.slice(1))
      return code !== null ? String.fromCodePoint(code) : (ENTITIES[name.toLowerCase()] ?? entity)
    })
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  mdash: '—',
  ndash: '–',
  hellip: '…'
}

// A file's text, once it's known to be within the limit.
async function read(file: Upload) {
  if (file.size > MAX_UPLOAD_BYTES)
    throw new Error(
      `"${file.name}" is ${megabytes(file.size)}, over the ${megabytes(MAX_UPLOAD_BYTES, 0)} limit for an upload.`
    )
  const text = await file.text()
  if (!text.trim()) throw new Error(`"${file.name}" is empty.`)
  return text
}

// A file name's extension, lowercased, or the whole name when it has none.
const extension = (name: string) => name.slice(name.lastIndexOf('.') + 1).toLowerCase()

const megabytes = (bytes: number, digits = 1) => `${(bytes / 1024 / 1024).toFixed(digits)} MB`
