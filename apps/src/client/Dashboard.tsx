import { useAgent } from 'agents/react'
import type { LaunchInput, LaunchSummary, Show, State } from '../agent'
import type { Role } from '../directory'
import type { Inbox } from '../inbox'
import type { NetworkAgent } from '../network-agent'
import { dollars } from '../order'
import { launchTitle, useLaunchFields } from './App'
import { Alert, ScrollTable, useAction } from './controls'
import { stateLabel } from './Inbox'
import { StateLine } from './states'

// A network's page, as the server describes it: the network, the member's role in it, and where its
// other pages are. `inbox` is null while GUEST_PITCHES is off; a launch's page is under `launches`.
export type NetworkPage = {
  id: string
  name: string
  role: Role
  links: { roster: string; inbox: string | null; settings: string; launches: string }
}

// The network's agent, at the path the server gives, which checks the member's session and membership.
export const useNetwork = (path: string) =>
  useAgent<NetworkAgent, State>({ agent: 'NetworkAgent', basePath: path.replace(/^\//, '') })
export type NetworkConnection = ReturnType<typeof useNetwork>

// What the setup checklist reads from the directory rather than the agent: whether anyone has been
// invited or has joined, and whether an API key was ever created.
export type Setup = { invited: boolean; apiKey: boolean }

export function DashboardPage(props: { agentPath: string; network: NetworkPage; memberId: string; setup: Setup }) {
  const agent = useNetwork(props.agentPath)
  if (agent.connectionError) return <LostAccess network={props.network} reason={agent.connectionError.reason} />
  return (
    <Dashboard
      {...props}
      state={agent.state}
      dismiss={() => agent.stub.dismissChecklist()}
      createLaunch={(input) => agent.stub.createLaunch(input)}
    />
  )
}

// A network's page once its agent has closed the connection for good, as when the member is removed
// or leaves: what it showed goes, and the page says why. A reload answers 404.
export function LostAccess({ network, reason }: { network: NetworkPage; reason: string }) {
  return (
    <>
      <header className="hd">
        <h1>{network.name}</h1>
      </header>
      <main className="lost">
        <StateLine kind="error" role="alert">
          {reason || 'This page lost its connection to the network. Reload to try again.'}
        </StateLine>
        <p>
          <a className="lnk" href="/app">
            Open your networks
          </a>
        </p>
      </main>
    </>
  )
}

// The network's home: its launches, a line each for its roster and inbox, and the setup checklist.
// Tests render it from a network agent's synced state; `state` is undefined until it arrives.
export function Dashboard({
  state,
  network,
  memberId,
  setup,
  dismiss,
  createLaunch
}: {
  state: State | undefined
  network: NetworkPage
  memberId: string
  setup: Setup
  dismiss: () => Promise<unknown>
  createLaunch: (input: LaunchInput) => Promise<{ id: string }>
}) {
  return (
    <>
      <header className="hd">
        <h1>{network.name}</h1>
        <NewLaunch network={network} create={createLaunch} />
      </header>
      <main className="main dash">
        <section className="chart-col" aria-labelledby="launches-h">
          <h2 className="lbl dash-h" id="launches-h">
            Launches
          </h2>
          <ScrollTable label="Launches">
            <Launches launches={state?.launches ?? []} network={network} />
          </ScrollTable>
        </section>
        <aside className="rail" aria-label="Network">
          {state ? (
            <>
              <NetworkLines state={state} network={network} />
              {!state.checklistDismissed?.includes(memberId) && (
                <Checklist state={state} network={network} setup={setup} dismiss={dismiss} />
              )}
            </>
          ) : (
            <p className="mod">
              <StateLine kind="loading">Connecting to the network…</StateLine>
            </p>
          )}
        </aside>
      </main>
    </>
  )
}

// The dashboard's decision: a new launch, named or from comps, which opens on its own page.
function NewLaunch({
  network,
  create
}: {
  network: NetworkPage
  create: (input: LaunchInput) => Promise<{ id: string }>
}) {
  const form = useLaunchFields(null)
  const { busy, error, run } = useAction()
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    void run(async () => location.assign(`${network.links.launches}/${(await create(form.input)).id}`))
  }
  return (
    <>
      <form className="launch-form" id="new-launch" aria-label="New launch" onSubmit={submit}>
        {form.fields(busy)}
        <button className="btn pri" type="submit" disabled={busy || !form.ready}>
          New launch
        </button>
      </form>
      <Alert error={error} />
    </>
  )
}

// What the dashboard calls each status. A failed or stopped run is marked in its state's colour, and
// an approved order as final.
const statusLabel: Record<LaunchSummary['status'], string> = {
  new: 'New',
  running: 'Running',
  waiting: 'Waiting',
  ranked: 'Ranked',
  'order drafted': 'Order drafted',
  'order approved': 'Order approved',
  failed: 'Failed',
  stopped: 'Stopped'
}

function StatusChip({ status }: { status: LaunchSummary['status'] }) {
  const fault = status === 'failed' || status === 'stopped'
  return (
    <span className={status === 'order approved' ? 'chip flag' : 'chip'} data-state={fault ? 'failed' : undefined}>
      {statusLabel[status]}
    </span>
  )
}

// Every launch with its status and plan, newest first, each opening its page; until there's one, a
// sentence saying so. An unreleased launch goes by its comps.
function Launches({ launches, network }: { launches: LaunchSummary[]; network: NetworkPage }) {
  return (
    <table className={launches.length ? 'chart launches' : 'chart launches none'}>
      <thead>
        <tr>
          <th scope="col">Launch</th>
          <th scope="col">Status</th>
          <th scope="col" className="r">
            Finalists
          </th>
          <th scope="col" className="r">
            Slots
          </th>
          <th scope="col" className="r">
            Slot value
          </th>
          <th scope="col">Last run</th>
        </tr>
      </thead>
      <tbody>
        {launches.length === 0 ? (
          <tr>
            <td colSpan={6} className="empty">
              No launches yet. Each launch you plan is listed here with its status, finalists, promo slots, and their
              slot value.
            </td>
          </tr>
        ) : (
          launches.map((l) => (
            <tr key={l.id}>
              <td>
                <a className="nm" href={`${network.links.launches}/${l.id}`}>
                  {launchTitle(l.name, l.comps)}
                </a>
                {l.name === null && <div className="tg">Unreleased, from comps</div>}
              </td>
              <td>
                <StatusChip status={l.status} />
              </td>
              <td className="r">{l.finalists || '–'}</td>
              <td className="r">{l.slots ?? '–'}</td>
              <td className="r">{l.slotValue === null ? '–' : dollars(l.slotValue)}</td>
              <td className="tg">
                {l.lastRun ? `${day(l.lastRun)}${l.startedBy ? `, ${l.startedBy}` : ''}` : 'Not run yet'}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  )
}

// A day as the app writes it, such as "Oct 19", from an ISO string or epoch ms.
export const day = (when: string | number) =>
  new Date(when).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

// One line each for the roster, the inbox, and the CPM, with where to change them.
function NetworkLines({ state, network }: { state: State; network: NetworkPage }) {
  const rows: [string, string, string, string][] = [['Roster', rosterLine(state.roster), network.links.roster, 'Open']]
  if (network.links.inbox) rows.push(['Inbox', inboxLine(state.inbox), network.links.inbox, 'Open'])
  rows.push([
    'CPM',
    state.cpm === null ? 'Not set' : `${dollars(state.cpm)} per 1,000 downloads`,
    network.links.settings,
    network.role === 'owner' ? (state.cpm === null ? 'Set' : 'Change') : 'View'
  ])
  return (
    <section className="mod" aria-labelledby="network-h">
      <div className="mh">
        <h2 className="lbl" id="network-h">
          Network
        </h2>
      </div>
      <dl className="rec kv lines">
        {rows.map(([label, line, href, go]) => (
          <div key={label} className="rec-row">
            <dt>{label}</dt>
            <dd>
              {line}{' '}
              <a
                className="lnk"
                href={href}
                aria-label={`${go} ${label === 'CPM' ? 'the CPM' : `the ${label.toLowerCase()}`}`}
              >
                {go}
              </a>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

// The roster in a line: how many shows matched in Qloo, and how many need settling.
function rosterLine(roster: Show[]) {
  if (roster.length === 0) return 'No shows yet'
  const n = (...of: Show['resolution'][]) => roster.filter((s) => of.includes(s.resolution)).length
  const pending = n('pending')
  if (pending) return `Looking up ${pending} of ${count(roster.length, 'show')} in Qloo…`
  return `${count(roster.length, 'show')}: ${parts([
    [n('resolved', 'mapped'), 'matched'],
    [n('ambiguous'), 'to settle'],
    [n('missed'), 'not in Qloo'],
    [n('failed'), 'lookup failed', 'lookups failed']
  ])}`
}

// The inbox in a line: how many pitches, how their works matched, and how many were set aside, in the
// inbox check's terms.
function inboxLine(inbox: Inbox | null) {
  if (!inbox || inbox.pitches.length === 0) return 'No pitches loaded'
  const { pitches } = inbox
  if (inbox.status === 'reading') return `Reading ${count(pitches.length, 'pitch', 'pitches')}…`
  const n = (label: string) => pitches.filter((p) => stateLabel(p) === label).length
  return `${count(pitches.length, 'pitch', 'pitches')}: ${parts([
    [n('Matched'), 'matched'],
    [n('Ambiguous'), 'to confirm'],
    [n('Not in Qloo'), 'not in Qloo'],
    [n('Lookup failed'), 'lookup failed', 'lookups failed'],
    [n('Set aside'), 'set aside'],
    [n('Unreadable'), 'unreadable'],
    [n('Failed'), 'failed']
  ])}`
}

const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`
// The counts that aren't 0, as a list: "16 matched, 1 to settle".
const parts = (counts: [number, string, string?][]) =>
  counts
    .filter(([n]) => n > 0)
    .map(([n, one, many = one]) => `${n} ${n === 1 ? one : many}`)
    .join(', ')

// What a new network needs, ticked off from its agent's state and the directory as each arrives. A
// member can dismiss it for themselves; it stays for everyone else.
function Checklist({
  state,
  network,
  setup,
  dismiss
}: {
  state: State
  network: NetworkPage
  setup: Setup
  dismiss: () => Promise<unknown>
}) {
  const { error, run } = useAction()
  const owner = network.role === 'owner'
  const { roster, settings } = network.links
  // A step links where it's done only for a member who can do it there.
  const items: { title: string; how: string; href: string | null; done: boolean }[] = [
    {
      title: 'Import the roster',
      how: 'Paste your shows’ names, or upload the roster’s CSV, and Crossfeed finds each one in Qloo.',
      href: roster,
      done: state.roster.length > 0
    },
    {
      title: 'Set the CPM',
      how: owner
        ? 'Your CPM prices every promo slot. Set it in settings.'
        : 'Your CPM prices every promo slot. An owner sets it in settings.',
      href: owner ? settings : null,
      done: state.cpm !== null
    },
    {
      title: 'Plan a launch',
      how: 'Name a released launch, or up to three comps for an unreleased one, and Crossfeed ranks the roster against it.',
      href: '#new-launch',
      done: (state.launches?.length ?? 0) > 0
    },
    {
      title: 'Invite a teammate',
      how: owner
        ? 'Make an invite link in settings and send it to them. It works once, for seven days.'
        : 'An owner makes invite links in settings.',
      href: owner ? settings : null,
      done: setup.invited
    },
    {
      title: 'Create an API key',
      how: owner
        ? 'Make a key in settings for a script or an assistant to act for the network, short of approving anything.'
        : 'An owner makes API keys in settings, for scripts and assistants.',
      href: owner ? settings : null,
      done: setup.apiKey
    }
  ]
  const done = items.filter((i) => i.done).length
  return (
    <section className="mod checklist" aria-labelledby="setup-h">
      <div className="mh">
        <h2 className="lbl" id="setup-h">
          Setup
        </h2>
        <span className="chips">
          <span className="chip">{done === items.length ? 'Done' : `${done} of ${items.length} done`}</span>
          <button type="button" className="lnk" onClick={() => void run(dismiss)}>
            Dismiss
          </button>
        </span>
      </div>
      <ol className="notes steps">
        {items.map((item, i) => (
          <li key={item.title} data-done={item.done || undefined}>
            <span>
              {i + 1}.{' '}
              {item.href && !item.done ? (
                <a className="lnk" href={item.href}>
                  {item.title}
                </a>
              ) : (
                item.title
              )}
              {!item.done && <span className="help">{item.how}</span>}
            </span>
            <span className="tg">{item.done ? 'Done' : ''}</span>
          </li>
        ))}
      </ol>
      <Alert error={error} />
    </section>
  )
}
