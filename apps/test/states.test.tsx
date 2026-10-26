// What the workspace says when it isn't showing a result. Each test drives a session through the
// fakes into a state, then renders the real workspace from the session's synced state and reads
// its words, which every state shows, so none is told by color alone.
import { env } from 'cloudflare:workers'
import { http } from 'msw'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import type { State } from '../src/agent'
import { Workspace, type Session as Agent } from '../src/client/App'
import { InboxWorkspace } from '../src/client/Inbox'
import { fakeClaude, fakeInsights, fakeQloo, network, refusal, text, toolUse, turn } from './fake'
import { links, openSession, type Session } from './session'

// Synthetic shows, one exact match each.
const names = ['Night Shift Cinema', 'Deep Cuts', 'Signal Boost', 'Paper Trail', 'Field Notes']
const search = Object.fromEntries(names.map((name, i) => [name, [{ entity_id: `e-0${i}01`, name, popularity: 0.5 }]]))
const resolveLaunch = toolUse('resolve_entities', { names: ['Night Shift Cinema'], type: 'urn:entity:podcast' })
const rank = (candidate_ids: string[]) =>
  toolUse('rank_candidates', { anchor_ids: ['e-0001'], candidate_ids, type: 'urn:entity:podcast' })

// Holds every search for `query` until the returned promise is resolved, then lets the fake answer.
const hold = (query: string) => {
  const held = Promise.withResolvers<void>()
  network.use(
    http.get(`${env.QLOO_BASE_URL}/search`, async ({ request }) => {
      if (new URL(request.url).searchParams.get('query') === query) await held.promise
    })
  )
  return held
}

const open: Session[] = []
const session = async () => {
  const s = await openSession()
  open.push(s)
  return s
}
afterEach(() => open.splice(0).forEach((s) => s.close()))

// Sets Worker variables for one test, as an operator would on the Worker; restored after it.
type Vars = 'QLOO_SLOW_MS' | 'QLOO_DAILY_CALL_CAP'
const saved = new Map<Vars, string>()
const configure = (vars: Partial<Record<Vars, string>>) => {
  for (const [name, value] of Object.entries(vars) as [Vars, string][]) {
    if (!saved.has(name)) saved.set(name, env[name])
    env[name] = value
  }
}
afterEach(() => {
  for (const [name, value] of saved) env[name] = value
  saved.clear()
})

// The workspace's text as a visitor reads it, from the session's synced state. `connection` is what
// the page knows of its socket besides the state: whether it's identified, and why it closed for good.
const page = (
  state: State | undefined,
  name = 'roster',
  connection: { identified?: boolean; connectionError?: { code: number; reason: string } } = {}
) => {
  const agent = { state, stub: {}, ...connection } as unknown as Agent
  const html = renderToStaticMarkup(
    name === 'inbox' ? <InboxWorkspace agent={agent} links={links} /> : <Workspace agent={agent} links={links} />
  )
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
}

describe('an empty workspace', () => {
  it('says there is no roster, no launch and no run yet, each with its next action', async () => {
    const s = await session()

    const text = page(s.state())
    expect(text).toContain('No roster yet. Paste show names above to import one.')
    expect(text).toContain('No launch yet Import a roster first, then name a released launch to rank it.')
    expect(text).toContain('Not run yet. A run looks the launch up in Qloo and ranks the roster against it.')
  })

  it('asks for the launch once a roster is in', async () => {
    fakeQloo({ search })
    const s = await session()
    await s.importRoster('Night Shift Cinema')

    expect(page(s.state())).toContain('No launch yet Name a released launch below and start a run to rank the roster.')
  })
})

describe("the workspace's connection", () => {
  it('says it is connecting until the first state arrives, and shows nothing it would have to take back', () => {
    const text = page(undefined)
    expect(text).toContain('Working Connecting to your demo session…')
    expect(text).not.toContain('No roster yet')
    expect(text).not.toContain('No launch yet')
  })

  it('says it is reconnecting while the socket is down, keeping what it showed', async () => {
    const s = await session()
    const state = s.state()
    expect(page(state)).not.toContain('Reconnecting…')

    const text = page(state, 'roster', { identified: false })
    expect(text).toContain('Reconnecting…')
    expect(text).toContain('No roster yet. Paste show names above to import one.')
  })

  it('says it lost its connection when the socket closed for good', async () => {
    const s = await session()
    const text = page(s.state(), 'roster', { connectionError: { code: 1008, reason: '' } })
    expect(text).toContain('Error This page lost its connection. Reload to try again.')
    expect(text).not.toContain('Reconnecting…')
  })
})

