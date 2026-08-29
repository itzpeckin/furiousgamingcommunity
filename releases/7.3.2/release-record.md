# FranchiseHQ 7.3.2 Release Record

**Status:** Production acceptance candidate deployed; data integrity verified, Production cold-path performance pending

**Production authorized:** Yes, for exact source commit `4f5e81b4cc924e72bc9b8499ae12164bfd12620c`, additive migrations, the Madden 26-to-27 data-plane transition, and one candidate-import rehearsal

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

## Known inherited blockers

- Madden's explicit Free Agent route remains blocked upstream. The candidate is `rostered-players-only`; Free Agent count is unknown/null and is never interpreted as zero.
- The Production cold rehearsal completed in 74.387 seconds, above the sub-60 target. The same exact implementation completed its isolated-staging rehearsal in 23.456 seconds. Correctness is verified, but Production cold performance remains pending diagnosis and re-validation.
- The Production Cloudflare configuration still lacks a dedicated `LEAGUE_CONFIG` KV binding and an explicit `PLATFORM_OWNER_ACCOUNT_ID` variable. Existing commissioner candidate routes work, but these inherited contract gaps remain visible.
- The first direct Pages upload (`1bee7993`) omitted Functions and was discarded. Complete deployment `ebcf42ec` superseded it and passed Functions/auth smoke checks.
- The former Madden 26 D1 rows were not deleted in place. Safety review rejected destructive remote SQL, so the database was detached from Production and retained as an additional recovery archive. It is not reachable through the active application.

## Validation evidence

- The consolidated strict gate passed before deployment: 77/77 tests, 194 JavaScript modules, 544 secret-scanned files, 522 inventory files, 63 routes, 68 required tables, schema 24, and zero registered/unregistered failures.
- Production `/api/platform/status` reports configured/ready with D1, R2, KV, secret, schema 24, and `commissioner_candidate_import`. The canonical Discord login endpoint returns an HTTP 302 rather than a broken file URL; the guest candidate endpoint returns HTTP 401.
- The authenticated Production candidate contains 32 teams, 2,044 rostered players, 14 games, 510 statistics, and 32 standings. Validation is `ready` with zero errors and foreign-key verification returns zero violations.
- Free Agents remain `blocked` with a null count. Completeness is `rostered-players-only`.
- The active snapshot ID was null before and after. `league_active_snapshots` remains empty; activation was never called.
- The one Production rehearsal session is revoked, no rehearsal session remains active, no membership role was changed, and team assignments remain zero.
- Production cold duration was 74.387 seconds. Phase evidence identifies statistics mapping (20.995 seconds), candidate build (10.546 seconds), and validation (13.370 seconds) as the largest phases. This performance result is retained as a failed acceptance check.

## Deployment status

- Runtime source: exact authorized commit `4f5e81b4cc924e72bc9b8499ae12164bfd12620c` (tree `67ce5f5356174bafd270f2b22782346140c0b8a6`).
- Branch: `codex/franchisehq-7.3.2`; PR #12 remains open and clean with 4/4 hosted checks passing. Git Main remains `4045e02980c93491b47910f17fcb2e48fae76c68`.
- Complete Pages Production deployment: `ebcf42ec-5a7c-4efa-8e88-891f6c06fcaa`, available at `https://franchisehq.app` and `https://ebcf42ec.franchise-hq.pages.dev`.
- Worker Production version: `3b883a17-04bf-4c46-8b2d-e5ab5b98658e` at 100%.
- Active D1: `franchise-hq-db-madden27` / `b2529150-28af-42ca-a07b-69506764ccb6`; continuous ledger through migration 24 and zero foreign-key violations.
- Detached Madden 26 D1: `franchise-hq-db` / `d21fb8c2-1b26-4766-9249-73af5d8b6678`.
- Production candidate destination `import_destination_8bbd1c19-864f-4d57-b53a-49501e370fad`, run `candidate_import_0fec6fdd-e27c-4d89-ad0d-dcc7ff054fe0`, and validated private snapshot `c7023ac0-e6d8-476c-949b-483092830fdd` are retained for owner review.
- No snapshot was activated, no Git Main change was made, and no credentials were changed.

## Rollback

- Code rollback target is Pages deployment `4b1d6840-69d3-485a-957b-e4af9491d727`, but the D1 binding must be reviewed explicitly before rollback. Reconnecting the detached Madden 26 database by accident is prohibited.
- The clean Madden 27 D1 and additive schema remain forward-compatible during a code rollback. Do not drop migrations 21–24.
- The detached Madden 26 D1 and verified private archive remain the recovery sources. The 1,295 deleted raw R2 objects are not recoverable from the former raw-source bucket.
- Candidate, identity, session-audit, and game-year-transition audit rows are retained. Their removal requires a new exact-target authorization.
- Snapshot rollback is not applicable because the active-snapshot table is empty.
