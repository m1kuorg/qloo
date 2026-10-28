// What the account page says: it's rendered from the data attributes the server gave the page, after
// driving the member's account through the Worker's routes, and read as words.
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountPage, GuestAccountPage } from '../src/client/AccountPage'
import { softwareAuthenticator } from './authenticator'
import { addPasskey, openGuest, openMember, regions, type Member } from './session'

afterEach(() => vi.useRealTimers())

const post = (member: Pick<Member, 'fetch'>, path: string, body: object = {}) =>
  member.fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

// The #root's data attributes the server gave the account page.
async function data(member: Pick<Member, 'fetch'>, path = '/app/account') {
  const html = await (await member.fetch(path)).text()
  const root = html.match(/<div id="root"([^>]*)>/)![1]
  return Object.fromEntries(
    [...root.matchAll(/data-([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [
      k,
      v
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
    ])
  )
}

// The account page as main.tsx renders it from the server's data attributes.
async function page(member: Pick<Member, 'fetch'>, path = '/app/account') {
  const d = await data(member, path)
  return renderToStaticMarkup(
    d['guest-member'] === 'true' ? (
      <GuestAccountPage />
    ) : (
      <AccountPage
        name={d['member-name']}
        passkeys={JSON.parse(d.passkeys)}
        sessions={Number(d.sessions)}
        networks={JSON.parse(d.networks)}
        recovered={d.recovered === 'true'}
      />
    )
  )
}

// The page's words, as a reader hears them.
const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

describe('the account page', () => {
  it("shows the member's name, passkeys by browser and date, sessions, and networks", async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-19T12:00:00Z'))
    const ada = await openMember()
    const night = await (await post(ada, '/app/new', { name: 'Night Shift Audio' })).json<{ id: string }>()
    vi.setSystemTime(new Date('2026-10-21T09:00:00Z'))
    await addPasskey(
      ada,
      softwareAuthenticator(),
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36'
    )
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(night.id) })

    const html = await page(ada)
    const read = words(html)
    expect(read).toMatch(/^Account /)
    expect(html).toMatch(/<input\b(?=[^>]*\sid="acct-name")(?=[^>]*\svalue="Ada Programmer")/)
    expect(read).toContain(
      'Passkey Added Last used Actions Passkey Oct 19 Never Remove Chrome on macOS Oct 21 Never Remove'
    )
    expect(read).toContain('Add a passkey')
    expect(read).toContain('Get a new recovery code')
    expect(read).toContain('You’re signed in on 1 browser, this one.')
    expect(read).toContain('Sign out everywhere')
    expect(read).toContain('Network Role Actions Night Shift Audio Owner Leave')
    expect(html).toContain(`href="/app/${night.id}"`)
    expect(read).toContain(
      'You’re the only owner of Night Shift Audio. Make someone else an owner in its settings, or delete the network there, before you leave it or delete your account.'
    )
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Leave<\/button>/)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Delete account<\/button>/)
    expect(read).not.toContain('You signed in with your recovery code')

    // A member of a network they don't own can leave it, and delete their account.
    const theirs = await page(grace)
    expect(words(theirs)).toContain('Night Shift Audio Member Leave')
    expect(theirs).not.toMatch(/disabled=""[^>]*>Leave</)
    expect(theirs).not.toMatch(/disabled=""[^>]*>Delete account</)
    // Their only passkey can't be removed.
    expect(theirs).toMatch(/<button[^>]*disabled=""[^>]*>Remove<\/button>/)
    expect(words(theirs)).toContain('Your only passkey can’t be removed: add another first.')
  })

  it('asks a member who signed in with their recovery code to add a passkey, and says when there are no networks', async () => {
    const ada = await openMember()
    const read = words(await page(ada, '/app/account?recovered'))
    expect(read).toContain(
      'You signed in with your recovery code. Add a passkey for this device now, so you can sign in without a code next time.'
    )
    expect(read).toContain('You’re not in any network yet. Create a network')
  })

  it("leaves the shell's top bar the one banner, and names each region once", async () => {
    const ada = await openMember()
    await post(ada, '/app/new', { name: 'Night Shift Audio' })
    const html = await page(ada)
    expect(html).not.toContain('<header')
    const named = regions(html)
    expect(named.length).toBeGreaterThan(1)
    expect(new Set(named).size).toBe(named.length)
  })

  it('tells two passkeys from one browser, added the same day, apart by the time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-19T12:00:00Z'))
    const ada = await openMember()
    vi.setSystemTime(new Date('2026-10-19T12:05:00Z'))
    await addPasskey(ada, softwareAuthenticator(), 'curl/8.7')
    expect(words(await page(ada))).toContain(
      'Passkey Oct 19, 12:00 PM Never Remove Passkey Oct 19, 12:05 PM Never Remove'
    )
  })

  it('shows a guest only why no guest can change the one account every guest shares, and signing out', async () => {
    const guest = await openGuest()
    // The server reads none of the shared account's passkeys, sessions, or networks for it.
    expect(await data(guest)).toEqual({ page: 'account', 'member-name': 'Guest', 'guest-member': 'true' })
    const html = await page(guest)
    expect(regions(html)).toEqual(['Shared guest account'])
    expect(words(html)).toBe(
      'Account Shared guest account Everyone who signs in as a guest is signed in as Guest, in the guest network, and shares everything in it and its daily limits. No guest can add a passkey or a recovery code, rename this account, sign out every guest, delete it, join a network by invite, or leave a network, since each would change it for every guest. For any of that, and for networks of your own, sign out and create an account. Sign out and create an account'
    )
    expect(html).toMatch(/<button\b[^>]*>Sign out and create an account<\/button>/)
  })
})
