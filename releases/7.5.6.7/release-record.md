# FranchiseHQ 7.5.6.7

## Scope

Correct the retained 2027 All Weeks weekly import without requiring another Madden export. A populated cumulative team-summary route can no longer advance the league clock by itself, an opening package with explicit empty player-stat routes proves Regular Season Week 1, and statistics later than the proven current period stay outside the candidate snapshot.

## Production evidence

The retained cohort contains 179 routes and the completed yearly catalog contains 272 games across all 18 regular-season weeks. All six player-stat categories are empty for Weeks 1–18. The only populated weekly statistics route is `week/reg/2/team` with 32 cumulative rows whose embedded fields show Week index 1 and preseason-era three-game records. This aggregate is retained for audit but is not current-week evidence.

## Added during delivery

Current-period proof now excludes cumulative team-summary routes from league-clock authority while preserving player-stat authority and the established single-week empty-stat path. An All Weeks opening package with explicit empty regular-season player-stat routes now proves Week 1, and candidate coverage and mapping exclude only statistics later than that proven current period. The complete yearly schedule remains available to every schedule view.

## Known inherited blockers

Madden's explicit Free Agents route remains blocked upstream and therefore unknown/null, never zero. Import performance work remains planned for 7.5.7. Neither limitation requires a repeated 18-week schedule export.

## Validation evidence

Focused regressions reproduce the retained Production shape: 272 schedule games across 18 weeks, empty player-stat routes for every week, and one populated 32-row cumulative team-summary route under Week 2. They prove Regular Season Week 1, keep future statistics outside the Week 1 candidate, and preserve the ordinary Week 0 payload-period correction. The focused suite passed 42 tests, the repository suite passed 262 tests, and the strict gate passed 250 tests.

## Safety boundaries

The patch is code-only and adds no migration. It preserves route authority, Week 0 sentinel payload-period resolution, ordinary single-week empty-stat handling, the full schedule horizon, malformed captures, the old failed candidate, previous snapshots, audits, the permanent export URL, season/game-year state, Discord state, and blocked/null Free Agent semantics. Future statistics are skipped only after a candidate current period is proven.

## Deployment status

Production publication and retained-cohort import are owner-authorized. The code must pass focused, repository, strict, hosted PR, Main, and Production acceptance gates before the retained package is activated.

## Rollback

The exact pre-release runtime baseline is Main `9c968e3e0348d607f37addc3dd2f9d786ed63f8d`, Production release 7.5.6.6, and migration 42. Runtime rollback must retain every schedule revision, capture/R2 object, report, candidate, snapshot, audit, URL, season/game-year record, Discord record, and the blocked/null Free Agent result. It must not restore a D1 bookmark.
