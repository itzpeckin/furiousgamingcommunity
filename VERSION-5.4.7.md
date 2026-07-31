# Franchise HQ v5.4.7 — LD-007 Public League Data API Compatibility

## Release objective

Preserve the complete v5.4.x League Data State Manager API and add a simpler public convenience layer for future Franchise HQ modules.

## Existing API retained

- `FranchiseHQ.leagueData.current()`
- `FranchiseHQ.leagueData.exportCurrent()`
- `FranchiseHQ.leagueData.status()`
- `FranchiseHQ.leagueData.viewState(subject)`
- `FranchiseHQ.leagueData.setMode(mode)`
- `FranchiseHQ.leagueData.setDemoSnapshot(snapshot)`
- `FranchiseHQ.leagueData.seedDemoFromLegacy(data)`
- `FranchiseHQ.leagueData.clearDemo()`
- `FranchiseHQ.leagueData.refreshEmpty()`
- `FranchiseHQ.leagueData.subscribe(listener)`
- `FranchiseHQ.leagueData.emptyMessage(subject)`
- `FranchiseHQ.leagueData.diagnostics()`

## New public convenience methods

- `FranchiseHQ.leagueData.getMode()`
- `FranchiseHQ.leagueData.getStatus()`
- `FranchiseHQ.leagueData.isDevelopment()`
- `FranchiseHQ.leagueData.isEmpty()`
- `FranchiseHQ.leagueData.isLive()`
- `FranchiseHQ.leagueData.canLoadLeague()`
- `FranchiseHQ.leagueData.currentSource()`

## Design guarantees

- Every new helper derives from the existing `status()` and `current()` methods.
- No duplicate mode or snapshot state is introduced.
- Existing consumers remain compatible.
- `getMode()` returns the resolved public mode: `empty`, `demo`, or `live`.
- `currentSource()` returns immutable source metadata, not a mutable snapshot.
- Empty, Development, and Live repository protections remain unchanged.

## Files changed

- `index.html`
- `league-engine/data-state.js`

## Documentation added

- `VERSION-5.4.7.md`
- `VALIDATION-5.4.7.md`
