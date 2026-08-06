# Validation — v5.9.0.4

1. Upload all files and hard refresh. Footer must show `v5.9.0.4 · Import History & Events`.
2. Commissioner HQ → League Data must show Import History and Refresh Events as Ready.
3. Console: `FranchiseHQ.leagueImportHistory.diagnostics()` should report version 5.9.0.4.
4. Console: `FranchiseHQ.leagueDataEvents.diagnostics()` should report eventName `league:dataUpdated`.
5. Create a record: `FranchiseHQ.leagueImportHistory.simulate({season:2027,week:4})`. Refresh League Data and confirm History Records increases and Latest Import is successful.
6. Test event subscription:
```js
const stop = FranchiseHQ.leagueDataEvents.subscribeToLeagueDataUpdated(console.log);
FranchiseHQ.leagueDataEvents.publishLeagueDataUpdated({reason:'validation-test',source:'development',season:2027,week:4,simulated:true});
stop();
```
One event payload should print.
7. Refresh the browser and confirm the history record persists.
8. Confirm Home, Teams, Rosters, Standings, Statistics, and Trade Center behave as before.

Cleanup: `FranchiseHQ.leagueImportHistory.clear()`
