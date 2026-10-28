// The directory (ADR 0001): the only code that reads or writes the D1 database, `env.DB`. Its schema
// is migrations/0001_directory.sql. Session tokens and recovery codes are made here, handed out once,
// and stored only as SHA-256 hashes. D1 has no interactive transactions, so each change that must
// hold together is one statement or one batch.
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import { GUEST_MEMBER, GUEST_NETWORK, GUEST_PREFIX, sha256 } from './text'

// A session lasts 30 days from its last use; a use extends it at most once a minute. A guest's session
// lasts a day from sign-in, and isn't extended (ADR 0008).
export const SESSION_MS = 30 * 24 * 60 * 60_000
export const GUEST_SESSION_MS = 24 * 60 * 60_000
// Guest sign-ins are limited per minute and per UTC day: the guest sign-ins logged in each count.
const GUEST_SIGNINS_MS = 60_000
const SEEN_EVERY_MS = 60_000
// A passkey ceremony's challenge is good for five minutes.
const CHALLENGE_MS = 5 * 60_000
// A session proves its member is there for five minutes after a user-verified passkey, at sign-up,
// sign-in, or step-up, or after the recovery code it signed in with, which adding a passkey, a new
// recovery code, and deleting the account need.
export const STEP_UP_MS = 5 * 60_000

// The names the guest network and the guest member (ADR 0008) are made with, as migrations 0005 and 0009
// made them, and the guest member's recovery code hash, which no SHA-256 output (64 hex digits) is, so no
// recovery code names it.
const GUEST_NETWORK_NAME = 'Guest network'
const GUEST_MEMBER_NAME = 'Guest'
const GUEST_RECOVERY_HASH = 'none: the guest member has no recovery code'

// Which of guest sign-in's limits is spent: everyone's for the minute, or for the UTC day.
export type GuestLimit = 'minute' | 'day'

// Whether `member` is marked a guest, as the guest member is, whom every guest is signed in as (ADR 0008),
// and the temporary guest members ADR 0006 made, until the daily clearing removes them.
export const isGuestMember = (member: { guest: boolean } | null | undefined) => member?.guest === true

