# Franchise HQ v5.4.6a — Validation Guide

## Primary regression test

1. Open Franchise HQ and select Development Data once so the legacy key may contain `demo`.
2. Open Developer Tools → Console.
3. Run:

```javascript
FranchiseHQ.storage.set('league.data.mode', 'banana');
location.reload();
```

Expected result:

- Franchise HQ opens in Empty mode.
- The amber No Data banner appears.
- Development Data does not activate.
- The legacy `fgc-league-data-mode = demo` value is ignored because the new key exists.

## Legacy migration test

1. Run:

```javascript
FranchiseHQ.storage.remove('league.data.mode');
localStorage.setItem('fgc-league-data-mode', 'demo');
location.reload();
```

Expected result:

- Development Data opens.
- The legacy value is migrated to the new platform-storage key.
- `FranchiseHQ.storage.get('league.data.mode')` returns `demo`.

## Invalid legacy test

1. Run:

```javascript
FranchiseHQ.storage.remove('league.data.mode');
localStorage.setItem('fgc-league-data-mode', 'banana');
location.reload();
```

Expected result:

- Franchise HQ opens in Empty mode.
- No Development Data appears.

## Final console check

Run:

```javascript
FranchiseHQ.leagueData.status().persistence
```

Then navigate between Empty and Development Data and confirm there are no red JavaScript errors.
