// What a program can do for a network, one function per operation, shared by the REST API
// (routes/api.ts) and the MCP server to come (#171), which are thin adapters over it. Each operation
// takes the network, the caller, and its input, and calls the directory or the network's agent over
// RPC. The adapter has already checked that the caller reaches the network. A refusal is a `Refusal`
// with its code (refusal.ts), whether this module or the agent threw it.
import { getAgentByName } from 'agents'
import type { Note, Question, Reply, Run, RunSnapshot, Show, ShowPatch, State } from './agent'
import { networkName, renameNetwork, renameNetworkForKey, type Member, type Role } from './directory'
import type { PitchList } from './fit'
import type { Usage } from './gateway'
import type { Inbox, PastGuest, Pitch, PitchInput, PitchReply, Skipped } from './inbox'
import { networkLimitKey } from './network-agent'
import { cpmProblem } from './order'
import { Refusal } from './refusal'
import type { RosterFormat } from './roster'
import { readName } from './text'

// Who's asking: a member signed in to the app, with their role in the network, or one of the
// network's API keys.
export type Caller = { member: Member; role: Role } | { keyId: string }

// What every operation runs with.
export type OperationContext = { env: Env; network: string; caller: Caller }

// The network as a program reads it.
export type NetworkInfo = { id: string; name: string; cpm: number | null }

export async function getNetwork({ env, network }: OperationContext): Promise<NetworkInfo> {
  const name = await networkName(env.DB, network)
  if (name === null) throw new Refusal('not_found', 'There is no such network.')
  const { cpm } = await stateOf(await agent(env, network))
  return { id: network, name, cpm }
}

// Renames the network, sets its CPM, or both: a member must be one of its owners, as in its settings;
// an API key, which an owner made, may. A field left out stays as it is, and the CPM can't be cleared.
export async function updateNetwork(
  { env, network, caller }: OperationContext,
  input: { name?: string; cpm?: number }
): Promise<NetworkInfo> {
  if ('member' in caller && caller.role !== 'owner') throw new Refusal('forbidden', OWNERS_ONLY)
  const read = input.name === undefined ? null : readName(input.name, 'Name the network.')
  if (read && 'error' in read) throw new Refusal('invalid', read.error)
  const problem = input.cpm === undefined ? null : cpmProblem(input.cpm)
  if (problem) throw new Refusal('invalid', problem)
  if (read) {
    const renamed =
      'member' in caller
        ? await renameNetwork(env.DB, network, caller.member.id, read.name)
        : await renameNetworkForKey(env.DB, network, caller.keyId, read.name)
    if (!renamed) throw new Refusal('forbidden', OWNERS_ONLY)
  }
  if (input.cpm !== undefined) await (await agent(env, network)).setCpm(input.cpm)
  return getNetwork({ env, network, caller })
}
const OWNERS_ONLY = "Only an owner, or an API key an owner made, can change the network's name and CPM."

// What the network has used today against its own daily caps, and when they reset. Crossfeed's caps
// across all networks and visitors apply too.
export async function getUsage({ env, network }: OperationContext): Promise<Usage> {
  return env.QlooGateway.getByName('global').usage(networkLimitKey(network))
}

// The network's roster as a program reads it: its shows, `pending` while any show's search or comp
// search is still out, and the sample network it started from while its figures are labelled sample.
export type Roster = {
  status: 'pending' | 'settled'
  shows: Show[]
  sample: { network: string; notice: string } | null
}

export async function getRoster({ env, network }: OperationContext): Promise<Roster> {
  return rosterOf(await stateOf(await agent(env, network)))
}

// Imports a roster, as pasted names (`lines`) or a CSV, and returns at once with its new shows pending;
// each settles as its search returns. Over a roster that has shows, it needs `replace`: the shows
// already on it keep their matches, and only the figures the import brings change.
export async function importRoster(
  { env, network }: OperationContext,
  input: { text: string; format: RosterFormat; replace: boolean }
): Promise<Roster> {
  const networkAgent = await agent(env, network)
  if (!input.replace && (await stateOf(networkAgent)).roster.length > 0)
    throw new Refusal(
      'conflict',
      'The roster already has shows. Import with replace=true to import over it: shows already on it keep their matches.'
    )
  await networkAgent.importRoster(input.text, input.format)
  return rosterOf(await stateOf(networkAgent))
}

