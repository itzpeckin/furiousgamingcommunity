-- Franchise HQ v5.9.3.1
-- Stores safe structural inspection reports for captured Madden Companion routes.
CREATE TABLE IF NOT EXISTS companion_dataset_inspections (
  id TEXT PRIMARY KEY,
  capture_id TEXT NOT NULL UNIQUE,
  league_id TEXT NOT NULL,
  discovery_session_id TEXT NOT NULL,
  route_path TEXT NOT NULL,
  dataset_type TEXT NOT NULL,
  dataset_label TEXT NOT NULL,
  confidence TEXT NOT NULL,
  confidence_score INTEGER NOT NULL DEFAULT 0,
  record_count INTEGER NOT NULL DEFAULT 0,
  schema_json TEXT NOT NULL,
  inspected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (capture_id) REFERENCES companion_route_captures(id) ON DELETE CASCADE,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dataset_inspections_session
  ON companion_dataset_inspections (league_id, discovery_session_id, route_path);

CREATE INDEX IF NOT EXISTS idx_dataset_inspections_type
  ON companion_dataset_inspections (league_id, dataset_type, inspected_at DESC);

INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
VALUES (4, 'dataset_classification_payload_inspection', CURRENT_TIMESTAMP);
