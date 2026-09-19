-- FranchiseHQ 7.7.2 — disabled-by-default multi-league onboarding
--
-- Platform onboarding plans are isolated from active league authority. A plan
-- may prepare an inaccessible tenant shell, but this migration and its runtime
-- expose no league-activation operation. Existing leagues, memberships,
-- snapshots, imports, Discord state, export URLs, and audits are preserved.

PRAGMA foreign_keys = ON;

CREATE TABLE platform_league_onboarding_plans (
  id TEXT PRIMARY KEY,
  planned_league_id TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL,
  product_name TEXT NOT NULL DEFAULT 'FranchiseHQ',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  game_year INTEGER NOT NULL CHECK (game_year BETWEEN 2020 AND 2100),
  initial_commissioner_user_id TEXT NOT NULL,
  source_mode TEXT NOT NULL DEFAULT 'companion'
    CHECK (source_mode IN ('companion', 'direct-ea', 'csv-excel')),
  desired_domain TEXT COLLATE NOCASE,
  discord_requested INTEGER NOT NULL DEFAULT 0
    CHECK (discord_requested IN (0, 1)),
  discord_guild_id TEXT,
  branding_json TEXT NOT NULL DEFAULT '{}',
  desired_features_json TEXT NOT NULL DEFAULT '{}',
  configuration_json TEXT NOT NULL DEFAULT '{}',
  plan_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'preparing', 'prepared', 'cancelled')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_by_user_id TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  prepared_by_user_id TEXT,
  cancelled_by_user_id TEXT,
  prepared_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (initial_commissioner_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (prepared_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE platform_league_onboarding_events (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'success'
    CHECK (outcome IN ('success', 'failed', 'contained')),
  from_status TEXT,
  to_status TEXT,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  request_id TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_id) REFERENCES platform_league_onboarding_plans(id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX platform_onboarding_status_updated
  ON platform_league_onboarding_plans (status, updated_at DESC);

CREATE UNIQUE INDEX platform_onboarding_desired_domain
  ON platform_league_onboarding_plans (desired_domain)
  WHERE desired_domain IS NOT NULL;

CREATE INDEX platform_onboarding_events_plan_created
  ON platform_league_onboarding_events (plan_id, created_at DESC);

CREATE INDEX platform_onboarding_events_request
  ON platform_league_onboarding_events (request_id, created_at DESC);

INSERT INTO schema_migrations (version, name)
VALUES (46, 'platform_league_onboarding');
