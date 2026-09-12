# FranchiseHQ 7.5.5.8 Release Record

**Status:** Production deployed; owner Discord presentation acceptance pending

**Production changed:** Yes. PR #78 merged to Main as `c286bc5940cc5c8ea3b99ff217d41f9a7960db63`, and Git-integrated Pages deployment `421c0b5b-a760-411c-afa4-1599d5d888f3` serves release 7.5.5.8. Migration 40 remains current and no database write ran.

## Scope

Make the boundary between every Discord trade asset equally visible on Discord Mobile and Desktop without changing the structured trade package.

## Implementation

- Replaced zero-width spacer fields, which Discord Mobile collapses, with a visible `━━━━━━━━━━━━━━━━━━━━` separator stored inside each non-final asset field.
- Preserved one real embed field per player or draft pick, team-colored embeds, team logos, linked player names, contract details, pick details, the clean workflow-status card, and existing decision controls.
- Preserved the same divider in the permission-safe fallback when Discord suppresses rich embeds.
- Applied the shared renderer to owner private threads and Trade Submit committee reviews; no separate mobile-only payload is maintained.

## Added during delivery

- A visible, mobile-stable character separator after each non-final player or draft-pick asset.
- Structural regressions that reject invisible-only spacer fields and verify fallback parity.

## Known inherited blockers

Madden's Free Agent route remains blocked upstream. Its count remains unknown/null and is not interpreted as zero.

## Validation evidence

The focused Discord suite proves every non-final asset ends with the visible divider, every asset remains a real field, no zero-width spacer survives, and the permission-safe fallback retains the divider. The complete strict repository gate passed 215 automated tests, 255 JavaScript modules, 76 Pages routes, 23 canonical migrations, and 116 required tables.

## Deployment status

Exact candidate `0de21b45bf3b617667fbe518c2d90bf1f65ffbda` passed all four hosted pull-request checks and merged through PR #78 as Main `c286bc5940cc5c8ea3b99ff217d41f9a7960db63`. Main quality and Pages workflows passed, and Git-integrated Pages deployment `421c0b5b-a760-411c-afa4-1599d5d888f3` is the current Production deployment. Authenticated read-only acceptance loaded FGC at Season 2026, Regular Season Week 19 and displayed Current Release 7.5.5.8. A newly rendered multi-asset trade is the remaining owner Mobile/Desktop presentation check because historical Discord messages are not rewritten.

## Boundaries

This release requires no migration or Discord command registration. It does not execute a trade action or reset, change the active snapshot, import data, archive or transition a season, rotate the export URL, change credentials or memberships, or reinterpret blocked Madden Free Agents. Historical Discord messages are immutable; only newly rendered trade messages receive the divider.

## Rollback

The code-only rollback baseline is Main commit `7a5429ff98ebde02351d4a0b9d3fba10a4f1c9a2` with tree `f7053a5f12fa56d321dd0c3d1d649e0693fc98f9`. No database rollback is required.
