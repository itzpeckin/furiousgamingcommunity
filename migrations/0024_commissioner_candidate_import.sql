-- FranchiseHQ 7.3.2 — commissioner-operated candidate importer
--
-- This migration adds durable, tenant-scoped import destinations and candidate
-- runs. Candidate runs can be mapped and validated but never change the active
-- snapshot pointer. Production activation remains a later, separately
-- authorized lifecycle operation.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS companion_import_destinations (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  franchise_season_id TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (league_id, franchise_season_id),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (franchise_season_id) REFERENCES franchise_seasons(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS companion_candidate_import_runs (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  destination_id TEXT NOT NULL,
  discovery_session_id TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'running', 'preview-ready', 'failed', 'cancelled')),
  completeness_status TEXT NOT NULL DEFAULT 'review-required'
    CHECK (completeness_status IN ('complete', 'rostered-players-only', 'review-required', 'failed')),
  current_phase TEXT NOT NULL DEFAULT 'analyze-source',
  phase_index INTEGER NOT NULL DEFAULT 0 CHECK (phase_index >= 0),
  phase_state_json TEXT NOT NULL DEFAULT '{}',
  source_counts_json TEXT NOT NULL DEFAULT '{}',
  result_counts_json TEXT NOT NULL DEFAULT '{}',
  warnings_json TEXT NOT NULL DEFAULT '[]',
  retry_json TEXT NOT NULL DEFAULT '{}',
  team_mapping_run_id TEXT,
  player_mapping_run_id TEXT,
  schedule_mapping_run_id TEXT,
  statistics_mapping_run_id TEXT,
  candidate_snapshot_id TEXT,
  active_snapshot_id_before TEXT,
  active_snapshot_id_after TEXT,
  created_by_user_id TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (league_id, destination_id, source_fingerprint),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (destination_id) REFERENCES companion_import_destinations(id) ON DELETE RESTRICT,
  FOREIGN KEY (discovery_session_id) REFERENCES madden_discovery_sessions(id) ON DELETE RESTRICT,
  FOREIGN KEY (team_mapping_run_id) REFERENCES companion_team_mapping_runs(id) ON DELETE SET NULL,
  FOREIGN KEY (player_mapping_run_id) REFERENCES companion_player_mapping_runs(id) ON DELETE SET NULL,
  FOREIGN KEY (schedule_mapping_run_id) REFERENCES companion_schedule_mapping_runs(id) ON DELETE SET NULL,
  FOREIGN KEY (statistics_mapping_run_id) REFERENCES companion_statistics_mapping_runs(id) ON DELETE SET NULL,
  FOREIGN KEY (candidate_snapshot_id) REFERENCES league_snapshots(id) ON DELETE RESTRICT,
  FOREIGN KEY (active_snapshot_id_before) REFERENCES league_snapshots(id) ON DELETE SET NULL,
  FOREIGN KEY (active_snapshot_id_after) REFERENCES league_snapshots(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_import_destinations_league_status
  ON companion_import_destinations (league_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_import_runs_league_created
  ON companion_candidate_import_runs (league_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_import_runs_status
  ON companion_candidate_import_runs (league_id, status, updated_at DESC);

INSERT INTO schema_migrations (version, name)
VALUES (24, 'commissioner_candidate_import');
