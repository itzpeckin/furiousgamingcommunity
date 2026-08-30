# FranchiseHQ 7.3.4.1 Release Record

**Status:** Production deployed from exact Main commit; pending owner UI acceptance

**Production changed:** Yes, within the authorized release boundary. Exact commit `6de7c1018c89bc8fd6868fbde984f7a496e2a69d` is on Main and Production Pages deployment `0eec0551-216c-4f32-8aed-e8a7fbcb81ab`; additive migration 26 is applied. Active snapshot `841ce1b5-a4a6-4246-a53a-01cd1f189663` is unchanged.

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

- Pull request #16 published exact candidate `6de7c1018c89bc8fd6868fbde984f7a496e2a69d`; all four candidate hosted checks passed, and Main fast-forwarded to that exact commit.
- Additive migration 26 applied to exact Production D1 database `franchise-hq-db-madden27` / `b2529150-28af-42ca-a07b-69506764ccb6`. The ledger advanced from 25 to 26, the application-table count advanced from 78 to 79, protected counts remained exact, and the foreign-key check returned zero violations.
- One active endpoint row was created for the existing league at token version 1. It backfilled the existing eligible report as both latest and latest-ready without storing a raw URL credential.
- Cloudflare Pages Production deployment `0eec0551-216c-4f32-8aed-e8a7fbcb81ab` succeeded from branch `main` / source `6de7c10`; Main quality, build, Worker deploy, and Pages checks all passed.
- Public app, league route, health endpoint, and exact deployment smoke checks returned HTTP 200. Commissioner-only URL and candidate-import routes returned HTTP 401 without a session, confirming the authorization boundary.
- No staging cycle, real Madden export, candidate import, reset, transition, archive/removal/recovery operation, credential rotation, or activation ran. Active snapshot `841ce1b5-a4a6-4246-a53a-01cd1f189663` is unchanged, and Free Agents remain blocked/unknown with a null count.

## Rollback

- Retain migration 26, its endpoint row, and every capture/report/audit row during any runtime rollback; do not drop the table or rotate/delete URLs as a code rollback.
- A runtime-only rollback restores exact 7.3.4 Pages deployment `fafabfb2-91fe-4759-9cf8-8872365c6777` / commit `431583ea7a472c4ba5292bea1a1775e7f0309b33` while deliberately retaining migration 26.
- Production D1 recovery bookmarks are `00000032-00000000-000050d7-f42cc5c918932fe187a765a42a32342b` before and `00000032-00000008-000050d7-3c7fd83fe2a1d18c39cbc80d28444ede` after migration. Time Travel is destructive and remains separately owner-authorized.
- Preserve active snapshot `841ce1b5-a4a6-4246-a53a-01cd1f189663` and blocked/null Free Agent semantics through rollback.
