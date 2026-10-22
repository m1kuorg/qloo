import type { Tool, ToolContext, ToolResult } from '.'
import type { State } from '../agent'
import { finalistsOf, type SharedTags } from '../fit'
import type { SharedTag } from '../gateway'
import type { Booking } from '../inbox'

type Input = { anchor_ids: string[]; candidate_ids: string[] }

// Tags every podcast pair shares, which say nothing about where two shows' listeners overlap.
const STOPLIST = ['podcasts', 'podcast']
// Tags kept per finalist. Qloo's scores sit within about 0.03 of each other, so the tags are used
// as words in Qloo's order, never ranked by score.
const TOP_TAGS = 5

// A finalist's tags as words: generic ones dropped, and a name Qloo lists under two subtypes once.
const words = (tags: SharedTag[]) =>
  [...new Set(tags.map((t) => t.name))].filter((name) => !STOPLIST.includes(name.toLowerCase())).slice(0, TOP_TAGS)

// A guest pitch run's top pitches: the top band of each type's list, the works an episode angle is
// proposed for.
const topPitches = (booking: Booking) =>
  (booking.lists ?? []).flatMap((l) => l.rows.filter((r) => r.band === 'top').map((r) => ({ ...r, type: l.type })))

const isPitchRun = (state: State) => state.run !== null && state.booking?.run === state.run.id

// Compares each entity with the anchors, one Qloo call per entity, all at once.
const compareAll = async (anchors: string[], ids: string[], qloo: ToolContext['qloo']) =>
  new Map<string, SharedTags>(
    await Promise.all(
      ids.map(async (id) => {
        const { call, result } = await qloo((gateway) => gateway.compare(anchors, id))
        const shared = result.ok
          ? { call, tags: words(result.data), error: null }
          : { call, tags: [], error: result.error }
        return [id, shared] as const
      })
    )
  )

// What the model gets back: each item's tags, and an error naming any compare that failed. A
// partial result is still an error, so the run's note says a compare failed.
function report<T extends SharedTags>(key: string, out: T[], name: (item: T) => string, noun: string): ToolResult {
  const content = JSON.stringify({ [key]: out })
  const failed = out.filter((f) => f.error)
  if (failed.length === 0) return { content }
  return {
    isError: true,
    content: [
      ...failed.map(
        (f) =>
          `The compare ${f.call} for ${name(f)} failed: ${f.error}. Don't call shared_tags again in this run: give that ${noun} a null angle, as an angle is built only from shared tags.`
      ),
      `The ${key}' shared tags: ${content}`
    ].join('\n')
  }
}

