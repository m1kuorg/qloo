import { callable, getAgentByName, getCurrentAgent, type Connection, type ConnectionContext } from 'agents'
import {
  CrossfeedAgent,
  newComp,
  rosterKey,
  type CommittedLines,
  type LaunchInput,
  type LaunchSummary,
  type RosterCopy,
  type RunSummary,
  type Show,
  type Starter,
  type State
} from './agent'
import { finalistsOf } from './fit'
import type { InsertionOrder } from './order'
import type { Sample } from './sample'
import type { CapturedRun } from './sample-launches'
import {
  keepOwnKey,
  LAUNCH_DELETED,
  MEMBER_NAME_HEADER,
  memberTag,
  networkGateway,
  networkLimitKey,
  readLaunchAgentName
} from './network-agent'
import { launchCloseReason } from './wipe'

const ROSTER =
  "A launch ranks its network's roster, which members edit on the network's roster page. Each run copies the roster as it starts."
const INBOX = "A launch has no inbox: guest pitches go to the network's inbox, on its own page."
// Who a deleted member's runs and approvals say they were by (forgetMember).
const FORMER_MEMBER = 'Former member'

// How many times a launch tries to report a change to its network.
const REPORT_ATTEMPTS = 3

// What a launch's row says it commits of the roster's promo inventory (LaunchAgent.inventory).
type Inventory = Required<Pick<LaunchSummary, 'finalistShows' | 'approvedLines' | 'draftLines'>>

// One instance per launch of a signed-in network, named `<networkId>:<launchId>` (ADR 0001). Its own
// class keeps its namespace apart from engine sessions and the networks'. It holds the launch, its
// runs, and their rankings and insertion orders; the roster and the inbox are its network's.
export class LaunchAgent extends CrossfeedAgent {
  protected opensOnSample = false

  // A launch's Qloo calls and model runs count among its network's (TRD agent limits).
  protected limitKey() {
    return networkLimitKey(this.name)
  }

  // And through its network's gateway: its own instance while the network has a Qloo key of its own, as
  // the launch last heard, from the network's notice or its latest run's copy of the roster.
  protected async gateway() {
    return networkGateway(this.env, this.name, this.ctx.storage)
  }

  // Whether the network has a Qloo key of its own, which the network sends as an owner adds or removes
  // it. Over RPC only.
  noteOwnKey(set: boolean) {
    keepOwnKey(this.ctx.storage, set)
  }

  // Tags a connection with its member, beside its visitor, as a network's agent does.
  async getConnectionTags(connection: Connection, context: ConnectionContext) {
    return [...(await super.getConnectionTags(connection, context)), ...memberTag(context)]
  }

  // Keeps the member's name on their connection, as the Worker gave it, to say who started a run.
  onConnect(connection: Connection<{ memberName: string }>, { request }: ConnectionContext) {
    const name = request.headers.get(MEMBER_NAME_HEADER)
    if (name) connection.setState({ memberName: decodeURIComponent(name) })
  }

  protected memberName() {
    return (getCurrentAgent().connection?.state as { memberName?: string } | null)?.memberName ?? null
  }

  // Starts a run for a program, through the API or the MCP server (operations.ts), which has no
  // connection to name its member: the Worker names who started it, the member whose session called or
  // the API key. Over RPC only, so a page can't name anyone but its own member.
  startLaunchAs(input: LaunchInput, starter: Starter) {
    return this.runLaunch(input, starter)
  }

  // Forgets member `memberId`'s name, as their account's deletion does (NetworkAgent.forgetMember): the
  // runs they started and the orders they approved, earlier runs' orders too, say FORMER_MEMBER and keep
  // no ID of theirs. Returns the row its network lists for it. Over RPC only.
  forgetMember(memberId: string) {
    const { runs, insertionOrder: order } = this.state
    if (runs.some((r) => r.startedById === memberId) || order?.approvedById === memberId)
      this.setState({
        ...this.state,
        runs: runs.map((r) => (r.startedById === memberId ? formerStarter(r) : r)),
        insertionOrder: order?.approvedById === memberId ? formerApprover(order) : order
      })
    this.renameApprover(memberId, FORMER_MEMBER)
    return this.summary()
  }

  // An insertion order is a member's to approve, in the app (ADR 0002): a connection the Worker let
  // through names its member, so one that names none, and any call with no connection, is refused.
  @callable()
  async approveInsertionOrder(id: string) {
    if (!this.member())
      throw new Error('Only a member of the network, signed in to the app, can approve an insertion order.')
    await super.approveInsertionOrder(id)
  }

  // Once its network no longer lists it, the launch takes no more work: as after the daily clearing, which
  // takes the guest network's launches off its list and leaves their agents to the hourly retry's wipe, or
  // a deletion whose wipe failed (wipe.ts). Why, as its wipe was noted, or null while it's listed.
  protected async gone() {
    const network = await getAgentByName(this.env.NetworkAgent, this.networkId)
    return (await network.listsLaunch(this.launchId)) ? null : launchCloseReason(this.env, this.name)
  }

