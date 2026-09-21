# FranchiseHQ 8.0.3

## Scope

Make full-season schedule collection optional for a new league, repair the misleading mobile first-import layout, and clarify the exact first-roster prerequisite without altering any live league data.

## Added during delivery

- A commissioner may switch an incomplete 18-week schedule collection back to ordinary weekly imports. The action ends collection, retains every captured raw route, records a tenant audit, and requires a fresh current-week export. It does not seal or publish a partial schedule.
- The import workspace now shows a clear first-import state instead of a 0% nine-phase strip and zero-filled snapshot metrics. Phase details remain available during real imports, with readable phone layout.
- The UI states that the first complete live snapshot requires Rosters; later same-season League Info + Weekly Stats exports may carry a proven live roster forward.

## Known inherited blockers

P2W has no complete live roster baseline. EA's Companion Rosters mode reports unusually high server load in the owner's app, while League Info and Weekly Stats can complete. A restricted score/schedule-only first-import mode or approved alternative roster source is not part of this release and must not be silently substituted for a complete snapshot. Missing or blocked Free Agents remain unknown.

## Validation evidence

The focused regression covers incomplete-collection switching, idempotence, retained D1/R2 captures, unchanged URL token, no live snapshot or Discord threads, audit creation, and mobile first-import presentation. The complete strict repository gate covers 306 tests plus syntax, environment, migration, secret, inventory, and release-contract checks. Hosted checks are pending publication.

## Deployment status

Candidate validation in progress. Main and Production publication are authorized but not yet claimed.

## Rollback

Redeploy exact baseline `c2552c2d44763f501950123fbc70ce1f0eebe097`. No schema rollback is required. Do not delete retained captures, audit records, snapshots, or league data during rollback.
