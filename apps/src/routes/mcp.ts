// The MCP server at /mcp, for assistants: stateless Streamable HTTP, reached with one of a network's
// API keys, which the route checks before the handler runs. Its tools are thin adapters over the
// operations module, as the REST API's routes are, and take their inputs through the API's own zod
// schemas. Each answers in concise text for the assistant, with what to do next, and with the
// operation's result as structured content, the text beside it as `summary`: Claude Code gives its
// model the structured content alone. There's no approve tool: a member approves in the app (ADR 0002).
import { z } from '@hono/zod-openapi'
import {
  McpServer,
  localhostAllowedOrigins,
  type CallToolResult,
  type ListToolsResult,
  type StandardSchemaWithJSON,
  type ToolCallback
} from '@modelcontextprotocol/server'
import { createMcpHandler } from 'agents/mcp/server'
import { env } from 'cloudflare:workers'
import { Hono } from 'hono'
import type { Question, Show } from '../agent'
import { accountsOn, appOrigins, keyFor } from '../auth'
import type { Evidence } from '../evidence'
import { NO_ANGLE, type PitchList } from '../fit'
import type { Pitch, WorkCandidate } from '../inbox'
import {
  answerLaunchRun,
  answerPitchRun,
  confirmWork,
  createLaunch,
  editOrder,
  getInbox,
  getLaunch,
  getLaunchEvidence,
  getNetwork,
  getPitchRun,
  listPitchRuns,
  getRoster,
  importRoster,
  listLaunches,
  loadInbox,
  searchComps,
  startLaunchRun,
  startPitchRun,
  updateShow,
  type InboxInfo,
  type LaunchInfo,
  type LaunchRow,
  type LaunchRun,
  type OperationContext,
  type OrderInfo,
  type PitchRun,
  type Roster
} from '../operations'
import { dollars } from '../order'
import { Refusal, refusalCode } from '../refusal'
import type { Candidate } from '../resolve'
import { networkLinks } from '../shell'
import { listOf } from '../text'
import { readPitchUpload, readRosterUpload } from '../upload'
import {
  Answer,
  CompQuery,
  LaunchPlan,
  OrderChange,
  PitchBatch,
  PitchRunStart,
  ShowChange,
  WorkConfirmation,
  batchPitches,
  pitchRunInput,
  refusal,
  uploadLimit
} from './api'

// Every tool's description ends with it, as every tool can be the one an assistant reads a run's
// question through.
export const RELAY =
  'When a run is waiting on a question, ask the human that question as it is and answer with their words; never answer it yourself.'

// What a tool gives back: text for the assistant to read, and the operation's result.
type Answered = { text: string; structured: Record<string, unknown> }

