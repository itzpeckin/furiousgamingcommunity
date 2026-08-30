# FranchiseHQ 7.3.3 Release Record

**Status:** Published review candidate; PR #13 open with 4/4 hosted checks passing

**Production authorized:** No

**Production changed:** No. Production, its active snapshot, Git Main, and cloud data remain unchanged.

## Scope

Build reusable, commissioner-operated Madden game-year archive/removal and recovery controls while keeping a Madden game year separate from every franchise season inside it. This implementation starts from exact accepted evidence commit `b6082b2cb91dc70f9a30d2325f4067ffef045b1a`.

## Added during delivery

- Added migration 25 with first-class league game years, season and snapshot links, guarded transition runs, immutable archive manifests/parts, recovery bookmarks, season-closure evidence, append-only lifecycle events, and archive-removal tombstones.
- Added three visibly separate controls: Replace Current Import, Start New Franchise Season, and Archive/Remove Madden Game Year.
- Added exact league/game-year typed confirmations and a transition state machine that requires inventory, private archive creation, checksum read-back verification, and a recovery bookmark before detach is allowed.
- Added relational and raw-source R2 archive copies, deterministic checksums, explicit active-data removal, private archive removal as a second operation, and verified rollback restoration.
- Preserved leagues, users, memberships, roles, sessions, settings, rules, audits, stable player identities, frozen player season summaries, GM identities, and ownership history. Edition-specific team assignments are cleared only at detach and restored only by a verified rollback.
- Retired the legacy broad-reset endpoint with HTTP 410 and routed Commissioner HQ to the scoped 7.3.3 controls.
- Kept Free Agents as blocked/unknown with a null count throughout preview, manifest, removal, and recovery contracts.

## Known inherited blockers

- Madden's explicit Free Agent route remains blocked upstream. No 7.3.3 code treats that state as an empty Free Agent pool or a zero count.
- Authentication refresh, league-scoped shareable URLs, and expanded player ratings remain scheduled for later roadmap releases.

## Validation evidence

- Migration 25 applies to a clean database, advances the continuous ledger through version 25, creates 78 required tables, and retains clean foreign keys.
- Automated integration coverage exercises both complete local lifecycles: preview, plan, relational/raw archive, checksum verification, detach, active-data removal, and rollback restoration; plus separately confirmed archive-copy deletion with retained immutable evidence and rollback refusal.
- Tests prove that the league/account plane and active membership survive, team assignment clearing is edition-scoped, immutable evidence cannot be rewritten, and blocked Free Agents remain null rather than zero.
- The consolidated strict gate passes 87/87 automated tests, syntax-checks 198 JavaScript modules, scans 552 text files for secrets, verifies a deterministic 527-file/64-route inventory, and validates all 78 required tables through migration 25.
- Exact implementation commit `1076b49893c0d71cc7fc66adb69a8cee81b06170` is published in stacked PR #13; all four hosted checks passed with zero failures or pending checks.

## Deployment status

- Branch `codex/franchisehq-7.3.3` is published and stacked PR #13 targets `codex/franchisehq-7.3.2`, not Main.
- Production, Main, migration 25 application, cloud rehearsal, data removal, snapshot activation, and rollback are not authorized and were not performed.

## Rollback

- Before publication, discard the 7.3.3 branch and return to exact evidence commit `b6082b2cb91dc70f9a30d2325f4067ffef045b1a`.
- After any future authorized migration, migration 25 remains additive and must not be dropped. Runtime rollback must preserve its manifest, bookmark, lifecycle, and tombstone evidence.
- Any future data rollback uses a checksum-verified private archive and its immutable recovery bookmark; it does not infer a prior snapshot, team assignment, or Free Agent count.
