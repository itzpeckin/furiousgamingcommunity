# Validation — v5.6.0

1. Confirm footer version and no startup errors.
2. Confirm `FranchiseHQ.modules.league.games` and `FranchiseHQ.leagueGames` are objects.
3. Confirm Games APIs: `getSeason`, `getWeek`, `getGame`, `getTeamSchedule`, `getUpcomingGames`, `getCompletedGames`, `getCurrentWeek`.
4. Open Schedule and validate League Schedule, My Season Picks, and Pool Results tabs.
5. Select a winner and confidence value; refresh and confirm persistence.
6. Confirm duplicate confidence values in one week are rejected.
7. Use Auto-Assign Week and confirm all weekly values are populated.
8. Attempt Submit Season Entry before all weeks are complete and confirm validation blocks it.
9. In Commissioner HQ, restrict picks and confirm pick controls become disabled.
10. Reopen picks and confirm editing returns.
11. Confirm completed games score correct picks automatically.
12. Confirm Empty mode does not expose Development schedule data.
13. Confirm no console errors after schedule navigation, picks, and Commissioner controls.
