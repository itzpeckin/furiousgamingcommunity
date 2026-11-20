# Discord Week 1 scheduling repair

## Scope

The owner requested diagnosis, repair, publication, and a post-publication import to create the missing FGC scheduling threads. This corrective patch starts from production commit `3746ff8faa4fb7af35fb15805f1fec6ccac221bc` and retains release 8.2.39 and schema 56. It requires no migration or configuration change.

## Production diagnosis

Read-only production inspection found the active 2029 snapshot at proven Regular Season Week 1. Its exact preceding snapshot was Preseason Week 1. The recorded Discord transition was rejected as `skipped-period`, because the gate only recognized the opening from preseason Week 3 or 4. The configured Discord installation and scheduling channel were active, but no 2029 scheduling threads existed.

The importer may legitimately run only once during preseason. Verified same-season progression from any valid preseason week into Regular Season Week 1 must create the opening matchups. Future schedule rows alone remain insufficient to advance the league clock.

## Repair

Allow the verified preseason-to-Week-1 opening. Revalidate historical denied transition records against their exact tenant-scoped previous snapshot and proven current period before permitting recovery. Preserve the recorded evidence. Give corrected opening dispatches their own deterministic workflow key so a completed old no-op cannot suppress them.

When a user reruns an already-completed retained import, reconcile Discord scheduling only for that workflow's exact imported candidate when it is still active and belongs to the selected tenant and source. Reuse validated league data and normal thread deduplication.

## Validation evidence

The strict repository gate passed all 742 tests, including migration continuity, syntax, secret scanning, inventory, and release contracts. Four final same-week regression checks also passed, including the added fresh-import recovery case. An independent code review found no actionable issue in source/tenant scoping, persisted proof validation, completion output handling, or thread/workflow deduplication. The gate ran from a clean source copy to exclude unrelated local export artifacts. Hosted preview, publication, and the authorized live import are pending.

## Deployment and rollback

Publish through the repository pull request and existing Git-integrated Pages deployment after checks pass. Then run Import Latest Export in the FGC commissioner workspace and verify current-week game/thread coverage and zero delivery errors in production.

If rollback is necessary, restore application deployment `4750b098-d2c9-49a4-b721-38ec6f154fba` at baseline commit `3746ff8faa4fb7af35fb15805f1fec6ccac221bc`. Preserve imported snapshots, retained source exports, archived season history, and created Discord thread records. Do not restore or reset the database for this code patch.
