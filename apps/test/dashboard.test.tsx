// What a network's dashboard and settings say. Each test drives a network through the Worker's routes
// and its agent into a state, then renders the page from the agent's synced state and the props the
// server gave the page, and reads its words.
import { env } from 'cloudflare:workers'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import type { State } from '../src/agent'
import { Dashboard } from '../src/client/Dashboard'
import { Settings } from '../src/client/Settings'
import { fakeClaude, fakeQloo, text, turn, type ModelRequest } from './fake'
import { joinNetwork, openMember, type Member, type Session } from './session'

const open: Omit<Session, 'cookie'>[] = []
const saved = { GUEST_PITCHES: env.GUEST_PITCHES }
afterEach(() => {
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
      v.replace(/&amp;/g, '&')
    ])
  )
  return {
    memberId: d.memberId,
    setup: { invited: d.invited === 'true', apiKey: d.apiKey === 'true' },
    network: {
      id: d.networkId,
      name: d.networkName,
      role: d.role as 'owner' | 'member',
      links: { roster: d.rosterLink, inbox: d.inboxLink ?? null, settings: d.settingsLink }
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
  renderToStaticMarkup(<Dashboard {...await island(member, `/app/${id}`)} state={state} dismiss={async () => {}} />)

const STEPS = ['Import the roster', 'Set the CPM', 'Plan a launch', 'Invite a teammate', 'Create an API key']

describe('the dashboard', () => {
  it('says plainly that a new network has no launches, roster, or CPM, and lists all five setup steps', async () => {
    const ada = await openMember()
    const { id, agent } = await network(ada)
    const html = await dashboard(ada, id, agent.state())
    const read = words(html)
    expect(read).toContain('Night Shift Audio')
    expect(read).toContain(
      'Launch Status Finalists Slots Slot value Last run No launches yet. Each launch you plan is listed here with its status, finalists, promo slots, and their slot value.'
    )
    expect(read).toContain('Roster No shows yet Open')
    expect(read).toContain('CPM Not set Set')
    expect(read).not.toContain('Inbox')
    expect(read).toContain(`Setup 0 of 5 done Dismiss 1. ${STEPS[0]}`)
    for (const step of STEPS) expect(read).toMatch(new RegExp(`\\d\\. ${step} [A-Z][^.]+\\.`))
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
    await joinNetwork(id, await openMember({ name: 'Grace Booker' }))

    const read = words(await dashboard(ada, id, await agent.until((s) => s.cpm === 20)))
    expect(read).toContain('Roster 3 shows: 2 matched, 1 not in Qloo Open')
    expect(read).toContain('CPM $20 per 1,000 downloads Change')
    expect(read).toContain('Setup 3 of 5 done')
    expect(read).toContain(`1. ${STEPS[0]} Done 2. ${STEPS[1]} Done 3. ${STEPS[2]} Name`)
    expect(read).toContain(`4. ${STEPS[3]} Done 5. ${STEPS[4]} API keys`)
  })

  it("is dismissed for the member who dismisses it, and stays for everyone else's", async () => {
    const ada = await openMember()
    const { id, agent } = await network(ada)
    const grace = await openMember({ name: 'Grace Booker' })
    await joinNetwork(id, grace)
    await agent.call('dismissChecklist')

    const state = agent.state()
    expect(words(await dashboard(ada, id, state))).not.toContain('Setup')
    expect(words(await dashboard(grace, id, state))).toContain('Setup 1 of 5 done')
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
          status: 'order approved',
          finalists: 5,
          slots: 20,
          slotValue: 52_000,
          startedBy: 'Ada Programmer',
          lastRun: '2026-10-19T12:00:00Z'
        }
      ]
    }
    const read = words(await dashboard(ada, id, state))
    expect(read).toContain('The Night Watch order approved 5 20 $52,000 Oct 19, Ada Programmer')
    expect(read).not.toContain('No launches yet')
  })
})

describe('settings', () => {
  const settings = async (member: Member, id: string, state: State | undefined) => {
    const { network } = await island(member, `/app/${id}/settings`)
    return renderToStaticMarkup(<Settings state={state} network={network} />)
  }

  it("give an owner the network's name and CPM to change", async () => {
    const ada = await openMember()
    const { id, agent } = await network(ada)
    const html = await settings(ada, id, agent.state())
    expect(words(html)).toContain('Network The name your members see, and the CPM that prices every promo slot')
    expect(html).toMatch(/<input id="set-name"[^>]*value="Night Shift Audio"/)
    expect(html).toMatch(/<input id="set-cpm"[^>]*placeholder="Not set"/)
    expect(words(html)).toContain('Save')
  })

  it('show a member the same settings read-only', async () => {
    const ada = await openMember()
    const { id } = await network(ada)
    await ada.fetch(`/app/${id}/settings/network`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Night Shift Audio', cpm: 18.5 })
    })
    const grace = await openMember({ name: 'Grace Booker' })
    await joinNetwork(id, grace)
    const html = await settings(grace, id, await (await connect(grace, id)).until((s) => s.cpm === 18.5))
    expect(html).not.toContain('<input')
    expect(html).not.toContain('Save')
    expect(words(html)).toContain('Name Night Shift Audio CPM $18.5 Only an owner can change these.')
  })
})
