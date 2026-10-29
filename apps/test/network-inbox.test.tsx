// A network's inbox: its own page, kept by the network's agent, loaded from pitch files read by the
// upload module as the page reads them, shared live by its members, with replies only a member
// approves. Each test drives a network through the Worker's routes, its agent's client protocol, or
// the Worker's own RPC to the agent, as the API calls it; the API's own tests are in api-inbox.test.ts.
import { getAgentByName } from 'agents'
import { env } from 'cloudflare:workers'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { State } from '../src/agent'
import type { Session as Agent } from '../src/client/App'
import { Dashboard } from '../src/client/Dashboard'
import { InboxWorkspace } from '../src/client/Inbox'
import type { Pitch } from '../src/inbox'
import { networkLinks } from '../src/shell'
import { readPitchUpload, type Upload } from '../src/upload'
import { mbox, nightFerry, paperMoons, staticBloom } from './emails'
import {
  fakeClaude,
  fakeCompare,
  fakeInsights,
  fakeQloo,
  fakeReader,
  qlooRequests,
  requests,
  text,
  toolUse,
  turn,
  type Extracted
} from './fake'
import {
  connect as connectVia,
  currentLinks,
  detailsToggle,
  inspectorClosed,
  links,
  networkWithKey,
  openMember,
  openSession,
  poll,
  sampleLabels,
  type Member,
  type Session
} from './session'

const open: Omit<Session, 'cookie'>[] = []
beforeEach(() => {
  env.GUEST_PITCHES = 'on'
})
afterEach(() => {
  env.GUEST_PITCHES = 'off'
  open.splice(0).forEach((agent) => agent.close())
})

// A network the member creates, as /app/new does.
async function created(member: Member, name = 'Night Shift Audio') {
  const res = await member.fetch('/app/new', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  })
  if (res.status !== 200) throw new Error(`Creating ${name} returned ${res.status}: ${await res.text()}`)
  return (await res.json<{ id: string }>()).id
}
// The network's agent, opened from one of its pages.
async function connect(member: Member, network: string) {
  const agent = await member.connect(`/agents/network/${network}`)
  open.push(agent)
  return agent
}

// A member of `network` besides its owner, invited by `owner` and signed up through the link.
const teammate = async (owner: Member, network: string) =>
  openMember({ name: 'Grace Booker', invite: await owner.invite(network) })

const loaded = (agent: Omit<Session, 'cookie'>) => agent.until((s: State) => s.inbox?.status === 'done')

// Reads files the way the inbox page does when they're dropped or picked, then loads their pitches
// over the agent as the page sends them.
const upload = async (agent: Omit<Session, 'cookie'>, ...files: Upload[]) =>
  agent.call('loadInbox', { pitches: await readPitchUpload(files) })

