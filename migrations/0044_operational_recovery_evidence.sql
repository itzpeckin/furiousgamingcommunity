-- FranchiseHQ 7.5.9 — tenant-safe operational and recovery evidence
--
-- This additive migration records only sanitized operational outcomes and
-- recovery proof. It does not copy, rewrite, activate, archive, or delete any
-- league data, snapshot, export, roster, transaction, or Discord record.

PRAGMA foreign_keys = ON;

CREATE TABLE league_operational_events (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  component TEXT NOT NULL,
  event_code TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  outcome TEXT NOT NULL DEFAULT 'recorded'
    CHECK (outcome IN ('recorded', 'success', 'failed', 'contained', 'resolved')),
  snapshot_id TEXT,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE RESTRICT,
  FOREIGN KEY (snapshot_id) REFERENCES league_snapshots(id) ON DELETE SET NULL
);

CREATE TABLE league_recovery_evidence (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  release TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('local', 'staging', 'production')),
  evidence_type TEXT NOT NULL
    CHECK (evidence_type IN ('bookmark', 'reconciliation', 'restore-drill')),
  status TEXT NOT NULL
    CHECK (status IN ('verified', 'failed')),
  database_bookmark TEXT,
  schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
  active_snapshot_id TEXT,
  protected_counts_json TEXT NOT NULL DEFAULT '{}',
  reconciliation_json TEXT NOT NULL DEFAULT '{}',
  request_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  recorded_by_user_id TEXT,
  verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE RESTRICT,
  FOREIGN KEY (active_snapshot_id) REFERENCES league_snapshots(id) ON DELETE SET NULL,
  FOREIGN KEY (recorded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX league_operational_events_tenant_created
  ON league_operational_events (league_id, created_at DESC);

CREATE INDEX league_operational_events_tenant_severity
  ON league_operational_events (league_id, severity, outcome, created_at DESC);

CREATE INDEX league_recovery_evidence_tenant_verified
  ON league_recovery_evidence (league_id, verified_at DESC);

INSERT INTO schema_migrations (version, name)
VALUES (44, 'operational_recovery_evidence');
