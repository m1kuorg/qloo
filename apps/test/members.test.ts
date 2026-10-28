// Invites and members: an owner's invite links, joining a network through one with a new or an
// existing account, and who can change roles, remove members, or leave, through the Worker's routes
// and the network agent's client protocol.
import { createExecutionContext, createScheduledController, waitOnExecutionContext } from 'cloudflare:test'
import { env, exports } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { softwareAuthenticator } from './authenticator'
import type { Invite, NetworkMember } from '../src/directory'
import worker from '../src/index'
import { openMember, type Member, type Session } from './session'

const origin = 'https://crossfeed.test'
// A signed-out write from one of the app's pages.
const write = (body: object): RequestInit => ({
  method: 'POST',
  headers: { Origin: origin, 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
})

// A network the member creates the way /app/new does.
async function created(member: Member, name = 'Night Shift Audio') {
  const res = await member.fetch('/app/new', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  })
  if (res.status !== 200) throw new Error(`Creating ${name} returned ${res.status}: ${await res.text()}`)
  return (await res.json<{ id: string }>()).id
}

// Why an invite link can't bring in another new account today.
const invitedCapped = (cap: number) =>
  `The member who made this invite link has brought in ${cap} new accounts through their links today, the most one member can in a UTC day; it resets at 00:00 UTC. To join now, sign in with an account you have, then open the link again.`

// The token an invite link carries in its fragment, as the invite page reads it.
const tokenOf = (link: string) => new URL(link).hash.slice(1)

// A write from one of the member's pages, as `send` in the island makes it.
const post = (member: Member, path: string, body: object = {}) =>
  member.fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

const saved = {
  SIGNUP_VISITOR_DAILY_CAP: env.SIGNUP_VISITOR_DAILY_CAP,
  INVITED_SIGNUP_DAILY_CAP: env.INVITED_SIGNUP_DAILY_CAP
}
const open: Omit<Session, 'cookie'>[] = []
afterEach(() => {
  vi.useRealTimers()
  Object.assign(env, saved)
  open.splice(0).forEach((agent) => agent.close())
})

const NOW = Date.parse('2026-10-19T12:00:00Z')
const DAY = 24 * 60 * 60_000

