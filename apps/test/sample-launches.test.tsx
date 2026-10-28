// The guest network's sample launches beside The Watch (ADR 0007, #289): one launch in each of four
// statuses, captured from real runs and loaded into D1, as scripts/capture-sample-launches.ts and
// `wrangler d1 execute` do, then seeded as the guest network starts, with no call to Qloo or Claude. Here
// the runs are made on the guest network against the fakes, captured through the launches' own agents with
// src/sample-launch.ts, loaded with its SQL, and the guest network cleared by the daily cron, as each day.
import { getAgentByName } from 'agents'
import { createExecutionContext, createScheduledController, waitOnExecutionContext } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LaunchSummary, State } from '../src/agent'
import { Dashboard } from '../src/client/Dashboard'
import type { Evidence } from '../src/evidence'
import worker from '../src/index'
import { sampleLaunchOf, sampleLaunchesSql } from '../src/sample-launch'
import { networkLinks } from '../src/shell'
import { fakeClaude, fakeCompare, fakeInsights, fakeQloo, modelRequests, requests, text, toolUse, turn } from './fake'
import { openGuest, readAfterReset, type Guest, type Session } from './session'

// Made-up IDs for three of the sample's public show names, and for the made-up launches; every other
// name finds nothing.
const show = (entity_id: string, name: string) => [{ entity_id, name, popularity: 0.6 }]
const search = {
  'The Watch': show('e-0601', 'The Watch'),
  'The Big Picture': show('e-0301', 'The Big Picture'),
  'The Rewatchables': show('e-0201', 'The Rewatchables'),
  'Night Shift Cinema': show('e-0001', 'Night Shift Cinema'),
  'Paper Moons': show('e-0002', 'Paper Moons'),
  'Slow Burn': show('e-0003', 'Slow Burn')
}
const roster = ['e-0201', 'e-0301', 'e-0601']
// Made-up scores, and a made-up tag each show shares with any launch.
const fakeRanking = () => {
  const fit = [
    { entity_id: 'e-0301', name: 'The Big Picture', affinity: 0.913 },
    { entity_id: 'e-0201', name: 'The Rewatchables', affinity: 0.887 },
    { entity_id: 'e-0601', name: 'The Watch', affinity: 0.861 }
  ]
  fakeInsights((body) => fit.filter((r) => String(body['filter.results.entities']).split(',').includes(r.entity_id)))
  fakeCompare(
    Object.fromEntries(roster.map((id) => [id, [{ tag_id: 'urn:tag:keyword:media:film', name: 'Film', score: 0.61 }]]))
  )
}

// A launch run the way the agent plans one, to its closing, drafting `lines` if it's given any.
const plan = (name: string, anchor: string, closing: string, lines?: object[]) => [
  turn(toolUse('resolve_entities', { names: [name], type: 'urn:entity:podcast' })),
  turn(toolUse('rank_candidates', { anchor_ids: [anchor], candidate_ids: roster, type: 'urn:entity:podcast' })),
  turn(toolUse('ask_human', { question: 'What is the slot budget?', kind: 'budget', options: [] })),
  turn(toolUse('ask_human', { question: 'Leave any shows out?', kind: 'exclusions', options: [] })),
  turn(toolUse('shared_tags', { anchor_ids: [anchor], candidate_ids: roster })),
  ...(lines ? [turn(toolUse('draft_insertion_order', { lines }))] : []),
  turn(text(closing))
]
const lines = [
  { show: 'The Big Picture', slots: 6, angle: 'Film lovers who stay for the long reviews.' },
  { show: 'The Rewatchables', slots: 4, angle: 'Its rewatch crowd shares the film talk.' }
]

