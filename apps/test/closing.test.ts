import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import type { RunSnapshot } from '../src/agent'
import type { Session as Agent } from '../src/client/App'
import { LaunchWorkspace } from '../src/client/Launch'
import { fakeClaude, fakeQloo, modelRequests, refusal, requests, text, turn } from './fake'
import { hooked, launchPage, openSession, type Session } from './session'

// A synthetic roster with one show in each state: resolved, mapped to a comp, ambiguous, missed,
// failed, and left out.
const show = (entity_id: string, name: string) => [{ entity_id, name, popularity: 0.8 }]
const search = {
  'Static Hour': show('e-3000', 'Static Hour'),
  'Back Row': show('e-3001', 'Back Row'),
  'Two Mics': [
    { entity_id: 'e-3002', name: 'Two Mics: Live', popularity: 0.71 },
    { entity_id: 'e-3012', name: 'Two Mics: Replay', popularity: 0.64 }
  ],
  'Full Court': show('e-3009', 'Full Court'),
  'Cold Open': show('e-3005', 'Cold Open'),
  'Box Score': 400
}
const roster = ['Static Hour', 'Back Row', 'Two Mics', 'Ghost Signal', 'Half Court', 'Cold Open', 'Box Score']

const open: Session[] = []
afterEach(() => open.splice(0).forEach((s) => s.close()))

describe("the facts a run's closing message rests on", () => {
  it('tells the model every roster show and its state in the run’s first message', async () => {
    fakeQloo({ search })
    fakeClaude([turn(text('Nothing to rank.'))])
    const s = await openSession()
    open.push(s)
    await s.importRoster(roster.join('\n'))
    await s.searchComps('Half Court', 'Full Court')
    await s.call('updateShow', 'Half Court', { compId: 'e-3009' })
    await s.call('updateShow', 'Cold Open', { excluded: true })
    await s.call('startLaunch', { name: 'Static Hour' })
    await s.until((state) => state.run?.status === 'completed')

    const [first] = modelRequests()[0].messages
    expect(first).toEqual({
      role: 'user',
      content: `The launch is a released show named "Static Hour". Plan its promos.

The roster has 7 shows. These can be ranked, as name: Qloo ID:
- Static Hour: e-3000
- Back Row: e-3001
- Half Court (mapped to Full Court): e-3009

These roster shows can't be ranked, and why:
- Two Mics: Ambiguous in Qloo search: pick its match in the roster
- Ghost Signal: Not in Qloo: map a comp or leave it out
- Cold Open: Excluded: never proposed for a launch
- Box Score: Its Qloo lookup failed: Qloo returned 400: fake failure`
    })
    // A left-out show's Qloo ID never reaches the model or Qloo after its lookup.
    expect(JSON.stringify(modelRequests())).not.toContain('e-3005')
    expect(requests.filter((r) => r.url.href.includes('e-3005'))).toEqual([])
  })
})

describe("a run's closing line", () => {
  // A session with a one-show roster, so a run needs no Qloo call before the model ends it.
  async function session() {
    fakeQloo({ search })
    const s = await openSession()
    open.push(s)
    await s.importRoster('Back Row')
    return s
  }
  const ended = (s: Session, id: string) =>
    s.until((state) => state.run?.id === id && !['running', 'waiting'].includes(state.run.status))

  it("keeps the model's closing text on the run, and each earlier run keeps its own", async () => {
    fakeClaude([
      turn(text('Nothing to rank yet: resolve the launch first (C-01).')),
      turn(text('Still nothing to rank.'), text('Import a roster to start.'))
    ])
    const s = await session()
    const first = await s.call<{ runId: string }>('startLaunch', { name: 'Static Hour' })
    await ended(s, first.runId)
    const second = await s.call<{ runId: string }>('startLaunch', { name: 'Static Hour' })
    const state = await ended(s, second.runId)

    expect(state.run).toMatchObject({
      status: 'completed',
      closing: 'Still nothing to rank.\n\nImport a roster to start.'
    })
    const earlier = await s.call<RunSnapshot>('getRun', first.runId)
    expect(earlier.run?.closing).toBe('Nothing to rank yet: resolve the launch first (C-01).')
  })

  it('leaves no closing line on a refused run or a failed one', async () => {
    // The refusal carries text, which is discarded; the second run's model call gets a 400.
    fakeClaude([refusal('cyber', text('I can'))])
    const s = await session()
    const refused = await s.call<{ runId: string }>('startLaunch', { name: 'Static Hour' })
    expect((await ended(s, refused.runId)).run).toMatchObject({ status: 'failed', closing: null })
    const failed = await s.call<{ runId: string }>('startLaunch', { name: 'Static Hour' })
    const state = await ended(s, failed.runId)
    expect(state.run).toMatchObject({ status: 'failed', closing: null })

    // The run log says why under its trace, in the run's own words, where a closing line would be.
    const [log] = hooked(
      renderToStaticMarkup(
        createElement(LaunchWorkspace, { agent: { state, stub: {} } as unknown as Agent, ...launchPage })
      ),
      'data-run-log'
    )
    const [why] = hooked(log, 'data-run-error')
    const said = why
      .replace(/<[^>]+>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&amp;/g, '&')
    expect(said).toBe(`Failed ${state.run!.error}`)
    expect(log.indexOf('data-run-error')).toBeGreaterThan(log.lastIndexOf('data-status='))
    expect(log).not.toContain('data-closing')
  })

  it('keeps the punctuation around a call number against it, on its line, each call its own button', async () => {
    const said = 'Ranked Back Row first (C-23, C-24, C-25 to C-29). Its budget check (C-30 to C-31) failed.'
    fakeClaude([turn(text(said))])
    const s = await session()
    const { runId } = await s.call<{ runId: string }>('startLaunch', { name: 'Static Hour' })
    const state = await ended(s, runId)

    const [closing] = hooked(
      renderToStaticMarkup(
        createElement(LaunchWorkspace, { agent: { state, stub: {} } as unknown as Agent, ...launchPage })
      ),
      'data-closing'
    )
    expect(closing.replace(/<[^>]+>/g, '')).toBe(`Agent${said}`)
    // Each call's button, the opening parenthesis right before it and the punctuation right after it,
    // whether one unbreakable run holds them, and which of its paddings the button narrows to a
    // hairline, so the punctuation sits against the number.
    const calls = [
      ...closing.matchAll(
        /(<span class="whitespace-nowrap">)?(\(?)<button([^>]*)>(C-\d+)<\/button>([,.;:)]*)(<\/span>)?/g
      )
    ].map(([, open, before, attrs, call, after, close]) => ({
      call,
      before,
      after,
      kept: Boolean(open && close),
      hairline: ['pl-px', 'pr-px'].filter((padding) => new RegExp(`class="[^"]*\\b${padding}\\b`).test(attrs))
    }))
    expect(calls).toEqual([
      { call: 'C-23', before: '(', after: ',', kept: true, hairline: ['pl-px', 'pr-px'] },
      { call: 'C-24', before: '', after: ',', kept: true, hairline: ['pr-px'] },
      { call: 'C-25', before: '', after: '', kept: false, hairline: [] },
      { call: 'C-29', before: '', after: ').', kept: true, hairline: ['pr-px'] },
      { call: 'C-30', before: '(', after: '', kept: true, hairline: ['pl-px'] },
      { call: 'C-31', before: '', after: ')', kept: true, hairline: ['pr-px'] }
    ])
  })
})
