import type { Tool } from '.'
import { checkFinalists } from '../demographics'
import { finalistsOf } from '../fit'

type Input = { anchor_ids: string[]; candidate_ids: string[] }

const listed = (entities: { id: string; name: string }[]) => entities.map((e) => `${e.name}: ${e.id}`).join(', ')

// Checks the finalists' listeners against the launch's by age band and gender, in one Qloo call,
// and puts each finalist's mismatches in state. Like the ranking, the lists are closed: every
// anchor of the fit ranking and every finalist is checked, even if the model left one out, and an
// ID that isn't one is refused. A flag marks a finalist; it never removes it.
export const checkDemographics: Tool<Input> = {
  definition: {
    name: 'check_demographics',
    description:
      "Checks whether the finalists' listeners differ from the launch's by age band or gender, in one Qloo call covering the anchors and every finalist. The launch profile is the anchor's demographics, or with comps their mean per age band and gender. A finalist is flagged when its listeners under-index on one of the launch's two most over-indexed age bands, or skew to the other gender when both skews are strong. Returns the launch profile in words, then per finalist the flag, the reasons in words, and the deltas from the launch profile per age band and in male skew; and the call number. A flag never removes a finalist.",
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        anchor_ids: {
          type: 'array',
          items: { type: 'string' },
          description: "Qloo IDs of the fit ranking's anchors: the launch, or its comps."
        },
        candidate_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Qloo IDs of the finalists, as the latest ranking or exclusions answer lists them.'
        }
      },
      required: ['anchor_ids', 'candidate_ids'],
      additionalProperties: false
    }
  },
  note: (_, state) => {
    const anchors = state.ranking?.anchors.map((a) => a.name).join(', ') ?? 'the launch'
    return `Checking demographics of ${finalistsOf(state.ranking).length} finalists against ${anchors}`
  },
  async run({ anchor_ids, candidate_ids }, { qloo, state, update }) {
    const now = state()
    const ranking = now.ranking
    if (!ranking || ranking.error)
      return {
        isError: true,
        content:
          'There is no fit ranking to check yet. Rank the roster with rank_candidates first, then call check_demographics with its anchors and finalists.'
      }
    const unknownAnchors = anchor_ids.filter((id) => !ranking.anchors.some((a) => a.id === id))
    if (unknownAnchors.length > 0)
      return {
        isError: true,
        content: `${unknownAnchors.join(', ')} isn't an anchor of the fit ranking ${ranking.call}. Call again with its anchors: ${listed(ranking.anchors)}.`
      }
    const finalists = finalistsOf(ranking)
    if (finalists.length === 0)
      return {
        isError: true,
        content: `The fit ranking ${ranking.call} has no finalists to check. Say so and go on to the next step.`
      }
    const unknown = candidate_ids.filter((id) => !finalists.some((r) => r.entity.id === id))
    if (unknown.length > 0)
      return {
        isError: true,
        content: `${unknown.join(', ')} isn't a finalist of the fit ranking ${ranking.call}. Call again with the finalists: ${listed(finalists.map((r) => ({ id: r.entity.id, name: r.show })))}.`
      }

    const { call, result } = await qloo((gateway) =>
      gateway.demographics([...ranking.anchors, ...finalists.map((r) => r.entity)])
    )
    const { check, finalists: checked } = checkFinalists(ranking, call, result)
    update((state) => ({ ...state, demographics: check }))
    if (check.error)
      return {
        isError: true,
        content: `The demographic check ${call} failed: ${check.error}. Don't call check_demographics again in this run. Say the finalists' demographics weren't checked, and why, citing ${call}.`
      }
    const { from, ages, skew, disagree } = check.profile!
    return {
      content: JSON.stringify({
        call,
        launchProfile: {
          meanOf: from,
          noDemographics: ranking.anchors.filter((a) => !from.includes(a.name)).map((a) => a.name),
          topAgeBands: ages,
          genderSkew: skew,
          disagree
        },
        finalists: checked,
        notChecked: check.rows
          .filter((r) => r.reasons === null)
          .map((r) => ({ show: r.show, reason: 'Qloo returned no demographics for it' }))
      })
    }
  }
}
