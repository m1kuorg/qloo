import type Anthropic from '@anthropic-ai/sdk'
import type { State } from '../agent'
import type { QlooGateway, QlooResult } from '../gateway'
import { askHuman } from './ask-human'
import { rankCandidates } from './rank-candidates'
import { resolveEntities } from './resolve-entities'

// What a tool gets from the run that calls it.
export type ToolContext = {
  run: string
  call: string // this call's tool use ID
  // The session's one path to Qloo: it numbers the call and logs its evidence against the run.
  qloo: <T>(
    request: (gateway: DurableObjectStub<QlooGateway>) => Promise<QlooResult<T>>
  ) => Promise<{ call: string; result: QlooResult<T> }>
  // The synced state as it is now.
  state: () => State
  // Changes synced state; return the same object for no change.
  update: (change: (state: State) => State) => void
}

// What the model gets back. An error says what went wrong and what to do next.
export type ToolResult = { content: string; isError?: boolean }

// A tool the agent can call. Its definition is strict, so the model's input always matches the
// schema, which needs `additionalProperties: false` and every property required.
export type Tool<Input = any> = {
  definition: Anthropic.Tool & { strict: true }
  note: (input: Input, state: State) => string // the progress note while it runs, such as "Resolving The Big Picture"
  run: (input: Input, context: ToolContext) => Promise<ToolResult>
}

// Every tool the agent has. A tool ticket adds its tool here and fills its step in prompt.ts.
export const tools: Tool[] = [resolveEntities, rankCandidates, askHuman]

// The tool list every model call sends: sorted by name and never changed, so the cached prefix holds.
export const toolDefinitions: Anthropic.Tool[] = tools
  .map((t) => t.definition)
  .sort((a, b) => (a.name < b.name ? -1 : 1))