describe('invite links', () => {
  it('let an owner create one, shown once as a link and then listed with its expiry', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    const ada = await openMember()
    const network = await created(ada)

    const res = await post(ada, `/app/${network}/settings/members/invites`)
    expect(res.status).toBe(200)
    const { id, link, invites } = await res.json<{ id: string; link: string; invites: Invite[] }>()
    // The token rides in the fragment, which no request sends.
    expect(link).toMatch(/^https:\/\/crossfeed\.test\/invite#[\w-]{43}$/)
    expect(invites).toEqual([{ id, created: NOW, expires: NOW + 7 * DAY, by: 'Ada Programmer' }])
  })

  it("open on a page that names the network, read from the link's fragment and posted, never in a path or query", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const link = await ada.invite(network)
    const token = new URL(link).hash.slice(1)

    // Signed out, as the person the link was sent to.
    const page = await exports.default.fetch(`${origin}/invite`)
    expect(page.status).toBe(200)
    expect(page.headers.get('Cache-Control')).toBe('no-store')
    const html = await page.text()
    expect(html).toContain('data-page="invite"')
    // No one is signed in, so the shell has no account menu.
    expect(html).not.toContain('data-signed-in')
    const look = await exports.default.fetch(`${origin}/auth/invite`, write({ token }))
    expect(look.status).toBe(200)
    expect(await look.json()).toEqual({ network: 'Night Shift Audio', guestOwned: false })

    const unknown = await exports.default.fetch(`${origin}/auth/invite`, write({ token: `${token}x` }))
    expect(unknown.status).toBe(404)
    expect(await unknown.json()).toEqual({
      error:
        'Crossfeed doesn’t know this invite link: it may be incomplete, or it expired. Ask an owner of the network for a new one.'
    })
  })

  it('let a signed-in member join in one step, once: then the link is refused with why', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const token = tokenOf(await ada.invite(network))
    const grace = await openMember({ name: 'Grace Booker' })
    expect((await grace.fetch(`/app/${network}`)).status).toBe(404)
    // The page names her, to join as herself, and its shell has her account menu.
    const invite = await (await grace.fetch('/invite')).text()
    expect(invite).toContain('data-member-name="Grace Booker"')
    expect(invite).toMatch(/Account: <\/span><span\b[^>]*\sdata-signed-in\b[^>]*>Grace Booker<\/span>/)

    const joined = await post(grace, '/auth/join', { token })
    expect(joined.status).toBe(200)
    expect(await joined.json()).toEqual({ id: network })
    expect(await (await grace.fetch(`/app/${network}/settings`)).text()).toContain('data-role="member"')
    expect(await (await grace.fetch('/app', { redirect: 'manual' })).headers.get('location')).toBe(`/app/${network}`)

    const used = 'This invite link was used already. Each one works once: ask an owner of the network for a new one.'
    const lin = await openMember({ name: 'Lin Editor' })
    for (const res of [
      await post(lin, '/auth/join', { token }),
      await exports.default.fetch(`${origin}/auth/invite`, write({ token }))
    ]) {
      expect(res.status).toBe(410)
      expect(await res.json()).toEqual({ error: used })
    }
    expect((await lin.fetch(`/app/${network}`)).status).toBe(404)
    // The member who used it is sent on to the network.
    expect(await (await post(grace, '/auth/join', { token })).json()).toEqual({ id: network })
  })

  it("send a member already in the network on to it, and leave the link for whoever it's for", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const token = tokenOf(await ada.invite(network))
    expect(await (await post(ada, '/auth/join', { token })).json()).toEqual({ id: network })

    const grace = await openMember({ name: 'Grace Booker' })
    expect(await (await post(grace, '/auth/join', { token })).json()).toEqual({ id: network })
  })

  it('let a new person sign up and join in one step', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(network) })
    expect(grace.network).toBe(network)
    const settings = await (await grace.fetch(`/app/${network}/settings`)).text()
    expect(settings).toContain('data-role="member"')
    expect(settings).toMatch(/Account: <\/span><span\b[^>]*\sdata-signed-in\b[^>]*>Grace Booker<\/span>/)
  })

  it("don't count a sign-up through one against the visitor's sign-up cap, and let one through past it", async () => {
    const ip = '203.0.113.9'
    const ada = await openMember()
    const network = await created(ada)
    for (const name of ['One', 'Two', 'Three', 'Four']) await openMember({ name, ip })
    await openMember({ name: 'Invited Before', ip, invite: await ada.invite(network) })
    await openMember({ name: 'Five', ip })
    await expect(openMember({ name: 'Six', ip })).rejects.toThrow('Sign-up options returned 429')
    const late = await openMember({ name: 'Invited After', ip, invite: await ada.invite(network) })
    expect((await late.fetch(`/app/${network}`)).status).toBe(200)
  })

  it('stop at 20 open in a network, until one is revoked or used', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const make = () => post(ada, `/app/${network}/settings/members/invites`)
    const made: { id: string; link: string }[] = []
    for (let i = 0; i < 20; i++) made.push(await (await make()).json())

    const capped = await make()
    expect([capped.status, await capped.json()]).toEqual([
      429,
      {
        error:
          'Night Shift Audio has 20 open invite links, the most a network can keep at once. Revoke one, or wait for one to be used or to expire.'
      }
    ])
    await post(ada, `/app/${network}/settings/members/invites/${made[0].id}/revoke`)
    expect((await make()).status).toBe(200)
    expect((await make()).status).toBe(429)
    await openMember({ name: 'Grace Booker', invite: made[1].link })
    expect((await make()).status).toBe(200)
  })

  it("bring in at most INVITED_SIGNUP_DAILY_CAP new accounts a UTC day from one member's links, refused before any passkey is made", async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    env.INVITED_SIGNUP_DAILY_CAP = '2'
    const ada = await openMember()
    const network = await created(ada)
    const one = await openMember({ name: 'One', invite: await ada.invite(network) })
    await openMember({ name: 'Two', invite: await ada.invite(network) })

    const link = await ada.invite(network)
    const capped = await exports.default.fetch(
      `${origin}/auth/sign-up/options`,
      write({ name: 'Three', invite: tokenOf(link) })
    )
    expect([capped.status, await capped.json()]).toEqual([429, { error: invitedCapped(2) }])
    // Someone with an account still joins through it, and another owner's links still bring people in.
    const lin = await openMember({ name: 'Lin Editor' })
    expect(await (await post(lin, '/auth/join', { token: tokenOf(link) })).json()).toEqual({ id: network })
    await setRole(ada, network, one, 'owner')
    await openMember({ name: 'Kit Producer', invite: await one.invite(network) })
    // The next UTC day, Ada's links bring people in again.
    vi.setSystemTime(NOW + DAY)
    await openMember({ name: 'Three', invite: await ada.invite(network) })
  })

  it("admit only the new accounts one member's links have left that day, however many finish at once", async () => {
    env.INVITED_SIGNUP_DAILY_CAP = '1'
    const ada = await openMember()
    const network = await created(ada)
    const links = [await ada.invite(network), await ada.invite(network)]
    // Both have their passkeys made before either finishes signing up.
    const signUps = await Promise.all(
      links.map(async (link, i) => {
        const res = await exports.default.fetch(
          `${origin}/auth/sign-up/options`,
          write({ name: `Person ${i + 1}`, invite: tokenOf(link) })
        )
        const { challenge, options } = await res.json<{ challenge: string; options: never }>()
        return { challenge, response: await softwareAuthenticator().register(options), invite: tokenOf(link) }
      })
    )

    const answers = await Promise.all(signUps.map((s) => exports.default.fetch(`${origin}/auth/sign-up`, write(s))))
    expect(answers.map((a) => a.status).sort()).toEqual([200, 429])
    expect(await answers.find((a) => a.status === 429)!.json()).toEqual({ error: invitedCapped(1) })
  })

  it('refuse a sign-up with one that was used before any passkey is made, or while it was being made, and make no account', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const link = await ada.invite(network)
    const token = tokenOf(link)
    const used = 'This invite link was used already. Each one works once: ask an owner of the network for a new one.'

    // Lin starts signing up with the link, then Grace uses it first.
    const options = await exports.default.fetch(
      `${origin}/auth/sign-up/options`,
      write({ name: 'Lin Editor', invite: token })
    )
    expect(options.status).toBe(200)
    const { challenge, options: creation } = await options.json<{ challenge: string; options: never }>()
    const lin = softwareAuthenticator()
    const response = await lin.register(creation)
    await openMember({ name: 'Grace Booker', invite: link })

    const done = await exports.default.fetch(`${origin}/auth/sign-up`, write({ challenge, response, invite: token }))
    expect(done.status).toBe(410)
    expect(await done.json()).toEqual({ error: used })
    expect(done.headers.get('set-cookie')).toBeNull()
    // No account holds Lin's passkey.
    const signIn = await exports.default.fetch(`${origin}/auth/sign-in/options`, write({}))
    const started = await signIn.json<{ challenge: string; options: never }>()
    const answer = await exports.default.fetch(
      `${origin}/auth/sign-in`,
      write({ challenge: started.challenge, response: await lin.authenticate(started.options) })
    )
    expect(await answer.json()).toEqual({
      error: 'Crossfeed doesn’t know this passkey. Try another, or create an account.'
    })

    const refused = await exports.default.fetch(
      `${origin}/auth/sign-up/options`,
      write({ name: 'Lin Editor', invite: token })
    )
    expect(refused.status).toBe(410)
    expect(await refused.json()).toEqual({ error: used })
  })

  it('let an owner revoke one, which is then refused with why, everywhere it could be used', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const kept = await ada.invite(network)
    const made = await (
      await post(ada, `/app/${network}/settings/members/invites`)
    ).json<{ id: string; link: string }>()

    const res = await post(ada, `/app/${network}/settings/members/invites/${made.id}/revoke`)
    expect(res.status).toBe(200)
    const { invites } = await res.json<{ invites: Invite[] }>()
    expect(invites).toHaveLength(1)
    expect(invites[0].id).not.toBe(made.id)

    const revoked = { error: 'This invite link was revoked. Ask an owner of the network for a new one.' }
    const look = await exports.default.fetch(`${origin}/auth/invite`, write({ token: tokenOf(made.link) }))
    expect([look.status, await look.json()]).toEqual([410, revoked])
    const grace = await openMember({ name: 'Grace Booker' })
    const join = await post(grace, '/auth/join', { token: tokenOf(made.link) })
    expect([join.status, await join.json()]).toEqual([410, revoked])
    await expect(openMember({ name: 'Lin Editor', invite: made.link })).rejects.toThrow('Sign-up options returned 410')
    // A used invite can't be revoked; the other still works.
    expect(await (await post(grace, '/auth/join', { token: tokenOf(kept) })).json()).toEqual({ id: network })
  })

  it('expire after seven days, refused with why and no longer listed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    const ada = await openMember()
    const network = await created(ada)
    const early = await ada.invite(network)
    vi.setSystemTime(NOW + 7 * DAY - 1)
    await expect(openMember({ name: 'Grace Booker', invite: early })).resolves.toMatchObject({ network })

    const late = await ada.invite(network)
    vi.setSystemTime(NOW + 14 * DAY - 1)
    const expired =
      'This invite link has expired. Each one lasts seven days: ask an owner of the network for a new one.'
    const lin = await openMember({ name: 'Lin Editor' })
    const join = await post(lin, '/auth/join', { token: tokenOf(late) })
    expect([join.status, await join.json()]).toEqual([410, { error: expired }])
    const { invites } = await (
      await post(ada, `/app/${network}/settings/members/invites`)
    ).json<{ invites: Invite[] }>()
    expect(invites).toHaveLength(1)
  })

  it('are forgotten by the hourly cron once they expire, and the open ones kept', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    const ada = await openMember()
    const network = await created(ada)
    const old = tokenOf(await ada.invite(network))
    vi.setSystemTime(NOW + 7 * DAY)
    const fresh = tokenOf(await ada.invite(network))
    const look = async (token: string) =>
      (await exports.default.fetch(`${origin}/auth/invite`, write({ token }))).status
    expect([await look(old), await look(fresh)]).toEqual([410, 200])

    const ctx = createExecutionContext()
    await (worker as ExportedHandler<Env>).scheduled!(
      createScheduledController({ cron: '0 0-11,13-23 * * *' }),
      env,
      ctx
    )
    await waitOnExecutionContext(ctx)
    expect([await look(old), await look(fresh)]).toEqual([404, 200])
  })

  it("let a member neither create, revoke, nor see the network's invites", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(network) })
    const { invites } = await (
      await post(ada, `/app/${network}/settings/members/invites`)
    ).json<{ invites: Invite[] }>()

    const owners = { error: 'Only an owner can invite and manage members.' }
    for (const path of ['invites', `invites/${invites[0].id}/revoke`]) {
      const res = await post(grace, `/app/${network}/settings/members/${path}`)
      expect([path, res.status, await res.json()]).toEqual([path, 403, owners])
    }
    expect(await (await grace.fetch(`/app/${network}/settings`)).text()).not.toContain('data-invites')
    expect(await (await ada.fetch(`/app/${network}/settings`)).text()).toContain('data-invites')
    const still = await (await post(ada, `/app/${network}/settings/members/invites`)).json<{ invites: Invite[] }>()
    expect(still.invites).toHaveLength(2)
  })

  it('admit exactly one of several people using one at once, signed in or signing up', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const link = await ada.invite(network)
    const members = await Promise.all(
      ['Grace Booker', 'Lin Editor', 'Kit Producer'].map((name) => openMember({ name }))
    )
    // Each new person has their passkey made before any of them finishes signing up.
    const signUps = await Promise.all(
      ['Dee Host', 'Sam Seller'].map(async (name) => {
        const res = await exports.default.fetch(
          `${origin}/auth/sign-up/options`,
          write({ name, invite: tokenOf(link) })
        )
        const { challenge, options } = await res.json<{ challenge: string; options: never }>()
        return { challenge, response: await softwareAuthenticator().register(options) }
      })
    )

    const answers = await Promise.all([
      ...members.map((m) => post(m, '/auth/join', { token: tokenOf(link) })),
      ...signUps.map((s) => exports.default.fetch(`${origin}/auth/sign-up`, write({ ...s, invite: tokenOf(link) })))
    ])
    expect(answers.map((a) => a.status).sort()).toEqual([200, 410, 410, 410, 410])
    const access = await Promise.all(members.map(async (m) => (await m.fetch(`/app/${network}`)).status))
    expect(access.filter((s) => s === 200).length).toBe(answers.slice(0, 3).filter((a) => a.status === 200).length)
  })

  it('ask a signed-out person to sign in or create an account to join', async () => {
    const ada = await openMember()
    const token = tokenOf(await ada.invite(await created(ada)))
    const res = await exports.default.fetch(`${origin}/auth/join`, write({ token }))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Sign in, or create an account, to join.' })
  })

  it("answer 404 to anyone who isn't the network's member", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const grace = await openMember({ name: 'Grace Booker' })
    for (const id of [network, crypto.randomUUID()])
      expect((await post(grace, `/app/${id}/settings/members/invites`)).status).toBe(404)
  })
})

