# FranchiseHQ Database Operations

This runbook governs FranchiseHQ database changes beginning with 7.1.0. It is written to protect the first FGC league today and the future multi-league platform later.

## What 7.1 establishes

- `migrations/0018_canonical_core_foundation.sql`, `0019_canonical_import_snapshot_foundation.sql`, and `0020_canonical_transaction_runtime_foundation.sql` are the active immutable sequence.
- The original 19 files are preserved under `migrations/legacy/` as historical evidence and are never replayed.
- Migration 0018 can begin with an empty database or the current legacy schema. It completes the historical ledger without replacing existing rows.
- Application requests no longer create or alter tables. A protected route fails closed with `DATABASE_MIGRATION_REQUIRED` when the database is below version 20.
- `config/database-schema-contract.json` is the machine-readable minimum database contract.

## Authorization boundary

Building and testing a migration does not authorize applying it to Cloudflare. Staging application and production application are separate decisions. A production migration requires a new, explicit owner authorization after the local candidate and recovery plan are reviewed.

7.1.0 does not reset Madden data, edit memberships, change Discord settings, or modify authentication.

## Before any cloud migration

1. Confirm the exact candidate commit and the three migration file hashes.
2. Confirm the target is the intended staging database. Never point a preview at production.
3. Record a D1 Time Travel bookmark immediately before the change.
4. Record these read-only facts: migration ledger, table count, league count, user count, membership count, active snapshot count, and `PRAGMA foreign_key_check` result.
5. Apply 0018, then 0019, then 0020. Stop on the first error.
6. Re-run the read-only checks and compare all identity/relationship counts.

Cloudflare documents that D1 captures a backup when `wrangler d1 migrations apply` runs and rolls back the failing migration while leaving earlier successful migrations applied. FranchiseHQ still records the pre-change bookmark and verifies each result because the release spans three ordered migrations. See [Cloudflare D1 migration commands](https://developers.cloudflare.com/d1/wrangler-commands/#d1-migrations-apply).

## Local and staging validation

Run the strict project gate before any cloud work:

```sh
npm run check:strict
```

The gate must prove:

- a clean database reaches ledger version 20;
- a production-like legacy database upgrades without changing league, user, membership, team assignment, or snapshot identity;
- all required tables and core columns exist;
- `PRAGMA foreign_key_check` returns no rows;
- a file backup restores to the same rows and relationships;
- no request handler contains table or index creation SQL.

Apply only unapplied migrations to an isolated staging database:

```sh
npx wrangler d1 migrations apply <staging-database> --remote
```

Do not replace `<staging-database>` with the production name during rehearsal.

## Required verification queries

Run these as read-only checks before and after a cloud migration:

```sql
SELECT version, name, applied_at FROM schema_migrations ORDER BY version;
SELECT COUNT(*) AS table_count FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%';
SELECT COUNT(*) AS league_count FROM leagues;
SELECT COUNT(*) AS user_count FROM users;
SELECT COUNT(*) AS membership_count FROM league_memberships;
SELECT COUNT(*) AS active_snapshot_count FROM league_active_snapshots;
PRAGMA foreign_key_check;
```

After 7.1, the ledger must contain every version from 1 through 20 and the foreign-key check must return no rows. The production table count should increase only by the three contract tables absent from the legacy database: rules documents, shared league settings, and setting revisions.

## Stop conditions

Stop immediately and do not deploy the application when any of these occurs:

- the target database identity is uncertain;
- a Time Travel bookmark was not recorded;
- a migration is applied out of order or only partly succeeds;
- ledger versions 1 through 20 are not continuous;
- league, user, membership, team assignment, or snapshot counts unexpectedly change;
- any foreign-key check row appears;
- an expected production table or column is missing;
- the staging application reports `DATABASE_MIGRATION_REQUIRED` after version 20 is recorded.

## Recovery and rollback

The 7.1 migrations are additive. The normal rollback is to restore the previous application commit while retaining the added tables. Do not drop 7.1 tables as an improvised rollback.

If a database restore is genuinely required, stop writes, record the current bookmark, and restore the pre-migration bookmark only with explicit owner approval. Cloudflare warns that Time Travel restore overwrites the database in place and cancels in-flight queries. It also returns the prior bookmark so the restore can be undone. See [Cloudflare D1 Time Travel and backups](https://developers.cloudflare.com/d1/reference/time-travel/).

After recovery, repeat the complete read-only verification set and record the result in the release evidence. Time Travel is short-term recovery; a later operations release will add retained exports for recovery beyond Cloudflare's Time Travel window.

## Production execution record

When production authorization is eventually granted, add these values to the 7.1 release evidence before execution:

- authorized person and timestamp;
- exact candidate commit;
- target D1 database name and ID;
- pre-change bookmark;
- migration start/end timestamps;
- each applied version and result;
- before/after counts and foreign-key result;
- application deployment result;
- observation-window result;
- rollback decision and, if used, recovery bookmark.
