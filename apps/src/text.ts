// Text helpers with no home of their own, shared by the Worker and the page.

// Items as a sentence lists them: "A and B", or "A, B, and C".
export const listOf = (items: string[]) => listParts(items).join('')

// The same as parts, each item after the words that join it to the one before, so a page can set an
// item in its own type, such as an ID beside names.
export const listParts = <T>(items: T[]): (T | string)[] =>
  items.flatMap((item, i) =>
    i === 0 ? [item] : [i < items.length - 1 ? ', ' : items.length < 3 ? ' and ' : ', and ', item]
  )

// A show's move, as the charts set it (positive is a climb): from its topic rank to its fit rank on the
// fit chart, or since an earlier run on a launch's Changes tab, which says a move of 0 its own way; or a
// pitch's, from its pitch rank to its listener rank (`baseline`). The glyph, and the words a screen
// reader hears instead.
export const moveGlyph = (move: number) => (move > 0 ? `▲${move}` : move < 0 ? `▼${-move}` : '=')
export const moveWords = (move: number, baseline = 'topic rank') =>
  move === 0
    ? `Same as ${baseline}`
    : `${move > 0 ? 'Up' : 'Down'} ${Math.abs(move)} place${Math.abs(move) === 1 ? '' : 's'}`

// What `claude mcp list` prints for a server it reached, its own check mark included, as the developer
// docs and the Developers page quote it. taste-skill-ignore keeps a line out of the design-taste skill's
// linter (lint.mjs), which reads ✔ as an emoji: here it's the CLI's output, quoted in a code sample, not
// an icon.
export const CONNECTED = '✔ Connected' // taste-skill-ignore

// A name, such as a show's, a work's or a network's, as its owner, as a page says it: "The Watch’s", or
// after a final s only the apostrophe, "The Rewatchables’". Text written with straight apostrophes, as the
// demographic check's is, passes its own.
export const possessive = (name: string, apostrophe = '’') =>
  name.endsWith('s') ? `${name}${apostrophe}` : `${name}${apostrophe}s`

// A rank as words: "2nd".
export const nth = (n: number) =>
  `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`

// A count of model runs, as the gateway's refusals and the sign-in page's guest panel say it: "1 model
// run", "1,000 model runs".
export const modelRuns = (n: number) => (n === 1 ? '1 model run' : `${n.toLocaleString('en-US')} model runs`)

// The guest member's ID (ADR 0008), as migration 0009 wrote it, whom everyone who signs in as a guest is
// signed in as, and the guest network's, as migration 0005 wrote it, which the guest member owns; here, so
// the app's pages know them too. And when the daily cron (wrangler.jsonc) clears it, as every guest is
// told it. Asking by this ID finds the guest member alone, while the guest mark (isGuestMember) also finds
// the temporary guest members ADR 0006 made, left until the 12:00 clearing removes them: the Worker's
// refusals and guest pages ask by the mark, and the app's pages, which know only the member's ID, and /app,
// which opens the guest network for the guest member alone, by the ID.
export const GUEST_MEMBER = 'guest-member'
export const GUEST_NETWORK = 'guest-network'
// What the ID of every network on the guest budget starts with: the guest network's, and each a guest
// member creates (ADR 0006).
export const GUEST_PREFIX = 'guest-'
export const GUEST_NETWORK_CLEARS = '12:00 UTC'

// The longest name a member or a network can have.
export const MAX_NAME = 64

// What a lookup a restart interrupted says when Crossfeed tries it again by itself, as the guest network's
// sample roster's and sample inbox's lookups are while they're still loading (network-agent.ts).
export const LOOKUP_RETRIED = 'The lookup was interrupted. Crossfeed tries it again later.'

// A member's initials, as their avatar in the app's account menu shows them: the first letters of
// their name's first and last words, "AL" for Ada Lovelace, or one for a one-word name.
export const initials = (name: string) => {
  const words = name.trim().split(/\s+/)
  return [words[0], ...(words.length > 1 ? words.slice(-1) : [])]
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
    .toLocaleUpperCase()
}

// The longest text the agent takes from a person, an API key, or Claude, checked before anything reads
// it, so no pattern runs long on it: a title or a name, such as a launch's, a comp's, a work's, or a
// guest's; a typed answer to the agent's question; and an insertion order line's angle.
export const MAX_TITLE = 200
export const MAX_ANSWER = 2_000
export const MAX_ANGLE = 500

// A name as typed, trimmed, or why it can't be one; `missing` says what to do when there's none.
export function readName(value: unknown, missing: string): { name: string } | { error: string } {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name) return { error: missing }
  if (name.length > MAX_NAME) return { error: `Use a name of at most ${MAX_NAME} characters.` }
  if (/\p{Cc}/u.test(name)) return { error: 'Use a name without control characters.' }
  return { name }
}

// The SHA-256 hash of `text`, in hex: the gateway's cache keys and the topic baselines' (topic.ts).
export async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