describe('uploading pitch files', () => {
  it('splits a text file on lines of dashes, taking a From and Subject line atop a pitch as its sender and subject', async () => {
    const file = [
      'From: Kit Arno <kit@example.com>',
      'subject: Dead Air, a radio-station sitcom',
      '',
      'Kit Arno created Dead Air.',
      'Subject lines like this one stay in the text.',
      '  -----  ',
      'Cy Lund on making Low Tide on a shoestring.',
      '---',
      ''
    ].join('\r\n')

    expect(await readPitchUpload([new File([file], 'pitches.txt')])).toEqual([
      {
        from: 'Kit Arno <kit@example.com>',
        subject: 'Dead Air, a radio-station sitcom',
        body: 'Kit Arno created Dead Air.\nSubject lines like this one stay in the text.'
      },
      { from: null, subject: null, body: 'Cy Lund on making Low Tide on a shoestring.' }
    ])
  })

  it('splits an .mbox export into its emails, reading HTML-only mail as plain text', async () => {
    const pitches = await readPitchUpload([new File([mbox], 'Pitches.MBOX')])

    expect(pitches).toEqual([
      {
        from: 'Pat Lindqvist <pat.lindqvist@example.com>',
        subject: 'Ada Quill on Night Ferry',
        body: "Hi team, Ada Quill's novel Night Ferry is about a projectionist on a car ferry."
      },
      {
        from: 'Rue Vance <rue@example.com>',
        subject: 'Paper Moons — new edition',
        body: "Rue Vance has a new edition of Paper Moons out.\n\nFrom the author's desk."
      },
      {
        from: 'Ben Ochoa <ben.ochoa@example.com>',
        subject: 'Static Bloom',
        body: 'Ben Ochoa directed Static Bloom.\nFrom the first frame, it was a film about radio.'
      }
    ])
  })

  it('loads an .eml file as a pitch that keeps its sender and subject', async () => {
    fakeQloo({ search: { 'Night Ferry': [{ entity_id: 'b-0001', name: 'Night Ferry', popularity: 0.81 }] } })
    fakeReader(1, () => ({ guest: 'Ada Quill', work: { title: 'Night Ferry', type: 'book', year: 2019 } }))
    const ada = await openMember()
    const agent = await connect(ada, await created(ada))

    await upload(agent, new File([nightFerry], 'Ada Quill.eml'))
    const { inbox } = await loaded(agent)

    expect(inbox).toMatchObject({ sample: false, uploaded: true, status: 'done' })
    expect(inbox!.pitches).toMatchObject([
      {
        id: 'pitch-01',
        from: 'Pat Lindqvist <pat.lindqvist@example.com>',
        subject: 'Ada Quill on Night Ferry',
        body: "Hi team, Ada Quill's novel Night Ferry is about a projectionist on a car ferry.",
        status: 'read',
        guest: 'Ada Quill',
        match: { resolution: 'resolved', entity: { id: 'b-0001' } }
      }
    ])
  })

  it("loads the same files into the demo's inbox, whose page offers the upload too", async () => {
    fakeQloo({ search: {} })
    fakeReader(3, () => ({ guest: 'Ada Quill', work: null }))
    const s = await openSession()
    open.push(s)

    await upload(s, new File([mbox], 'Pitches.mbox'))
    const state = await loaded(s)

    expect(state.inbox!.pitches.map((p) => [p.id, p.from, p.subject])).toEqual([
      ['pitch-01', 'Pat Lindqvist <pat.lindqvist@example.com>', 'Ada Quill on Night Ferry'],
      ['pitch-02', 'Rue Vance <rue@example.com>', 'Paper Moons — new edition'],
      ['pitch-03', 'Ben Ochoa <ben.ochoa@example.com>', 'Static Bloom']
    ])
    const page = words(
      renderToStaticMarkup(<InboxWorkspace agent={{ state, stub: {} } as unknown as Agent} links={links} />)
    )
    // The header: the page's title, its pitches counted, the inspector's toggle, and Load pitches.
    expect(page).toMatch(/^Inbox 3 pitches · 3 set aside Details Load pitches /)
  })

  it("reads an email's own charset, odd HTML, and an mbox's unescaped body lines without breaking an email", async () => {
    // An 8-bit Latin-1 email: "Café Nocturne" with é as the single byte 0xE9.
    const latin1 = new TextEncoder().encode(
      'From: Lee Park <lee@example.com>\r\nSubject: Cafe\r\nContent-Type: text/plain; charset=iso-8859-1\r\nContent-Transfer-Encoding: 8bit\r\n\r\nCaf? Nocturne, a novel.\r\n'
    )
    latin1[latin1.indexOf('?'.charCodeAt(0))] = 0xe9
    const html = [
      'From: Mo Reyes <mo@example.com>',
      'Subject: Talking with Ghosts',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<table><tr><td>Mo&nbsp;Reyes</td><td title="a > b">hosts</td></tr></table><p>Talking&#99999999;with Ghosts</p>',
      ''
    ].join('\r\n')
    // A byte-order mark, then an email whose body has a line starting "From " after a blank line, unescaped.
    const unescaped = `\uFEFFFrom MAILER-DAEMON Mon Oct 12 09:30:00 2026\n${staticBloom.replace(/\r\n/g, '\n').replace('\nFrom the first', '\n\nFrom the first')}\n`

    const pitches = await readPitchUpload([
      new File([latin1], 'cafe.eml'),
      new File([html], 'ghosts.eml'),
      new File([unescaped], 'one.mbox')
    ])

    expect(pitches.map((p) => p.body)).toEqual([
      'Café Nocturne, a novel.',
      'Mo Reyes hosts\n\nTalking&#99999999;with Ghosts',
      'Ben Ochoa directed Static Bloom.\n\nFrom the first frame, it was a film about radio.'
    ])
  })

  it('refuses another type, an empty file, one over 5 MB unread, and a file with no pitch in it, saying which', async () => {
    const big: Upload = {
      name: 'export.mbox',
      size: 6 * 1024 * 1024,
      text: () => Promise.reject(new Error('A file over the limit was read.')),
      arrayBuffer: () => Promise.reject(new Error('A file over the limit was read.'))
    }
    for (const [files, error] of [
      [
        [new File([nightFerry], 'Ada Quill.eml'), new File(['%PDF-1.4'], 'press-kit.pdf')],
        '"press-kit.pdf" isn\'t a pitch file. Upload emails as .eml files or an .mbox export, or pitches as a .txt with a line of three dashes between them.'
      ],
      [[new File([nightFerry], 'Ada Quill')], '"Ada Quill" isn\'t a pitch file.'],
      [[new File([' \n'], 'empty.eml')], '"empty.eml" is empty.'],
      [[big], '"export.mbox" is 6.0 MB, over the 5 MB limit for an upload.'],
      [
        [new File([nightFerry], 'Ada Quill.mbox')],
        '"Ada Quill.mbox" isn\'t an mbox export: its first line should start an email with "From ".'
      ],
      [
        [new File([`A note before the emails.\n\n${mbox}`], 'Pitches.mbox')],
        '"Pitches.mbox" isn\'t an mbox export: its first line should start an email with "From ".'
      ],
      [[new File(['---\n  ---\n'], 'pitches.txt')], '"pitches.txt" has no pitch in it.']
    ] as const)
      await expect(readPitchUpload(files), files.map((f) => f.name).join()).rejects.toThrow(error)
  })
})

