# Franchise HQ 5.2.1 Validation

After uploading the patch with folder paths preserved, hard refresh the application.

## 1. Confirm release metadata

```javascript
FranchiseHQ.metadata
```

Expected:

- `version: "5.2.1"`
- `build: "validation-framework-hotfix"`

## 2. Run the complete validation suite

```javascript
const validation = await FranchiseHQ.validate.run();
console.log(validation);
```

Expected:

- `total: 34`
- `passed: 34`
- `failed: 0`
- `warnings: 0`
- `compliant: true`

Each entry in `validation.results` should include explicit `status`, `passed`, `success`, and `compliant` fields.

## 3. Run release preflight

```javascript
await FranchiseHQ.release.preflight()
```

Expected:

- `ready: true`
- `failures: []`
- all five checks are `true`

## 4. Run release certification

```javascript
await FranchiseHQ.release.certify()
```

Expected:

- `certified: true`
- `failures: []`
- `releaseMatches: true`

## 5. Confirm the Madden read model remains protected

```javascript
FranchiseHQ.maddenLeague.diagnostics()
```

Expected:

- `authority: "madden"`
- `readOnly: true`
- `compliant: true`
