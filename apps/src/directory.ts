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
// registration has verified. With an invite's token, they join its network in the same batch, and
// nothing is written unless the invite is still open: an invited sign-up isn't counted against the
// sign-up cap, so it never makes an account without using its invite. `network` is the network they
// joined; null when the invite can't be used, and nothing was written.
export async function signUp(
  db: D1Database,
  member: Member,
  passkey: Omit<Passkey, 'memberId'>,
  label: string,
  invite?: string
): Promise<(Secrets & { network: string | null }) | null> {
  const secrets = { token: token(), recoveryCode: recoveryCode() }
  const now = Date.now()
  const hash = invite === undefined ? null : await sha256(invite)
  const [written, , , used] = await db.batch([
    db
      .prepare(
        `INSERT INTO members (id, name, recovery_code_hash, created) SELECT ?1, ?2, ?3, ?4${hash ? ' WHERE EXISTS (SELECT 1 FROM invites WHERE token_hash = ?5 AND used IS NULL AND revoked IS NULL AND expires > ?4)' : ''}`
      )
      .bind(member.id, member.name, await sha256(normalCode(secrets.recoveryCode)), now, ...(hash ? [hash] : [])),
    // The passkey and the session follow the member's row, which an invite that can't be used leaves out.
    db
      .prepare(
        'INSERT INTO passkeys (credential_id, member_id, public_key, counter, transports, label, created) SELECT ?, id, ?, ?, ?, ?, ? FROM members WHERE id = ?'
      )
      .bind(
        passkey.credentialId,
        passkey.publicKey,
        passkey.counter,
        passkey.transports && JSON.stringify(passkey.transports),
        label,
        now,
        member.id
      ),
    insertSession(db, await sha256(secrets.token), member.id, now),
    ...(hash ? joinThrough(db, hash, member.id, now) : [])
  ])
  if (!written.meta.changes) return null
  return { ...secrets, network: (used?.results[0] as { network_id: string } | undefined)?.network_id ?? null }
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

// Renames network `networkId` for its API key `keyId` while the key is in use, in the statement that
// checks it. False when it isn't.
export async function renameNetworkForKey(db: D1Database, networkId: string, keyId: string, name: string) {
  const { meta } = await db
    .prepare(
      'UPDATE networks SET name = ? WHERE id = ? AND EXISTS (SELECT 1 FROM api_keys WHERE id = ? AND network_id = networks.id AND revoked IS NULL)'
    )
    .bind(name, networkId, keyId)
    .run()
  return meta.changes > 0
}

// A member of a network as its members see them: their name, their role, and when they joined.
export type NetworkMember = { id: string; name: string; role: Role; joined: number }

// Network `networkId`'s members, in the order they joined.
export async function networkMembers(db: D1Database, networkId: string): Promise<NetworkMember[]> {
  const { results } = await db
    .prepare(
      'SELECT m.id, m.name, s.role, s.joined FROM memberships s JOIN members m ON m.id = s.member_id WHERE s.network_id = ? ORDER BY s.joined, m.name COLLATE NOCASE'
    )
    .bind(networkId)
    .all<NetworkMember>()
  return results
}

// Gives member `memberId` role `role` in network `networkId`, when member `by` is one of its owners and
// the network keeps another owner if it's a demotion, in one statement, so two owners demoting each
// other at once can't leave it with none. False when either check refuses it.
export async function setRole(db: D1Database, networkId: string, memberId: string, role: Role, by: string) {
  const { meta } = await db
    .prepare(
      "UPDATE memberships SET role = ?4 WHERE network_id = ?1 AND member_id = ?2 AND EXISTS (SELECT 1 FROM memberships WHERE network_id = ?1 AND member_id = ?3 AND role = 'owner') AND (?4 = 'owner' OR EXISTS (SELECT 1 FROM memberships WHERE network_id = ?1 AND role = 'owner' AND member_id != ?2))"
    )
    .bind(networkId, memberId, by, role)
    .run()
  return meta.changes > 0
}

// Takes member `memberId` out of network `networkId`, when member `by` is one of its owners or is
// `memberId` leaving, and the network keeps another owner if they're one, in one statement, so two
// owners leaving at once can't leave it with none. False when either check refuses it.
export async function removeMember(db: D1Database, networkId: string, memberId: string, by: string) {
  const { meta } = await db
    .prepare(
      "DELETE FROM memberships WHERE network_id = ?1 AND member_id = ?2 AND (?2 = ?3 OR EXISTS (SELECT 1 FROM memberships WHERE network_id = ?1 AND member_id = ?3 AND role = 'owner')) AND (role = 'member' OR EXISTS (SELECT 1 FROM memberships WHERE network_id = ?1 AND role = 'owner' AND member_id != ?2))"
    )
    .bind(networkId, memberId, by)
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

// An invite link works once, for seven days, unless an owner revokes it first.
const INVITE_MS = 7 * 24 * 60 * 60_000

// An invite still open, as its network's owners see it: when it was made, by whom (null once they've
// gone), and when it expires. Its token was shown once, when it was made, and can't be read back.
export type Invite = { id: string; created: number; expires: number; by: string | null }

// Makes an invite to network `networkId` when member `by` is one of its owners, checked in the
// statement that writes it. Returns its ID and its token, which only its hash is kept for; null when
// they aren't an owner.
export async function createInvite(db: D1Database, networkId: string, by: string) {
  const invite = { id: crypto.randomUUID(), token: token() }
  const now = Date.now()
  const { meta } = await db
    .prepare(
      "INSERT INTO invites (id, token_hash, network_id, created_by, created, expires) SELECT ?, ?, network_id, member_id, ?, ? FROM memberships WHERE network_id = ? AND member_id = ? AND role = 'owner'"
    )
    .bind(invite.id, await sha256(invite.token), now, now + INVITE_MS, networkId, by)
    .run()
  return meta.changes ? invite : null
}

// Revokes invite `inviteId` to network `networkId` when member `by` is one of its owners and the invite
// is still open, in one statement. False when it isn't: it was used, revoked, or expired.
export async function revokeInvite(db: D1Database, networkId: string, inviteId: string, by: string) {
  const now = Date.now()
  const { meta } = await db
    .prepare(
      "UPDATE invites SET revoked = ?1 WHERE id = ?2 AND network_id = ?3 AND used IS NULL AND revoked IS NULL AND expires > ?1 AND EXISTS (SELECT 1 FROM memberships WHERE network_id = ?3 AND member_id = ?4 AND role = 'owner')"
    )
    .bind(now, inviteId, networkId, by)
    .run()
  return meta.changes > 0
}

// Network `networkId`'s invites still open: not used, revoked, or expired. Newest first.
export async function openInvites(db: D1Database, networkId: string): Promise<Invite[]> {
  const { results } = await db
    .prepare(
      'SELECT i.id, i.created, i.expires, m.name AS by FROM invites i LEFT JOIN members m ON m.id = i.created_by WHERE i.network_id = ? AND i.used IS NULL AND i.revoked IS NULL AND i.expires > ? ORDER BY i.created DESC, i.id'
    )
    .bind(networkId, Date.now())
    .all<Invite>()
  return results
}

// Why an invite can't be used any more, or `open` while it can.
type InviteState = 'open' | 'used' | 'revoked' | 'expired'

// The invite a link's token names: its network, and whether it can still be used. Null when no
// invite has that token.
export async function findInvite(db: D1Database, token: string) {
  const row = await db
    .prepare(
      'SELECT i.network_id, n.name, i.used, i.revoked, i.expires FROM invites i JOIN networks n ON n.id = i.network_id WHERE i.token_hash = ?'
    )
    .bind(await sha256(token))
    .first<{ network_id: string; name: string; used: number | null; revoked: number | null; expires: number }>()
  if (!row) return null
  const state: InviteState =
    row.used !== null ? 'used' : row.revoked !== null ? 'revoked' : row.expires <= Date.now() ? 'expired' : 'open'
  return { networkId: row.network_id, network: row.name, state }
}

// Joins member `memberId` to the network the invite with token `token` is for, as a member, in one
// batch that uses the invite: only while it's open, and only by someone not in the network yet, so of
// two people using it at once one joins, and a member already in leaves it for whoever it's for.
// Returns the network's ID when they're its member now, whether they joined just now or before; null
// when the invite can't be used.
export async function joinByInvite(db: D1Database, token: string, memberId: string) {
  const hash = await sha256(token)
  const [, , member] = await db.batch([
    ...joinThrough(db, hash, memberId, Date.now()),
    db
      .prepare(
        'SELECT network_id FROM invites WHERE token_hash = ?2 AND EXISTS (SELECT 1 FROM memberships WHERE network_id = invites.network_id AND member_id = ?1)'
      )
      .bind(memberId, hash)
  ])
  return (member.results[0] as { network_id: string } | undefined)?.network_id ?? null
}

// An API key as its network's owners see it: its name, the first characters of its secret, who made
// it (null once they've gone), when, and when it was last used, to the minute. Its secret was shown
// once, when it was made, and can't be read back.
export type ApiKey = {
  id: string
  name: string
  prefix: string
  by: string | null
  created: number
  lastUsed: number | null
}

// How much of a key's secret it's listed by: `cf_live_` and four characters of its random part.
const PREFIX_LENGTH = 12

// Makes an API key for network `networkId`, named `name`, when member `by` is one of its owners,
// checked in the statement that writes it. Returns its ID and its secret, which only its hash is kept
// for; null when they aren't an owner.
export async function createApiKey(db: D1Database, networkId: string, by: string, name: string) {
  const key = { id: crypto.randomUUID(), secret: `cf_live_${token()}` }
  const { meta } = await db
    .prepare(
      "INSERT INTO api_keys (id, network_id, name, prefix, secret_hash, created_by, created) SELECT ?, network_id, ?, ?, ?, member_id, ? FROM memberships WHERE network_id = ? AND member_id = ? AND role = 'owner'"
    )
    .bind(key.id, name, key.secret.slice(0, PREFIX_LENGTH), await sha256(key.secret), Date.now(), networkId, by)
    .run()
  return meta.changes ? key : null
}

// Network `networkId`'s API keys still in use, newest first.
export async function apiKeys(db: D1Database, networkId: string): Promise<ApiKey[]> {
  const { results } = await db
    .prepare(
      'SELECT k.id, k.name, k.prefix, m.name AS by, k.created, k.last_used AS lastUsed FROM api_keys k LEFT JOIN members m ON m.id = k.created_by WHERE k.network_id = ? AND k.revoked IS NULL ORDER BY k.created DESC, k.id'
    )
    .bind(networkId)
    .all<ApiKey>()
  return results
}

// Revokes API key `keyId` of network `networkId` when member `by` is one of its owners and the key is
// still in use, in one statement. Every request with its secret is refused from then on. False when
// it isn't: it was revoked already, or there's no such key.
export async function revokeApiKey(db: D1Database, networkId: string, keyId: string, by: string) {
  const { meta } = await db
    .prepare(
      "UPDATE api_keys SET revoked = ?1 WHERE id = ?2 AND network_id = ?3 AND revoked IS NULL AND EXISTS (SELECT 1 FROM memberships WHERE network_id = ?3 AND member_id = ?4 AND role = 'owner')"
    )
    .bind(Date.now(), keyId, networkId, by)
    .run()
  return meta.changes > 0
}

// The API key a request's secret is, and the network it acts for, while it isn't revoked; null when
// no key in use has that secret. A use more than a minute after the last is noted as its last use.
export async function apiKeyFor(db: D1Database, secret: string): Promise<{ id: string; networkId: string } | null> {
  const hash = await sha256(secret)
  const row = await db
    .prepare('SELECT id, network_id, last_used FROM api_keys WHERE secret_hash = ? AND revoked IS NULL')
    .bind(hash)
    .first<{ id: string; network_id: string; last_used: number | null }>()
  if (!row) return null
  const now = Date.now()
  if (row.last_used === null || now - row.last_used >= SEEN_EVERY_MS)
    await db.prepare('UPDATE api_keys SET last_used = ? WHERE id = ?').bind(now, row.id).run()
  return { id: row.id, networkId: row.network_id }
}

// Network `networkId`'s name, or null when there's no such network.
export async function networkName(db: D1Database, networkId: string) {
  return db.prepare('SELECT name FROM networks WHERE id = ?').bind(networkId).first<string>('name')
}

// The agent instances to wipe (`destroy`) once the directory or their network has let go of them, by
// binding, such as LaunchAgent, and name. Each is noted before its wipe and crossed off once the wipe
// succeeds, so the daily cron can retry any that failed (wipe.ts).
export async function noteWipe(db: D1Database, binding: string, name: string) {
  await db
    .prepare('INSERT OR IGNORE INTO wipes (binding, name, created) VALUES (?, ?, ?)')
    .bind(binding, name, Date.now())
    .run()
}

export async function wipeDone(db: D1Database, binding: string, name: string) {
  await db.prepare('DELETE FROM wipes WHERE binding = ? AND name = ?').bind(binding, name).run()
}

// The wipes noted before `before` (epoch ms) and not yet done, oldest first.
export async function wipesDue(db: D1Database, before: number) {
  const { results } = await db
    .prepare('SELECT binding, name FROM wipes WHERE created < ? ORDER BY created')
    .bind(before)
    .all<{ binding: string; name: string }>()
  return results
}

// What the daily cron clears: sessions, challenges, and invites that have expired.
export async function purgeExpired(db: D1Database) {
  const now = Date.now()
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE expires <= ?').bind(now),
    db.prepare('DELETE FROM challenges WHERE expires <= ?').bind(now),
    db.prepare('DELETE FROM invites WHERE expires <= ?').bind(now)
  ])
}

