import type { Tool } from '.'
import type { State } from '../agent'
import type { SharedTags } from '../fit'
import type { SharedTag } from '../gateway'

type Input = { anchor_ids: string[]; candidate_ids: string[] }

// Tags every podcast pair shares, which say nothing about where two shows' listeners overlap.
const STOPLIST = ['podcasts', 'podcast']
// Tags kept per finalist. Qloo's scores sit within about 0.03 of each other, so the tags are used
// as words in Qloo's order, never ranked by score.
const TOP_TAGS = 5

// A finalist's tags as words: generic ones dropped, and a name Qloo lists under two subtypes once.
const words = (tags: SharedTag[]) =>
  [...new Set(tags.map((t) => t.name))].filter((name) => !STOPLIST.includes(name.toLowerCase())).slice(0, TOP_TAGS)

const finalists = (state: State) => state.ranking?.rows.filter((r) => r.finalist) ?? []

// Compares each finalist with the ranking's anchors, one Qloo call per finalist, all at once, and
// puts each finalist's shared tags on its chart row.
export const sharedTags: Tool<Input> = {
  definition: {
    name: 'shared_tags',
    description:
      "Finds the tags each finalist's listeners share with the anchors' listeners, in one Qloo compare call per finalist, run at once, with every anchor in one signal. The anchors are the ones rank_candidates used. Every finalist is compared, even one left out of candidate_ids. Returns each finalist's shared tags as words, with generic tags such as Podcasts dropped, and each compare's call number.",
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        anchor_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Qloo IDs of the anchors rank_candidates used: the launch, or its comps.'
        },
        candidate_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Qloo IDs of the finalists, as rank_candidates returned them.'
        }
      },
      required: ['anchor_ids', 'candidate_ids'],
      additionalProperties: false
    }
  },
  note: (_input, { ranking }) =>
    ranking
      ? `Finding the tags ${ranking.rows.filter((r) => r.finalist).length} finalists share with ${ranking.anchors.map((a) => a.name).join(', ')}`
      : 'Finding shared tags',
  async run({ anchor_ids, candidate_ids }, { qloo, state, update }) {
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
    const rows = finalists(state())
    const ids = [...new Set(rows.map((r) => r.entity.id))]
    const unknown = candidate_ids.filter((id) => !ids.includes(id))
    if (unknown.length > 0)
      return {
        isError: true,
        content: `${unknown.join(', ')} isn't a finalist of the ranking ${ranking.call}. Call again with the finalists' IDs from rank_candidates.`
      }
    const found = new Map<string, SharedTags>(
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
    const content = JSON.stringify({ finalists: out })
    const failed = out.filter((f) => f.error)
    if (failed.length === 0) return { content }
    // A partial result is still an error, so the run's note says a compare failed.
    return {
      isError: true,
      content: [
        ...failed.map(
          (f) =>
            `The compare ${f.call} for ${f.show} failed: ${f.error}. Don't call shared_tags again in this run: draft that finalist's angle without shared tags and say they're missing, citing ${f.call}.`
        ),
        `The finalists' shared tags: ${content}`
      ].join('\n')
    }
  }
}
