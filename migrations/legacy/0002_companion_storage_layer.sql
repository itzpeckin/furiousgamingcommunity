-- Franchise HQ v5.9.2.1
-- Safe compatibility migration for the existing franchise-hq-db.
-- This does not alter users, sessions, leagues, league_memberships, or oauth_states.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS companion_export_fingerprints (
  league_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  export_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (league_id, payload_hash),
  UNIQUE (export_id),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (export_id) REFERENCES companion_exports(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS companion_export_events (
  id TEXT PRIMARY KEY,
  export_id TEXT NOT NULL,
  league_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  detail_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (export_id) REFERENCES companion_exports(id) ON DELETE CASCADE,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_companion_export_events_export
  ON companion_export_events (export_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_companion_export_events_league
  ON companion_export_events (league_id, created_at DESC);

INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
VALUES (2, 'companion_storage_layer', CURRENT_TIMESTAMP);
