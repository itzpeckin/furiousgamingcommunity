# Franchise HQ v5.4.0 Validation

After uploading all files with folder paths preserved, hard-refresh the site.

## 1. Platform and release validation

```javascript
const validation = await FranchiseHQ.validate.run();
console.log(validation);
console.table(validation.results.filter(result => result.status === 'fail'));
```

Expected: `compliant: true`, `failed: 0`.

```javascript
await FranchiseHQ.release.preflight();
```

Expected: `ready: true`.

## 2. Empty-state validation

```javascript
FranchiseHQ.leagueData.setMode('auto');
console.log(FranchiseHQ.leagueData.status());
console.log(FranchiseHQ.leagueData.viewState('roster'));
```

Without a Madden import or demo snapshot, expected:

- `activeMode: 'empty'`
- `isEmpty: true`
- `hasAnyData: false`
- a valid empty snapshot
- no JavaScript error

## 3. Demo-state validation

```javascript
FranchiseHQ.leagueData.seedDemoFromLegacy({
  league: { id: 'demo-league', name: 'Franchise HQ Demo' },
  teams: [{ id: 'demo-team', name: 'Demo Team' }],
  players: [{ id: 'demo-player', teamId: 'demo-team', name: 'Demo Player', position: 'QB' }]
}, { activate: true });

console.log(FranchiseHQ.leagueData.status());
```

Expected:

- `activeMode: 'demo'`
- `isDemo: true`
- `authority: 'demo'`
- `counts.teams: 1`
- `counts.players: 1`
- official repository remains unchanged

Verify:

```javascript
console.log(FranchiseHQ.modules.league.leagueRepository.diagnostics());
```

Expected without a real import: `hasSnapshot: false`.

## 4. Return to safe automatic state

```javascript
FranchiseHQ.leagueData.clearDemo();
FranchiseHQ.leagueData.setMode('auto');
console.log(FranchiseHQ.leagueData.status());
```

Expected without a real import: `activeMode: 'empty'`.
