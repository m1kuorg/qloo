import { Fragment, memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupSegment } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { linkVariants, segmentedItemVariants, segmentedTrackVariants } from '@/components/ui/variants'
import { useConfirm } from './Confirm'
import { Alert, clock, Code, CopyButton, KeyValue, KeyValues, ScrollTable } from './controls'
import type { NetworkPage } from './NetworkPage'
import { Section } from './PageHeader'
import {
  built,
  consequence,
  curl,
  fresh,
  isJson,
  KEPT,
  NETWORK_PATH,
  operationsOf,
  problemsOf,
  recalled,
  remembered,
  replaces,
  retryAfter,
  sendsAtOnce,
  sent as kept,
  type Draft,
  type OpenApi,
  type Operation,
  type Problems,
  type Sent
} from './requests'
import { StateLine } from './states'

// The Developers page's playground: every REST API operation the OpenAPI document lists, a request built
// from the one picked, sent as the member's own session or with an API key they paste, and the answer in
// full. It calls /api/v1 alone, and no route there approves anything (ADR 0002), so nothing sent here can.
// What it reads and builds is in requests.ts; this draws it.

// Text with Markdown's code spans, as the document writes them, set as code.
const prose = (text: string) => text.split('`').map((part, i) => (i % 2 ? <Code key={i}>{part}</Code> : part))

// A path that may break after any of its slashes on a narrow column.
const UrlPath = ({ path }: { path: string }) =>
  path.split('/').map((part, i) => (
    <Fragment key={i}>
      {i > 0 && (
        <>
          <wbr />/
        </>
      )}
      {part}
    </Fragment>
  ))

// An operation's method, as the API reference sets it: a mono chip as wide as the widest, its line
// trimmed to its capitals so they sit on its middle.
const Method = ({ method }: { method: string }) => (
  <Badge render={<code translate="no" />} className="min-w-14 justify-center py-0 align-top font-mono">
    <span className="[text-box:trim-both_cap_alphabetic]">{method}</span>
  </Badge>
)

// What an operation costs, as the API reference marks it: "Deletes" in the destructive chip, so it
// doesn't look like a read, and "Session only" outlined beside it where only a member's session sends it.
const Cost = ({ op }: { op: Operation }) => (
  <>
    <Badge variant={op.cost === 'Deletes' ? 'destructive' : 'default'}>{op.cost ?? 'Cost not given'}</Badge>
    {op.sessionOnly && <Badge variant="outline">Session only</Badge>}
  </>
)

// An answer as the playground shows it, with the request it answers as it was sent (`Sending`): the
// operation, the path with its query, whether the member's session sent it, and when. The request is on
// its way (`sending`); it didn't reach Crossfeed (`unsent`), as the browser was offline, it waited past
// SEND_MS, or the browser refused to send it; or Crossfeed answered it (`answered`), in `ms`.
type Sending = { op: Operation; path: string; session: boolean; at: number }
type Answer =
  | ({ state: 'sending' } & Sending)
  | ({ state: 'unsent'; error: string; offline: boolean; timeout: boolean } & Sending)
  | ({
      state: 'answered'
      status: number
      ms: number
      headers: [string, string][]
      text: string
      json: unknown
    } & Sending)

// How long a request may take before the playground stops waiting: every route answers at once, as
// long work answers 202.
const SEND_MS = 30_000

// Brings `el` into view when its top is out of the window, or under the sticky top bar: the request
// once an operation is picked, as on a phone, where it's under the list, and the answer once it's sent.
function reveal(el: HTMLElement | null) {
  if (!el) return
  const { top } = el.getBoundingClientRect()
  if (top < 48 || top > window.innerHeight - 64) el.scrollIntoView({ block: 'start' })
}

