PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS companion_schedule_mapping_runs (
 id TEXT PRIMARY KEY, league_id TEXT NOT NULL, discovery_session_id TEXT NOT NULL,
 source_route_summary TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending-preview',
 route_count INTEGER NOT NULL DEFAULT 0, game_count INTEGER NOT NULL DEFAULT 0,
 completed_count INTEGER NOT NULL DEFAULT 0, upcoming_count INTEGER NOT NULL DEFAULT 0,
 warning_count INTEGER NOT NULL DEFAULT 0, warnings_json TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_schedule_mapping_runs_league_created ON companion_schedule_mapping_runs (league_id, created_at DESC);
CREATE TABLE IF NOT EXISTS companion_canonical_games_preview (
 mapping_run_id TEXT NOT NULL, league_id TEXT NOT NULL, external_id TEXT NOT NULL,
 season_year INTEGER, stage TEXT NOT NULL, week_index INTEGER,
 home_team_external_id TEXT, away_team_external_id TEXT,
 home_score INTEGER, away_score INTEGER, status TEXT NOT NULL,
 scheduled_at TEXT, source_route_path TEXT NOT NULL, source_record_json TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (mapping_run_id, external_id),
 FOREIGN KEY (mapping_run_id) REFERENCES companion_schedule_mapping_runs(id) ON DELETE CASCADE,
 FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_canonical_games_preview_league_run ON companion_canonical_games_preview (league_id, mapping_run_id, stage, week_index);
INSERT OR REPLACE INTO schema_migrations (version, name, applied_at) VALUES (7, 'canonical_schedule_mapper_preview', CURRENT_TIMESTAMP);
