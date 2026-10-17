// The agent's run limits (TRD agent limits), shared by the agent and the UI. Per run, so runs stay
// bounded and comparable: model turns, then Qloo calls, cache hits included.
export const MAX_TURNS = 12
export const MAX_QLOO_CALLS = 60
// Per session, counted in UTC days.
export const MAX_RUNS_PER_DAY = 10
// Released shows standing in for an unreleased launch, all scored in one signal (PRD story 12).
export const MAX_COMPS = 3
// A show's past guests anchor its pitch rankings, each one more Qloo search per pitch run.
export const MAX_PAST_GUESTS = 5

// The start of today in UTC, in epoch ms: runs started since count against today's limit.
export const startOfUtcDay = () => new Date().setUTCHours(0, 0, 0, 0)
