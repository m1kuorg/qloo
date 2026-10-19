/** @jsxImportSource hono/jsx */
// The marketing pages: the landing page at /, the privacy page, and the beta terms. Server-rendered
// with no island. Nothing here is a Qloo response: the chart and every other illustration use
// made-up shows, and each says so where it appears.
import { Hono } from 'hono'
import { bandMeter, FINALISTS, type Band as Third } from '../fit'
import { MAX_PITCH_CHARS, MAX_PITCHES } from '../inbox'
import { MAX_QLOO_CALLS, MAX_TURNS } from '../limits'
import { CSV_HEADER } from '../order'
import { marketingShell } from '../shell'
import { moveGlyph, moveWords } from '../text'
import { CLIMB } from '../topic'
import { SESSION_DAYS } from './demo'

export const marketing = new Hono<{ Bindings: Env }>()

// The hero's illustration: a made-up network's roster ranked against a made-up true-crime launch.
// `last` is the rank a topic-only plan gives the show; bands are thirds of a 12-show roster.
const LAUNCH = 'Lantern Hollow'
const chart: { rank: number; last: number; show: string; genre: string; band: Third }[] = [
  { rank: 1, last: 1, show: 'Dead Air Archive', genre: 'True crime', band: 'top' },
  { rank: 2, last: 7, show: 'The Long Table', genre: 'History', band: 'top' },
  { rank: 3, last: 2, show: 'Motive & Means', genre: 'True crime', band: 'top' },
  { rank: 4, last: 5, show: 'Ledger Lines', genre: 'Business', band: 'top' },
  { rank: 5, last: 9, show: 'Back Roads Radio', genre: 'Travel', band: 'middle' },
  { rank: 6, last: 3, show: 'Courtroom Sketch', genre: 'Legal news', band: 'middle' }
]
// The climber whose why line is open, as a selected climber's is in the app.
const SELECTED = 'The Long Table'

// The fit band's meter and word, as the app's charts set it.
const Band = ({ band }: { band: Third }) => {
  const { bars, word } = bandMeter[band]
  return (
    <span class={`band b${bars}`}>
      <i aria-hidden="true" />
      <i aria-hidden="true" />
      <i aria-hidden="true" />
      {word}
    </span>
  )
}

// The Weekly Chart, as the app sets it, at the hero's scale.
function Chart() {
  let landing = 0
  return (
    <table class="chart fit-chart mk-chart">
      <caption>Illustration: a made-up network, launch, shows, ranks, and tags. Not Qloo data.</caption>
      <colgroup>
        <col class="c-pos" />
        <col class="c-lw" />
        <col class="c-mv" />
        <col />
        <col class="c-band" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">
            This week<small>fit rank</small>
          </th>
          <th scope="col">
            Last week<small>topic rank</small>
          </th>
          <th scope="col">
            Move<small>vs topic</small>
          </th>
          <th scope="col">
            Show<small>its topic</small>
          </th>
          <th scope="col">
            Fit band<small>listener overlap</small>
          </th>
        </tr>
      </thead>
      <tbody>
        {chart.map((r) => {
          const move = r.last - r.rank
          const climber = move >= CLIMB
          const open = r.show === SELECTED
          return (
            <>
              <tr class={open ? 'hot' : undefined}>
                <td class="pos">
                  {r.rank}
                  {climber && <i class="bul" aria-hidden="true" style={`--landing: ${landing++}`} />}
                </td>
                <td class="lw">{r.last}</td>
                <td class={`mv${move < 0 ? ' dn' : move === 0 ? ' eq' : ''}`}>
                  <span aria-hidden="true">{moveGlyph(move)}</span>
                  <span class="vh">{moveWords(move)}</span>
                </td>
                <td>
                  <div class="nm-row">
                    <span class="nm">{r.show}</span>
                    {r.rank <= FINALISTS && <span class="chip">Finalist</span>}
                  </div>
                  <div class="tg">{r.genre}</div>
                </td>
                <td>
                  <Band band={r.band} />
                </td>
              </tr>
              {open && (
                <tr class="why">
                  {/* One cell across the row, its line set under the show column, so a phone can give it
                      the whole width. */}
                  <td colspan={5}>
                    <p class="mk-why">
                      <span class="lbl">Why it moved</span>
                      Topic alone ranks it 7th: it&apos;s a history show. Listener overlap with {LAUNCH} ranks it 2nd{' '}
                      <span class="call">C-14</span>, and the tags they share are{' '}
                      {['Investigative', 'Small-town', 'Slow-burn'].map((t, i) => (
                        <>
                          {i > 0 && '\u00a0· '}
                          <span class="nw">{t}</span>
                        </>
                      ))}{' '}
                      <span class="call">C-17</span>
                    </p>
                  </td>
                </tr>
              )}
            </>
          )
        })}
      </tbody>
    </table>
  )
}

