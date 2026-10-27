// What a network's dashboard and settings say. Each test drives a network through the Worker's routes
// and its agent into a state, then renders the page from the agent's synced state and the props the
// server gave the page, and reads its words.
import { env } from 'cloudflare:workers'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { State } from '../src/agent'
import { Dashboard } from '../src/client/Dashboard'
import { LostAccess, NetworkGate } from '../src/client/NetworkPage'
import { Settings } from '../src/client/Settings'
import { connectionOf } from '../src/client/states'
import { fakeClaude, fakeQloo, text, turn, type ModelRequest } from './fake'
import { api, openMember, regions, type Member, type Session } from './session'

const open: Omit<Session, 'cookie'>[] = []
const saved = { GUEST_PITCHES: env.GUEST_PITCHES, QLOO_VISITOR_DAILY_CALL_CAP: env.QLOO_VISITOR_DAILY_CALL_CAP }
afterEach(() => {
  vi.useRealTimers()
  open.splice(0).forEach((agent) => agent.close())
  Object.assign(env, saved)
})

// A network the member creates, its agent opened as its dashboard opens it.
async function network(member: Member, name = 'Night Shift Audio') {
  const res = await member.fetch('/app/new', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  })
  const { id } = await res.json<{ id: string }>()
  return { id, agent: await connect(member, id) }
}
const connect = async (member: Member, id: string) => {
  const agent = await member.connect(`/agents/network/${id}`)
  open.push(agent)
  return agent
}

