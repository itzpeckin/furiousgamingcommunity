PRAGMA foreign_keys = ON;

CREATE TABLE discord_trade_rooms (
  id TEXT NOT NULL PRIMARY KEY,
  league_id TEXT NOT NULL,
  trade_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  discord_guild_id TEXT NOT NULL,
  parent_channel_id TEXT NOT NULL,
  discord_thread_id TEXT UNIQUE,
  message_id TEXT,
  status TEXT NOT NULL DEFAULT 'creating'
    CHECK (status IN ('creating','active','committee','approved','rejected','withdrawn','failed','archived')),
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (league_id, trade_id),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (trade_id) REFERENCES trade_workflows(id) ON DELETE CASCADE
);

CREATE INDEX idx_discord_trade_rooms_status
  ON discord_trade_rooms (league_id, status, updated_at DESC);

INSERT INTO schema_migrations (version, name)
VALUES (37, 'discord_trade_rooms');