// The playground panel. It loads the OpenAPI document the first time its tab opens (`opened`), not while
// it's hidden, unless the page was given it (`loaded`), as the tests give it; until then it shows
// nothing, as no one sees it. `api` is the REST API's address on the app's own origin, for the curl
// command; the page itself sends to its own origin.
export function Playground({
  network,
  api,
  opened,
  loaded
}: {
  network: NetworkPage
  api: string
  opened: boolean
  loaded?: OpenApi
}) {
  const [doc, setDoc] = useState<
    { state: 'idle' } | { state: 'loading' } | { state: 'failed'; error: string } | { state: 'ready'; doc: OpenApi }
  >(loaded ? { state: 'ready', doc: loaded } : { state: 'idle' })
  const load = async () => {
    setDoc({ state: 'loading' })
    try {
      const res = await fetch('/api/v1/openapi.json', { headers: { Accept: 'application/json' } })
      const answer = (await res.json().catch(() => null)) as OpenApi | null
      if (!res.ok || !answer?.paths) throw new Error(`Crossfeed answered ${res.status}.`)
      setDoc({ state: 'ready', doc: answer })
    } catch (e) {
      setDoc({ state: 'failed', error: e instanceof Error ? e.message : String(e) })
    }
  }
  useEffect(() => {
    if (opened && doc.state === 'idle') void load()
  }, [opened])

  if (doc.state === 'idle') return null
  if (doc.state === 'ready') return <Workbench network={network} api={api} doc={doc.doc} />
  return (
    <Section id="pg-operations-h" title="Operations" description={OPERATIONS} data-operations>
      {doc.state === 'loading' ? (
        <>
          <p>
            <StateLine kind="loading">Loading the REST API’s operations…</StateLine>
          </p>
          <div className="flex max-w-72 flex-col gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p role="alert">
            <StateLine kind="error">
              The REST API’s operations didn’t load ({doc.error}). Check your connection, then try again.
            </StateLine>
          </p>
          <Button type="button" variant="secondary" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      )}
    </Section>
  )
}

const OPERATIONS = 'Every route of the REST API, by group, with what each one costs.'