// Compares each finalist with the ranking's anchors, one Qloo call per finalist, all at once, and
// puts each finalist's shared tags on its chart row. In a guest pitch run it compares each top
// pitch's work with the show instead, and puts the tags on the pitch's list row.
export const sharedTags: Tool<Input> = {
  definition: {
    name: 'shared_tags',
    description:
      "Finds the tags each finalist's listeners share with the anchors' listeners, in one Qloo compare call per finalist, run at once, with every anchor in one signal. The anchors are the ones rank_candidates used. Every finalist is compared, even one left out of candidate_ids. In a guest pitch run, it compares each top pitch's work, the top band of each rank_pitches list, with the show alone instead: the show's Qloo ID is the only anchor, and the candidates are pitch IDs. Every top pitch is compared, even one left out. Returns each finalist's or top pitch's shared tags as words, with generic tags such as Podcasts dropped, and each compare's call number.",
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        anchor_ids: {
          type: 'array',
          items: { type: 'string' },
          description:
            "Qloo IDs of the anchors rank_candidates used: the launch, or its comps. In a guest pitch run, only the show's Qloo ID."
        },
        candidate_ids: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Qloo IDs of the finalists, as rank_candidates returned them. In a guest pitch run, the IDs of the top pitches, such as pitch-07.'
        }
      },
      required: ['anchor_ids', 'candidate_ids'],
      additionalProperties: false
    }
  },
  note: (_input, state) => {
    const { ranking, booking } = state
    if (isPitchRun(state))
      return `Finding the tags ${topPitches(booking!).length} top pitches share with ${booking!.show.name}`
    return ranking
      ? `Finding the tags ${finalistsOf(ranking).length} finalists share with ${ranking.anchors.map((a) => a.name).join(', ')}`
      : 'Finding shared tags'
  },
  async run(input, context) {
    if (context.state().booking?.run === context.run) return pitchTags(input, context)
    const { anchor_ids, candidate_ids } = input
    const { qloo, state, update } = context
    const { ranking } = state()
    if (!ranking)
      return {
        isError: true,
        content: "There's no fit ranking to take finalists from yet. Call rank_candidates first."
      }
    if (ranking.error)
      return {
        isError: true,
        content: `The ranking ${ranking.call} failed, so there are no finalists to compare. Stop and say so, citing ${ranking.call}.`
      }
    const anchors = ranking.anchors.map((a) => a.id)
    const given = new Set(anchor_ids)
    if (given.size !== anchors.length || !anchors.every((id) => given.has(id)))
      return {
        isError: true,
        content: `The anchors must be the ones the ranking ${ranking.call} used: ${anchors.join(', ')}. Call again with those as anchor_ids.`
      }
    const rows = finalistsOf(state().ranking)
    const ids = [...new Set(rows.map((r) => r.entity.id))]
    const unknown = candidate_ids.filter((id) => !ids.includes(id))
    if (unknown.length > 0)
      return {
        isError: true,
        content: `${unknown.join(', ')} isn't a finalist of the ranking ${ranking.call}. Call again with the finalists' IDs from rank_candidates.`
      }
    const found = await compareAll(anchors, ids, qloo)
    update((s) =>
      s.ranking?.call !== ranking.call
        ? s
        : {
            ...s,
            ranking: {
              ...s.ranking,
              rows: s.ranking.rows.map((r) =>
                r.finalist && found.has(r.entity.id) ? { ...r, sharedTags: found.get(r.entity.id)! } : r
              )
            }
          }
    )
    const out = rows.map((r) => ({ show: r.show, id: r.entity.id, ...found.get(r.entity.id)! }))
    return report('finalists', out, (f) => f.show, 'finalist')
  }
}

// A guest pitch run's episode angles: each top pitch's work compared with the show alone, for the
// tags it shares with the show's listeners. Only entity IDs reach Qloo, never a guest or pitch text.
async function pitchTags({ anchor_ids, candidate_ids }: Input, { run, qloo, state, update }: ToolContext) {
  const booking = state().booking!
  if (!booking.lists) return { isError: true, content: "The pitches aren't ranked yet. Call rank_pitches first." }
  const show = booking.show.entity.id
  if (new Set(anchor_ids).size !== 1 || anchor_ids[0] !== show)
    return {
      isError: true,
      content: `In a guest pitch run the show is the only anchor: ${show}. Call again with that as anchor_ids.`
    }
  const rows = topPitches(booking)
  const unknown = candidate_ids.filter((id) => !rows.some((r) => r.pitch === id))
  if (unknown.length > 0)
    return {
      isError: true,
      content: `${unknown.join(', ')} isn't a top pitch. Call again with the IDs of the pitches in the top band of each rank_pitches list${rows.length ? `: ${rows.map((r) => r.pitch).join(', ')}` : ''}.`
    }
  // Pitches of the same work share one compare.
  const found = await compareAll([show], [...new Set(rows.map((r) => r.entity.id))], qloo)
  update((s) =>
    s.booking?.run !== run || !s.booking.lists
      ? s
      : {
          ...s,
          booking: {
            ...s.booking,
            lists: s.booking.lists.map((l) => ({
              ...l,
              rows: l.rows.map((r) =>
                r.band === 'top' && found.has(r.entity.id) ? { ...r, sharedTags: found.get(r.entity.id)! } : r
              )
            }))
          }
        }
  )
  const out = rows.map((r) => ({ pitch: r.pitch, work: r.entity.name, type: r.type, ...found.get(r.entity.id)! }))
  return report('pitches', out, (f) => f.work, 'pitch')
}
