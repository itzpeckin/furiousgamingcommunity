-- Franchise HQ v5.9.3.2
-- Canonical Team Domain Model and pending preview storage.

CREATE TABLE IF NOT EXISTS companion_team_mapping_runs (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  discovery_session_id TEXT NOT NULL,
  source_capture_id TEXT NOT NULL,
  source_route_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending-preview',
  team_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  warnings_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (source_capture_id) REFERENCES companion_route_captures(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_team_mapping_runs_league_created
  ON companion_team_mapping_runs (league_id, created_at DESC);

CREATE TABLE IF NOT EXISTS companion_canonical_teams_preview (
  mapping_run_id TEXT NOT NULL,
  league_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  city_name TEXT,
  nickname TEXT,
  abbreviation TEXT,
  conference_name TEXT,
  division_name TEXT,
  primary_color TEXT,
  secondary_color TEXT,
  logo_url TEXT,
  user_controlled INTEGER NOT NULL DEFAULT 0,
  owner_name TEXT,
  wins INTEGER,
  losses INTEGER,
  ties INTEGER,
  source_record_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (mapping_run_id, external_id),
  FOREIGN KEY (mapping_run_id) REFERENCES companion_team_mapping_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_canonical_teams_preview_league_run
  ON companion_canonical_teams_preview (league_id, mapping_run_id, display_name);

INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
VALUES (5, 'canonical_team_domain_mapper_preview', CURRENT_TIMESTAMP);
