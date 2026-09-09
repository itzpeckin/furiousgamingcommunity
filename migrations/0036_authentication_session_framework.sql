PRAGMA foreign_keys = ON;

ALTER TABLE sessions ADD COLUMN absolute_expires_at TEXT;
ALTER TABLE sessions ADD COLUMN last_rotated_at TEXT;
ALTER TABLE sessions ADD COLUMN parent_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN csrf_token_hash TEXT;
ALTER TABLE sessions ADD COLUMN revocation_reason TEXT;
ALTER TABLE sessions ADD COLUMN recovery_mode TEXT NOT NULL DEFAULT 'standard'
  CHECK (recovery_mode IN ('standard', 'mobile-handoff', 'owner-recovery'));

UPDATE sessions
SET absolute_expires_at = COALESCE(absolute_expires_at, expires_at),
    last_rotated_at = COALESCE(last_rotated_at, created_at)
WHERE absolute_expires_at IS NULL OR last_rotated_at IS NULL;

ALTER TABLE league_memberships ADD COLUMN authorization_version INTEGER NOT NULL DEFAULT 1
  CHECK (authorization_version >= 1);

CREATE TABLE IF NOT EXISTS session_security_events (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  user_id TEXT NOT NULL,
  league_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'issued',
    'rotated',
    'expired',
    'logged_out',
    'membership_revoked',
    'owner_recovery'
  )),
  reason TEXT,
  request_origin TEXT,
  user_agent_hash TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS authentication_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_absolute_expires_at
  ON sessions(absolute_expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user_active
  ON sessions(user_id, revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_session_security_events_user_created
  ON session_security_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_security_events_league_created
  ON session_security_events(league_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_authentication_rate_limits_expires
  ON authentication_rate_limits(expires_at);

INSERT INTO schema_migrations (version, name)
VALUES (36, 'authentication_session_framework');
