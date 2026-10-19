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
import { Hono, type Context } from 'hono'
import { accountsOn, appOrigins, endSession, jsonBody, nextPath, sameOrigin, setSession, signedIn } from '../auth'
import {
  findInvite,
  findPasskey,
  joinByInvite,
  recover,
  saveChallenge,
  signIn,
  signOut,
  signUp,
  takeChallenge,
  type Challenge
} from '../directory'
import { appShell } from '../shell'
import { readName } from '../text'
import { visitorTag } from '../visitor'

export const auth = new Hono<{ Bindings: Env }>()

auth.use('/sign-in', accountsOn, appShell)
auth.use('/invite', accountsOn, appShell)
auth.use('/auth/*', accountsOn, sameOrigin, async (c, next) => {
  await next()
  // Answers carry a session cookie or a recovery code: no cache keeps them.
  c.header('Cache-Control', 'no-store')
})

// A ceremony that can't go on, in words for the sign-in page.
const refuse = (c: Context, error: string, status: 400 | 401 | 404 | 409 | 410 | 429 = 400) => c.json({ error }, status)

// The challenge a ceremony's second request names, taken so it can't be used again, while it's
// still good; null once it's used, expired, or was never given.
async function takeStarted(c: Context<{ Bindings: Env }>, kind: string, id: unknown): Promise<Challenge | null> {
  const challenge = typeof id === 'string' ? await takeChallenge(c.env.DB, id, kind) : null
  return challenge && challenge.expires > Date.now() ? challenge : null
}
const STALE = 'This passkey request has expired or was already used. Try again.'

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

// The sign-in page, a page of the React island: `next` is where it goes once the member is in, a
// path on this site. A member already signed in goes straight there.
auth.get('/sign-in', async (c) => {
  const next = nextPath(c, c.req.query('next'))
  if (await signedIn(c)) return c.redirect(next, 302)
  c.header('Cache-Control', 'no-store')
  return c.render(<div id="root" data-page="sign-in" data-next={next} />)
})

// The invite page, a page of the React island. The link's token is in its fragment, which the browser
// never sends: the page reads it and posts it, so it stays out of every path, query, log, and referrer.
// A signed-in member is named, to join as themselves.
auth.get('/invite', async (c) => {
  const member = await signedIn(c)
  c.header('Cache-Control', 'no-store')
  return c.render(<div id="root" data-page="invite" data-member-name={member?.name} />)
})

// Why an invite link can't be used, in words for the invite page.
const INVITE_REFUSED = {
  unknown:
    "Crossfeed doesn't know this invite link: it may be incomplete, or it expired. Ask an owner of the network for a new one.",
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

// The invite page's first request: which network the link invites to.
auth.post('/auth/invite', async (c) => {
  const { invite, refused } = await openInvite(c, (await jsonBody(c)).token)
  return refused ?? c.json({ network: invite.network })
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

// Why this visitor can't create another account today, or null when they can; `count` counts this
// one. A request with no visitor address, as in local tests, isn't capped.
async function signupRefused(c: Context<{ Bindings: Env }>, count: boolean) {
  const visitor = await visitorTag(c.req.raw, c.env.VISITOR_SALT)
  return visitor && c.env.QlooGateway.getByName('global').admitSignup(visitor, count)
}

// Sign-up, first step: the name the member gave, and a new passkey's options for their browser. On
// the invite page it carries the link's token: an invite that can't be used is refused before any
// passkey is made, and one that can skips the sign-up cap.
auth.post('/auth/sign-up/options', async (c) => {
  const { name, invite } = await jsonBody(c)
  const read = readName(name, 'Enter your name.')
  if ('error' in read) return refuse(c, read.error)
  const named = read.name
  if (invite !== undefined) {
    const { refused } = await openInvite(c, invite)
    if (refused) return refused
  } else {
    const capped = await signupRefused(c, false)
    if (capped) return refuse(c, capped, 429)
  }
  const memberId = crypto.randomUUID()
  const options = await generateRegistrationOptions({
    rpName: 'Crossfeed',
    rpID: c.env.RP_ID,
    userName: named,
    userDisplayName: named,
    // The user handle is the member's random ID, so it says nothing about them.
    userID: new TextEncoder().encode(memberId),
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' }
  })
  const challenge = await saveChallenge(c.env.DB, 'sign-up', options.challenge, { name: named, memberId })
  return c.json({ challenge, options })
})

// Sign-up, second step: the browser's new passkey. The member is written only once it verifies. With
// an invite's token, they join its network in the same step, uncounted by the sign-up cap, and no
// account is made once the invite can't be used.
auth.post('/auth/sign-up', async (c) => {
  const { challenge, response, invite } = await jsonBody(c)
  if (invite !== undefined && (typeof invite !== 'string' || !invite)) return refuse(c, INVITE_REFUSED.unknown, 404)
  const started = await takeStarted(c, 'sign-up', challenge)
  if (!started) return refuse(c, STALE)
  const registration = await verified('sign-up', () =>
    verifyRegistrationResponse({
      response: response as RegistrationResponseJSON,
      expectedChallenge: started.challenge,
      expectedOrigin: appOrigins(c.env),
      expectedRPID: c.env.RP_ID,
      requireUserVerification: true
    })
  )
  if (!registration) return refuse(c, "Crossfeed couldn't verify this passkey. Try again.")
  const capped = invite === undefined && (await signupRefused(c, true))
  if (capped) return refuse(c, capped, 429)
  const { credential } = registration.registrationInfo!
  try {
    const signedUp = await signUp(
      c.env.DB,
      { id: started.memberId!, name: started.name! },
      {
        credentialId: credential.id,
        publicKey: isoBase64URL.fromBuffer(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ?? null
      },
      browserLabel(c.req.header('User-Agent') ?? ''),
      invite as string | undefined
    )
    // An invite that couldn't be used can never be used again, so it's refused here with why.
    if (!signedUp) return (await openInvite(c, invite)).refused!
    setSession(c, signedUp.token)
    const { recoveryCode, network } = signedUp
    return c.json(network ? { recoveryCode, network } : { recoveryCode })
  } catch (err) {
    if (!String(err).includes('passkeys.credential_id')) throw err
    return refuse(c, 'This passkey already belongs to a Crossfeed account. Sign in with it instead.', 409)
  }
})

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
    return refuse(c, "Crossfeed doesn't know this passkey. Try another, or create an account.")
  const authentication = await verified('sign-in', () =>
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
  if (!authentication) return refuse(c, "Crossfeed couldn't verify this passkey. Try again.")
  setSession(c, await signIn(c.env.DB, passkey, authentication.authenticationInfo.newCounter))
  return c.json({})
})

// Recovery, for a member who lost every passkey: their recovery code signs them in once, and they
// get a new one to keep.
auth.post('/auth/recover', async (c) => {
  const { code } = await jsonBody(c)
  if (typeof code !== 'string' || !code.trim()) return refuse(c, 'Enter your recovery code.')
  const recovered = await recover(c.env.DB, code)
  if (!recovered)
    return refuse(c, "Crossfeed doesn't know this recovery code, or it was used already. Check it and try again.")
  setSession(c, recovered.token)
  return c.json({ recoveryCode: recovered.recoveryCode })
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
