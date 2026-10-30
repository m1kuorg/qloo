import Anthropic from '@anthropic-ai/sdk'
import { system } from './prompt'
import { toolDefinitions } from './tools'

const model = 'claude-haiku-5-5'

function client(env: Env) {
  return new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    baseURL: env.ANTHROPIC_BASE_URL,
    // The SDK keeps the fetch it's built with; looking the global up per call lets test fakes see it.
    fetch: (...args) => fetch(...args)
  })
}

// One turn of the agent loop, with the TRD's model settings. Thinking is adaptive by default and
// sampling parameters are left out, since this model rejects any but the defaults. The frozen
// system prompt and sorted tools sit before a cache breakpoint; the top-level breakpoint caches the
// conversation so far.
export function claude(env: Env) {
  const anthropic = client(env)
  return (messages: Anthropic.MessageParam[]) =>
    anthropic.messages
      .stream({
        model,
        max_tokens: 16_000,
        output_config: { effort: 'medium' },
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        cache_control: { type: 'ephemeral' },
        tools: toolDefinitions,
        tool_choice: { type: 'auto' },
        messages
      })
      .finalMessage()
}

// What Claude declined to do, such as "read this pitch", with the safety category when the reply
// gives one. A refusal has no server-side fallback on this model, so the caller shows it.
export function declined(reply: Anthropic.Message, what: string) {
  const category = reply.stop_details?.type === 'refusal' ? reply.stop_details.category : null
  return `Claude declined to ${what}${category ? ` (safety category: ${category})` : ''}`
}

// A single call beside the agent loop, such as reading a pitch: low effort, and a reply that
// follows `schema` (TRD other model calls). The caller checks `stop_reason` before parsing.
export function structured(env: Env, instructions: string, schema: Record<string, unknown>) {
  const anthropic = client(env)
  return (input: string) =>
    anthropic.messages
      .stream({
        model,
        max_tokens: 16_000,
        output_config: { effort: 'low', format: { type: 'json_schema', schema } },
        system: instructions,
        messages: [{ role: 'user', content: input }]
      })
      .finalMessage()
}

// What a ranking call answered: every name once, best first, or why there's no ranking.
export type NameRanking = { status: 'ranked' | 'refused' | 'failed'; order: string[]; error: string | null }

// One structured call that ranks `names`, the topic baseline's and the pitch ranking's (topic.ts,
// pitch-ranking.ts), and checks that its answer ranks every name exactly once. `task` is what Claude
// was asked, as a refusal words it ("rank the roster by topic"), and `noun` what it ranks ("roster shows").
export async function rankNames(
  env: Env,
  instructions: string,
  { names, input }: { names: string[]; input: string },
  { task, noun }: { task: string; noun: string }
): Promise<NameRanking> {
  if (names.length === 0) return { status: 'ranked', order: [], error: null } // nothing to rank
  const schema = {
    type: 'object',
    properties: { ranking: { type: 'array', items: { type: 'string', enum: names } } },
    required: ['ranking'],
    additionalProperties: false
  }
  const failed = (error: string) => ({ status: 'failed' as const, order: [], error })
  let reply
  try {
    reply = await structured(env, instructions, schema)(input)
  } catch (e) {
    return failed(`The request to Claude failed: ${e instanceof Error ? e.message : String(e)}`)
  }
  // A refused reply may not follow the schema, so the stop reason is checked before the text.
  if (reply.stop_reason === 'refusal') return { status: 'refused', order: [], error: declined(reply, task) }
  if (reply.stop_reason !== 'end_turn') return failed(`Claude stopped early (${reply.stop_reason})`)
  let order: string[]
  try {
    order = JSON.parse(reply.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')).ranking
  } catch {
    return failed("Claude's reply wasn't the JSON it was asked for")
  }
  // The schema can't require every name once, so a short or repeating list is caught here.
  if (order.length !== names.length || new Set(order).size !== names.length)
    return failed(`Claude ranked ${new Set(order).size} of the ${names.length} ${noun}, not all of them`)
  return { status: 'ranked', order, error: null }
}
