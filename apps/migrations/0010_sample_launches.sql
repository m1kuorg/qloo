-- Migration number: 0010 	 2026-10-29T00:00:00.000Z
-- The guest network's sample launches beside The Watch (ADR 0007, #289): one launch in each of a few
-- statuses, each a run captured from real runs on a development guest network, as JSON in chunks, in
-- order by `seq`, so no statement passes D1's 100 KB limit (src/sample-launch.ts). They hold Qloo data,
-- so the table starts empty, and its rows are loaded into each environment's database by hand, from what
-- scripts/capture-sample-launches.ts writes outside the repo (apps/README.md); with none, the guest network
-- opens with The Watch alone.
CREATE TABLE sample_launches (
  key TEXT NOT NULL,
  seq INTEGER NOT NULL,
  chunk TEXT NOT NULL,
  PRIMARY KEY (key, seq)
);