// The members the settings page gives its island, as main.tsx reads `data-members`.
async function membersOn(member: Member, network: string) {
  const html = await (await member.fetch(`/app/${network}/settings`)).text()
  const attribute = html.match(/data-members="([^"]*)"/)?.[1]
  if (!attribute) throw new Error('The settings page has no data-members')
  return JSON.parse(
    attribute
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
  ) as NetworkMember[]
}

// Changes a member's role, as an owner does in the members module.
const setRole = (by: Member, network: string, member: Member, role: unknown) =>
  post(by, `/app/${network}/settings/members/${member.id}/role`, { role })

describe('members', () => {
  it('are listed for every member with their role and when they joined, in the order they joined', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    const ada = await openMember()
    const network = await created(ada)
    vi.setSystemTime(NOW + DAY)
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(network) })

    const listed = [
      { id: ada.id, name: 'Ada Programmer', role: 'owner', joined: NOW },
      { id: grace.id, name: 'Grace Booker', role: 'member', joined: NOW + DAY }
    ]
    expect(await membersOn(grace, network)).toEqual(listed)
    expect(await membersOn(ada, network)).toEqual(listed)
    expect(await (await grace.fetch(`/app/${network}/settings`)).text()).toContain(`data-member-id="${grace.id}"`)
  })

  it('can be made an owner and back by an owner, but the last owner is never demoted', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(network) })
    const needed = { error: 'A network needs an owner. Make someone else an owner first.' }

    const last = await setRole(ada, network, ada, 'member')
    expect([last.status, await last.json()]).toEqual([409, needed])

    const promoted = await setRole(ada, network, grace, 'owner')
    expect(promoted.status).toBe(200)
    const { members } = await promoted.json<{ members: NetworkMember[] }>()
    expect(members.map((m) => [m.name, m.role])).toEqual([
      ['Ada Programmer', 'owner'],
      ['Grace Booker', 'owner']
    ])
    // Now an owner, Grace can invite, and demote Ada; then she's the last owner.
    expect((await post(grace, `/app/${network}/settings/members/invites`)).status).toBe(200)
    expect((await setRole(grace, network, ada, 'member')).status).toBe(200)
    const demoted = await setRole(grace, network, grace, 'member')
    expect([demoted.status, await demoted.json()]).toEqual([409, needed])
    expect((await membersOn(ada, network)).map((m) => m.role)).toEqual(['member', 'owner'])
  })

  it("refuse a role change from a member, to a role that isn't one, or for someone outside the network", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(network) })
    const lin = await openMember({ name: 'Lin Editor' })

    const byMember = await setRole(grace, network, grace, 'owner')
    expect([byMember.status, await byMember.json()]).toEqual([
      403,
      { error: 'Only an owner can invite and manage members.' }
    ])
    const bad = await setRole(ada, network, grace, 'admin')
    expect([bad.status, await bad.json()]).toEqual([400, { error: 'A member is an owner or a member.' }])
    expect((await setRole(ada, network, lin, 'owner')).status).toBe(404)
    expect((await setRole(lin, network, grace, 'member')).status).toBe(404)
    expect((await membersOn(ada, network)).map((m) => m.role)).toEqual(['owner', 'member'])
  })
})

