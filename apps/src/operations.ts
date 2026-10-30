// What a program can do for a network, one function per operation, shared by the REST API
// (routes/api.ts) and the MCP server (routes/mcp.ts), which are thin adapters over it. Each operation
// takes the network, the caller, and its input, and calls the directory or the network's agent over
// RPC. The adapter has already checked that the caller reaches the network. A refusal is a `Refusal`
// with its code (refusal.ts), whether this module or the agent threw it.
import { getAgentByName } from 'agents'
import type {
  Comp,
  Launch,
  LaunchInput,
  LaunchSummary,
  Note,
  Question,
  Reply,
  Run,
  RunSnapshot,
  RunSummary,
  Show,
  ShowPatch,
  Starter,
  State
} from './agent'
import type { DemographicCheck } from './demographics'
import type { Evidence } from './evidence'
import { networkName, renameNetwork, renameNetworkForKey, type Member, type Role } from './directory'
import type { Band, FitRow, PitchList, Ranking } from './fit'
import { globalGateway, type Usage } from './gateway'
import type { Inbox, PastGuest, Pitch, PitchInput, PitchReply, Skipped } from './inbox'
import { launchAgentName, networkLimitKey, ownGateway } from './network-agent'
import { cpmProblem, type InsertionOrder, type LineInput } from './order'
import { closePairs, closestCount, entityShows, isStale, rosterEntities, type Entity, type Overlap } from './overlap'
import { Refusal } from './refusal'
import { offeredBy, type Candidate } from './resolve'
import { holdsSample, type RosterFormat } from './roster'
import { readName } from './text'
import type { Topic } from './topic'
import { deleteLaunch as wipeLaunch } from './wipe'

