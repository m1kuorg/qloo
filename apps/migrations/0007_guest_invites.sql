-- Migration number: 0007 	 2026-10-28T12:00:00.000Z
-- Marks each invite link a guest member makes (ADR 0006, #271): the invited sign-ups through every
-- guest's links share one daily count, whoever made each, and whether or not they're still there.
ALTER TABLE invites ADD COLUMN guest INTEGER NOT NULL DEFAULT 0;
