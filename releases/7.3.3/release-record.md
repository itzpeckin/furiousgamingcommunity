# FranchiseHQ 7.3.3 Release Record

**Status:** Isolated-staging validated; PR #13 open with 4/4 hosted checks passing

**Production authorized:** No

**Production changed:** No. Production, its active snapshot, and Git Main remain unchanged. Only the registered isolated-staging D1 and dedicated staging archive bucket were changed.

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

## Known inherited blockers

- Madden's explicit Free Agent route remains blocked upstream. No 7.3.3 code treats that state as an empty Free Agent pool or a zero count.
- Authentication refresh, league-scoped shareable URLs, and expanded player ratings remain scheduled for later roadmap releases.

## Validation evidence

- Migration 25 applies to a clean database, advances the continuous ledger through version 25, creates 78 required tables, and retains clean foreign keys.
- Automated integration coverage exercises complete local lifecycles: preview, plan, relational/raw archive, checksum verification, detach, active-data removal, resumable rollback restoration, large row/byte payloads, identity-owned mapping dependencies, exact empty-pointer recovery, and separately confirmed archive-copy deletion with retained immutable evidence and rollback refusal.
- Tests prove that the league/account plane and active membership survive, team assignment clearing is edition-scoped, immutable evidence cannot be rewritten, and blocked Free Agents remain null rather than zero.
- The consolidated strict gate passes 91/91 automated tests, syntax-checks 198 JavaScript modules, scans 552 text files for secrets, verifies a deterministic 527-file/64-route inventory, and validates all 78 required tables through migration 25.
- Exact implementation commit `061639d48b6cf540a853f8612e51ab316d70dc4e` is published in stacked PR #13; all four hosted checks passed with zero failures or pending checks.

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
- The separately authorized isolated-staging rehearsal is complete and restored. Production publication, Production migration 25, Production archive/removal/recovery, Main changes, data reset, and snapshot activation remain unauthorized and were not performed.

## Rollback

- Before publication, discard the 7.3.3 branch and return to exact evidence commit `b6082b2cb91dc70f9a30d2325f4067ffef045b1a`.
- After any future authorized migration, migration 25 remains additive and must not be dropped. Runtime rollback must preserve its manifest, bookmark, lifecycle, and tombstone evidence.
- Any future data rollback uses a checksum-verified private archive and its immutable recovery bookmark; it does not infer a prior snapshot, team assignment, or Free Agent count.
