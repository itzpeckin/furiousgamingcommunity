# FranchiseHQ 7.4.4.10 Release Record

## Scope

Replace the compact `/trade-block view` list with the same rich, linked Player Card presentation used by `/player`, while retaining each owner's optional Looking For note and the league Trade Block link.

## Added during delivery

- Every resolved Trade Block player is returned as an individual Discord embed built by the shared `/player` Player Card adapter.
- Each card retains its canonical linked player name, team and position, team color, Overall, Age, Development, and every available position-specific franchise statistic.
- The listing's optional **Looking For** note is inserted into that player's card without removing any Player Card data.
- Permanent FranchiseHQ player identity is resolved to its newest Madden source alias when needed, preventing a valid listing from falling back to a plain text asset tile.
- Discord's ten-embed response boundary is handled explicitly. The response identifies when only the first ten listings are shown and always preserves the direct link to the complete web Trade Block.

## Known inherited blockers

Madden's Free Agent route remains blocked upstream. Its count remains unknown/null and is not interpreted as zero. Discord limits one message to ten rich embeds, so leagues with more than ten simultaneous listings use the included FranchiseHQ Trade Block link for the complete set.

## Validation evidence

Focused Discord validation proves that `/trade-block view` and `/player` produce the same linked Player Card structure for a listed player, including Overall, Age, Development, and available position statistics, while preserving the Looking For note. The complete strict repository result is recorded in `validation-evidence.json`.

## Deployment status

Exact candidate `a2d24983b648100841b9fc7dc6efbf98ec5fe0a0` was published through PR #53 after its hosted quality gate passed, then merged to Main as `4669ba75c3a9eb4aac8eeed6540497ba37aeca6d`. Main quality run `34171616830` and Cloudflare Pages Production deployment `e65a00a0-af35-464b-950b-8cdc284a181f` succeeded. The live HTTPS response reports FranchiseHQ 7.4.4.10.

Read-only Production D1 acceptance confirms migration 35, one league, 31 users, 31 memberships, 30 active team assignments, 16 retained snapshots, one Discord installation, 15 active schedule threads, zero foreign-key violations, and unchanged active snapshot `23dd264d-d8e9-4643-9c41-e37f039ab27d` at Season 2026 / Week 14 with 32 teams, 2,036 rostered players, 256 games, 10,828 statistics, and 32 standings. Free Agents remain blocked with a null count. The query wrote zero rows. No migration, command registration, import, reset, snapshot change, archive, transition, export URL rotation, credential change, membership/assignment change, or league-data write occurred during this deployment.

## Rollback

Return the application code to exact source baseline `e9918cab0ed56057873ddecd70eb453642c83225`. Migration 35 remains current. Preserve the active snapshot, every retained snapshot and audit, Discord installation/routing, permanent export URL, memberships and assignments, all trade and draft-pick records, and blocked/null Free Agent evidence.
