import { createRoot } from 'react-dom/client'
import { App } from './App'

const root = document.getElementById('root')!
const { page, agentPath, rosterLink } = root.dataset
createRoot(root).render(<App page={page} agentPath={agentPath!} links={{ roster: rosterLink! }} />)
