CREATE TABLE IF NOT EXISTS leagues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  product_name TEXT NOT NULL DEFAULT 'Franchise HQ',
  slug TEXT NOT NULL UNIQUE,
  current_season INTEGER NOT NULL DEFAULT 1,
  current_week INTEGER NOT NULL DEFAULT 1,
  trade_start_week INTEGER NOT NULL DEFAULT 1,
  trade_deadline_week INTEGER NOT NULL DEFAULT 9,
  discord_guild_id TEXT,
  discord_connected INTEGER NOT NULL DEFAULT 0,
  public_status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO leagues (
  id,
  name,
  product_name,
  slug,
  current_season,
  current_week,
  trade_start_week,
  trade_deadline_week,
  discord_connected,
  public_status
)
VALUES (
  'franchise-hq-primary',
  'Furious Gaming Community',
  'Franchise HQ',
  'furious-gaming-community',
  1,
  1,
  1,
  9,
  0,
  'active'
);
