# Phase 3.5 — Epic 1: Platform Core

## What changed

Epic 1 introduces the permanent `window.FranchiseHQ` platform namespace without removing or rewriting the working prototype.

New modules:

- `platform/core.js` — service registry, metadata, readiness helper
- `platform/events.js` — centralized event bus with compatibility window events
- `platform/permissions.js` — authenticated-membership permission policies
- `platform/simulation.js` — isolated adapter for prototype viewing perspective
- `platform/navigation.js` — centralized route adapter

## Compatibility

`FGC_APP` and `FGC_TRADE` remain unchanged and continue to power the existing application. The new services wrap them where necessary so future epics can migrate features safely.

Simulation does not grant authenticated permissions. `FranchiseHQ.permissions` reads only `FranchiseHQ.auth` and the active membership.

## Browser validation

Open the deployed site and run:

```js
FranchiseHQ.metadata
FranchiseHQ.listServices()
FranchiseHQ.permissions.explain('openCommissionerHQ')
FranchiseHQ.simulation.getSnapshot()
FranchiseHQ.navigation.currentRoute()
```

Expected service list after the page has loaded:

```text
events, auth, league, permissions, simulation, navigation, accountUI
```

The exact order may differ.

## Deployment

Upload the complete repository contents, including the new `platform` directory. Do not upload only `index.html`, because the page now loads files from `/platform`.
