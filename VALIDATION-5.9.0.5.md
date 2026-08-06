# Validation — v5.9.0.5

1. Upload every file and hard refresh. Footer: `v5.9.0.5 · Import Framework Certified`.
2. Commissioner HQ → League Data: confirm the complete Import Framework panel appears.
3. Click **Run Successful Import**. Confirm Importing → Validating → Building Snapshot → Completed. Confirm a successful history record and active snapshot appear.
4. Click **Reset Status**. Confirm Idle.
5. Click **Run Failed Import**. Confirm Failed, a failed history record appears, and the prior active snapshot ID is unchanged.
6. Click **Run Certification**. Confirm the card shows Certified and all checks pass.
7. Refresh. Confirm history and certification remain visible.
8. Visit Home, Teams, Rosters, Schedule, Standings, Statistics, Trade Center. Confirm no regressions or console errors.

Console verification:
```js
FranchiseHQ.leagueImportFrameworkUI.diagnostics()
FranchiseHQ.leagueImportFrameworkUI.status()
FranchiseHQ.leagueImportFrameworkUI.certify()
```
