import { Button } from '@/components/ui/button'
import type { GuideMark, State } from '../agent'
import { Alert, listOf } from './controls'

// A first-time visitor's path through the sample launch (PRD story 50), as a card in the canvas, so
// it stays in view while the inspector shows evidence: the current step's how-to, then the five
// steps as a numbered list. It never blocks the page: each step's own control advances it, and the
// visitor can do the steps in any order or dismiss it.
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
  const climber = topic?.status === 'ranked' ? topic.moves.find((m) => m.climber) : undefined
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
        ? `Select ${climber.show}, marked ▲${climber.move} in the Move column, for why it moved.`
        : 'When the fit chart and its Topic column fill in, select a climber, marked ▲ in the Move column, for why it moved.',
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
      how: 'When the run completes, select Approve in the plan.',
      done: order?.status === 'approved'
    }
  ]
  // The step after the furthest one done, so a visitor who goes ahead is never sent back.
  const current = steps.findLastIndex((s) => s.done) + 1
  const finished = current === steps.length
  return (
    <section className="flex flex-col gap-3 rounded-xl bg-card p-4 lg:p-5" aria-labelledby="guide-h" data-guide>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold" id="guide-h">
          Try the sample launch{' '}
          {/* On a phone, where the title fills the line, the step count takes a line of its own. */}
          <span className="font-normal whitespace-nowrap text-muted-foreground max-sm:block max-sm:type-caption">
            <span className="max-sm:hidden">· </span>
            {finished ? 'Done' : `Step ${current + 1} of ${steps.length}`}
          </span>
        </h2>
        <Button variant="ghost" size="sm" className="-my-1 -mr-1.5 max-md:h-11" onClick={dismiss}>
          Dismiss
        </Button>
      </div>
      <p className="max-w-[72ch]">
        {finished
          ? 'That’s the sample launch, from the chart to an approved order. Export CSV downloads it.'
          : steps[current].how}
      </p>
      {/* The steps' numbers are the list's own, so a screen reader hears "3 of 5" too. In one row from
          1280px, each column as wide as its step, so a long one doesn't wrap beside short ones. */}
      <ol className="grid list-inside list-decimal gap-x-6 gap-y-1 text-muted-foreground marker:normal-nums sm:grid-cols-2 xl:grid-cols-[repeat(5,auto)] xl:list-outside xl:pl-4">
        {steps.map((s, i) => (
          <li
            key={s.title}
            aria-current={i === current ? 'step' : undefined}
            className="aria-[current]:font-medium aria-[current]:text-foreground"
          >
            {s.title}
            {i < current && <span className="block type-caption">{s.done ? 'Done' : 'Skipped'}</span>}
          </li>
        ))}
      </ol>
      <Alert error={error} />
    </section>
  )
}
