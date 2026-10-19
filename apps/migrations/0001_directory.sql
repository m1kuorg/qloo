-- Migration number: 0001 	 2026-10-19T07:20:03.850Z
-- The directory (ADR 0001): who each member is, how they sign in, and which networks they belong
-- to. Everything a network works on lives in its NetworkAgent and LaunchAgents instead. Times are
-- epoch ms. Session and invite tokens, recovery codes, and API key secrets are random, sent once,
-- and stored only as SHA-256 hashes.

-- A member. The random ID doubles as the WebAuthn user handle of each of their passkeys. The
-- recovery code's hash is replaced each time the code is used, and it alone names the member when
-- they sign in with it.
CREATE TABLE members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  recovery_code_hash TEXT NOT NULL UNIQUE,
  created INTEGER NOT NULL
);

-- A member's passkeys, by the credential ID their authenticator made (base64url), with its public
-- key (base64url), signature counter, transports (a JSON array), and a label naming the browser it
-- was added from.
CREATE TABLE passkeys (
  credential_id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL,
  transports TEXT NOT NULL,
  label TEXT NOT NULL,
  created INTEGER NOT NULL,
  last_used INTEGER
);
CREATE INDEX passkeys_member ON passkeys (member_id);

-- A signed-in browser, by the hash of its cookie's token.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE INDEX sessions_member ON sessions (member_id);
CREATE INDEX sessions_expires ON sessions (expires);

-- A passkey ceremony's challenge (base64url), deleted once it's used. `kind` names the ceremony,
-- such as a sign-up, a sign-in, or adding a passkey. A sign-up keeps the name it asked for and the
-- ID its member will get; adding a passkey keeps the signed-in member's. `member_id` has no foreign
-- key, since a sign-up's member is written only after its registration verifies.
CREATE TABLE challenges (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  challenge TEXT NOT NULL,
  name TEXT,
  member_id TEXT,
  expires INTEGER NOT NULL
);

CREATE TABLE networks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created INTEGER NOT NULL
);

-- Who belongs to which network, and as what. `last_opened` picks the network /app opens.
CREATE TABLE memberships (
  network_id TEXT NOT NULL REFERENCES networks (id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  joined INTEGER NOT NULL,
  last_opened INTEGER,
  PRIMARY KEY (network_id, member_id)
);
CREATE INDEX memberships_member ON memberships (member_id);

-- An invite link, by the hash of its token. It works once: `used` is when it was, and stays set
-- after the member who used it goes.
CREATE TABLE invites (
  token_hash TEXT PRIMARY KEY,
  network_id TEXT NOT NULL REFERENCES networks (id) ON DELETE CASCADE,
  created_by TEXT REFERENCES members (id) ON DELETE SET NULL,
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL,
  used INTEGER,
  used_by TEXT REFERENCES members (id) ON DELETE SET NULL,
  revoked INTEGER
);
CREATE INDEX invites_network ON invites (network_id);

-- A network's API keys. The key is `cf_live_<random>`, `prefix` its first 12 characters, shown in
-- settings; a request names its key by the secret's hash.
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  network_id TEXT NOT NULL REFERENCES networks (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  secret_hash TEXT NOT NULL UNIQUE,
  created_by TEXT REFERENCES members (id) ON DELETE SET NULL,
  created INTEGER NOT NULL,
  last_used INTEGER,
  revoked INTEGER
);
CREATE INDEX api_keys_network ON api_keys (network_id);
