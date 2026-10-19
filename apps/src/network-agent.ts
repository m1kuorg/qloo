import { callable, getCurrentAgent, type Connection, type ConnectionContext } from 'agents'
import { CrossfeedAgent, type State } from './agent'
import { sample, sampleRoster } from './sample'

// The header that names a connection's member. The Worker sets it on each upgrade it lets through to
// a network's agent, once it has checked the session and the membership, replacing any the browser
// sent; nothing else reaches the agent.
export const MEMBER_HEADER = 'Crossfeed-Member'

// What a network's agents count against for the per-visitor limits: the network, from the agent's
// name, which is the network's ID for its own agent and `<networkId>:<launchId>` for a launch's.
export const networkLimitKey = (name: string) => `network:${name.split(':')[0]}`

const LAUNCHES =
  "A network's agent keeps the roster and the inbox; each launch runs in its own workspace, with its runs and insertion order."
const NO_GUIDE = "A network has no guide: it's the sample network's, at /demo."

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

  // Tags a connection with its member, beside its visitor.
  async getConnectionTags(connection: Connection, context: ConnectionContext) {
    const member = context.request.headers.get(MEMBER_HEADER)
    return [...(await super.getConnectionTags(connection, context)), ...(member ? [`member:${member}`] : [])]
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
    await this.reserveCalls(this.limitKey(), sampleRoster.length)
    empty() // again, since an import may have started meanwhile
    this.lookUpRoster(sampleRoster, { sample: { ...sample, cpm: false } })
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
