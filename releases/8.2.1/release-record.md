# FranchiseHQ 8.2.1

## Scope

Reduce the measured export, import and Discord rollover delays. Verified week advances skip automatic recap delivery; same-week corrections and manual /game remain supported. Scheduling handles four operations per checkpoint with new-week creation before old-thread deletion. Snapshot building accepts bounded 4,000-record requests while retaining 500 KB SQL payloads, validation handles 2,000 records per batch, and compact progress reporting avoids rebuilding readiness responses.

## Added during delivery

EA collects up to four sequential datasets per checkpoint, retaining the ordered provider session, encrypted saved state, idempotent captures and final hub consistency check. Numeric timing separates provider calls from processing. Provider request concurrency is deferred because the mutable EA session must be verified under live concurrency before enabling it. The collection time budget stops between datasets. Schedule creation rechecks the active snapshot before each game.

## Known inherited blockers

No strict-gate exemptions. Production 60–70-second average import acceptance and actual Discord/EA latency remain unmeasured for this candidate. Fixture call-count reductions are not a production speed guarantee. Billing and weekly loadout recognition remain deferred.

## Validation evidence

The representative real-handler SQLite fixture retains 10,653 records including 8,271 statistics and the full 272-game schedule. Build calls fall from 26 to 8 and validation calls from 7 to 3. The EA fixture retains all 52 datasets in 14 checkpoints rather than 53. Retries, session refresh, unavailable datasets, tenant isolation, same-week delivery and deleted-thread protection remain tested. The strict quality gate passes all 482 tests, syntax, security, migrations, inventory and release-contract checks. CI run 36887305587 passed. Seventeen hosted checks each passed preview and production. Production Worker source matches the release, all three workflow bindings are retained, and public Worker URLs remain disabled.

## Deployment status

PR #176 merged at bd82108cf2eb7a3e8dff1b84591941117cde9884, tagged v8.2.1. Production Pages deployment 11e902ad-43ac-4c1a-a127-3d6fe63d1ede and Import Worker 8c0a6380-fc66-44ef-8e57-4719de78e89d are verified. Zero active import, EA collection or scheduling workflows were present before Worker publication. No migration, live import/export, Discord post/thread deletion, account or ownership change was performed by this release. Before/after database counts match (3 leagues, 38 users, 40 memberships, 83 snapshots, 734,717 records); foreign keys are clean. Live end-to-end timing acceptance awaits an ordinary commissioner import.

## Rollback

Restore Pages to final 8.2.0 Main 8ef22bbf9a1f98295242d0df2b89cbea412c962a and Import Worker fd317855-8544-4b42-baa8-b2efa674b0a8. Schema stays at 51. Do not roll back or delete league snapshots to undo application changes.
