// The booker's inbox of guest pitches: pitches pasted in, or the pitches of uploaded email files,
// read into one row per pitch, or the sample inbox, which comes already read. Anything it can't take
// is refused with a message, so an inbox never loads in part, but for an uploaded pitch too long to
// read, which is skipped and named.
import type { PitchList, SharedTags } from './fit'
import { MAX_PAST_GUESTS } from './limits'
import { personalIn, type Candidate } from './resolve'
import { Refusal } from './refusal'
import sampleInbox from './sample-inbox.json'
import { listOf, MAX_TITLE } from './text'

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

// A search result for a work, with its year (and a book's author) and a line on what it is, to
// tell same-title works apart. Candidates synced before #128 have no `description`.
export type WorkCandidate = Candidate & { disambiguation: string | null; description: string | null }

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
  sample: boolean // the synthetic sample inbox, whose guests and works are labelled "sample"
  uploaded?: true // read from uploaded email files rather than pasted
  skipped?: Skipped[] // uploaded pitches left out, each named and why; absent when none was
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
  // An edit or a discard changed a reply since the agent drafted them, so the run's closing line,
  // Claude's words as the run completed, may give counts the replies no longer have (#213).
  repliesEdited?: true
}

export type Verdict = 'book' | 'decline' | 'later'

// A drafted reply to one pitch, with the agent's verdict. Only the booker approves, edits, or
// discards it, and only an approved reply can be copied out.
export type PitchReply = {
  pitch: string // the pitch's ID
  verdict: Verdict
  angle: string | null // the episode angle, for a top pitch whose work shares tags with the show in Qloo
  sharedTags: SharedTags | null // a top pitch's compare, which the angle is built from, or which found none
  draft: string
  status: 'draft' | 'approved' | 'discarded'
  approvedBy?: string // the member who approved it, on a network's agent; absent on an engine session's
}

// A pitch as an uploaded email gives it (upload.ts): its sender and subject, apart from its text.
export type PitchInput = Pick<Pitch, 'from' | 'subject' | 'body'>

// An uploaded pitch that couldn't be read, named by its subject, its sender, or its place in the
// upload, and why, in words that follow the name: "has no text".
export type Skipped = { pitch: string; why: string }

// Pasted text with pitches separated by lines of three or more dashes, or the pitches of uploaded
// files.
export type InboxSource = { text: string } | { pitches: PitchInput[] }

// Each pitch costs one model call and one Qloo search, and one ranking takes at most 50 works.
export const MAX_PITCHES = 50
export const MAX_PITCH_CHARS = 10_000

export function readInbox(
  source: unknown
): Pick<Inbox, 'sample' | 'uploaded' | 'skipped' | 'notice' | 'show' | 'pitches'> {
  const given = (typeof source === 'object' && source !== null ? source : {}) as Record<string, unknown>
  if (Array.isArray(given.pitches)) return readUploaded(given.pitches)
  if (typeof given.text !== 'string') throw new Refusal('invalid', 'Paste pitches or upload them.')
  const texts = splitPitches(given.text)
  if (texts.length === 0) throw new Refusal('unreadable', 'Paste at least one pitch.')
  if (texts.length > MAX_PITCHES)
    throw new Refusal(
      'unreadable',
      `${texts.length} pitches is over the ${MAX_PITCHES}-pitch limit. Paste ${MAX_PITCHES} or fewer.`
    )
  const long = texts.findIndex((t) => t.length > MAX_PITCH_CHARS)
  if (long >= 0)
    throw new Refusal(
      'unreadable',
      `Pitch ${long + 1} is over ${MAX_PITCH_CHARS.toLocaleString('en-US')} characters. Shorten it.`
    )
  return {
    sample: false,
    notice: null,
    show: null,
    pitches: texts.map((body, i) => pitch(pitchId(i), body))
  }
}

// The sample inbox as the guest network loads it (network-agent.ts): its show and past guests, and its
// pitches already read from each one's `expected` guest and work, so no model reads them. A pitch with a
// work waits on its search; one without is set aside.
export function readSampleInbox(): Pick<Inbox, 'sample' | 'notice' | 'show' | 'pitches'> {
  return {
    sample: true,
    notice: sampleInbox.notice,
    show: {
      name: sampleInbox.show.name,
      pastGuests: sampleInbox.show.pastGuests.map(({ guest, work }) => ({ guest, work: sampleWork(work) }))
    },
    pitches: sampleInbox.pitches.map(({ id, body, senderName, senderEmail, subject, expected }) => {
      const work = expected.work && sampleWork(expected.work)
      return {
        ...pitch(id, body, `${senderName} <${senderEmail}>`, subject),
        status: work ? 'looking_up' : 'no_work',
        guest: expected.guest,
        work
      }
    })
  }
}

