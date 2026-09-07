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

Local implementation is complete on `codex/franchisehq-7.4.4.10` from exact Production evidence baseline `e9918cab0ed56057873ddecd70eb453642c83225`. Publication, pull request, hosted checks, Main, Production, and Discord command registration have not been authorized or run. No command-schema change or migration is required.

## Rollback

Return the application code to exact source baseline `e9918cab0ed56057873ddecd70eb453642c83225`. Migration 35 remains current. Preserve the active snapshot, every retained snapshot and audit, Discord installation/routing, permanent export URL, memberships and assignments, all trade and draft-pick records, and blocked/null Free Agent evidence.