describe('loading uploaded pitches', () => {
  it('skips a pitch too long to read and names it in the inbox, and loads the rest', async () => {
    fakeQloo({ search: {} })
    fakeReader(1, () => ({ guest: 'Ada Quill', work: null }))
    const ada = await openMember()
    const agent = await connect(ada, await created(ada))
    // A newsletter of 10,001 characters, from a sender whose subject is blank.
    const long = ['From: Weekly Digest <digest@example.com>', 'Subject: ', '', 'x'.repeat(10_001), ''].join('\r\n')

    await upload(agent, new File([long], 'digest.eml'), new File([nightFerry], 'Ada Quill.eml'))
    const { inbox } = await loaded(agent)

    expect(inbox!.pitches.map((p) => [p.id, p.subject])).toEqual([['pitch-01', 'Ada Quill on Night Ferry']])
    expect(inbox!.skipped).toEqual([
      { pitch: 'Weekly Digest <digest@example.com>', why: 'is over the 10,000-character limit' }
    ])
  })

  it('refuses more than 50 pitches, or none with any text, and leaves the inbox as it was', async () => {
    fakeQloo({ search: {} })
    fakeReader(1, () => ({ guest: 'Ada Quill', work: null }))
    const ada = await openMember()
    const agent = await connect(ada, await created(ada))
    await upload(agent, new File([nightFerry], 'Ada Quill.eml'))
    const before = (await loaded(agent)).inbox

    const many = Array.from({ length: 51 }, (_, i) => `Pitch number ${i + 1}.`).join('\n---\n')
    await expect(upload(agent, new File([many], 'pitches.txt'))).rejects.toThrow(
      '51 pitches is over the 50-pitch limit. Upload 50 or fewer.'
    )
    const blank = [nightFerry.split('\r\n\r\n')[0], '', ''].join('\r\n')
    await expect(upload(agent, new File([blank], 'blank.eml'))).rejects.toThrow(
      'No pitch here can be read: "Ada Quill on Night Ferry" has no text.'
    )
    expect(agent.state()!.inbox).toEqual(before)
  })
})

