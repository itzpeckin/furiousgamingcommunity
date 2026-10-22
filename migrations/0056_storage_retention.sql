-- Working import data can move to verified cold storage; published history stays in D1.
CREATE TABLE storage_retention_runs (
  league_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('teams','players','games','statistics')),
  mapping_run_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','complete')),
  archived_rows INTEGER NOT NULL DEFAULT 0,
  archived_bytes INTEGER NOT NULL DEFAULT 0,
  last_checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  PRIMARY KEY(league_id,kind,mapping_run_id),
  FOREIGN KEY(league_id) REFERENCES leagues(id) ON DELETE CASCADE
);
INSERT INTO schema_migrations(version,name) VALUES(56,'storage_retention');