// The server for one request, for the network the request's key reaches. Its links go to the app's
// own origin, where a member signs in to approve.
function serverFor(ctx: OperationContext) {
  const links = networkLinks(env, ctx.network)
  const app = (path: string) => `${appOrigins(env)[0]}${path}`
  const launchPage = (id: string) => app(`${links.launches}/${id}`)
  const approvesOrder = `Only a member of the network approves an insertion order, in the app on its launch's page, ${launchPage('<launchId>')}.`
  const server = new McpServer(
    { name: 'crossfeed', version: '1.0.0' },
    {
      instructions: [
        `Crossfeed plans a podcast network's launch promos by fit in Qloo${links.inbox ? ', and triages its guest pitches,' : ''} for the network this API key belongs to.`,
        "To plan a launch, set up the roster (get_roster), create a launch, start a run, then read it with get_launch until it's done or waiting on a question.",
        ...(links.inbox
          ? [
              'To triage pitches, load them (load_pitches), read the inbox until every pitch is read, start a pitch run against a roster show, then read it with get_pitch_run.'
            ]
          : []),
        RELAY,
        links.inbox
          ? `Nothing here approves an insertion order or a reply: a member of the network approves an order in the app on its launch's page, which get_launch links, and a reply on the inbox page, at ${app(links.inbox)}.`
          : "Nothing here approves an insertion order: a member of the network approves it in the app on its launch's page, which get_launch links."
      ].join(' ')
    }
  )

  // Registers a tool whose refusals reach the assistant as tool errors, with their code.
  const tool = <S extends StandardSchemaWithJSON>(
    name: string,
    description: string,
    input: S,
    annotations: { readOnlyHint: boolean; destructiveHint: boolean },
    run: (input: StandardSchemaWithJSON.InferOutput<S>) => Promise<Answered>
  ) =>
    server.registerTool(
      name,
      {
        description: `${description} ${RELAY}`,
        inputSchema: input,
        annotations
      },
      // The SDK's callback type is conditional on the schema, which a generic one can't resolve.
      (async (args: StandardSchemaWithJSON.InferOutput<S>): Promise<CallToolResult> => {
        try {
          const { text, structured } = await run(args)
          return { content: [{ type: 'text', text }], structuredContent: { ...structured, summary: text } }
        } catch (error) {
          const code = refusalCode(error)
          let message = (error as Error).message
          if (!code) {
            console.error(JSON.stringify({ event: 'mcp_error', tool: name, error: String(error) }))
            message = 'Something went wrong in Crossfeed. Try again in a moment.'
          }
          return {
            isError: true,
            content: [{ type: 'text', text: message }],
            structuredContent: { error: { code: code ?? 'internal', message } }
          }
        }
      }) as ToolCallback<S>
    )
  const READ = { readOnlyHint: true, destructiveHint: false }
  const WRITE = { readOnlyHint: false, destructiveHint: false }
  const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true }
  const none = z.object({})
  const launchId = z.string().describe('The ID the launch answered with when it was created.')

  tool(
    'get_network',
    'Read the network: its name, ID, and CPM, which prices every promo slot.',
    none,
    READ,
    async () => {
      const network = await getNetwork(ctx)
      const cpm = network.cpm === null ? 'no CPM yet: an owner sets it in settings' : `a ${dollars(network.cpm)} CPM`
      return {
        text: `${network.name} (network ${network.id}), ${cpm}. In the app: ${app(links.dashboard)}`,
        structured: network
      }
    }
  )

  tool(
    'get_roster',
    "Read the network's roster: each show, how it matched in Qloo, its downloads per episode, and whether it's left out of launches. It's `pending` while any show is being looked up; read it again until it's `settled`.",
    none,
    READ,
    async () => {
      const roster = await getRoster(ctx)
      return { text: rosterText(roster), structured: roster }
    }
  )

  tool(
    'import_roster',
    "Import the network's roster: a CSV with a `name` column and optional `downloads`, `status`, and `description` columns (format `csv`), or one show name per line (format `lines`), at most 50 shows. It returns at once with the new shows pending; read the roster until it's settled. Over a roster that has shows, set `replace`: the shows already on it keep their matches, comps, and exclusions, and only the figures the import brings change.",
    z.object({
      roster: z.string().describe('The CSV, or the show names, one per line.'),
      format: z.enum(['csv', 'lines']),
      replace: z.boolean().optional().describe('Import over a roster that has shows.')
    }),
    DESTRUCTIVE,
    async ({ roster, format, replace = false }) => {
      const read = await readRosterUpload([new File([roster], format === 'csv' ? 'roster.csv' : 'roster.txt')])
      const imported = await importRoster(ctx, { ...read, replace })
      return { text: rosterText(imported), structured: imported }
    }
  )

  tool(
    'update_show',
    "Settle or edit one show, named as on the roster: pick one of an ambiguous show's candidates (`entityId`), map a show Qloo has no match for to one of its comp search's results (`compId`), or change its downloads per episode, status, or exclusion from launches. A field left out stays as it is.",
    ShowChange.extend({ name: z.string().describe('The show, named as on the roster.') }),
    DESTRUCTIVE,
    async ({ name, ...patch }) => {
      const show = await updateShow(ctx, { name, patch })
      return { text: showLine(show), structured: show }
    }
  )

  tool(
    'search_comps',
    "Search Qloo for a comparable show to stand in for one it has no match for. It returns at once with the search pending; read the roster until it's settled, then map the show to a result with update_show and `compId`.",
    CompQuery.extend({ name: z.string().describe('The show, named as on the roster.') }),
    WRITE,
    async (input) => {
      const show = await searchComps(ctx, input)
      return { text: showLine(show), structured: show }
    }
  )

  tool('list_launches', "List the network's launches, newest first, as its dashboard does.", none, READ, async () => {
    const launches = await listLaunches(ctx)
    const text = launches.length
      ? launches.map((l) => `- ${launchLine(l)}. ${launchPage(l.id)}`).join('\n')
      : 'No launches yet: plan one with create_launch.'
    return { text, structured: { launches } }
  })

  tool(
    'create_launch',
    "Plan a new launch by its name, as Qloo lists a released show, or by up to three released shows as comps for an unreleased one. It joins the network's dashboard; start a run with start_launch_run to rank the roster for it. A network keeps a limited number of launches at once; past it, a member deletes one on the dashboard to make room.",
    LaunchPlan,
    WRITE,
    async (plan) => {
      const launch = await createLaunch(ctx, plan)
      return {
        text: `Created ${launchTitle(launch)} (launch ${launch.id}). Its page in the app: ${launchPage(launch.id)}\nStart a run with start_launch_run.`,
        structured: launch
      }
    }
  )

  tool(
    'start_launch_run',
    `Start a run of a launch: it ranks the network's roster by fit with the launch's listeners in Qloo, asks the human what it needs, such as the budget, and drafts an insertion order priced at the network's CPM. With no name or comps it plans the launch as it stands. It returns at once; read the launch with get_launch until the run is done or waiting on a question. It counts as one of the network's model runs, and ends a run left waiting. ${approvesOrder}`,
    LaunchPlan.extend({ launchId }),
    DESTRUCTIVE,
    async ({ launchId, ...plan }) => {
      const run = await startLaunchRun(ctx, { launchId, plan })
      return {
        text: `${runLine(run)}\nRead it with get_launch until it's done or waiting on a question.`,
        structured: run
      }
    }
  )

  tool(
    'get_launch',
    `Read a launch: its status, and its latest run as it stands: the question it waits on and how to answer it, the chart of roster shows by fit, and the draft insertion order. ${approvesOrder}`,
    z.object({ launchId }),
    READ,
    async (input) => {
      const launch = await getLaunch(ctx, input)
      return { text: launchText(launch, launchPage(launch.id)), structured: launch }
    }
  )

  tool(
    'answer_launch_question',
    "Answer the question a launch's latest run is waiting on, with the human's words, by its ID and with the fields its kind takes: `choice` or `text` for `choice`; `choice` (one of its options) or `text` (the name Qloo lists the launch under) for `launch`; `slots` or `dollars` for `budget`; `exclude`, from its options, for `exclusions`; `comps` or `text` for `comps`; and `picks` for `confirm_comps`. The run resumes; read the launch again with get_launch.",
    Answer.extend({ launchId, runId: z.string().describe('The run waiting on the question.') }),
    WRITE,
    async ({ launchId, runId, questionId, ...answer }) => {
      const run = await answerLaunchRun(ctx, { launchId, runId, questionId, answer })
      return { text: `Answered. ${runLine(run)}\nRead the launch again with get_launch.`, structured: run }
    }
  )

  tool(
    'edit_order',
    `Change the lines of a launch's current insertion order, once its run has ended: each finalist's promo slots and host-read angle, or drop a show by leaving its line out. Code prices it again at the network's CPM. Editing an approved order returns it to draft. ${approvesOrder}`,
    OrderChange.extend({ launchId, orderId: z.string().describe('Such as IO-0001.') }),
    DESTRUCTIVE,
    async ({ launchId, orderId, lines }) => {
      const order = await editOrder(ctx, { launchId, orderId, lines })
      return { text: orderText(order, launchPage(launchId)), structured: order }
    }
  )

  tool(
    'get_evidence',
    "Read a launch's evidence: the Qloo calls its runs made, each with what was sent and what came back, scores included. Name one `call`, such as the chart's, to read that call alone in full.",
    z.object({ launchId, call: z.string().optional().describe('A call number the run cites, such as C-07.') }),
    READ,
    async ({ launchId, call }) => {
      const all = await getLaunchEvidence(ctx, { launchId })
      const evidence = call === undefined ? all : all.filter((e) => e.call === call)
      if (call !== undefined && !evidence.length)
        throw new Refusal('not_found', `There's no call ${call} in this launch's evidence.`)
      const text =
        call === undefined ? evidence.map(evidenceLine).join('\n') || 'No Qloo calls yet.' : evidenceText(evidence[0])
      return { text, structured: { evidence } }
    }
  )

  // The inbox and its pitch runs exist only while guest pitches are on, as in the app.
  const inbox = links.inbox
  if (!inbox) return server
  const approvesReply = `Only a member of the network approves a reply, in the app on the inbox page, ${app(inbox)}.`
  const runId = z.string().describe('The ID the pitch run answered with when it started.')

  tool(
    'get_inbox',
    "Read the network's inbox: each pitch, the guest and public work the agent read in it, and how the work matched in Qloo. It's `reading` while any pitch is being read or its work looked up; read it again until it's `done`.",
    none,
    READ,
    async () => {
      const read = await getInbox(ctx)
      return { text: inboxText(read), structured: read }
    }
  )

  tool(
    'load_pitches',
    "Load a day's guest pitches into the inbox, at most 50: as `text`, with a line of three dashes between pitches, where a pitch's first lines may give its `From:` and `Subject:`; or as `pitches`, each with its `body` and any `from` and `subject`. Only each pitch's public work, its title and type, reaches Qloo, never a guest's name or a sender. It returns at once with the pitches reading; read the inbox until it's done. Reading them counts as one of the network's model runs. Over an inbox that has pitches, set `replace`: they go, with the last pitch run's lists and replies.",
    z.object({
      text: z.string().optional().describe('The pitches as plain text.'),
      pitches: PitchBatch.shape.pitches.optional(),
      replace: z.boolean().optional().describe('Load over an inbox that has pitches.')
    }),
    DESTRUCTIVE,
    async ({ text, pitches, replace = false }) => {
      if ((text === undefined) === (pitches === undefined))
        throw new Refusal('invalid', 'Give the pitches as `text` or as `pitches`: one of the two.')
      const read =
        text === undefined
          ? batchPitches({ pitches: pitches! })
          : await readPitchUpload([new File([text], 'pitches.txt')])
      const loaded = await loadInbox(ctx, { pitches: read, replace })
      return { text: inboxText(loaded), structured: loaded }
    }
  )

  tool(
    'confirm_work',
    "Confirm which of an ambiguous work's same-title candidates a pitch is about, by the human's choice. Only a work matched in Qloo is ranked.",
    WorkConfirmation.extend({ pitchId: z.string().describe('Such as pitch-03.') }),
    DESTRUCTIVE,
    async (input) => {
      const pitch = await confirmWork(ctx, input)
      return { text: pitchLine(pitch), structured: pitch }
    }
  )

  tool(
    'start_pitch_run',
    `Start a pitch run: it ranks the inbox's pitched works against a roster show matched in Qloo, and against its best past guests' works too, then drafts a reply to every pitch. It returns at once; read it with get_pitch_run until it's done or waiting on a question. It counts as one of the network's model runs, and ends a run left waiting. ${approvesReply}`,
    PitchRunStart,
    DESTRUCTIVE,
    async (input) => {
      const run = await startPitchRun(ctx, pitchRunInput(input))
      return {
        text: `${pitchRunLine(run)}\nRead it with get_pitch_run until it's done or waiting on a question.`,
        structured: run
      }
    }
  )

  tool(
    'list_pitch_runs',
    "List the network's pitch runs, newest first: the first is the latest, whose replies the inbox holds. Read one, with the replies it drafted, with get_pitch_run.",
    none,
    READ,
    async () => {
      const pitchRuns = await listPitchRuns(ctx)
      const text = pitchRuns.length
        ? [
            ...pitchRuns.map((r) => `- Pitch run ${r.id} for ${r.show}, started ${r.startedAt}: ${r.status}.`),
            'Newest first: the first is the latest. Read one, with the replies it drafted, with get_pitch_run.'
          ].join('\n')
        : 'No pitch runs yet: start one with start_pitch_run.'
      return { text, structured: { pitchRuns } }
    }
  )

  tool(
    'get_pitch_run',
    `Read a pitch run: its status, the question it waits on and how to answer it, its ranked lists, one per work type, and the reply it drafted to each pitch. ${approvesReply}`,
    z.object({ runId }),
    READ,
    async (input) => {
      const run = await getPitchRun(ctx, input)
      return { text: pitchRunText(run, app(inbox)), structured: run }
    }
  )

  tool(
    'answer_pitch_question',
    "Answer the question a pitch run is waiting on, with the human's words, by its ID: one of its options as `choice`, or their own words as `text`. The run resumes; read it again with get_pitch_run.",
    Answer.extend({ runId }),
    WRITE,
    async ({ runId, questionId, ...answer }) => {
      const run = await answerPitchRun(ctx, { runId, questionId, answer })
      return { text: `Answered. ${pitchRunLine(run)}\nRead it again with get_pitch_run.`, structured: run }
    }
  )

  return server
}

