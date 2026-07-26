# Phase 3.5 — Epic 3.1 Hotfix

## Purpose

Prevent a hard refresh on `#commissioner` from using the simulated role before authentication and permission services finish loading.

## Changed files

- `app.js`
- `platform/core.js`

## Behavior

Commissioner access now remains in an unresolved/loading state until both `FranchiseHQ.auth` and `FranchiseHQ.permissions` are available. It no longer falls back to `state.role` during startup.
