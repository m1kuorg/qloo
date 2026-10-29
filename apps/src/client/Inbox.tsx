import { cn } from 'cn'
import { CheckIcon, CircleDashedIcon, CopyIcon, SquareXIcon, UploadIcon } from 'lucide-react'
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { TabsContent } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { linkVariants } from '@/components/ui/variants'
import type { Run, RunSnapshot, RunSummary, Show, SlowCall } from '../agent'
import { NO_ANGLE, tagged, type PitchList, type SharedTags } from '../fit'
import {
  workNoun,
  workTypes,
  type Booking,
  type Inbox,
  type InboxSource,
  type PastGuest,
  type Pitch,
  type PitchReply,
  type Skipped,
  type Verdict,
  type Work,
  type WorkMatch,
  type WorkType
} from '../inbox'
import { MAX_PAST_GUESTS } from '../limits'
import { MAX_TITLE } from '../text'
import { sameName } from '../resolve'
import { readPitchUpload } from '../upload'
import type { Links, Session } from './App'
import { useConfirm } from './Confirm'
import {
  Alert,
  Code,
  DropCue,
  FitBand,
  KeyValue,
  KeyValues,
  listOf,
  NotScored,
  percentile,
  PickOne,
  ScrollTable,
  useAction,
  useFileDrop,
  useIntoView,
  useLeaveGuard
} from './controls'
import { CallButton, EvidencePanel, useEvidence, type Names, type OpenCall, type Opened } from './Evidence'
import { canvas, Connecting, frame, Inspector, InspectorToggle, OnAir, Readout, RunState, useInspector } from './Frame'
import type { NetworkPage } from './NetworkPage'
import { FormDialog, PageEmpty, PageHeader, PageTabs, Section, summaryLine, useFormDialog } from './PageHeader'
import { OpenQuestion, REPLIES_CHANGED, runLabel, RunList, RunLog, runNumber } from './Run'
import { Source } from './Source'
import {
  connectionOf,
  isLive,
  matchLabel,
  pitchTally,
  sentence,
  SlowCalls,
  stateLabel,
  StateLine,
  type Connection
} from './states'

type Actions = {
  loadInbox: (source: InboxSource) => Promise<unknown>
  confirmWork: (pitchId: string, entityId: string) => Promise<unknown>
  startPitches: (input: { show: string; pastGuests: Omit<PastGuest, 'match'>[] }) => Promise<unknown>
  editReply: (pitchId: string, draft: string) => Promise<unknown>
  approveReply: (pitchId: string) => Promise<unknown>
  discardReply: (pitchId: string) => Promise<unknown>
  openCall: (call: string) => void
  opened: Opened | null
  names: Names
}

// The agent's runs, of which the Run tab lists the pitch runs: the one the page shows when none is
// viewed (`latest`), the earlier one being viewed, and `view`, which shows one, or the latest again.
type History = {
  runs: RunSummary[]
  latest: string | undefined
  viewing: string | null
  view: (id: string | null) => Promise<void>
  counted: 'visitor' | 'network' // whom the daily limits on model runs count
}

type Page = {
  inbox: Inbox | null
  roster: Show[]
  booking: Booking | null
  pitchRun: Run | null // the latest run, when it's a pitch run
  startedAt?: string | null // when the pitch run started, for the readout's clock
  question: ReactNode // the pitch run's open question, while it waits on one
  slowCalls: SlowCall[] // Qloo calls still waiting past the slow mark
  connection?: Connection
  history?: History
  links: Links
}

// The inbox page on a connected agent, a network's (`network`) or, in tests, an engine session's, with the
// latest run when it's a pitch run, or an earlier pitch run being viewed, read-only, as it ended. Tests
// render it from synced state, with a pitch open in the inspector (`defaultPitch`) to read its Pitch tab.
export function InboxWorkspace({
  agent,
  links,
  network,
  defaultPitch
}: {
  agent: Session
  links: Links
  network?: NetworkPage
  defaultPitch?: string
}) {
  const { opened, openCall, names } = useEvidence(agent)
  const [viewing, setViewing] = useState<{ id: string; state: RunSnapshot } | null>(null)
  if (!agent.state) return <Connecting label="Connecting to the inbox…" title="Inbox" />
  const shown = viewing?.state ?? agent.state
  const lastRun = shown.run
  const pitchRun = lastRun && shown.booking?.run === lastRun.id ? lastRun : null
  const runs = agent.state.runs ?? []
  return (
    <InboxPage
      inbox={shown.inbox ?? null}
      roster={agent.state.roster ?? []}
      booking={shown.booking ?? null}
      pitchRun={pitchRun}
      startedAt={(!viewing && pitchRun && runs.find((r) => r.id === pitchRun.id)?.startedAt) || null}
      question={
        !viewing &&
        pitchRun?.status === 'waiting' &&
        pitchRun.question && (
          <OpenQuestion key={pitchRun.question.id} question={pitchRun.question} launch={null} agent={agent} />
        )
      }
      slowCalls={agent.state.slowCalls ?? []}
      connection={connectionOf(agent)}
      history={{
        runs,
        latest: agent.state.booking?.run,
        viewing: viewing?.id ?? null,
        view: async (id) => setViewing(id === null ? null : { id, state: await agent.stub.getRun(id) }),
        counted: network ? 'network' : 'visitor'
      }}
      loadInbox={(source) => agent.stub.loadInbox(source)}
      confirmWork={(pitchId, entityId) => agent.stub.confirmWork(pitchId, entityId)}
      startPitches={(input) => agent.stub.startPitches(input)}
      editReply={(pitchId, draft) => agent.stub.editReply(pitchId, draft)}
      approveReply={(pitchId) => agent.stub.approveReply(pitchId)}
      discardReply={(pitchId) => agent.stub.discardReply(pitchId)}
      openCall={openCall}
      opened={opened}
      names={names}
      links={links}
      defaultPitch={defaultPitch}
    />
  )
}

