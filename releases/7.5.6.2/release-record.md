# FranchiseHQ 7.5.6.2

Status: Production deployed; one-pick correction verified; owner Discord performance acceptance pending.

## Scope

Materialize the league identity and active-ownership map once per Discord autocomplete instead of rescanning aliases for each roster player. Preserve partial search, canonical IDs, current team overrides, trade-block permissions and 25-choice bounds. Deliver slash results without waiting behind the durable Discord outbox; background work uses the proper execution context. Coalesce already-selected sync intents per trade after successful fan-out; new intents stay queued.

## Added during delivery

Production metrics show previous autocomplete at 1,102.3 ms median, with 395.58 million reads over 96 executions. Read-only optimized query on the active snapshot: 35.24 ms. Regression tests cover stalled delivery, execution-context binding and one fan-out per selected vote batch. Existing cross-surface/concurrency/retry/card parity tests remain intact. No design change.

## Known inherited blockers

Ownership-authority redesign, commissioner asset-transfer tools and whole-trade reversal remain discussion only. Imports still retire player overlays; picks cannot be Madden-reconciled. History removal restores allowances but does not reverse ownership. Discord network outages/permissions can still delay delivery; live performance acceptance is owner-operated. Annual source/current-week proof remains deferred until next season.

## Validation evidence

Strict quality gate passes 232/232 tests, 257 syntax checks, 76 routes, 23 canonical migrations and 116 required tables. Focused Discord suite passes 48/48; authentication/mobile passes 12/12. Five correction scenarios prove exact one-pick movement among 672 picks, idempotent replay, stale-revision/different-owner/inactive-actor guards and atomic rollback on audit failure. Migration remains 40; command registration is not required.

## Deployment status

Exact candidate `5f9943b9bee13c1c8faa2ac998fe0c0d3b8abccb` published through PR #98, with all four PR gates passed. Code Main `2e06dbad51073427704b50d9efef119de19d93c9` passed all five quality/build/deployment gates; Pages Production `784d8adf-9952-445a-86f4-f6e9398d15e8` is live. Public health is healthy, landing version and exact app/trade-interface assets match Main, and the read-only Discord endpoint reports 7.5.6.2. No live trade, vote or authenticated UI reload was used for acceptance.

The explicitly requested one-pick correction is applied only in Madden 27 D1 `b2529150-28af-42ca-a07b-69506764ccb6`, after recovery bookmark `0000021d-00003071-000050e5-e0a8b9e0ccb8f047c92accb336c8bdbc`. Tampa Bay 2027 R1 changed from NE/revision 2 to TB/revision 3. Every other 671 owner/revision row is unchanged. Pick-ledger event `pick_correction_20260913_tb_2027_round1` and tenant-audit event `audit_pick_correction_20260913_tb_2027_round1` were verified; totals increased only 1,345→1,346 and 183→184 respectively. Foreign-key violations: 0.

Protected before/after counts match: 1 league, 33 users, 33 memberships, 31 active assignments, 0 legacy teams/players/snapshots, 36 retained league snapshots, 456,988 snapshot records, 1 active pointer at `9b713b20-6bf3-4d82-9df6-79c47acf53ec`, 672 picks, 34 trades, 108 assets, 5 reviews and 3 roster overlays. No import, reset, archive/transition, snapshot change, export URL rotation, credentials, memberships or Free Agent reinterpretation. This is an explicit ownership/data change, not an entirely data-unchanged release.

The dashboard's single-line input removed newlines from the first paste, causing a syntax rejection; a fresh comparison verified no data changed. The complete guarded SQL was then executed as one batch with newlines replaced by spaces. All three statements are retained in pick-correction.sql; it is not a migration or auto-executed application script. Do not rerun it as a new ownership request.

Database autocomplete is about 30× faster (1,060.83→35.24 ms on the same snapshot). Full Discord thread creation, card fan-out and Discord rate limits remain external network work; near-instant end-to-end timing is not claimed. Owner-operated Discord acceptance is pending.

## Rollback

Redeploy prior Main 4800a9254ddaba40b65e6249aabd60ab7f7a2ce8 without migration, reset or import. Keep the independently requested pick correction and its audits. Preserve snapshots, all other ownership, users, credentials and memberships.
