/** @jsxImportSource hono/jsx */
// The marketing pages: the landing page at /, the privacy page, the beta terms, and the 404 page.
// Server-rendered with no island. Nothing here is a Qloo response: the re-rank and every piece of the app
// the landing page shows use one made-up network, launch, and shows, and the re-rank says so.
import { cn } from 'cn'
import { Hono, type NotFoundHandler } from 'hono'
import { html } from 'hono/html'
import type { Child } from 'hono/jsx'
import {
  badgeVariants,
  buttonVariants,
  callVariants,
  inputVariants,
  linkVariants,
  marketingFrame,
  segmentedItemVariants,
  segmentedTrackVariants
} from '../components/ui/variants'
import { bandMeter, FINALISTS, type Band } from '../fit'
import { Check, ChevronDown, Copy, LoaderCircle } from '../icons'
import { MAX_PITCH_CHARS, MAX_PITCHES } from '../inbox'
import { MAX_QLOO_CALLS, MAX_TURNS } from '../limits'
import { CSV_HEADER, dollars, slotPrice } from '../order'
import { MarketingPage, marketingShell } from '../shell'
import { moveGlyph, moveWords, nth } from '../text'
import { CLIMB, topicFinding } from '../topic'
import { SESSION_DAYS } from './demo'

export const marketing = new Hono<{ Bindings: Env }>()

// The landing page's illustration, which every picture on the page shares: Kiln Street Audio, a
// made-up network of eight shows, planning promos for Low Tide, a made-up true-crime launch. Nothing
// here is Qloo data, and no name is one of the sample network's (marketing.test.ts).
const NETWORK = 'Kiln Street Audio'
const LAUNCH = 'Low Tide'
// The roster in listener order, as Qloo's ranking would put it: each show's place is its fit rank.
// `topic` is the rank a topic-only plan gives it. Bands are thirds of the ranking, as fit.ts sets
// them; `tags` are the tags its listeners share with the launch's.
const roster: { show: string; topic: number; band: Band; tags: string[] }[] = [
  { show: 'Case Notes', topic: 1, band: 'top', tags: ['Cold case', 'Small-town'] },
  { show: 'The Harbour', topic: 6, band: 'top', tags: ['Coastal', 'Oral history'] },
  { show: 'Plain Sight', topic: 2, band: 'top', tags: ['Investigative', 'Courtroom'] },
  { show: 'Tide Tables', topic: 8, band: 'middle', tags: ['Coastal', 'Working life'] },
  { show: 'Static', topic: 7, band: 'middle', tags: ['Slow-burn', 'Late night'] },
  { show: 'Small Claims', topic: 3, band: 'middle', tags: ['Courtroom'] },
  { show: 'Night Desk', topic: 4, band: 'bottom', tags: ['Local news'] },
  { show: 'Dry Ink', topic: 5, band: 'bottom', tags: ['Mystery'] }
]
const ranked = roster.map((r, i) => ({ ...r, rank: i + 1, move: r.topic - (i + 1), finalist: i < FINALISTS }))
const finalists = ranked.filter((r) => r.finalist)
// The fit chart's finding, worded as the app's: the finalists, then the highest-placed climber and how
// many more climb.
const finding = topicFinding(
  finalists.length,
  ranked.filter((r) => r.move >= CLIMB)
)
// The finalists a topic-only plan's top five would leave out.
const missed = finalists.filter((r) => r.topic > FINALISTS).length
const count = ['no', 'one', 'two', 'three', 'four', 'five'] as const

// The network's own figures, which price the plan as the app does (order.ts): its CPM, each
// finalist's downloads per episode, and the slots and angle the agent drafted. 20 slots, the budget.
const CPM = 20
const BUDGET = 20
const plan = [
  { show: 'Case Notes', downloads: 18_000, slots: 6, call: 'C-16', angle: 'Low Tide reopens a small-town cold case.' },
  {
    show: 'The Harbour',
    downloads: 9_000,
    slots: 5,
    call: 'C-17',
    angle: 'The town tells its own story, as your guests do.'
  },
  { show: 'Plain Sight', downloads: 12_000, slots: 4, call: 'C-18', angle: 'An investigation that ends in court.' },
  { show: 'Tide Tables', downloads: 4_500, slots: 3, call: 'C-19', angle: 'Set among the boats and tides you follow.' },
  { show: 'Static', downloads: 6_000, slots: 2, call: 'C-20', angle: 'A slow-burn case, best heard late.' }
].map((line) => {
  const { slotValue } = slotPrice(line.downloads, CPM)
  return { ...line, slotValue: slotValue ?? 0, value: (slotValue ?? 0) * line.slots }
})
const planSlots = plan.reduce((n, l) => n + l.slots, 0)
const planTotal = plan.reduce((n, l) => n + l.value, 0)

// The page's rhythm: sections 96px apart on phones, 160px from 768px, 192px from 1024px.
const section = cn(marketingFrame, 'mt-24 md:mt-40 lg:mt-48')
// The rules inside the re-rank and the interface fragments (data-ui), as the app draws its tables'.
const rowRuleAbove = 'border-t' // taste-skill-ignore
const rowRuleBelow = 'border-b' // taste-skill-ignore

// The fit band's meter, three bars filled from the left, signal for a finalist, then its word, as the
// app's FitBand sets it, at the re-rank's scale.
const Meter = ({ band, finalist }: { band: Band; finalist: boolean }) => {
  const { bars, word } = bandMeter[band]
  return (
    <span class="inline-flex items-center gap-2 text-muted-foreground">
      <span class="inline-flex items-end gap-1" aria-hidden="true">
        {[1, 2, 3].map((step) => (
          <span
            class={cn('h-4 w-1.5 rounded-[1px]', step > bars ? 'bg-border' : finalist ? 'bg-signal' : 'bg-foreground')}
          />
        ))}
      </span>
      {word}
    </span>
  )
}

// The re-rank, the page's live thing: the roster in listener order, which two radios re-order by topic
// alone. CSS only (style.css, "The landing page's re-rank"): the checked radio sets each row's offset
// from its two ranks, so each row travels to its topic place and its rank figure rolls to match. Rows
// share one height, so a row moves by whole rows. Both ranks are in each row's text, so a screen
// reader hears them whichever order is on screen.
const reRankRow =
  "grid items-baseline gap-x-3 grid-cols-[2rem_minmax(0,1fr)_auto] [grid-template-areas:'rank_show_move'_'rank_show_fit'] md:gap-x-6 md:grid-cols-[3rem_4rem_minmax(0,1fr)_7rem] md:[grid-template-areas:'rank_move_show_fit']"
