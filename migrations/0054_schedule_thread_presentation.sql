-- Cache only successful Discord presentation and membership work. Existing retired rows may refer to deleted threads.
ALTER TABLE discord_schedule_threads ADD COLUMN presentation_json TEXT NOT NULL DEFAULT '{}';
INSERT INTO schema_migrations(version,name) VALUES(54,'schedule_thread_presentation');
