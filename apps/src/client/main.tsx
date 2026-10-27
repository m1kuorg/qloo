import { CSPProvider } from '@base-ui/react/csp-provider'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Role } from '../directory'
import { send } from './controls'
// The shell's menus: the network switcher and the account menu.
import './menus'
import { StateLine } from './states'

const root = document.getElementById('root')!
const d = root.dataset
// A network's page, as the server describes it.
const network = () => ({
  id: d.networkId!,
  name: d.networkName!,
  role: d.role as Role,
  guest: d.guest === 'true',
  links: { roster: d.rosterLink!, inbox: d.inboxLink ?? null, settings: d.settingsLink!, launches: d.launchesLink! }
})
// Each page's code is a chunk of its own, loaded before the island renders the page, so a page fetches
// only what it shows; what pages share, such as React and the controls, is in shared chunks. "inbox" is
// the demo's inbox, and any other page the demo's roster, "roster". It isn't React.lazy: its Suspense
// holds back the page's first render by about 300 ms.
const pages: Record<string, () => Promise<ReactNode>> = {
  'sign-in': () => import('./Account').then(({ SignInPage }) => <SignInPage next={d.next!} runs={Number(d.runs)} />),
  invite: () => import('./Account').then(({ InvitePage }) => <InvitePage memberName={d.memberName ?? null} />),
  account: () =>
    import('./AccountPage').then(({ AccountPage }) => (
      <AccountPage
        name={d.memberName!}
        passkeys={JSON.parse(d.passkeys!)}
        sessions={Number(d.sessions)}
        networks={JSON.parse(d.networks!)}
        recovered={d.recovered === 'true'}
        guest={d.guest === 'true'}
      />
    )),
  'new-network': () => import('./NewNetwork').then(({ NewNetworkPage }) => <NewNetworkPage cap={Number(d.cap)} />),
  dashboard: () =>
    import('./Dashboard').then(({ DashboardPage }) => (
      <DashboardPage
        agentPath={d.agentPath!}
        network={network()}
        memberId={d.memberId!}
        setup={{ invited: d.invited === 'true', apiKey: d.apiKey === 'true' }}
      />
    )),
  launch: () =>
    import('./Launch').then(({ LaunchPage }) => (
      <LaunchPage agentPath={d.agentPath!} network={network()} orders={d.ordersLink!} />
    )),
  'network-roster': () =>
    import('./Roster').then(({ RosterPage }) => <RosterPage agentPath={d.agentPath!} network={network()} />),
  'network-inbox': () =>
    import('./NetworkInbox').then(({ NetworkInboxPage }) => (
      <NetworkInboxPage agentPath={d.agentPath!} network={network()} />
    )),
  settings: () =>
    import('./Settings').then(({ SettingsPage }) => (
      <SettingsPage
        agentPath={d.agentPath!}
        network={network()}
        memberId={d.memberId!}
        members={JSON.parse(d.members!)}
        invites={d.invites ? JSON.parse(d.invites) : null}
        apiKeys={d.apiKeys ? JSON.parse(d.apiKeys) : null}
        usage={JSON.parse(d.usage!)}
        qlooKey={JSON.parse(d.qlooKey!)}
      />
    )),
  inbox: () =>
    import('./DemoInbox').then(({ DemoInboxPage }) => (
      <DemoInboxPage agentPath={d.agentPath!} links={{ roster: d.rosterLink! }} />
    ))
}
const demo = () => import('./App').then(({ App }) => <App agentPath={d.agentPath!} links={{ roster: d.rosterLink! }} />)
void (pages[d.page ?? ''] ?? demo)()
  // A page whose code didn't load, as when the connection drops, says so instead of staying blank.
  .catch((err: unknown) => (
    <main className="lost">
      <StateLine kind="error" role="alert">
        This page didn’t load ({err instanceof Error ? err.message : String(err)}). Reload to try again.
      </StateLine>
    </main>
  ))
  // Base UI's components inject no <style> elements, which the policy would block (style-src 'self');
  // the one rule they'd add is in style.css.
  .then((page) => createRoot(root).render(<CSPProvider disableStyleElements>{page}</CSPProvider>))

document.querySelectorAll<HTMLButtonElement>('[data-sign-out]').forEach(wireSignOut)

// The app shell's Sign out buttons, the account menu's and the guest notice's "Sign out and create an
// account": each ends the session, then goes to the sign-in page. The shell is server-rendered, so the
// island finds the buttons rather than rendering them.
function wireSignOut(button: HTMLButtonElement) {
  button.addEventListener('click', async () => {
    button.disabled = true
    try {
      await send('/auth/sign-out')
      window.location.assign('/sign-in')
    } catch {
      button.disabled = false
      button.textContent = 'Sign out failed. Try again'
      // Told to screen readers too, which don't hear a button's words change.
      const status = button.parentElement?.querySelector('[data-sign-out-status]')
      if (status) status.textContent = 'Sign out failed. Try again.'
    }
  })
}
