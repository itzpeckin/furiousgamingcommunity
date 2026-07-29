# Franchise HQ v5.3.0 Validation

After uploading the patch with folder paths preserved, hard-refresh the application.

## 1. Validate Platform and module separation

```javascript
console.log(FranchiseHQ.listServices());
console.log(FranchiseHQ.listModules());
console.log(FranchiseHQ.listModuleServices('league'));
```

Expected:

- `listServices()` does not contain any of the 13 `league*` services.
- `listModules()` contains `league`.
- `listModuleServices('league')` contains 13 services.

## 2. Validate compatibility API

```javascript
console.log({
  moduleReadModel: FranchiseHQ.modules.league.leagueReadModel,
  publicReadModel: FranchiseHQ.maddenLeague,
  compatibilityRepository: FranchiseHQ.leagueRepository
});
```

All three values should exist.

## 3. Run validation

```javascript
const validation = await FranchiseHQ.validate.run();
console.log(validation);
console.table(validation.results.filter(result => result.status === 'fail'));
```

Expected:

```text
compliant: true
failed: 0
```

## 4. Run release preflight

```javascript
await FranchiseHQ.release.preflight()
```

Expected:

```text
ready: true
failures: []
```

## 5. Confirm Madden authority

```javascript
FranchiseHQ.maddenLeague.diagnostics()
```

Expected:

```text
authority: "madden"
readOnly: true
compliant: true
```
