-- Migration number: 0008 	 2026-10-28T15:00:00.000Z
-- Every sign-up through an invite link a guest member made (ADR 0006, #273), by when it was. The new
-- accounts guests' links bring in share one daily count, counted here, so deleting a link's network or its
-- guest never lowers it, as it lowered the count of used links in the invites table, which go with their
-- network. The links already used are counted from that table once, and the cron prunes the rows from
-- before the UTC day, as it does the guest sign-ins'.
CREATE TABLE guest_invited_signups (created INTEGER NOT NULL);
CREATE INDEX guest_invited_signups_created ON guest_invited_signups (created);
INSERT INTO guest_invited_signups (created)
SELECT u.used FROM invites u JOIN members m ON m.id = u.used_by AND m.created = u.used WHERE u.guest = 1;

-- Removing expired guest members finds them by when they signed in.
CREATE INDEX members_guest_created ON members (created) WHERE guest = 1;
