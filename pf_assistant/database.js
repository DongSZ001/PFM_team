/**
 * Database initialization and helper functions
 * Uses better-sqlite3 for synchronous SQLite operations
 *
 * Schema version: 2.0
 *   - users table extended with institution / role / intended_use / notes
 *     / email_domain / email_domain_category / status / last_login_at
 *   - password_reset_tokens table for forgot-password flow
 */

const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcrypt');
const { classifyEmail } = require('./email-classifier');
const paths = require('./src/config/paths');

const DB_PATH = process.env.PF_ASSISTANT_DB_PATH || paths.databaseFile;
const SALT_ROUNDS = 12;

let db = null;

function getDbPath() {
  return DB_PATH;
}

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function closeDbForTests() {
  if (!db) return;
  db.close();
  db = null;
}

function initDb() {
  const database = getDb();

  // ===== users table =====
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id                      TEXT PRIMARY KEY,
      email                   TEXT UNIQUE NOT NULL,
      password_hash           TEXT NOT NULL,
      institution_name        TEXT NOT NULL DEFAULT '',
      institution_type        TEXT NOT NULL DEFAULT '',
      contact_name            TEXT NOT NULL DEFAULT '',
      role                    TEXT NOT NULL DEFAULT '',
      intended_use            TEXT NOT NULL DEFAULT '',
      notes                   TEXT NOT NULL DEFAULT '',
      email_domain            TEXT NOT NULL DEFAULT '',
      email_domain_category   TEXT NOT NULL DEFAULT 'uncertain',
      status                  TEXT NOT NULL DEFAULT 'active',
      created_at              INTEGER NOT NULL,
      updated_at              INTEGER NOT NULL,
      last_login_at           INTEGER
    )
  `);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);

  // ===== password reset tokens =====
  database.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      token_hash  TEXT NOT NULL,
      expires_at  INTEGER NOT NULL,
      used_at     INTEGER,
      created_at  INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_reset_user_id ON password_reset_tokens(user_id)`);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_reset_token_hash ON password_reset_tokens(token_hash)`);

  // ===== chat_sessions =====
  database.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id                   TEXT PRIMARY KEY,
      user_id              TEXT NOT NULL,
      title                TEXT NOT NULL DEFAULT '新对话',
      openclaw_session_key TEXT,
      created_at           INTEGER NOT NULL,
      updated_at           INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON chat_sessions(user_id)`);

  // ===== chat_messages =====
  database.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id         TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role       TEXT NOT NULL,
      content    TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
    )
  `);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_messages_session_id ON chat_messages(session_id)`);

  // ===== migration: add columns to old users table if upgrading =====
  migrateUsersTable(database);

  // ===== material parameters tables (magnetic + extensible) =====
  initMaterialTables(database);
  ensureParameterDefinitions(database);

  console.log('[db] Database initialized at:', DB_PATH);
  return database;
}

// ============ Material Parameters Schema ============

/**
 * Idempotent schema for the material parameters subsystem.
 * Existing auth/chat tables are untouched.
 */
