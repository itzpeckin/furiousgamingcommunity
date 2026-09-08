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

Published exact candidate `4aa7bdc00764435044ef1cb963ebeb55bfbb181d` through PR #55 after candidate quality run `34232024746` passed, then merged it to Main as `d2d24152174826f9ecce035e4690dd7b1e387fc2`. Main quality run `34232188639` and Pages workflow `34232187539` passed. Initial code-only Pages deployment `6d64747c-98dc-44b9-be7f-780e65a1bebc` succeeded.

The revised `/player` definition was then registered through one exact non-destructive global name upsert during accepted Pages deployment `4f78cfc1-ebb8-40cc-87c1-c421ec2eb82f`. The build log confirms exactly one `/player` definition was upserted, no bulk replacement ran, and the temporary registration command was immediately restored to `exit 0`. Live HTTPS acceptance reports FranchiseHQ 7.4.4.12.

Read-only Production D1 acceptance on `franchise-hq-db-madden27` confirms migration 35, one league, 31 users, 31 memberships, 30 active team assignments, 18 retained snapshots, one Discord installation, 16 active schedule threads, zero foreign-key violations, and active snapshot `405d9a42-e749-43ae-aefa-61a392285cdd` at Season 2026 / Regular Season Week 15 with 32 teams, 2,036 rostered players, 272 games, 11,714 statistics, 32 standings, and ready validation status. Free Agents remain blocked with a null count. The newer snapshot and statistic counts predated and were independent of this code-only release; this release wrote zero database rows. No migration, import, reset, release-driven snapshot change, archive, transition, export URL rotation, credential/membership/assignment change, Discord guild/routing change, or Free Agent reinterpretation occurred.

## Rollback

Return the application code to exact source baseline `5c222218cc654ff3696a228386eb7ee6ae40189c`. Migration 35 remains current. Preserve the active snapshot, every retained snapshot and audit, Discord installation/routing, permanent export URL, memberships and assignments, all trade and draft-pick records, and blocked/null Free Agent evidence.