  // After any change to what the network's list says of the launch, reports it there, in order, so
  // every member's Launches page follows the launch live. Nothing is reported before the network plans
  // it: the SDK reports the initial state as a change as it first seeds it, and that report, landing
  // after the network had listed the planned launch, showed the launch without its name.
  onStateChanged(state: State) {
    if (!state.launch) return
    // Once the change's own writes are done: a run's end, and an order's save, keep what the run ended
    // with just after setting the state, and the row's promo inventory is read from that.
    void Promise.resolve()
      .then(() => this.reportSummary())
      .catch((e) => console.error(JSON.stringify({ event: 'launch_report', launch: this.launchId, error: String(e) })))
  }

  // Reports the launch's row as it now stands, unless it's the one last reported.
  private reportSummary() {
    const summary = this.summary()
    const said = JSON.stringify(summary)
    if (said === this.reported) return
    this.reported = said
    this.reports = this.reports.then(() => this.report(summary, said))
    void this.keepAliveWhile(() => this.reports)
  }

  // The row the network lists for the launch (summaryOf), with what it commits of the roster's promo
  // inventory. Over RPC too, for the network to ask a launch whose row predates that (#406), and for a
  // program's read of the launch.
  summary(): Omit<LaunchSummary, 'id'> {
    return { ...summaryOf(this.state), ...this.inventory() }
  }

  // What the launch commits of the roster's promo inventory, read from what its runs ended with rather
  // than from its state, since a new run clears the ranking and the order the state shows (#406): its
  // latest completed run's finalists; its latest approved order's lines; and its latest run's order while
  // that's a draft, so newer than any approved one, which keeps counting apart from it. An approved order
  // edited back to draft is a draft, so the latest order still approved counts, such as an earlier run's
  // that ad operations already has. It reads only the finalists of that one run and each run's order, and
  // only once the runs or the order have changed, as every change to what a run ended with comes with one.
  private inventory(): Inventory {
    const { runs, insertionOrder } = this.state
    const key = JSON.stringify([runs.map((r) => [r.id, r.status]), insertionOrder])
    if (key === this.inventoryRead?.key) return this.inventoryRead.facts
    const completed = runs.findLast((r) => r.status === 'completed')?.id ?? null
    const finalists = this.sql<{ show: string }>`
      SELECT json_extract(row.value, '$.show') AS show FROM runs, json_each(runs.snapshot, '$.ranking.rows') AS row
      WHERE runs.id = ${completed} AND json_extract(row.value, '$.finalist') ORDER BY row.key`
    // Each run's own order, as the export reads it (earlierOrder), priced as its run copied the CPM.
    const orders = this.sql<{ id: string; order: string; sampleCpm: number | null; sample: number | null }>`
      SELECT id, json_extract(snapshot, '$.insertionOrder') AS "order", json_extract(snapshot, '$.sampleCpm') AS "sampleCpm",
        json_extract(snapshot, '$.sample.cpm') AS sample
      FROM runs WHERE json_extract(snapshot, '$.insertionOrder.run') = id ORDER BY started_at, rowid`.map((r) => {
      const order: InsertionOrder = JSON.parse(r.order)
      const lines: CommittedLines = {
        run: r.id,
        cpm: order.cpm,
        sampleCpm: Boolean(r.sampleCpm || r.sample),
        lines: order.lines.map(({ show, slots, value }) => ({ show, slots, value }))
      }
      return { status: order.status, lines }
    })
    const facts = {
      finalistShows: finalists.map((r) => r.show),
      approvedLines: orders.findLast((o) => o.status === 'approved')?.lines ?? null,
      draftLines: orders.find((o) => o.lines.run === runs.at(-1)?.id && o.status === 'draft')?.lines ?? null
    }
    this.inventoryRead = { key, facts }
    return facts
  }

  // The promo inventory as last read, and the runs and order it was read for.
  private inventoryRead: { key: string; facts: Inventory } | null = null

  // The summary last reported, and the reports still being sent.
  private reported: string | null = null
  private reports = Promise.resolve()

