import { callable, getCurrentAgent, type Connection, type ConnectionContext } from 'agents'
import { CrossfeedAgent, type State } from './agent'

// The header that names a connection's member. The Worker sets it on each upgrade it lets through to
// a network's agent, once it has checked the session and the membership, replacing any the browser
// sent; nothing else reaches the agent.
export const MEMBER_HEADER = 'Crossfeed-Member'

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

  // Tags a connection with its member, beside its visitor.
  async getConnectionTags(connection: Connection, context: ConnectionContext) {
    const member = context.request.headers.get(MEMBER_HEADER)
    return [...(await super.getConnectionTags(connection, context)), ...(member ? [`member:${member}`] : [])]
  }

  // The CPM is an owner's to change, in settings: the Worker checks the role and calls this over RPC.
  // The agent doesn't know members' roles, so a page's own connection is refused with why.
  @callable()
  setCpm(cpm: number) {
    if (getCurrentAgent().connection) throw new Error("The CPM is changed in the network's settings, by an owner.")
    super.setCpm(cpm)
  }

  // Hides the dashboard's setup checklist for the member on this connection, and no one else.
  @callable()
  dismissChecklist() {
    const member = getCurrentAgent()
      .connection?.tags.find((t) => t.startsWith('member:'))
      ?.slice('member:'.length)
    if (!member) throw new Error('Only a member can dismiss the setup checklist.')
    const dismissed = this.state.checklistDismissed ?? []
    if (!dismissed.includes(member)) this.setState({ ...this.state, checklistDismissed: [...dismissed, member] })
  }
}
