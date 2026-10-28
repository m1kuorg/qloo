// A network's roster: its own page, kept by the network's agent, imported from a file or pasted names,
// kept across re-imports, shared live by its members, and counted against the limits as the network.
// Each test drives a network through the Worker's routes, its agent's client protocol, or the Worker's
// own RPC to the agent, as the API will call it.
import { getAgentByName } from 'agents'
import { env } from 'cloudflare:workers'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import type { State } from '../src/agent'
import { Dashboard } from '../src/client/Dashboard'
import type { NetworkConnection } from '../src/client/NetworkPage'
import { NetworkRoster } from '../src/client/Roster'
import { RosterImport, ShowEditor } from '../src/client/RosterModules'
import type { Role } from '../src/directory'
import sample from '../src/sample-network.json'
import { networkLinks } from '../src/shell'
import { readRosterUpload, type Upload } from '../src/upload'
import { fakeClaude, fakeQloo, modelRequests, requests, text, toolUse, turn } from './fake'
import { currentLinks, openGuest, openMember, openSession, regions, type Member, type Session } from './session'

// Synthetic shows: two exact matches, one name shared by two feeds, and one Qloo doesn't have.
const search = {
  'Deep Cuts': [{ entity_id: 'p-0001', name: 'Deep Cuts', popularity: 0.5 }],
  'Signal Boost': [{ entity_id: 'p-0002', name: 'Signal Boost', popularity: 0.4 }],
  'Field Notes': [
    { entity_id: 'p-0101', name: 'Field Notes: Film', popularity: 0.6 },
    { entity_id: 'p-0102', name: 'Field Notes: Books', popularity: 0.3 }
  ],
  'Paper Trail': []
}

// Members' and visitors' addresses, as Cloudflare's edge sends them.
const adaIp = '203.0.113.7'
const graceIp = '198.51.100.4'

