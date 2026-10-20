# FranchiseHQ 8.2.19

## Scope
Persist Discord admission state per bot credential in a private SQLite Durable Object. Separate channel buckets, global cooldowns and per-league scheduling leases. Prioritize creation and archival ahead of member subscriptions. Honor actual retry_after rather than extending it to an unrelated bucket reset. Add durable progress and retry timestamps to League Controls.

## Added during delivery
Stable starter-message nonces support retry after a lost response within Discord's deduplication window. Request deadlines and bounded durable retries replace inline scheduling sleeps. Additive migration 55 stores checkpoint progress.

## Known inherited blockers
None registered. Discord controls provider cooldowns; this release cannot promise immediate creation or a fixed completion time. Shared-bot admission simulations do not constitute 100-league production capacity acceptance. Starter nonces have a provider-limited deduplication window.

## Validation evidence
Strict quality gate: 613 tests passed. Desktop 1440px and phone 390px renderer checks passed with no overflow or page errors. Worker bundle validation passed. Windows denied workerd.exe execution; hosted runtime acceptance remains required before publication. See validation-evidence.json. Tests exercise virtual-time 5/25/100-league loads, object reconstruction, credential/channel isolation, interrupted reservations, league leases, existing scheduling/replay tests and actual Workers runtime before deployment. Production week-advance timing remains unmeasured.

## Deployment status
Authorized candidate. Apply additive migration 55 and publish the coordinator Worker before Pages. Preserve existing Workflow bindings and disabled public URLs. No league advance or import is part of this release.

## Rollback
Restore Pages v8.2.18 and the previous Worker version. Retain migration 55 and Durable Object data; do not delete thread conversations or snapshots. Existing delegated jobs must be checked before changing Worker code.
