# Recovery plan

Rollback Pages to the last verified 8.2.15 deployment fb2e38e5-d677-43ea-a9cc-b1eedd513e6d if needed. Preserve schema 54, active snapshots, season history and all Discord conversations. No Worker rollback is required.

Before rolling back, note that 8.2.15 preseason synchronization archives active threads; avoid running preseason imports/sync until the launch-preservation repair is restored. Existing launched threads require no deletion. Retry Schedule Sync or Sync Week 1 Threads resumes retained scheduling work. Never change the league clock to manufacture regular-season Week 1.
