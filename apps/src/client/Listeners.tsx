import { cn } from 'cn'
import { useRef } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import type { Show } from '../agent'
import { AGE_BUCKETS, ageWords, MISMATCH, round } from '../demographics'
import {
  listenerFinding,
  listenerShape,
  rosterRows,
  toProfile,
  tooFewToProfile,
  type Lean,
  type ListenerProfile
} from '../listeners'
import { isStale, MIN_OVERLAP_ENTITIES } from '../overlap'
import { clock, day, demographic, ScrollTable, useAction } from './controls'
import { CallButton, type OpenCall } from './Evidence'
import type { NetworkConnection } from './NetworkPage'
import { count, Section } from './PageHeader'
import { AnalysisAction, AnalysisShow, heldShow } from './RosterAnalysis'
import { Source } from './Source'
import { sentence, StateLine } from './states'

// The roster page's Listeners tab: who the network's own shows reach, as Qloo profiles them in one
// demographics call (listeners.ts). Its sentence is the finding in words, or the state it's in: too few
// shows matched, not profiled yet, profiling, or failed, in a status region, with the call beside it once
// it has answered. Then what's stale, the action with what it may spend, and the table, in the roster's
// order: each show's leans by age band and gender as bars either side of zero, labelled with their signed
// figures. Polarity shows by position and sign, never by hue, and nothing on it is signal orange, since
// it's Qloo's measure, not a proposal. A teammate's profile arrives through synced state.
export function ListenersSection({
  agent,
  roster,
  profile,
  openCall,
  opened
}: {
  agent: NetworkConnection
  roster: Show[]
  profile: ListenerProfile | undefined
  openCall: OpenCall
  opened: string | null
}) {
  // The section's heading, which takes focus from the action, as the action goes with the profile it starts.
  const heading = useRef<HTMLHeadingElement>(null)
  const { busy, error, run } = useAction()
  // The roster's matched shows in its order, with what the profile has for each, as programs read them.
  const rows = rosterRows(roster, profile)
  const few = rows.length < MIN_OVERLAP_ENTITIES
  // What a profile would ask now: one call, or none with the roster's matched shows unchanged since one landed.
  const { calls } = toProfile(roster, profile)
  const profiling = profile?.status === 'profiling'
  const stale = profile !== undefined && isStale(profile, roster)
  const start = async () => {
    if (await run(() => agent.stub.profileListeners())) heading.current?.focus()
  }
  const state = profiling ? (
    <StateLine kind="loading">{`Profiling the listeners of ${count(profile.key.split(',').length, 'show')}.`}</StateLine>
  ) : few ? (
    <StateLine kind="empty">{tooFewToProfile(rows.length)}</StateLine>
  ) : !profile ? (
    <StateLine kind="empty">The roster’s listeners haven’t been profiled yet.</StateLine>
  ) : profile.status === 'failed' ? (
    <StateLine kind="failed">{sentence(profile.error ?? 'The profile failed.')}</StateLine>
  ) : (
    listenerFinding(rows, (r) => r.shows[0].name)
  )
  return (
    <Section
      id="listeners-h"
      title="Who your shows reach"
      badge={<Source of="qloo" />}
      heading={heading}
      // The sentence is a status region whatever it says, so the profile as it starts, and the finding it
      // ends on, a teammate's included, are told as they change; the call that answered follows it.
      description={
        <>
          <span role="status">{state}</span>
          {profile?.call && !profiling && (
            <>
              {' '}
              <CallButton
                call={profile.call}
                label="Evidence for the listener profile"
                opened={opened}
                openCall={openCall}
              />
            </>
          )}
        </>
      }
      data-listeners
    >
      {!few && !profiling && (
        <AnalysisAction
          stale={
            stale &&
            'The roster’s matched shows have changed since the listeners were profiled, so profile them again to read them as the roster is now.'
          }
          failed={null}
          action={profile ? 'Profile again' : 'Profile the listeners'}
          calls={calls}
          costId="listeners-cost"
          busy={busy}
          error={error}
          start={() => void start()}
        />
      )}
      {(profile?.status === 'profiled' || profiling) && (!few || profiling) && (
        <ListenersTable profile={profile} rows={rows} />
      )}
    </Section>
  )
}

