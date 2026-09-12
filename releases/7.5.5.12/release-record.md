# FranchiseHQ 7.5.5.12 Release Record

Status: Locally validated, standing owner-authorized compact-layout correction; hosted delivery in progress.

## Scope

Restore the Trade Review asset formatting from before 7.5.5.11. Keep the brighter team gradients and the removal of player Contract and draft-pick Record fields. Nothing else is redesigned.

## Added during delivery

- Removed 7.5.5.11's container-driven stacked desktop rows, additional premium card track, altered column sizes, spacing, metric surfaces, and typography overrides.
- Preserved the original asset padding, gaps, columns, font sizes, portrait sizing, and phone breakpoints.
- Retained the approved team-color gradients and the removal of the unconfined dark scrim.
- Retained four player fields and three pick fields; canonical player links and optional calculator explanation buttons remain unchanged.
- Added source guards prohibiting another container/card/layout/spacing/font override in this correction.

## Validation evidence

Focused Trade Center and mobile tests pass 15/15. Browser comparison against pre-redesign commit `48f1005` at desktop 1280px and narrow desktop 1024px confirms identical 72.109375px asset heights, 10px padding, 11px gaps, and 13.12px player-name text. At phone 390px, the previous and restored layouts both use 190.21875px rows, 11px padding, and 10px gaps. The strict full quality gate passes 216/216 tests, 255 syntax modules, 76 routes, 23 canonical migrations, 116 required tables, and all security, environment, inventory, and release checks.

## Known inherited blockers

Madden Free Agents remain blocked upstream and unknown/null, never zero.

## Deployment status

Standing authorization covers this correction through publication, PR, hosted checks, Main merge, and Production. Hosted delivery and authenticated read-only acceptance are pending. Migration 40 is unchanged.

## Boundaries

Platform-only visual correction. No Discord behavior/registration/configuration, trade ownership, live trade/vote, import, snapshot, reset, archive/transition, export URL, credentials, memberships, or assignments are changed. Canonical Player Cards and Discord contract information remain untouched.

## Rollback

Code-only baseline `fec3344b8eac3d19bd2bddf7b31a52f889b5c14f`, tree `9db8e118ee6afbed2412bf6147b811aaa6d5b0a3`. No database rollback is required.
