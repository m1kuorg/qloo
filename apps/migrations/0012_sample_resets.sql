-- Migration number: 0012 	 2026-10-29T00:00:00.000Z
-- When the guest network's sample data was last reset from its settings (#283), so it resets at most
-- once a minute for everyone, whichever guest asks and from wherever (src/directory.ts). One row at most,
-- kept as each reset replaces it, so nothing needs purging.
CREATE TABLE sample_resets (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  at INTEGER NOT NULL
);
