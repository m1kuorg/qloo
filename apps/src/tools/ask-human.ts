import type { Tool } from '.'
import type { Question, State } from '../agent'
import { scorable } from '../fit'
import { sameName } from '../resolve'

const kinds = ['choice', 'budget', 'exclusions'] as const

type Input = { question: string; kind: Question['kind']; options: string[] }

const notes: Record<Question['kind'], (question: string) => string> = {
  choice: (question) => `Asking: ${question}`,
  budget: () => 'Asking for the slot budget',
  exclusions: () => 'Asking for exclusions'
}

// Opens a question for the programmer. The run pauses once this turn's tools finish, and their
// answer arrives in the next user message, after this call's result.
export const askHuman: Tool<Input> = {
  definition: {
    name: 'ask_human',
    description:
      'Asks the programmer a question and pauses the run until they answer in the UI. Their answer arrives as their own message after this tool\'s result. Ask one question per turn. kind "choice" is a fork in the plan: give the answers to offer in options, or none for a free-text answer; the programmer can always type their own. kind "budget" asks for the slot budget and kind "exclusions" for the shows to leave out of this launch: code builds their answer forms and stores the answers on the run, so pass an empty options list.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'One short question, in plain words.' },
        kind: { type: 'string', enum: [...kinds], description: 'What the question is for.' },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: 'For a choice question, the answers to offer. Empty for budget and exclusions.'
        }
      },
      required: ['question', 'kind', 'options'],
      additionalProperties: false
    }
  },
  note: ({ question, kind }) => notes[kind](question),
  async run({ question, kind, options }, { run, call, update }) {
    if (!question.trim()) return { isError: true, content: 'The question is empty. Ask it again in plain words.' }
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
  if (kind === 'budget') return []
  if (state.ranking?.rows.length) return state.ranking.rows.map((r) => r.show)
  return state.roster
    .filter(scorable)
    .filter((s) => !(state.launch?.name && sameName(s.name, state.launch.name)))
    .map((s) => s.name)
}
