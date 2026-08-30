# FranchiseHQ 7.3.3 Release Record

**Status:** Production deployed; owner acceptance pending; 92/92 strict local checks and 4/4 hosted checks passed

**Production authorized:** Yes — one cumulative 7.3.3 acceptance deployment plus additive migration 25

**Production changed:** Yes — exact candidate `b373f661101c33a2ee2bd17433cfe4001f166b3f` and additive migration 25 are deployed. The active snapshot, protected platform counts, Git Main, and blocked/null Free Agent state remain unchanged.

## Scope

Build reusable, commissioner-operated Madden game-year archive/removal and recovery controls while keeping a Madden game year separate from every franchise season inside it. This implementation starts from exact accepted evidence commit `b6082b2cb91dc70f9a30d2325f4067ffef045b1a`.

## Added during delivery

- Added migration 25 with first-class league game years, season and snapshot links, guarded transition runs, immutable archive manifests/parts, recovery bookmarks, season-closure evidence, append-only lifecycle events, and archive-removal tombstones.
- Added three visibly separate controls: Replace Current Import, Start New Franchise Season, and Archive/Remove Madden Game Year.
- Added exact league/game-year typed confirmations and a transition state machine that requires inventory, private archive creation, checksum read-back verification, and a recovery bookmark before detach is allowed.
- Added relational and raw-source R2 archive copies, deterministic checksums, explicit active-data removal, private archive removal as a second operation, and verified rollback restoration.
- Made recovery resumable with durable row/byte and source-object cursors so a commissioner operation can continue safely across bounded Cloudflare requests.
- Expanded archive scope to retain mapping parents owned by permanent-identity previews, and retained a narrowly audited compatibility repair for an already-created archive that predated that scope correction.
- Added exact boundary-state capture and restoration for franchise-season, game-year snapshot, league snapshot, and import-destination statuses.
- Preserved leagues, users, memberships, roles, sessions, settings, rules, audits, stable player identities, frozen player season summaries, GM identities, and ownership history. Edition-specific team assignments are cleared only at detach and restored only by a verified rollback.
- Retired the legacy broad-reset endpoint with HTTP 410 and routed Commissioner HQ to the scoped 7.3.3 controls.
- Kept Free Agents as blocked/unknown with a null count throughout preview, manifest, removal, and recovery contracts.
- Replaced the stale 7.3.0 shell marker with a host-derived environment label and exact 7.3.3 release marker, and advanced the release asset cache keys so Production cannot retain the older commissioner shell after deployment.

## Known inherited blockers

- Madden's explicit Free Agent route remains blocked upstream. No 7.3.3 code treats that state as an empty Free Agent pool or a zero count.
- Authentication refresh, league-scoped shareable URLs, and expanded player ratings remain scheduled for later roadmap releases.

## Validation evidence

- Migration 25 applies to a clean database, advances the continuous ledger through version 25, creates 78 required tables, and retains clean foreign keys.
- Automated integration coverage exercises complete local lifecycles: preview, plan, relational/raw archive, checksum verification, detach, active-data removal, resumable rollback restoration, large row/byte payloads, identity-owned mapping dependencies, exact empty-pointer recovery, and separately confirmed archive-copy deletion with retained immutable evidence and rollback refusal.
- Tests prove that the league/account plane and active membership survive, team assignment clearing is edition-scoped, immutable evidence cannot be rewritten, and blocked Free Agents remain null rather than zero.
- The consolidated strict gate passes 92/92 automated tests, syntax-checks 198 JavaScript modules, scans 552 text files for secrets, verifies a deterministic 527-file/64-route inventory, and validates all 78 required tables through migration 25.
- Exact acceptance candidate `b373f661101c33a2ee2bd17433cfe4001f166b3f` adds the release/environment regression, passed all four hosted checks, and is the exact source of successful Production Pages deployment `e926a37f-50b1-4b8c-af83-84364a7d4960`.
- The game-year implementation remains exact commit `061639d48b6cf540a853f8612e51ab316d70dc4e`; the acceptance candidate adds only accurate runtime identification, cache advancement, its regression, and production-aware evidence gates.

## Production migration and reconciliation

