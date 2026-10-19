# Crossfeed SDK

`@crossfeed/sdk` is a typed TypeScript client for [Crossfeed's REST API](/apps/src/routes/api.ts): one network's roster, launches, and inbox, with one of its API keys. Its methods mirror the API's routes, typed from the API's OpenAPI document, and it needs nothing but `fetch`, so it runs in Node, Bun, Deno, and Workers. It isn't published to npm yet (#63); install it from the repo.

Contents:

1.  [Install from the repo](#install-from-the-repo)
1.  [Create a client](#create-a-client)
1.  [Plan a launch](#plan-a-launch)
1.  [Triage pitches](#triage-pitches)
1.  [Wait for long work](#wait-for-long-work)
1.  [Handle errors](#handle-errors)
1.  [Generate the types](#generate-the-types)
1.  [See also](#see-also)

## Install from the repo

Clone the repo and build the package, then add it to your project by its path:

```sh
git clone https://github.com/m1kuorg/qloo.git
cd qloo/packages/sdk
bun install
```

`bun install` installs TypeScript and builds `dist/`, the package's ESM JavaScript and its types. Then, in your project, `bun add <path to qloo>/packages/sdk` or `npm install <path to qloo>/packages/sdk`. Bun and Deno can also import `src/index.ts` as it is.

## Create a client

An owner makes an API key in the network's settings, which show the network's ID under the keys. The client takes both:

```ts
import { Crossfeed } from '@crossfeed/sdk'

const crossfeed = new Crossfeed({
  apiKey: process.env.CROSSFEED_API_KEY!, // cf_live_…
  networkId: process.env.CROSSFEED_NETWORK_ID!
})
```

`baseUrl` points it at another deployment, such as `http://localhost:5128` for the dev server; it's `https://crossfeed.m1kuorg.workers.dev` unless given. `fetch` replaces the runtime's own, such as a service binding's in a Worker, or a test's.

The client's namespaces follow the API: `network`, `roster`, `launches`, `runs`, `insertionOrders`, `evidence`, `inbox`, `pitchRuns`, and `replies`. Nothing in them approves an insertion order or a reply: a member does, in the app.

## Plan a launch

Import the roster, settle what Qloo couldn't match on its own, and price it:

```ts
import { readFile } from 'node:fs/promises'

await crossfeed.roster.import(await readFile('roster.csv', 'utf8')) // a CSV with a name column
const roster = await crossfeed.waitForRoster()
for (const show of roster.shows) console.log(show.name, show.resolution)

await crossfeed.roster.updateShow('Field Notes', { entityId: 'e-0102' }) // one of its candidates
await crossfeed.roster.searchComps('Ghost Signal', 'Ghost Signal Radio')
await crossfeed.waitForRoster()
await crossfeed.roster.updateShow('Ghost Signal', { compId: 'e-0601' }) // one of its comp search's results
await crossfeed.network.update({ cpm: 25 })
```

A roster of show names, one per line, goes as `{ type: 'text/plain' }`. Importing over a roster that has shows needs `{ replace: true }`.

Then plan the launch and run it. A run asks the person planning it its questions, such as the slot budget; relay each one and answer with their words:

```ts
const launch = await crossfeed.launches.create({ name: 'Night Shift Cinema' })
const { id: runId } = await crossfeed.runs.start(launch.id)

let run = await crossfeed.waitForRun({ launchId: launch.id, runId })
while (run.status === 'waiting') {
  const { question } = run
  console.log(question!.question, question!.options)
  const answer =
    question!.kind === 'budget' ? { slots: 20 } : question!.kind === 'exclusions' ? { exclude: [] } : { text: '…' }
  await crossfeed.runs.answer(launch.id, runId, { questionId: question!.id, ...answer })
  run = await crossfeed.waitForRun({ launchId: launch.id, runId })
}

for (const row of run.chart!.rows) console.log(row.rank, row.show, row.band, row.finalist ? 'Finalist' : '')
console.log(run.insertionOrder) // the draft, priced at the network's CPM
```

Each question's `kind` says which answer fields it takes; `Answer` in the types lists them. `insertionOrders.edit(launch.id, orderId, { lines })` changes the draft's lines. A member approves the order on the launch's page in the app; until then `insertionOrders.exportCsv` rejects with `conflict`, and after, it resolves with the CSV file the app exports:

```ts
const csv = await crossfeed.insertionOrders.exportCsv(launch.id, run.insertionOrder!.id)
```

`evidence.list(launch.id)` holds a record of every Qloo call the run cites by its call number, such as the chart's `call`.

## Triage pitches

While guest pitches are switched on, load the day's pitches as an `.mbox` export, an `.eml`, text with a line of `---` between pitches, or one by one, then rank them against a roster show:

```ts
await crossfeed.inbox.load(await readFile('pitches.mbox'), { type: 'application/mbox' })
const inbox = await crossfeed.waitForInbox()
for (const pitch of inbox.pitches) console.log(pitch.subject, pitch.work?.title, pitch.match?.resolution)

// A work two titles share waits for one of its candidates.
await crossfeed.inbox.confirmWork('pitch-03', 'f-0002')

const { id } = await crossfeed.pitchRuns.start({ show: 'Night Shift Cinema' })
const run = await crossfeed.waitForRun({ pitchRunId: id })
for (const reply of run.replies ?? []) console.log(reply.pitch, reply.verdict, reply.draft)

await crossfeed.replies.edit(id, 'pitch-01', "Thanks, we'd love to book Night Ferry.")
await crossfeed.replies.discard(id, 'pitch-02')
```

`inbox.load({ pitches: [{ from, subject, body }] })` sends them one by one. A pitch run that waits on a question is answered with `pitchRuns.answer(id, { questionId, choice })`, as a launch's run is. A member approves the replies in the app.

## Wait for long work

An import, a comp search, an inbox load, and a run answer at once while the work goes on. Each wait helper polls its resource until the work settles:

- `waitForRoster()` resolves once no show or comp search is still pending.
- `waitForInbox()` resolves once no pitch is still being read.
- `waitForRun({ launchId, runId })` and `waitForRun({ pitchRunId })` resolve once the run is `completed`, or `waiting` on its `question`. A run that `failed` or `stopped` rejects with a `run_failed` or `run_stopped` `CrossfeedError` whose message says why.

Each takes `{ interval, timeout, signal }`: it reads every `interval` milliseconds (1,000), rejects with a `timeout` `CrossfeedError` after `timeout` milliseconds (5 minutes), and stops at once, rejecting with the signal's reason, once `signal` aborts.

## Handle errors

Every refusal rejects with a `CrossfeedError`: the API's stable `code`, a `message` that says what to do, for a person, and the HTTP `status`.

```ts
import { CrossfeedError } from '@crossfeed/sdk'

const csv = await readFile('roster.csv', 'utf8')
try {
  await crossfeed.roster.import(csv)
} catch (error) {
  if (error instanceof CrossfeedError && error.code === 'conflict')
    await crossfeed.roster.import(csv, { replace: true })
  else throw error
}
```

The API's codes are `invalid` (400), `unauthorized` (401), `forbidden` (403), `not_found` (404), `conflict` (409), `too_large` (413), `unreadable` (422), `limit` (429, a daily cap or the network's launch cap), `rate_limited` (429, 120 requests a minute per key), and `internal` (500). The SDK adds `run_failed`, `run_stopped`, and `timeout` from its wait helpers, with a null `status`, and `unexpected_response` for an answer that isn't one of Crossfeed's errors, as from a wrong `baseUrl`.

## Generate the types

`src/openapi.ts` holds the types, generated with `openapi-typescript` from `openapi.json`, the API's OpenAPI document as the Worker serves it at `/api/v1/openapi.json`. After changing the API, with both the repo root and `apps/` installed, run:

```sh
bun run generate
```

It runs `apps/test/sdk.test.ts` with `--update`, which writes the Worker's document to `openapi.json`, then generates the types from it with `openapi-typescript` from the repo root, which needs TypeScript 5's compiler API. The same test fails whenever either file is stale. `bun run typecheck` then checks the client against the new types.

## See also

- [The app's README](/apps/README.md), for the API's tests and live check
- [openapi-typescript](https://openapi-ts.dev/)
