# Recovery plan

Baseline: release 8.2.36, Pages deployment e8a609b7-3e22-49d6-abb2-51cbc3bf366c at source 67145a3d977239ddcfbfde44248d778360c3cf71; scanner Worker version e5f2fa79-d9f5-43ca-b3fe-d716f1c49424. Restore both application deployments and APP_VERSION=8.2.36. Keep LOADOUT_READER_VERSION=m27-glyph-reader-4. Preserve scanner secrets, Durable Object namespace and cron. No database, rule, snapshot, identity or credential restoration is required.