// The data attributes the server gave a page's #root, as main.tsx reads them.
async function island(member: Member, path: string) {
  const html = await (await member.fetch(path)).text()
  const root = html.match(/<div id="root"([^>]*)>/)![1]
  const d = Object.fromEntries(
    [...root.matchAll(/data-([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [
      k.replace(/-(\w)/g, (_, c: string) => c.toUpperCase()),
      v
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
    ])
  )
  return {
    memberId: d.memberId,
    members: d.members ? JSON.parse(d.members) : [],
    invites: d.invites ? JSON.parse(d.invites) : null,
    apiKeys: d.apiKeys ? JSON.parse(d.apiKeys) : null,
    usage: d.usage ? JSON.parse(d.usage) : null,
    qlooKey: d.qlooKey ? JSON.parse(d.qlooKey) : null,
    setup: { invited: d.invited === 'true', apiKey: d.apiKey === 'true' },
    network: {
      id: d.networkId,
      name: d.networkName,
      role: d.role as 'owner' | 'member',
      links: { roster: d.rosterLink, inbox: d.inboxLink ?? null, settings: d.settingsLink, launches: d.launchesLink }
    }
  }
}

// The page's words, as a reader hears them.
const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

const dashboard = async (member: Member, id: string, state: State | undefined) =>
  renderToStaticMarkup(
    <Dashboard
      {...await island(member, `/app/${id}`)}
      state={state}
      dismiss={async () => {}}
      createLaunch={async () => ({ id: 'l-1' })}
    />
  )

const STEPS = ['Import the roster', 'Set the CPM', 'Plan a launch', 'Invite a teammate', 'Create an API key']
// The setup checklist's steps, each as a reader hears it, in the order of its numbered list.
const steps = (html: string) =>
  (html.match(/<ol\b[^>]*>(.*?)<\/ol>/)?.[1] ?? '')
    .split(/<li\b/)
    .slice(1)
    .map((li) => words(`<li${li}`))

describe('the dashboard', () => {
  it('says plainly that a new network has no launches, roster, or CPM, and lists all five setup steps', async () => {
    const ada = await openMember()
    const { id, agent } = await network(ada)
    const html = await dashboard(ada, id, agent.state())
    const read = words(html)
    // The page is the network's launches; the top bar's switcher names the network.
    expect(await (await ada.fetch(`/app/${id}`)).text()).toMatch(/data-current-network[^>]*>Night Shift Audio</)
    expect(read).toMatch(/^Launches 0 launches New launch /)
    expect(read).toContain(
      'Launch Status Finalists Slots Slot value Last run Actions No launches yet. Each launch you plan is listed here with its status, finalists, promo slots, and their slot value. New launch'
    )
    expect(read).toContain('Roster No shows yet Open')
    expect(read).toContain('CPM Not set Set')
    expect(read).not.toContain('Inbox')
    expect(read).toContain('Setup · 0 of 5 done Dismiss')
    const listed = steps(html)
    expect(listed).toHaveLength(STEPS.length)
    STEPS.forEach((step, i) => expect(listed[i]).toMatch(new RegExp(`^${step} [A-Z][^.]+\\.`)))
    expect(html).toContain(`href="/app/${id}/roster"`)
    expect(html).toContain(`href="/app/${id}/settings"`)
  })

  it('ticks off setup from the roster, the CPM, and a teammate, and says how the roster matched', async () => {
    fakeQloo({
      search: {
        'Deep Cuts': [{ entity_id: 'p-0001', name: 'Deep Cuts', popularity: 0.5 }],
        'Signal Boost': [{ entity_id: 'p-0002', name: 'Signal Boost', popularity: 0.5 }],
        'Paper Trail': []
      }
    })
    const ada = await openMember()
    const { id, agent } = await network(ada)
    await agent.importRoster('Deep Cuts\nSignal Boost\nPaper Trail')
    await ada.fetch(`/app/${id}/settings/network`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Night Shift Audio', cpm: 20 })
    })
    await openMember({ name: 'Grace Booker', invite: await ada.invite(id) })

    const html = await dashboard(ada, id, await agent.until((s) => s.cpm === 20))
    const read = words(html)
    expect(read).toContain('Roster 3 shows: 2 matched, 1 not in Qloo Open')
    expect(read).toContain('CPM $20 per 1,000 downloads Change')
    expect(read).toContain('Setup · 3 of 5 done')
    const listed = steps(html)
    expect(listed.slice(0, 2)).toEqual([`${STEPS[0]} Done`, `${STEPS[1]} Done`])
    expect(listed[2]).toMatch(new RegExp(`^${STEPS[2]} Name`))
    expect(listed[3]).toBe(`${STEPS[3]} Done`)
    expect(listed[4]).toMatch(new RegExp(`^${STEPS[4]} Make a key in settings`))
  })

  it("is dismissed for the member who dismisses it, and stays for everyone else's", async () => {
    const ada = await openMember()
    const { id, agent } = await network(ada)
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(id) })
    await agent.call('dismissChecklist')

    const state = agent.state()
    expect(words(await dashboard(ada, id, state))).not.toContain('Setup')
    expect(words(await dashboard(grace, id, state))).toContain('Setup · 1 of 5 done')
  })

  it('lines up the inbox, while guest pitches are on: its pitches, how they matched, and those set aside', async () => {
    env.GUEST_PITCHES = 'on'
    fakeQloo({ search: { 'Night Ferry': [{ entity_id: 'b-0001', name: 'Night Ferry', popularity: 0.8 }] } })
    const pitch = (n: number) => `From: Pat <pat${n}@example.com>\nSubject: Pitch ${n}\n\nPitch number ${n}.`
    fakeClaude(
      [1, 2].map(() => (request: ModelRequest) => {
        const about = JSON.stringify(request.messages)
        return turn(
          text(
            JSON.stringify(
              about.includes('Pitch number 1')
                ? { guest: 'Ada Quill', work: { title: 'Night Ferry', type: 'book', year: 2019 } }
                : { guest: 'Dot Pruitt', work: null }
            )
          )
        )
      })
    )
    const ada = await openMember()
    const { id, agent } = await network(ada)
    expect(words(await dashboard(ada, id, agent.state()))).toContain('Inbox No pitches loaded Open')

    await agent.call('loadInbox', { text: `${pitch(1)}\n---\n${pitch(2)}` })
    const read = words(await dashboard(ada, id, await agent.until((s) => s.inbox?.status === 'done')))
    expect(read).toContain('Inbox 2 pitches: 1 matched, 1 set aside Open')
  })

  it("lists a launch the network's agent reports, with its status, plan, and last run", async () => {
    const ada = await openMember()
    const { id, agent } = await network(ada)
    const state: State = {
      ...agent.state()!,
      launches: [
        {
          id: 'l-1',
          name: 'The Night Watch',
          comps: [],
          status: 'order approved',
          finalists: 5,
          slots: 20,
          slotValue: 52_000,
          startedBy: 'Ada Programmer',
          lastRun: '2026-10-19T12:00:00Z'
        }
      ]
    }
    const html = await dashboard(ada, id, state)
    expect(words(html)).toContain('Approved 1 The Night Watch Order approved 5 20 $52,000 Oct 19 · Ada Programmer')
    expect(html).toContain(`href="/app/${id}/launches/l-1"`)
    expect(words(html)).not.toContain('No launches yet')
  })
})

