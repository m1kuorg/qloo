import { callable, getAgentByName, getCurrentAgent, type Connection, type ConnectionContext } from 'agents'
import {
  CALL,
  CrossfeedAgent,
  MEMBER_TAG,
  readLaunch,
  rosterKey,
  type LaunchInput,
  type LaunchSummary,
  type RosterCopy,
  type State
} from './agent'
import { globalGateway } from './gateway'
import { Refusal } from './refusal'
import { sample, sampleRoster } from './sample'

// The header that names a connection's member. The Worker sets it on each upgrade it lets through to
// a network's agent, once it has checked the session and the membership, replacing any the browser
// sent; nothing else reaches the agent.
export const MEMBER_HEADER = 'Crossfeed-Member'
// And the header with their name, URI-encoded, for an agent to say who did what.
export const MEMBER_NAME_HEADER = 'Crossfeed-Member-Name'

// A connection's member tag, `member:<id>`, from the header the Worker set on its upgrade.
export function memberTag({ request }: ConnectionContext) {
  const member = request.headers.get(MEMBER_HEADER)
  return member ? [`${MEMBER_TAG}${member}`] : []
}

// A launch's agent's name: its network's ID and its own, as ADR 0001 names it.
export const launchAgentName = (networkId: string, launchId: string) => `${networkId}:${launchId}`

// What a network's agents count against for the per-visitor limits: the network, from the agent's
// name, which is the network's ID for its own agent and `<networkId>:<launchId>` for a launch's.
export const networkLimitKey = (name: string) => `network:${name.split(':')[0]}`

// The name of a network's own gateway instance (ADR 0004), from an agent's name as networkLimitKey reads
// it: `network:<networkId>`, the same as the key its limits count under. And the instance, where the
// network's own Qloo key, its cache, and its Qloo counts live.
export const ownGatewayName = networkLimitKey
export const ownGateway = (env: Env, name: string) => env.QlooGateway.getByName(ownGatewayName(name))

// The gateway a network's Qloo calls go through, and its launches': its own instance while it has a key
// of its own, else the global one, as every other network's and the demo's do.
export async function networkGateway(env: Env, name: string) {
  const own = ownGateway(env, name)
  return (await own.ownKey()).set ? own : globalGateway(env)
}

// Closes member `memberId`'s open pages of network `networkId` and its launches, once the directory has
// let them go, saying `reason` if it isn't that they left the network, as when they're removed, sign
// out everywhere, or delete their account.
export const kickMember = async (env: Env, networkId: string, memberId: string, reason?: string) =>
  (await getAgentByName(env.NetworkAgent, networkId)).kick(memberId, reason)

// What a deleted network's open pages, and its launches', say as they close.
export const NETWORK_DELETED = 'This network was deleted.'

const LAUNCHES =
  "A network's agent keeps the roster and the inbox; each launch runs in its own workspace, with its runs and insertion order."
const NO_GUIDE = "A network has no guide: it's the sample network's, at /demo."
// Where a network's agent keeps the roster it last told its launches (rosterKey).
const ANNOUNCED = 'crossfeed_roster_announced'

// One instance per signed-in network, named by the network's ID (ADR 0001). Its own class keeps its
// namespace apart from the demo's sessions, so no session cookie can name it. It opens empty, with no
// sample network and no guide, and every connection to it carries its member.
export class NetworkAgent extends CrossfeedAgent {
  initialState: State = {
    ...this.initialState,
    guide: { seen: [], dismissed: true },
    launches: [],
    checklistDismissed: []
  }

  protected opensOnSample = false
  protected keepsSettledShows = true

  // The network's Qloo calls and model runs count together, as one visitor's would, whichever member
  // makes them, and with no connection at all, as the Worker's own calls have (TRD agent limits).
  protected limitKey() {
    return networkLimitKey(this.name)
  }

  // Its Qloo calls go through its own gateway instance while it has a Qloo key of its own (ADR 0004).
  protected gateway() {
    return networkGateway(this.env, this.name)
  }

