// The hourly cron's retry of the wipes noted and not done (#275): each run takes the wipes no run has tried
// first, then those that failed, the least recently tried first, so wipes that fail every time can't fill
// every run and hold back the wipes noted after them. Each test notes wipes in D1, as a deletion or the
// daily clearing does, runs the Worker's scheduled handler at the hourly cron, and reads what each run
// tried from its logs.
import { createExecutionContext, createScheduledController, waitOnExecutionContext } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QlooGateway } from '../src/gateway'
import worker from '../src/index'
import { LaunchAgent } from '../src/launch-agent'
import { NetworkAgent } from '../src/network-agent'
import { counting } from './counting'
import { openMember, type Member } from './session'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const HOUR = 60 * 60_000

// Notes a wipe of each of `names`, under `binding`, `ago` ms before now.
const note = (binding: string, names: string[], ago: number) =>
  env.DB.batch(
    names.map((name) =>
      env.DB.prepare('INSERT INTO wipes (binding, name, created) VALUES (?, ?, ?)').bind(
        binding,
        name,
        Date.now() - ago
      )
    )
  )
// Wipes that fail every time: of a binding nothing wipes.
const NOTHING = 'CrossfeedAgent'
const stuck = (n: number) => Array.from({ length: n }, (_, i) => `stuck-${i}`)

// A write from one of member `who`'s pages, as `send` in the island makes it.
const post = (who: Member, path: string, body: object) =>
  who.fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const NAME = 'Night Shift Audio'
const created = async (who: Member) => (await (await post(who, '/app/new', { name: NAME })).json<{ id: string }>()).id

// Runs the Worker's scheduled handler at the hourly cron in wrangler.jsonc, an hour after the last run, with
// `bindings` in place of the Worker's.
async function runHourlyCron(bindings: Env = env) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(Date.now() + HOUR)
  const ctx = createExecutionContext()
  await (worker as ExportedHandler<Env>).scheduled!(
    createScheduledController({ cron: '0 0-11,13-23 * * *' }),
    bindings,
    ctx
  )
  await waitOnExecutionContext(ctx)
}
const failedRun = (n: number) => `${n} agent ${n === 1 ? 'wipe' : 'wipes'} failed; the next hourly run tries again.`

const lines = (spy: { mock: { calls: unknown[][] } }, event: string) =>
  spy.mock.calls.flat().filter((line) => String(line).startsWith(`{"event":"${event}"`))
const retried = (wiped: number, failed: number) => JSON.stringify({ event: 'wipes_retried', wiped, kept: 0, failed })
// The names of the wipes that failed, in the order a run tried them.
const failedNames = (spy: { mock: { calls: unknown[][] } }) =>
  lines(spy, 'wipe_failed').map((line) => JSON.parse(String(line)).name)

describe('the hourly retry', () => {
  it('tries a wipe noted after seven that fail every time in the next run, and crosses it off', async () => {
    await note(NOTHING, stuck(7), 2 * HOUR)
    await note('LaunchAgent', ['gone-network:launch-1'], HOUR)
    const logged = vi.spyOn(console, 'log')

    await expect(runHourlyCron()).rejects.toThrow(failedRun(7))
    await expect(runHourlyCron()).rejects.toThrow(failedRun(6))
    // Its wipe was crossed off, so the next run tries the seven alone.
    await expect(runHourlyCron()).rejects.toThrow(failedRun(7))
    expect(lines(logged, 'wipes_retried')).toEqual([retried(0, 7), retried(1, 6), retried(0, 7)])
  })

  it('tries each of eight wipes that fail every time within two runs, each staying noted and failing the run', async () => {
    await note(NOTHING, stuck(8), 2 * HOUR)
    const failed = vi.spyOn(console, 'error')

    await expect(runHourlyCron()).rejects.toThrow(failedRun(7))
    expect(failedNames(failed)).toEqual(stuck(7))
    failed.mockClear()
    // The one no run has tried first, then those that failed.
    await expect(runHourlyCron()).rejects.toThrow(failedRun(7))
    expect(failedNames(failed)).toEqual(['stuck-7', ...stuck(6)])
    expect(lines(failed, 'wipe_failed')[0]).toBe(
      JSON.stringify({
        event: 'wipe_failed',
        binding: NOTHING,
        name: 'stuck-7',
        error: `Error: Nothing wipes a ${NOTHING} yet.`
      })
    )
  })

  it('wipes a network’s launches before its own Qloo gateway instance, as their wipes were noted together', async () => {
    const ada = await openMember()
    const id = await created(ada)
    const dashboard = await ada.connect(`/agents/network/${id}`)
    await dashboard.call('createLaunch', { name: 'Night Shift Cinema' })
    dashboard.close()
    // Each of its wipes fails as it's deleted, so the retry tries them all, none of them tried before.
    const wipes = [
      vi.spyOn(LaunchAgent.prototype, 'destroy').mockRejectedValueOnce(new Error('The agent is overloaded.')),
      vi.spyOn(NetworkAgent.prototype, 'destroy').mockRejectedValueOnce(new Error('The agent is overloaded.')),
      vi.spyOn(QlooGateway.prototype, 'wipe').mockRejectedValueOnce(new Error('The gateway is overloaded.'))
    ]
    expect((await post(ada, `/app/${id}/settings/delete`, { name: NAME })).status).toBe(200)
    wipes.forEach((spy) => spy.mockClear())
    const logged = vi.spyOn(console, 'log')

    await runHourlyCron()
    expect(lines(logged, 'wipes_retried')).toEqual([retried(3, 0)])
    // The launch's agent, the network's, then its gateway instance.
    const first = wipes.map((spy) => spy.mock.invocationCallOrder[0])
    expect(first).toEqual([...first].sort((a, b) => a - b))
  })

  it('stays within the Free plan’s 50 subrequests when each of its launch wipes fails as it’s crossed off', async () => {
    const ada = await openMember()
    const id = await created(ada)
    // Launches its network, still in the directory, doesn't list, so each wipe asks the network first: the
    // most subrequests a wipe takes. One more than a run takes, so its batch is full.
    await note(
      'LaunchAgent',
      Array.from({ length: 8 }, (_, i) => `${id}:launch-${i}`),
      2 * HOUR
    )
    // A wipe's crossing off, its last step, fails.
    const prepare = env.DB.prepare.bind(env.DB)
    const overloaded = { bind: () => overloaded, run: () => Promise.reject(new Error('D1 is overloaded.')) }
    vi.spyOn(env.DB, 'prepare').mockImplementation((sql) =>
      sql.startsWith('DELETE FROM wipes') ? (overloaded as unknown as D1PreparedStatement) : prepare(sql)
    )
    const failed = vi.spyOn(console, 'error')

    const { counted, env: bindings } = counting()
    await expect(runHourlyCron(bindings)).rejects.toThrow(failedRun(7))
    expect(counted.subrequests).toBeLessThanOrEqual(50)
    expect(lines(failed, 'wipe_failed').map((line) => JSON.parse(String(line)).error)).toEqual(
      Array(7).fill('Error: D1 is overloaded.')
    )
  })
})
