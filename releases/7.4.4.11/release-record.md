# FranchiseHQ 7.4.4.11 Release Record

## Scope

Add current win/loss records to Discord schedule matchups, introduce a simple `/eliminated` view, and simplify `/trade-block view` cards by removing statistics and adding the canonical Player Card portrait.

## Added during delivery

- `/schedule` now places each team's current active-snapshot record beside its abbreviation for week and team schedule results.
- `/eliminated` uses only active standings and a 17-game regular season. For each team it calculates the best possible final record if every remaining game were won.
- A team is listed only when that record ceiling cannot reach either its division title or one of the conference's three Wild Card positions. Equal record ceilings remain alive because unavailable official Madden/NFL tiebreakers are never inferred.
- The superseded `/playoff push` simulation, probability, impact score, tier, and week argument were removed completely before publication.
- `/trade-block view` retains one linked team-colored card per player while removing season statistics. Each card now shows Overall, Age, Development, Looking For, and the same source portrait used by the canonical Player Card when available.
- The Discord command inventory grows from 36 to 37 commands. Only the new `/eliminated` definition requires a non-destructive name upsert after a separately authorized Production deployment; existing `/playoffs`, `/schedule`, `/trade-block`, and `/week1`–`/week18` definitions are preserved.

## Known inherited blockers

Madden's Free Agent route remains blocked upstream. Its count remains unknown/null and is not interpreted as zero. `/eliminated` deliberately leaves record-ceiling ties alive because official league tiebreakers are not present in the active source.

## Validation evidence

Focused Discord tests cover 37-command inventory safety, records in `/schedule`, strict 17-game record-ceiling elimination, tied-ceiling safety, Trade Block statistic removal, canonical portrait resolution, identity alias fallback, permissions, tenant resolution, and existing automatic schedule-thread behavior. The complete strict repository result is recorded in `validation-evidence.json`.

## Deployment status

Published exact candidate `f7512d6b642d26df08e1d5a902a673e240def5cf` through PR #54 with all four candidate checks passing, then merged to Main as `5a06f1c8aaf54e9f4dc6ac1475fce2048a438f5f`. Main quality run `34189378367` and Pages workflow `34189377637` passed. Initial code-only Pages deployment `dcd8fa68-92ff-48e9-b793-6539565553c7` succeeded.

The exact new `/eliminated` definition was then registered through one non-destructive global name upsert during accepted Pages deployment `d2f7dfc5-53b5-499e-9a84-febeec24f724`. The build log confirms one definition was upserted, no bulk replacement ran, and the temporary registration command was immediately restored to `exit 0`. Live HTTPS acceptance reports FranchiseHQ 7.4.4.11.

Read-only Production D1 acceptance confirms migration 35, one league, 31 users, 31 memberships, 30 active team assignments, 17 retained snapshots, one Discord installation, 16 active schedule threads, zero foreign-key violations, and active snapshot `31068679-df14-414a-a7bd-7b712b2ee43c` at Season 2026 / Week 15 with 32 teams, 2,036 rostered players, 272 games, 11,298 statistics, and 32 standings. Free Agents remain blocked with a null count. The league's Week 15 import and active-snapshot change occurred independently before this read-only acceptance; this release wrote zero database rows. No migration, import, reset, release-driven snapshot change, archive, transition, export URL rotation, credential/membership/assignment change, Discord guild/routing change, or Free Agent reinterpretation occurred.

## Rollback

Return the application code to exact source baseline `fd6e6c834b70b6737258825c69cac4e2f5151311` and, if required, name-upsert the prior `/eliminated` state without bulk-replacing Discord commands. Migration 35 remains current. Preserve the active snapshot, every retained snapshot and audit, Discord installation/routing, permanent export URL, memberships and assignments, all trade and draft-pick records, and blocked/null Free Agent evidence.
