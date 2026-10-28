/** @jsxImportSource hono/jsx */
// Accounts (ADR 0003): the sign-in page, and the passkey ceremonies, recovery, and sign-out behind
// it. Each ceremony is two requests: options, which keeps a challenge in the directory, and the
// browser's answer, which takes that challenge back once. The relying party is RP_ID and its pages
// APP_ORIGINS, never the request's own host.
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON
} from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import { Hono, type Context, type MiddlewareHandler } from 'hono'
import {
  accountsOn,
  appOrigins,
  endSession,
  formPost,
  fromAppForm,
  jsonBody,
  jsonLimit,
  nextPath,
  sameOrigin,
  sessionToken,
  setSession,
  signedIn,
  stepUpRefused
} from '../auth'
import {
  addPasskey,
  findInvite,
  findPasskey,
  GUEST_SESSION_MS,
  guestSignIn,
  invitedCapped,
  isGuestMember,
  isRecoveryCode,
  joinByInvite,
  keepAccount,
  memberPasskeys,
  proveSession,
  recover,
  saveChallenge,
  signIn,
  signOut,
  sessionProof,
  signUp,
  takeChallenge,
  type Challenge,
  type GuestLimit,
  type Member,
  type Passkey
} from '../directory'
import { authShell, Island, type AppVariables } from '../shell'
import { readName } from '../text'
import { visitorTag } from '../visitor'

export const auth = new Hono<{ Bindings: Env }>()

auth.use('/sign-in', accountsOn, authShell)
auth.use('/invite', accountsOn, authShell)
auth.use(
  '/auth/*',
  accountsOn,
  // Guest sign-in also takes a plain form's post from the app's own pages (fromAppForm).
  (c, next) => (c.req.path === '/auth/guest' && fromAppForm(c) ? next() : sameOrigin(c, next)),
  async (c, next) => {
    await next()
    // Answers carry a session cookie or a recovery code: no cache keeps them.
    c.header('Cache-Control', 'no-store')
  },
  jsonLimit
)

// A request that can't go on, in words for the sign-in or invite page.
const refuse = (c: Context, error: string, status: 400 | 401 | 404 | 409 | 410 | 429 = 400) => c.json({ error }, status)

// The requests that write a challenge, an account, or a session before anyone is signed in are
// limited per visitor per minute (AUTH_LIMITER in wrangler.jsonc), so a script can't spend the
// directory's writes, and so is a guest member's keeping their account, a sign-up too. The 429 for a
// request past it; null for one within it, or with no visitor address, as in local tests.
async function perMinuteRefused(c: Context<{ Bindings: Env }>) {
  const visitor = await visitorTag(c.req.raw, c.env.VISITOR_SALT)
  if (!visitor || (await c.env.AUTH_LIMITER.limit({ key: visitor })).success) return null
  c.header('Retry-After', '60')
  return refuse(
    c,
    'Too many sign-in requests from your address in the last minute. Wait a minute, then try again.',
    429
  )
}
const perMinute: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => (await perMinuteRefused(c)) ?? next()
for (const path of ['/auth/sign-up/options', '/auth/sign-up', '/auth/sign-in/options', '/auth/recover'])
  auth.use(path, perMinute)

// The challenge a ceremony's second request names, taken so it can't be used again, while it's
// still good; null once it's used, expired, or was never given.
async function takeStarted(c: Context<{ Bindings: Env }>, kind: string, id: unknown): Promise<Challenge | null> {
  const challenge = typeof id === 'string' ? await takeChallenge(c.env.DB, id, kind) : null
  return challenge && challenge.expires > Date.now() ? challenge : null
}
const STALE = 'This passkey request has expired or was already used. Try again.'
const UNVERIFIED = 'Crossfeed couldn’t verify this passkey. Try again.'
const SIGN_IN_TO_ADD = 'Sign in to add a passkey.'