function initMaterialTables(database) {
  // materials: a material or stack structure.
  database.exec(`
    CREATE TABLE IF NOT EXISTS materials (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      material_key      TEXT UNIQUE NOT NULL,
      display_name      TEXT NOT NULL,
      stack_structure   TEXT,
      material_family   TEXT,
      magnetic_layer    TEXT,
      substrate         TEXT,
      notes             TEXT,
      created_at        INTEGER NOT NULL,
      updated_at        INTEGER NOT NULL
    )
  `);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_materials_key ON materials(material_key)`);

  // sources: bibliographic info.
  database.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      first_author TEXT,
      authors     TEXT,
      journal     TEXT,
      year        INTEGER,
      title       TEXT,
      doi         TEXT,
      source_note TEXT,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    )
  `);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_sources_year ON sources(year)`);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_sources_first_author ON sources(first_author)`);

  // parameter_sets: a single named bundle of parameters for one material+source.
  database.exec(`
    CREATE TABLE IF NOT EXISTS parameter_sets (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id         INTEGER NOT NULL,
      source_id           INTEGER,
      set_name            TEXT NOT NULL,
      set_type            TEXT NOT NULL DEFAULT 'unknown',
      simulation_context  TEXT NOT NULL DEFAULT 'unknown',
      is_default          INTEGER NOT NULL DEFAULT 0,
      confidence_level    TEXT NOT NULL DEFAULT 'unknown',
      notes               TEXT,
      created_at          INTEGER NOT NULL,
      updated_at          INTEGER NOT NULL,
      FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE,
      FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE SET NULL
    )
  `);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_param_sets_material ON parameter_sets(material_id)`);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_param_sets_source ON parameter_sets(source_id)`);
  database.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uq_param_sets_name ON parameter_sets(material_id, set_name)`);

  // parameter_definitions: catalogue of known parameters.
  database.exec(`
    CREATE TABLE IF NOT EXISTS parameter_definitions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      parameter_key TEXT UNIQUE NOT NULL,
      display_name  TEXT NOT NULL,
      category      TEXT NOT NULL DEFAULT 'other',
      si_unit       TEXT NOT NULL DEFAULT '',
      display_unit  TEXT NOT NULL DEFAULT '',
      value_type    TEXT NOT NULL DEFAULT 'number',
      description   TEXT,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    )
  `);

  // parameter_values: a single value (numeric / range / text) for a parameter.
  database.exec(`
    CREATE TABLE IF NOT EXISTS parameter_values (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      parameter_set_id        INTEGER NOT NULL,
      parameter_definition_id INTEGER NOT NULL,
      value_si                REAL,
      value_min_si            REAL,
      value_max_si            REAL,
      text_value              TEXT,
      raw_value               TEXT,
      raw_unit                TEXT,
      is_derived              INTEGER NOT NULL DEFAULT 0,
      derivation_note         TEXT,
      import_warning          TEXT,
      notes                   TEXT,
      created_at              INTEGER NOT NULL,
      updated_at              INTEGER NOT NULL,
      FOREIGN KEY (parameter_set_id) REFERENCES parameter_sets(id) ON DELETE CASCADE,
      FOREIGN KEY (parameter_definition_id) REFERENCES parameter_definitions(id) ON DELETE RESTRICT
    )
  `);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_param_values_set ON parameter_values(parameter_set_id)`);
  database.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uq_param_values_set_def ON parameter_values(parameter_set_id, parameter_definition_id)`);

  // import_batches: tracks every Excel import.
  database.exec(`
    CREATE TABLE IF NOT EXISTS import_batches (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      source_file_name TEXT NOT NULL,
      sheet_name      TEXT NOT NULL,
      imported_rows   INTEGER NOT NULL DEFAULT 0,
      skipped_rows    INTEGER NOT NULL DEFAULT 0,
      warning_count   INTEGER NOT NULL DEFAULT 0,
      notes           TEXT,
      created_at      INTEGER NOT NULL
    )
  `);

  // import_warnings: granular per-row / per-column notes.
  database.exec(`
    CREATE TABLE IF NOT EXISTS import_warnings (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      import_batch_id   INTEGER NOT NULL,
      row_index         INTEGER,
      column_name       TEXT,
      raw_value         TEXT,
      warning_type      TEXT,
      message           TEXT,
      created_at        INTEGER NOT NULL,
      FOREIGN KEY (import_batch_id) REFERENCES import_batches(id) ON DELETE CASCADE
    )
  `);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_warnings_batch ON import_warnings(import_batch_id)`);
}

/**
 * Seed parameter_definitions (upsert by parameter_key).  Safe to call on
 * every startup — duplicates are skipped.
 */
function ensureParameterDefinitions(database) {
  const { DEFAULT_PARAMETER_DEFINITIONS } = require('./parameter-definitions-seed');
  const now = Date.now();
  const insert = database.prepare(`
    INSERT INTO parameter_definitions
      (parameter_key, display_name, category, si_unit, display_unit, value_type, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(parameter_key) DO UPDATE SET
      display_name = excluded.display_name,
      category     = excluded.category,
      si_unit      = excluded.si_unit,
      display_unit = excluded.display_unit,
      value_type   = excluded.value_type,
      description  = excluded.description,
      updated_at   = excluded.updated_at
  `);
  const tx = database.transaction((rows) => {
    for (const r of rows) {
      insert.run(
        r.parameter_key,
        r.display_name,
        r.category,
        r.si_unit,
        r.display_unit,
        r.value_type,
        r.description || '',
        now,
        now,
      );
    }
  });
  tx(DEFAULT_PARAMETER_DEFINITIONS);
}

/**
 * Idempotent migration for users table — adds new columns if they don't exist,
 * backfills email_domain + email_domain_category for legacy rows, and copies
 * the old `organization` value into `institution_name`.
 */