  // Tags a connection with its member, beside its visitor.
  async getConnectionTags(connection: Connection, context: ConnectionContext) {
    return [...(await super.getConnectionTags(connection, context)), ...memberTag(context)]
  }

  // After a change to the roster, once no show is still being looked up, tells each launch how it now
  // stands, so a launch's page says when it has changed since that launch's latest run. Other changes
  // to the network's state send nothing. What was sent is kept in storage, so waking up sends nothing
  // new; a notice that fails forgets it, so the next change of any kind sends it again.
  onStateChanged(state: State) {
    if (state.roster.some((s) => s.resolution === 'pending')) return
    const key = rosterKey(state.roster)
    const { kv } = this.ctx.storage
    if (key === kv.get(ANNOUNCED)) return
    kv.put(ANNOUNCED, key)
    void this.keepAliveWhile(() =>
      Promise.all(
        (state.launches ?? []).map(async ({ id }) => {
          try {
            const launch = await getAgentByName(this.env.LaunchAgent, launchAgentName(this.name, id))
            await launch.noteNetworkRoster(key)
          } catch (e) {
            kv.delete(ANNOUNCED)
            console.error(JSON.stringify({ event: 'roster_notice', launch: id, error: String(e) }))
          }
        })
      )
    )
  }

  // Lets go of the network as its deletion wipes it, once the directory has (wipe.ts): its open pages
  // close for good, saying why, so none plans another launch, and it returns the launches it lists, to
  // be wiped with it. Over RPC only.
  letGo() {
    for (const connection of this.getConnections()) connection.close(4410, NETWORK_DELETED)
    return (this.state.launches ?? []).map((l) => l.id)
  }

  // Closes the member's connections to the network's agent and to each of its launches'.
  async kick(memberId: string, reason?: string) {
    super.kick(memberId, reason)
    await Promise.all(
      (this.state.launches ?? []).map(async ({ id }) =>
        (await getAgentByName(this.env.LaunchAgent, launchAgentName(this.name, id))).kick(memberId, reason)
      )
    )
  }

  // Has each of its launches forget member `memberId`'s name, as their account's deletion does
  // (wipe.ts), and lists each launch's row as it then stands, so the dashboard follows at once. Over
  // RPC only.
  async forgetMember(memberId: string) {
    const rows = await Promise.all(
      (this.state.launches ?? []).map(async ({ id }) => ({
        id,
        summary: await (
          await getAgentByName(this.env.LaunchAgent, launchAgentName(this.name, id))
        ).forgetMember(memberId)
      }))
    )
    for (const { id, summary } of rows) this.reportLaunch(id, summary)
  }

  // Starts the network's roster from the sample network's shows, each figure labelled sample until a
  // member changes it, looked up like an import. The sample's notice comes with its show names; its CPM
  // doesn't, since the network's is an owner's to set.
  @callable()
  async startFromSample() {
    const empty = () => {
      if (this.state.roster.length > 0)
        throw new Error(
          'The roster already has shows. Start from the sample roster only while it has none, or import over it.'
        )
    }
    empty()
    const gateway = await this.reserveCalls(this.limitKey(), sampleRoster.length)
    empty() // again, since an import may have started meanwhile
    this.lookUpRoster(sampleRoster, { sample: { ...sample, cpm: false } }, gateway)
  }

  // Plans a new launch, named or from up to three comps: its own agent takes it, then it joins the
  // network's list, newest first, where every member's dashboard shows it. Its page is at its ID.
  @callable()
  async createLaunch(input: LaunchInput) {
    const { name, comps } = readLaunch(input, 'to plan it')
    const id = crypto.randomUUID()
    const launch = await getAgentByName(this.env.LaunchAgent, launchAgentName(this.name, id))
    const summary: LaunchSummary = { id, ...(await launch.plan({ name, comps: comps ?? [] })) }
    this.setState({ ...this.state, launches: [summary, ...(this.state.launches ?? [])] })
    return { id }
  }

