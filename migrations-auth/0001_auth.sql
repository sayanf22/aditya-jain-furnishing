-- Migration number: 0001 	 2026-11-20
-- Admin sign-in, database AUTH_DB. Nothing here is ever read by a public
-- page or by the site build.
--
-- Passwords: PBKDF2-SHA256 (20,000 rounds, the most the Workers Free CPU
-- limit allows alongside a 10 ms budget) over HMAC-SHA256(SESSION_PEPPER,
-- password), so a copy of this table alone cannot be cracked offline.
-- Sessions: the cookie holds a random token; only its SHA-256 is stored.

CREATE TABLE admin_users (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  email                TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name         TEXT,
  pw_salt              TEXT NOT NULL,          -- base64url, 16 random bytes
  pw_hash              TEXT NOT NULL,          -- base64url
  pw_iterations        INTEGER NOT NULL,
  totp_secret          TEXT,                   -- AES-GCM encrypted; NULL = authenticator app not set up
  totp_enabled         INTEGER NOT NULL DEFAULT 0,
  totp_last_step       INTEGER,                -- last accepted 30 s step (stops code replay)
  disabled             INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  password_changed_at  TEXT,
  last_login_at        TEXT
);

CREATE TABLE sessions (
  id               TEXT PRIMARY KEY,           -- hex SHA-256 of the cookie token
  user_id          INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  csrf             TEXT NOT NULL,              -- sent back by the dashboard in X-CSRF-Token
  created_at       INTEGER NOT NULL,           -- unix seconds
  last_seen_at     INTEGER NOT NULL,
  idle_expires_at  INTEGER NOT NULL,
  expires_at       INTEGER NOT NULL,           -- absolute
  ip_hash          TEXT,
  user_agent       TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expiry ON sessions(expires_at);

-- Failed and successful sign-in tries, by hashed address and by hashed email,
-- for throttling and lock-out. Old rows are deleted as new ones arrive.
CREATE TABLE login_attempts (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  kind      TEXT NOT NULL CHECK (kind IN ('ip', 'email')),
  key_hash  TEXT NOT NULL,
  at        INTEGER NOT NULL,                  -- unix seconds
  ok        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_login_attempts_key ON login_attempts(kind, key_hash, at);
