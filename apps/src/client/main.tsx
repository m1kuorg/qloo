import { createRoot } from 'react-dom/client'
import type { Role } from '../directory'
import { NewNetworkPage, SignInPage, wireSignOut } from './Account'
import { App } from './App'
import { DashboardPage } from './Dashboard'
import { NetworkInboxPage } from './NetworkInbox'
import { RosterPage } from './Roster'
import { SettingsPage } from './Settings'

const root = document.getElementById('root')!
const d = root.dataset
// A network's page, as the server describes it.
const network = () => ({
  id: d.networkId!,
  name: d.networkName!,
  role: d.role as Role,
  links: { roster: d.rosterLink!, inbox: d.inboxLink ?? null, settings: d.settingsLink! }
})
createRoot(root).render(
  d.page === 'sign-in' ? (
    <SignInPage next={d.next!} />
  ) : d.page === 'new-network' ? (
    <NewNetworkPage cap={Number(d.cap)} />
  ) : d.page === 'dashboard' ? (
    <DashboardPage
      agentPath={d.agentPath!}
      network={network()}
      memberId={d.memberId!}
      setup={{ invited: d.invited === 'true', apiKey: d.apiKey === 'true' }}
    />
  ) : d.page === 'network-roster' ? (
    <RosterPage agentPath={d.agentPath!} network={network()} />
  ) : d.page === 'network-inbox' ? (
    <NetworkInboxPage agentPath={d.agentPath!} network={network()} />
  ) : d.page === 'settings' ? (
    <SettingsPage agentPath={d.agentPath!} network={network()} />
  ) : (
    <App page={d.page} agentPath={d.agentPath!} links={{ roster: d.rosterLink! }} />
  )
)

// The app shell's menus, the network switcher and the account menu: one open at a time, closed by a
// click outside or Escape, which returns focus to the menu's button.
const menus = [...document.querySelectorAll<HTMLDetailsElement>('details.menu')]
for (const menu of menus)
  menu.addEventListener('toggle', () => {
    if (menu.open) for (const other of menus) if (other !== menu) other.open = false
  })
document.addEventListener('click', (e) => {
  for (const menu of menus) if (menu.open && !menu.contains(e.target as Node)) menu.open = false
})
document.addEventListener('keydown', (e) => {
  const open = menus.find((m) => m.open)
  if (e.key !== 'Escape' || !open) return
  open.open = false
  open.querySelector('summary')?.focus()
})
const signOut = document.querySelector<HTMLButtonElement>('[data-sign-out]')
if (signOut) wireSignOut(signOut)
