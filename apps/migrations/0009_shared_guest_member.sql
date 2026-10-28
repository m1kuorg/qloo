-- Migration number: 0009 	 2026-10-28T18:00:00.000Z
-- One guest member again (ADR 0008, #278): everyone who signs in as a guest is signed in as it, "Guest",
-- under the fixed ID src/text.ts names it by, an owner of the guest network. It's marked a guest, has no
-- passkey, and its recovery code hash is no SHA-256 output (64 hex digits), so no recovery code names it.
-- The guest network's row is made again if it's gone, and a `member` row of the guest member's is made an
-- owner's. Nothing is deleted, so the code from before it, which makes a guest member per sign-in, runs on
-- beside it: the daily clearing removes those temporary members (src/wipe.ts). The index that found them
-- by when they signed in goes; 0006's indexes on who made each invite link and API key stay.
INSERT OR IGNORE INTO networks (id, name, created_by, created)
VALUES ('guest-network', 'Guest network', NULL, CAST(strftime('%s', 'now') AS INTEGER) * 1000);
INSERT OR IGNORE INTO members (id, name, recovery_code_hash, created, guest)
VALUES ('guest-member', 'Guest', 'none: the guest member has no recovery code', CAST(strftime('%s', 'now') AS INTEGER) * 1000, 1);
INSERT INTO memberships (network_id, member_id, role, joined, last_opened)
VALUES ('guest-network', 'guest-member', 'owner', CAST(strftime('%s', 'now') AS INTEGER) * 1000, NULL)
ON CONFLICT (network_id, member_id) DO UPDATE SET role = 'owner';
DROP INDEX members_guest_created;
