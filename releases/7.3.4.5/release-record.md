# FranchiseHQ 7.3.4.5 Release Record

**Status:** Locally validated Production-authorized candidate; publication, hosted checks, Main merge, and Production deployment pending

**Production changed:** No. Production remains on exact Main commit `5a16ccb311b368ae1df5f7fcf3e4f95bc01c9cd8`, Pages deployment `51e55575-0032-41af-b5d3-a69c67f54d2e`, and import Worker version `1e01f1a9`. Exact Week 9 snapshot `8b47ec76-7369-495e-913f-edc0310b49e1` remains active.

## Scope

Allow commissioners to submit complete older-week Madden exports as historical backfills without rolling the live league backward. Preserve the active snapshot's teams, players, rosters, standings, season, later records, and live week; overlay only the captured earlier week's games and statistics. Refresh the live application in place after atomic activation so no browser reload is required.

## Added during delivery

- Distinguish `historical-backfill` from forward and same-week imports in source coverage.
- Require both schedule and statistics coverage plus exact active Madden game-year, franchise-season, and season-year compatibility.
- Compose a backfill candidate from all five active snapshot domains, preserving active teams, players, rosters, and standings while applying only the captured earlier week's exact-ID games/statistics.
- Retain accumulated backfills and current/later records, reject unscoped or current/future source rows, and report remaining historical week gaps.
- Record import mode and backfill weeks in snapshot manifests, candidate result counts, lifecycle evidence, and tenant audits.
- Mark older eligible sources as **Historical backfill ready** in Commissioner HQ.
- Refresh the live read model, application caches, trade bridge, and current route through the existing one-click completion event without `location.reload()`.

## Known inherited blockers

- Madden's explicit Free Agent route remains blocked upstream. The rostered-player import may proceed only with Free Agents unknown/null.
- The underlying refresh/login session redesign remains scheduled for 7.5.0; this release removes the import workflow's need for a full page refresh.
- Historical weeks do not exist until Madden successfully exports their schedule and statistics routes. FranchiseHQ never manufactures unavailable weeks.

## Validation evidence

- Pure regressions prove Week 8 overlays only Week 8 records while preserving Week 7 and Week 9, rejecting unscoped and Week 9 source rows, and reporting remaining gaps.
- A database-backed authenticated commissioner regression proves a fully covered Week 8 source starts only as a same-game-year/same-franchise-season backfill against active Week 9.
- Static authority checks prove the builder preserves active teams, players, and standings, never writes the active pointer, and the importer refreshes `liveData` before emitting the application completion event.
- The focused candidate-import suite passes 10/10. The consolidated strict repository gate remains the publication prerequisite.
- Migration 26 remains current; 7.3.4.5 adds no schema migration.

## Deployment status

- Branch `codex/franchisehq-7.3.4.5` is authorized for one exact commit, pull request, hosted checks, Main merge, and Production deployment.
- No staging deployment, Production data operation, Madden export, candidate import, activation, reset, Archive Season, game-year transition, permanent deletion, or URL rotation is included in deployment.

## Rollback

- Runtime rollback restores exact 7.3.4.4 Main commit `5a16ccb311b368ae1df5f7fcf3e4f95bc01c9cd8`, Pages deployment `51e55575-0032-41af-b5d3-a69c67f54d2e`, and Worker version `1e01f1a9`.
- Retain every active/archived snapshot and any historical backfill later published by a commissioner. Snapshot rollback is separate from code rollback.
- Do not reset data, delete history, rotate the export URL, run Archive Season or a game-year transition, roll the live week backward, or reinterpret blocked/null Free Agents.