function migrateUsersTable(database) {
  const cols = database.prepare(`PRAGMA table_info(users)`).all();
  const have = new Set(cols.map((c) => c.name));
  const now = Date.now();

  // Drop `organization` only if it still exists and new columns are present
  // (i.e. this is a true upgrade from v1.x). We keep the legacy column empty
  // rather than dropping it to avoid schema churn for already-deployed sites.
  // No-op if not present.

  if (!have.has('institution_name')) {
    database.exec(`ALTER TABLE users ADD COLUMN institution_name TEXT NOT NULL DEFAULT ''`);
  }
  if (!have.has('institution_type')) {
    database.exec(`ALTER TABLE users ADD COLUMN institution_type TEXT NOT NULL DEFAULT ''`);
  }
  if (!have.has('contact_name')) {
    database.exec(`ALTER TABLE users ADD COLUMN contact_name TEXT NOT NULL DEFAULT ''`);
  }
  if (!have.has('role')) {
    database.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT ''`);
  }
  if (!have.has('intended_use')) {
    database.exec(`ALTER TABLE users ADD COLUMN intended_use TEXT NOT NULL DEFAULT ''`);
  }
  if (!have.has('notes')) {
    database.exec(`ALTER TABLE users ADD COLUMN notes TEXT NOT NULL DEFAULT ''`);
  }
  if (!have.has('email_domain')) {
    database.exec(`ALTER TABLE users ADD COLUMN email_domain TEXT NOT NULL DEFAULT ''`);
  }
  if (!have.has('email_domain_category')) {
    database.exec(`ALTER TABLE users ADD COLUMN email_domain_category TEXT NOT NULL DEFAULT 'uncertain'`);
  }
  if (!have.has('status')) {
    database.exec(`ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`);
  }
  if (!have.has('updated_at')) {
    database.exec(`ALTER TABLE users ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0`);
  }
  if (!have.has('last_login_at')) {
    database.exec(`ALTER TABLE users ADD COLUMN last_login_at INTEGER`);
  }

  // Backfill from legacy `organization` column (if present) into institution_name
  if (have.has('organization')) {
    const orphans = database
      .prepare(`SELECT id, organization FROM users WHERE institution_name = '' AND organization != ''`)
      .all();
    const update = database.prepare(`UPDATE users SET institution_name = ? WHERE id = ?`);
    for (const row of orphans) update.run(row.organization, row.id);
  }

  // Backfill updated_at
  database.exec(`UPDATE users SET updated_at = created_at WHERE updated_at = 0`);

  // Backfill email_domain + email_domain_category for legacy rows
  const needsClassify = database
    .prepare(`SELECT id, email FROM users WHERE email_domain = '' OR email_domain_category = ''`)
    .all();
  if (needsClassify.length) {
    const update = database.prepare(
      `UPDATE users SET email_domain = ?, email_domain_category = ? WHERE id = ?`
    );
    for (const row of needsClassify) {
      const result = classifyEmail(row.email);
      // For legacy users, never mark as 'rejected' — they're already in the system.
      const category = result.category === 'rejected' ? 'uncertain' : result.category;
      update.run(result.domain, category, row.id);
    }
    if (needsClassify.length) {
      console.log(`[db] Backfilled email_domain for ${needsClassify.length} legacy user(s)`);
    }
  }
}

// ============ ID generation ============

function generateId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateToken() {
  // URL-safe random token for password reset (32 bytes → 43 chars base64url)
  return require('crypto').randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return require('crypto').createHash('sha256').update(token).digest('hex');
}

// ============ User Operations ============

/**
 * Create a new user with full registration profile.
 * Throws on duplicate email or any DB error.
 */
function createUser(profile) {
  const database = getDb();
  const id = generateId();
  const now = Date.now();
  const password_hash = bcrypt.hashSync(profile.password, SALT_ROUNDS);

  const classification = classifyEmail(profile.email);
  if (classification.category === 'rejected') {
    const err = new Error(classification.reason || '邮箱不被接受');
    err.code = 'EMAIL_REJECTED';
    throw err;
  }

  try {
    database.prepare(`
      INSERT INTO users (
        id, email, password_hash,
        institution_name, institution_type, contact_name, role, intended_use, notes,
        email_domain, email_domain_category,
        status, created_at, updated_at, last_login_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL)
    `).run(
      id,
      profile.email.toLowerCase().trim(),
      password_hash,
      profile.institution_name || '',
      profile.institution_type || '',
      profile.contact_name || '',
      profile.role || '',
      profile.intended_use || '',
      profile.notes || '',
      classification.domain,
      classification.category,
      now,
      now
    );

    return {
      id,
      email: profile.email.toLowerCase().trim(),
      institution_name: profile.institution_name || '',
      institution_type: profile.institution_type || '',
      contact_name: profile.contact_name || '',
      role: profile.role || '',
      intended_use: profile.intended_use || '',
      notes: profile.notes || '',
      email_domain: classification.domain,
      email_domain_category: classification.category,
      status: 'active',
      created_at: now,
      updated_at: now,
      last_login_at: null,
    };
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed: users.email')) {
      const e = new Error('该邮箱已被注册');
      e.code = 'EMAIL_DUPLICATE';
      throw e;
    }
    throw err;
  }
}

function verifyUser(email, password) {
  const database = getDb();
  const row = database
    .prepare(`SELECT * FROM users WHERE email = ?`)
    .get(String(email || '').toLowerCase().trim());
  if (!row) return null;
  if (!bcrypt.compareSync(password, row.password_hash)) return null;
  return rowToUser(row);
}

function getUserById(id) {
  const database = getDb();
  const row = database.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
  return row ? rowToUser(row) : null;
}

function getUserByEmail(email) {
  const database = getDb();
  const row = database
    .prepare(`SELECT * FROM users WHERE email = ?`)
    .get(String(email || '').toLowerCase().trim());
  return row ? rowToUser(row) : null;
}

function updateUserProfile(userId, patch) {
  const database = getDb();
  const allowed = [
    'institution_name',
    'institution_type',
    'contact_name',
    'role',
    'intended_use',
    'notes',
  ];
  const sets = [];
  const values = [];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      sets.push(`${key} = ?`);
      values.push(patch[key] || '');
    }
  }
  if (!sets.length) return getUserById(userId);
  sets.push(`updated_at = ?`);
  values.push(Date.now());
  values.push(userId);
  database.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getUserById(userId);
}

function setUserStatus(userId, status) {
  const database = getDb();
  database
    .prepare(`UPDATE users SET status = ?, updated_at = ? WHERE id = ?`)
    .run(status, Date.now(), userId);
  return getUserById(userId);
}

function updatePassword(userId, newPassword) {
  const database = getDb();
  const password_hash = bcrypt.hashSync(newPassword, SALT_ROUNDS);
  database
    .prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`)
    .run(password_hash, Date.now(), userId);
  return true;
}

