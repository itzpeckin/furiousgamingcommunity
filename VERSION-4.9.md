# Franchise HQ Version 4.9

## Phase 4 · Epic 9 · Platform Consistency and Lifecycle Cleanup

Version 4.9 completes the consistency work identified in the post-Epic-8 architecture audit.

### Added

- Formal `FranchiseHQ.auth` service registration through `defineService()`.
- Central `FranchiseHQ.ui` service for shared UI requests and compatibility adapters.
- Application lifecycle diagnostics through `FranchiseHQ.lifecycle`.
- `franchisehq:application-ready` and degraded-startup lifecycle events.
- Explicit authentication and UI initialization checkpoints.
- Service readiness diagnostics and a single application-ready promise.

### Migrated

- Authentication events now flow through `FranchiseHQ.events`.
- Account UI no longer directly calls `FGC_APP` or `FGC_TRADE`.
- Platform modules avoid duplicate window-event dispatch when the event service is available.
- Legacy application and Trade Center capabilities are registered as temporary UI adapters.

### Compatibility

`FGC_APP` and `FGC_TRADE` remain available because the main application and Trade Center have not yet been modularized. Version 4.9 makes the authenticated account UI independent from those globals while preserving existing behavior.

### Versioning

- Release: 4
- Epic: 9
- Patch: 0
- Display version: `4.9`
