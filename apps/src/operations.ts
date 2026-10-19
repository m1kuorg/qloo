// What a program can do for a network, one function per operation, shared by the REST API
// (routes/api.ts) and the MCP server to come (#171), which are thin adapters over it. Each operation
// takes the network, the caller, and its input, and calls the directory or the network's agent over
// RPC. The adapter has already checked that the caller reaches the network. A refusal is a `Refusal`
// with its code (refusal.ts), whether this module or the agent threw it.
import { getAgentByName } from 'agents'
import type { Show, ShowPatch, State } from './agent'
import { networkName, renameNetwork, renameNetworkForKey, type Member, type Role } from './directory'
import type { Usage } from './gateway'
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

// The network's agent, which keeps its roster, CPM, and inbox.
const agent = (env: Env, network: string) => getAgentByName(env.NetworkAgent, network)

// The agent's synced state, read over RPC. RPC's types widen its tuples, such as a resolved show's
// empty candidates, so it's read back as the agent's own type.
const stateOf = async (stub: Awaited<ReturnType<typeof agent>>) => (await stub.state) as unknown as State