// Opens the network's agent as one of its pages does.
const connect = async (member: Member, network: string) => {
  const agent = await member.connect(`/agents/network/${network}`)
  open.push(agent)
  return agent
}

// Whether the member can reach the network at all: its pages, its settings' writes, and its agent.
async function reach(member: Member, network: string) {
  const upgrade = await member.fetch(`/agents/network/${network}`, {
    headers: { Upgrade: 'websocket', Origin: origin }
  })
  return [
    (await member.fetch(`/app/${network}`)).status,
    (await member.fetch(`/app/${network}/settings`)).status,
    (await post(member, `/app/${network}/settings/members/leave`)).status,
    upgrade.status
  ]
}

const gone = { code: 4403, reason: "You're no longer a member of this network." }

describe('removing a member', () => {
  it('closes their open connections to the network at once, and answers their next request 404', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(network) })
    const pages = [await connect(grace, network), await connect(grace, network)]
    const owners = await connect(ada, network)

    const res = await post(ada, `/app/${network}/settings/members/${grace.id}/remove`)
    expect(res.status).toBe(200)
    expect((await res.json<{ members: NetworkMember[] }>()).members.map((m) => m.name)).toEqual(['Ada Programmer'])
    for (const page of pages) expect(await page.closed()).toEqual(gone)
    expect(await reach(grace, network)).toEqual([404, 404, 404, 404])
    // The owner's own page stays connected.
    await owners.call('dismissChecklist')
    expect(owners.state()!.checklistDismissed).toEqual([ada.id])
  })

  it("is an owner's alone, and never removes the last owner", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(network) })
    const lin = await openMember({ name: 'Lin Editor', invite: await ada.invite(network) })

    const byMember = await post(grace, `/app/${network}/settings/members/${lin.id}/remove`)
    expect([byMember.status, await byMember.json()]).toEqual([
      403,
      { error: 'Only an owner can invite and manage members.' }
    ])
    const last = await post(ada, `/app/${network}/settings/members/${ada.id}/remove`)
    expect([last.status, await last.json()]).toEqual([
      409,
      { error: 'A network needs an owner. Make someone else an owner first.' }
    ])

    // Another owner can remove Ada; then Grace is the last owner.
    await setRole(ada, network, grace, 'owner')
    expect((await post(grace, `/app/${network}/settings/members/${ada.id}/remove`)).status).toBe(200)
    expect((await membersOn(grace, network)).map((m) => [m.name, m.role])).toEqual([
      ['Grace Booker', 'owner'],
      ['Lin Editor', 'member']
    ])
    expect((await post(grace, `/app/${network}/settings/members/${ada.id}/remove`)).status).toBe(404)
  })
})

