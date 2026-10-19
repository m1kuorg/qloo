// Text helpers with no home of their own, shared by the Worker and the page.

// Items as a sentence lists them: "A and B", or "A, B, and C".
export const listOf = (items: string[]) =>
  items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`

// A show's move from its topic rank to its fit rank, as the charts set it (positive is a climb):
// the glyph, and the words a screen reader hears instead.
export const moveGlyph = (move: number) => (move > 0 ? `▲${move}` : move < 0 ? `▼${-move}` : '=')
export const moveWords = (move: number) =>
  move === 0
    ? 'Same as topic rank'
    : `${move > 0 ? 'Up' : 'Down'} ${Math.abs(move)} place${Math.abs(move) === 1 ? '' : 's'}`

// The longest name a member or a network can have.
export const MAX_NAME = 64

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
