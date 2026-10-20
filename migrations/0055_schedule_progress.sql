-- Additive progress survives request boundaries and commissioner page reloads.
ALTER TABLE discord_schedule_sync_runs ADD COLUMN progress_json TEXT NOT NULL DEFAULT '{}';
INSERT INTO schema_migrations(version,name) VALUES(55,'schedule_progress');
