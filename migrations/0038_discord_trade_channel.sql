-- FranchiseHQ 7.5.5 — commissioner-selected private trade-thread routing.
--
-- This migration is additive. Existing Discord routing, trade rooms, trades,
-- memberships, snapshots, imports, and audit history remain unchanged.

PRAGMA foreign_keys = ON;

ALTER TABLE discord_league_installations ADD COLUMN trade_channel_id TEXT;

INSERT INTO schema_migrations (version, name)
VALUES (38, 'discord_trade_channel');
