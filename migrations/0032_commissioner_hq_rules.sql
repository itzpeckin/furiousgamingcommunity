-- FranchiseHQ 7.4.2 — Commissioner HQ and Rules
--
-- Adds a revisioned Rules workspace and immutable publication history. Existing
-- published Rules, league settings, memberships, assignments, and audit rows are
-- preserved. No league data or active snapshot is changed.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS league_rules_workspaces (
  league_id TEXT NOT NULL PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  base_publication_revision INTEGER NOT NULL DEFAULT 0 CHECK (base_publication_revision >= 0),
  draft_rules_json TEXT NOT NULL DEFAULT '{"categories":[]}',
  updated_by_user_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS league_rule_publications (
  id TEXT NOT NULL PRIMARY KEY,
  league_id TEXT NOT NULL,
  publication_revision INTEGER NOT NULL CHECK (publication_revision >= 1),
  rules_json TEXT NOT NULL,
  published_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (league_id, publication_revision),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (published_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS league_rule_workspace_revisions (
  id TEXT NOT NULL PRIMARY KEY,
  league_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  base_publication_revision INTEGER NOT NULL CHECK (base_publication_revision >= 0),
  draft_rules_json TEXT NOT NULL,
  changed_by_user_id TEXT,
  change_type TEXT NOT NULL CHECK (change_type IN ('baseline', 'draft', 'publication')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (league_id, revision),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

INSERT OR IGNORE INTO league_rule_publications
  (id, league_id, publication_revision, rules_json, published_by_user_id, created_at)
SELECT 'rule_publication_initial_' || league_id, league_id, 1, rules_json,
       updated_by_user_id, updated_at
FROM league_rules_documents;

INSERT OR IGNORE INTO league_rules_workspaces
  (league_id, revision, base_publication_revision, draft_rules_json,
   updated_by_user_id, updated_at)
SELECT league_id, 1, 1, rules_json, updated_by_user_id, updated_at
FROM league_rules_documents;

INSERT OR IGNORE INTO league_rule_workspace_revisions
  (id, league_id, revision, base_publication_revision, draft_rules_json,
   changed_by_user_id, change_type, created_at)
SELECT 'rule_workspace_initial_' || league_id, league_id, 1, 1, rules_json,
       updated_by_user_id, 'baseline', updated_at
FROM league_rules_documents;

INSERT OR IGNORE INTO league_features (league_id, feature_key, enabled)
SELECT id, 'trade_center', 1 FROM leagues WHERE tenant_status = 'enabled';
INSERT OR IGNORE INTO league_features (league_id, feature_key, enabled)
SELECT id, 'trade_block', 1 FROM leagues WHERE tenant_status = 'enabled';
INSERT OR IGNORE INTO league_features (league_id, feature_key, enabled)
SELECT id, 'confidence_pool', 1 FROM leagues WHERE tenant_status = 'enabled';
INSERT OR IGNORE INTO league_features (league_id, feature_key, enabled)
SELECT id, 'game_of_the_week', 1 FROM leagues WHERE tenant_status = 'enabled';

CREATE INDEX IF NOT EXISTS idx_rule_publications_league_created
  ON league_rule_publications(league_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rules_workspaces_updated
  ON league_rules_workspaces(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_rule_workspace_revisions_league_created
  ON league_rule_workspace_revisions(league_id, created_at DESC);

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (32, 'commissioner_hq_rules');