// A member, and whether they're marked a guest, as the members table marks them.
export type Member = { id: string; name: string; guest: boolean }

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
// nothing is written unless the invite is still open and its maker's links have brought in fewer than
// `invitedCap` new accounts today: an invited sign-up isn't counted against the sign-up cap, so it
// never makes an account without using its invite. `network` is the network they joined; null when
// the invite can't be used, and nothing was written.
export async function signUp(
  db: D1Database,
  member: Pick<Member, 'id' | 'name'>,
  passkey: Omit<Passkey, 'memberId'>,
  label: string,
  invite?: { token: string; invitedCap: number }
): Promise<(Secrets & { network: string | null }) | null> {
  const secrets = { token: token(), recoveryCode: recoveryCode() }
  const now = Date.now()
  const hash = invite === undefined ? null : await sha256(invite.token)
  const [written, , , used] = await db.batch([
    db
      .prepare(
        `INSERT INTO members (id, name, recovery_code_hash, created) SELECT ?1, ?2, ?3, ?4${hash ? ` WHERE EXISTS (SELECT 1 FROM invites WHERE token_hash = ?5 AND used IS NULL AND revoked IS NULL AND expires > ?4) AND ${invitedSince('?5', '?6')} < ?7` : ''}`
      )
      .bind(
        member.id,
        member.name,
        await sha256(normalCode(secrets.recoveryCode)),
        now,
        ...(hash ? [hash, utcDayStart(now), invite!.invitedCap] : [])
      ),
    // The passkey and the session follow the member's row, which an invite that can't be used leaves out.
    insertPasskey(db, member.id, passkey, label, now),
    insertSession(db, await sha256(secrets.token), member.id, now),
    ...(hash
      ? [
          ...joinThrough(db, hash, member.id, now),
          // A guest's link that this sign-up used is logged for guests' links' daily count (invitedSince).
          db
            .prepare(
              'INSERT INTO guest_invited_signups (created) SELECT ?1 FROM invites WHERE token_hash = ?2 AND guest = 1 AND used = ?1 AND used_by = ?3'
            )
            .bind(now, hash, member.id)
        ]
      : [])
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

// A passkey as its member sees it on their account page: its ID, the browser and system it was added
// from, when, and when it last signed them in.
export type AccountPasskey = { id: string; label: string; created: number; lastUsed: number | null }

// Member `memberId`'s passkeys, oldest first.
export async function memberPasskeys(db: D1Database, memberId: string): Promise<AccountPasskey[]> {
  const { results } = await db
    .prepare(
      'SELECT credential_id AS id, label, created, last_used AS lastUsed FROM passkeys WHERE member_id = ? ORDER BY created, credential_id'
    )
    .bind(memberId)
    .all<AccountPasskey>()
  return results
}

// Adds a passkey to member `memberId`'s account, once its registration has verified, unless they're marked a
// guest, whose one shared account takes none (ADR 0008).
export async function addPasskey(db: D1Database, memberId: string, passkey: Omit<Passkey, 'memberId'>, label: string) {
  await insertPasskey(db, memberId, passkey, label, Date.now()).run()
}

// Removes member `memberId`'s passkey `credentialId` unless it's their last, in one statement, so two
// removals at once can't take both: `last` when it's the only one left, `missing` when they have no
// such passkey.
export async function removePasskey(db: D1Database, memberId: string, credentialId: string) {
  const [removed, kept] = await db.batch([
    db
      .prepare(
        'DELETE FROM passkeys WHERE credential_id = ?1 AND member_id = ?2 AND (SELECT count(*) FROM passkeys WHERE member_id = ?2) > 1'
      )
      .bind(credentialId, memberId),
    db.prepare('SELECT 1 FROM passkeys WHERE credential_id = ? AND member_id = ?').bind(credentialId, memberId)
  ])
  return removed.meta.changes ? 'removed' : kept.results.length ? 'last' : 'missing'
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

// Signs in as a guest (ADR 0008): a session of its own for the one guest member, for a day, which never
// proves it's them; and the guest member an owner of the guest network. It's one batch: first the session,
// written only while fewer than `perMinute` guest sign-ins were logged in the last minute and fewer than
// `perDay` in the UTC day, counted in the statement that writes it, before the batch writes anything, so
// the counts hold for every request at once, from anywhere; then the sign-in's row in the log, and the
// guest network's and the guest member's rows if they're gone, and its owner membership (intoGuestNetwork),
// each only where that session was written. Returns the session's token, or which limit is spent, and
// nothing was written.
export async function guestSignIn(
  db: D1Database,
  { perMinute, perDay }: { perMinute: number; perDay: number }
): Promise<{ token: string } | { spent: GuestLimit }> {
  const secret = token()
  const hash = await sha256(secret)
  const now = Date.now()
  const day = utcDayStart(now)
  const results = await db.batch([
    // The session names the guest member before the batch makes its row again, if it's gone: the foreign
    // key is checked as the batch ends, once it's there.
    db.prepare('PRAGMA defer_foreign_keys = ON'),
    db
      .prepare(
        'INSERT INTO sessions (token_hash, member_id, created, expires, last_seen) SELECT ?1, ?2, ?3, ?4, ?3 WHERE (SELECT count(*) FROM guest_signins WHERE created > ?5) < ?6 AND (SELECT count(*) FROM guest_signins WHERE created >= ?7) < ?8'
      )
      .bind(hash, GUEST_MEMBER, now, now + GUEST_SESSION_MS, now - GUEST_SIGNINS_MS, perMinute, day, perDay),
    db.prepare(`INSERT INTO guest_signins (created) SELECT ?1 WHERE ${sessionWritten(2)}`).bind(now, hash),
    ...intoGuestNetwork(db, now, hash),
    // Which limit refused it, if one did, as the batch found them.
    db.prepare('SELECT (SELECT count(*) FROM guest_signins WHERE created >= ?1) >= ?2 AS day').bind(day, perDay)
  ])
  if (results[1].meta.changes) return { token: secret }
  return { spent: (results.at(-1)!.results[0] as { day: number }).day ? 'day' : 'minute' }
}

// Makes the guest member an owner of the guest network again, as a guest's /app opens, when anyone demoted
// or removed it, or deleted the guest network, whose row is made again (ADR 0008).
export async function restoreGuestOwner(db: D1Database) {
  await db.batch(intoGuestNetwork(db, Date.now()))
}

// The guest network's row and the guest member's, each made again if it's gone, and the guest member's
// membership of the guest network made an owner's, none of them written where it's so already. With
// `signedIn`, a guest sign-in's session's token hash, only where that session was written.
const intoGuestNetwork = (db: D1Database, now: number, signedIn?: string) => {
  // A statement whose last parameter, after `values`, is the session's token hash, when there is one.
  const statement = (sql: (where: string) => string, ...values: unknown[]) =>
    signedIn
      ? db.prepare(sql(`WHERE ${sessionWritten(values.length + 1)}`)).bind(...values, signedIn)
      : db.prepare(sql('WHERE true')).bind(...values)
  return [
    statement(
      (where) => `INSERT OR IGNORE INTO networks (id, name, created_by, created) SELECT ?1, ?2, NULL, ?3 ${where}`,
      GUEST_NETWORK,
      GUEST_NETWORK_NAME,
      now
    ),
    statement(
      (where) =>
        `INSERT OR IGNORE INTO members (id, name, recovery_code_hash, created, guest) SELECT ?1, ?2, ?3, ?4, 1 ${where}`,
      GUEST_MEMBER,
      GUEST_MEMBER_NAME,
      GUEST_RECOVERY_HASH,
      now
    ),
    // A WHERE, `true` at least, keeps SQLite from reading the upsert's ON as the SELECT's join.
    statement(
      (where) =>
        `INSERT INTO memberships (network_id, member_id, role, joined, last_opened) SELECT ?1, ?2, 'owner', ?3, NULL ${where} ON CONFLICT (network_id, member_id) DO UPDATE SET role = 'owner' WHERE role != 'owner'`,
      GUEST_NETWORK,
      GUEST_MEMBER,
      now
    )
  ]
}

// Whether the session whose token hash is SQL parameter ?n was written, as a guest sign-in's batch asks.
const sessionWritten = (n: number) => `EXISTS (SELECT 1 FROM sessions WHERE token_hash = ?${n})`

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
        'INSERT INTO sessions (token_hash, member_id, created, expires, last_seen, verified, recovered) SELECT ?1, id, ?2, ?3, ?2, ?2, 1 FROM members WHERE recovery_code_hash = ?4'
      )
      .bind(await sha256(secrets.token), now, now + SESSION_MS, issued)
  ])
  return replaced.results.length ? secrets : null
}

