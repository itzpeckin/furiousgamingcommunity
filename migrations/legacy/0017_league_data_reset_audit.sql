-- FranchiseHQ 7.0.4 — auditable Madden/test-data resets
CREATE TABLE IF NOT EXISTS league_data_reset_audit (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  preserved_user_ids_json TEXT NOT NULL,
  deleted_counts_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id),
  FOREIGN KEY (actor_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_league_data_reset_audit_league_created
  ON league_data_reset_audit (league_id, created_at DESC);

INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
VALUES (17, 'league_data_reset_audit', CURRENT_TIMESTAMP);
