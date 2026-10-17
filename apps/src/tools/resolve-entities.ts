import type { Tool } from '.'
import { lookup, sameName, type Lookup } from '../resolve'

const types = ['urn:entity:podcast', 'urn:entity:book', 'urn:entity:movie', 'urn:entity:tv_show'] as const

type Input = { names: string[]; type: (typeof types)[number] }

// Looks names up in Qloo search. A name that is the run's launch also becomes the launch's match,
// which the launch header shows.
export const resolveEntities: Tool<Input> = {
  definition: {
    name: 'resolve_entities',
    description:
      'Looks names up in Qloo and says how each resolved: "resolved" to one entity, with its Qloo ID, name, and popularity percentile; "ambiguous", with up to three candidates; "missed", when Qloo has nothing by that name; or "failed", when the lookup itself failed. Each result cites the call number of its search. Pass every name of one type in a single call.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        names: { type: 'array', items: { type: 'string' }, description: 'The names, exactly as given.' },
        type: {
          type: 'string',
          enum: [...types],
          description: 'What the names are: urn:entity:podcast for shows, or a book, movie, or TV show.'
        }
      },
      required: ['names', 'type'],
      additionalProperties: false
    }
  },
  note: ({ names }) => `Resolving ${names.join(', ')}`,
  async run({ names, type }, { qloo, update }) {
    if (names.length === 0) return { isError: true, content: 'No names were given. Call again with at least one.' }
    // One search at a time: Qloo answers 429 to bursts. #35 moves pacing into the gateway.
    const results: ({ name: string } & Lookup)[] = []
    for (const name of names) {
      const { call, result } = await qloo((gateway) => gateway.search(name, type))
      const match = lookup(name, call, result)
      results.push({ name, ...match })
      update((state) =>
        state.launch?.name && sameName(state.launch.name, name)
          ? { ...state, launch: { ...state.launch, match } }
          : state
      )
    }
    const failed = results.filter((r) => r.resolution === 'failed')
    if (failed.length === 0) return { content: JSON.stringify(results) }
    return {
      isError: true,
      content: `The Qloo lookup failed for ${failed.map((r) => `"${r.name}" (${r.error})`).join(', ')}. Call resolve_entities again with only the failed names. If it fails again, stop and say which names couldn't be looked up. All results: ${JSON.stringify(results)}`
    }
  }
}
