# FranchiseHQ 7.4.0 Release Record

**Status:** Production deployed and read-only verified; pending owner UI acceptance

**Production changed:** Yes, within the authorized application and additive-migration scope. Implementation commit `b17e12468e7f013687d88fcdf1f6fc2437aef949` is merged to Main as `3c5cfc8004a7f18f0ed86b5722ed9a3e0f4c2974`; migration 28, Pages deployment `03c111d0-a4d9-458e-b91c-9ece937016d0`, and Worker build `7131fe69-1537-43cd-b0ee-e2ca60a03761` are live. Active Week 9 snapshot `b00edb25-ac65-40d4-9969-431f94dd1e3e` is unchanged.

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

- PR #31 published exact implementation commit `b17e12468e7f013687d88fcdf1f6fc2437aef949` and passed 4/4 pull-request checks. Main merge `3c5cfc8004a7f18f0ed86b5722ed9a3e0f4c2974` passed all five Main/build/deployment checks.
- Production migration 28 advanced the canonical ledger from 27/80 tables to 28/90 tables. Protected counts stayed at one league, 20 users, 20 memberships, 19 active team assignments, and one active snapshot; every new Trade Center table is empty and foreign-key verification is clean.
- Recovery bookmarks are `0000005b-0000088c-000050d9-6ce946e1b6ac4175ab4603f3209f0729` before migration and `0000005b-00000898-000050d9-a9c0903c08e3e0ed753eefe12bbb5e9f` after migration.
- Signed-in read-only acceptance shows Production release 7.4.0, Season 2026 · Regular Season Week 9, the shared empty Trade Center, and no browser errors. The protected endpoint returns HTTP 401 without authentication.
- No staging run, Madden export/import, snapshot activation, reset, Archive Season, game-year transition, permanent deletion, export-URL rotation, membership/credential change, or Trade Center seed/action occurred.

## Rollback

Runtime rollback restores accepted 7.3.8 commit `677c226b9289dda4dc4f84fbbe6245e912330541` and Pages deployment `2f96f87a-3a79-40b6-8ae6-296fb19d3a28`. Retain additive migration 28 and every future trade, notification, pick-ledger, overlay, audit, and reconciliation row; rollback must not reset league data, move the active snapshot, rotate the export URL, or reinterpret blocked Free Agents.
