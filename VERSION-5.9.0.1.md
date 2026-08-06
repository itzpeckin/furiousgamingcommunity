# Franchise HQ v5.9.0.1 — Import Core and State

## Purpose

This release installs the shared import lifecycle used by every future Madden Companion dataset. It does not change league pages or activate new Companion data.

## Added

- Central import lifecycle state service
- Guarded state transitions
- Import status subscriptions
- Import progress metadata
- Standard failure capture
- Development simulation API
- Shared `startImport()` entry point

## Supported states

1. Idle
2. Importing
3. Validating
4. Building Snapshot
5. Completed
6. Failed

## Public APIs

```javascript
FranchiseHQ.leagueImportService.startImport(input, metadata)
FranchiseHQ.leagueImportService.getImportStatus()
FranchiseHQ.leagueImportService.subscribeToImportStatus(listener)
FranchiseHQ.leagueImportService.resetImportStatus()
FranchiseHQ.leagueImportService.simulate(options)
```

The existing `preview()`, `commit()`, `ingest()`, and `history()` APIs remain available.

## Boundaries

Snapshot management, expanded validation rules, persistent import history, Commissioner HQ import UI, and league-data refresh broadcasting are intentionally deferred to later v5.9.0.x releases.