// Settles or edits one show, named as on the roster: picks one of its candidates, maps it to a comp
// its comp search found, or changes its figures or exclusion. Returns the show as it is now.
export async function updateShow({ env, network }: OperationContext, input: { name: string; patch: ShowPatch }) {
  const networkAgent = await agent(env, network)
  await networkAgent.updateShow(input.name, input.patch)
  return showOf(await stateOf(networkAgent), input.name)
}

// Searches Qloo for a comp to stand in for a show it has no match for, and returns at once with the
// show's comp search pending; map the show to one of its results once it's done.
export async function searchComps({ env, network }: OperationContext, input: { name: string; query: string }) {
  const networkAgent = await agent(env, network)
  await networkAgent.searchComps(input.name, input.query)
  return showOf(await stateOf(networkAgent), input.name)
}

// The network's inbox as a program reads it: `empty` until pitches are loaded, `reading` while the
// agent reads each for its guest and public work and looks the work up in Qloo, then `done`; the
// uploaded pitches left out, each named and why; and the sample inbox's notice while it's loaded.
export type InboxInfo = {
  status: 'empty' | Inbox['status']
  sample: { notice: string } | null
  pitches: Pitch[]
  skipped: Skipped[]
}

export async function getInbox({ env, network }: OperationContext): Promise<InboxInfo> {
  return inboxOf(await stateOf(await agent(env, network)))
}

// Loads pitches into the inbox, as an upload's emails or pitches given one by one, and returns at
// once with them reading. Over an inbox that has pitches, it needs `replace`: they go, and the last
// pitch run's lists and replies with them.
export async function loadInbox(
  { env, network }: OperationContext,
  input: { pitches: PitchInput[]; replace: boolean }
): Promise<InboxInfo> {
  const networkAgent = await agent(env, network)
  if (!input.replace && (await stateOf(networkAgent)).inbox?.pitches.length)
    throw new Refusal(
      'conflict',
      "The inbox already has pitches. Load with replace=true to load over them: they go, with the last pitch run's lists and replies."
    )
  await networkAgent.loadInbox({ pitches: input.pitches })
  return inboxOf(await stateOf(networkAgent))
}

// Confirms which of an ambiguous work's same-title candidates a pitch is about, and returns the pitch.
export async function confirmWork(
  { env, network }: OperationContext,
  input: { pitchId: string; entityId: string }
): Promise<Pitch> {
  const networkAgent = await agent(env, network)
  await networkAgent.confirmWork(input.pitchId, input.entityId)
  const pitch = (await stateOf(networkAgent)).inbox?.pitches.find((p) => p.id === input.pitchId)
  if (!pitch) throw new Refusal('not_found', `No pitch ${input.pitchId} in the inbox.`)
  return pitch
}

// A guest pitch run as a program reads it: its status, the question it's waiting on, its progress
// notes, and, as they arrive, its past guests' works, its ranked lists, one per work type, and the
// reply it drafted to each pitch. A member approves a reply in the app; nothing here can.
export type PitchRun = {
  id: string
  status: Run['status']
  show: string // the roster show the pitches are ranked against
  startedAt: string
  question: Question | null
  notes: Note[]
  error: string | null
  closing: string | null
  pastGuests: PastGuest[]
  lists: PitchList[] | null
  replies: PitchReply[] | null
}

// Starts a pitch run against a roster show, with the show's best past guests and their public works
// to rank against too, and returns at once with it running. It counts as one of the network's model
// runs. Poll it: it may stop to ask a question, which `answerPitchRun` answers.
export async function startPitchRun(
  { env, network }: OperationContext,
  input: { show: string; pastGuests: Omit<PastGuest, 'match'>[] }
): Promise<PitchRun> {
  const networkAgent = await agent(env, network)
  const { runId } = await networkAgent.startPitches(input)
  return pitchRunOf(networkAgent, await stateOf(networkAgent), runId)
}

export async function getPitchRun({ env, network }: OperationContext, input: { runId: string }) {
  const networkAgent = await agent(env, network)
  return pitchRunOf(networkAgent, await stateOf(networkAgent), input.runId)
}