- Applied additive migration 25 to `franchise-hq-db-madden27` / `b2529150-28af-42ca-a07b-69506764ccb6`, advancing the continuous migration ledger from 24 to 25. Production now has 78 required application tables plus the migration-ledger table, with zero foreign-key violations.
- Before/after protected counts are identical: one league, eight users, eight memberships, six active team assignments, zero legacy `teams`/`players`/`snapshots` rows, and one active-snapshot pointer.
- The active snapshot remains exact `841ce1b5-a4a6-4246-a53a-01cd1f189663`. The Madden NFL 27 game year is active and links that active snapshot plus retained candidate `c7023ac0-e6d8-476c-949b-483092830fdd`.
- The private identity preview still contains 32 teams and 2,044 rostered players. Free Agents remain `blocked` with a null count and are not interpreted as zero.
- No Production transition was executed: transition runs, archive manifests, recovery bookmarks, and archive-removal rows all remain zero. No reset, detach, archive/removal, recovery, import activation, or active-snapshot change occurred.

## Isolated-staging rehearsal

- Applied additive migration 25 only to `franchise-hq-staging-db`, advancing its ledger from 24 to 25 with a clean foreign-key check. The recovery bookmarks are retained only as SHA-256 fingerprints in release evidence.
- Preview deployment `0bd05506-b52f-4078-8bd4-5df76e3302d6` used the dedicated `franchise-hq-staging-game-year-archives` bucket. No Production binding or shared Production archive bucket was used.
- Created and read back a private immutable archive containing 7,455 scoped relational rows and 43 source objects (44 objects / 33,758,815 bytes total). The relational digest is `6c76706630cf1a28ac642d93e281992d0081ffdb870f26633b10923b53e4b34a`; the root digest is `44f81301b8cf8efb238ffc6141b132d627e2079124b86b588ba6907522d79b63`.
- Completed the authorized detach and active-data removal once, then restored the same Madden NFL 27 game year from its verified archive. The transition is `restored`, the private archive remains retained, and archive-copy removal was not run in staging.
- The first recovery attempt exposed three real cloud-only gaps: request-sized recovery needed durable cursors; the initial archive scope omitted two mapping parents referenced by the retained identity preview; and finalization needed to restore exact boundary statuses. Each gap received a regression and one consolidated strict gate.
- The already-created immutable archive could not be rewritten. A compatibility recovery rebuilt only its two missing mapping parents from the archived candidate mapping templates, recorded one durable repair event/audit, and then restored all 32 identity teams and 2,044 identity players. Future archives include identity-owned mapping dependencies directly.
- Final reconciliation restored the exact candidate statuses: league snapshot `validated`, game-year snapshot `candidate`, and franchise season `preview`. The active snapshot pointer is still intentionally empty.
- Final staging counts retain 43 captures, one candidate run/snapshot, 32 identity teams, 2,044 identity-preview players, and 2,044 permanent player identities. Users and memberships remain 1/1, every temporary session is revoked, the temporary membership is inactive, and foreign-key violations are zero.
- Madden Free Agents remain `blocked` with a null count and `interpretedAsZero: false`.

## Deployment status

- Branch `codex/franchisehq-7.3.3` is published and stacked PR #13 targets `codex/franchisehq-7.3.2`, not Main.
- Cloudflare Pages Production deployment `e926a37f-50b1-4b8c-af83-84364a7d4960` succeeded from exact commit `b373f661101c33a2ee2bd17433cfe4001f166b3f`; `franchisehq.app` serves the `7.3.3` response header and matching runtime asset.
- The Cloudflare Pages Production branch was temporarily changed from `main` to `codex/franchisehq-7.3.3` only for that exact retry deployment and was immediately restored to `main`. Git Main remains unchanged.
- No additional staging deployment or rehearsal was performed. Production archive/removal/recovery operations, Main changes, data reset, and snapshot activation remain unauthorized and were not run.

## Rollback

- For a runtime-only rollback, restore prior Pages deployment `61165506-9d06-4f95-9760-58f73389d37c` while keeping Git Main unchanged and reviewing bindings deliberately.
- Migration 25 remains additive and must not be dropped. Runtime rollback must preserve its game-year, manifest, bookmark, lifecycle, and tombstone schema.
- Any future data rollback uses a checksum-verified private archive and its immutable recovery bookmark; it does not infer a prior snapshot, team assignment, or Free Agent count.
