import type { Tool } from '.'
import { lookup, sameName, type Lookup } from '../resolve'

const types = ['urn:entity:podcast', 'urn:entity:book', 'urn:entity:movie', 'urn:entity:tv_show'] as const

type Input = { names: string[]; type: (typeof types)[number] }

// Looks names up in Qloo search. A name that is the run's launch, or one of its comps, also becomes
// that one's match, which the launch header shows; a comp's new match needs confirming again.
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
    // All at once, numbered in the order given: the gateway paces and limits the calls.
    const results = await Promise.all(
      names.map(async (name): Promise<{ name: string } & Lookup> => {
        const { call, result } = await qloo((gateway) => gateway.search(name, type))
        const match = lookup(name, call, result)
        update((state) => {
          const launch = state.launch
          if (launch?.name && sameName(launch.name, name)) return { ...state, launch: { ...launch, match } }
          if (!launch?.comps.some((c) => sameName(c.name, name))) return state
          const comps = launch.comps.map((c) =>
            sameName(c.name, name) ? { ...c, match, status: 'unconfirmed' as const, entity: null } : c
          )
          return { ...state, launch: { ...launch, comps } }
        })
        return { name, ...match }
      })
    )
    const failed = results.filter((r) => r.resolution === 'failed')
    if (failed.length === 0) return { content: JSON.stringify(results) }
    return {
      isError: true,
      content: `The Qloo lookup failed for ${failed.map((r) => `"${r.name}" (${r.error})`).join(', ')}. Call resolve_entities again with only the failed names. If it fails again, stop and say which names couldn't be looked up. All results: ${JSON.stringify(results)}`
    }
  }
}
