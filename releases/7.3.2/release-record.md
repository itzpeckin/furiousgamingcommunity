# FranchiseHQ 7.3.2 Release Record

**Status:** Production cold-performance target met; owner acceptance pending

**Production authorized:** Yes, for the accepted 7.3.2 deployment, performance remediation commits `7557730694aafaf74ec2498cb9f9d1af1ea9745f` and `972bea60d8e5a9fee1c6a043e8e9f6d3d26b354a`, the first consolidated remediation rehearsal, and one additional cold repair rehearsal

**Production changed:** Yes. Git Main and the active-snapshot pointer are unchanged.

## Scope

Deploy the commissioner-operated Madden 27 candidate importer to Production, transition the live data plane from Madden 26 to Madden 27 while preserving platform identities and policy data, apply migrations 21–24, and run one authenticated candidate-only rehearsal. Madden game year is explicitly separate from franchise season year: leagues persist across editions while Madden-derived data can be archived and removed from the active application at the next edition transition.

## Added during delivery

- Deployed the exact 7.3.2 Pages/Functions source and import Worker without merging or moving Git Main.
- Created a clean Madden 27 Production D1, applied the continuous schema through migration 24, and rebound the Production runtime to it.
- Preserved one league, eight users, 104 pre-existing sessions, eight memberships, and six membership-audit rows. All eight legacy Madden 26 team assignments were cleared for reviewed Madden 27 remapping. No rules/settings rows existed to copy.
- Archived 38 Madden-domain tables / 76,712 rows under a verified private Madden 26 game-year manifest and retained the former D1 as a detached relational archive.
- Permanently deleted 1,295 obsolete Madden 26 raw-source R2 objects / 241,070,631 bytes and removed two obsolete Companion KV pointers.
- Loaded the certified Madden 27 source lock: 43 captures / 10,150,363 bytes, one reviewed 2026 franchise season, 32 team identities, and 2,044 rostered-player identities.
- Created one 15-minute commissioner acceptance session, completed the private candidate workflow, revoked the session, and retained its two audit rows.
- Optimized exact source-report reuse, exact-session classification reuse, bounded R2 inspection, mapper/build batches, and candidate validation round trips in commit `7557730`.
- Used the one authorized remediation rehearsal. It stopped before candidate build when statistics route `xbsx/742482/week/reg/7/defense` hit D1's SQL-variable ceiling; the failed run and its start audit remain retained, no snapshot was created or activated, and all temporary sessions were revoked.
- Repaired the discovered limit in commit `972bea6` by retaining the 200-record work chunk while batching complete player-identity lookups into safe 75-value D1 reads. The strict gate and hosted checks passed, and the exact repair is deployed to both Pages/Functions and the import Worker.
- Used the newly authorized cold repair rehearsal exactly once. Reused run `candidate_import_ee1356d9-c6a9-4faa-b2c1-548761069339` reached `preview-ready` in 43.763 seconds, 16.237 seconds inside the sub-60 target, and retained validated private snapshot `841ce1b5-a4a6-4246-a53a-01cd1f189663` without activating it.

## Known inherited blockers

- Madden's explicit Free Agent route remains blocked upstream. The candidate is `rostered-players-only`; Free Agent count is unknown/null and is never interpreted as zero.
- The first Production cold rehearsal completed in 74.387 seconds, above the sub-60 target. The first remediation rehearsal later stopped safely at statistics mapping after exposing D1's SQL-variable ceiling. Exact repair `972bea6` then completed the separately authorized cold rerun in 43.763 seconds, meeting the Production target; final owner acceptance remains separate from snapshot activation.
- The Production Cloudflare configuration still lacks a dedicated `LEAGUE_CONFIG` KV binding and an explicit `PLATFORM_OWNER_ACCOUNT_ID` variable. Existing commissioner candidate routes work, but these inherited contract gaps remain visible.
- The first direct Pages upload (`1bee7993`) omitted Functions and was discarded. Complete deployment `ebcf42ec` superseded it and passed Functions/auth smoke checks.
- The direct acceptance upload temporarily changed the Git-build output directory to a local absolute path. Evidence commit `237bb3d` therefore failed its first automatic Preview in seven seconds with `build output directory is outside of the repository`. The project setting was restored to the repository root, isolated Preview `9bdb6209` verified the corrected configuration, and retry `791c66a6` restored PR #12 to 4/4 passing checks.
- The former Madden 26 D1 rows were not deleted in place. Safety review rejected destructive remote SQL, so the database was detached from Production and retained as an additional recovery archive. It is not reachable through the active application.

## Validation evidence

