-- Migration number: 0003 	 2026-11-23
-- Emailed sign-in code (one-time code) required after the password, database AUTH_DB.
-- A challenge starts when the password was right: the browser gets a random token (only its
-- SHA-256 is stored here), the emailed 6-digit code is stored only as a peppered hash, the
-- code lives 10 minutes, allows 5 wrong tries, works once and can be re-sent 3 times.

CREATE TABLE login_challenges (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,          -- hex SHA-256 of the token held by the browser
  code_hash     TEXT NOT NULL,                 -- hex HMAC-SHA256(SESSION_PEPPER, user id and code)
  created_at    INTEGER NOT NULL,              -- unix seconds
  expires_at    INTEGER NOT NULL,
  tries         INTEGER NOT NULL DEFAULT 0,
  sends         INTEGER NOT NULL DEFAULT 1,
  last_sent_at  INTEGER NOT NULL,
  used_at       INTEGER
);
CREATE INDEX idx_login_challenges_user ON login_challenges(user_id, used_at, expires_at);