// The booker's inbox page, shown only while GUEST_PITCHES is on, on the workspace's frame: load
// pitches, see what Claude read from each and how Qloo matched its work, confirm ambiguous matches,
// rank the pitched works against a roster show and its past guests, then clear the inbox reply by
// reply. The header and its readout, then the run's question, stand over the inbox's sections, which
// once there are pitches are in tabs: Pitches, Rank (the show to rank against, and the ranked lists),
// and Replies once there are some; with no pitches, the empty state instead. Load pitches, in the
// header or the empty state, opens the form in a dialog. The inspector, closed until something
// opens it, holds the run and the earlier pitch runs, a call's evidence, and the pitch opened from a
// list or the table; the header's Details opens it while there are pitches. An earlier pitch run,
// viewed from Runs, shows read-only as it ended: its lists and pitches, under Pitches, and its
// replies, with nothing to start, load, confirm or change.
export function InboxPage({
  inbox,
  roster,
  booking,
  pitchRun,
  startedAt = null,
  question,
  slowCalls,
  connection = { lost: null, reconnecting: false },
  history,
  links,
  defaultPitch,
  ...actions
}: Page & Actions & { defaultPitch?: string }) {
  // The pitch open in the Pitch tab; as the page first renders, `defaultPitch`, the one way a page
  // rendered on the server, as in tests, shows one.
  const [selected, setSelected] = useState<string | null>(defaultPitch ?? null)
  const pitch = inbox?.pitches.find((p) => p.id === selected)
  const inspector = useInspector(pitch ? ['run', 'evidence', 'pitch'] : ['run', 'evidence'], actions)
  const { showCall } = inspector
  // A pitch opened from a list or the table, which closing the inspector returns focus to.
  const select = (id: string, from: HTMLElement) => {
    setSelected(id)
    inspector.inspect('pitch', from)
  }
  const reading = inbox?.status === 'reading'
  // The sample inbox's pitches come already read, so only their works are looked up.
  const sample = inbox?.sample ?? false
  const running = pitchRun?.status === 'running'
  // The agent refuses reply actions until its run ends, and a run waiting on a question hasn't ended.
  const drafting = isLive(pitchRun?.status)
  const opened = actions.opened?.call ?? null
  // The number of the earlier pitch run shown, read-only.
  const viewing = history?.viewing ? runNumber(history.runs, history.viewing) : null
  // Load pitches, in the header or the empty state, and the dialog it opens the load form in.
  const loading = useFormDialog('Load pitches')
  // Back to the latest run, its button goes, and focus goes to the page's heading.
  const heading = useRef<HTMLHeadingElement>(null)
  // The pitched works ranked against the show, once a run has ranked them.
  const lists = booking?.lists && (
    <PitchLists
      booking={booking}
      lists={booking.lists}
      pitches={inbox?.pitches ?? []}
      sample={sample}
      selected={pitch?.id ?? null}
      select={select}
      openCall={showCall}
      opened={opened}
    />
  )
  return (
    <div className={frame}>
      <main className={canvas} data-canvas>
        {/* The inbox counted, with the show it's for once one is known, the sample's or the latest
            run's, or while an earlier run is viewed, which it is and the way back to the latest; the
            sample inbox's title badged sample, the page's one sample label. Load pitches is secondary
            here: once pitches are in, ranking them is the page's primary. */}
        <PageHeader
          title="Inbox"
          heading={heading}
          connection={connection}
          empty={!inbox}
          badge={inbox?.sample && <Badge>sample</Badge>}
          summary={
            viewing
              ? `Run ${viewing} · earlier, read-only`
              : inbox && inboxSummary(inbox, booking?.show.name ?? inbox.show?.name ?? null)
          }
          actions={
            <>
              <InspectorToggle open={inspector.open} toggle={inspector.toggle} ref={inspector.toggleButton} />
              {viewing ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    void history?.view(null)
                    heading.current?.focus()
                  }}
                >
                  Back to the latest run
                </Button>
              ) : (
                loading.button('secondary')
              )}
            </>
          }
        />
        <InboxReadout
          inbox={inbox}
          pitchRun={pitchRun}
          latest={history?.runs.findLast((r) => r.pitchesFor) ?? null}
          startedAt={startedAt}
          slowCalls={slowCalls}
          // Once there's a pitch run, the latest or an earlier one, for the Run tab to log.
          runLog={pitchRun || history?.runs.some((r) => r.pitchesFor) ? (from) => inspector.inspect('run', from) : null}
        />
        {/* Before the tabs, so the question is what a person reaches first. */}
        {question}
        {inbox ? (
          // Once there are pitches, the inbox's sections in tabs: the pitches; the show to rank them
          // against, with the lists it ranked under it; and the replies once there are some. An earlier
          // run, viewed, has nothing to rank, so its lists stand with its pitches.
          <PageTabs
            label="Inbox sections"
            tabs={[
              {
                id: 'pitches',
                title: 'Pitches',
                content: (
                  <>
                    {viewing && lists}
                    {/* What reaches Qloo of a pitch, PRODUCT.md's promise, is the pitches' sentence. */}
                    <Section id="pitches-h" title="Pitches" description={QLOO_PRIVACY}>
                      {inbox.skipped && (
                        <p className="max-w-[72ch]">
                          <SkippedPitches skipped={inbox.skipped} />
                        </p>
                      )}
                      <PitchTable
                        pitches={inbox.pitches}
                        sample={sample}
                        viewing={viewing}
                        selected={pitch?.id ?? null}
                        select={select}
                        openCall={showCall}
                        opened={opened}
                      />
                    </Section>
                  </>
                )
              },
              ...(viewing
                ? []
                : [
                    {
                      id: 'rank',
                      title: 'Rank',
                      content: (
                        <>
                          <PitchSetup
                            key={inbox.id}
                            inbox={inbox}
                            roster={roster}
                            booking={booking}
                            running={running}
                            startPitches={actions.startPitches}
                            rosterHref={links.roster}
                          />
                          {lists}
                        </>
                      )
                    }
                  ]),
              ...(booking?.replies
                ? [
                    {
                      id: 'replies',
                      title: 'Replies',
                      content: (
                        <Replies
                          show={booking.show.name}
                          replies={booking.replies}
                          pitches={inbox.pitches}
                          locked={drafting}
                          viewing={viewing}
                          actions={{ ...actions, openCall: showCall }}
                          opened={opened}
                        />
                      )
                    }
                  ]
                : [])
            ]}
          />
        ) : (
          <PageEmpty action={loading.button()} detail={QLOO_PRIVACY}>
            No pitches yet.
          </PageEmpty>
        )}
      </main>
      {/* Opened for a pitch, the sheet gives its heading focus, as the inspector beside the canvas does. */}
      <Inspector
        inspector={inspector}
        initialFocus={() => (inspector.current === 'pitch' && document.getElementById('pitch-ed')) || true}
      >
        <TabsContent value="run" keepMounted className="flex flex-col gap-8">
          {pitchRun && (
            <RunLog
              run={pitchRun}
              changedNote={booking?.repliesEdited ? REPLIES_CHANGED : null}
              openCall={showCall}
              opened={opened}
            />
          )}
          {!pitchRun && !booking && (
            <p className="text-muted-foreground">Not run yet. A pitch run’s steps and its closing line show here.</p>
          )}
          {booking && <Anchors booking={booking} openCall={showCall} opened={opened} />}
          {history?.runs.some((r) => r.pitchesFor) && (
            <RunList
              runs={history.runs}
              include={(r) => Boolean(r.pitchesFor)}
              latest={history.latest}
              viewing={history.viewing}
              view={history.view}
              counted={history.counted}
            />
          )}
          <InboxCheck pitches={inbox?.pitches ?? []} sample={sample} />
        </TabsContent>
        <TabsContent value="evidence" keepMounted>
          <EvidencePanel opened={actions.opened} names={actions.names} runs={history?.runs ?? []} />
        </TabsContent>
        {pitch && (
          <TabsContent value="pitch" keepMounted>
            <PitchDetail
              key={pitch.id}
              pitch={pitch}
              sample={sample}
              confirmWork={viewing ? null : actions.confirmWork}
              openCall={showCall}
              opened={opened}
            />
          </TabsContent>
        )}
      </Inspector>
      {/* Kept mounted while closed, so files dropped anywhere on the page load, opening it. An earlier
          run, viewed, loads nothing. */}
      {!viewing && (
        <InboxLoad
          dialog={loading}
          loadInbox={actions.loadInbox}
          reading={reading}
          sample={sample}
          wipes={Boolean(booking?.lists?.length || booking?.replies?.length)}
        />
      )}
    </div>
  )
}

// What reaches Qloo of a pitch, PRODUCT.md's promise, said by the Pitches section, the load form, and
// the empty state.
const QLOO_PRIVACY = 'Only the work’s title and type are looked up in Qloo; names, addresses, and pitch text never are.'

// The inbox in the header's summary, with the show it's for once one is known, the sample's or the
// latest run's: "40 pitches for The Big Picture · 31 matched, 1 ambiguous, 4 not in Qloo, 4 set aside",
// the pitches counted by their words, as the inbox check counts them. Pitches still being read or
// looked up aren't counted here: the readout says how far that's got.
function inboxSummary(inbox: Inbox, show: string | null) {
  const n = pitchTally(inbox.pitches)
  return summaryLine(`${pitchCount(inbox.pitches.length)}${show ? ` for ${show}` : ''}`, [
    [n('Matched'), 'matched'],
    [n('Ambiguous'), 'ambiguous'],
    [n('Not in Qloo'), 'not in Qloo'],
    [n('Lookup failed'), 'lookup failed', 'lookups failed'],
    [n('Set aside'), 'set aside'],
    [n('Unreadable'), 'unreadable'],
    [n('Failed'), 'failed']
  ])
}

