# Franchise HQ v5.6.2 — Statistics Service & UI

## Scope

This release completes Epic 5.6 by introducing the official read-only league Statistics service and migrating the league-wide and Team Stats experiences to that shared source.

## Included

- `FranchiseHQ.modules.league.statistics`
- Public alias: `FranchiseHQ.leagueStatistics`
- Player season totals
- Player weekly game logs when supplied by the active snapshot
- Passing, rushing, receiving, defense, kicking, and punting leaderboards
- Team statistical totals and overview metrics
- Team statistical rankings
- Season/week/team/minimum-games filters
- Sortable statistic columns
- Team Stats tab migrated to the shared service
- Empty-safe and read-only responses
- Statistics diagnostics

## API

```javascript
getPlayerStats(playerId)
getTeamStats(teamId)
getLeagueLeaders(category, options)
getSeasonTotals(options)
getWeeklyLeaders(week, category, options)
getPlayerGameLog(playerId)
getTeamRankings(category)
diagnostics()
```

## Notes

Weekly leaderboards require weekly or game-log statistics in the active data snapshot. When those records are unavailable, Franchise HQ shows a supported empty result rather than fabricating weekly values.
