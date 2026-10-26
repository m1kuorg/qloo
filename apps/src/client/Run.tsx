import { useState } from 'react'
import type { Budget, Launch, Question, Reply, Run } from '../agent'
import { MAX_COMPS } from '../limits'
import { MAX_ANSWER, MAX_TITLE } from '../text'
import { offeredBy } from '../resolve'
import { takesText } from '../tools/ask-human'
import type { Session } from './App'
import { Alert, percentile, useAction } from './controls'
import { CallButton } from './Evidence'
import { Source } from './Source'

// A run in the rail, as the workspace and the inbox both show it: its status, the Run module with its
// progress notes and Claude's closing line, and the agent's open question.

export const runLabel: Record<Run['status'], string> = {
  running: 'Running',
  waiting: 'Waiting on you',
  completed: 'Completed',
  stopped: 'Stopped at a limit',
  failed: 'Failed'
}

// Claude's closing line on a completed run, labelled as agent text. Each call number it cites
// opens that call's evidence.
function ClosingLine({
  text,
  openCall,
  opened
}: {
  text: string
  openCall: (call: string) => void
  opened: string | null
}) {
  return (
    <p className="closing" data-closing>
      <Source of="agent" />{' '}
      {text
        .split(/\b(C-\d+)\b/)
        .map((part, i) =>
          i % 2 ? (
            <CallButton key={i} call={part} label="Evidence Claude cites" opened={opened} openCall={openCall} />
          ) : (
            part
          )
        )}
    </p>
  )
}

const noteLabel: Record<Run['notes'][number]['status'], string> = { running: 'Running', done: 'Done', failed: 'Failed' }

// Code's note under a closing line once what the line describes has changed since: a launch run's
// insertion order (#202), or a pitch run's replies (#213).
export const ORDER_CHANGED =
  'The insertion order has changed since Claude drafted it: its lines and total are the current figures.'
export const REPLIES_CHANGED =
  'The replies have changed since Claude drafted them: each reply as listed is the current one.'

// What the run has done so far: one note per tool call, then why it stopped if it failed. Its closing
// line stays as Claude wrote it; once what it describes has changed since, code says so under it
// (`changedNote`), since the line may quote figures or counts that no longer hold.
export function RunLog({
  run,
  changedNote = null,
  openCall,
  opened
}: {
  run: Run
  changedNote?: string | null
  openCall: (call: string) => void
  opened: string | null
}) {
  return (
    <section className="mod" aria-labelledby="run-log" data-run-log>
      <div className="mh">
        <span className="lbl" id="run-log">
          Run
        </span>
        <span className="chips">
          {run.replayed && <span className="chip">Replayed</span>}
          <span className="chip">{runLabel[run.status]}</span>
        </span>
      </div>
      <ol className="notes">
        {run.notes.map((n, i) => (
          <li key={i} data-status={n.status}>
            <span>{n.text}</span>
            <span className="tg">{noteLabel[n.status]}</span>
          </li>
        ))}
        {(run.status === 'failed' || run.status === 'stopped') && (
          <li data-status="failed">
            <span>{run.error}</span>
            <span className="tg">Stopped</span>
          </li>
        )}
      </ol>
      {run.notes.length === 0 && run.status === 'running' && <p className="help">Waiting for Claude.</p>}
      {/* Runs from before closing lines have none. */}
      {run.closing && <ClosingLine text={run.closing} openCall={openCall} opened={opened} />}
      {run.closing && changedNote && (
        <p className="help io-note" data-run-note>
          {changedNote}
        </p>
      )}
      {(run.budget || run.exclusions) && (
        <dl className="rec">
          {run.budget && (
            <div className="rec-row">
              <dt>Slot budget</dt>
              <dd>{budgetText(run.budget)}</dd>
            </div>
          )}
          {run.exclusions && (
            <div className="rec-row">
              <dt>Left out</dt>
              <dd>{run.exclusions.length ? run.exclusions.join(', ') : 'None'}</dd>
            </div>
          )}
        </dl>
      )}
    </section>
  )
}

// The confirm form's "None of these", until the reply sends it as null.
const NONE = 'none'

const budgetText = (b: Budget) => ('slots' in b ? `${b.slots} promo slots` : `$${b.dollars.toLocaleString('en-US')}`)

