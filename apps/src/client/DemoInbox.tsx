import type { Links } from './App'
import { SampleShell, useSession } from './Demo'
import { InboxWorkspace } from './Inbox'

// The demo's inbox page, on the visitor's session, while GUEST_PITCHES is on.
export function DemoInboxPage({ agentPath, links }: { agentPath: string; links: Links }) {
  const agent = useSession(agentPath)
  const sample = agent.state?.sample
  return (
    <>
      {sample && <SampleShell sample={sample} />}
      <InboxWorkspace agent={agent} links={links} />
    </>
  )
}
