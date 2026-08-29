-- FranchiseHQ 7.3.0 — Madden NFL 27 discovery foundation
--
-- Discovery sessions isolate one real Companion export, retain only a hash of
-- the short-lived capture token, and link duplicate route payloads without
-- copying the same raw object. Discovery reports contain structural metadata
-- only and never activate or replace league data.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS madden_discovery_sessions (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'review_required', 'passed', 'expired', 'cancelled')),
  expected_game_release TEXT,
  expected_platform TEXT,
  expected_league_name TEXT,
  expected_season TEXT,
  expected_week TEXT,
  capture_count INTEGER NOT NULL DEFAULT 0,
  opened_by_user_id TEXT,
  expires_at TEXT NOT NULL,
  last_capture_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (opened_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS madden_discovery_session_captures (
  league_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  capture_id TEXT NOT NULL,
  route_path TEXT NOT NULL,
  observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (league_id, session_id, capture_id),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES madden_discovery_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (capture_id) REFERENCES companion_route_captures(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS madden_discovery_reports (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'review_required'
    CHECK (status IN ('review_required', 'passed')),
  route_count INTEGER NOT NULL DEFAULT 0,
  capture_count INTEGER NOT NULL DEFAULT 0,
  total_bytes INTEGER NOT NULL DEFAULT 0,
  capture_window_ms INTEGER,
  source_markers_json TEXT NOT NULL DEFAULT '{}',
  source_verification_json TEXT NOT NULL DEFAULT '{}',
  dataset_inventory_json TEXT NOT NULL DEFAULT '[]',
  field_inventory_json TEXT NOT NULL DEFAULT '[]',
  relationship_inventory_json TEXT NOT NULL DEFAULT '[]',
  requirement_results_json TEXT NOT NULL DEFAULT '{}',
  free_agent_evidence_json TEXT NOT NULL DEFAULT '{}',
  sanitized_fixture_json TEXT NOT NULL DEFAULT '{}',
  report_hash TEXT NOT NULL,
  generated_by_user_id TEXT,
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (league_id, session_id),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES madden_discovery_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (generated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_madden_discovery_sessions_league_created
  ON madden_discovery_sessions(league_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_madden_discovery_sessions_expiry
  ON madden_discovery_sessions(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_madden_discovery_session_captures_session
  ON madden_discovery_session_captures(league_id, session_id, observed_at);
CREATE INDEX IF NOT EXISTS idx_madden_discovery_reports_league_generated
  ON madden_discovery_reports(league_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_companion_route_captures_league_session
  ON companion_route_captures(league_id, discovery_session_id, received_at);

INSERT INTO schema_migrations (version, name)
VALUES (22, 'madden_27_discovery_foundation');
