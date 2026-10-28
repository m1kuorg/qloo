-- Migration number: 0006 	 2026-10-28T09:00:00.000Z
-- A guest member for each guest sign-in (ADR 0006, #270), in place of migration 0005's one guest member.
-- `guest` marks a member who signed in as a guest and hasn't kept the account; keeping it clears the
-- mark, so the mark, not the `guest-` start of the ID, says whether a member is still a guest.
ALTER TABLE members ADD COLUMN guest INTEGER NOT NULL DEFAULT 0;

-- Every guest sign-in, by when it was. Guest sign-ins a minute and a UTC day are counted here, in the
-- batch that writes the guest member, so deleting sessions or accounts never makes room for more.
CREATE TABLE guest_signins (created INTEGER NOT NULL);
CREATE INDEX guest_signins_created ON guest_signins (created);

-- The columns removing expired guest members joins on: who made each invite link and API key, and who
-- used each invite.
CREATE INDEX invites_created_by ON invites (created_by);
CREATE INDEX invites_used_by ON invites (used_by);
CREATE INDEX api_keys_created_by ON api_keys (created_by);

-- The shared guest member goes, its membership and sessions with it, by cascade; the guest network
-- stays. Guest sessions were counted by the index 0005 made, which nothing reads now.
DELETE FROM members WHERE id = 'guest-member';
DROP INDEX sessions_member_created;
