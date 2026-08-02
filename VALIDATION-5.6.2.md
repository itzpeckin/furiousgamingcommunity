# Validation — Franchise HQ v5.6.2

## 1. Version and startup

Confirm the footer displays:

```text
v5.6.2 · Statistics Service & UI
```

Open the browser console and confirm there are no immediate red application errors.

## 2. Service registration

Run:

```javascript
({
  service: typeof FranchiseHQ.modules?.league?.statistics,
  alias: typeof FranchiseHQ.leagueStatistics,
  player: typeof FranchiseHQ.leagueStatistics?.getPlayerStats,
  team: typeof FranchiseHQ.leagueStatistics?.getTeamStats,
  leaders: typeof FranchiseHQ.leagueStatistics?.getLeagueLeaders,
  season: typeof FranchiseHQ.leagueStatistics?.getSeasonTotals,
  weekly: typeof FranchiseHQ.leagueStatistics?.getWeeklyLeaders,
  gameLog: typeof FranchiseHQ.leagueStatistics?.getPlayerGameLog,
  rankings: typeof FranchiseHQ.leagueStatistics?.getTeamRankings,
  diagnostics: typeof FranchiseHQ.leagueStatistics?.diagnostics
});
```

Every API field should report `function`; service and alias should report `object`.

## 3. Alias identity

```javascript
FranchiseHQ.leagueStatistics ===
FranchiseHQ.modules.league.statistics;
```

Expected: `true`.

## 4. Diagnostics

```javascript
FranchiseHQ.leagueStatistics.diagnostics();
```

Expected values include:

```text
service: statistics
version: 5.6.2
playerStatCount: greater than 0 in Development Data
teamStatCount: 32
categories: passing, rushing, receiving, defense, kicking, punting
healthy: true
errorCount: 0
```

A weekly-stat warning is acceptable when Development Data does not contain weekly game logs.

## 5. League statistics categories

Open `Stats & Leaders` and validate these tabs:

```text
Passing
Rushing
Receiving
Defense
Kicking
Punting
Team Rankings
```

Each player category should display three leader cards and one full leaderboard table.

## 6. Category columns

Validate that each category has appropriate columns:

- Passing: GP, CMP, ATT, CMP%, YDS, TD, INT, Y/A, RATE
- Rushing: GP, CAR, YDS, TD, Y/C, FUM, LONG
- Receiving: GP, TGT, REC, YDS, TD, Y/R, DROP, LONG
- Defense: GP, TKL, TFL, SACK, INT, PD, FF, FR, TD
- Kicking: GP, FGM, FGA, FG%, LONG, XPM, XPA, PTS
- Punting: GP, PUNTS, AVG, NET, IN20, TB, LONG

No cell should display `undefined`, `NaN`, or `[object Object]`.

## 7. Player filters

Test:

- Full Season / Weekly Leaders
- Week selector
- Team selector
- Minimum-games selector

Expected: the leaderboard updates without a page refresh.

When weekly records are unavailable, Weekly Leaders should show a clear empty row rather than season totals.

## 8. Sorting

Click multiple statistic column headings.

Expected:

- First click sorts descending.
- Second click sorts ascending.
- The active column shows an arrow.
- Player links continue to open the correct player card.

## 9. Team rankings

Open `Team Rankings` and test:

```text
Scoring Offense
Scoring Defense
Total Offense
Passing Offense
Rushing Offense
Turnover Differential
Sacks
Point Differential
```

Expected columns:

```text
Rank
Team
Games
Value
League Average
```

Clicking a team row should open the correct Team page.

## 10. Team Stats migration

Open:

```text
Teams → Select Team → Stats
```

Expected:

- Team overview metrics appear at the top.
- Passing, Rushing, Receiving, Defense, Kicking, and Punting sections appear.
- The data matches the league Statistics service.
- Clicking a player opens the correct player card.

Compare directly:

```javascript
FranchiseHQ.leagueStatistics.getTeamStats('dal');
```

## 11. Player API

Select a visible player ID and run:

```javascript
const row = FranchiseHQ.leagueStatistics.getPlayerStats('PLAYER_ID');
({
  frozen: Object.isFrozen(row),
  statsFrozen: Object.isFrozen(row?.stats),
  id: row?.id,
  teamId: row?.teamId,
  position: row?.position
});
```

Expected: both frozen values are `true`, and identity fields match the selected player.

## 12. Empty State

Activate Empty State from Commissioner HQ → League Data.

Expected:

- Development leaderboards are not exposed.
- The existing shared Empty State appears.
- No application crash occurs.

Restore Development Data afterward.

## 13. Regression

Confirm these remain operational:

```text
Schedule
Confidence Pool
Standings
Commissioner Controls
Roster
Depth Chart
Team Schedule
Cap
```

## 14. Final console check

Navigate through all Statistics categories, use filters and sorting, open player/team rows, and switch data sources.

Expected: no red JavaScript application errors.
