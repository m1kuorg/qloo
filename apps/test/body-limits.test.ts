// Request bodies: every route that reads one stops at its limit and answers 413, whether the body says
// its length or streams it chunked with none, through the Worker's routes, as a browser, a program, and
// an assistant send them.
import { env, exports } from 'cloudflare:workers'
import { describe, expect, it, onTestFinished } from 'vitest'
import { fakeQloo } from './fake'
import { networkWithKey, openMember, poll } from './session'

const origin = 'https://crossfeed.test'
const KB = 1024
const MB = 1024 * KB

// A body streamed in 16 KB chunks with no Content-Length, as a chunked upload sends it: `size` bytes of
// `fill`, then nothing more, the stream left open, so a reader that doesn't stop at its limit waits on it.
const streamed = (size: number, fill = ' ') => {
  let sent = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= size) return new Promise<void>(() => {})
      const chunk = new TextEncoder().encode(fill.repeat(Math.min(16 * KB, size - sent)))
      sent += chunk.length
      controller.enqueue(chunk)
    }
  })
}

// A body that's all there is: one chunk, then the end, with no Content-Length either.
const chunked = (text: string) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text))
      controller.close()
    }
  })

// A POST of `body` to `path` with `headers`, as the Worker answers it, or "still reading" when it hasn't
// answered in five seconds.
async function post(path: string, headers: Record<string, string>, body: BodyInit) {
  const request = new Request(`${origin}${path}`, { method: 'POST', headers, body, duplex: 'half' } as RequestInit)
  const answer = exports.default.fetch(request).then(async (res) => [res.status, await res.json()])
  return Promise.race([answer, new Promise((resolve) => setTimeout(() => resolve('still reading'), 5_000))])
}

const json = { 'Content-Type': 'application/json' }
const page = { ...json, Origin: origin }
const tooLarge = { error: 'This request is too large. Send at most 64 KB.' }

describe('a JSON body to the auth or app routes', () => {
  it('is refused with 413 past 64 KB, as its Content-Length says or as it streams', async () => {
    const ada = await openMember()
    const name = JSON.stringify({ name: 'x'.repeat(65 * KB) })
    expect(await post('/auth/sign-up/options', page, name)).toEqual([413, tooLarge])
    expect(await post('/auth/sign-up/options', page, streamed(65 * KB))).toEqual([413, tooLarge])
    expect(await post('/app/new', { ...page, Cookie: ada.cookie }, name)).toEqual([413, tooLarge])
    expect(await post('/app/new', { ...page, Cookie: ada.cookie }, streamed(65 * KB))).toEqual([413, tooLarge])
  })

  it('is read as before up to the limit, streamed or not', async () => {
    const ada = await openMember()
    const named = JSON.stringify({ name: 'Night Shift Audio' })
    expect(await post('/app/new', { ...page, Cookie: ada.cookie }, chunked(named))).toEqual([
      200,
      { id: expect.any(String) }
    ])
    // The name's own limit still answers for a body under 64 KB.
    expect(
      await post('/app/new', { ...page, Cookie: ada.cookie }, JSON.stringify({ name: 'x'.repeat(60 * KB) }))
    ).toEqual([400, { error: 'Use a name of at most 64 characters.' }])
  })
})

describe('a body to the API or the MCP server', () => {
  const overUpload = 5 * MB + 65 * KB
  const uploadTooLarge = {
    error: { code: 'too_large', message: 'This request is over the 5 MB limit for an upload.' }
  }

  it('is refused with 413 past the upload limit as it streams, without waiting for its end', async () => {
    env.GUEST_PITCHES = 'on'
    onTestFinished(() => {
      env.GUEST_PITCHES = 'off'
    })
    const { network, secret } = await networkWithKey()
    const key = { Authorization: `Bearer ${secret}` }
    expect(
      await post(
        `/api/v1/networks/${network}/roster`,
        { ...key, 'Content-Type': 'text/plain' },
        streamed(overUpload, 'a')
      )
    ).toEqual([413, uploadTooLarge])
    expect(
      await post(
        `/api/v1/networks/${network}/inbox`,
        { ...key, 'Content-Type': 'application/mbox' },
        streamed(overUpload)
      )
    ).toEqual([413, uploadTooLarge])
    expect(
      await post('/mcp', { ...key, ...json, Accept: 'application/json, text/event-stream' }, streamed(overUpload))
    ).toEqual([413, uploadTooLarge])
  })

  it('takes a streamed upload under the limit as one that says its length', async () => {
    fakeQloo({ search: { 'Deep Cuts': [{ entity_id: 'p-0001', name: 'Deep Cuts', popularity: 0.5 }] } })
    const { network, secret, call } = await networkWithKey()
    const roster = `/api/v1/networks/${network}/roster`
    expect(
      await post(roster, { Authorization: `Bearer ${secret}`, 'Content-Type': 'text/plain' }, chunked('Deep Cuts\n'))
    ).toEqual([202, expect.objectContaining({ shows: [expect.objectContaining({ name: 'Deep Cuts' })] })])
    const settled = await poll<{ status: string; shows: { name: string }[] }>(
      call,
      roster,
      (r) => r.status === 'settled'
    )
    expect(settled.shows.map((s) => s.name)).toEqual(['Deep Cuts'])
  })
})
