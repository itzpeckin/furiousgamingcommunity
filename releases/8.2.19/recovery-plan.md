# Recovery

Rollback baseline: v8.2.18, commit 7617520060fdceefe842befb30af5bde8d91308c. Worker baseline: 6f79f48c-1186-48e8-a56f-564fa887e89c.

Restore Pages before removing any coordinator binding. Keep additive migration 55 and the SQLite Durable Object namespace. Existing 8.2.18 code ignores the progress column. Retain all snapshots, thread records and conversations. Inspect active Workflows before Worker rollback; failed jobs resume through Retry Schedule Sync without another export. Never reset job checkpoints to bypass a provider cooldown.
