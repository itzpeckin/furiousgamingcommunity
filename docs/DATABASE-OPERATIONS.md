# FranchiseHQ Database Operations

This runbook governs FranchiseHQ database changes beginning with 7.1.0. It is written to protect the first FGC league today and the future multi-league platform later.

## What 7.1 establishes

- `migrations/0018_canonical_core_foundation.sql`, `0019_canonical_import_snapshot_foundation.sql`, and `0020_canonical_transaction_runtime_foundation.sql` are the active immutable sequence.
- The original 19 files are preserved under `migrations/legacy/` as historical evidence and are never replayed.
- Migration 0018 can begin with an empty database or the current legacy schema. It completes the historical ledger without replacing existing rows.
- Application requests no longer create or alter tables. A protected route fails closed with `DATABASE_MIGRATION_REQUIRED` when the database is below version 20.
- `config/database-schema-contract.json` is the machine-readable minimum database contract.

## What 7.2 adds

- `migrations/0021_tenant_ready_core.sql` advances the required schema to version 21.
- It adds server-owned tenant status, aliases, domains, feature configuration, branding/configuration, and tenant audit events.
- It makes tenant scope structurally mandatory on the remaining legacy league-owned join and one-row-per-league tables.
- The migration preserves existing rules, shared settings, active snapshot pointers, validation-player rows, users, sessions, memberships, imports, and R2 object references.
- Future league records default disabled. Existing active production leagues are enabled without creating or activating a second league.

## What 7.3.0 adds

- `migrations/0022_madden_27_discovery_foundation.sql` advances the required schema to version 22.
- It adds tenant-scoped, short-lived Madden discovery sessions; session-to-capture links; and structural source-lock reports.
- Capture tokens are returned once and retained only as SHA-256 hashes. Raw Companion payloads remain in the existing private R2 binding.
- Identical route payloads can be associated with a new discovery session without duplicating the same R2 object.
- The migration does not reset, import, activate, archive, or publish Madden data and does not modify an active snapshot pointer.

## What 7.3.1 and 7.3.2 add

- `migrations/0023_permanent_identity_preview.sql` adds permanent season/player identity and the private identity preview.
- `migrations/0024_commissioner_candidate_import.sql` adds one private destination per reviewed franchise season and durable candidate-import runs.
- Candidate creation and validation are append-only and do not write `league_active_snapshots`.
- Game year is an operational partition independent from franchise season year. Persistent league/account state crosses editions; Madden-derived source, mapping, identity, snapshot, and transaction state belongs to a game year.

## Authorization boundary

Building and testing a migration does not authorize applying it to Cloudflare. Staging application and production application are separate decisions. A production migration requires a new, explicit owner authorization after the local candidate and recovery plan are reviewed.

7.3.0 does not reset Madden data, activate an import, edit memberships, change Discord settings, or redesign session-refresh behavior. Applying migration 22, deploying Preview, running a real Companion capture, and applying anything to production are separate authorization decisions.

## Before any cloud migration

1. Confirm the exact candidate commit and every pending migration file hash.
2. Confirm the target is the intended staging database. Never point a preview at production.
3. Record a D1 Time Travel bookmark immediately before the change.
4. Record these read-only facts: migration ledger, table count, league count, user count, membership count, active snapshot count, and `PRAGMA foreign_key_check` result.
5. Apply only unapplied migrations in ledger order. A 7.1 production database must receive 0021 before 0022; the isolated 7.2 staging database requires only 0022. Stop on the first error.
6. Re-run the read-only checks and compare all identity/relationship counts.

