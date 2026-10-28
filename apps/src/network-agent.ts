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
  type RunSnapshot,
  type SessionProps,
  type State
} from './agent'
import { globalGateway } from './gateway'
import type { Booking, PitchReply } from './inbox'
import { Refusal } from './refusal'
import { sample, sampleCpm, sampleRoster, type Sample } from './sample'
import { GUEST_NETWORK, GUEST_NETWORK_CLEARS, GUEST_PREFIX } from './text'

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

// The network an agent belongs to, from its name: the network's ID for its own agent, and
// `<networkId>:<launchId>` for a launch's.
const networkOf = (name: string) => name.split(':')[0]

// Whether a network counts on the guest budget every guest shares (ADR 0006), from one of its agents'
// names: its ID starts with `guest-`, as the guest network's and every network a guest member creates do.
export const onGuestBudget = (name: string) => networkOf(name).startsWith(GUEST_PREFIX)

// What a network's agents count against for the per-visitor limits: the network, or for one on the guest
// budget, the guest network.
export const networkLimitKey = (name: string) => `network:${onGuestBudget(name) ? GUEST_NETWORK : networkOf(name)}`

// The name of a network's own gateway instance (ADR 0004), from an agent's name: `network:<networkId>`,
// each network's its own, though the guest budget's networks count their limits under one key. And the
// instance, where the network's own Qloo key, its cache, and its Qloo counts live.
export const ownGatewayName = (name: string) => `network:${networkOf(name)}`
export const ownGateway = (env: Env, name: string) => env.QlooGateway.getByName(ownGatewayName(name))

// Where a network's agent, and each of its launches', keeps whether the network has a Qloo key of its own,
// as the network's settings last said (NetworkAgent.noteOwnKey), so no call asks its gateway instance
// first and a network without a key never has an instance.
const OWN_KEY = 'crossfeed_own_qloo_key'
export const hasOwnKey = (storage: DurableObjectStorage) => storage.kv.get(OWN_KEY) === true
export const keepOwnKey = (storage: DurableObjectStorage, set: boolean) => storage.kv.put(OWN_KEY, set)

// The gateway a network's Qloo calls go through, and its launches': its own instance while it has a key
// of its own, as the agent in `storage` knows, else the global one, as every other network's does.
export const networkGateway = (env: Env, name: string, storage: DurableObjectStorage) =>
  hasOwnKey(storage) ? ownGateway(env, name) : globalGateway(env)

// Closes member `memberId`'s open pages of network `networkId` and its launches, once the directory has
// let them go, saying `reason` if it isn't that they left the network, as when they're removed, sign
// out everywhere, or delete their account.
export const kickMember = async (env: Env, networkId: string, memberId: string, reason?: string) =>
  (await getAgentByName(env.NetworkAgent, networkId)).kick(memberId, reason)

// What the Worker passes a network's agent as it starts it to wipe it (wipe.ts): it's about to be thrown
// away, so the guest network's loads no sample, which would reserve Qloo calls on the guest budget for
// nothing.
export const CLEARING = { clearing: true }

// What a deleted network's open pages, and its launches', say as they close; and the guest network's,
// as the daily cron clears it.
export const NETWORK_DELETED = 'This network was deleted.'
export const GUEST_NETWORK_RESET = `The guest network was cleared, as it is every day at ${GUEST_NETWORK_CLEARS}.`

const LAUNCHES =
  "A network's agent keeps the roster and the inbox; each launch runs in its own workspace, with its runs and insertion order."
// Where a network's agent keeps the roster it last told its launches (rosterKey).
const ANNOUNCED = 'crossfeed_roster_announced'
// Where the guest network's agent keeps that it has loaded the sample network, and its sample launch's ID
// once it has planned it (loadSample).
const SAMPLE_LOADED = 'crossfeed_sample_loaded'
const SAMPLE_LAUNCH = 'crossfeed_sample_launch'

// A pitch run's booking with no reply naming member `memberId` as its approver; each stays approved.
const withoutApprover = (booking: Booking | null, memberId: string): Booking | null =>
  booking?.replies
    ? { ...booking, replies: booking.replies.map((r) => (r.approvedBy === memberId ? unnamed(r) : r)) }
    : booking
const unnamed = ({ approvedBy: _, ...reply }: PitchReply): PitchReply => reply

// One instance per signed-in network, named by the network's ID (ADR 0001). Its own class keeps its
// namespace apart from engine sessions, so no session cookie can name it. It opens empty, but for
// the guest network, which loads the sample network (loadSample), and every connection to it carries
// its member.
export class NetworkAgent extends CrossfeedAgent {
  initialState: State = { ...this.initialState, launches: [], checklistDismissed: [] }

  protected opensOnSample = false
  protected keepsSettledShows = true

  // The network's Qloo calls and model runs count together, as one visitor's would, whichever member
  // makes them, and with no connection at all, as the Worker's own calls have (TRD agent limits).
  protected limitKey() {
    return networkLimitKey(this.name)
  }

