import { afterEach, describe, expect, it } from 'vitest'
import type { State } from '../src/agent'
import { fakeClaude, fakeInsights, fakeQloo, modelRequests, requests, text, toolUse, turn } from './fake'
import { openSession, type Session } from './session'

// A synthetic network and three released comps standing in for an unreleased launch: two resolve,
// and one is the name of two feeds, so it's ambiguous. Qloo has nothing for the launch's own name.
const show = (entity_id: string, name: string) => [{ entity_id, name, popularity: 0.8 }]
const search = {
  'The Long Take': show('e-0201', 'The Long Take'),
  'Box Office Brawl': show('e-0202', 'Box Office Brawl'),
  'Small Screen Club': show('e-0203', 'Small Screen Club'),
  'Matinee Club': show('e-0301', 'Matinee Club'),
  'Reel Talk': show('e-0302', 'Reel Talk'),
  'Frame by Frame': [
    { entity_id: 'e-0303', name: 'Frame by Frame', popularity: 0.71 },
    { entity_id: 'e-0304', name: 'Frame by Frame', popularity: 0.23 }
  ]
}
const roster = ['The Long Take', 'Box Office Brawl', 'Small Screen Club'].join('\n')
const candidates = ['e-0201', 'e-0202', 'e-0203']
const comps = ['Matinee Club', 'Reel Talk', 'Frame by Frame']

// Made-up scores, unlike any other figure here.
const ranked = [
  { entity_id: 'e-0203', name: 'Small Screen Club', affinity: 0.917 },
  { entity_id: 'e-0201', name: 'The Long Take', affinity: 0.893 },
  { entity_id: 'e-0202', name: 'Box Office Brawl', affinity: 0.871 }
]

const resolve = (names: string[]) => toolUse('resolve_entities', { names, type: 'urn:entity:podcast' })
const confirm = toolUse('ask_human', {
  question: 'Are these the shows you meant as comps?',
  kind: 'confirm_comps',
  options: []
})
const rank = (anchor_ids: string[]) =>
  toolUse('rank_candidates', { anchor_ids, candidate_ids: candidates, type: 'urn:entity:podcast' })

const open: Session[] = []
const session = async () => {
  const s = await openSession()
  open.push(s)
  return s
}
afterEach(() => open.splice(0).forEach((s) => s.close()))

const waiting = (s: Session) => s.until((state) => state.run?.status === 'waiting')
const finished = (s: Session) =>
  s.until((state) => state.run !== null && state.run.status !== 'running' && state.run.status !== 'waiting')
const question = (state: State) => state.run!.question!
const anchorsSent = () =>
  requests.filter((r) => r.url.pathname === '/v2/insights').map((r) => JSON.parse(r.body)['signal.interests.entities'])
// The tool result of turn `n`'s only call, as the model got it back.
const resultOf = (n: number) => modelRequests()[n].messages.at(-1).content[0]

async function withRoster(script: Parameters<typeof fakeClaude>[0]) {
  fakeQloo({ search })
  fakeInsights((body) => ranked.filter((r) => String(body['filter.results.entities']).split(',').includes(r.entity_id)))
  fakeClaude(script)
  const s = await session()
  await s.importRoster(roster)
  return s
}

