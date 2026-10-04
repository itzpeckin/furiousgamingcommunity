-- Preserve existing opt-ins, bans, reports and history cursors.
ALTER TABLE discord_loadout_settings ADD COLUMN banned_playsheets_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE discord_loadout_submissions ADD COLUMN discovered_at TEXT;
ALTER TABLE discord_loadout_submissions ADD COLUMN processing_started_at TEXT;
ALTER TABLE discord_loadout_submissions ADD COLUMN reported_at TEXT;
ALTER TABLE discord_loadout_submissions ADD COLUMN processing_token TEXT;
ALTER TABLE discord_loadout_submissions ADD COLUMN processing_until TEXT;
ALTER TABLE discord_loadout_submissions ADD COLUMN timings_json TEXT;
ALTER TABLE discord_loadout_submissions ADD COLUMN source_edited_at TEXT;
CREATE INDEX discord_loadout_work ON discord_loadout_submissions(status,processing_until,submitted_at);
INSERT INTO schema_migrations(version,name) VALUES(53,'realtime_loadouts');