function touchLastLogin(userId) {
  const database = getDb();
  database
    .prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`)
    .run(Date.now(), userId);
}

/**
 * Convert raw DB row to the user shape exposed to the rest of the app.
 * Uses snake_case keys internally; callers convert to camelCase for API output.
 */
function rowToUser(row) {
  return {
    id: row.id,
    email: row.email,
    institution_name: row.institution_name,
    institution_type: row.institution_type,
    contact_name: row.contact_name,
    role: row.role,
    intended_use: row.intended_use,
    notes: row.notes,
    email_domain: row.email_domain,
    email_domain_category: row.email_domain_category,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_login_at: row.last_login_at,
  };
}

/**
 * Public-facing user representation (camelCase keys for the API).
 */
function toPublicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    institutionName: user.institution_name,
    institutionType: user.institution_type,
    contactName: user.contact_name,
    role: user.role,
    intendedUse: user.intended_use,
    notes: user.notes,
    emailDomain: user.email_domain,
    emailDomainCategory: user.email_domain_category,
    status: user.status,
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
  };
}

// ============ Password Reset Tokens ============

/**
 * Create a password reset token. Returns the plaintext token (to be put in
 * the email link) and the DB row. The DB stores only the SHA-256 hash.
 */
function createPasswordResetToken(userId, ttlMs = 60 * 60 * 1000) {
  const database = getDb();
  const id = generateId();
  const token = generateToken();
  const token_hash = hashToken(token);
  const now = Date.now();

  database.prepare(`
    INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, used_at, created_at)
    VALUES (?, ?, ?, ?, NULL, ?)
  `).run(id, userId, token_hash, now + ttlMs, now);

  return { token, expiresAt: now + ttlMs };
}

/**
 * Validate a token and mark it used atomically.
 * Returns the user row on success, or null on failure.
 */
function consumePasswordResetToken(token) {
  const database = getDb();
  const token_hash = hashToken(token);
  const now = Date.now();

  const row = database
    .prepare(
      `SELECT * FROM password_reset_tokens
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
       LIMIT 1`
    )
    .get(token_hash, now);
  if (!row) return null;

  database
    .prepare(`UPDATE password_reset_tokens SET used_at = ? WHERE id = ?`)
    .run(now, row.id);

  return getUserById(row.user_id);
}

function purgeExpiredResetTokens() {
  const database = getDb();
  const result = database
    .prepare(`DELETE FROM password_reset_tokens WHERE expires_at < ?`)
    .run(Date.now() - 24 * 60 * 60 * 1000);
  return result.changes;
}

// ============ Chat Session Operations (unchanged) ============

function createChatSession(userId, openclawSessionKey = null) {
  const database = getDb();
  const id = generateId();
  const now = Date.now();

  database.prepare(`
    INSERT INTO chat_sessions (id, user_id, title, openclaw_session_key, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, '新对话', openclawSessionKey, now, now);
  return { id, title: '新对话', openclaw_session_key: openclawSessionKey, created_at: now, updated_at: now };
}