  // Sends a report, trying a failed one twice more unless a newer one replaces it. One that still
  // fails is logged, and the next change sends the row whole again.
  private async report(summary: Omit<LaunchSummary, 'id'>, said: string) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await (await getAgentByName(this.env.NetworkAgent, this.networkId)).reportLaunch(this.launchId, summary)
      } catch (e) {
        console.error(JSON.stringify({ event: 'launch_report', launch: this.launchId, attempt, error: String(e) }))
        if (this.reported !== said) return
        if (attempt === REPORT_ATTEMPTS) {
          this.reported = null
          return
        }
        await new Promise((retry) => setTimeout(retry, attempt * 1000))
      }
    }
  }

  // The network's ID and the launch's, from the agent's name (launchAgentName).
  private get networkId() {
    return readLaunchAgentName(this.name).networkId
  }

  private get launchId() {
    return readLaunchAgentName(this.name).launchId
  }

  // Each run ranks the network's roster as it stands when the run starts, and its calls follow the
  // network's Qloo key as it then stands.
  protected async networkRoster(): Promise<RosterCopy> {
    const copy = await (await getAgentByName(this.env.NetworkAgent, this.networkId)).rosterForLaunch(this.launchId)
    this.noteOwnKey(copy.ownKey)
    return copy
  }

  // Wipes the launch once its network has let go of it (wipe.ts), as when it's deleted, or its network
  // is. Its open pages close first, for good, saying why; the client takes a 4000s close code as final.
  async destroy(reason = LAUNCH_DELETED) {
    for (const connection of this.getConnections()) connection.close(4410, reason)
    await super.destroy()
  }

  // The network's roster as it now stands (rosterKey), which the network sends after each change to
  // it. The page says the roster has changed while it differs from the copy the latest run ranks.
  // Over RPC only.
  noteNetworkRoster(key: string) {
    this.heardRoster = key
    if (this.state.runs.length === 0) return
    const changed = this.rosterChangedSince(this.state.roster)
    if (changed !== this.state.rosterChanged) this.setState({ ...this.state, rosterChanged: changed })
  }

  // The network's roster as it last said it stands, if it has since this instance started.
  private heardRoster: string | null = null

  // A run's copy differs from the network's roster when the network has since said otherwise, as when
  // a change lands while the copy is on its way.
  protected rosterChangedSince(copy: Show[]) {
    return this.heardRoster !== null && this.heardRoster !== rosterKey(copy)
  }

  // Sets the launch it plans, named or from comps, as its network creates it, and returns the row the
  // network lists for it; the guest network's sample launch comes with the sample, which each run's copy
  // of the roster carries from then on (NetworkAgent.rosterForLaunch). Over RPC only: a page starts a run
  // instead, which may name it anew.
  plan({ name, comps, sample = null }: { name: string | null; comps: string[]; sample?: Sample | null }) {
    this.setState({ ...this.state, launch: { name, match: null, comps: comps.map(newComp) }, sample })
    return this.summary()
  }

  // Seeds the launch with `run`, as the network lists it as one of its sample launches (sample-launches.ts),
  // calling neither Qloo nor Claude (CrossfeedAgent.seedRun), and returns the row the network lists for it,
  // its promo inventory read from the run it was seeded with.
  // Its `sample` stays null: only the sample launch, The Watch, replays. A launch already planned or seeded
  // stays as it is, so a load the network tries again seeds nothing twice. Over RPC only.
  seed(run: CapturedRun) {
    if (!this.state.launch) this.seedRun(run)
    return this.summary()
  }

  // The roster and the inbox are the network's (ADR 0001), so a launch's agent refuses their actions,
  // over RPC as from its page. Each override keeps `@callable()`, so a page's call reaches it to be
  // refused rather than finding no method.
  @callable()
  importRoster(): never {
    throw new Error(ROSTER)
  }

  @callable()
  searchComps(): never {
    throw new Error(ROSTER)
  }

  @callable()
  updateShow(): never {
    throw new Error(ROSTER)
  }

  @callable()
  setCpm(): never {
    throw new Error("A launch's runs take the network's CPM, which an owner changes in its settings.")
  }

  @callable()
  loadInbox(): never {
    throw new Error(INBOX)
  }

  @callable()
  confirmWork(): never {
    throw new Error(INBOX)
  }

  @callable()
  startPitches(): never {
    throw new Error(INBOX)
  }

  @callable()
  editReply(): never {
    throw new Error(INBOX)
  }

  @callable()
  approveReply(): never {
    throw new Error(INBOX)
  }

  @callable()
  discardReply(): never {
    throw new Error(INBOX)
  }
}

// What the network's list says of a launch, from its state: its latest run's status, or once that
// run has completed, its order's; its finalists, its order's slots and their total value; and who
// started its latest run, and when.
function summaryOf({ launch, run, runs, ranking, insertionOrder: order }: State): Omit<LaunchSummary, 'id'> {
  const last = runs.at(-1)
  return {
    name: launch?.name ?? null,
    comps: launch?.comps.map((c) => c.name) ?? [],
    status: !run
      ? 'new'
      : run.status !== 'completed'
        ? run.status
        : !order
          ? 'ranked'
          : order.status === 'approved'
            ? 'order approved'
            : 'order drafted',
    finalists: finalistsOf(ranking).length,
    slots: order?.slots ?? null,
    slotValue: order?.total ?? null,
    startedBy: last?.startedBy ?? null,
    lastRun: last?.startedAt ?? null
  }
}

// A run, and an order, by a member whose account was deleted: by FORMER_MEMBER, with no ID.
const formerStarter = ({ startedById: _, ...run }: RunSummary): RunSummary => ({ ...run, startedBy: FORMER_MEMBER })
const formerApprover = ({ approvedById: _, ...order }: InsertionOrder): InsertionOrder => ({
  ...order,
  approvedBy: FORMER_MEMBER
})
