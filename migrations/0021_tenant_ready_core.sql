-- FranchiseHQ 7.2.0 — tenant-ready core
--
-- Tenant identity, aliases, domains, feature configuration, and audit context
-- are server-owned. Existing league, membership, session, and Madden records
-- are preserved; this migration does not activate or reset imported data.

PRAGMA foreign_keys = ON;

ALTER TABLE leagues ADD COLUMN tenant_status TEXT NOT NULL DEFAULT 'disabled'
  CHECK (tenant_status IN ('enabled', 'disabled', 'suspended'));
ALTER TABLE leagues ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE leagues ADD COLUMN branding_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE leagues ADD COLUMN configuration_json TEXT NOT NULL DEFAULT '{}';

-- Preserve the currently active single-tenant production behavior. Future
-- tenants are disabled by default and must be enabled explicitly.
UPDATE leagues
SET tenant_status = CASE WHEN public_status = 'active' THEN 'enabled' ELSE 'disabled' END;

CREATE TABLE IF NOT EXISTS league_slug_aliases (
  alias_slug TEXT PRIMARY KEY COLLATE NOCASE,
  league_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS league_domains (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  hostname TEXT NOT NULL COLLATE NOCASE,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS league_features (
  league_id TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  configuration_json TEXT NOT NULL DEFAULT '{}',
  updated_by_user_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (league_id, feature_key),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tenant_audit_events (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  actor_user_id TEXT,
  request_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  outcome TEXT NOT NULL DEFAULT 'success',
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- SQLite does not imply NOT NULL for a non-integer PRIMARY KEY. Rebuild the
-- three older one-row-per-league tables so tenant scope is structurally
-- mandatory instead of relying on application behavior.
CREATE TABLE league_rules_documents_tenant (
  league_id TEXT NOT NULL PRIMARY KEY,
  rules_json TEXT NOT NULL DEFAULT '{"categories":[]}',
  updated_by_user_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
);
INSERT INTO league_rules_documents_tenant
  (league_id, rules_json, updated_by_user_id, updated_at)
SELECT league_id, rules_json, updated_by_user_id, updated_at
FROM league_rules_documents;
DROP TABLE league_rules_documents;
ALTER TABLE league_rules_documents_tenant RENAME TO league_rules_documents;

CREATE TABLE league_settings_tenant (
  league_id TEXT NOT NULL PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  settings_json TEXT NOT NULL DEFAULT '{}',
  updated_by_user_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
);
INSERT INTO league_settings_tenant
  (league_id, revision, settings_json, updated_by_user_id, updated_at)
SELECT league_id, revision, settings_json, updated_by_user_id, updated_at
FROM league_settings;
DROP TABLE league_settings;
ALTER TABLE league_settings_tenant RENAME TO league_settings;

CREATE TABLE league_active_snapshots_tenant (
  league_id TEXT NOT NULL PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  activated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activated_by TEXT,
  previous_snapshot_id TEXT,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (snapshot_id) REFERENCES league_snapshots(id) ON DELETE RESTRICT,
  FOREIGN KEY (previous_snapshot_id) REFERENCES league_snapshots(id) ON DELETE SET NULL
);
INSERT INTO league_active_snapshots_tenant
  (league_id, snapshot_id, activated_at, activated_by, previous_snapshot_id)
SELECT league_id, snapshot_id, activated_at, activated_by, previous_snapshot_id
FROM league_active_snapshots;
DROP TABLE league_active_snapshots;
ALTER TABLE league_active_snapshots_tenant RENAME TO league_active_snapshots;

-- The legacy validation-player join was the sole league-owned table without
-- direct tenant scope. Rebuild it losslessly from its parent job.
CREATE TABLE snapshot_validation_player_ids_tenant (
  job_id TEXT NOT NULL,
  league_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  PRIMARY KEY (league_id, job_id, player_id),
  FOREIGN KEY (job_id) REFERENCES snapshot_validation_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

INSERT INTO snapshot_validation_player_ids_tenant (job_id, league_id, player_id)
SELECT source.job_id, jobs.league_id, source.player_id
FROM snapshot_validation_player_ids source
LEFT JOIN snapshot_validation_jobs jobs ON jobs.id = source.job_id;

DROP TABLE snapshot_validation_player_ids;
ALTER TABLE snapshot_validation_player_ids_tenant RENAME TO snapshot_validation_player_ids;

CREATE UNIQUE INDEX IF NOT EXISTS idx_league_domains_hostname
  ON league_domains(lower(hostname));
CREATE UNIQUE INDEX IF NOT EXISTS idx_league_domains_one_primary
  ON league_domains(league_id) WHERE is_primary = 1 AND enabled = 1;
CREATE INDEX IF NOT EXISTS idx_league_domains_league_enabled
  ON league_domains(league_id, enabled);
CREATE INDEX IF NOT EXISTS idx_league_features_enabled
  ON league_features(league_id, enabled, feature_key);
CREATE INDEX IF NOT EXISTS idx_tenant_audit_league_created
  ON tenant_audit_events(league_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_audit_request
  ON tenant_audit_events(league_id, request_id, action_id);
CREATE INDEX IF NOT EXISTS idx_snapshot_validation_players_job
  ON snapshot_validation_player_ids(league_id, job_id);
CREATE INDEX IF NOT EXISTS idx_league_rules_updated_at
  ON league_rules_documents(updated_at);
CREATE INDEX IF NOT EXISTS idx_league_settings_updated_at
  ON league_settings(updated_at);

-- Hyphen-insensitive legacy routes become explicit data aliases instead of a
-- product-code fallback. This works for every existing hyphenated league slug.
INSERT OR IGNORE INTO league_slug_aliases (alias_slug, league_id)
SELECT lower(replace(slug, '-', '')), id
FROM leagues
WHERE lower(replace(slug, '-', '')) <> lower(slug);

-- FranchiseHQ currently has exactly one enabled production tenant. Attach the
-- existing hostnames only when that invariant is true; never guess a tenant by
-- a product-coded id or by the first row.
INSERT OR IGNORE INTO league_domains (id, league_id, hostname, is_primary, enabled)
SELECT 'domain_' || id || '_public', id, 'franchisehq.app', 1, 1
FROM leagues
WHERE tenant_status = 'enabled'
  AND (SELECT COUNT(*) FROM leagues WHERE tenant_status = 'enabled') = 1;

INSERT OR IGNORE INTO league_domains (id, league_id, hostname, is_primary, enabled)
SELECT 'domain_' || id || '_owner', id, 'franchise-hq.pages.dev', 0, 1
FROM leagues
WHERE tenant_status = 'enabled'
  AND (SELECT COUNT(*) FROM leagues WHERE tenant_status = 'enabled') = 1;

INSERT OR IGNORE INTO league_features (league_id, feature_key, enabled)
SELECT id, 'core_browsing', 1 FROM leagues WHERE tenant_status = 'enabled';
INSERT OR IGNORE INTO league_features (league_id, feature_key, enabled)
SELECT id, 'commissioner_hq', 1 FROM leagues WHERE tenant_status = 'enabled';
INSERT OR IGNORE INTO league_features (league_id, feature_key, enabled)
SELECT id, 'madden_import', 1 FROM leagues WHERE tenant_status = 'enabled';
INSERT OR IGNORE INTO league_features (league_id, feature_key, enabled)
SELECT id, 'trade_center', 1 FROM leagues WHERE tenant_status = 'enabled';
INSERT OR IGNORE INTO league_features (league_id, feature_key, enabled)
SELECT id, 'confidence_pool', 1 FROM leagues WHERE tenant_status = 'enabled';
INSERT OR IGNORE INTO league_features (league_id, feature_key, enabled)
SELECT id, 'game_of_the_week', 1 FROM leagues WHERE tenant_status = 'enabled';
INSERT OR IGNORE INTO league_features (league_id, feature_key, enabled)
SELECT id, 'rules', 1 FROM leagues WHERE tenant_status = 'enabled';

INSERT INTO schema_migrations (version, name)
VALUES (21, 'tenant_ready_core');
