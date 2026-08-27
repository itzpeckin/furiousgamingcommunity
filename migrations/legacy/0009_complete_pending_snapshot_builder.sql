-- Franchise HQ v5.9.3.6 -- Complete Pending Snapshot Builder
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS league_snapshots (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending-validation',
  season_year INTEGER,
  week_index INTEGER,
  team_count INTEGER NOT NULL DEFAULT 0,
  player_count INTEGER NOT NULL DEFAULT 0,
  game_count INTEGER NOT NULL DEFAULT 0,
  statistic_count INTEGER NOT NULL DEFAULT 0,
  standing_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  warnings_json TEXT NOT NULL DEFAULT '[]',
  manifest_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activated_at TEXT,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_league_snapshots_league_created ON league_snapshots (league_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_league_snapshots_status ON league_snapshots (league_id, status, created_at DESC);
CREATE TABLE IF NOT EXISTS league_snapshot_records (
  snapshot_id TEXT NOT NULL,
  league_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  external_id TEXT NOT NULL,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (snapshot_id, domain, external_id),
  FOREIGN KEY (snapshot_id) REFERENCES league_snapshots(id) ON DELETE CASCADE,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_snapshot_records_domain ON league_snapshot_records (league_id, snapshot_id, domain);
INSERT OR REPLACE INTO schema_migrations (version, name, applied_at) VALUES (9, 'complete_pending_snapshot_builder', CURRENT_TIMESTAMP);
