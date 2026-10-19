/** @jsxImportSource hono/jsx */
// The app: a signed-in member's pages under /app. A signed-out request is sent to sign in and back.
import { Hono } from 'hono'
import { accountsOn, sameOrigin, signedIn } from '../auth'
import type { Member } from '../directory'
import { appShell } from '../shell'

export const appPages = new Hono<{ Bindings: Env; Variables: { member: Member } }>()

appPages.use('/app/*', accountsOn, sameOrigin, async (c, next) => {
  const member = await signedIn(c)
  if (!member) {
    const { pathname, search } = new URL(c.req.url)
    // `next` keeps its slashes, so the address reads as the page it leads back to.
    return c.redirect(`/sign-in?next=${encodeURIComponent(pathname + search).replace(/%2F/g, '/')}`, 302)
  }
  c.set('member', member)
  await next()
  c.header('Cache-Control', 'no-store')
})
appPages.use('/app/*', appShell)

// Until networks exist, /app is the signed-in member and a way to sign out.
appPages.get('/app', (c) => c.render(<div id="root" data-page="member" data-member-name={c.var.member.name} />))
// The demo's "Create your network" leads here; until there are networks to create, it's /app.
appPages.get('/app/new', (c) => c.redirect('/app', 302))
