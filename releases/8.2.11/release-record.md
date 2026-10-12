# FranchiseHQ 8.2.11

## Scope

Repair EA Direct native postseason week detection. The FGC diagnostic reported calendarYear 2027, seasonWeekType 2, seasonWeek 18, displayWeek 0, with the matching available export at stageIndex 1/weekIndex 18. The old normalizer supported native types 0 and 1 only and fell back to a title that could not identify the current week.

## Added during delivery

Resolve native type 2 only for playable postseason indices 18, 19, 20 and 22 when an exact SEASON (1) export is available. Zero displayWeek is accepted as the observed postseason placeholder; positive displayWeek must match the one-based export week. No maximum-week inference or new source-season inference. Use existing reg/19 through reg/23 export semantics shared with Companion. Current/previous collection remains intact, including the existing Super Bowl predecessor of index 20 rather than Pro Bowl 21.

## Known inherited blockers

EA sign-in ERR_SYSTEM is a separate provider failure; this release does not change sign-in, reconnect, workflow retries, scheduling threads or their permissions. Unknown/offseason or unavailable current weeks still fail closed. No promise of live collection completion is made without a subsequent commissioner-run export.

## Validation evidence

Three postseason regression cases failed against the prior normalizer. The corrected focused suite passes 75 tests, including all playable playoff rounds, previous/current dataset selection, invalid/missing export evidence, advancing-league rejection, calendar-only season binding and persisted Companion-compatible routes. Collection tests complete each round with provider fixtures and reject a mid-collection week change before finalization. The strict release gate passed all 560 tests, migration/schema verification, security/static checks, inventory and release contract. Hosted preview and production verification remain pending publication.

Protocol reference: https://github.com/snallabot/snallabot-service/blob/main/docs/madden/ea_api.md and its get_league.json fixture establish export stage 1 with indices 18/19/20/22. The native type/display shape comes from the bounded FGC production diagnostic; no credentials or raw account payload are in the fixtures.

## Deployment status

Production publication authorized after quality gates. Pages-only repair; schema remains 54, no separate Worker, credential, league configuration, data backfill, live export/import or Discord mutation is needed.

## Rollback

Restore 8.2.10 Pages deployment b68d6956-0721-4b05-b621-ff351e32bd85. No database rollback required; postseason EA detection would again reject this native hub shape.
