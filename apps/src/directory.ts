// The directory (ADR 0001): the only code that reads or writes the D1 database, `env.DB`. Its schema
// is migrations/0001_directory.sql. Session tokens and recovery codes are made here, handed out once,
// and stored only as SHA-256 hashes. D1 has no interactive transactions, so each change that must
// hold together is one statement or one batch.
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import { sha256 } from './text'

// A session lasts 30 days from its last use; a use extends it at most once a minute.
export const SESSION_MS = 30 * 24 * 60 * 60_000
const SEEN_EVERY_MS = 60_000
// A passkey ceremony's challenge is good for five minutes.
const CHALLENGE_MS = 5 * 60_000

export type Member = { id: string; name: string }

// A passkey as the directory keeps it: base64url credential ID and public key, the signature
// counter, and the transports the browser gave, if any.
export type Passkey = {
  credentialId: string
  memberId: string
  publicKey: string
  counter: number
  transports: string[] | null
}

// A ceremony's challenge, with what it was started for: a sign-up's name and its member's ID to be.
export type Challenge = { challenge: string; name: string | null; memberId: string | null; expires: number }

// What a member is handed when a session starts: the cookie's token, and, at sign-up and recovery,
// their new recovery code. Neither can be read back.
export type Secrets = { token: string; recoveryCode: string }

