# FranchiseHQ 7.5.5.1 Release Record

**Status:** Locally validated review candidate; external publication is not authorized

**Production changed:** No. Production remains FranchiseHQ 7.5.5 on migration 38.

## Scope

Deliver the owner-approved Discord command, contract-display, private-trade presentation, and Player Card Abilities refinements as one tenant-safe local candidate. FranchiseHQ and its active Madden snapshot remain the shared authority; no FGC-specific application behavior is introduced.

## Added during delivery

- Direct `/standings all|division|conference|team` and `/gm-history all|player` forms with scoped autocomplete.
- Twelve exact Leaders metrics grouped under passing, rushing, receiving, defense, and kicking.
- `/rules all|category|section|rule` discovery backed by the connected league's published FranchiseHQ Rules names and content.
- Current Madden 27 cap hit and release penalty normalization from the observed ten-thousands source unit, with older retained thousands-unit evidence preserved.
- Clean receiving-team Discord trade cards with clickable player names, player/pick details, and only source-supported contract facts. Unsupported acquiring salary and projected team cap-space estimates are no longer shown.
- A bounded, independently scrollable Player Card Abilities list with keyboard focus, contained touch scrolling, and phone-safe typography.

## Known inherited blockers

Madden's Free Agent route remains blocked upstream. Its count remains unknown/null and is not interpreted as zero.

## Validation evidence

The focused Discord, contract-provenance, trade-delivery, Player Card, Commissioner, and authentication suite passes 62/62. The complete application suite passes 212/212 and the strict gate passes 212/212, including 255 JavaScript syntax checks, 21 canonical migrations, 115 required tables, 76 routes, environment separation, asset validation, repository policy, and secret scanning.

## Deployment status

No GitHub publication, pull request, hosted check, Main merge, Production deployment, Discord command registration, migration, or Production data operation ran. Those external actions require a separate exact-candidate authorization.

## Rollback

The local rollback baseline is exact Main commit `a6a29a145d2d61a2a968a598e1e3cedfb922799e` with tree `db2fb7ad6fea99336edb63d3aa25f3334b6727e2`. The candidate adds no database migration. Reverting its code leaves Production 7.5.5, migration 38, every retained snapshot/import/audit, trade workflow/room, permanent export URL, identity, membership, assignment, and blocked/null Free Agent state unchanged.
