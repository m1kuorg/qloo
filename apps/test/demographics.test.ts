import { afterEach, describe, expect, it } from 'vitest'
import type { Evidence } from '../src/evidence'
import {
  fakeClaude,
  fakeDemographics,
  fakeInsights,
  fakeQloo,
  modelRequests,
  requests,
  text,
  toolUse,
  turn,
  type Demographic
} from './fake'
import { openSession, type Session } from './session'

// A synthetic network whose launch is one of its own shows. Every ID, name, and value is made up.
const show = (entity_id: string, name: string) => [{ entity_id, name, popularity: 0.7 }]
const search = {
  'Night Shift Cinema': show('e-0001', 'Night Shift Cinema'),
  'The Long Take': show('e-0201', 'The Long Take'),
  'Box Office Brawl': show('e-0202', 'Box Office Brawl'),
  'Small Screen Club': show('e-0203', 'Small Screen Club'),
  'Pilot Season': show('e-0205', 'Pilot Season'),
  'Credits Roll': show('e-0207', 'Credits Roll'),
  'Rerun Radio': show('e-0208', 'Rerun Radio')
}
const roster = Object.keys(search).join('\n')

// Fit order: the top five are finalists, Rerun Radio isn't.
const ranked = [
  { entity_id: 'e-0203', name: 'Small Screen Club', affinity: 0.931 },
  { entity_id: 'e-0201', name: 'The Long Take', affinity: 0.922 },
  { entity_id: 'e-0207', name: 'Credits Roll', affinity: 0.917 },
  { entity_id: 'e-0205', name: 'Pilot Season', affinity: 0.908 },
  { entity_id: 'e-0202', name: 'Box Office Brawl', affinity: 0.896 },
  { entity_id: 'e-0208', name: 'Rerun Radio', affinity: 0.884 }
]
const finalists = ['e-0203', 'e-0201', 'e-0207', 'e-0205', 'e-0202']

const profile = (
  entity_id: string,
  [young, a25, a30, a35, a45, old]: number[],
  male: number,
  female = -male
): Demographic => ({
  entity_id,
  age: {
    '24_and_younger': young,
    '25_to_29': a25,
    '30_to_34': a30,
    '35_to_44': a35,
    '45_to_54': a45,
    '55_and_older': old
  },
  gender: { male, female }
})

// The launch over-indexes most at 25 to 29 and 30 to 34, and skews male.
const demographics = [
  profile('e-0001', [-0.31, 0.417, 0.27, 0.05, -0.18, -0.44], 0.36),
  profile('e-0203', [-0.21, 0.33, 0.12, -0.04, -0.15, -0.37], 0.41), // like the launch
  profile('e-0201', [-0.12, 0.15, -0.07, 0.09, -0.06, -0.23], 0.29), // fewer at 30 to 34
  profile('e-0207', [-0.26, 0.08, 0.02, -0.53, 0.11, -0.09], 0.24), // fewer at 35 to 44 only
  profile('e-0205', [-0.17, 0.21, 0.18, -0.02, -0.11, -0.28], -0.2), // skews female, at 0.2
  profile('e-0202', [-0.19, 0.26, 0.14, 0.03, -0.13, -0.32], -0.19) // skews female, below 0.2
]

const resolveLaunch = toolUse('resolve_entities', { names: ['Night Shift Cinema'], type: 'urn:entity:podcast' })
const rank = (anchor_ids: string[], candidate_ids: string[]) =>
  toolUse('rank_candidates', { anchor_ids, candidate_ids, type: 'urn:entity:podcast' })
const check = (anchor_ids: string[], candidate_ids: string[]) =>
  toolUse('check_demographics', { anchor_ids, candidate_ids })

const open: Session[] = []
const session = async () => {
  const s = await openSession()
  open.push(s)
  return s
}
afterEach(() => open.splice(0).forEach((s) => s.close()))

const finished = (s: Session) => s.until((state) => state.run !== null && state.run.status !== 'running')

// A session with the network imported and a launch run through `script`.
async function launch(script: Parameters<typeof fakeClaude>[0]) {
  fakeQloo({ search })
  fakeClaude(script)
  const s = await session()
  await s.importRoster(roster)
  await s.call('startLaunch', { name: 'Night Shift Cinema' })
  return { s, state: await finished(s) }
}

const flags = (state: Awaited<ReturnType<typeof launch>>['state']) =>
  Object.fromEntries(state.demographics!.rows.map((r) => [r.show, r.reasons]))

const demographicRequests = () =>
  requests.filter((r) => r.url.pathname === '/v2/insights' && JSON.parse(r.body)['filter.type'] === 'urn:demographics')

