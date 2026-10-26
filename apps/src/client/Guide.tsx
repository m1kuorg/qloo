import type { GuideMark, State } from '../agent'
import { Alert, listOf } from './controls'

// A first-time visitor's path through the sample launch (PRD story 50), as numbered steps in the
// rail. It never blocks the page: each step's own control advances it, and the visitor can do the
// steps in any order or dismiss it.
export function Guide({
  state,
  dismiss,
  error
}: {
  state: State
  dismiss: () => void
  error: string | null // a mark or the dismissal that failed
}) {
  const { sample, ranking, topic, insertionOrder } = state
  if (!sample || state.guide?.dismissed) return null
  // The session's latest launch run. A guest pitch run after it replaces it as `state.run`, but not
  // its order, so the guide keeps what the launch run did.
  const launchRun = state.runs?.findLast((r) => !r.pitchesFor) ?? null
  const run = launchRun && state.run?.id === launchRun.id ? state.run : null
  const order = launchRun && insertionOrder?.run === launchRun.id ? insertionOrder : null
  const seen = (mark: GuideMark) => state.guide?.seen.includes(mark) ?? false
  const launch = 'name' in sample.launch ? sample.launch.name : 'The sample launch'
  // The highest-placed climber: the moves are in fit order.
  const climber = topic?.status === 'ranked' ? topic.moves.find((m) => m.climber)?.show : undefined
  const { budget, exclusions } = sample.answers
  const steps: { title: string; how: string; done: boolean }[] = [
    {
      title: 'Start the sample launch',
      how: `${launch} is in the launch field. Select Start run.`,
      done: launchRun !== null
    },
    {
      title: 'Find the climber',
      how: climber
        ? `Select ${climber}, marked with the red bullet, for why it moved.`
        : 'When the fit chart and its Last week column fill in, select a show marked with the red bullet for why it moved.',
      done: seen('why')
    },
    {
      title: 'Open its evidence',
      how: `Select ${ranking?.call ?? 'the call number'} in the why-it-moved line: the request sent to Qloo, and the raw scores the chart leaves out.`,
      done: seen('evidence')
    },
    {
      title: 'Answer the agent',
      how: `In the agent's question, give the slot budget, then the shows to leave out, selecting Answer each time. Sample answers: ${budget.slots} promo slots, then ${exclusions.length ? `leave out ${listOf(exclusions)}` : 'leave every show unticked'}.`,
      // The draft tool stores an order only once both are answered.
      done: (run?.budget != null && run.exclusions !== null) || order !== null
    },
    {
      title: 'Approve the insertion order',
      how: 'When the run completes, select Approve on the insertion order draft.',
      done: order?.status === 'approved'
    }
  ]
  // The step after the furthest one done, so a visitor who goes ahead is never sent back.
  const current = steps.findLastIndex((s) => s.done) + 1
  const finished = current === steps.length
  return (
    <section className="mod guide" aria-labelledby="guide-h" data-guide>
      <div className="mh">
        <span className="lbl" id="guide-h">
          Guide
        </span>
        <span className="chips">
          <span className="chip">{finished ? 'Done' : `Step ${current + 1} of ${steps.length}`}</span>
          <button type="button" className="lnk" onClick={dismiss}>
            Dismiss
          </button>
        </span>
      </div>
      <ol className="notes steps">
        {steps.map((s, i) => (
          <li key={s.title} aria-current={i === current ? 'step' : undefined}>
            <span>
              {i + 1}. {s.title}
              {i === current && <span className="help">{s.how}</span>}
            </span>
            <span className="tg">{i < current ? (s.done ? 'Done' : 'Skipped') : ''}</span>
          </li>
        ))}
      </ol>
      {finished && (
        <p className="help">
          That&apos;s the sample launch, from the chart to an approved order. Export CSV downloads it.
        </p>
      )}
      <Alert error={error} />
    </section>
  )
}
