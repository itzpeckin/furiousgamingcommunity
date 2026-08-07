PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leagues (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS league_memberships (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (league_id, user_id),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

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

CREATE INDEX IF NOT EXISTS idx_companion_exports_league_received
  ON companion_exports (league_id, received_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_imports_league_started
  ON imports (league_id, started_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_snapshots_league_status
  ON snapshots (league_id, status, version DESC);

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

CREATE INDEX IF NOT EXISTS idx_players_league_snapshot_team
  ON players (league_id, snapshot_id, team_id);

INSERT OR IGNORE INTO leagues (id, slug, name)
VALUES ('lg_fgc_001', 'furious-gaming-community', 'Furious Gaming Community');

INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
VALUES (1, 'cloud_platform_foundation', CURRENT_TIMESTAMP);