describe('leaving a network', () => {
  it("lets a member leave: their pages close, and the network isn't theirs to open any more", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(network) })
    const page = await connect(grace, network)

    const res = await post(grace, `/app/${network}/settings/members/leave`)
    expect([res.status, await res.json()]).toEqual([200, {}])
    expect(await page.closed()).toEqual(gone)
    expect(await (await grace.fetch('/app', { redirect: 'manual' })).headers.get('location')).toBe('/app/new')
    expect(await reach(grace, network)).toEqual([404, 404, 404, 404])
  })

  it("stops the last owner leaving until there's another owner", async () => {
    const ada = await openMember()
    const network = await created(ada)
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(network) })

    const last = await post(ada, `/app/${network}/settings/members/leave`)
    expect([last.status, await last.json()]).toEqual([
      409,
      { error: 'You’re this network’s last owner. Make someone else an owner before you leave.' }
    ])
    await setRole(ada, network, grace, 'owner')
    expect((await post(ada, `/app/${network}/settings/members/leave`)).status).toBe(200)
    expect(await membersOn(grace, network)).toMatchObject([{ name: 'Grace Booker', role: 'owner' }])
  })

  it('lets only one of two last owners leave at once', async () => {
    const ada = await openMember()
    const network = await created(ada)
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(network) })
    await setRole(ada, network, grace, 'owner')
    const answers = await Promise.all([ada, grace].map((m) => post(m, `/app/${network}/settings/members/leave`)))
    expect(answers.map((a) => a.status).sort()).toEqual([200, 409])
  })
})