describe("an uploaded .mbox's private details", () => {
  it.each(['uploaded in the app', 'sent to the API'])(
    "never reach Qloo, %s: no sender's name or address, and no guest's name",
    async (how) => {
      // A fourth email, whose work Claude reads with the sender's name in its title.
      const lowTide = [
        'From: Cy Lund <cy.lund@example.com>',
        'Subject: Low Tide',
        '',
        'I made Low Tide on a shoestring and would love to talk about it.',
        ''
      ].join('\n')
      const file = `${mbox}From MAILER-DAEMON Mon Oct 12 09:40:00 2026\n${lowTide}\n`
      fakeQloo({
        search: {
          'Night Ferry': [
            { entity_id: 'b-0001', name: 'Night Ferry', popularity: 0.81, disambiguation: '2019, Ada Quill' }
          ],
          'Paper Moons': [
            { entity_id: 'b-0002', name: 'Paper Moons', popularity: 0.5, disambiguation: '2016, Rue Vance' }
          ],
          'Static Bloom': [{ entity_id: 'f-0001', name: 'Static Bloom', popularity: 0.5, disambiguation: '2021' }]
        }
      })
      const read: Record<string, Extracted> = {
        'Night Ferry': { guest: 'Ada Quill', work: { title: 'Night Ferry', type: 'book', year: 2019 } },
        'Paper Moons': { guest: 'Rue Vance', work: { title: 'Paper Moons', type: 'book', year: 2016 } },
        'Static Bloom': { guest: 'Ben Ochoa', work: { title: 'Static Bloom', type: 'film', year: 2021 } },
        'Low Tide': { guest: 'Cy Lund', work: { title: "Cy Lund's Low Tide", type: 'film', year: null } }
      }
      fakeReader(4, (text) => Object.entries(read).find(([title]) => text.includes(title))![1])
      const { ada, network, call } = await networkWithKey()
      let inbox: { status: string; pitches: Pitch[] }
      if (how === 'uploaded in the app') {
        const agent = await connect(ada, network)
        await upload(agent, new File([file], 'Pitches.mbox'))
        inbox = (await loaded(agent)).inbox!
      } else {
        const res = await call(`/api/v1/networks/${network}/inbox`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/mbox' },
          body: file
        })
        expect(res.status).toBe(202)
        inbox = await poll<typeof inbox>(call, `/api/v1/networks/${network}/inbox`, (i) => i.status !== 'reading')
      }

      expect(inbox.pitches.map((p) => [p.from, p.status])).toEqual([
        ['Pat Lindqvist <pat.lindqvist@example.com>', 'read'],
        ['Rue Vance <rue@example.com>', 'read'],
        ['Ben Ochoa <ben.ochoa@example.com>', 'read'],
        ['Cy Lund <cy.lund@example.com>', 'unreadable']
      ])
      const sent = qlooRequests()
      expect(sent).toHaveLength(3)
      const senders = ['Pat Lindqvist', 'pat.lindqvist@example.com', 'rue@example.com', 'ben.ochoa@example.com']
      const personal = [...senders, 'cy.lund@example.com', ...Object.values(read).map((r) => r.guest), '@']
      for (const detail of personal)
        expect(
          sent.filter((r) => r.includes(detail.toLowerCase())),
          detail
        ).toEqual([])
    }
  )
})

