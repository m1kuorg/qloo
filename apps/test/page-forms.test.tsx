// The forms a network's pages open from their one action: the Launches page's New launch, the roster's
// Import shows and the inbox's Load pitches. Each test drives a network through the Worker's routes and
// its agent into a state, then renders the page from the agent's synced state and reads its form.
import { env } from 'cloudflare:workers'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { State } from '../src/agent'
import type { NetworkConnection } from '../src/client/NetworkPage'
import type { Session as AppSession } from '../src/client/App'
import { InboxWorkspace } from '../src/client/Inbox'
import { Launches } from '../src/client/Launches'
import { NetworkRoster } from '../src/client/Roster'
import { networkLinks } from '../src/shell'
import { fakeClaude, fakeQloo, text, turn } from './fake'
import { hooked, openGuest, openMember, type Member, type Session } from './session'

// The tests' isolate has no DOM, so a dialog's portal renders nothing here. A dialog kept mounted is in
// the page's DOM while it's closed, so here it renders in place, where its form can be read; one that
// isn't kept mounted renders nothing, as in the browser.
vi.mock('@/components/ui/dialog', async (original) => ({
  ...(await original<typeof import('@/components/ui/dialog')>()),
  DialogContent: ({ keepMounted, children }: { keepMounted?: boolean; children: ReactNode }) =>
    keepMounted ? <div data-slot="dialog-content">{children}</div> : null
}))

const open: Omit<Session, 'cookie'>[] = []
const saved = { GUEST_PITCHES: env.GUEST_PITCHES, SAMPLE_NETWORK: env.SAMPLE_NETWORK }
afterEach(() => {
  open.splice(0).forEach((agent) => agent.close())
  Object.assign(env, saved)
})

// A network the member creates, as /app/new does, and its agent, opened as its pages open it.
async function network(member: Member) {
  const res = await member.fetch('/app/new', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Night Shift Audio' })
  })
  const { id } = await res.json<{ id: string }>()
  const agent = await member.connect(`/agents/network/${id}`)
  open.push(agent)
  return { id, agent }
}

// What a reader hears of some markup.
const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

// The roster page and the inbox page as the network's agent's synced state renders them.
const roster = (state: State | undefined) =>
  renderToStaticMarkup(<NetworkRoster agent={{ state, stub: {} } as unknown as NetworkConnection} />)
const inbox = (state: State | undefined, id: string) =>
  renderToStaticMarkup(
    <InboxWorkspace
      agent={{ state, stub: {} } as unknown as AppSession}
      links={{ roster: networkLinks(env, id).roster }}
      network={{ id, name: 'Night Shift Audio', role: 'owner', links: networkLinks(env, id) }}
    />
  )

// The page's one form dialog, read as its parts: the header's title and sentence, the form's fields,
// the footer, and the form its submit sends.
function dialog(page: string) {
  const dialogs = hooked(page, 'data-slot="dialog-content"')
  expect(dialogs).toHaveLength(1)
  const [content] = dialogs
  const footer = hooked(content, 'data-slot="dialog-footer"')[0]
  const submit = footer.match(/<button\b[^>]*\stype="submit"[^>]*>/)?.[0] ?? ''
  const form = submit.match(/\sform="([^"]+)"/)?.[1]
  return {
    header: words(hooked(content, 'data-slot="dialog-header"')[0]),
    form: form ? words(hooked(content, `id="${form}"`)[0]) : null,
    footer: words(footer),
    submit,
    // Each control that says what it takes, a text field by its tag and a button by its words, with
    // the descriptions its aria-describedby names.
    described: [...content.matchAll(/<(textarea|button)\b[^>]*\saria-describedby="([^"]+)"[^>]*>/g)].map(
      ({ index, 1: tag, 2: ids }) => ({
        control: tag === 'button' ? words(hooked(content.slice(index), 'aria-describedby')[0]) : tag,
        says: ids.split(' ').map((id) => words(hooked(content, `id="${id}"`)[0] ?? ''))
      })
    )
  }
}

