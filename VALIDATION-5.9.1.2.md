# Validation — v5.9.1.2

1. Upload all files and hard-refresh with Ctrl+Shift+R.
2. Confirm the footer says `v5.9.1.2 · Companion Teams Importer`.
3. Open Commissioner HQ → League Data.
4. Click **Load Sample Payload**. Confirm 2 teams and 2 players are mapped.
5. Click **Import Previewed Teams**.
6. Confirm the card reports `Teams Active`, 2 teams imported, and an active snapshot ID.
7. Confirm the Import Framework history count increases and Latest Import is successful.
8. Refresh the browser and confirm the active snapshot remains.
9. Confirm the UI says players are still pending for v5.9.1.3.

## Console checks
```js
FranchiseHQ.leagueCompanionTeamsImporter.diagnostics()
```
Expected: version `5.9.1.2`, `teamsOnly: true`, `playersActivated: false`.

```js
FranchiseHQ.leagueSnapshotManager.getActiveSnapshot({includeData:true})
```
Expected: `recordCounts.teams === 2`, `recordCounts.players === 0`, and `snapshot.meta.pendingDatasets` contains `players`.
