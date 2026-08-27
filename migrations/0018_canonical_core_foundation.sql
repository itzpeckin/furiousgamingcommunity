-- FranchiseHQ 7.1.0 — canonical database foundation
--
-- This is the first migration in the immutable post-legacy sequence. It is
-- deliberately additive so it can baseline both an empty database and the
-- existing FranchiseHQ production schema without rewriting user data.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leagues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  product_name TEXT NOT NULL DEFAULT 'Franchise HQ',
  slug TEXT NOT NULL UNIQUE,
  current_season INTEGER NOT NULL DEFAULT 1,
  current_week INTEGER NOT NULL DEFAULT 1,
  trade_start_week INTEGER NOT NULL DEFAULT 1,
  trade_deadline_week INTEGER NOT NULL DEFAULT 9,
  discord_guild_id TEXT,
  discord_connected INTEGER NOT NULL DEFAULT 0,
  public_status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  discord_user_id TEXT NOT NULL UNIQUE,
  discord_username TEXT NOT NULL,
  discord_global_name TEXT,
  display_name TEXT NOT NULL,
  avatar_hash TEXT,
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS league_memberships (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('commissioner', 'trade_committee', 'team_owner')),
  team_id TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (league_id, user_id),
  FOREIGN KEY (league_id) REFERENCES leagues(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS oauth_states (
  id TEXT PRIMARY KEY,
  state_token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS league_membership_audit (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  actor_user_id TEXT,
  subject_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  detail_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id),
  FOREIGN KEY (actor_user_id) REFERENCES users(id),
  FOREIGN KEY (subject_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS league_rules_documents (
  league_id TEXT PRIMARY KEY,
  rules_json TEXT NOT NULL DEFAULT '{"categories":[]}',
  updated_by_user_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS league_settings (
  league_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  settings_json TEXT NOT NULL DEFAULT '{}',
  updated_by_user_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS league_setting_revisions (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  settings_json TEXT NOT NULL,
  changed_by_user_id TEXT,
  change_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (league_id, revision),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS league_data_reset_audit (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  preserved_user_ids_json TEXT NOT NULL,
  deleted_counts_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id),
  FOREIGN KEY (actor_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_users_discord_user_id ON users(discord_user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON league_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_league_id ON league_memberships(league_id);
CREATE INDEX IF NOT EXISTS idx_memberships_league_active ON league_memberships(league_id, active);
CREATE INDEX IF NOT EXISTS idx_memberships_user_active ON league_memberships(user_id, active);
CREATE INDEX IF NOT EXISTS idx_memberships_league_team ON league_memberships(league_id, team_id);
CREATE INDEX IF NOT EXISTS idx_memberships_league_role_active ON league_memberships(league_id, role, active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships_one_active_owner_per_team
  ON league_memberships (league_id, lower(team_id))
  WHERE active = 1 AND team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(session_token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth_states_token_hash ON oauth_states(state_token_hash);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at ON oauth_states(expires_at);
CREATE INDEX IF NOT EXISTS idx_membership_audit_league_created
  ON league_membership_audit(league_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_league_rules_updated_at ON league_rules_documents(updated_at);
CREATE INDEX IF NOT EXISTS idx_league_settings_updated_at ON league_settings(updated_at);
CREATE INDEX IF NOT EXISTS idx_league_setting_revisions_created
  ON league_setting_revisions(league_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_league_data_reset_audit_league_created
  ON league_data_reset_audit(league_id, created_at DESC);

-- Normalize the historical ledger without replacing existing evidence. The
-- legacy files remain preserved under migrations/legacy and are never replayed.
INSERT OR IGNORE INTO schema_migrations (version, name) VALUES
  (1, 'cloud_platform_foundation_existing_schema'),
  (2, 'companion_storage_layer'),
  (3, 'madden_companion_route_discovery'),
  (4, 'dataset_classification_payload_inspection'),
  (5, 'canonical_team_domain_mapper_preview'),
  (6, 'canonical_player_domain_mapper_preview'),
  (7, 'canonical_schedule_mapper_preview'),
  (8, 'canonical_statistics_engine_preview'),
  (9, 'complete_pending_snapshot_builder'),
  (10, 'snapshot_validation_activation'),
  (11, 'incremental_import_orchestrator'),
  (12, 'canonical_transactions_snapshot_diff'),
  (13, 'league_membership_access_control'),
  (14, 'league_rules'),
  (15, 'membership_audit_repair'),
  (16, 'canonical_team_ownership'),
  (17, 'league_data_reset_audit');

INSERT INTO schema_migrations (version, name)
VALUES (18, 'canonical_core_foundation');
