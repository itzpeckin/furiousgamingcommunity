-- FranchiseHQ 7.3.7 — season-scoped ownership and GM career history
--
-- Membership assignments remain the only owner authority. Madden owner-name
-- fields are never used. Week boundaries make an ownership change stable in
-- franchise chronology even when Madden's scheduled calendar is simulated.

PRAGMA foreign_keys = ON;

ALTER TABLE team_ownership_periods ADD COLUMN started_stage TEXT NOT NULL DEFAULT 'preseason';
ALTER TABLE team_ownership_periods ADD COLUMN started_week INTEGER NOT NULL DEFAULT 1;
ALTER TABLE team_ownership_periods ADD COLUMN ended_stage TEXT;
ALTER TABLE team_ownership_periods ADD COLUMN ended_week INTEGER;

CREATE TABLE gm_season_summaries (
  league_id TEXT NOT NULL,
  franchise_season_id TEXT NOT NULL,
  gm_identity_id TEXT NOT NULL,
  teams_json TEXT NOT NULL DEFAULT '[]',
  regular_wins INTEGER NOT NULL DEFAULT 0,
  regular_losses INTEGER NOT NULL DEFAULT 0,
  regular_ties INTEGER NOT NULL DEFAULT 0,
  playoff_wins INTEGER NOT NULL DEFAULT 0,
  playoff_losses INTEGER NOT NULL DEFAULT 0,
  playoff_ties INTEGER NOT NULL DEFAULT 0,
  playoff_appearance INTEGER NOT NULL DEFAULT 0 CHECK (playoff_appearance IN (0,1)),
  conference_championships INTEGER NOT NULL DEFAULT 0,
  super_bowl_appearances INTEGER NOT NULL DEFAULT 0,
  super_bowl_championships INTEGER NOT NULL DEFAULT 0,
  game_count INTEGER NOT NULL DEFAULT 0,
  source_snapshot_id TEXT,
  frozen_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (league_id, franchise_season_id, gm_identity_id),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (franchise_season_id) REFERENCES franchise_seasons(id) ON DELETE RESTRICT,
  FOREIGN KEY (gm_identity_id) REFERENCES gm_identities(id) ON DELETE RESTRICT,
  FOREIGN KEY (source_snapshot_id) REFERENCES league_snapshots(id) ON DELETE SET NULL
);

CREATE INDEX idx_gm_season_summaries_identity
  ON gm_season_summaries (league_id, gm_identity_id, franchise_season_id);
CREATE INDEX idx_ownership_period_scope
  ON team_ownership_periods
    (league_id, franchise_season_id, team_key, started_stage, started_week, ended_stage, ended_week);

-- Existing active team assignments were already reviewed in Teams & Owners.
-- Establish their person-owned baseline automatically so commissioners do not
-- need a second initialization action after the release is deployed.
INSERT OR IGNORE INTO gm_identities
  (id, league_id, user_id, public_id, display_name)
SELECT
  'gm_identity_' || lower(hex(randomblob(16))),
  membership.league_id,
  membership.user_id,
  'gm_' || lower(hex(randomblob(16))),
  COALESCE(NULLIF(trim(user.display_name), ''), NULLIF(trim(user.discord_global_name), ''), NULLIF(trim(user.discord_username), ''), 'League Member')
FROM league_memberships membership
JOIN users user ON user.id = membership.user_id
WHERE membership.active = 1
  AND membership.team_id IS NOT NULL
  AND trim(membership.team_id) <> '';

WITH reviewed_assignment AS (
  SELECT
    membership.league_id,
    identity.id AS gm_identity_id,
    lower(trim(membership.team_id)) AS team_key,
    COALESCE(
      (SELECT destination.franchise_season_id
       FROM league_active_snapshots active
       JOIN companion_candidate_import_runs run
         ON run.league_id = active.league_id AND run.candidate_snapshot_id = active.snapshot_id
       JOIN companion_import_destinations destination
         ON destination.id = run.destination_id AND destination.league_id = run.league_id
       WHERE active.league_id = membership.league_id
       ORDER BY run.completed_at DESC, run.created_at DESC
       LIMIT 1),
      (SELECT season.id
       FROM franchise_seasons season
       WHERE season.league_id = membership.league_id AND season.status = 'active'
       ORDER BY season.season_year DESC, season.created_at DESC
       LIMIT 1),
      (SELECT season.id
       FROM franchise_seasons season
       WHERE season.league_id = membership.league_id AND season.status = 'preview'
       ORDER BY season.season_year DESC, season.created_at DESC
       LIMIT 1)
    ) AS franchise_season_id
  FROM league_memberships membership
  JOIN gm_identities identity
    ON identity.league_id = membership.league_id AND identity.user_id = membership.user_id
  WHERE membership.active = 1
    AND membership.team_id IS NOT NULL
    AND trim(membership.team_id) <> ''
)
INSERT INTO team_ownership_periods
  (id, league_id, gm_identity_id, team_key, franchise_season_id, started_at, started_stage, started_week, assignment_source)
SELECT
  'ownership_period_' || lower(hex(randomblob(16))),
  assignment.league_id,
  assignment.gm_identity_id,
  assignment.team_key,
  assignment.franchise_season_id,
  CURRENT_TIMESTAMP,
  'preseason',
  1,
  'commissioner-reviewed-baseline'
FROM reviewed_assignment assignment
WHERE assignment.franchise_season_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM team_ownership_periods period
    WHERE period.league_id = assignment.league_id
      AND period.gm_identity_id = assignment.gm_identity_id
      AND period.ended_at IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM team_ownership_periods period
    WHERE period.league_id = assignment.league_id
      AND period.team_key = assignment.team_key
      AND period.ended_at IS NULL
  );

INSERT INTO schema_migrations (version, name)
VALUES (27, 'gm_career_history');
