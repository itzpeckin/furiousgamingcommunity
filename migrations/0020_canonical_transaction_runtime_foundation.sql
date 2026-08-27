-- FranchiseHQ 7.1.0 — canonical transaction and roster-history schema

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

CREATE TABLE IF NOT EXISTS canonical_free_agents (
  league_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  player_name TEXT,
  position TEXT,
  overall INTEGER,
  age INTEGER,
  dev_trait TEXT,
  source_route TEXT,
  source_capture_id TEXT,
  raw_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (league_id, player_id),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS canonical_historical_player_states (
  league_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  player_name TEXT,
  team_id TEXT,
  roster_status TEXT,
  position TEXT,
  raw_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (league_id, snapshot_id, player_id),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS canonical_capture_lifecycle_sessions (
  league_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  received_at TEXT,
  team_route_count INTEGER NOT NULL DEFAULT 0,
  player_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  processed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (league_id, session_id),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS forward_roster_movements (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  previous_snapshot_id TEXT NOT NULL,
  current_snapshot_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  player_name TEXT,
  previous_team_id TEXT,
  current_team_id TEXT,
  previous_roster_status TEXT,
  current_roster_status TEXT,
  position TEXT,
  detection_type TEXT NOT NULL,
  season INTEGER,
  week INTEGER,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  detected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (league_id, previous_snapshot_id, current_snapshot_id, player_id)
);

CREATE TABLE IF NOT EXISTS forward_detection_runs (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  previous_snapshot_id TEXT,
  current_snapshot_id TEXT NOT NULL,
  status TEXT NOT NULL,
  previous_player_count INTEGER NOT NULL DEFAULT 0,
  current_player_count INTEGER NOT NULL DEFAULT 0,
  movement_count INTEGER NOT NULL DEFAULT 0,
  team_change_count INTEGER NOT NULL DEFAULT 0,
  roster_entry_count INTEGER NOT NULL DEFAULT 0,
  roster_exit_count INTEGER NOT NULL DEFAULT 0,
  status_change_count INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (league_id, current_snapshot_id),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS forward_detection_jobs (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  previous_snapshot_id TEXT,
  current_snapshot_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  phase TEXT NOT NULL DEFAULT 'current',
  current_offset INTEGER NOT NULL DEFAULT 0,
  exit_offset INTEGER NOT NULL DEFAULT 0,
  current_total INTEGER NOT NULL DEFAULT 0,
  exit_total INTEGER NOT NULL DEFAULT 0,
  compared_count INTEGER NOT NULL DEFAULT 0,
  movement_count INTEGER NOT NULL DEFAULT 0,
  team_change_count INTEGER NOT NULL DEFAULT 0,
  roster_entry_count INTEGER NOT NULL DEFAULT 0,
  roster_exit_count INTEGER NOT NULL DEFAULT 0,
  status_change_count INTEGER NOT NULL DEFAULT 0,
  error_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  current_cursor TEXT,
  exit_cursor TEXT,
  UNIQUE (league_id, current_snapshot_id)
);

CREATE TABLE IF NOT EXISTS transaction_movement_classifications (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  movement_id TEXT NOT NULL,
  previous_snapshot_id TEXT NOT NULL,
  current_snapshot_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  classification TEXT NOT NULL,
  transaction_family TEXT NOT NULL,
  confidence TEXT NOT NULL,
  candidate_trade INTEGER NOT NULL DEFAULT 0,
  candidate_trade_group_key TEXT,
  free_agent_confirmation_required INTEGER NOT NULL DEFAULT 0,
  source_type TEXT NOT NULL DEFAULT 'snapshot-diff',
  classification_json TEXT NOT NULL DEFAULT '{}',
  classified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (league_id, movement_id)
);

CREATE INDEX IF NOT EXISTS idx_canonical_transactions_league_created
  ON canonical_transactions(league_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_canonical_transactions_workflow
  ON canonical_transactions(league_id, workflow_trade_id);
CREATE INDEX IF NOT EXISTS idx_transaction_evidence_transaction
  ON canonical_transaction_evidence(transaction_id, created_at);
CREATE INDEX IF NOT EXISTS idx_roster_snapshot_players_league_player
  ON canonical_roster_snapshot_players(league_id, player_id, snapshot_id);
CREATE INDEX IF NOT EXISTS idx_canonical_free_agents_league_name
  ON canonical_free_agents(league_id, player_name);
CREATE INDEX IF NOT EXISTS idx_historical_player_states_player
  ON canonical_historical_player_states(league_id, player_id, snapshot_id);
CREATE INDEX IF NOT EXISTS idx_capture_lifecycle_sessions_order
  ON canonical_capture_lifecycle_sessions(league_id, received_at);
CREATE INDEX IF NOT EXISTS idx_forward_roster_movements_pair
  ON forward_roster_movements(league_id, previous_snapshot_id, current_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_forward_roster_movements_player
  ON forward_roster_movements(league_id, player_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_forward_detection_jobs_league
  ON forward_detection_jobs(league_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movement_classifications_current
  ON transaction_movement_classifications(league_id, current_snapshot_id, classification);
CREATE INDEX IF NOT EXISTS idx_movement_classifications_player
  ON transaction_movement_classifications(league_id, player_id, classified_at DESC);
CREATE INDEX IF NOT EXISTS idx_movement_classifications_trade_group
  ON transaction_movement_classifications(league_id, candidate_trade_group_key);

INSERT INTO schema_migrations (version, name)
VALUES (20, 'canonical_transaction_runtime_foundation');