// An agent with the show on its roster, the Night Ferry pitch uploaded, and a pitch run to its end
// that drafted one reply.
async function drafted(agent: Omit<Session, 'cookie'>) {
  fakeQloo({
    search: {
      'Night Shift Cinema': [{ entity_id: 'e-0001', name: 'Night Shift Cinema', popularity: 0.8 }],
      'Night Ferry': [{ entity_id: 'b-0001', name: 'Night Ferry', popularity: 0.81, disambiguation: '2019, Ada Quill' }]
    }
  })
  fakeInsights([{ entity_id: 'b-0001', name: 'Night Ferry', affinity: 0.7127 }])
  // Night Ferry shares no tags with the show, so its reply has no angle.
  fakeCompare({})
  fakeClaude([
    turn(text(JSON.stringify({ guest: 'Ada Quill', work: { title: 'Night Ferry', type: 'book', year: 2019 } }))),
    turn(toolUse('rank_pitches', { show_id: 'e-0001', past_guest_work_ids: [], pitch_ids: ['pitch-01'] })),
    turn(toolUse('shared_tags', { anchor_ids: ['e-0001'], candidate_ids: ['pitch-01'] })),
    turn(
      toolUse('draft_replies', {
        replies: [{ pitch: 'pitch-01', verdict: 'later', angle: null, draft: "Let's revisit Night Ferry in spring." }]
      })
    ),
    turn(text('Drafted.'))
  ])
  await agent.importRoster('Night Shift Cinema')
  await upload(agent, new File([nightFerry], 'Ada Quill.eml'))
  await loaded(agent)
  await agent.call('startPitches', { show: 'Night Shift Cinema', pastGuests: [] })
  return agent.until((s) => s.run?.status === 'completed')
}
const reply = (s: State | undefined) => s!.booking!.replies![0]

