-- FranchiseHQ 7.5.5.3 — league-scoped Discord Trade Committee role routing.
--
-- This migration is additive. Existing Discord channels, trade rooms, trades,
-- memberships, snapshots, imports, and audit history remain unchanged.

PRAGMA foreign_keys = ON;

ALTER TABLE discord_league_installations ADD COLUMN trade_committee_role_id TEXT;

INSERT INTO schema_migrations (version, name)
VALUES (39, 'discord_trade_committee_role');
