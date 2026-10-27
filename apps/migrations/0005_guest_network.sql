-- Migration number: 0005 	 2026-10-27T09:00:00.000Z
-- The guest network (ADR 0005, #260): the guest member, whom everyone who signs in as a guest is
-- signed in as, the guest network they share, and the guest member's membership of it, under the fixed
-- IDs src/directory.ts names them by. An agent's name splits on ':', so neither ID has one. The guest
-- member has no passkey, and its recovery code hash is no SHA-256 output (64 hex digits), so no
-- recovery code names it. The guest network has no owner, and no member created it, so it counts
-- against no one's networks. Guest sign-ins a minute are counted by the guest sessions created in the
-- last minute, which the index finds without reading the guest member's older sessions.
INSERT INTO members (id, name, recovery_code_hash, created)
VALUES ('guest-member', 'Guest', 'none: the guest member has no recovery code', CAST(strftime('%s', 'now') AS INTEGER) * 1000);
INSERT INTO networks (id, name, created_by, created)
VALUES ('guest-network', 'Guest network', NULL, CAST(strftime('%s', 'now') AS INTEGER) * 1000);
INSERT INTO memberships (network_id, member_id, role, joined, last_opened)
VALUES ('guest-network', 'guest-member', 'member', CAST(strftime('%s', 'now') AS INTEGER) * 1000, NULL);
CREATE INDEX sessions_member_created ON sessions (member_id, created);