// The on-air readout under the header, which says the inbox's state and progress, never the counts
// the header says: a pitch run's state; or while there's none, the inbox's reading, or the sample's
// lookups, and its slow calls; or once a new inbox has replaced the one the latest pitch run ranked,
// that run's state from its summary, as a launch's page says its latest run's. With no pitch run and
// nothing being read, the inbox is at rest and there's none: the header's counts say what it holds,
// and with no inbox, the empty state says what's missing.
function InboxReadout({
  inbox,
  pitchRun,
  latest,
  startedAt,
  slowCalls,
  runLog
}: {
  inbox: Inbox | null
  pitchRun: Run | null
  latest: RunSummary | null // the latest pitch run, which `pitchRun` is unless a new inbox replaced its own
  startedAt: string | null
  slowCalls: SlowCall[]
  runLog: ((from: HTMLElement) => void) | null // opens the inspector on its Run tab, once there's a run
}) {
  const reading = inbox?.status === 'reading'
  if (!pitchRun && !reading && !latest) return null
  const done = inbox?.pitches.filter((p) => p.status !== 'reading' && p.status !== 'looking_up').length ?? 0
  // The sample's pitches come already read, so while it loads, its works' lookups are counted instead.
  const works = inbox?.pitches.filter((p) => p.work).length ?? 0
  const looked = inbox?.pitches.filter((p) => p.work && p.status !== 'looking_up').length ?? 0
  return (
    <Readout since={pitchRun?.status === 'running' ? startedAt : null} runLog={runLog}>
      {pitchRun ? (
        <RunState run={pitchRun} slowCalls={slowCalls} />
      ) : !reading ? (
        latest && (
          <span className="inline-flex items-center gap-2">
            <OnAir live={false} />
            <b className="font-semibold">{runLabel[latest.status]}</b>
          </span>
        )
      ) : (
        inbox && (
          <>
            {inbox.sample ? (
              <StateLine kind="loading" word="Looking up">
                · {looked} of {works} {works === 1 ? 'work' : 'works'} looked up
              </StateLine>
            ) : (
              <StateLine kind="loading" word="Reading">
                · {done} of {pitchCount(inbox.pitches.length)} read
              </StateLine>
            )}
            {slowCalls.length > 0 && (
              <span className="basis-full type-caption">
                <SlowCalls calls={slowCalls} />
              </span>
            )}
          </>
        )
      )}
    </Readout>
  )
}

// The load form, in the inbox page's form dialog (`dialog`), as the roster's import is: pitches
// pasted, uploaded as email files, or dropped anywhere on the page, which opens the dialog, read in the
// browser by the upload module and sent as pitches. Accepted, the dialog closes and the readout says
// how the reading goes; a refusal stays in the dialog. Each load replaces the inbox; over one with
// ranked lists or replies (`wipes`), which go with it, a load confirms first, in a dialog over this one.
export function InboxLoad({
  dialog,
  loadInbox,
  reading,
  sample,
  wipes
}: {
  dialog: ReturnType<typeof useFormDialog>
  loadInbox: Actions['loadInbox']
  reading: boolean
  sample: boolean // the inbox is the sample, whose works are looked up as it loads
  wipes: boolean
}) {
  const [text, setText] = useState('')
  const { busy, error, run } = useAction()
  const { confirm, dialog: confirmation } = useConfirm()
  const locked = busy || reading
  const file = useRef<HTMLInputElement>(null)
  const send = async (go: () => Promise<unknown>) => {
    if (await run(go)) dialog.close()
  }
  // The confirm closes before the load runs, so the load's refusal shows in the form, as without one.
  const load = (go: () => Promise<unknown>) =>
    wipes
      ? confirm({
          title: 'Replace the inbox?',
          consequence:
            'Its ranked lists and replies go with it, approved replies included, and can’t be brought back. Earlier pitch runs stay in Runs, read-only.',
          verb: 'Replace inbox',
          busy: 'Loading…',
          keep: 'Keep',
          action: () => send(go),
          after: true
        })
      : send(go)
  const paste = (e: React.FormEvent) => {
    e.preventDefault()
    void load(async () => {
      await loadInbox({ text })
      setText('')
    })
  }
  const upload = (files: File[]) => load(async () => loadInbox({ pitches: await readPitchUpload(files) }))
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (files.length) void upload(files)
  }
  // Files dropped while the inbox is still loading aren't read; the cue says to wait.
  const dragging = useFileDrop((files) => {
    if (locked) return null
    dialog.show()
    return upload(files)
  })
  return (
    <>
      {dragging && (
        <DropCue busy={locked}>
          {locked
            ? sample && reading
              ? 'Wait for the sample’s lookups to finish, then drop the files again.'
              : 'Wait for the inbox to finish reading, then drop the files again.'
            : 'Drop the files to load their pitches: .eml files, an .mbox export, or a .txt of pitches.'}
        </DropCue>
      )}
      <FormDialog
        dialog={dialog}
        description="Paste pitch emails or upload them, and Claude reads each one for its guest and public work."
        form="inbox-load"
        submit={
          reading
            ? sample
              ? 'Looking up the sample’s works…'
              : 'Reading the inbox…'
            : busy
              ? 'Loading…'
              : 'Read pitches'
        }
        busy={locked}
        disabled={!text.trim()}
      >
        <form id="inbox-load" className="flex flex-col gap-2" onSubmit={paste}>
          <Field>
            <FieldLabel htmlFor="inbox-pitches">Pitch emails</FieldLabel>
            <Textarea
              id="inbox-pitches"
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'Paste one or more pitch emails.\n---\nPut a line of three dashes between pitches.'}
              disabled={locked}
              aria-describedby="inbox-pitches-limit"
              className="max-h-60 min-h-24"
            />
            <div className="flex flex-col items-start gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={locked}
                aria-describedby="inbox-file-format"
                onClick={() => file.current?.click()}
              >
                <UploadIcon data-icon="inline-start" aria-hidden="true" />
                Upload files
              </Button>
              <input
                ref={file}
                type="file"
                accept=".eml,.mbox,.txt,message/rfc822,application/mbox,text/plain"
                multiple
                hidden
                onChange={pick}
              />
              <FieldDescription id="inbox-pitches-limit">
                Replaces the current inbox, up to 50 pitches. {QLOO_PRIVACY}
              </FieldDescription>
              <FieldDescription id="inbox-file-format" className="max-w-[72ch]">
                Drop email files anywhere on the page, or upload them: <Code>.eml</Code> files, an <Code>.mbox</Code>{' '}
                export, or a <Code>.txt</Code> with a line of three dashes between pitches.
              </FieldDescription>
            </div>
          </Field>
          <div>
            <Alert error={error} />
          </div>
          {confirmation}
        </form>
      </FormDialog>
    </>
  )
}

// The uploaded pitches left out of the inbox, each named and why.
function SkippedPitches({ skipped }: { skipped: Skipped[] }) {
  return (
    <StateLine kind="error" word="Skipped">
      {listOf(skipped.map((s) => `“${s.pitch}” ${s.why}`))}, so {skipped.length === 1 ? 'it isn’t' : 'they aren’t'} in
      the inbox.
    </StateLine>
  )
}

const pitchCount = (n: number) => `${n} ${n === 1 ? 'pitch' : 'pitches'}`

export const typeLabel: Record<WorkType, string> = {
  book: 'Book',
  film: 'Film',
  tv_show: 'TV show',
  podcast: 'Podcast'
}
const typeItems = workTypes.map((t) => ({ value: t, label: typeLabel[t] }))

// One past guest as the booker types them: the year stays text until the run starts.
type GuestRow = { guest: string; title: string; type: WorkType; year: string }

const rowsOf = (guests: Omit<PastGuest, 'match'>[]): GuestRow[] =>
  guests.map(({ guest, work }) => ({ guest, title: work.title, type: work.type, year: work.year?.toString() ?? '' }))

// A past guest's row: from 768px one line under the column names, and on a phone its fields stacked,
// each with its name over it, the type and year side by side.
const guestRow =
  "grid grid-cols-2 gap-x-2 gap-y-1.5 [grid-template-areas:'guest_guest'_'title_title'_'type_year'_'remove_remove'] md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_7.5rem_4.5rem_4.75rem] md:items-center md:[grid-template-areas:'guest_title_type_year_remove']"

// A past guest's field, with its column's name over it on a phone, which a tap focuses it from; its own
// aria-label names it for screen readers, with the guest's number, so the name over it isn't read too.
function GuestField({
  name,
  area,
  field,
  invalid = false,
  children
}: {
  name: string
  area: string
  field: string
  invalid?: boolean
  children: ReactNode
}) {
  return (
    <Field className={cn('min-w-0 gap-1', area)} data-invalid={invalid || undefined}>
      <FieldLabel
        htmlFor={field}
        aria-hidden="true"
        className="type-caption font-normal text-muted-foreground md:hidden"
      >
        {name}
      </FieldLabel>
      {children}
    </Field>
  )
}