// The profile as a real table, in the roster's order: one row per Qloo show, named by its first show on
// the roster, as the overlap's table names it; then a column per age band, youngest first, and one for
// gender, the lean toward male listeners, since Qloo's lean toward female ones is always its negative.
// Narrower than the table, it scrolls sideways in its region with the show's column held at the left, so
// what a row says in words, a show that leans differently from most, or one with no leans to show, stands
// under its name there.
function ListenersTable({ profile, rows }: { profile: ListenerProfile; rows: ReturnType<typeof rosterRows> }) {
  const { apart } = listenerShape(rows)
  // One scale for every bar, so a bar's length compares across shows and bands: the largest lean, up to
  // the next tenth, and never under 0.3, so the gender zone's ±0.2 stands inside it. It's in tenths, so a
  // bar's width is a figure of three places times a whole number, free of float noise.
  const leans = profile.rows.flatMap((r) => (r.lean ? [...AGE_BUCKETS.map((b) => r.lean!.age[b]), r.lean.male] : []))
  const scale = Math.max(3, Math.ceil(Math.round(Math.max(0, ...leans.map(Math.abs)) * 1e4) / 1e3))
  const head = 'border-b pb-2 pl-3 align-bottom font-normal'
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <ScrollTable label="Listener profile table" className="-mx-2 max-w-none">
        {/* The lean columns share the width beside the show's equally (table-fixed), so the one scale draws a
            lean as long in every column; each is at least 5.75rem, room for its figure, a bar either
            side, and gender's two ends. */}
        <table
          className="w-full min-w-[52rem] table-fixed border-separate border-spacing-0 [--show:11rem] md:min-w-[55rem] md:[--show:14rem]"
          aria-labelledby="listeners-h"
          aria-describedby="listeners-cap"
          data-listeners-table
        >
          <thead className="type-caption text-muted-foreground">
            <tr>
              <th scope="col" className={cn(head, heldShow, 'w-(--show) text-left')}>
                Show
              </th>
              {AGE_BUCKETS.map((b) => (
                <th key={b} scope="col" className={cn(head, 'pr-3 text-center')}>
                  {ageWords(b)}
                </th>
              ))}
              {/* Its two ends name which way a bar leans; screen readers hear what the column holds. */}
              <th scope="col" className={cn(head, 'pr-3')}>
                <span className="flex justify-between gap-1" aria-hidden="true">
                  <span>Female</span>
                  <span>Male</span>
                </span>
                <span className="vh">Gender: the lean toward male listeners</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const { entity, shows, status: state, lean } = row
              const note = {
                profiled: apart.includes(row) ? 'Leans differently' : undefined,
                missing: 'No listener profile in Qloo.',
                unprofiled: 'Not profiled yet',
                profiling: undefined
              }[state]
              return (
                <tr
                  key={entity.id}
                  data-listener-row={shows[0].name}
                  data-state={state}
                  aria-busy={state === 'profiling' || undefined}
                >
                  <AnalysisShow entity={entity} shows={shows} note={note} />
                  {state === 'profiled' ? (
                    <LeanCells lean={lean!} scale={scale} />
                  ) : state === 'profiling' ? (
                    AGE_BUCKETS.concat('male').map((b, i) => (
                      <td key={b} className="border-b px-3 py-3 align-top">
                        {i === 0 && <span className="vh">Profiling</span>}
                        <span className="flex flex-col items-center gap-1.5">
                          <Skeleton className="h-5 w-12" />
                          <Skeleton className="h-3 w-full" />
                        </span>
                      </td>
                    ))
                  ) : (
                    // Its words stand under its name; screen readers hear the cells hold nothing, not "blank".
                    <td colSpan={AGE_BUCKETS.length + 1} className="border-b">
                      <span className="vh">None</span>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </ScrollTable>
      <div id="listeners-cap" className="flex max-w-[72ch] flex-col gap-1 type-caption text-muted-foreground">
        <p>
          Leans are relative to the average in Qloo and describe listeners, not people. A gender lean inside the shaded
          zone isn’t counted.
        </p>
        {profile.profiledAt && <p>{`Profiled ${day(profile.profiledAt)}, ${clock(profile.profiledAt)}.`}</p>}
      </div>
    </div>
  )
}

// A show's leans, a cell each: the age bands youngest first, then gender, with the demographic check's
// skew threshold drawn around its zero line, a lean inside it uncounted.
const LeanCells = ({ lean, scale }: { lean: Lean; scale: number }) => (
  <>
    {AGE_BUCKETS.map((b) => (
      <LeanCell key={b} value={lean.age[b]} scale={scale} />
    ))}
    <LeanCell value={lean.male} scale={scale} zone={MISMATCH.skew} />
  </>
)

// One lean as a bar left or right of a zero line, its length the lean's size on the table's `scale` (in
// tenths, so half the cell is that many tenths), under its signed figure in the demographic format,
// centred over the line, so a column's figures align. A lean toward an age band, above average, is in ink,
// as the finding is about those; one away from it is in secondary ink, a tone, never a hue. With `zone`, the
// gender column's, every lean is toward a group, male or female, so both sides are ink; the tone-step zone
// of ±zone around the line is drawn under the bar, and screen readers hear which way it leans, and whether
// that counts.
function LeanCell({ value, scale, zone }: { value: number; scale: number; zone?: number }) {
  const lean = round(value)
  const half = (x: number) => `${Math.min(Math.abs(x) * 500, scale * 50) / scale}%`
  const toward = lean > 0 || zone !== undefined
  const figure = (
    <>
      {demographic(lean)}
      {zone !== undefined && (
        <span className="vh">
          {lean === 0
            ? ', no lean'
            : `, leans ${lean > 0 ? 'male' : 'female'}${Math.abs(lean) < zone ? ', inside the zone, not counted' : ''}`}
        </span>
      )}
    </>
  )
  return (
    <td className="border-b px-3 py-3 align-top">
      <span className="flex flex-col gap-1.5">
        <span className="text-center">{figure}</span>
        <span className="relative h-3" aria-hidden="true">
          {zone !== undefined && (
            <span
              className="absolute inset-y-0 bg-muted"
              style={{ left: `calc(50% - ${half(zone)})`, width: `calc(2 * ${half(zone)})` }}
              data-zone
            />
          )}
          {lean !== 0 && (
            <span
              className={cn(
                'absolute inset-y-0.5',
                lean > 0 ? 'left-1/2 rounded-r-[2px]' : 'right-1/2 rounded-l-[2px]',
                toward ? 'bg-foreground' : 'bg-muted-foreground'
              )}
              style={{ width: half(lean) }}
              data-tone={toward ? 'ink' : 'secondary'}
            />
          )}
          <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-muted-foreground" />
        </span>
      </span>
    </td>
  )
}
