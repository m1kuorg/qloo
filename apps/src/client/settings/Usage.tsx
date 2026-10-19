import type { Usage } from '../../gateway'
import type { NetworkPage } from '../Dashboard'
import { StateLine } from '../states'

// The settings' usage module: what the network has used today against the beta's daily caps, as the
// gateway counts them for the network whichever member or API key spends them, and when they reset.
// Every member sees it, so a refused run is never a surprise. `usage` is read as the page loads.
export function UsageModule({ network, usage }: { network: NetworkPage; usage: Usage }) {
  const rows = [
    {
      name: 'Model runs',
      ...usage.modelRuns,
      reached: 'No more model runs today: launch runs, inbox loads, and pitch runs are refused'
    },
    {
      name: 'Qloo calls',
      ...usage.qlooCalls,
      reached: 'No more Qloo calls today: roster imports and comp searches are refused'
    }
  ]
  return (
    <section className="mod set-mod" aria-labelledby="set-usage-h">
      <div className="set-about">
        <h2 className="lbl" id="set-usage-h">
          Usage <span className="chip">Beta</span>
        </h2>
        <p className="help">
          What {network.name} can use each UTC day, whichever member or API key uses it. Model runs are launch runs,
          inbox loads, and pitch runs; Qloo calls count cached answers too. Crossfeed’s caps across every network apply
          as well.
        </p>
      </div>
      <div className="set-body">
        <dl className="rec kv usage">
          {rows.map((r) => (
            <div className="rec-row" key={r.name}>
              <dt>{r.name}</dt>
              <dd>
                <b>{r.used.toLocaleString('en-US')}</b> of {r.limit.toLocaleString('en-US')} today
              </dd>
            </div>
          ))}
          <div className="rec-row">
            <dt>Resets</dt>
            <dd>
              00:00 UTC, {fromNow(usage.resets)}
              {localTime(usage.resets) && <span className="tg">{localTime(usage.resets)} your time</span>}
            </dd>
          </div>
        </dl>
        {rows
          .filter((r) => r.used >= r.limit)
          .map((r) => (
            <StateLine key={r.name} kind="failed" word="Limit reached">
              {r.reached} until 00:00 UTC.
            </StateLine>
          ))}
      </div>
    </section>
  )
}

// How long until `when`, as "in 9 h 30 min".
function fromNow(when: string) {
  const minutes = Math.max(0, Math.floor((Date.parse(when) - Date.now()) / 60_000))
  const [h, m] = [Math.floor(minutes / 60), minutes % 60]
  if (h === 0) return m === 0 ? 'in under a minute' : `in ${m} min`
  return m === 0 ? `in ${h} h` : `in ${h} h ${m} min`
}

// `when` in the browser's own time, such as "8:00 PM", or null where that's UTC already.
function localTime(when: string) {
  const date = new Date(when)
  if (date.getTimezoneOffset() === 0) return null
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
