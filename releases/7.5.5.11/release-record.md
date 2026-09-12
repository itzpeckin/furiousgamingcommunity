# FranchiseHQ 7.5.5.11 Release Record

Status: Production deployed and authenticated read-only verified; owner visual acceptance pending.

## Scope

Brighten platform Trade Review player and draft-pick rows using the asset's source team colors across the complete row. Remove the player Contract and pick Record fields only from Trade Review assets.

## Added during delivery

- Removed the legacy absolute dark scrim, which could extend beyond an unpositioned asset into its receiving-team package. Each asset is now explicitly positioned and uses its own opaque team-color background.
- Kept player fields POS, OVR, DEV, and AGE; pick fields CLASS, ROUND, and PROJECTED. Portraits, team logos, movement routes, and optional clickable calculator explanations remain.
- Made premium trade cards use a full-width grid track instead of an intrinsic-width track that could leave unused widget space.
- Added container-aware compact layouts for narrow desktop widgets and phones, without horizontal metric overflow.
- Added rendered regression coverage for both detail and dashboard views with the calculator enabled and disabled.

## Known inherited blockers

Madden Free Agents remain blocked upstream and unknown/null, never zero.

## Validation evidence

Focused Trade Center and mobile tests pass 15/15. Local browser checks at 1280px and 390px verify stronger team-color rows, no dark scrim, full-width cards, and no page/asset horizontal overflow or clipped metric values with calculator values on and off. The strict full repository gate passes all 216 tests, 255 syntax modules, 76 routes, 23 canonical migrations, 116 required tables, and all security, environment, inventory, and release-contract checks.

## Deployment status

Exact candidate `174c44bc9ec42ce1a13e10c607049a55c5970546` passed all four PR #84 checks and merged into Main as `977f9d30365c9eedeba2fb4e255bdc47a1f4f6ed`. All five Main checks passed, including quality run `34717254934` and Pages workflow `34717254513`. Git-integrated Pages Production deployment `02922924-cb99-4b91-8cf4-d229d126c467` succeeded. Public runtime files and authenticated UI serve 7.5.5.11.

Read-only acceptance loaded the approved NE/TB trade at Season 2026, Regular Season Week 20. At desktop 1280px and phone 390px, source-team backgrounds are visibly brighter, the old scrim is absent, Contract/Record metrics are absent, and no page/asset horizontal overflow or metric clipping is present. The existing tally remains 3 approvals and 1 rejection. Six additional authentication-framework tests pass. Migration 40 remains current; no live trade, vote, or data operation ran.

## Boundaries

No Discord behavior, command registration, migration, draft-pick ownership, player ownership, import, snapshot, reset, archive/transition, export URL, credentials, memberships, or assignments are changed. Contracts on canonical Player Cards and in Discord remain unchanged.

## Rollback

Redeploy exact Main baseline `48f100547a07dbb2eeca6b3e97e5602ad3c85f26`, tree `9ea9434ed519c2fefa2907435f5dd4e5ad00df3a`. No database rollback is required.