// A work as the sample file gives it, whose type JSON leaves a string.
const sampleWork = (work: { title: string; type: string; year: number | null }): Work => ({
  ...work,
  type: work.type as WorkType
})

// Pitches pasted or kept in a text file, separated by lines of three or more dashes.
export const splitPitches = (text: string) =>
  text
    .split(/^[ \t]*-{3,}[ \t]*$/m)
    .map((t) => t.trim())
    .filter(Boolean)

// The pitches of uploaded files, as untrusted JSON. A pitch with no text, or too long to read, is
// skipped and named, so one such email doesn't sink the rest.
function readUploaded(given: unknown[]) {
  if (given.length === 0) throw new Refusal('unreadable', 'Upload at least one pitch.')
  if (given.length > MAX_PITCHES)
    throw new Refusal(
      'unreadable',
      `${given.length} pitches is over the ${MAX_PITCHES}-pitch limit. Upload ${MAX_PITCHES} or fewer.`
    )
  const kept: PitchInput[] = []
  const skipped: Skipped[] = []
  given.forEach((g, i) => {
    const { from, subject, body } = (typeof g === 'object' && g !== null ? g : {}) as Record<string, unknown>
    if (typeof body !== 'string') throw new Refusal('invalid', `Pitch ${i + 1} needs its text.`)
    const read = { from: textOrNull(from), subject: textOrNull(subject), body: body.trim() }
    const name = read.subject ?? read.from ?? `Pitch ${i + 1}`
    // Its sender and subject count, as Claude reads them with its text.
    const length = (read.from?.length ?? 0) + (read.subject?.length ?? 0) + read.body.length
    if (!read.body) skipped.push({ pitch: name, why: 'has no text' })
    else if (length > MAX_PITCH_CHARS)
      skipped.push({ pitch: name, why: `is over the ${MAX_PITCH_CHARS.toLocaleString('en-US')}-character limit` })
    else kept.push(read)
  })
  if (kept.length === 0)
    throw new Refusal(
      'unreadable',
      `No pitch here can be read: ${listOf(skipped.map((s) => `"${s.pitch}" ${s.why}`))}.`
    )
  return {
    sample: false,
    uploaded: true as const,
    ...(skipped.length > 0 && { skipped }),
    notice: null,
    show: null,
    pitches: kept.map((p, i) => pitch(pitchId(i), p.body, p.from, p.subject))
  }
}

// A trimmed string, or null for anything else or nothing at all.
const textOrNull = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

// The ID of the inbox's pitch at index `i`, such as "pitch-01".
const pitchId = (i: number) => `pitch-${String(i + 1).padStart(2, '0')}`

const YEARS = [1800, 2100]

// The past guests the booker named, each with their public work. A guest's name is needed because a
// book is matched by its author. Anything else is refused, so a run never starts on part of them.
export function readPastGuests(given: unknown): Omit<PastGuest, 'match'>[] {
  if (!Array.isArray(given)) throw new Refusal('invalid', "Name the show's best past guests and their public works.")
  if (given.length > MAX_PAST_GUESTS) throw new Refusal('invalid', `Name at most ${MAX_PAST_GUESTS} past guests.`)
  return given.map((g, i) => {
    const { guest, work } = (typeof g === 'object' && g !== null ? g : {}) as Record<string, any>
    const name = typeof guest === 'string' ? guest.trim() : ''
    const title = typeof work?.title === 'string' ? work.title.trim() : ''
    if (!name || !title) throw new Refusal('invalid', `Past guest ${i + 1} needs a name and a work title.`)
    if (name.length > MAX_TITLE)
      throw new Refusal('invalid', `Past guest ${i + 1}'s name is over ${MAX_TITLE} characters. Shorten it.`)
    if (title.length > MAX_TITLE)
      throw new Refusal('invalid', `Past guest ${i + 1}'s work title is over ${MAX_TITLE} characters. Shorten it.`)
    if (!workTypes.includes(work.type))
      throw new Refusal('invalid', `Past guest ${i + 1}'s work needs a type: book, film, TV show, or podcast.`)
    const year = work.year ?? null
    if (year !== null && !(Number.isInteger(year) && year >= YEARS[0] && year <= YEARS[1]))
      throw new Refusal('invalid', `Past guest ${i + 1}'s year must be a whole year, such as 2024, or left empty.`)
    const personal = personalIn(title, [name])
    if (personal === 'email') throw new Refusal('invalid', `Past guest ${i + 1}'s work title holds an email address.`)
    if (personal === 'name')
      throw new Refusal('invalid', `Past guest ${i + 1}'s work title holds their name, so it isn't sent to Qloo.`)
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
