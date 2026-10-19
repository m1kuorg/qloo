import { callable, getAgentByName, getCurrentAgent, type Connection, type ConnectionContext } from 'agents'
import {
  CrossfeedAgent,
  newComp,
  rosterKey,
  type LaunchInput,
  type LaunchSummary,
  type RosterCopy,
  type Show,
  type State
} from './agent'
import { finalistsOf } from './fit'
import { MEMBER_NAME_HEADER, memberTag, networkGateway, networkLimitKey } from './network-agent'

const ROSTER =
  "A launch ranks its network's roster, which members edit on the network's roster page. Each run copies the roster as it starts."
const INBOX = "A launch has no inbox: guest pitches go to the network's inbox, on its own page."
const NO_GUIDE = "A launch has no guide: it's the sample network's, at /demo."

// How many times a launch tries to report a change to its network.
const REPORT_ATTEMPTS = 3

// One instance per launch of a signed-in network, named `<networkId>:<launchId>` (ADR 0001). Its own
// class keeps its namespace apart from the demo's sessions and the networks'. It holds the launch, its
// runs, and their rankings and insertion orders; the roster and the inbox are its network's.
export class LaunchAgent extends CrossfeedAgent {
  initialState: State = { ...this.initialState, guide: { seen: [], dismissed: true } }

  protected opensOnSample = false

  // A launch's Qloo calls and model runs count among its network's (TRD agent limits).
  protected limitKey() {
    return networkLimitKey(this.name)
  }

  // And through its network's gateway: its own instance while the network has a Qloo key of its own.
  protected gateway() {
    return networkGateway(this.env, this.name)
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
  startLaunchAs(input: LaunchInput, startedBy: string) {
    return this.runLaunch(input, startedBy)
  }

  // An insertion order is a member's to approve, in the app (ADR 0002): a connection the Worker let
  // through names its member, so one that names none, and any call with no connection, is refused.
  @callable()
  approveInsertionOrder(id: string) {
    if (!this.member())
      throw new Error('Only a member of the network, signed in to the app, can approve an insertion order.')
    super.approveInsertionOrder(id)
  }

  // After any change to what the network's list says of the launch, reports it there, in order, so
  // every member's dashboard follows the launch live. Nothing is reported before the network plans
  // it: the SDK reports the initial state as a change as it first seeds it, and that report, landing
  // after the network had listed the planned launch, showed the launch without its name.
  onStateChanged(state: State) {
    if (!state.launch) return
    const summary = summaryOf(state)
    const said = JSON.stringify(summary)
    if (said === this.reported) return
    this.reported = said
    this.reports = this.reports.then(() => this.report(summary, said))
    void this.keepAliveWhile(() => this.reports)
  }

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
    return this.name.split(':')[0]
  }

  private get launchId() {
    return this.name.split(':')[1]
  }

  // Each run ranks the network's roster as it stands when the run starts.
  protected async networkRoster(): Promise<RosterCopy> {
    return (await getAgentByName(this.env.NetworkAgent, this.networkId)).rosterForLaunch()
  }

  // Wipes the launch once its network has let go of it (wipe.ts), as when it's deleted, or its network
  // is. Its open pages close first, for good, saying why; the client takes a 4000s close code as final.
  async destroy(reason = 'This launch was deleted.') {
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
  // network lists for it. Over RPC only: a page starts a run instead, which may name it anew.
  plan({ name, comps }: { name: string | null; comps: string[] }) {
    this.setState({ ...this.state, launch: { name, match: null, comps: comps.map(newComp) } })
    return summaryOf(this.state)
  }

  // The roster and the inbox are the network's (ADR 0001), so a launch's agent refuses their actions,
  // over RPC as from its page. Each override keeps `@callable()`, so a page's call reaches it to be
  // refused rather than finding no method.
  @callable()
  importRoster(): never {
    throw new Error(ROSTER)
  }

  @callable()
  clearSample(): never {
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

  // The guide walks a visitor through the demo's sample launch, so a launch has none.
  @callable()
  markGuide(): never {
    throw new Error(NO_GUIDE)
  }

  @callable()
  dismissGuide(): never {
    throw new Error(NO_GUIDE)
  }
}

// What the network's list says of a launch, from its state: its latest run's status, or once that
// run has completed, its order's; its finalists, its order's slots and their total value; and who
// started its latest run, and when.
export function summaryOf({ launch, run, runs, ranking, insertionOrder: order }: State): Omit<LaunchSummary, 'id'> {
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