// A roster as the assistant reads it: one line per show, saying what each unsettled one needs.
const rosterText = (roster: Roster) =>
  [
    `Roster: ${roster.status}, ${roster.shows.length} show${roster.shows.length === 1 ? '' : 's'}.`,
    ...(roster.sample ? [roster.sample.notice] : []),
    ...roster.shows.map((show) => `- ${showLine(show)}`)
  ].join('\n')

const entities = (candidates: Candidate[]) => candidates.map((c) => `${c.id} ${c.name}`).join(', ')

function showLine(show: Show) {
  const match = {
    pending: 'being looked up in Qloo.',
    resolved: `matched ${show.entity && entities([show.entity])}.`,
    mapped: `mapped to the comp ${show.entity && entities([show.entity])}.`,
    ambiguous: `ambiguous among ${entities(show.candidates)}. Pick one with update_show and entityId.`,
    missed: 'no match in Qloo.',
    failed: `its search failed: ${show.error}`
  }[show.resolution]
  const figures = [
    show.downloads !== null && `${show.downloads.toLocaleString('en-US')} downloads per episode`,
    show.excluded && 'left out of launches'
  ].filter(Boolean)
  const comps = show.resolution === 'missed' ? ` ${compSearchText(show.compSearch)}` : ''
  return `${show.name}: ${match}${comps}${figures.length ? ` ${figures.join(', ')}.` : ''}`
}

