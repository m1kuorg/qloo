import { createRoot } from 'react-dom/client'
import { MemberPage, SignInPage } from './Account'
import { App } from './App'

const root = document.getElementById('root')!
const { page, agentPath, rosterLink, next, memberName } = root.dataset
createRoot(root).render(
  page === 'sign-in' ? (
    <SignInPage next={next!} />
  ) : page === 'member' ? (
    <MemberPage name={memberName!} />
  ) : (
    <App page={page} agentPath={agentPath!} links={{ roster: rosterLink! }} />
  )
)
