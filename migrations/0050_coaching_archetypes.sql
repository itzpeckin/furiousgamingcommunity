-- Per-league, opt-in text-archetype checks. Weekly ability icons are not enabled.
CREATE TABLE discord_coaching_settings (
  league_id TEXT NOT NULL PRIMARY KEY REFERENCES leagues(id),
  guild_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  source_channel_id TEXT NOT NULL,
  report_channel_id TEXT NOT NULL,
  banned_json TEXT NOT NULL DEFAULT '[]',
  revision INTEGER NOT NULL DEFAULT 1,
  history_before TEXT,
  history_complete INTEGER NOT NULL DEFAULT 0 CHECK(history_complete IN (0,1)),
  live_after TEXT,
  live_before TEXT,
  live_head TEXT,
  next_scan_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lease_token TEXT,
  lease_until TEXT,
  last_scan_at TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX discord_coaching_due ON discord_coaching_settings(enabled,next_scan_at);

CREATE TABLE discord_coaching_submissions (
  league_id TEXT NOT NULL REFERENCES leagues(id),
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  membership_id TEXT,
  team_key TEXT,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  archetype TEXT,
  coach_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','legal','illegal','unreadable','unassigned','removed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  rule_revision INTEGER NOT NULL DEFAULT 0,
  report_channel_id TEXT,
  report_message_id TEXT,
  reported_revision INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  checked_at TEXT,
  PRIMARY KEY(league_id,channel_id,message_id)
);
CREATE INDEX discord_coaching_pending ON discord_coaching_submissions(league_id,status,attempts);
CREATE INDEX discord_coaching_author ON discord_coaching_submissions(league_id,author_id,submitted_at);
INSERT INTO schema_migrations(version,name) VALUES(50,'coaching_archetypes');
