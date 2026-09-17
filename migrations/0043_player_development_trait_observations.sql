-- FranchiseHQ 7.5.6.12 — durable Superstar and X-Factor observations
--
-- One row records the source-backed development trait seen when a snapshot
-- becomes live. The ledger is season-scoped and append-only through ordinary
-- imports so Discord can report the first observed week without claiming an
-- exact earn date across an import gap.

PRAGMA foreign_keys = ON;

CREATE TABLE player_development_trait_observations (
  league_id TEXT NOT NULL,
  franchise_season_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  source_player_id TEXT NOT NULL,
  player_identity_id TEXT,
  team_external_id TEXT,
  player_name TEXT NOT NULL,
  position TEXT,
  years_pro INTEGER,
  development_trait TEXT NOT NULL
    CHECK (development_trait IN ('Superstar', 'X-Factor')),
  season_year INTEGER,
  stage TEXT NOT NULL,
  week_index INTEGER NOT NULL CHECK (week_index >= 0),
  observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (league_id, franchise_season_id, snapshot_id, source_player_id),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE RESTRICT,
  FOREIGN KEY (franchise_season_id) REFERENCES franchise_seasons(id) ON DELETE RESTRICT,
  FOREIGN KEY (snapshot_id) REFERENCES league_snapshots(id) ON DELETE RESTRICT,
  FOREIGN KEY (player_identity_id) REFERENCES player_identities(id) ON DELETE RESTRICT
);

CREATE INDEX player_development_trait_first_observed
  ON player_development_trait_observations
  (league_id, franchise_season_id, source_player_id, development_trait, observed_at, week_index);

CREATE INDEX player_development_trait_snapshot
  ON player_development_trait_observations (league_id, snapshot_id);

CREATE TRIGGER player_development_trait_observations_tenant_guard
BEFORE INSERT ON player_development_trait_observations
WHEN NOT EXISTS (
    SELECT 1 FROM franchise_seasons
    WHERE id = NEW.franchise_season_id AND league_id = NEW.league_id
  )
  OR NOT EXISTS (
    SELECT 1 FROM league_snapshots
    WHERE id = NEW.snapshot_id AND league_id = NEW.league_id
  )
  OR (
    NEW.player_identity_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM player_identities
      WHERE id = NEW.player_identity_id AND league_id = NEW.league_id
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'Development trait observation must belong to its league');
END;

-- Establish the currently live snapshot as the honest tracking baseline for
-- every league. A Week 1 baseline is shown as Season opening; a later baseline
-- remains explicitly phrased as First observed Week N.
WITH active_players AS (
  SELECT
    active.league_id,
    COALESCE(
      (
        SELECT destination.franchise_season_id
        FROM companion_candidate_import_runs run
        JOIN companion_import_destinations destination
          ON destination.id = run.destination_id AND destination.league_id = run.league_id
        WHERE run.league_id = active.league_id AND run.candidate_snapshot_id = active.snapshot_id
        ORDER BY run.created_at DESC LIMIT 1
      ),
      (
        SELECT season.id FROM franchise_seasons season
        WHERE season.league_id = active.league_id AND season.status IN ('active', 'preview')
        ORDER BY CASE season.status WHEN 'active' THEN 0 ELSE 1 END,
          season.season_year DESC, season.created_at DESC LIMIT 1
      )
    ) AS franchise_season_id,
    active.snapshot_id,
    record.external_id AS source_player_id,
    (
      SELECT alias.player_identity_id FROM player_source_aliases alias
      WHERE alias.league_id = record.league_id AND alias.source_player_id = record.external_id
      ORDER BY alias.updated_at DESC LIMIT 1
    ) AS player_identity_id,
    COALESCE(
      json_extract(record.data_json, '$.team_external_id'),
      json_extract(record.data_json, '$.teamExternalId'),
      json_extract(record.data_json, '$.team_id'),
      json_extract(record.data_json, '$.teamId')
    ) AS team_external_id,
    COALESCE(
      json_extract(record.data_json, '$.display_name'),
      json_extract(record.data_json, '$.displayName'),
      trim(COALESCE(json_extract(record.data_json, '$.first_name'), json_extract(record.data_json, '$.firstName'), '') || ' ' ||
        COALESCE(json_extract(record.data_json, '$.last_name'), json_extract(record.data_json, '$.lastName'), '')),
      record.external_id
    ) AS player_name,
    COALESCE(json_extract(record.data_json, '$.position'), json_extract(record.data_json, '$.positionName')) AS position,
    CAST(COALESCE(json_extract(record.data_json, '$.years_pro'), json_extract(record.data_json, '$.yearsPro')) AS INTEGER) AS years_pro,
    lower(replace(replace(COALESCE(
      json_extract(record.data_json, '$.development_trait'),
      json_extract(record.data_json, '$.developmentTrait'),
      json_extract(record.data_json, '$.dev_trait'),
      json_extract(record.data_json, '$.devTrait'), ''
    ), '-', ''), ' ', '')) AS trait_key,
    snapshot.season_year,
    COALESCE(json_extract(snapshot.manifest_json, '$.currentPeriod.stage'), 'regular-season') AS stage,
    COALESCE(
      CAST(json_extract(snapshot.manifest_json, '$.currentPeriod.week') AS INTEGER),
      snapshot.week_index,
      0
    ) AS week_index,
    COALESCE(snapshot.activated_at, active.activated_at, CURRENT_TIMESTAMP) AS observed_at
  FROM league_active_snapshots active
  JOIN league_snapshots snapshot
    ON snapshot.id = active.snapshot_id AND snapshot.league_id = active.league_id
  JOIN league_snapshot_records record
    ON record.snapshot_id = active.snapshot_id AND record.league_id = active.league_id
   AND record.domain = 'players'
)
INSERT OR IGNORE INTO player_development_trait_observations
  (league_id, franchise_season_id, snapshot_id, source_player_id, player_identity_id,
   team_external_id, player_name, position, years_pro, development_trait,
   season_year, stage, week_index, observed_at)
SELECT league_id, franchise_season_id, snapshot_id, source_player_id, player_identity_id,
  team_external_id, player_name, position, years_pro,
  CASE WHEN trait_key IN ('3', 'xfactor', 'superstarxfactor') THEN 'X-Factor' ELSE 'Superstar' END,
  season_year, stage, week_index, observed_at
FROM active_players
WHERE franchise_season_id IS NOT NULL
  AND trait_key IN ('2', '3', 'superstar', 'xfactor', 'superstarxfactor');

INSERT INTO schema_migrations (version, name)
VALUES (43, 'player_development_trait_observations');