// Where a show Qloo has no match for stands on its way to a comp.
function compSearchText(search: Show['compSearch']) {
  if (!search) return 'Search for a comp with search_comps.'
  const searched = `Its comp search for "${search.query}"`
  if (search.status === 'pending') return `${searched} is pending.`
  if (search.status === 'failed') return `${searched} failed: ${search.error}`
  return search.results.length
    ? `${searched} found ${entities(search.results)}: map it to one with update_show and compId.`
    : `${searched} found nothing: try another with search_comps.`
}

const launchTitle = (launch: LaunchRow) => launch.name ?? `the launch from ${launch.comps.join(', ')}`

const launchLine = (launch: LaunchRow) =>
  `${launch.name ?? launch.comps.join(' · ')} (launch ${launch.id}): ${launch.status}` +
  (launch.slots === null ? '' : `, ${launch.slots} slots worth ${dollars(launch.slotValue ?? 0)}`)

// Where a run stands, and why it stopped or what it said as it ended.
const ended = (run: Pick<LaunchRun, 'status' | 'error' | 'closing'>) =>
  `${run.status}.${run.error ? ` ${run.error}` : ''}${run.closing ? ` It ended saying: ${run.closing}` : ''}`

// A launch's run line. Its closing line stays as Claude wrote it; once the order has been edited since,
// it may quote figures the order no longer has, so the line says so (#202).
const runLine = (run: LaunchRun) =>
  `Run ${run.id}: ${ended(run)}${run.closing && run.insertionOrder?.edited ? ' Its insertion order has been edited since, so take its figures from the order, not from this line.' : ''}`

