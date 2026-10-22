// Turns uploaded files into what the agent already takes, for the browser, which reads dropped or
// picked files and sends the result over the agent's connection, and the API alike. A roster file
// becomes roster text and its format; pitch files become pitches of sender, subject, and plain-text
// body. Files are never kept, and anything that can't be read is refused with a message that says
// why, before the agent sees it, and a code for the API (refusal.ts).
import { splitPitches, type PitchInput } from './inbox'
import { Refusal } from './refusal'
import type { RosterFormat } from './roster'

// The most one file can hold, checked before it's read.
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

// A file as the browser and the Workers runtime both give it.
export type Upload = Pick<File, 'name' | 'size' | 'text' | 'arrayBuffer'>

// A roster file's format, by its extension: a CSV, or a text file with one show name per line.
const ROSTER_FORMATS: Record<string, RosterFormat> = { csv: 'csv', txt: 'lines' }

// The one file of a roster upload, as roster text and its format.
export async function readRosterUpload(files: readonly Upload[]): Promise<{ text: string; format: RosterFormat }> {
  if (files.length !== 1)
    throw new Refusal('unreadable', 'Upload one roster file: a .csv, or a .txt with one show name per line.')
  const [file] = files
  const format = ROSTER_FORMATS[extension(file.name)]
  if (!format)
    throw new Refusal(
      'unreadable',
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
    throw new Refusal(
      'unreadable',
      `"${other.name}" isn't a pitch file. Upload emails as .eml files or an .mbox export, or pitches as a .txt with a line of three dashes between them.`
    )
  const pitches: PitchInput[] = []
  for (const file of files) {
    const type = extension(file.name)
    if (type === 'txt') {
      const texts = splitPitches((await read(file)).replace(/\r\n?/g, '\n'))
      if (texts.length === 0) throw new Refusal('unreadable', `"${file.name}" has no pitch in it.`)
      pitches.push(...texts.map(headed))
      continue
    }
    // An email is read from its bytes, since each part names its own charset.
    const bytes = await readBytes(file)
    if (type === 'eml') pitches.push(await email(bytes))
    else {
      const emails = messages(bytes)
      if (!emails)
        throw new Refusal(
          'unreadable',
          `"${file.name}" isn't an mbox export: its first line should start an email with "From ".`
        )
      for (const raw of emails) pitches.push(await email(raw))
    }
  }
  return pitches
}

const PITCH_TYPES = ['eml', 'mbox', 'txt']

// A pitch from a text file, whose first lines may give its sender and subject as an email's would.
function headed(text: string): PitchInput {
  const pitch: PitchInput = { from: null, subject: null, body: text }
  const seen = new Set<string>()
  for (let header; (header = /^(from|subject):[ \t]*(.*)(?:\n|$)/i.exec(pitch.body));) {
    const key = header[1].toLowerCase() as 'from' | 'subject'
    if (seen.has(key)) break
    seen.add(key)
    pitch[key] = header[2].trim() || null
    pitch.body = pitch.body.slice(header[0].length)
  }
  return { ...pitch, body: pitch.body.trim() }
}

// The emails of an mbox export, as bytes, or null when it doesn't start with one. Each email starts
// with a "From " line, at the top of the file or after a blank line, naming the sender and the time it
// was received; a body line starting with "From " was written with a ">" before it (mboxrd), though
// not by every client, so a body line without a time doesn't start an email. The file is split as
// bytes, one character per byte, so each email keeps its own charset.
function messages(mbox: Uint8Array) {
  const lines = binary(mbox)
    .replace(/^\xEF\xBB\xBF/, '')
    .split(/\r?\n/)
  const separator = (i: number) => (i === 0 || lines[i - 1] === '') && /^From \S+ .*\b\d{1,2}:\d{2}\b/.test(lines[i])
  if (!separator(0)) return null
  const emails: string[][] = []
  lines.forEach((line, i) => {
    if (separator(i)) emails.push([])
    else emails.at(-1)!.push(line.replace(/^>(>*From )/, '$1'))
  })
  return emails.map((lines) => Uint8Array.from(lines.join('\n'), (c) => c.charCodeAt(0)))
}

// Bytes as a string of one character per byte, in chunks small enough to spread as arguments.
function binary(bytes: Uint8Array) {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return text
}

// One email as a pitch: its sender and subject, and its plain text, or its HTML's text when it has
// no plain part. Attachments are left out. postal-mime loads with the first email read, so the
// island's pages that only upload a roster don't load it.
async function email(raw: Uint8Array): Promise<PitchInput> {
  const { default: PostalMime } = await import('postal-mime')
  const parsed = await PostalMime.parse(raw)
  const from = parsed.from
  const sender = !from ? null : from.address ? (from.name ? `${from.name} <${from.address}>` : from.address) : from.name
  const body = parsed.text ?? (parsed.html ? htmlText(parsed.html) : '')
  return { from: sender || null, subject: parsed.subject?.trim() || null, body: body.trim() }
}

// The words of an HTML email, which postal-mime gives only as HTML when the email has no plain part:
// its head, styles, scripts, and comments dropped, a line break after each block, a space for any
// other tag but inline ones, and the entities mail commonly uses decoded; one it can't decode stays as
// written. Claude reads it, so the layout only needs to keep words and paragraphs apart.
function htmlText(html: string) {
  const tag = (names: string) => new RegExp(`<\\/?(?:${names})\\b(?:[^>"']|"[^"]*"|'[^']*')*>`, 'gi')
  return html
    .replace(/<(head|style|script|title)\b[\s\S]*?<\/\1\s*>|<!--[\s\S]*?-->/gi, '')
    .replace(tag('br'), '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote|table)\s*>/gi, '\n\n')
    .replace(tag('a|b|i|u|em|strong|span|font|small|sub|sup'), '')
    .replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
      const code = name[0] !== '#' ? null : Number(name[1].toLowerCase() === 'x' ? `0${name.slice(1)}` : name.slice(1))
      if (code === null) return ENTITIES[name.toLowerCase()] ?? entity
      return code <= 0x10ffff ? String.fromCodePoint(code) : entity
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
  tooBig(file)
  const text = await file.text()
  if (!text.trim()) throw new Refusal('unreadable', `"${file.name}" is empty.`)
  return text
}

// A file's bytes, once it's known to be within the limit and not blank.
async function readBytes(file: Upload) {
  tooBig(file)
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes.every((b) => b === 0x20 || (b >= 0x09 && b <= 0x0d)))
    throw new Refusal('unreadable', `"${file.name}" is empty.`)
  return bytes
}

// A file name's extension, lowercased, or the whole name when it has none.
const extension = (name: string) => name.slice(name.lastIndexOf('.') + 1).toLowerCase()

// Refuses a file over the limit before it's read.
export function tooBig(file: Upload) {
  if (file.size > MAX_UPLOAD_BYTES)
    throw new Refusal(
      'too_large',
      `"${file.name}" is ${megabytes(file.size)}, over the ${megabytes(MAX_UPLOAD_BYTES, 0)} limit for an upload.`
    )
}

export const megabytes = (bytes: number, digits = 1) => `${(bytes / 1024 / 1024).toFixed(digits)} MB`
