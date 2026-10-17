import type { Tool } from '.'
import type { Question, State } from '../agent'
import { scorable } from '../fit'
import { candidateLabels, offeredBy, sameName } from '../resolve'

const kinds = ['choice', 'launch', 'budget', 'exclusions', 'comps', 'confirm_comps'] as const

type Input = { question: string; kind: Question['kind']; options: string[] }

const notes: Record<Question['kind'], (question: string) => string> = {
  choice: (question) => `Asking: ${question}`,
  launch: () => 'Asking which show the launch is',
  budget: () => 'Asking for the slot budget',
  exclusions: () => 'Asking for exclusions',
  comps: () => 'Asking for comps',
  confirm_comps: () => 'Asking to confirm the comps'
}

// Opens a question for the programmer. The run pauses once this turn's tools finish, and their
// answer arrives in the next user message, after this call's result.
export const askHuman: Tool<Input> = {
  definition: {
    name: 'ask_human',
    description:
      'Asks the programmer a question and pauses the run until they answer in the UI. Their answer arrives as their own message after this tool\'s result. Ask one question per turn. kind "choice" is a fork in the plan: give the answers to offer in options, or none for a free-text answer; the programmer can always type their own. kind "launch" asks which show the launch is when its lookup came back ambiguous: the programmer picks a candidate, which code sets as the launch, or gives the name Qloo lists it under. kind "comps" asks for up to three released shows to stand in for an unreleased launch, or the name Qloo lists it under, and kind "confirm_comps" asks the programmer to confirm each resolved comp\'s Qloo match, or pick among an ambiguous comp\'s candidates. kind "budget" asks for the slot budget and kind "exclusions" for the shows to leave out of this launch. Code builds the answer forms for launch, comps, confirm_comps, budget, and exclusions and stores the answers, so pass an empty options list for them.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'One short question, in plain words.' },
        kind: { type: 'string', enum: [...kinds], description: 'What the question is for.' },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: 'For a choice question, the answers to offer. Empty for the other kinds.'
        }
      },
      required: ['question', 'kind', 'options'],
      additionalProperties: false
    }
  },
  note: ({ question, kind }) => notes[kind](question),
  async run({ question, kind, options }, { run, call, state, update }) {
    if (!question.trim()) return { isError: true, content: 'The question is empty. Ask it again in plain words.' }
    const match = state().launch?.match
    if (kind === 'launch' && match?.resolution !== 'ambiguous' && match?.resolution !== 'missed')
      return {
        isError: true,
        content: `The launch's lookup ${match ? `came back ${match.resolution}` : "hasn't run yet"}, so there is no pick to ask about. Ask kind launch only after resolve_entities finds the launch ambiguous or missed.`
      }
    if (kind === 'confirm_comps' && toConfirm(state()).length === 0)
      return {
        isError: true,
        content: 'No comp has a Qloo match to confirm yet. Resolve the comps with resolve_entities first.'
      }
    let asked: Question | null = null
    update((state) => {
      if (state.run?.id !== run || state.run.question) return state
      asked = { id: call, kind, question: question.trim(), options: offered(kind, options, state) }
      return { ...state, run: { ...state.run, question: asked } }
    })
    if (!asked)
      return {
        isError: true,
        content:
          'Another question is already open in this turn. Ask one question at a time; ask this one after the answer.'
      }
    return { content: 'Asked the programmer. Their answer follows.' }
  }
}

// What the programmer picks from. Code builds the comps to confirm, and the exclusions list: the fit chart's shows in fit
// order, or before a ranking, the shows the launch can score, since any other show, and the launch
// itself, is never proposed anyway.
function offered(kind: Question['kind'], options: string[], state: State) {
  if (kind === 'choice') return [...new Set(options)]
  if (kind === 'launch')
    return state.launch?.match?.resolution === 'ambiguous' ? candidateLabels(state.launch.match.candidates) : []
  if (kind === 'budget' || kind === 'comps') return []
  if (kind === 'confirm_comps') return toConfirm(state)
  if (state.ranking?.rows.length) return state.ranking.rows.map((r) => r.show)
  return state.roster
    .filter(scorable)
    .filter((s) => !(state.launch?.name && sameName(s.name, state.launch.name)))
    .map((s) => s.name)
}

// The comps a confirm question offers, by name: each one whose search matched and that the
// programmer hasn't answered on. A comp Qloo missed has nothing to confirm.
const toConfirm = (state: State) =>
  (state.launch?.comps ?? [])
    .filter((c) => c.status === 'unconfirmed' && offeredBy(c.match).length > 0)
    .map((c) => c.name)