// A launch as the assistant reads it: where it stands, what its latest run waits on, and its results.
function launchText(launch: LaunchInfo, page: string) {
  const lines = [`${launchTitle(launch)}: ${launch.status}. Its page in the app: ${page}`]
  if (launch.rosterChanged)
    lines.push("The network's roster has changed since its latest run: run it again to rank it as it is.")
  const run = launch.latestRun
  if (!run) return [...lines, 'No run yet: start one with start_launch_run.'].join('\n')
  if (run.question)
    lines.push(
      ...questionLines(
        `Run ${run.id}`,
        run.question,
        `answer_launch_question with launchId "${launch.id}", runId "${run.id}"`,
        run
      )
    )
  else if (run.status === 'running')
    lines.push(
      `Run ${run.id}: running${run.notes.length ? `, ${run.notes.at(-1)!.text}` : ''}. Read the launch again in a few seconds.`
    )
  else lines.push(runLine(run))
  if (run.chart) {
    lines.push("Chart, by fit with the launch's listeners in Qloo:")
    if (run.chart.error) lines.push(run.chart.error)
    for (const row of run.chart.rows)
      lines.push(
        `${row.rank}. ${row.show}: ${row.band}${row.finalist ? ', finalist' : ''}${row.topicRank === null ? '' : `, topic rank ${row.topicRank}`}${row.climber ? ', a climber' : ''}`
      )
    if (run.chart.notScored.length)
      lines.push(`Not scored: ${run.chart.notScored.map((n) => `${n.show} (${n.reason})`).join('; ')}.`)
  }
  for (const row of run.demographics?.rows ?? [])
    if (row.reasons?.length) lines.push(`${row.show}'s listeners differ: ${row.reasons.join('; ')}.`)
  if (run.insertionOrder) lines.push(orderText(run.insertionOrder, page))
  return lines.join('\n')
}

