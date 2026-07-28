# Testing and Release Hardening

## Automated validation

`FranchiseHQ.validate.run()` remains the detailed test runner. Version 4.20 adds security and release-hardening tests.

## Release preflight

```javascript
await FranchiseHQ.release.preflight()
```

A release is ready only when lifecycle, manifest, runtime, validation, and security checks all pass.

## Support bundle

```javascript
FranchiseHQ.release.supportBundle()
```

returns a redacted object containing build, lifecycle, manifest, runtime, validation, API, error, configuration, feature, and browser diagnostics.

To download it:

```javascript
FranchiseHQ.release.downloadSupportBundle()
```

Support bundles should still be reviewed before being shared externally.
