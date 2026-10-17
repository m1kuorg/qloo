// The booker's inbox of guest pitches: the sample inbox, or pitches pasted in, read into one row
// per pitch. Anything it can't take is refused with a message, so an inbox never loads in part.
import type { Candidate } from './resolve'
import sampleInbox from './sample-inbox.json'

export type WorkType = 'book' | 'film' | 'tv_show' | 'podcast'
export const workTypes: WorkType[] = ['book', 'film', 'tv_show', 'podcast']

// The Qloo type each work type is searched as (TRD calls).
export const qlooType: Record<WorkType, string> = {
  book: 'urn:entity:book',
  film: 'urn:entity:movie',
  tv_show: 'urn:entity:tv_show',
  podcast: 'urn:entity:podcast'
}

// The guest's public work, as read from the pitch. Only its title and type ever reach Qloo.
export type Work = { title: string; type: WorkType; year: number | null }

// A search result for a work, with its year (and a book's author) to tell same-title works apart.
export type WorkCandidate = Candidate & { disambiguation: string | null }

// How a work's search resolved. Same-title candidates are kept after the booker confirms one.
export type WorkMatch = {
  resolution: 'resolved' | 'ambiguous' | 'missed' | 'failed'
  entity: WorkCandidate | null
  candidates: WorkCandidate[]
  evidence: string // the call number of the search
  error: string | null // why the search failed
}

export type Pitch = {
  id: string // "pitch-01"
  from: string | null // the sender's name and address, when the inbox gives them apart from the text
  subject: string | null
  body: string
  // reading: Claude is reading it; looking_up: its work is being searched in Qloo; read: done.
  // no_work and unreadable pitches are set aside and never reach Qloo.
  status: 'reading' | 'looking_up' | 'read' | 'no_work' | 'unreadable' | 'failed'
  guest: string | null
  work: Work | null
  match: WorkMatch | null // null until its work has been searched
  error: string | null // why it's unreadable or failed
}

export type Inbox = {
  id: string
  sample: boolean // the synthetic sample inbox, labelled as sample data
  notice: string | null // the sample's notice
  status: 'reading' | 'done'
  pitches: Pitch[]
}

// The sample inbox, or pasted text with pitches separated by lines of three or more dashes.
export type InboxSource = { sample: true } | { text: string }

// Each pitch costs one model call and one Qloo search, and one ranking takes at most 50 works.
const MAX_PITCHES = 50
const MAX_PITCH_CHARS = 10_000

export function readInbox(source: unknown): Pick<Inbox, 'sample' | 'notice' | 'pitches'> {
  const given = (typeof source === 'object' && source !== null ? source : {}) as Record<string, unknown>
  if (given.sample === true)
    return {
      sample: true,
      notice: sampleInbox.notice,
      // The answer key in each pitch's `expected` is for checking extraction, so it's left out.
      pitches: sampleInbox.pitches.map((p) => pitch(p.id, p.body, `${p.senderName} <${p.senderEmail}>`, p.subject))
    }
  if (typeof given.text !== 'string') throw new Error('Load the sample inbox, or paste pitches.')
  const texts = given.text
    .split(/^[ \t]*-{3,}[ \t]*$/m)
    .map((t) => t.trim())
    .filter(Boolean)
  if (texts.length === 0) throw new Error('Paste at least one pitch.')
  if (texts.length > MAX_PITCHES)
    throw new Error(`${texts.length} pitches is over the ${MAX_PITCHES}-pitch limit. Paste ${MAX_PITCHES} or fewer.`)
  const long = texts.findIndex((t) => t.length > MAX_PITCH_CHARS)
  if (long >= 0)
    throw new Error(`Pitch ${long + 1} is over ${MAX_PITCH_CHARS.toLocaleString('en-US')} characters. Shorten it.`)
  return {
    sample: false,
    notice: null,
    pitches: texts.map((body, i) => pitch(`pitch-${String(i + 1).padStart(2, '0')}`, body))
  }
}

const pitch = (id: string, body: string, from: string | null = null, subject: string | null = null): Pitch => ({
  id,
  from,
  subject,
  body,
  status: 'reading',
  guest: null,
  work: null,
  match: null,
  error: null
})
