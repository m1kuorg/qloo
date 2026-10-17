import type { Tool } from '.'
import type { State } from '../agent'
import { markFinalists, rankRoster, scorable, type Anchor } from '../fit'
import { withMoves } from '../topic'

type Input = { anchor_ids: string[]; candidate_ids: string[]; type: 'urn:entity:podcast' }

// The entities a run can anchor on, by ID: the launch's match, the comps the programmer confirmed,
// and the roster's matches, so an anchor is always something this session resolved, never an
// invented ID, and never a comp before the programmer confirmed it.
function knownEntities({ launch, roster }: State) {
  const known = new Map<string, string>()
  if (launch?.match?.entity) known.set(launch.match.entity.id, launch.match.entity.name)
  for (const c of launch?.comps ?? []) if (c.status === 'confirmed' && c.entity) known.set(c.entity.id, c.entity.name)
  for (const s of roster) if (s.entity) known.set(s.entity.id, s.entity.name)
  return known
}

// The roster shows a ranking against these anchors scores: an anchor that is itself a roster show,
// such as a launch from the network's own roster, isn't ranked against itself.
const candidates = (state: State, anchorIds: string[]) =>
  state.roster.filter(scorable).filter((s) => !anchorIds.includes(s.entity.id))

// Ranks the roster by listener overlap with the launch, in one Qloo call, and puts the chart in
// state. The roster is the closed list, so every scorable show is ranked even if the model left
// one out; an ID that isn't a roster show is refused.
export const rankCandidates: Tool<Input> = {
  definition: {
    name: 'rank_candidates',
    description:
      "Ranks the network's roster shows by how much their listeners overlap the anchors' listeners, in one Qloo call with every anchor in one signal. The anchors are the launch's Qloo ID, or its comps' IDs. Every roster show that can be ranked is ranked; an anchor that is itself a roster show isn't ranked against itself. Returns each show's fit rank, its band (top, middle, or bottom third of the ranking), its raw affinity, each anchor's share of its score, the leading comp when one clearly drove it, and whether it is one of the five finalists; then the roster shows not scored, with the reason; and the call number.",
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        anchor_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Qloo IDs of the launch, or of its comps, as resolve_entities returned them.'
        },
        candidate_ids: {
          type: 'array',
          items: { type: 'string' },
          description: "Qloo IDs of the roster shows to rank: every ID the run's first message lists."
        },
        type: {
          type: 'string',
          enum: ['urn:entity:podcast'],
          description: 'What the candidates are: roster shows are podcasts.'
        }
      },
      required: ['anchor_ids', 'candidate_ids', 'type'],
      additionalProperties: false
    }
  },
  note: ({ anchor_ids }, state) => {
    const known = knownEntities(state)
    const names = anchor_ids.map((id) => known.get(id) ?? id).join(', ')
    const count = candidates(state, anchor_ids).length
    return `Scoring ${count} ${count === 1 ? 'show' : 'shows'} against ${names}`
  },
  async run({ anchor_ids, candidate_ids, type }, { qloo, state, update }) {
    if (anchor_ids.length === 0)
      return { isError: true, content: "No anchor was given. Call again with the launch's Qloo ID as the anchor." }
    const now = state()
    const known = knownEntities(now)
    const unknownAnchors = anchor_ids.filter((id) => !known.has(id))
    if (unknownAnchors.length > 0)
      return {
        isError: true,
        content: `${unknownAnchors.join(', ')} isn't the launch, a comp the programmer confirmed, or a roster show this session resolved. Call again with the launch's Qloo ID from resolve_entities, or every confirmed comp's Qloo ID, as the anchors.`
      }
    const rosterIds = new Set(now.roster.flatMap((s) => (s.entity ? [s.entity.id] : [])))
    const unknown = candidate_ids.filter((id) => !rosterIds.has(id))
    if (unknown.length > 0)
      return {
        isError: true,
        content: `${unknown.join(', ')} isn't a roster show. Call again with the IDs the run's first message lists.`
      }
    const anchors: Anchor[] = [...new Set(anchor_ids)].map((id) => ({ id, name: known.get(id)! }))
    const shows = candidates(now, anchor_ids)
    if (shows.length === 0)
      return {
        isError: true,
        content:
          'No roster show can be ranked: none is matched in Qloo and included, apart from the anchors. Stop and say the programmer must import a roster or settle its shows first.'
      }

    const { call, result } = await qloo((gateway) =>
      gateway.rank(
        anchor_ids,
        shows.map((s) => s.entity.id),
        type
      )
    )
    const ranking = markFinalists(
      rankRoster(now.roster, anchors, now.launch?.match?.entity?.id ?? null, call, result),
      now.run?.exclusions ?? []
    )
    update((state) => withMoves({ ...state, ranking }))
    if (!result.ok)
      return {
        isError: true,
        content: `The ranking ${call} failed: ${result.error}. Don't call rank_candidates again in this run. Stop and say the roster couldn't be ranked, and why, citing ${call}.`
      }
    const scores = new Map(result.data.scored.map((s) => [s.id, s]))
    const name = (id: string) => anchors.find((a) => a.id === id)?.name ?? id
    return {
      content: JSON.stringify({
        call,
        anchors,
        ranked: ranking.rows.map(({ rank, show, entity, band, leadingComp, finalist }) => ({
          rank,
          show,
          id: entity.id,
          band,
          affinity: scores.get(entity.id)!.affinity,
          shares: scores.get(entity.id)!.explainability.map((x) => ({ anchor: name(x.id), share: x.score })),
          leadingComp: leadingComp?.name ?? null,
          finalist
        })),
        notScored: ranking.notScored
      })
    }
  }
}
