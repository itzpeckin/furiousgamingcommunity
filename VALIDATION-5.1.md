# Validation — Version 5.1

After upload and a hard refresh, run these checks in the browser console.

## 1. Release

```javascript
FranchiseHQ.metadata.version
```

Expected: `"5.1"`
.
## 2. Read model diagnostics

```javascript
FranchiseHQ.maddenLeague.diagnostics()
```

Expected:
- `authority: "madden"`
- `readOnly: true`
- `compliant: true`

## 3. Services

```javascript
[
  'leagueSchema','leagueEntities','leagueRepository','leagueSelectors',
  'leagueValidation','leagueMigrations','leagueMockAdapter','leagueReadModel'
].map(name => [name, FranchiseHQ.hasService(name)])
```

Expected: every service is `true`.

## 4. Empty Madden snapshot validation

```javascript
const snapshot = FranchiseHQ.leagueSchema.emptySnapshot({
  importId: 'validation-5.1',
  importedAt: new Date().toISOString()
});
FranchiseHQ.maddenLeague.validate(snapshot)
```

Expected: `valid: true`.

## 5. Write protection

```javascript
FranchiseHQ.leagueRepository.install(snapshot)
```

Expected: an error explaining that snapshots may only be installed after validation.

Then:

```javascript
FranchiseHQ.maddenLeague.installSnapshot(snapshot)
FranchiseHQ.leagueRepository.diagnostics()
```

Expected: `hasSnapshot: true`, `authority: "madden"`, and `readOnly: true`.

## 6. Immutability

```javascript
const official = FranchiseHQ.maddenLeague.get();
Object.isFrozen(official)
```

Expected: `true`.

## 7. Platform regression

```javascript
await FranchiseHQ.release.preflight()
await FranchiseHQ.release.certify()
```

Expected: no new Platform failures. Existing pages should remain visually unchanged.
