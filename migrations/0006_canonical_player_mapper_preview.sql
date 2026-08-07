CREATE TABLE IF NOT EXISTS companion_player_mapping_runs (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  discovery_session_id TEXT NOT NULL,
  source_capture_id TEXT NOT NULL,
  source_route_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending-preview',
  player_count INTEGER NOT NULL DEFAULT 0,
  rostered_count INTEGER NOT NULL DEFAULT 0,
  free_agent_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  warnings_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (source_capture_id) REFERENCES companion_route_captures(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_player_mapping_runs_league_created
  ON companion_player_mapping_runs (league_id, created_at DESC);

CREATE TABLE IF NOT EXISTS companion_canonical_players_preview (
  mapping_run_id TEXT NOT NULL,
  league_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  team_external_id TEXT,
  first_name TEXT,
  last_name TEXT,
  display_name TEXT NOT NULL,
  position TEXT,
  archetype TEXT,
  overall INTEGER,
  development_trait TEXT,
  age INTEGER,
  years_pro INTEGER,
  jersey_number INTEGER,
  height_inches INTEGER,
  weight_lbs INTEGER,
  college TEXT,
  injury_status TEXT,
  is_injured INTEGER NOT NULL DEFAULT 0,
  contract_years_remaining INTEGER,
  salary INTEGER,
  cap_hit INTEGER,
  portrait_id TEXT,
  ratings_json TEXT,
  source_record_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (mapping_run_id, external_id),
  FOREIGN KEY (mapping_run_id) REFERENCES companion_player_mapping_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_canonical_players_preview_league_run
  ON companion_canonical_players_preview (league_id, mapping_run_id, team_external_id, position, overall DESC);

INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
VALUES (6, 'canonical_player_domain_mapper_preview', CURRENT_TIMESTAMP);
