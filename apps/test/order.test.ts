import { exports } from 'cloudflare:workers'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import type { Reply, State } from '../src/agent'
import { Workspace, type Session as Agent } from '../src/client/App'
import { fakeClaude, fakeCompare, fakeInsights, fakeQloo, modelRequests, text, toolUse, turn } from './fake'
import { links, openSession, type Session } from './session'

// A made-up network: Night Shift is the launch, from the roster, and the others are ranked against it.
// Back Lot has no downloads figure.
const ids: Record<string, string> = {
  'Night Shift': 'e-0500',
  'Corner Booth': 'e-0501',
  'Slow Burn': 'e-0502',
  'Paper Route': 'e-0503',
  'Field Notes': 'e-0504',
  'Back Lot': 'e-0505',
  'Long Haul': 'e-0506',
  'Tin Roof': 'e-0507'
}
const csv = `name,downloads
Night Shift,30000
Corner Booth,48000
Slow Burn,40000
Paper Route,26000
Field Notes,17500
Back Lot,
Long Haul,9000
Tin Roof,12000`
const search = Object.fromEntries(
  Object.entries(ids).map(([name, entity_id]) => [name, [{ entity_id, name, popularity: 0.6 }]])
)
// Made-up scores, in fit order: the first five are the finalists.
const fit = [
  { entity_id: 'e-0501', name: 'Corner Booth', affinity: 0.913 },
  { entity_id: 'e-0502', name: 'Slow Burn', affinity: 0.902 },
  { entity_id: 'e-0503', name: 'Paper Route', affinity: 0.887 },
  { entity_id: 'e-0504', name: 'Field Notes', affinity: 0.871 },
  { entity_id: 'e-0505', name: 'Back Lot', affinity: 0.866 },
  { entity_id: 'e-0506', name: 'Long Haul', affinity: 0.852 },
  { entity_id: 'e-0507', name: 'Tin Roof', affinity: 0.84 }
]

const rank = toolUse('rank_candidates', {
  anchor_ids: ['e-0500'],
  candidate_ids: Object.values(ids).filter((id) => id !== 'e-0500'),
  type: 'urn:entity:podcast'
})
const askBudget = toolUse('ask_human', { question: 'What is the slot budget?', kind: 'budget', options: [] })
const askExclusions = toolUse('ask_human', { question: 'Leave any shows out?', kind: 'exclusions', options: [] })
const draft = (...lines: [show: string, slots: number, angle: string][]) =>
  toolUse('draft_insertion_order', { lines: lines.map(([show, slots, angle]) => ({ show, slots, angle })) })

// A valid draft for a 20-slot budget, spread over four of the five finalists.
const fourShows = draft(
  ['Corner Booth', 8, 'Late-night regulars, like "Night Shift" fans, stay up for the call-ins.'],
  ['Slow Burn', 6, 'Its long interviews share the slow, conversational pace.'],
  ['Paper Route', 4, 'Morning commuters who already follow the same hosts.'],
  ['Field Notes', 2, 'Shares the field-recording style.']
)

type Script = Parameters<typeof fakeClaude>[0]

const open: Session[] = []
afterEach(() => open.splice(0).forEach((s) => s.close()))

const finished = (s: Session) =>
  s.until((state) => state.run !== null && state.run.status !== 'running' && state.run.status !== 'waiting')

// Starts the launch the way the agent would run it: rank the roster, ask for the budget, answer it
// with `budget`, ask for exclusions, answer none, then play `turns`, which draft the order, and end.
async function start(budget: Reply, turns: Script, cpm: number | null = 25) {
  const s = await begin([turn(rank), turn(askBudget), turn(askExclusions), ...turns], cpm)
  await s.call('answer', 'toolu_2_1', budget)
  await s.until((state) => state.run?.question?.kind === 'exclusions')
  await s.call('answer', 'toolu_3_1', { exclude: [] })
  return s
}

// A session on the made-up network whose launch run plays `turns` and ends, paused on its first question.
async function begin(turns: Script, cpm: number | null) {
  fakeQloo({ search })
  fakeInsights(fit)
  fakeClaude([...turns, turn(text('Drafted the insertion order.'))])
  const s = await openSession()
  open.push(s)
  await s.importRoster(csv, 'csv')
  if (cpm !== null) await s.call('setCpm', cpm)
  await s.call('startLaunch', { name: 'Night Shift' })
  await s.until((state) => state.run?.status === 'waiting')
  return s
}

// The same, through to the end of the run.
async function plan(budget: Reply, turns: Script, cpm: number | null = 25) {
  const s = await start(budget, turns, cpm)
  return { s, state: await finished(s) }
}

