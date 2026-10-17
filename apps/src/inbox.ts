// The booker's inbox of guest pitches: the sample inbox, or pitches pasted in, read into one row
// per pitch. Anything it can't take is refused with a message, so an inbox never loads in part.
import type { PitchList, SharedTags } from './fit'
import { MAX_PAST_GUESTS } from './limits'
import { personalIn, type Candidate } from './resolve'
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

// How a work type reads in a sentence, such as "no past guest's work is a TV show".
export const workNoun: Record<WorkType, string> = {
  book: 'book',
  film: 'film',
  tv_show: 'TV show',
  podcast: 'podcast'
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
  // The show the sample inbox was written for and its past guests, to rank against; null when pasted.
  show: { name: string; pastGuests: Omit<PastGuest, 'match'>[] } | null
  status: 'reading' | 'done'
  pitches: Pitch[]
}

// One of the show's best past guests, named by the booker, and how their work resolved in Qloo; null
// until it has been searched. Only the work's title and type reach Qloo.
export type PastGuest = { guest: string; work: Work; match: WorkMatch | null }

// A guest pitch run: the roster show the pitches are ranked against, its past guests, and the
// ranked lists, one per work type, once rank_pitches has run.
export type Booking = {
  run: string // the pitch run that made it
  show: { name: string; entity: Candidate } // the roster show, named as imported
  pastGuests: PastGuest[]
  lists: PitchList[] | null
  replies: PitchReply[] | null // one per pitch, in inbox order, as draft_replies drafts them
}

export type Verdict = 'book' | 'decline' | 'later'

// A drafted reply to one pitch, with the agent's verdict. Only the booker approves, edits, or
// discards it, and only an approved reply can be copied out.
export type PitchReply = {
  pitch: string // the pitch's ID
  verdict: Verdict
  angle: string | null // the episode angle, for a pitch whose work shared_tags compared with the show
  sharedTags: SharedTags | null // that compare, which the angle is built from
  draft: string
  status: 'draft' | 'approved' | 'discarded'
}

// The sample inbox, or pasted text with pitches separated by lines of three or more dashes.
export type InboxSource = { sample: true } | { text: string }

// Each pitch costs one model call and one Qloo search, and one ranking takes at most 50 works.
const MAX_PITCHES = 50
const MAX_PITCH_CHARS = 10_000

export function readInbox(source: unknown): Pick<Inbox, 'sample' | 'notice' | 'show' | 'pitches'> {
  const given = (typeof source === 'object' && source !== null ? source : {}) as Record<string, unknown>
  if (given.sample === true)
    return {
      sample: true,
      notice: sampleInbox.notice,
      show: {
        name: sampleInbox.show.name,
        pastGuests: sampleInbox.show.pastGuests.map(({ guest, work }) => ({
          guest,
          work: { ...work, type: work.type as WorkType }
        }))
      },
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
    show: null,
    pitches: texts.map((body, i) => pitch(`pitch-${String(i + 1).padStart(2, '0')}`, body))
  }
}

const YEARS = [1800, 2100]

// The past guests the booker named, each with their public work. A guest's name is needed because a
// book is matched by its author. Anything else is refused, so a run never starts on part of them.
export function readPastGuests(given: unknown): Omit<PastGuest, 'match'>[] {
  if (!Array.isArray(given)) throw new Error("Name the show's best past guests and their public works.")
  if (given.length > MAX_PAST_GUESTS) throw new Error(`Name at most ${MAX_PAST_GUESTS} past guests.`)
  return given.map((g, i) => {
    const { guest, work } = (typeof g === 'object' && g !== null ? g : {}) as Record<string, any>
    const name = typeof guest === 'string' ? guest.trim() : ''
    const title = typeof work?.title === 'string' ? work.title.trim() : ''
    if (!name || !title) throw new Error(`Past guest ${i + 1} needs a name and a work title.`)
    if (!workTypes.includes(work.type))
      throw new Error(`Past guest ${i + 1}'s work needs a type: book, film, TV show, or podcast.`)
    const year = work.year ?? null
    if (year !== null && !(Number.isInteger(year) && year >= YEARS[0] && year <= YEARS[1]))
      throw new Error(`Past guest ${i + 1}'s year must be a whole year, such as 2024, or left empty.`)
    const personal = personalIn(title, [name])
    if (personal === 'email') throw new Error(`Past guest ${i + 1}'s work title holds an email address.`)
    if (personal === 'name')
      throw new Error(`Past guest ${i + 1}'s work title holds their name, so it isn't sent to Qloo.`)
    return { guest: name, work: { title, type: work.type, year } }
  })
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
