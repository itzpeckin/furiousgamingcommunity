-- One result message per league matchup thread; retries edit the same message.
CREATE TABLE discord_game_results (
  thread_record_id TEXT PRIMARY KEY REFERENCES discord_schedule_threads(id) ON DELETE CASCADE,
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  snapshot_id TEXT NOT NULL,
  message_id TEXT,
  payload_hash TEXT,
  nonce TEXT NOT NULL,
  lease_token TEXT,
  lease_until TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_discord_game_results_league ON discord_game_results(league_id);
INSERT INTO schema_migrations(version,name) VALUES (49,'discord_game_results');