describe("the inbox's connection", () => {
  it('says it is connecting until the first state arrives, then reconnecting while the socket is down', async () => {
    const connecting = page(undefined, 'inbox')
    expect(connecting).toContain('Working Connecting to the inbox…')
    expect(connecting).not.toContain('No pitches yet')

    const s = await session()
    const state = s.state()
    expect(page(state, 'inbox')).not.toContain('Reconnecting…')
    const text = page(state, 'inbox', { identified: false })
    expect(text).toContain('Reconnecting…')
    expect(text).toContain('No pitches yet. Paste or upload pitches above, or load the sample inbox.')
  })
})

describe('a roster being looked up', () => {
  it('marks each pending show busy, with its call not yet openable, and the import counting', async () => {
    fakeQloo({ search })
    const nightShift = hold('Night Shift Cinema')
    const deepCuts = hold('Deep Cuts')
    const s = await session()

    await s.call('importRoster', 'Night Shift Cinema\nDeep Cuts')
    const pending = s.state()!
    const html = renderToStaticMarkup(
      <Workspace agent={{ state: pending, stub: {} } as unknown as Agent} links={links} />
    )
    const text = page(pending)
    expect(text).toContain('Night Shift Cinema Looking up Looking it up in Qloo… – – C-01')
    expect(text).toContain('Deep Cuts Looking up Looking it up in Qloo… – – C-02')
    expect(text).toContain('Looked up 0 of 2…')
    expect(html.match(/<tr\b[^>]*\saria-busy="true"/g)).toHaveLength(2)
    // A pending call has no record to open yet.
    expect(html).not.toContain('call C-01"')

    nightShift.resolve()
    deepCuts.resolve()
    const settled = await s.until((st) => st.roster.every((show) => show.resolution === 'resolved'))
    expect(page(settled)).toContain('Roster 2 shows: 2 resolved')
    expect(page(settled)).toContain('Import roster')
  })
})

describe('a run in progress', () => {
  it("shows the run's current step from its progress notes", async () => {
    fakeQloo({ search })
    const held = hold('Night Shift Cinema')
    fakeClaude([turn(resolveLaunch), turn(text('Night Shift Cinema is resolved.'))])
    const s = await session()

    await s.call('startLaunch', { name: 'Night Shift Cinema' })
    const running = await s.until((st) => st.run?.notes[0]?.status === 'running')
    expect(page(running)).toContain('Running Resolving Night Shift Cinema · step 1')
    expect(page(running)).toContain('Working The fit chart appears once the agent ranks the roster.')

    held.resolve()
    await s.until((st) => st.run?.status === 'completed')
  })
})

