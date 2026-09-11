# FranchiseHQ 7.5.5.4 Release Record

**Status:** Locally validated; publication and Production unauthorized

**Production changed:** No. Production remains 7.5.5.3 on migration 39. No Discord command, routing, trade, league data, or account state changed.

## Scope

Correct the Trade Submit review experience so a commissioner or Trade Committee member sees every proposed player and draft pick directly in Discord before choosing Approve or Deny.

The committee destination retains the same detailed receiving-team cards used in the private owner thread. It also receives a compact linked asset manifest in the review content, so the decision surface is never only a generic title and FranchiseHQ link.

## Added during delivery

- Every committee review names each player and draft pick directly in the primary Discord message, grouped by the team receiving the asset.
- The private owner thread and Trade Submit destination retain the same full receiving-team detail cards.
- A committee event cannot send when the rendered asset package is missing or incomplete.
- If Discord accepts the message but suppresses its rich cards, delivery clears the suppression when possible or posts the complete detail as bounded text in the same channel.

## Delivery safeguards

- A committee event with an incomplete rendered trade package stops before Discord delivery and remains eligible for durable retry.
- Discord's accepted message response is checked for suppressed or removed rich cards.
- An explicit suppression flag is cleared when possible; otherwise the complete receiving-team card content is posted as bounded plain-text messages in the same Trade Submit channel.
- Approve/Deny controls, exact-role mention restrictions, tenant scope, current workflow revision, and the canonical FranchiseHQ link are preserved.

## Diagnosis evidence

Read-only inspection of the owner-reported Production event found one sent Trade Submit event for committee revision 1. Its workflow contains four player assets, and each player has both a stable identity and an active-snapshot player record. The exact detail join used by the renderer succeeds. The defect is therefore in Discord presentation/delivery, not the Trade Center ledger or Madden data.

## Known inherited blockers

Madden's Free Agent route remains blocked upstream. Its count remains unknown/null and is not interpreted as zero.

## Validation evidence

The Discord suite passes 38/38. The complete strict repository suite passes 214/214, including 255 JavaScript syntax modules, 22 canonical migrations, 115 required tables, and 76 routes. Coverage includes two-pick committee summaries, a production-shaped four-player package, identical private/committee receiving-team cards, linked direct asset visibility, preserved Approve/Deny controls, and a simulated Discord response that strips every rich card followed by complete text recovery.

## Deployment status

Local implementation and validation are complete. Branch publication, pull-request checks, Main merge, and code-only Production deployment have not been authorized or run. Production remains FranchiseHQ 7.5.5.3 on migration 39; this candidate requires no migration or Discord command registration.

## Boundaries

No migration, Discord command registration/configuration, live trade action, import, reset, snapshot activation/change, archive, transition, export-URL rotation, credential change, membership/assignment change, or Free Agent reinterpretation is included.

## Rollback

The exact rollback baseline is Main evidence commit `e54b21085d0d08ee56f0662cc37efc161834d2a3` with tree `9462be685e41e40c0cfeb11f920bc3d5b3afd868`. This candidate adds no database migration and writes no Production data.
