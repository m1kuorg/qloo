import { env } from 'cloudflare:workers'
import { http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import type { Evidence } from '../src/evidence'
import { fakeClaude, fakeQloo, modelRequests, network, refusal, text, toolUse, turn } from './fake'
import { openSession, type Session } from './session'

// Synthetic shows: one exact match and one name shared by two spin-off feeds.
const search = {
  'Night Shift Cinema': [
    { entity_id: 'e-0001', name: 'Night Shift Cinema', popularity: 0.91 },
    { entity_id: 'e-0002', name: 'Night Shift Cinema Club', popularity: 0.4 }
  ],
  'Deep Cuts': [
    { entity_id: 'e-0101', name: 'Deep Cuts: Marvel', popularity: 0.97 },
    { entity_id: 'e-0102', name: 'Deep Cuts: Harry Potter', popularity: 0.62 }
  ]
}

const resolveLaunch = toolUse('resolve_entities', { names: ['Night Shift Cinema'], type: 'urn:entity:podcast' })

const open: Session[] = []
const session = async () => {
  const s = await openSession()
  open.push(s)
  return s
}
afterEach(() => open.splice(0).forEach((s) => s.close()))

const finished = (s: Session) => s.until((state) => state.run !== null && state.run.status !== 'running')

describe('starting a launch run', () => {
  it('returns at once, then shows the resolved launch, its progress note, and a completed run', async () => {
    fakeQloo({ search })
    const firstTurn = Promise.withResolvers<void>()
    fakeClaude([
      async () => {
        await firstTurn.promise
        return turn(resolveLaunch)
      },
      turn(text('Night Shift Cinema is resolved in Qloo.'))
    ])
    const s = await session()

    const { runId } = await s.call<{ runId: string }>('startLaunch', { name: 'Night Shift Cinema' })
    expect(s.state()?.launch).toEqual({ name: 'Night Shift Cinema', match: null })
    expect(s.state()?.run).toEqual({
      id: runId,
      status: 'running',
      notes: [],
      error: null,
      question: null,
      budget: null,
      exclusions: null
    })

    firstTurn.resolve()
    const state = await finished(s)
    expect(state.launch).toEqual({
      name: 'Night Shift Cinema',
      match: {
        resolution: 'resolved',
        entity: { id: 'e-0001', name: 'Night Shift Cinema', popularity: 0.91 },
        candidates: [],
        evidence: 'C-01',
        error: null
      }
    })
    expect(state.run).toEqual({
      id: runId,
      status: 'completed',
      notes: [{ text: 'Resolving Night Shift Cinema', status: 'done' }],
      error: null,
      question: null,
      budget: null,
      exclusions: null
    })
    expect(modelRequests()).toHaveLength(2)
    expect(await s.call<Evidence[]>('getEvidence')).toMatchObject([
      { call: 'C-01', run: runId, endpoint: '/search', params: { query: 'Night Shift Cinema' } }
    ])
  })

  it('runs every tool call in a turn at once and returns all the results in one message', async () => {
    fakeQloo({ search })
    // Neither search is answered until both have arrived, so calls made one after the other hang.
    const arrived = new Set<string>()
    const both = Promise.withResolvers<void>()
    network.use(
      http.get(`${env.QLOO_BASE_URL}/search`, async ({ request }) => {
        arrived.add(new URL(request.url).searchParams.get('query')!)
        if (arrived.size === 2) both.resolve()
        await both.promise // then falls through to fakeQloo
      })
    )
    fakeClaude([
      turn(resolveLaunch, toolUse('resolve_entities', { names: ['Deep Cuts'], type: 'urn:entity:podcast' })),
      turn(text('Resolved both.'))
    ])
    const s = await session()
    await s.call('startLaunch', { name: 'Night Shift Cinema' })

    const state = await finished(s)
    expect(state.run?.status).toBe('completed')
    expect(state.run?.notes).toEqual([
      { text: 'Resolving Night Shift Cinema', status: 'done' },
      { text: 'Resolving Deep Cuts', status: 'done' }
    ])
    const [first, second] = modelRequests()
    expect(second.messages).toHaveLength(first.messages.length + 2)
    const results = second.messages.at(-1)
    expect(results.role).toBe('user')
    expect(results.content.map((b: { type: string; tool_use_id: string }) => [b.type, b.tool_use_id])).toEqual([
      ['tool_result', 'toolu_1_1'],
      ['tool_result', 'toolu_1_2']
    ])
    expect(JSON.parse(results.content[1].content)).toEqual([
      {
        name: 'Deep Cuts',
        resolution: 'ambiguous',
        entity: null,
        candidates: [
          { id: 'e-0101', name: 'Deep Cuts: Marvel', popularity: 0.97 },
          { id: 'e-0102', name: 'Deep Cuts: Harry Potter', popularity: 0.62 }
        ],
        evidence: expect.stringMatching(/^C-0[12]$/),
        error: null
      }
    ])
  })

  it('stops the run as failed, showing the refusal, when Claude declines', async () => {
    fakeQloo({ search })
    fakeClaude([turn(resolveLaunch), refusal('cyber', text('I can'))])
    const s = await session()
    await s.call('startLaunch', { name: 'Night Shift Cinema' })

    const state = await finished(s)
    expect(state.run).toMatchObject({
      status: 'failed',
      notes: [{ text: 'Resolving Night Shift Cinema', status: 'done' }],
      error: 'Claude declined to continue this run (safety category: cyber).'
    })
    expect(modelRequests()).toHaveLength(2)
  })

  it('tells Claude when a tool fails, and what to do next', async () => {
    fakeQloo({ search: { 'Night Shift Cinema': 500 } })
    fakeClaude([
      turn(resolveLaunch, toolUse('rank_everything', {})),
      turn(text('Qloo failed, so the launch is not resolved.'))
    ])
    const s = await session()
    await s.call('startLaunch', { name: 'Night Shift Cinema' })

    const state = await finished(s)
    expect(state.run?.status).toBe('completed')
    expect(state.run?.notes).toEqual([
      { text: 'Resolving Night Shift Cinema', status: 'failed' },
      { text: 'Calling rank_everything', status: 'failed' }
    ])
    expect(state.launch?.match).toMatchObject({ resolution: 'failed', error: 'Qloo returned 500: fake failure' })
    const [failedSearch, unknownTool] = modelRequests()[1].messages.at(-1).content
    expect(failedSearch).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_1_1', is_error: true })
    expect(failedSearch.content).toContain('"Night Shift Cinema" (Qloo returned 500: fake failure)')
    expect(failedSearch.content).toContain('Call resolve_entities again with only the failed names')
    expect(unknownTool).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_1_2', is_error: true })
    expect(unknownTool.content).toMatch(/^There is no tool named rank_everything\. Use one of: .*resolve_entities/)
  })

  it('calls Claude with the model settings, a frozen prompt and tool list, and append-only history', async () => {
    fakeQloo({ search })
    fakeClaude([turn(resolveLaunch), turn(text('Done.'))])
    const s = await session()
    await s.call('startLaunch', { name: 'Night Shift Cinema' })
    await finished(s)

    const [first, second] = modelRequests()
    for (const body of [first, second]) {
      expect(body).toMatchObject({
        model: 'claude-haiku-5-5',
        stream: true,
        max_tokens: 16000,
        output_config: { effort: 'medium' },
        tool_choice: { type: 'auto' },
        cache_control: { type: 'ephemeral' }
      })
      for (const key of ['temperature', 'top_p', 'top_k', 'thinking', 'fallbacks']) expect(body).not.toHaveProperty(key)
      expect(body.system.at(-1).cache_control).toEqual({ type: 'ephemeral' })
      const names = body.tools.map((t: { name: string }) => t.name)
      expect(names).toEqual([...names].sort())
      for (const tool of body.tools)
        expect(tool).toMatchObject({ strict: true, input_schema: { additionalProperties: false } })
    }
    // Byte-identical prefix, free of session data, so the prompt cache holds.
    expect(JSON.stringify(second.system)).toBe(JSON.stringify(first.system))
    expect(JSON.stringify(second.tools)).toBe(JSON.stringify(first.tools))
    expect(JSON.stringify(first.system)).not.toContain('Night Shift Cinema')
    // Earlier turns are resent unchanged, the thinking block included, with no prefill.
    expect(second.messages.slice(0, first.messages.length)).toEqual(first.messages)
    expect(second.messages[1]).toEqual({
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: '', signature: 'sig-1' },
        {
          type: 'tool_use',
          id: 'toolu_1_1',
          name: 'resolve_entities',
          input: { names: ['Night Shift Cinema'], type: 'urn:entity:podcast' }
        }
      ]
    })
    expect(second.messages.at(-1).role).toBe('user')
  })

  it('refuses comps until they are supported, a blank name, and a second run at once', async () => {
    fakeQloo({ search })
    const firstTurn = Promise.withResolvers<void>()
    fakeClaude([
      async () => {
        await firstTurn.promise
        return turn(text('Stopping.'))
      }
    ])
    const s = await session()
    await expect(s.call('startLaunch', { comps: ['Deep Cuts'] })).rejects.toThrow(
      "Starting from comps isn't available yet. Name a released launch."
    )
    await expect(s.call('startLaunch', { name: '  ' })).rejects.toThrow('Name the launch to start a run.')
    expect(s.state()?.run).toBeNull()
    expect(modelRequests()).toEqual([])

    await s.call('startLaunch', { name: 'Night Shift Cinema' })
    await expect(s.call('startLaunch', { name: 'Deep Cuts' })).rejects.toThrow('A run is already in progress.')
    firstTurn.resolve()
    expect((await finished(s)).launch?.name).toBe('Night Shift Cinema')
  })
})