// Gives member `memberId` a new recovery code, which replaces their last one, and hands it out once, unless
// they're marked a guest, whose one shared account has none (ADR 0008).
export async function newRecoveryCode(db: D1Database, memberId: string) {
  const code = recoveryCode()
  await db
    .prepare('UPDATE members SET recovery_code_hash = ? WHERE id = ? AND guest = 0')
    .bind(await sha256(normalCode(code)), memberId)
    .run()
  return code
}

// The member a session token belongs to, while the session lasts. A use more than a minute after the
// last extends it, unless its member is a guest member, and `extended` says so, for the cookie to be
// extended too.
export async function sessionMember(db: D1Database, token: string): Promise<(Member & { extended: boolean }) | null> {
  const hash = await sha256(token)
  const now = Date.now()
  const row = await db
    .prepare(
      'SELECT m.id, m.name, m.guest, s.last_seen FROM sessions s JOIN members m ON m.id = s.member_id WHERE s.token_hash = ? AND s.expires > ?'
    )
    .bind(hash, now)
    .first<{ id: string; name: string; guest: number; last_seen: number }>()
  if (!row) return null
  const guest = row.guest === 1
  const extended = !guest && now - row.last_seen >= SEEN_EVERY_MS
  if (extended)
    await db
      .prepare('UPDATE sessions SET last_seen = ?, expires = ? WHERE token_hash = ?')
      .bind(now, now + SESSION_MS, hash)
      .run()
  return { id: row.id, name: row.name, guest, extended }
}

// How the session with token `token` last proved its member was there: when, null for a session from
// before step-up, and whether it signed in with a recovery code, which can prove it again.
export async function sessionProof(db: D1Database, token: string) {
  const row = await db
    .prepare('SELECT verified, recovered FROM sessions WHERE token_hash = ?')
    .bind(await sha256(token))
    .first<{ verified: number | null; recovered: number }>()
  return row && { verified: row.verified, recovered: row.recovered === 1 }
}

// Notes that the session with token `token` proved its member was there just now: with `passkey`, one
// of theirs, whose new signature counter is kept too, as at sign-in, though it signed no one in, so
// its last use stays as it was.
export async function proveSession(db: D1Database, token: string, passkey?: { credentialId: string; counter: number }) {
  await db.batch([
    db.prepare('UPDATE sessions SET verified = ? WHERE token_hash = ?').bind(Date.now(), await sha256(token)),
    ...(passkey
      ? [
          db
            .prepare('UPDATE passkeys SET counter = MAX(counter, ?) WHERE credential_id = ?')
            .bind(passkey.counter, passkey.credentialId)
        ]
      : [])
  ])
}

// Whether `code`, as typed, is member `memberId`'s recovery code now. It's only checked, so it still
// signs them in once.
export async function isRecoveryCode(db: D1Database, memberId: string, code: string) {
  const row = await db
    .prepare('SELECT 1 FROM members WHERE id = ? AND recovery_code_hash = ?')
    .bind(memberId, await sha256(normalCode(code)))
    .first()
  return row !== null
}

// Ends the session with token `token`, if there is one.
export async function signOut(db: D1Database, token: string) {
  await db
    .prepare('DELETE FROM sessions WHERE token_hash = ?')
    .bind(await sha256(token))
    .run()
}

// Ends every one of member `memberId`'s sessions, on every browser, unless they're marked a guest, whose
// sessions are every guest's (ADR 0008).
export async function signOutEverywhere(db: D1Database, memberId: string) {
  await db
    .prepare('DELETE FROM sessions WHERE member_id = ?1 AND EXISTS (SELECT 1 FROM members WHERE id = ?1 AND guest = 0)')
    .bind(memberId)
    .run()
}

// How many browsers member `memberId` is signed in on: their sessions that haven't expired.
export async function openSessions(db: D1Database, memberId: string) {
  return (
    (await db
      .prepare('SELECT count(*) AS n FROM sessions WHERE member_id = ? AND expires > ?')
      .bind(memberId, Date.now())
      .first<number>('n')) ?? 0
  )
}

// Renames member `memberId`, as their teammates see them from then on, unless they're marked a guest, whose
// one shared account keeps its name (ADR 0008).
export async function renameMember(db: D1Database, memberId: string, name: string) {
  await db.prepare('UPDATE members SET name = ? WHERE id = ? AND guest = 0').bind(name, memberId).run()
}