describe('standing comps in for an unreleased launch', () => {
  it('resolves three comps, confirms each through a question, and ranks with all three in one signal', async () => {
    const s = await withRoster([
      turn(resolve(comps)),
      turn(confirm),
      turn(rank(['e-0301', 'e-0302', 'e-0304'])),
      turn(text('Ranked against the three comps.'))
    ])
    await s.call('startLaunch', { comps })
    expect(s.state()?.launch).toEqual({
      name: null,
      match: null,
      comps: comps.map((name) => ({ name, match: null, status: 'unconfirmed', entity: null }))
    })
    expect(s.state()?.runs.at(-1)?.launch).toBeNull()

    const paused = await waiting(s)
    // One question confirms every comp that matched: code offers each comp's match or candidates.
    expect(question(paused)).toMatchObject({ kind: 'confirm_comps', options: comps })
    expect(paused.launch?.comps.map((c) => [c.name, c.match?.resolution, c.match?.evidence])).toEqual([
      ['Matinee Club', 'resolved', 'C-04'],
      ['Reel Talk', 'resolved', 'C-05'],
      ['Frame by Frame', 'ambiguous', 'C-06']
    ])
    expect(paused.launch?.comps[2].match?.candidates.map((c) => c.id)).toEqual(['e-0303', 'e-0304'])
    expect(anchorsSent()).toEqual([])

    await s.call('answer', question(paused).id, { picks: ['e-0301', 'e-0302', 'e-0304'] })
    const state = await finished(s)

    expect(state.run?.status).toBe('completed')
    expect(state.launch?.comps.map((c) => [c.name, c.status, c.entity?.id])).toEqual([
      ['Matinee Club', 'confirmed', 'e-0301'],
      ['Reel Talk', 'confirmed', 'e-0302'],
      ['Frame by Frame', 'confirmed', 'e-0304']
    ])
    expect(anchorsSent()).toEqual(['e-0301,e-0302,e-0304'])
    expect(state.ranking?.anchors).toEqual([
      { id: 'e-0301', name: 'Matinee Club' },
      { id: 'e-0302', name: 'Reel Talk' },
      { id: 'e-0304', name: 'Frame by Frame' }
    ])
    expect(state.ranking?.rows.map((r) => r.show)).toEqual(['Small Screen Club', 'The Long Take', 'Box Office Brawl'])
    expect(state.run?.notes.map((n) => n.text)).toEqual([
      'Resolving Matinee Club, Reel Talk, Frame by Frame',
      'Asking to confirm the comps',
      'Scoring 3 shows against Matinee Club, Reel Talk, Frame by Frame'
    ])

    const [first, , resumed] = modelRequests()
    // The run opens by naming the comps, and the roster's IDs, in its first message.
    expect(first.messages[0].content).toContain('"Matinee Club", "Reel Talk", "Frame by Frame"')
    expect(first.messages[0].content).toContain('The Long Take: e-0201')
    // The programmer's picks reach Claude as their text; code's record of them, with IDs, is the tool result.
    const [notice, answer] = resumed.messages.at(-1).content
    expect(notice.content).toContain(
      'Code confirmed these comps: Matinee Club (Qloo ID e-0301), Reel Talk (Qloo ID e-0302), Frame by Frame (Qloo ID e-0304).'
    )
    expect(answer).toEqual({
      type: 'text',
      text: 'Matinee Club: Matinee Club, popularity 80.0.\nReel Talk: Reel Talk, popularity 80.0.\nFrame by Frame: Frame by Frame, popularity 23.0.'
    })
  })

  it('refuses a fourth comp, and a run with no comps, with a message', async () => {
    fakeQloo({ search })
    fakeClaude([])
    const s = await session()
    await expect(s.call('startLaunch', { comps: [...comps, 'Credits Roll'] })).rejects.toThrow(
      '4 comps is over the limit of 3. Name up to 3 released shows to stand in for the launch.'
    )
    await expect(s.call('startLaunch', { comps: ['  ', ''] })).rejects.toThrow('Name at least one comp to start a run.')
    await expect(s.call('startLaunch', { comps: ['Matinee Club', 'C'.repeat(201)] })).rejects.toThrow(
      'Use comp names of at most 200 characters.'
    )
    await expect(s.call('startLaunch', { comps: 'Matinee Club' })).rejects.toThrow(
      'Name at least one comp to start a run.'
    )
    // The same name twice is one comp.
    await expect(s.call('startLaunch', { comps: [...comps, 'reel talk'] })).resolves.toMatchObject({})
    expect(s.state()?.launch?.comps.map((c) => c.name)).toEqual(comps)
    await s.until((state) => state.run?.status === 'failed')
  })

  it('offers an ambiguous comp its candidates, uses the chosen one, and never ranks on an unconfirmed comp', async () => {
    const s = await withRoster([
      turn(confirm), // before any comp has a match
      turn(resolve(comps)),
      turn(rank(['e-0301'])), // before the programmer confirmed it
      turn(confirm),
      turn(rank(['e-0301', 'e-0302', 'e-0303'])), // Reel Talk was rejected
      turn(rank(['e-0301', 'e-0303'])),
      turn(text('Ranked against two comps.'))
    ])
    await s.call('startLaunch', { comps })
    const paused = await waiting(s)

    expect(resultOf(1)).toMatchObject({ is_error: true })
    expect(resultOf(1).content).toBe(
      'No comp has a Qloo match to confirm yet. Resolve the comps with resolve_entities first.'
    )
    expect(resultOf(3)).toMatchObject({ is_error: true })
    expect(resultOf(3).content).toContain("e-0301 isn't the launch, a comp the programmer confirmed, or a roster show")

    const id = question(paused).id
    await expect(s.call('answer', id, { picks: ['e-0301'] })).rejects.toThrow('Confirm or reject each comp.')
    await expect(s.call('answer', id, { picks: ['e-0301', 'e-0302', 'e-0302'] })).rejects.toThrow(
      "That isn't one of the matches for Frame by Frame."
    )
    await expect(
      s.call('answer', id, { picks: ['e-0301', null, 'e-0303'], text: 'Reel Talk is close.' })
    ).rejects.toThrow('This question is answered with its form, not typed text.')
    expect(s.state()?.run?.status).toBe('waiting')
    await s.call('answer', id, { picks: ['e-0301', null, 'e-0303'] })
    const state = await finished(s)

    expect(state.launch?.comps.map((c) => [c.name, c.status, c.entity?.id ?? null])).toEqual([
      ['Matinee Club', 'confirmed', 'e-0301'],
      ['Reel Talk', 'rejected', null],
      ['Frame by Frame', 'confirmed', 'e-0303']
    ])
    expect(resultOf(5).content).toContain("e-0302 isn't the launch, a comp the programmer confirmed, or a roster show")
    expect(anchorsSent()).toEqual(['e-0301,e-0303'])
    const answer = modelRequests()[4].messages.at(-1).content.at(-1)
    expect(answer.text).toContain('Reel Talk: none of these.')
    expect(state.ranking?.anchors.map((a) => a.name)).toEqual(['Matinee Club', 'Frame by Frame'])
  })

  const askComps = toolUse('ask_human', {
    question: 'Qloo has no show named Untitled Film Show. If it is unreleased, which shows are like it?',
    kind: 'comps',
    options: []
  })

  it('asks for comps when the launch name misses, and ranks on the comps the programmer names', async () => {
    const s = await withRoster([
      turn(resolve(['Untitled Film Show'])),
      turn(askComps),
      turn(resolve(['Matinee Club', 'Reel Talk'])),
      turn(confirm),
      turn(rank(['e-0301', 'e-0302'])),
      turn(text('Ranked against the two comps.'))
    ])
    await s.call('startLaunch', { name: 'Untitled Film Show' })
    const asked = await waiting(s)
    expect(question(asked)).toMatchObject({ kind: 'comps', options: [] })
    expect(asked.launch?.match?.resolution).toBe('missed')

    const id = question(asked).id
    await expect(s.call('answer', id, { comps: [...comps, 'Credits Roll'] })).rejects.toThrow(
      '4 comps is over the limit of 3.'
    )
    await expect(s.call('answer', id, { comps: [] })).rejects.toThrow(
      'Name up to 3 comps, or type the name Qloo lists the launch under.'
    )
    await s.call('answer', id, { comps: ['Matinee Club', ' Reel Talk '] })
    expect(s.state()?.launch).toMatchObject({
      name: 'Untitled Film Show',
      comps: [
        { name: 'Matinee Club', status: 'unconfirmed' },
        { name: 'Reel Talk', status: 'unconfirmed' }
      ]
    })
    const confirming = await waiting(s)
    await s.call('answer', question(confirming).id, { picks: ['e-0301', 'e-0302'] })
    const state = await finished(s)

    expect(state.run?.status).toBe('completed')
    expect(anchorsSent()).toEqual(['e-0301,e-0302'])
    const resumed = modelRequests()[2].messages.at(-1).content
    expect(resumed[0].content).toContain("Code set the launch's comps to Matinee Club, Reel Talk; resolve them")
    expect(resumed.at(-1)).toEqual({ type: 'text', text: 'Comps: Matinee Club, Reel Talk.' })
    // The prompt tells Claude to ask for comps when the launch's name misses.
    expect(JSON.stringify(modelRequests()[0].system)).toMatch(/comes back missed[^"]*kind comps/)
  })

  it('takes a name given in place of comps as the name Qloo lists the launch under', async () => {
    const s = await withRoster([
      turn(resolve(['Untitled Film Show'])),
      turn(askComps),
      turn(resolve(['Matinee Club'])),
      turn(text('The launch is Matinee Club.'))
    ])
    await s.call('startLaunch', { name: 'Untitled Film Show' })
    const asked = await waiting(s)
    await expect(s.call('answer', question(asked).id, { comps: ['Reel Talk'], text: 'Matinee Club' })).rejects.toThrow(
      'Name comps or type the name Qloo lists the launch under, not both.'
    )
    await s.call('answer', question(asked).id, { comps: ['', ' '], text: 'Matinee Club' })
    expect(s.state()?.launch).toEqual({ name: 'Matinee Club', match: null, comps: [] })
    const state = await finished(s)

    expect(state.launch?.match).toMatchObject({ resolution: 'resolved', entity: { id: 'e-0301' } })
    const [notice, answer] = modelRequests()[2].messages.at(-1).content
    expect(notice.content).toContain('Code renamed the launch "Matinee Club"; resolve that name.')
    expect(answer).toEqual({ type: 'text', text: 'Look it up as "Matinee Club".' })
  })
})
