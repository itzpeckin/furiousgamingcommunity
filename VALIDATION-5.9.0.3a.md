# v5.9.0.3a Validation Guide

This hotfix corrects the Validation Engine script load order and removes the import service startup crash when the validator is not yet available.

## 1. Confirm the release
Hard refresh the site. The bottom-left footer must display `v5.9.0.3a · Validation Engine`.

## 2. Confirm the UI checkpoint
Open Commissioner HQ → League Data. The Madden Companion Import Framework card must show:
- Import Engine: Ready
- Snapshot Manager: Ready
- Validation Engine: Ready
- Registered Validators: 9
- Latest Validation: Not Run
- Release: 5.9.0.3a

## 3. Confirm diagnostics
Open the browser console and run:
```js
FranchiseHQ.leagueValidationEngine.diagnostics()
```
Expected: version `5.9.0.3a`, validatorCount `9`, automaticCandidateRejection `true`, warningSupport `true`.

## 4. Run a valid validation
```js
await FranchiseHQ.leagueValidationEngine.simulate()
```
Expected: `valid: true`, `status: "passed"`, zero errors. Return to League Data; Latest Validation should show `passed`.

## 5. Run an invalid validation
```js
await FranchiseHQ.leagueValidationEngine.simulate({ invalid: true })
```
Expected: `valid: false`, `status: "failed"`, multiple errors. The invalid candidate is automatically rejected.

Confirm no candidate remains:
```js
FranchiseHQ.leagueSnapshotManager.listCandidates()
```
Expected: `[]`. Any prior active snapshot must remain unchanged.

## 6. Confirm custom validator registration
```js
FranchiseHQ.leagueValidationEngine.registerValidator(
  'development-warning-test',
  () => ({ code: 'development-warning', message: 'Development warning test.' }),
  { severity: 'warning', description: 'Temporary validation test.' }
)
```
Then run the valid simulation again. Expected: validation remains valid with one warning. Refresh the page afterward to restore the default validator set.

## 7. Regression check
Visit Home, Teams, Roster, Schedule, Standings, Statistics, Trade Center, and Commissioner HQ. Confirm normal behavior and no console errors.
