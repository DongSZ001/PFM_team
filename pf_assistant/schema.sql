-- PFM2 WebUI Database Schema
-- SQLite 3

-- ============================================================
-- users: 用户表
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  organization TEXT NOT NULL DEFAULT '',
  email        TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================================
-- chat_sessions: 聊天会话表
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
-- chat_messages: 聊天消息表
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
