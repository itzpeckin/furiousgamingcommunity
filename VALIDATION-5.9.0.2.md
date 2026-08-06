# Validation — v5.9.0.2 Snapshot Manager

## Visible checks
1. Upload every file in this package to the matching GitHub path.
2. Hard refresh with Ctrl+Shift+R.
3. Confirm the footer reads `v5.9.0.2 · Snapshot Manager`.
4. Open Commissioner HQ → League Data.
5. Confirm the Madden Companion Import Framework card shows Snapshot Manager = Ready, Candidate Snapshot = None, Active Snapshot = None, and Retained Snapshots = 0.

## Console checks
```javascript
FranchiseHQ.leagueSnapshotManager.diagnostics()
```
Expected: version `5.9.0.2`, `guardedActivation: true`, and `rollbackAvailable: true`.

Create and activate a development snapshot:
```javascript
await FranchiseHQ.leagueSnapshotManager.simulate({ season: 2027, week: 4 })
```
Expected: returned status `active`. Reopen League Data and confirm Active Snapshot is populated and Retained Snapshots is 1.

Reject a candidate:
```javascript
await FranchiseHQ.leagueSnapshotManager.simulate({ reject: true })
```
Expected: returned status `rejected`; the active snapshot remains unchanged.

Inspect retained snapshots:
```javascript
FranchiseHQ.leagueSnapshotManager.listSnapshots()
```

Reset development-only snapshot metadata after testing:
```javascript
FranchiseHQ.leagueSnapshotManager.resetDevelopmentState()
```
Then refresh League Data and confirm Candidate Snapshot = None, Active Snapshot = None, Retained Snapshots = 0.

## Regression checks
Visit Home, Teams, Rosters, Schedule, Standings, Stats, Trades, and News. Existing behavior should remain unchanged and the console should contain no errors.
