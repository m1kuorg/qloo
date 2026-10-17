import type { Tool, ToolContext } from '.'
import type { State } from '../agent'
import { listPitches, rankable, type Anchor, type PitchList } from '../fit'
import { qlooType, workNoun, workTypes, type Pitch, type WorkType } from '../inbox'

type Input = { show_id: string; past_guest_work_ids: string[]; pitch_ids: string[] }

// The past guests' works that resolved, by ID: the only works a pitch ranking can anchor on.
const pastWorks = (state: State) =>
  new Map(
    (state.booking?.pastGuests ?? []).flatMap((g) =>
      g.match?.resolution === 'resolved' && g.match.entity
        ? [[g.match.entity.id, { ...g.match.entity, type: g.work.type }]]
        : []
    )
  )

// Ranks the inbox's pitched works against the show and its past guests' works, one Qloo call per work
// type, and puts the lists in state. The inbox is the closed list, so every pitch that can be ranked
// is ranked even if the model left one out, and a pitch set aside never reaches Qloo.
export const rankPitches: Tool<Input> = {
  definition: {
    name: 'rank_pitches',
    description:
      "Ranks the guest pitch run's pitched works by how much their audiences overlap the show's listeners, with the show and the past guests' works as anchors in one signal. Pitches are grouped by work type, one Qloo call per type, because scores from separate calls can't be compared. If Qloo scores no work of a type against those anchors, that type is ranked again against only the past guests' works of the same type, or left unranked when there are none. Every pitch that can be ranked is ranked, and set-aside pitches never are. Returns one list per type: how it was ranked, its anchors and call numbers, each pitch's rank and band (top, middle, or bottom third of its own list), and the pitches not scored with the reason.",
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        show_id: { type: 'string', description: "The show's Qloo ID, from the run's first message." },
        past_guest_work_ids: {
          type: 'array',
          items: { type: 'string' },
          description: "Qloo IDs of the past guests' works that resolved, from the run's first message."
        },
        pitch_ids: {
          type: 'array',
          items: { type: 'string' },
          description: "IDs of the pitches to rank, such as pitch-07: every one the run's first message lists."
        }
      },
      required: ['show_id', 'past_guest_work_ids', 'pitch_ids'],
      additionalProperties: false
    }
  },
  note: (_input, { booking, inbox }) => {
    const n = inbox?.pitches.filter(rankable).length ?? 0
    return `Ranking ${n} pitched works against ${booking?.show.name ?? 'the show'}`
  },
  async run({ show_id, past_guest_work_ids, pitch_ids }, { run, qloo, state, update }) {
    const now = state()
    const booking = now.booking
    if (booking?.run !== run || !now.inbox)
      return {
        isError: true,
        content: "This isn't a guest pitch run, so there are no pitches to rank. Don't call rank_pitches again."
      }
    const show = booking.show.entity
    if (show_id !== show.id)
      return { isError: true, content: `${show_id} isn't the show. Call again with the show's Qloo ID, ${show.id}.` }
    const works = pastWorks(now)
    const unknownWorks = past_guest_work_ids.filter((id) => !works.has(id))
    if (unknownWorks.length > 0)
      return {
        isError: true,
        content: `${unknownWorks.join(', ')} isn't a past guest's work that resolved. Call again with the IDs the run's first message lists.`
      }
    const unknownPitches = pitch_ids.filter((id) => !now.inbox!.pitches.some((p) => p.id === id))
    if (unknownPitches.length > 0)
      return {
        isError: true,
        content: `${unknownPitches.join(', ')} isn't a pitch in the inbox. Call again with the pitch IDs the run's first message lists.`
      }

    const anchors: Anchor[] = [
      { id: show.id, name: show.name },
      ...[...new Set(past_guest_work_ids)]
        .filter((id) => id !== show.id)
        .map((id) => ({ id, name: works.get(id)!.name }))
    ]
    // Set-aside pitches have no work to rank; a read pitch whose work didn't match is listed as not scored.
    const read = now.inbox.pitches.filter((p) => p.status === 'read' && p.work)
    const types = workTypes.filter((t) => read.some((p) => p.work!.type === t))
    const sameType = (type: WorkType) => anchors.filter((a) => works.get(a.id)?.type === type)
    const lists = await Promise.all(
      types.map((type) =>
        rankType(
          type,
          read.filter((p) => p.work!.type === type),
          anchors,
          sameType(type),
          qloo
        )
      )
    )
    update((s) => (s.booking?.run === run ? { ...s, booking: { ...s.booking, lists } } : s))
    const title = (id: string) => now.inbox!.pitches.find((p) => p.id === id)?.work?.title
    return {
      content: JSON.stringify(
        lists.map((l) => ({
          type: l.type,
          path: l.path,
          anchors: l.anchors.map((a) => a.name),
          calls: l.calls,
          error: l.error,
          ranked: l.rows.map((r) => ({ rank: r.rank, pitch: r.pitch, work: title(r.pitch), band: r.band })),
          notScored: l.notScored.map((n) => ({ ...n, work: title(n.pitch) }))
        }))
      )
    }
  }
}

// One type's list: ranked against the show and the past guests' works, or, when Qloo scores none of
// them, against only the past guests' works of the same type.
async function rankType(
  type: WorkType,
  pitches: Pitch[],
  anchors: Anchor[],
  sameType: Anchor[],
  qloo: ToolContext['qloo']
): Promise<PitchList> {
  const noun = workNoun[type]
  const candidates = [...new Set(pitches.filter(rankable).map((p) => p.match.entity.id))].filter(
    (id) => !anchors.some((a) => a.id === id)
  )
  if (candidates.length === 0)
    return listPitches(type, pitches, { path: 'unranked', anchors, calls: [] }, `No pitched ${noun} is matched in Qloo`)
  const rank = (on: Anchor[]) =>
    qloo((gateway) =>
      gateway.rank(
        on.map((a) => a.id),
        candidates,
        qlooType[type]
      )
    )
  const first = await rank(anchors)
  if (first.result.ok)
    return listPitches(type, pitches, { path: 'show', anchors, calls: [first.call] }, first.result.data.scored)
  if (!first.result.unscored)
    return listPitches(
      type,
      pitches,
      { path: 'unranked', anchors, calls: [first.call] },
      `The ranking ${first.call} failed: ${first.result.error}`
    )
  if (sameType.length === 0)
    return listPitches(
      type,
      pitches,
      { path: 'unranked', anchors, calls: [first.call] },
      `Qloo scored no ${noun} against the show and its past guests (${first.call}), and no past guest's work is a ${noun} to rank against instead`
    )
  const second = await rank(sameType)
  const calls = [first.call, second.call]
  if (second.result.ok)
    return listPitches(type, pitches, { path: 'same_type', anchors: sameType, calls }, second.result.data.scored)
  const why = second.result.unscored
    ? `or against the past guests' ${noun}s alone (${second.call})`
    : `and the ranking against the past guests' ${noun}s alone (${second.call}) failed: ${second.result.error}`
  return listPitches(
    type,
    pitches,
    { path: 'unranked', anchors: sameType, calls },
    `Qloo scored no ${noun} against the show and its past guests (${first.call}), ${why}`
  )
}
