-- Migration number: 0002
-- Sign-in by an emailed code (for a forgotten password), database AUTH_DB.
--
-- email_codes: one row per code sent. Only a peppered HMAC of the code is
-- stored (never the code). A code lives 10 minutes, works once, and dies after
-- 5 wrong tries.
-- email_code_requests: every request for a code, by pseudonym of the email
-- address, of the visitor's address, and one global key. Counted whether or
-- not the email belongs to the owner, so the throttle shows nothing.
-- sessions.recovery: 1 for the short session a code opens. It can only set a
-- new password (and sign out) until the password is changed.
CREATE TABLE email_codes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,                   -- hex HMAC-SHA256(SESSION_PEPPER, user id and code)
  created_at  INTEGER NOT NULL,                -- unix seconds
  expires_at  INTEGER NOT NULL,
  tries       INTEGER NOT NULL DEFAULT 0,
  used_at     INTEGER
);
CREATE INDEX idx_email_codes_user ON email_codes(user_id, used_at, expires_at);
CREATE TABLE email_code_requests (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  key_hash  TEXT NOT NULL,                     -- pseudonym: email, address, or 'global'
  at        INTEGER NOT NULL
);
CREATE INDEX idx_email_code_requests_key ON email_code_requests(key_hash, at);
ALTER TABLE sessions ADD COLUMN recovery INTEGER NOT NULL DEFAULT 0;