// A run's open question, for the assistant to put to the human as it is, and how to answer it with
// `answering`, the answer tool and the IDs it takes. `waiting` names the run.
const questionLines = (waiting: string, question: Question, answering: string, launchRun?: LaunchRun) => [
  `${waiting} is waiting on a question for the human (${question.kind}): ${question.question}`,
  `Ask the human this question as it is, and answer with their words: call ${answering}, questionId "${question.id}", and their answer ${howToAnswer(question, launchRun)}. Never answer it yourself.`
]

// How to answer a question, by its kind, in the answer tools' fields.
function howToAnswer(question: Question, run?: LaunchRun) {
  const options = question.options.map((o) => `"${o}"`).join(', ')
  switch (question.kind) {
    case 'choice':
      return `as \`choice\`, one of: ${options}; or their own words as \`text\``
    case 'launch':
      return `as \`choice\`, one of: ${options}; or as \`text\`, the name Qloo lists the launch under`
    case 'budget':
      return 'as `slots` (promo slots) or `dollars`'
    case 'exclusions':
      return `as \`exclude\`, the shows to leave out, from: ${options}; [] for none`
    case 'comps':
      return 'as `comps`, up to three released shows, or as `text`'
    case 'confirm_comps':
      return `as \`picks\`, one per comp in this order, each the ID of the candidate the human picks, or null for none of them: ${(run?.plan.comps ?? []).map((c) => `${c.name}: ${c.candidates.map((e) => `${e.id} ${e.name}${e.popularity === null ? '' : ` (popularity ${e.popularity})`}`).join(', ')}`).join('; ')}`
  }
}