// Who's asking: a member signed in to the app, with their role in the network, or one of the
// network's API keys, with the name an owner gave it.
export type Caller = { member: Member; role: Role } | { keyId: string; keyName: string }

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
// across all networks and visitors apply too. Its Qloo calls count in the gateway they go through, its
// own while it has a Qloo key of its own, as its agent knows, and its model runs in the global one
// (ADR 0004).
export async function getUsage({ env, network }: OperationContext): Promise<Usage> {
  const key = networkLimitKey(network)
  const [usage, ownKey] = await Promise.all([
    globalGateway(env).usage(key),
    agent(env, network).then((a) => a.hasOwnKey())
  ])
  const calls = ownKey ? await ownGateway(env, network).usage(key) : usage
  return { ...usage, qlooCalls: calls.qlooCalls }
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

// The roster's overlap as a program reads it (overlap.ts): each show's closest shows by listener overlap
// in Qloo, as ranks and bands within its own ranking, and the close pairs. One row per distinct Qloo
// entity on the roster, in roster order, named by its first show there, with the other shows matched or
// mapped to it as `sameAs`; a show no longer on the roster is named as Qloo names it. No call number is
// given, since the network's evidence has no program route.
export type RosterOverlap = {
  status: 'unmeasured' | Overlap['status']
  error: string | null
  progress: { answered: number; asked: number } | null // the latest measure's anchors; null until one starts
  measuredAt: string | null
  stale: boolean // the roster's matched shows have changed since it was measured
  closestCount: number // how many closest shows each show has: up to 3, fewer on a small roster
  shows: OverlapShow[]
  closePairs: [string, string][]
}
export type NamedShow = { show: string; sameAs: string[] }
export type OverlapShow = NamedShow & {
  status: 'unmeasured' | 'measuring' | 'measured' | 'failed'
  closest: (NamedShow & { rank: number; band: Band })[]
  error: string | null // why its ranking failed
}

export async function getOverlap({ env, network }: OperationContext): Promise<RosterOverlap> {
  return overlapOf(await stateOf(await agent(env, network)))
}

// Starts measuring the roster's overlap, and returns at once with it measuring, or as it is when the
// roster's entities are unchanged and every ranking has landed. Each anchor is one Qloo call, so up to
// one per show matched in Qloo, counted against the network's daily calls.
export async function measureOverlap({ env, network }: OperationContext): Promise<RosterOverlap> {
  const networkAgent = await agent(env, network)
  await networkAgent.measureOverlap()
  return overlapOf(await stateOf(networkAgent))
}

function overlapOf({ roster, overlap }: State): RosterOverlap {
  const onRoster = entityShows(roster)
  const named = ({ id, name }: Entity): NamedShow => {
    const [show = name, ...sameAs] = (onRoster.get(id)?.shows ?? []).map((s) => s.name)
    return { show, sameAs }
  }
  const measuredIds = new Set(overlap?.key.split(','))
  const rows = new Map(overlap?.rows.map((r) => [r.entity.id, r]))
  // Each entity once, where its first show is on the roster.
  const entities = [...onRoster.values()].map((e) => e.entity)
  const row = (entity: Entity): OverlapShow => {
    const landed = rows.get(entity.id)
    if (!landed)
      return {
        ...named(entity),
        status: overlap?.status === 'measuring' && measuredIds.has(entity.id) ? 'measuring' : 'unmeasured',
        closest: [],
        error: null
      }
    return {
      ...named(entity),
      status: landed.error ? 'failed' : 'measured',
      closest: landed.closest.map((c) => ({ ...named(c), rank: c.rank, band: c.band })),
      error: landed.error
    }
  }
  // Pairs in roster order, then any among shows that have left it.
  const ordered = [
    ...entities.flatMap((e) => (rows.has(e.id) ? [rows.get(e.id)!] : [])),
    ...(overlap?.rows ?? []).filter((r) => !entities.some((e) => e.id === r.entity.id))
  ]
  const name = (id: string) => named(rows.get(id)!.entity).show
  return {
    status: overlap?.status ?? 'unmeasured',
    error: overlap?.error ?? null,
    progress: overlap ? { answered: overlap.answered, asked: overlap.asked } : null,
    measuredAt: overlap?.measuredAt ?? null,
    stale: overlap ? isStale(overlap, roster) : false,
    closestCount: closestCount(overlap ? measuredIds.size : rosterEntities(roster).length),
    shows: entities.map(row),
    closePairs: closePairs(ordered).map(([a, b]) => [name(a), name(b)])
  }
}

// A launch as the network's list has it, its status in the API's words: `order drafted` is
// `order_drafted`, as every code a program reads is one word.
export type LaunchRow = Omit<LaunchSummary, 'status'> & { status: ApiStatus<LaunchSummary['status']> }
type ApiStatus<S extends string> = S extends `${infer A} ${infer B}` ? `${A}_${B}` : S
const rowOf = (row: LaunchSummary): LaunchRow => ({
  ...row,
  status: row.status.replace(' ', '_') as LaunchRow['status']
})

// The network's launches as its Launches page lists them, newest first. Each launch reports its row to
// the list after it changes, so the list can lag a moment behind the launch itself.
export async function listLaunches({ env, network }: OperationContext): Promise<LaunchRow[]> {
  return ((await stateOf(await agent(env, network))).launches ?? []).map(rowOf)
}

// A launch as a program reads it: its row in the network's list, as its own agent has it now, with what it
// commits of the roster's promo inventory; whether the network's roster has changed since its latest run
// copied it; its runs, oldest first; and its latest run in full.
export type LaunchInfo = LaunchRow & {
  rosterChanged: boolean
  runs: LaunchRunSummary[]
  latestRun: LaunchRun | null
}
export type LaunchRunSummary = { id: string; status: Run['status']; startedAt: string; startedBy: string | null }

// What a launch is planned from: a released launch's name, or up to three comps for an unreleased one.
export type LaunchPlan = { name?: string; comps?: string[] }

// Plans a new launch, named or from comps, on the network's list, and returns it.
export async function createLaunch(ctx: OperationContext, plan: LaunchPlan): Promise<LaunchInfo> {
  const { id } = await (await agent(ctx.env, ctx.network)).createLaunch(launchInput(plan))
  return getLaunch(ctx, { launchId: id })
}

export async function getLaunch({ env, network }: OperationContext, input: { launchId: string }): Promise<LaunchInfo> {
  const launch = await launchAgent(env, network, input.launchId)
  const state = await stateOf(launch)
  return {
    ...rowOf({ id: input.launchId, ...(await launch.summary()) }),
    rosterChanged: state.rosterChanged ?? false,
    runs: state.runs.map(runSummaryOf),
    latestRun: state.run && (await launchRunOf(launch, state, state.run.id))
  }
}

// Starts a run of the launch and returns at once with it running: planned from `plan`, or with none,
// from the launch as it stands, which earlier runs' answers may have renamed or given comps. It
// ranks the network's roster and CPM as they are now, and counts as one of the network's model runs.
// Poll it: it may stop to ask a question, which `answerLaunchRun` answers.
export async function startLaunchRun(
  { env, network, caller }: OperationContext,
  input: { launchId: string; plan: LaunchPlan }
): Promise<LaunchRun> {
  const launch = await launchAgent(env, network, input.launchId)
  const { name, comps } = input.plan
  const planned = name === undefined && comps === undefined ? (await stateOf(launch)).launch : null
  const { runId } = await launch.startLaunchAs(planned ? asItStands(planned) : launchInput(input.plan), starter(caller))
  return launchRunOf(launch, await stateOf(launch), runId)
}

// Who a run says started it: the member, by name, with their ID, or the API key, by the name an owner
// gave it.
const starter = (caller: Caller): Starter =>
  'member' in caller ? { name: caller.member.name, id: caller.member.id } : { name: `API key “${caller.keyName}”` }

export async function getLaunchRun(
  { env, network }: OperationContext,
  input: { launchId: string; runId: string }
): Promise<LaunchRun> {
  const launch = await launchAgent(env, network, input.launchId)
  return launchRunOf(launch, await stateOf(launch), input.runId)
}

// Answers the open question of the launch's latest run, which resumes, as `answerPitchRun` does.
export async function answerLaunchRun(
  { env, network }: OperationContext,
  input: { launchId: string; runId: string; questionId: string; answer: Reply }
): Promise<LaunchRun> {
  const launch = await launchAgent(env, network, input.launchId)
  const state = await stateOf(launch)
  listedLaunchRun(state, input.runId)
  if (state.run?.id !== input.runId)
    throw new Refusal('conflict', 'That run has ended, so it has no question to answer.')
  await launch.answer(input.questionId, input.answer)
  return launchRunOf(launch, await stateOf(launch), input.runId)
}

// Changes the lines of the launch's current insertion order, once its run has ended, and returns it
// priced again. Editing an approved order returns it to draft, so a member must approve it again.
export async function editOrder(
  { env, network }: OperationContext,
  input: { launchId: string; orderId: string; lines: LineInput[] }
): Promise<OrderInfo> {
  const launch = await launchAgent(env, network, input.launchId)
  return orderOf((await launch.editInsertionOrder(input.orderId, input.lines)) as InsertionOrder)
}

// An insertion order of the launch, the current one or an earlier run's, as CSV for ad operations,
// once a member has approved it in the app.
export async function exportOrder(
  { env, network }: OperationContext,
  input: { launchId: string; orderId: string }
): Promise<string> {
  const launch = await launchAgent(env, network, input.launchId)
  const exported = await launch.exportInsertionOrder(input.orderId)
  if (exported.status === 200) return exported.csv
  throw exported.status === 404
    ? new Refusal('not_found', `There's no insertion order ${input.orderId} in this launch.`)
    : new Refusal(
        'conflict',
        `${input.orderId} is a draft. A member of the network approves it on the launch's page in the app; then it exports.`
      )
}

// The launch's evidence log: one record per Qloo call its runs made or copied from the roster's
// lookups, oldest first, each with what was sent and what came back. The records of one of the guest
// network's sample launches keep the API's shape, without the mark the app labels them with.
export async function getLaunchEvidence(
  { env, network }: OperationContext,
  input: { launchId: string }
): Promise<Evidence[]> {
  const log: Evidence[] = await (await launchAgent(env, network, input.launchId)).getEvidence()
  return log.map(({ fromSample: _, ...record }) => record)
}

// Deletes the launch for every member, with its runs and their evidence, as the Launches page does. It's
// a member's, signed in: an API key can't delete one.
export async function deleteLaunch({ env, network, caller }: OperationContext, input: { launchId: string }) {
  if (!('member' in caller))
    throw new Refusal(
      'forbidden',
      "A launch is deleted by a member of the network, signed in to the app. An API key can't delete one."
    )
  await launchAgent(env, network, input.launchId) // refused unless the network lists it
  await wipeLaunch(env, network, input.launchId)
}

// The launch as it stands, to run again, as the launch page's "Run again" does: from its comps, if
// it has any, since a launch only gains comps when its name can't be ranked.
const asItStands = ({ name, comps }: Launch): LaunchInput =>
  comps.length ? { comps: comps.map((c) => c.name) } : { name: name ?? '' }

// The launch input the agent takes, from a plan that gives its name or its comps, not both.
function launchInput({ name, comps }: LaunchPlan): LaunchInput {
  if (name !== undefined && comps !== undefined)
    throw new Refusal('invalid', 'Name the launch or give its comps, not both.')
  return comps !== undefined ? { comps } : { name: name ?? '' }
}

// Launch `id` on the network's list, whose own agent keeps its runs, or a refusal when the list has
// no such launch, as after its deletion.
async function launchAgent(env: Env, network: string, id: string) {
  if (!(await (await agent(env, network)).listsLaunch(id)))
    throw new Refusal('not_found', "There's no such launch in this network.")
  return getAgentByName(env.LaunchAgent, launchAgentName(network, id))
}
type LaunchStub = Awaited<ReturnType<typeof launchAgent>>

const runSummaryOf = ({ id, status, startedAt, startedBy }: RunSummary): LaunchRunSummary => ({
  id,
  status,
  startedAt,
  startedBy: startedBy ?? null
})

// A launch's run as a program reads it: its status, the question it waits on, its progress notes,
// the launch it plans, and as they arrive, its chart, topic baseline, demographics check, and
// insertion order. A member approves the order in the app; nothing here can.
export type LaunchRun = LaunchRunSummary & {
  plan: {
    name: string | null
    entity: Candidate | null
    // Each comp, with what a `confirm_comps` answer picks from: its match, or its candidates.
    comps: (Pick<Comp, 'name' | 'status' | 'entity'> & { candidates: Candidate[] })[]
  }
  question: Question | null
  notes: Note[]
  error: string | null
  closing: string | null
  budget: Run['budget']
  exclusions: string[] | null
  chart: Chart | null
  topic: Pick<Topic, 'status' | 'order' | 'error'> | null
  demographics: DemographicCheck | null
  insertionOrder: OrderInfo | null
}

// The fit chart: each row's fit rank, band, and finalist mark, with its topic rank and move once the
// topic baseline is in.
export type Chart = Omit<Ranking, 'rows'> & {
  rows: (FitRow & { topicRank: number | null; move: number | null; climber: boolean })[]
}

// Run `id` as the launch's list of runs has it, or a refusal when the list has no such run.
function listedLaunchRun(state: State, id: string) {
  const summary = state.runs.find((r) => r.id === id)
  if (!summary) throw new Refusal('not_found', `There's no run ${id} of this launch.`)
  return summary
}

// Run `id` of the launch: the latest from the agent's synced state, and an earlier one from what it
// ended with.
async function launchRunOf(launch: LaunchStub, state: State, id: string): Promise<LaunchRun> {
  const summary = listedLaunchRun(state, id)
  const ended = state.run?.id === id ? state : ((await launch.getRun(id)) as unknown as RunSnapshot)
  const { run, launch: plan, ranking, topic, demographics, insertionOrder } = ended
  return {
    ...runSummaryOf(summary),
    plan: {
      name: plan!.name,
      entity: plan!.match?.entity ?? null,
      comps: plan!.comps.map(({ name, status, entity, match }) => ({
        name,
        status,
        entity,
        candidates: offeredBy(match)
      }))
    },
    question: run!.question,
    notes: run!.notes,
    error: run!.error,
    closing: run!.closing,
    budget: run!.budget,
    exclusions: run!.exclusions,
    chart: ranking && {
      ...ranking,
      rows: ranking.rows.map((row) => {
        const moved = topic?.moves.find((m) => m.show === row.show)
        return {
          ...row,
          topicRank: moved?.topicRank ?? null,
          move: moved?.move ?? null,
          climber: moved?.climber ?? false
        }
      })
    },
    topic: topic && { status: topic.status, order: topic.order, error: topic.error },
    demographics,
    insertionOrder: insertionOrder && orderOf(insertionOrder)
  }
}

// An insertion order as a program reads it: who approved it by name, never by their member ID; whether
// it has been edited since the agent drafted it, so its run's closing line may quote figures it no longer
// has; and, for one of the guest network's sample launches, whether its approval is the sample data's
// (`fromSample`, ADR 0002).
export type OrderInfo = Omit<InsertionOrder, 'approvedById' | 'edited'> & { edited: boolean }
const orderOf = ({ approvedById: _, edited, ...order }: InsertionOrder): OrderInfo => ({
  ...order,
  edited: edited ?? false
})

// The network's inbox as a program reads it: `empty` until pitches are loaded, `reading` while the
// agent reads each for its guest and public work and looks the work up in Qloo, or for the sample inbox,
// which comes already read, only looks the works up, then `done`; the uploaded pitches left out, each
// named and why; and the sample inbox's notice while it's loaded.
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
// reply it drafted to each pitch, and whether an edit or a discard has changed one since, so its
// closing line may give counts they no longer have. A member approves a reply in the app; nothing
// here can.
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
  repliesEdited: boolean
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

// A pitch run as the network's list of them has it.
export type PitchRunSummary = Pick<PitchRun, 'id' | 'status' | 'show' | 'startedAt'>

// The network's pitch runs, newest first, so a program finds the latest, and the replies it drafted,
// without its ID.
export async function listPitchRuns({ env, network }: OperationContext): Promise<PitchRunSummary[]> {
  const { runs } = await stateOf(await agent(env, network))
  return runs
    .flatMap(({ id, status, pitchesFor, startedAt }) =>
      pitchesFor === undefined ? [] : [{ id, status, show: pitchesFor, startedAt }]
    )
    .toReversed()
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
    replies: booking!.replies,
    repliesEdited: booking!.repliesEdited ?? false
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
  // While a show holds a sample figure: the guest network's CPM can stay the sample's once it doesn't (#287).
  sample:
    state.sample && holdsSample(state.roster) ? { network: state.sample.network, notice: state.sample.notice } : null
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

// An agent's synced state, read over RPC. RPC's types widen its tuples, such as a resolved show's
// empty candidates, so it's read back as the agent's own type.
const stateOf = async (stub: NetworkStub | LaunchStub) => (await stub.state) as unknown as State