// Keeps a ceremony's challenge; the ID it returns is how the ceremony's second request names it.
export async function saveChallenge(
  db: D1Database,
  kind: string,
  challenge: string,
  { name = null, memberId = null }: { name?: string | null; memberId?: string | null } = {}
) {
  const id = crypto.randomUUID()
  await db
    .prepare('INSERT INTO challenges (id, kind, challenge, name, member_id, expires) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, kind, challenge, name, memberId, Date.now() + CHALLENGE_MS)
    .run()
  return id
}

// Takes challenge `id` of `kind`, deleting it in the same statement, so it's used at most once.
// Null when there's none: it was used already, purged, or never made.
export async function takeChallenge(db: D1Database, id: string, kind: string): Promise<Challenge | null> {
  const row = await db
    .prepare('DELETE FROM challenges WHERE id = ? AND kind = ? RETURNING challenge, name, member_id, expires')
    .bind(id, kind)
    .first<{ challenge: string; name: string | null; member_id: string | null; expires: number }>()
  return row && { challenge: row.challenge, name: row.name, memberId: row.member_id, expires: row.expires }
}

// Writes a new member with their first passkey and a session, all or nothing, once the passkey's
// registration has verified.
export async function signUp(db: D1Database, member: Member, passkey: Omit<Passkey, 'memberId'>, label: string) {
  const secrets = { token: token(), recoveryCode: recoveryCode() }
  const now = Date.now()
  await db.batch([
    db
      .prepare('INSERT INTO members (id, name, recovery_code_hash, created) VALUES (?, ?, ?, ?)')
      .bind(member.id, member.name, await sha256(normalCode(secrets.recoveryCode)), now),
    db
      .prepare(
        'INSERT INTO passkeys (credential_id, member_id, public_key, counter, transports, label, created) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        passkey.credentialId,
        member.id,
        passkey.publicKey,
        passkey.counter,
        passkey.transports && JSON.stringify(passkey.transports),
        label,
        now
      ),
    insertSession(db, await sha256(secrets.token), member.id, now)
  ])
  return secrets
}

// The passkey a browser named by its credential ID, or null when no member has it.
export async function findPasskey(db: D1Database, credentialId: string): Promise<Passkey | null> {
  const row = await db
    .prepare('SELECT credential_id, member_id, public_key, counter, transports FROM passkeys WHERE credential_id = ?')
    .bind(credentialId)
    .first<{
      credential_id: string
      member_id: string
      public_key: string
      counter: number
      transports: string | null
    }>()
  return (
    row && {
      credentialId: row.credential_id,
      memberId: row.member_id,
      publicKey: row.public_key,
      counter: row.counter,
      transports: row.transports && JSON.parse(row.transports)
    }
  )
}

// Starts a session for the member whose passkey just signed in, keeping its new signature counter.
// A counter never goes back, even when two sign-ins land together.
export async function signIn(db: D1Database, passkey: Passkey, counter: number) {
  const secret = token()
  const now = Date.now()
  await db.batch([
    db
      .prepare('UPDATE passkeys SET counter = MAX(counter, ?), last_used = ? WHERE credential_id = ?')
      .bind(counter, now, passkey.credentialId),
    insertSession(db, await sha256(secret), passkey.memberId, now)
  ])
  return secret
}

// Signs in the member whose recovery code `code` is, and replaces it with a new one in the same
// batch, so each code works once. Null when no member has it.
export async function recover(db: D1Database, code: string): Promise<Secrets | null> {
  const secrets = { token: token(), recoveryCode: recoveryCode() }
  const now = Date.now()
  const issued = await sha256(normalCode(secrets.recoveryCode))
  const [replaced] = await db.batch([
    db
      .prepare('UPDATE members SET recovery_code_hash = ? WHERE recovery_code_hash = ? RETURNING id')
      .bind(issued, await sha256(normalCode(code))),
    db
      .prepare(
        'INSERT INTO sessions (token_hash, member_id, created, expires, last_seen) SELECT ?, id, ?, ?, ? FROM members WHERE recovery_code_hash = ?'
      )
      .bind(await sha256(secrets.token), now, now + SESSION_MS, now, issued)
  ])
  return replaced.results.length ? secrets : null
}

// The member a session token belongs to, while the session lasts. A use more than a minute after the
// last extends it, and `extended` says so, for the cookie to be extended too.
export async function sessionMember(db: D1Database, token: string): Promise<(Member & { extended: boolean }) | null> {
  const hash = await sha256(token)
  const now = Date.now()
  const row = await db
    .prepare(
      'SELECT m.id, m.name, s.last_seen FROM sessions s JOIN members m ON m.id = s.member_id WHERE s.token_hash = ? AND s.expires > ?'
    )
    .bind(hash, now)
    .first<{ id: string; name: string; last_seen: number }>()
  if (!row) return null
  const extended = now - row.last_seen >= SEEN_EVERY_MS
  if (extended)
    await db
      .prepare('UPDATE sessions SET last_seen = ?, expires = ? WHERE token_hash = ?')
      .bind(now, now + SESSION_MS, hash)
      .run()
  return { id: row.id, name: row.name, extended }
}

// Ends the session with token `token`, if there is one.
export async function signOut(db: D1Database, token: string) {
  await db
    .prepare('DELETE FROM sessions WHERE token_hash = ?')
    .bind(await sha256(token))
    .run()
}

// What a member is in a network: its `owner` can change it and manage its members, and a `member`
// works in it.
export type Role = 'owner' | 'member'

// A network as one of its members sees it.
export type Network = { id: string; name: string; role: Role }

// Creates a network named `name`, owned by the member who creates it, unless they've already created
// `cap` networks, whoever owns them now. The cap and both rows are one batch, so two creations at once
// can't both pass it. Null when the cap refuses it.
export async function createNetwork(db: D1Database, memberId: string, name: string, cap: number) {
  const id = crypto.randomUUID()
  const now = Date.now()
  const [network] = await db.batch([
    db
      .prepare(
        'INSERT INTO networks (id, name, created_by, created) SELECT ?, ?, ?, ? WHERE (SELECT count(*) FROM networks WHERE created_by = ?) < ?'
      )
      .bind(id, name, memberId, now, memberId, cap),
    db
      .prepare(
        "INSERT INTO memberships (network_id, member_id, role, joined, last_opened) SELECT id, ?, 'owner', ?, ? FROM networks WHERE id = ?"
      )
      .bind(memberId, now, now, id)
  ])
  return network.meta.changes ? id : null
}

// The networks a member belongs to, by name.
export async function memberNetworks(db: D1Database, memberId: string): Promise<Network[]> {
  const { results } = await db
    .prepare(
      'SELECT n.id, n.name, m.role FROM memberships m JOIN networks n ON n.id = m.network_id WHERE m.member_id = ? ORDER BY n.name COLLATE NOCASE, n.created'
    )
    .bind(memberId)
    .all<Network>()
  return results
}

// The network a member opened last, or the one they joined last when they've opened none; null
// when they belong to none.
export async function lastNetwork(db: D1Database, memberId: string) {
  return db
    .prepare(
      'SELECT network_id FROM memberships WHERE member_id = ? ORDER BY last_opened DESC NULLS LAST, joined DESC LIMIT 1'
    )
    .bind(memberId)
    .first<string>('network_id')
}

// Member `memberId`'s role in network `networkId`, or null when they don't belong to it, or there's no
// such network.
export async function memberRole(db: D1Database, networkId: string, memberId: string) {
  return db
    .prepare('SELECT role FROM memberships WHERE network_id = ? AND member_id = ?')
    .bind(networkId, memberId)
    .first<Role>('role')
}

// Network `networkId` as member `memberId` sees it, marked as the one they opened last, in the
// statement that checks they belong to it. Null when they don't, or there's no such network.
export async function openNetwork(db: D1Database, networkId: string, memberId: string) {
  return db
    .prepare(
      'UPDATE memberships SET last_opened = ? WHERE network_id = ? AND member_id = ? RETURNING network_id AS id, (SELECT name FROM networks WHERE id = network_id) AS name, role'
    )
    .bind(Date.now(), networkId, memberId)
    .first<Network>()
}

// Renames network `networkId` when member `memberId` is one of its owners, in the statement that
// checks it. False when they aren't.
export async function renameNetwork(db: D1Database, networkId: string, memberId: string, name: string) {
  const { meta } = await db
    .prepare(
      "UPDATE networks SET name = ? WHERE id = ? AND EXISTS (SELECT 1 FROM memberships WHERE network_id = networks.id AND member_id = ? AND role = 'owner')"
    )
    .bind(name, networkId, memberId)
    .run()
  return meta.changes > 0
}

// What a network's setup checklist reads from the directory: whether a teammate was invited or has
// joined, and whether an API key was ever made, revoked or not.
export async function setupProgress(db: D1Database, networkId: string) {
  const row = await db
    .prepare(
      'SELECT (SELECT count(*) FROM memberships WHERE network_id = ?1) > 1 OR EXISTS (SELECT 1 FROM invites WHERE network_id = ?1) AS invited, EXISTS (SELECT 1 FROM api_keys WHERE network_id = ?1) AS apiKey'
    )
    .bind(networkId)
    .first<{ invited: number; apiKey: number }>()
  return { invited: row?.invited === 1, apiKey: row?.apiKey === 1 }
}

// What the daily cron clears: sessions and challenges that have expired.
export async function purgeExpired(db: D1Database) {
  const now = Date.now()
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE expires <= ?').bind(now),
    db.prepare('DELETE FROM challenges WHERE expires <= ?').bind(now)
  ])
}

const insertSession = (db: D1Database, tokenHash: string, memberId: string, now: number) =>
  db
    .prepare('INSERT INTO sessions (token_hash, member_id, created, expires, last_seen) VALUES (?, ?, ?, ?, ?)')
    .bind(tokenHash, memberId, now, now + SESSION_MS, now)

// A session token: 32 random bytes, base64url.
const token = () => isoBase64URL.fromBuffer(crypto.getRandomValues(new Uint8Array(32)))

// Crockford's base32 alphabet, with no I, L, O, or U to misread.
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

// A recovery code: 20 random base32 characters (100 bits), shown in groups of four.
const recoveryCode = () =>
  [...crypto.getRandomValues(new Uint8Array(20))]
    .map((b) => CODE_ALPHABET[b & 31])
    .join('')
    .replace(/(.{4})(?=.)/g, '$1-')

// A recovery code as typed, the way it's hashed: capitals, without spaces or dashes, and with the
// letters Crockford's base32 reads as digits read as them.
const normalCode = (code: string) => code.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')
