import { createRoot } from 'react-dom/client'
import { App } from './App'

const root = document.getElementById('root')!
const { page, agent, roster } = root.dataset
createRoot(root).render(<App page={page} agentPath={agent!} links={{ roster: roster! }} />)