// The playground once it has the document: from 1024px the operations in a column of their own, sticky
// with its own scroll, beside the request, the answer and the last requests; from 1440px the answer has a
// column of its own beside the request, so it's read as it arrives, and the last requests sit under the
// request. On a phone they stack: the operations, the request, the answer, then the last requests. At
// 1440 that's the 1336 between the gutters: 288 + 24 + 500 + 24 + 500.
function Workbench({ network, api, doc }: { network: NetworkPage; api: string; doc: OpenApi }) {
  const inbox = network.links.inbox !== null
  const operations = useMemo(() => operationsOf(doc, inbox), [doc, inbox])
  const [chosen, setChosen] = useState(operations[0]?.key)
  const op = operations.find((o) => o.key === chosen) ?? operations[0]
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const draft = drafts[op.key] ?? fresh(op, network)
  const edit = (change: Partial<Draft>) => setDrafts((all) => ({ ...all, [op.key]: { ...draft, ...change } }))
  const [as, setAs] = useState<'session' | 'key'>('session')
  const [key, setKey] = useState('')
  const sendsAs = op.sessionOnly ? 'session' : as
  const [problems, setProblems] = useState<Problems>({})
  // Whether a request is out: the state draws Send busy; the ref stops a second send in the same moment,
  // as from Enter pressed twice in a field, before the state has drawn.
  const [out, setOut] = useState(false)
  const sending = useRef(false)
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [{ sent, problem: storage }, setHistory] = useState(() => recalled(network.id))
  const request = useRef<HTMLHeadingElement>(null)
  const requestAt = useRef<HTMLDivElement>(null)
  const answerAt = useRef<HTMLDivElement>(null)
  const { confirm, dialog } = useConfirm()
  const origin = new URL(api).origin

  // An operation picked opens in the request, whose heading takes focus, as an inspector tab's does, and
  // which comes into view where it's out of it, as under the list on a phone.
  const pick = (next: Operation) => {
    setChosen(next.key)
    setProblems({})
    reveal(requestAt.current)
    request.current?.focus({ preventScroll: true })
  }

  // Sends the request as it's built now, with the key alone in key mode, without the member's session,
  // as a script sends it; or with the session, which carries the page's Origin, as a write from one of
  // Crossfeed's pages must. Whatever happens, even a header the browser won't send, the answer says it,
  // and the request joins the last requests.
  const go = async (op: Operation, draft: Draft, key: string | null) => {
    if (sending.current) return
    sending.current = true
    const { path, query, type, body } = built(op, draft)
    const asked: Sending = { op, path: path + query, session: key === null, at: Date.now() }
    let status: number | null = null
    setOut(true)
    setAnswer({ state: 'sending', ...asked })
    requestAnimationFrame(() => reveal(answerAt.current))
    try {
      const headers = new Headers()
      if (body !== null && type) headers.set('Content-Type', type)
      if (key !== null) headers.set('Authorization', `Bearer ${key.trim()}`)
      const started = performance.now()
      const res = await fetch(path + query, {
        method: op.method,
        headers,
        body: body ?? undefined,
        credentials: key !== null ? 'omit' : 'same-origin',
        signal: AbortSignal.timeout(SEND_MS)
      })
      const text = await res.text()
      const ms = Math.round(performance.now() - started)
      status = res.status
      let json: unknown
      if (/json/.test(res.headers.get('Content-Type') ?? ''))
        try {
          json = JSON.parse(text)
        } catch {
          // Not JSON after all, so it shows as the text it is.
          json = undefined
        }
      setAnswer({ state: 'answered', ...asked, status, ms, headers: [...res.headers], text, json })
    } catch (e) {
      setAnswer({
        state: 'unsent',
        ...asked,
        error: e instanceof Error ? e.message : String(e),
        offline: !navigator.onLine,
        timeout: e instanceof DOMException && e.name === 'TimeoutError'
      })
    } finally {
      const entry = kept(op, draft, key !== null, asked.at, status)
      setHistory(({ sent: last }) => remembered(network.id, last, entry))
      sending.current = false
      setOut(false)
    }
  }

  // Checks the request, naming each problem under its field and focusing the first; then a GET that
  // reads goes at once, and anything else asks first, naming what it does, where and as whom. While a
  // request is out, it does nothing.
  const submit = () => {
    if (sending.current) return
    const keyed = sendsAs === 'key' ? key : null
    const found = problemsOf(op, draft, keyed)
    setProblems(found)
    const first = Object.keys(found)[0]
    if (first) return document.getElementById(`pg-${first}`)?.focus()
    if (sendsAtOnce(op)) return void go(op, draft, keyed)
    const replace = replaces(op, draft)
    const { path, query } = built(op, draft)
    confirm({
      title: `${op.summary}?`,
      consequence: (
        <>
          {consequence(op, network, replace)} It goes to{' '}
          <code className="font-mono text-[13px] wrap-anywhere">
            {op.method} {path + query}
          </code>{' '}
          {keyed === null ? 'as your session.' : 'with the API key.'}
        </>
      ),
      verb: 'Send',
      busy: 'Sending…',
      keep: 'Don’t send',
      primary: op.cost !== 'Deletes' && !replace,
      after: true,
      action: () => go(op, draft, keyed)
    })
  }

  // The request as a curl command, copied once the request is complete; with a problem, the form says
  // where instead.
  const { path, query, type, body } = built(op, draft)
  const command = curl({ method: op.method, url: `${origin}${path}${query}`, type, body })
  const complete = () => {
    const found = problemsOf(op, draft, null)
    setProblems(found)
    const first = Object.keys(found)[0]
    if (first) document.getElementById(`pg-${first}`)?.focus()
    return !first
  }

  // A last request back in the form, as it was sent, but for a body too big to keep, which goes back to
  // the operation's own; it isn't sent until the member sends it.
  const restore = (s: Sent, to: Operation) => {
    const base = fresh(to, network)
    const bodies = s.kept && s.type && s.body !== null ? { ...base.bodies, [s.type]: s.body } : base.bodies
    setChosen(to.key)
    setDrafts((all) => ({ ...all, [to.key]: { params: { ...base.params, ...s.params }, type: s.type, bodies } }))
    setProblems({})
    if (!to.sessionOnly) setAs(s.key ? 'key' : 'session')
    reveal(requestAt.current)
    request.current?.focus({ preventScroll: true })
  }

  const groups = [...new Set(operations.map((o) => o.tag))]
  const pathParams = op.params.filter((p) => p.in === 'path')
  const queryParams = op.params.filter((p) => p.in === 'query')
  const field = (name: string) => `pg-${name}`
  const describedBy = (name: string, note?: string) =>
    [problems[name] && `${field(name)}-error`, note].filter(Boolean).join(' ') || undefined
  // A field's problem, under it, which the field points at.
  const fieldError = (name: string) => (
    <span id={`${field(name)}-error`}>
      <Alert error={problems[name] ?? null} />
    </span>
  )

  return (
    <div className="grid items-start gap-x-6 gap-y-12 lg:grid-cols-[18rem_minmax(0,1fr)] lg:grid-rows-[auto_auto_1fr] min-[90rem]:grid-cols-[18rem_minmax(0,1fr)_minmax(0,1fr)] min-[90rem]:grid-rows-[auto_1fr]">
      {/* The list keeps clear of the sticky top bar, with room inside its own scroll for the focus ring. */}
      <div className="lg:sticky lg:top-12 lg:row-span-3 lg:-mx-1 lg:-mt-1 lg:max-h-[calc(100svh-3rem)] lg:overflow-y-auto lg:overscroll-contain lg:px-1 lg:pt-1 lg:pb-6 min-[90rem]:row-span-2">
        <Section id="pg-operations-h" title="Operations" description={OPERATIONS} data-operations>
          {groups.map((tag) => (
            <Section
              key={tag}
              id={`pg-group-${tag.toLowerCase().replace(/\W+/g, '-')}`}
              title={tag}
              level={3}
              data-group
            >
              <ul className="-mx-2 flex flex-col gap-0.5">
                {operations
                  .filter((o) => o.tag === tag)
                  .map((o) => (
                    <li key={o.key}>
                      <button
                        type="button"
                        aria-current={o.key === op.key ? 'true' : undefined}
                        data-operation={o.key}
                        onClick={() => pick(o)}
                        className="flex w-full cursor-pointer flex-col items-start gap-1 rounded-lg px-2 py-1.5 text-left hover:bg-muted aria-[current=true]:bg-muted"
                      >
                        <span className="font-medium">{o.summary}</span>
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Method method={o.method} />
                          <code className="min-w-0 font-mono text-xs text-muted-foreground" translate="no">
                            <UrlPath path={o.path.replace(NETWORK_PATH, '') || '/'} />
                          </code>
                          <Cost op={o} />
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            </Section>
          ))}
        </Section>
      </div>

      <div ref={requestAt} className="min-w-0 scroll-mt-16 lg:col-start-2">
        <Section
          id="pg-request-h"
          heading={request}
          title={op.summary}
          badge={<Cost op={op} />}
          description={
            <span className="flex flex-wrap items-baseline gap-2 text-foreground">
              <Method method={op.method} />
              <code className="min-w-0 font-mono text-[13px]" translate="no">
                <UrlPath path={op.path} />
              </code>
            </span>
          }
          data-request
        >
          {/* The document's own words on it, which can run to a paragraph, on the sentence's measure. */}
          {op.description && <p className="max-w-[72ch] text-muted-foreground">{prose(op.description)}</p>}
          <form
            noValidate
            className="flex flex-col gap-6"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <FieldGroup className="gap-6">
              {pathParams.length > 0 && (
                <FieldSet>
                  <FieldLegend>Path</FieldLegend>
                  <FieldGroup className="gap-4">
                    {pathParams.map((p) => (
                      <Field key={p.name} data-invalid={problems[`param-${p.name}`] ? true : undefined}>
                        <FieldLabel htmlFor={field(`param-${p.name}`)}>
                          <code className="font-mono text-[13px]">{p.name}</code>
                        </FieldLabel>
                        <Input
                          id={field(`param-${p.name}`)}
                          name={p.name}
                          className="font-mono"
                          spellCheck={false}
                          value={draft.params[p.name] ?? ''}
                          onChange={(e) => edit({ params: { ...draft.params, [p.name]: e.target.value } })}
                          aria-invalid={problems[`param-${p.name}`] ? true : undefined}
                          aria-describedby={describedBy(
                            `param-${p.name}`,
                            p.description ? `${field(`param-${p.name}`)}-note` : undefined
                          )}
                        />
                        {p.description && (
                          <FieldDescription id={`${field(`param-${p.name}`)}-note`}>
                            {prose(p.description)}
                          </FieldDescription>
                        )}
                        {fieldError(`param-${p.name}`)}
                      </Field>
                    ))}
                  </FieldGroup>
                </FieldSet>
              )}
              {queryParams.length > 0 && (
                <FieldSet>
                  <FieldLegend>Query</FieldLegend>
                  <FieldGroup className="gap-4">
                    {queryParams.map((p) =>
                      p.choices ? (
                        <FieldSet key={p.name}>
                          <FieldLegend id={`${field(`param-${p.name}`)}-label`} className="mb-0">
                            <code className="font-mono text-[13px]">{p.name}</code>
                          </FieldLegend>
                          <RadioGroup
                            aria-labelledby={`${field(`param-${p.name}`)}-label`}
                            aria-describedby={p.description ? `${field(`param-${p.name}`)}-note` : undefined}
                            value={draft.params[p.name] ?? ''}
                            onValueChange={(v) => edit({ params: { ...draft.params, [p.name]: v as string } })}
                            className={segmentedTrackVariants({ className: 'flex' })}
                          >
                            <RadioGroupSegment value="" className={segmentedItemVariants()}>
                              Not sent
                            </RadioGroupSegment>
                            {p.choices.map((c) => (
                              <RadioGroupSegment
                                key={c}
                                value={c}
                                className={segmentedItemVariants({ className: 'font-mono' })}
                              >
                                {c}
                              </RadioGroupSegment>
                            ))}
                          </RadioGroup>
                          {p.description && (
                            <FieldDescription id={`${field(`param-${p.name}`)}-note`}>
                              {prose(p.description)}
                            </FieldDescription>
                          )}
                        </FieldSet>
                      ) : (
                        <Field key={p.name}>
                          <FieldLabel htmlFor={field(`param-${p.name}`)}>
                            <code className="font-mono text-[13px]">{p.name}</code>
                          </FieldLabel>
                          <Input
                            id={field(`param-${p.name}`)}
                            name={p.name}
                            className="font-mono"
                            spellCheck={false}
                            value={draft.params[p.name] ?? ''}
                            onChange={(e) => edit({ params: { ...draft.params, [p.name]: e.target.value } })}
                            aria-describedby={p.description ? `${field(`param-${p.name}`)}-note` : undefined}
                          />
                          {p.description && (
                            <FieldDescription id={`${field(`param-${p.name}`)}-note`}>
                              {prose(p.description)}
                            </FieldDescription>
                          )}
                        </Field>
                      )
                    )}
                  </FieldGroup>
                </FieldSet>
              )}
              {op.body && draft.type && (
                <Field data-invalid={problems.body ? true : undefined}>
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <FieldLabel htmlFor={field('body')}>{op.body.required ? 'Body' : 'Body, optional'}</FieldLabel>
                    {op.body.types.length > 1 && (
                      <Select
                        items={op.body.types.map((t) => ({ value: t.type, label: t.type }))}
                        value={draft.type}
                        onValueChange={(t) => edit({ type: t as string })}
                      >
                        <SelectTrigger aria-label="Content type" className="font-mono text-[13px] sm:w-56">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {op.body.types.map((t) => (
                              <SelectItem key={t.type} value={t.type} className="font-mono text-[13px]">
                                {t.type}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <Textarea
                    id={field('body')}
                    name="body"
                    className="max-h-[28rem] min-h-32 font-mono text-[13px] md:text-[13px]"
                    spellCheck={false}
                    value={draft.bodies[draft.type] ?? ''}
                    placeholder={op.body.types.find((t) => t.type === draft.type)?.hint || undefined}
                    onChange={(e) => edit({ bodies: { ...draft.bodies, [draft.type!]: e.target.value } })}
                    aria-invalid={problems.body ? true : undefined}
                    aria-describedby={describedBy('body', `${field('body')}-note`)}
                  />
                  <FieldDescription id={`${field('body')}-note`}>
                    Sent as <Code>{draft.type}</Code>
                    {isJson(draft.type) ? ', once it parses as JSON.' : ', as text.'}
                    {!op.body.required && ' Left empty, the request has no body.'}
                  </FieldDescription>
                  {fieldError('body')}
                </Field>
              )}
              <FieldSet aria-describedby="pg-as-note">
                <FieldLegend id="pg-as-label">Send as</FieldLegend>
                <RadioGroup
                  aria-labelledby="pg-as-label"
                  value={sendsAs}
                  onValueChange={(v) => setAs(v as 'session' | 'key')}
                  className={segmentedTrackVariants({ className: 'flex' })}
                >
                  <RadioGroupSegment value="session" className={segmentedItemVariants()}>
                    Your session
                  </RadioGroupSegment>
                  <RadioGroupSegment value="key" disabled={op.sessionOnly} className={segmentedItemVariants()}>
                    An API key
                  </RadioGroupSegment>
                </RadioGroup>
                <FieldDescription id="pg-as-note">
                  {op.sessionOnly
                    ? 'Only a member’s session, from one of Crossfeed’s pages, can send this: an API key answers 403.'
                    : sendsAs === 'session'
                      ? 'As you, signed in, from this page.'
                      : 'With the key alone and not your session, as a script sends it.'}
                </FieldDescription>
              </FieldSet>
              {sendsAs === 'key' && (
                <Field data-invalid={problems.key ? true : undefined}>
                  <FieldLabel htmlFor={field('key')}>API key</FieldLabel>
                  <Input
                    id={field('key')}
                    name="api-key"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    aria-invalid={problems.key ? true : undefined}
                    aria-describedby={describedBy('key', `${field('key')}-note`)}
                  />
                  <FieldDescription id={`${field('key')}-note`}>
                    Kept in this page’s memory only: never stored, and never in a copied command or a link.
                  </FieldDescription>
                  {fieldError('key')}
                </Field>
              )}
            </FieldGroup>
            <div className="flex flex-col items-start gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {/* Still focusable while a request is out, so focus stays on it after a confirm. */}
                <Button type="submit" disabled={out} focusableWhenDisabled>
                  {out && <Spinner data-icon="inline-start" />}
                  {out ? 'Sending…' : 'Send'}
                </Button>
                {/* Keyed by the command, so another request starts uncopied. */}
                {!op.sessionOnly && (
                  <CopyButton key={command} value={command} label="Copy as curl" size="default" ready={complete} />
                )}
              </div>
              {!op.sessionOnly && (
                <p className="type-caption text-muted-foreground">
                  The command reads the key from <Code>$CROSSFEED_API_KEY</Code> in your shell, whichever way this page
                  sends it.
                </p>
              )}
            </div>
          </form>
        </Section>
      </div>

      <div
        ref={answerAt}
        className="min-w-0 scroll-mt-16 lg:col-start-2 min-[90rem]:col-start-3 min-[90rem]:row-span-2 min-[90rem]:row-start-1"
      >
        <AnswerSection answer={answer} />
      </div>

      <div className="min-w-0 lg:col-start-2 min-[90rem]:row-start-2">
        <Section
          id="pg-history-h"
          title="Your last requests"
          description={`The last ${KEPT} requests sent from this tab, with no key, each body kept only up to 4 KB.`}
        >
          {storage && <p className="text-muted-foreground">{storage}</p>}
          {sent.length === 0 ? (
            <p>
              <StateLine kind="empty">No requests sent from this tab yet.</StateLine>
            </p>
          ) : (
            <ul className="-mx-2 flex flex-col gap-0.5">
              {sent.map((s) => {
                const to = operations.find((o) => o.key === s.op)
                const [method, template] = s.op.split(' ')
                const filled =
                  template.replace(NETWORK_PATH, '').replace(/\{(\w+)\}/g, (_, n: string) => s.params[n] || `{${n}}`) ||
                  '/'
                const asked = Object.entries(s.params).filter(
                  ([n, v]) => v && to?.params.some((p) => p.in === 'query' && p.name === n)
                )
                const row = (
                  <>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Method method={method} />
                      <code className="min-w-0 font-mono text-xs" translate="no">
                        <UrlPath path={filled} />
                        {asked.length > 0 && `?${new URLSearchParams(asked).toString()}`}
                      </code>
                    </span>
                    <span className="type-caption text-muted-foreground">
                      {s.status === null ? 'Didn’t reach Crossfeed' : `Answered ${s.status}`} · {clock(s.at)} ·{' '}
                      {s.key ? 'with an API key' : 'as your session'}
                      {!s.kept && ' · Body not kept: over 4 KB'}
                    </span>
                  </>
                )
                return (
                  <li key={s.at}>
                    {to ? (
                      <button
                        type="button"
                        onClick={() => restore(s, to)}
                        className="flex w-full cursor-pointer flex-col items-start gap-1 rounded-lg px-2 py-1.5 text-left hover:bg-muted"
                      >
                        {row}
                      </button>
                    ) : (
                      // An operation this page no longer lists, as the inbox's once it's off.
                      <div className="flex flex-col items-start gap-1 px-2 py-1.5">{row}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Section>
      </div>
      {dialog}
    </div>
  )
}

// The most of a JSON answer's text the playground colours.
const COLOURED = 200_000

// JSON's tokens, for its colours: a string, which a colon after it makes a key; a number; true, false
// or null; and the punctuation between them.
const TOKENS = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],])/g

// A JSON answer as two spaces indent it (`text`), in the token colours: keys, punctuation and null
// muted, every other value in ink. Classes, never a style, as the policy allows no inline style; and
// React's elements, never HTML, as an answer holds what others wrote, such as a pitch.
function Highlighted({ text }: { text: string }) {
  const parts: ReactNode[] = []
  let at = 0
  for (const m of text.matchAll(TOKENS)) {
    if (m.index > at) parts.push(text.slice(at, m.index))
    const [all, string, colon, number, literal, mark] = m
    const muted = Boolean(colon) || literal === 'null' || Boolean(mark)
    parts.push(
      <span key={m.index} className={muted ? 'text-muted-foreground' : 'text-foreground'}>
        {string ?? number ?? literal ?? mark}
      </span>
    )
    if (colon)
      parts.push(
        <span key={`${m.index}:`} className="text-muted-foreground">
          {colon}
        </span>
      )
    at = m.index + all.length
  }
  parts.push(text.slice(at))
  return <>{parts}</>
}

// What Crossfeed answered: before anything is sent, a line saying so; while it's on its way, that it
// is; a request that never reached it, offline, past SEND_MS or refused by the browser; a session that
// had ended, with a way to sign in again; otherwise its status, time and request, a 429's wait, and a
// refusal's code and message, then its headers in a table and its body: JSON in its colours, text as
// text, or "No content". A status region says the answer as it arrives. It draws again only when the
// answer changes, not as the form is typed in, as a long answer's colours take a while.
const AnswerSection = memo(function AnswerSection({ answer }: { answer: Answer | null }) {
  const said =
    answer?.state === 'answered'
      ? `Answered ${answer.status} in ${answer.ms} ms.`
      : answer?.state === 'unsent'
        ? 'The request didn’t reach Crossfeed.'
        : answer?.state === 'sending'
          ? 'Sending.'
          : ''
  return (
    <Section id="pg-answer-h" title="Answer" description={answerLine(answer)} data-answer>
      <span role="status" className="vh">
        {said}
      </span>
      {answer === null ? (
        <p>
          <StateLine kind="empty">Nothing sent yet.</StateLine>
        </p>
      ) : answer.state === 'sending' ? (
        <p>
          <StateLine kind="loading" word="Sending">
            {answer.op.method} <code className="font-mono text-[13px]">{answer.path}</code>…
          </StateLine>
        </p>
      ) : answer.state === 'unsent' ? (
        <p>
          <StateLine kind="error">
            {answer.timeout
              ? `Crossfeed didn’t answer within ${SEND_MS / 1000} seconds, so the playground stopped waiting. Send it again, or read the resource to see whether it arrived.`
              : `${answer.offline ? 'This browser is offline, so the' : 'The'} request didn’t reach Crossfeed (${answer.error}). Check your connection and the request, then send it again.`}
          </StateLine>
        </p>
      ) : (
        <Answered answer={answer} />
      )}
    </Section>
  )
})

// The answer's one sentence: which operation it's about, as another may be picked since, or nothing
// before the first.
const answerLine = (answer: Answer | null) =>
  answer === null
    ? undefined
    : answer.state === 'answered'
      ? `What Crossfeed answered to “${answer.op.summary}”.`
      : answer.state === 'sending'
        ? `“${answer.op.summary}”, on its way to Crossfeed.`
        : `“${answer.op.summary}”, which didn’t reach Crossfeed.`

function Answered({ answer }: { answer: Extract<Answer, { state: 'answered' }> }) {
  const refusal = (answer.json as { error?: { code?: unknown; message?: unknown } } | undefined)?.error
  const refused =
    answer.status >= 400 && typeof refusal?.code === 'string' && typeof refusal.message === 'string'
      ? { code: refusal.code, message: refusal.message }
      : null
  // A 429's wait, whatever its body, from Retry-After in seconds or as a date.
  const wait =
    answer.status === 429
      ? retryAfter(answer.headers.find(([name]) => name === 'retry-after')?.[1] ?? null, answer.at)
      : null
  const shown = answer.json !== undefined ? JSON.stringify(answer.json, null, 2) : answer.text
  // Past COLOURED, a JSON body shows uncoloured, so a long one, such as a launch's evidence, isn't tens
  // of thousands of elements.
  const coloured = answer.json !== undefined && shown.length <= COLOURED
  return (
    <>
      <KeyValues>
        <KeyValue label="Status">
          <span className="font-medium tabular-nums">{answer.status}</span>
          {answer.op.answers[answer.status] && (
            <span className="text-muted-foreground"> · {prose(answer.op.answers[answer.status])}</span>
          )}
        </KeyValue>
        {wait !== null && (
          <KeyValue label="Retry">
            In {wait} {wait === 1 ? 'second' : 'seconds'}, as its <Code>Retry-After</Code> says
          </KeyValue>
        )}
        <KeyValue label="Time">{answer.ms.toLocaleString('en-US')} ms</KeyValue>
        <KeyValue label="Request">
          <code className="font-mono text-[13px] wrap-anywhere">
            {answer.op.method} {answer.path}
          </code>
          <span className="block type-caption text-muted-foreground">
            {answer.session ? 'As your session' : 'With an API key'}, at {clock(answer.at)}
          </span>
        </KeyValue>
      </KeyValues>
      {answer.status === 401 && answer.session ? (
        <p>
          <StateLine kind="error">
            You’re signed out, so your session can’t send requests.{' '}
            <a className={linkVariants()} href="/sign-in?next=/app/playground">
              Sign in again
            </a>
            , then send it again.
          </StateLine>
        </p>
      ) : (
        refused && (
          // The refusal's code as its title, and its message, what went wrong and what to do, as its sentence.
          <div className="flex flex-col gap-1">
            <h3 className="font-semibold">
              <code className="font-mono">{refused.code}</code>
            </h3>
            <p className="max-w-[72ch] text-pretty break-words">{refused.message}</p>
          </div>
        )
      )}
      <Section id="pg-headers-h" level={3} title="Headers">
        <ScrollTable label="Answer headers">
          <table className="w-full type-caption">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="py-1.5 pr-4 text-left font-normal">
                  Name
                </th>
                <th scope="col" className="py-1.5 text-left font-normal">
                  Value
                </th>
              </tr>
            </thead>
            <tbody className="font-mono" translate="no">
              {answer.headers.map(([name, value], i) => (
                <tr key={i} className="border-b">
                  <td className="py-1.5 pr-4 align-top whitespace-nowrap">{name}</td>
                  <td className="py-1.5 align-top wrap-anywhere">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
      </Section>
      <Section
        id="pg-body-h"
        level={3}
        title="Body"
        actions={shown && <CopyButton key={answer.at} value={shown} what="answer’s body" />}
      >
        {shown ? (
          <pre
            tabIndex={0}
            translate="no"
            aria-label="Answer body"
            className="max-h-[70svh] overflow-auto overscroll-contain rounded-xl bg-muted px-4 py-3 font-mono text-[13px] leading-relaxed focus-visible:-outline-offset-2"
          >
            <code>{coloured ? <Highlighted text={shown} /> : shown}</code>
          </pre>
        ) : (
          <p>
            <StateLine kind="empty">No content.</StateLine>
          </p>
        )}
        {answer.json !== undefined && !coloured && (
          <p className="type-caption text-muted-foreground">Shown without its colours, as it’s over 200 KB.</p>
        )}
      </Section>
    </>
  )
}
