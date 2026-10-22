-- Migration number: 0002 	 2026-10-22T08:00:00.000Z
-- Step-up (#217): when each session last proved its member was there, with a user-verified passkey or
-- the recovery code it signed in with, and whether it signed in with that code, which can then prove
-- it again. Adding a passkey, a new recovery code, and deleting the account need a proof from the last
-- five minutes. A session from before has none, so its first such change asks for one.
ALTER TABLE sessions ADD COLUMN verified INTEGER;
ALTER TABLE sessions ADD COLUMN recovered INTEGER NOT NULL DEFAULT 0;
