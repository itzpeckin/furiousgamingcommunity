# FranchiseHQ 7.1.0 Release Record

**Status:** Local strict validation passed; one consolidated repository publication authorized; staging and production are not authorized

**Production authorized:** No

**Production changed:** No application, database, membership, Madden data, authentication, credential, binding, or hosted configuration has been changed.

## Scope

Create one trustworthy FranchiseHQ database foundation that can build an empty environment and upgrade the current legacy database without replacing league, user, membership, team-assignment, import, or snapshot identities.

## Added during delivery

- Archived the 19 conflicting legacy SQL files as immutable evidence and started one active sequence at versions 18–20.
- Added an additive core migration that completes the legacy ledger and creates shared league settings plus append-only setting revisions for the future Commissioner HQ synchronization fix.
- Added canonical import/snapshot and transaction/runtime migrations for every table previously created during normal API requests.
- Removed all request-time table and index creation from eight import/transaction handlers.
- Added a shared runtime guard that refuses protected database work when the migration ledger is below version 20.
- Added a machine-readable contract covering 50 required tables and critical columns.
- Added five database regressions for fresh install, production-like upgrade, identity preservation, foreign-key integrity, file backup/restore, schema-mutation removal, and the runtime version guard.
- Added the production migration, stop-condition, Time Travel, and recovery runbook.
- Updated the master roadmap to the owner-approved 7.1 through 8.1 order and retained authentication as a post-core-platform release.

## Known inherited blockers

- None of the seven registered migration-sequence blockers remain. Strict migration validation is now required to pass.
- The shared settings schema is foundation only; Commissioner HQ is not switched from browser-local settings to server-authoritative synchronization until 7.3.3.
- The accepted refresh/login inconvenience remains unchanged and is deliberately deferred until 7.5.1 unless a genuine access-control vulnerability is discovered.
- Isolated Cloudflare staging resources and their recovery rehearsal remain a separate authorization gate.
- No Madden NFL 27 export, Free Agent discovery, import activation, or FGC data reset is included.

## Validation evidence

- A clean database applies versions 18, 19, and 20 and produces the 50-table contract with a continuous ledger from 1 through 20.
- A production-like legacy database upgrades while preserving league, user, membership, team assignment, and active-snapshot relationships.
- Foreign-key verification reports zero violations.
- A database file can be copied, reopened, and reconciled with its original identities and relationships.
- Static enforcement reports zero table/index mutation statements in request handlers.
- Runtime enforcement rejects a version-17 database and accepts version 20.
- The full repository, syntax, asset, secret, environment, migration, automated-test, inventory, and release checks are consolidated into one strict gate.

## Deployment status

- Candidate branch: `codex/franchisehq-7.1.0` from the exact 7.0.5 production tree at squash commit `f3c7366048223c8baa188e5dbd98d4d0fb51c9e3`.
- Repository publication: the owner authorized one consolidated commit, branch push, pull request, and hosted-check cycle on August 27, 2026.
- Pull request: authorized but not yet created at this candidate boundary.
- Staging migration/deployment: not authorized and not run.
- Production migration/deployment: not authorized and not run.
- Production read-only review found 47 existing tables, highest recorded migration 17, missing historical ledger versions 11–14, and no foreign-key violations. It made no changes.
- FGC membership/team edits and Madden data reset: not authorized and not run.

## Rollback

- Application rollback target is production 7.0.5 at `f3c7366048223c8baa188e5dbd98d4d0fb51c9e3`.
- Immutable recovery tag remains `v7.0.0` until a later tag is authorized.
- The migrations are additive; normal application rollback keeps the added schema and returns to the previous application commit.
- Never drop the 7.1 tables as an improvised rollback. A database restore requires a recorded pre-change D1 Time Travel bookmark and separate owner authorization.
- The exact staging and future production procedure is defined in `docs/DATABASE-OPERATIONS.md`.
