import { cn } from 'cn'
import { CheckIcon, SquareXIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { RadioGroup, RadioGroupItem, RadioGroupSegment } from '@/components/ui/radio-group'
import { Spinner } from '@/components/ui/spinner'
import { segmentedItemVariants, segmentedTrackVariants } from '@/components/ui/variants'
import type { Budget, Launch, Question, Reply, Run, RunSummary } from '../agent'
import { finalistsOf, markFinalists, type Ranking } from '../fit'
import { MAX_COMPS } from '../limits'
import { MAX_ANSWER, MAX_TITLE } from '../text'
import { offeredBy } from '../resolve'
import { takesText } from '../tools/ask-human'
import type { Session } from './App'
import { Alert, FitBand, KeyValue, KeyValues, listOf, percentile, useAction, utcDay } from './controls'
import { CallButton, type OpenCall } from './Evidence'
import { Section } from './PageHeader'
import { Source } from './Source'
import { endedBadly, isLive, StateLine } from './states'

// A run as the workspace and the inbox both show it: its status words, its log with its progress notes
// and Claude's closing line, and the agent's open question.

export const runLabel: Record<Run['status'], string> = {
  running: 'Running',
  waiting: 'Waiting on you',
  completed: 'Completed',
  stopped: 'Stopped at a limit',
  failed: 'Failed'
}

// Claude's closing line on a completed run, as an Agent block below the trace. Each call number it
// cites opens that call's evidence. An opening parenthesis right before a call and punctuation right
// after it sit against its number and wrap with it: the button drops its padding on that side, so the
// punctuation stays outside its fill.
function ClosingLine({ text, openCall, opened }: { text: string; openCall: OpenCall; opened: string | null }) {
  return (
    <div className="flex flex-col items-start gap-1.5 rounded-lg bg-muted p-3" data-closing>
      <Source of="agent" />
      <p className="whitespace-pre-line">
        {/* Text, the parenthesis before a call (often none), the call, then the punctuation after it
            (often none), in turn. */}
        {text.split(/(\(?)\b(C-\d+)\b([,.;:)]*)/).map((part, i, parts) => {
          if (i % 4 === 0) return part
          if (i % 4 !== 2) return null
          const [before, after] = [parts[i - 1], parts[i + 1]]
          const call = (
            <CallButton
              key={i}
              call={part}
              label="Evidence Claude cites"
              opened={opened}
              openCall={openCall}
              className={cn(before && 'pl-0', after && 'pr-0')}
            />
          )
          return before || after ? (
            <span key={i} className="whitespace-nowrap">
              {before}
              {call}
              {after}
            </span>
          ) : (
            call
          )
        })}
      </p>
    </div>
  )
}

const noteLabel: Record<Run['notes'][number]['status'], string> = { running: 'Running', done: 'Done', failed: 'Failed' }

// A note's state as a glyph before its text, set in its line: the small spinner while it runs, a check
// once done, the square ✕ of a failure. Its word says it too, so the glyph is hidden from screen readers.
const glyph = 'mt-0.5 size-4 shrink-0'
const noteGlyph: Record<Run['notes'][number]['status'], React.ReactNode> = {
  running: <Spinner className={cn(glyph, 'text-muted-foreground')} />,
  done: <CheckIcon aria-hidden="true" className={cn(glyph, 'text-muted-foreground')} />,
  failed: <SquareXIcon aria-hidden="true" className={cn(glyph, 'text-destructive')} />
}

// Code's note under a closing line once what the line describes has changed since: a launch run's
// insertion order (#202), or a pitch run's replies (#213).
export const ORDER_CHANGED =
  'The insertion order has changed since Claude drafted it: its lines and total are the current figures.'
export const REPLIES_CHANGED =
  'The replies have changed since Claude drafted them: each reply as listed is the current one.'

// The run's trace: one row per tool call, its note as code wrote it with its state, then why the run
// stopped if it failed or hit a limit. Claude's closing line follows as Claude wrote it; once what it
// describes has changed since, code says so under it (`changedNote`), since the line may quote figures
// or counts that no longer hold. Last, what the programmer answered: the slot budget and the shows
// left out.
export function RunLog({
  run,
  changedNote = null,
  openCall,
  opened
}: {
  run: Run
  changedNote?: string | null
  openCall: OpenCall
  opened: string | null
}) {
  const live = isLive(run.status)
  return (
    <Section
      id="run-log"
      title="Run log"
      badge={
        <>
          {run.replayed && <Badge variant="outline">Replayed</Badge>}
          <Badge mark={live ? 'signal' : 'none'}>{runLabel[run.status]}</Badge>
        </>
      }
      description={
        // One of the sample launches' runs says the day it was captured (ADR 0007).
        run.capturedAt
          ? `Each step the run took when it was captured from the sample data on ${utcDay(run.capturedAt)}, and how it ended.`
          : 'Each step the run took, and how it ended.'
      }
      data-run-log
    >
      {run.notes.length > 0 && (
        <ol className="flex flex-col gap-2">
          {run.notes.map((n, i) => (
            <li key={i} className="flex items-start gap-2.5" data-status={n.status}>
              {noteGlyph[n.status]}
              <span className="min-w-0 flex-1">{n.text}</span>
              <span className="shrink-0 type-caption leading-5 text-muted-foreground">{noteLabel[n.status]}</span>
            </li>
          ))}
        </ol>
      )}
      {run.notes.length === 0 && run.status === 'running' && (
        <p className="text-muted-foreground">Waiting for Claude.</p>
      )}
      {endedBadly(run.status) && run.error && (
        <p data-run-error>
          <StateLine kind="error" word={runLabel[run.status]}>
            {run.error}
          </StateLine>
        </p>
      )}
      {/* Runs from before closing lines have none. */}
      {run.closing && <ClosingLine text={run.closing} openCall={openCall} opened={opened} />}
      {run.closing && changedNote && (
        <p className="type-caption text-muted-foreground" data-run-note>
          {changedNote}
        </p>
      )}
      {(run.budget || run.exclusions) && (
        <KeyValues>
          {run.budget && <KeyValue label="Slot budget">{budgetText(run.budget)}</KeyValue>}
          {run.exclusions && (
            <KeyValue label="Left out">{run.exclusions.length ? run.exclusions.join(', ') : 'None'}</KeyValue>
          )}
        </KeyValues>
      )}
    </Section>
  )
}

// Runs are numbered in the order their agent started them.
export const runNumber = (runs: RunSummary[], id: string) => runs.findIndex((r) => r.id === id) + 1

// Every run the agent started that `include` keeps, newest first, numbered among all of them: its
// number and what it ran, when and by whom it started, how it ended, and the one shown, or View, which
// opens an earlier run read-only to compare it with the latest. `latest` is the run the page shows
// when none is viewed, the last run started unless the page says otherwise.
export function RunList({
  runs,
  include = () => true,
  latest = runs.at(-1)?.id,
  viewing,
  view,
  counted
}: {
  runs: RunSummary[]
  include?: (run: RunSummary) => boolean
  latest?: string
  viewing: string | null
  view: (id: string | null) => Promise<void>
  counted: 'visitor' | 'network' // whom the daily limits on model runs count
}) {
  const { busy, error, run } = useAction()
  // View gives way to Shown on the run it opens, so focus goes to the list's heading, not the page.
  const heading = useRef<HTMLHeadingElement>(null)
  const open = async (id: string | null) => {
    if (await run(() => view(id))) heading.current?.focus()
  }
  return (
    <Section
      id="runs-h"
      title="Runs"
      heading={heading}
      description="Each run starts fresh; earlier ones stay here to compare."
    >
      <ol className="-mx-2 flex flex-col gap-0.5">
        {runs
          .map((r, i) => ({ ...r, n: i + 1 }))
          .filter(include)
          .reverse()
          .map((r) => {
            const shown = viewing === null ? r.id === latest : r.id === viewing
            return (
              <li
                key={r.id}
                aria-current={shown || undefined}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg px-2 py-1.5 aria-[current]:bg-muted"
              >
                <span className="min-w-0">
                  <b className="font-semibold">Run {r.n}</b> ·{' '}
                  {r.pitchesFor ? `Pitches for ${r.pitchesFor}` : (r.launch ?? 'From comps')}
                </span>
                <span className="type-caption text-muted-foreground">
                  {new Date(r.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  {r.startedBy && ` by ${r.startedBy}`} · {runLabel[r.status]}
                  {r.replayed && ' · Replayed'}
                  {r.fromSample && ' · Sample data'}
                </span>
                <span className="col-start-2 row-span-2 row-start-1 justify-self-end">
                  {shown ? (
                    <span className="type-caption text-muted-foreground">Shown</span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      aria-label={`View run ${r.n}`}
                      onClick={() => void open(r.id === latest ? null : r.id)}
                      className="-mr-1"
                    >
                      View
                    </Button>
                  )}
                </span>
              </li>
            )
          })}
      </ol>
      <p className="type-caption text-muted-foreground">
        {counted === 'network'
          ? 'Model runs are limited per UTC day across the network’s launches and inbox, whoever starts them. Runs that stop at once have a higher limit of their own.'
          : 'Model runs are limited per visitor and per UTC day, across browsers. Runs that replay or stop at once have a higher limit of their own.'}
      </p>
      <Alert error={error} />
    </Section>
  )
}

// The confirm form's "None of these", until the reply sends it as null.
const NONE = 'none'

const budgetText = (b: Budget) => ('slots' in b ? `${b.slots} promo slots` : `$${b.dollars.toLocaleString('en-US')}`)

// The agent's open question, the page's one action while the run waits on it: a card in the canvas,
// before the fit chart, whose legend is the question. Each kind is answered with its own form, its
// options as full-width rows, and one Answer. `ranking` gives the shows to leave out their bands, and
// says which show leaving one out would bring into the finalists, by the run's own rule.
export function OpenQuestion({
  question,
  launch,
  agent,
  ranking = null
}: {
  question: Question
  launch: Launch | null
  agent: Session
  ranking?: Ranking | null
}) {
  const { busy, error, run } = useAction()
  const [choice, setChoice] = useState<string | undefined>(undefined)
  const [text, setText] = useState('')
  const [unit, setUnit] = useState<'slots' | 'dollars'>('slots')
  const [amount, setAmount] = useState('')
  const [exclude, setExclude] = useState<string[]>([])
  // Asked again for comps, the programmer edits the ones they gave.
  const [comps, setComps] = useState(() => Array.from({ length: MAX_COMPS }, (_, i) => launch?.comps?.[i]?.name ?? ''))
  // The comps to confirm, in the question's order, with what each offers; a single match starts picked.
  const confirming = question.options.map((name) => ({
    name,
    offered: offeredBy(launch?.comps?.find((c) => c.name === name)?.match ?? null)
  }))
  const [picks, setPicks] = useState<Record<string, string>>(() =>
    question.kind === 'confirm_comps'
      ? Object.fromEntries(confirming.flatMap((c) => (c.offered.length === 1 ? [[c.name, c.offered[0].id]] : [])))
      : {}
  )
  const typed = takesText(question.kind, launch)
  const reply = (): Reply => {
    const note = typed && text.trim() ? { text } : {}
    if (question.kind === 'budget') {
      const digits = amount.replace(/[,\s$]/g, '')
      return digits ? { [unit]: Number(digits) } : {}
    }
    if (question.kind === 'exclusions') return { exclude }
    if (question.kind === 'comps') return { ...note, comps: comps.filter((c) => c.trim()) }
    if (question.kind === 'confirm_comps')
      return { picks: question.options.map((name) => (picks[name] === NONE ? null : picks[name])) }
    return { ...note, ...(choice !== undefined && { choice }) }
  }
  const unpicked = question.kind === 'confirm_comps' && question.options.some((name) => !picks[name])
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    void run(() => agent.stub.answer(question.id, reply()))
  }
  const toggle = (name: string) =>
    setExclude((names) => (names.includes(name) ? names.filter((n) => n !== name) : [...names, name]))
  // The finalists with these shows left out, as the agent marks them once the answer is in.
  const finalists = (left: string[]) => (ranking ? finalistsOf(markFinalists(ranking, left)).map((r) => r.show) : [])
  const now = finalists(exclude)
  // Who comes into the finalists when this show is left out, with the other ticks as they are.
  const brings = (name: string) => {
    const others = exclude.filter((n) => n !== name)
    const without = finalists(others)
    return finalists([...others, name]).filter((show) => !without.includes(show))
  }
  return (
    <section className="flex flex-col gap-4 rounded-xl bg-card p-4 lg:p-5" aria-label="Agent asks" data-ask>
      <div className="flex flex-wrap items-center gap-1.5">
        <Source of="agent" />
        <Badge variant="outline" mark="signal">
          Waiting on you
        </Badge>
      </div>
      <form onSubmit={submit}>
        <FieldSet disabled={busy}>
          <FieldLegend className="mb-4 max-w-[60ch] type-title font-semibold text-pretty" id="ask-q">
            {question.question}
          </FieldLegend>
          <FieldGroup>
            {(question.kind === 'choice' || question.kind === 'launch') && question.options.length > 0 && (
              <RadioGroup
                aria-labelledby="ask-q"
                value={choice ?? null}
                onValueChange={(option) => {
                  setChoice(option as string)
                  // A launch is a pick or a name, never both.
                  if (question.kind === 'launch') setText('')
                }}
                disabled={busy}
                className="gap-0.5"
              >
                {question.options.map((option) => (
                  <label key={option} className={optionRow}>
                    <RadioGroupItem value={option} className="mt-0.5" />
                    <span className="min-w-0 flex-1">{option}</span>
                  </label>
                ))}
              </RadioGroup>
            )}
            {question.kind === 'budget' && (
              <>
                <p className="text-muted-foreground">The insertion order is checked against it.</p>
                <Field orientation="horizontal" className="flex-wrap">
                  <RadioGroup
                    aria-label="Budget in"
                    value={unit}
                    onValueChange={(next) => setUnit(next as 'slots' | 'dollars')}
                    disabled={busy}
                    className={segmentedTrackVariants({ className: 'flex' })}
                  >
                    <RadioGroupSegment value="slots" className={segmentedItemVariants()}>
                      Promo slots
                    </RadioGroupSegment>
                    <RadioGroupSegment value="dollars" className={segmentedItemVariants()}>
                      A dollar budget
                    </RadioGroupSegment>
                  </RadioGroup>
                  <InputGroup className="w-48">
                    {unit === 'dollars' && <InputGroupAddon aria-hidden="true">$</InputGroupAddon>}
                    <InputGroupInput
                      aria-label={unit === 'slots' ? 'Promo slots' : 'Dollar budget'}
                      inputMode={unit === 'slots' ? 'numeric' : 'decimal'}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder={unit === 'slots' ? 'Slots, e.g. 20' : 'Budget, e.g. 150,000'}
                      className={unit === 'slots' ? 'pl-2.5' : undefined}
                    />
                  </InputGroup>
                </Field>
              </>
            )}
            {question.kind === 'exclusions' &&
              (question.options.length > 0 ? (
                <>
                  <p className="text-muted-foreground">Left out of this run only; the roster keeps them.</p>
                  <div className="flex flex-col gap-0.5">
                    {question.options.map((name) => {
                      const row = ranking?.rows.find((r) => r.show === name)
                      const entering = brings(name)
                      return (
                        <label key={name} className={optionRow} data-exclusion={name}>
                          <Checkbox
                            checked={exclude.includes(name)}
                            onCheckedChange={() => toggle(name)}
                            disabled={busy}
                            className="mt-0.5"
                          />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="font-medium">{name}</span>
                              {now.includes(name) && <Badge mark="signal">Finalist</Badge>}
                            </span>
                            {entering.length > 0 && (
                              <span className="type-caption text-muted-foreground">
                                Leaving it out brings {listOf(entering)} into the finalists.
                              </span>
                            )}
                          </span>
                          {row && <FitBand band={row.band} finalist={now.includes(name)} />}
                        </label>
                      )
                    })}
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground">
                  No roster show can be scored yet, so there’s nothing to leave out.
                </p>
              ))}
            {question.kind === 'comps' && (
              <>
                <p className="text-muted-foreground">
                  Released shows with listeners like the launch’s. All of them are scored together.
                </p>
                <FieldSet>
                  <FieldLegend className="mb-1.5">Comps, up to {MAX_COMPS}</FieldLegend>
                  <div className="flex flex-wrap gap-2">
                    {comps.map((comp, i) => (
                      <Input
                        key={i}
                        aria-label={`Comp ${i + 1}`}
                        value={comp}
                        onChange={(e) => setComps(comps.map((c, j) => (j === i ? e.target.value : c)))}
                        maxLength={MAX_TITLE}
                        className="sm:w-48"
                      />
                    ))}
                  </div>
                </FieldSet>
              </>
            )}
            {question.kind === 'confirm_comps' &&
              confirming.map(({ name, offered }) => (
                <FieldSet key={name}>
                  <FieldLegend className="mb-1.5 font-semibold">{name}</FieldLegend>
                  <RadioGroup
                    aria-label={name}
                    value={picks[name] ?? null}
                    onValueChange={(id) => setPicks({ ...picks, [name]: id as string })}
                    disabled={busy}
                    className="gap-0.5"
                  >
                    {[...offered, null].map((c) => (
                      <label key={c?.id ?? NONE} className={optionRow}>
                        <RadioGroupItem value={c?.id ?? NONE} className="mt-0.5" />
                        {c ? (
                          <span className="min-w-0 flex-1">
                            {c.name}{' '}
                            <span className="text-muted-foreground">popularity {percentile(c.popularity)}</span>
                          </span>
                        ) : (
                          <span className="min-w-0 flex-1">None of these</span>
                        )}
                      </label>
                    ))}
                  </RadioGroup>
                </FieldSet>
              ))}
            {typed && (
              <Field>
                <FieldLabel htmlFor="ask-text">
                  {question.kind === 'launch'
                    ? question.options.length > 0
                      ? 'Or the name Qloo lists it under'
                      : 'The name Qloo lists it under'
                    : question.kind === 'comps'
                      ? 'Or the name Qloo lists it under'
                      : question.options.length > 0
                        ? 'Or type your own answer'
                        : 'Your answer'}
                </FieldLabel>
                <Input
                  id="ask-text"
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value)
                    if (question.kind === 'launch') setChoice(undefined)
                  }}
                  // A launch's name, or the programmer's own answer.
                  maxLength={question.kind === 'launch' || question.kind === 'comps' ? MAX_TITLE : MAX_ANSWER}
                  className="sm:max-w-md"
                />
              </Field>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Button type="submit" disabled={unpicked}>
                {busy && <Spinner data-icon="inline-start" />}
                Answer
              </Button>
              {question.kind === 'exclusions' && (
                <small className="type-caption text-muted-foreground">Leave all unticked for no exclusions.</small>
              )}
              {question.kind === 'confirm_comps' && (
                <small className="type-caption text-muted-foreground">Only the comps you confirm are scored.</small>
              )}
            </div>
          </FieldGroup>
        </FieldSet>
      </form>
      <Alert error={error} />
    </section>
  )
}

// One option of a question: a full-width row whose whole width picks it, on the tone step once picked.
const optionRow =
  'flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted has-checked:bg-muted max-md:min-h-11 max-md:py-3'
