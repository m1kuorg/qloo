import { useAgent } from 'agents/react'
import { createPortal } from 'react-dom'
import type { CrossfeedAgent, State } from '../agent'
import type { Sample } from '../sample'

// What the demo's two pages, the roster and the inbox, share: the visitor's session and the sample
// network's labels in the top bar.

// The page's agent, at the path the server gives. The server picks the instance, as the demo's does
// from the session cookie. `basePath` takes the path without its leading slash.
export const useSession = (path: string) =>
  useAgent<CrossfeedAgent, State>({ agent: 'CrossfeedAgent', basePath: path.replace(/^\//, '') })

// The sample network's name and not-affiliated notice, in the top bar the server renders.
export function SampleShell({ sample }: { sample: Sample }) {
  const network = document.getElementById('shell-network')
  const notice = document.getElementById('shell-notice')
  return (
    <>
      {network && createPortal(<span className="net">{sample.network} · sample network</span>, network)}
      {notice &&
        createPortal(<span className="sample-tag">Sample data · not affiliated with {sample.network}</span>, notice)}
    </>
  )
}
