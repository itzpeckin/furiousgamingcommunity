-- FranchiseHQ 7.3.4.1 — permanent per-league Madden export URL
--
-- One deterministic, revocable credential is derived for each league from its
-- token version and the server signing secret. The credential itself is never
-- stored. Captures and reports remain immutable; only the latest eligible
-- report pointer advances when a complete export is analyzed.

PRAGMA foreign_keys = ON;

CREATE TABLE companion_league_export_endpoints (
  league_id TEXT NOT NULL PRIMARY KEY,
  token_version INTEGER NOT NULL DEFAULT 1 CHECK (token_version >= 1),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  latest_session_id TEXT,
  latest_session_token_version INTEGER CHECK (latest_session_token_version IS NULL OR latest_session_token_version >= 1),
  latest_report_id TEXT,
  latest_ready_report_id TEXT,
  last_received_at TEXT,
  last_analyzed_at TEXT,
  analysis_requested_at TEXT,
  created_by_user_id TEXT,
  rotated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  rotated_at TEXT,
  revoked_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (latest_session_id) REFERENCES madden_discovery_sessions(id) ON DELETE SET NULL,
  FOREIGN KEY (latest_report_id) REFERENCES madden_discovery_reports(id) ON DELETE SET NULL,
  FOREIGN KEY (latest_ready_report_id) REFERENCES madden_discovery_reports(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (rotated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_league_export_endpoints_status
  ON companion_league_export_endpoints (status, updated_at DESC);

INSERT OR IGNORE INTO companion_league_export_endpoints (league_id)
SELECT id FROM leagues;

-- Preserve the latest structural report for visibility. Only a report already
-- used by a preview-ready candidate is backfilled as an eligible import source.
UPDATE companion_league_export_endpoints
SET latest_report_id = (
      SELECT report.id FROM madden_discovery_reports report
      WHERE report.league_id = companion_league_export_endpoints.league_id
      ORDER BY report.generated_at DESC, report.rowid DESC LIMIT 1
    ),
    latest_session_id = (
      SELECT report.session_id FROM madden_discovery_reports report
      WHERE report.league_id = companion_league_export_endpoints.league_id
      ORDER BY report.generated_at DESC, report.rowid DESC LIMIT 1
    ),
    latest_session_token_version = token_version,
    last_analyzed_at = (
      SELECT report.generated_at FROM madden_discovery_reports report
      WHERE report.league_id = companion_league_export_endpoints.league_id
      ORDER BY report.generated_at DESC, report.rowid DESC LIMIT 1
    )
WHERE EXISTS (
  SELECT 1 FROM madden_discovery_reports report
  WHERE report.league_id = companion_league_export_endpoints.league_id
);

UPDATE companion_league_export_endpoints
SET latest_ready_report_id = (
  SELECT report.id
  FROM companion_candidate_import_runs run
  JOIN madden_discovery_reports report
    ON report.league_id = run.league_id
   AND report.session_id = run.discovery_session_id
  WHERE run.league_id = companion_league_export_endpoints.league_id
    AND run.status = 'preview-ready'
  ORDER BY run.completed_at DESC, run.created_at DESC, run.rowid DESC
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM companion_candidate_import_runs run
  WHERE run.league_id = companion_league_export_endpoints.league_id
    AND run.status = 'preview-ready'
);

UPDATE companion_league_export_endpoints
SET last_received_at = (
  SELECT session.last_capture_at FROM madden_discovery_sessions session
  WHERE session.league_id = companion_league_export_endpoints.league_id
    AND session.id = companion_league_export_endpoints.latest_session_id
  LIMIT 1
);

CREATE TRIGGER companion_league_export_endpoint_on_league_create
AFTER INSERT ON leagues
BEGIN
  INSERT OR IGNORE INTO companion_league_export_endpoints (league_id)
  VALUES (NEW.id);
END;

INSERT INTO schema_migrations (version, name)
VALUES (26, 'permanent_league_export_url');
