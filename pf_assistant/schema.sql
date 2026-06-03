-- PFM2 WebUI Database Schema (v2.0)
-- SQLite 3
--
-- User lifecycle is intentionally simple:
--   - register → status = 'active' (no email verification, no admin review)
--   - admin can flip status to 'disabled' to block a user
--   - chat sessions and messages are tied to the user via CASCADE delete
--   - password reset uses single-use, hashed, expiring tokens

-- ============================================================
-- users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id                    TEXT PRIMARY KEY,
  email                 TEXT UNIQUE NOT NULL,
  password_hash         TEXT NOT NULL,
  institution_name      TEXT NOT NULL DEFAULT '',
  institution_type      TEXT NOT NULL DEFAULT '',
  contact_name          TEXT NOT NULL DEFAULT '',
  role                  TEXT NOT NULL DEFAULT '',
  intended_use          TEXT NOT NULL DEFAULT '',
  notes                 TEXT NOT NULL DEFAULT '',
  email_domain          TEXT NOT NULL DEFAULT '',
  email_domain_category TEXT NOT NULL DEFAULT 'uncertain',  -- institutional | uncertain
  status                TEXT NOT NULL DEFAULT 'active',     -- active | disabled
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  last_login_at         INTEGER
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================================
-- password_reset_tokens
-- Stores SHA-256 hash of the token. Token plaintext is sent to the user once.
-- ============================================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reset_user_id     ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_reset_token_hash  ON password_reset_tokens(token_hash);

-- ============================================================
-- chat_sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_sessions (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL,
  title                TEXT NOT NULL DEFAULT '新对话',
  openclaw_session_key TEXT,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON chat_sessions(user_id);

-- ============================================================
-- chat_messages
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role       TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_session_id ON chat_messages(session_id);
