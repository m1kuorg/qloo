import { CheckIcon, CopyIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { linkVariants } from '@/components/ui/variants'
import type { ApiKey, CheckedKey } from '../directory'
import type { ToolKind } from '../routes/mcp'
import { CONNECTED, GUEST_NETWORK_CLEARS, listOf, MAX_NAME } from '../text'
import { Alert, clock, Code, day, KeyValue, KeyValues, send, ShownOnce, useAction, useCopy } from './controls'
import { NetworkGate, useNetwork, type NetworkPage } from './NetworkPage'
import { PageHeader, Section } from './PageHeader'
import { settingsColumn } from './settings/Module'
import { connectionOf, StateLine, type Connection } from './states'

// What the server gives the Developers page besides its network: the MCP server's and the REST API's
// addresses, on the app's own origin; for an owner, the network's keys in use, with no secret or prefix
// (null for a member, who doesn't see them); the names of its owners, whom a member asks for a key; and
// the tools the MCP server lists, by what each does.
type Loaded = {
  mcp: string
  api: string
  keys: CheckedKey[] | null
  owners: string[]
  tools: { name: string; kind: ToolKind }[]
}

export function DevelopersPage({
  agentPath,
  network,
  ...loaded
}: { agentPath: string; network: NetworkPage } & Loaded) {
  const agent = useNetwork(agentPath)
  return (
    <NetworkGate agent={agent} network={network}>
      <Developers network={network} connection={agent.state ? connectionOf(agent) : null} {...loaded} />
    </NetworkGate>
  )
}

// The key made on this page: its secret, which only ShownOnce shows, and what the check waits on.
type Made = { id: string; name: string; secret: string }

// The Developers page, which answers "How do I connect my assistant to this network?", in one column as
// settings' is: the header, then its sections in the order a member connects one: the addresses a client
// asks for, the API key it acts with, an owner creating one here and seeing it once, the steps for
// Claude Code, the check that sees the new key's first request, and what an assistant can do with it.
// Only ShownOnce ever shows a key: every command reads it from CROSSFEED_API_KEY. Tests render it from
// the props the server gave the page; `connection` is null until the agent's state arrives.
export function Developers({
  network,
  connection = { lost: null, reconnecting: false },
  mcp,
  api,
  keys,
  owners,
  tools
}: { network: NetworkPage; connection?: Connection | null } & Loaded) {
  const [made, setMade] = useState<Made | null>(null)
  const [listed, setListed] = useState(keys)
  return (
    <main className={settingsColumn}>
      <PageHeader title="Developers" connection={connection} />
      <div className="flex flex-col gap-12">
        <Addresses network={network} mcp={mcp} api={api} />
        <KeySection
          network={network}
          owners={owners}
          made={made}
          onMade={(key, keys) => {
            setMade(key)
            if (keys) setListed(keys)
          }}
        />
        <Assistant mcp={mcp} />
        {/* A new key starts a new wait. */}
        <Check key={made?.id} network={network} keys={listed} made={made} onKeys={setListed} />
        <Tools network={network} tools={tools} />
      </div>
    </main>
  )
}

// A button that copies `value`, its name the word and then what it copies (`what`), visually hidden:
// "Copy", then "Copied", or "Copy failed" when the browser refused, which a status region says too.
function CopyButton({ value, what }: { value: string; what: string }) {
  const { copied, copy } = useCopy(value)
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => void copy()}>
        {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
        {copied ? 'Copied' : copied === false ? 'Copy failed' : 'Copy'}
        <span className="vh"> {what}</span>
      </Button>
      <span role="status" className="vh">
        {copied ? 'Copied' : copied === false ? `Copy failed. Select the ${what} and copy it yourself.` : ''}
      </span>
    </>
  )
}