// An insertion order as the assistant reads it, and where a member approves it.
const orderText = (order: OrderInfo, page: string) =>
  [
    `Insertion order ${order.id}, ${order.status}, as it stands: ${order.slots} slots, ${dollars(order.total)}${order.complete ? '' : ' over the lines that have a value'}${order.cpm === null ? '' : ` at a ${dollars(order.cpm)} CPM`}.`,
    ...order.lines.map(
      (l) =>
        `- ${l.show}: ${l.slots} slots${l.slotValue === null ? `, no value (${l.gap})` : ` at ${dollars(l.slotValue)}, ${dollars(l.value!)}`}. ${l.angle ?? NO_ANGLE}`
    ),
    order.status === 'approved'
      ? `Approved by ${order.approvedBy} in the app. Editing it returns it to draft: ${page}`
      : `Change its lines with edit_order. Only a member of the network approves it, in the app: ${page}`
  ].join('\n')

// An inbox as the assistant reads it: one line per pitch, saying what an ambiguous one needs.
const inboxText = (inbox: InboxInfo) =>
  [
    `Inbox: ${inbox.status}, ${inbox.pitches.length} pitch${inbox.pitches.length === 1 ? '' : 'es'}.`,
    ...(inbox.sample ? [inbox.sample.notice] : []),
    ...inbox.pitches.map((p) => `- ${pitchLine(p)}`),
    ...inbox.skipped.map((s) => `Skipped: ${s.pitch} ${s.why}.`)
  ].join('\n')

const works = (candidates: WorkCandidate[]) =>
  candidates.map((c) => `${c.id} ${c.name}${c.disambiguation ? ` (${c.disambiguation})` : ''}`).join('; ')

function pitchLine(pitch: Pitch) {
  const who = `${pitch.id}${pitch.from ? ` from ${pitch.from}` : ''}${pitch.subject ? `, "${pitch.subject}"` : ''}`
  if (!pitch.work)
    return `${who}: ${{ reading: 'being read.', looking_up: 'being read.', read: 'read.', no_work: 'no public work in it, so it never reaches Qloo.', unreadable: `unreadable: ${pitch.error}`, failed: `failed: ${pitch.error}` }[pitch.status]}`
  const work = `${pitch.work.type} ${pitch.work.title}${pitch.work.year ? ` (${pitch.work.year})` : ''}${pitch.guest ? ` by guest ${pitch.guest}` : ''}`
  const match = pitch.match
  const found = !match
    ? 'being looked up in Qloo.'
    : {
        resolved: `matched ${match.entity && works([match.entity])}.`,
        ambiguous: `ambiguous among ${works(match.candidates)}. Confirm one with confirm_work and entityId.`,
        missed: "no match in Qloo, so it isn't ranked.",
        failed: `its search failed: ${match.error}`
      }[match.resolution]
  return `${who}: ${work}, ${found}`
}

// A pitch run's line. Its closing line stays as Claude wrote it; once a reply has been edited or
// discarded since, it may give counts the replies no longer have, so the line says so (#213).
const pitchRunLine = (run: PitchRun) =>
  `Pitch run ${run.id} for ${run.show}: ${ended(run)}${run.closing && run.repliesEdited ? ' A reply has been edited or discarded since, so take the counts from the replies, not from this line.' : ''}`

// A pitch run as the assistant reads it: what it waits on, its ranked lists, its drafted replies, and
// where a member approves them.
function pitchRunText(run: PitchRun, inbox: string) {
  const lines = run.question
    ? questionLines(`Pitch run ${run.id}`, run.question, `answer_pitch_question with runId "${run.id}"`)
    : [pitchRunLine(run)]
  for (const list of run.lists ?? []) lines.push(...listText(list))
  if (run.replies) {
    lines.push('Replies:', ...run.replies.map((r) => `- ${r.pitch}, ${r.verdict}, ${r.status}: ${r.draft}`))
    lines.push(`Only a member of the network approves a reply, in the app: ${inbox}`)
  }
  return lines.join('\n')
}