  // The roster and CPM a launch's run starts from, with the evidence records the roster cites, for the
  // launch's agent to copy (launch-agent.ts). Over RPC only. Comp searches stay here, since a launch
  // never edits a show. Refused while a show is still being looked up, so no run ranks a roster half
  // looked up.
  rosterForLaunch(): RosterCopy {
    const pending = this.state.roster.filter((s) => s.resolution === 'pending').length
    if (pending > 0)
      throw new Refusal(
        'conflict',
        `The network's roster is still looking up ${pending === 1 ? '1 show' : `${pending} shows`} in Qloo. Start the run once the lookups have settled, so it ranks every show.`
      )
    const roster = this.state.roster.map((s) => ({ ...s, compSearch: null }))
    const cited = new Set(JSON.stringify(roster).match(CALL))
    return { roster, cpm: this.state.cpm, evidence: this.getEvidence().filter((e) => cited.has(e.call)) }
  }

  // A launch's status and summary, as its agent reports them after each change (launch-agent.ts), for
  // its row on every member's dashboard. Over RPC only. A launch no longer on the list stays off it.
  reportLaunch(id: string, summary: Omit<LaunchSummary, 'id'>) {
    const launches = this.state.launches ?? []
    if (!launches.some((l) => l.id === id)) return
    this.setState({ ...this.state, launches: launches.map((l) => (l.id === id ? { id, ...summary } : l)) })
  }

  // Takes launch `id` off the network's list, as its deletion does before wiping it (wipe.ts): its row
  // leaves every member's dashboard, and the Worker's routes to it answer 404. Over RPC only.
  dropLaunch(id: string) {
    const launches = this.state.launches ?? []
    if (launches.some((l) => l.id === id))
      this.setState({ ...this.state, launches: launches.filter((l) => l.id !== id) })
  }

  // Whether the network's list has launch `id`, for the Worker's routes to it. Over RPC only.
  listsLaunch(id: string) {
    return (this.state.launches ?? []).some((l) => l.id === id)
  }

  // Launches run in agents of their own (ADR 0001), so a network's agent refuses what only a launch
  // does. As it never runs a launch, `answer` and `getRun` only ever reach its inbox's pitch runs.
  @callable()
  startLaunch(): never {
    throw new Error(LAUNCHES)
  }

  @callable()
  editInsertionOrder(): never {
    throw new Error(LAUNCHES)
  }

  @callable()
  approveInsertionOrder(): never {
    throw new Error(LAUNCHES)
  }

  // A network that started from the sample roster leaves it by importing its own.
  @callable()
  clearSample(): never {
    throw new Error(
      "A network's roster isn't cleared. Import your own over it; shows already on it keep their matches."
    )
  }

  // The guide walks a visitor through the demo's sample launch, so a network has none.
  @callable()
  markGuide(): never {
    throw new Error(NO_GUIDE)
  }

  @callable()
  dismissGuide(): never {
    throw new Error(NO_GUIDE)
  }

  // The CPM is an owner's to change, in settings: the Worker checks the role and calls this over RPC.
  // The agent doesn't know members' roles, so a page's own connection is refused with why.
  @callable()
  setCpm(cpm: number) {
    if (getCurrentAgent().connection) throw new Error("The CPM is changed in the network's settings, by an owner.")
    super.setCpm(cpm)
  }

  // A reply is a member's to approve, in the app (ADR 0002): a connection the Worker let through names
  // its member, so one that names none, and any call with no connection, is refused.
  @callable()
  approveReply(pitchId: string) {
    if (!this.member()) throw new Error('Only a member of the network, signed in to the app, can approve a reply.')
    super.approveReply(pitchId)
  }

  // Hides the dashboard's setup checklist for the member on this connection, and no one else.
  @callable()
  dismissChecklist() {
    const member = this.member()
    if (!member) throw new Error('Only a member can dismiss the setup checklist.')
    const dismissed = this.state.checklistDismissed ?? []
    if (!dismissed.includes(member)) this.setState({ ...this.state, checklistDismissed: [...dismissed, member] })
  }
}