// The chart's key: each piece of the notation, led by itself as the chart sets it.
const key = [
  {
    glyph: <span class="pos">1</span>,
    term: 'This week',
    text: "Fit rank: how much the show's listeners overlap the launch's, scored in Qloo."
  },
  {
    glyph: <span class="lw">7</span>,
    term: 'Last week',
    text: 'Topic rank: where a plan by topic alone puts the show. Claude ranks it from show names and descriptions, with no Qloo data.'
  },
  { glyph: <span class="mv">▲5</span>, term: 'Move', text: 'The places shared listeners moved it.' },
  {
    glyph: <i class="bul" aria-hidden="true" />,
    term: 'Climber',
    text: 'Up three places or more: the show a topic plan would have missed.'
  },
  {
    glyph: <Band band="top" />,
    term: 'Fit band',
    text: 'Strong, Good, or Fair: thirds of the ranking. The raw scores stay in the evidence.'
  },
  {
    glyph: <span class="chip">Finalist</span>,
    term: 'Finalist',
    text: 'The top five, after any show you leave out. The insertion order is drafted from them.'
  },
  {
    glyph: <span class="call">C-14</span>,
    term: 'Call number',
    text: "The Qloo call behind a claim. In the app, open it for the request's parameters and the names, tags, and scores Qloo returned."
  }
]

// An illustration below the hero, headed like a module of the app, with the hero's Illustration chip:
// every illustration on the page says it's one where it appears.
const Fig = ({ title, class: className, children }: { title: string; class?: string; children: unknown }) => (
  <figure class={className ? `mk-fig ${className}` : 'mk-fig'}>
    <figcaption class="mh">
      <span class="lbl">{title}</span>
      <span class="chip">Illustration</span>
    </figcaption>
    {children}
  </figure>
)

// What the landing page offers as the ways in: the sample network first, then, while accounts are
// on, a network of one's own.
const WaysIn = ({ accounts }: { accounts: boolean }) => (
  <p class="mk-acts">
    <a class="btn pri mk-go" href="/demo">
      Open the sample network
    </a>
    {accounts && (
      <a class="btn mk-alt" href="/app/new">
        Create your network
      </a>
    )}
  </p>
)

