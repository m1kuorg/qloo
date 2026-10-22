import { SampleShell, useSession, Workspace, type Links } from './App'
import { InboxWorkspace } from './Inbox'

// The demo's pages, on the visitor's session. The server's choices: `page`, "roster", or "inbox" while
// GUEST_PITCHES is on; the agent's path; and the links.
export function DemoPage({ page, agentPath, links }: { page: string | undefined; agentPath: string; links: Links }) {
  const agent = useSession(agentPath)
  const sample = agent.state?.sample
  if (page !== 'inbox') return <Workspace agent={agent} links={links} />
  return (
    <>
      {sample && <SampleShell sample={sample} />}
      <InboxWorkspace agent={agent} links={links} />
    </>
  )
}
