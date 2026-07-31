# Franchise HQ v5.4.7 — LD-007 Validation Guide

## Goal

Confirm that the original League Data API still works and that all seven new convenience methods accurately report the same underlying League Data state.

## Required files

- `index.html`
- `league-engine/data-state.js`
- `VERSION-5.4.7.md`
- `VALIDATION-5.4.7.md`

## Validation

### 1. Confirm release

Open Franchise HQ and confirm the footer displays:

`v5.4.7 · LD-007 Public League Data API`

Open the browser console and confirm there are no red application errors.

### 2. Confirm all new methods exist

Run:

```javascript
[
  'getMode',
  'getStatus',
  'isDevelopment',
  'isEmpty',
  'isLive',
  'canLoadLeague',
  'currentSource'
].map(name => [name, typeof FranchiseHQ.leagueData[name]]);
```

Every result must report `function`.

### 3. Validate Empty mode

Select Empty from Commissioner → League Data and run:

```javascript
({
  mode: FranchiseHQ.leagueData.getMode(),
  empty: FranchiseHQ.leagueData.isEmpty(),
  development: FranchiseHQ.leagueData.isDevelopment(),
  live: FranchiseHQ.leagueData.isLive(),
  canLoad: FranchiseHQ.leagueData.canLoadLeague(),
  source: FranchiseHQ.leagueData.currentSource()
});
```

Expected:

- `mode: "empty"`
- `empty: true`
- `development: false`
- `live: false`
- `canLoad: false`
- `source.available: false`
- `source.authoritative: false`
- `source.sourceType: "none"`

### 4. Validate Development Data mode

Select Development Data and run the same command.

Expected:

- `mode: "demo"`
- `empty: false`
- `development: true`
- `live: false`
- `canLoad: true`
- `source.available: true`
- `source.authoritative: false`
- `source.sourceType: "development"`

### 5. Confirm getStatus is the status API

Run:

```javascript
const oldStatus = FranchiseHQ.leagueData.status();
const newStatus = FranchiseHQ.leagueData.getStatus();
({
  sameMode: oldStatus.activeMode === newStatus.activeMode,
  sameImport: oldStatus.importId === newStatus.importId,
  sameCounts: JSON.stringify(oldStatus.counts) === JSON.stringify(newStatus.counts),
  frozen: Object.isFrozen(newStatus)
});
```

Expected: all values are `true`.

### 6. Confirm source metadata is immutable

Run:

```javascript
const source = FranchiseHQ.leagueData.currentSource();
({
  frozen: Object.isFrozen(source),
  countsFrozen: Object.isFrozen(source.counts),
  mode: source.mode,
  authority: source.authority
});
```

Expected:

- `frozen: true`
- `countsFrozen: true`
- Mode and authority match the active source.

### 7. Confirm the existing API remains available

Run:

```javascript
[
  'current',
  'exportCurrent',
  'status',
  'viewState',
  'setMode',
  'setDemoSnapshot',
  'seedDemoFromLegacy',
  'clearDemo',
  'refreshEmpty',
  'subscribe',
  'emptyMessage',
  'diagnostics'
].map(name => [name, typeof FranchiseHQ.leagueData[name]]);
```

Every result must report `function`.

### 8. Confirm current remains protected

Run:

```javascript
const snapshot = FranchiseHQ.leagueData.current();
({
  frozen: Object.isFrozen(snapshot),
  mode: FranchiseHQ.leagueData.getMode()
});
```

Expected: `frozen` is `true`.

### 9. Confirm exportCurrent remains a safe copy

Run:

```javascript
const current = FranchiseHQ.leagueData.current();
const exported = FranchiseHQ.leagueData.exportCurrent();
({
  differentObject: current !== exported,
  sameLeagueId: current?.league?.id === exported?.league?.id
});
```

Expected: both values are `true`.

### 10. Confirm persistence still works

While Development Data is selected, refresh the page.

Expected:

- Development Data remains active.
- `getMode()` returns `demo`.
- `isDevelopment()` returns `true`.

Select Empty and refresh again.

Expected:

- Empty remains active.
- `getMode()` returns `empty`.
- `isEmpty()` returns `true`.

### 11. Check diagnostics

Run:

```javascript
FranchiseHQ.leagueData.diagnostics();
```

Expected:

- Version is `5.4.7`.
- Existing persistence diagnostics remain present.
- Repository diagnostics remain present.
- `compliant` remains `true`.

### 12. Final navigation and console check

Navigate through Home, Teams, Players, Standings, Stats, Schedule, Trade Center, and Commissioner → League Data.

Expected:

- No page breaks.
- Banner behavior remains unchanged.
- No red JavaScript application errors.

## Final checklist

- [ ] v5.4.7 is displayed
- [ ] Seven new convenience methods exist
- [ ] Empty mode values are correct
- [ ] Development mode values are correct
- [ ] `getStatus()` matches `status()`
- [ ] `currentSource()` is immutable
- [ ] Existing public API remains available
- [ ] `current()` remains frozen
- [ ] `exportCurrent()` remains a separate copy
- [ ] Persistence from LD-006 still works
- [ ] Repository diagnostics remain compliant
- [ ] No console errors appear