describe('a slow Qloo', () => {
  it('names a call still waiting past the slow mark, and drops it once Qloo answers', async () => {
    configure({ QLOO_SLOW_MS: '50' })
    fakeQloo({ search })
    // Both are held, so which calls are slow never depends on how fast an unheld call answers.
    const nightShift = hold('Night Shift Cinema')
    const deepCuts = hold('Deep Cuts')
    const s = await session()

    await s.call('importRoster', 'Night Shift Cinema\nDeep Cuts')
    const slow = await s.until((st) => st.slowCalls.length === 2)
    expect(slow.slowCalls.toSorted((a, b) => a.call.localeCompare(b.call))).toEqual([
      { call: 'C-01', run: null, waitedMs: 50 },
      { call: 'C-02', run: null, waitedMs: 50 }
    ])
    expect(page(slow)).toContain('Deep Cuts Slow Qloo C-02 has waited over 0.05 s for Qloo. Still trying.')

    deepCuts.resolve()
    const answered = await s.until((st) => st.roster.some((show) => show.resolution === 'resolved'))
    expect(answered.slowCalls).toEqual([{ call: 'C-01', run: null, waitedMs: 50 }])
    expect(page(answered)).not.toContain('C-02 has waited')
    expect(page(answered)).toContain('Night Shift Cinema Slow Qloo C-01 has waited over 0.05 s for Qloo. Still trying.')

    nightShift.resolve()
    const settled = await s.until((st) => st.roster.every((show) => show.resolution === 'resolved'))
    expect(settled.slowCalls).toEqual([])
    expect(page(settled)).not.toContain('Slow Qloo')
  })

  it("doesn't blame Qloo for calls queued behind the session's own, and times each once it's sent", async () => {
    configure({ QLOO_SLOW_MS: '50' })
    fakeQloo({ search })
    const held = Object.fromEntries(names.map((name) => [name, hold(name)]))
    const s = await session()

    // The gateway sends 3 calls at a time, so C-04 and C-05 wait in its queue, not on Qloo.
    await s.call('importRoster', names.join('\n'))
    await s.until((st) => st.slowCalls.length === 3)
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(s.state()?.slowCalls.map((c) => c.call)).toEqual(['C-01', 'C-02', 'C-03'])

    held['Night Shift Cinema'].resolve()
    const next = await s.until((st) => st.slowCalls.some((c) => c.call === 'C-04'))
    expect(next.slowCalls.map((c) => c.call)).toEqual(['C-02', 'C-03', 'C-04'])

    Object.values(held).forEach((h) => h.resolve())
    await s.until((st) => st.roster.every((show) => show.resolution === 'resolved'))
  })

  it("names a run's slow call beside its current step", async () => {
    configure({ QLOO_SLOW_MS: '50' })
    fakeQloo({ search })
    const held = hold('Night Shift Cinema')
    fakeClaude([turn(resolveLaunch), turn(text('Night Shift Cinema is resolved.'))])
    const s = await session()

    const { runId } = await s.call<{ runId: string }>('startLaunch', { name: 'Night Shift Cinema' })
    const slow = await s.until((st) => st.slowCalls.length > 0)
    expect(slow.slowCalls).toEqual([{ call: 'C-01', run: runId, waitedMs: 50 }])
    expect(page(slow)).toContain(
      'Running Resolving Night Shift Cinema · step 1 Slow Qloo C-01 has waited over 0.05 s for Qloo. Still trying. A call Qloo doesn’t answer is retried twice, so it can take about a minute.'
    )

    held.resolve()
    const done = await s.until((st) => st.run?.status === 'completed')
    expect(page(done)).not.toContain('Slow Qloo')
  })
})

describe('a slow Qloo in the inbox', () => {
  afterEach(() => {
    env.GUEST_PITCHES = 'off'
  })

  it("names a pitched work's slow search in the inbox's status", async () => {
    env.GUEST_PITCHES = 'on'
    configure({ QLOO_SLOW_MS: '50' })
    fakeQloo({ search: { 'Night Ferry': [{ entity_id: 'b-0001', name: 'Night Ferry', popularity: 0.8 }] } })
    const held = hold('Night Ferry')
    fakeClaude([
      turn(text(JSON.stringify({ guest: 'Ada Quill', work: { title: 'Night Ferry', type: 'book', year: 2019 } })))
    ])
    const s = await session()

    await s.call('loadInbox', { text: 'Ada Quill, author of the novel Night Ferry, would love to come on.' })
    const slow = await s.until((st) => st.slowCalls.length > 0)
    expect(page(slow, 'inbox')).toContain(
      'Reading · 0 of 1 pitch read Slow Qloo C-01 has waited over 0.05 s for Qloo. Still trying.'
    )

    held.resolve()
    await s.until((st) => st.inbox?.status === 'done')
  })
})

