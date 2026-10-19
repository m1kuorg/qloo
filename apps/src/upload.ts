// Turns uploaded files into what the agent already takes, for the browser, which reads dropped or
// picked files and sends the result over the agent's connection, and the API alike. A roster file
// becomes roster text and its format. Files are never kept, and anything that can't be read is refused
// with a message that says why, before the agent sees it.
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