// The insertion order in every state frame the session received, in order.
const orders = (s: Session) =>
  s
    .frames()
    .map((f) => JSON.parse(f))
    .filter((f) => f.type === 'cf_agent_state')
    .map((f) => (f.state as State).insertionOrder)

// The export route, as a browser with this session's cookie fetches it, or with none.
const fetch_ = (id: string, init?: RequestInit) =>
  exports.default.fetch(`https://crossfeed.test/api/insertion-orders/${id}.csv`, init)
const exportCsv = (id: string, cookie: string) => fetch_(id, { headers: { Cookie: cookie } })
// The body as sent, byte-order mark included: Response.text() would drop it.
const body = async (res: Response) => new TextDecoder('utf-8', { ignoreBOM: true }).decode(await res.arrayBuffer())

// What the model got back for a tool call, from the request after it.
const resultFor = (id: string) =>
  modelRequests()
    .flatMap((r) => r.messages.at(-1).content)
    .find((b: { tool_use_id?: string }) => b.tool_use_id === id)

describe('the insertion order', () => {
  it("prices a valid draft from the roster's downloads and the network's CPM", async () => {
    const { state } = await plan({ slots: 20 }, [turn(fourShows)])

    expect(state.run?.status).toBe('completed')
    // 48,000 downloads at a $25 CPM is $1,200 a slot; 17,500 is $437.50, rounded to $438.
    expect(state.insertionOrder).toMatchObject({
      id: 'IO-0001',
      status: 'draft',
      cpm: 25,
      lines: [
        { show: 'Corner Booth', slots: 8, slotValue: 1200, value: 9600, gap: null },
        { show: 'Slow Burn', slots: 6, slotValue: 1000, value: 6000, gap: null },
        { show: 'Paper Route', slots: 4, slotValue: 650, value: 2600, gap: null },
        { show: 'Field Notes', slots: 2, slotValue: 438, value: 876, gap: null }
      ],
      slots: 20,
      total: 19076,
      complete: true
    })
    expect(state.insertionOrder?.lines[0].angle).toBe(
      'Late-night regulars, like "Night Shift" fans, stay up for the call-ins.'
    )
    expect(state.run?.notes.at(-1)).toEqual({ text: 'Drafting the insertion order: 4 shows, 20 slots', status: 'done' })
    expect(JSON.parse(resultFor('toolu_4_1').content)).toMatchObject({
      order: 'IO-0001',
      slots: 20,
      total: 19076,
      // The closing turn comes next, so its limits are repeated where the model reads them last.
      next: "Stored as a draft. The programmer edits and approves it in the UI. Now end the run in under 60 words and at most three short sentences: say the order is drafted at $19,076 and cite the ranking call, then, only if a show wasn't ranked or checked, say which and why. Name no finalist, not even a flagged one, and don't mention demographic flags, tags, slots, or angles: the chart and the order show them. Never write a tool's name."
    })
  })

  it("drops a show's line from the draft when a later exclusions answer leaves it out, and prices the rest again", async () => {
    const s = await start({ slots: 20 }, [turn(fourShows), turn(askExclusions)])
    await s.until((state) => state.run?.question?.id === 'toolu_5_1')
    await s.call('answer', 'toolu_5_1', { exclude: ['Slow Burn'] })
    const state = await finished(s)

    expect(state.insertionOrder).toMatchObject({
      status: 'draft',
      lines: [
        { show: 'Corner Booth', slots: 8, value: 9600 },
        { show: 'Paper Route', slots: 4, value: 2600 },
        { show: 'Field Notes', slots: 2, value: 876 }
      ],
      slots: 14,
      total: 13076
    })
    expect(resultFor('toolu_5_1').content).toContain(
      "Code dropped Slow Burn's line from the draft insertion order IO-0001, now 14 slots for $13,076."
    )
  })

  it('refuses a draft until the exclusions are answered, storing nothing', async () => {
    const s = await begin([turn(rank), turn(askBudget), turn(fourShows)], 25)
    await s.call('answer', 'toolu_2_1', { slots: 20 })
    const state = await finished(s)

    expect(state.run?.status).toBe('completed')
    expect(orders(s).every((order) => order === null)).toBe(true)
    expect(resultFor('toolu_3_1')).toEqual({
      type: 'tool_result',
      tool_use_id: 'toolu_3_1',
      is_error: true,
      content:
        "The programmer hasn't said which shows to leave out of this run yet. Ask for them with ask_human (kind exclusions), then draft the order."
    })
  })

  it('rejects a draft over the count budget, storing nothing, and takes the corrected one', async () => {
    const { s, state } = await plan({ slots: 18 }, [
      turn(fourShows),
      turn(
        draft(
          ['Corner Booth', 8, 'Late-night regulars.'],
          ['Slow Burn', 6, 'Long interviews.'],
          ['Paper Route', 4, 'Commuters.']
        )
      )
    ])

    expect(resultFor('toolu_4_1')).toEqual({
      type: 'tool_result',
      tool_use_id: 'toolu_4_1',
      is_error: true,
      content:
        'This draft uses 20 slots, over the budget of 18. Nothing was stored. Cut at least 2 slots and call draft_insertion_order again.'
    })
    // Every order the browser ever received is the corrected one.
    expect(new Set(orders(s).map((o) => o?.slots ?? null))).toEqual(new Set([null, 18]))
    expect(state.insertionOrder).toMatchObject({ slots: 18, total: 18200, lines: [{ show: 'Corner Booth' }, {}, {}] })
  })

  it('rejects a draft over the dollar budget with each slot value, so the model can rebalance', async () => {
    const { state } = await plan({ dollars: 15000 }, [turn(fourShows)])

    expect(resultFor('toolu_4_1')).toMatchObject({
      is_error: true,
      content:
        'This draft costs $19,076, over the budget of $15,000. Nothing was stored. Slot values: Corner Booth $1,200, Slow Burn $1,000, Paper Route $650, Field Notes $438. Cut at least $4,076 and call draft_insertion_order again.'
    })
    expect(state.insertionOrder).toBeNull()
  })

  it("rejects a line for a show that isn't a finalist", async () => {
    // Long Haul ranks sixth, so it isn't a finalist.
    const { state } = await plan({ slots: 20 }, [
      turn(draft(['Corner Booth', 10, 'Regulars.'], ['Long Haul', 4, 'Drivers.']))
    ])

    expect(resultFor('toolu_4_1')).toMatchObject({
      is_error: true,
      content:
        '"Long Haul" isn\'t one of this run\'s finalists, which are Corner Booth, Slow Burn, Paper Route, Field Notes, Back Lot. Nothing was stored. Fix the lines and call draft_insertion_order again.'
    })
    expect(state.insertionOrder).toBeNull()
  })

  it('gives the model no tool to approve, edit, or export an order', async () => {
    await plan({ slots: 20 }, [turn(fourShows)])

    const names = modelRequests()[0].tools.map((t: { name: string }) => t.name)
    expect(names).toContain('draft_insertion_order')
    expect(names.filter((n: string) => /approv|edit|export|csv/i.test(n))).toEqual([])
  })

  it('cites, beside each angle, the compare call its shared tags came from', async () => {
    // Made-up tags, one per finalist, with scores unlike any other figure here.
    const finalists = fit.slice(0, 5).map((f) => f.entity_id)
    fakeCompare(
      Object.fromEntries(
        finalists.map((id, i) => [
          id,
          [{ tag_id: 'urn:tag:keyword:media:night_owls', name: 'Night Owls', score: 0.6131 + i / 1000 }]
        ])
      )
    )
    const { state } = await plan({ slots: 20 }, [
      turn(toolUse('shared_tags', { anchor_ids: ['e-0500'], candidate_ids: finalists })),
      turn(fourShows)
    ])

    // The rail as the browser renders it: each line's row cites the call behind its show's tags.
    const html = renderToStaticMarkup(
      createElement(Workspace, { page: 'roster', agent: { state, stub: {} } as unknown as Agent, links })
    )
    const rows = html.match(/<section class="mod io-mod"[\s\S]*?<\/section>/)![0].split('<tr')
    const cited = state.insertionOrder!.lines.map((line) => {
      const row = rows.find((r) => r.includes(`<div class="nm">${line.show}</div>`))
      return row?.match(/<button[^>]*class="call"[^>]*>(C-\d+)<\/button>/)?.[1]
    })
    expect(cited).toEqual(
      state.insertionOrder!.lines.map((line) => state.ranking!.rows.find((r) => r.show === line.show)!.sharedTags!.call)
    )
    expect(new Set(cited).size).toBe(4)
  })

  it('shows the gap for a show without downloads, and an incomplete total, never a made-up figure', async () => {
    const { state } = await plan({ slots: 20 }, [
      turn(draft(['Corner Booth', 12, 'Late-night regulars.'], ['Back Lot', 8, 'Studio-lot gossip.']))
    ])

    expect(state.insertionOrder).toMatchObject({
      lines: [
        { show: 'Corner Booth', slotValue: 1200, value: 14400, gap: null },
        { show: 'Back Lot', slotValue: null, value: null, gap: 'No downloads per episode' }
      ],
      slots: 20,
      total: 14400,
      complete: false
    })
    expect(JSON.parse(resultFor('toolu_4_1').content)).toMatchObject({
      complete: false,
      next: "Stored as a draft with an incomplete total, because Back Lot: No downloads per episode. They edit and approve the order in the UI. Now end the run in under 60 words and at most three short sentences: say the order is drafted at $14,400 so far and which figures the programmer must add, naming only the shows that lack one, and cite the ranking call. Name no other finalist, not even a flagged one, and don't mention demographic flags, tags, slots, or angles: the chart and the order show them. Never write a tool's name."
    })
  })

  it('leaves every line without a value while the network has no CPM', async () => {
    const { state } = await plan({ slots: 20 }, [turn(fourShows)], null)

    expect(state.insertionOrder).toMatchObject({ cpm: null, total: 0, complete: false })
    expect(state.insertionOrder?.lines.map((l) => [l.value, l.gap])).toEqual(Array(4).fill([null, 'No network CPM']))
  })

  it('recomputes the total as the programmer edits, approves it, and returns an approved order to draft on edit', async () => {
    const { s } = await plan({ slots: 20 }, [turn(fourShows)])
    const lines = s.state()!.insertionOrder!.lines.map(({ show, slots, angle }) => ({ show, slots, angle }))

    // Two more slots on Corner Booth, Field Notes dropped, and Slow Burn's angle reworded.
    await s.call('editInsertionOrder', 'IO-0001', [
      { ...lines[0], slots: 10 },
      { ...lines[1], angle: '  Its long interviews run at the same pace.  ' },
      lines[2]
    ])
    expect(s.state()?.insertionOrder).toMatchObject({
      status: 'draft',
      lines: [
        { show: 'Corner Booth', slots: 10, value: 12000 },
        { show: 'Slow Burn', angle: 'Its long interviews run at the same pace.', value: 6000 },
        { show: 'Paper Route', value: 2600 }
      ],
      slots: 20,
      total: 20600
    })

    await s.call('approveInsertionOrder', 'IO-0001')
    expect(s.state()?.insertionOrder?.status).toBe('approved')

    // The plan is the programmer's: an edit past the run's budget is theirs to make.
    await s.call('editInsertionOrder', 'IO-0001', [{ ...lines[0], slots: 22 }])
    expect(s.state()?.insertionOrder).toMatchObject({ status: 'draft', slots: 22, total: 26400 })
  })

  it('refuses an edit that breaks a line, an edit or approval of an order that is gone, and changes nothing', async () => {
    const { s } = await plan({ slots: 20 }, [turn(fourShows)])
    const before = s.state()!.insertionOrder
    const line = { show: 'Corner Booth', slots: 8, angle: 'Regulars.' }

    for (const [lines, error] of [
      [[], 'The order has no lines.'],
      ['Corner Booth', 'The order has no lines.'],
      [[{ ...line, slots: 0 }], 'Corner Booth needs a whole number of slots, 1 or more.'],
      [[{ ...line, slots: 1.5 }], 'Corner Booth needs a whole number of slots, 1 or more.'],
      [[{ ...line, angle: ' ' }], 'Corner Booth needs a host-read angle.'],
      [[line, line], 'Corner Booth has more than one line; give each show one line.'],
      [[{ ...line, show: 'Tin Roof' }], '"Tin Roof" isn\'t one of this run\'s finalists']
    ] as const)
      await expect(s.call('editInsertionOrder', 'IO-0001', lines), JSON.stringify(lines)).rejects.toThrow(error)
    await expect(s.call('approveInsertionOrder', 'IO-0009')).rejects.toThrow(
      "IO-0009 isn't the current insertion order."
    )
    expect(s.state()?.insertionOrder).toEqual(before)
  })

  it('keeps the order read-only while the agent is still working on its run', async () => {
    const summary = Promise.withResolvers<void>()
    const s = await start({ slots: 20 }, [
      turn(fourShows),
      async () => {
        await summary.promise
        return turn(text('Drafted it.'))
      }
    ])
    await s.until((state) => state.insertionOrder !== null)

    const working = 'The agent is still working on this run. Edit or approve the order once the run has ended.'
    await expect(s.call('approveInsertionOrder', 'IO-0001')).rejects.toThrow(working)
    await expect(
      s.call('editInsertionOrder', 'IO-0001', [{ show: 'Corner Booth', slots: 1, angle: 'x' }])
    ).rejects.toThrow(working)
    summary.resolve()
    await finished(s)
    await s.call('approveInsertionOrder', 'IO-0001')
    expect(s.state()?.insertionOrder?.status).toBe('approved')
  })

  it('exports an approved order as CSV for this session only, and refuses a draft with 409', async () => {
    const { s } = await plan({ slots: 20 }, [turn(fourShows)])

    const draft = await exportCsv('IO-0001', s.cookie)
    expect(draft.status).toBe(409)
    expect(await draft.text()).toBe('IO-0001 is a draft. Approve it before exporting.')

    await s.call('approveInsertionOrder', 'IO-0001')
    const res = await exportCsv('IO-0001', s.cookie)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="IO-0001.csv"')
    // A byte-order mark first, so a spreadsheet reads it as UTF-8; money in whole dollars.
    expect(await body(res)).toBe(
      '\uFEFFShow,Slots,Angle,Slot value (USD),Line value (USD)\r\n' +
        'Corner Booth,8,"Late-night regulars, like ""Night Shift"" fans, stay up for the call-ins.",1200,9600\r\n' +
        'Slow Burn,6,"Its long interviews share the slow, conversational pace.",1000,6000\r\n' +
        'Paper Route,4,Morning commuters who already follow the same hosts.,650,2600\r\n' +
        'Field Notes,2,Shares the field-recording style.,438,876\r\n' +
        'Total,20,,,19076\r\n'
    )

    expect((await exportCsv('IO-0002', s.cookie)).status).toBe(404)
    const stranger = await openSession()
    open.push(stranger)
    expect((await exportCsv('IO-0001', stranger.cookie)).status).toBe(404)
    expect((await fetch_('IO-0001')).status).toBe(401)
  })

  it('exports an incomplete total as incomplete, and never as a formula', async () => {
    const { s } = await plan({ slots: 20 }, [
      turn(draft(['Corner Booth', 12, 'Late-night regulars.'], ['Back Lot', 8, 'Studio-lot gossip.']))
    ])
    await s.call('editInsertionOrder', 'IO-0001', [
      { show: 'Corner Booth', slots: 12, angle: '=HYPERLINK("https://example.com/","Open")' },
      { show: 'Back Lot', slots: 8, angle: '+1 for the studio crowd' }
    ])
    await s.call('approveInsertionOrder', 'IO-0001')

    expect(await body(await exportCsv('IO-0001', s.cookie))).toBe(
      '\uFEFFShow,Slots,Angle,Slot value (USD),Line value (USD)\r\n' +
        `Corner Booth,12,"'=HYPERLINK(""https://example.com/"",""Open"")",1200,14400\r\n` +
        "Back Lot,8,'+1 for the studio crowd,,\r\n" +
        'Total,20,Incomplete: no value for Back Lot (No downloads per episode),,14400\r\n'
    )
  })

  it("keeps an earlier run's order as the programmer left it, to view and export after a re-run", async () => {
    const { s } = await plan({ slots: 20 }, [turn(fourShows)])
    await s.call('approveInsertionOrder', 'IO-0001')
    const first = s.state()!.run!.id

    fakeClaude([turn(text('Nothing to plan this time.'))])
    await s.call('startLaunch', { name: 'Night Shift' })
    expect(s.state()?.insertionOrder).toBeNull()
    await finished(s)

    expect((await s.call<State>('getRun', first)).insertionOrder).toMatchObject({ id: 'IO-0001', status: 'approved' })
    expect((await exportCsv('IO-0001', s.cookie)).status).toBe(200)
  })

  it('prices the order again when the programmer fills a gap or changes the CPM, returning an approved order to draft', async () => {
    const { s } = await plan({ slots: 20 }, [
      turn(draft(['Corner Booth', 12, 'Late-night regulars.'], ['Back Lot', 8, 'Studio-lot gossip.']))
    ])
    await s.call('approveInsertionOrder', 'IO-0001')

    // Figures the order doesn't use change nothing, and neither does the same CPM again.
    await s.call('updateShow', 'Back Lot', { status: 'hiatus' })
    await s.call('setCpm', 25)
    expect(s.state()?.insertionOrder).toMatchObject({ status: 'approved', total: 14400, complete: false })

    await s.call('updateShow', 'Back Lot', { downloads: 20000 })
    expect(s.state()?.insertionOrder).toMatchObject({
      status: 'draft',
      lines: [{ value: 14400 }, { show: 'Back Lot', slotValue: 500, value: 4000, gap: null }],
      total: 18400,
      complete: true
    })

    await s.call('approveInsertionOrder', 'IO-0001')
    await s.call('setCpm', 30)
    expect(s.state()?.insertionOrder).toMatchObject({ status: 'draft', cpm: 30, total: 22080 })
  })
})
