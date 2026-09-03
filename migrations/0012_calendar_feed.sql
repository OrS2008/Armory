-- A calendar subscription is a bearer credential carried in a URL: whoever
-- holds the URL reads that person's duty times, because a calendar app cannot
-- sign in. Only the hash is stored, the way a session token is, so a copy of
-- this table is not a set of working links — and issuing a new one silently
-- retires the old, which is what "I shared it by mistake" needs.
ALTER TABLE users ADD COLUMN calendar_token_hash TEXT;
ALTER TABLE users ADD COLUMN calendar_issued_at INTEGER;
CREATE UNIQUE INDEX idx_users_calendar_token
  ON users(calendar_token_hash) WHERE calendar_token_hash IS NOT NULL;