- The consolidated strict gate passed before deployment: 77/77 tests, 194 JavaScript modules, 544 secret-scanned files, 522 inventory files, 63 routes, 68 required tables, schema 24, and zero registered/unregistered failures.
- Production `/api/platform/status` reports configured/ready with D1, R2, KV, secret, schema 24, and `commissioner_candidate_import`. The canonical Discord login endpoint returns an HTTP 302 rather than a broken file URL; the guest candidate endpoint returns HTTP 401.
- The authenticated Production candidate contains 32 teams, 2,044 rostered players, 14 games, 510 statistics, and 32 standings. Validation is `ready` with zero errors and foreign-key verification returns zero violations.
- Free Agents remain `blocked` with a null count. Completeness is `rostered-players-only`.
- The active snapshot ID was null before and after. `league_active_snapshots` remains empty; activation was never called.
- Every Production rehearsal session is revoked, no rehearsal session remains active, no membership role was changed, and team assignments remain zero.
- The initial Production cold duration was 74.387 seconds. Exact repair `972bea6` subsequently completed the separately authorized cold rerun in 43.763 seconds, meeting the sub-60 target with 16.237 seconds of headroom while retaining the initial failed performance result as evidence.
- The remediation rehearsal run `candidate_import_ee1356d9-c6a9-4faa-b2c1-548761069339` completed analyze source in 1.002 seconds, classification in 0.720 seconds, teams in 1.129 seconds, players in 6.291 seconds, and schedule in 1.129 seconds. Statistics mapping failed after 2.669 seconds in mapping run `7363b576-2332-4905-9c6c-2e462d9d1eac` with `D1_ERROR: too many SQL variables`; candidate and validation phases did not run.
- Post-failure safety verification returned zero active snapshots, eight users, eight memberships, zero team assignments, six membership-audit rows, zero active rehearsal sessions, and zero foreign-key violations. Free Agents remained blocked with a null count.
- The repaired source passed the consolidated strict gate (77/77 tests, 194 modules, 544 secret-scanned files, 522 inventory files, 63 routes, 68 tables) and PR #12 reports 4/4 successful hosted checks with no conflicts.
- The additional repaired cold rehearsal completed all nine candidate phases in 43.763 seconds. Phase timings were: analyze 1.003s, classify 0.640s, teams 1.028s, players 5.146s, schedule 1.013s, statistics 13.285s, candidate build 5.144s, and validation 5.977s.
- Repaired candidate `841ce1b5-a4a6-4246-a53a-01cd1f189663` is private and validation-ready at score 99.2 with zero errors: 32 teams, 2,044 rostered players, 14 games, 510 statistics, and 32 standings. Its one warning is the inherited rostered-player-only completeness warning caused by the blocked upstream Free Agent route.
- Post-rerun verification returned zero active snapshots, eight users, eight memberships, zero team assignments, six membership-audit rows, 109 total sessions, zero active rehearsal sessions, and zero foreign-key violations. The new session is revoked; Free Agents are still `blocked` with a JSON null count.

## Deployment status

- Runtime source: exact repaired commit `972bea60d8e5a9fee1c6a043e8e9f6d3d26b354a` (tree `9a51840e4f46021a72d2921d7376d0a0efeeb3fc`).
- Branch: `codex/franchisehq-7.3.2`; PR #12 remains open and clean with 4/4 hosted checks passing. Git Main remains `4045e02980c93491b47910f17fcb2e48fae76c68`.
- Complete repaired Pages Production deployment: `61165506-9d06-4f95-9760-58f73389d37c`, available at `https://franchisehq.app` and `https://61165506.franchise-hq.pages.dev`. The temporary Cloudflare branch target was restored to `main` without moving Git Main or replacing the repaired deployment.
- Hosted branch-build repair: failed Preview `0227f1eb` was superseded by successful same-commit retry `791c66a6-2ce2-4e23-9c91-a69535449319`; the durable build output setting is `/` again.
- Worker Production version: `a772c7e7` from build `1d77476a-70ab-4877-9183-fd993566cc62` / commit `972bea6` at 100%.
- Active D1: `franchise-hq-db-madden27` / `b2529150-28af-42ca-a07b-69506764ccb6`; continuous ledger through migration 24 and zero foreign-key violations.
- Detached Madden 26 D1: `franchise-hq-db` / `d21fb8c2-1b26-4766-9249-73af5d8b6678`.
- Production candidate destination `import_destination_8bbd1c19-864f-4d57-b53a-49501e370fad`, run `candidate_import_0fec6fdd-e27c-4d89-ad0d-dcc7ff054fe0`, and validated private snapshot `c7023ac0-e6d8-476c-949b-483092830fdd` are retained for owner review.
- Remediation run `candidate_import_ee1356d9-c6a9-4faa-b2c1-548761069339` was reset through its explicit retry path and is now `preview-ready`; its earlier failed statistics run `7363b576-2332-4905-9c6c-2e462d9d1eac` remains retained as diagnostic evidence. The repaired run pins team mapping `c339e31c-e5e1-4e83-a040-997e64f67cd1`, player mapping `572f19ca-ced6-4a28-9203-e31dc4f70978`, schedule mapping `1d5cab38-8b27-4961-acfe-a7a0ff64160f`, and statistics mapping `cd5a3426-1b88-4b4d-b49e-f70a56b49b89`.
- The repaired private candidate snapshot is `841ce1b5-a4a6-4246-a53a-01cd1f189663`. It is validation-ready but not active; two append-only candidate snapshots are retained for review and `league_active_snapshots` remains empty.
- No snapshot was activated, no Git Main change was made, and no credentials were changed.

## Rollback

- Functional code rollback target is the slower but validated Pages deployment `ebcf42ec-5a7c-4efa-8e88-891f6c06fcaa`; deployment `6ea23d00` must not be used because it contains the D1 lookup-limit defect. The D1 binding must be reviewed explicitly before rollback, and reconnecting the detached Madden 26 database is prohibited.
- The clean Madden 27 D1 and additive schema remain forward-compatible during a code rollback. Do not drop migrations 21–24.
- The detached Madden 26 D1 and verified private archive remain the recovery sources. The 1,295 deleted raw R2 objects are not recoverable from the former raw-source bucket.
- Candidate, identity, session-audit, and game-year-transition audit rows are retained. Their removal requires a new exact-target authorization.
- Snapshot rollback is not applicable because the active-snapshot table is empty.