const open: Omit<Session, 'cookie'>[] = []
const connect = async (guest: Guest, path: string) => {
  const agent = await guest.connect(path)
  open.push(agent)
  return agent
}
const saved = { SAMPLE_NETWORK: env.SAMPLE_NETWORK, RUN_VISITOR_DAILY_CAP: env.RUN_VISITOR_DAILY_CAP }
beforeEach(() => {
  env.SAMPLE_NETWORK = 'on'
})
afterEach(() => {
  open.splice(0).forEach((agent) => agent.close())
  Object.assign(env, saved)
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const ended = (s: State) => s.run !== null && !['running', 'waiting'].includes(s.run.status)
const settled = (s: State) => s.roster.length > 0 && s.roster.every((r) => r.resolution !== 'pending')

// Runs the Worker's scheduled handler as Cloudflare does at the daily cron in wrangler.jsonc.
async function runCron(cron = '0 12 * * *') {
  const ctx = createExecutionContext()
  await (worker as ExportedHandler<Env>).scheduled!(createScheduledController({ cron }), env, ctx)
  await waitOnExecutionContext(ctx)
}

// The four sample launches, run as a guest on the guest network as it loads the sample: one approved,
// one with its order drafted, one ranked with no order, its budget too small for a slot, and one stopped
// at once by the guest budget's daily model runs. Each is captured through its page's agent as the
// script captures it, and their SQL loaded into D1. Returns each launch's row as the guest network listed
// it then, by key.
async function captureSampleLaunches(guest: Guest) {
  fakeQloo({ search })
  fakeRanking()
  const network = await connect(guest, '/agents/network/guest-network')
  await network.until((s) => settled(s) && s.launches?.length === 1)
  fakeClaude([
    ...plan('Night Shift Cinema', 'e-0001', 'The order is drafted at $86,400.', lines),
    ...plan('Paper Moons', 'e-0002', 'The order is drafted at $86,400.', lines),
    ...plan('Slow Burn', 'e-0003', "A $1,000 budget doesn't buy one slot on any finalist.")
  ])
  const run = async (name: string, budget: object) => {
    const { id } = await network.call<{ id: string }>('createLaunch', { name })
    const launch = await connect(guest, `/agents/launch/guest-network/${id}`)
    await launch.call('startLaunch', { name })
    const asked = await launch.until((s) => s.run?.question?.kind === 'budget')
    await launch.call('answer', asked.run!.question!.id, budget)
    const exclusions = await launch.until((s) => s.run?.question?.kind === 'exclusions')
    await launch.call('answer', exclusions.run!.question!.id, { exclude: [] })
    return { id, launch, state: await launch.until(ended) }
  }
  const approved = await run('Night Shift Cinema', { slots: 10 })
  await approved.launch.call('approveInsertionOrder', approved.state.insertionOrder!.id)
  const drafted = await run('Paper Moons', { slots: 10 })
  const ranked = await run('Slow Burn', { dollars: 1_000 })
  // The guest budget's model runs for the day are used, so the next start stops at once.
  env.RUN_VISITOR_DAILY_CAP = '3'
  const { id } = await network.call<{ id: string }>('createLaunch', { name: 'Ghost Signal' })
  const stopped = { id, launch: await connect(guest, `/agents/launch/guest-network/${id}`) }
  await stopped.launch.call('startLaunch', { name: 'Ghost Signal' })
  await stopped.launch.until(ended)
  env.RUN_VISITOR_DAILY_CAP = saved.RUN_VISITOR_DAILY_CAP

  const launches = { approved, drafted, ranked, stopped }
  const statuses = { approved: 'order approved', drafted: 'order drafted', ranked: 'ranked', stopped: 'stopped' }
  const listed = await network.until((s) =>
    Object.entries(launches).every(([key, { id }]) =>
      s.launches!.some((l) => l.id === id && l.status === statuses[key as keyof typeof statuses])
    )
  )
  const captured = new Date().toISOString()
  const sql = []
  const rows: Record<string, LaunchSummary> = {}
  for (const [key, { id, launch }] of Object.entries(launches)) {
    sql.push({ key, launch: sampleLaunchOf(launch.state()!, await launch.call<Evidence[]>('getEvidence'), captured) })
    rows[key] = listed.launches!.find((l) => l.id === id)!
  }
  await env.DB.exec(sampleLaunchesSql(sql))
  return rows as Record<keyof typeof launches, LaunchSummary>
}

// The guest network as it next starts after the daily cron clears it, once it lists `n` launches.
async function nextDay(guest: Guest, n: number) {
  await runCron()
  await readAfterReset(async () => (await getAgentByName(env.NetworkAgent, 'guest-network')).state)
  const network = await connect(guest, '/agents/network/guest-network')
  return network.until((s) => settled(s) && s.launches?.length === n)
}

const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const dashboardWords = (state: State) =>
  words(
    renderToStaticMarkup(
      <Dashboard
        state={state}
        network={{
          id: 'guest-network',
          name: 'Guest network',
          role: 'owner',
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

describe("the guest network's sample launches", () => {
  it('open beside The Watch after the daily clearing, one in each status, with their figures and a recent last run, calling neither Qloo nor Claude', async () => {
    const guest = await openGuest()
    const captured = await captureSampleLaunches(guest)
    const models = modelRequests().length
    const qloo = requests.length
    // Hours later, within the guest's day-long session.
    vi.useFakeTimers({ toFake: ['Date'] })
    const later = 6 * 60 * 60_000
    vi.setSystemTime(Date.now() + later)

    const fresh = await nextDay(guest, 5)
    const listed = (key: keyof typeof captured) => fresh.launches!.find((l) => l.name === captured[key].name)!
    for (const key of ['approved', 'drafted', 'ranked', 'stopped'] as const) {
      const { id, lastRun, ...row } = listed(key)
      const { id: was, lastRun: then, ...before } = captured[key]
      expect(row, key).toEqual(before)
      expect(id, key).not.toBe(was)
      // Moved on by the hours since its capture, give or take the moments the clearing took.
      expect(Date.parse(lastRun!) - Date.parse(then!), key).toBeGreaterThanOrEqual(later)
      expect(Date.parse(lastRun!) - Date.parse(then!), key).toBeLessThan(later + 60_000)
    }
    expect(fresh.launches!.map((l) => [l.name, l.status, l.finalists, l.slots, l.slotValue, l.startedBy])).toEqual(
      expect.arrayContaining([
        ['Night Shift Cinema', 'order approved', 3, 10, 86_400, 'Guest'],
        ['Paper Moons', 'order drafted', 3, 10, 86_400, 'Guest'],
        ['Slow Burn', 'ranked', 3, null, null, 'Guest'],
        ['Ghost Signal', 'stopped', 0, null, null, 'Guest'],
        ['The Watch', 'new', 0, null, null, null]
      ])
    )
    expect(dashboardWords(fresh)).toMatch(
      /Needs you 2 .+ Ranked 1 Slow Burn .+ Not run yet 1 The Watch .+ Approved 1 Night Shift Cinema /
    )
    // The load called no model, and Qloo for nothing but the cron's health check and the sample roster.
    expect(modelRequests()).toHaveLength(models)
    expect(requests.slice(qloo).map((r) => r.url.pathname)).not.toContain('/v2/insights')
    expect(requests.slice(qloo).map((r) => r.url.pathname)).not.toContain('/v2/analysis/compare')
  })
})
