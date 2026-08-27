-- FranchiseHQ 7.1.0 — canonical import and snapshot schema

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS companion_exports (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  received_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  r2_object_key TEXT NOT NULL,
  byte_length INTEGER NOT NULL DEFAULT 0,
  content_type TEXT NOT NULL DEFAULT 'application/json',
  season INTEGER,
  week INTEGER,
  team_count INTEGER,
  player_count INTEGER,
  inspection_json TEXT,
  processed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS imports (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  export_id TEXT,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  error_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (export_id) REFERENCES companion_exports(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  import_id TEXT,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  season INTEGER,
  week INTEGER,
  activated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (league_id, version),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (import_id) REFERENCES imports(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT NOT NULL,
  league_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  external_id TEXT,
  name TEXT NOT NULL,
  abbreviation TEXT,
  payload_json TEXT,
  PRIMARY KEY (league_id, snapshot_id, id),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS players (
  id TEXT NOT NULL,
  league_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  external_id TEXT,
  team_id TEXT,
  first_name TEXT,
  last_name TEXT,
  position TEXT,
  overall INTEGER,
  development_trait TEXT,
  age INTEGER,
  status TEXT,
  payload_json TEXT,
  PRIMARY KEY (league_id, snapshot_id, id),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS companion_export_fingerprints (
  league_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  export_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (league_id, payload_hash),
  UNIQUE (export_id),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (export_id) REFERENCES companion_exports(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS companion_export_events (
  id TEXT PRIMARY KEY,
  export_id TEXT NOT NULL,
  league_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  detail_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (export_id) REFERENCES companion_exports(id) ON DELETE CASCADE,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS companion_route_captures (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  discovery_session_id TEXT NOT NULL,
  route_path TEXT NOT NULL,
  request_method TEXT NOT NULL,
  content_type TEXT,
  byte_length INTEGER NOT NULL DEFAULT 0,
  payload_hash TEXT NOT NULL,
  r2_object_key TEXT NOT NULL,
  top_level_keys_json TEXT,
  collections_json TEXT,
  request_headers_json TEXT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  UNIQUE (league_id, route_path, payload_hash)
);

CREATE TABLE IF NOT EXISTS companion_dataset_inspections (
  id TEXT PRIMARY KEY,
  capture_id TEXT NOT NULL UNIQUE,
  league_id TEXT NOT NULL,
  discovery_session_id TEXT NOT NULL,
  route_path TEXT NOT NULL,
  dataset_type TEXT NOT NULL,
  dataset_label TEXT NOT NULL,
  confidence TEXT NOT NULL,
  confidence_score INTEGER NOT NULL DEFAULT 0,
  record_count INTEGER NOT NULL DEFAULT 0,
  schema_json TEXT NOT NULL,
  inspected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (capture_id) REFERENCES companion_route_captures(id) ON DELETE CASCADE,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

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

CREATE TABLE IF NOT EXISTS companion_schedule_mapping_runs (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  discovery_session_id TEXT NOT NULL,
  source_route_summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending-preview',
  route_count INTEGER NOT NULL DEFAULT 0,
  game_count INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  upcoming_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  warnings_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS companion_canonical_games_preview (
  mapping_run_id TEXT NOT NULL,
  league_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  season_year INTEGER,
  stage TEXT NOT NULL,
  week_index INTEGER,
  home_team_external_id TEXT,
  away_team_external_id TEXT,
  home_score INTEGER,
  away_score INTEGER,
  status TEXT NOT NULL,
  scheduled_at TEXT,
  source_route_path TEXT NOT NULL,
  source_record_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (mapping_run_id, external_id),
  FOREIGN KEY (mapping_run_id) REFERENCES companion_schedule_mapping_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS companion_statistics_mapping_runs (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  discovery_session_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending-preview',
  route_count INTEGER NOT NULL DEFAULT 0,
  record_count INTEGER NOT NULL DEFAULT 0,
  resolved_player_count INTEGER NOT NULL DEFAULT 0,
  unresolved_player_count INTEGER NOT NULL DEFAULT 0,
  category_summary_json TEXT NOT NULL DEFAULT '{}',
  warning_count INTEGER NOT NULL DEFAULT 0,
  warnings_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS companion_canonical_statistics_preview (
  mapping_run_id TEXT NOT NULL,
  league_id TEXT NOT NULL,
  external_key TEXT NOT NULL,
  category TEXT NOT NULL,
  season_year INTEGER,
  stage TEXT NOT NULL,
  week_index INTEGER NOT NULL,
  player_external_id TEXT,
  team_external_id TEXT,
  player_name TEXT,
  position TEXT,
  metrics_json TEXT NOT NULL,
  source_route_path TEXT NOT NULL,
  source_record_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (mapping_run_id, external_key),
  FOREIGN KEY (mapping_run_id) REFERENCES companion_statistics_mapping_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

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
  record_offset INTEGER NOT NULL DEFAULT 0,
  record_total INTEGER,
  payload_hash TEXT,
  season_year INTEGER,
  error_json TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (mapping_run_id, route_path),
  FOREIGN KEY (mapping_run_id) REFERENCES companion_statistics_mapping_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

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
  validation_status TEXT,
  validation_score REAL,
  validation_error_count INTEGER NOT NULL DEFAULT 0,
  validation_warning_count INTEGER NOT NULL DEFAULT 0,
  validation_report_json TEXT,
  validated_at TEXT,
  archived_at TEXT,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

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

CREATE TABLE IF NOT EXISTS league_active_snapshots (
  league_id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  activated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activated_by TEXT,
  previous_snapshot_id TEXT,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (snapshot_id) REFERENCES league_snapshots(id) ON DELETE RESTRICT,
  FOREIGN KEY (previous_snapshot_id) REFERENCES league_snapshots(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS league_snapshot_lifecycle_events (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_id TEXT,
  detail_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (snapshot_id) REFERENCES league_snapshots(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS snapshot_validation_jobs (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  status TEXT NOT NULL,
  phase TEXT NOT NULL,
  phase_offset INTEGER NOT NULL DEFAULT 0,
  processed_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0,
  context_json TEXT NOT NULL DEFAULT '{}',
  report_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (league_id, snapshot_id),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS snapshot_validation_player_ids (
  job_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  PRIMARY KEY (job_id, player_id)
);

CREATE TABLE IF NOT EXISTS canonical_statistics_snapshot_manifest (
  league_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  route_path TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  season_year INTEGER,
  stage TEXT NOT NULL,
  week_index INTEGER NOT NULL,
  source_category TEXT NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  mapping_run_id TEXT,
  committed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (league_id, snapshot_id, route_path)
);

CREATE TABLE IF NOT EXISTS import_performance_certifications (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  orchestrator_run_id TEXT,
  snapshot_id TEXT NOT NULL,
  previous_snapshot_id TEXT,
  certification_mode TEXT NOT NULL DEFAULT 'weekly-delta',
  passed INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0,
  wall_clock_ms INTEGER,
  report_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (league_id, snapshot_id)
);

CREATE TABLE IF NOT EXISTS server_import_delegations (
  token_hash TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  league_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_companion_exports_league_received ON companion_exports(league_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_imports_league_started ON imports(league_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_league_status ON snapshots(league_id, status, version DESC);
CREATE INDEX IF NOT EXISTS idx_players_league_snapshot_team ON players(league_id, snapshot_id, team_id);
CREATE INDEX IF NOT EXISTS idx_companion_export_events_export ON companion_export_events(export_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_companion_export_events_league ON companion_export_events(league_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_companion_route_captures_league_received ON companion_route_captures(league_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_companion_route_captures_session ON companion_route_captures(discovery_session_id, received_at);
CREATE INDEX IF NOT EXISTS idx_dataset_inspections_session ON companion_dataset_inspections(league_id, discovery_session_id, route_path);
CREATE INDEX IF NOT EXISTS idx_dataset_inspections_type ON companion_dataset_inspections(league_id, dataset_type, inspected_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_mapping_runs_league_created ON companion_team_mapping_runs(league_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_canonical_teams_preview_league_run ON companion_canonical_teams_preview(league_id, mapping_run_id, display_name);
CREATE INDEX IF NOT EXISTS idx_player_mapping_runs_league_created ON companion_player_mapping_runs(league_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_canonical_players_preview_league_run ON companion_canonical_players_preview(league_id, mapping_run_id, team_external_id, position, overall DESC);
CREATE INDEX IF NOT EXISTS idx_schedule_mapping_runs_league_created ON companion_schedule_mapping_runs(league_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_canonical_games_preview_league_run ON companion_canonical_games_preview(league_id, mapping_run_id, stage, week_index);
CREATE INDEX IF NOT EXISTS idx_statistics_runs_league_created ON companion_statistics_mapping_runs(league_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_statistics_preview_lookup ON companion_canonical_statistics_preview(league_id, mapping_run_id, category, stage, week_index);
CREATE INDEX IF NOT EXISTS idx_statistics_preview_player ON companion_canonical_statistics_preview(league_id, player_external_id, category);
CREATE INDEX IF NOT EXISTS idx_statistics_batches_run_status ON companion_statistics_mapping_batches(mapping_run_id, status, route_path);
CREATE INDEX IF NOT EXISTS idx_statistics_batches_league_created ON companion_statistics_mapping_batches(league_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_orchestrator_league_created ON companion_import_orchestrator_runs(league_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_league_snapshots_league_created ON league_snapshots(league_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_league_snapshots_status ON league_snapshots(league_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshot_records_domain ON league_snapshot_records(league_id, snapshot_id, domain);
CREATE INDEX IF NOT EXISTS idx_snapshot_records_player_compare ON league_snapshot_records(league_id, snapshot_id, domain, external_id);
CREATE INDEX IF NOT EXISTS idx_snapshot_lifecycle_events_league ON league_snapshot_lifecycle_events(league_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshot_lifecycle_events_snapshot ON league_snapshot_lifecycle_events(snapshot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_statistics_manifest_snapshot ON canonical_statistics_snapshot_manifest(league_id, snapshot_id, stage, week_index, source_category);
CREATE INDEX IF NOT EXISTS idx_statistics_manifest_hash ON canonical_statistics_snapshot_manifest(league_id, route_path, payload_hash);
CREATE INDEX IF NOT EXISTS idx_import_cert_league_created ON import_performance_certifications(league_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_server_import_delegations_expiry ON server_import_delegations(expires_at);

INSERT INTO schema_migrations (version, name)
VALUES (19, 'canonical_import_snapshot_foundation');
