-- Migration number: 0011 	 2026-10-29T00:00:00.000Z
-- Why each agent instance still to wipe is going, as its open pages are told when its wipe closes them
-- (src/wipe.ts, #289): that the guest network was cleared, for the launches the daily clearing leaves to
-- the hourly retry, or that the launch or its network was deleted. A launch's agent its network no longer
-- lists reads it too, to say why it takes no more work. Null for a wipe noted before this, and for one
-- noted with no reason, whose launch says it was deleted.
ALTER TABLE wipes ADD COLUMN reason TEXT;
