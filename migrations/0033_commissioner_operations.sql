-- FranchiseHQ 7.4.3 — commissioner operations and shared league experiences.
--
-- Adds only tenant-scoped, additive records for Game of the Week, Confidence
-- Pool entries, and private Rules media. Existing league data, snapshots,
-- memberships, assignments, settings, rules, and audits remain unchanged.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS league_game_of_week_selections (
  id TEXT NOT NULL PRIMARY KEY,
  league_id TEXT NOT NULL,
  season_year INTEGER NOT NULL,
  stage TEXT NOT NULL DEFAULT 'regular',
  week_index INTEGER NOT NULL CHECK (week_index >= 0),
  game_id TEXT NOT NULL,
  source_snapshot_id TEXT,
  selected_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (league_id, season_year, stage, week_index),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (source_snapshot_id) REFERENCES league_snapshots(id) ON DELETE SET NULL,
  FOREIGN KEY (selected_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS confidence_pool_weeks (
  league_id TEXT NOT NULL,
  season_year INTEGER NOT NULL,
  stage TEXT NOT NULL DEFAULT 'regular',
  week_index INTEGER NOT NULL CHECK (week_index >= 0),
  status TEXT NOT NULL DEFAULT 'locked'
    CHECK (status IN ('open', 'locked', 'final')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  opened_at TEXT,
  locked_at TEXT,
  finalized_at TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (league_id, season_year, stage, week_index),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS confidence_pool_entries (
  id TEXT NOT NULL PRIMARY KEY,
  league_id TEXT NOT NULL,
  season_year INTEGER NOT NULL,
  stage TEXT NOT NULL DEFAULT 'regular',
  week_index INTEGER NOT NULL CHECK (week_index >= 0),
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  submitted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (league_id, season_year, stage, week_index, user_id),
  UNIQUE (id, league_id),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (league_id, season_year, stage, week_index)
    REFERENCES confidence_pool_weeks(league_id, season_year, stage, week_index)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS confidence_pool_picks (
  id TEXT NOT NULL PRIMARY KEY,
  entry_id TEXT NOT NULL,
  league_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  selected_team_id TEXT,
  confidence_value INTEGER CHECK (confidence_value IS NULL OR confidence_value >= 1),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (entry_id, game_id),
  UNIQUE (entry_id, confidence_value),
  FOREIGN KEY (entry_id, league_id) REFERENCES confidence_pool_entries(id, league_id) ON DELETE CASCADE,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS league_rule_media (
  id TEXT NOT NULL PRIMARY KEY,
  league_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK (byte_length > 0),
  alt_text TEXT NOT NULL DEFAULT '',
  uploaded_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_gotw_league_season
  ON league_game_of_week_selections(league_id, season_year DESC, stage, week_index DESC);
CREATE INDEX IF NOT EXISTS idx_confidence_weeks_league_season
  ON confidence_pool_weeks(league_id, season_year DESC, stage, week_index);
CREATE INDEX IF NOT EXISTS idx_confidence_entries_league_user
  ON confidence_pool_entries(league_id, user_id, season_year DESC, week_index DESC);
CREATE INDEX IF NOT EXISTS idx_confidence_entries_leaderboard
  ON confidence_pool_entries(league_id, season_year, stage, status, user_id);
CREATE INDEX IF NOT EXISTS idx_confidence_picks_league_game
  ON confidence_pool_picks(league_id, game_id);
CREATE INDEX IF NOT EXISTS idx_rule_media_league_created
  ON league_rule_media(league_id, created_at DESC);

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (33, 'commissioner_operations');
