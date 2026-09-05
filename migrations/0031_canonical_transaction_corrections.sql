-- FranchiseHQ 7.4.1 — append-only canonical transaction corrections.

PRAGMA foreign_keys = ON;

CREATE TABLE league_transaction_history (
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
  confidence TEXT NOT NULL DEFAULT 'inferred',
  details_json TEXT NOT NULL DEFAULT '{}',
  participants_json TEXT NOT NULL DEFAULT '[]',
  movements_json TEXT NOT NULL DEFAULT '[]',
  source_types_json TEXT NOT NULL DEFAULT '[]',
  source_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

CREATE INDEX idx_league_transaction_history_season
  ON league_transaction_history (league_id,season DESC,week DESC,occurred_at DESC);

INSERT INTO league_transaction_history
  (id,league_id,event_type,status,authority,execution_status,season,week,occurred_at,
   team_ids_json,player_ids_json,workflow_trade_id,confidence,details_json,created_at,updated_at)
SELECT id,league_id,event_type,status,authority,execution_status,season,week,occurred_at,
  team_ids_json,player_ids_json,workflow_trade_id,confidence,details_json,created_at,updated_at
FROM canonical_transactions;

UPDATE league_transaction_history
SET source_count=(SELECT COUNT(*) FROM canonical_transaction_evidence evidence
  WHERE evidence.transaction_id=league_transaction_history.id),
    source_types_json=COALESCE((SELECT json_group_array(DISTINCT evidence.source_type)
      FROM canonical_transaction_evidence evidence
      WHERE evidence.transaction_id=league_transaction_history.id),'[]'),
    movements_json=COALESCE((SELECT json_group_array(json(movement.value))
      FROM canonical_transaction_evidence evidence,
           json_each(evidence.evidence_json,'$.moves') movement
      WHERE evidence.transaction_id=league_transaction_history.id),'[]'),
    participants_json=COALESCE((SELECT json_group_array(json_object(
        'id',player.value,
        'name',COALESCE((SELECT historical.player_name FROM canonical_historical_player_states historical
          WHERE historical.league_id=league_transaction_history.league_id
            AND historical.player_id=CAST(player.value AS TEXT)
          ORDER BY historical.created_at DESC LIMIT 1),'Player '||CAST(player.value AS TEXT)),
        'position',(SELECT historical.position FROM canonical_historical_player_states historical
          WHERE historical.league_id=league_transaction_history.league_id
            AND historical.player_id=CAST(player.value AS TEXT)
          ORDER BY historical.created_at DESC LIMIT 1)
      )) FROM json_each(league_transaction_history.player_ids_json) player),'[]');

CREATE TABLE canonical_transaction_corrections (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  season INTEGER,
  week INTEGER,
  occurred_at TEXT,
  team_ids_json TEXT NOT NULL DEFAULT '[]',
  player_ids_json TEXT NOT NULL DEFAULT '[]',
  correction_reason TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (league_id,transaction_id,revision),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (transaction_id) REFERENCES league_transaction_history(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_canonical_transaction_corrections_latest
  ON canonical_transaction_corrections (league_id,transaction_id,revision DESC);

INSERT INTO schema_migrations (version, name)
VALUES (31, 'canonical_transaction_corrections');