describe('a page form', () => {
  it('opens New launch as a dialog: its title and one sentence, the fields, then Cancel and the submit', async () => {
    const ada = await openMember()
    const { id, agent } = await network(ada)
    const page = renderToStaticMarkup(
      <Launches
        state={agent.state()}
        network={{ id, name: 'Night Shift Audio', role: 'owner', links: networkLinks(env, id) }}
        createLaunch={async () => ({ id: 'l-1' })}
      />
    )
    const form = dialog(page)
    expect(form.header).toBe('New launch Name a released launch, or up to three comps for an unreleased one.')
    expect(form.form).toBe('Released Unreleased, from comps')
    expect(form.footer).toBe('Cancel Create launch')
    // Nothing to send until the launch is named.
    expect(form.submit).toMatch(/\sdisabled=""/)
    expect(form.described).toEqual([])
  })

  it('opens Import shows as a dialog: its title and one sentence, the fields, then Cancel and the submit', async () => {
    const ada = await openMember()
    const { agent } = await network(ada)
    const form = dialog(roster(agent.state()))
    expect(form.header).toBe(
      'Import shows Paste show names or upload the roster’s file, and Crossfeed looks each new one up in Qloo.'
    )
    expect(form.form).toBe(
      'Show names Upload a file Up to 50 shows. Shows already on the roster keep their matches; only new ones are looked up. Drop a file anywhere on the page, or upload one: a CSV needs a name column, and downloads , status , and description are optional; a text file has one show name per line.'
    )
    expect(form.footer).toBe('Cancel Import roster')
    // The limit is the text field's, and the file's format the upload's.
    expect(form.described).toEqual([
      {
        control: 'textarea',
        says: ['Up to 50 shows. Shows already on the roster keep their matches; only new ones are looked up.']
      },
      {
        control: 'Upload a file',
        says: [
          'Drop a file anywhere on the page, or upload one: a CSV needs a name column, and downloads , status , and description are optional; a text file has one show name per line.'
        ]
      }
    ])
  })

  it('opens Load pitches the same way, its privacy promise under the pitches it reads', async () => {
    const ada = await openMember()
    const { id, agent } = await network(ada)
    const form = dialog(inbox(agent.state(), id))
    expect(form.header).toBe(
      'Load pitches Paste pitch emails or upload them, and Claude reads each one for its guest and public work.'
    )
    expect(form.form).toBe(
      'Pitch emails Upload files Replaces the current inbox, up to 50 pitches. Only the work’s title and type are looked up in Qloo; names, addresses, and pitch text never are. Drop email files anywhere on the page, or upload them: .eml files, an .mbox export, or a .txt with a line of three dashes between pitches.'
    )
    expect(form.footer).toBe('Cancel Read pitches')
    expect(form.described).toEqual([
      {
        control: 'textarea',
        says: [
          'Replaces the current inbox, up to 50 pitches. Only the work’s title and type are looked up in Qloo; names, addresses, and pitch text never are.'
        ]
      },
      {
        control: 'Upload files',
        says: [
          'Drop email files anywhere on the page, or upload them: .eml files, an .mbox export, or a .txt with a line of three dashes between pitches.'
        ]
      }
    ])
  })

  it('says on its submit what the page is still doing, and takes nothing more until it’s done', async () => {
    env.GUEST_PITCHES = 'on'
    const lookups = Promise.withResolvers<void>()
    fakeQloo({ search: {}, held: lookups.promise })
    const reading = Promise.withResolvers<void>()
    fakeClaude([async () => (await reading.promise, turn(text(JSON.stringify({ guest: 'Ada Quill', work: null }))))])
    const ada = await openMember()
    const { id, agent } = await network(ada)
    await agent.call('importRoster', 'Deep Cuts\nSignal Boost')
    await agent.call('loadInbox', { text: 'Subject: Night Ferry\n\nAda Quill on her novel Night Ferry.' })
    const state = await agent.until((s) => s.roster.length === 2 && s.inbox?.status === 'reading')
    const importing = dialog(roster(state))
    expect(importing.footer).toBe('Cancel Looked up 0 of 2…')
    expect(importing.submit).toMatch(/\sdisabled=""/)
    const loading = dialog(inbox(state, id))
    expect(loading.footer).toBe('Cancel Reading the inbox…')
    expect(loading.submit).toMatch(/\sdisabled=""/)
    lookups.resolve()
    reading.resolve()
    await agent.until((s) => s.inbox?.status === 'done' && s.roster.every((show) => show.resolution !== 'pending'))
    expect(dialog(roster(agent.state())).footer).toBe('Cancel Import roster')
    expect(dialog(inbox(agent.state(), id)).footer).toBe('Cancel Read pitches')
  })

  it('says the guest network’s sample works are looked up, not its pitches read, while their lookups are out', async () => {
    env.SAMPLE_NETWORK = 'on'
    env.GUEST_PITCHES = 'on'
    const lookups = Promise.withResolvers<void>()
    fakeQloo({ search: {}, held: lookups.promise })
    const guest = await openGuest()
    const agent = await guest.connect('/agents/network/guest-network')
    open.push(agent)
    const state = await agent.until((s) => s.inbox?.sample === true && s.inbox.status === 'reading')
    expect(dialog(inbox(state, 'guest-network')).footer).toBe('Cancel Looking up the sample’s works…')
    lookups.resolve()
    await agent.until((s) => s.inbox?.status === 'done')
  })
})
