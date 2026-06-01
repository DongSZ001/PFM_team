/**
 * Database initialization and helper functions
 * Uses better-sqlite3 for synchronous SQLite operations
 */

const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcrypt');

const DB_PATH = path.join(__dirname, 'data', 'app.db');
const SALT_ROUNDS = 12;

let db = null;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDb() {
  const database = getDb();

  // Create users table
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      organization TEXT NOT NULL DEFAULT '',
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  // Create chat_sessions table
  database.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '新对话',
      openclaw_session_key TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create chat_messages table
  database.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
    )
  `);

  // Create indexes
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON chat_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_session_id ON chat_messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `);

  console.log('[db] Database initialized at:', DB_PATH);
  return database;
}

// ============ User Operations ============

function generateId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function createUser(organization, email, password) {
  const database = getDb();
  const id = generateId();
  const password_hash = bcrypt.hashSync(password, SALT_ROUNDS);
  const created_at = Date.now();

  try {
    const stmt = database.prepare(`
      INSERT INTO users (id, organization, email, password_hash, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(id, organization, email, password_hash, created_at);
    return { id, organization, email, created_at };
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed: users.email')) {
      throw new Error('邮箱已被注册');
    }
    throw err;
  }
}

function verifyUser(email, password) {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM users WHERE email = ?');
  const user = stmt.get(email);

  if (!user) return null;
  if (!bcrypt.compareSync(password, user.password_hash)) return null;

  return {
    id: user.id,
    organization: user.organization,
    email: user.email,
    created_at: user.created_at
  };
}

function getUserById(id) {
  const database = getDb();
  const stmt = database.prepare('SELECT id, organization, email, created_at FROM users WHERE id = ?');
  return stmt.get(id);
}

// ============ Chat Session Operations ============

function createChatSession(userId, openclawSessionKey = null) {
  const database = getDb();
  const id = generateId();
  const now = Date.now();

  const stmt = database.prepare(`
    INSERT INTO chat_sessions (id, user_id, title, openclaw_session_key, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, userId, '新对话', openclawSessionKey, now, now);
  return { id, title: '新对话', openclaw_session_key: openclawSessionKey, created_at: now, updated_at: now };
}

function getChatSessions(userId) {
  const database = getDb();
  const stmt = database.prepare(`
    SELECT id, title, openclaw_session_key, created_at, updated_at
    FROM chat_sessions
    WHERE user_id = ?
    ORDER BY updated_at DESC
  `);
  return stmt.all(userId);
}

function getChatSession(sessionId, userId) {
  const database = getDb();
  const stmt = database.prepare(`
    SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?
  `);
  return stmt.get(sessionId, userId);
}

function updateChatSessionTitle(sessionId, userId, title) {
  const database = getDb();
  const stmt = database.prepare(`
    UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?
  `);
  return stmt.run(title, Date.now(), sessionId, userId);
}

function updateChatSessionOpenclawKey(sessionId, userId, openclawSessionKey) {
  const database = getDb();
  const stmt = database.prepare(`
    UPDATE chat_sessions SET openclaw_session_key = ?, updated_at = ? WHERE id = ? AND user_id = ?
  `);
  return stmt.run(openclawSessionKey, Date.now(), sessionId, userId);
}

function touchSession(sessionId) {
  const database = getDb();
  const stmt = database.prepare('UPDATE chat_sessions SET updated_at = ? WHERE id = ?');
  stmt.run(Date.now(), sessionId);
}

function deleteChatSession(sessionId, userId) {
  const database = getDb();
  const stmt = database.prepare('DELETE FROM chat_sessions WHERE id = ? AND user_id = ?');
  return stmt.run(sessionId, userId);
}

// ============ Chat Message Operations ============

function saveChatMessage(sessionId, role, content) {
  const database = getDb();
  const id = generateId();
  const created_at = Date.now();

  const stmt = database.prepare(`
    INSERT INTO chat_messages (id, session_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(id, sessionId, role, content, created_at);

  // Update session timestamp
  touchSession(sessionId);

  return { id, session_id: sessionId, role, content, created_at };
}

function getChatMessages(sessionId) {
  const database = getDb();
  const stmt = database.prepare(`
    SELECT role, content, created_at FROM chat_messages
    WHERE session_id = ?
    ORDER BY created_at ASC
  `);
  return stmt.all(sessionId);
}

// ============ Session Store (in-memory for active OpenClaw sessions) ============

const activeSessions = new Map(); // openclawSessionKey -> { userId, chatSessionId }

function setActiveSession(openclawSessionKey, userId, chatSessionId) {
  activeSessions.set(openclawSessionKey, { userId, chatSessionId });
}

function getActiveSession(openclawSessionKey) {
  return activeSessions.get(openclawSessionKey) || null;
}

function removeActiveSession(openclawSessionKey) {
  activeSessions.delete(openclawSessionKey);
}

// Find existing OpenClaw session for a user (for session recovery)
function findUserActiveSession(userId) {
  const database = getDb();
  const stmt = database.prepare(`
    SELECT id, openclaw_session_key FROM chat_sessions
    WHERE user_id = ? AND openclaw_session_key IS NOT NULL
    ORDER BY updated_at DESC LIMIT 1
  `);
  return stmt.get(userId) || null;
}

module.exports = {
  initDb,
  getDb,
  createUser,
  verifyUser,
  getUserById,
  createChatSession,
  getChatSessions,
  getChatSession,
  updateChatSessionTitle,
  updateChatSessionOpenclawKey,
  touchSession,
  deleteChatSession,
  saveChatMessage,
  getChatMessages,
  setActiveSession,
  getActiveSession,
  removeActiveSession,
  findUserActiveSession
};
