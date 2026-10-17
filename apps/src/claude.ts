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
