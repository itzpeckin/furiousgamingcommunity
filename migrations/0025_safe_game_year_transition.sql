-- FranchiseHQ 7.3.3 — safe Madden game-year archive and transition controls
--
-- A Madden game year is independent from a franchise season. These tables
-- retain immutable archive evidence and recovery bookmarks while keeping the
-- league/account plane outside every edition transition.

PRAGMA foreign_keys = ON;

CREATE TABLE league_game_years (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  game_release TEXT NOT NULL,
  edition_year INTEGER NOT NULL CHECK (edition_year >= 1),
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'preparing'
    CHECK (status IN ('preparing', 'active', 'archived', 'active-data-removed', 'restored')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TEXT,
  removed_at TEXT,
  UNIQUE (league_id, game_release),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_game_year_one_active
  ON league_game_years (league_id)
  WHERE status IN ('active', 'restored');

CREATE TABLE game_year_franchise_seasons (
  game_year_id TEXT NOT NULL,
  league_id TEXT NOT NULL,
  franchise_season_id TEXT NOT NULL UNIQUE,
  linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (game_year_id, franchise_season_id),
  FOREIGN KEY (game_year_id) REFERENCES league_game_years(id) ON DELETE RESTRICT,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (franchise_season_id) REFERENCES franchise_seasons(id) ON DELETE RESTRICT
);

CREATE TABLE game_year_snapshots (
  game_year_id TEXT NOT NULL,
  league_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  snapshot_status TEXT NOT NULL DEFAULT 'retained'
    CHECK (snapshot_status IN ('candidate', 'retained', 'active', 'archived', 'removed', 'restored')),
  linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (game_year_id, snapshot_id),
  UNIQUE (league_id, snapshot_id),
  FOREIGN KEY (game_year_id) REFERENCES league_game_years(id) ON DELETE RESTRICT,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

CREATE TABLE game_year_transition_runs (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  operation TEXT NOT NULL
    CHECK (operation IN ('replace-current-import', 'start-franchise-season', 'archive-remove-game-year', 'rollback')),
  outgoing_game_year_id TEXT,
  incoming_game_year_id TEXT,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'archiving', 'archive-verified', 'detached', 'active-data-removed', 'archive-removed', 'restoring', 'restored', 'completed', 'failed', 'cancelled')),
  phase TEXT NOT NULL DEFAULT 'inventory',
  manifest_id TEXT,
  recovery_bookmark_id TEXT,
  active_snapshot_id_before TEXT,
  active_snapshot_id_after TEXT,
  affected_counts_json TEXT NOT NULL DEFAULT '{}',
  protected_counts_json TEXT NOT NULL DEFAULT '{}',
  confirmation_scope TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  error_json TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (outgoing_game_year_id) REFERENCES league_game_years(id) ON DELETE RESTRICT,
  FOREIGN KEY (incoming_game_year_id) REFERENCES league_game_years(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX idx_game_year_transition_one_open
  ON game_year_transition_runs (league_id, outgoing_game_year_id)
  WHERE status IN ('planned', 'archiving', 'archive-verified', 'detached', 'restoring');

CREATE TABLE game_year_archive_manifests (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  game_year_id TEXT NOT NULL,
  transition_run_id TEXT NOT NULL UNIQUE,
  format_version INTEGER NOT NULL DEFAULT 1,
  object_prefix TEXT NOT NULL,
  relational_object_key TEXT NOT NULL,
  relational_sha256 TEXT NOT NULL,
  root_sha256 TEXT NOT NULL,
  table_counts_json TEXT NOT NULL,
  source_objects_json TEXT NOT NULL DEFAULT '[]',
  total_rows INTEGER NOT NULL DEFAULT 0,
  total_objects INTEGER NOT NULL DEFAULT 0,
  total_bytes INTEGER NOT NULL DEFAULT 0,
  free_agent_status TEXT NOT NULL
    CHECK (free_agent_status IN ('located', 'empty-confirmed', 'missing', 'blocked')),
  free_agent_count INTEGER,
  verified_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (free_agent_status IN ('located', 'empty-confirmed') AND free_agent_count IS NOT NULL)
    OR
    (free_agent_status IN ('missing', 'blocked') AND free_agent_count IS NULL)
  ),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE RESTRICT,
  FOREIGN KEY (game_year_id) REFERENCES league_game_years(id) ON DELETE RESTRICT,
  FOREIGN KEY (transition_run_id) REFERENCES game_year_transition_runs(id) ON DELETE RESTRICT
);

CREATE TABLE game_year_archive_parts (
  id TEXT PRIMARY KEY,
  manifest_id TEXT NOT NULL,
  league_id TEXT NOT NULL,
  part_type TEXT NOT NULL CHECK (part_type IN ('relational', 'source-object')),
  source_key TEXT,
  object_key TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  byte_length INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (manifest_id, object_key),
  FOREIGN KEY (manifest_id) REFERENCES game_year_archive_manifests(id) ON DELETE RESTRICT,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE RESTRICT
);

CREATE TABLE game_year_recovery_bookmarks (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  game_year_id TEXT NOT NULL,
  transition_run_id TEXT NOT NULL UNIQUE,
  manifest_id TEXT NOT NULL UNIQUE,
  active_snapshot_id TEXT,
  team_assignments_json TEXT NOT NULL DEFAULT '[]',
  protected_counts_json TEXT NOT NULL,
  root_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE RESTRICT,
  FOREIGN KEY (game_year_id) REFERENCES league_game_years(id) ON DELETE RESTRICT,
  FOREIGN KEY (transition_run_id) REFERENCES game_year_transition_runs(id) ON DELETE RESTRICT,
  FOREIGN KEY (manifest_id) REFERENCES game_year_archive_manifests(id) ON DELETE RESTRICT
);

CREATE TABLE franchise_season_closures (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  game_year_id TEXT NOT NULL,
  franchise_season_id TEXT NOT NULL UNIQUE,
  player_summary_count INTEGER NOT NULL DEFAULT 0,
  ownership_period_count INTEGER NOT NULL DEFAULT 0,
  frozen_totals_sha256 TEXT NOT NULL,
  postseason_summary_json TEXT NOT NULL DEFAULT '{}',
  closed_by_user_id TEXT NOT NULL,
  closed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE RESTRICT,
  FOREIGN KEY (game_year_id) REFERENCES league_game_years(id) ON DELETE RESTRICT,
  FOREIGN KEY (franchise_season_id) REFERENCES franchise_seasons(id) ON DELETE RESTRICT,
  FOREIGN KEY (closed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE game_year_transition_events (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  transition_run_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_user_id TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE RESTRICT,
  FOREIGN KEY (transition_run_id) REFERENCES game_year_transition_runs(id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE game_year_archive_removals (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  manifest_id TEXT NOT NULL UNIQUE,
  transition_run_id TEXT NOT NULL,
  object_count INTEGER NOT NULL,
  confirmation_scope TEXT NOT NULL,
  removed_by_user_id TEXT NOT NULL,
  removed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE RESTRICT,
  FOREIGN KEY (manifest_id) REFERENCES game_year_archive_manifests(id) ON DELETE RESTRICT,
  FOREIGN KEY (transition_run_id) REFERENCES game_year_transition_runs(id) ON DELETE RESTRICT,
  FOREIGN KEY (removed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- A destination belongs to one Madden edition even when that edition contains
-- several franchise seasons.
ALTER TABLE companion_import_destinations
  ADD COLUMN game_year_id TEXT REFERENCES league_game_years(id) ON DELETE RESTRICT;

-- Backfill one game-year boundary per existing reviewed game release.
INSERT INTO league_game_years
  (id, league_id, game_release, edition_year, display_name, status)
SELECT
  'game_year_' || MIN(id),
  league_id,
  game_release,
  CAST(REPLACE(REPLACE(game_release, 'Madden NFL ', ''), 'Madden ', '') AS INTEGER),
  game_release,
  'preparing'
FROM franchise_seasons
GROUP BY league_id, game_release;

INSERT INTO game_year_franchise_seasons
  (game_year_id, league_id, franchise_season_id)
SELECT gy.id, season.league_id, season.id
FROM franchise_seasons season
JOIN league_game_years gy
  ON gy.league_id = season.league_id AND gy.game_release = season.game_release;

UPDATE companion_import_destinations
SET game_year_id = (
  SELECT link.game_year_id
  FROM game_year_franchise_seasons link
  WHERE link.franchise_season_id = companion_import_destinations.franchise_season_id
);

INSERT OR IGNORE INTO game_year_snapshots
  (game_year_id, league_id, snapshot_id, snapshot_status)
SELECT destination.game_year_id, run.league_id, run.candidate_snapshot_id,
  CASE WHEN active.snapshot_id = run.candidate_snapshot_id THEN 'active' ELSE 'candidate' END
FROM companion_candidate_import_runs run
JOIN companion_import_destinations destination
  ON destination.id = run.destination_id AND destination.league_id = run.league_id
LEFT JOIN league_active_snapshots active
  ON active.league_id = run.league_id
WHERE destination.game_year_id IS NOT NULL AND run.candidate_snapshot_id IS NOT NULL;

INSERT OR IGNORE INTO game_year_snapshots
  (game_year_id, league_id, snapshot_id, snapshot_status)
SELECT gy.id, snapshot.league_id, snapshot.id,
  CASE WHEN active.snapshot_id = snapshot.id THEN 'active' ELSE 'retained' END
FROM league_snapshots snapshot
JOIN league_game_years gy ON gy.league_id = snapshot.league_id
JOIN franchise_seasons season
  ON season.league_id = snapshot.league_id
 AND season.game_release = gy.game_release
 AND season.season_year = snapshot.season_year
LEFT JOIN league_active_snapshots active
  ON active.league_id = snapshot.league_id
WHERE NOT EXISTS (
  SELECT 1 FROM game_year_snapshots linked
  WHERE linked.league_id = snapshot.league_id AND linked.snapshot_id = snapshot.id
);

UPDATE league_game_years
SET status = 'active', updated_at = CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1
  FROM game_year_snapshots linked
  JOIN league_active_snapshots active
    ON active.league_id = linked.league_id AND active.snapshot_id = linked.snapshot_id
  WHERE linked.game_year_id = league_game_years.id
);

CREATE INDEX idx_game_year_seasons_league
  ON game_year_franchise_seasons (league_id, game_year_id);
CREATE INDEX idx_game_year_snapshots_league
  ON game_year_snapshots (league_id, game_year_id, snapshot_status);
CREATE INDEX idx_game_year_transitions_league
  ON game_year_transition_runs (league_id, created_at DESC);
CREATE INDEX idx_game_year_events_run
  ON game_year_transition_events (transition_run_id, created_at);
CREATE INDEX idx_game_year_manifests_league
  ON game_year_archive_manifests (league_id, game_year_id, created_at DESC);

-- Verified archive evidence is append-only. Removal deletes archive objects and
-- records a tombstone; it never rewrites the manifest, parts, or bookmark.
CREATE TRIGGER immutable_game_year_archive_manifests_update
BEFORE UPDATE ON game_year_archive_manifests
BEGIN
  SELECT RAISE(ABORT, 'game-year archive manifests are immutable');
END;

CREATE TRIGGER immutable_game_year_archive_manifests_delete
BEFORE DELETE ON game_year_archive_manifests
BEGIN
  SELECT RAISE(ABORT, 'game-year archive manifests are immutable');
END;

CREATE TRIGGER immutable_game_year_archive_parts_update
BEFORE UPDATE ON game_year_archive_parts
BEGIN
  SELECT RAISE(ABORT, 'game-year archive parts are immutable');
END;

CREATE TRIGGER immutable_game_year_archive_parts_delete
BEFORE DELETE ON game_year_archive_parts
BEGIN
  SELECT RAISE(ABORT, 'game-year archive parts are immutable');
END;

CREATE TRIGGER immutable_game_year_recovery_bookmarks_update
BEFORE UPDATE ON game_year_recovery_bookmarks
BEGIN
  SELECT RAISE(ABORT, 'game-year recovery bookmarks are immutable');
END;

CREATE TRIGGER immutable_game_year_recovery_bookmarks_delete
BEFORE DELETE ON game_year_recovery_bookmarks
BEGIN
  SELECT RAISE(ABORT, 'game-year recovery bookmarks are immutable');
END;

CREATE TRIGGER immutable_game_year_transition_events_update
BEFORE UPDATE ON game_year_transition_events
BEGIN
  SELECT RAISE(ABORT, 'game-year transition events are append-only');
END;

CREATE TRIGGER immutable_game_year_transition_events_delete
BEFORE DELETE ON game_year_transition_events
BEGIN
  SELECT RAISE(ABORT, 'game-year transition events are append-only');
END;

INSERT INTO schema_migrations (version, name)
VALUES (25, 'safe_game_year_transition');
