# Validation — v5.9.0.3b

1. Upload every file and replace matching GitHub files.
2. Confirm the footer reads `v5.9.0.3b · Validation Engine`.
3. Hard refresh with Ctrl+Shift+R.
4. Run `typeof FranchiseHQ.leagueValidationEngine`. Expected: `"object"`.
5. Run `FranchiseHQ.leagueValidationEngine.diagnostics()`. Expected version `5.9.0.3b` and validatorCount `9`.
6. Run `await FranchiseHQ.leagueValidationEngine.simulate()`. Expected `valid: true`.
7. Run `await FranchiseHQ.leagueValidationEngine.simulate({invalid:true})`. Expected `valid: false`.
8. Confirm Home, Teams, Rosters, Schedule, Standings, Statistics, and Trade Center still load.