function Landing({ accounts, inbox }: { accounts: boolean; inbox: boolean }) {
  return (
    <main class="mk">
      <section class="mk-hd" aria-labelledby="mk-h1">
        <h1 id="mk-h1">Rank your roster by who listens, not by topic.</h1>
        <p class="mk-lede">
          Crossfeed scores a podcast network&apos;s own shows in Qloo by how much their listeners overlap a
          launch&apos;s, then drafts the promo plan as an insertion order you approve.
        </p>
        <WaysIn accounts={accounts} />
        <p class="mk-note">
          No sign-in. It opens on 19 public show names from The Ringer with sample figures; Crossfeed isn&apos;t
          affiliated with The Ringer.
        </p>
      </section>

      <section class="mk-grid mk-board" aria-labelledby="mk-launch">
        <div class="mk-chart-col">
          <div class="mk-launch">
            <h2 id="mk-launch">
              <span>Launch ·</span> {LAUNCH}
            </h2>
            <span class="chip">Illustration</span>
          </div>
          <p class="sub-line">
            A true-crime launch. By topic it goes on the network&apos;s true-crime shows; by shared listeners, a history
            show comes second.
          </p>
          <p class="legend">
            <i class="bul" aria-hidden="true" />
            Bullet: up 3+ places on topic rank.
          </p>
          <div class="mk-frame">
            <Chart />
          </div>
        </div>
        <aside class="mk-key mk-rail" aria-labelledby="mk-key-h">
          <h2 id="mk-key-h" class="lbl">
            How to read the chart
          </h2>
          <dl>
            {key.map((k) => (
              <div class="mk-k">
                <dt>
                  <span class="mk-g" aria-hidden="true">
                    {k.glyph}
                  </span>
                  {k.term}
                </dt>
                <dd>{k.text}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </section>

      <section class="mk-sec" aria-labelledby="mk-run">
        <h2 id="mk-run">How a run works</h2>
        <ol class="mk-steps">
          <li>
            <h3>Name the launch</h3>
            <p>
              A released show, or up to three released comps standing in for one that isn&apos;t out yet. Crossfeed
              looks up every roster show in Qloo by name, asks which match is right when a name is ambiguous, and lets
              you map a miss to a comp.
            </p>
            <Fig title="Roster">
              <table class="chart mk-frag">
                <thead>
                  <tr>
                    <th scope="col">Show</th>
                    <th scope="col">Qloo match</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Dead Air Archive</td>
                    <td>Matched</td>
                  </tr>
                  <tr>
                    <td>Back Roads Radio</td>
                    <td>
                      <span class="chip">Ambiguous</span> pick one of 2
                    </td>
                  </tr>
                  <tr>
                    <td>Courtroom Sketch</td>
                    <td>
                      <span class="chip" data-state="missed">
                        Not in Qloo
                      </span>{' '}
                      map a comp
                    </td>
                  </tr>
                </tbody>
              </table>
            </Fig>
          </li>
          <li>
            <h3>Answer at each fork</h3>
            <p>
              Qloo ranks the roster by listener overlap with the launch. Crossfeed checks the finalists&apos;
              demographics against the launch&apos;s and finds the tags each one shares with it. The agent stops to ask
              for the slot budget and the shows to leave out, rather than guess.
            </p>
            <Fig title="The agent's question">
              <div class="mk-ask">
                <p class="q">What is the slot budget for {LAUNCH}&apos;s promos, as a slot count or a dollar amount?</p>
                {/* Native radios, inert: the illustration shows them and nothing can pick one. */}
                <ul class="mk-radios">
                  <li>
                    <input type="radio" name="mk-budget" checked inert />
                    <span class="vh">Picked: </span>Promo slots
                  </li>
                  <li>
                    <input type="radio" name="mk-budget" inert />A dollar budget
                  </li>
                </ul>
              </div>
            </Fig>
          </li>
          <li>
            <h3>Approve the order</h3>
            <p>
              The agent drafts an insertion order across the finalists, with a host-read angle for each from the tags it
              shares with the launch. Every slot is priced as the inventory it gives away, from your own figures:
              downloads per episode × CPM ÷ 1,000. You edit it, approve it, and export it as CSV.
            </p>
            <Fig title="Insertion order draft">
              <table class="io mk-frag">
                <thead>
                  <tr>
                    <th scope="col">Show</th>
                    <th scope="col">Slots</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Dead Air Archive</td>
                    <td>8</td>
                  </tr>
                  <tr>
                    <td>The Long Table</td>
                    <td>6</td>
                  </tr>
                  <tr>
                    <td>Back Roads Radio</td>
                    <td>4</td>
                  </tr>
                  <tr class="tot">
                    <th scope="row">Total</th>
                    <td>18</td>
                  </tr>
                </tbody>
              </table>
            </Fig>
          </li>
        </ol>
      </section>

      {inbox && (
        <section class="mk-sec mk-grid mk-flip" aria-labelledby="mk-inbox">
          <div class="mk-copy mk-rail">
            <h2 id="mk-inbox">The booking inbox</h2>
            <p>
              Every pitch is written by a publicist to sound on-topic. Paste a day&apos;s pitches, and Claude reads each
              one for the guest and the public work they&apos;re promoting: a book, film, TV show, or podcast. Qloo
              ranks those works against your show and its best past guests, by who listens rather than by how the pitch
              is worded.
            </p>
            <p>
              The agent drafts a Book, Later, or Decline reply for each pitch, and you approve each one before you can
              copy it. A pitch with no public work is set aside, and nothing about it goes to Qloo.
            </p>
          </div>
          <Fig title="Films pitched to The Long Table, a history show" class="mk-frame">
            <table class="chart fit-chart mk-pitches">
              <colgroup>
                <col class="c-pos" />
                <col />
                <col class="c-band" />
                <col class="c-reply" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">
                    Rank<small>films</small>
                  </th>
                  <th scope="col">
                    Pitched work<small>as the pitch frames it</small>
                  </th>
                  <th scope="col">
                    Fit band<small>listener overlap</small>
                  </th>
                  <th scope="col">
                    Reply<small>drafted</small>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['Harbor Lights', 'a ghost story', 'top', 'Book'],
                    ['Salt and Iron', 'a film about cooking', 'top', 'Book'],
                    ['The Canal Years', 'a history film, right on your topic', 'middle', 'Later'],
                    ['Founders, Again', 'history for everyone', 'bottom', 'Decline']
                  ] as const
                ).map(([work, framed, band, reply], i) => (
                  <tr>
                    <td class="pos">{i + 1}</td>
                    <td>
                      <span class="nm">{work}</span>
                      <div class="tg">Pitched as {framed}</div>
                    </td>
                    <td>
                      <Band band={band} />
                    </td>
                    <td>
                      <span class="chip">{reply}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Fig>
        </section>
      )}

      <section class="mk-sec mk-grid" aria-labelledby="mk-evidence">
        <div class="mk-copy">
          <h2 id="mk-evidence">Evidence on every line</h2>
          <p>
            Every match, rank, and tag in the app cites the Qloo call that produced it. Open the call number to see the
            request&apos;s parameters and what Qloo returned for it: names, tags, and the raw scores the chart leaves
            out. Claude explains and drafts from those records, and never makes up a score.
          </p>
          <dl class="mk-sources">
            <div>
              <dt>
                <span class="chip">Qloo data</span>
              </dt>
              <dd>What Qloo returned: matches, rankings, shared tags, and demographics.</dd>
            </div>
            <div>
              <dt>
                <span class="chip src-agent">Agent</span>
              </dt>
              <dd>What Claude wrote: its questions, the topic ranking, angles, replies, and its closing line.</dd>
            </div>
          </dl>
        </div>
        <Fig title="Evidence · C-14" class="mk-record mk-rail">
          <dl class="rec kv">
            <div class="rec-row">
              <dt>Request</dt>
              <dd>
                <code>POST /v2/insights</code>
              </dd>
            </div>
            <div class="rec-row">
              <dt>Parameters</dt>
              <dd>
                <code class="param">filter.type=urn:entity:podcast</code>
                <code class="param">signal.interests.entities=‹{LAUNCH}›</code>
                <code class="param">filter.results.entities=‹the roster&apos;s other 11 shows›</code>
              </dd>
            </div>
            <div class="rec-row">
              <dt>Returned</dt>
              <dd>Each show&apos;s affinity, which the chart turns into its rank and band.</dd>
            </div>
          </dl>
        </Fig>
      </section>

      <section class="mk-sec" aria-labelledby="mk-never">
        <h2 id="mk-never">What Crossfeed never does</h2>
        <table class="mk-table mk-never">
          <thead>
            <tr>
              <th scope="col">Crossfeed never</th>
              <th scope="col">Instead</th>
            </tr>
          </thead>
          <tbody>
            {[
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
              [
                "Publishes Qloo's data.",
                "Qloo's responses are cached privately on Crossfeed's server and shown only in the app."
              ]
            ].map(([never, instead]) => (
              <tr>
                <th scope="row">{never}</th>
                <td>{instead}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section id="developers" class="mk-sec mk-grid" aria-labelledby="mk-dev">
        <div class="mk-copy">
          <h2 id="mk-dev">For developers</h2>
          <p>
            Crossfeed is one Cloudflare Worker. The page is server-rendered, and the workspace talks to its agent over a
            WebSocket: it reads the agent&apos;s synced state and calls its actions, and never writes state itself.
          </p>
        </div>
        <dl class="rec kv mk-spec mk-rail">
          <div class="rec-row">
            <dt>Runtime</dt>
            <dd>Cloudflare Workers, with a Hono app</dd>
          </div>
          <div class="rec-row">
            <dt>Agent</dt>
            <dd>A Durable Object per session, on the Cloudflare Agents SDK</dd>
          </div>
          <div class="rec-row">
            <dt>Model</dt>
            <dd>Claude Haiku 5.5, through the Anthropic API</dd>
          </div>
          <div class="rec-row">
            <dt>Scores</dt>
            <dd>Qloo&apos;s REST API, behind one gateway that caches, paces, retries, and caps every call</dd>
          </div>
          <div class="rec-row">
            <dt>Evidence</dt>
            <dd>
              A record of every Qloo call: its parameters and the names, tags, and scores it returned, numbered per
              session
            </dd>
          </div>
          <div class="rec-row">
            <dt>Export</dt>
            <dd>
              An approved insertion order as CSV, headed <code>{CSV_HEADER.join(',')}</code>
            </dd>
          </div>
        </dl>
      </section>

      <section class="mk-sec mk-close" aria-labelledby="mk-try">
        <h2 id="mk-try">Try it on a real roster.</h2>
        <p>
          The sample network opens on 19 public show names from The Ringer, with sample figures and a sample launch to
          run. Clear it and paste your own show names to rank them instead.
        </p>
        <WaysIn accounts={accounts} />
      </section>
    </main>
  )
}

marketing.get(
  '/',
  marketingShell(
    null,
    'Crossfeed ranks a podcast network’s own shows by how much their listeners overlap a launch’s, in Qloo, and drafts the promo plan as an insertion order you approve.'
  ),
  (c) => c.render(<Landing accounts={c.env.ACCOUNTS === 'on'} inbox={c.env.GUEST_PITCHES === 'on'} />)
)

// The day the privacy page and the beta terms last changed.
const UPDATED = '19 October 2026'

const Doc = ({ id, title, lede, children }: { id: string; title: string; lede: string; children: unknown }) => (
  <main class="mk mk-doc">
    <article aria-labelledby={id}>
      <h1 id={id}>{title}</h1>
      <p class="mk-lede">{lede}</p>
      <p class="mk-note">Last updated {UPDATED}.</p>
      {children}
    </article>
  </main>
)

function Privacy({ accounts }: { accounts: boolean }) {
  return (
    <Doc
      id="privacy"
      title="Privacy"
      lede="What the Crossfeed beta sends to Qloo and to Anthropic, what it keeps, and how it's deleted."
    >
      <h2>What reaches Qloo</h2>
      <p>Qloo scores the roster and the pitched works. Crossfeed sends it only public names and Qloo&apos;s own IDs:</p>
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

      <h2>What reaches Anthropic</h2>
      <p>
        Claude Haiku 5.5, through Anthropic&apos;s API, runs the agent, the topic ranking, and the pitch reader. It
        gets:
      </p>
      <ul>
        <li>
          the launch&apos;s name or its comps, the roster&apos;s show names and descriptions, and what Qloo returned for
          them;
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

      <h2>What Crossfeed keeps</h2>
      <ul>
        <li>
          <b>In your browser:</b> one cookie, <code>crossfeed_session</code>, a random ID that names your session.
          It&apos;s HttpOnly and lasts {SESSION_DAYS} days. There are no analytics, ads, or third-party scripts.
        </li>
        <li>
          <b>In your session:</b> the roster and your edits, launches, every run with its conversation with Claude,
          insertion orders, the pitches you load, draft replies, and the evidence record of every Qloo call.
        </li>
        {accounts && (
          <li>
            <b>With an account:</b> your name; your passkeys&apos; public keys, each with the browser it was added from;
            and only hashes of your session and recovery code. The networks you create or join, with your role in each
            and when you joined and last opened it. Invite links are kept only as hashes, with who made each, who used
            it, and when, and are deleted once they expire, seven days after they&apos;re made. A network&apos;s API
            keys are kept only as hashes, with each key&apos;s name and first characters, who made it, when, and the
            last minute it was used. Each network&apos;s roster, CPM, and inbox are kept in its own storage, with the
            member who approved each reply, and each of its launches in storage of its own: its runs, a copy of the
            roster and CPM each run ranked, with their Qloo records, the name of the member or API key that started each
            run, and of the member who approved each insertion order, and when. Only the network&apos;s members and its
            API keys can open them. A network&apos;s own Qloo key, if an owner adds one, is kept encrypted in the
            network&apos;s own Qloo storage, with the host it&apos;s for and its last four characters, the only part of
            it anyone is shown. That storage also caches the answers to the network&apos;s Qloo calls and counts them,
            apart from every other network&apos;s.
          </li>
        )}
        <li>
          <b>Uploads:</b> a file you upload is read in your browser
          {accounts && <>, or by Crossfeed when a program sends it to the API</>}. A roster file&apos;s text is sent and
          imported like pasted names; of pitch emails, only each one&apos;s sender, subject, and text are sent, never
          its attachments or other headers. The files themselves aren&apos;t kept.
        </li>
        <li>
          <b>Shared by every session:</b> Qloo&apos;s responses with the requests they answered, cached privately with
          no expiry; the sample launch&apos;s stored run, which replays when Qloo can&apos;t be called; and each
          visitor&apos;s{accounts && <> and each network&apos;s</>} counts for the day against the limits in the{' '}
          <a href="/terms">beta terms</a>.
        </li>
        <li>
          <b>In the logs:</b> one line per Qloo call and per model call, with its timing and counts, and one per run.
          They hold no roster, pitch, or address.
        </li>
      </ul>

      <h2>Your address</h2>
      <p>
        Crossfeed never stores your IP address or writes it to its own logs. When the page connects to its agent, the
        address is hashed with a secret salt, and the hash stays with the connection. The day&apos;s counts are kept
        under a hash of that hash and the UTC day, and earlier days&apos; counts are deleted.
        {accounts && <> Sign-in requests are counted for a minute under the salted hash.</>} Cloudflare, which runs
        Crossfeed, also records each request the Worker serves in its own logs.
      </p>

      <h2>How deletion works</h2>
      <p>
        Crossfeed can&apos;t delete a session yet, and doesn&apos;t delete old sessions on a schedule. When the cookie
        expires or you clear it, your next visit starts a new session, and no browser can reach the old one again, but
        its storage stays. So load nothing into the sample network that you&apos;d want deleted later. Earlier
        days&apos; counts are deleted, and cached Qloo responses stay private to Crossfeed.
      </p>
      {accounts && (
        <p>
          Leaving a network, or being removed from it, deletes your membership at once, and your open pages of it close.
          What you added to the network stays with the network. Deleting a launch, which any of the network&apos;s
          members can do, wipes its storage: its runs, insertion orders, the roster copies, and their Qloo records.
          Removing a network&apos;s own Qloo key, which only an owner can do, wipes its Qloo storage at once: the key,
          its cached answers, and its counts. Deleting a network, which only an owner can do, deletes its memberships,
          invite links, and API keys at once, then wipes its own storage, each of its launches&apos;, and its Qloo
          storage. A wipe that fails is tried again by the next day&apos;s cleanup, which also deletes expired sessions,
          sign-in challenges, and invite links. Deleting your account, on your account page, deletes your account with
          its name, passkeys, recovery code, sessions, and memberships at once. What you did in a network stays with it,
          but not your name: the launches of the networks you&apos;re in say &ldquo;Former member&rdquo; on the runs you
          started and the orders you approved. The API keys and invite links you made stay with their networks, made by
          no one. A network that can&apos;t be reached at once forgets your name at the next day&apos;s cleanup.
          It&apos;s refused while you&apos;re a network&apos;s only owner. &ldquo;Sign out everywhere&rdquo; deletes
          every session of yours.
        </p>
      )}

      <h2>Who else handles it</h2>
      <p>
        Crossfeed runs on Cloudflare Workers, which hosts the app and its storage. Cloudflare, Qloo, and Anthropic
        handle what reaches them under their own policies:{' '}
        <a href="https://www.cloudflare.com/privacypolicy/">Cloudflare&apos;s</a>,{' '}
        <a href="https://www.qloo.com/legal/privacy">Qloo&apos;s</a>, and{' '}
        <a href="https://www.anthropic.com/legal/privacy">Anthropic&apos;s</a>.
      </p>
    </Doc>
  )
}

// A daily limit from wrangler.jsonc, formatted; a value that isn't a number shows as 0.
const cap = (value: string) => (Number(value) || 0).toLocaleString('en-US')

function Terms({ env }: { env: Env }) {
  return (
    <Doc id="terms" title="Beta terms" lede="The terms of the free Crossfeed beta. Using it means you accept them.">
      <h2>Free</h2>
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

      <h2>No warranty</h2>
      <p>
        Crossfeed is provided as is, with no warranty of any kind. It can be wrong, slow, capped, or offline, and it can
        change or end at any time. Its rankings describe overlapping audiences in Qloo, not a promise of results. Check
        a plan before you approve it: no order exports and no reply can be copied until you do, and what you approve is
        your decision.
      </p>

      <h2>Daily limits</h2>
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
      <table class="mk-table mk-limits">
        <thead>
          <tr>
            <th scope="col">A day</th>
            <th scope="col" class="r">
              Each visitor
            </th>
            <th scope="col" class="r">
              Everyone
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">
              Model runs<small>a launch run, an inbox load, or a pitch run</small>
            </th>
            <td class="r">{cap(env.RUN_VISITOR_DAILY_CAP)}</td>
            <td class="r">{cap(env.RUN_DAILY_CAP)}</td>
          </tr>
          <tr>
            <th scope="row">
              Starts that call no model<small>a replay, or a run that stops at once</small>
            </th>
            <td class="r">{cap(env.FREE_START_DAILY_CAP)}</td>
            <td class="r">–</td>
          </tr>
          <tr>
            <th scope="row">
              Qloo calls<small>cache hits count for a visitor, not for everyone</small>
            </th>
            <td class="r">{cap(env.QLOO_VISITOR_DAILY_CALL_CAP)}</td>
            <td class="r">{cap(env.QLOO_DAILY_CALL_CAP)}</td>
          </tr>
        </tbody>
      </table>
      <p>
        {env.ACCOUNTS === 'on' && (
          <>
            A member can create at most {cap(env.NETWORKS_PER_MEMBER)} networks, and a network can keep at most{' '}
            {cap(env.LAUNCHES_PER_NETWORK)} launches at once.{' '}
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

      <h2>Acceptable use</h2>
      <p>Use the beta to plan promos and triage pitches for shows you work on. Don&apos;t:</p>
      <ul>
        <li>
          load pitches, rosters, or anything else you aren&apos;t allowed to share with Crossfeed, Qloo, and Anthropic;
        </li>
        <li>use its rankings to judge, profile, or decide anything about an individual person;</li>
        <li>try to get around the limits, reach another visitor&apos;s session, or overload the service;</li>
        <li>copy, scrape, or republish the Qloo data it shows you.</li>
      </ul>

      <h2>Changes</h2>
      <p>
        These terms change with the beta; the date above says when they last did. The{' '}
        <a href="/privacy">privacy page</a> says what Crossfeed sends and keeps.
      </p>
    </Doc>
  )
}

marketing.get('/privacy', marketingShell('Privacy'), (c) => c.render(<Privacy accounts={c.env.ACCOUNTS === 'on'} />))
marketing.get('/terms', marketingShell('Beta terms'), (c) => c.render(<Terms env={c.env} />))
