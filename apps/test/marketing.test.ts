// The marketing pages: the landing page at /, the privacy page, the beta terms, and the developer
// docs, all server-rendered with no React island, and /llms.txt.
import { env, exports } from 'cloudflare:workers'
import { HTTPException } from 'hono/http-exception'
import { afterEach, describe, expect, it, vi } from 'vitest'
import inbox from '../src/sample-inbox.json'
import network from '../src/sample-network.json'
import { REFUSALS } from '../src/refusal'
import { networkWithKey, openMember } from './session'

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
// Every way on, in document order: each link's href, and each button that posts a form, as its form's
// method and action, such as "POST /auth/guest", which the page's own <form> sets.
const ways = (html: string, page = html) =>
  [...html.matchAll(/<a [^>]*href="([^"]*)"|<button\b[^>]*\sform="([^"]*)"/g)].map(([, href, form]) => {
    if (href !== undefined) return href
    const tag = page.match(new RegExp(`<form\\b[^>]*\\sid="${form}"[^>]*>`))?.[0] ?? ''
    return `${tag.match(/\smethod="([^"]*)"/)?.[1]?.toUpperCase()} ${tag.match(/\saction="([^"]*)"/)?.[1]}`
  })
// Guest sign-in, as the public pages' guest buttons post it.
const GUEST = 'POST /auth/guest'
// The page's text, without its markup.
const words = (html: string) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, '')
    .replace(/<wbr\s*\/?>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
// The picture of the app among the page's figures whose words include `text`, as markup.
const picture = (html: string, text: string) => {
  const figure = html.split(/(?=<figure\b)/).find((f) => words(f).includes(text)) ?? ''
  return figure.slice(0, figure.indexOf('</figure>'))
}
// A picture's heading, as the app's Section sets it: its title, then its chips after the last word.
const heading = (figure: string, title: string) =>
  words(figure.match(new RegExp(`<p\\b[^>]*>\\s*${title}[\\s\\S]*?</p>`))?.[0] ?? '').trim()

const vars = {
  ACCOUNTS: env.ACCOUNTS,
  NETWORKS_PER_MEMBER: env.NETWORKS_PER_MEMBER,
  LAUNCHES_PER_NETWORK: env.LAUNCHES_PER_NETWORK,
  INVITES_PER_NETWORK: env.INVITES_PER_NETWORK,
  API_KEYS_PER_NETWORK: env.API_KEYS_PER_NETWORK,
  INVITED_SIGNUP_DAILY_CAP: env.INVITED_SIGNUP_DAILY_CAP,
  GUEST_PITCHES: env.GUEST_PITCHES,
  RUN_VISITOR_DAILY_CAP: env.RUN_VISITOR_DAILY_CAP,
  SEARCH_INDEXING: env.SEARCH_INDEXING
}
afterEach(() => Object.assign(env, vars))

const pages = ['/', '/privacy', '/terms', '/docs', '/docs/api', '/docs/sdk', '/docs/mcp', '/docs/agents']
// Every name the demo looks up in Qloo, and every work its sample inbox pitches: a marketing page
// that showed one would be showing what Qloo returned for it.
const looked = [
  ...network.shows.map((s) => s.name),
  network.launch.name,
  ...inbox.pitches.flatMap((p) => (p.expected.work ? [p.expected.work.title] : [])),
  ...inbox.show.pastGuests.map((g) => g.work.title)
]

describe('the landing page', () => {
  it('serves / with no React island, and its first call to action signs in as a guest, to the sample, with no script', async () => {
    const html = await page('/')
    expect(html).not.toContain('id="root"')
    expect(html).not.toContain('client/main.tsx')
    expect(ways(main(html), html)[0]).toBe(GUEST)
    expect(main(html)).toMatch(/<button\b(?=[^>]*\stype="submit")[^>]*>Open the sample network<\/button>/)
    expect(words(main(html))).toContain(
      'Signs you in as a guest, for a day. Every guest shares the network, which opens on 19 public show names from The Ringer, with sample figures. Crossfeed isn’t affiliated with The Ringer.'
    )
    expect(words(html)).not.toMatch(/No sign-in|needs no sign-in/)
  })

  it('links no page to the retired demo, and offers its sample as guest sign-in from the close', async () => {
    for (const path of pages) expect(hrefs(await page(path)), path).not.toContain('/demo')
    const close = (await page('/')).match(/<section\b[^>]*\bdata-band="signal"[\s\S]*?<\/section>/)?.[0] ?? ''
    expect(ways(close, await page('/'))).toEqual([GUEST, '/app/new'])
    expect(words(close)).toContain(
      'The sample signs you in as a guest, in the network every guest shares, which is cleared every day. A network of your own keeps its roster, launches, and members, and its members sign in with passkeys.'
    )
  })

  it('labels its re-rank an illustration of made-up shows, and no marketing page shows Qloo data', async () => {
    const html = await page('/')
    expect(words(html)).toMatch(/Illustration: a made-up network, launch, shows, ranks, and tags\. Not Qloo data\./)
    expect(words(html)).toContain('Launch: Low Tide')
    for (const path of pages) {
      const text = words(await page(path))
      for (const name of looked) expect(text, `${path} names ${name}`).not.toContain(name)
      // Qloo writes its figures to 16 decimals; a picture of the app shows each in its metric's format,
      // three decimals at most, as the inspector does.
      expect(text, path).not.toMatch(/\d\.\d{4,}/)
    }
  })

  it('pictures a call’s evidence as the inspector words it, with no ID or URN and each figure in its format', async () => {
    const figure = picture(main(await page('/')), 'Evidence · C-14')
    const text = words(figure)
    expect(heading(figure, 'Evidence')).toBe('Evidence · C-14 Qloo data')
    for (const part of [
      'Evidence · C-14 Qloo data Qloo scored 8 of 8 candidates.',
      'Request POST /v2/insights Status 200 Called Oct 28, 14:01:58 · 1,240 ms Run Run 1',
      'What was sent Type Podcast Ranked against Low Tide Candidates 8 podcasts Explainability On Results Up to 50',
      'Stored record'
    ])
      expect(text).toContain(part)
    // The roster in listener order, each by its name and its affinity to three decimals, highest first.
    const affinities = text.match(/Affinities · 8 Name Affinity (.*?) Stored record/)?.[1] ?? ''
    const rows = [...affinities.matchAll(/(?:^| )(\D+?) (\d\.\d{3})(?= |$)/g)]
    expect(rows.map(([, name]) => name)).toEqual([
      'Case Notes',
      'The Harbour',
      'Plain Sight',
      'Tide Tables',
      'Static',
      'Small Claims',
      'Night Desk',
      'Dry Ink'
    ])
    const figures = rows.map(([, , affinity]) => Number(affinity))
    expect(figures).toEqual([...figures].sort((a, b) => b - a))
    expect(text).not.toMatch(/urn:|[0-9a-f]{8}-[0-9a-f]{4}-/i)
  })

  it('pictures the run log as the inspector draws it, its chip beside its heading over the app’s sentence', async () => {
    const figure = picture(main(await page('/')), 'Run log')
    expect(heading(figure, 'Run log')).toBe('Run log Running')
    expect(words(figure)).toContain('Run log Running Each step the run took, and how it ended. Resolving Low Tide Done')
  })

  it('links nowhere behind accounts while they are off', async () => {
    env.ACCOUNTS = 'off'
    for (const path of pages) {
      const html = await page(path)
      for (const href of hrefs(html)) expect(href, path).not.toMatch(/^\/(app|sign-in|invite|api|mcp)\b/)
      expect(html).not.toContain('Create your network')
      expect(html).not.toContain('Sign in')
      // No way in at all: trying Crossfeed is signing in as a guest (ADR 0007).
      expect(html, path).not.toMatch(/<form\b|<button\b[^>]*\sform=/)
      expect(html, path).not.toContain('Sample network')
      expect(words(html), path).not.toContain('Open the sample network')
    }
  })

  it('offers to create a network and to sign in while accounts are on', async () => {
    env.ACCOUNTS = 'on'
    const html = await page('/')
    expect(main(html)).toMatch(/<a [^>]*href="\/app\/new"[^>]*>Create your network<\/a>/)
    expect(html).toMatch(/<a [^>]*href="\/sign-in"[^>]*>Sign in<\/a>/)
    expect(ways(main(html), html)[0]).toBe(GUEST)
  })

  it('re-ranks a made-up roster by topic with two radios and no script, each row in listener order with both its ranks', async () => {
    const html = main(await page('/'))
    const reRank = html.match(/<section\b[^>]*\bdata-rerank\b[\s\S]*?<\/section>/)?.[0] ?? ''
    expect(reRank).toMatch(/<fieldset\b[^>]*>\s*<legend\b[^>]*>Rank the roster<\/legend>/)
    const radios = [...reRank.matchAll(/<label\b[^>]*>\s*(<input\b[^>]*>)([^<]*)<\/label>/g)]
    expect(radios.map(([, , label]) => label.trim())).toEqual(['By who listens', 'By topic'])
    expect(radios.map(([, input]) => [/\btype="radio"/.test(input), /\bchecked\b/.test(input)])).toEqual([
      [true, true],
      [true, false]
    ])
    // Each row's ranks, by who listens and by topic, as its data and as its words.
    const nth = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n] ?? 'th'}`
    const rows = reRank.split(/(?=<div\b[^>]*\bdata-row\b)/).slice(1)
    expect(rows.length).toBe(8)
    const ranks = rows.map((row) => {
      const tag = row.match(/^<div\b[^>]*>/)![0]
      const [listeners, topic] = ['l', 't'].map((d) => Number(tag.match(new RegExp(`\\bdata-${d}="(\\d+)"`))?.[1]))
      expect(words(row)).toContain(`${nth(listeners)} by who listens, ${nth(topic)} by topic`)
      return [listeners, topic]
    })
    expect(ranks.map(([listeners]) => listeners)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(ranks.map(([, topic]) => topic).sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    // The page's pictures are pieces of the app that the keyboard never lands in.
    const pictures = [...html.matchAll(/<div\b[^>]*\bdata-ui\b[^>]*>/g)].filter(([tag]) => /\binert\b/.test(tag))
    expect(pictures.length).toBeGreaterThanOrEqual(4)
  })

  it('says what a topic plan misses, how a run works, what it does, what Crossfeed never does, and where developers start', async () => {
    const text = words(await page('/'))
    for (const heading of [
      'What a topic plan misses',
      'How a run works',
      'What it does',
      'Cites every figure',
      'What Crossfeed never does',
      'For developers'
    ])
      expect(text).toContain(heading)
    expect(text).toContain('Sends a guest’s name or a pitch to Qloo.')
    expect(text).toContain('Approves anything for you.')
    expect(hrefs(await page('/'))).toContain('/docs')
  })

  // Each part of the page is a screen of its own (docs/DESIGN.md), so each is a section at the top of the
  // main region, named by its heading; the screens themselves are checked in a browser (apps/README.md).
  it('sets out its main region as the hero, then one section after another, each named by its heading', async () => {
    const html = main(await page('/'))
    // The sections at the top of the main region, not the ones inside its pictures.
    const top: string[] = []
    let depth = 0
    for (const [tag] of html.matchAll(/<\/?section\b[^>]*>/g)) {
      if (tag.startsWith('</')) depth--
      else if (depth++ === 0) top.push(tag)
    }
    const headings = top.map((tag) => {
      const id = tag.match(/\baria-labelledby="([^"]+)"/)?.[1]
      const heading = html.match(new RegExp(`<(h[12])\\b[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</\\1>`))
      return heading && words(heading[2]).trim()
    })
    expect(headings).toEqual([
      'Rank by who listens',
      'What a topic plan misses',
      'How a run works',
      'What it does',
      'What Crossfeed never does',
      'For developers',
      'Try the sample, or your roster?'
    ])
  })

  it('draws a field behind the page on a canvas hidden from assistive technology, with a script no other marketing page loads', async () => {
    const canvas = /<canvas\b[^>]*>/g
    const script = /<script\b[^>]*\bsrc="\/src\/client\/ascii\.ts"/
    const html = await page('/')
    const canvases = [...html.matchAll(canvas)].map(([tag]) => tag)
    expect(canvases).toHaveLength(1)
    expect(canvases[0]).toMatch(/\baria-hidden="true"/)
    expect(html).toMatch(script)
    const browser = { headers: { Accept: 'text/html' } }
    const others = await Promise.all([
      ...pages.slice(1).map(async (path) => [path, await page(path)]),
      ['/no-such-page', await (await exports.default.fetch(`${origin}/no-such-page`, browser)).text()]
    ])
    for (const [path, other] of others) {
      expect(other, path).toContain('</footer>')
      expect(other, path).not.toMatch(canvas)
      expect(other, path).not.toMatch(script)
    }
  })

  it('lands every in-page link on an element of the page', async () => {
    const html = await page('/')
    const anchors = hrefs(html).filter((href) => href.startsWith('#'))
    expect(anchors).toEqual(expect.arrayContaining(['#content', '#developers', '#does-rank']))
    for (const href of anchors) expect(html, href).toContain(`id="${href.slice(1)}"`)
  })

  it('shows the booking inbox only while guest pitches are on', async () => {
    env.GUEST_PITCHES = 'off'
    for (const line of ['Triages pitches', 'Replies drafted to guests pitched to The Harbour.'])
      expect(words(await page('/'))).not.toContain(line)
    env.GUEST_PITCHES = 'on'
    for (const line of ['Triages pitches', 'Replies drafted to guests pitched to The Harbour.'])
      expect(words(await page('/'))).toContain(line)
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
    expect(text).toContain('Never a pitch’s text, a guest’s name, an email address, or a sender’s details.')
    expect(text).toContain('Crossfeed never stores your IP address or writes it to its own logs.')
    expect(text).toContain(
      'In your browser: one cookie, __Host-crossfeed_member , which holds your session’s token and is sent only to Crossfeed, over HTTPS. It’s HttpOnly and lasts 30 days, renewed while you use Crossfeed, or a day for a guest. There are no analytics, ads, or third-party scripts.'
    )
    expect(text).toContain(
      'The standalone demo, retired on 28 October 2026, kept each visitor’s session in storage of its own: no browser can reach those sessions now, but their storage stays.'
    )
    expect(text).not.toMatch(/crossfeed_session|In your session|load nothing into the sample network/)
    expect(text).toContain(
      'Uploads: a file you upload is read in your browser, or by Crossfeed when a program sends it to the API. A roster file’s text is sent and imported like pasted names; of pitch emails, only each one’s sender, subject, and text are sent, never its attachments or other headers. The files themselves aren’t kept.'
    )
  })

  it('says the Qloo cache is shared, and that a cache hit can show someone else looked up the same name', async () => {
    const shared =
      'Shared by every network: Qloo’s responses with the requests they answered, cached with no expiry in one cache that every network without its own Qloo key shares. A call another network made first is answered from it, and its evidence says the cache was hit, so a hit can show that another network looked up the same name; nothing else of theirs is shown, and the cache is never published.'
    expect(words(await page('/privacy'))).toContain(shared)
    // With accounts off there's no network, and no way in to make a call.
    env.ACCOUNTS = 'off'
    expect(words(await page('/privacy'))).not.toContain('Shared by every network')
    expect(words(await page('/privacy'))).toContain(
      'In your browser: no cookie. There are no analytics, ads, or third-party scripts.'
    )
    for (const path of ['/', '/privacy'])
      expect(words(await page(path)), path).not.toMatch(/privately|private to Crossfeed/)
  })

  it('says the beta is free, without warranty, and limited as the Worker is configured', async () => {
    env.RUN_VISITOR_DAILY_CAP = '7'
    const text = words(await page('/terms'))
    for (const heading of ['Free', 'No warranty', 'Daily limits', 'Acceptable use']) expect(text).toContain(heading)
    expect(text).toContain(
      'try to get around the limits, reach a network or an account that isn’t yours, or overload the service;'
    )
    expect(text).toContain('Model runs a launch run, an inbox load, or a pitch run 7 200')
    expect(text).toContain('Qloo calls cache hits count for a visitor, not for everyone 2,000 1,000')
    expect(text).toContain('A run makes at most 12 model turns and 60 Qloo calls')
  })

  it('say what an account keeps, how many networks a member can create and launches a network can keep, and the per-minute limits, only while accounts are on', async () => {
    env.NETWORKS_PER_MEMBER = '2'
    env.LAUNCHES_PER_NETWORK = '40'
    env.INVITES_PER_NETWORK = '15'
    env.API_KEYS_PER_NETWORK = '6'
    env.INVITED_SIGNUP_DAILY_CAP = '12'
    const kept = 'With an account: your name'
    const approvals = 'with the member who approved each reply'
    const counts = 'each network’s counts for the day'
    const cap =
      'A member can create at most 2 networks, and a network can keep at most 40 launches, 15 open invite links, and 6 API keys in use at once. One member’s invite links can bring in at most 12 new accounts a UTC day.'
    const network =
      'A network counts as one visitor of its own, whichever of its members makes the network’s calls and runs.'
    const keys = 'A network’s API keys are kept only as hashes'
    const signOff =
      'the name of the member or API key that started each run, and of the member who approved each insertion order, and when'
    const left =
      'Leaving a network, or being removed from it, deletes your membership at once, and your open pages of it close. Crossfeed keeps only a note that you were in it, so deleting your account later forgets your name there too.'
    const launchGone =
      'Deleting a launch, which any of the network’s members can do, wipes its storage: its runs, insertion orders, the roster copies, and their Qloo records.'
    const networkGone =
      'Deleting a network, which only an owner can do, deletes its memberships, invite links, and API keys at once, then wipes its own storage, each of its launches’, and its Qloo storage. A wipe that fails is tried again by the next hourly cleanup, which also deletes expired sessions, sign-in challenges, and invite links.'
    const accountGone =
      'Deleting your account, on your account page, deletes your account with its name, passkeys, recovery code, sessions, and memberships at once. What you did in a network stays with it, but not your name: the launches of the networks you’re in, or were in before, say “Former member” on the runs you started and the orders you approved, and the replies you approved no longer say who did. The API keys and invite links you made are revoked at once too, as they are when an owner leaves a network, is removed, or is made a member. A network that can’t be reached at once forgets your name at the next hourly cleanup. It’s refused while you’re a network’s only owner. “Sign out everywhere” deletes every session of yours.'
    const perMinute =
      'Each API key, each visitor’s sign-in requests, and the API keys and invite links each member creates are also limited per minute; a request past the limit is refused, and says to wait a minute.'
    const guest =
      'Signing in as a guest asks for nothing. Every guest is signed in as one account they all share, Guest, which has no passkey or recovery code; Crossfeed keeps a hash of each guest’s session, for a day, and the time of each guest sign-in, with nothing else, to count them. Everything guests make, in the guest network and in the networks guests create, such as rosters, launches, runs, inboxes, approvals, API keys, and invite links, is seen and changed by everyone who signs in as a guest, and stays until one of them deletes or replaces it, or until it’s cleared, every day at 12:00 UTC.'
    const guestCount = 'Guest sign-ins are counted for everyone together, with no address.'
    const guestGone =
      'Every day at 12:00 UTC the guest network is cleared, and so is what guests made beyond it: the networks only the guest account owns are deleted, and wiped as a deleted network is, the guest account leaves the networks it shares with members who have accounts, and the API keys and invite links it made are deleted. The guest accounts of their own that guest sign-ins made before go at the first of these clearings, with the networks only they own and the API keys and invite links they made.'
    const guestTerms =
      'Everyone who signs in as a guest shares one account, and so one set of these limits: the guest network and the networks guests create count as one visitor together, guests can create at most 2 networks a day between them, and guest sign-ins are limited for everyone together, to 30 a minute and 1,000 a UTC day.'
    const ownKey =
      'A network’s own Qloo key, if an owner adds one, is kept encrypted in the network’s own Qloo storage, with the host it’s for and its last four characters, the only part of it anyone is shown.'
    const ownKeySent =
      'A network that adds its own Qloo key sends its requests with that key instead, to the Qloo host it chose.'
    const keyGone =
      'Removing a network’s own Qloo key, which only an owner can do, wipes its Qloo storage at once: the key, its cached answers, and its counts.'
    const ownKeyTerms =
      'A network’s owner can add the network’s own Qloo key in its settings; its Qloo calls then run on that key, under the owner’s own agreement with Qloo.'
    const ownKeyLimits =
      'A network with its own Qloo key counts its Qloo calls on that key, apart from everyone else’s, against the same limits; its model runs count with everyone’s.'
    expect(words(await page('/privacy'))).toContain(kept)
    expect(words(await page('/privacy'))).toContain(approvals)
    expect(words(await page('/privacy'))).toContain(counts)
    expect(words(await page('/privacy'))).toContain(keys)
    expect(words(await page('/privacy'))).toContain(signOff)
    expect(words(await page('/privacy'))).toContain(left)
    expect(words(await page('/privacy'))).toContain(launchGone)
    expect(words(await page('/privacy'))).toContain(networkGone)
    expect(words(await page('/privacy'))).toContain(accountGone)
    for (const line of [ownKey, ownKeySent, keyGone, guest, guestCount, guestGone])
      expect(words(await page('/privacy'))).toContain(line)
    for (const line of [ownKeyTerms, ownKeyLimits, guestTerms]) expect(words(await page('/terms'))).toContain(line)
    expect(words(await page('/terms'))).toContain(cap)
    expect(words(await page('/terms'))).toContain(network)
    expect(words(await page('/terms'))).toContain(perMinute)
    env.ACCOUNTS = 'off'
    expect(words(await page('/privacy'))).not.toContain(kept)
    expect(words(await page('/privacy'))).not.toContain(keys)
    expect(words(await page('/privacy'))).not.toContain(approvals)
    expect(words(await page('/privacy'))).not.toContain(left)
    expect(words(await page('/privacy'))).not.toContain(launchGone)
    expect(words(await page('/privacy'))).not.toContain(accountGone)
    for (const line of [ownKey, ownKeySent, keyGone, guest, guestCount, guestGone, counts])
      expect(words(await page('/privacy'))).not.toContain(line)
    for (const line of [ownKeyTerms, ownKeyLimits, guestTerms]) expect(words(await page('/terms'))).not.toContain(line)
    expect(words(await page('/terms'))).not.toContain(cap)
    expect(words(await page('/terms'))).not.toContain(network)
    expect(words(await page('/terms'))).not.toContain(perMinute)
  })
})

// Every marketing page, the 404 page's too, by its path.
const shown = async () => {
  const missing = await exports.default.fetch(`${origin}/no-such-page`, { headers: { Accept: 'text/html' } })
  return [
    ...(await Promise.all(pages.map(async (path) => [path, await page(path)]))),
    ['/no-such-page', await missing.text()]
  ]
}
// A navigation's links and buttons: each one's words and where it goes, and the one that's the page on view.
const named = (nav: string, page: string) => {
  const to = ways(nav, page)
  const links = [...nav.matchAll(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/g)].map(([, , attributes, text], i) => ({
    link: `${words(text).trim()} ${to[i]}`,
    current: /\baria-current="page"/.test(attributes)
  }))
  return { links: links.map((l) => l.link), current: links.filter((l) => l.current).map((l) => l.link) }
}

describe('the header', () => {
  // The header's one navigation, the phone's Menu and the row from 768px alike.
  const site = (html: string, path: string) => {
    const header = html.match(/<header\b[\s\S]*?<\/header>/)?.[0] ?? ''
    const navs = header.match(/<nav\b[^>]*>[\s\S]*?<\/nav>/g) ?? []
    expect(navs, path).toHaveLength(1)
    const nav = navs[0] ?? ''
    expect(nav, path).toMatch(/^<nav\b[^>]*\baria-label="Site"/)
    return named(nav, html).links
  }

  it('links the developer docs, signing in, and a network of your own while accounts are on, and no guest button', async () => {
    env.ACCOUNTS = 'on'
    for (const [path, html] of await shown())
      expect(site(html, path), path).toEqual(['Developers /docs', 'Sign in /sign-in', 'Create your network /app/new'])
  })

  it('links only the developer docs while accounts are off', async () => {
    env.ACCOUNTS = 'off'
    for (const [path, html] of await shown()) expect(site(html, path), path).toEqual(['Developers /docs'])
  })
})

describe('the footer', () => {
  // The footer's one navigation, which holds every link in it.
  const index = (html: string, path: string) => {
    const footer = html.match(/<footer\b[\s\S]*<\/footer>/)?.[0] ?? ''
    const navs = footer.match(/<nav\b[^>]*>[\s\S]*?<\/nav>/g) ?? []
    expect(navs, path).toHaveLength(1)
    const nav = navs[0] ?? ''
    expect(nav, path).toMatch(/^<nav\b[^>]*\baria-label="Footer"/)
    expect(hrefs(nav), path).toEqual(hrefs(footer))
    return named(nav, html)
  }

  it('indexes the ways in while accounts are on: as a guest, a network of your own, signing in, then the developer docs, privacy, and the beta terms', async () => {
    env.ACCOUNTS = 'on'
    for (const [path, html] of await shown()) {
      const { links, current } = index(html, path)
      expect(links, path).toEqual([
        `Sign in as a guest ${GUEST}`,
        'Create your network /app/new',
        'Sign in /sign-in',
        'Developers /docs',
        'Privacy /privacy',
        'Beta terms /terms'
      ])
      expect(current, path).toEqual(path.startsWith('/docs') ? ['Developers /docs'] : [])
    }
  })

  it('indexes only what exists while accounts are off: each page of the developer docs, privacy, and the beta terms', async () => {
    env.ACCOUNTS = 'off'
    const docs = [
      'Developers /docs',
      'REST API /docs/api',
      'TypeScript SDK /docs/sdk',
      'MCP server /docs/mcp',
      'Skills and plugin /docs/agents'
    ]
    for (const [path, html] of await shown()) {
      const { links, current } = index(html, path)
      expect(links, path).toEqual([...docs, 'Privacy /privacy', 'Beta terms /terms'])
      // The page on view, and on a docs page only its own row.
      expect(current, path).toEqual(docs.filter((link) => link.endsWith(` ${path}`)))
    }
  })
})

describe('the developer docs', () => {
  const docs = ['/docs', '/docs/api', '/docs/sdk', '/docs/mcp', '/docs/agents']

  it('open on what programs can and cannot do, API keys, limits, and every error code', async () => {
    env.API_KEYS_PER_NETWORK = '6'
    const html = await page('/docs')
    expect(html).not.toContain('id="root"')
    const text = words(main(html))
    expect(text).toContain('Approving stays with the members, in the app.')
    expect(text).toContain('No route or tool approves either (ADR 0002, approval stays in the app)')
    expect(text).toContain('Authorization: Bearer cf_live_…')
    expect(text).toContain('120 requests a minute')
    expect(text).toContain(`${env.RUN_VISITOR_DAILY_CAP} a day per network`)
    expect(text).toContain('API keys At most 6 a network keeps in use at once')
    for (const [code, status] of Object.entries(REFUSALS)) expect(text).toMatch(new RegExp(`\\b${code} ${status}\\b`))
    expect(text).toMatch(/\binternal 500\b/)
    for (const path of docs) expect(hrefs(main(html)), path).toContain(path)
  })

  it('mark the page on view in their nav, and list its sections, each a link to its heading', async () => {
    for (const path of docs) {
      const html = main(await page(path))
      const nav = html.match(/<nav\b[^>]*aria-label="Developer docs"[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? ''
      const current = [...nav.matchAll(/<a\b[^>]*>/g)].map(([a]) => a).filter((a) => a.includes('aria-current="page"'))
      expect(
        current.map((a) => a.match(/href="([^"]*)"/)?.[1]),
        path
      ).toEqual([path])
      for (const other of docs) expect(hrefs(nav), path).toContain(other)
      const toc = html.match(/<nav\b[^>]*aria-label="On this page"[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? ''
      const sections = hrefs(toc)
      expect(sections.length, path).toBeGreaterThan(3)
      for (const href of sections)
        expect(html, `${path} ${href}`).toMatch(new RegExp(`<h2\\b[^>]*\\bid="${href.slice(1)}"`))
    }
  })

  it('describe every route of the API from its OpenAPI document, with its cost, and link the document', async () => {
    const doc = await (
      await get('/api/v1/openapi.json')
    ).json<{
      paths: Record<
        string,
        Record<string, { summary: string; 'x-crossfeed-cost': string; 'x-crossfeed-session-only'?: true }>
      >
    }>()
    const html = await page('/docs/api')
    const text = words(main(html))
    const routes = Object.entries(doc.paths).flatMap(([path, item]) =>
      Object.entries(item).map(([m, op]) => ({ path, method: m.toUpperCase(), op }))
    )
    expect(routes.length).toBeGreaterThan(20)
    for (const { path, method, op } of routes) {
      // Its cost, and whether only a session sends it, after its method and path in its entry, and after
      // what it does in its row of "Every route", whose paths are under the network's.
      const cost = `${op['x-crossfeed-cost']}${op['x-crossfeed-session-only'] ? ' Session only' : ''}`
      expect(text).toContain(`${method} ${path} ${cost} `)
      expect(text).toContain(
        `${method} ${path.replace('/api/v1/networks/{networkId}', '') || '/'} ${op.summary} ${cost} `
      )
    }
    expect(text).toContain('DELETE /api/v1/networks/{networkId}/launches/{launchId} Deletes Session only')
    expect(hrefs(main(html))).toContain('/api/v1/openapi.json')
  })

  it.each(['off', 'on'])(
    'list every tool the MCP server lists with guest pitches %s, and how to connect it',
    async (pitches) => {
      env.GUEST_PITCHES = pitches
      const { secret } = await networkWithKey()
      const res = await exports.default.fetch(`${origin}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${secret}`
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
      })
      const listed = JSON.parse((await res.text()).replace(/^[\s\S]*?data:/, '')).result.tools as { name: string }[]
      expect(listed.length).toBe(pitches === 'on' ? 19 : 12)
      const html = await page('/docs/mcp')
      // The tools table's rows, each naming its tool.
      const tools = [...main(html).matchAll(/\bdata-tool="([a-z_]+)"/g)].map((m) => m[1])
      expect(tools).toEqual(listed.map((t) => t.name))
      const text = words(main(html))
      expect(text).toContain(`The ${listed.length} tools the server lists today.`)
      expect(text).toContain(
        'claude mcp add --transport http crossfeed https://crossfeed.test/mcp \\ --header "Authorization: Bearer $CROSSFEED_API_KEY"'
      )
      expect(text).not.toMatch(/approve_/)
    }
  )

  it('say how to install the SDK from the repo, make a client, wait for long work, and handle errors', async () => {
    const text = words(main(await page('/docs/sdk')))
    expect(text).toContain('git clone https://github.com/m1kuorg/qloo.git')
    expect(text).toContain('bun add <path to qloo>/packages/sdk')
    expect(text).toContain("baseUrl: 'https://crossfeed.test'")
    for (const helper of [
      'waitForRoster()',
      'waitForInbox()',
      'waitForRun({ launchId, runId })',
      'waitForRun({ pitchRunId })'
    ])
      expect(text).toContain(helper)
    for (const code of ['CrossfeedError', 'run_failed', 'run_stopped', 'timeout', 'unexpected_response'])
      expect(text).toContain(code)
  })

  it("serve each skill's text at a stable URL, with only the Agent Skills spec's fields, and say how to install the plugin", async () => {
    const html = await page('/docs/agents')
    const text = words(main(html))
    const skills = [...new Set(hrefs(main(html)).filter((href) => href.endsWith('/SKILL.md')))]
    expect(skills).toEqual(['/docs/agents/plan-launch-promos/SKILL.md', '/docs/agents/triage-guest-pitches/SKILL.md'])
    for (const url of skills) {
      const res = await get(url)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toMatch(/^text\/markdown/)
      const skill = await res.text()
      const fields = Object.fromEntries(
        [...skill.match(/^---\n([\s\S]*?)\n---\n/)![1].matchAll(/^(\S+): (.+)$/gm)].map((m) => [m[1], m[2]])
      )
      expect(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']).toEqual(
        expect.arrayContaining(Object.keys(fields))
      )
      expect(fields.name).toBe(url.split('/')[3])
      expect(fields.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(fields.name.length).toBeLessThanOrEqual(64)
      expect(fields.description.length).toBeGreaterThan(0)
      expect(fields.description.length).toBeLessThanOrEqual(1024)
      expect(fields.compatibility.length).toBeLessThanOrEqual(500)
      expect(text).toContain(fields.description)
      // Each one relays the agent's questions as they are, and leaves approval to the app.
      expect(skill).toContain('put the question to the human exactly as the tool gives it')
      expect(skill).toContain('Never invent an answer')
      expect(skill).toContain('you never approve one')
    }
    expect(text).toContain('claude plugin marketplace add ./qloo claude plugin install crossfeed@crossfeed')
    expect(text).toContain('"Authorization": "Bearer ${CROSSFEED_API_KEY}"')
    expect(text).toContain('"url": "${CROSSFEED_URL:-https://crossfeed.m1kuorg.workers.dev}/mcp"')
    for (const name of ['approve-orders', 'toString', 'constructor'])
      expect((await get(`/docs/agents/${name}/SKILL.md`)).status, name).toBe(404)
  })

  it('describe the API, the SDK, and the MCP server in /llms.txt, linking every docs page', async () => {
    const res = await get('/llms.txt')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/^text\/plain/)
    const text = await res.text()
    expect(text).toMatch(/^# Crossfeed\n\n> \S/)
    for (const path of docs) expect(text).toContain(`](${origin}${path})`)
    for (const surface of ['REST API', 'TypeScript SDK', 'MCP server']) expect(text).toContain(surface)
    expect(text).toContain(`](${origin}/api/v1/openapi.json)`)
    expect(text).toContain(`](${origin}/docs/agents/plan-launch-promos/SKILL.md)`)
    env.ACCOUNTS = 'off'
    const closed = await (await get('/llms.txt')).text()
    expect(closed).not.toMatch(/\]\(https:\/\/crossfeed\.test\/(api|mcp|app|sign-in)\b/)
    expect(closed).toContain(`](${origin}/docs/mcp)`)
  })

  // Each figure on a page, as its caption and its Copy button's words, or null for none. A copyable
  // block keeps its button in an inert <template>, which copy.ts puts in place, so the page as served
  // has no button anywhere else: without the script, there's none.
  const copies = (html: string) =>
    main(html)
      .split(/(?=<figure\b)/)
      .slice(1)
      .map((f) => {
        const figure = f.slice(0, f.indexOf('</figure>'))
        expect(figure.replace(/<template\b[\s\S]*?<\/template>/g, '')).not.toMatch(/<button\b/)
        const button = figure.match(
          /<template data-copy\b[^>]*>[\s\S]*?(<button\b[\s\S]*?<\/button>)[\s\S]*?<\/template>/
        )?.[1]
        return [
          words(figure.match(/<figcaption\b[\s\S]*?<\/figcaption>/)?.[0] ?? '').trim(),
          button ? words(button).trim() : null
        ]
      })

  it('offer Copy on their commands and configurations, never on expected output or a transcript, from a script only they load', async () => {
    const shown: Record<string, unknown> = {}
    for (const path of docs) shown[path] = copies(await page(path))
    expect(shown).toEqual({
      '/docs': [
        ['HTTP', 'Copy'],
        ['Shell', 'Copy'],
        // An error the API answers.
        ['JSON', null]
      ],
      '/docs/api': [],
      '/docs/sdk': [
        ['Shell', 'Copy'],
        ['TypeScript', 'Copy'],
        ['TypeScript', 'Copy'],
        ['TypeScript', 'Copy'],
        ['TypeScript', 'Copy']
      ],
      '/docs/mcp': [
        ['Shell', 'Copy'],
        ['A launch through the MCP server Illustration', null]
      ],
      '/docs/agents': [
        ['plugins/crossfeed/.mcp.json', 'Copy'],
        ['Shell', 'Copy'],
        ['Shell', 'Copy']
      ]
    })
    // The landing page's samples, a run's answer and how to read it, have no script to copy them.
    expect(await page('/')).not.toContain('<template data-copy')
    for (const path of pages) {
      const scripts = [...(await page(path)).matchAll(/<script\b[^>]*\bsrc="([^"]*)"/g)].map((m) => m[1])
      expect(scripts.includes('/src/client/copy.ts'), path).toBe(path.startsWith('/docs'))
    }
  })

  it("are linked from the landing page's developers band and the top bar's Developers", async () => {
    const html = await page('/')
    const band = html.match(/<section id="developers"[\s\S]*?<\/section>/)?.[0] ?? ''
    for (const path of docs) expect(hrefs(band), path).toContain(path)
    for (const path of ['/', ...docs]) {
      const top = (await page(path)).match(/<header[\s\S]*?<\/header>/)?.[0] ?? ''
      // One nav at every width, the phone's Menu included, so one Developers link and one current page.
      expect(top.match(/<nav\b/g), path).toHaveLength(1)
      const developers = top.match(/<a\b[^>]*\shref="\/docs"[^>]*>Developers<\/a>/g) ?? []
      expect(developers, path).toHaveLength(1)
      if (path.startsWith('/docs')) expect(developers[0], path).toContain('aria-current="page"')
      else expect(developers[0], path).not.toContain('aria-current')
    }
  })
})

describe('a page that is not there', () => {
  // How a browser asks for a page.
  const browser = { headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' } }
  const answer = async (path: string, init?: RequestInit) => {
    const res = await exports.default.fetch(`${origin}${path}`, init)
    return { status: res.status, type: res.headers.get('content-type'), body: await res.text() }
  }

  it('shows a browser the 404 page in the marketing shell, with ways back', async () => {
    env.GUEST_PITCHES = 'off'
    // A path nothing serves, and a docs page that isn't there.
    for (const path of ['/no-such-page', '/docs/nothing-here']) {
      const res = await answer(path, browser)
      expect([res.status, res.type], path).toEqual([404, expect.stringMatching(/^text\/html/)])
      expect(res.body, path).toContain('<title>Not found · Crossfeed</title>')
      expect(words(main(res.body)), path).toContain('Not on the roster.')
      expect(ways(main(res.body), res.body), path).toEqual(['/', GUEST, '/app'])
      // The marketing shell's links, and no island.
      expect(res.body.match(/<header[\s\S]*?<\/header>/)?.[0], path).toMatch(
        /<a [^>]*href="\/docs"[^>]*>Developers<\/a>/
      )
      expect(hrefs(res.body.match(/<footer[\s\S]*<\/footer>/)?.[0] ?? ''), path).toContain('/privacy')
      expect(res.body, path).not.toContain('id="root"')
    }
  })

  it('links nowhere behind accounts while they are off, as their pages are 404 then too', async () => {
    env.ACCOUNTS = 'off'
    for (const path of ['/no-such-page', '/app/new', '/sign-in']) {
      const res = await answer(path, browser)
      expect(res.status, path).toBe(404)
      expect(words(main(res.body)), path).toContain('Not on the roster.')
      expect(ways(main(res.body), res.body), path).toEqual(['/'])
      for (const href of hrefs(res.body)) expect(href, path).not.toMatch(/^\/(app|sign-in|invite|api|mcp)\b/)
    }
  })

  it("answers today's plain 404 to everything that isn't a browser asking for a page", async () => {
    const plain = { status: 404, type: expect.stringMatching(/^text\/plain/), body: '404 Not Found' }
    // A browser's request where a program reads the answer: the API, an agent's address, MCP, the
    // auth routes, and a CSV download.
    for (const path of ['/api/nothing', '/agents/nothing', '/mcp/nothing', '/auth/nothing', '/orders/IO-0001.csv'])
      expect(await answer(path, browser), path).toEqual(plain)
    // A request that doesn't ask for HTML, or isn't a GET.
    expect(await answer('/no-such-page')).toEqual(plain)
    expect(await answer('/no-such-page', { headers: { Accept: 'application/json' } })).toEqual(plain)
    expect(await answer('/no-such-page', { method: 'POST', ...browser })).toEqual(plain)
  })
})

describe('a page that fails', () => {
  // How a browser asks for a page.
  const browser = { headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' } }
  const answer = async (res: Response) => ({
    status: res.status,
    type: res.headers.get('content-type'),
    body: await res.text()
  })
  const plain = { status: 500, type: expect.stringMatching(/^text\/plain/), body: '500 Internal Server Error' }
  // A member and their network, whose pages fail once the directory has lost table `table`, as they
  // would while D1 fails.
  const failing = async (table: string) => {
    const ada = await openMember()
    const created = await ada.fetch('/app/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Night Shift Audio' })
    })
    const { id } = await created.json<{ id: string }>()
    await env.DB.prepare(`DROP TABLE ${table}`).run()
    return { ada, id }
  }
  // The lines the Worker logged of event `event`.
  const logged = (spy: { mock: { calls: unknown[][] } }, event: string) =>
    spy.mock.calls
      .flat()
      .map(String)
      .filter((line) => line.includes(`"event":"${event}"`))
      .map((line) => JSON.parse(line))
  afterEach(() => vi.restoreAllMocks())

  it('shows a browser the error page in the marketing shell, with its Ray ID and the way back to the network', async () => {
    // On production, where search engines index the public pages but none of a member's.
    env.SEARCH_INDEXING = 'on'
    const { ada, id } = await failing('invites')
    const failed = vi.spyOn(console, 'error')
    const res = await ada.fetch(`/app/${id}`, { headers: { ...browser.headers, 'CF-Ray': '8f1e2d3c4b5a6978-SIN' } })
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex')
    const { status, type, body } = await answer(res)
    expect([status, type]).toEqual([500, expect.stringMatching(/^text\/html/)])
    expect(body).toContain('<title>Something went wrong · Crossfeed</title>')
    // A failure is no page to preview or index, so it has no card.
    expect(body).not.toMatch(/<meta name="description"|<link rel="canonical"|<meta property="og:|<meta name="twitter:/)
    expect(words(main(body)).trim()).toBe(
      'Dead air. Something went wrong in Crossfeed as it loaded this page: try again in a moment. Dashboard Ray ID 8f1e2d3c4b5a6978-SIN'
    )
    expect(ways(main(body), body)).toEqual([`/app/${id}`])
    // The marketing shell's links, and no island.
    expect(body.match(/<header[\s\S]*?<\/header>/)?.[0]).toMatch(/<a [^>]*href="\/docs"[^>]*>Developers<\/a>/)
    expect(body).not.toContain('id="root"')
    expect(logged(failed, 'request_error')).toEqual([
      {
        event: 'request_error',
        method: 'GET',
        path: `/app/${id}`,
        ray: '8f1e2d3c4b5a6978-SIN',
        error: expect.stringContaining('no such table: invites')
      }
    ])
  })

  it('leads home from a public page and to the networks from another of the app’s, with no Ray ID when there is none', async () => {
    // On the preview, where search engines may index nothing, a public page's error page included.
    const { ada } = await failing('sessions')
    for (const [path, back] of [
      ['/sign-in', '/'],
      ['/app/account', '/app']
    ]) {
      const res = await ada.fetch(path, browser)
      expect(res.headers.get('X-Robots-Tag'), path).toBe('noindex')
      const { status, type, body } = await answer(res)
      expect([status, type], path).toEqual([500, expect.stringMatching(/^text\/html/)])
      expect(ways(main(body), body), path).toEqual([back])
      expect(words(main(body)), path).not.toContain('Ray ID')
    }
  })

  it('answers a plain 500 to everything that isn’t a browser asking for a page, and the API its JSON 500', async () => {
    const { ada, id } = await failing('memberships')
    // A write from the app's pages, whose script reads a JSON answer or else its status (controls.tsx).
    expect(await answer(await ada.fetch(`/app/${id}/launches/l-1/delete`, { method: 'POST', ...browser }))).toEqual(
      plain
    )
    // A page asked for by a program, which doesn't accept HTML.
    expect(await answer(await ada.fetch(`/app/${id}`))).toEqual(plain)
    const api = await ada.fetch(`/api/v1/networks/${id}`, browser)
    expect([api.status, await api.json()]).toEqual([
      500,
      { error: { code: 'internal', message: 'Something went wrong in Crossfeed. Try again in a moment.' } }
    ])
  })

  it('answers a plain 500 when the error page fails too, and logs both', async () => {
    const failed = vi.spyOn(console, 'error')
    const saved = env.ACCOUNTS
    // A variable that the landing page reads, and the error page after it, can't be read.
    Object.defineProperty(env, 'ACCOUNTS', {
      configurable: true,
      get: () => {
        throw new Error('ACCOUNTS is unreadable')
      }
    })
    try {
      expect(await answer(await exports.default.fetch(`${origin}/`, browser))).toEqual(plain)
    } finally {
      Object.defineProperty(env, 'ACCOUNTS', { value: saved, writable: true, enumerable: true, configurable: true })
    }
    const unreadable = expect.stringContaining('ACCOUNTS is unreadable')
    expect(logged(failed, 'request_error')).toEqual([
      { event: 'request_error', method: 'GET', path: '/', error: unreadable }
    ])
    expect(logged(failed, 'error_page_failed')).toEqual([{ event: 'error_page_failed', path: '/', error: unreadable }])
  })

  it('answers an HTTPException with its own answer, its status and headers kept, to a page and a write alike', async () => {
    const ada = await openMember()
    vi.spyOn(env.DB, 'prepare').mockImplementation(() => {
      const res = new Response('Crossfeed is busy.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '60' }
      })
      throw new HTTPException(503, { res })
    })
    for (const [path, init] of [
      ['/app/account', browser],
      ['/app/account/name', { method: 'POST', ...browser }]
    ] as const) {
      const res = await ada.fetch(path, init)
      expect(res.headers.get('Retry-After'), path).toBe('60')
      expect(await answer(res), path).toEqual({
        status: 503,
        type: 'text/plain; charset=utf-8',
        body: 'Crossfeed is busy.'
      })
    }
  })
})
