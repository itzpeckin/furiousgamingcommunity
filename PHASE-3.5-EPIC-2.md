# Phase 3.5 — Epic 2

## Authenticated Commissioner Access

Epic 2 migrates Commissioner HQ access away from the prototype simulation role and onto the authenticated league membership permission service.

### Changes

- Commissioner HQ route now calls `FranchiseHQ.permissions.canOpenCommissionerHQ()`.
- Commissioner navigation visibility now follows authenticated permissions.
- Command palette visibility now follows authenticated permissions.
- Simulation role changes no longer hide Commissioner HQ or redirect an authenticated commissioner.
- The UI waits while authentication is loading instead of issuing a false denial.
- Authentication changes automatically refresh the Commissioner navigation and route.
- Legacy `state.role` remains only as a startup compatibility fallback before platform services load.

### Expected behavior

An authenticated commissioner may open Commissioner HQ regardless of the simulated owner or committee perspective. A non-commissioner cannot gain Commissioner HQ access by selecting the Commissioner simulation role.

### Browser validation

```js
FranchiseHQ.metadata.version
// "3.5.0-epic2"

FranchiseHQ.permissions.explain('openCommissionerHQ')
// allowed: true for Peckin's commissioner membership

FGC_APP.commissionerAccessState()
// true
```

Then switch Simulation Mode to Team Owner and open Commissioner HQ. Access should remain available because simulation no longer changes authorization.
