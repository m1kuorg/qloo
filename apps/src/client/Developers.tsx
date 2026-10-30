import { CheckIcon, CopyIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { buttonVariants, linkVariants } from '@/components/ui/variants'
import { assistants, CHATGPT, type AssistantSetup, type Snippet, type Step } from '../assistants'
import type { ApiKey, CheckedKey } from '../directory'
import type { ToolKind } from '../routes/mcp'
import { GUEST_NETWORK_CLEARS, listOf, MAX_NAME } from '../text'
import { Alert, clock, Code, day, KeyValue, KeyValues, send, ShownOnce, useAction, useCopy } from './controls'
import { NetworkGate, useNetwork, type NetworkPage } from './NetworkPage'
import { PageHeader, Section } from './PageHeader'
import { settingsColumn } from './settings/Module'
import { connectionOf, StateLine, type Connection } from './states'

// What the server gives the Developers page besides its network: the MCP server's and the REST API's
// addresses, on the app's own origin; for an owner, the network's keys in use, with no secret or prefix
// (null for a member, who doesn't see them); for a member, the names of its owners, whom they ask for a
// key (none for an owner); and the tools the MCP server lists, by what each does, null when listing them
// failed.
type Loaded = {
  mcp: string
  api: string
  keys: CheckedKey[] | null
  owners: string[]
  tools: { name: string; kind: ToolKind }[] | null
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

// The key made on this page, with its secret, which only ShownOnce is given; and the key as the check
// waits on it, without.
type Made = { id: string; name: string; secret: string }
type NewKey = Pick<Made, 'id' | 'name'>

// The Developers page, which answers "How do I connect my assistant to this network?", in one column as
// settings' is: the header, then its sections in the order a member connects one: the addresses a client
// asks for, the API key it acts with, an owner creating one here and seeing it once, the steps for each
// assistant, the check that sees the new key's first request, and what an assistant can do with it.
// Only ShownOnce ever shows a key: no command, configuration or link holds one. Tests render it from
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
        <KeySection network={network} owners={owners} made={made} onMade={setMade} />
        <Assistant mcp={mcp} />
        {/* A new key starts a new wait, whose reads list it with the other keys in use. */}
        <Check
          key={made?.id}
          network={network}
          keys={listed}
          awaited={made && { id: made.id, name: made.name }}
          onKeys={setListed}
        />
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

// A block of code a step shows, set as the docs set theirs: on the tone step, its caption over the code,
// which scrolls sideways inside it on a narrow screen rather than wrapping, the caption the file it goes
// in when it names one. One that runs as it's pasted has Copy beside its caption, named for what it
// copies; what a command prints, or a format with a placeholder for the key, has none.
function SnippetBlock({ snippet: { label, file, code, copy } }: { snippet: Snippet }) {
  return (
    <figure className="flex min-w-0 flex-col rounded-xl bg-muted" data-snippet>
      <figcaption className="flex min-h-10 items-center justify-between gap-3 pt-1 pr-1 pl-4 type-caption text-muted-foreground max-md:min-h-12">
        {file ? (
          <code className="font-mono text-xs" translate="no">
            {file}
          </code>
        ) : (
          label
        )}
        {copy && (
          <span className="flex items-center">
            <CopyButton value={code} what={copy} />
          </span>
        )}
      </figcaption>
      <pre
        tabIndex={0}
        translate="no"
        className="overflow-x-auto overscroll-x-contain px-4 pb-3.5 font-mono text-[13px] leading-relaxed focus-visible:-outline-offset-2"
      >
        <code>{code}</code>
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
  onMade: (key: Made | null) => void
}) {
  const [name, setName] = useState('Claude Code')
  const { busy, error, run } = useAction()
  const create = async () => {
    const created = await run(async () => {
      const answer = await send<{ id: string; secret: string; keys: ApiKey[] }>(`${network.links.settings}/api-keys`, {
        name
      })
      // Named as the Worker saved it. The check's first read lists it with the other keys in use.
      const saved = answer.keys.find((k) => k.id === answer.id)?.name ?? name.trim()
      onMade({ id: answer.id, name: saved, secret: answer.secret })
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
              Copy it now: Crossfeed shows each key only once. Then keep it where your assistant reads it, which for
              most is an environment variable, <Code>CROSSFEED_API_KEY</Code>, set as Your assistant’s first step shows.
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

// The steps for each assistant, from the module the MCP docs render too (assistants.ts), behind a picker
// of them in tabs on the segmented track. Which one shows is this section's own state, never the URL's
// hash, which the page's own tabs keep. Every panel stays mounted, so the page rendered on the server
// holds every assistant's steps. Then the sentence on ChatGPT, which can't connect yet.
function Assistant({ mcp }: { mcp: string }) {
  const all = assistants(mcp)
  return (
    <Section
      id="assistant-h"
      title="Your assistant"
      description="How each assistant connects to the MCP server, with the key in no command, configuration or link you copy."
    >
      <Tabs defaultValue={all[0].id} className="gap-6">
        {/* Wider than the column, as on a phone, the list scrolls sideways, with room around the track for the focus ring. */}
        <div className="-m-1 overflow-x-auto overscroll-x-contain p-1">
          <TabsList aria-label="Assistants" className="max-w-none *:shrink-0">
            {all.map((a) => (
              <TabsTrigger key={a.id} value={a.id}>
                {a.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {all.map((a) => (
          <TabsContent key={a.id} value={a.id} keepMounted className="flex flex-col gap-6" data-assistant={a.id}>
            <Setup assistant={a} />
          </TabsContent>
        ))}
      </Tabs>
      <p className="text-muted-foreground">{CHATGPT}</p>
    </Section>
  )
}

// A sentence of the module's, each run between backticks set as code.
const Marked = ({ text }: { text: string }) => (
  <>{text.split('`').map((part, i) => (i % 2 ? <Code key={i}>{part}</Code> : part))}</>
)

// One assistant's setup: its steps, each a numbered line over its links and the blocks it runs; then
// the way for when they can't work, and a line leading on, as the plugin for Claude Code.
function Setup({ assistant: { steps, otherwise, more } }: { assistant: AssistantSetup }) {
  return (
    <>
      <ol className="flex list-outside list-decimal flex-col gap-6 pl-5 marker:text-muted-foreground">
        {steps.map((step, i) => (
          <li key={i}>
            <StepBody step={step} />
          </li>
        ))}
      </ol>
      {otherwise && <StepBody step={otherwise} />}
      {more && (
        <p className="text-muted-foreground">
          {more.text}{' '}
          <a className={linkVariants()} href={more.link.href}>
            {more.link.label}
          </a>
          .
        </p>
      )}
    </>
  )
}

// A step's sentence, then each link as a secondary button over what it does, which describes it, then its
// blocks. A link to a web page opens in a tab of its own, so this page keeps the key it showed.
function StepBody({ step }: { step: Step }) {
  return (
    <div className="flex flex-col gap-3">
      <p>
        <Marked text={step.text} />
      </p>
      {step.links?.map((link) => (
        <div key={link.id} className="flex flex-col items-start gap-1.5">
          <a
            className={buttonVariants({ variant: 'secondary' })}
            href={link.href}
            aria-describedby={`${link.id}-note`}
            {...(link.away && { target: '_blank', rel: 'noreferrer' })}
          >
            {link.label}
          </a>
          <p id={`${link.id}-note`}>
            <Marked text={link.caveat} />
          </p>
        </div>
      ))}
      {step.snippets?.map((snippet, i) => (
        <SnippetBlock key={i} snippet={snippet} />
      ))}
    </div>
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

// How long one read of the keys may take before it counts as failed.
const READ_MS = 10_000

// The network's keys in use, as the keys route answers an owner, read until `signal` aborts or READ_MS
// passes. An answer that isn't its JSON, such as the sign-in page a signed-out session is sent to, is
// refused with why, and so is one that took too long.
async function readKeys(path: string, signal: AbortSignal) {
  const res = await fetch(path, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.any([signal, AbortSignal.timeout(READ_MS)])
  }).catch((e: unknown) => {
    throw e instanceof DOMException && e.name === 'TimeoutError'
      ? new Error(`Crossfeed didn’t answer within ${READ_MS / 1000} seconds.`)
      : e
  })
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
  awaited,
  onKeys
}: {
  network: NetworkPage
  keys: CheckedKey[] | null
  awaited: NewKey | null
  onKeys: (keys: CheckedKey[]) => void
}) {
  const section = useRef<HTMLDivElement>(null)
  const [watch, setWatch] = useState<Watch>({ state: 'waiting' })
  useEffect(() => {
    if (!awaited || watch.state !== 'waiting' || !section.current) return
    const path = `${network.links.developers}/keys`
    // Each run of the effect is one wait: once it's over, as a new key or Check again starts another, or
    // the page goes, a read still on its way is aborted, and its answer changes nothing.
    const stop = new AbortController()
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
        const listed = await readKeys(path, stop.signal)
        if (over) return
        failures = 0
        onKeys(listed)
        const key = listed.find((k) => k.id === awaited.id)
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
        : new IntersectionObserver((entries) => {
            // The latest report, as a quick scroll in and out can queue more than one.
            onScreen = entries.at(-1)!.isIntersecting
            void read()
          })
    observer?.observe(section.current)
    const shown = () => void read()
    document.addEventListener('visibilitychange', shown)
    // Without an observer, the section counts as on screen; with one, its first report reads.
    if (!observer) void read()
    return () => {
      over = true
      stop.abort()
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
            {awaited && (
              <div role="status" className="flex flex-col items-start gap-3">
                <Watching name={awaited.name} watch={watch} again={() => setWatch({ state: 'waiting' })} />
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
            The key: the assistant has all of it, from <Code>cf_live_</Code> on, and it isn’t revoked.
          </li>
          <li>
            The variable: <Code>CROSSFEED_API_KEY</Code> is set where the assistant runs, if it reads the key from
            there.
          </li>
          <li>The assistant: it started again after you added the server, as most connect only as they start.</li>
        </ul>
      )}
      <Button variant="secondary" onClick={again}>
        Check again
      </Button>
    </>
  )
}

// What an assistant can do with a key: the MCP server's tools as it lists them, by what each does, with
// the approval only a member gives, in the app (ADR 0002), a reply's too while the inbox is on. When the
// server couldn't list them as the page loaded, it says so, and the sentence still stands.
function Tools({ network, tools }: { network: NetworkPage; tools: Loaded['tools'] }) {
  return (
    <Section
      id="tools-h"
      title="What an assistant can do"
      description={`With a key, an assistant reads, adds to and changes what ${network.name} has through these tools, but only a signed-in member, in the app, approves an insertion order${network.links.inbox ? ' or a reply' : ''}.`}
      data-tools
    >
      {tools ? (
        <>
          <KeyValues className="gap-y-3">
            {(['Reads', 'Adds', 'Changes'] as const)
              .filter((kind) => tools.some((t) => t.kind === kind))
              .map((kind) => (
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
            Reads change nothing; Adds create something new, such as a launch or an answer; Changes replace or edit what
            the network has.
          </p>
        </>
      ) : (
        <p>
          <StateLine kind="error">The MCP server’s tools didn’t load. Reload the page to try again.</StateLine>
        </p>
      )}
    </Section>
  )
}