describe('settings', () => {
  const settings = async (member: Member, id: string, state: State | undefined) => {
    const { network, memberId, members, invites, apiKeys, usage, qlooKey } = await island(member, `/app/${id}/settings`)
    return renderToStaticMarkup(
      <Settings
        state={state}
        network={network}
        memberId={memberId}
        members={members}
        invites={invites}
        apiKeys={apiKeys}
        usage={usage}
        qlooKey={qlooKey}
      />
    )
  }

  it("give an owner the network's name and CPM to change", async () => {
    const ada = await openMember()
    const { id, agent } = await network(ada)
    const html = await settings(ada, id, agent.state())
    expect(words(html)).toContain('Network The name your members see, and the CPM that prices every promo slot')
    expect(html).toMatch(/<input\b(?=[^>]*\sid="set-name")(?=[^>]*\svalue="Night Shift Audio")/)
    expect(html).toMatch(/<input\b(?=[^>]*\sid="set-cpm")(?=[^>]*\splaceholder="Not set")/)
    expect(words(html)).toContain('Save')
  })

  it("say in the title row whether the network's agent is connecting or reconnecting", async () => {
    const ada = await openMember()
    const { id, agent } = await network(ada)
    const page = await island(ada, `/app/${id}/settings`)
    const read = (state: State | undefined, reconnecting = false) =>
      words(renderToStaticMarkup(<Settings {...page} state={state} connection={{ lost: null, reconnecting }} />))
    expect(read(undefined)).toMatch(
      /^Settings You’re an owner of this network\. Working Connecting to the network… Network /
    )
    expect(read(agent.state(), true)).toMatch(/^Settings You’re an owner of this network\. Reconnecting… Network /)
    expect(read(agent.state())).toMatch(/^Settings You’re an owner of this network\. Network /)
  })

  it('show a member the same settings read-only', async () => {
    const ada = await openMember()
    const { id } = await network(ada)
    await ada.fetch(`/app/${id}/settings/network`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Night Shift Audio', cpm: 18.5 })
    })
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(id) })
    const html = await settings(grace, id, await (await connect(grace, id)).until((s) => s.cpm === 18.5))
    expect(html).not.toContain('<input')
    expect(html).not.toContain('Save')
    expect(words(html)).toContain('Name Night Shift Audio CPM $18.5 Only an owner can change these.')
  })

  it("list the network's members for an owner, with their roles, dates, and what the owner can change", async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-19T12:00:00Z'))
    const ada = await openMember()
    const { id, agent } = await network(ada)
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'))
    await openMember({ name: 'Grace Booker', invite: await ada.invite(id) })
    await ada.invite(id)

    const read = words(await settings(ada, id, agent.state()))
    expect(read).toContain('Members Everyone who can open Night Shift Audio.')
    expect(read).toContain(
      'Member Role Joined Actions Ada Programmer You Owner Oct 19 Leave Grace Booker Member Oct 20 Make owner Remove'
    )
    expect(read).toContain('You’re the only owner. Make someone else an owner before you leave.')
    expect(read).toContain('Invite links Each link lets one person join as a member')
    expect(read).toContain('Create invite link Made Oct 20 by Ada Programmer Expires Oct 27 Revoke')
    expect(await settings(ada, id, agent.state())).toMatch(/<button[^>]*disabled=""[^>]*>Leave<\/button>/)
  })

  it('show a member who is in the network, with only their own Leave, and no invite links', async () => {
    const ada = await openMember()
    const { id } = await network(ada)
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(id) })
    const html = await settings(grace, id, await (await connect(grace, id)).until(() => true))
    const read = words(html)
    expect(read).toContain('Ada Programmer Owner')
    expect(read).toMatch(/Grace Booker You Member \w{3} \d{1,2} Leave/)
    expect(read).toContain('Only an owner can invite people, change roles, or remove members.')
    expect(read).not.toContain('Make owner')
    expect(read).not.toContain('Remove')
    expect(read).not.toContain('Invite links')
    expect(html).not.toMatch(/disabled=""[^>]*>Leave/)
  })

  it("leave the shell's top bar the one banner, and name each region once, as the dashboard and a lost page do", async () => {
    const ada = await openMember()
    const { id, agent } = await network(ada)
    await ada.fetch(`/app/${id}/settings/api-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Nightly sync' })
    })
    const { network: page } = await island(ada, `/app/${id}`)
    const lost = renderToStaticMarkup(<LostAccess network={page} reason="You're no longer a member of this network." />)
    for (const html of [await dashboard(ada, id, agent.state()), await settings(ada, id, agent.state()), lost]) {
      expect(html).not.toContain('<header')
      const named = regions(html)
      expect(named.length).toBeGreaterThan(0)
      expect(new Set(named).size).toBe(named.length)
    }
  })

  it("list an owner's API keys by name, prefix, maker, and dates, each with Revoke", async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-19T12:00:00Z'))
    const ada = await openMember()
    const { id, agent } = await network(ada)
    const created = await ada.fetch(`/app/${id}/settings/api-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Nightly sync' })
    })
    const { secret } = await created.json<{ secret: string }>()
    vi.setSystemTime(new Date('2026-10-21T09:30:00Z'))
    await api(secret)(`/api/v1/networks/${id}`)

    const html = await settings(ada, id, agent.state())
    const read = words(html)
    expect(read).toContain('API keys Each key lets a script or an assistant act for Night Shift Audio')
    expect(read).toContain('Key name Create API key')
    expect(read).toContain(
      `Key Created Last used Actions Nightly sync ${secret.slice(0, 12)}… Oct 19 by Ada Programmer Oct 21 Revoke`
    )
    expect(read).toContain(`Programs name this network by its ID, ${id} .`)
    expect(html).not.toContain(secret)
    expect(html).toContain('href="/api/v1/openapi.json"')
  })

  it("show a member that API keys are an owner's to make, and none of them", async () => {
    const ada = await openMember()
    const { id } = await network(ada)
    await ada.fetch(`/app/${id}/settings/api-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Nightly sync' })
    })
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(id) })
    const read = words(await settings(grace, id, await (await connect(grace, id)).until(() => true)))
    expect(read).toContain('API keys Each key lets a script or an assistant act for Night Shift Audio')
    expect(read).toContain('Only an owner can create and revoke API keys.')
    expect(read).not.toContain('Nightly sync')
    expect(read).not.toContain('Create API key')
  })

  it("show every member today's usage against the network's caps, and when they reset", async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-19T14:30:00Z'))
    const ada = await openMember()
    const { id, agent } = await network(ada)
    fakeQloo({ search: { 'Corner Booth': [{ entity_id: 'e-0501', name: 'Corner Booth', popularity: 0.6 }] } })
    await agent.importRoster('Corner Booth')
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(id) })

    for (const member of [ada, grace]) {
      const read = words(await settings(member, id, agent.state()))
      expect(read).toContain(
        'Usage Beta What Night Shift Audio can use each UTC day, whichever member or API key uses it.'
      )
      expect(read).toContain('Model runs 0 of 10 today Qloo calls 1 of 2,000 today Resets 00:00 UTC, in 9 h 30 min')
    }
    env.QLOO_VISITOR_DAILY_CALL_CAP = '1'
    expect(words(await settings(ada, id, agent.state()))).toContain(
      'Qloo calls 1 of 1 today Resets 00:00 UTC, in 9 h 30 min Limit reached No more Qloo calls today: roster imports and comp searches are refused until 00:00 UTC.'
    )
  })

  it("give an owner the network's own Qloo key to add, then show it by its last four characters", async () => {
    const ada = await openMember()
    const { id, agent } = await network(ada)
    const html = await settings(ada, id, agent.state())
    const read = words(html)
    expect(read).toContain(
      'Qloo key During the beta, a network’s Qloo calls run on Crossfeed’s shared key, within its daily caps. With a key of its own, Night Shift Audio’s calls and its launches’ run on that key, under its own agreement with Qloo'
    )
    expect(read).toContain(
      'Host Qloo’s production API api.qloo.com Qloo’s hackathon API hackathon.api.qloo.com, where hackathon keys work Key Test and save key'
    )
    expect(html).toMatch(/<input\b(?=[^>]*\stype="password")(?=[^>]*\sid="qloo-key")/)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Test and save key<\/button>/)

    fakeQloo({ search: { 'Corner Booth': [{ entity_id: 'e-0501', name: 'Corner Booth', popularity: 0.6 }] } })
    const added = await ada.fetch(`/app/${id}/settings/qloo-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: 'https://hackathon.api.qloo.com', key: 'qk-made-up-7f3a' })
    })
    expect(added.status).toBe(200)
    await agent.importRoster('Corner Booth')
    const keyed = await settings(ada, id, agent.state())
    expect(words(keyed)).toContain('either way. Key Ends in 7f3a Host hackathon.api.qloo.com Remove key')
    // The key's test search and the lookup, both on the network's key.
    expect(words(keyed)).toContain('Qloo calls 2 of 2,000 today On the network’s own Qloo key')
    expect(keyed).not.toContain('qk-made-up-7f3a')
    expect(keyed).not.toContain('Test and save key')

    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(id) })
    const theirs = words(await settings(grace, id, await (await connect(grace, id)).until(() => true)))
    expect(theirs).toContain(
      'either way. Qloo key The network’s own Only an owner can add or remove the network’s Qloo key.'
    )
    expect(theirs).not.toContain('7f3a')
    expect(theirs).not.toContain('Remove key')
  })

  it("show a member that the network runs on Crossfeed's shared Qloo key, with nothing to change", async () => {
    const ada = await openMember()
    const { id } = await network(ada)
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(id) })
    const html = await settings(grace, id, await (await connect(grace, id)).until(() => true))
    expect(words(html)).toContain(
      'either way. Qloo key Crossfeed’s shared key Only an owner can add or remove the network’s Qloo key.'
    )
    expect(html).not.toContain('id="qloo-key"')
  })

  it('give an owner the danger zone, to delete the network once they type its name, and a member none of it', async () => {
    const ada = await openMember()
    const { id, agent } = await network(ada)
    const html = await settings(ada, id, agent.state())
    const read = words(html)
    expect(read).toContain('Danger zone Deleting Night Shift Audio wipes its roster')
    expect(read).toContain('Type Night Shift Audio to delete it Delete network')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Delete network<\/button>/)

    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(id) })
    const theirs = words(await settings(grace, id, await (await connect(grace, id)).until(() => true)))
    expect(theirs).toContain('Danger zone')
    expect(theirs).toContain('Only an owner can delete the network.')
    expect(theirs).not.toContain('Delete network')
  })
})

