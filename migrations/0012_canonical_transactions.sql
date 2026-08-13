-- Franchise HQ v5.9.10.1 — Canonical Transaction Engine + Snapshot Diff Foundation
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS canonical_transactions (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'recorded',
  authority TEXT NOT NULL DEFAULT 'snapshot-inferred',
  execution_status TEXT NOT NULL DEFAULT 'observed',
  season INTEGER,
  week INTEGER,
  occurred_at TEXT,
  team_ids_json TEXT NOT NULL DEFAULT '[]',
  player_ids_json TEXT NOT NULL DEFAULT '[]',
  workflow_trade_id TEXT,
  first_snapshot_id TEXT,
  last_snapshot_id TEXT,
  confidence TEXT NOT NULL DEFAULT 'inferred',
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_canonical_transactions_league_created
ON canonical_transactions (league_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_canonical_transactions_workflow
ON canonical_transactions (league_id, workflow_trade_id);

CREATE TABLE IF NOT EXISTS canonical_transaction_evidence (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_key TEXT NOT NULL,
  snapshot_id TEXT,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (league_id, source_type, source_key),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (transaction_id) REFERENCES canonical_transactions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_transaction_evidence_transaction
ON canonical_transaction_evidence (transaction_id, created_at);

CREATE TABLE IF NOT EXISTS canonical_roster_snapshots (
  league_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  season INTEGER,
  week INTEGER,
  captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  player_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (league_id, snapshot_id),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS canonical_roster_snapshot_players (
  league_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  player_name TEXT,
  team_id TEXT,
  roster_status TEXT,
  position TEXT,
  PRIMARY KEY (league_id, snapshot_id, player_id),
  FOREIGN KEY (league_id, snapshot_id)
    REFERENCES canonical_roster_snapshots(league_id, snapshot_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_roster_snapshot_players_league_player
ON canonical_roster_snapshot_players (league_id, player_id, snapshot_id);

INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
VALUES (12, 'canonical_transactions_snapshot_diff', CURRENT_TIMESTAMP);
