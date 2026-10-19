# FHQ 8.2.18

## Scope

Standings now has GM History with career wins, losses, ties, win percentage, playoff berths, Super Bowl appearances and titles, points for/against and turnovers. Game History filters by one or two GMs and shows head-to-head records, points and every retained matchup. Current and archived seasons use recorded team ownership periods. Preseason is excluded.

## Added during delivery

Incomplete playoff brackets no longer award Super Bowl appearances. Missing scores are not converted into ties. History requests share work, expire after 30 seconds, invalidate after imports and isolate leagues. Stale standings responses cannot overwrite a newer tab selection.

## Known inherited blockers

Old games without retained ownership or source records cannot be reconstructed. Partial points and turnover totals display game coverage instead of implying complete zero-valued data. No import or historical data mutation is part of this release.

## Validation evidence

All 601 tests and the strict quality gate passed. Sixteen focused history checks cover attribution, archived/current sources, turnover coverage, missing scores, authorization, tenant isolation and cache invalidation. Real-handler browser fixtures passed at 1440px and 390px with opponent filtering, empty results, correct reversed totals and contained table scrolling. Production acceptance follows deployment.

## Deployment status

Authorized candidate; Pages preview and production publication pending. No migration or separate Worker changes.

## Rollback

Restore Pages at v8.2.17. The feature is read-only and needs no data rollback. See recovery-plan.md.