// A command to paste, with Copy beside its caption, or what one prints (`output`), with none, set as the
// docs set them: on the tone step, the caption over the code, which scrolls sideways inside it on a narrow
// screen rather than wrapping. `name` says which command a Copy copies. A command runs as it's pasted:
// no comment and no placeholder, as zsh would run either as words.
function Snippet({ caption, name, children }: { caption: string; name?: string; children: string }) {
  return (
    <figure
      className="flex min-w-0 flex-col rounded-xl bg-muted"
      data-copyable={name ? true : undefined}
      data-output={name ? undefined : true}
    >
      <figcaption className="flex min-h-10 items-center justify-between gap-3 pt-1 pr-1 pl-4 type-caption text-muted-foreground max-md:min-h-12">
        {caption}
        {name && (
          <span className="flex items-center">
            <CopyButton value={children} what={name} />
          </span>
        )}
      </figcaption>
      <pre
        tabIndex={0}
        translate="no"
        className="overflow-x-auto overscroll-x-contain px-4 pb-3.5 font-mono text-[13px] leading-relaxed focus-visible:-outline-offset-2"
      >
        <code>{children}</code>
      </pre>
    </figure>
  )
}

// What a client asks for to reach the network, each value in mono with its Copy: the MCP server's address,
// the REST API's, and the network's ID. From 768px each is a row, its label, value and Copy in columns;
// under it, the label is over the value.
function Addresses({ network, mcp, api }: { network: NetworkPage; mcp: string; api: string }) {
  const rows = [
    { label: 'MCP server', value: mcp, what: 'MCP server address' },
    { label: 'REST API', value: api, what: 'REST API address' },
    { label: 'Network ID', value: network.id, what: 'network ID' }
  ]
  return (
    <Section
      id="addresses-h"
      title="Addresses"
      description={`Where an assistant or a script reaches ${network.name}, and the ID it names it by.`}
      data-addresses
    >
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 md:grid-cols-[auto_minmax(0,1fr)_auto] md:gap-y-2">
        {rows.map((r) => (
          <div key={r.label} className="col-span-full grid grid-cols-subgrid items-center max-md:not-first:mt-2">
            <dt className="col-span-full text-muted-foreground md:col-span-1">{r.label}</dt>
            <dd className="min-w-0">
              <code className="font-mono text-[13px] wrap-anywhere" translate="no">
                {r.value}
              </code>
            </dd>
            <dd>
              <CopyButton value={r.value} what={r.what} />
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-muted-foreground">
        The{' '}
        <a className={linkVariants()} href="/docs">
          developer docs
        </a>{' '}
        describe the REST API, the SDK and the MCP server.
      </p>
    </Section>
  )
}

// The key an assistant acts with. An owner names one, Claude Code's by default, and creates it with
// settings' route, and sees it this once; a refusal, or a request that failed, stops showing the key made
// before, as settings does. A member reads that only an owner creates them, and who the network's owners
// are, to ask. In a network on the guest budget, it says every guest shares its keys and when they're
// cleared, as every guest shares its runs.
function KeySection({
  network,
  owners,
  made,
  onMade
}: {
  network: NetworkPage
  owners: string[]
  made: Made | null
  onMade: (key: Made | null, keys?: CheckedKey[]) => void
}) {
  const [name, setName] = useState('Claude Code')
  const { busy, error, run } = useAction()
  const create = async () => {
    const created = await run(async () => {
      const answer = await send<{ id: string; secret: string; keys: ApiKey[] }>(`${network.links.settings}/api-keys`, {
        name
      })
      // The list the check shows, with no key's prefix or maker, as the keys route answers it.
      const keys = answer.keys.map(({ id, name, created, lastUsed }) => ({ id, name, created, lastUsed }))
      onMade({ id: answer.id, name: keys.find((k) => k.id === answer.id)?.name ?? name, secret: answer.secret }, keys)
      setName('')
    })
    if (!created) onMade(null)
  }
  return (
    <Section
      id="api-key-h"
      title="API key"
      description={`Each assistant acts for ${network.name} with an API key of its own.`}
    >
      {network.role === 'owner' ? (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void create()
            }}
          >
            <Field>
              <FieldLabel htmlFor="dev-key-name">Key name</FieldLabel>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="dev-key-name"
                  className="max-w-sm flex-1 basis-56"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={MAX_NAME}
                  placeholder="Such as Claude Code"
                  required
                />
                <Button type="submit" disabled={busy || !name.trim()}>
                  {busy && <Spinner data-icon="inline-start" />}
                  {busy ? 'Creating…' : 'Create API key'}
                </Button>
              </div>
            </Field>
          </form>
          {made && (
            <ShownOnce key={made.id} id="dev-key-secret" label="New API key" noun="key" value={made.secret} mono>
              Copy it now: Crossfeed shows each key only once. Then put it in your shell as{' '}
              <Code>CROSSFEED_API_KEY</Code>, the first step under Your assistant, so no command you paste holds it.
            </ShownOnce>
          )}
          <Alert error={error} />
        </>
      ) : (
        <p className="text-muted-foreground">
          Only an owner can create API keys.
          {owners.length > 0 &&
            ` ${network.name}’s ${owners.length === 1 ? 'owner is' : 'owners are'} ${listOf(owners)}.`}
        </p>
      )}
      {network.guestBudget && (
        <p className="text-muted-foreground">
          Every guest shares this network’s API keys, as they share its runs and one set of daily limits, and the keys
          are cleared every day at <span className="whitespace-nowrap">{GUEST_NETWORK_CLEARS},</span> so add nothing
          private with one.
        </p>
      )}
    </Section>
  )
}

// Claude Code's steps, each a numbered line over the command it runs: the key into the shell's
// CROSSFEED_API_KEY with nothing echoed, so it's in no command and no history; the server added, the
// shell filling the header in from the variable; and `claude mcp list`, with the line it prints for a
// server it reached. Then the plugin, which sets the server up with the skills.
function Assistant({ mcp }: { mcp: string }) {
  return (
    <Section
      id="assistant-h"
      title="Your assistant"
      description="Claude Code connects to the MCP server with one command, which takes the key from your shell."
    >
      <ol className="flex list-outside list-decimal flex-col gap-6 pl-5 marker:text-muted-foreground">
        <li>
          <div className="flex flex-col gap-3">
            <p>
              Put the key in your shell as <Code>CROSSFEED_API_KEY</Code>: run this, paste the key, and press Return.
              Nothing shows as you paste, and the key stays out of your shell’s history.
            </p>
            <Snippet caption="Shell" name="command that reads the key">
              {'read -rs CROSSFEED_API_KEY && export CROSSFEED_API_KEY'}
            </Snippet>
          </div>
        </li>
        <li>
          <div className="flex flex-col gap-3">
            <p>
              Add Crossfeed’s MCP server to Claude Code, in the folder you’ll use it from. Claude Code keeps the key
              from then on.
            </p>
            <Snippet caption="Shell" name="claude mcp add command">
              {`claude mcp add --transport http crossfeed ${mcp} \\\n  --header "Authorization: Bearer $CROSSFEED_API_KEY"`}
            </Snippet>
          </div>
        </li>
        <li>
          <div className="flex flex-col gap-3">
            <p>
              Check it: <Code>claude mcp list</Code> should show it connected.
            </p>
            <Snippet caption="Shell" name="claude mcp list command">
              {'claude mcp list'}
            </Snippet>
            <Snippet caption="Output">{`crossfeed: ${mcp} (HTTP) - ${CONNECTED}`}</Snippet>
          </div>
        </li>
      </ol>
      <p className="text-muted-foreground">
        The Crossfeed plugin installs two skills that teach Claude Code to plan launch promos and triage guest pitches,
        with the MCP server: see{' '}
        <a className={linkVariants()} href="/docs/agents">
          Skills and plugin
        </a>
        .
      </p>
    </Section>
  )
}

// How often the check reads the keys while it waits on a new key's first request, and how many reads it
// makes before it stops: 5 minutes of watching, counted only while it's read, so the time spent in a
// terminal with the page hidden or scrolled away doesn't run it out. A read that fails is tried again
// up to FAILURES times in a row.
const POLL_MS = 5_000
const POLLS = 60
const FAILURES = 3

// Where the check stands on the key made on this page: waiting on its first request; seen, at `at`;
// stopped after POLLS reads with none; gone from the keys in use, revoked or deleted; or failed to read.
type Watch =
  | { state: 'waiting' }
  | { state: 'seen'; at: number }
  | { state: 'stopped' }
  | { state: 'gone' }
  | { state: 'failed'; error: string }

// The network's keys in use, as the keys route answers an owner. An answer that isn't its JSON, such as
// the sign-in page a signed-out session is sent to, is refused with why.
async function readKeys(path: string) {
  const res = await fetch(path, { headers: { Accept: 'application/json' } })
  const answer = (await res.json().catch(() => null)) as { keys?: CheckedKey[]; error?: string } | null
  if (res.ok && answer?.keys) return answer.keys
  throw new Error(
    answer?.error ??
      (res.redirected ? 'You were signed out. Sign in again, then check again.' : `Crossfeed answered ${res.status}.`)
  )
}

// Whether a key reached the network. For the key made on this page, the check reads the keys route every
// few seconds, while this section is on screen and the tab is in view, and once more as soon as either
// comes back, one read at a time, until the key's last use is set: then it's connected. After POLLS reads
// with none, it stops, with what to check and Check again. Every key in use shows its last use, or
// Never, with no claim that it's connected: a key's use is noted at most once a minute, so an older key's
// time says nothing of the assistant connecting now. A member sees none of the network's keys, so it says
// who does.
function Check({
  network,
  keys,
  made,
  onKeys
}: {
  network: NetworkPage
  keys: CheckedKey[] | null
  made: Made | null
  onKeys: (keys: CheckedKey[]) => void
}) {
  const section = useRef<HTMLDivElement>(null)
  const [watch, setWatch] = useState<Watch>({ state: 'waiting' })
  useEffect(() => {
    if (!made || watch.state !== 'waiting' || !section.current) return
    const path = `${network.links.developers}/keys`
    // Each run of the effect is one wait: once it's over, as a new key or Check again starts another, or
    // the page goes, an answer still on its way changes nothing.
    let over = false
    let onScreen = typeof IntersectionObserver === 'undefined'
    let reading = false
    let reads = 0
    let failures = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const watched = () => onScreen && document.visibilityState === 'visible'
    const read = async () => {
      clearTimeout(timer)
      if (over || reading || !watched()) return
      reading = true
      reads++
      try {
        const listed = await readKeys(path)
        if (over) return
        failures = 0
        onKeys(listed)
        const key = listed.find((k) => k.id === made.id)
        if (!key) return setWatch({ state: 'gone' })
        if (key.lastUsed !== null) return setWatch({ state: 'seen', at: key.lastUsed })
      } catch (e) {
        if (over) return
        if (++failures >= FAILURES)
          return setWatch({ state: 'failed', error: e instanceof Error ? e.message : String(e) })
      } finally {
        reading = false
      }
      if (reads >= POLLS) return setWatch({ state: 'stopped' })
      if (watched()) timer = setTimeout(() => void read(), POLL_MS)
    }
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => {
            onScreen = entry.isIntersecting
            void read()
          })
    observer?.observe(section.current)
    const shown = () => void read()
    document.addEventListener('visibilitychange', shown)
    // Without an observer, the section counts as on screen; with one, its first report reads.
    if (!observer) void read()
    return () => {
      over = true
      clearTimeout(timer)
      observer?.disconnect()
      document.removeEventListener('visibilitychange', shown)
    }
  }, [watch])

  return (
    <Section
      id="check-h"
      title="Check the connection"
      description={`When each of ${network.name}’s API keys last reached it, to the minute.`}
      data-check
    >
      <div ref={section} className="flex flex-col gap-4">
        {keys === null ? (
          <p className="text-muted-foreground">
            Only an owner sees when each key was last used. <Code>claude mcp list</Code> says whether Claude Code
            reached Crossfeed.
          </p>
        ) : (
          <>
            {made && (
              <div role="status" className="flex flex-col items-start gap-3">
                <Watching name={made.name} watch={watch} again={() => setWatch({ state: 'waiting' })} />
              </div>
            )}
            {keys.length === 0 ? (
              <p>
                <StateLine kind="empty">No API keys in use.</StateLine>
              </p>
            ) : (
              <ul aria-label="API keys in use" className="flex flex-col">
                {keys.map((k) => (
                  <li key={k.id} className="flex flex-wrap items-baseline justify-between gap-x-4 py-1.5">
                    <span className="min-w-0 font-medium wrap-anywhere">{k.name}</span>
                    <span className="text-muted-foreground">
                      {k.lastUsed === null ? 'Never used' : `Last used ${day(k.lastUsed)}, ${clock(k.lastUsed)}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Section>
  )
}

// The new key's check in words: waiting, connected with the ink check, or, once it has stopped, failed or
// lost the key, what happened, what to check, and Check again.
function Watching({ name, watch, again }: { name: string; watch: Watch; again: () => void }) {
  const quoted = `“${name}”`
  if (watch.state === 'waiting')
    return (
      <p>
        <StateLine kind="loading" word="Waiting">
          for {quoted} to make its first request…
        </StateLine>
      </p>
    )
  if (watch.state === 'seen')
    return (
      <p>
        <CheckIcon aria-hidden="true" className="mr-1.5 inline-block size-[1em] align-[-0.15em]" />
        <b className="font-semibold">Connected</b> {quoted} made its first request at {clock(watch.at)}.
      </p>
    )
  if (watch.state === 'gone')
    return (
      <p>
        <StateLine kind="error">
          {quoted} isn’t in use any more: it was revoked or deleted, so its requests are refused. Create another under
          API key.
        </StateLine>
      </p>
    )
  return (
    <>
      <p>
        {watch.state === 'failed' ? (
          <StateLine kind="error">Couldn’t check the key: {watch.error}</StateLine>
        ) : (
          <StateLine kind="missed" word="Not seen">
            {quoted} made no request in the 5 minutes this page checked.
          </StateLine>
        )}
      </p>
      {watch.state === 'stopped' && (
        <ul className="flex list-outside list-disc flex-col gap-1.5 pl-5 marker:text-muted-foreground">
          <li>
            The key: <Code>CROSSFEED_API_KEY</Code> holds all of it, from <Code>cf_live_</Code> on, and it’s still in
            use.
          </li>
          <li>
            The variable: it was set in the shell you ran <Code>claude mcp add</Code> in. If it wasn’t, run{' '}
            <Code>claude mcp remove crossfeed</Code>, set it, and add the server again.
          </li>
          <li>
            Claude Code: it connects as a session starts, so start a new one, or run <Code>claude mcp list</Code>.
          </li>
        </ul>
      )}
      <Button variant="secondary" onClick={again}>
        Check again
      </Button>
    </>
  )
}

// What an assistant can do with a key: the MCP server's tools as it lists them, by what each does, with
// the approval only a member gives, in the app (ADR 0002), a reply's too while the inbox is on.
function Tools({ network, tools }: { network: NetworkPage; tools: Loaded['tools'] }) {
  const kinds = (['Reads', 'Adds', 'Changes'] as const).filter((kind) => tools.some((t) => t.kind === kind))
  return (
    <Section
      id="tools-h"
      title="What an assistant can do"
      description={`With a key, an assistant reads, adds to and changes what ${network.name} has through these tools, but only a signed-in member, in the app, approves an insertion order${network.links.inbox ? ' or a reply' : ''}.`}
      data-tools
    >
      <KeyValues className="gap-y-3">
        {kinds.map((kind) => (
          <KeyValue key={kind} label={kind}>
            <span className="flex flex-wrap gap-x-2 gap-y-1.5" translate="no">
              {tools
                .filter((t) => t.kind === kind)
                .map((t) => (
                  <Code key={t.name}>{t.name}</Code>
                ))}
            </span>
          </KeyValue>
        ))}
      </KeyValues>
      <p className="text-muted-foreground">
        Reads change nothing; Adds create something new, such as a launch or an answer; Changes replace or edit what the
        network has.
      </p>
    </Section>
  )
}
