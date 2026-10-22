import type { Tool } from '.'
import { finalistsOf, tagged, type FitRow } from '../fit'
import { angleOf, dollars, lineProblem, priceLines, type InsertionOrder, type LineInput } from '../order'
import { CLOSING_WORDS } from '../prompt'
import { listOf } from '../text'

type Input = { lines: LineInput[] }

// The closing turn comes next, so a stored draft's result repeats its limits, where the model reads
// them last: the system prompt's closing rule alone gave 75 to 113 words that named every finalist (#126).
const endTheRun = `Now end the run in under ${CLOSING_WORDS} words and at most three short sentences`
const leftToThePage =
  "not even a flagged one, and don't mention demographic flags, tags, slots, or angles: the chart and the order show them. Never write a tool's name."

// The lines that carry an angle for a finalist Qloo returned no shared tags for, which there's
// nothing to build one from (#216).
function ungrounded(lines: LineInput[], finalists: FitRow[]) {
  const shows = lines
    .filter((l) => angleOf(l) && !tagged(finalists.find((r) => r.show === l.show)!.sharedTags))
    .map((l) => l.show)
  if (shows.length === 0) return null
  const one = shows.length === 1
  return `Qloo returned no shared tags for ${listOf(shows)}, so give ${one ? 'it' : 'them'} a null angle: an angle is built only from the tags shared_tags returned.`
}

// Drafts the run's insertion order. Code prices it and checks it against the budget the programmer
// gave, so the model proposes slots and angles but never a figure; a rejected draft stores nothing.
// Only the programmer can edit, approve, or export the order, through the UI.
export const draftInsertionOrder: Tool<Input> = {
  definition: {
    name: 'draft_insertion_order',
    description:
      "Drafts the launch's insertion order over the run's finalists: one line per show, with its promo slots and a host-read angle for its host, or none for a finalist shared_tags returned no tags for. Code prices each slot from the show's downloads per episode and the network's CPM, totals the order, and checks it against the slot budget the programmer gave, as a slot count or a dollar amount. A line for a show that isn't a finalist, an angle for a finalist without shared tags, a draft before shared_tags has run, or a draft over the budget, is rejected with what to fix, and nothing is stored. A valid draft replaces any earlier one in this run and waits for the programmer, who edits and approves it; you can't. Returns each line's slot value and value, the total slots and dollars, and any show missing a figure.",
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        lines: {
          type: 'array',
          description: 'One line per finalist to promote the launch on.',
          items: {
            type: 'object',
            properties: {
              show: { type: 'string', description: "The finalist's name exactly as the ranking lists it." },
              slots: { type: 'integer', description: 'Promo slots on this show, 1 or more.' },
              angle: {
                type: ['string', 'null'],
                description:
                  "One or two sentences the show's host can build the read on: what in the launch its listeners would want, built only from the tags shared_tags returned for it. Not its rank or score. Null for a finalist shared_tags returned no tags for."
              }
            },
            required: ['show', 'slots', 'angle'],
            additionalProperties: false
          }
        }
      },
      required: ['lines'],
      additionalProperties: false
    }
  },
  note: ({ lines }) =>
    `Drafting the insertion order: ${lines.length} shows, ${lines.reduce((n, l) => n + l.slots, 0)} slots`,
  async run({ lines }, { run, state, update }) {
    const now = state()
    const finalists = finalistsOf(now.ranking)
    if (finalists.length === 0)
      return {
        isError: true,
        content:
          'There are no finalists yet. Rank the roster with rank_candidates first, then draft the order for its finalists.'
      }
    const current = now.run?.id === run ? now.run : null
    const budget = current?.budget
    if (!budget)
      return {
        isError: true,
        content:
          "The programmer hasn't given this run's slot budget yet. Ask for it with ask_human (kind budget), then draft the order."
      }
    // The plan is drawn after the exclusions (PRD story 19), so no draft holds a show they leave out.
    if (!current.exclusions)
      return {
        isError: true,
        content:
          "The programmer hasn't said which shows to leave out of this run yet. Ask for them with ask_human (kind exclusions), then draft the order."
      }
    // shared_tags compares every finalist at once, so one without a compare means it hasn't run since
    // the finalists were set.
    if (finalists.some((r) => !r.sharedTags))
      return {
        isError: true,
        content:
          "The finalists' shared tags haven't been found yet, and an angle is built only from them. Call shared_tags first, then draft the order."
      }
    const problem = lineProblem(lines, finalists) ?? ungrounded(lines, finalists)
    if (problem)
      return {
        isError: true,
        content: `${problem} Nothing was stored. Fix the lines and call draft_insertion_order again.`
      }
    const priced = priceLines(
      lines.map((l) => ({ show: l.show, slots: l.slots, angle: angleOf(l) })),
      now.roster,
      now.cpm
    )
    if ('slots' in budget && priced.slots > budget.slots)
      return {
        isError: true,
        content: `This draft uses ${priced.slots} slots, over the budget of ${budget.slots}. Nothing was stored. Cut at least ${priced.slots - budget.slots} slots and call draft_insertion_order again.`
      }
    if ('dollars' in budget && priced.total > budget.dollars) {
      const values = priced.lines.map((l) => `${l.show} ${l.slotValue === null ? l.gap : dollars(l.slotValue)}`)
      return {
        isError: true,
        content: `This draft costs ${dollars(priced.total)}${priced.complete ? '' : ' before the shows without a value'}, over the budget of ${dollars(budget.dollars)}. Nothing was stored. Slot values: ${values.join(', ')}. Cut at least ${dollars(priced.total - budget.dollars)} and call draft_insertion_order again.`
      }
    }
    const n = now.runs.findIndex((r) => r.id === run) + 1
    const order: InsertionOrder = { id: `IO-${String(n).padStart(4, '0')}`, run, status: 'draft', ...priced }
    update((state) => (state.run?.id === run ? { ...state, insertionOrder: order } : state))
    const gaps = priced.lines.filter((l) => l.gap).map((l) => `${l.show}: ${l.gap}`)
    return {
      content: JSON.stringify({
        order: order.id,
        status: 'draft',
        lines: priced.lines.map(({ show, slots, slotValue, value, gap }) => ({ show, slots, slotValue, value, gap })),
        slots: priced.slots,
        total: priced.total,
        complete: priced.complete,
        budget,
        next: priced.complete
          ? `Stored as a draft. The programmer edits and approves it in the UI. ${endTheRun}: say the order is drafted at ${dollars(priced.total)} and cite the ranking call, then, only if a show wasn't ranked or checked, say which and why. Name no finalist, ${leftToThePage}`
          : `Stored as a draft with an incomplete total, because ${gaps.join('; ')}. They edit and approve the order in the UI. ${endTheRun}: say the order is drafted at ${dollars(priced.total)} so far and which figures the programmer must add, naming only the shows that lack one, and cite the ranking call. Name no other finalist, ${leftToThePage}`
      })
    }
  }
}
