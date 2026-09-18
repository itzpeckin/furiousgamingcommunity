-- FranchiseHQ 7.6.0-rc.1 — retained, destination-safe Discord delivery diagnostics.
-- This migration is additive. It does not replay deliveries or modify existing
-- outbox, trade, league, roster, snapshot, or audit rows.

CREATE TABLE discord_delivery_destination_attempts (
  id TEXT NOT NULL PRIMARY KEY,
  league_id TEXT NOT NULL,
  delivery_event_id TEXT NOT NULL,
  destination_delivery_event_id TEXT,
  resource_id TEXT,
  attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
  destination_kind TEXT NOT NULL,
  event_type TEXT NOT NULL,
  visibility TEXT NOT NULL
    CHECK (visibility IN ('direct-message', 'private-channel')),
  outcome TEXT NOT NULL
    CHECK (outcome IN ('updated', 'skipped', 'missing', 'failed')),
  message_count INTEGER NOT NULL DEFAULT 0 CHECK (message_count >= 0),
  error_code TEXT,
  error_status INTEGER,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (delivery_event_id) REFERENCES discord_delivery_events(id) ON DELETE CASCADE,
  FOREIGN KEY (destination_delivery_event_id) REFERENCES discord_delivery_events(id) ON DELETE SET NULL
);

CREATE INDEX discord_delivery_destination_attempts_event
  ON discord_delivery_destination_attempts (delivery_event_id, attempt_number, created_at DESC);

CREATE INDEX discord_delivery_destination_attempts_tenant_outcome
  ON discord_delivery_destination_attempts (league_id, outcome, created_at DESC);

INSERT INTO schema_migrations (version, name)
VALUES (45, 'discord_delivery_diagnostics');
