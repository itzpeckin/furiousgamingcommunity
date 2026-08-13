-- Franchise HQ v5.9.7.0 -- Reliable incremental import orchestration
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS companion_statistics_mapping_batches (
  id TEXT PRIMARY KEY,
  mapping_run_id TEXT NOT NULL,
  league_id TEXT NOT NULL,
  capture_id TEXT NOT NULL,
  discovery_session_id TEXT,
  route_path TEXT NOT NULL,
  r2_object_key TEXT NOT NULL,
  source_category TEXT NOT NULL,
  stage TEXT NOT NULL,
  week_index INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  record_count INTEGER NOT NULL DEFAULT 0,
  resolved_player_count INTEGER NOT NULL DEFAULT 0,
  unresolved_player_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  warnings_json TEXT NOT NULL DEFAULT '[]',
  error_json TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (mapping_run_id, route_path),
  FOREIGN KEY (mapping_run_id) REFERENCES companion_statistics_mapping_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_statistics_batches_run_status
  ON companion_statistics_mapping_batches (mapping_run_id, status, route_path);

CREATE INDEX IF NOT EXISTS idx_statistics_batches_league_created
  ON companion_statistics_mapping_batches (league_id, created_at DESC);

CREATE TABLE IF NOT EXISTS companion_import_orchestrator_runs (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  current_stage TEXT NOT NULL DEFAULT 'map-teams',
  stage_index INTEGER NOT NULL DEFAULT 0,
  stage_state_json TEXT NOT NULL DEFAULT '{}',
  statistics_mapping_run_id TEXT,
  snapshot_id TEXT,
  error_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_import_orchestrator_league_created
  ON companion_import_orchestrator_runs (league_id, created_at DESC);

INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
VALUES (11, 'incremental_import_orchestrator', CURRENT_TIMESTAMP);
