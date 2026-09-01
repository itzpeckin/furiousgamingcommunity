-- FranchiseHQ 7.4.0 — shared Trade Center, draft-pick ledger, and Madden reconciliation

PRAGMA foreign_keys = ON;

CREATE TABLE trade_workflows (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  franchise_season_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','negotiating','committee','approved','rejected','withdrawn')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  mutation_token TEXT NOT NULL,
  proposer_user_id TEXT NOT NULL,
  proposer_team_key TEXT NOT NULL,
  note TEXT,
  free_trade INTEGER NOT NULL DEFAULT 0 CHECK (free_trade IN (0,1)),
  review_threshold INTEGER NOT NULL DEFAULT 3 CHECK (review_threshold >= 1),
  decision_reason TEXT,
  approved_at TEXT,
  rejected_at TEXT,
  slot_released_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (franchise_season_id) REFERENCES franchise_seasons(id) ON DELETE RESTRICT,
  FOREIGN KEY (proposer_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE trade_workflow_participants (
  trade_id TEXT NOT NULL,
  league_id TEXT NOT NULL,
  team_key TEXT NOT NULL,
  accepted_revision INTEGER,
  accepted_by_user_id TEXT,
  accepted_at TEXT,
  PRIMARY KEY (trade_id, team_key),
  FOREIGN KEY (trade_id) REFERENCES trade_workflows(id) ON DELETE CASCADE,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (accepted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE trade_workflow_assets (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL,
  league_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  asset_type TEXT NOT NULL CHECK (asset_type IN ('player','draft-pick')),
  player_identity_id TEXT,
  draft_pick_id TEXT,
  source_player_id TEXT,
  from_team_key TEXT NOT NULL,
  to_team_key TEXT NOT NULL,
  ordinal INTEGER NOT NULL DEFAULT 0,
  CHECK (from_team_key <> to_team_key),
  CHECK (
    (asset_type='player' AND player_identity_id IS NOT NULL AND draft_pick_id IS NULL)
    OR (asset_type='draft-pick' AND draft_pick_id IS NOT NULL AND player_identity_id IS NULL)
  ),
  UNIQUE (trade_id, revision, asset_type, player_identity_id, draft_pick_id),
  FOREIGN KEY (trade_id) REFERENCES trade_workflows(id) ON DELETE CASCADE,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (player_identity_id) REFERENCES player_identities(id) ON DELETE RESTRICT
);

CREATE TABLE trade_workflow_messages (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL,
  league_id TEXT NOT NULL,
  author_user_id TEXT,
  event_type TEXT NOT NULL DEFAULT 'message',
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trade_id) REFERENCES trade_workflows(id) ON DELETE CASCADE,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE trade_workflow_reviews (
  trade_id TEXT NOT NULL,
  league_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  reviewer_user_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approve','reject','abstain')),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (trade_id, revision, reviewer_user_id),
  FOREIGN KEY (trade_id) REFERENCES trade_workflows(id) ON DELETE CASCADE,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE league_draft_picks (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  franchise_season_id TEXT NOT NULL,
  draft_class INTEGER NOT NULL,
  round INTEGER NOT NULL CHECK (round BETWEEN 1 AND 7),
  original_team_key TEXT NOT NULL,
  current_team_key TEXT NOT NULL,
  source_authority TEXT NOT NULL DEFAULT 'franchisehq-ledger'
    CHECK (source_authority IN ('franchisehq-ledger','madden')),
  source_snapshot_id TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (league_id, franchise_season_id, draft_class, round, original_team_key),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (franchise_season_id) REFERENCES franchise_seasons(id) ON DELETE RESTRICT,
  FOREIGN KEY (source_snapshot_id) REFERENCES league_snapshots(id) ON DELETE SET NULL
);

CREATE TABLE trade_block_listings (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  team_key TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('player','draft-pick')),
  player_identity_id TEXT,
  draft_pick_id TEXT,
  requested_return TEXT,
  needs_json TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  listed_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (asset_type='player' AND player_identity_id IS NOT NULL AND draft_pick_id IS NULL)
    OR (asset_type='draft-pick' AND draft_pick_id IS NOT NULL AND player_identity_id IS NULL)
  ),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (player_identity_id) REFERENCES player_identities(id) ON DELETE RESTRICT,
  FOREIGN KEY (draft_pick_id) REFERENCES league_draft_picks(id) ON DELETE RESTRICT,
  FOREIGN KEY (listed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX idx_trade_block_active_player
  ON trade_block_listings (league_id, player_identity_id)
  WHERE active=1 AND player_identity_id IS NOT NULL;
CREATE UNIQUE INDEX idx_trade_block_active_pick
  ON trade_block_listings (league_id, draft_pick_id)
  WHERE active=1 AND draft_pick_id IS NOT NULL;

CREATE TABLE league_notifications (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  trade_id TEXT,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (trade_id) REFERENCES trade_workflows(id) ON DELETE CASCADE
);

CREATE TABLE trade_roster_overlays (
  trade_id TEXT NOT NULL,
  league_id TEXT NOT NULL,
  player_identity_id TEXT NOT NULL,
  source_player_id TEXT NOT NULL,
  from_team_key TEXT NOT NULL,
  to_team_key TEXT NOT NULL,
  source_snapshot_id TEXT NOT NULL,
  internal_status TEXT NOT NULL DEFAULT 'active'
    CHECK (internal_status IN ('active','matched','reverted','superseded')),
  resolved_snapshot_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  PRIMARY KEY (trade_id, player_identity_id),
  FOREIGN KEY (trade_id) REFERENCES trade_workflows(id) ON DELETE CASCADE,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (player_identity_id) REFERENCES player_identities(id) ON DELETE RESTRICT,
  FOREIGN KEY (source_snapshot_id) REFERENCES league_snapshots(id) ON DELETE RESTRICT,
  FOREIGN KEY (resolved_snapshot_id) REFERENCES league_snapshots(id) ON DELETE SET NULL
);

CREATE TABLE trade_reconciliation_events (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  trade_id TEXT NOT NULL,
  player_identity_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('matched','reverted','different-team')),
  expected_team_key TEXT NOT NULL,
  madden_team_key TEXT,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (league_id, trade_id, player_identity_id, snapshot_id),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (trade_id) REFERENCES trade_workflows(id) ON DELETE CASCADE,
  FOREIGN KEY (player_identity_id) REFERENCES player_identities(id) ON DELETE RESTRICT,
  FOREIGN KEY (snapshot_id) REFERENCES league_snapshots(id) ON DELETE CASCADE
);

CREATE INDEX idx_trade_workflows_league_status
  ON trade_workflows (league_id, franchise_season_id, status, updated_at DESC);
CREATE INDEX idx_trade_assets_current
  ON trade_workflow_assets (league_id, trade_id, revision, asset_type);
CREATE INDEX idx_trade_notifications_user
  ON league_notifications (league_id, user_id, read_at, created_at DESC);
CREATE INDEX idx_trade_overlays_active
  ON trade_roster_overlays (league_id, internal_status, source_player_id);
CREATE UNIQUE INDEX idx_trade_overlays_one_active_player
  ON trade_roster_overlays (league_id, player_identity_id)
  WHERE internal_status='active';
CREATE INDEX idx_draft_picks_owner
  ON league_draft_picks (league_id, franchise_season_id, current_team_key, draft_class, round);
CREATE UNIQUE INDEX idx_canonical_transaction_workflow_trade
  ON canonical_transactions (league_id, workflow_trade_id)
  WHERE workflow_trade_id IS NOT NULL;

CREATE TRIGGER trg_trade_approval_pick_authority
BEFORE UPDATE OF status ON trade_workflows
WHEN NEW.status='approved' AND OLD.status<>'approved' AND EXISTS (
  SELECT 1 FROM trade_workflow_assets asset
  WHERE asset.trade_id=NEW.id AND asset.league_id=NEW.league_id AND asset.revision=NEW.revision
    AND asset.asset_type='draft-pick'
    AND NOT EXISTS (
      SELECT 1 FROM league_draft_picks pick
      WHERE pick.id=asset.draft_pick_id AND pick.league_id=NEW.league_id
        AND pick.franchise_season_id=NEW.franchise_season_id
        AND pick.current_team_key=asset.from_team_key
    )
)
BEGIN
  SELECT RAISE(ABORT, 'Draft-pick ownership changed before approval');
END;

INSERT INTO schema_migrations (version, name)
VALUES (28, 'full_trade_center');