Cloudflare documents that D1 captures a backup when `wrangler d1 migrations apply` runs and rolls back a failing migration while leaving earlier successful migrations applied. FranchiseHQ still records the pre-change bookmark and verifies every result. See [Cloudflare D1 migration commands](https://developers.cloudflare.com/d1/wrangler-commands/#d1-migrations-apply).

## Local and staging validation

Run the strict project gate before any cloud work:

```sh
npm run check:strict
```

The gate must prove:

- a clean database reaches ledger version 23;
- a production-like legacy database upgrades without changing league, user, membership, team assignment, or snapshot identity;
- all required tables and core columns exist;
- `PRAGMA foreign_key_check` returns no rows;
- a file backup restores to the same rows and relationships;
- no request handler contains table or index creation SQL;
- tenant migration preservation, two-tenant isolation, hashed discovery-session storage, and source-lock privacy tests pass.

Apply only unapplied migrations to an isolated staging database:

```sh
npx wrangler d1 migrations apply <staging-database> --remote
```

Do not replace `<staging-database>` with the production name during rehearsal.

### Repeatable target-locked release command

`tools/run-d1-release.mjs` is the supported release path beginning with 7.1. It uses Cloudflare's authenticated D1 REST API, reads the committed target registry, verifies the returned database name and UUID, captures the recovery bookmark, applies only missing canonical versions, and refuses completion when protected counts, required tables, ledger continuity, or foreign keys do not reconcile.

Set a short-lived `CLOUDFLARE_API_TOKEN` with D1 Read for a plan or D1 Write for an application. Never commit or paste the token into a command, document, issue, or pull request.

```sh
npm run db:plan -- --target staging
npm run db:plan -- --target production
npm run db:apply -- --target production --confirm-target production:franchise-hq-db-madden27:b2529150-28af-42ca-a07b-69506764ccb6
```

The production confirmation is intentionally exact. The command validates Cloudflare metadata against `config/d1-database-targets.json`, records migration hashes and before/after evidence, and stops deployment when any preservation check fails. Recovery is never automatic because a Time Travel restore overwrites the database and requires separate owner approval.

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

After 7.3.1, the ledger must contain every version from 1 through 23 and the foreign-key check must return no rows. Migration 21 adds four application tables for tenant aliases, domains, features, and audit events. Migration 22 adds exactly three discovery tables. Migration 23 adds permanent identity and private preview tables without changing existing league, user, membership, snapshot, import, team, player, or capture rows.

After 7.3.2, the active ledger must contain every version from 1 through 24 and the foreign-key check must return no rows. Migration 24 adds `companion_import_destinations` and `companion_candidate_import_runs`; neither table authorizes or performs snapshot activation.

## Stop conditions

Stop immediately and do not deploy the application when any of these occurs:

- the target database identity is uncertain;
- a Time Travel bookmark was not recorded;
- a migration is applied out of order or only partly succeeds;
- ledger versions 1 through 23 are not continuous;
- league, user, membership, team assignment, or snapshot counts unexpectedly change;
- any foreign-key check row appears;
- an expected production table or column is missing;
- the staging application reports `DATABASE_MIGRATION_REQUIRED` after version 23 is recorded.

## Recovery and rollback

The normal application rollback is to restore the previous application commit while retaining the forward-compatible schema. Do not drop or reverse 7.1/7.2/7.3 tables as an improvised rollback.

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

### 7.1.0 production record — August 27, 2026

- Owner authorization: Justin/Peckin, August 27, 2026.
- Migration source commit: `a5b772897fa39f3f7040dc9bf61d1d2fbae0c075` (migration files unchanged in the final release candidate).
- Target: `franchise-hq-db` / `d21fb8c2-1b26-4766-9249-73af5d8b6678`.
- Migration hashes:
  - 0018: `42750b55a40dd34a80f94798dc071890165245dabc405c471aa4802c1504690d`
  - 0019: `6dac19fd955c7baddf921a1c46b6a765d92d830a2966e318ca21a37b52886780`
  - 0020: `f3e2e768460697c68d3f8021ae56030ecb4ea7cfc5363610befac7b07f09e789`
- Recovery evidence: exact bookmarks retained in the private owner session; repository-safe SHA-256 fingerprints are `4fb88a0ac9d4ac393785527f01da73945f6eed04b9de5212a2377c3b48f073f2` before and `dd897d3dd75dd4545f10678dcda020ff7f344605552e1af6f1aedc56d4aefd4d` after.
- Before: ledger max 17 with 13 recorded legacy rows; 47 application tables; 1 league; 8 users; 8 memberships; 7 active team assignments; 0 teams; 0 players; 0 snapshots; 1 active-snapshot pointer; 97 sessions; 0 foreign-key violations.
- After: continuous ledger versions 1–20; 50 application tables; every protected count and exact role/team ownership aggregate unchanged; 0 foreign-key violations.
- Migration result: 0018, 0019, and 0020 applied in order with no failed statement.
- Rollback decision: not required. The additive schema and all preservation checks passed.
- Application result: PR #8 is the single deployment candidate; its merge publishes 7.1.0 after all hosted checks pass.

### 7.3.2 Madden 26-to-27 production transition — August 29, 2026

- Owner authorization: one cumulative Production acceptance deployment from exact commit `4f5e81b4cc924e72bc9b8499ae12164bfd12620c`, followed by explicit authorization to archive/remove Madden 26 from the active application while preserving the platform plane.
- Former active D1: `franchise-hq-db` / `d21fb8c2-1b26-4766-9249-73af5d8b6678`; retained and detached as a Madden 26 relational archive.
- New active D1: `franchise-hq-db-madden27` / `b2529150-28af-42ca-a07b-69506764ccb6`.
- A private game-year archive under `game-year/madden-26/league/franchise-hq-primary/2026-08-29` verified 38 manifests, 76,712 durable rows, 331 data parts, and 166,195,617 bytes.
- The prior private raw-source bucket was emptied permanently: 1,295 objects / 241,070,631 bytes. Two obsolete Companion KV discovery pointers were removed.
- The active Madden 27 database received migrations 18–24 in order. Platform copy preserved one league, eight users, 104 sessions, eight memberships, and six membership-audit rows while clearing all eight legacy team assignments. Rules/settings had no rows to copy.
- The certified Madden 27 source copied 43 captures / 10,150,363 bytes and the reviewed 2026 identities for 32 teams and 2,044 rostered players. Free Agents remain `blocked` with a null count.
- The candidate rehearsal produced one validation-ready private snapshot and left `league_active_snapshots` empty. Foreign-key verification returned zero rows and the short-lived acceptance session was revoked.
- The old D1 rows were not deleted in place. They are inaccessible to the active runtime and remain the recovery archive until a separately reviewed archive-retention/deletion control exists.
