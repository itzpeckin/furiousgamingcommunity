-- FranchiseHQ 7.5.5.5 — audited Trade Center history and allowance management.
--
-- This migration is additive. It does not change any trade, roster overlay,
-- draft-pick owner, canonical transaction, snapshot, membership, or league row.

PRAGMA foreign_keys = ON;

CREATE TABLE trade_management_events (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  franchise_season_id TEXT,
  trade_id TEXT,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('season-counter-reset','trade-hidden','all-trades-hidden')),
  actor_user_id TEXT NOT NULL,
  reason TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (franchise_season_id) REFERENCES franchise_seasons(id) ON DELETE RESTRICT,
  FOREIGN KEY (trade_id) REFERENCES trade_workflows(id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_trade_management_events_league
  ON trade_management_events (league_id, franchise_season_id, event_type, created_at DESC);

CREATE UNIQUE INDEX idx_trade_management_trade_hidden
  ON trade_management_events (league_id, trade_id, event_type)
  WHERE event_type='trade-hidden' AND trade_id IS NOT NULL;

INSERT INTO schema_migrations (version, name)
VALUES (40, 'trade_management_events');
