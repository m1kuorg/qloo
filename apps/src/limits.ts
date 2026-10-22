// The agent's run limits (TRD agent limits), shared by the agent and the UI. Per run, so runs stay
// bounded and comparable: model turns, then Qloo calls, cache hits included.
import type { Run } from './agent'

export const MAX_TURNS = 12
export const MAX_QLOO_CALLS = 60
// Released shows standing in for an unreleased launch, all scored in one signal (PRD story 12).
export const MAX_COMPS = 3
// A show's past guests anchor its pitch rankings, each one more Qloo search per pitch run.
export const MAX_PAST_GUESTS = 5

// The longest text the agent takes from a person, an API key, or Claude, checked before anything reads
// it, so no pattern runs long on it: a title or a name, such as a launch's, a comp's, a work's, or a
// guest's; a typed answer to the agent's question; and an insertion order line's angle.
export const MAX_TITLE = 200
export const MAX_ANSWER = 2_000
export const MAX_ANGLE = 500

// Whether run `id` is the latest run and the agent is still working on it, or waiting on an answer:
// until it ends, its insertion order and replies are the agent's to redraft, not the human's to edit.
export const inProgress = (latest: Pick<Run, 'id' | 'status'> | null, id: string) =>
  latest?.id === id && (latest.status === 'running' || latest.status === 'waiting')
