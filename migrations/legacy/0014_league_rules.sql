CREATE TABLE IF NOT EXISTS league_rules_documents (
  league_id TEXT PRIMARY KEY,
  rules_json TEXT NOT NULL DEFAULT '{"categories":[]}',
  updated_by_user_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_league_rules_updated_at ON league_rules_documents(updated_at);