const open: Omit<Session, 'cookie'>[] = []
const saved = {
  QLOO_VISITOR_DAILY_CALL_CAP: env.QLOO_VISITOR_DAILY_CALL_CAP,
  RUN_VISITOR_DAILY_CAP: env.RUN_VISITOR_DAILY_CAP,
  GUEST_PITCHES: env.GUEST_PITCHES,
  SAMPLE_NETWORK: env.SAMPLE_NETWORK
}
afterEach(() => {
  Object.assign(env, saved)
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
// The network's agent, opened from one of its pages, from the member's address if given.
async function connect(member: Pick<Member, 'connect'>, network: string, ip?: string) {
  const agent = await member.connect(`/agents/network/${network}`, ip ? { 'CF-Connecting-IP': ip } : {})
  open.push(agent)
  return agent
}
const visit = async (ip: string) => {
  const s = await openSession(undefined, ip)
  open.push(s)
  return s
}
// A member of `network` besides its owner, invited by `owner` and signed up through the link.
const teammate = async (owner: Member, network: string, name = 'Grace Booker') =>
  openMember({ name, invite: await owner.invite(network) })

const settled = (s: State) => s.roster.every((show) => show.resolution !== 'pending')

// A page's words, as a reader hears them.
const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

describe("a network's agent", () => {
  it('refuses what only a launch does, and changes nothing', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const agent = await connect(ada, network)
    const before = agent.state()
    const launches =
      "A network's agent keeps the roster and the inbox; each launch runs in its own workspace, with its runs and insertion order."
    for (const [method, args, error] of [
      ['startLaunch', [{ name: 'Deep Cuts' }], launches],
      ['startLaunch', [{ comps: ['Deep Cuts'] }], launches],
      ['editInsertionOrder', ['IO-0001', []], launches],
      ['approveInsertionOrder', ['IO-0001'], launches]
    ] as const)
      await expect(agent.call(method, ...args), method).rejects.toThrow(error)
    expect(agent.state()).toEqual(before)
    expect(requests).toEqual([])
    expect(modelRequests()).toEqual([])
  })
})

describe('the sample roster', () => {
  it("isn't a network's to start from: only the guest network loads it, and its agent offers no way to", async () => {
    fakeQloo({ search })
    const ada = await openMember()
    const network = await created(ada)
    const agent = await connect(ada, network)
    await expect(agent.call('startFromSample')).rejects.toThrow('startFromSample')
    expect(agent.state()).toMatchObject({ roster: [], sample: null })
    expect(requests).toEqual([])
  })
})

describe('uploading a roster file', () => {
  // Reads files the way the roster page does when they're dropped or picked, then imports them over
  // the network's agent as the page sends them.
  const upload = async (agent: Omit<Session, 'cookie'>, ...files: Upload[]) => {
    const { text, format } = await readRosterUpload(files)
    return agent.importRoster(text, format)
  }

  it('imports a CSV or a text file of names', async () => {
    fakeQloo({ search })
    const ada = await openMember()
    const agent = await connect(ada, await created(ada))
    await upload(agent, new File(['name,downloads\nDeep Cuts,12000\nSignal Boost,\n'], 'Roster 2026.CSV'))
    expect(agent.state()!.roster.map((s) => [s.name, s.downloads])).toEqual([
      ['Deep Cuts', 12000],
      ['Signal Boost', null]
    ])

    await upload(agent, new File(['Paper Trail\r\nField Notes\r\n'], 'shows.txt', { type: 'text/plain' }))
    expect(agent.state()!.roster.map((s) => s.name)).toEqual(['Paper Trail', 'Field Notes'])
  })

  it('refuses another type, more or fewer than one file, an empty file, and one over 5 MB unread, and keeps the roster', async () => {
    fakeQloo({ search })
    const ada = await openMember()
    const agent = await connect(ada, await created(ada))
    await agent.importRoster('Deep Cuts')
    const big: Upload = {
      name: 'roster.csv',
      size: 6 * 1024 * 1024,
      text: () => Promise.reject(new Error('A file over the limit was read.')),
      arrayBuffer: () => Promise.reject(new Error('A file over the limit was read.'))
    }
    for (const [files, error] of [
      [
        [new File(['name\nDeep Cuts'], 'roster.xlsx')],
        '"roster.xlsx" isn\'t a CSV or text file. Upload the roster as .csv, or as .txt with one show name per line; a spreadsheet can save or export it as CSV.'
      ],
      [[new File(['Deep Cuts'], 'roster')], '"roster" isn\'t a CSV or text file.'],
      [[], 'Upload one roster file: a .csv, or a .txt with one show name per line.'],
      [
        [new File(['Deep Cuts'], 'a.txt'), new File(['Paper Trail'], 'b.txt')],
        'Upload one roster file: a .csv, or a .txt with one show name per line.'
      ],
      [[new File(['\n \n'], 'roster.txt')], '"roster.txt" is empty.'],
      [[big], '"roster.csv" is 6.0 MB, over the 5 MB limit for an upload.']
    ] as const)
      await expect(upload(agent, ...files)).rejects.toThrow(error)
    expect(agent.state()!.roster.map((s) => s.name)).toEqual(['Deep Cuts'])
    expect(requests).toHaveLength(1)
  })

  it('refuses a CSV without a name column, or over 50 shows, saying why, and keeps the roster it has', async () => {
    fakeQloo({ search })
    const ada = await openMember()
    const agent = await connect(ada, await created(ada))
    await agent.importRoster('Deep Cuts')
    await expect(upload(agent, new File(['Show,Downloads\nDeep Cuts,45000'], 'roster.csv'))).rejects.toThrow(
      'The CSV needs a "name" column. Its first row has "Show", "Downloads".'
    )
    const names = Array.from({ length: 51 }, (_, i) => `Show ${i + 1}`)
    await expect(upload(agent, new File([names.join('\n')], 'roster.txt'))).rejects.toThrow(
      '51 shows is over the 50-show limit'
    )
    expect(agent.state()!.roster.map((s) => s.name)).toEqual(['Deep Cuts'])
  })
})

describe('re-importing the roster', () => {
  const first = [
    'name,downloads,status',
    'Deep Cuts,12000,active',
    'Field Notes,8000,active',
    'Paper Trail,3000,hiatus',
    'Signal Boost,5000,active'
  ].join('\n')

  it('keeps each show still on it as it was settled, updates the figures the file has, and looks up only new shows', async () => {
    fakeQloo({ search: { ...search, 'Night Ferry': [{ entity_id: 'p-0301', name: 'Night Ferry', popularity: 0.2 }] } })
    const ada = await openMember()
    const network = await created(ada)
    const agent = await connect(ada, network)
    await agent.importRoster(first, 'csv')
    await agent.call('updateShow', 'Field Notes', { entityId: 'p-0102' })
    await agent.searchComps('Paper Trail', 'Signal Boost')
    await agent.call('updateShow', 'Paper Trail', { compId: 'p-0002' })
    await agent.call('updateShow', 'Deep Cuts', { excluded: true })
    const settledShows = agent.state()!.roster
    const searched = requests.length

    // New downloads, with no status column: one show named in another case, one dropped, one blank, one new.
    await agent.importRoster('name,downloads\ndeep cuts,15000\nField Notes,9000\nPaper Trail,\nNight Ferry,2000', 'csv')

    const kept = (name: string) => settledShows.find((s) => s.name === name)!
    expect(agent.state()!.roster).toEqual([
      { ...kept('Deep Cuts'), downloads: 15000 },
      { ...kept('Field Notes'), downloads: 9000 },
      { ...kept('Paper Trail'), downloads: null },
      {
        name: 'Night Ferry',
        resolution: 'resolved',
        entity: { id: 'p-0301', name: 'Night Ferry', popularity: 0.2 },
        candidates: [],
        evidence: 'C-06',
        error: null,
        compSearch: null,
        downloads: 2000,
        status: null,
        description: null,
        excluded: false
      }
    ])
    expect(kept('Deep Cuts')).toMatchObject({ resolution: 'resolved', excluded: true, status: 'active' })
    expect(kept('Field Notes')).toMatchObject({ resolution: 'resolved', entity: { id: 'p-0102' }, evidence: 'C-02' })
    expect(kept('Paper Trail')).toMatchObject({ resolution: 'mapped', compSearch: { call: 'C-05' }, status: 'hiatus' })
    expect(requests.slice(searched).map((r) => r.url.searchParams.get('query'))).toEqual(['Night Ferry'])
  })

  it('keeps every figure of a show still on it when the names are pasted', async () => {
    fakeQloo({ search })
    const ada = await openMember()
    const network = await created(ada)
    const agent = await connect(ada, network)
    await agent.importRoster(first, 'csv')
    const before = agent.state()!.roster

    await agent.importRoster('Signal Boost\nDeep Cuts')
    expect(agent.state()!.roster).toEqual([before[3], before[0]])
  })

  it('looks a show up again when its last lookup failed', async () => {
    fakeQloo({ search, first: { 'Deep Cuts': [503, 503, 503] } })
    const ada = await openMember()
    const network = await created(ada)
    const agent = await connect(ada, network)
    await agent.importRoster('Deep Cuts\nSignal Boost')
    expect(agent.state()!.roster.map((s) => s.resolution)).toEqual(['failed', 'resolved'])

    await agent.importRoster('Deep Cuts\nSignal Boost')
    expect(agent.state()!.roster.map((s) => [s.resolution, s.evidence])).toEqual([
      ['resolved', 'C-03'],
      ['resolved', 'C-02']
    ])
  })

  it("takes the sample labels off the figures the file brings, and the sample's notice once none is left", async () => {
    fakeQloo({ search: {} })
    env.SAMPLE_NETWORK = 'on'
    const agent = await connect(await openGuest(), 'guest-network')
    await agent.until((s) => s.roster.length > 0 && settled(s))

    await agent.importRoster('name,downloads\nThe Watch,41000\nHouse of R,', 'csv')
    expect(agent.state()!.roster.map((s) => [s.name, s.downloads, s.status, s.sample])).toEqual([
      ['The Watch', 41000, 'active', ['status', 'description']],
      ['House of R', null, 'active', ['status', 'description']]
    ])
    // Sample figures are left, so the notice naming the sample's network stays with them.
    expect(agent.state()!.sample).toMatchObject({ network: 'The Ringer' })

    await agent.importRoster(
      'name,status,description\nThe Watch,active,Our TV show\nHouse of R,hiatus,Our fantasy show',
      'csv'
    )
    expect(agent.state()!.roster.map((s) => s.sample)).toEqual([[], []])
    expect(agent.state()!.sample).toBeNull()
  })

  it("replaces the demo's roster as before, settled shows and all", async () => {
    fakeQloo({ search })
    const demo = await visit(adaIp)
    await demo.importRoster('Field Notes')
    await demo.call('updateShow', 'Field Notes', { entityId: 'p-0102' })
    await demo.importRoster('Field Notes')
    expect(demo.state()!.roster.map((s) => [s.resolution, s.evidence])).toEqual([['ambiguous', 'C-02']])
  })
})

describe("a network's limits", () => {
  it('counts every Qloo call under the network, from any member or none, apart from their own visits', async () => {
    env.QLOO_VISITOR_DAILY_CALL_CAP = '3'
    fakeQloo({ search })
    const ada = await openMember()
    const network = await created(ada)
    const grace = await teammate(ada, network)

    // The Worker's own call, with no connection, as the API will make it.
    await (await getAgentByName(env.NetworkAgent, network)).importRoster('Deep Cuts\nSignal Boost')
    const graces = await connect(grace, network, graceIp)
    await graces.until((s) => s.roster.length === 2 && settled(s))

    await expect(graces.call('importRoster', 'Paper Trail\nField Notes')).rejects.toThrow(
      'This would take you past 3 Qloo calls today, the most one network can make in a UTC day, cache hits included; they reset at 00:00 UTC.'
    )
    const adas = await connect(ada, network, adaIp)
    await adas.importRoster('Paper Trail')
    expect(adas.state()!.roster.map((show) => show.name)).toEqual(['Paper Trail'])

    // Each member's own visits to the demo count apart, as theirs.
    for (const ip of [adaIp, graceIp]) {
      const demo = await visit(ip)
      await demo.importRoster('Deep Cuts\nSignal Boost\nPaper Trail')
      expect(demo.state()!.roster).toHaveLength(3)
    }
  })

  it('counts every model run under the network, whichever member starts it', async () => {
    env.GUEST_PITCHES = 'on'
    env.RUN_VISITOR_DAILY_CAP = '1'
    // Each inbox load reads its one pitch, which pitches no public work.
    fakeClaude([1, 2].map(() => turn(text(JSON.stringify({ guest: 'Dot Pruitt', work: null })))))
    const pitch = { text: 'From: Pat <pat@example.com>\nSubject: A guest\n\nDot Pruitt would love to come on.' }
    const ada = await openMember()
    const network = await created(ada)
    const grace = await teammate(ada, network)

    const adas = await connect(ada, network, adaIp)
    await adas.call('loadInbox', pitch)
    await adas.until((s) => s.inbox?.status === 'done')
    const graces = await connect(grace, network, graceIp)
    await expect(graces.call('loadInbox', pitch)).rejects.toThrow(
      "You've started 1 model run today, the most one network can start in a UTC day; they reset at 00:00 UTC."
    )

    const demo = await visit(graceIp)
    await demo.call('loadInbox', pitch)
    expect((await demo.until((s) => s.inbox?.status === 'done')).inbox!.pitches).toHaveLength(1)
  })

  it("counts a launch's Qloo calls among its network's", async () => {
    env.QLOO_VISITOR_DAILY_CALL_CAP = '3'
    fakeQloo({ search })
    fakeClaude([
      turn(toolUse('resolve_entities', { names: ['Deep Cuts'], type: 'urn:entity:podcast' })),
      turn(text('Deep Cuts is resolved.'))
    ])
    const ada = await openMember()
    const network = await created(ada)
    const adas = await connect(ada, network, adaIp)
    await adas.importRoster('Signal Boost')
    // A launch's run resolves its launch: the network's second call today.
    const { id } = await adas.call<{ id: string }>('createLaunch', { name: 'Deep Cuts' })
    const launch = await ada.connect(`/agents/launch/${network}/${id}`, { 'CF-Connecting-IP': adaIp })
    open.push(launch)
    await launch.call('startLaunch', { name: 'Deep Cuts' })
    expect((await launch.until((s) => s.run?.status !== 'running')).run?.status).toBe('completed')

    await expect(adas.call('importRoster', 'Signal Boost\nPaper Trail\nField Notes')).rejects.toThrow(
      'This would take you past 3 Qloo calls today, the most one network can make'
    )
    await adas.importRoster('Signal Boost\nPaper Trail')
    expect(adas.state()!.roster).toHaveLength(2)
  })
})

describe("the roster's page", () => {
  it("opens for each of the network's members, connected to its agent, with Roster current in the bar", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const grace = await teammate(ada, network)
    for (const [member, role] of [
      [ada, 'owner'],
      [grace, 'member']
    ] as const) {
      const res = await member.fetch(`/app/${network}/roster`)
      expect(res.status).toBe(200)
      expect(res.headers.get('cache-control')).toBe('no-store')
      const html = await res.text()
      const root = html.match(/<div id="root"([^>]*)>/)![1]
      for (const attribute of [
        'data-page="network-roster"',
        `data-agent-path="/agents/network/${network}"`,
        `data-network-id="${network}"`,
        'data-network-name="Night Shift Audio"',
        `data-role="${role}"`,
        `data-settings-link="/app/${network}/settings"`
      ])
        expect(root).toContain(attribute)
      expect(html.match(/<nav\b/g)).toHaveLength(1)
      expect(currentLinks(html)).toEqual([['Roster', `/app/${network}/roster`, 'page']])
    }
  })

  it("shows each member the other's edits as they're made, and the dashboard's roster line with them", async () => {
    fakeQloo({ search })
    const ada = await openMember()
    const network = await created(ada)
    const grace = await teammate(ada, network)
    const [adas, graces] = [await connect(ada, network), await connect(grace, network)]

    await adas.importRoster('Deep Cuts\nField Notes')
    const seen = await graces.until((s) => s.roster.length === 2 && settled(s))
    expect(seen.roster.map((s) => s.resolution)).toEqual(['resolved', 'ambiguous'])

    // Ada's next state after Grace settles a show already has it.
    const from = adas.frames().length
    await graces.call('updateShow', 'Field Notes', { entityId: 'p-0101' })
    const next = await adas.until(() =>
      adas
        .frames()
        .slice(from)
        .some((f) => JSON.parse(f).type === 'cf_agent_state')
    )
    expect(next.roster[1]).toMatchObject({ resolution: 'resolved', entity: { id: 'p-0101' } })

    const dashboard = renderToStaticMarkup(
      <Dashboard
        state={next}
        network={{ id: network, name: 'Night Shift Audio', role: 'owner', links: networkLinks(env, network) }}
        memberId={ada.id}
        setup={{ invited: true, apiKey: false }}
        dismiss={async () => {}}
        createLaunch={async () => ({ id: 'l-1' })}
      />
    )
    expect(words(dashboard)).toContain('Roster 2 shows: 2 matched Open')
  })
})

