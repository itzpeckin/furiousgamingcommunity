-- FranchiseHQ 7.0.4 — canonical team ownership integrity
-- Team assignments are stored as normalized Madden-team keys (normally the
-- lowercase franchise abbreviation). A staff role and a team assignment are
-- intentionally independent: commissioners and trade-committee members may
-- also control one franchise.

CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships_one_active_owner_per_team
  ON league_memberships (league_id, lower(team_id))
  WHERE active = 1 AND team_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memberships_league_role_active
  ON league_memberships (league_id, role, active);

INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
VALUES (16, 'canonical_team_ownership', CURRENT_TIMESTAMP);
