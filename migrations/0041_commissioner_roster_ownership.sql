PRAGMA foreign_keys = ON;

CREATE UNIQUE INDEX idx_player_identities_tenant_identity ON player_identities (league_id,id);
CREATE UNIQUE INDEX idx_draft_picks_tenant_identity ON league_draft_picks (league_id,id);
CREATE UNIQUE INDEX idx_snapshots_tenant_identity ON league_snapshots (league_id,id);

-- Ownership survives same-edition imports and season advancement. A separately
-- authorized game-year archive copies/removes/restores its edition-scoped ledger.
-- Immutable commissioner audit source IDs remain historical identifiers, validated
-- on INSERT, even if that archive removes the snapshot or pick runtime rows.

CREATE TABLE league_player_ownership (
  league_id TEXT NOT NULL,
  player_identity_id TEXT NOT NULL,
  source_player_id TEXT NOT NULL,
  current_team_key TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  source_snapshot_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('commissioner','trade')),
  actor_user_id TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (league_id,player_identity_id),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (league_id,player_identity_id) REFERENCES player_identities(league_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (league_id,source_snapshot_id) REFERENCES league_snapshots(league_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE commissioner_roster_movements (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('player','draft-pick')),
  player_identity_id TEXT,
  draft_pick_id TEXT,
  source_player_id TEXT,
  asset_name TEXT NOT NULL,
  from_team_key TEXT NOT NULL,
  to_team_key TEXT NOT NULL,
  source_team_key TEXT,
  expected_revision INTEGER NOT NULL CHECK (expected_revision >= 0),
  source_snapshot_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (league_id,request_id),
  CHECK (from_team_key <> to_team_key),
  CHECK ((asset_type='player' AND player_identity_id IS NOT NULL AND draft_pick_id IS NULL AND source_player_id IS NOT NULL)
    OR (asset_type='draft-pick' AND draft_pick_id IS NOT NULL AND player_identity_id IS NULL)),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (league_id,player_identity_id) REFERENCES player_identities(league_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_player_ownership_team ON league_player_ownership (league_id,current_team_key);
CREATE INDEX idx_roster_movements_league ON commissioner_roster_movements (league_id,created_at DESC,id);

CREATE TRIGGER trg_roster_movement_actor_guard BEFORE INSERT ON commissioner_roster_movements
WHEN NOT EXISTS (SELECT 1 FROM league_memberships member WHERE member.league_id=NEW.league_id AND member.user_id=NEW.actor_user_id AND member.active=1 AND member.role='commissioner')
BEGIN SELECT RAISE(ABORT,'Active commissioner access is required'); END;

CREATE TRIGGER trg_roster_movement_snapshot_guard BEFORE INSERT ON commissioner_roster_movements
WHEN NOT EXISTS (SELECT 1 FROM league_active_snapshots active WHERE active.league_id=NEW.league_id AND active.snapshot_id=NEW.source_snapshot_id)
BEGIN SELECT RAISE(ABORT,'Roster snapshot changed; refresh and try again'); END;

CREATE TRIGGER trg_roster_movement_pick_guard BEFORE INSERT ON commissioner_roster_movements
WHEN NEW.asset_type='draft-pick' AND NOT EXISTS (SELECT 1 FROM league_draft_picks pick
  WHERE pick.league_id=NEW.league_id AND pick.id=NEW.draft_pick_id AND pick.revision=NEW.expected_revision AND pick.current_team_key=NEW.from_team_key)
BEGIN SELECT RAISE(ABORT,'Draft-pick ownership changed; refresh and try again'); END;

CREATE TRIGGER trg_roster_movement_player_guard BEFORE INSERT ON commissioner_roster_movements
WHEN NEW.asset_type='player' AND (
  COALESCE((SELECT ownership.revision FROM league_player_ownership ownership WHERE ownership.league_id=NEW.league_id AND ownership.player_identity_id=NEW.player_identity_id),0)<>NEW.expected_revision
  OR COALESCE((SELECT ownership.current_team_key FROM league_player_ownership ownership WHERE ownership.league_id=NEW.league_id AND ownership.player_identity_id=NEW.player_identity_id),
    (SELECT overlay.to_team_key FROM trade_roster_overlays overlay WHERE overlay.league_id=NEW.league_id AND overlay.player_identity_id=NEW.player_identity_id AND overlay.internal_status='active'),NEW.source_team_key,'')<>NEW.from_team_key)
BEGIN SELECT RAISE(ABORT,'Player ownership changed; refresh and try again'); END;

CREATE TRIGGER trg_trade_approval_player_ownership BEFORE UPDATE OF status ON trade_workflows
WHEN NEW.status='approved' AND OLD.status<>'approved' AND EXISTS (SELECT 1 FROM trade_workflow_assets asset
  JOIN league_player_ownership ownership ON ownership.league_id=asset.league_id AND ownership.player_identity_id=asset.player_identity_id
  WHERE asset.league_id=NEW.league_id AND asset.trade_id=NEW.id AND asset.revision=NEW.revision AND asset.asset_type='player' AND ownership.current_team_key<>asset.from_team_key)
BEGIN SELECT RAISE(ABORT,'Player ownership changed before approval'); END;

CREATE TRIGGER trg_roster_movement_immutable_update BEFORE UPDATE ON commissioner_roster_movements
BEGIN SELECT RAISE(ABORT,'Roster movement audit is append-only'); END;
CREATE TRIGGER trg_roster_movement_immutable_delete BEFORE DELETE ON commissioner_roster_movements
BEGIN SELECT RAISE(ABORT,'Roster movement audit is append-only'); END;

INSERT INTO schema_migrations (version,name) VALUES (41,'commissioner_roster_ownership');
