-- Franchise HQ v5.9.3.5 -- Canonical Statistics Engine preview tables
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS companion_statistics_mapping_runs (
  id TEXT PRIMARY KEY, league_id TEXT NOT NULL, discovery_session_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending-preview',
  route_count INTEGER NOT NULL DEFAULT 0, record_count INTEGER NOT NULL DEFAULT 0, resolved_player_count INTEGER NOT NULL DEFAULT 0,
  unresolved_player_count INTEGER NOT NULL DEFAULT 0, category_summary_json TEXT NOT NULL DEFAULT '{}', warning_count INTEGER NOT NULL DEFAULT 0,
  warnings_json TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_statistics_runs_league_created ON companion_statistics_mapping_runs (league_id, created_at DESC);
CREATE TABLE IF NOT EXISTS companion_canonical_statistics_preview (
  mapping_run_id TEXT NOT NULL, league_id TEXT NOT NULL, external_key TEXT NOT NULL, category TEXT NOT NULL, season_year INTEGER,
  stage TEXT NOT NULL, week_index INTEGER NOT NULL, player_external_id TEXT, team_external_id TEXT, player_name TEXT, position TEXT,
  metrics_json TEXT NOT NULL, source_route_path TEXT NOT NULL, source_record_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (mapping_run_id, external_key), FOREIGN KEY (mapping_run_id) REFERENCES companion_statistics_mapping_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_statistics_preview_lookup ON companion_canonical_statistics_preview (league_id, mapping_run_id, category, stage, week_index);
CREATE INDEX IF NOT EXISTS idx_statistics_preview_player ON companion_canonical_statistics_preview (league_id, player_external_id, category);
INSERT OR REPLACE INTO schema_migrations (version, name, applied_at) VALUES (8, 'canonical_statistics_engine_preview', CURRENT_TIMESTAMP);
