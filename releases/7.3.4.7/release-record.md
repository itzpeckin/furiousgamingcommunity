# FranchiseHQ 7.3.4.7 Release Record

**Status:** Locally validated; owner-authorized Production publication pending

**Production changed:** No during candidate work. Production remains exact Main commit `4c9d75a8ec09caa2bc50ae888fd6b2af255f58b3`, Pages deployment `dca6eb7d-9e6d-4678-ab7c-a5194429373c`, and import Worker version `e7d81630-5d93-4726-a0c2-f71e8c12e96a`. Active snapshot `b00edb25-ac65-40d4-9969-431f94dd1e3e` remains unchanged.

## Scope

Correct the live display layer so canonical one-based game weeks are not incremented a second time, retain the approved schedule route as read-model provenance, and publish the runtime without executing any Madden or snapshot data operation.

## Added during delivery

- Added one canonical week-context resolver shared by live schedule, matchup, inspection, and statistics-to-game display paths.
- Preserved capture-route authority when an exact `/week/pre|reg|post/{week}/...` route exists.
- Preferred an already-normalized canonical game week over the legacy raw Madden zero-based fallback.
- Retained the allowlisted schedule route in the member read model without exposing the raw source record.
- Added behavior regressions covering Preseason Weeks 1–3, Regular Season Weeks 1–9, route precedence, zero-based compatibility, and private-source containment.

## Known inherited blockers

- Madden's explicit Free Agent route remains blocked upstream. Its count remains unknown/null, not zero.
- The underlying refresh/login session redesign remains scheduled for 7.5.0.
- Madden's all-zero Preseason Week 4 placeholder remains correctly absent from the active snapshot.

## Validation evidence

- Focused behavior and containment tests pass for canonical one-based display, route authority, legacy fallback, and approved route provenance.
- The active snapshot evidence remains Preseason Weeks 1–3 and Regular Season Weeks 1–9; no data rewrite is required.
- Migration 26 remains current; 7.3.4.7 adds no migration.
- The consolidated strict repository gate passed 113/113 tests across 205 JavaScript modules, 65 routes, migration 26, 79 required tables, and 535 deterministic inventory files.
- The local-file browser control surface is policy-restricted, so the same client resolver is executed in an isolated browser-compatible JavaScript harness and will be verified again from the deployed HTTPS Production page.

## Deployment status

- Branch `codex/franchisehq-7.3.4.7` is authorized for one pull request, hosted checks, exact Main merge, and Production deployment.
- Production publication, Main change, and hosted checks have not run at this candidate-record stage.
- No staging data cycle, migration, Madden export, import, active-snapshot change, reset, Archive Season, game-year transition, export-URL rotation, or credential change is authorized or required.

## Rollback

- Restore exact 7.3.4.6 Main commit `4c9d75a8ec09caa2bc50ae888fd6b2af255f58b3`, Pages deployment `dca6eb7d-9e6d-4678-ab7c-a5194429373c`, and Worker version `e7d81630-5d93-4726-a0c2-f71e8c12e96a`.
- Retain active snapshot `b00edb25-ac65-40d4-9969-431f94dd1e3e` and all historical capture, import, lifecycle, identity, and audit rows. Runtime rollback does not authorize a snapshot rollback or any data operation.
