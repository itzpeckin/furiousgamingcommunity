-- FranchiseHQ 7.5.6.5 — commissioner yearly schedule import
--
-- A yearly schedule import is an isolated, season-bound collection boundary.
-- Raw route captures remain immutable in R2/D1. Completing a collection stores
-- one immutable regular-season schedule revision without activating a snapshot,
-- moving the live week, or creating Discord schedule threads.

PRAGMA foreign_keys = ON;

CREATE TABLE yearly_schedule_imports (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  game_year_id TEXT NOT NULL,
  franchise_season_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  status TEXT NOT NULL DEFAULT 'collecting'
    CHECK (status IN ('collecting', 'completed', 'cancelled')),
  expected_week_count INTEGER NOT NULL DEFAULT 18 CHECK (expected_week_count = 18),
  captured_week_count INTEGER NOT NULL DEFAULT 0 CHECK (captured_week_count BETWEEN 0 AND 18),
  game_count INTEGER NOT NULL DEFAULT 0 CHECK (game_count >= 0),
  coverage_json TEXT NOT NULL DEFAULT '[]',
  warnings_json TEXT NOT NULL DEFAULT '[]',
  schedule_json TEXT,
  schedule_sha256 TEXT,
  started_by_user_id TEXT NOT NULL,
  finished_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  UNIQUE (league_id, franchise_season_id, revision),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE RESTRICT,
  FOREIGN KEY (game_year_id) REFERENCES league_game_years(id) ON DELETE RESTRICT,
  FOREIGN KEY (franchise_season_id) REFERENCES franchise_seasons(id) ON DELETE RESTRICT,
  FOREIGN KEY (started_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (finished_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX yearly_schedule_imports_one_collecting
  ON yearly_schedule_imports (league_id)
  WHERE status = 'collecting';

CREATE INDEX yearly_schedule_imports_season_revision
  ON yearly_schedule_imports (league_id, franchise_season_id, revision DESC);

CREATE TABLE yearly_schedule_import_captures (
  import_id TEXT NOT NULL,
  league_id TEXT NOT NULL,
  capture_id TEXT NOT NULL,
  route_path TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  PRIMARY KEY (import_id, capture_id),
  FOREIGN KEY (import_id) REFERENCES yearly_schedule_imports(id) ON DELETE RESTRICT,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE RESTRICT,
  FOREIGN KEY (capture_id) REFERENCES companion_route_captures(id) ON DELETE RESTRICT
);

CREATE INDEX yearly_schedule_import_captures_observed
  ON yearly_schedule_import_captures (league_id, import_id, observed_at DESC);

CREATE TRIGGER yearly_schedule_imports_tenant_guard
BEFORE INSERT ON yearly_schedule_imports
WHEN NOT EXISTS (
    SELECT 1 FROM league_game_years
    WHERE id = NEW.game_year_id AND league_id = NEW.league_id
  )
  OR NOT EXISTS (
    SELECT 1 FROM franchise_seasons
    WHERE id = NEW.franchise_season_id AND league_id = NEW.league_id
  )
BEGIN
  SELECT RAISE(ABORT, 'Yearly schedule import season and game year must belong to its league');
END;

CREATE TRIGGER yearly_schedule_import_captures_tenant_guard
BEFORE INSERT ON yearly_schedule_import_captures
WHEN NOT EXISTS (
    SELECT 1 FROM yearly_schedule_imports
    WHERE id = NEW.import_id AND league_id = NEW.league_id AND status = 'collecting'
  )
  OR NOT EXISTS (
    SELECT 1 FROM companion_route_captures
    WHERE id = NEW.capture_id AND league_id = NEW.league_id AND route_path = NEW.route_path
  )
BEGIN
  SELECT RAISE(ABORT, 'Yearly schedule capture must belong to its collecting league import');
END;

CREATE TRIGGER yearly_schedule_imports_completed_immutable
BEFORE UPDATE ON yearly_schedule_imports
WHEN OLD.status = 'completed'
BEGIN
  SELECT RAISE(ABORT, 'Completed yearly schedule revisions are immutable');
END;

CREATE TRIGGER yearly_schedule_imports_completed_no_delete
BEFORE DELETE ON yearly_schedule_imports
WHEN OLD.status = 'completed'
BEGIN
  SELECT RAISE(ABORT, 'Completed yearly schedule revisions cannot be deleted');
END;

INSERT INTO schema_migrations (version, name)
VALUES (42, 'yearly_schedule_import');
