import type { Tool } from '.'
import type { Question, State } from '../agent'
import { scorable } from '../fit'
import { candidateLabels, sameName } from '../resolve'

const kinds = ['choice', 'launch', 'budget', 'exclusions'] as const

type Input = { question: string; kind: Question['kind']; options: string[] }

const notes: Record<Question['kind'], (question: string) => string> = {
  choice: (question) => `Asking: ${question}`,
  launch: () => 'Asking which show the launch is',
  budget: () => 'Asking for the slot budget',
  exclusions: () => 'Asking for exclusions'
}

// Opens a question for the programmer. The run pauses once this turn's tools finish, and their
// answer arrives in the next user message, after this call's result.
export const askHuman: Tool<Input> = {
  definition: {
    name: 'ask_human',
    description:
      'Asks the programmer a question and pauses the run until they answer in the UI. Their answer arrives as their own message after this tool\'s result. Ask one question per turn. kind "choice" is a fork in the plan: give the answers to offer in options, or none for a free-text answer; the programmer can always type their own. kind "launch" asks which show the launch is when its lookup came back ambiguous or missed: the programmer picks a candidate, which code sets as the launch, or gives the name Qloo lists it under. kind "budget" asks for the slot budget and kind "exclusions" for the shows to leave out of this launch. Code builds the answer forms for launch, budget, and exclusions and stores the answers, so pass an empty options list for them.',
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

// What the programmer picks from. Code builds the exclusions list: the fit chart's shows in fit
// order, or before a ranking, the shows the launch can score, since any other show, and the launch
// itself, is never proposed anyway.
function offered(kind: Question['kind'], options: string[], state: State) {
  if (kind === 'choice') return [...new Set(options)]
  if (kind === 'launch')
    return state.launch?.match?.resolution === 'ambiguous' ? candidateLabels(state.launch.match.candidates) : []
  if (kind === 'budget') return []
  if (state.ranking?.rows.length) return state.ranking.rows.map((r) => r.show)
  return state.roster
    .filter(scorable)
    .filter((s) => !(state.launch?.name && sameName(s.name, state.launch.name)))
    .map((s) => s.name)
}
