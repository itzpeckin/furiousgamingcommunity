# Phase 3.5 — Epic 3

## Centralized Simulation Service

Epic 3 moves prototype perspective state into `FranchiseHQ.simulation`.

### Changes

- Adds a persistent simulation role owned by the platform service.
- Migrates the legacy `m1b-role` value automatically.
- Tracks the selected mock account separately from authenticated identity.
- Emits one `simulation-changed` event for UI synchronization.
- Updates the role selector in `app.js` to use the service.
- Updates Trade Center account switching to register the selected simulation account.
- Keeps authenticated Commissioner permissions independent from simulation.

### Compatibility

The legacy localStorage role key remains synchronized during migration so existing prototype code continues working.
