-- FranchiseHQ 8.0.0 — provider-independent accounts and gated tenant activation
--
-- Existing Discord identities remain authoritative and are backfilled into the
-- provider-neutral identity ledger. Email credentials are additive. Prepared
-- league shells remain disabled until an explicit Platform Owner activation.
-- No existing league, membership, snapshot, import, export URL, Discord record,
-- audit, or season record is replaced or deleted.

PRAGMA foreign_keys = ON;

CREATE TABLE user_auth_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('discord', 'email')),
  provider_subject TEXT NOT NULL COLLATE NOCASE,
  normalized_email TEXT COLLATE NOCASE,
  email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
  password_hash TEXT,
  password_salt TEXT,
  password_iterations INTEGER CHECK (password_iterations IS NULL OR password_iterations >= 100000),
  credential_version INTEGER NOT NULL DEFAULT 1 CHECK (credential_version >= 1),
  last_authenticated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (provider, provider_subject),
  UNIQUE (user_id, provider),
  CHECK (
    (provider = 'discord' AND normalized_email IS NULL AND password_hash IS NULL
      AND password_salt IS NULL AND password_iterations IS NULL)
    OR
    (provider = 'email' AND normalized_email IS NOT NULL AND password_hash IS NOT NULL
      AND password_salt IS NOT NULL AND password_iterations IS NOT NULL)
  ),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX user_auth_identities_email
  ON user_auth_identities (normalized_email)
  WHERE provider = 'email';

CREATE INDEX user_auth_identities_user
  ON user_auth_identities (user_id, provider);

INSERT INTO user_auth_identities
  (id,user_id,provider,provider_subject,email_verified,last_authenticated_at)
SELECT 'identity_discord_' || id,id,'discord',discord_user_id,1,last_login_at
FROM users
WHERE discord_user_id GLOB '[0-9]*'
  AND discord_user_id NOT GLOB '*[^0-9]*'
  AND length(discord_user_id) BETWEEN 17 AND 20;

ALTER TABLE platform_league_onboarding_plans ADD COLUMN activated_by_user_id TEXT
  REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE platform_league_onboarding_plans ADD COLUMN activated_at TEXT;
ALTER TABLE platform_league_onboarding_plans ADD COLUMN activation_request_id TEXT;

CREATE TABLE platform_league_activations (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL UNIQUE,
  league_id TEXT NOT NULL UNIQUE,
  activated_by_user_id TEXT NOT NULL,
  initial_commissioner_user_id TEXT NOT NULL,
  plan_hash TEXT NOT NULL,
  request_id TEXT NOT NULL UNIQUE,
  previous_tenant_status TEXT NOT NULL,
  previous_public_status TEXT NOT NULL,
  activated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  detail_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (plan_id) REFERENCES platform_league_onboarding_plans(id) ON DELETE RESTRICT,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE RESTRICT,
  FOREIGN KEY (activated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (initial_commissioner_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX platform_league_activations_actor
  ON platform_league_activations (activated_by_user_id, activated_at DESC);

INSERT INTO schema_migrations (version, name)
VALUES (47, 'provider_authentication_and_tenant_activation');
