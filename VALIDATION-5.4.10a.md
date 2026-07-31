# Validation — Franchise HQ v5.4.10a

## Required registration check

```javascript
({
  emptyState: typeof FranchiseHQ.leagueEmptyState,
  isEmpty: typeof FranchiseHQ.leagueEmptyState?.isEmpty,
  model: typeof FranchiseHQ.leagueEmptyState?.model,
  markup: typeof FranchiseHQ.leagueEmptyState?.markup,
  render: typeof FranchiseHQ.leagueEmptyState?.render,
  moduleAlias: typeof FranchiseHQ.modules?.league?.emptyState
});
```

Expected:

```javascript
{
  emptyState: 'object',
  isEmpty: 'function',
  model: 'function',
  markup: 'function',
  render: 'function',
  moduleAlias: 'object'
}
```

## Identity check

```javascript
FranchiseHQ.leagueEmptyState === FranchiseHQ.modules.league.emptyState
```

Expected: `true`.

## Platform registry check

```javascript
FranchiseHQ.hasModuleService('league', 'emptyState')
```

Expected: `true`.

## Regression check
Activate Empty State and confirm Home, Teams, Players, Standings, Statistics, Schedule, and My Team continue using their subject-specific empty messages. Restore Development Data and confirm normal content returns.
