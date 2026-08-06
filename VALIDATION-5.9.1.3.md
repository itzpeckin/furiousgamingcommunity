# Validation — v5.9.1.3 League Tenant Foundation

1. Upload every file in this package and hard-refresh.
2. Confirm the footer reads `v5.9.1.3 · League Tenant Foundation`.
3. Open Commissioner HQ → League Data.
4. Confirm the League Tenant card shows:
   - Furious Gaming Community
   - `lg_fgc_001`
   - `furious-gaming-community`
   - `/leagues/furious-gaming-community`
5. Run:

```js
FranchiseHQ.leagueTenant.diagnostics()
```

Expected: `leagueCount: 1`, `leagueScopedStorage: true`, and `rootBackwardCompatibility: true`.

6. Run:

```js
FranchiseHQ.leagueSnapshotManager.diagnostics()
FranchiseHQ.leagueImportHistory.diagnostics()
FranchiseHQ.leagueDataEvents.diagnostics()
```

Each should report version `5.9.1.3`. Snapshot and history diagnostics should report `leagueId: "lg_fgc_001"`.

7. Confirm route helpers:

```js
FranchiseHQ.leagueTenant.publicPath()
FranchiseHQ.leagueTenant.exportEndpoint()
```

Expected:

```text
/leagues/furious-gaming-community
/api/leagues/furious-gaming-community/companion/export
```

8. Load the sample Companion payload and import teams. Confirm the active snapshot includes `leagueId: "lg_fgc_001"` and the import-history record includes the same league ID.
9. Refresh and confirm the snapshot and history remain available.
10. Visit Home, Teams, Rosters, Standings, Statistics, and Trade Center. Confirm no regression.
