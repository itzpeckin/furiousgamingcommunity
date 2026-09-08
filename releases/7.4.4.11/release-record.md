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

Local candidate only. GitHub publication, pull request, hosted checks, Main, Cloudflare Production, and the exact `/eliminated` global command name upsert remain unauthorized. Production remains FranchiseHQ 7.4.4.10 on migration 35.

## Rollback

Return the application code to exact source baseline `fd6e6c834b70b6737258825c69cac4e2f5151311`. Migration 35 remains current. Preserve the active snapshot, every retained snapshot and audit, Discord installation/routing, permanent export URL, memberships and assignments, all trade and draft-pick records, and blocked/null Free Agent evidence.
