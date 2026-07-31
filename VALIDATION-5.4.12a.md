# Validation — v5.4.12a

1. Confirm `FranchiseHQ.hasModuleService('league','leagueDataBanner')` returns `true`.
2. Confirm `FranchiseHQ.leagueDataBanner === FranchiseHQ.modules.league.leagueDataBanner` returns `true`.
3. Run the `league-data-foundation` validation suite and confirm `failed: 0` and `compliant: true`.
4. Confirm `FranchiseHQ.leagueDataFoundation.foundationStatus()` returns `certified: true` and `readiness: 'Roster Engine Ready'`.
5. Confirm Development and Empty banners still render correctly and no console errors appear.