const listText = (list: PitchList) => [
  list.path === 'unranked'
    ? `${list.type} pitches: not ranked. ${list.error}`
    : `${list.type} pitches, ranked against ${list.path === 'show' ? listOf(list.anchors.map((a) => a.name)) : `the past guests' ${list.type} works alone, as Qloo scored none against the show`}:`,
  ...list.rows.map(
    (r) =>
      `${r.rank}. ${r.pitch} ${r.entity.name}: ${r.band}${r.sharedTags?.tags.length ? `, sharing ${r.sharedTags.tags.join(', ')}` : ''}`
  ),
  ...(list.notScored.length ? [`Not scored: ${list.notScored.map((n) => `${n.pitch} (${n.reason})`).join('; ')}.`] : [])
]

const evidenceLine = (e: Evidence) =>
  `${e.call}: ${e.method} ${e.endpoint}, ${e.status ?? 'no answer'}${e.error ? ` (${e.error})` : ''}${e.cacheHit ? ', from cache' : ''}; ${e.entities.length} entities, ${e.affinities.length} affinities, ${e.tags.length} tags.`

const evidenceText = (e: Evidence) =>
  [
    evidenceLine(e),
    `Sent: ${Object.entries(e.params)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')}`,
    ...e.entities.map((x) => `- entity ${x.id} ${x.name} (${x.type})`),
    ...e.affinities.map((x) => `- ${x.id} ${x.name}: affinity ${x.affinity}`),
    ...e.tags.map((x) => `- tag ${x.name}: ${x.score}`)
  ].join('\n')

// Created once and shared by every request, as the agents SDK says; each request gets its own server.
// A browser's Origin may be a local one, as the handler allows by default, or one of the app's own
// (APP_ORIGINS), which the handler would allow by default only on workers.dev, not a custom domain.
// Clients that send no Origin, as Claude Code doesn't, pass either way. The route below always
// passes the key's ID, name, and network as `authInfo`.
const handler = createMcpHandler(
  ({ authInfo }) =>
    serverFor({
      env,
      network: authInfo!.extra!.network as string,
      caller: { keyId: authInfo!.clientId, keyName: authInfo!.extra!.keyName as string }
    }),
  { allowedOriginHostnames: [...localhostAllowedOrigins(), ...appOrigins(env).map((o) => new URL(o).hostname)] }
)

// The tools the server lists, as an assistant reads them with `tools/list`, for the developer docs.
// `<networkId>` stands in for the network, so the app pages their descriptions name read as patterns.
// The request is the docs' own, with no Origin, at a host the handler doesn't check.
export async function listedTools(): Promise<ListToolsResult['tools']> {
  const res = await handler.fetch(
    new Request('https://docs.invalid/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    }),
    {
      authInfo: {
        token: '',
        clientId: 'docs',
        scopes: [],
        extra: { network: '<networkId>', keyName: 'Developer docs' }
      }
    }
  )
  const body = await res.text()
  // The handler answers as a server-sent event, or as JSON.
  const message = res.headers.get('Content-Type')?.includes('text/event-stream')
    ? body
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5))
        .join('')
    : body
  return (JSON.parse(message) as { result: ListToolsResult }).result.tools
}

export const mcp = new Hono<{ Bindings: Env }>()

mcp.all('/mcp', accountsOn, uploadLimit, async (c) => {
  let key
  try {
    key = await keyFor(c.env, c.req.header('Authorization') ?? '')
  } catch (error) {
    const refused = refusal(c, error)
    if (!refused) throw error
    return refused
  }
  // The key's secret stays out of what the tools can read.
  return handler.fetch(c.req.raw, {
    authInfo: { token: '', clientId: key.id, scopes: [], extra: { network: key.networkId, keyName: key.name } }
  })
})
