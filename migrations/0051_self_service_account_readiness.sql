-- Invitation-only beta and single-use account actions. Existing leagues and
-- provider identities retain their access and data without alteration.
PRAGMA foreign_keys = ON;

CREATE TABLE platform_beta_invitations (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  claimed_by_user_id TEXT REFERENCES users(id),
  claimed_at TEXT,
  plan_id TEXT UNIQUE REFERENCES platform_league_onboarding_plans(id),
  CHECK ((claimed_by_user_id IS NULL) = (claimed_at IS NULL))
);
CREATE INDEX platform_beta_invitations_claimant ON platform_beta_invitations(claimed_by_user_id);
CREATE TABLE platform_beta_redemptions (
  invitation_id TEXT NOT NULL PRIMARY KEY REFERENCES platform_beta_invitations(id),
  plan_id TEXT NOT NULL UNIQUE REFERENCES platform_league_onboarding_plans(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  redeemed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER beta_activation_requires_valid_invitation BEFORE INSERT ON platform_league_activations
WHEN EXISTS (SELECT 1 FROM platform_league_onboarding_plans WHERE id=NEW.plan_id
  AND json_extract(configuration_json,'$.betaInvitationRequired')=1)
AND NOT EXISTS (SELECT 1 FROM platform_beta_invitations WHERE plan_id=NEW.plan_id
  AND claimed_by_user_id=NEW.initial_commissioner_user_id AND revoked_at IS NULL
  AND datetime(expires_at)>CURRENT_TIMESTAMP)
BEGIN SELECT RAISE(ABORT,'A valid beta invitation is required'); END;

CREATE TABLE account_action_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify-email','reset-password','link-email')),
  token_hash TEXT NOT NULL UNIQUE,
  identity_id TEXT REFERENCES user_auth_identities(id) ON DELETE CASCADE,
  credential_version INTEGER,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  consumption_id TEXT UNIQUE,
  delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending','sent','failed'))
);
CREATE INDEX account_action_tokens_user ON account_action_tokens(user_id,purpose,created_at);

CREATE TABLE account_email_throttles (
  address_hash TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);

INSERT INTO schema_migrations(version,name) VALUES (51,'self_service_account_readiness');