// A new session for member `memberId`, started only if they exist, as a sign-up's member may not.
const insertSession = (db: D1Database, tokenHash: string, memberId: string, now: number) =>
  db
    .prepare(
      'INSERT INTO sessions (token_hash, member_id, created, expires, last_seen) SELECT ?, id, ?, ?, ? FROM members WHERE id = ?'
    )
    .bind(tokenHash, now, now + SESSION_MS, now, memberId)

// Uses the invite with token hash `hash` for member `memberId` and adds them to its network as a
// member: the first statement marks it used while it's open and they aren't in the network yet,
// returning its network; the second adds the membership only that use wrote. Run in a batch, so no
// other use comes between.
const joinThrough = (db: D1Database, hash: string, memberId: string, now: number) => [
  db
    .prepare(
      'UPDATE invites SET used = ?1, used_by = ?2 WHERE token_hash = ?3 AND used IS NULL AND revoked IS NULL AND expires > ?1 AND NOT EXISTS (SELECT 1 FROM memberships WHERE network_id = invites.network_id AND member_id = ?2) RETURNING network_id'
    )
    .bind(now, memberId, hash),
  db
    .prepare(
      "INSERT INTO memberships (network_id, member_id, role, joined, last_opened) SELECT network_id, ?2, 'member', ?1, ?1 FROM invites WHERE token_hash = ?3 AND used = ?1 AND used_by = ?2 AND NOT EXISTS (SELECT 1 FROM memberships WHERE network_id = invites.network_id AND member_id = ?2)"
    )
    .bind(now, memberId, hash)
]

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
