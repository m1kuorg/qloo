import type { Tool } from '.'
import { tagged, type SharedTags } from '../fit'
import type { PitchReply, Verdict } from '../inbox'
import { CLOSING_WORDS } from '../prompt'

type Input = { replies: { pitch: string; verdict: Verdict; angle: string | null; draft: string }[] }

// Stores the guest pitch run's draft replies, one per pitch, each with the agent's verdict. Only the
// booker approves, edits, or discards a reply, through the UI, and sends it themselves.
export const draftReplies: Tool<Input> = {
  definition: {
    name: 'draft_replies',
    description:
      "Stores a draft reply to each pitch named, with your verdict: book, decline, or later, and, for a top pitch whose work shared_tags returned shared tags for, its episode angle. A call replaces the drafts for the pitches it names and keeps the others, so the replies can be drafted over several calls. An unknown pitch, a pitch named twice, an empty draft, or an angle for a pitch shared_tags returned no tags for is rejected with what to fix, and nothing is stored. The booker approves, edits, or discards each reply in the UI and sends it themselves; you can't. Returns how many were stored and the pitches still without a reply.",
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        replies: {
          type: 'array',
          description: 'One reply per pitch.',
          items: {
            type: 'object',
            properties: {
              pitch: { type: 'string', description: "The pitch's ID, such as pitch-07." },
              verdict: {
                type: 'string',
                enum: ['book', 'decline', 'later'],
                description: 'Book the guest, decline the pitch, or come back to it later.'
              },
              angle: {
                type: ['string', 'null'],
                description:
                  'For a top pitch, one or two sentences on the episode its work could make for the show, built only from the tags shared_tags returned for it. Null for a top pitch it returned no tags for, and for any other pitch.'
              },
              draft: {
                type: 'string',
                description:
                  "The reply to the pitch's sender, ready to send: two to four plain sentences, with no greeting name, signature, rank, band, score, call number, or year."
              }
            },
            required: ['pitch', 'verdict', 'angle', 'draft'],
            additionalProperties: false
          }
        }
      },
      required: ['replies'],
      additionalProperties: false
    }
  },
  // A reply to a pitch that already has one replaces it, so the log's figures add up to the Replies count.
  // A batch names the replies it brings in, counting from those already stored, so no two read alike (#291).
  note: ({ replies }, { booking, inbox }) => {
    const drafted = new Set((booking?.replies ?? []).map((r) => r.pitch))
    const pitches = new Set(replies.map((r) => r.pitch))
    const redrafts = [...pitches].filter((p) => drafted.has(p)).length
    const fresh = pitches.size - redrafts
    const n = (count: number) => `${count} ${count === 1 ? 'reply' : 'replies'}`
    if (fresh === 0 && redrafts > 0) return `Redrafting ${n(redrafts)}`
    const first = drafted.size + 1
    const last = drafted.size + fresh
    const total = inbox?.pitches.length ?? 0
    // A call that drafts every reply at once says how many, as does an empty call and one the tool
    // refuses for having no inbox or naming more pitches than the inbox has left.
    const which =
      fresh === 0 || last > total || (first === 1 && last === total)
        ? n(fresh)
        : `${first === last ? `reply ${last}` : `replies ${first} to ${last}`} of ${total}`
    return redrafts === 0 ? `Drafting ${which}` : `Drafting ${which} and redrafting ${redrafts}`
  },
  // Skipped batches follow on from each other in the turn limit's message, as the Run tab's do (#335).
  // Nothing is checked or stored, and only the pitches are filled in, since the note reads nothing else.
  asIfStored: ({ replies }, state) => {
    const { booking } = state
    if (!booking) return state
    const named = replies.map((r) => ({ pitch: r.pitch }) as PitchReply)
    return { ...state, booking: { ...booking, replies: [...(booking.replies ?? []), ...named] } }
  },
  async run({ replies }, { run, state, update }) {
    const { booking, inbox } = state()
    if (booking?.run !== run || !inbox)
      return {
        isError: true,
        content: "This isn't a guest pitch run, so there are no pitches to reply to. Don't call draft_replies again."
      }
    if (!booking.lists)
      return { isError: true, content: "The pitches aren't ranked yet. Call rank_pitches before drafting replies." }
    // shared_tags compares every top pitch at once, so one without a compare means it hasn't run.
    if (booking.lists.some((l) => l.rows.some((r) => r.band === 'top' && !r.sharedTags)))
      return {
        isError: true,
        content:
          "The top pitches' shared tags haven't been found yet, and an episode angle is built only from them. Call shared_tags first, then draft the replies."
      }
    // The top pitches' compares, by pitch: an angle is built only from one that returned tags (#216).
    const compared = new Map<string, SharedTags>(
      booking.lists.flatMap((l) => l.rows.flatMap((r) => (r.sharedTags ? [[r.pitch, r.sharedTags] as const] : [])))
    )
    const problems: string[] = []
    const ids = replies.map((r) => r.pitch)
    const unknown = ids.filter((id) => !inbox.pitches.some((p) => p.id === id))
    if (unknown.length > 0) problems.push(`${unknown.join(', ')} isn't a pitch in the inbox.`)
    const twice = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))]
    if (twice.length > 0) problems.push(`${twice.join(', ')} has more than one reply; give each pitch one.`)
    const empty = replies.filter((r) => !r.draft.trim()).map((r) => r.pitch)
    if (empty.length > 0) problems.push(`The draft for ${empty.join(', ')} is empty.`)
    const ungrounded = replies.filter((r) => r.angle?.trim() && !tagged(compared.get(r.pitch))).map((r) => r.pitch)
    if (ungrounded.length > 0)
      problems.push(
        `${ungrounded.join(', ')} has no shared tags from shared_tags to build an angle from, so give it a null angle.`
      )
    if (problems.length > 0)
      return {
        isError: true,
        content: `${problems.join(' ')} Nothing was stored. Fix the replies and call draft_replies again.`
      }

    const drafted = new Map(
      replies.map((r): [string, PitchReply] => {
        const angle = r.angle?.trim() || null
        return [
          r.pitch,
          {
            pitch: r.pitch,
            verdict: r.verdict,
            angle,
            sharedTags: compared.get(r.pitch) ?? null,
            draft: r.draft.trim(),
            status: 'draft'
          }
        ]
      })
    )
    // In inbox order, keeping the drafts this call doesn't replace.
    const merged = (earlier: PitchReply[] | null) => {
      const kept = new Map((earlier ?? []).map((r) => [r.pitch, r]))
      return inbox.pitches.flatMap((p) => {
        const reply = drafted.get(p.id) ?? kept.get(p.id)
        return reply ? [reply] : []
      })
    }
    update((s) =>
      s.booking?.run === run ? { ...s, booking: { ...s.booking, replies: merged(s.booking.replies) } } : s
    )
    // The run's drafts as stored now, every call included, so the counts never need adding up.
    const all = state().booking?.replies ?? []
    const replied = new Set(all.map((r) => r.pitch))
    const missing = inbox.pitches.filter((p) => !replied.has(p.id)).map((p) => p.id)
    const count = (v: Verdict) => all.filter((r) => r.verdict === v).length
    const verdictsSoFar = { book: count('book'), later: count('later'), decline: count('decline') }
    return {
      content: JSON.stringify({
        stored: replies.length,
        verdictsSoFar,
        withoutReply: missing,
        next: missing.length
          ? `Draft replies for ${missing.join(', ')} too. verdictsSoFar already counts every call so far, so never add results together.`
          : `Every pitch has a draft reply: ${verdictsSoFar.book} book, ${verdictsSoFar.later} later, and ${verdictsSoFar.decline} decline, counting every call. The booker approves, edits, or discards each reply in the UI. Now end the run in under ${CLOSING_WORDS} words: give these counts and cite the ranking calls. Don't list, name, or count the pitches that weren't scored or matched, since the lists name them, and never write a pitch ID or a tool's name.`
      })
    }
  }
}