describe('a failing Qloo', () => {
  it('says what was retried and which shows are missing once retries run out', async () => {
    fakeQloo({ search: { ...search, 'Deep Cuts': 503 } })
    const s = await session()
    const state = await s.importRoster('Night Shift Cinema\nDeep Cuts')

    const text = page(state)
    expect(text).toContain(
      "Failed 1 show couldn't be looked up in Qloo, so it can't be scored: Deep Cuts. Import the roster again to retry it; shows already found come from the cache."
    )
    expect(text).toContain('Deep Cuts Lookup failed Qloo returned 503: fake failure, after 2 retries. Not scored.')
  })

  it('says the daily cap is reached, and what it left out', async () => {
    configure({ QLOO_DAILY_CALL_CAP: '1' })
    fakeQloo({ search })
    const s = await session()
    const state = await s.importRoster('Night Shift Cinema\nDeep Cuts')

    const text = page(state)
    expect(text).toContain("Failed 1 show couldn't be looked up in Qloo, so it can't be scored: Deep Cuts.")
    expect(text).toContain(
      'Deep Cuts Lookup failed The daily cap of 1 Qloo calls is reached; it resets at 00:00 UTC. Not scored.'
    )
  })

  it('says a run stopped because Qloo is failing, and what was retried', async () => {
    fakeQloo({ search: { ...search, 'Deep Cuts': 503 } })
    const s = await session()
    await s.importRoster('Night Shift Cinema\nDeep Cuts')

    await s.call('startLaunch', { name: 'Night Shift Cinema' })
    const stopped = await s.until((st) => st.run?.status === 'failed')
    expect(page(stopped)).toContain(
      'Failed Qloo is failing (Qloo returned 503: fake failure, after 2 retries), so runs on your own data wait until Qloo answers again.'
    )
  })

  it("says the launch isn't resolved when its lookup fails", async () => {
    fakeQloo({ search: { ...search, 'Night Shift Cinema': 503 } })
    fakeClaude([turn(resolveLaunch), turn(text('The launch lookup failed.'))])
    const s = await session()

    await s.call('startLaunch', { name: 'Night Shift Cinema' })
    const done = await s.until((st) => st.run?.status === 'completed')
    expect(page(done)).toContain(
      "Failed The launch isn't resolved, so nothing can be ranked: Qloo returned 503: fake failure, after 2 retries."
    )
  })

  it('says nothing is ranked when the ranking fails after its retries, and not that it is partial', async () => {
    // A 400 refuses only that request, so it doesn't mark Qloo as failing and stop the run.
    fakeQloo({ search: { ...search, 'Paper Trail': 400 } })
    fakeInsights(503)
    fakeClaude([turn(resolveLaunch), turn(rank(['e-0101', 'e-0201'])), turn(text('The ranking failed.'))])
    const s = await session()
    await s.importRoster('Night Shift Cinema\nDeep Cuts\nSignal Boost\nPaper Trail')

    await s.call('startLaunch', { name: 'Night Shift Cinema' })
    const done = await s.until((st) => st.run?.status === 'completed')
    expect(page(done)).toContain('Failed Nothing is ranked: Qloo returned 503: fake failure, after 2 retries.')
    expect(page(done)).not.toContain('Partial ranking')
  })

  it('marks a ranking partial when a roster lookup failed', async () => {
    fakeQloo({ search: { ...search, 'Deep Cuts': 400 } })
    fakeInsights([{ entity_id: 'e-0201', name: 'Signal Boost', affinity: 0.913 }])
    fakeClaude([turn(resolveLaunch), turn(rank(['e-0201'])), turn(text('Ranked.'))])
    const s = await session()
    await s.importRoster('Night Shift Cinema\nDeep Cuts\nSignal Boost')

    await s.call('startLaunch', { name: 'Night Shift Cinema' })
    const done = await s.until((st) => st.run?.status === 'completed')
    expect(page(done)).toContain("Failed Partial ranking: Deep Cuts isn't in it, because its Qloo lookup failed.")
  })
})

describe('a missed match', () => {
  it('says Qloo has no show by that name, with the next action', async () => {
    fakeQloo({ search })
    const s = await session()
    const state = await s.importRoster('Night Shift Cinema\nGhost Signal')

    expect(page(state)).toContain('Ghost Signal Missed No show by this name in Qloo. Map a comp or leave out')
  })

  it("says so when the launch isn't in Qloo", async () => {
    fakeQloo({ search })
    fakeClaude([
      turn(toolUse('resolve_entities', { names: ['Ghost Signal'], type: 'urn:entity:podcast' })),
      turn(text('Ghost Signal is not in Qloo.'))
    ])
    const s = await session()

    await s.call('startLaunch', { name: 'Ghost Signal' })
    const done = await s.until((st) => st.run?.status === 'completed')
    expect(page(done)).toContain('Ghost Signal Qloo data Missed No show by this name in Qloo. C-01')
  })
})

describe('an error', () => {
  it('says why a run failed', async () => {
    fakeClaude([refusal('cyber')])
    const s = await session()

    await s.call('startLaunch', { name: 'Night Shift Cinema' })
    const failed = await s.until((st) => st.run?.status === 'failed')
    expect(page(failed)).toContain('Failed Claude declined to continue this run (safety category: cyber).')
  })
})
