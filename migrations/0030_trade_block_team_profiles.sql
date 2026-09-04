-- FranchiseHQ 7.4.0.4 — server-backed team needs for the Trade Block.

PRAGMA foreign_keys = ON;

CREATE TABLE trade_block_team_profiles (
  league_id TEXT NOT NULL,
  team_key TEXT NOT NULL,
  needs_json TEXT NOT NULL DEFAULT '[]',
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (league_id,team_key),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_trade_block_team_profiles_league
  ON trade_block_team_profiles (league_id,updated_at);

INSERT INTO schema_migrations (version, name)
VALUES (30, 'trade_block_team_profiles');