// What a network's page shows of its agent's socket, the same on every network page: the dashboard
// here, as DashboardPage wraps it, which says so in its title row.
describe("a network page's connection", () => {
  const gated = async (connection: {
    state?: undefined
    identified?: boolean
    connectionError?: { code: number; reason: string }
  }) => {
    const ada = await openMember()
    const { id, agent } = await network(ada)
    const page = await island(ada, `/app/${id}`)
    const gate = { state: agent.state(), identified: true, connectionError: null, ...connection }
    return words(
      renderToStaticMarkup(
        <NetworkGate agent={gate} network={page.network}>
          <Dashboard
            {...page}
            state={gate.state}
            connection={connectionOf(gate)}
            dismiss={async () => {}}
            createLaunch={async () => ({ id: 'l-1' })}
          />
        </NetworkGate>
      )
    )
  }

  it('says it is connecting until the first state arrives', async () => {
    const read = await gated({ state: undefined, identified: false })
    expect(read).toMatch(/^Launches Working Connecting to the network… New launch /)
    expect(read).not.toContain('No launches yet')
  })

  it('says nothing of a connection that is up', async () => {
    const read = await gated({})
    expect(read).not.toContain('Reconnecting…')
    expect(read).toMatch(/^Launches 0 launches New launch /)
  })

  it('says it is reconnecting while the socket is down, keeping what the page showed', async () => {
    const read = await gated({ identified: false })
    expect(read).toMatch(/^Launches 0 launches Reconnecting… New launch /)
    expect(read).toContain('No launches yet')
  })

  it('says a connection closed for good without a reason of its own is lost, keeping the page', async () => {
    const read = await gated({ connectionError: { code: 1008, reason: '' } })
    expect(read).toMatch(/^Launches 0 launches Error This page lost its connection\. Reload to try again\. New launch /)
    expect(read).toContain('No launches yet')
  })

  it("drops the page for the agent's reason when it shuts the member out, 4403, or the network is gone, 4410", async () => {
    for (const [code, reason] of [
      [4403, "You're no longer a member of this network."],
      [4410, 'This network was deleted.']
    ] as const) {
      const read = await gated({ connectionError: { code, reason } })
      expect(read).toBe(`Night Shift Audio Error ${reason} Open your networks`)
    }
  })
})