// The agent's open question, the rail's primary action: the run waits here until it's answered.
export function OpenQuestion({
  question,
  launch,
  agent
}: {
  question: Question
  launch: Launch | null
  agent: Session
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
  return (
    // The question itself is the module's heading, under the chips that say who asks and that the run waits.
    <section className="mod ask" aria-label="Agent asks" data-ask>
      <div className="mh">
        <span className="chips">
          <Source of="agent" />
          <span className="chip">Waiting on you</span>
        </span>
      </div>
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <legend className="q">{question.question}</legend>
          {(question.kind === 'choice' || question.kind === 'launch') && question.options.length > 0 && (
            <div className="opts">
              {question.options.map((option) => (
                <label key={option}>
                  <input
                    type="radio"
                    name="ask-choice"
                    checked={choice === option}
                    onChange={() => {
                      setChoice(option)
                      // A launch is a pick or a name, never both.
                      if (question.kind === 'launch') setText('')
                    }}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          )}
          {question.kind === 'budget' && (
            <>
              <p className="help">The insertion order is checked against it.</p>
              <div className="opts">
                <label>
                  <input type="radio" name="ask-unit" checked={unit === 'slots'} onChange={() => setUnit('slots')} />
                  <span>Promo slots</span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="ask-unit"
                    checked={unit === 'dollars'}
                    onChange={() => setUnit('dollars')}
                  />
                  <span>A dollar budget</span>
                </label>
              </div>
              <span className="in">
                {unit === 'dollars' && <span className="pre">$</span>}
                <input
                  aria-label={unit === 'slots' ? 'Promo slots' : 'Dollar budget'}
                  inputMode={unit === 'slots' ? 'numeric' : 'decimal'}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={unit === 'slots' ? 'Slots, e.g. 20' : 'Budget, e.g. 150,000'}
                />
              </span>
            </>
          )}
          {question.kind === 'exclusions' &&
            (question.options.length > 0 ? (
              <>
                <p className="help">Left out of this run only; the roster keeps them.</p>
                <div className="opts">
                  {question.options.map((name) => (
                    <label key={name}>
                      <input type="checkbox" checked={exclude.includes(name)} onChange={() => toggle(name)} />
                      <span>{name}</span>
                    </label>
                  ))}
                </div>
              </>
            ) : (
              <p className="help">No roster show can be scored yet, so there's nothing to leave out.</p>
            ))}
          {question.kind === 'comps' && (
            <>
              <p className="help">Released shows with listeners like the launch's. All of them are scored together.</p>
              <div className="field comp-names" role="group" aria-labelledby="ask-comps">
                <span className="lbl" id="ask-comps">
                  Comps, up to {MAX_COMPS}
                </span>
                {comps.map((comp, i) => (
                  <span className="in" key={i}>
                    <input
                      aria-label={`Comp ${i + 1}`}
                      value={comp}
                      onChange={(e) => setComps(comps.map((c, j) => (j === i ? e.target.value : c)))}
                      maxLength={MAX_TITLE}
                    />
                  </span>
                ))}
              </div>
            </>
          )}
          {question.kind === 'confirm_comps' &&
            confirming.map(({ name, offered }, i) => (
              <fieldset key={name} className="confirm">
                <legend className="lbl">{name}</legend>
                <div className="opts">
                  {[...offered, null].map((c) => (
                    <label key={c?.id ?? NONE}>
                      <input
                        type="radio"
                        name={`confirm-${i}`}
                        checked={picks[name] === (c?.id ?? NONE)}
                        onChange={() => setPicks({ ...picks, [name]: c?.id ?? NONE })}
                      />
                      {c ? (
                        <span>
                          {c.name} <span className="pop">{percentile(c.popularity)}</span>
                        </span>
                      ) : (
                        <span>None of these</span>
                      )}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          {typed && (
            <label className="field">
              <span className="lbl">
                {question.kind === 'launch'
                  ? question.options.length > 0
                    ? 'Or the name Qloo lists it under'
                    : 'The name Qloo lists it under'
                  : question.kind === 'comps'
                    ? 'Or the name Qloo lists it under'
                    : question.options.length > 0
                      ? 'Or type your own answer'
                      : 'Your answer'}
              </span>
              <span className="in">
                <input
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value)
                    if (question.kind === 'launch') setChoice(undefined)
                  }}
                  // A launch's name, or the programmer's own answer.
                  maxLength={question.kind === 'launch' || question.kind === 'comps' ? MAX_TITLE : MAX_ANSWER}
                />
              </span>
            </label>
          )}
          <div className="acts">
            <button className="btn pri" type="submit" disabled={unpicked}>
              Answer
            </button>
            {question.kind === 'exclusions' && <small>Leave all unticked for no exclusions.</small>}
            {question.kind === 'confirm_comps' && <small>Only the comps you confirm are scored.</small>}
          </div>
        </fieldset>
      </form>
      <Alert error={error} />
    </section>
  )
}
