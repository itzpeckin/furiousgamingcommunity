# FranchiseHQ 7.4.0 Release Record

**Status:** Locally validated review candidate; publication, migration, Main, and Production are not authorized

**Production changed:** No. Production remains exact 7.3.8 commit `677c226b9289dda4dc4f84fbbe6245e912330541`, migration 27, and active Week 9 snapshot `b00edb25-ac65-40d4-9969-431f94dd1e3e`.

## Scope

Replace the device-only trade prototype with one tenant-scoped, server-authoritative Trade Center and Trade Block. Owners can build two-to-four-team offers from the active roster and FranchiseHQ pick ledger, negotiate, accept, reject, and receive shared notifications. Eligible commissioners and Trade Committee members review accepted trades with three matching non-conflicted votes by default, an optional reason, and an optional Free Trade designation.

## Added during delivery

Migration 28, the authenticated league Trade Center endpoint, the shared responsive client, permanent draft-pick ownership, Trade Block listings, revision-safe review controls, login notifications, hidden roster overlays, and post-import Madden reconciliation are included in this candidate.

## Product authority

- An approved Trade Center decision immediately changes the roster and pick presentation in FranchiseHQ without mutating the active Madden snapshot.
- The next Madden import is the unconditional player-roster authority. Matching Madden ownership publishes one ordinary roster-detected transaction. A different Madden result removes the temporary presentation overlay, displays the Madden team, retains the approved Trade Center record, releases the reserved seasonal trade slot, and privately notifies commissioners.
- No Pending, Confirmed, or reconciliation badge is exposed to members. Internal overlay and evidence rows exist only to deduplicate the Trade Center decision against the next Madden snapshot.
- Madden has no verified draft-pick ownership route in the accepted 43-route Companion source contract. FranchiseHQ therefore uses permanent pick identities keyed by league, franchise season, draft class, round, and original team. Commissioners create the missing baseline once; later approved trades move the ledger, and final approval rechecks current ownership atomically.

## Shared controls

- Commissioner HQ stores one revisioned server setting document for the Franchise-season trade limit, per-team player and pick limits, Free Trade availability, review threshold, calculator visibility, player-value weights, round values, and future-pick retention.
- Turning off the calculator removes values from the builder, packages, player surfaces, and legacy calculator bridge.
- Team owners alone can add or remove players and picks from their Trade Block and may describe the desired return. Player trade actions remain available throughout roster and player surfaces.
- Login and notification-menu surfaces read the same server notifications for received, accepted, review-required, approved, and rejected activity.

## Validation evidence

- Migration 28 is additive and creates ten tenant-scoped Trade Center tables, constrained workflow/asset state, a permanent pick ledger, notifications, hidden roster overlays, and immutable reconciliation evidence.
- Server checks enforce active membership, tenant scope, team ownership, reviewer conflict recusal, two-to-four-team balance, asset limits, stable player/pick identity, current ownership, optimistic revision checks, and single-use active roster overlays.
- Stale draft-pick authority aborts approval inside the database. Picks may be traded again after their ledger owner changes.
- Tests cover shared proposals, recipient notifications, three-vote approval, stale revision rejection, commissioner-only controls, immediate roster overlays, Madden match/revert/different-team outcomes, seasonal-slot release, idempotent reconciliation, pick re-trading, blocked Free Agent semantics, and absence of public reconciliation labels.

## Known inherited blockers

Madden's explicit Free Agent route remains blocked upstream. Its count remains unknown/null, never zero. 7.4.0 does not change or infer the Free Agent pool.

## Deployment status

No branch push, pull request, hosted check, migration application, staging deployment, Main update, Production deployment, import, snapshot activation, reset, archive, transition, export URL rotation, or Production data write is included in the current authorization.

## Rollback

The immutable application rollback baseline remains exact 7.3.8 Production commit `677c226b9289dda4dc4f84fbbe6245e912330541`. If migration 28 is later authorized and applied, runtime rollback must retain its additive tables and all trade, notification, ledger, audit, and reconciliation rows; rollback must not reset league data or change the active snapshot.