// What a member is in a network: its `owner` can change it and manage its members, and a `member`
// works in it.
export type Role = 'owner' | 'member'

// A network as one of its members sees it.
export type Network = { id: string; name: string; role: Role }

// The most networks one member can create, NETWORKS_PER_MEMBER, which createNetwork caps, and the most of the
// guest member's the daily clearing deletes (guestOwnedNetworks).
export const networksPerMember = (env: Env) => Number(env.NETWORKS_PER_MEMBER) || 0

// Creates a network named `name`, owned by `member`, who creates it, unless they've already created
// `cap` networks, whoever owns them now. The cap and both rows are one batch, so two creations at once
// can't both pass it. A guest member's network has an ID that starts with `guest-`, as the guest
// network's does, so its agents count it on the guest budget (ADR 0006). Null when the cap refuses it.
export async function createNetwork(db: D1Database, member: Member, name: string, cap: number) {
  const memberId = member.id
  const id = `${isGuestMember(member) ? GUEST_PREFIX : ''}${crypto.randomUUID()}`
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

// A network on its member's account page: whether they're its only owner, which stops them leaving it
// or deleting their account (ONLY_OWNER).
export type AccountNetwork = Network & { onlyOwner: boolean }

// The networks a member belongs to, by name, saying which they're the only owner of.
export async function accountNetworks(db: D1Database, memberId: string): Promise<AccountNetwork[]> {
  const { results } = await db
    .prepare(
      `SELECT n.id, n.name, m.role, ${ONLY_OWNER} AS onlyOwner FROM memberships m JOIN networks n ON n.id = m.network_id WHERE m.member_id = ? ORDER BY n.name COLLATE NOCASE, n.created`
    )
    .bind(memberId)
    .all<Network & { onlyOwner: number }>()
  return results.map((n) => ({ ...n, onlyOwner: n.onlyOwner === 1 }))
}

// Whether membership `m` makes its member the network's only owner, whom the network can't lose.
const ONLY_OWNER = `(m.role = 'owner' AND NOT EXISTS (SELECT 1 FROM memberships o WHERE o.network_id = m.network_id AND o.role = 'owner' AND o.member_id != m.member_id))`

// Whether network ?1 keeps an owner without member ?2.
const KEEPS_OWNER = `EXISTS (SELECT 1 FROM memberships WHERE network_id = ?1 AND role = 'owner' AND member_id != ?2)`

// Deletes member `memberId`, with their passkeys, sessions, and memberships, unless they're any
// network's only owner, so no network is left without an owner, or they're marked a guest, whose one
// shared account stays (ADR 0008), and notes `instances`, the networks that must forget their name
// (wipe.ts), in the same batch, so none is left unnoted. What they made in a network stays with it, made by
// no one, but for the API keys and invite links they made, which are revoked in the batch too. False when
// it's refused, and nothing was written.
export async function deleteMember(db: D1Database, memberId: string, instances: Instance[]) {
  const allowed = `EXISTS (SELECT 1 FROM members WHERE id = ?1 AND guest = 0) AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.member_id = ?1 AND ${ONLY_OWNER})`
  const now = Date.now()
  const results = await db.batch([
    // Noted and revoked before the member goes, while their memberships are still there to check and
    // their keys and invites still name them.
    ...instances.map(({ binding, name }) =>
      db
        .prepare(`INSERT OR IGNORE INTO wipes (binding, name, created) SELECT ?2, ?3, ?4 WHERE ${allowed}`)
        .bind(memberId, binding, name, now)
    ),
    ...REVOKE_MADE.map((revoke) => db.prepare(`${revoke} AND ${allowed}`).bind(memberId, now)),
    db.prepare(`DELETE FROM members WHERE id = ?1 AND ${allowed}`).bind(memberId)
  ])
  return results.at(-1)!.meta.changes > 0
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
// other at once can't leave it with none. A demoted owner's API keys and invite links in the network
// are revoked in the same batch. False when either check refuses it.
export async function setRole(db: D1Database, networkId: string, memberId: string, role: Role, by: string) {
  const [changed] = await db.batch([
    db
      .prepare(
        `UPDATE memberships SET role = ?4 WHERE network_id = ?1 AND member_id = ?2 AND EXISTS (SELECT 1 FROM memberships WHERE network_id = ?1 AND member_id = ?3 AND role = 'owner') AND (?4 = 'owner' OR ${KEEPS_OWNER})`
      )
      .bind(networkId, memberId, by, role),
    ...revokeUnowned(db, networkId, memberId)
  ])
  return changed.meta.changes > 0
}

// Takes member `memberId` out of network `networkId`, when member `by` is one of its owners or is
// `memberId` leaving, and the network keeps another owner if they're one, in one statement, so two
// owners leaving at once can't leave it with none. The batch notes that they were in it, for their
// account's deletion to forget them there too (pastNetworks), and revokes their API keys and invite
// links in the network. False when either check refuses it.
export async function removeMember(db: D1Database, networkId: string, memberId: string, by: string) {
  const [removed] = await db.batch([
    db
      .prepare(
        `DELETE FROM memberships WHERE network_id = ?1 AND member_id = ?2 AND (?2 = ?3 OR EXISTS (SELECT 1 FROM memberships WHERE network_id = ?1 AND member_id = ?3 AND role = 'owner')) AND (role = 'member' OR ${KEEPS_OWNER})`
      )
      .bind(networkId, memberId, by),
    // Once they're out, while the network and they still exist.
    db
      .prepare(
        'INSERT OR IGNORE INTO past_memberships (network_id, member_id) SELECT ?1, ?2 WHERE NOT EXISTS (SELECT 1 FROM memberships WHERE network_id = ?1 AND member_id = ?2) AND EXISTS (SELECT 1 FROM networks WHERE id = ?1) AND EXISTS (SELECT 1 FROM members WHERE id = ?2)'
      )
      .bind(networkId, memberId),
    ...revokeUnowned(db, networkId, memberId)
  ])
  return removed.meta.changes > 0
}

// The networks member `memberId` left or was removed from, and that still exist, by ID.
export async function pastNetworks(db: D1Database, memberId: string) {
  const { results } = await db
    .prepare('SELECT network_id FROM past_memberships WHERE member_id = ?')
    .bind(memberId)
    .all<{ network_id: string }>()
  return results.map((r) => r.network_id)
}

// Revoking what member ?1 made, at time ?2: their API keys still in use and their invite links still
// open. Only an owner makes either, so one who stops being an owner loses both, and neither keeps
// acting for, or letting anyone into, a network they no longer run. Each is a statement's start, for
// the caller to narrow with `AND`.
const REVOKE_MADE = [
  'UPDATE api_keys SET revoked = ?2 WHERE created_by = ?1 AND revoked IS NULL',
  'UPDATE invites SET revoked = ?2 WHERE created_by = ?1 AND used IS NULL AND revoked IS NULL'
]

// Revokes member `memberId`'s API keys and invite links in network `networkId` unless they're still
// one of its owners, for the batch that may have just removed or demoted them.
const revokeUnowned = (db: D1Database, networkId: string, memberId: string) =>
  REVOKE_MADE.map((revoke) =>
    db
      .prepare(
        `${revoke} AND network_id = ?3 AND NOT EXISTS (SELECT 1 FROM memberships WHERE network_id = ?3 AND member_id = ?1 AND role = 'owner')`
      )
      .bind(memberId, Date.now(), networkId)
  )

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

// Makes an invite to network `networkId` when member `by` is one of its owners and the network has
// fewer than `cap` open, checked in the statement that writes it, so two made at once can't both pass
// the cap. A guest member's is marked as a guest's (invitedSince). Returns its ID and its token, which
// only its hash is kept for; `capped` when the network has `cap` open, and null when they aren't an owner.
export async function createInvite(db: D1Database, networkId: string, by: string, cap: number) {
  const invite = { id: crypto.randomUUID(), token: token() }
  const now = Date.now()
  // How many of the network's invites are still open at time `at`, both SQL parameters.
  const openCount = (network: string, at: string) =>
    `(SELECT count(*) FROM invites WHERE network_id = ${network} AND used IS NULL AND revoked IS NULL AND expires > ${at})`
  const [made, counted] = await db.batch([
    db
      .prepare(
        `INSERT INTO invites (id, token_hash, network_id, created_by, created, expires, guest) SELECT ?1, ?2, network_id, member_id, ?3, ?4, (SELECT guest FROM members WHERE id = ?6) FROM memberships WHERE network_id = ?5 AND member_id = ?6 AND role = 'owner' AND ${openCount('?5', '?3')} < ?7`
      )
      .bind(invite.id, await sha256(invite.token), now, now + INVITE_MS, networkId, by, cap),
    db.prepare(`SELECT ${openCount('?1', '?2')} AS n`).bind(networkId, now)
  ])
  if (made.meta.changes) return invite
  return ((counted.results[0] as { n: number } | undefined)?.n ?? 0) >= cap ? ('capped' as const) : null
}

// Whether the member who made the invite with token `token`, or every guest, for a guest's link, has
// brought in `cap` new accounts through their links today, so it can't sign anyone up until 00:00 UTC;
// it can still let in someone who has an account.
export async function invitedCapped(db: D1Database, token: string, cap: number) {
  const n = await db
    .prepare(`SELECT ${invitedSince('?1', '?2')} AS n`)
    .bind(await sha256(token), utcDayStart(Date.now()))
    .first<number>('n')
  return (n ?? 0) >= cap
}

// How many new accounts the invite links of whoever made the invite with token hash `hash` have
// brought in since `since`, both SQL parameters: the uses whose member was written at the same time,
// as only a sign-up through a link writes its member and uses the link in one batch, at one time. A
// guest's link counts with every guest's link, from the log of sign-ups through them, which outlasts
// the guests who made them and their networks (ADR 0006). Null when no invite has that token.
const invitedSince = (hash: string, since: string) =>
  `(SELECT CASE WHEN i.guest = 1 THEN (SELECT count(*) FROM guest_invited_signups WHERE created >= ${since}) ELSE (SELECT count(*) FROM invites u JOIN members m ON m.id = u.used_by AND m.created = u.used WHERE u.created_by = i.created_by AND u.used >= ${since}) END FROM invites i WHERE i.token_hash = ${hash})`

// The start of the UTC day time `now` (epoch ms) falls in.
const utcDayStart = (now: number) => new Date(now).setUTCHours(0, 0, 0, 0)

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

// The invite a link's token names: its network, whether it can still be used, whether a guest made it, and
// whether the daily clearing clears its network (ADR 0008): the guest network, whoever else owns it, and a
// network only guest members own, which it deletes. Null when no invite has that token.
export async function findInvite(db: D1Database, token: string) {
  const row = await db
    .prepare(
      `SELECT i.network_id, n.name, i.used, i.revoked, i.expires, i.guest, n.id = '${GUEST_NETWORK}' OR NOT EXISTS (SELECT 1 FROM memberships o JOIN members m ON m.id = o.member_id WHERE o.network_id = n.id AND o.role = 'owner' AND m.guest = 0) AS cleared_daily FROM invites i JOIN networks n ON n.id = i.network_id WHERE i.token_hash = ?`
    )
    .bind(await sha256(token))
    .first<{
      network_id: string
      name: string
      used: number | null
      revoked: number | null
      expires: number
      guest: number
      cleared_daily: number
    }>()
  if (!row) return null
  const state: InviteState =
    row.used !== null ? 'used' : row.revoked !== null ? 'revoked' : row.expires <= Date.now() ? 'expired' : 'open'
  return {
    networkId: row.network_id,
    network: row.name,
    state,
    guest: row.guest === 1,
    clearedDaily: row.cleared_daily === 1
  }
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

// The API key a request's secret is, its name, and the network it acts for, while it isn't revoked;
// null when no key in use has that secret. A use more than a minute after the last is noted as its
// last use.
export async function apiKeyFor(
  db: D1Database,
  secret: string
): Promise<{ id: string; name: string; networkId: string } | null> {
  const hash = await sha256(secret)
  const row = await db
    .prepare('SELECT id, name, network_id, last_used FROM api_keys WHERE secret_hash = ? AND revoked IS NULL')
    .bind(hash)
    .first<{ id: string; name: string; network_id: string; last_used: number | null }>()
  if (!row) return null
  const now = Date.now()
  if (row.last_used === null || now - row.last_used >= SEEN_EVERY_MS)
    await db.prepare('UPDATE api_keys SET last_used = ? WHERE id = ?').bind(now, row.id).run()
  return { id: row.id, name: row.name, networkId: row.network_id }
}

// Network `networkId`'s name, or null when there's no such network.
export async function networkName(db: D1Database, networkId: string) {
  return db.prepare('SELECT name FROM networks WHERE id = ?').bind(networkId).first<string>('name')
}

// An agent instance to wipe (`destroy`) once the directory or its network has let go of it: its
// binding, such as LaunchAgent, and its name.
export type Instance = { binding: string; name: string }

// Deletes network `networkId` when member `by` is one of its owners, and notes a wipe for each of its
// agent instances, `instances`, in the same batch, so none is left unnoted. Its memberships, invites,
// and API keys go with it, so its pages, agents, and API answer 404 from then on. False when they
// aren't an owner, and nothing was written.
export async function dropNetwork(db: D1Database, networkId: string, by: string, instances: Instance[]) {
  const owner = "EXISTS (SELECT 1 FROM memberships WHERE network_id = ?1 AND member_id = ?2 AND role = 'owner')"
  const now = Date.now()
  const results = await db.batch([
    // Noted before the network goes, while the owner's membership is still there to check.
    ...instances.map(({ binding, name }) =>
      db
        .prepare(`INSERT OR IGNORE INTO wipes (binding, name, created) SELECT ?3, ?4, ?5 WHERE ${owner}`)
        .bind(networkId, by, binding, name, now)
    ),
    db.prepare(`DELETE FROM networks WHERE id = ?1 AND ${owner}`).bind(networkId, by)
  ])
  return results.at(-1)!.meta.changes > 0
}

// The agent instances to wipe (`destroy`) once the directory or their network has let go of them, by
// binding, such as LaunchAgent, and name, and the networks to forget a deleted member (wipe.ts). Each
// is noted before its wipe, those noted together in one batch, and crossed off once the wipe succeeds, so
// the cron can retry any that failed.
export async function noteWipe(db: D1Database, ...instances: Instance[]) {
  const now = Date.now()
  await db.batch(instances.map((instance) => noting(db, instance, now)))
}

// Restores the guest network's name, as the daily cron clears it (wipe.ts), and notes the wipes of
// `instances`, its agent's and its own Qloo gateway instance's, in the same batch.
export async function clearGuestNetwork(db: D1Database, instances: Instance[]) {
  const now = Date.now()
  await db.batch([
    db.prepare('UPDATE networks SET name = ? WHERE id = ?').bind(GUEST_NETWORK_NAME, GUEST_NETWORK),
    ...instances.map((instance) => noting(db, instance, now))
  ])
}

// The note of a wipe of `instance` at time `now`, kept as it was if it's noted already.
const noting = (db: D1Database, { binding, name }: Instance, now: number) =>
  db.prepare('INSERT OR IGNORE INTO wipes (binding, name, created) VALUES (?, ?, ?)').bind(binding, name, now)

export async function wipeDone(db: D1Database, binding: string, name: string) {
  await db.prepare('DELETE FROM wipes WHERE binding = ? AND name = ?').bind(binding, name).run()
}

// The first `limit` wipes noted before `before` (epoch ms) and not yet done, oldest first, and of those
// noted together, a launch's before its network's own Qloo gateway instance's, as the binding's name sorts.
export async function wipesDue(db: D1Database, before: number, limit: number) {
  const { results } = await db
    .prepare('SELECT binding, name FROM wipes WHERE created < ? ORDER BY created, binding, name LIMIT ?')
    .bind(before, limit)
    .all<Instance>()
  return results
}

// What the hourly cron clears: sessions, challenges, and invites that have expired, and the logs of guest
// sign-ins and of sign-ups through guests' invite links from before the UTC day, which no limit counts,
// keeping the last minute's guest sign-ins, which the minute's limit still counts. Returns how many of
// each it deleted.
export async function purgeExpired(db: D1Database) {
  const now = Date.now()
  const day = utcDayStart(now)
  const [sessions, challenges, invites, guestSignIns, guestInvitedSignUps] = await db.batch([
    db.prepare('DELETE FROM sessions WHERE expires <= ?').bind(now),
    db.prepare('DELETE FROM challenges WHERE expires <= ?').bind(now),
    db.prepare('DELETE FROM invites WHERE expires <= ?').bind(now),
    db.prepare('DELETE FROM guest_signins WHERE created < ?').bind(Math.min(day, now - GUEST_SIGNINS_MS)),
    db.prepare('DELETE FROM guest_invited_signups WHERE created < ?').bind(day)
  ])
  return {
    sessions: sessions.meta.changes,
    challenges: challenges.meta.changes,
    invites: invites.meta.changes,
    guestSignIns: guestSignIns.meta.changes,
    guestInvitedSignUps: guestInvitedSignUps.meta.changes
  }
}

// The temporary guest members ADR 0006 made, a member per guest sign-in, by ID: every member marked a guest
// but the guest member (ADR 0008).
const TEMPORARY_GUESTS = `(SELECT id FROM members WHERE guest = 1 AND id != '${GUEST_MEMBER}')`

// Whether a networks row is a network only temporary guest members own, which goes with them: it has an
// owner among them and none who isn't one. Never the guest network, which the guest member owns.
const OWNED_BY_TEMPORARY = `id != '${GUEST_NETWORK}' AND EXISTS (SELECT 1 FROM memberships WHERE network_id = networks.id AND role = 'owner' AND member_id IN ${TEMPORARY_GUESTS}) AND NOT EXISTS (SELECT 1 FROM memberships WHERE network_id = networks.id AND role = 'owner' AND member_id NOT IN ${TEMPORARY_GUESTS})`

// Removes the temporary guest members (ADR 0008), as the daily cron clears what guests made, in one batch
// of bulk statements. The networks only they own are deleted as a deleted network is (dropNetwork), each
// with a wipe of its agent, under `binding`, noted in the batch (wipe.ts). The API keys and invite links
// they made are deleted. Then the members go, their passkeys, sessions, memberships, and past memberships
// with them; nothing in the networks they were in forgets them. Returns how many members and networks it
// removed.
export async function dropTemporaryGuests(db: D1Database, binding: string) {
  const [, networks, , , members] = await db.batch([
    // Noted before the networks go, while their owners' memberships are still there to check.
    db
      .prepare(
        `INSERT OR IGNORE INTO wipes (binding, name, created) SELECT ?1, id, ?2 FROM networks WHERE ${OWNED_BY_TEMPORARY}`
      )
      .bind(binding, Date.now()),
    db.prepare(`DELETE FROM networks WHERE ${OWNED_BY_TEMPORARY} RETURNING id`),
    // Deleted before the members go, while their keys and invites still name them.
    db.prepare(`DELETE FROM api_keys WHERE created_by IN ${TEMPORARY_GUESTS}`),
    db.prepare(`DELETE FROM invites WHERE created_by IN ${TEMPORARY_GUESTS}`),
    db.prepare(`DELETE FROM members WHERE id IN ${TEMPORARY_GUESTS} RETURNING id`)
  ])
  // Counted by the rows each statement returns, as D1's count of changes takes in what they cascade to.
  return { members: members.results.length, networks: networks.results.length }
}

// The networks only the guest member owns besides the guest network, at most `limit`, by ID, as the daily
// cron clears what guests made (wipe.ts).
export async function guestOwnedNetworks(db: D1Database, limit: number) {
  const { results } = await db
    .prepare(
      `SELECT m.network_id AS id FROM memberships m WHERE m.member_id = ?1 AND m.network_id != ?2 AND ${ONLY_OWNER} ORDER BY m.joined, m.network_id LIMIT ?3`
    )
    .bind(GUEST_MEMBER, GUEST_NETWORK, limit)
    .all<{ id: string }>()
  return results.map((n) => n.id)
}

// Clears what the guest member made beyond the guest network (ADR 0008), as the daily cron does, in one
// batch: the networks in `deleting`, while it's still their only owner, are deleted as a deleted network is
// (dropNetwork), with a wipe noted for each of their `instances`; the guest member leaves every other
// network but the guest network, but for one it's the only owner of still, which would be left with none;
// the API keys and invite links it made are deleted, so the guest network's setup starts over; and the
// networks it created that stay no longer count as its (NETWORKS_PER_MEMBER). Returns how many networks it
// deleted, and the networks it left.
export async function clearGuestMember(db: D1Database, deleting: { id: string; instances: Instance[] }[]) {
  const now = Date.now()
  // Whether the guest member, ?2, is still network ?1's only owner.
  const onlyOwner = `EXISTS (SELECT 1 FROM memberships m WHERE m.network_id = ?1 AND m.member_id = ?2 AND ${ONLY_OWNER})`
  const network = (sql: string, id: string, ...values: unknown[]) => db.prepare(sql).bind(id, GUEST_MEMBER, ...values)
  const deleted = deleting.flatMap(({ id, instances }) => [
    // Noted before the network goes, while the guest member's membership is still there to check.
    ...instances.map(({ binding, name }) =>
      network(
        `INSERT OR IGNORE INTO wipes (binding, name, created) SELECT ?3, ?4, ?5 WHERE ${onlyOwner}`,
        id,
        binding,
        name,
        now
      )
    ),
    network(`DELETE FROM networks WHERE id = ?1 AND ${onlyOwner} RETURNING id`, id)
  ])
  const results = await db.batch([
    ...deleted,
    db
      .prepare(
        `DELETE FROM memberships AS m WHERE m.member_id = ?1 AND m.network_id != ?2 AND NOT ${ONLY_OWNER} RETURNING network_id`
      )
      .bind(GUEST_MEMBER, GUEST_NETWORK),
    db.prepare('DELETE FROM api_keys WHERE created_by = ?').bind(GUEST_MEMBER),
    db.prepare('DELETE FROM invites WHERE created_by = ?').bind(GUEST_MEMBER),
    db.prepare('UPDATE networks SET created_by = NULL WHERE created_by = ?').bind(GUEST_MEMBER)
  ])
  // Only a network's deletion returns a row, its ID, and only where it went.
  return {
    networks: results.slice(0, deleted.length).filter((r) => r.results.length > 0).length,
    left: (results[deleted.length].results as { network_id: string }[]).map((r) => r.network_id)
  }
}

// A new passkey for member `memberId`, added only if they exist, as a sign-up's member may not, and aren't
// marked a guest.
const insertPasskey = (
  db: D1Database,
  memberId: string,
  passkey: Omit<Passkey, 'memberId'>,
  label: string,
  now: number
) =>
  db
    .prepare(
      'INSERT INTO passkeys (credential_id, member_id, public_key, counter, transports, label, created) SELECT ?, id, ?, ?, ?, ?, ? FROM members WHERE id = ? AND guest = 0'
    )
    .bind(
      passkey.credentialId,
      passkey.publicKey,
      passkey.counter,
      passkey.transports && JSON.stringify(passkey.transports),
      label,
      now,
      memberId
    )

// A new session for member `memberId`, started only if they exist, as a sign-up's member may not, by a
// user-verified passkey, which proves them there.
const insertSession = (db: D1Database, tokenHash: string, memberId: string, now: number) =>
  db
    .prepare(
      'INSERT INTO sessions (token_hash, member_id, created, expires, last_seen, verified) SELECT ?1, id, ?2, ?3, ?2, ?2 FROM members WHERE id = ?4'
    )
    .bind(tokenHash, now, now + SESSION_MS, memberId)

// Uses the invite with token hash `hash` for member `memberId` and adds them to its network as a
// member: the first statement marks it used while it's open, they exist, as a sign-up's member may
// not, and they aren't in the network yet, returning its network; the second adds the membership only
// that use wrote. Run in a batch, so no other use comes between.
const joinThrough = (db: D1Database, hash: string, memberId: string, now: number) => [
  db
    .prepare(
      'UPDATE invites SET used = ?1, used_by = ?2 WHERE token_hash = ?3 AND used IS NULL AND revoked IS NULL AND expires > ?1 AND EXISTS (SELECT 1 FROM members WHERE id = ?2) AND NOT EXISTS (SELECT 1 FROM memberships WHERE network_id = invites.network_id AND member_id = ?2) RETURNING network_id'
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