// The show the pitches are for and its best past guests' works, which anchor the rankings with it.
// The sample inbox comes with its show's past guests filled in; otherwise the last run's are kept.
function PitchSetup({
  inbox,
  roster,
  booking,
  running,
  startPitches,
  rosterHref
}: Pick<Page, 'roster' | 'booking'> & {
  inbox: Inbox
  running: boolean
  startPitches: Actions['startPitches']
  rosterHref: string
}) {
  const shows = roster.filter((s) => s.entity && (s.resolution === 'resolved' || s.resolution === 'mapped'))
  const suggested = inbox.show ? shows.find((s) => sameName(s.name, inbox.show!.name))?.name : undefined
  // The sample's show while its Qloo lookup is still out: a fresh session's roster can still be resolving
  // when the sample inbox loads, and a run started now would go to another show.
  const awaited = inbox.show
    ? roster.find((s) => s.resolution === 'pending' && sameName(s.name, inbox.show!.name))?.name
    : undefined
  // The booker's own pick, seeded with the last run's show. Until they pick, the default follows the
  // roster as it resolves, so it's never fixed before the sample's show is matched.
  const [show, setShow] = useState<string | null>(booking?.show.name ?? null)
  const [rows, setRows] = useState<GuestRow[]>(() =>
    booking
      ? rowsOf(booking.pastGuests)
      : inbox.show
        ? rowsOf(inbox.show.pastGuests)
        : [{ guest: '', title: '', type: 'book', year: '' }]
  )
  // The past guest whose year isn't four digits, by its place in the list.
  const [invalid, setInvalid] = useState<number | null>(null)
  const { busy, error, run } = useAction()
  const chosen = show !== null && shows.some((s) => s.name === show) ? show : (suggested ?? shows[0]?.name ?? '')
  const edit = (i: number, change: Partial<GuestRow>) => {
    setRows(rows.map((r, j) => (j === i ? { ...r, ...change } : r)))
    setTyped(true)
  }
  // Past guests typed and not yet run: leaving the page asks first.
  const [typed, setTyped] = useState(false)
  useLeaveGuard(typed)
  const reading = inbox.status === 'reading'
  const locked = busy || running || reading
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const year = rows.findIndex((r) => r.year.trim() && !/^\d{4}$/.test(r.year.trim()))
    setInvalid(year >= 0 ? year : null)
    // Back to the year to fix, which the error under the form describes.
    if (year >= 0) return document.getElementById(`guest-${year}-year`)?.focus()
    const pastGuests = rows.map((r) => ({
      guest: r.guest,
      work: { title: r.title, type: r.type, year: r.year.trim() ? Number(r.year) : null }
    }))
    void run(async () => {
      await startPitches({ show: chosen, pastGuests })
      setTyped(false)
    })
  }
  return (
    <Section
      id="setup-h"
      title="Rank against a show"
      description="Each type of pitched work is ranked in its own Qloo call against a roster show and its best past guests’ public works."
    >
      {shows.length === 0 ? (
        <p className="max-w-[72ch] rounded-xl bg-muted px-4 py-3">
          No roster show is matched in Qloo yet.{' '}
          <a className={linkVariants()} href={rosterHref}>
            Import the roster
          </a>{' '}
          first: the pitches are ranked against one of its shows.
        </p>
      ) : (
        <form className="flex flex-col gap-5" onSubmit={submit}>
          <FieldGroup className="gap-5">
            <Field>
              <FieldLabel id="setup-show" htmlFor="setup-show-trigger">
                Show
              </FieldLabel>
              <Select
                items={shows.map((s) => ({ value: s.name, label: s.name }))}
                value={chosen}
                onValueChange={(name) => setShow(name as string)}
                disabled={locked}
              >
                <SelectTrigger id="setup-show-trigger" aria-labelledby="setup-show" className="w-full sm:w-80">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {shows.map((s) => (
                      <SelectItem key={s.name} value={s.name}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <FieldSet className="gap-4 md:gap-2" aria-describedby="setup-guests-note">
              <FieldLegend className="mb-1.5">Past guests’ public works</FieldLegend>
              <FieldDescription id="setup-guests-note">Only titles and types reach Qloo.</FieldDescription>
              <div aria-hidden="true" className={cn(guestRow, 'type-caption text-muted-foreground max-md:hidden')}>
                <span>Guest</span>
                <span>Work title</span>
                <span>Type</span>
                <span>Year</span>
              </div>
              {rows.map((r, i) => (
                <div className={guestRow} key={i}>
                  <GuestField name="Guest" area="[grid-area:guest]" field={`guest-${i}-name`}>
                    <Input
                      id={`guest-${i}-name`}
                      aria-label={`Past guest ${i + 1}`}
                      value={r.guest}
                      onChange={(e) => edit(i, { guest: e.target.value })}
                      maxLength={MAX_TITLE}
                      disabled={locked}
                    />
                  </GuestField>
                  <GuestField name="Work title" area="[grid-area:title]" field={`guest-${i}-title`}>
                    <Input
                      id={`guest-${i}-title`}
                      aria-label={`Past guest ${i + 1}’s work title`}
                      value={r.title}
                      onChange={(e) => edit(i, { title: e.target.value })}
                      maxLength={MAX_TITLE}
                      disabled={locked}
                    />
                  </GuestField>
                  <GuestField name="Type" area="[grid-area:type]" field={`guest-${i}-type`}>
                    <Select
                      items={typeItems}
                      value={r.type}
                      onValueChange={(type) => edit(i, { type: type as WorkType })}
                      disabled={locked}
                    >
                      <SelectTrigger
                        id={`guest-${i}-type`}
                        aria-label={`Past guest ${i + 1}’s work type`}
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {typeItems.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </GuestField>
                  <GuestField name="Year" area="[grid-area:year]" field={`guest-${i}-year`} invalid={invalid === i}>
                    <Input
                      id={`guest-${i}-year`}
                      aria-label={`Past guest ${i + 1}’s work year`}
                      aria-invalid={invalid === i || undefined}
                      aria-describedby={invalid === i ? 'setup-error' : undefined}
                      inputMode="numeric"
                      value={r.year}
                      onChange={(e) => edit(i, { year: e.target.value })}
                      disabled={locked}
                    />
                  </GuestField>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove past guest ${i + 1}`}
                    onClick={() => {
                      setRows(rows.filter((_, j) => j !== i))
                      setTyped(true)
                    }}
                    disabled={locked}
                    className="justify-self-start [grid-area:remove] max-md:-ml-2.5 md:justify-self-end"
                  >
                    Remove
                  </Button>
                </div>
              ))}
              {rows.length < MAX_PAST_GUESTS && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRows([...rows, { guest: '', title: '', type: 'book', year: '' }])
                    setTyped(true)
                  }}
                  disabled={locked}
                  className="-ml-2.5 self-start"
                >
                  Add a past guest
                </Button>
              )}
            </FieldSet>
          </FieldGroup>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Button type="submit" disabled={locked || !chosen || Boolean(awaited)}>
              {running && <Spinner data-icon="inline-start" />}
              Rank pitches
            </Button>
            <small className="type-caption text-muted-foreground">
              {running
                ? 'Ranking the pitches…'
                : awaited
                  ? `Waiting for ${awaited}’s Qloo lookup…`
                  : reading
                    ? inbox.sample
                      ? 'Rank them once every work is looked up.'
                      : 'Rank them once every pitch is read.'
                    : inbox.show
                      ? 'Filled in from the sample show’s episode feed.'
                      : 'A new run: earlier runs stay in Runs.'}
            </small>
          </div>
          <div id="setup-error">
            <Alert
              error={
                invalid !== null
                  ? `Past guest ${invalid + 1}’s year must be four digits, such as 2024, or left empty.`
                  : error
              }
            />
          </div>
        </form>
      )}
    </Section>
  )
}

const typePlural: Record<WorkType, string> = { book: 'Books', film: 'Films', tv_show: 'TV shows', podcast: 'Podcasts' }

// The pitched works ranked against the show, one list per work type, each an h3 section, by position
// and band. Raw scores stay in each ranking call's evidence, and lists from separate calls aren't
// compared. Under them, what a band is and how many set-aside pitches were never sent to Qloo.
function PitchLists({
  booking,
  lists,
  pitches,
  sample,
  selected,
  select,
  openCall,
  opened
}: {
  booking: Booking
  lists: PitchList[]
  pitches: Pitch[]
  sample: boolean // the sample inbox's pitches, which come already read
  selected: string | null
  select: (id: string, from: HTMLElement) => void
  openCall: OpenCall
  opened: string | null
}) {
  const setAside = pitches.filter((p) => p.status === 'no_work' || p.status === 'unreadable' || p.status === 'failed')
  return (
    <Section
      id="lists-h"
      title={`Pitches for ${booking.show.name}`}
      badge={<Source of="qloo" />}
      description="One list per type of work, each from its own Qloo call, so a rank in one list can’t be compared with a rank in another."
    >
      {/* Each list's table ends it, so its h3 sections stand further apart than their own parts. */}
      <div className="flex flex-col gap-8">
        {lists.map((list) => (
          <RankedPitches
            key={list.type}
            list={list}
            pitches={pitches}
            sample={sample}
            selected={selected}
            select={select}
            openCall={openCall}
            opened={opened}
          />
        ))}
      </div>
      <p className="max-w-[72ch] type-caption text-muted-foreground">
        Bands are thirds of their own list.
        {setAside.length > 0 && ` ${setAside.length} set-aside pitches were never sent to Qloo.`}
      </p>
    </Section>
  )
}

// One work type's list, an h3 section whose sentence says what it was ranked against, or why it
// wasn't, with its calls; then, in the fit chart's anatomy, a compact real table: the rank, the work as
// Qloo matched it, which opens its pitch, with the guest as Claude read them, or as the sample gives
// them, and the tags it shares with the show, then its band. Its rules bleed 8px past the text, as the
// chart's do.
function RankedPitches({
  list,
  pitches,
  sample,
  selected,
  select,
  openCall,
  opened
}: {
  list: PitchList
  pitches: Pitch[]
  sample: boolean
  selected: string | null
  select: (id: string, from: HTMLElement) => void
  openCall: OpenCall
  opened: string | null
}) {
  const id = `list-${list.type}`
  const pitch = (id: string) => pitches.find((p) => p.id === id)
  const names = listOf(list.anchors.map((a) => a.name))
  const noun = typeLabel[list.type].toLowerCase()
  const against =
    list.path === 'same_type'
      ? `Ranked against the past guests’ ${noun}s alone: ${names}. Qloo scored no ${noun} against the show and every past guest (${list.calls[0]}).`
      : list.path === 'show'
        ? `Ranked against ${names}.`
        : null
  const cell = 'border-b py-2.5 align-baseline group-data-selected/row:bg-muted'
  return (
    <Section
      id={id}
      level={3}
      title={`${typePlural[list.type]} · ${list.rows.length} ranked`}
      description={
        <>
          {list.error ? (
            <StateLine kind="failed" role="alert">
              Not ranked: {sentence(list.error)}
            </StateLine>
          ) : (
            against
          )}
          {list.calls.map((call) => (
            <Fragment key={call}>
              {' '}
              <CallButton call={call} label={`Evidence for the ${noun} ranking`} opened={opened} openCall={openCall} />
            </Fragment>
          ))}
        </>
      }
    >
      {!list.error && list.rows.length > 0 && (
        <div className="-mx-2">
          <table className="w-full border-separate border-spacing-0" aria-labelledby={id}>
            <thead className="type-caption text-muted-foreground">
              <tr>
                <th scope="col" className="w-12 border-b pr-1 pb-2 pl-2 text-right align-bottom font-normal">
                  Rank
                </th>
                <th scope="col" className="border-b pb-2 pl-3 text-left align-bottom font-normal">
                  {/* The guest is Claude's reading of the pitch, or the sample's, not Qloo data. */}
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    Public work · guest {!sample && <Source of="agent" />}
                  </span>
                </th>
                <th scope="col" className="w-24 border-b pr-2 pb-2 pl-3 text-left align-bottom font-normal">
                  Fit
                </th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((r) => {
                const guest = pitch(r.pitch)?.guest
                return (
                  <tr key={r.pitch} className="group/row" data-selected={r.pitch === selected || undefined}>
                    <td className={cn(cell, 'pr-1 pl-2 text-right type-title tabular-nums')}>{r.rank}</td>
                    <th scope="row" className={cn(cell, 'pl-3 text-left font-normal')}>
                      <span className="flex flex-col items-start gap-0.5">
                        <button
                          type="button"
                          aria-current={r.pitch === selected || undefined}
                          onClick={(e) => select(r.pitch, e.currentTarget)}
                          className="cursor-pointer text-left text-[15px] leading-snug font-semibold decoration-1 underline-offset-4 hover:underline aria-[current]:underline max-md:-my-2 max-md:py-2"
                        >
                          {r.entity.name}
                        </button>
                        {guest && <span className="type-caption text-muted-foreground">{guest}</span>}
                        {r.sharedTags && (
                          <TagLine
                            tags={r.sharedTags}
                            label={`Evidence for the tags ${r.entity.name} shares`}
                            openCall={openCall}
                            opened={opened}
                          />
                        )}
                      </span>
                    </th>
                    <td className={cn(cell, 'pr-2 pl-3')}>
                      <FitBand band={r.band} finalist={false} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {list.notScored.length > 0 && (
        <NotScored
          noun="Pitch"
          rows={list.notScored.map((n) => ({
            key: n.pitch,
            name: pitch(n.pitch)?.work?.title ?? n.pitch,
            reason: n.reason
          }))}
        />
      )}
    </Section>
  )
}

// A work's tags in common with the show, as words, with the compare that returned them.
function TagLine({
  tags,
  label,
  openCall,
  opened
}: {
  tags: SharedTags
  label: string
  openCall: OpenCall
  opened: string | null
}) {
  // The words before the last tag (a separator never starts a line), and the last tag, or the last word
  // of a line with no tags, which the call stays beside.
  const words = (text: string) => [text.slice(0, text.lastIndexOf(' ') + 1), text.slice(text.lastIndexOf(' ') + 1)]
  const [lead, last] = tags.error
    ? words(`Shared tags failed: ${tags.error}`)
    : tags.tags.length > 0
      ? [
          tags.tags
            .slice(0, -1)
            .map((t) => `${t}\u00a0· `)
            .join(''),
          tags.tags.at(-1)
        ]
      : words('No distinctive shared tags')
  return (
    <span className="type-caption text-muted-foreground">
      {lead}
      <span className="whitespace-nowrap">
        {last} <CallButton call={tags.call} label={label} opened={opened} openCall={openCall} />
      </span>
    </span>
  )
}

const verdictLabel: Record<Verdict, string> = { book: 'Book', later: 'Later', decline: 'Decline' }
const verdicts: Verdict[] = ['book', 'later', 'decline']

type ReplyActions = Pick<Actions, 'editReply' | 'approveReply' | 'discardReply'> & { openCall: OpenCall }

// The drafted replies, one per pitch, grouped by the agent's verdict, each a review item a booker
// clears in turn. The booker approves, edits, or discards each one on its own, and only an approved
// reply can be copied, to send from their own email, as each reply's actions say. While the run is
// still drafting, or for an earlier run viewed read-only (`viewing`), nothing can be changed, and the
// section's sentence says so in place of what Claude drafted.
function Replies({
  show,
  replies,
  pitches,
  locked,
  viewing,
  actions,
  opened
}: {
  show: string
  replies: PitchReply[]
  pitches: Pitch[]
  locked: boolean // the run is still drafting
  viewing: number | null // the number of the earlier run whose replies these are
  actions: ReplyActions
  opened: string | null
}) {
  const kept = replies.filter((r) => r.status !== 'discarded')
  const approved = kept.filter((r) => r.status === 'approved').length
  return (
    <Section
      id="replies-h"
      title={`Replies · ${approved} of ${kept.length} approved`}
      badge={<Source of="agent" />}
      description={
        viewing
          ? `Run ${viewing}’s replies, read-only; an approved one can still be copied.`
          : locked
            ? 'Claude is still drafting: approve once the run has ended.'
            : `Claude drafted a reply to each pitch with a verdict, and an episode angle for each top pitch from the tags its work shares with ${show} in Qloo.`
      }
    >
      {verdicts.map((v) => {
        const group = replies.filter((r) => r.verdict === v)
        if (group.length === 0) return null
        return (
          <div className="flex flex-col gap-2" role="group" aria-labelledby={`replies-${v}`} key={v}>
            <h3 className="font-semibold" id={`replies-${v}`}>
              {verdictLabel[v]} · {group.length}
            </h3>
            {/* As wide as the canvas, as the ranked lists and the chart are; each reply's text keeps its
                72ch measure inside. */}
            <ul className="flex flex-col gap-2">
              {group.map((r) => (
                <ReplyItem
                  key={r.pitch}
                  reply={r}
                  pitch={pitches.find((p) => p.id === r.pitch)}
                  show={show}
                  locked={locked}
                  readOnly={viewing !== null}
                  actions={actions}
                  opened={opened}
                />
              ))}
            </ul>
          </div>
        )
      })}
    </Section>
  )
}

// The controls a reply's focus moves between as its actions do their work and their buttons go or
// change: Approve leads to Copy, Discard to Restore, Restore and Save to Approve, Cancel to Edit; an
// action that fails gives focus back to its own control.
type Act = 'approve' | 'copy' | 'edit' | 'discard' | 'restore' | 'text'

// A reply's state as a chip: Draft on the tone step; Approved with an ink check, never the signal,
// which marks what the agent puts forward; Discarded, quiet.
function ReplyBadge({ status }: { status: PitchReply['status'] }) {
  if (status === 'approved')
    return (
      <Badge variant="outline">
        <CheckIcon aria-hidden="true" />
        Approved
      </Badge>
    )
  if (status === 'discarded') return <Badge className="text-muted-foreground">Discarded</Badge>
  return <Badge>Draft</Badge>
}

// One reply as a review item, read top to bottom: the pitched work and its guest with the reply's
// state; whom it goes to; the episode angle and the tags it's built from; the draft, at running-text
// size in a 72ch measure; then its actions on one row, Approve first. A discarded reply folds to one
// quiet line off the card, with Restore. Read-only, only an approved reply's Copy is left.
function ReplyItem({
  reply,
  pitch,
  show,
  locked,
  readOnly,
  actions,
  opened
}: {
  reply: PitchReply
  pitch: Pitch | undefined
  show: string
  locked: boolean
  readOnly: boolean
  actions: ReplyActions
  opened: string | null
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null) // the text last copied
  const [uncopied, setUncopied] = useState(false) // the browser refused the clipboard
  const { busy, error, run } = useAction()
  const off = busy || locked
  const name = pitch?.work?.title ?? (pitch ? title(pitch) : reply.pitch)
  // The action whose button takes focus once this item has re-rendered, if focus was left on nothing.
  const buttons = useRef<Partial<Record<Act, HTMLElement | null>>>({})
  const next = useRef<Act | null>(null)
  const item = useRef<HTMLLIElement>(null)
  useEffect(() => {
    const target = next.current && buttons.current[next.current]
    if (!target || (target as HTMLButtonElement).disabled) return
    next.current = null
    const at = document.activeElement
    if (!at || at === document.body || item.current?.contains(at)) target.focus()
  })
  const act = async (action: () => Promise<unknown>, done: Act, pressed: Act) => {
    next.current = (await run(action)) ? done : pressed
  }
  const ref = (a: Act) => (el: HTMLElement | null) => {
    buttons.current[a] = el
  }
  // A draft typed and not saved: leaving the page asks first.
  useLeaveGuard(editing !== null && editing !== reply.draft)
  // Each action's name says which reply it's for, so a screen reader's list of buttons tells forty
  // replies' Approves apart; the eye has the reply around it.
  const about = <span className="vh"> reply about {name}</span>
  const who = (
    <p className="min-w-0 text-[15px] leading-snug">
      <span className={reply.status === 'discarded' ? 'font-medium' : 'font-semibold'}>{name}</span>
      {pitch?.guest && <span className="text-muted-foreground"> · {pitch.guest}</span>}
    </p>
  )
  if (reply.status === 'discarded')
    return (
      <li
        ref={item}
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1.5 text-muted-foreground"
        data-pitch={reply.pitch}
        data-status="discarded"
      >
        {who}
        <div className="flex items-center gap-2">
          <ReplyBadge status="discarded" />
          {!readOnly && (
            <div className="flex items-center" data-actions>
              <Button
                ref={ref('restore')}
                type="button"
                variant="ghost"
                size="sm"
                disabled={off}
                onClick={() => void act(() => actions.editReply(reply.pitch, reply.draft), 'approve', 'restore')}
                className="-mr-2.5"
              >
                Restore
                {about}
              </Button>
            </div>
          )}
        </div>
        <div className="basis-full empty:hidden">
          <Alert error={error} />
        </div>
      </li>
    )
  const approved = reply.status === 'approved'
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const saved = await run(() => actions.editReply(reply.pitch, editing!))
    next.current = saved ? 'approve' : 'text'
    if (saved) setEditing(null)
  }
  // Copied in the browser, not by the agent, so it never waits on the socket or locks the item.
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reply.draft)
      setCopied(reply.draft)
      setUncopied(false)
    } catch {
      setUncopied(true)
    }
  }
  const row = 'flex flex-wrap items-center gap-x-2 gap-y-1.5'
  return (
    <li
      ref={item}
      className="flex flex-col gap-3 rounded-xl bg-card p-4"
      data-pitch={reply.pitch}
      data-status={reply.status}
    >
      {/* The state's chip on the title's line, read right after it. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5">
        {who}
        <ReplyBadge status={reply.status} />
        {pitch?.from && <p className="col-span-full truncate type-caption text-muted-foreground">To {pitch.from}</p>}
      </div>
      {(reply.angle || reply.sharedTags) && (
        <div className="flex max-w-[72ch] flex-col gap-1">
          {/* In grey, so the draft is the reply's one line in ink. */}
          {reply.angle ? (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Episode angle</span> {reply.angle}
            </p>
          ) : (
            reply.sharedTags && !tagged(reply.sharedTags) && <p className="text-muted-foreground">{NO_ANGLE}</p>
          )}
          {reply.sharedTags && (
            // A line of text, so its tags wrap as words do.
            <p className="type-caption leading-5 text-muted-foreground [&_[data-slot=badge]]:align-top [&_button]:align-top">
              Shares with {show}: <Source of="qloo" />{' '}
              <TagLine
                tags={reply.sharedTags}
                label={`Evidence for the tags ${name} shares`}
                openCall={actions.openCall}
                opened={opened}
              />
            </p>
          )}
        </div>
      )}
      {editing === null ? (
        <>
          <p className="max-w-[72ch] whitespace-pre-line text-pretty">{reply.draft}</p>
          {(!readOnly || approved) && (
            <div className={row} data-actions>
              {!approved && (
                <Button
                  ref={ref('approve')}
                  type="button"
                  size="sm"
                  disabled={off}
                  onClick={() => void act(() => actions.approveReply(reply.pitch), 'copy', 'approve')}
                >
                  Approve
                  {about}
                </Button>
              )}
              <Button
                ref={ref('copy')}
                type="button"
                size="sm"
                variant={approved ? 'default' : 'secondary'}
                disabled={!approved}
                onClick={() => void copy()}
              >
                {approved && copied === reply.draft ? (
                  <CheckIcon data-icon="inline-start" aria-hidden="true" />
                ) : (
                  <CopyIcon data-icon="inline-start" aria-hidden="true" />
                )}
                {approved && copied === reply.draft ? 'Copied' : 'Copy'}
                {about}
              </Button>
              {!readOnly && (
                <>
                  <Button
                    ref={ref('edit')}
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={off}
                    onClick={() => setEditing(reply.draft)}
                  >
                    Edit
                    {about}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={off}
                    ref={ref('discard')}
                    onClick={() => void act(() => actions.discardReply(reply.pitch), 'restore', 'discard')}
                  >
                    Discard
                    {about}
                  </Button>
                </>
              )}
              <small className="type-caption text-muted-foreground">
                {approved ? 'Copy it into your own email to send.' : 'Copy unlocks once you approve.'}
              </small>
            </div>
          )}
          {/* The button's "Copied", told to screen readers too. */}
          <span role="status" className="vh">
            {approved && copied === reply.draft ? 'Copied' : ''}
          </span>
          {uncopied && (
            <StateLine kind="error" role="alert">
              This browser didn’t let Crossfeed copy it. Select the reply and copy it yourself.
            </StateLine>
          )}
        </>
      ) : (
        <form className="flex flex-col gap-2" onSubmit={save}>
          <Field>
            <FieldLabel htmlFor={`reply-${reply.pitch}`}>Reply about {name}</FieldLabel>
            <Textarea
              ref={ref('text')}
              id={`reply-${reply.pitch}`}
              rows={5}
              value={editing}
              onChange={(e) => setEditing(e.target.value)}
              disabled={busy}
              // The Edit button that opened it has gone; the text takes its place, and focus.
              autoFocus
              className="max-w-[72ch]"
            />
          </Field>
          <div className={row}>
            <Button type="submit" size="sm" disabled={busy || !editing.trim()}>
              {busy && <Spinner data-icon="inline-start" />}
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                next.current = 'edit'
                setEditing(null)
              }}
            >
              Cancel
            </Button>
            <small className="type-caption text-muted-foreground">
              {approved ? 'Saving returns it to draft, to approve again.' : 'Saving keeps it a draft.'}
            </small>
          </div>
        </form>
      )}
      <Alert error={error} />
    </li>
  )
}

// What the pitch run ranked against, as its record: the show, then each past guest's work with its
// guest and type, how Qloo matched it, and its search's call. A work that didn't match is no anchor,
// and the note under them says so.
function Anchors({ booking, openCall, opened }: { booking: Booking; openCall: OpenCall; opened: string | null }) {
  return (
    <Section
      id="anchors-h"
      title="Ranked against"
      badge={<Source of="qloo" />}
      description="The show and past guests’ works the run ranked the pitches against, each as Qloo matched it."
    >
      <ul className="flex flex-col gap-2.5">
        <li className="flex flex-col">
          <span className="font-medium">{booking.show.entity.name}</span>
          <span className="type-caption text-muted-foreground">The show</span>
        </li>
        {booking.pastGuests.map((g, i) => (
          <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3">
            <span className="font-medium">{g.work.title}</span>
            <span className="justify-self-end">
              {g.match && (
                <CallButton
                  call={g.match.evidence}
                  label={`Evidence for ${g.work.title}`}
                  opened={opened}
                  openCall={openCall}
                />
              )}
            </span>
            <span className="col-span-full type-caption text-muted-foreground">
              {g.guest} · {typeLabel[g.work.type]}
              {g.work.year !== null && ` · ${g.work.year}`} · <AnchorMatch match={g.match} />
            </span>
          </li>
        ))}
      </ul>
      {booking.pastGuests.some((g) => g.match && g.match.resolution !== 'resolved') && (
        <p className="type-caption text-muted-foreground">
          A past guest’s work that didn’t match isn’t an anchor. Edit it and rank again.
        </p>
      )}
    </Section>
  )
}

// How a past guest's work matched, in its word: quiet once matched, in ink when it didn't, and a
// failed lookup with its square ✕.
function AnchorMatch({ match }: { match: WorkMatch | null }) {
  if (!match) return <>Looking up…</>
  if (match.resolution === 'resolved') return <>{matchLabel.resolved}</>
  if (match.resolution === 'failed')
    return (
      <StateLine kind="failed" word={matchLabel.failed}>
        {null}
      </StateLine>
    )
  return <b className="font-medium text-foreground">{matchLabel[match.resolution]}</b>
}

// A pitch's subject, or the first line of a pasted one.
const title = (p: Pitch) => p.subject ?? p.body.split('\n').find((l) => l.trim()) ?? p.id

// Every pitch as read, in the roster table's anatomy: a real table whose rules bleed 8px past the
// text, the pitch's name a button that opens it in the inspector's Pitch tab, with its sender under
// it; the guest and work as Claude read them, or as the sample gives them; the work's Qloo match, or
// why it has none and the way to settle it; and the search's call. Its caption says where each comes
// from, but for the sample's guests and works, which the page's title badge says are the sample's;
// and for an earlier run viewed (`viewing`), which run's they are; the Pitches section's
// sentence says what reaches Qloo. A set-aside pitch's guest and work cells look empty, and say
// "None" to screen readers rather than "blank". The pitch open in the inspector, or whose evidence
// is, holds the tone step. Narrower than the table, it scrolls sideways in its region with the
// pitch's column held at the left.
function PitchTable({
  pitches,
  sample,
  viewing,
  selected,
  select,
  openCall,
  opened
}: {
  pitches: Pitch[]
  sample: boolean
  viewing: number | null // the number of the earlier run whose pitches these are
  selected: string | null
  select: (id: string, from: HTMLElement) => void
  openCall: OpenCall
  opened: string | null
}) {
  // One shaded row: the pitch open in the inspector or, with none open, the one whose evidence is.
  const hot = selected ?? pitches.find((p) => p.match && p.match.evidence === opened)?.id
  const cell = 'border-b py-3 pl-3 align-top group-data-selected/row:bg-muted'
  const head = 'border-b pb-2 pl-3 text-left align-bottom font-normal'
  // The pitch's column, held at the left while the rest scrolls under it, ruled where they meet.
  const held = 'sticky left-0 bg-background pl-2 max-md:border-r max-md:pr-3'
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 type-caption text-muted-foreground" id="pitches-cap">
        {viewing && `As they were when run ${viewing} ended.`}{' '}
        {/* The sample inbox's come already read, which the page's title badge says. */}
        {!sample && (
          <>
            <Source of="agent" /> Guest and work as Claude read them from each pitch.
          </>
        )}{' '}
        <Source of="qloo" /> Matches from Qloo search, one call per work. Select a pitch to read it or confirm its
        match.
      </p>
      <ScrollTable label="Pitch table" className="-mx-2 max-w-none">
        {/* Positioned, so the visually hidden "None" scrolls and clips with the table, not the page. */}
        <table
          className="relative w-full min-w-[46rem] border-separate border-spacing-0"
          aria-describedby="pitches-cap"
        >
          <thead className="type-caption text-muted-foreground">
            <tr>
              <th scope="col" className={cn(head, held)}>
                Pitch
              </th>
              <th scope="col" className={cn(head, 'w-36')}>
                Guest
              </th>
              <th scope="col" className={head}>
                Public work · type · year
              </th>
              <th scope="col" className={head}>
                Qloo match · popularity percentile
              </th>
              <th scope="col" className={cn(head, 'w-16 pr-2 text-right')}>
                Call
              </th>
            </tr>
          </thead>
          <tbody>
            {pitches.map((p) => (
              <tr
                key={p.id}
                // On the selected row's tone step, its tone-filled chips lift onto the card.
                className="group/row [&[data-selected]_[data-variant=default]]:bg-card"
                data-status={p.status}
                data-selected={p.id === hot || undefined}
                aria-busy={p.status === 'reading' || p.status === 'looking_up' || undefined}
              >
                <th scope="row" className={cn(cell, held, 'text-left font-normal')}>
                  <span className="flex w-48 flex-col items-start gap-1 md:w-60">
                    <button
                      type="button"
                      id={`open-${p.id}`}
                      aria-current={p.id === selected || undefined}
                      onClick={(e) => select(p.id, e.currentTarget)}
                      className="cursor-pointer text-left text-[15px] leading-snug font-semibold decoration-1 underline-offset-4 hover:underline aria-[current]:underline max-md:-my-3 max-md:py-3"
                    >
                      {title(p)}
                    </button>
                    {p.from && (
                      <span className="w-full truncate type-caption text-muted-foreground" title={p.from}>
                        {p.from}
                      </span>
                    )}
                  </span>
                </th>
                <td className={cell}>{p.guest ?? <span className="vh">None</span>}</td>
                <td className={cell}>
                  <WorkCell pitch={p} />
                </td>
                <td className={cell}>
                  <MatchCell pitch={p} settle={(from) => select(p.id, from)} />
                </td>
                <td className={cn(cell, 'pr-2 text-right')}>
                  {p.match && (
                    <CallButton
                      call={p.match.evidence}
                      label={`Evidence for ${p.work?.title ?? p.id}`}
                      opened={opened}
                      openCall={openCall}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollTable>
    </div>
  )
}

function WorkCell({ pitch: { work, status } }: { pitch: Pitch }) {
  if (status === 'reading') return <span className="text-muted-foreground">Reading…</span>
  if (!work) return <span className="vh">None</span>
  return (
    <span className="flex flex-col gap-1">
      <span className="font-medium">{work.title}</span>
      <span className="type-caption text-muted-foreground">
        {typeLabel[work.type]}
        {work.year !== null && ` · ${work.year}`}
      </span>
    </span>
  )
}

// A pitch's state as a chip, marked when it's in trouble, as the roster's match chips are: a spinner
// while it's read or looked up; outlined while a person must settle its match, ambiguous or not in
// Qloo; crimson with the square ✕ when its reading or its lookup failed.
function PitchChip({ pitch: p }: { pitch: Pitch }) {
  const resolution = p.status === 'read' ? p.match?.resolution : undefined
  const pending = p.status === 'reading' || p.status === 'looking_up' || (p.status === 'read' && !p.match)
  const failed = p.status === 'failed' || resolution === 'failed'
  return (
    <Badge
      variant={failed ? 'destructive' : resolution === 'ambiguous' || resolution === 'missed' ? 'outline' : 'default'}
    >
      {pending ? (
        <Spinner />
      ) : failed ? (
        <SquareXIcon aria-hidden="true" />
      ) : resolution === 'missed' ? (
        <CircleDashedIcon aria-hidden="true" />
      ) : null}
      {stateLabel(p)}
    </Badge>
  )
}

// What Qloo matched a pitch's work to, or why it matched nothing, and the way to settle an ambiguous
// match.
function MatchCell({ pitch: p, settle }: { pitch: Pitch; settle: (from: HTMLElement) => void }) {
  const chip = <PitchChip pitch={p} />
  const why = (text: string) => (
    <span className="flex flex-col items-start gap-1">
      {chip}
      <span className="type-caption text-muted-foreground">{text}</span>
    </span>
  )
  if (p.status === 'no_work') return why('No public work: never sent to Qloo.')
  if (p.status === 'unreadable' || p.status === 'failed') return why(p.error ?? '')
  const match = p.match
  if (!match) return chip
  if (match.resolution === 'resolved' && match.entity)
    return (
      <span>
        <span className="font-medium">{match.entity.name}</span>
        {match.entity.disambiguation && (
          <span className="text-muted-foreground"> ({match.entity.disambiguation})</span>
        )}{' '}
        <span className="text-muted-foreground">{percentile(match.entity.popularity)}</span>
      </span>
    )
  if (match.resolution === 'ambiguous')
    return (
      <span className="flex flex-col items-start gap-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {chip}
          <span className="type-caption text-muted-foreground">{match.candidates.length} with this title</span>
        </span>
        <Button variant="link" className="text-left whitespace-normal" onClick={(e) => settle(e.currentTarget)}>
          Confirm the match
        </Button>
      </span>
    )
  if (match.resolution === 'failed') return why(match.error ?? '')
  return why(`${notInQloo(p.work)}.`)
}

// A work Qloo has no match for, in words: "No book with this title by this guest in Qloo". A book is
// matched by its author, other works by year (resolve.ts), so a miss says which.
function notInQloo(work: Work | null) {
  const by = !work ? '' : work.type === 'book' ? ' by this guest' : work.year ? ` from ${work.year}` : ''
  return `No ${work ? workNoun[work.type] : 'work'} with this title${by} in Qloo`
}

// A pitch's state in words, one for each of its chip's, saying what's next when it needs something. An
// unreadable one's is why, which says when that keeps its work from Qloo (extract.ts). A pitch of an
// earlier run can't be confirmed (`confirming` false), so its ambiguous match says what it meant for
// that run instead.
function pitchState(p: Pitch, confirming: boolean) {
  const { match, work } = p
  if (p.status === 'reading') return 'Claude is reading it for its guest and public work.'
  if (p.status === 'no_work') return 'No public work, so it never reaches Qloo.'
  if (p.status === 'unreadable') return sentence(p.error ?? 'Claude couldn’t read it')
  if (p.status === 'failed') return `${sentence(p.error ?? 'Reading it failed')} Not scored.`
  if (!match || !work) return 'Looking its work up in Qloo.'
  if (match.resolution === 'resolved') return 'Its work matched in Qloo, so a run can rank it.'
  if (match.resolution === 'ambiguous')
    return `Qloo found more than one ${workNoun[work.type]} with this title${confirming ? '. Pick the match.' : ', so it wasn’t ranked.'}`
  if (match.resolution === 'missed') return `${notInQloo(work)}, so a run can’t rank it.`
  return `${sentence(match.error ?? 'The lookup failed')} Not scored.`
}

// The pitch opened from a list or the table, in the inspector's Pitch tab, in the inspector's anatomy:
// its subject as the heading, which takes focus as it opens, with its chip; its state in a sentence;
// its facts, its sender, what Claude read from it, or the sample gives, and its work's Qloo match with
// the call that found it; then its work's candidates to confirm, unless it's an earlier run's
// (`confirmWork` null); and its text. It has no Close of its own: the inspector's closes it, and
// selecting another pitch changes it.
function PitchDetail({
  pitch: p,
  sample,
  confirmWork,
  openCall,
  opened
}: {
  pitch: Pitch
  sample: boolean
  confirmWork: Actions['confirmWork'] | null
  openCall: OpenCall
  opened: string | null
}) {
  const { busy, error, run } = useAction()
  const match = p.match
  // Brought into view, with focus on its heading. Scrolled to, it stops clear of the inspector's
  // sticky tabs.
  const heading = useRef<HTMLHeadingElement>(null)
  const ref = useIntoView<HTMLDivElement>(heading)
  return (
    // Scrolled to, it stops clear of the inspector's sticky tabs.
    <div className="min-w-0 scroll-mt-16" ref={ref} data-pitch-detail>
      <Section
        id="pitch-ed"
        title={title(p)}
        heading={heading}
        badge={<PitchChip pitch={p} />}
        description={pitchState(p, confirmWork !== null)}
      >
        <KeyValues>
          {/* A sender's address has no spaces to wrap at. */}
          {p.from && (
            <KeyValue label="From">
              <span className="break-words">{p.from}</span>
            </KeyValue>
          )}
          <KeyValue label="Guest">{p.guest ?? '–'}</KeyValue>
          <KeyValue label="Public work">
            {p.work ? `${p.work.title} · ${typeLabel[p.work.type]}${p.work.year ? ` · ${p.work.year}` : ''}` : '–'}
          </KeyValue>
          {/* A settled search cites its call, matched or not; while it's looked up there's no record yet. */}
          <KeyValue label="Qloo match">
            {match ? (
              <>
                {match.resolution === 'resolved' && match.entity ? (
                  <>
                    {match.entity.name}
                    {match.entity.disambiguation && ` (${match.entity.disambiguation})`}
                  </>
                ) : (
                  'None'
                )}{' '}
                <CallButton
                  call={match.evidence}
                  label={`Evidence for ${p.work?.title ?? match.entity?.name ?? 'the work'}`}
                  opened={opened}
                  openCall={openCall}
                />
              </>
            ) : (
              '–'
            )}
          </KeyValue>
          {!sample && (
            <KeyValue label="Read by">
              <Source of="agent" />
            </KeyValue>
          )}
        </KeyValues>
        {confirmWork && match && match.candidates.length > 0 && p.work && (
          <PickOne
            legend={`Which Qloo ${workNoun[p.work.type]} is ${p.work.title}?`}
            options={match.candidates}
            current={match.resolution === 'resolved' ? match.entity?.id : undefined}
            note={
              <>
                Same-title results from Qloo search{' '}
                <CallButton
                  call={match.evidence}
                  label={`Evidence for ${p.work.title}`}
                  opened={opened}
                  openCall={openCall}
                />
              </>
            }
            submit="Use this match"
            busy={busy}
            pick={(id) => run(() => confirmWork(p.id, id))}
          />
        )}
        <Alert error={error} />
        <div
          className="rounded-lg bg-muted p-3 break-words whitespace-pre-line"
          tabIndex={0}
          role="region"
          aria-label="Pitch text"
        >
          {p.body}
        </div>
      </Section>
    </div>
  )
}

// The inbox's pitches counted by their word, which says how many a run can rank: a compact key/value
// list, two pairs to a row, as the roster check is, with a chip while some are still being read, or for
// the sample, whose pitches come already read, looked up.
function InboxCheck({ pitches, sample }: { pitches: Pitch[]; sample: boolean }) {
  const count = pitchTally(pitches)
  const rows = ['Matched', 'Ambiguous', 'Not in Qloo', 'Lookup failed', 'Set aside', 'Unreadable', 'Failed'] as const
  const pending = count('Reading') + count('Looking up')
  return (
    <Section
      id="inbox-check"
      title="Inbox check"
      badge={
        pending > 0 && (
          <Badge>
            <Spinner />
            {pending} still {sample ? 'looking up' : 'reading'}
          </Badge>
        )
      }
      description="Matched works are the ones that can be ranked against the show."
    >
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1">
        {rows.map((label) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="tabular-nums">{count(label)}</dd>
          </div>
        ))}
      </dl>
      <p className="type-caption text-muted-foreground">
        Set-aside pitches have no public work; they and unreadable pitches never reach Qloo.
      </p>
    </Section>
  )
}
