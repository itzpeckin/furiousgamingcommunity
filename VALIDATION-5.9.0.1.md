# Validation — Franchise HQ v5.9.0.1

## Upload

Upload every file in this ZIP to the matching location in the GitHub repository. Allow GitHub to replace the existing files.

## Browser validation

1. Open Franchise HQ.
2. Confirm the application loads normally.
3. Open the browser developer console.
4. Confirm there are no red JavaScript errors.
5. Navigate through Home, Teams, Rosters, Schedule, Standings, Statistics, Trade Center, and Commissioner HQ.
6. Confirm no visible page behavior changed.

## Import framework validation

Run this in the browser console:

```javascript
FranchiseHQ.leagueImportService.getImportStatus()
```

Expected result:

```text
status: "idle"
label: "Idle"
active: false
```

Run a successful simulation:

```javascript
await FranchiseHQ.leagueImportService.simulate({ delay: 300 })
```

Expected console-observable progression:

```text
Importing → Validating → Building Snapshot → Completed
```

Check the final status:

```javascript
FranchiseHQ.leagueImportService.getImportStatus()
```

Expected result:

```text
status: "completed"
progress: 100
error: null
```

Reset the framework:

```javascript
FranchiseHQ.leagueImportService.resetImportStatus()
```

Expected result:

```text
status: "idle"
```

Run a failure simulation:

```javascript
await FranchiseHQ.leagueImportService.simulate({ delay: 300, fail: true })
```

Expected result:

```text
status: "failed"
error.message: "Simulated import validation failure."
```

## Subscription validation

Run:

```javascript
const stopImportWatch = FranchiseHQ.leagueImportService.subscribeToImportStatus(
  (next, previous) => console.log(previous?.status, '→', next.status)
)
```

Run another simulation. Confirm each state transition prints once. Then clean up:

```javascript
stopImportWatch()
FranchiseHQ.leagueImportService.resetImportStatus()
```

## Pass criteria

- Site loads without console errors.
- Existing pages remain unchanged.
- Successful simulation reaches Completed.
- Failure simulation reaches Failed.
- Reset returns the state to Idle.
- Subscribers receive one notification per transition.
