# FranchiseHQ 7.2.0 Release Record

**Status:** Local strict validation passed; consolidated repository publication, hosted checks, staging migration 21, and staging deployment authorized

**Production authorized:** No

**Production changed:** No application, database, membership, Madden data, snapshot, Discord, credential, binding, or hosted configuration has been changed.

## Scope

Make the current single-league FranchiseHQ launch structurally tenant-safe without enabling another league. FGC remains the only enabled production tenant while league resolution, schema scope, feature/domain configuration, storage namespaces, and audit context become reusable and fail closed.

## Added during delivery

- Added migration 21 for tenant status, aliases, domains, features, branding/configuration, and tenant audit events.
- Rebuilt the remaining nullable/indirect tenant tables with mandatory direct `league_id` while preserving their contents.
- Added one shared server resolver for route slugs, aliases, login joins, APIs, and import endpoints.
- Removed runtime hard-codes for the FGC slug/ID, first-row fallbacks, and the browser-seeded default tenant.
- Moved new Companion KV/R2 keys to tenant-ID namespaces while retaining existing D1 object references.
- Added disabled-tenant, unknown-feature, alias, session-membership, identical-ID isolation, full schema-scope, hard-code, and resolver scans.
- Made Rules update plus tenant audit one atomic database batch.
- Updated the product shell/version contracts, database/recovery runbooks, and master roadmap.
- Moved Madden 27 discovery, mapping, safe FGC activation, team/roster/player pages, Free Agents, URLs, and ownership reconciliation directly after 7.2.

## Known inherited blockers

- The accepted refresh/login inconvenience is unchanged and deferred to 7.5.0.
- Commissioner settings remain browser-local until 7.4.2 despite the shared database contract.
- No current Madden 27 export has been inspected under this release; source discovery begins in 7.3.0.
- No FGC reset, import, snapshot activation, or team assignment is included.

## Validation evidence

- A fresh database reaches version 21 with 54 required tables and a continuous ledger.
- A production-shaped upgrade preserves users, sessions, memberships, rules, settings, active snapshot pointers, validation-player rows, and foreign-key integrity.
- Two in-memory tenants with identical team IDs and team-owner assignments resolve only their own data.
- Disabled tenants and unknown feature keys fail closed.
- Static scans report zero active runtime hard-coded tenant defaults and zero independent league resolvers.
- Strict migration validation passes with four canonical migrations and 19 archived legacy files.
- The corrected consolidated gate validates all 60 tests plus 183 JavaScript modules, 521-file secret scan, environment separation, assets, inventory, and release contract.

## Deployment status

- Candidate branch: `codex/franchisehq-7.2.0`.
- Source production baseline: merged 7.1.0 commit `4045e02980c93491b47910f17fcb2e48fae76c68`, tree `c090eb27500c93dff91d23f79a82706e175acfb0`.
- Repository publication/pull request: authorized by Justin/Peckin on August 27, 2026; not yet created at this record boundary.
- Staging migration 21 and staging deployment: authorized for the registered isolated staging environment only; not yet run at this record boundary.
- Production migration/deployment: not authorized and not run.
- FGC Madden reset/import/activation and membership/team changes: not authorized and not run.

## Rollback

- Application rollback target is production 7.1.0 at `4045e02980c93491b47910f17fcb2e48fae76c68`.
- Existing immutable emergency tag remains `v7.0.0` until a newer tag is separately authorized.
- Normal code rollback retains the forward-compatible version-21 schema and all stored objects.
- Never drop/reverse tenant tables as an improvised rollback. A database restore requires the recorded pre-change Time Travel bookmark and separate owner approval.
- Exact stop and recovery instructions are in `docs/ROLLBACK.md` and `docs/DATABASE-OPERATIONS.md`.