// Verifies a browser's answer, or says why it can't be: the reason goes to the log, not the page.
async function verified<T>(ceremony: string, verify: () => Promise<T & { verified: boolean }>) {
  try {
    const result = await verify()
    if (result.verified) return result
    console.warn(JSON.stringify({ event: 'passkey_refused', ceremony, reason: 'not verified' }))
  } catch (err) {
    console.warn(JSON.stringify({ event: 'passkey_refused', ceremony, reason: String(err) }))
  }
  return null
}

// A new passkey's options for member `member`'s browser: their random ID is the user handle, so it says
// nothing about them, and `has` lists the passkeys they have already.
const registrationOptions = (env: Env, member: Pick<Member, 'id' | 'name'>, has: { id: string }[] = []) =>
  generateRegistrationOptions({
    rpName: 'Crossfeed',
    rpID: env.RP_ID,
    userName: member.name,
    userDisplayName: member.name,
    userID: new TextEncoder().encode(member.id),
    attestationType: 'none',
    excludeCredentials: has.map(({ id }) => ({ id })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' }
  })

// The passkey a browser made for a registration started with `started`, once it verifies; null when
// it doesn't.
async function registered(c: Context<{ Bindings: Env }>, ceremony: string, started: Challenge, response: unknown) {
  const registration = await verified(ceremony, () =>
    verifyRegistrationResponse({
      response: response as RegistrationResponseJSON,
      expectedChallenge: started.challenge,
      expectedOrigin: appOrigins(c.env),
      expectedRPID: c.env.RP_ID,
      requireUserVerification: true
    })
  )
  if (!registration) return null
  const { credential } = registration.registrationInfo!
  return {
    credentialId: credential.id,
    publicKey: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? null
  }
}

// Whether a write failed because the passkey's credential ID is on an account already.
const taken = (err: unknown) => String(err).includes('passkeys.credential_id')

// Why guest sign-in is refused once everyone's guest sign-ins for the minute or the UTC day are spent.
const whyGuestRefused = (env: Env, spent: GuestLimit) =>
  spent === 'minute'
    ? 'Guest sign-ins are busy for everyone right now. Try again in a minute.'
    : `Guests have signed in ${Number(env.GUEST_SIGNINS_PER_DAY) || 0} times today, the most Crossfeed takes in a UTC day; it resets at 00:00 UTC. Create an account to sign in now.`

// The sign-in page, a page of the React island: `next` is where it goes once the member is in, a
// path on this site, `runs` the guest network's model runs a day, which its guests share, and
// `guest-refused` why a public page's guest button was refused, which `?guest` names (/auth/guest). A
// member already signed in goes straight there.
auth.get('/sign-in', async (c) => {
  const next = nextPath(c, c.req.query('next'))
  if (await signedIn(c)) return c.redirect(next, 302)
  c.header('Cache-Control', 'no-store')
  const spent = c.req.query('guest')
  return c.render(
    <Island
      page="sign-in"
      data-next={next}
      data-runs={Number(c.env.RUN_VISITOR_DAILY_CAP) || 0}
      data-guest-refused={spent === 'minute' || spent === 'day' ? whyGuestRefused(c.env, spent) : undefined}
    />
  )
})

// The invite page, a page of the React island. The link's token is in its fragment, which the browser
// never sends: the page reads it and posts it, so it stays out of every path, query, log, and referrer.
// A signed-in member is named, to join as themselves.
auth.get('/invite', async (c: Context<{ Bindings: Env; Variables: AppVariables }>) => {
  const member = await signedIn(c)
  // The shell shows them their account menu.
  if (member) c.set('member', member)
  c.header('Cache-Control', 'no-store')
  return c.render(<Island page="invite" data-member-name={member?.name} />)
})

// Why an invite link can't be used, in words for the invite page.
const INVITE_REFUSED = {
  unknown:
    'Crossfeed doesn’t know this invite link: it may be incomplete, or it expired. Ask an owner of the network for a new one.',
  used: 'This invite link was used already. Each one works once: ask an owner of the network for a new one.',
  revoked: 'This invite link was revoked. Ask an owner of the network for a new one.',
  expired: 'This invite link has expired. Each one lasts seven days: ask an owner of the network for a new one.'
}

// The invite a posted token names, while it can be used; otherwise the refusal to answer with.
async function openInvite(c: Context<{ Bindings: Env }>, token: unknown) {
  const invite = typeof token === 'string' && token ? await findInvite(c.env.DB, token) : null
  if (!invite) return { refused: refuse(c, INVITE_REFUSED.unknown, 404) }
  if (invite.state !== 'open') return { refused: refuse(c, INVITE_REFUSED[invite.state], 410) }
  return { invite }
}

// The invite page's first request: which network the link invites to, and whether only guests own it.
auth.post('/auth/invite', async (c) => {
  const { invite, refused } = await openInvite(c, (await jsonBody(c)).token)
  return refused ?? c.json({ network: invite.network, guestOwned: invite.guestOwned })
})

// Joining as the signed-in member, in one step: the answer is the network to open.
auth.post('/auth/join', async (c) => {
  const member = await signedIn(c)
  if (!member) return refuse(c, 'Sign in, or create an account, to join.', 401)
  const { token } = await jsonBody(c)
  const id = typeof token === 'string' && token ? await joinByInvite(c.env.DB, token, member.id) : null
  if (id) return c.json({ id })
  // An invite that couldn't be used can never be used again, so it's refused here with why.
  return (await openInvite(c, token)).refused!
})

// The new accounts one member's invite links can bring in a UTC day (INVITED_SIGNUP_DAILY_CAP), or every
// guest's together (ADR 0006), and why an invite link refuses another past them, a `guest`'s or not.
const invitedCap = (env: Env) => Number(env.INVITED_SIGNUP_DAILY_CAP) || 0
const invitedRefused = (c: Context<{ Bindings: Env }>, guest: boolean) =>
  refuse(
    c,
    `${guest ? 'Guests’ invite links have' : 'The member who made this invite link has'} brought in ${invitedCap(c.env)} new accounts ${guest ? 'today, the most all guests’ links together can' : 'through their links today, the most one member can'} in a UTC day; it resets at 00:00 UTC. To join now, sign in with an account you have, then open the link again.`,
    429
  )

// Why this visitor can't create another account today, or null when they can; `count` counts this
// one. A request with no visitor address, as in local tests, isn't capped.
async function signupRefused(c: Context<{ Bindings: Env }>, count: boolean) {
  const visitor = await visitorTag(c.req.raw, c.env.VISITOR_SALT)
  return visitor && c.env.QlooGateway.getByName('global').admitSignup(visitor, count)
}

// Sign-up, first step: the name the member gave, and a new passkey's options for their browser. On
// the invite page it carries the link's token: an invite that can't be used, or whose maker's links
// have brought in their new accounts for the day, is refused before any passkey is made, and one that
// can skips the sign-up cap.
auth.post('/auth/sign-up/options', async (c) => {
  const { name, invite } = await jsonBody(c)
  const read = readName(name, 'Enter your name.')
  if ('error' in read) return refuse(c, read.error)
  const named = read.name
  if (invite !== undefined) {
    const { invite: open, refused } = await openInvite(c, invite)
    if (refused) return refused
    if (await invitedCapped(c.env.DB, invite as string, invitedCap(c.env))) return invitedRefused(c, open.guest)
  } else {
    const capped = await signupRefused(c, false)
    if (capped) return refuse(c, capped, 429)
  }
  const memberId = crypto.randomUUID()
  const options = await registrationOptions(c.env, { id: memberId, name: named })
  const challenge = await saveChallenge(c.env.DB, 'sign-up', options.challenge, { name: named, memberId })
  return c.json({ challenge, options })
})

// Sign-up, second step: the browser's new passkey. The member is written only once it verifies. With
// an invite's token, they join its network in the same step, uncounted by the sign-up cap, and no
// account is made once the invite can't be used, or its maker's links have brought in their new
// accounts for the day.
auth.post('/auth/sign-up', async (c) => {
  const { challenge, response, invite } = await jsonBody(c)
  if (invite !== undefined && (typeof invite !== 'string' || !invite)) return refuse(c, INVITE_REFUSED.unknown, 404)
  const started = await takeStarted(c, 'sign-up', challenge)
  if (!started) return refuse(c, STALE)
  const passkey = await registered(c, 'sign-up', started, response)
  if (!passkey) return refuse(c, UNVERIFIED)
  const capped = invite === undefined && (await signupRefused(c, true))
  if (capped) return refuse(c, capped, 429)
  try {
    const signedUp = await signUp(
      c.env.DB,
      { id: started.memberId!, name: started.name! },
      passkey,
      browserLabel(c.req.header('User-Agent') ?? ''),
      invite === undefined ? undefined : { token: invite as string, invitedCap: invitedCap(c.env) }
    )
    // An invite that couldn't be used can never be used again, so it's refused here with why; one
    // still open was refused by its maker's cap for the day, or guests'.
    if (!signedUp) {
      const again = await openInvite(c, invite)
      return again.refused ?? invitedRefused(c, again.invite.guest)
    }
    setSession(c, signedUp.token)
    const { recoveryCode, network } = signedUp
    return c.json(network ? { recoveryCode, network } : { recoveryCode })
  } catch (err) {
    if (!taken(err)) throw err
    return refuse(c, 'This passkey already belongs to a Crossfeed account. Sign in with it instead.', 409)
  }
})

// Adding a passkey, for a signed-in member on their account page: from another device or password
// manager, so losing one doesn't lock them out, or from a new device after signing in with their
// recovery code. The options name the member's own user handle and the passkeys they have, so a
// device that holds one of them adds no second. It needs a proof that it's them from the last five
// minutes, which signing in with the recovery code is, for the device's first passkey. A guest
// member's first passkey keeps their account (ADR 0006): it asks no step-up, since their session is the
// only proof they have, and it's a sign-up, limited and capped per visitor as one.
auth.post('/auth/passkeys/options', async (c) => {
  const member = await signedIn(c)
  if (!member) return refuse(c, SIGN_IN_TO_ADD, 401)
  // Asked here, so the page asks at once, and again as the new passkey arrives.
  const unproved = await stepUpRefused(c, member, () => keepingRefused(c))
  if (unproved) return unproved
  const has = await memberPasskeys(c.env.DB, member.id)
  const options = await registrationOptions(c.env, member, has)
  const challenge = await saveChallenge(c.env.DB, 'add-passkey', options.challenge, { memberId: member.id })
  return c.json({ challenge, options })
})

// Adding a passkey, second step: the browser's new passkey, added once it verifies, for the member
// whose request it answers, while their proof that it's them is still within five minutes. The answer
// is their passkeys. A guest member's keeps their account, counted as a sign-up once it verifies: the
// answer has their recovery code too, shown once, and their session's cookie a member's lifetime.
auth.post('/auth/passkeys', async (c) => {
  const member = await signedIn(c)
  if (!member) return refuse(c, SIGN_IN_TO_ADD, 401)
  const guest = isGuestMember(member)
  const unproved = await stepUpRefused(c, member, () => perMinuteRefused(c))
  if (unproved) return unproved
  const { challenge, response } = await jsonBody(c)
  const started = await takeStarted(c, 'add-passkey', challenge)
  if (!started || started.memberId !== member.id) return refuse(c, STALE)
  const passkey = await registered(c, 'add-passkey', started, response)
  if (!passkey) return refuse(c, UNVERIFIED)
  const capped = guest && (await signupRefused(c, true))
  if (capped) return refuse(c, capped, 429)
  const label = browserLabel(c.req.header('User-Agent') ?? '')
  try {
    if (guest) {
      const recoveryCode = await keepAccount(c.env.DB, member.id, passkey, label, sessionToken(c)!)
      if (!recoveryCode) return refuse(c, 'Your account was kept already, with another passkey. Reload to see it.', 409)
      setSession(c, sessionToken(c)!)
      return c.json({ passkeys: await memberPasskeys(c.env.DB, member.id), recoveryCode })
    }
    await addPasskey(c.env.DB, member.id, passkey, label)
  } catch (err) {
    if (!taken(err)) throw err
    return refuse(c, 'This passkey already belongs to a Crossfeed account. Add one from another device.', 409)
  }
  return c.json({ passkeys: await memberPasskeys(c.env.DB, member.id) })
})

// Why a guest member can't start keeping their account, as a sign-up's first step is refused: past their
// address's sign-in requests a minute, or its accounts a day. Null when they can.
async function keepingRefused(c: Context<{ Bindings: Env }>) {
  const limited = await perMinuteRefused(c)
  if (limited) return limited
  const capped = await signupRefused(c, false)
  return capped ? refuse(c, capped, 429) : null
}

// Sign-in, first step: options for any passkey the browser holds for Crossfeed, so the page asks
// for nothing else.
auth.post('/auth/sign-in/options', async (c) => {
  const options = await generateAuthenticationOptions({ rpID: c.env.RP_ID, userVerification: 'required' })
  const challenge = await saveChallenge(c.env.DB, 'sign-in', options.challenge)
  return c.json({ challenge, options })
})

// Sign-in, second step: the browser's signature with one of a member's passkeys. A signature
// counter of 0, as synced passkeys send, is accepted.
auth.post('/auth/sign-in', async (c) => {
  const { challenge, response } = await jsonBody(c)
  const started = await takeStarted(c, 'sign-in', challenge)
  if (!started) return refuse(c, STALE)
  const answer = response as AuthenticationResponseJSON
  const passkey = typeof answer?.id === 'string' ? await findPasskey(c.env.DB, answer.id) : null
  const handle = answer?.response?.userHandle
  if (!passkey || (handle && handle !== isoBase64URL.fromUTF8String(passkey.memberId)))
    return refuse(c, 'Crossfeed doesn’t know this passkey. Try another, or create an account.')
  const authentication = await asserted(c, 'sign-in', started, answer, passkey)
  if (!authentication) return refuse(c, UNVERIFIED)
  setSession(c, await signIn(c.env.DB, passkey, authentication.authenticationInfo.newCounter))
  return c.json({})
})

// A browser's signature with `passkey` for the ceremony started with `started`, user-verified, once it
// verifies; null when it doesn't.
const asserted = (
  c: Context<{ Bindings: Env }>,
  ceremony: string,
  started: Challenge,
  answer: AuthenticationResponseJSON,
  passkey: Passkey
) =>
  verified(ceremony, () =>
    verifyAuthenticationResponse({
      response: answer,
      expectedChallenge: started.challenge,
      expectedOrigin: appOrigins(c.env),
      expectedRPID: c.env.RP_ID,
      credential: {
        id: passkey.credentialId,
        publicKey: isoBase64URL.toBuffer(passkey.publicKey),
        counter: passkey.counter,
        transports: (passkey.transports ?? undefined) as never
      },
      requireUserVerification: true
    })
  )

// Step-up, for a signed-in member whose change was refused until they confirm it's them: the browser's
// answer to the refusal's passkey ceremony, with one of their own passkeys, or, in a browser signed in
// with the recovery code, that code, which is only checked, so it still signs them in once. Either
// proves the session for five minutes.
auth.post('/auth/verify', async (c) => {
  const member = await signedIn(c)
  const token = sessionToken(c)
  if (!member || !token) return refuse(c, 'Sign in first.', 401)
  const { challenge, response, code } = await jsonBody(c)
  if (code !== undefined) {
    if (!(await sessionProof(c.env.DB, token))?.recovered)
      return refuse(c, 'Confirm it’s you with your passkey: a recovery code confirms only a browser signed in with it.')
    if (typeof code !== 'string' || !(await isRecoveryCode(c.env.DB, member.id, code)))
      return refuse(c, 'That isn’t your recovery code. Check it, or the one Crossfeed showed you last, and try again.')
    await proveSession(c.env.DB, token)
    return c.json({})
  }
  const started = await takeStarted(c, 'step-up', challenge)
  if (!started || started.memberId !== member.id) return refuse(c, STALE)
  const answer = response as AuthenticationResponseJSON
  const passkey = typeof answer?.id === 'string' ? await findPasskey(c.env.DB, answer.id) : null
  if (!passkey || passkey.memberId !== member.id)
    return refuse(c, 'That passkey isn’t one of yours. Confirm with a passkey of your account.')
  const authentication = await asserted(c, 'step-up', started, answer, passkey)
  if (!authentication) return refuse(c, UNVERIFIED)
  await proveSession(c.env.DB, token, {
    credentialId: passkey.credentialId,
    counter: authentication.authenticationInfo.newCounter
  })
  return c.json({})
})

// Recovery, for a member who lost every passkey: their recovery code signs them in once, and they
// get a new one to keep.
auth.post('/auth/recover', async (c) => {
  const { code } = await jsonBody(c)
  if (typeof code !== 'string' || !code.trim()) return refuse(c, 'Enter your recovery code.')
  const recovered = await recover(c.env.DB, code)
  if (!recovered)
    return refuse(c, 'Crossfeed doesn’t know this recovery code, or it was used already. Check it and try again.')
  setSession(c, recovered.token)
  return c.json({ recoveryCode: recovered.recoveryCode })
})

// Signing in as a guest (ADR 0006), in one click with nothing to give: a guest member of one's own, an
// owner of the guest network, signed in for a day. A browser that holds a live session, a member's or a
// guest's, isn't signed in again, so no button signs anyone out. The answer is where to go next, `?next`
// under the same rules as a passkey sign-in's: to the sign-in page's script, as JSON, and to a public
// page's plain form, which works with no script (ADR 0007), as a 303 redirect there. It isn't limited
// per visitor: everyone's guest sign-ins together are, GUEST_SIGNINS_PER_MINUTE a minute and
// GUEST_SIGNINS_PER_DAY a UTC day.
auth.post('/auth/guest', async (c) => {
  const next = nextPath(c, c.req.query('next'))
  const form = formPost(c)
  const onward = () => (form ? c.redirect(next, 303) : c.json({ next }))
  if (await signedIn(c)) return onward()
  const signedInAsGuest = await guestSignIn(c.env.DB, {
    perMinute: Number(c.env.GUEST_SIGNINS_PER_MINUTE) || 0,
    perDay: Number(c.env.GUEST_SIGNINS_PER_DAY) || 0
  })
  if ('spent' in signedInAsGuest) {
    const { spent } = signedInAsGuest
    // A form goes back to the sign-in page's guest panel, which says why.
    if (form) return c.redirect(`/sign-in?${new URLSearchParams({ guest: spent, next })}#guest`, 303)
    const tomorrow = new Date().setUTCHours(24, 0, 0, 0)
    c.header('Retry-After', spent === 'minute' ? '60' : String(Math.ceil((tomorrow - Date.now()) / 1000)))
    return refuse(c, whyGuestRefused(c.env, spent), 429)
  }
  setSession(c, signedInAsGuest.token, GUEST_SESSION_MS)
  console.log(JSON.stringify({ event: 'guest_sign_in' }))
  return onward()
})

// Sign-out: the session ends here and in the browser.
auth.post('/auth/sign-out', async (c) => {
  const token = endSession(c)
  if (token) await signOut(c.env.DB, token)
  return c.json({})
})

// The browser and system a passkey was added from, as its label, such as "Chrome on macOS".
function browserLabel(ua: string) {
  const browser = /Edg(e|iOS|A)?\//.test(ua)
    ? 'Edge'
    : /Firefox\/|FxiOS\//.test(ua)
      ? 'Firefox'
      : /Chrome\/|CriOS\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : null
  // iOS says "like Mac OS X", Android and ChromeOS say Linux: the narrower names come first.
  const system = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /CrOS/.test(ua)
        ? 'ChromeOS'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Linux/.test(ua)
              ? 'Linux'
              : null
  return browser && system ? `${browser} on ${system}` : (browser ?? system ?? 'Passkey')
}
