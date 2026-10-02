-- Rules are opt-in, tenant scoped, and separate from archetype checks.
CREATE TABLE discord_loadout_settings (
  league_id TEXT PRIMARY KEY NOT NULL REFERENCES leagues(id),
  guild_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  banned_json TEXT NOT NULL DEFAULT '[]',
  ban_duplicates INTEGER NOT NULL DEFAULT 0 CHECK(ban_duplicates IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1,
  catalog_version TEXT NOT NULL,
  next_scan_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lease_token TEXT,
  lease_until TEXT,
  last_scan_at TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE discord_loadout_threads (
  league_id TEXT NOT NULL REFERENCES leagues(id),
  thread_id TEXT NOT NULL REFERENCES discord_schedule_threads(id),
  history_before TEXT,
  history_complete INTEGER NOT NULL DEFAULT 0,
  live_after TEXT,
  live_before TEXT,
  live_head TEXT,
  last_scan_at TEXT,
  PRIMARY KEY(league_id,thread_id)
);
CREATE TABLE discord_loadout_submissions (
  league_id TEXT NOT NULL REFERENCES leagues(id),
  thread_id TEXT NOT NULL REFERENCES discord_schedule_threads(id),
  message_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  team_key TEXT,
  observed_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','legal','illegal','unreadable','unassigned','removed','ignored')),
  reason TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  rule_revision INTEGER NOT NULL DEFAULT 0,
  report_message_id TEXT,
  reported_revision INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT,
  PRIMARY KEY(league_id,thread_id,message_id)
);
CREATE INDEX discord_loadout_due ON discord_loadout_settings(enabled,next_scan_at);
CREATE INDEX discord_loadout_pending ON discord_loadout_submissions(league_id,thread_id,status,attempts);
INSERT INTO schema_migrations(version,name) VALUES(52,'weekly_loadouts');