// Answers the open question of the network's latest run, which resumes. `questionId` names the question
// being answered, so an answer meant for one already answered is refused rather than taken for the next.
export async function answerPitchRun(
  { env, network }: OperationContext,
  input: { runId: string; questionId: string; answer: Reply }
): Promise<PitchRun> {
  const networkAgent = await agent(env, network)
  const state = await stateOf(networkAgent)
  listedPitchRun(state, input.runId)
  if (state.run?.id !== input.runId)
    throw new Refusal('conflict', 'That pitch run has ended, so it has no question to answer.')
  await networkAgent.answer(input.questionId, input.answer)
  return pitchRunOf(networkAgent, await stateOf(networkAgent), input.runId)
}

// Rewords a drafted reply of the network's latest pitch run, once the run has ended, and returns it.
// Editing an approved reply returns it to draft, and editing a discarded one restores it.
export async function editReply(
  { env, network }: OperationContext,
  input: { runId: string; pitchId: string; draft: string }
): Promise<PitchReply> {
  const networkAgent = await agent(env, network)
  await currentReplies(networkAgent, input.runId)
  await networkAgent.editReply(input.pitchId, input.draft)
  return replyOf(await stateOf(networkAgent), input.pitchId)
}

// Leaves a drafted reply out, as `editReply` does, and returns it; editing it again restores it.
export async function discardReply(
  { env, network }: OperationContext,
  input: { runId: string; pitchId: string }
): Promise<PitchReply> {
  const networkAgent = await agent(env, network)
  await currentReplies(networkAgent, input.runId)
  await networkAgent.discardReply(input.pitchId)
  return replyOf(await stateOf(networkAgent), input.pitchId)
}

// Refuses a change to the replies of any pitch run but the one whose replies the inbox holds now.
async function currentReplies(networkAgent: NetworkStub, runId: string) {
  const state = await stateOf(networkAgent)
  listedPitchRun(state, runId)
  if (state.booking?.run !== runId)
    throw new Refusal(
      'conflict',
      "That pitch run's replies were replaced by a later run or a new inbox. Edit the latest run's replies."
    )
}

const replyOf = (state: State, pitchId: string) => {
  const reply = state.booking?.replies?.find((r) => r.pitch === pitchId)
  if (!reply) throw new Refusal('not_found', `There's no drafted reply to ${pitchId}.`)
  return reply
}

// Pitch run `id` as the network's list of runs has it, or a refusal when the list has no such run.
function listedPitchRun(state: State, id: string) {
  const summary = state.runs.find((r) => r.id === id && r.pitchesFor !== undefined)
  if (!summary) throw new Refusal('not_found', `There's no pitch run ${id}.`)
  return summary
}

// Pitch run `id`: the latest from the agent's synced state, and an earlier one from what it ended with.
async function pitchRunOf(networkAgent: NetworkStub, state: State, id: string): Promise<PitchRun> {
  const summary = listedPitchRun(state, id)
  const { run, booking } =
    state.booking?.run === id ? state : ((await networkAgent.getRun(id)) as unknown as RunSnapshot)
  return {
    id,
    status: run!.status,
    show: booking!.show.name,
    startedAt: summary.startedAt,
    question: run!.question,
    notes: run!.notes,
    error: run!.error,
    closing: run!.closing,
    pastGuests: booking!.pastGuests,
    lists: booking!.lists,
    replies: booking!.replies
  }
}

// Show `name` in the roster, as the agent left it; an import meanwhile may have taken it off.
function showOf(state: State, name: string) {
  const show = state.roster.find((s) => s.name === name)
  if (!show) throw new Refusal('not_found', `No show named "${name}" in the roster.`)
  return show
}

const rosterOf = (state: State): Roster => ({
  status: state.roster.some((s) => s.resolution === 'pending' || s.compSearch?.status === 'pending')
    ? 'pending'
    : 'settled',
  shows: state.roster,
  sample: state.sample && { network: state.sample.network, notice: state.sample.notice }
})

const inboxOf = ({ inbox }: State): InboxInfo => ({
  status: inbox?.status ?? 'empty',
  sample: inbox?.sample ? { notice: inbox.notice ?? '' } : null,
  pitches: inbox?.pitches ?? [],
  skipped: inbox?.skipped ?? []
})

// The network's agent, which keeps its roster, CPM, and inbox, and runs its pitch runs.
const agent = (env: Env, network: string) => getAgentByName(env.NetworkAgent, network)
type NetworkStub = Awaited<ReturnType<typeof agent>>

// The agent's synced state, read over RPC. RPC's types widen its tuples, such as a resolved show's
// empty candidates, so it's read back as the agent's own type.
const stateOf = async (stub: NetworkStub) => (await stub.state) as unknown as State
