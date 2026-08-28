# FranchiseHQ 7.2.0 Release Record

**Status:** Staging validated; production not authorized

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
- Repository publication/pull request: exact commit `5799c35675c85695194234119fbe28f8dda76ed1` is published in PR #9 and all four hosted checks passed.
- Staging migration 21: applied and verified only on `franchise-hq-staging-db` (`3d74929a-3bf1-49e8-a7ef-8ba28ed66816`); schema version 21, 54 required tables, and zero foreign-key violations were confirmed.
- Staging resources: Preview `DB` and `FRANCHISE_HQ_DB` point to the isolated staging D1 database; `COMPANION_EXPORTS`, `COMPANION_EXPORT_META`, and `LEAGUE_CONFIG` point to newly provisioned, empty staging R2/KV resources; staging-only session/import secrets and environment variables are present.
- Staging deployment: Cloudflare Preview deployment `041c8c85-54e6-4927-b5bb-f8fc460e3be2` compiled and deployed exact commit `5799c35` successfully in 15 seconds at `https://041c8c85.franchise-hq.pages.dev`.
- Validation limitation: the owner's computer security blocks direct `pages.dev` requests, so `/api/platform/status` could not be invoked without bypassing that security control. Cloudflare's deployment and configuration records were used for the final non-invasive verification.
- Production migration/deployment: not authorized and not run.
- FGC Madden reset/import/activation and membership/team changes: not authorized and not run.

## Rollback

- Application rollback target is production 7.1.0 at `4045e02980c93491b47910f17fcb2e48fae76c68`.
- Existing immutable emergency tag remains `v7.0.0` until a newer tag is separately authorized.
- Normal code rollback retains the forward-compatible version-21 schema and all stored objects.
- Never drop/reverse tenant tables as an improvised rollback. A database restore requires the recorded pre-change Time Travel bookmark and separate owner approval.
- Exact stop and recovery instructions are in `docs/ROLLBACK.md` and `docs/DATABASE-OPERATIONS.md`.
