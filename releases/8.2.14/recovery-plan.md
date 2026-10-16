# FGC 2027 additive recovery

Authorized by the owner asking to run the diagnosed fix. Target only Cloudflare account cc973c5a4c4ed410382f376244af078f, production D1 b2529150-28af-42ca-a07b-69506764ccb6, league franchise-hq-primary.

- Closed season: franchise_season_1905bf4f-bdf6-4712-a541-ec53aa93fa6d (2027, source 2, franchise 742482, Madden NFL 27).
- Closure: franchise_season_closure_5138bde8-ce12-4292-987b-01080b77c54f. Its recorded source snapshot is e61457b3-8541-4aa9-b4de-98209c0dcfb4.
- Prepared successor: franchise_season_a644248f-67da-497c-8244-b19dfe8c38fc (2028, source 3). Neither season status changes.
- Require zero existing 2027 summaries, the same closure/source binding, unchanged active snapshot, and matching existing source aliases before writing. Stop on disagreement.
- Use the release's shared archive planner and statement builder. Insert 375 missing deterministic identities/aliases and 1,854 summaries, including 1,125 with statistics. Do not overwrite any 2026 summary, existing identity, or closure digest.
- Record a fresh Time Travel bookmark, schema/table/league/user/membership/snapshot counts and FK check. Rehearse the exact batch locally with FK enforcement, read-back totals, repeated execution and rollback on a deliberate failure. Apply one guarded D1 batch with a distinct recovery audit; verify every statement and the exact saved summary digest afterward.
- Original closure evidence stays immutable; the recovery audit records the additional summaries and source digest. Retain the plan and statement list privately in outputs/fgc-2027-recovery, never in public assets.
- Exact stale job eaj_b471d508-7fd2-4f50-a3cb-8e08035ecf85 may be marked failed only while still running at cursor 0 with its original workflow ID and timestamp, and after confirming its Workflow state is errored. Clear its encrypted checkpoint/lock and give retry guidance. Do not change its EA connection or start another export.
- Verify the active snapshot, snapshot records, 2026 summaries, closure, season states, ownership, credentials and Discord settings remain unchanged. No live export/import/archive or Discord posts are part of this repair.

The rehearsal produced summary SHA-256 ddbd2307730fad1c598bbde7ddbceefef4f4888ca990b8f0c71a431290522aee. Retained eligible statistics: 14,938; matched: 14,938; foreign keys clean. A database-wide restore is not authorized; any unexpected result stops the operation and requires investigation.
