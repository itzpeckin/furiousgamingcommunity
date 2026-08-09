-- Franchise HQ v5.9.3.7a -- Snapshot Validation & Activation
PRAGMA foreign_keys = ON;
ALTER TABLE league_snapshots ADD COLUMN validation_status TEXT;
ALTER TABLE league_snapshots ADD COLUMN validation_score REAL;
ALTER TABLE league_snapshots ADD COLUMN validation_error_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE league_snapshots ADD COLUMN validation_warning_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE league_snapshots ADD COLUMN validation_report_json TEXT;
ALTER TABLE league_snapshots ADD COLUMN validated_at TEXT;
ALTER TABLE league_snapshots ADD COLUMN archived_at TEXT;
CREATE TABLE IF NOT EXISTS league_active_snapshots (
  league_id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  activated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activated_by TEXT,
  previous_snapshot_id TEXT,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (snapshot_id) REFERENCES league_snapshots(id) ON DELETE RESTRICT,
  FOREIGN KEY (previous_snapshot_id) REFERENCES league_snapshots(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS league_snapshot_lifecycle_events (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_id TEXT,
  detail_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (snapshot_id) REFERENCES league_snapshots(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_snapshot_lifecycle_events_league ON league_snapshot_lifecycle_events (league_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshot_lifecycle_events_snapshot ON league_snapshot_lifecycle_events (snapshot_id, created_at DESC);
INSERT OR REPLACE INTO schema_migrations (version, name, applied_at) VALUES (10, 'snapshot_validation_activation', CURRENT_TIMESTAMP);