function getChatSessions(userId) {
  const database = getDb();
  return database.prepare(`
    SELECT id, title, openclaw_session_key, created_at, updated_at
    FROM chat_sessions
    WHERE user_id = ?
    ORDER BY updated_at DESC
  `).all(userId);
}

function getChatSession(sessionId, userId) {
  const database = getDb();
  return database.prepare(`
    SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?
  `).get(sessionId, userId);
}

function updateChatSessionTitle(sessionId, userId, title) {
  const database = getDb();
  return database.prepare(`
    UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?
  `).run(title, Date.now(), sessionId, userId);
}

function updateChatSessionOpenclawKey(sessionId, userId, openclawSessionKey) {
  const database = getDb();
  return database.prepare(`
    UPDATE chat_sessions SET openclaw_session_key = ?, updated_at = ? WHERE id = ? AND user_id = ?
  `).run(openclawSessionKey, Date.now(), sessionId, userId);
}

function touchSession(sessionId) {
  const database = getDb();
  database.prepare(`UPDATE chat_sessions SET updated_at = ? WHERE id = ?`).run(Date.now(), sessionId);
}

function deleteChatSession(sessionId, userId) {
  const database = getDb();
  return database.prepare(`DELETE FROM chat_sessions WHERE id = ? AND user_id = ?`).run(sessionId, userId);
}

// ============ Chat Message Operations (unchanged) ============

function saveChatMessage(sessionId, role, content) {
  const database = getDb();
  const id = generateId();
  const created_at = Date.now();
  database.prepare(`
    INSERT INTO chat_messages (id, session_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, sessionId, role, content, created_at);
  touchSession(sessionId);
  return { id, session_id: sessionId, role, content, created_at };
}

function getChatMessages(sessionId) {
  const database = getDb();
  return database.prepare(`
    SELECT role, content, created_at FROM chat_messages
    WHERE session_id = ?
    ORDER BY created_at ASC
  `).all(sessionId);
}

// ============ Session Store (in-memory, used by serve.js) ============

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

function findUserActiveSession(userId) {
  const database = getDb();
  return database.prepare(`
    SELECT id, openclaw_session_key FROM chat_sessions
    WHERE user_id = ? AND openclaw_session_key IS NOT NULL
    ORDER BY updated_at DESC LIMIT 1
  `).get(userId) || null;
}

module.exports = {
  initDb,
  getDb,
  getDbPath,
  closeDbForTests,
  // users
  createUser,
  verifyUser,
  getUserById,
  getUserByEmail,
  updateUserProfile,
  setUserStatus,
  updatePassword,
  touchLastLogin,
  toPublicUser,
  // password reset
  createPasswordResetToken,
  consumePasswordResetToken,
  purgeExpiredResetTokens,
  // chat sessions
  createChatSession,
  getChatSessions,
  getChatSession,
  updateChatSessionTitle,
  updateChatSessionOpenclawKey,
  touchSession,
  deleteChatSession,
  // chat messages
  saveChatMessage,
  getChatMessages,
  // openclaw active session map
  setActiveSession,
  getActiveSession,
  removeActiveSession,
  findUserActiveSession,
  // material parameters
  initMaterialTables,
  ensureParameterDefinitions,
};