describe('approving a reply', () => {
  it("takes a member's connection, records who approved, and shows every member", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const grace = await teammate(ada, network)
    const adas = await connect(ada, network)
    const graces = await connect(grace, network)
    await drafted(adas)

    await graces.call('approveReply', 'pitch-01')
    expect(reply(graces.state())).toMatchObject({ status: 'approved', approvedBy: grace.id })
    const seen = await adas.until((s) => reply(s).status === 'approved')
    expect(reply(seen)).toMatchObject({ approvedBy: grace.id })
    // Ada's page shows it approved, ready to copy, under the network's limits on model runs.
    const page = inboxPage(seen, network)
    expect(page).toMatch(
      /Night Ferry · Ada Quill Approved To Pat Lindqvist <pat\.lindqvist@example\.com> No angle: Qloo returned no shared tags\. Shares with Night Shift Cinema: Qloo data No distinctive shared tags C-\d+ Let's revisit Night Ferry in spring\. Copy reply about Night Ferry Edit reply about Night Ferry Discard reply about Night Ferry Copy it into your own email to send\./
    )
    expect(page).toContain(
      'Runs Each run starts fresh; earlier ones stay here to compare. Run 1 · Pitches for Night Shift Cinema'
    )
    expect(page).toContain(
      'Model runs are limited per UTC day across the network’s launches and inbox, whoever starts them.'
    )

    // An edit returns it to draft, and the approval with it.
    await adas.call('editReply', 'pitch-01', 'Night Ferry is a yes for spring.')
    expect(reply(adas.state())).toEqual(expect.not.objectContaining({ approvedBy: expect.anything() }))
    expect(reply(adas.state()).status).toBe('draft')
  })

  it('forgets who approved once they delete their account, in the inbox and in the record of every pitch run', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const grace = await teammate(ada, network)
    const adas = await connect(ada, network)
    const graces = await connect(grace, network)
    await graces.call('dismissChecklist')
    // A launch she ran, which the network's list names her on, as each pitch run's record keeps it.
    fakeClaude([turn(text('No roster to rank yet.'))])
    const { id } = await graces.call<{ id: string }>('createLaunch', { name: 'Night Shift Cinema' })
    const launch = await grace.connect(`/agents/launch/${network}/${id}`)
    open.push(launch)
    await launch.call('startLaunch', { name: 'Night Shift Cinema' })
    await adas.until((s) => s.launches![0].startedBy === 'Grace Booker' && s.launches![0].status === 'ranked')
    const run = (await drafted(adas)).run!.id
    await graces.call('approveReply', 'pitch-01')
    await adas.until((s) => reply(s).status === 'approved')
    const record = JSON.stringify(await adas.call('getRun', run))
    expect(record).toContain(grace.id)
    expect(record).toContain('Grace Booker')

    expect((await grace.fetch('/app/account/delete', { method: 'POST' })).status).toBe(200)
    const state = await adas.until((s) => !s.checklistDismissed!.includes(grace.id))
    expect(reply(state)).toMatchObject({ status: 'approved' })
    expect(reply(state)).not.toHaveProperty('approvedBy')
    expect(JSON.stringify(state)).not.toContain(grace.id)
    expect(JSON.stringify(state)).not.toContain('Grace Booker')
    const forgotten = await adas.call<State>('getRun', run)
    expect(reply(forgotten)).toMatchObject({ status: 'approved' })
    expect(JSON.stringify(forgotten)).not.toContain(grace.id)
    expect(JSON.stringify(forgotten)).not.toContain('Grace Booker')
    const read = await ada.fetch(`/api/v1/networks/${network}/pitch-runs/${run}`)
    expect((await read.json<{ replies: object[] }>()).replies[0]).toEqual(
      expect.not.objectContaining({ approvedBy: expect.anything() })
    )
  })

  it("is refused over RPC, and on a network's connection that carries no member, and changes nothing", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const adas = await connect(ada, network)
    const before = reply(await drafted(adas))
    const stub = async () => getAgentByName(env.NetworkAgent, network)

    // The Worker's own call, with no connection, as the API would make it. RPC's promise is wrapped in
    // a plain one for `rejects`.
    await expect((async () => (await stub()).approveReply('pitch-01'))()).rejects.toThrow(
      'Only a member of the network, signed in to the app, can approve a reply.'
    )
    // Straight to the agent, as a Worker route that forgot to name the member would let it through.
    const bare = await connectVia(`/agents/network/${network}`, {}, async (request) => (await stub()).fetch(request))
    open.push(bare)
    await expect(bare.call('approveReply', 'pitch-01')).rejects.toThrow(
      'Only a member of the network, signed in to the app, can approve a reply.'
    )
    expect(reply(adas.state())).toEqual(before)
  })

  it("is refused over RPC on the demo's agent, and still approves over the visitor's connection", async () => {
    const s = await openSession()
    open.push(s)
    await drafted(s)
    const session = s.cookie.split('=')[1]

    await expect(
      (async () => (await getAgentByName(env.CrossfeedAgent, session)).approveReply('pitch-01'))()
    ).rejects.toThrow('A reply is approved in the app, by a person; nothing else can approve one.')
    expect(reply(s.state()).status).toBe('draft')
    await s.call('approveReply', 'pitch-01')
    expect(reply(s.state())).toEqual(expect.objectContaining({ status: 'approved' }))
    expect(reply(s.state())).not.toHaveProperty('approvedBy')
  })
})

