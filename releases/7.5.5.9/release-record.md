# FranchiseHQ 7.5.5.9 Release Record

**Status:** Production deployed; owner Discord interaction acceptance pending

**Production changed:** Yes. PR #80 merged to Main as `3d97b3f61c9e3339a0898f75647cbf1b6ea19656`, and Git-integrated Pages deployment `e909d2e5-a808-4978-a959-84f004938f0a` serves release 7.5.5.9. Migration 40 remains current and no database write ran.

## Scope

Show the current Trade Committee approval/rejection tally consistently in Discord and FranchiseHQ, and prevent Trade Block team gradients from washing over the player-listing surface.

## Implementation

- Discord's shared private/committee trade renderer reads approval and rejection counts for the current trade revision and displays them directly under the workflow status.
- Every Discord Approve or Deny button response re-renders the same status card from current server state, so the visible count updates after each recorded decision.
- FranchiseHQ displays the same approval/rejection counts on Trade Center review cards and in a dedicated status summary on the trade detail screen.
- The reviewer ballot remains separate from the shared status summary and continues to enforce the league's configured matching-decision threshold.
- Trade Block rows now use an opaque navy foundation, constrained team-color branding, explicit content stacking, and stronger navy metric/market surfaces so content remains visually prominent on desktop and mobile.

## Added during delivery

- A current-revision vote aggregate in the existing shared Discord trade renderer; no duplicate committee-only card path was introduced.
- Reusable FranchiseHQ tally treatments for dashboard and detail views.
- A final Trade Block contrast cascade that keeps team colors visible as accents while protecting the information surface.

## Known inherited blockers

Madden's Free Agent route remains blocked upstream. Its count remains unknown/null and is not interpreted as zero.

## Validation evidence

Focused Discord, Trade Center, and mobile suites pass 53/53. They cover zero-state tallies, incremental committee rejection counts, terminal status, browser tally markup, responsive status layout, and protected Trade Block stacking.

## Deployment status

Exact candidate `f35e6ecc8b40efdfa2759a54947483053843a1a6` passed all four hosted pull-request checks and merged through PR #80 as Main `3d97b3f61c9e3339a0898f75647cbf1b6ea19656`. Main quality and Pages workflows passed, and Git-integrated Pages deployment `e909d2e5-a808-4978-a959-84f004938f0a` is the current Production deployment. Authenticated read-only acceptance loaded FGC at Season 2026, Regular Season Week 20 with Current Release 7.5.5.9, displayed `0 approvals` and `0 rejections` on every current committee-review card, and visually confirmed the protected navy Trade Block surface. A real Discord committee vote was deliberately not exercised during acceptance; the next Approve or Deny interaction will verify the live counter update in the existing message.

## Boundaries

This is a code-only release. It requires no migration or Discord command registration and does not execute a live vote or trade, reset data, import, change an active snapshot, archive or transition a season, rotate the export URL, alter credentials or memberships, or reinterpret blocked Madden Free Agents.

## Rollback

The code-only rollback baseline is Main commit `e3ad064be18ebfaeecc83e9d0a177b7e479aa814` with tree `c8eb727d0039db955c8d4f2166cba46c1beff066`. No database rollback is required.
