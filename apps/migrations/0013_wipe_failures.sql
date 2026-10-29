-- Migration number: 0013 	 2026-10-29T00:00:00.000Z
-- When the hourly retry last tried each wipe and it failed (src/wipe.ts, #275), so a run takes the wipes no
-- run has tried first, then those that failed, the least recently tried first, and wipes that fail every
-- time can't fill every run and hold back the rest. Null for a wipe no run has tried, as for every wipe
-- noted before this. A wipe that succeeds is deleted, so a time here is always a failure's.
ALTER TABLE wipes ADD COLUMN failed INTEGER;
