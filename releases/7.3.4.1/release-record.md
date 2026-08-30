# FranchiseHQ 7.3.4.1 Release Record

**Status:** Consolidated local implementation and validation complete; publication and Production are not authorized

**Production changed:** No. Production remains on exact 7.3.4 commit `431583ea7a472c4ba5292bea1a1775e7f0309b33` / Pages deployment `fafabfb2-91fe-4759-9cf8-8872365c6777`, with active snapshot `841ce1b5-a4a6-4246-a53a-01cd1f189663` unchanged.

## Scope

Replace weekly commissioner capture-session setup with one permanent, league-specific Madden Companion export URL. Automatically isolate and analyze each export burst, show the newest export's readiness in Commissioner HQ, and reduce the normal commissioner workflow to one **Import Latest Export** action after exporting from Madden.

## Added during delivery

- Added additive migration 26 with exactly one tenant-scoped export endpoint row per league, automatic row creation for future leagues, latest-report and latest-ready-report pointers, and an analysis scheduling claim.
- Derived each URL credential from the protected Companion root, league identity, and stored token version. No raw URL token is stored in D1.
- Added explicit two-step URL rotation. Rotation increments the version, invalidates the old URL immediately, retains the endpoint history and ready source, and records a tenant audit event.
- Reused the existing immutable R2/D1 receiver. Each request burst receives a durable automatic discovery session; duplicate payloads are linked into the new cohort without duplicating raw objects.
- Scheduled automatic analysis after three seconds without a new capture. Full and interrupted exports are both analyzed; a partial/failed report becomes visibly review-required.
- Added a separate `latest_ready_report_id`. Only verified teams, all team-roster coverage, rostered-player assignment evidence, standings, schedule, statistics, and an explicit Free Agent status can advance it.
- Preserved the Madden Free Agent blocker: a failed route can qualify only for rostered-player-only readiness, and its count stays null/unknown.
- Added the Commissioner HQ permanent-connection card with copy, freshness, captured week, route/count evidence, warnings, refresh polling, security rotation, and one **Import Latest Export** action.
- Connected that action to the existing commissioner candidate pipeline, including automatic destination creation/reuse. It builds and validates a private candidate only and cannot activate a snapshot.
- Preserved the endpoint across game-year archive/removal controls. Newer incomplete reports cannot displace the prior import-ready source, and manually analyzing an older session cannot move the current endpoint pointers.

## Known inherited blockers

- Madden's explicit Free Agent route remains blocked upstream. FranchiseHQ continues to show Free Agents as unknown/null and cannot claim a complete player pool.
- The authentication refresh inconvenience remains deferred to 7.5.0 under the accepted roadmap boundary.
- 7.3.4.1 creates a private validated candidate; publishing or activating that candidate remains a separate commissioner/platform-owner decision.

## Validation evidence

- 98 automated tests pass. New coverage proves deterministic league/version credentials, rotation invalidation, 32-team/2,044-player rostered-only readiness, incomplete-source isolation, tenant scoping, automatic analysis wiring, one-action UI wiring, and active-snapshot non-mutation.
- Fresh-install and Production-shaped migration paths reach continuous ledger version 26 with zero foreign-key violations. Migration 26 is additive and the endpoint table carries mandatory direct tenant scope.
- Source guards prove capture, analysis, URL management, and candidate import cannot write `league_active_snapshots`, reset data, run a game-year transition, or treat blocked Free Agents as zero.
- The consolidated strict repository gate is recorded in `validation-evidence.json` and the deterministic generated inventory.

## Deployment status

- Local branch `codex/franchisehq-7.3.4.1` contains the validated review candidate based on exact Production/Main commit `431583e`.
- Branch publication, pull request creation, hosted checks, staging, Production deployment, and migration 26 application are not authorized and have not run.
- No real Madden export or candidate import ran. No data was reset, archived, removed, recovered, or activated, and the active snapshot was not changed.

## Rollback

- Before publication, return to exact Production/Main baseline `431583ea7a472c4ba5292bea1a1775e7f0309b33`.
- After any future authorized migration 26 application, retain the additive endpoint table and every capture/report/audit row; do not drop the table or rotate/delete URLs as a code rollback.
- A runtime-only rollback restores Pages deployment `fafabfb2-91fe-4759-9cf8-8872365c6777` while preserving active snapshot `841ce1b5-a4a6-4246-a53a-01cd1f189663` and blocked/null Free Agent semantics.