describe("the roster page's words", () => {
  // The page as a member reads it, from the network agent's synced state.
  const markup = (state: State | undefined) =>
    renderToStaticMarkup(<NetworkRoster agent={{ state, stub: {} } as unknown as NetworkConnection} />)
  const page = (state: State | undefined) => words(markup(state))
  // The inspector's Show tab for one of the roster's shows, as selecting its row opens it.
  const editor = (state: State, name: string) =>
    words(
      renderToStaticMarkup(
        <ShowEditor
          show={state.roster.find((show) => show.name === name)!}
          agent={{ state, stub: {} } as unknown as NetworkConnection}
          close={() => {}}
          openCall={() => {}}
          opened={null}
        />
      )
    )

  it("leaves the shell's top bar the one banner, and names each region once", async () => {
    fakeQloo({ search })
    const ada = await openMember()
    const network = await created(ada)
    const state = await (await connect(ada, network)).importRoster('Deep Cuts\nField Notes')
    const html = renderToStaticMarkup(<NetworkRoster agent={{ state, stub: {} } as unknown as NetworkConnection} />)
    expect(html).not.toContain('<header')
    const named = regions(html)
    expect(named.length).toBeGreaterThan(0)
    expect(new Set(named).size).toBe(named.length)
  })

  it('offers an empty network one way in, the import in its sheet, and nothing a launch does', async () => {
    const ada = await openMember()
    const network = await created(ada)
    // The header is the title alone, and the empty state says what's missing with Import shows, which
    // opens the import in its sheet. With no shows there's nothing to count, cite, or start from, and
    // the CPM is the dashboard's and the settings'.
    expect(page((await connect(ada, network)).state())).toBe('Roster No shows yet. Import shows')
    // The sheet's import takes pasted names or a file, dropped anywhere on the page.
    const form = words(
      renderToStaticMarkup(
        <RosterImport roster={[]} draft={{ current: '' }} importRoster={async () => {}} keepsSettledShows />
      )
    )
    expect(form).toBe(
      'Show names Import roster Upload a file Up to 50 shows. Shows already on the roster keep their matches; only new ones are looked up. Drop a file anywhere on the page, or upload one: a CSV needs a name column, and downloads , status , and description are optional; a text file has one show name per line.'
    )
  })

  it('leaves the CPM to the dashboard, where a guest, an owner of the guest network, changes it, and a guest made a member views it', async () => {
    const guest = await openGuest()
    const state = await (await connect(guest, 'guest-network')).until((s) => s.cpm === 20)
    const roster = words(
      renderToStaticMarkup(<NetworkRoster agent={{ state, stub: {} } as unknown as NetworkConnection} />)
    )
    const dashboard = (role: Role) =>
      words(
        renderToStaticMarkup(
          <Dashboard
            state={state}
            network={{
              id: 'guest-network',
              name: 'Guest network',
              role,
              guestBudget: true,
              links: networkLinks(env, 'guest-network')
            }}
            memberId="guest-member"
            setup={{ invited: false, apiKey: false }}
            dismiss={async () => {}}
            createLaunch={async () => ({ id: 'l-1' })}
          />
        )
      )
    expect(roster).toBe('Roster No shows yet. Import shows')
    expect(dashboard('owner')).toContain('CPM $20 per 1,000 downloads Change')
    expect(dashboard('member')).toContain('CPM $20 per 1,000 downloads View')
  })

  it("labels the guest network's sample roster figure by figure, under no notice", async () => {
    fakeQloo({ search: {} })
    env.SAMPLE_NETWORK = 'on'
    const network = 'guest-network'
    const agent = await connect(await openGuest(), network)
    const state = await agent.until((s) => s.roster.length > 0 && settled(s))
    const read = page(state)
    // One sample label a row, beside the show's name, however many of its figures are the sample's. It's
    // hidden from screen readers, as the row's header is read out before each of its cells, so they
    // hear "sample" after each sample figure instead.
    expect(read).toContain(
      "The Watch sample Andy Greenwald and Chris Ryan, longtime friends and pop culture addicts, break down the week's TV, movies, and music. Missed No show by this name in Qloo. Map a comp or leave out 340,000 sample active sample C-06"
    )
    const chip = /<span\b[^>]*\saria-hidden="true"[^>]*>sample<\/span>/g
    const rows = (s: State) =>
      markup(s)
        .match(/<tbody>.*<\/tbody>/s)![0]
        .split('</tr>')
        .slice(0, -1)
    expect(rows(state)).toHaveLength(19)
    for (const row of rows(state)) {
      const [header] = row.match(/<th\b.*<\/th>/s)!
      expect(row.match(/>sample</g)).toHaveLength(1)
      expect(header.match(chip)).toHaveLength(1)
      expect(words(header.replace(chip, ''))).not.toMatch(/sample/i)
    }
    // A figure changed loses its label for screen readers; the row keeps its own while any is the sample's.
    await agent.call('updateShow', 'The Watch', { downloads: 350000 })
    const edited = await agent.until((s) => s.roster.some((show) => show.downloads === 350000))
    const watchRow = rows(edited).find((row) => row.includes('>The Watch<'))!
    expect(watchRow.match(chip)).toHaveLength(1)
    expect(words(watchRow)).toContain('Map a comp or leave out 350,000 active sample C-06')
    // The Show tab says which figures are the sample's.
    const watch = editor(state, 'The Watch')
    expect(watch).toContain('Sample: Andy Greenwald and Chris Ryan, longtime friends and pop culture addicts')
    expect(watch).toContain('Downloads per episode sample Status sample Save')
    // The header: the title, its counts, and the import, in a sheet; then, by the table, whether it's
    // ready to rank. No notice, explanation, or CPM is above the table.
    expect(read).toMatch(
      /^Roster 19 shows · 19 missed Import shows 19 shows aren’t scored until you settle or leave them out\. Qloo data Matches from Qloo search, one call per show\. /
    )
    for (const gone of ['Sample roster', 'Crossfeed isn’t affiliated', 'Start from the sample roster', 'CPM'])
      expect(read).not.toContain(gone)
  })
})
