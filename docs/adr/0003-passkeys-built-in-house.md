# Members sign in with passkeys, built in-house

Members sign up and sign in with a passkey only, verified with `@simplewebauthn/server`, and their sessions, passkeys, and challenges live in Crossfeed's D1 directory. The alternatives each needed something the project doesn't have: a magic link needs an email provider, and Cloudflare Email Service needs a domain on Cloudflare DNS and Workers Paid; Google or GitHub sign-in needs an OAuth app registered by hand; and a password needs scrypt hashing, which risks the Workers Free plan's 10 ms CPU limit ([platform research](/docs/research/platform.md#auth-with-better-auth-on-workers)). We didn't use Better Auth's passkey plugin, because it adds a passkey to an account that already exists, so a passkey-only sign-up would need a password or another provider first.

## Consequences

- With no email, recovery is a one-time recovery code, shown once at sign-up and stored only as a hash. It signs the member in to add a new passkey, and is replaced each time it's used.
- Crossfeed asks a member for a name only. An unverified email would be personal data with no use.
- OAuth sign-in can be added later beside passkeys without changing how sessions work.
