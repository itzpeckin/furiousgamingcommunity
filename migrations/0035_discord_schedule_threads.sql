-- FranchiseHQ 7.4.4.4 — automatic Discord installation and schedule threads.

PRAGMA foreign_keys = ON;

ALTER TABLE discord_league_installations ADD COLUMN guild_name TEXT;
ALTER TABLE discord_league_installations ADD COLUMN schedule_channel_id TEXT;
ALTER TABLE discord_league_installations ADD COLUMN connection_source TEXT NOT NULL DEFAULT 'legacy-manual';
ALTER TABLE discord_league_installations ADD COLUMN connected_at TEXT;

CREATE TABLE discord_schedule_sync_runs (
  id TEXT NOT NULL PRIMARY KEY,
  league_id TEXT NOT NULL,
  snapshot_id TEXT,
  discord_guild_id TEXT NOT NULL,
  schedule_channel_id TEXT NOT NULL,
  season_year INTEGER,
  phase TEXT NOT NULL DEFAULT 'regular-season',
  week_index INTEGER NOT NULL CHECK (week_index >= 1 AND week_index <= 30),
  source TEXT NOT NULL CHECK (source IN ('discord-command', 'oauth-connect', 'candidate-import')),
  requested_by_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'partial', 'failed', 'superseded')),
  game_count INTEGER NOT NULL DEFAULT 0 CHECK (game_count >= 0),
  thread_count INTEGER NOT NULL DEFAULT 0 CHECK (thread_count >= 0),
  registered_owner_count INTEGER NOT NULL DEFAULT 0 CHECK (registered_owner_count >= 0),
  error_count INTEGER NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (league_id, snapshot_id, phase, week_index, schedule_channel_id),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (snapshot_id) REFERENCES league_snapshots(id) ON DELETE SET NULL,
  FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE discord_schedule_threads (
  id TEXT NOT NULL PRIMARY KEY,
  league_id TEXT NOT NULL,
  snapshot_id TEXT,
  sync_run_id TEXT NOT NULL,
  discord_guild_id TEXT NOT NULL,
  parent_channel_id TEXT NOT NULL,
  starter_message_id TEXT,
  discord_thread_id TEXT UNIQUE,
  game_external_id TEXT NOT NULL,
  season_year INTEGER,
  phase TEXT NOT NULL DEFAULT 'regular-season',
  week_index INTEGER NOT NULL CHECK (week_index >= 1 AND week_index <= 30),
  home_team_key TEXT NOT NULL,
  away_team_key TEXT NOT NULL,
  home_discord_user_id TEXT,
  away_discord_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'creating'
    CHECK (status IN ('creating', 'active', 'archived', 'failed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (league_id, season_year, phase, week_index, game_external_id),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (snapshot_id) REFERENCES league_snapshots(id) ON DELETE SET NULL,
  FOREIGN KEY (sync_run_id) REFERENCES discord_schedule_sync_runs(id) ON DELETE CASCADE
);

CREATE INDEX idx_discord_schedule_sync_pending
  ON discord_schedule_sync_runs (status, created_at);
CREATE INDEX idx_discord_schedule_sync_league
  ON discord_schedule_sync_runs (league_id, created_at DESC);
CREATE INDEX idx_discord_schedule_threads_week
  ON discord_schedule_threads (league_id, season_year, phase, week_index);

UPDATE discord_league_installations
SET connected_at=COALESCE(connected_at, installed_at),
    connection_source=COALESCE(NULLIF(connection_source, ''), 'legacy-manual');

INSERT INTO schema_migrations (version, name)
VALUES (35, 'discord_schedule_threads');
