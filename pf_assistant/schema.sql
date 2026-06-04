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
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_session_id ON chat_messages(session_id);

-- ============================================================
-- ferro_materials / ferro_parameter_models / ferro_parameter_snapshots
-- Ferroelectric material model metadata and per-job coefficient provenance
-- ============================================================
CREATE TABLE IF NOT EXISTS ferro_materials (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  material_key         TEXT UNIQUE NOT NULL,
  display_name         TEXT NOT NULL,
  family               TEXT,
  composition_variable TEXT,
  temperature_variable TEXT NOT NULL DEFAULT 'tem',
  notes                TEXT,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ferro_materials_key ON ferro_materials(material_key);

CREATE TABLE IF NOT EXISTS ferro_parameter_models (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id         INTEGER NOT NULL,
  model_key           TEXT UNIQUE NOT NULL,
  model_name          TEXT NOT NULL,
  source_label        TEXT,
  source_citation     TEXT,
  formula_type        TEXT NOT NULL DEFAULT 'static',
  valid_xf_min        REAL,
  valid_xf_max        REAL,
  valid_tem_min       REAL,
  valid_tem_max       REAL,
  default_xf          REAL,
  default_tem         REAL,
  implementation_key  TEXT NOT NULL,
  notes               TEXT,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  FOREIGN KEY (material_id) REFERENCES ferro_materials(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ferro_models_material ON ferro_parameter_models(material_id);
CREATE INDEX IF NOT EXISTS idx_ferro_models_key ON ferro_parameter_models(model_key);

CREATE TABLE IF NOT EXISTS ferro_parameter_snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id      INTEGER NOT NULL,
  job_id        TEXT UNIQUE,
  material_key  TEXT NOT NULL,
  model_key     TEXT NOT NULL,
  xf            REAL,
  tem           REAL,
  a1            REAL,
  a11           REAL,
  a12           REAL,
  a111          REAL,
  a112          REAL,
  a123          REAL,
  a1111         REAL,
  a1112         REAL,
  a1122         REAL,
  a1123         REAL,
  Q1            REAL,
  Q2            REAL,
  Q4            REAL,
  s11           REAL,
  s12           REAL,
  s44           REAL,
  c11           REAL,
  c12           REAL,
  c44           REAL,
  a0            REAL,
  p0            REAL,
  T0            REAL,
  Curie_C       REAL,
  zta1          REAL,
  zta2          REAL,
  warnings_json TEXT NOT NULL DEFAULT '[]',
  created_at    INTEGER NOT NULL,
  FOREIGN KEY (model_id) REFERENCES ferro_parameter_models(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_ferro_snapshots_job ON ferro_parameter_snapshots(job_id);
CREATE INDEX IF NOT EXISTS idx_ferro_snapshots_model ON ferro_parameter_snapshots(model_id);

-- ============================================================
-- ferro_landau_* tables
-- Literature Landau coefficient database imported from Markdown.
-- These records preserve expression strings and provenance; they do not
-- replace executable ferro_parameter_models used by the Fortran workflow.
-- ============================================================
CREATE TABLE IF NOT EXISTS ferro_landau_source_sets (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  set_key          TEXT UNIQUE NOT NULL,
  material_id      TEXT NOT NULL,
  material_name    TEXT NOT NULL,
  composition      TEXT NOT NULL DEFAULT '',
  source_ref       TEXT NOT NULL DEFAULT '',
  polynomial_order TEXT NOT NULL DEFAULT '',
  temperature_unit TEXT NOT NULL DEFAULT '',
  variables        TEXT NOT NULL DEFAULT '',
  notes            TEXT NOT NULL DEFAULT '',
  source_file_name TEXT NOT NULL DEFAULT '',
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ferro_landau_sets_material ON ferro_landau_source_sets(material_id);
CREATE INDEX IF NOT EXISTS idx_ferro_landau_sets_key ON ferro_landau_source_sets(set_key);

CREATE TABLE IF NOT EXISTS ferro_landau_coefficient_records (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  source_set_key            TEXT NOT NULL,
  material                  TEXT NOT NULL DEFAULT '',
  composition               TEXT NOT NULL DEFAULT '',
  polynomial_order          TEXT NOT NULL DEFAULT '',
  coefficient_id            TEXT NOT NULL,
  normalized_coefficient_id TEXT NOT NULL,
  unit_reported             TEXT NOT NULL DEFAULT '',
  value_expression          TEXT NOT NULL DEFAULT '',
  notes                     TEXT NOT NULL DEFAULT '',
  source_file_name          TEXT NOT NULL DEFAULT '',
  created_at                INTEGER NOT NULL,
  updated_at                INTEGER NOT NULL,
  FOREIGN KEY (source_set_key) REFERENCES ferro_landau_source_sets(set_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ferro_landau_coeff_set ON ferro_landau_coefficient_records(source_set_key);
CREATE INDEX IF NOT EXISTS idx_ferro_landau_coeff_id ON ferro_landau_coefficient_records(normalized_coefficient_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ferro_landau_coeff_set_id ON ferro_landau_coefficient_records(source_set_key, coefficient_id);

CREATE TABLE IF NOT EXISTS ferro_landau_references (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  ref_key          TEXT UNIQUE NOT NULL,
  citation_text    TEXT NOT NULL,
  source_file_name TEXT NOT NULL DEFAULT '',
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ferro_landau_auxiliary_definitions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  source_set_key   TEXT UNIQUE NOT NULL,
  section_title    TEXT NOT NULL DEFAULT '',
  definition_text  TEXT NOT NULL DEFAULT '',
  source_file_name TEXT NOT NULL DEFAULT '',
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  FOREIGN KEY (source_set_key) REFERENCES ferro_landau_source_sets(set_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ferro_landau_data_quality_notes (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  note_text        TEXT UNIQUE NOT NULL,
  source_file_name TEXT NOT NULL DEFAULT '',
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
