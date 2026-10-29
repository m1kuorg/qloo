# Platform research

Primary-source facts for adding accounts, workspaces, a public REST API with API keys, a TypeScript SDK, and a remote MCP server to Crossfeed. Crossfeed runs on Cloudflare Workers with Hono, `agents` 0.28.1, and SQLite Durable Objects. Checked on 2026-10-19. Package facts come from npm tarballs and registry metadata. Service facts come from vendor docs. Qloo terms come from the crawl in [`docs/sources/`](/docs/sources/).

Contents:

1.  [Summary](#summary)
1.  [Auth with Better Auth on Workers](#auth-with-better-auth-on-workers)
1.  [Email from Workers](#email-from-workers)
1.  [Remote MCP with the agents SDK](#remote-mcp-with-the-agents-sdk)
    1.  [Which server path to use](#which-server-path-to-use)
    1.  [Dependencies](#dependencies)
    1.  [Authenticating MCP with an API key](#authenticating-mcp-with-an-api-key)
    1.  [MCP gotchas](#mcp-gotchas)
1.  [Agent Skills and Claude Code plugins](#agent-skills-and-claude-code-plugins)
1.  [Qloo key terms](#qloo-key-terms)
1.  [Open questions](#open-questions)

## Summary

- **Better Auth 1.7.11 runs on Workers with D1 natively.** It has organization, API key, passkey, magic link, and Google/GitHub support. API keys and passkeys are separate `@better-auth/*` packages. Password hashing is the CPU risk on Workers.
- **Cloudflare Email Service can send to any address, with conditions.** It needs Workers Paid, a domain on Cloudflare DNS, and acceptance that Email Sending is still in public beta. Crossfeed runs on `crossfeed.m1kuorg.workers.dev`, so it would first need a domain.
- **Use `createMcpHandler` for MCP.** In `agents` 0.28.1, `createMcpHandler` plus `@modelcontextprotocol/server` 2.3.1 is the current MCP path, and `McpAgent` is deprecated. API-key auth is a gate in front of `handler.fetch(request, { authInfo })`.
- **The Agent Skills spec lives at agentskills.io.** A Claude Code plugin ships `skills/` plus `.mcp.json`, with an `http` server and an `Authorization: Bearer ${VAR}` header.
- **The hackathon Qloo key cannot back a production or third-party API.** The key is personal and expires after judging, and Qloo's terms forbid redistributing or charging for access to the Services.

## Auth with Better Auth on Workers

- **Version.** `better-auth` latest is 1.7.11, published 2026-10-19. Other channels are `beta` 1.8.0-beta.1 and `release-1.6` 1.6.33. `@better-auth/api-key` and `@better-auth/passkey` are also at 1.7.11 ([npm registry][ba-npm]).
- **D1 is native since v1.5.** Pass the binding as `database: env.DB` and Better Auth auto-detects it. It ships its own D1 Kysely dialect, so `kysely-d1` isn't needed. D1 has no interactive transactions, so Better Auth uses `batch()` instead ([v1.5 release post][ba-15]).
- **Migrations run in code.** The CLI can't reach D1, so migrations go through `getMigrations` from `better-auth/db/migration`, for example behind an admin endpoint. That works only with the built-in Kysely adapter. With Drizzle (`drizzle-orm/d1`), you use Drizzle's own migrations ([database docs][ba-db]).
- **Workers integration docs** cover a Workers `fetch` handler and Hono ([installation][ba-install]; [Hono integration][ba-hono]).

Plugins and import paths:

| Need                                              | Import                                                                                                                                  | Docs                                     |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Organizations, members, invitations, roles, teams | `organization` from `better-auth/plugins`; `organizationClient` from `better-auth/client/plugins`; teams via `teams: { enabled: true }` | [organization][ba-org]                   |
| API keys                                          | `apiKey` from `@better-auth/api-key` (separate package since v1.5); client from `@better-auth/api-key/client`                           | [api-key][ba-apikey]                     |
| Passkeys                                          | `passkey` from `@better-auth/passkey`; client from `@better-auth/passkey/client`                                                        | [passkey][ba-passkey]                    |
| Magic link                                        | `magicLink` from `better-auth/plugins`                                                                                                  | [magic-link][ba-magic]                   |
| Email OTP                                         | `emailOTP` from `better-auth/plugins`                                                                                                   | [email-otp][ba-otp]                      |
| Google, GitHub                                    | built in, configured under `socialProviders: { google, github }`; set `baseURL` or Google returns `redirect_uri_mismatch`               | [Google][ba-google]; [GitHub][ba-github] |

The API key plugin covers most of what a public API needs ([api-key][ba-apikey]; [advanced][ba-apikey-adv]; [reference][ba-apikey-ref]):

- **Rate limits per key**, with `rateLimitEnabled`, `rateLimitTimeWindow`, and `rateLimitMax`.
- **Key prefixes**, with `defaultPrefix` or a per-key `prefix`. Separate configs via `configId` allow `pk_` and `sk_` keys.
- **Metadata**, with `enableMetadata`.
- **Permissions**, as `Record<string, string[]>`, checked on verify.
- **Organization-owned keys** since v1.5, with `references: "organization"` and an `organizationId`. They use the organization plugin's roles, and they can't stand in for a user session.
- **Verification** with `auth.api.verifyApiKey({ body: { key, permissions } })`. The default header is `x-api-key`, which `apiKeyHeaders` or `customAPIKeyGetter` can change.

Workers gotchas:

- **`nodejs_compat` (or at least `nodejs_als`) is required** for `AsyncLocalStorage` ([installation][ba-install]). Crossfeed already sets `nodejs_compat` ([`apps/wrangler.jsonc`](/apps/wrangler.jsonc)).
- **Password hashing is scrypt, and it is slow on Workers.** The parameters are N=16384, r=16 ([email-password docs][ba-password]).
  - Issue #8860 reports sign-up exceeding the Workers CPU limit with the pure-JS `@noble/hashes` scrypt. The workaround in that thread is a custom `password.hash`/`verify` that uses `node:crypto` ([#8860][ba-8860]).
  - PR #8685 moved hashing to `@better-auth/utils/password`, which has a native `node:crypto` build ([#8685][ba-8685]).
  - In `@better-auth/utils@0.5.0`, the version `better-auth` 1.7.11 pins, the `./password` export map lists `"import"` (pure JS) before `"workerd"` (native). Conditions match in key order, so a Workers bundle likely still gets pure JS. That is inferred from the [package's export map][ba-utils], not observed in a bundle.
- **CPU limits** are 10 ms per request on Workers Free, and 30 s by default (up to 5 min) on Paid ([Workers limits][cf-limits]). Even native scrypt at these parameters likely exceeds 10 ms. That is unverified.
- **Passwordless avoids the risk.** Magic link, OAuth, and passkeys need no scrypt at all.

[ba-npm]: https://registry.npmjs.org/better-auth
[ba-15]: https://github.com/better-auth/better-auth/blob/main/docs/content/blogs/1-5.mdx
[ba-db]: https://better-auth.com/docs/concepts/database
[ba-install]: https://better-auth.com/docs/installation
[ba-hono]: https://better-auth.com/docs/integrations/hono
[ba-org]: https://better-auth.com/docs/plugins/organization
[ba-apikey]: https://better-auth.com/docs/plugins/api-key
[ba-apikey-adv]: https://better-auth.com/docs/plugins/api-key/advanced
[ba-apikey-ref]: https://better-auth.com/docs/plugins/api-key/reference
[ba-passkey]: https://better-auth.com/docs/plugins/passkey
[ba-magic]: https://better-auth.com/docs/plugins/magic-link
[ba-otp]: https://better-auth.com/docs/plugins/email-otp
[ba-google]: https://better-auth.com/docs/authentication/google
[ba-github]: https://better-auth.com/docs/authentication/github
[ba-password]: https://better-auth.com/docs/authentication/email-password
[ba-8860]: https://github.com/better-auth/better-auth/issues/8860
[ba-8685]: https://github.com/better-auth/better-auth/pull/8685
[ba-utils]: https://unpkg.com/@better-auth/utils@0.5.0/package.json
[cf-limits]: https://developers.cloudflare.com/workers/platform/limits/

## Email from Workers

- **Status: public beta.** Email Service was announced as a private beta on 2025-09-25 ([blog][cf-email-blog]). Email Sending went to public beta on 2026-04-16, and the changelog has no GA entry yet ([changelog][cf-email-changelog]). The docs index still labels Email Sending "Beta" ([Email Service][cf-email]).
- **Any recipient, but only on Workers Paid with an onboarded domain.** On the Free plan you can send only to verified destination addresses ([pricing][cf-email-pricing]). After onboarding a sending domain, "you can send to any recipient immediately" ([limits][cf-email-limits]). The send-bindings page still says an unrestricted binding "can send to any verified destination address", which conflicts with the limits page and looks stale. Verify it in practice ([send bindings][cf-email-bindings]).
- **It needs Cloudflare DNS.** "You must be using Cloudflare DNS to use Email Service" ([get started][cf-email-start]). Onboarding adds MX and SPF/DKIM records on `cf-bounce.<domain>` and DMARC on `_dmarc.<domain>` ([domains][cf-email-domains]). Crossfeed is served from `crossfeed.m1kuorg.workers.dev` ([`apps/README.md`](/apps/README.md)), so it would need a domain on Cloudflare first.
- **Limits and pricing.** Paid includes 3,000 emails a month, then $0.35 per 1,000 ([pricing][cf-email-pricing]). New accounts start on a conservative daily quota, with up to 50 recipients and 5 MiB per message ([limits][cf-email-limits]). It is transactional only; marketing mail isn't allowed ([FAQ][cf-email-faq]).
- **API shape.** The binding is `"send_email": [{ "name": "EMAIL" }]`, and you send with `await env.EMAIL.send({ to, from, subject, html?, text?, cc?, bcc?, replyTo?, attachments?, headers? })`, which returns `{ messageId }` ([Workers API][cf-email-api]).
  - Failures throw with a `.code`, such as `E_SENDER_NOT_VERIFIED`, `E_RECIPIENT_NOT_ALLOWED`, or `E_DAILY_LIMIT_EXCEEDED`.
  - The legacy `EmailMessage` from `cloudflare:email` still works.
  - Bindings can be restricted with `allowed_destination_addresses` and `allowed_sender_addresses` ([send bindings][cf-email-bindings]).
- **`agents` 0.28.1 already wraps this binding.** `this.sendEmail({ binding: this.env.EMAIL, to, from, subject, text })` exists, and the docs list "a domain onboarded to Cloudflare Email Service" as a prerequisite ([agents docs/email.md][agents-email]).
- **No key-free alternatives.** The binding needs no third-party key. MailChannels' free Workers integration ([2022 announcement][mailchannels-2022]) is reported to have ended in 2024, but we could not confirm that: MailChannels' notice page sat behind a bot challenge. We found no other first-party option that needs no key.

[cf-email-blog]: https://blog.cloudflare.com/email-service/
[cf-email-changelog]: https://developers.cloudflare.com/email-service/platform/changelog/
[cf-email]: https://developers.cloudflare.com/email-service/
[cf-email-pricing]: https://developers.cloudflare.com/email-service/platform/pricing/
[cf-email-limits]: https://developers.cloudflare.com/email-service/platform/limits/
[cf-email-bindings]: https://developers.cloudflare.com/email-service/configuration/send-bindings/
[cf-email-start]: https://developers.cloudflare.com/email-service/get-started/send-emails/
[cf-email-domains]: https://developers.cloudflare.com/email-service/configuration/domains/
[cf-email-faq]: https://developers.cloudflare.com/email-service/reference/faq/
[cf-email-api]: https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
[agents-email]: https://unpkg.com/agents@0.28.1/docs/email.md
[mailchannels-2022]: https://blog.cloudflare.com/sending-email-from-workers-with-mailchannels/

## Remote MCP with the agents SDK

`apps/package.json` pins `agents` 0.28.1, but the main checkout's `apps/node_modules` has no `agents` directory, so the install there is incomplete. The findings below come from the published `agents@0.28.1` and `@modelcontextprotocol/server@2.3.1` tarballs. Their sha512 hashes match the integrity entries in [`apps/bun.lock`][bun-lock].

### Which server path to use

- **`createMcpHandler()` from `agents/mcp/server` is the current path.** It is a stateless per-request handler with no Durable Object. It serves draft MCP `2026-07-28` and, by default, stateless 2025-era Streamable HTTP clients ([agents docs/mcp-servers.md][agents-mcp-servers]).
- **`McpAgent` is deprecated and feature-frozen.** It stays only for existing SDK v1 stateful deployments, with one Durable Object per session ([agents docs/mcp-servers.md][agents-mcp-servers]; [agents docs/mcp-transports.md][agents-mcp-transports]).
- **Transport is Streamable HTTP.** The stateless handler does not expose standalone legacy SSE. Only `McpAgent.serve(..., { transport: "auto" })` and `serveSSE` serve SSE ([agents docs/mcp-transports.md][agents-mcp-transports]).
- **The stateless lane can't push.** The default `legacy: "stateless"` lane has no session return path. Sampling, elicitation, and roots fail immediately ([agents docs/mcp-servers.md][agents-mcp-servers]). Plain tools, resources, and prompts work.
- **Handler options** are `route` (default `/mcp`), `corsOptions`, `allowedHostnames`, `allowedOriginHostnames`, `authContext`, `legacy`, and `responseMode`. The handler rejects the SDK's `bus` option and the SDK v1-only options ([`handler-stateless` source][agents-handler-src]).

### Dependencies

- **`@modelcontextprotocol/sdk` is not a direct dependency.** `agents` 0.28.1 declares `@modelcontextprotocol/server` 2.3.1, `@modelcontextprotocol/client` 2.3.1, and `@modelcontextprotocol/sdk` 1.32.1 as required (non-optional) peer dependencies, pinned to exact versions ([agents package.json][agents-pkg]; [`apps/bun.lock`][bun-lock]). Bun already resolved all three as peers in the lock.
- **For a new server, add `@modelcontextprotocol/server@2.3.1` and `zod` explicitly.** The docs install them with `pnpm add agents @modelcontextprotocol/server@2.3.1 zod` ([agents docs/mcp-servers.md][agents-mcp-servers]). The SDK v1 import path `@modelcontextprotocol/sdk/server/mcp.js` belongs only to the legacy `McpAgent` and `createLegacyMcpHandler` path.
- **`@cloudflare/workers-oauth-provider` is not installed** (no entry in [`apps/bun.lock`][bun-lock]). It is only needed for OAuth 2.1 with dynamic client registration ([agents docs/securing-mcp-servers.md][agents-securing]).
- **`nodejs_compat` is required, and we already set it.** The handler imports `AsyncLocalStorage` from `node:async_hooks` ([`handler-stateless` source][agents-handler-src]). [`apps/wrangler.jsonc`][wrangler] already sets `compatibility_flags: ["nodejs_compat"]`.

### Authenticating MCP with an API key

The handler does no token verification itself: `McpHandlerRequestOptions.authInfo` is "strictly pass-through" ([`@modelcontextprotocol/server` types][mcp-server-types]). Auth reaches tools in three ways, all in the [`handler-stateless` source][agents-handler-src]:

1.  **`handler.fetch(request, { authInfo })`.** Tools read it at `context.http?.authInfo`. This is the per-request path.
2.  **`ctx.props` on the Worker execution context.** When non-empty, it becomes `getMcpAuthContext().props`, which the handler stores in `AsyncLocalStorage`.
3.  **`authContext: { props }` at handler creation.** This is fixed per handler, so it doesn't suit per-key auth on a handler shared across requests.

The docs say to create the handler once at module scope and reuse it ([agents docs/mcp-servers.md][agents-mcp-servers]). `@modelcontextprotocol/server` also exports `requireBearerAuth({ verifier })`, a fetch-style gate for Workers and Hono. It resolves to `AuthInfo` or a ready 401/403 `Response` with a `WWW-Authenticate` challenge ([`@modelcontextprotocol/server` types][mcp-server-types]). The minimal API-key setup, adapted from those sources:

```ts
import { McpServer, requireBearerAuth, type AuthInfo } from '@modelcontextprotocol/server'
import { createMcpHandler } from 'agents/mcp/server'

const mcp = createMcpHandler(() => {
  const server = new McpServer({ name: 'crossfeed', version: '1.0.0' })
  server.registerTool('run_pitch', { description: '...', inputSchema: {/* zod shape */} }, async (args, context) => {
    const workspaceId = context.http?.authInfo?.extra?.workspaceId // set by verifier
    // ...
  })
  return server
})

// In Hono: app.all("/mcp", (c) => ...)
const gate = requireBearerAuth({
  verifier: { verifyAccessToken: async (token): Promise<AuthInfo> => lookupApiKey(token) }
})
async function serveMcp(request: Request) {
  const auth = await gate(request)
  if (auth instanceof Response) return auth
  return mcp.fetch(request, { authInfo: auth })
}
```

### MCP gotchas

- **API keys without an expiry fail bearer auth.** "bearer-auth verification rejects tokens whose `AuthInfo.expiresAt` is unset" ([`@modelcontextprotocol/server` types][mcp-server-types]). For non-expiring keys, set a far-future `expiresAt`, or verify the key ourselves and call `mcp.fetch(request, { authInfo })` without `requireBearerAuth`.
- **Origin and Host checks.** The handler validates every present `Origin`. By default it allows only localhost-class origins and the endpoint's own `workers.dev` hostname. A custom domain needs `allowedHostnames` and `allowedOriginHostnames` set. Requests without an `Origin`, such as Claude Code or other non-browser clients, pass ([agents docs/mcp-servers.md][agents-mcp-servers]).
- **Never log or return `authInfo.token`** ([agents docs/securing-mcp-servers.md][agents-securing]).
- **Notifications are isolate-local.** `handler.notify.toolsChanged()` does not reach other isolates ([agents docs/mcp-servers.md][agents-mcp-servers]).
- **OAuth is optional.** The MCP spec uses OAuth 2.1, and `workers-oauth-provider` wraps the handler as `apiHandler` ([agents docs/securing-mcp-servers.md][agents-securing]). A static bearer API key works with clients that let the user set headers, but clients that only do the OAuth discovery flow won't connect.

[bun-lock]: /apps/bun.lock
[wrangler]: /apps/wrangler.jsonc
[agents-pkg]: https://www.npmjs.com/package/agents/v/0.28.1
[agents-mcp-servers]: https://unpkg.com/agents@0.28.1/docs/mcp-servers.md
[agents-mcp-transports]: https://unpkg.com/agents@0.28.1/docs/mcp-transports.md
[agents-securing]: https://unpkg.com/agents@0.28.1/docs/securing-mcp-servers.md
[agents-handler-src]: https://unpkg.com/agents@0.28.1/dist/handler-stateless-Bly_nSH3.js
[mcp-server-types]: https://unpkg.com/@modelcontextprotocol/server@2.3.1/dist/index.d.mts

## Agent Skills and Claude Code plugins

- **The spec.** A skill is a directory holding `SKILL.md`, which is YAML frontmatter plus Markdown. The optional subdirectories are `scripts/`, `references/`, and `assets/` ([Agent Skills specification][skills-spec]). The frontmatter fields are:
  - `name`: required, 1–64 characters of `a-z`, `0-9`, and `-`. It can't start or end with a hyphen or contain `--`, and it must match the directory name.
  - `description`: required, 1–1024 characters.
  - Optional: `license`, `compatibility` (≤500 characters), `metadata` (a string map), and `allowed-tools` (experimental).
- **Claude Code extends the spec.** It adds `disable-model-invocation`, `user-invocable`, `context`, `model`, and `when_to_use`. Outside Claude Code, use only the spec fields. Claude Code's skill listing cuts `description` plus `when_to_use` at 1,536 characters ([Claude Code skills][cc-skills]).
- **The plugin manifest** is `.claude-plugin/plugin.json`. It is optional, and `name` (kebab-case) is its only required field. Everything else in the plugin sits at the plugin root, not inside `.claude-plugin/` ([plugins reference][cc-plugins-ref]). Skills go in `skills/<name>/SKILL.md`.
- **MCP servers go in `.mcp.json`** at the plugin root, or inline as `mcpServers` in `plugin.json` ([Claude Code MCP][cc-mcp]). A remote server with a bearer key looks like this:

  ```json
  {
    "mcpServers": {
      "crossfeed": {
        "type": "http",
        "url": "${CROSSFEED_URL:-https://crossfeed.example.com}/mcp",
        "headers": { "Authorization": "Bearer ${CROSSFEED_API_KEY}" }
      }
    }
  }
  ```

- **MCP gotchas** ([Claude Code MCP][cc-mcp]; [plugins reference][cc-plugins-ref]):
  - `type` is required. An entry with a `url` but no `type` is treated as stdio and skipped.
  - Credential variable names like `ANTHROPIC_API_KEY` expand to empty in remote `url` and `headers`, so use a name of our own.
  - Plugin `userConfig` with `"sensitive": true` and `${user_config.KEY}` stores the key in the OS secure store instead of an env var.
- **A marketplace** is `.claude-plugin/marketplace.json`, which needs `name`, `owner.name`, and `plugins[]`. Each entry has a `name` and a `source`, which can be a `./path`, `github`, `url`, `git-subdir`, `npm`, and so on ([marketplace reference][cc-marketplace-ref]). Users install with `/plugin marketplace add <owner>/<repo>` and then `/plugin install <name>@<marketplace>` ([plugin marketplaces][cc-marketplaces]).
- **Without a plugin**, users can add the server directly: `claude mcp add --transport http <name> <url> --header "Authorization: Bearer <key>"` ([Claude Code MCP][cc-mcp]).

[skills-spec]: https://agentskills.io/specification
[cc-skills]: https://code.claude.com/docs/en/skills
[cc-plugins-ref]: https://code.claude.com/docs/en/plugins-reference
[cc-mcp]: https://code.claude.com/docs/en/mcp
[cc-marketplace-ref]: https://code.claude.com/docs/en/plugins/marketplace-reference
[cc-marketplaces]: https://code.claude.com/docs/en/plugin-marketplaces

## Qloo key terms

**Short answer: no.** The hackathon key does not cover commercial or production use, and Qloo's terms forbid reselling access to third parties.

- **The key works only on the hackathon host and dies after judging.** "Hackathon API keys only work against `https://hackathon.api.qloo.com`", and production or staging URLs return 401. Keys "remain active through the end of the judging period and are deactivated after the hackathon closes" ([developer guide][qloo-guide]). [BRIEF.md][brief] puts the end of the demo window at 2026-11-16.
- **The key is personal.** Approved entrants "receive a personal API key by email" ([developer guide][qloo-guide]). Qloo's Terms of Use make API access a per-seat licence that must not be shared with "other individuals, persons within a company or another company" ([Terms of Use §1][qloo-tos]).
- **Reselling to third parties is prohibited.** Under §5, users may not "Sell, resell, redistribute, or sublicense the Services or otherwise charge third parties for access to the Services" ([Terms of Use §5][qloo-tos]). A paid public REST API or MCP server that proxies Qloo results to outside API-key holders sits squarely in this clause. Even a free one arguably "redistributes" them.
- **Production access means a commercial contract.** Non-hackathon keys come from `support@qloo.com` ([API onboarding][qloo-onboarding]). The SLA language refers to a "master services agreement" ([terms and policies][qloo-terms-policies]). The hackathon rules also exclude projects that "received a commercial license" from Qloo before the submission period ends ([official rules][qloo-rules]).
- **Rate limits are unpublished.** Keys have "rate and monthly quota limits set high enough to support typical hackathon projects". Raises are per user via Discord `#api-help` ([developer guide][qloo-guide]). The kit discussions asking about quota are unanswered ([CONTEXT.md][context]). Crossfeed already caps calls in [`apps/wrangler.jsonc`][wrangler] (`QLOO_DAILY_CALL_CAP`, `QLOO_VISITOR_DAILY_CALL_CAP`).
- **Caching is allowed, publishing is not.** "Private server-side caching is fine and there is no time limit." Response data must not go into a public repository, since that "makes the data publicly accessible outside the terms of your API key" ([developer guide][qloo-guide]). The same logic suggests a public API that returns raw Qloo payloads needs care.
- **Qloo may train on what we send.** Users grant Qloo a perpetual licence to anonymized input signals ([Terms of Use §9][qloo-tos]; [terms and policies][qloo-terms-policies]).
- **No creating accounts by automated means** ([Terms of Use §5][qloo-tos]). This applies to Qloo accounts, not ours.

[qloo-guide]: /docs/sources/docs.qloo.com/qloo-agentic-hackathon-developer-guide.md
[qloo-onboarding]: /docs/sources/docs.qloo.com/api-onboarding-and-authentication.md
[qloo-terms-policies]: /docs/sources/docs.qloo.com/terms-and-policies.md
[qloo-tos]: /docs/sources/qloo.com/terms-of-use.md
[qloo-rules]: /docs/sources/qloo.devpost.com/official-rules.md
[brief]: /docs/BRIEF.md
[context]: /docs/CONTEXT.md

## Open questions

- **Is the Cloudflare account on Workers Paid?** Answered on 2026-10-29: no, it's on Workers Free. A probe Worker on the account stopped one invocation at 50 `fetch()` subrequests, Free's limit on external subrequests ([#336](https://github.com/m1kuorg/qloo/issues/336)). So Email Service can't send to any address, which needs Paid ([pricing][cf-email-pricing]), and password hashing on Free's 10 ms CPU limit is unlikely to fit ([Workers limits][cf-limits]).
- **Does a Workers bundle of `better-auth` 1.7.11 resolve to the pure-JS scrypt?** Confirm by bundling, or skip passwords entirely.
- **Is the send-bindings page stale?** It contradicts the limits page on whether a binding can reach any recipient. Test with a real send after onboarding a domain.
- **Can the Qloo key back a public API or MCP surface at all?** Ask Qloo, through Discord `#api-help` or `support@qloo.com`, whether a public API or MCP surface is allowed during judging, and what a commercial key would cost ([developer guide][qloo-guide]; [API onboarding][qloo-onboarding]).
- **Did MailChannels' free Workers sending end?** Not confirmed from a primary source.