describe('an owner who stops being one', () => {
  // Grace, made an owner beside Ada, makes an API key and an invite link, and so does Ada.
  async function twoOwners() {
    const ada = await openMember()
    const network = await created(ada)
    const grace = await openMember({ name: 'Grace Booker', invite: await ada.invite(network) })
    await setRole(ada, network, grace, 'owner')
    const keyOf = async (member: Member) =>
      (
        await (
          await post(member, `/app/${network}/settings/api-keys`, { name: member.name })
        ).json<{ secret: string }>()
      ).secret
    return {
      ada,
      grace,
      network,
      keys: { ada: await keyOf(ada), grace: await keyOf(grace) },
      links: { ada: await ada.invite(network), grace: await grace.invite(network) }
    }
  }

  // Whether an API key still reads the network, and an invite link still lets someone join.
  const keyReaches = async (secret: string, network: string) =>
    (
      await exports.default.fetch(`${origin}/api/v1/networks/${network}/roster`, {
        headers: { Authorization: `Bearer ${secret}` }
      })
    ).status
  const linkOpens = async (link: string) =>
    (await exports.default.fetch(`${origin}/auth/invite`, write({ token: tokenOf(link) }))).status

  const ways: [string, (o: Awaited<ReturnType<typeof twoOwners>>) => Promise<Response>][] = [
    ["they're removed", ({ ada, grace, network }) => post(ada, `/app/${network}/settings/members/${grace.id}/remove`)],
    ["they're made a member", ({ ada, grace, network }) => setRole(ada, network, grace, 'member')],
    ['they leave', ({ grace, network }) => post(grace, `/app/${network}/settings/members/leave`)],
    ['they delete their account', ({ grace }) => post(grace, '/app/account/delete')]
  ]
  for (const [way, stop] of ways)
    it(`loses the API keys and open invite links they made once ${way}, and the other owner keeps theirs`, async () => {
      const owners = await twoOwners()
      const { network, keys, links } = owners
      expect([await keyReaches(keys.grace, network), await linkOpens(links.grace)]).toEqual([200, 200])

      expect((await stop(owners)).status).toBe(200)
      expect([await keyReaches(keys.grace, network), await linkOpens(links.grace)]).toEqual([401, 410])
      await expect(openMember({ name: 'Lin Editor', invite: links.grace })).rejects.toThrow(
        'Sign-up options returned 410'
      )
      expect([await keyReaches(keys.ada, network), await linkOpens(links.ada)]).toEqual([200, 200])
    })
})
