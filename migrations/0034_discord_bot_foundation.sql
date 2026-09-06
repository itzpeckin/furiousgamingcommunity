-- FranchiseHQ 7.4.4.3 — global, tenant-safe Discord application foundation.
--
-- The tables are additive. Existing identities, memberships, assignments,
-- snapshots, trades, competition records, settings, and audits are preserved.

PRAGMA foreign_keys = ON;

CREATE TABLE discord_league_installations (
  id TEXT NOT NULL PRIMARY KEY,
  league_id TEXT NOT NULL UNIQUE,
  discord_guild_id TEXT NOT NULL UNIQUE,
  application_id TEXT,
  trade_committee_channel_id TEXT,
  notification_channel_id TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled', 'removed')),
  installed_by_user_id TEXT,
  installed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (installed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE discord_interaction_receipts (
  interaction_id TEXT NOT NULL PRIMARY KEY,
  application_id TEXT NOT NULL,
  discord_guild_id TEXT,
  league_id TEXT NOT NULL,
  discord_user_id TEXT,
  command_name TEXT NOT NULL,
  interaction_type INTEGER NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('public', 'private')),
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'rejected', 'failed')),
  response_digest TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  expires_at TEXT NOT NULL DEFAULT (datetime('now', '+1 day')),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

CREATE TABLE discord_delivery_events (
  id TEXT NOT NULL PRIMARY KEY,
  league_id TEXT NOT NULL,
  user_id TEXT,
  discord_user_id TEXT,
  channel_id TEXT,
  event_type TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  visibility TEXT NOT NULL
    CHECK (visibility IN ('direct-message', 'private-channel')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'suppressed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (visibility = 'direct-message' AND discord_user_id IS NOT NULL)
    OR (visibility = 'private-channel' AND channel_id IS NOT NULL)
  ),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE user_stream_profiles (
  user_id TEXT NOT NULL PRIMARY KEY,
  twitch_handle TEXT NOT NULL,
  twitch_url TEXT NOT NULL,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE league_news_posts (
  id TEXT NOT NULL PRIMARY KEY,
  league_id TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Commissioner',
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  author_user_id TEXT NOT NULL,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_discord_installations_status
  ON discord_league_installations (status, discord_guild_id);
CREATE INDEX idx_discord_receipts_expiry
  ON discord_interaction_receipts (expires_at, status);
CREATE INDEX idx_discord_receipts_tenant_created
  ON discord_interaction_receipts (league_id, created_at DESC);
CREATE INDEX idx_discord_delivery_pending
  ON discord_delivery_events (status, available_at, created_at);
CREATE INDEX idx_discord_delivery_tenant_created
  ON discord_delivery_events (league_id, created_at DESC);
CREATE INDEX idx_news_published
  ON league_news_posts (league_id, status, published_at DESC, created_at DESC);

-- Preserve an already configured guild/league relationship without installing,
-- enabling, or otherwise changing Discord for an unconnected league.
INSERT OR IGNORE INTO discord_league_installations
  (id, league_id, discord_guild_id, application_id, status, installed_at, updated_at)
SELECT
  'discord_installation_' || id,
  id,
  discord_guild_id,
  NULL,
  'active',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM leagues
WHERE discord_connected = 1
  AND discord_guild_id IS NOT NULL
  AND trim(discord_guild_id) <> '';

-- Every existing in-app notification receives one durable, private Discord
-- delivery intent. Delivery is best effort; the in-app record remains primary.
CREATE TRIGGER trg_league_notification_discord_delivery
AFTER INSERT ON league_notifications
WHEN EXISTS (
  SELECT 1 FROM users
  WHERE users.id = NEW.user_id
    AND users.discord_user_id IS NOT NULL
    AND trim(users.discord_user_id) <> ''
)
BEGIN
  INSERT OR IGNORE INTO discord_delivery_events
    (id, league_id, user_id, discord_user_id, event_type, resource_type,
     resource_id, visibility, payload_json, idempotency_key)
  SELECT
    'discord_delivery_' || lower(hex(randomblob(16))),
    NEW.league_id,
    NEW.user_id,
    users.discord_user_id,
    NEW.notification_type,
    'trade_workflow',
    NEW.trade_id,
    'direct-message',
    json_object(
      'title', NEW.title,
      'message', NEW.message,
      'tradeId', NEW.trade_id,
      'leagueSlug', leagues.slug
    ),
    'league-notification:' || NEW.id
  FROM users
  INNER JOIN leagues ON leagues.id = NEW.league_id
  WHERE users.id = NEW.user_id;
END;

INSERT INTO schema_migrations (version, name)
VALUES (34, 'discord_bot_foundation');