describe("the inbox's page", () => {
  it("opens for each of the network's members, connected to its agent, with Inbox current in the bar", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const grace = await teammate(ada, network)
    for (const [member, role] of [
      [ada, 'owner'],
      [grace, 'member']
    ] as const) {
      const res = await member.fetch(`/app/${network}/inbox`)
      expect(res.status).toBe(200)
      expect(res.headers.get('cache-control')).toBe('no-store')
      const html = await res.text()
      const root = html.match(/<div id="root"([^>]*)>/)![1]
      for (const attribute of [
        'data-page="network-inbox"',
        `data-agent-path="/agents/network/${network}"`,
        `data-network-id="${network}"`,
        'data-network-name="Night Shift Audio"',
        `data-role="${role}"`,
        `data-roster-link="/app/${network}/roster"`,
        `data-inbox-link="/app/${network}/inbox"`
      ])
        expect(root).toContain(attribute)
      expect(html.match(/<nav\b/g)).toHaveLength(1)
      expect(currentLinks(html)).toEqual([['Inbox', `/app/${network}/inbox`, 'page']])
    }
  })

  it('is a 404, and unlinked, while guest pitches are off', async () => {
    env.GUEST_PITCHES = 'off'
    const ada = await openMember()
    const network = await created(ada)
    expect((await ada.fetch(`/app/${network}/inbox`)).status).toBe(404)
    expect(await (await ada.fetch(`/app/${network}`)).text()).not.toContain('/inbox')
  })
})

// A page's words, as a reader hears them.
const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
// The inbox page as a member reads it, from the network agent's synced state and the server's links,
// as NetworkInboxPage renders it.
const inboxMarkup = (state: State | undefined, network: string) =>
  renderToStaticMarkup(
    <InboxWorkspace
      agent={{ state, stub: {} } as unknown as Agent}
      links={{ roster: networkLinks(env, network).roster }}
      network={{ id: network, name: 'Night Shift Audio', role: 'owner', links: networkLinks(env, network) }}
    />
  )
const inboxPage = (state: State | undefined, network: string) => words(inboxMarkup(state, network))

describe("the inbox's members", () => {
  it("see the pitches another uploads as they're read, and the dashboard's inbox line with them", async () => {
    fakeQloo({ search: {} })
    fakeReader(2, (text) =>
      text.includes('Night Ferry')
        ? { guest: 'Ada Quill', work: { title: 'Night Ferry', type: 'book', year: 2019 } }
        : { guest: 'Rue Vance', work: null }
    )
    const ada = await openMember()
    const network = await created(ada)
    const grace = await teammate(ada, network)
    const [adas, graces] = [await connect(ada, network), await connect(grace, network)]

    await upload(graces, new File([nightFerry], 'Ada Quill.eml'), new File([paperMoons], 'Rue Vance.eml'))
    const seen = await loaded(adas)

    expect(seen.inbox!.pitches.map((p) => [p.subject, p.status])).toEqual([
      ['Ada Quill on Night Ferry', 'read'],
      ['Paper Moons — new edition', 'no_work']
    ])
    const dashboard = renderToStaticMarkup(
      <Dashboard
        state={seen}
        network={{ id: network, name: 'Night Shift Audio', role: 'owner', links: networkLinks(env, network) }}
        memberId={ada.id}
        setup={{ invited: true, apiKey: false }}
        dismiss={async () => {}}
        createLaunch={async () => ({ id: 'l-1' })}
      />
    )
    expect(words(dashboard)).toContain('Inbox 2 pitches: 1 not in Qloo, 1 set aside Open')
  })
})

