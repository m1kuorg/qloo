-- Migration number: 0013 	 2026-10-29T00:00:00.000Z
-- When the hourly retry last tried each wipe (src/wipe.ts, #275), noted as a run takes it, before the run
-- tries it, so a run takes the wipes no run has tried first, then those tried before, the least recently
-- tried first, and wipes that fail every time, or whose run is cut off as it tries them, can't hold back
-- the rest. Null for a wipe no run has tried, as for every wipe noted before this. A wipe that succeeds is
-- deleted, so a time here is a wipe's that failed or never finished.
ALTER TABLE wipes ADD COLUMN tried INTEGER;
