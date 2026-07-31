# Franchise HQ v5.4.10a — LD-010 Registration Hotfix

## Status
Ready for validation.

## Purpose
Correct the League Empty-State Framework registration path introduced in v5.4.10.

## Fix
`league-engine/empty-state.js` now registers through the Platform-owned module registry:

```javascript
FranchiseHQ.defineModuleService('league', 'emptyState', service, {
  alias: 'leagueEmptyState',
  replace: true
});
```

This provides both supported access paths:

```javascript
FranchiseHQ.leagueEmptyState
FranchiseHQ.modules.league.emptyState
```

The component no longer attempts to reassign the protected `FranchiseHQ.modules` property.

## Functional scope
No empty-state wording, page behavior, source-selection behavior, banner styling, persistence, or event behavior changed.