describe("the inbox page's words", () => {
  it('offers uploads beside pasting, and links the network roster when no show is matched', async () => {
    fakeQloo({ search: {} })
    fakeReader(1, () => ({ guest: 'Ada Quill', work: null }))
    const ada = await openMember()
    const network = await created(ada)
    const agent = await connect(ada, network)
    // The header is the title alone, and the empty state says what's missing and what reaches Qloo of a
    // pitch, with Load pitches, which opens the form in its dialog (test/page-forms.test.tsx reads it).
    // Nothing says "Not loaded" too. The inspector is closed, with nothing to show yet, so the header has
    // no toggle for it either.
    const empty = inboxPage(agent.state(), network)
    expect(empty).toMatch(
      /^Inbox No pitches yet\. Only the work’s title and type are looked up in Qloo; names, addresses, and pitch text never are\. Load pitches /
    )
    expect(empty).not.toContain('Not loaded')
    expect(inboxMarkup(agent.state(), network)).toMatch(inspectorClosed)
    expect(empty).not.toContain('Details')
    await upload(agent, new File([nightFerry], 'Ada Quill.eml'))
    const read = inboxPage(await loaded(agent), network)
    // The header: the title, the pitches counted, the inspector's toggle, and Load pitches. Read, with no
    // pitch run yet, the inbox is at rest, so there's no readout before the inbox's tabs, the first of
    // which, Pitches, says what reaches Qloo of a pitch. A member's inbox isn't the sample's, so its title
    // has no sample badge.
    expect(read).toMatch(
      /^Inbox 1 pitch · 1 set aside Details Load pitches Pitches Rank Pitches Only the work’s title and type are looked up in Qloo; names, addresses, and pitch text never are\. /
    )
    expect(sampleLabels(inboxMarkup(agent.state(), network))).toEqual([])
    // The inspector is closed as the page opens, so the canvas takes the width; Details opens it.
    expect(inboxMarkup(agent.state(), network)).toMatch(inspectorClosed)
    expect(inboxMarkup(agent.state(), network)).toMatch(detailsToggle)
    expect(
      renderToStaticMarkup(
        <InboxWorkspace
          agent={{ state: agent.state(), stub: {} } as unknown as Agent}
          links={{ roster: `/app/${network}/roster` }}
        />
      )
    ).toMatch(new RegExp(`<a\\b[^>]*\\shref="/app/${network}/roster"[^>]*>Import the roster</a>`))
  })

  it("leaves a set-aside pitch's guest and work cells empty, saying so to screen readers", async () => {
    fakeQloo({ search: {} })
    fakeReader(1, () => ({ guest: 'G'.repeat(201), work: null }))
    const ada = await openMember()
    const network = await created(ada)
    const agent = await connect(ada, network)

    await upload(agent, new File([nightFerry], 'Ada Quill.eml'))
    const state = await loaded(agent)
    expect(state.inbox!.pitches.map((p) => [p.status, p.guest, p.work])).toEqual([['unreadable', null, null]])
    const [rows] = renderToStaticMarkup(
      <InboxWorkspace
        agent={{ state, stub: {} } as unknown as Agent}
        links={{ roster: networkLinks(env, network).roster }}
        network={{ id: network, name: 'Night Shift Audio', role: 'owner', links: networkLinks(env, network) }}
      />
    ).match(/<tbody>.*?<\/tbody>/s)!
    expect(words(rows)).toBe(
      "Ada Quill on Night Ferry Pat Lindqvist <pat.lindqvist@example.com> None None Unreadable The guest's name is over 200 characters, so the pitch is set aside."
    )
    // Its guest and work cells are there, with nothing to see in them, so the columns keep their places.
    expect(rows).toMatch(
      /<\/th><td\b[^>]*><span class="vh">None<\/span><\/td><td\b[^>]*><span class="vh">None<\/span><\/td><td\b/
    )
  })

  it('names each skipped pitch and why, apart from the ones that loaded', async () => {
    fakeQloo({ search: {} })
    fakeReader(1, () => ({ guest: 'Ada Quill', work: null }))
    const ada = await openMember()
    const network = await created(ada)
    const agent = await connect(ada, network)
    const long = ['From: Weekly Digest <digest@example.com>', '', 'x'.repeat(10_001), ''].join('\r\n')
    const blank = ['From: Lee Park <lee@example.com>', 'Subject: Press kit attached', '', ''].join('\r\n')

    await upload(agent, new File([long], 'digest.eml'), new File([blank], 'kit.eml'), new File([nightFerry], 'a.eml'))
    expect(inboxPage(await loaded(agent), network)).toContain(
      'Skipped “Weekly Digest <digest@example.com>” is over the 10,000-character limit and “Press kit attached” has no text, so they aren’t in the inbox.'
    )
  })
})
