# FranchiseHQ 7.4.4.12 Release Record

## Scope

Refine only the Discord bot's Player Card and schedule presentation: compact position-specific headline statistics, canonical portraits, and conservative playoff-state indicators without matchup bolding.

## Added during delivery

- `/player` limits quarterback cards to Completion Percentage, Yards, TDs, and INTs.
- Running backs and fullbacks show Attempts, Yards, TDs, and Fumbles; wide receivers and tight ends show Receptions, Yards, and TDs.
- Defensive positions show Tackles, Sacks, and INTs; kickers show FG Attempted and FG Made. Secondary source metrics remain available to other commands and the website but are not rendered on the Discord Player Card.
- `/player` uses the same canonical portrait adapter proven by the Discord Trade Block and omits the image cleanly when Madden provides no valid portrait.
- `/schedule` removes bold formatting from matchups and places a green, red, or white indicator next to each team and current record. Discord does not support reliable per-word embed colors across clients, so semantic indicators provide the requested cross-device presentation.
- Green is intentionally conservative: the team must have mathematically guaranteed a division title or top-seven conference finish using record ceilings. Red uses the existing strict 17-game elimination proof. Tied ceilings and uncertain cases remain white because official tiebreakers are not inferred.

## Known inherited blockers

Madden's Free Agent route remains blocked upstream. Its count remains unknown/null and is not interpreted as zero. Record-only playoff state cannot resolve official Madden/NFL tiebreakers, so the display deliberately favors white over an unsupported green or red classification.

## Validation evidence

Focused Discord tests cover all requested position groups, headline-only statistic filtering, cumulative percentage derivation, canonical portraits, the three schedule states, unbolded schedule formatting, unchanged `/games`, conservative elimination and clinch logic, tenant isolation, and existing automatic schedule-thread behavior. Focused Discord validation passes 30/30, the complete repository suite passes 205/205, and the strict repository result is recorded in `validation-evidence.json`.

## Deployment status

Local implementation only. GitHub publication, pull request, hosted checks, Main, Cloudflare Production, and the exact revised `/player` global definition upsert remain unauthorized. Production remains FranchiseHQ 7.4.4.11 on migration 35.

## Rollback

Return the application code to exact source baseline `5c222218cc654ff3696a228386eb7ee6ae40189c`. Migration 35 remains current. Preserve the active snapshot, every retained snapshot and audit, Discord installation/routing, permanent export URL, memberships and assignments, all trade and draft-pick records, and blocked/null Free Agent evidence.
