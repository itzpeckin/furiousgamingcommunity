# Phase 3.5 — Epic 7: Central Data Store

Epic 7 introduces `FranchiseHQ.store`, the single browser-state and persistence gateway for the frontend.

## Added

- `platform/store.js`
- Persistent string and JSON storage
- In-memory state
- Change subscriptions
- Batched transactions
- League-scoped key generation
- Centralized Franchise HQ browser-data cleanup

## Migrated

- Appearance preferences
- Simulation role and mock account persistence
- Active league persistence
- Trade Center negotiations and notifications
- Commissioner operations state
- Ownership assignments
- Commissioner tab persistence
- Developer Mode browser-data cleanup

Existing browser keys remain unchanged, so current user data is preserved automatically.

## Validation

1. `FranchiseHQ.metadata.version` returns `3.5.0-epic7`.
2. `FranchiseHQ.listServices()` includes `store`.
3. `FranchiseHQ.store.getString('m1b-accent')` returns the selected accent.
4. Trade data and simulated account persist after refresh.
5. Commissioner HQ and Trade Center load without red console errors.
