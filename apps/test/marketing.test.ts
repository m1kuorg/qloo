// The marketing pages: the landing page at /, the privacy page, and the beta terms, all
// server-rendered with no React island.
import { env, exports } from 'cloudflare:workers'
import { afterEach, describe, expect, it } from 'vitest'
import inbox from '../src/sample-inbox.json'
import network from '../src/sample-network.json'

const origin = 'https://crossfeed.test'
const get = (path: string) => exports.default.fetch(`${origin}${path}`)
const page = async (path: string) => {
  const res = await get(path)
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toMatch(/^text\/html/)
  return res.text()
}
// The page's main landmark, where its calls to action are.
const main = (html: string) => html.match(/<main[^>]*>([\s\S]*)<\/main>/)?.[1] ?? ''
// Every link's href, in document order.
const hrefs = (html: string) => [...html.matchAll(/<a [^>]*href="([^"]*)"/g)].map((m) => m[1])
// The page's text, without its markup.
const words = (html: string) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')

const vars = {
  ACCOUNTS: env.ACCOUNTS,
  NETWORKS_PER_MEMBER: env.NETWORKS_PER_MEMBER,
  LAUNCHES_PER_NETWORK: env.LAUNCHES_PER_NETWORK,
  GUEST_PITCHES: env.GUEST_PITCHES,
  RUN_VISITOR_DAILY_CAP: env.RUN_VISITOR_DAILY_CAP
}
afterEach(() => Object.assign(env, vars))

const pages = ['/', '/privacy', '/terms']
// Every name the demo looks up in Qloo, and every work its sample inbox pitches: a marketing page
// that showed one would be showing what Qloo returned for it.
const looked = [
  ...network.shows.map((s) => s.name),
  network.launch.name,
  ...inbox.pitches.flatMap((p) => (p.expected.work ? [p.expected.work.title] : [])),
  ...inbox.show.pastGuests.map((g) => g.work.title)
]

describe('the landing page', () => {
  it('serves / with no React island, and its first call to action opens the sample network', async () => {
    const html = await page('/')
    expect(html).not.toContain('id="root"')
    expect(html).not.toContain('client/main.tsx')
    expect(hrefs(main(html))[0]).toBe('/demo')
    expect(main(html)).toMatch(/<a [^>]*href="\/demo"[^>]*>Open the sample network<\/a>/)
  })

  it('labels its chart an illustration of made-up shows, and no marketing page shows Qloo data', async () => {
    const html = await page('/')
    expect(words(html)).toMatch(/Illustration: a made-up network, launch, shows, ranks, and tags\. Not Qloo data\./)
    expect(words(html)).toContain('Dead Air Archive')
    for (const path of pages) {
      const text = words(await page(path))
      for (const name of looked) expect(text, `${path} names ${name}`).not.toContain(name)
      // Qloo's affinities are decimals; the chart shows ranks and bands only.
      expect(text, path).not.toMatch(/\b0?\.\d{2,}\b/)
    }
  })

  it('links nowhere behind accounts while they are off', async () => {
    env.ACCOUNTS = 'off'
    for (const path of pages) {
      const html = await page(path)
      for (const href of hrefs(html)) expect(href, path).not.toMatch(/^\/(app|sign-in|invite|api|mcp)\b/)
      expect(html).not.toContain('Create your network')
      expect(html).not.toContain('Sign in')
    }
  })

  it('offers to create a network and to sign in while accounts are on', async () => {
    env.ACCOUNTS = 'on'
    const html = await page('/')
    expect(main(html)).toMatch(/<a [^>]*href="\/app\/new"[^>]*>Create your network<\/a>/)
    expect(html).toMatch(/<a [^>]*href="\/sign-in"[^>]*>Sign in<\/a>/)
    expect(hrefs(main(html))[0]).toBe('/demo')
  })

  it('says how a run works, what Crossfeed never does, and where developers start', async () => {
    const text = words(await page('/'))
    for (const heading of ['How a run works', 'Evidence on every line', 'What Crossfeed never does', 'For developers'])
      expect(text).toContain(heading)
    expect(text).toContain("Sends a guest's name or a pitch to Qloo.")
    expect(text).toContain('Approves anything for you.')
    expect(hrefs(await page('/'))).toContain('/#developers')
  })

  it('shows the booking inbox only while guest pitches are on', async () => {
    env.GUEST_PITCHES = 'off'
    expect(words(await page('/'))).not.toContain('The booking inbox')
    env.GUEST_PITCHES = 'on'
    expect(words(await page('/'))).toContain('The booking inbox')
  })
})

