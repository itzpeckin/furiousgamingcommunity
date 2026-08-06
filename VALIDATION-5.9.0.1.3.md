# Validation — v5.9.0.1.3

1. Upload every file in this package to the matching GitHub path and replace the old versions.
2. Hard refresh Franchise HQ with Ctrl+Shift+R.
3. Confirm the bottom-left footer says `v5.9.0.1.3 · Import Core & State`.
4. Open Commissioner HQ → League Data.
5. Confirm a card titled `Madden Companion Import Framework` appears.
6. Confirm the card shows:
   - Framework: Ready
   - Current State: Idle
   - Release: 5.9.0.1.3
   - Next Foundation Story: Snapshot Manager
7. Open DevTools → Console and confirm there are no red errors.
8. Run:

```javascript
FranchiseHQ.leagueImportState.diagnostics()
```

Expected: service is `leagueImportState`, status is `idle`, and transitionGuard is true.

9. Run:

```javascript
await FranchiseHQ.leagueImportService.simulate({ delay: 300 })
```

Expected final status: `completed`.

10. Run:

```javascript
FranchiseHQ.leagueImportService.resetImportStatus()
```

Expected status: `idle`.

11. Navigate through Home, Teams, Rosters, Schedule, Standings, Stats, Trades, and News. Confirm behavior is unchanged.
