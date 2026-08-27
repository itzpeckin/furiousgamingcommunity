-- Franchise HQ v5.9.3.0
-- Route discovery storage. Existing authentication and league tables are untouched.

CREATE TABLE IF NOT EXISTS companion_route_captures (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  discovery_session_id TEXT NOT NULL,
  route_path TEXT NOT NULL,
  request_method TEXT NOT NULL,
  content_type TEXT,
  byte_length INTEGER NOT NULL DEFAULT 0,
  payload_hash TEXT NOT NULL,
  r2_object_key TEXT NOT NULL,
  top_level_keys_json TEXT,
  collections_json TEXT,
  request_headers_json TEXT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  UNIQUE (league_id, route_path, payload_hash)
);

CREATE INDEX IF NOT EXISTS idx_companion_route_captures_league_received
  ON companion_route_captures (league_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_companion_route_captures_session
  ON companion_route_captures (discovery_session_id, received_at);

INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
VALUES (3, 'madden_companion_route_discovery', CURRENT_TIMESTAMP);
