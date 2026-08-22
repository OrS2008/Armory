-- Two-factor authentication.
--
-- users.mfa_enabled has existed since the first migration with nothing behind
-- it. The secret lives next to it, and the recovery codes get their own table
-- because each one is used at most once and that has to be recorded.

ALTER TABLE users ADD COLUMN mfa_secret TEXT;

CREATE TABLE mfa_recovery_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_mfa_recovery_user ON mfa_recovery_codes(user_id);

-- A password that has been checked but not yet completed with a code. Short
-- lived, single use, and never a session: until the second factor arrives the
-- browser holds nothing that authorises anything.
CREATE TABLE mfa_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_mfa_challenges_expires ON mfa_challenges(expires_at);
