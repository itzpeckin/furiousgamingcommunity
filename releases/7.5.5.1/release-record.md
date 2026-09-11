# FranchiseHQ 7.5.5.1 Release Record

**Status:** Production deployed and read-only verified; signed-in owner acceptance pending

**Production changed:** Yes. The exact validated candidate is merged to Main, Production serves 7.5.5.1, and the four authorized Discord definitions are registered. Migration 38 and all league data remain unchanged by this code-only release.

## Scope

Deliver the owner-approved Discord command, contract-display, private-trade presentation, and Player Card Abilities refinements as one tenant-safe release. FranchiseHQ and its active Madden snapshot remain the shared authority; no FGC-specific application behavior is introduced.

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

PR #64 published exact candidate `dfc5e5296eebc34c81ba1661907f0b5316c62434`. All four pull-request checks passed, the PR merged to Main as `1d9895e9a3253c6ebace7feaee12bdd65b3bb2fb`, and all five Main quality/build/deployment checks passed.

Git-integrated Production deployment `6bae73b1-e5b9-4dcd-be80-53551d9dcee1` published exact Main source. One bounded follow-up Production deployment, `c9ae37c4-c819-49cd-b697-ad24a7d3e481`, used the encrypted Production Discord credentials to name-upsert exactly `standings`, `leaders`, `gm-history`, and `rules`. Its log confirms four definitions upserted, zero retired names, no bulk replacement, and no deletion of unowned commands. The Production build command was immediately restored to `exit 0`.

Read-only HTTPS acceptance returned `200` from both the public and league routes, the public page displayed `Release 7.5.5.1`, and both routes returned `x-franchisehq-release: 7.5.5.1`. The accepted Pages deployment retains the `franchisehq.app` Production alias.

Read-only verification of the correct Madden 27 Production D1 database (`franchise-hq-db-madden27`, `b2529150-28af-42ca-a07b-69506764ccb6`) found migration 38, 38 continuous ledger rows, 115 canonical tables, and zero foreign-key violations. Current live state contains 1 league, 32 users, 32 memberships, 31 active team assignments, 32 retained snapshots, 11 trade workflows, 18 trade messages, and 5 Discord trade rooms. The existing active validation-ready Season 2026 / Week 19 snapshot is `2b31297b-19e1-4f28-b86d-e8ff375ceca3`, with previous snapshot `6d1fb9e1-8ace-4909-8e10-175b24db5910`, 32 teams, 2,014 rostered players, 326 games, 14,816 statistics, and 32 standings. Its retained candidate evidence still records Free Agents as `blocked` with a null count.

No migration, Madden export, import, snapshot activation/change, reset, deletion, archive, transition, export-URL rotation, Discord credential or guild configuration change, membership/assignment change, or live trade decision ran. Production D1 received zero release-driven writes.

## Rollback

The application rollback baseline is exact prior Main commit `a6a29a145d2d61a2a968a598e1e3cedfb922799e` with tree `db2fb7ad6fea99336edb63d3aa25f3334b6727e2`. The release adds no database migration. A code rollback can retain migration 38, every snapshot/import/audit, trade workflow/room, permanent export URL, identity, membership, assignment, and blocked/null Free Agent state.
