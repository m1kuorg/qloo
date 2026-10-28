-- Migration number: 0012 	 2026-10-29T00:00:00.000Z
-- When the guest network's sample data was last reset from its settings (#283), and how many times in that
-- UTC day (`day`, its 00:00 in ms), so it resets at most once a minute and SAMPLE_RESETS_PER_DAY times a
-- day for everyone, whoever asks and from wherever (src/directory.ts). One row at most, kept as each reset
-- replaces it, so nothing needs purging.
CREATE TABLE sample_resets (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  at INTEGER NOT NULL,
  day INTEGER NOT NULL,
  count INTEGER NOT NULL
);
