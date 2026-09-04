-- FranchiseHQ 7.4.0.3 — tenant draft-pick baselines, permanent identities, and audited ownership

PRAGMA foreign_keys = ON;

ALTER TABLE league_draft_picks ADD COLUMN continuity_key TEXT;
ALTER TABLE league_draft_picks ADD COLUMN source_baseline_id TEXT;

UPDATE league_draft_picks AS pick
SET continuity_key = pick.league_id || ':' || pick.draft_class || ':' || pick.round || ':' || lower(pick.original_team_key)
WHERE pick.id = (
  SELECT candidate.id FROM league_draft_picks candidate
  WHERE candidate.league_id=pick.league_id
    AND candidate.draft_class=pick.draft_class
    AND candidate.round=pick.round
    AND lower(candidate.original_team_key)=lower(pick.original_team_key)
  ORDER BY candidate.revision DESC,candidate.updated_at DESC,candidate.id DESC LIMIT 1
);

CREATE UNIQUE INDEX idx_draft_picks_continuity
  ON league_draft_picks (continuity_key)
  WHERE continuity_key IS NOT NULL;
CREATE INDEX idx_draft_picks_active_horizon
  ON league_draft_picks (league_id,draft_class,current_team_key,round);

CREATE TABLE league_draft_pick_baselines (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  baseline_key TEXT NOT NULL,
  baseline_version INTEGER NOT NULL CHECK (baseline_version >= 1),
  game_release TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('franchisehq-generic','league-specific','imported-sheet')),
  source_reference TEXT,
  content_sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','retired')),
  effective_season_year INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (league_id,baseline_key,baseline_version,game_release),
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

CREATE TABLE league_draft_pick_baseline_entries (
  id TEXT PRIMARY KEY,
  baseline_id TEXT NOT NULL,
  league_id TEXT NOT NULL,
  draft_class INTEGER NOT NULL,
  round INTEGER NOT NULL CHECK (round BETWEEN 1 AND 7),
  original_team_key TEXT NOT NULL,
  baseline_owner_team_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (baseline_id,draft_class,round,original_team_key),
  FOREIGN KEY (baseline_id) REFERENCES league_draft_pick_baselines(id) ON DELETE CASCADE,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
);

CREATE TABLE league_draft_pick_baseline_applications (
  id TEXT PRIMARY KEY,
  baseline_id TEXT NOT NULL,
  league_id TEXT NOT NULL,
  franchise_season_id TEXT NOT NULL,
  season_year INTEGER NOT NULL,
  expected_pick_count INTEGER NOT NULL,
  applied_pick_count INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('applying','complete','failed')),
  applied_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (baseline_id,franchise_season_id),
  FOREIGN KEY (baseline_id) REFERENCES league_draft_pick_baselines(id) ON DELETE RESTRICT,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (franchise_season_id) REFERENCES franchise_seasons(id) ON DELETE RESTRICT
);

CREATE TABLE draft_pick_ledger_events (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  draft_pick_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('baseline-created','baseline-updated','trade-approved','commissioner-correction')),
  from_team_key TEXT,
  to_team_key TEXT NOT NULL,
  trade_id TEXT,
  baseline_id TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (draft_pick_id) REFERENCES league_draft_picks(id) ON DELETE RESTRICT,
  FOREIGN KEY (trade_id) REFERENCES trade_workflows(id) ON DELETE SET NULL,
  FOREIGN KEY (baseline_id) REFERENCES league_draft_pick_baselines(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_draft_pick_baselines_league
  ON league_draft_pick_baselines (league_id,game_release,status,effective_season_year);
CREATE INDEX idx_draft_pick_ledger
  ON draft_pick_ledger_events (league_id,draft_pick_id,created_at);

DROP TRIGGER trg_trade_approval_pick_authority;
CREATE TRIGGER trg_trade_approval_pick_authority
BEFORE UPDATE OF status ON trade_workflows
WHEN NEW.status='approved' AND OLD.status<>'approved' AND EXISTS (
  SELECT 1 FROM trade_workflow_assets asset
  WHERE asset.trade_id=NEW.id AND asset.league_id=NEW.league_id AND asset.revision=NEW.revision
    AND asset.asset_type='draft-pick'
    AND NOT EXISTS (
      SELECT 1 FROM league_draft_picks pick
      WHERE pick.id=asset.draft_pick_id AND pick.league_id=NEW.league_id
        AND pick.current_team_key=asset.from_team_key
    )
)
BEGIN
  SELECT RAISE(ABORT, 'Draft-pick ownership changed before approval');
END;

INSERT INTO schema_migrations (version, name)
VALUES (29, 'draft_pick_baselines');