  // An agent from before #197 was never told whether the network has a Qloo key of its own, which one
  // saved then is kept in the network's gateway instance: it asks that instance once, as it next starts.
  // A new network's agent knows it has none until its settings say otherwise, so it asks nothing. One
  // that can't ask goes on without, and asks again as it next starts.
  async onStart(props?: SessionProps & Partial<typeof CLEARING>) {
    const { storage } = this.ctx
    if (storage.kv.get(OWN_KEY) === undefined)
      if (!this.startedBefore()) keepOwnKey(storage, false)
      else
        await ownGateway(this.env, this.name)
          .ownKey()
          .then(({ set }) => keepOwnKey(storage, set))
          .catch((e) => console.error(JSON.stringify({ event: 'own_key_lookup', error: String(e) })))
    await super.onStart(props)
    if (this.name !== GUEST_NETWORK) return
    if (this.env.SAMPLE_NETWORK === 'on' && !props?.clearing) await this.loadSample()
    // The guest network starts with the sample network's CPM, until a guest, an owner, sets one (ADR 0006),
    // even when the sample roster couldn't load. One that left the sample by importing over it lost the
    // CPM with it, as the sample's, so it stays unset.
    if (this.state.cpm === null && this.state.roster.length === 0) this.setState({ ...this.state, cpm: sampleCpm })
  }

  // Loads the sample network into the guest network on its first start, each day after the daily cron
  // clears it (ADR 0007): the sample CPM labelled as a sample figure, the sample launch planned, and the
  // sample roster with its labels, looked up like an import. The CPM and the plan call nothing, so they
  // land whatever the lookups do; the lookups count on the guest budget, and refused, the roster stays
  // empty, with the sample to start from. Until it's noted as loaded, each start tries again what didn't
  // land: a roster still empty, the lookups that failed, the launch if it wasn't planned. It's noted once
  // a start finds the roster settled and the launch planned, or finds the sample replaced by a guest's
  // import. It runs before any page connects, so it plans the launch and reserves the calls here, and
  // leaves the lookups to run in the background.
  private async loadSample() {
    const { kv } = this.ctx.storage
    if (kv.get(SAMPLE_LOADED)) return
    const { roster } = this.state
    if (roster.length > 0 && !this.state.sample) return kv.put(SAMPLE_LOADED, true)
    const failed = (e: unknown) => console.error(JSON.stringify({ event: 'sample_load', error: String(e) }))
    if (!this.state.sample) {
      // A CPM a guest set before the sample loaded is theirs, so it stays, unlabelled.
      const cpm = this.state.cpm ?? sampleCpm
      this.setState({ ...this.state, cpm, sample: { ...sample, cpm: cpm === sampleCpm } })
    }
    let planned = kv.get(SAMPLE_LAUNCH) !== undefined
    if (!planned)
      try {
        kv.put(SAMPLE_LAUNCH, (await this.planLaunch(sample.launch, this.state.sample)).id)
        planned = true
      } catch (e) {
        failed(e)
      }
    const missing = roster.length === 0 ? sampleRoster.length : roster.filter((s) => s.resolution === 'failed').length
    if (missing === 0) {
      if (planned) kv.put(SAMPLE_LOADED, true)
      return
    }
    try {
      const gateway = await this.reserveCalls(this.limitKey(), missing)
      if (roster.length > 0) this.lookUpRoster(roster, {}, gateway, [])
      else this.lookUpRoster(sampleRoster, {}, gateway)
    } catch (e) {
      failed(e)
    }
  }

  // Its Qloo calls go through its own gateway instance while it has a Qloo key of its own (ADR 0004).
  protected async gateway() {
    return networkGateway(this.env, this.name, this.ctx.storage)
  }

  // Whether the network has a Qloo key of its own, for its settings and usage. Over RPC only.
  hasOwnKey() {
    return hasOwnKey(this.ctx.storage)
  }

