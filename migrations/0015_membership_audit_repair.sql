-- FranchiseHQ 7.0.3 — Repair the production membership audit dependency.
CREATE INDEX IF NOT EXISTS idx_memberships_league_active
  ON league_memberships(league_id, active);
CREATE INDEX IF NOT EXISTS idx_memberships_user_active
  ON league_memberships(user_id, active);
CREATE INDEX IF NOT EXISTS idx_memberships_league_team
  ON league_memberships(league_id, team_id);

CREATE TABLE IF NOT EXISTS league_membership_audit (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  actor_user_id TEXT,
  subject_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  detail_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id),
  FOREIGN KEY (actor_user_id) REFERENCES users(id),
  FOREIGN KEY (subject_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_membership_audit_league_created
  ON league_membership_audit(league_id, created_at DESC);

INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
VALUES (15, 'membership_audit_repair', CURRENT_TIMESTAMP);