describe('the privacy page and the beta terms', () => {
  it('are linked from every marketing page', async () => {
    for (const path of pages) {
      const footer = (await page(path)).match(/<footer[\s\S]*<\/footer>/)?.[0] ?? ''
      expect(hrefs(footer), path).toEqual(expect.arrayContaining(['/privacy', '/terms']))
    }
  })

  it('says what reaches Qloo and Anthropic, what Crossfeed keeps, and how deletion works', async () => {
    const text = words(await page('/privacy'))
    for (const heading of ['What reaches Qloo', 'What reaches Anthropic', 'What Crossfeed keeps', 'How deletion works'])
      expect(text).toContain(heading)
    expect(text).toContain("Never a pitch's text, a guest's name, an email address, or a sender's details.")
    expect(text).toContain('Crossfeed never stores your IP address or writes it to its own logs.')
    expect(text).toContain("Crossfeed can't delete a session yet")
    expect(text).toContain(
      "Uploads: a file you upload is read in your browser, or by Crossfeed when a program sends it to the API. A roster file's text is sent and imported like pasted names; of pitch emails, only each one's sender, subject, and text are sent, never its attachments or other headers. The files themselves aren't kept."
    )
  })

  it('says the beta is free, without warranty, and limited as the Worker is configured', async () => {
    env.RUN_VISITOR_DAILY_CAP = '7'
    const text = words(await page('/terms'))
    for (const heading of ['Free', 'No warranty', 'Daily limits', 'Acceptable use']) expect(text).toContain(heading)
    expect(text).toContain('Model runs a launch run, an inbox load, or a pitch run 7 200')
    expect(text).toContain('Qloo calls cache hits count for a visitor, not for everyone 2,000 1,000')
    expect(text).toContain('A run makes at most 12 model turns and 60 Qloo calls')
  })

  it('say what an account keeps, how many networks a member can create and launches a network can keep, and the per-minute limits, only while accounts are on', async () => {
    env.NETWORKS_PER_MEMBER = '2'
    env.LAUNCHES_PER_NETWORK = '40'
    const kept = 'With an account: your name'
    const approvals = 'with the member who approved each reply'
    const counts = "each visitor's and each network's counts for the day"
    const cap = 'A member can create at most 2 networks, and a network can keep at most 40 launches at once.'
    const network =
      "A network counts as one visitor of its own, whichever of its members makes the network's calls and runs."
    const keys = "A network's API keys are kept only as hashes"
    const signOff =
      'the name of the member or API key that started each run, and of the member who approved each insertion order, and when'
    const launchGone =
      "Deleting a launch, which any of the network's members can do, wipes its storage: its runs, insertion orders, the roster copies, and their Qloo records."
    const networkGone =
      "Deleting a network, which only an owner can do, deletes its memberships, invite links, and API keys at once, then wipes its own storage, each of its launches', and its Qloo storage. A wipe that fails is tried again by the next day's cleanup, which also deletes expired sessions, sign-in challenges, and invite links."
    const accountGone =
      "Deleting your account, on your account page, deletes your account with its name, passkeys, recovery code, sessions, and memberships at once. What you did in a network stays with it, but not your name: the launches of the networks you're in say “Former member” on the runs you started and the orders you approved. The API keys and invite links you made stay with their networks, made by no one. A network that can't be reached at once forgets your name at the next day's cleanup. It's refused while you're a network's only owner. “Sign out everywhere” deletes every session of yours."
    const perMinute = "Each API key, and each visitor's sign-in requests, are also limited per minute"
    const ownKey =
      "A network's own Qloo key, if an owner adds one, is kept encrypted in the network's own Qloo storage, with the host it's for and its last four characters, the only part of it anyone is shown."
    const ownKeySent =
      'A network that adds its own Qloo key sends its requests with that key instead, to the Qloo host it chose.'
    const keyGone =
      "Removing a network's own Qloo key, which only an owner can do, wipes its Qloo storage at once: the key, its cached answers, and its counts."
    const ownKeyTerms =
      "A network's owner can add the network's own Qloo key in its settings; its Qloo calls then run on that key, under the owner's own agreement with Qloo."
    const ownKeyLimits =
      "A network with its own Qloo key counts its Qloo calls on that key, apart from everyone else's, against the same limits; its model runs count with everyone's."
    expect(words(await page('/privacy'))).toContain(kept)
    expect(words(await page('/privacy'))).toContain(approvals)
    expect(words(await page('/privacy'))).toContain(counts)
    expect(words(await page('/privacy'))).toContain(keys)
    expect(words(await page('/privacy'))).toContain(signOff)
    expect(words(await page('/privacy'))).toContain(launchGone)
    expect(words(await page('/privacy'))).toContain(networkGone)
    expect(words(await page('/privacy'))).toContain(accountGone)
    for (const line of [ownKey, ownKeySent, keyGone]) expect(words(await page('/privacy'))).toContain(line)
    for (const line of [ownKeyTerms, ownKeyLimits]) expect(words(await page('/terms'))).toContain(line)
    expect(words(await page('/terms'))).toContain(cap)
    expect(words(await page('/terms'))).toContain(network)
    expect(words(await page('/terms'))).toContain(perMinute)
    env.ACCOUNTS = 'off'
    expect(words(await page('/privacy'))).not.toContain(kept)
    expect(words(await page('/privacy'))).not.toContain(keys)
    expect(words(await page('/privacy'))).not.toContain(approvals)
    expect(words(await page('/privacy'))).not.toContain(launchGone)
    expect(words(await page('/privacy'))).not.toContain(accountGone)
    for (const line of [ownKey, ownKeySent, keyGone]) expect(words(await page('/privacy'))).not.toContain(line)
    for (const line of [ownKeyTerms, ownKeyLimits]) expect(words(await page('/terms'))).not.toContain(line)
    expect(words(await page('/privacy'))).toContain("each visitor's counts for the day")
    expect(words(await page('/terms'))).not.toContain(cap)
    expect(words(await page('/terms'))).not.toContain(network)
    expect(words(await page('/terms'))).not.toContain(perMinute)
  })
})
