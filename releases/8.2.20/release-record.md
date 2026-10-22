# FranchiseHQ 8.2.20

## Scope

Completed imports retain large disposable working copies indefinitely. A private scheduled Worker moves eligible copies to verified compressed R2 storage after seven days, protecting the latest three imports/mappings, active and recovery pointers, unfinished imports and season transitions. Every deletion rechecks eligibility and every source column against the verified backup. All published snapshots, statistics, player and GM history, trades, rules and Discord data remain in D1.

## Added during delivery

The unsafe legacy storage-preflight deletion route is retired with HTTP 410. Migration 56 adds a small per-league retention ledger. No EA, import or Discord Worker is replaced.

## Known inherited blockers

Physical D1 storage and cost reductions remain unmeasured until production retention runs. Snapshot-history compaction and billing remain deferred.

## Validation evidence

Full migration SQLite tests cover recovery, tenant isolation, concurrent changes and failed backups. Strict checks, preview/production hosted checks and actual scheduled Worker acceptance are required before declaring the release complete. Candidate records do not claim production savings.

## Deployment status

Authorized candidate. Staging migration and private timer validation precede production enablement. Production acceptance is recorded separately after publication.

## Rollback

Disable the maintenance schedule or switch to observe. Leave migration 56 and verified recovery objects in place. See recovery-plan.md and docs/storage-retention.md. Do not restore the whole database or recreate deleted leagues.
