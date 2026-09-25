-- Additive, tenant-scoped EA Direct credentials and durable private collections.
-- No existing exports, snapshots, seasons, memberships, or URLs are changed.
PRAGMA foreign_keys = ON;
CREATE TABLE ea_direct_connections (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE RESTRICT,
  connected_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK(status IN ('connected','reconnect-required','disconnected')),
  platform TEXT NOT NULL,
  persona_id TEXT NOT NULL,
  persona_name TEXT NOT NULL,
  external_league_id TEXT NOT NULL,
  external_league_name TEXT NOT NULL,
  credential_cipher TEXT,
  preview_verified INTEGER NOT NULL DEFAULT 0 CHECK(preview_verified IN (0,1)),
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX ea_direct_active_league ON ea_direct_connections(league_id) WHERE status!='disconnected';
CREATE TABLE ea_direct_setups (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  session_id TEXT NOT NULL,
  oauth_state TEXT NOT NULL,
  stage TEXT NOT NULL,
  payload_cipher TEXT,
  lock_until TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ea_direct_setup_owner ON ea_direct_setups(league_id,user_id,session_id,expires_at);
CREATE TABLE ea_direct_collection_jobs (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE RESTRICT,
  connection_id TEXT NOT NULL REFERENCES ea_direct_connections(id) ON DELETE RESTRICT,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  session_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('preview','weekly','yearly')),
  status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed','cancelled')),
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  cursor INTEGER NOT NULL DEFAULT 0,
  step TEXT NOT NULL DEFAULT 'Starting collection',
  progress INTEGER NOT NULL DEFAULT 0,
  state_cipher TEXT,
  result_json TEXT NOT NULL DEFAULT '{}',
  error_code TEXT,
  message TEXT,
  lock_until TEXT,
  workflow_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);
CREATE UNIQUE INDEX ea_direct_active_collection ON ea_direct_collection_jobs(league_id) WHERE status IN ('queued','running');
CREATE INDEX ea_direct_collection_history ON ea_direct_collection_jobs(league_id,created_at DESC);
INSERT INTO schema_migrations(version,name) VALUES(48,'ea_direct_connections');
