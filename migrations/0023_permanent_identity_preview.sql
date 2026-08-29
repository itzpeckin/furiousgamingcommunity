-- FranchiseHQ 7.3.1 — permanent season, player, GM, and ownership identity
--
-- These records live outside Madden snapshots so identities survive imports,
-- team changes, season transitions, and later Madden releases. Preview tables
-- are private and non-activating. A blocked Free Agent source remains blocked.

PRAGMA foreign_keys = ON;

CREATE TABLE franchise_seasons (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  source_system TEXT NOT NULL,
  source_franchise_id TEXT NOT NULL,
  source_season_id TEXT NOT NULL,
  game_release TEXT NOT NULL,
  display_name TEXT NOT NULL,
  season_year INTEGER,
  status TEXT NOT NULL DEFAULT 'preview'
    CHECK (status IN ('preview', 'active', 'closed', 'archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (league_id, source_system, source_franchise_id, source_season_id),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

CREATE TABLE player_identities (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  public_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (league_id, public_id),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

CREATE TABLE player_source_aliases (
  league_id TEXT NOT NULL,
  source_system TEXT NOT NULL,
  source_franchise_id TEXT NOT NULL,
  source_player_id TEXT NOT NULL,
  player_identity_id TEXT NOT NULL,
  first_seen_season_id TEXT NOT NULL,
  last_seen_season_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (league_id, source_system, source_franchise_id, source_player_id),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (player_identity_id) REFERENCES player_identities(id) ON DELETE CASCADE,
  FOREIGN KEY (first_seen_season_id) REFERENCES franchise_seasons(id) ON DELETE RESTRICT,
  FOREIGN KEY (last_seen_season_id) REFERENCES franchise_seasons(id) ON DELETE RESTRICT
);

CREATE TABLE player_season_summaries (
  league_id TEXT NOT NULL,
  franchise_season_id TEXT NOT NULL,
  player_identity_id TEXT NOT NULL,
  current_team_external_id TEXT,
  roster_status TEXT NOT NULL DEFAULT 'rostered'
    CHECK (roster_status IN ('rostered', 'free-agent', 'inactive', 'retired', 'unknown')),
  career_totals_json TEXT NOT NULL DEFAULT '{}',
  season_totals_json TEXT NOT NULL DEFAULT '{}',
  source_mapping_run_id TEXT,
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (league_id, franchise_season_id, player_identity_id),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (franchise_season_id) REFERENCES franchise_seasons(id) ON DELETE RESTRICT,
  FOREIGN KEY (player_identity_id) REFERENCES player_identities(id) ON DELETE RESTRICT
);

CREATE TABLE gm_identities (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  user_id TEXT,
  public_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (league_id, public_id),
  UNIQUE (league_id, user_id),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE team_ownership_periods (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  gm_identity_id TEXT NOT NULL,
  team_key TEXT NOT NULL,
  franchise_season_id TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  assignment_source TEXT NOT NULL DEFAULT 'commissioner-reviewed',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (ended_at IS NULL OR ended_at >= started_at),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (gm_identity_id) REFERENCES gm_identities(id) ON DELETE RESTRICT,
  FOREIGN KEY (franchise_season_id) REFERENCES franchise_seasons(id) ON DELETE RESTRICT
);

CREATE TABLE identity_preview_runs (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  franchise_season_id TEXT NOT NULL,
  team_mapping_run_id TEXT NOT NULL,
  player_mapping_run_id TEXT NOT NULL,
  discovery_report_id TEXT,
  status TEXT NOT NULL DEFAULT 'rostered-players-only'
    CHECK (status IN ('complete', 'rostered-players-only', 'review-required')),
  free_agent_status TEXT NOT NULL
    CHECK (free_agent_status IN ('located', 'empty-confirmed', 'missing', 'blocked')),
  team_count INTEGER NOT NULL DEFAULT 0,
  rostered_player_count INTEGER NOT NULL DEFAULT 0,
  free_agent_count INTEGER,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (franchise_season_id) REFERENCES franchise_seasons(id) ON DELETE RESTRICT,
  FOREIGN KEY (team_mapping_run_id) REFERENCES companion_team_mapping_runs(id) ON DELETE RESTRICT,
  FOREIGN KEY (player_mapping_run_id) REFERENCES companion_player_mapping_runs(id) ON DELETE RESTRICT,
  FOREIGN KEY (discovery_report_id) REFERENCES madden_discovery_reports(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE identity_preview_teams (
  preview_run_id TEXT NOT NULL,
  league_id TEXT NOT NULL,
  team_external_id TEXT NOT NULL,
  team_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  PRIMARY KEY (preview_run_id, team_external_id),
  FOREIGN KEY (preview_run_id) REFERENCES identity_preview_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

CREATE TABLE identity_preview_players (
  preview_run_id TEXT NOT NULL,
  league_id TEXT NOT NULL,
  player_identity_id TEXT NOT NULL,
  source_player_id TEXT NOT NULL,
  team_external_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  position TEXT,
  overall INTEGER,
  PRIMARY KEY (preview_run_id, player_identity_id),
  UNIQUE (preview_run_id, source_player_id),
  FOREIGN KEY (preview_run_id) REFERENCES identity_preview_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (player_identity_id) REFERENCES player_identities(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX idx_ownership_one_open_team_period
  ON team_ownership_periods(league_id, team_key)
  WHERE ended_at IS NULL;
CREATE UNIQUE INDEX idx_ownership_one_open_gm_period
  ON team_ownership_periods(league_id, gm_identity_id)
  WHERE ended_at IS NULL;
CREATE INDEX idx_player_alias_identity
  ON player_source_aliases(league_id, player_identity_id);
CREATE INDEX idx_player_season_team
  ON player_season_summaries(league_id, franchise_season_id, current_team_external_id);
CREATE INDEX idx_identity_preview_runs_league_created
  ON identity_preview_runs(league_id, created_at DESC);
CREATE INDEX idx_identity_preview_players_team
  ON identity_preview_players(preview_run_id, team_external_id, display_name);

INSERT INTO schema_migrations (version, name)
VALUES (23, 'permanent_identity_preview');