function ReRank() {
  return (
    <section aria-labelledby="rerank-h" data-rerank class={section}>
      <div class="grid gap-6 lg:grid-cols-12 lg:items-end lg:gap-x-6">
        <h2 id="rerank-h" class="type-display text-balance lg:col-span-6">
          What a topic plan misses
        </h2>
        <p class="max-w-[60ch] text-pretty lg:col-span-5 lg:col-start-8">
          A plan by topic puts {LAUNCH}, a true-crime launch, on the network&apos;s crime and courtroom shows. Ranked by
          who listens, {count[missed]} of its {count[finalists.length]} finalists come from outside that top five.
        </p>
      </div>
      <div class="mt-12 flex flex-col gap-6 md:mt-16 md:flex-row md:items-end md:justify-between">
        <div>
          <p class="type-title">Launch: {LAUNCH}</p>
          <p class="mt-1 text-muted-foreground">
            A true-crime show set in a fishing town, from {NETWORK}, a network of {roster.length} shows.
          </p>
        </div>
        <fieldset class="min-w-0">
          <legend class="mb-2 type-ui text-muted-foreground">Rank the roster</legend>
          <div class={segmentedTrackVariants({ className: 'h-11 max-md:flex max-md:w-full' })}>
            {(
              [
                ['listeners', 'By who listens'],
                ['topic', 'By topic']
              ] as const
            ).map(([value, label]) => (
              <label
                class={segmentedItemVariants({
                  className:
                    'h-10 px-4 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring max-md:flex-1 motion-safe:active:scale-[0.98]'
                })}
              >
                <input
                  type="radio"
                  name="lens"
                  id={`lens-${value}`}
                  value={value}
                  checked={value === 'listeners'}
                  class="vh"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      {/* Where the order on screen comes from, as the app says under its lens. */}
      <p class="mt-6 type-ui text-muted-foreground">
        <span data-lens-note="listeners">Ranked by listener overlap with {LAUNCH}, as Qloo scores it.</span>
        <span data-lens-note="topic">Ranked by topic alone, as Claude ranks it from show names and descriptions.</span>
      </p>
      <div role="table" aria-labelledby="rerank-h" aria-describedby="rerank-caption" data-ui class="mt-4">
        <div role="rowgroup">
          <div role="row" class={cn(reRankRow, 'pb-3 type-ui text-muted-foreground max-md:sr-only')}>
            <span role="columnheader" class="text-right [grid-area:rank]">
              Rank
            </span>
            <span role="columnheader" class="[grid-area:move]">
              Move
            </span>
            <span role="columnheader" class="[grid-area:show]">
              Show
            </span>
            <span role="columnheader" class="text-right [grid-area:fit]">
              Fit
            </span>
          </div>
        </div>
        <div role="rowgroup" class={cn('grid auto-rows-fr', rowRuleBelow)}>
          {ranked.map((r) => (
            <div
              role="row"
              data-row
              data-l={r.rank}
              data-t={r.topic}
              class={cn(
                reRankRow,
                rowRuleAbove,
                '-mx-3 px-3 py-4 md:-mx-4 md:px-4 md:py-5',
                r.finalist ? 'bg-signal-tint' : 'bg-background'
              )}
            >
              <span role="cell" class="text-right [grid-area:rank]">
                <span class="vh">
                  {nth(r.rank)} by who listens, {nth(r.topic)} by topic
                </span>
                <span
                  aria-hidden="true"
                  data-rank
                  class="inline-flex h-[1lh] flex-col overflow-clip type-title tabular-nums"
                >
                  <span>{r.rank}</span>
                  <span>{r.topic}</span>
                </span>
              </span>
              <span
                role="cell"
                class={cn(
                  'type-title tabular-nums [grid-area:move] max-md:text-right',
                  r.move >= CLIMB ? 'text-signal-ink' : 'text-muted-foreground'
                )}
              >
                <span aria-hidden="true">{moveGlyph(r.move)}</span>
                <span class="vh">{moveWords(r.move)}</span>
              </span>
              <div role="cell" class="min-w-0 [grid-area:show]">
                <p class="type-index whitespace-nowrap">{r.show}</p>
                <p class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 type-ui text-muted-foreground md:mt-3">
                  {r.finalist && <span class={badgeVariants({ mark: 'signal' })}>Finalist</span>}
                  <span>{r.tags.join(' · ')}</span>
                </p>
              </div>
              <span role="cell" class="justify-self-end type-ui [grid-area:fit]">
                <Meter band={r.band} finalist={r.finalist} />
              </span>
            </div>
          ))}
        </div>
      </div>
      <div class="mt-6 flex flex-col gap-2 md:flex-row md:justify-between md:gap-10">
        <p class="max-w-[60ch]">{finding}</p>
        <p id="rerank-caption" class="max-w-[46ch] type-ui text-muted-foreground md:text-right">
          Illustration: a made-up network, launch, shows, ranks, and tags. Not Qloo data.
        </p>
      </div>
    </section>
  )
}

// A run, stage by stage, as one bar: each stage as wide as it usually takes, the person's in ink and the
// agent's on the tone step. The agent's stages are measured (the ranking showed 5 to 7 seconds after
// the click, docs/SUBMISSION.md); the person's take as long as they take.
const stages = [
  {
    who: 'You',
    took: 'Seconds',
    text: "First, you name the launch, or up to three comps for one that isn't out yet."
  },
  {
    who: 'Agent',
    took: 'About ten seconds',
    text: 'Then the agent ranks the roster by listener overlap with the launch, in Qloo.'
  },
  {
    who: 'You',
    took: 'Up to you',
    text: 'Then it stops to ask for the slot budget and the shows to leave out, and waits for your answers.'
  },
  {
    who: 'Agent',
    took: 'Under a minute',
    text: "Then it checks the finalists' listeners, finds the tags each shares with the launch, and drafts the plan."
  },
  {
    who: 'You',
    took: 'Up to you',
    text: 'Last, you edit the insertion order, approve it, and export it as CSV. Nothing is final until you do.'
  }
]
const Stages = () => (
  <section aria-labelledby="run-h" class={section}>
    <h2 id="run-h" class="type-display" data-rise>
      How a run works
    </h2>
    <ol class="mt-12 grid gap-1.5 md:mt-16 lg:grid-cols-[12fr_12fr_26fr_18fr_32fr]" data-rise="2">
      {stages.map(({ who, took, text }) => {
        const person = who === 'You'
        return (
          <li
            class={cn(
              'flex flex-col gap-4 max-lg:rounded-lg max-lg:p-5',
              person ? 'max-lg:bg-primary max-lg:text-primary-foreground' : 'max-lg:bg-secondary'
            )}
          >
            <div
              class={cn(
                'flex flex-col justify-between gap-6 lg:h-[22svh] lg:min-h-40 lg:rounded-lg lg:p-5',
                person ? 'lg:bg-primary lg:text-primary-foreground' : 'lg:bg-secondary'
              )}
            >
              <p class="type-title text-balance">{took}</p>
              <p class="type-ui max-lg:hidden">{person ? 'You' : 'The agent'}</p>
            </div>
            <p class="max-w-[26ch] text-pretty lg:pr-2">{text}</p>
          </li>
        )
      })}
    </ol>
  </section>
)

// A chip as the app's Badge draws it; `mark` sets its glyph.
const Chip = ({
  variant,
  mark,
  children
}: {
  variant?: 'default' | 'outline'
  mark?: 'none' | 'square' | 'circle' | 'signal'
  children: Child
}) => <span class={badgeVariants({ variant, mark })}>{children}</span>
// Where a line came from, as the app's Source labels it: Qloo's data, outlined with a square; the
// agent's words, on the tone step with a circle.
const Source = ({ of }: { of: 'qloo' | 'agent' }) =>
  of === 'qloo' ? (
    <Chip variant="outline" mark="square">
      Qloo data
    </Chip>
  ) : (
    <Chip mark="circle">Agent</Chip>
  )
// A call number as the app's CallButton sets it, here part of a picture.
const Call = ({ call }: { call: string }) => (
  <button type="button" class={callVariants()} translate="no">
    {call}
  </button>
)
// A record's key/value grid, as the app's KeyValues.
const KeyValue = ({ label, children }: { label: string; children: Child }) => (
  <div class="col-span-full grid grid-cols-subgrid">
    <dt class="text-muted-foreground">{label}</dt>
    <dd class="min-w-0">{children}</dd>
  </div>
)

// A true-size piece of the app, as a picture: the island's classes, the illustration's figures, and
// `inert`, so nothing in it can be focused or pressed. Its caption says what it shows.
const Picture = ({ caption, children }: { caption: string; children: Child }) => (
  <figure class="mt-8" data-rise="2">
    <div data-ui inert class="type-ui">
      {children}
    </div>
    <figcaption class="mt-4 type-ui text-muted-foreground">{caption}</figcaption>
  </figure>
)

// The run's notes as the agent's tools write them, while it finds the finalists' shared tags.
const notes = [
  { text: `Resolving ${LAUNCH}`, running: false },
  { text: `Scoring ${roster.length} shows against ${LAUNCH}`, running: false },
  { text: 'Asking for the slot budget', running: false },
  { text: 'Asking for exclusions', running: false },
  { text: `Checking demographics of ${finalists.length} finalists against ${LAUNCH}`, running: false },
  { text: `Finding the tags ${finalists.length} finalists share with ${LAUNCH}`, running: true }
]
const step = notes.findIndex((n) => n.running)

// The on-air readout over the run log, as the launch page shows them while a run works (Frame.tsx,
// Run.tsx).
const RunFragment = () => (
  <div class="flex flex-col gap-4">
    <div class="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted px-3 py-2">
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        <span class="inline-flex items-center gap-2">
          {/* A picture, so its live dot and spinner run a few times and stop, rather than move for as long as
              the page is open. */}
          <span class="size-2 shrink-0 rounded-full bg-signal motion-safe:animate-live motion-safe:[animation-iteration-count:3]" />
          <b class="font-semibold">Running</b>
        </span>
        <span>
          {notes[step].text} · step {step + 1}
        </span>
      </div>
      <span class="text-muted-foreground">
        1:<span class="tabular-nums">48</span>
      </span>
    </div>
    <section class="flex flex-col gap-3 rounded-xl bg-card p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="font-semibold">Run log</p>
        <Chip mark="signal">Running</Chip>
      </div>
      <ol class="flex flex-col gap-2">
        {notes.map((n) => (
          <li class="flex items-start gap-2.5">
            {n.running ? (
              <LoaderCircle class="mt-0.5 size-4 shrink-0 text-muted-foreground motion-safe:animate-spin motion-safe:[animation-iteration-count:5]" />
            ) : (
              <Check class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            )}
            <span class="min-w-0 flex-1">{n.text}</span>
            <span class="shrink-0 type-caption leading-5 text-muted-foreground">{n.running ? 'Running' : 'Done'}</span>
          </li>
        ))}
      </ol>
      <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
        <KeyValue label="Slot budget">{BUDGET} promo slots</KeyValue>
        <KeyValue label="Left out">None</KeyValue>
      </dl>
    </section>
  </div>
)

// The agent's question, waiting on the slot budget, with an answer typed in (Run.tsx's OpenQuestion).
const QUESTION = `What's the slot budget for ${LAUNCH}, in promo slots or dollars?`
const QuestionFragment = () => (
  <section class="flex max-w-2xl flex-col gap-4 rounded-xl bg-card p-4 lg:p-5">
    <div class="flex flex-wrap items-center gap-1.5">
      <Source of="agent" />
      <Chip variant="outline" mark="signal">
        Waiting on you
      </Chip>
    </div>
    <div class="flex flex-col gap-4">
      <p class="max-w-[60ch] type-title text-pretty">{QUESTION}</p>
      <p class="text-muted-foreground">The insertion order is checked against it.</p>
      <div class="flex flex-wrap items-center gap-2">
        <span class={segmentedTrackVariants({ className: 'flex' })}>
          <span class={segmentedItemVariants()} data-checked>
            Promo slots
          </span>
          <span class={segmentedItemVariants()}>A dollar budget</span>
        </span>
        <span class={inputVariants({ className: 'flex w-48 items-center' })}>{BUDGET}</span>
      </div>
      <p>
        <span class={buttonVariants()}>Answer</span>
      </p>
    </div>
  </section>
)

// The plan, insertion order IO-0001 in draft, priced from the network's own figures
// (InsertionOrder.tsx).
const PlanFragment = () => (
  <section class="flex flex-col gap-3">
    <p class="font-semibold">The plan</p>
    <div class="flex flex-col gap-4 rounded-xl bg-card p-4 lg:p-5">
      <div class="flex flex-col gap-1">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p class="font-semibold">
            Insertion order <code class="font-medium">IO-0001</code>
          </p>
          <Chip>Draft</Chip>
        </div>
        <p class="type-caption text-muted-foreground">
          <Source of="agent" /> drafted the slots and angles. Code prices each slot at downloads per episode × CPM ÷
          1,000.
        </p>
      </div>
      <table class="w-full">
        <thead class="type-caption text-muted-foreground">
          <tr class={rowRuleBelow}>
            <th scope="col" class="pb-2 text-left font-normal">
              Show · angle
            </th>
            <th scope="col" class="w-14 pb-2 pl-3 text-right font-normal md:w-20">
              Slots
            </th>
            <th scope="col" class="w-24 pb-2 pl-3 text-right font-normal md:w-32">
              Value
            </th>
          </tr>
        </thead>
        {plan.map((line) => (
          <tbody class={rowRuleBelow}>
            <tr class="align-baseline">
              <th scope="row" class="pt-3 text-left font-normal">
                <span class="inline-flex items-center gap-2 text-[15px] leading-snug font-semibold">
                  <span class="size-2 shrink-0 rounded-full bg-signal" />
                  {line.show}
                </span>
              </th>
              <td class="pt-3 pl-3 text-right tabular-nums">{line.slots}</td>
              <td class="pt-3 pl-3 text-right font-medium">{dollars(line.value)}</td>
            </tr>
            <tr class="align-top">
              <td colspan={2} class="pt-1 pb-3 pl-4">
                {line.angle} <Call call={line.call} />
              </td>
              <td class="pt-0.5 pb-3 pl-3 text-right type-caption text-muted-foreground">
                {dollars(line.slotValue)} a slot
              </td>
            </tr>
          </tbody>
        ))}
        <tfoot>
          <tr class="align-baseline">
            <th scope="row" class="pt-3 text-left font-semibold">
              Total
            </th>
            <td class="pt-3 pl-3 text-right font-semibold tabular-nums">{planSlots}</td>
            <td class="pt-3 pl-3 text-right font-semibold">{dollars(planTotal)}</td>
          </tr>
        </tfoot>
      </table>
      <p class="text-muted-foreground">
        Budget: {BUDGET - planSlots} of {BUDGET} slots left.
      </p>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span class={buttonVariants()}>Approve</span>
        <span class={buttonVariants({ variant: 'ghost' })}>Edit lines</span>
        <p class="type-caption text-muted-foreground">
          Nothing is final until you approve it. Editing returns it to draft.
        </p>
      </div>
    </div>
  </section>
)

// The inspector open on call C-14's evidence, the ranking's request as a record (Evidence.tsx). The
// raw scores Qloo returned follow it in the app, below this crop.
const RANKING_CALL = 'C-14'
const EvidenceFragment = () => (
  <div class="flex w-full max-w-[360px] flex-col gap-4 rounded-xl bg-card p-4">
    <span class={segmentedTrackVariants()}>
      <span class={segmentedItemVariants()}>Run</span>
      <span class={segmentedItemVariants()} data-active>
        Evidence
      </span>
    </span>
    <div class="flex flex-col gap-1.5">
      <p class="font-semibold">
        Evidence · <code class="font-medium">{RANKING_CALL}</code>
      </p>
      <div class="flex flex-wrap items-center gap-1.5">
        <Source of="qloo" />
      </div>
    </div>
    <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
      <KeyValue label="Request">
        <code class="text-xs break-all">POST /v2/insights</code>
      </KeyValue>
      <KeyValue label="Parameters">
        <ul class="flex flex-col gap-2">
          <li class="flex min-w-0 flex-col">
            <code class="text-xs break-all text-muted-foreground">filter.type</code>
            <span>urn:entity:podcast</span>
          </li>
          <li class="flex min-w-0 flex-col">
            <code class="text-xs break-all text-muted-foreground">signal.interests.entities</code>
            <span>1 entity ID</span>
            <code class="block truncate text-xs">3b9f6c1e-7d2a-4e85-b1c4-9a0e5f27d6b3</code>
          </li>
          <li class="flex min-w-0 flex-col">
            <code class="text-xs break-all text-muted-foreground">filter.results.entities</code>
            <span class="flex items-center gap-1 underline decoration-muted-foreground decoration-1 underline-offset-4">
              {roster.length} entity IDs
              <ChevronDown class="size-4 text-muted-foreground" />
            </span>
          </li>
          <li class="flex min-w-0 flex-col">
            <code class="text-xs break-all text-muted-foreground">feature.explainability</code>
            <span>true</span>
          </li>
          <li class="flex min-w-0 flex-col">
            <code class="text-xs break-all text-muted-foreground">take</code>
            <span>50</span>
          </li>
        </ul>
      </KeyValue>
      <KeyValue label="Status">200</KeyValue>
      <KeyValue label="Latency">{'1,240\u00a0ms'}</KeyValue>
      <KeyValue label="Retries">0</KeyValue>
      <KeyValue label="Cache">Miss, called Qloo</KeyValue>
      <KeyValue label="Called at">14:01:58</KeyValue>
      <KeyValue label="Run">
        <code class="block truncate text-xs">6f0d9c4e-2b7a-4c1e-9f53-8a1d2e7b4c90</code>
      </KeyValue>
    </dl>
  </div>
)

// Two of the replies the agent drafted to guests pitched to The Harbour, one approved and one still a
// draft, with Approve before Copy (Inbox.tsx's Replies). Both at every width, so the counts over them
// add up.
const replies = [
  {
    work: 'Salt Ledger',
    guest: 'Mara Quist',
    to: 'Ines Tolland at Brightwater Books',
    approved: true,
    angle: "The cannery strike of 1931, told from the harbourmaster's ledgers.",
    tags: ['Coastal', 'Oral history', 'Working life'],
    call: 'C-31',
    draft:
      "Hi Ines, thanks for sending Salt Ledger. Mara's book is a close fit for The Harbour's listeners, and we'd like her on for an episode about the cannery strike. Could she record in the first week of March?"
  },
  {
    work: 'The Breakwater',
    guest: 'Tom Ruel',
    to: 'Sam Odum at Northlight Films',
    approved: false,
    angle: "Filming the storm of 1953 with the town's own boats.",
    tags: ['Coastal', 'Weather', 'Documentary'],
    call: 'C-32',
    draft:
      "Hi Sam, The Breakwater looks like one for The Harbour: its audience is close to ours. We'd like Tom on to talk about filming the 1953 storm with the town's boats. Is he free to record this spring?"
  }
]
const RepliesFragment = () => (
  <section class="flex max-w-3xl min-w-0 flex-col gap-4">
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
      <p class="font-semibold">
        Replies · {replies.filter((r) => r.approved).length} of {replies.length} approved
      </p>
      <Source of="agent" />
    </div>
    <div class="flex flex-col gap-2">
      <p class="font-semibold">Book · {replies.length}</p>
      <ul class="flex flex-col gap-2">
        {replies.map((r) => (
          <li class="flex flex-col gap-3 rounded-xl bg-card p-4">
            <div class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5">
              <p class="min-w-0 text-[15px] leading-snug">
                <span class="font-semibold">{r.work}</span>
                <span class="text-muted-foreground"> · {r.guest}</span>
              </p>
              {r.approved ? (
                <Chip variant="outline">
                  <Check class="size-3" />
                  Approved
                </Chip>
              ) : (
                <Chip>Draft</Chip>
              )}
              <p class="col-span-full truncate type-caption text-muted-foreground">To {r.to}</p>
            </div>
            <div class="flex max-w-[72ch] flex-col gap-1">
              <p class="text-muted-foreground">
                <span class="font-medium text-foreground">Episode angle</span> {r.angle}
              </p>
              <p class="type-caption leading-5 text-muted-foreground">
                Shares with The Harbour: <Source of="qloo" /> {r.tags.join(' · ')} <Call call={r.call} />
              </p>
            </div>
            <p class="max-w-[72ch] text-pretty">{r.draft}</p>
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              {!r.approved && <span class={buttonVariants({ size: 'sm' })}>Approve</span>}
              <span class={buttonVariants({ size: 'sm', variant: r.approved ? 'default' : 'secondary' })}>
                <Copy class="size-3.5" />
                Copy
              </span>
              <span class={buttonVariants({ size: 'sm', variant: 'ghost' })}>Edit</span>
              <span class={buttonVariants({ size: 'sm', variant: 'ghost' })}>Discard</span>
              <small class="type-caption text-muted-foreground">
                {r.approved ? 'Copy it into your own email to send.' : 'Copy unlocks once you approve.'}
              </small>
            </div>
          </li>
        ))}
      </ul>
    </div>
  </section>
)

// What Crossfeed does, one capability to a block, each with its piece of the app. From 1280px the
// heading and the capabilities' names hold at the left while the blocks pass at the right, the name of
// the block in view in ink (style.css, "What it does").
type Capability = { id: string; name: string; text: Child; picture?: Child }
function Capabilities({ inbox }: { inbox: boolean }) {
  const capabilities: Capability[] = [
    {
      id: 'rank',
      name: 'Ranks the roster',
      text: `It looks every show up in Qloo and scores the whole roster against the launch in one call. The on-air readout and the run log say what it's doing while it works.`,
      picture: (
        <Picture caption={`A run's readout and log while it finds the tags the finalists share with ${LAUNCH}.`}>
          <RunFragment />
        </Picture>
      )
    },
    {
      id: 'ask',
      name: 'Asks at each fork',
      text: 'Where a plan needs a person, it stops and asks rather than guess: the slot budget, the shows to leave out, which match is right when a name is ambiguous. The run waits for the answer.',
      picture: (
        <Picture caption={`The agent waiting on the slot budget for ${LAUNCH}.`}>
          <QuestionFragment />
        </Picture>
      )
    },
    {
      id: 'plan',
      name: 'Drafts the plan',
      text: 'It drafts an insertion order across the finalists, with a host-read angle for each from the tags it shares with the launch. Code prices every slot from your own downloads and CPM, and nothing is final until you approve it.',
      picture: (
        <Picture
          caption={`Insertion order IO-0001: ${planSlots} slots across the ${finalists.length} finalists at a $${CPM} CPM.`}
        >
          <PlanFragment />
        </Picture>
      )
    },
    {
      id: 'cite',
      name: 'Cites every figure',
      text: 'Every match, rank, and tag carries the number of the Qloo call behind it. Open one for the request, its parameters, and what Qloo returned. Claude explains and drafts from those records, and never makes up a score.',
      picture: (
        <Picture caption={`Call ${RANKING_CALL}, the ranking of ${NETWORK}'s roster against ${LAUNCH}.`}>
          <EvidenceFragment />
        </Picture>
      )
    },
    ...(inbox
      ? [
          {
            id: 'pitches',
            name: 'Triages pitches',
            text: `Paste a day's pitches. Claude reads each one for the guest's public work, Qloo ranks those works against your show by who listens, and the agent drafts a Book, Later, or Decline reply. A reply can be copied only once you approve it.`,
            picture: (
              <Picture caption="Replies drafted to guests pitched to The Harbour.">
                <RepliesFragment />
              </Picture>
            )
          }
        ]
      : []),
    {
      id: 'code',
      name: 'Works from code',
      text: (
        <>
          Programs and assistants start runs, relay the agent&apos;s questions, and edit drafts through the REST API,
          the TypeScript SDK, the MCP server, and Agent Skills. None of them can approve.{' '}
          <a class={linkVariants({ tone: 'text' })} href="#developers">
            For developers
          </a>
        </>
      )
    }
  ]
  return (
    <section aria-labelledby="does-h" data-does class={cn(section, 'xl:grid xl:grid-cols-12 xl:gap-x-6')}>
      <div class="xl:sticky xl:top-8 xl:col-span-5 xl:self-start">
        <h2 id="does-h" class="type-display xl:text-muted-foreground">
          What it does
        </h2>
        <ul class="mt-2 max-xl:hidden">
          {capabilities.map((c) => (
            <li>
              <a
                href={`#does-${c.id}`}
                data-does-link={c.id}
                class="type-display decoration-[0.06em] underline-offset-[0.14em] hover:underline"
              >
                {c.name}
              </a>
            </li>
          ))}
        </ul>
      </div>
      <div class="mt-12 flex flex-col gap-24 md:mt-16 xl:col-span-7 xl:col-start-6 xl:mt-0">
        {capabilities.map((c) => (
          <article id={`does-${c.id}`} data-does-block={c.id} aria-labelledby={`does-${c.id}-h`} class="scroll-mt-8">
            <h3 id={`does-${c.id}-h`} class="type-title xl:sr-only" data-rise>
              {c.name}
            </h3>
            <p class="mt-3 max-w-[60ch] text-pretty xl:mt-0" data-rise>
              {c.text}
            </p>
            {c.picture}
          </article>
        ))}
      </div>
    </section>
  )
}

// What Crossfeed never does, with what it does instead: a table with no lines, every other row on the
// tone step, which folds to one block a row on phones.
const nevers = [
  [
    "Sends a guest's name or a pitch to Qloo.",
    "Only public shows and works are looked up. A guest with no public work is set aside, and a title holding an email address or the guest's own name isn't sent."
  ],
  [
    'Reads a result as a fact about a person.',
    "Fit describes overlapping audiences, never a probability about an individual, and nothing infers anyone's politics, health, or eligibility for anything."
  ],
  [
    'Makes up a score.',
    'Every fit ranking is a Qloo call you can open. The model narrates the evidence and drafts from it.'
  ],
  [
    "Prices a plan with numbers you didn't give it.",
    "Slot value comes from the downloads and CPM your network enters. There's no default CPM; the sample network's is labelled sample."
  ],
  [
    'Approves anything for you.',
    'The agent proposes and you decide. An insertion order exports, and a reply can be copied, only after you approve it. Crossfeed sends no email.'
  ],
  ["Publishes Qloo's data.", "Qloo's responses are cached on Crossfeed's server and shown only in the app."]
]
const Nevers = () => (
  <section aria-labelledby="never-h" class={section}>
    <h2 id="never-h" class="type-display" data-rise>
      <span class="block">What Crossfeed</span> <span class="block lg:pl-[16.666%]">never does</span>
    </h2>
    {/* Explicit roles, so the table stays one to assistive technology when phones set its rows as blocks. */}
    <table
      role="table"
      class="mt-12 -mx-3 w-[calc(100%_+_1.5rem)] table-fixed text-left max-md:block md:mt-16 md:-mx-4 md:w-[calc(100%_+_2rem)]"
      data-rise="2"
    >
      <colgroup>
        <col class="md:w-5/12" />
        <col />
      </colgroup>
      <thead role="rowgroup" class="max-md:sr-only">
        <tr role="row" class="type-ui text-muted-foreground">
          <th role="columnheader" scope="col" class="px-3 pb-3 font-normal md:px-4">
            Crossfeed never
          </th>
          <th role="columnheader" scope="col" class="px-3 pb-3 font-normal md:px-4">
            Instead
          </th>
        </tr>
      </thead>
      <tbody role="rowgroup" class="max-md:block">
        {nevers.map(([never, instead]) => (
          <tr role="row" class="align-baseline odd:bg-muted max-md:flex max-md:flex-col max-md:gap-1 max-md:py-4">
            <th role="rowheader" scope="row" class="px-3 font-semibold md:px-4 md:py-3.5">
              {never}
            </th>
            <td role="cell" class="px-3 md:px-4 md:py-3.5">
              {instead}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </section>
)

// For developers: the four ways in, each linking its docs page; one real call and what it answers,
// with this page's made-up IDs; and the spec list.
const ways = [
  ['/docs/api', 'REST API', 'Every resource of a network under /api/v1, described by an OpenAPI document.'],
  ['/docs/sdk', 'TypeScript SDK', 'Typed methods for every route, for Node, Bun, Deno, and Workers.'],
  ['/docs/mcp', 'MCP server', 'The same operations as tools, for assistants such as Claude Code.'],
  [
    '/docs/agents',
    'Skills and plugin',
    'Agent Skills that plan launch promos and triage pitches, in a Claude Code plugin.'
  ]
]
const READ_RUN = `curl -H "Authorization: Bearer $CROSSFEED_API_KEY" \\
  "$CROSSFEED/api/v1/networks/$NETWORK_ID/launches/$LAUNCH_ID/runs/$RUN_ID"`
const RUN_WAITING = `{
  "id": "6f0d9c4e-2b7a-4c1e-9f53-8a1d2e7b4c90",
  "status": "waiting",
  "startedBy": "API key “Planner”",
  "question": {
    "id": "toolu_01Kx3dV8mJ2pQ7wRb5nTfY9c",
    "kind": "budget",
    "question": "${QUESTION}",
    "options": []
  }
}`
const Developers = ({ inbox }: { inbox: boolean }) => (
  <section id="developers" aria-labelledby="dev-h" class={cn(section, 'lg:grid lg:grid-cols-12 lg:gap-x-6')}>
    <div class="lg:col-span-5">
      <h2 id="dev-h" class="type-display" data-rise>
        For developers
      </h2>
      <div class="mt-6 flex max-w-[56ch] flex-col gap-4" data-rise>
        <p>
          Crossfeed is one Cloudflare Worker. The page is server-rendered, and the workspace talks to its agent over a
          WebSocket: it reads the agent&apos;s synced state and calls its actions, and never writes state itself.
        </p>
        <p>
          Programs and assistants can plan a network&apos;s launches{inbox && <> and triage its pitches</>} too, with
          one of its API keys. None of them can approve: that stays with the network&apos;s members, in the app.
        </p>
      </div>
      <ul class="mt-10 flex flex-col gap-6" data-rise="2">
        {ways.map(([href, name, text]) => (
          <li>
            <a href={href} class="type-title underline decoration-1 underline-offset-[6px] hover:decoration-2">
              {name}
            </a>
            <p class="mt-1 max-w-[52ch]">{text}</p>
          </li>
        ))}
      </ul>
      <p class="mt-10" data-rise="2">
        <a class={buttonVariants({ variant: 'secondary', size: 'lg' })} href="/docs">
          Read the developer docs
        </a>
      </p>
    </div>
    <div class="mt-12 flex min-w-0 flex-col gap-6 lg:col-span-7 lg:col-start-6 lg:mt-0">
      <p class="max-w-[60ch]" data-rise>
        Reading a run with a key from the network&apos;s settings answers 200, here with the run waiting on its question
        (trimmed):
      </p>
      <div data-rise="2">
        <Code label="Shell">{READ_RUN}</Code>
      </div>
      <div data-rise="2">
        <Code label="JSON">{RUN_WAITING}</Code>
      </div>
      <dl class="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-3" data-rise="2">
        {(
          [
            ['Runtime', 'Cloudflare Workers, with a Hono app'],
            ['Agent', 'A Durable Object per session, on the Cloudflare Agents SDK'],
            ['Model', 'Claude Haiku 5.5, through the Anthropic API'],
            ['Scores', "Qloo's REST API, behind one gateway that caches, paces, retries, and caps every call"],
            [
              'Evidence',
              'A record of every Qloo call: its parameters and the names, tags, and scores it returned, numbered per session'
            ],
            [
              'Export',
              <>
                An approved insertion order as CSV, headed <code class="text-[0.875em]">{CSV_HEADER.join(',')}</code>
              </>
            ]
          ] as [string, Child][]
        ).map(([term, text]) => (
          <div class="col-span-full grid grid-cols-subgrid">
            <dt class="font-semibold">{term}</dt>
            <dd class="min-w-0">{text}</dd>
          </div>
        ))}
      </dl>
    </div>
  </section>
)

// The close, the page's one colour field: the question across two lines with the ways in between
// them, the sample first and, while accounts are on, a network of one's own. It meets the footer,
// taking back the margin the shell sets above it.
const Close = ({ accounts }: { accounts: boolean }) => (
  <section
    aria-labelledby="close-h"
    data-band="signal"
    class="mt-24 -mb-24 bg-signal text-signal-foreground md:mt-40 md:-mb-40 lg:mt-48"
  >
    <div class={cn(marketingFrame, 'grid justify-items-center py-20 text-center md:py-28')}>
      <h2
        id="close-h"
        class="col-start-1 row-span-3 row-start-1 grid grid-rows-subgrid type-display text-balance"
        data-rise
      >
        <span class="row-start-1">Try the sample,</span> <span class="row-start-3">or your roster?</span>
      </h2>
      <div class="col-start-1 row-start-2 my-14 flex w-full flex-col items-center gap-5 md:my-20">
        <div class="flex w-full flex-col items-center gap-3 md:w-auto md:flex-row md:gap-8">
          <a class={buttonVariants({ size: 'lg', className: 'max-md:w-[72%]' })} href="/demo">
            Open the sample network
          </a>
          {accounts && (
            <>
              <span>or</span>
              <a
                class={buttonVariants({ variant: 'secondary', size: 'lg', className: 'max-md:w-[72%]' })}
                href="/app/new"
              >
                Create your network
              </a>
            </>
          )}
        </div>
        <p class="max-w-[52ch] text-pretty">
          {accounts
            ? 'The sample needs no sign-in. A network of your own keeps its roster, launches, and members, and its members sign in with passkeys.'
            : 'No sign-in. Clear the sample and paste your own show names to rank them instead.'}
        </p>
      </div>
    </div>
  </section>
)

function Landing({ accounts, inbox }: { accounts: boolean; inbox: boolean }) {
  // The poster's lines, each in its own mask, so it rises from behind its baseline on load; the
  // mask's foot is deep enough for the descender of "y" at the poster's 0.86 leading.
  const line = 'line-mask pb-[0.16em] -mb-[0.16em]'
  return (
    <main>
      <section
        aria-labelledby="hero-h"
        class={cn(
          marketingFrame,
          'flex flex-col pt-[7svh] md:pt-[6svh] lg:min-h-[min(calc(100svh_-_5rem),60rem)] lg:pb-7'
        )}
      >
        <h1 id="hero-h" class="type-poster">
          <span class={line}>
            <span class="block motion-safe:animate-line-up">Rank by</span>
          </span>{' '}
          {/* Nudged down a little from 768px, where it sits under the first line's "y", whose descender
              would touch its "h" at the poster's leading. */}
          <span class={cn(line, 'md:mt-[0.06em] md:text-right')}>
            <span class="block motion-safe:animate-line-up motion-safe:[animation-delay:260ms]">who listens</span>
          </span>
        </h1>
        {/* The sentence and the action on one baseline, the action's fine print hung under it; stacked
            under 1024px. */}
        <div class="mt-[18svh] flex flex-col gap-6 motion-safe:animate-rise-in lg:mt-auto lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-baseline-last lg:gap-x-10 lg:gap-y-3 lg:pt-[12svh]">
          <p class="max-w-[34em] type-title font-normal text-pretty max-md:text-lg/[1.45]">
            An agent that ranks your network&apos;s shows by listener overlap in Qloo, asks you at each fork, and ends
            in an insertion order you approve.
          </p>
          <a
            class={buttonVariants({ size: 'lg', className: 'max-lg:self-start max-md:w-full lg:justify-self-end' })}
            href="/demo"
          >
            Open the sample network
          </a>
          {/* Fine print at 13px, the smallest size the page rules allow on a marketing page (the app's
              captions are 12px). */}
          <p class="-mt-3 max-w-[44ch] text-[0.8125rem] leading-[1.45] text-muted-foreground lg:col-start-2 lg:mt-0 lg:text-right">
            No sign-in. It opens on 19 public show names from The Ringer, with sample figures. Crossfeed isn&apos;t
            affiliated with The Ringer.
          </p>
        </div>
      </section>
      <ReRank />
      <Stages />
      <Capabilities inbox={inbox} />
      <Nevers />
      <Developers inbox={inbox} />
      <Close accounts={accounts} />
    </main>
  )
}

marketing.get(
  '/',
  marketingShell(
    null,
    'Crossfeed ranks a podcast network’s own shows by how much their listeners overlap a launch’s, in Qloo, and drafts the promo plan as an insertion order you approve.',
    { reveal: true }
  ),
  (c) => c.render(<Landing accounts={c.env.ACCOUNTS === 'on'} inbox={c.env.GUEST_PITCHES === 'on'} />)
)

// The day the privacy page and the beta terms last changed.
const UPDATED = '19 October 2026'

// The reading pages' grid: a heading in the narrow column, its text in the wide one.
const ledger = 'grid items-baseline gap-x-10 gap-y-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]'

// A real table that scrolls sideways inside itself, never the page, when it's wider than the screen,
// as the app's ScrollTable does: a named region the keyboard can reach and scroll.
export const TableScroll = ({ label, children }: { label: string; children: Child }) => (
  <div class="max-w-full overflow-x-auto overscroll-x-contain" role="region" aria-label={label} tabindex={0}>
    {children}
  </div>
)

// A code sample, captioned above by its language or the file it is, on a tone-step panel: 14px
// monospace that scrolls sideways inside the panel, and the keyboard can reach to scroll. The
// developer docs and the landing page's developers section set theirs in it. Code isn't translated, and
// a sideways scroll stops at its ends rather than going on to swipe the page back.
export const Code = ({ label, file, children }: { label?: string; file?: string; children: string }) => (
  <figure class="overflow-hidden rounded-xl bg-muted">
    <figcaption class="px-4 pt-3 type-caption text-muted-foreground">
      {file ? <code class="bg-transparent p-0 text-xs">{file}</code> : label}
    </figcaption>
    <pre
      tabindex={0}
      translate="no"
      class="overflow-x-auto overscroll-x-contain px-4 pt-2 pb-4 type-ui leading-[1.6] focus-visible:-outline-offset-2"
    >
      <code>{children.trim()}</code>
    </pre>
  </figure>
)

// The privacy page and the beta terms: the title at display size, its lede and the day it last
// changed, then each section a band across the page, every other one on the tone step.
const Doc = ({ id, title, lede, children }: { id: string; title: string; lede: string; children: Child }) => (
  <main class="pt-8 md:pt-16">
    <article aria-labelledby={id}>
      <header class={cn(marketingFrame, ledger, 'pb-12 md:pb-20')}>
        <h1 id={id} class="type-display">
          {title}
        </h1>
        <div>
          <p class="max-w-[40ch] text-2xl/[1.3] tracking-[-0.01em]">{lede}</p>
          <p class="mt-4 text-muted-foreground">Last updated {UPDATED}.</p>
        </div>
      </header>
      <div>{children}</div>
    </article>
  </main>
)

// One section of the privacy page or the terms: its heading on the left, its text on the right at a
// reading measure.
const Part = ({ id, title, children }: { id: string; title: string; children: Child }) => (
  <section aria-labelledby={id} class="py-12 even:bg-muted md:py-16">
    <div class={cn(marketingFrame, ledger)}>
      <h2 id={id} class="type-title text-balance">
        {title}
      </h2>
      <div class="prose-doc flex max-w-[64ch] flex-col gap-4">{children}</div>
    </div>
  </section>
)

function Privacy({ accounts }: { accounts: boolean }) {
  return (
    <Doc
      id="privacy"
      title="Privacy."
      lede="What the Crossfeed beta sends to Qloo and to Anthropic, what it keeps, and how it's deleted."
    >
      <Part id="qloo" title="What reaches Qloo">
        <p>
          Qloo scores the roster and the pitched works. Crossfeed sends it only public names and Qloo&apos;s own IDs:
        </p>
        <ul>
          <li>
            the names of shows and works to look up: the roster&apos;s shows, the launch or its comps, the past
            guests&apos; works, and each pitched book, film, TV show, or podcast;
          </li>
          <li>Qloo&apos;s IDs for those shows and works, to rank them, compare their tags, and check demographics.</li>
        </ul>
        <p>
          Never a pitch&apos;s text, a guest&apos;s name, an email address, or a sender&apos;s details. A pitch with no
          public work is set aside, and a work title that holds an email address, or the guest&apos;s or sender&apos;s
          name, isn&apos;t sent. Requests carry Crossfeed&apos;s key and nothing about you.
          {accounts && (
            <>
              {' '}
              A network that adds its own Qloo key sends its requests with that key instead, to the Qloo host it chose.
            </>
          )}{' '}
          Qloo&apos;s terms let it improve its service from the anonymized lists of entities sent to its recommendation
          endpoint.
        </p>
      </Part>

      <Part id="anthropic" title="What reaches Anthropic">
        <p>
          Claude Haiku 5.5, through Anthropic&apos;s API, runs the agent, the topic ranking, and the pitch reader. It
          gets:
        </p>
        <ul>
          <li>
            the launch&apos;s name or its comps, the roster&apos;s show names and descriptions, and what Qloo returned
            for them;
          </li>
          <li>the answers you give the agent, and the slot values Crossfeed works out from your downloads and CPM;</li>
          <li>
            for the inbox, each pitch as you load it, its sender and subject included, and the past guests you name.
          </li>
        </ul>
        <p>
          The sample inbox is made up. Real pitches would send their text and senders to Anthropic, so load only pitches
          you&apos;re allowed to share.
        </p>
      </Part>

      <Part id="keeps" title="What Crossfeed keeps">
        {/* Each kind of storage, led by where it is. */}
        <ul class="flex list-none flex-col gap-4 pl-0 [&>li]:mt-0 [&>li]:flex [&>li]:flex-col [&>li]:gap-4">
          <li>
            <p>
              <b>In your browser:</b> one cookie, <code>crossfeed_session</code>, a random ID that names your session.
              It&apos;s HttpOnly and lasts {SESSION_DAYS} days. There are no analytics, ads, or third-party scripts.
            </p>
          </li>
          <li>
            <p>
              <b>In your session:</b> the roster and your edits, launches, every run with its conversation with Claude,
              insertion orders, the pitches you load, draft replies, and the evidence record of every Qloo call.
            </p>
          </li>
          {accounts && (
            <li>
              <p>
                <b>With an account:</b> your name; your passkeys&apos; public keys, each with the browser it was added
                from; and only hashes of your session and recovery code. The networks you create or join, with your role
                in each and when you joined and last opened it.
              </p>
              <p>
                Invite links are kept only as hashes, with who made each, who used it, and when, and are deleted once
                they expire, seven days after they&apos;re made. A network&apos;s API keys are kept only as hashes, with
                each key&apos;s name and first characters, who made it, when, and the last minute it was used.
              </p>
              <p>
                Each network&apos;s roster, CPM, and inbox are kept in its own storage, with the member who approved
                each reply, and each of its launches in storage of its own: its runs, a copy of the roster and CPM each
                run ranked, with their Qloo records, the name of the member or API key that started each run, and of the
                member who approved each insertion order, and when. Only the network&apos;s members and its API keys can
                open them.
              </p>
              <p>
                A network&apos;s own Qloo key, if an owner adds one, is kept encrypted in the network&apos;s own Qloo
                storage, with the host it&apos;s for and its last four characters, the only part of it anyone is shown.
                That storage also caches the answers to the network&apos;s Qloo calls and counts them, apart from every
                other network&apos;s.
              </p>
            </li>
          )}
          <li>
            <p>
              <b>Uploads:</b> a file you upload is read in your browser
              {accounts && <>, or by Crossfeed when a program sends it to the API</>}. A roster file&apos;s text is sent
              and imported like pasted names; of pitch emails, only each one&apos;s sender, subject, and text are sent,
              never its attachments or other headers. The files themselves aren&apos;t kept.
            </p>
          </li>
          <li>
            <p>
              <b>Shared by every session:</b> Qloo&apos;s responses with the requests they answered, cached with no
              expiry in one cache that every visitor{accounts && <> and every network without its own Qloo key</>}{' '}
              shares. A call someone else made first is answered from it, and its evidence says the cache was hit, so a
              hit can show that another visitor{accounts && <> or network</>} looked up the same name; nothing else of
              theirs is shown, and the cache is never published.
            </p>
            <p>
              Also shared: the sample launch&apos;s stored run, which replays when Qloo can&apos;t be called; and each
              visitor&apos;s{accounts && <> and each network&apos;s</>} counts for the day against the limits in the{' '}
              <a href="/terms">beta terms</a>.
            </p>
          </li>
          <li>
            <p>
              <b>In the logs:</b> one line per Qloo call and per model call, with its timing and counts, and one per
              run. They hold no roster, pitch, or address.
            </p>
          </li>
        </ul>
      </Part>

      <Part id="address" title="Your address">
        <p>
          Crossfeed never stores your IP address or writes it to its own logs. When the page connects to its agent, the
          address is hashed with a secret salt, and the hash stays with the connection. The day&apos;s counts are kept
          under a hash of that hash and the UTC day, and earlier days&apos; counts are deleted.
          {accounts && <> Sign-in requests are counted for a minute under the salted hash.</>} Cloudflare, which runs
          Crossfeed, also records each request the Worker serves in its own logs.
        </p>
      </Part>

      <Part id="deletion" title="How deletion works">
        <p>
          Crossfeed can&apos;t delete a session yet, and doesn&apos;t delete old sessions on a schedule. When the cookie
          expires or you clear it, your next visit starts a new session, and no browser can reach the old one again, but
          its storage stays. So load nothing into the sample network that you&apos;d want deleted later. Earlier
          days&apos; counts are deleted; cached Qloo responses are kept, and never published.
        </p>
        {accounts && (
          <>
            <p>
              Leaving a network, or being removed from it, deletes your membership at once, and your open pages of it
              close. Crossfeed keeps only a note that you were in it, so deleting your account later forgets your name
              there too. What you added to the network stays with the network.
            </p>
            <p>
              Deleting a launch, which any of the network&apos;s members can do, wipes its storage: its runs, insertion
              orders, the roster copies, and their Qloo records. Removing a network&apos;s own Qloo key, which only an
              owner can do, wipes its Qloo storage at once: the key, its cached answers, and its counts. Deleting a
              network, which only an owner can do, deletes its memberships, invite links, and API keys at once, then
              wipes its own storage, each of its launches&apos;, and its Qloo storage. A wipe that fails is tried again
              by the next day&apos;s cleanup, which also deletes expired sessions, sign-in challenges, and invite links.
            </p>
            <p>
              Deleting your account, on your account page, deletes your account with its name, passkeys, recovery code,
              sessions, and memberships at once. What you did in a network stays with it, but not your name: the
              launches of the networks you&apos;re in, or were in before, say &ldquo;Former member&rdquo; on the runs
              you started and the orders you approved, and the replies you approved no longer say who did. The API keys
              and invite links you made are revoked at once too, as they are when an owner leaves a network, is removed,
              or is made a member. A network that can&apos;t be reached at once forgets your name at the next day&apos;s
              cleanup. It&apos;s refused while you&apos;re a network&apos;s only owner.
            </p>
            <p>&ldquo;Sign out everywhere&rdquo; deletes every session of yours.</p>
          </>
        )}
      </Part>

      <Part id="others" title="Who else handles it">
        <p>
          Crossfeed runs on Cloudflare Workers, which hosts the app and its storage. Cloudflare, Qloo, and Anthropic
          handle what reaches them under their own policies:{' '}
          <a href="https://www.cloudflare.com/privacypolicy/">Cloudflare&apos;s</a>,{' '}
          <a href="https://www.qloo.com/legal/privacy">Qloo&apos;s</a>, and{' '}
          <a href="https://www.anthropic.com/legal/privacy">Anthropic&apos;s</a>.
        </p>
      </Part>
    </Doc>
  )
}

// A daily limit from wrangler.jsonc, formatted; a value that isn't a number shows as 0.
export const cap = (value: string) => (Number(value) || 0).toLocaleString('en-US')

// A row of the daily limits: what's limited, with what counts as one under it, then the two caps.
const Limit = ({
  what,
  counts,
  visitor,
  everyone
}: {
  what: string
  counts: string
  visitor: string
  everyone: string
}) => (
  <tr>
    <th scope="row">
      {what}
      <span class="block font-normal text-muted-foreground">{counts}</span>
    </th>
    <td class="text-right whitespace-nowrap">{visitor}</td>
    <td class="text-right whitespace-nowrap">{everyone}</td>
  </tr>
)

function Terms({ env }: { env: Env }) {
  return (
    <Doc id="terms" title="Beta terms." lede="The terms of the free Crossfeed beta. Using it means you accept them.">
      <Part id="free" title="Free">
        <p>
          The beta is free: Crossfeed charges nothing and asks for no payment details. Its Qloo calls run on
          Crossfeed&apos;s Qloo Agentic Hackathon key, so the beta can&apos;t be sold, and it may stop scoring when Qloo
          deactivates hackathon keys after the hackathon closes.
          {env.ACCOUNTS === 'on' && (
            <>
              {' '}
              A network&apos;s owner can add the network&apos;s own Qloo key in its settings; its Qloo calls then run on
              that key, under the owner&apos;s own agreement with Qloo.
            </>
          )}
        </p>
      </Part>

      <Part id="warranty" title="No warranty">
        <p>
          Crossfeed is provided as is, with no warranty of any kind. It can be wrong, slow, capped, or offline, and it
          can change or end at any time. Its rankings describe overlapping audiences in Qloo, not a promise of results.
          Check a plan before you approve it: no order exports and no reply can be copied until you do, and what you
          approve is your decision.
        </p>
      </Part>

      <Part id="limits" title="Daily limits">
        <p>
          Limits keep the beta&apos;s spend and storage bounded. A day is a UTC day, and counts reset at 00:00 UTC. A
          visitor is an IP address, or an IPv6 address by its /64.
          {env.ACCOUNTS === 'on' && (
            <>
              {' '}
              A network counts as one visitor of its own, whichever of its members makes the network&apos;s calls and
              runs. A network with its own Qloo key counts its Qloo calls on that key, apart from everyone else&apos;s,
              against the same limits; its model runs count with everyone&apos;s.
            </>
          )}
        </p>
        <TableScroll label="Daily limits">
          <table class="table-doc">
            <thead>
              <tr>
                <th scope="col">A day</th>
                <th scope="col" class="text-right">
                  Each visitor
                </th>
                <th scope="col" class="text-right">
                  Everyone
                </th>
              </tr>
            </thead>
            <tbody>
              <Limit
                what="Model runs"
                counts="a launch run, an inbox load, or a pitch run"
                visitor={cap(env.RUN_VISITOR_DAILY_CAP)}
                everyone={cap(env.RUN_DAILY_CAP)}
              />
              <Limit
                what="Starts that call no model"
                counts="a replay, or a run that stops at once"
                visitor={cap(env.FREE_START_DAILY_CAP)}
                everyone="–"
              />
              <Limit
                what="Qloo calls"
                counts="cache hits count for a visitor, not for everyone"
                visitor={cap(env.QLOO_VISITOR_DAILY_CALL_CAP)}
                everyone={cap(env.QLOO_DAILY_CALL_CAP)}
              />
            </tbody>
          </table>
        </TableScroll>
        <p>
          {env.ACCOUNTS === 'on' && (
            <>
              A member can create at most {cap(env.NETWORKS_PER_MEMBER)} networks, and a network can keep at most{' '}
              {cap(env.LAUNCHES_PER_NETWORK)} launches and {cap(env.INVITES_PER_NETWORK)} open invite links at once. One
              member&apos;s invite links can bring in at most {cap(env.INVITED_SIGNUP_DAILY_CAP)} new accounts a UTC
              day.{' '}
            </>
          )}
          A run makes at most {MAX_TURNS} model turns and {MAX_QLOO_CALLS} Qloo calls, and an inbox holds at most{' '}
          {MAX_PITCHES} pitches of up to {MAX_PITCH_CHARS.toLocaleString('en-US')} characters each. At a limit, the
          unchanged sample launch replays its stored run; anything else is refused or stops, and says which limit it
          reached.
          {env.ACCOUNTS === 'on' && (
            <>
              {' '}
              Each API key, and each visitor&apos;s sign-in requests, are also limited per minute; a request past the
              limit is refused, and says to wait a minute.
            </>
          )}
        </p>
      </Part>

      <Part id="use" title="Acceptable use">
        <p>Use the beta to plan promos and triage pitches for shows you work on. Don&apos;t:</p>
        <ul>
          <li>
            load pitches, rosters, or anything else you aren&apos;t allowed to share with Crossfeed, Qloo, and
            Anthropic;
          </li>
          <li>use its rankings to judge, profile, or decide anything about an individual person;</li>
          <li>try to get around the limits, reach another visitor&apos;s session, or overload the service;</li>
          <li>copy, scrape, or republish the Qloo data it shows you.</li>
        </ul>
      </Part>

      <Part id="changes" title="Changes">
        <p>
          These terms change with the beta; the date above says when they last did. The{' '}
          <a href="/privacy">privacy page</a> says what Crossfeed sends and keeps.
        </p>
      </Part>
    </Doc>
  )
}

marketing.get('/privacy', marketingShell('Privacy'), (c) => c.render(<Privacy accounts={c.env.ACCOUNTS === 'on'} />))
marketing.get('/terms', marketingShell('Beta terms'), (c) => c.render(<Terms env={c.env} />))

// The 404 page's body: ways back home, to the sample network, and while ACCOUNTS is on, to the
// visitor's networks.
const NotFound = ({ accounts }: { accounts: boolean }) => (
  // At least 60% of the window tall, so the footer's full-width name starts at the fold rather than in
  // the first screen, where it would outweigh the page's heading, without a window of nothing above it.
  <main
    class={cn(
      marketingFrame,
      'grid min-h-[60svh] content-start gap-x-10 gap-y-6 pt-16 md:pt-32 lg:grid-cols-2 lg:items-baseline'
    )}
  >
    <h1 class="type-display">
      <span class="line-mask">
        <span class="block motion-safe:animate-line-up">Not on the roster.</span>
      </span>
    </h1>
    <div class="motion-safe:animate-rise-in">
      <p class="max-w-[46ch]">
        Crossfeed has no page at this address. The link may be mistyped, or what it led to was deleted.
      </p>
      <ul class="mt-8 flex flex-wrap gap-3">
        <li>
          <a class={buttonVariants({ variant: 'secondary', size: 'lg' })} href="/">
            Home
          </a>
        </li>
        <li>
          <a class={buttonVariants({ variant: 'secondary', size: 'lg' })} href="/demo">
            Sample network
          </a>
        </li>
        {accounts && (
          <li>
            <a class={buttonVariants({ variant: 'secondary', size: 'lg' })} href="/app">
              Your networks
            </a>
          </li>
        )}
      </ul>
    </div>
  </main>
)

// What the Worker answers when nothing serves a request, or a route refuses one as not found: the 404
// page, in the marketing shell, to a browser asking for a page (a GET that accepts HTML); otherwise,
// and always under /api, /agents, /mcp, and /auth and for a CSV download, Hono's plain 404, which
// programs and WebSocket upgrades read.
export const notFound: NotFoundHandler<{ Bindings: Env }> = (c) => {
  const path = c.req.path
  const page =
    c.req.method === 'GET' &&
    (c.req.header('Accept') ?? '').includes('text/html') &&
    !/^\/(api|agents|mcp|auth)(\/|$)/.test(path) &&
    !path.endsWith('.csv')
  if (!page) return c.text('404 Not Found', 404)
  const accounts = c.env.ACCOUNTS === 'on'
  return c.html(
    html`<!DOCTYPE html>${(
        <MarketingPage title="Not found" path={path} accounts={accounts}>
          <NotFound accounts={accounts} />
        </MarketingPage>
      )}`,
    404
  )
}