  // Notes whether the network has a Qloo key of its own, as an owner adds or removes it in settings, and
  // tells each launch, so a run under way sends its next call through the right gateway. A launch the
  // notice fails to reach learns it as its next run copies the roster. Over RPC only.
  async noteOwnKey(set: boolean) {
    keepOwnKey(this.ctx.storage, set)
    await Promise.all(
      (this.state.launches ?? []).map(async ({ id }) => {
        try {
          await (await getAgentByName(this.env.LaunchAgent, launchAgentName(this.name, id))).noteOwnKey(set)
        } catch (e) {
          console.error(JSON.stringify({ event: 'own_key_notice', launch: id, error: String(e) }))
        }
      })
    )
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

  // Lets go of the network as its deletion, or the guest network's daily reset, wipes it (wipe.ts): its
  // open pages close for good, saying `reason`, so none plans another launch, and it returns the
  // launches it lists, to be wiped with it. Over RPC only.
  letGo(reason = NETWORK_DELETED) {
    for (const connection of this.getConnections()) connection.close(4410, reason)
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

  // Forgets member `memberId`, as their account's deletion does (wipe.ts): the replies they approved stay
  // approved but no longer name them, and they leave the members who dismissed the setup checklist. Then
  // each of its launches forgets their name, and the network lists each launch's row as it then stands,
  // so the dashboard follows at once; then its runs' records forget them, last, so a pitch run that ended
  // meanwhile, copying the rows as they stood, is caught. Over RPC only.
  async forgetMember(memberId: string) {
    const { booking, checklistDismissed: dismissed = [] } = this.state
    if (booking?.replies?.some((r) => r.approvedBy === memberId) || dismissed.includes(memberId))
      this.setState({
        ...this.state,
        booking: withoutApprover(booking, memberId),
        checklistDismissed: dismissed.filter((m) => m !== memberId)
      })
    const rows = await Promise.all(
      (this.state.launches ?? []).map(async ({ id }) => ({
        id,
        summary: await (
          await getAgentByName(this.env.LaunchAgent, launchAgentName(this.name, id))
        ).forgetMember(memberId)
      }))
    )
    for (const { id, summary } of rows) this.reportLaunch(id, summary)
    this.forgetInRuns(memberId)
  }

  // Forgets member `memberId` in each run's record, as their account's deletion does: the replies they
  // approved no longer name them. A record is the whole state the run ended with (end() in agent.ts), so
  // it also kept the network's launches and checklist, whose rows name who started each launch's last run
  // with no ID to match; nothing reads them from a record, so they go. Parsed rather than rewritten in SQL
  // as renameApprover does, since the approver sits in each reply of an array.
  private forgetInRuns(memberId: string) {
    for (const { id, snapshot } of this.sql<{ id: string; snapshot: string }>`SELECT id, snapshot FROM runs
      WHERE json_type(snapshot, '$.launches') IS NOT NULL OR json_type(snapshot, '$.checklistDismissed') IS NOT NULL
        OR instr(snapshot, ${memberId}) > 0`) {
      const { launches: _, checklistDismissed: __, ...kept } = JSON.parse(snapshot) as RunSnapshot
      const forgotten = { ...kept, booking: withoutApprover(kept.booking, memberId) }
      this.sql`UPDATE runs SET snapshot = ${JSON.stringify(forgotten)} WHERE id = ${id}`
    }
  }

  // Starts the network's roster from the sample network's shows, each figure labelled sample until a
  // member changes it, looked up like an import. The sample's notice comes with its show names; its CPM
  // doesn't, since the network's is an owner's to set, but for the guest network's, still labelled the
  // sample's as its lookups were refused (loadSample).
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
    this.lookUpRoster(sampleRoster, { sample: { ...sample, cpm: this.state.sample?.cpm ?? false } }, gateway)
  }

  // Plans a new launch, named or from up to three comps: its own agent takes it, then it joins the
  // network's list, newest first, where every member's dashboard shows it. Its page is at its ID. A
  // network keeps at most LAUNCHES_PER_NETWORK launches; deleting one makes room. Launches still being
  // planned count, since several can be planned at once while their agents take them.
  @callable()
  async createLaunch(input: LaunchInput) {
    return this.planLaunch(input, null)
  }

  // Plans a launch as createLaunch does, carrying `sample` for the guest network's sample launch.
  private async planLaunch(input: LaunchInput, sample: Sample | null) {
    const { name, comps } = readLaunch(input, 'to plan it')
    const cap = Number(this.env.LAUNCHES_PER_NETWORK) || 0
    if ((this.state.launches ?? []).length + this.planning >= cap)
      throw new Refusal(
        'limit',
        `A network keeps at most ${cap === 1 ? '1 launch' : `${cap} launches`} at once. Delete one it no longer needs, on the dashboard, to plan another.`
      )
    this.planning++
    try {
      const id = crypto.randomUUID()
      const launch = await getAgentByName(this.env.LaunchAgent, launchAgentName(this.name, id))
      const summary: LaunchSummary = { id, ...(await launch.plan({ name, comps: comps ?? [], sample })) }
      this.setState({ ...this.state, launches: [summary, ...(this.state.launches ?? [])] })
      return { id }
    } finally {
      this.planning--
    }
  }

  // How many launches createLaunch is planning right now, not yet on the list.
  private planning = 0

  // The roster and CPM a run of launch `id` starts from, with the evidence records the roster cites,
  // whether the network has a Qloo key of its own, and the sample for the guest network's sample launch,
  // for the launch's agent to copy (launch-agent.ts). Over RPC only. Comp searches stay here, since a
  // launch never edits a show. Refused while a show is still being looked up, so no run ranks a roster
  // half looked up.
  rosterForLaunch(id: string): RosterCopy {
    const pending = this.state.roster.filter((s) => s.resolution === 'pending').length
    if (pending > 0)
      throw new Refusal(
        'conflict',
        `The network's roster is still looking up ${pending === 1 ? '1 show' : `${pending} shows`} in Qloo. Start the run once the lookups have settled, so it ranks every show.`
      )
    const roster = this.state.roster.map((s) => ({ ...s, compSearch: null }))
    const cited = new Set(JSON.stringify(roster).match(CALL))
    return {
      roster,
      cpm: this.state.cpm,
      evidence: this.getEvidence().filter((e) => cited.has(e.call)),
      ownKey: hasOwnKey(this.ctx.storage),
      sample: id === this.ctx.storage.kv.get(SAMPLE_LAUNCH) ? this.state.sample : null
    }
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