describe('flagging demographic mismatches among the finalists', () => {
  it("flags a finalist under-indexing on one of the launch's top two age bands, says why, and keeps it a finalist", async () => {
    fakeInsights(ranked)
    fakeDemographics(demographics)
    const { s, state } = await launch([
      turn(resolveLaunch),
      turn(
        rank(
          ['e-0001'],
          ranked.map((r) => r.entity_id)
        )
      ),
      turn(check(['e-0001'], finalists)),
      turn(text('Checked.'))
    ])

    expect(state.run?.notes.at(-1)).toEqual({
      text: 'Checking demographics of 5 finalists against Night Shift Cinema',
      status: 'done'
    })
    expect(state.demographics).toMatchObject({ call: 'C-10', error: null, profile: { ages: ['25_to_29', '30_to_34'] } })
    expect(flags(state)).toMatchObject({
      'Small Screen Club': [],
      'The Long Take': ["Fewer listeners aged 30 to 34 than average, where the launch's listeners over-index"],
      'Credits Roll': []
    })
    // A flag marks a finalist and never removes it.
    expect(state.ranking?.rows.filter((r) => r.finalist).map((r) => r.show)).toEqual([
      'Small Screen Club',
      'The Long Take',
      'Credits Roll',
      'Pilot Season',
      'Box Office Brawl'
    ])

    // One request covers the launch and every finalist.
    expect(demographicRequests()).toHaveLength(1)
    expect(JSON.parse(demographicRequests()[0].body)).toEqual({
      'filter.type': 'urn:demographics',
      'signal.interests.entities': ['e-0001', ...finalists].join(',')
    })

    // The values stay in the evidence: the browser's state never carries them.
    const stateFrames = s.frames().filter((f) => f.includes('cf_agent_state'))
    expect(stateFrames.join('')).not.toContain('0.417')
    const log = await s.call<Evidence[]>('getEvidence')
    const record = log.find((e) => e.call === 'C-10')!
    expect(record.affinities.find((a) => a.id === 'e-0201')).toMatchObject({
      name: 'The Long Take',
      affinity: null,
      explainability: expect.arrayContaining([
        { id: 'age.30_to_34', score: -0.07 },
        { id: 'gender.male', score: 0.29 }
      ])
    })
  })

  it('flags an opposite gender skew when both are 0.2 or more, and not below 0.2', async () => {
    fakeInsights(ranked)
    fakeDemographics(demographics)
    const { state } = await launch([
      turn(resolveLaunch),
      turn(
        rank(
          ['e-0001'],
          ranked.map((r) => r.entity_id)
        )
      ),
      turn(check(['e-0001'], finalists)),
      turn(text('Checked.'))
    ])

    expect(state.demographics?.profile?.skew).toBe('male')
    expect(flags(state)).toMatchObject({
      'Pilot Season': ["Listeners skew female, where the launch's skew male"],
      'Box Office Brawl': []
    })
  })

  it("checks against the comps' mean per age band and gender, and says which finalist Qloo had nothing for", async () => {
    // Three roster shows stand in as comps. Small Screen Club alone over-indexes most at 24 and
    // younger; the comps' mean does at 25 to 29 and 30 to 34, and skews male by only 0.1.
    const comps = ['e-0203', 'e-0201', 'e-0207']
    fakeInsights((body) =>
      [{ entity_id: 'e-0001', name: 'Night Shift Cinema', affinity: 0.941 }, ...ranked].filter((r) =>
        String(body['filter.results.entities']).split(',').includes(r.entity_id)
      )
    )
    fakeDemographics([
      profile('e-0203', [0.6, -0.1, 0.1, -0.3, -0.2, -0.4], 0.5),
      profile('e-0201', [-0.2, 0.3, 0.4, -0.1, 0, -0.3], 0.1),
      profile('e-0207', [-0.1, 0.4, 0.3, 0.2, -0.3, -0.2], -0.3),
      profile('e-0001', [0.5, -0.05, 0.2, 0, 0, 0], -0.4),
      profile('e-0205', [0, 0.1, 0.1, 0, 0, 0], 0.2),
      profile('e-0202', [0, 0.3, 0.2, 0, 0, 0], 0)
      // none for Rerun Radio
    ])
    const { state } = await launch([
      turn(rank(comps, ['e-0001', 'e-0205', 'e-0202', 'e-0208'])),
      turn(check(comps, ['e-0001', 'e-0205', 'e-0202', 'e-0208'])),
      turn(text('Checked.'))
    ])

    expect(state.demographics?.profile).toEqual({
      from: ['Small Screen Club', 'The Long Take', 'Credits Roll'],
      ages: ['25_to_29', '30_to_34'],
      skew: null
    })
    expect(flags(state)).toEqual({
      'Night Shift Cinema': ["Fewer listeners aged 25 to 29 than average, where the launch's listeners over-index"],
      'Pilot Season': [],
      'Box Office Brawl': [],
      'Rerun Radio': null
    })
    const result = JSON.parse(modelRequests()[2].messages.at(-1).content[0].content)
    expect(result.finalists[0]).toEqual({
      show: 'Night Shift Cinema',
      id: 'e-0001',
      mismatch: true,
      reasons: ["Fewer listeners aged 25 to 29 than average, where the launch's listeners over-index"],
      ageDeltas: {
        '24_and_younger': 0.4,
        '25_to_29': -0.25,
        '30_to_34': -0.067,
        '35_to_44': 0.067,
        '45_to_54': 0.167,
        '55_and_older': 0.3
      },
      maleDelta: -0.5
    })
    expect(result.notChecked).toEqual([{ show: 'Rerun Radio', reason: 'Qloo returned no demographics for it' }])
  })

  it('refuses before a ranking and for a non-finalist, and checks every finalist even when the model leaves some out', async () => {
    fakeInsights(ranked)
    fakeDemographics(demographics)
    const { state } = await launch([
      turn(resolveLaunch),
      turn(check(['e-0001'], finalists)),
      turn(
        rank(
          ['e-0001'],
          ranked.map((r) => r.entity_id)
        )
      ),
      turn(check(['e-0001'], ['e-0208'])),
      turn(check(['e-0201'], ['e-0203'])),
      turn(check(['e-0001'], ['e-0203'])),
      turn(text('Checked.'))
    ])

    const result = (n: number) => modelRequests()[n].messages.at(-1).content[0]
    expect(result(2)).toMatchObject({ is_error: true })
    expect(result(2).content).toContain('There is no fit ranking to check yet.')
    expect(result(4)).toMatchObject({ is_error: true })
    expect(result(4).content).toBe(
      "e-0208 isn't a finalist of the fit ranking C-09. Call again with the finalists: Small Screen Club: e-0203, The Long Take: e-0201, Credits Roll: e-0207, Pilot Season: e-0205, Box Office Brawl: e-0202."
    )
    expect(result(5).content).toBe(
      "e-0201 isn't an anchor of the fit ranking C-09. Call again with its anchors: Night Shift Cinema: e-0001."
    )
    expect(result(6).is_error).toBeUndefined()
    expect(JSON.parse(result(6).content).finalists).toHaveLength(5)
    expect(state.demographics?.rows.map((r) => r.show)).toEqual([
      'Small Screen Club',
      'The Long Take',
      'Credits Roll',
      'Pilot Season',
      'Box Office Brawl'
    ])
    expect(demographicRequests()).toHaveLength(1)
    expect(JSON.parse(demographicRequests()[0].body)['signal.interests.entities']).toBe(
      ['e-0001', ...finalists].join(',')
    )
  })

  it("puts Qloo's error in the chart and tells the model not to check again when the call fails", async () => {
    fakeInsights(ranked)
    fakeDemographics(400)
    const { state } = await launch([
      turn(resolveLaunch),
      turn(
        rank(
          ['e-0001'],
          ranked.map((r) => r.entity_id)
        )
      ),
      turn(check(['e-0001'], finalists)),
      turn(text('Not checked.'))
    ])

    expect(state.demographics).toEqual({
      call: 'C-10',
      error: 'Qloo returned 400: fake failure',
      profile: null,
      rows: []
    })
    const result = modelRequests()[3].messages.at(-1).content[0]
    expect(result).toMatchObject({ is_error: true })
    expect(result.content).toBe(
      "The demographic check C-10 failed: Qloo returned 400: fake failure. Don't call check_demographics again in this run. Say the finalists' demographics weren't checked, and why, citing C-10."
    )
    expect(state.ranking?.rows.filter((r) => r.finalist)).toHaveLength(5)
  })

  it('never flags a gender skew when the launch skews below 0.2', async () => {
    fakeInsights(ranked)
    fakeDemographics(
      demographics.map((d) => (d.entity_id === 'e-0001' ? profile('e-0001', [-0.1, 0.2, 0.1, 0, 0, 0], 0.19) : d))
    )
    const { state } = await launch([
      turn(resolveLaunch),
      turn(
        rank(
          ['e-0001'],
          ranked.map((r) => r.entity_id)
        )
      ),
      turn(check(['e-0001'], finalists)),
      turn(text('Checked.'))
    ])

    expect(state.demographics?.profile?.skew).toBeNull()
    expect(flags(state)['Pilot Season']).toEqual([])
  })
})
