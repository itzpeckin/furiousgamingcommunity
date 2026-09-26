# FranchiseHQ 8.0.16 — Madden source startup recovery

## Scope

Restore Madden Data selection after the owner reported successful EA collection followed by No Data / Demo Data and unavailable Madden Data. Standing authorization includes PR, merge and production deployment after validation.

## Added during delivery

Reproduced the contradictory production UI: server snapshot cb4fbe0f-c510-403b-8b8e-80d8165369d8 remains active (2027 Week 8), but the browser repository is empty and the source selector disables Madden Data. Browser logs show Live Snapshot Boot rejected because another refresh or tenant-resolution event superseded its request. The recent stale-read guard exposed a startup lifecycle defect: snapshot installation ran only once and did not recover.

Share concurrent same-tenant refresh requests. Preserve the last successful summary on refresh failure while new reads wait for an ongoing refresh. On a successful scoped refresh, restore the authoritative snapshot reference into the current resolved tenant repository. Restart startup after tenant resolution and ignore superseded boot attempts. Never install another tenant's response or a route placeholder. Preserve deliberate No Data choices after a snapshot is already installed; Madden Data stays selectable. Render once per actual source change and suppress delayed renders after tenant changes.

## Known inherited blockers

The EA weekly collection eaj_ff1c99ba-e297-4589-866f-b7c3ed6e56ea completed and is ready for import. Collection is separate from snapshot activation. This repair restores access to the existing Week 8 snapshot without importing or overwriting it. Existing unrelated Discord delivery attention remains outside scope.

## Validation evidence

Tests run the real repository, data-state, read-model and snapshot-boot modules together. Regressions cover tenant resolution interrupting startup, competing refresh requests, Madden source availability, late cross-tenant responses, explicit source choices, failed-startup recovery, failure preserving existing source, and reads waiting for a new snapshot. Existing statistics-cache tests remain enabled. Full release gate and hosted source-selector verification recorded on the PR.

## Deployment status

Pages-only authorized candidate. Migration 48 and Worker version 239d366e-f0e0-46e8-97a3-bf371a55c793 remain unchanged. No collection, import, source pointer mutation or Discord operation is part of this repair.

## Rollback

Restore 8.0.15 Main 6746420cdfc6016c90c68b000dcdd20c1eea664b / Pages 09f9fee4-709b-4b44-b818-0f4b9e06c6d9 if needed. Preserve all database records, captured exports and Worker deployment. That version retains the reported startup race.
